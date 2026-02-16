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
import {
  encodeRunError,
  encodeRunFinished,
  encodeRunStarted,
  encodeTextMessageContent,
  encodeTextMessageEnd,
  encodeTextMessageStart
} from "../services/streaming/encode-ag-ui-events.js";
import {
  type AgentEndpointDependencies,
  type AgentRunContext,
  toErrorMessage,
  toRunContext
} from "./agent-endpoint-runtime-helpers.js";

const AGENT_LOG_CODES = {
  insightExtractFailed: "insight_extract_failed",
  runFailed: "run_failed"
} as const;

type AgentEndpointStreamInput = {
  request: Request;
  dependencies: AgentEndpointDependencies;
  runContext: AgentRunContext;
  runLogger: {
    info: (obj: Record<string, unknown>, message: string) => void;
    warn: (obj: Record<string, unknown>, message: string) => void;
    error: (obj: Record<string, unknown>, message: string) => void;
  };
  messageId: string;
  requestId: string;
};

export function createAgentEndpointStream({
  request,
  dependencies,
  runContext,
  runLogger,
  messageId,
  requestId
}: AgentEndpointStreamInput): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start: async (controller) => {
      const runStartedAt = Date.now();
      let unreadCount = 0;
      let generatedInsightCount = 0;
      let failedInsightCount = 0;
      let lastInsightFailure: unknown;
      let aborted = false;

      const safeEnqueue = (data: Uint8Array): boolean => {
        try {
          controller.enqueue(data);
          return true;
        } catch (error: unknown) {
          if (error instanceof Error && error.message.includes("Controller is already closed")) {
            aborted = true;
            return false;
          }

          throw error;
        }
      };

      runLogger.info({ event: "agent.run_started" }, "Started agent run");

      try {
        safeEnqueue(encodeRunStarted({ threadId: runContext.threadId, runId: runContext.runId }));
        safeEnqueue(encodeTextMessageStart({ messageId }));

        const authClient = dependencies.createAuthClient();
        const gmailClient = dependencies.createGmailMessagesApi(authClient);
        const unreadEmails = await dependencies.fetchUnreadEmails(gmailClient, {
          requestId,
          runId: runContext.runId,
          threadId: runContext.threadId
        });
        unreadCount = unreadEmails.length;

        if (unreadEmails.length === 0) {
          safeEnqueue(
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
          }
        }

        results.sort((a, b) => compareByCategory(a.insight, b.insight));

        if (results.length > 0 && !aborted) {
          safeEnqueue(
            encodeTextMessageContent({
              messageId,
              delta: formatDigestIntro(results.map((result) => result.insight))
            })
          );
        }

        let currentUrgency: EmailUrgency | null = null;
        let emittedReadingListHeader = false;

        for (const { email, insight } of results) {
          if (aborted) {
            break;
          }

          if (insight.urgency !== currentUrgency) {
            currentUrgency = insight.urgency;
            emittedReadingListHeader = false;

            if (
              !safeEnqueue(
                encodeTextMessageContent({
                  messageId,
                  delta: formatSectionHeader(currentUrgency)
                })
              )
            ) {
              break;
            }
          }

          if (
            insight.category === "newsletter_or_spam" &&
            insight.urgency === "fyi" &&
            !emittedReadingListHeader
          ) {
            emittedReadingListHeader = true;

            if (
              !safeEnqueue(
                encodeTextMessageContent({
                  messageId,
                  delta: "### Reading List\n\n"
                })
              )
            ) {
              break;
            }
          }

          if (
            !safeEnqueue(
              encodeTextMessageContent({
                messageId,
                delta: formatInsightMarkdown(email, insight)
              })
            )
          ) {
            break;
          }
        }

        if (currentUrgency === "noise" && !aborted) {
          safeEnqueue(
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

        safeEnqueue(encodeTextMessageEnd({ messageId }));
        safeEnqueue(
          encodeRunFinished({
            threadId: runContext.threadId,
            runId: runContext.runId
          })
        );

        if (aborted) {
          runLogger.info(
            {
              event: "agent.run_aborted",
              durationMs: Date.now() - runStartedAt,
              unreadCount,
              generatedInsightCount,
              failedInsightCount
            },
            "Agent run aborted by client disconnect"
          );
          return;
        }

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
      } catch (error: unknown) {
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

        if (!aborted) {
          safeEnqueue(
            encodeRunError({
              message: toErrorMessage(error)
            })
          );
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Controller may already be closed if the client disconnected
        }
      }
    }
  });
}

export { type AgentEndpointDependencies, toRunContext };
