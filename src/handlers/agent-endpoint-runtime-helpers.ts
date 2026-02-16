import type { EmailMetadata } from "../domain/email-metadata.js";
import type { EmailInsight } from "../domain/email-insight.js";
import type {
  FetchUnreadEmailsOptions,
  GmailMessagesApi
} from "../services/gmail/fetch-unread-emails.js";

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

export type AgentRunContext = {
  runId: string;
  threadId: string;
};

export function toRunContext(request: Request, requestId: string): Promise<AgentRunContext> {
  const defaults = {
    runId: `run-${requestId}`,
    threadId: `thread-${requestId}`
  };

  if (!request.body) {
    return Promise.resolve(defaults);
  }

  return request
    .json()
    .then((body) => resolveRunContext(body, requestId))
    .catch(() => defaults);
}

function resolveRunContext(body: unknown, requestId: string): AgentRunContext {
  if (!body || typeof body !== "object") {
    return {
      runId: `run-${requestId}`,
      threadId: `thread-${requestId}`
    };
  }

  const input = body as Record<string, unknown>;

  return {
    runId: getNonEmptyString(input.runId) ?? `run-${requestId}`,
    threadId: getNonEmptyString(input.threadId) ?? `thread-${requestId}`
  };
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
