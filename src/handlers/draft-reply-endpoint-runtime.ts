import type { DraftReplyModelOutput } from "../domain/draft-reply-result.js";

export const DRAFT_REPLY_ERROR_CODES = {
  invalidRequest: "invalid_request",
  contextFetchFailed: "context_fetch_failed",
  draftGenerationFailed: "draft_generation_failed",
  requestAborted: "request_aborted",
  contextDegraded: "context_degraded",
  runFailed: "draft_reply_run_failed"
} as const;

export type DraftReplyErrorCode =
  (typeof DRAFT_REPLY_ERROR_CODES)[keyof typeof DRAFT_REPLY_ERROR_CODES];

export type ParsedDraftReplyRequestBody = {
  body: unknown;
  invalidJson: boolean;
  error?: unknown;
};

export type DraftReplyRunContext = {
  runId: string;
  threadId: string;
};

export function parseDraftReplyRequestBody(request: Request): Promise<ParsedDraftReplyRequestBody> {
  if (!request.body) {
    return Promise.resolve({ body: {}, invalidJson: false });
  }

  return request
    .json()
    .then((body: unknown) => ({ body, invalidJson: false }))
    .catch((error: unknown) => ({ body: {}, invalidJson: true, error }));
}

export function resolveDraftReplyRunContext(
  body: unknown,
  requestId: string
): DraftReplyRunContext {
  if (!body || typeof body !== "object") {
    return {
      runId: `run-${requestId}`,
      threadId: `thread-${requestId}`
    };
  }

  const objectBody = body as Record<string, unknown>;
  const runId = getNonEmptyString(objectBody.runId) ?? `run-${requestId}`;
  const threadId = getNonEmptyString(objectBody.threadId) ?? `thread-${requestId}`;

  return { runId, threadId };
}

export function formatDraftReplyContent(draftReply: DraftReplyModelOutput): string {
  let content = draftReply.draftText;

  if (draftReply.subjectSuggestion) {
    content = `Subject suggestion: ${draftReply.subjectSuggestion}\n\n${content}`;
  }

  if (draftReply.riskFlags.length > 0) {
    content = `${content}\n\nRisk flags: ${draftReply.riskFlags.join(", ")}`;
  }

  return `${content}\n`;
}

export function assertDraftReplyNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DraftReplyEndpointError(
      "Request aborted",
      DRAFT_REPLY_ERROR_CODES.requestAborted,
      new Error("Request aborted")
    );
  }
}

export function toDraftReplyEndpointError(error: unknown): DraftReplyEndpointError {
  if (error instanceof DraftReplyEndpointError) {
    return error;
  }

  return new DraftReplyEndpointError(
    toErrorMessage(error),
    DRAFT_REPLY_ERROR_CODES.runFailed,
    error
  );
}

export class DraftReplyEndpointError extends Error {
  readonly code: DraftReplyErrorCode;
  readonly details: unknown;

  constructor(message: string, code: DraftReplyErrorCode, details: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function getNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
