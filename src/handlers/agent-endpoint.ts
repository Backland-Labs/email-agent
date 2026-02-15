import { google, type Auth } from "googleapis";

import {
  compareByCategory,
  type EmailUrgency,
  type EmailInsight
} from "../domain/email-insight.js";
import type { EmailMetadata } from "../domain/email-metadata.js";
import {
  formatDigestIntro,
  formatSectionHeader,
  formatInsightMarkdown
} from "./format-insight-markdown.js";
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
import type { RunAgentInput } from "@ag-ui/core";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const agentLogger = logger.child({ route: "/agent" });
const AGENT_LOG_CODES = {
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

  let runId: string;
  let threadId: string;

  try {
    const body: Partial<RunAgentInput> = request.body
      ? ((await request.json()) as Partial<RunAgentInput>)
      : {};
    threadId = body.threadId || `thread-${requestId}`;
    runId = body.runId || `run-${requestId}`;
  } catch {
    threadId = `thread-${requestId}`;
    runId = `run-${requestId}`;
  }

  const runContext = { runId, threadId };
  const messageId = dependencies.createMessageId();
  const runLogger = requestLogger.child({
    runId: runContext.runId,
    threadId: runContext.threadId
  });

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
          encodeRunStarted({ threadId: runContext.threadId, runId: runContext.runId })
        );
        controller.enqueue(encodeTextMessageStart({ messageId }));

        const authClient = dependencies.createAuthClient();
        const gmailClient = dependencies.createGmailMessagesApi(authClient);
        const unreadEmails = await dependencies.fetchUnreadEmails(gmailClient, {
          requestId,
          runId: runContext.runId,
          threadId: runContext.threadId
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

        if (results.length > 0) {
          controller.enqueue(
            encodeTextMessageContent({
              messageId,
              delta: formatDigestIntro(results.map((r) => r.insight))
            })
          );
        }

        let currentUrgency: EmailUrgency | null = null;
        let emittedReadingListHeader = false;

        for (const { email, insight } of results) {
          if (insight.urgency !== currentUrgency) {
            currentUrgency = insight.urgency;
            emittedReadingListHeader = false;
            controller.enqueue(
              encodeTextMessageContent({
                messageId,
                delta: formatSectionHeader(currentUrgency)
              })
            );
          }

          if (
            insight.category === "newsletter_or_spam" &&
            insight.urgency === "fyi" &&
            !emittedReadingListHeader
          ) {
            emittedReadingListHeader = true;
            controller.enqueue(
              encodeTextMessageContent({
                messageId,
                delta: "### Reading List\n\n"
              })
            );
          }

          controller.enqueue(
            encodeTextMessageContent({
              messageId,
              delta: formatInsightMarkdown(email, insight)
            })
          );
        }

        if (currentUrgency === "noise") {
          controller.enqueue(
            encodeTextMessageContent({
              messageId,
              delta: "\n"
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

        controller.enqueue(encodeTextMessageEnd({ messageId }));
        controller.enqueue(
          encodeRunFinished({ threadId: runContext.threadId, runId: runContext.runId })
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

  return Promise.resolve(
    new Response(stream, {
      status: 200,
      headers: SSE_HEADERS
    })
  );
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

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
