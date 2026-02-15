import type { gmail_v1 } from "googleapis";

import type { EmailMetadata } from "../../domain/email-metadata.js";
import { parseGmailMessage } from "./parse-gmail-message.js";

const DEFAULT_MAX_CONTEXT_MESSAGES = 6;

type GmailMessageGetResponse = {
  data: gmail_v1.Schema$Message;
};

type GmailThreadGetResponse = {
  data: gmail_v1.Schema$Thread;
};

export type GmailMessageGetParams = {
  userId: string;
  id: string;
  format: "full";
};

export type GmailThreadGetParams = {
  userId: string;
  id: string;
  format: "full";
};

export type GmailReplyContextApi = {
  getMessage: (params: GmailMessageGetParams) => Promise<GmailMessageGetResponse>;
  getThread: (params: GmailThreadGetParams) => Promise<GmailThreadGetResponse>;
};

export type FetchReplyContextOptions = {
  emailId: string;
  threadId?: string;
  maxContextMessages?: number;
};

export type ReplyHeaders = {
  inReplyTo?: string;
  references?: string;
};

export type ReplyContext = {
  email: EmailMetadata;
  threadId: string;
  contextMessages: EmailMetadata[];
  contextMessageCount: number;
  contextDegraded: boolean;
  replyHeaders: ReplyHeaders;
};

export async function fetchReplyContext(
  gmailClient: GmailReplyContextApi,
  options: FetchReplyContextOptions
): Promise<ReplyContext> {
  const maxContextMessages = options.maxContextMessages ?? DEFAULT_MAX_CONTEXT_MESSAGES;

  if (maxContextMessages < 1) {
    throw new Error("maxContextMessages must be greater than 0");
  }

  const targetResponse = await gmailClient.getMessage({
    userId: "me",
    id: options.emailId,
    format: "full"
  });
  const targetEmail = parseGmailMessage(targetResponse.data);
  const replyHeaders = extractReplyHeaders(targetResponse.data.payload?.headers ?? []);
  const threadId = options.threadId ?? targetEmail.threadId;

  if (threadId.length === 0) {
    return createReplyContext(targetEmail, threadId, [targetEmail], true, replyHeaders);
  }

  try {
    const threadResponse = await gmailClient.getThread({
      userId: "me",
      id: threadId,
      format: "full"
    });
    const threadMessages = parseThreadMessages(threadResponse.data.messages ?? []);
    const orderedMessages = ensureTargetInContext(threadMessages, targetEmail);
    const boundedMessages = truncateContextMessages(
      orderedMessages,
      targetEmail,
      maxContextMessages
    );

    return createReplyContext(targetEmail, threadId, boundedMessages, false, replyHeaders);
  } catch {
    return createReplyContext(targetEmail, threadId, [targetEmail], true, replyHeaders);
  }
}

function createReplyContext(
  email: EmailMetadata,
  threadId: string,
  contextMessages: EmailMetadata[],
  contextDegraded: boolean,
  replyHeaders: ReplyHeaders
): ReplyContext {
  return {
    email,
    threadId,
    contextMessages,
    contextMessageCount: contextMessages.length,
    contextDegraded,
    replyHeaders
  };
}

function extractReplyHeaders(headers: gmail_v1.Schema$MessagePartHeader[]): ReplyHeaders {
  const inReplyTo = getHeaderValue(headers, "Message-ID");
  const existingReferences = getHeaderValue(headers, "References");
  const references = buildReferences(existingReferences, inReplyTo);

  return {
    ...(inReplyTo ? { inReplyTo } : {}),
    ...(references ? { references } : {})
  };
}

function getHeaderValue(
  headers: gmail_v1.Schema$MessagePartHeader[],
  headerName: string
): string | undefined {
  const matchedHeader = headers.find(
    (header) => header.name?.toLowerCase() === headerName.toLowerCase()
  );
  const value = matchedHeader?.value?.trim();

  return value && value.length > 0 ? value : undefined;
}

function buildReferences(existingReferences?: string, inReplyTo?: string): string | undefined {
  if (!existingReferences && !inReplyTo) {
    return undefined;
  }

  if (!existingReferences) {
    return inReplyTo;
  }

  if (!inReplyTo || existingReferences.includes(inReplyTo)) {
    return existingReferences;
  }

  return `${existingReferences} ${inReplyTo}`;
}

function parseThreadMessages(messages: Array<gmail_v1.Schema$Message | null>): EmailMetadata[] {
  const parsedMessages: EmailMetadata[] = [];

  for (const message of messages) {
    if (!message?.id) {
      continue;
    }

    parsedMessages.push(parseGmailMessage(message));
  }

  return deduplicateById(parsedMessages);
}

function deduplicateById(messages: EmailMetadata[]): EmailMetadata[] {
  const deduplicated: EmailMetadata[] = [];
  const seenIds = new Set<string>();

  for (const message of messages) {
    if (seenIds.has(message.id)) {
      continue;
    }

    seenIds.add(message.id);
    deduplicated.push(message);
  }

  return deduplicated;
}

function ensureTargetInContext(
  contextMessages: EmailMetadata[],
  targetEmail: EmailMetadata
): EmailMetadata[] {
  if (contextMessages.some((message) => message.id === targetEmail.id)) {
    return contextMessages;
  }

  return [...contextMessages, targetEmail];
}

function truncateContextMessages(
  contextMessages: EmailMetadata[],
  targetEmail: EmailMetadata,
  maxContextMessages: number
): EmailMetadata[] {
  if (contextMessages.length <= maxContextMessages) {
    return contextMessages;
  }

  if (maxContextMessages === 1) {
    return [targetEmail];
  }

  const recentWindow = contextMessages.slice(-maxContextMessages);

  if (recentWindow.some((message) => message.id === targetEmail.id)) {
    return recentWindow;
  }

  const recentWithoutTarget = contextMessages
    .filter((message) => message.id !== targetEmail.id)
    .slice(-(maxContextMessages - 1));

  return [targetEmail, ...recentWithoutTarget];
}
