import { RunAgentInputSchema, type RunAgentInput } from "@ag-ui/core";
import { google, type Auth } from "googleapis";

import type { EmailInsight } from "../domain/email-insight.js";
import type { EmailMetadata } from "../domain/email-metadata.js";
import { extractEmailInsight } from "../services/ai/extract-email-insight.js";
import { createAuthClient } from "../services/gmail/create-auth-client.js";
import {
  fetchUnreadEmails,
  type GmailMessagesApi,
  type GmailListParams,
  type GmailGetParams
} from "../services/gmail/fetch-unread-emails.js";
import {
  encodeRunError,
  encodeRunFinished,
  encodeRunStarted,
  encodeTextMessageContent,
  encodeTextMessageEnd,
  encodeTextMessageStart
} from "../services/streaming/encode-ag-ui-events.js";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache",
  connection: "keep-alive"
};

export type AgentEndpointDependencies = {
  createAuthClient: () => unknown;
  createGmailMessagesApi: (authClient: unknown) => GmailMessagesApi;
  fetchUnreadEmails: (gmailClient: GmailMessagesApi) => Promise<EmailMetadata[]>;
  extractEmailInsight: (model: string, email: EmailMetadata) => Promise<EmailInsight>;
  model: string;
  createMessageId: () => string;
};

export async function handleAgentEndpoint(
  request: Request,
  dependencies: AgentEndpointDependencies = createDefaultDependencies()
): Promise<Response> {
  const parsedInput = await parseRunAgentInput(request);

  if (!parsedInput.success) {
    return createErrorResponse("Invalid RunAgentInput payload");
  }

  const input = parsedInput.input;
  const messageId = dependencies.createMessageId();

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      try {
        controller.enqueue(
          encodeRunStarted({
            threadId: input.threadId,
            runId: input.runId,
            input
          })
        );

        controller.enqueue(
          encodeTextMessageStart({
            messageId
          })
        );

        const authClient = dependencies.createAuthClient();
        const gmailClient = dependencies.createGmailMessagesApi(authClient);
        const unreadEmails = await dependencies.fetchUnreadEmails(gmailClient);

        if (unreadEmails.length === 0) {
          controller.enqueue(
            encodeTextMessageContent({
              messageId,
              delta: "No unread emails found in your inbox.\n\n"
            })
          );
        }

        for (const email of unreadEmails) {
          if (request.signal.aborted) {
            break;
          }

          try {
            const insight = await dependencies.extractEmailInsight(dependencies.model, email);

            controller.enqueue(
              encodeTextMessageContent({
                messageId,
                delta: formatInsightMarkdown(email, insight)
              })
            );
          } catch {
            continue;
          }
        }

        controller.enqueue(
          encodeTextMessageEnd({
            messageId
          })
        );

        controller.enqueue(
          encodeRunFinished({
            threadId: input.threadId,
            runId: input.runId
          })
        );
      } catch (error) {
        controller.enqueue(
          encodeRunError({
            message: toErrorMessage(error)
          })
        );
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    status: 200,
    headers: SSE_HEADERS
  });
}

function createDefaultDependencies(): AgentEndpointDependencies {
  return {
    createAuthClient,
    createGmailMessagesApi: (authClient) => {
      const gmail = google.gmail({
        version: "v1",
        auth: authClient as Auth.OAuth2Client
      });

      return {
        list: (params: GmailListParams) =>
          gmail.users.messages.list({
            userId: params.userId,
            q: params.q,
            labelIds: params.labelIds,
            maxResults: params.maxResults
          }),
        get: (params: GmailGetParams) =>
          gmail.users.messages.get({
            userId: params.userId,
            id: params.id,
            format: params.format
          })
      };
    },
    fetchUnreadEmails,
    extractEmailInsight,
    model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
    createMessageId: () => crypto.randomUUID()
  };
}

async function parseRunAgentInput(
  request: Request
): Promise<{ success: true; input: RunAgentInput } | { success: false }> {
  try {
    const body = (await request.json()) as unknown;
    const parsed = RunAgentInputSchema.safeParse(body);

    if (!parsed.success) {
      return { success: false };
    }

    return {
      success: true,
      input: parsed.data
    };
  } catch {
    return { success: false };
  }
}

function createErrorResponse(message: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start: (controller) => {
      controller.enqueue(
        encodeRunError({
          message
        })
      );
      controller.close();
    }
  });

  return new Response(stream, {
    status: 200,
    headers: SSE_HEADERS
  });
}

function formatInsightMarkdown(email: EmailMetadata, insight: EmailInsight): string {
  const actionItems =
    insight.actionItems.length === 0
      ? "- None"
      : insight.actionItems
          .map((actionItem) => {
            const deadline = actionItem.deadline ? `, Deadline: ${actionItem.deadline}` : "";
            return `- ${actionItem.task} (Owner: ${actionItem.owner}${deadline})`;
          })
          .join("\n");

  const urgencySignals =
    insight.urgencySignals.length === 0
      ? "None"
      : insight.urgencySignals.map((signal) => `"${signal}"`).join(", ");

  return (
    `### ${email.subject}\n` +
    `**From:** ${email.from}\n` +
    `**Priority:** ${capitalize(insight.priority)} | **Sentiment:** ${capitalize(insight.sentiment)}\n\n` +
    `**Action Items:**\n${actionItems}\n\n` +
    `**Relationship:** ${insight.relationshipContext}\n` +
    `**Urgency Signals:** ${urgencySignals}\n\n` +
    "---\n"
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
