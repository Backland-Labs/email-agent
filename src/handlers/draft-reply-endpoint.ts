import {
  createDraftReplyRunResult,
  type DraftReplyModelOutput
} from "../domain/draft-reply-result.js";
import { parseDraftReplyRequest } from "../domain/draft-reply-request.js";
import { logger } from "../observability/logger.js";
import type { ReplyContext } from "../services/gmail/fetch-reply-context.js";
import {
  encodeRunError,
  encodeRunFinished,
  encodeRunStarted,
  encodeTextMessageContent,
  encodeTextMessageEnd,
  encodeTextMessageStart
} from "../services/streaming/encode-ag-ui-events.js";
import { createDraftReplyEndpointDefaultDependencies } from "./draft-reply-endpoint-default-dependencies.js";
import type { DraftReplyEndpointDependencies } from "./draft-reply-endpoint-dependencies.js";
import {
  DRAFT_REPLY_ERROR_CODES,
  DraftReplyEndpointError,
  type DraftReplyErrorCode,
  assertDraftReplyNotAborted,
  formatDraftReplyContent,
  parseDraftReplyRequestBody,
  resolveDraftReplyRunContext,
  toDraftReplyEndpointError,
  toErrorMessage
} from "./draft-reply-endpoint-runtime.js";

const draftReplyLogger = logger.child({ route: "/draft-reply" });

const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache",
  connection: "keep-alive"
};

export type DraftReplyEndpointDependencies = ReturnType<
  typeof createDraftReplyEndpointDefaultDependencies
>;

export async function handleDraftReplyEndpoint(
  request: Request,
  dependencies?: DraftReplyEndpointDependencies
): Promise<Response> {
  const effectiveDependencies = dependencies ?? createDraftReplyEndpointDefaultDependencies();
  const requestId = crypto.randomUUID();
  const parsedBody = await parseDraftReplyRequestBody(request);
  const runContext = resolveDraftReplyRunContext(parsedBody.body, requestId);
  const messageId = effectiveDependencies.createMessageId();
  const runLogger = draftReplyLogger.child({
    requestId,
    runId: runContext.runId,
    threadId: runContext.threadId
  });

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      const runStartedAt = Date.now();
      let terminalEmitted = false;
      let textMessageStarted = false;
      let textMessageEnded = false;
      let contextMessageCount = 0;
      let contextDegraded = false;

      const emitTextMessageEndIfNeeded = (): void => {
        if (!textMessageStarted || textMessageEnded || terminalEmitted) {
          return;
        }

        controller.enqueue(encodeTextMessageEnd({ messageId }));
        textMessageEnded = true;
      };

      const emitRunErrorIfNeeded = (message: string, code: DraftReplyErrorCode): void => {
        /* c8 ignore next 3 */
        if (terminalEmitted) {
          return;
        }

        emitTextMessageEndIfNeeded();
        controller.enqueue(encodeRunError({ message, code }));
        terminalEmitted = true;
      };

      const emitRunFinishedIfNeeded = (
        result: ReturnType<typeof createDraftReplyRunResult>
      ): void => {
        /* c8 ignore next 3 */
        if (terminalEmitted) {
          return;
        }

        emitTextMessageEndIfNeeded();
        controller.enqueue(
          encodeRunFinished({
            threadId: runContext.threadId,
            runId: runContext.runId,
            result
          })
        );
        terminalEmitted = true;
      };

      runLogger.info({ event: "draft_reply.run_started" }, "Started draft reply run");
      controller.enqueue(
        encodeRunStarted({
          threadId: runContext.threadId,
          runId: runContext.runId
        })
      );

      try {
        if (parsedBody.invalidJson) {
          runLogger.error(
            {
              event: "draft_reply.run_failed",
              durationMs: Date.now() - runStartedAt,
              code: DRAFT_REPLY_ERROR_CODES.invalidRequest,
              err: parsedBody.error
            },
            "Invalid draft reply request body"
          );
          emitRunErrorIfNeeded(
            "Invalid draft reply request payload",
            DRAFT_REPLY_ERROR_CODES.invalidRequest
          );
          return;
        }

        let parsedRequest;

        try {
          parsedRequest = parseDraftReplyRequest(parsedBody.body);
        } catch (error) {
          runLogger.error(
            {
              event: "draft_reply.run_failed",
              durationMs: Date.now() - runStartedAt,
              code: DRAFT_REPLY_ERROR_CODES.invalidRequest,
              err: error
            },
            "Invalid draft reply request payload"
          );
          emitRunErrorIfNeeded(
            "Invalid draft reply request payload",
            DRAFT_REPLY_ERROR_CODES.invalidRequest
          );
          return;
        }

        assertDraftReplyNotAborted(request.signal);

        controller.enqueue(encodeTextMessageStart({ messageId }));
        textMessageStarted = true;

        const authClient = effectiveDependencies.createAuthClient();
        const gmailClient = effectiveDependencies.createGmailReplyContextApi(authClient);
        const gmailDraftsApi = effectiveDependencies.createGmailDraftsApi(authClient);

        let context: ReplyContext;

        try {
          context = await effectiveDependencies.fetchReplyContext(gmailClient, {
            emailId: parsedRequest.emailId,
            ...(parsedRequest.threadId ? { threadId: parsedRequest.threadId } : {})
          });
        } catch (error) {
          throw new DraftReplyEndpointError(
            toErrorMessage(error),
            DRAFT_REPLY_ERROR_CODES.contextFetchFailed,
            error
          );
        }

        assertDraftReplyNotAborted(request.signal);

        contextMessageCount = context.contextMessageCount;
        contextDegraded = context.contextDegraded;

        if (context.contextDegraded) {
          runLogger.warn(
            {
              event: "draft_reply.context_degraded",
              code: DRAFT_REPLY_ERROR_CODES.contextDegraded,
              contextMessageCount
            },
            "Draft reply context degraded to target email only"
          );
        }

        let draftReply: DraftReplyModelOutput;

        try {
          draftReply = await effectiveDependencies.extractDraftReply(effectiveDependencies.model, {
            email: context.email,
            contextMessages: context.contextMessages,
            contextDegraded: context.contextDegraded,
            ...(parsedRequest.voiceInstructions
              ? { voiceInstructions: parsedRequest.voiceInstructions }
              : {})
          });
        } catch (error) {
          throw new DraftReplyEndpointError(
            toErrorMessage(error),
            DRAFT_REPLY_ERROR_CODES.draftGenerationFailed,
            error
          );
        }

        assertDraftReplyNotAborted(request.signal);

        const savedDraft = await dependencies
          .createReplyDraft(gmailDraftsApi, {
            threadId: context.threadId,
            to: context.email.from,
            subject: context.email.subject,
            bodyText: draftReply.draftText,
            ...(context.replyHeaders.inReplyTo
              ? { inReplyTo: context.replyHeaders.inReplyTo }
              : {}),
            ...(context.replyHeaders.references
              ? { references: context.replyHeaders.references }
              : {})
          })
          .catch((error: unknown) => {
            throw new DraftReplyEndpointError(
              toErrorMessage(error),
              DRAFT_REPLY_ERROR_CODES.draftSaveFailed,
              error
            );
          });

        assertDraftReplyNotAborted(request.signal);

        const savedDraft = await effectiveDependencies
          .createReplyDraft(gmailDraftsApi, {
            threadId: context.threadId,
            to: context.email.from,
            subject: context.email.subject,
            bodyText: draftReply.draftText,
            ...(context.replyHeaders.inReplyTo
              ? { inReplyTo: context.replyHeaders.inReplyTo }
              : {}),
            ...(context.replyHeaders.references
              ? { references: context.replyHeaders.references }
              : {})
          })
          .catch((error: unknown) => {
            throw new DraftReplyEndpointError(
              toErrorMessage(error),
              DRAFT_REPLY_ERROR_CODES.draftSaveFailed,
              error
            );
          });

        controller.enqueue(
          encodeTextMessageContent({
            messageId,
            delta: formatDraftReplyContent(draftReply)
          })
        );

        const runResult = createDraftReplyRunResult({
          emailId: context.email.id,
          gmailDraftId: savedDraft.id,
          contextMessageCount,
          contextDegraded,
          riskFlags: draftReply.riskFlags
        });

        emitRunFinishedIfNeeded(runResult);

        runLogger.info(
          {
            event: "draft_reply.run_completed",
            durationMs: Date.now() - runStartedAt,
            contextMessageCount,
            contextDegraded,
            gmailDraftId: savedDraft.id,
            riskFlags: draftReply.riskFlags.length
          },
          "Completed draft reply run"
        );
      } catch (error) {
        const endpointError = toDraftReplyEndpointError(error);

        runLogger.error(
          {
            event: "draft_reply.run_failed",
            durationMs: Date.now() - runStartedAt,
            contextMessageCount,
            contextDegraded,
            code: endpointError.code,
            err: endpointError.details
          },
          "Failed draft reply run"
        );

        emitRunErrorIfNeeded(endpointError.message, endpointError.code);
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
