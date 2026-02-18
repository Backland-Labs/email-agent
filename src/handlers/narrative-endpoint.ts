import { logger } from "../observability/logger.js";
import {
  encodeRunError,
  encodeRunFinished,
  encodeRunStarted,
  encodeTextMessageContent,
  encodeTextMessageEnd,
  encodeTextMessageStart
} from "../services/streaming/encode-ag-ui-events.js";
import { createNarrativeEndpointDefaultDependencies } from "./narrative-endpoint-default-dependencies.js";
import {
  LOOKBACK_HOURS,
  analyzeEmails,
  buildLookbackQuery,
  buildNarrative,
  extractActionItems,
  filterEmailsInLookbackWindow,
  orderByPriorityAndCategory,
  parseNarrativeRequestBody,
  resolveNarrativeRunContext,
  toErrorMessage
} from "./narrative-endpoint-runtime.js";
import { createNarrativeRunResult } from "../domain/narrative-run-result.js";

export type NarrativeEndpointDependencies = ReturnType<
  typeof createNarrativeEndpointDefaultDependencies
> & {
  createReadableStream?: (source: unknown) => ReadableStream<Uint8Array>;
};

const NARRATIVE_LOG_CODES = {
  insightExtractFailed: "insight_extract_failed",
  runFailed: "run_failed"
} as const;

const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache",
  connection: "keep-alive"
};

const narrativeLogger = logger.child({ route: "/narrative" });

export async function handleNarrativeEndpoint(
  request: Request,
  dependencies: NarrativeEndpointDependencies = createNarrativeEndpointDefaultDependencies()
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const requestLogger = narrativeLogger.child({ requestId });
  const runContext = resolveNarrativeRunContext(
    await parseNarrativeRequestBody(request),
    requestId
  );
  const runLogger = requestLogger.child({
    runId: runContext.runId,
    threadId: runContext.threadId
  });
  const messageId = dependencies.createMessageId();

  const createReadableStream =
    dependencies.createReadableStream ??
    ((source: unknown) => new ReadableStream<Uint8Array>(source as UnderlyingSource<Uint8Array>));

  const stream = createReadableStream({
    start: async (controller: { enqueue: (data: Uint8Array) => void; close: () => void }) => {
      const runStartedAt = Date.now();
      let unreadCount = 0;
      let analyzedCount = 0;
      let failedInsightCount = 0;
      let lastInsightFailure: unknown;
      let aborted = false;
      let textMessageStarted = false;
      let textMessageEnded = false;

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

      const emitTextMessageEndIfNeeded = (): void => {
        if (!textMessageStarted || textMessageEnded) {
          return;
        }

        if (safeEnqueue(encodeTextMessageEnd({ messageId }))) {
          textMessageEnded = true;
        }
      };

      runLogger.info({ event: "narrative.run_started" }, "Started narrative run");

      try {
        safeEnqueue(
          encodeRunStarted({
            threadId: runContext.threadId,
            runId: runContext.runId
          })
        );
        textMessageStarted = safeEnqueue(encodeTextMessageStart({ messageId }));

        const authClient = dependencies.createAuthClient();
        const gmailClient = dependencies.createGmailMessagesApi(authClient);
        const lookbackNowMs = Date.now();
        const unreadEmails = await dependencies.fetchUnreadEmails(gmailClient, {
          requestId,
          runId: runContext.runId,
          threadId: runContext.threadId,
          query: buildLookbackQuery(lookbackNowMs)
        });

        const scopedUnreadEmails = filterEmailsInLookbackWindow(unreadEmails, lookbackNowMs);

        unreadCount = scopedUnreadEmails.length;
        const analyzed = await analyzeEmails({
          emails: scopedUnreadEmails,
          signal: request.signal,
          model: dependencies.model,
          extractEmailInsight: dependencies.extractEmailInsight,
          onInsight: () => {
            analyzedCount += 1;
          },
          onFailure: (error) => {
            failedInsightCount += 1;
            lastInsightFailure = error;
          },
          onAbort: () => {
            aborted = true;
          }
        });

        const sortedResults = orderByPriorityAndCategory(analyzed);
        const actionItems = extractActionItems(sortedResults);

        if (failedInsightCount > 0) {
          runLogger.warn(
            {
              event: "narrative.insights_failed",
              code: NARRATIVE_LOG_CODES.insightExtractFailed,
              failedInsightCount,
              unreadCount,
              analyzedCount,
              err: lastInsightFailure
            },
            "Skipped some emails after insight extraction failures"
          );
        }

        const narrative = buildNarrative({
          results: sortedResults,
          unreadCount,
          actionItems
        });

        const result = createNarrativeRunResult({
          unreadCount,
          analyzedCount,
          actionItems,
          timeframeHours: LOOKBACK_HOURS,
          narrative
        });

        safeEnqueue(
          encodeTextMessageContent({
            messageId,
            delta: result.narrative
          })
        );

        emitTextMessageEndIfNeeded();
        safeEnqueue(
          encodeRunFinished({
            threadId: runContext.threadId,
            runId: runContext.runId,
            result
          })
        );

        runLogger.info(
          {
            event: "narrative.run_completed",
            durationMs: Date.now() - runStartedAt,
            unreadCount,
            analyzedCount,
            failedInsightCount,
            actionItemCount: result.actionItemCount,
            aborted
          },
          "Completed narrative run"
        );
      } catch (error) {
        runLogger.error(
          {
            event: "narrative.run_failed",
            durationMs: Date.now() - runStartedAt,
            unreadCount,
            analyzedCount,
            failedInsightCount,
            code: NARRATIVE_LOG_CODES.runFailed,
            err: error
          },
          "Failed narrative run"
        );

        emitTextMessageEndIfNeeded();
        safeEnqueue(
          encodeRunError({
            message: toErrorMessage(error),
            code: NARRATIVE_LOG_CODES.runFailed
          })
        );
      } finally {
        try {
          controller.close();
        } catch {
          // Controller may already be closed if the client disconnected
        }
      }
    }
  });

  return new Response(stream, {
    status: 200,
    headers: SSE_HEADERS
  });
}
