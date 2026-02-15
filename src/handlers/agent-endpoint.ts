import { RunAgentInputSchema, type RunAgentInput } from "@ag-ui/core";
import { google, type Auth } from "googleapis";

import { compareByCategory, type EmailInsight } from "../domain/email-insight.js";
import type { EmailMetadata } from "../domain/email-metadata.js";
import { formatInsightMarkdown } from "./format-insight-markdown.js";
import { extractEmailInsight } from "../services/ai/extract-email-insight.js";
import { createAuthClient } from "../services/gmail/create-auth-client.js";
import {
  fetchUnreadEmails,
  type FetchUnreadEmailsOptions,
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
import { logger } from "../observability/logger.js";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const agentLogger = logger.child({ route: "/agent" });
const AGENT_LOG_CODES = {
  invalidInput: "invalid_input",
  inputParseFailed: "input_parse_failed",
  insightExtractFailed: "insight_extract_failed",
  runFailed: "run_failed"
} as const;

const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache",
  connection: "keep-alive"
};

export type AgentEndpointDependencies = {
  createAuthClient: () => unknown;
  createGmailMessagesApi: (authClient: unknown) => GmailMessagesApi;
  fetchUnreadEmails: (
    gmailClient: GmailMessagesApi,
    options?: FetchUnreadEmailsOptions
  ) => Promise<EmailMetadata[]>;
  extractEmailInsight: (model: string, email: EmailMetadata) => Promise<EmailInsight>;
  model: string;
  createMessageId: () => string;
};

export async function handleAgentEndpoint(
  request: Request,
  dependencies: AgentEndpointDependencies = createDefaultDependencies()
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const requestLogger = agentLogger.child({ requestId });
  const parsedInput = await parseRunAgentInput(request, requestLogger);

  if (!parsedInput.success) {
    requestLogger.warn(
      {
        event: "agent.request_rejected",
        method: request.method,
        reason: "invalid_run_agent_input",
        code: AGENT_LOG_CODES.invalidInput
      },
      "Rejected invalid RunAgentInput payload"
    );
    return createErrorResponse("Invalid RunAgentInput payload");
  }

  const input = parsedInput.input;
  const messageId = dependencies.createMessageId();
  const runLogger = requestLogger.child({ runId: input.runId, threadId: input.threadId });

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      const runStartedAt = Date.now();
      let unreadCount = 0;
      let generatedInsightCount = 0;
      let failedInsightCount = 0;
      let lastInsightFailure: unknown;
      let aborted = false;

      runLogger.info({ event: "agent.run_started" }, "Started agent run");

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
        const unreadEmails = await dependencies.fetchUnreadEmails(gmailClient, {
          requestId,
          runId: input.runId,
          threadId: input.threadId
        });
        unreadCount = unreadEmails.length;

        if (unreadEmails.length === 0) {
          controller.enqueue(
            encodeTextMessageContent({
              messageId,
              delta: "No unread emails found in your inbox.\n\n"
            })
          );
        }

        const results: { email: EmailMetadata; insight: EmailInsight }[] = [];

        for (const email of unreadEmails) {
          if (request.signal.aborted) {
            aborted = true;
            break;
          }

          try {
            const insight = await dependencies.extractEmailInsight(dependencies.model, email);
            generatedInsightCount += 1;
            results.push({ email, insight });
          } catch (error) {
            failedInsightCount += 1;
            lastInsightFailure = error;
            continue;
          }
        }

        results.sort((a, b) => compareByCategory(a.insight, b.insight));

        for (const { email, insight } of results) {
          controller.enqueue(
            encodeTextMessageContent({
              messageId,
              delta: formatInsightMarkdown(email, insight)
            })
          );
        }

        if (failedInsightCount > 0) {
          runLogger.warn(
            {
              event: "agent.insights_failed",
              code: AGENT_LOG_CODES.insightExtractFailed,
              failedInsightCount,
              err: lastInsightFailure
            },
            "Skipped some insights after extraction failures"
          );
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

        runLogger.info(
          {
            event: "agent.run_completed",
            durationMs: Date.now() - runStartedAt,
            unreadCount,
            generatedInsightCount,
            failedInsightCount,
            aborted
          },
          "Completed agent run"
        );
      } catch (error) {
        runLogger.error(
          {
            event: "agent.run_failed",
            durationMs: Date.now() - runStartedAt,
            unreadCount,
            generatedInsightCount,
            failedInsightCount,
            code: AGENT_LOG_CODES.runFailed,
            err: error
          },
          "Failed agent run"
        );

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
  request: Request,
  requestLogger: typeof agentLogger
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
  } catch (error) {
    requestLogger.warn(
      { event: "agent.input_parse_failed", code: AGENT_LOG_CODES.inputParseFailed, err: error },
      "Failed to parse RunAgentInput payload"
    );
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

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
