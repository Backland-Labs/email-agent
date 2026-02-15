import type { gmail_v1 } from "googleapis";

import type { EmailMetadata } from "../../domain/email-metadata.js";
import { logger } from "../../observability/logger.js";
import { parseGmailMessage } from "./parse-gmail-message.js";

const gmailLogger = logger.child({ service: "gmail" });
const GMAIL_LOG_CODES = {
  fetchFailed: "gmail_fetch_failed"
} as const;

type GmailListMessage = {
  id?: string | null;
};

type GmailListResponse = {
  data: {
    messages?: Array<GmailListMessage | null> | null;
  };
};

type GmailGetResponse = {
  data: gmail_v1.Schema$Message;
};

export type GmailListParams = {
  userId: string;
  q: string;
  labelIds: string[];
  maxResults: number;
};

export type GmailGetParams = {
  userId: string;
  id: string;
  format: "full";
};

export type GmailMessagesApi = {
  list: (params: GmailListParams) => Promise<GmailListResponse>;
  get: (params: GmailGetParams) => Promise<GmailGetResponse>;
};

export type FetchUnreadEmailsOptions = {
  maxResults?: number;
  concurrency?: number;
  requestId?: string;
  runId?: string;
  threadId?: string;
};

export async function fetchUnreadEmails(
  gmailClient: GmailMessagesApi,
  options: FetchUnreadEmailsOptions = {}
): Promise<EmailMetadata[]> {
  const maxResults = options.maxResults ?? 20;
  const concurrency = options.concurrency ?? 10;
  const startedAt = Date.now();
  const fetchLogger = gmailLogger.child({
    requestId: options.requestId,
    runId: options.runId,
    threadId: options.threadId
  });

  fetchLogger.info(
    {
      event: "gmail.fetch_started",
      maxResults,
      concurrency
    },
    "Started unread email fetch"
  );

  try {
    const listResponse = await gmailClient.list({
      userId: "me",
      q: "is:unread",
      labelIds: ["INBOX"],
      maxResults
    });

    const messageIds = (listResponse.data.messages ?? [])
      .map((message) => message?.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    if (messageIds.length === 0) {
      fetchLogger.info(
        {
          event: "gmail.fetch_completed",
          durationMs: Date.now() - startedAt,
          unreadCount: 0
        },
        "Completed unread email fetch"
      );
      return [];
    }

    const emails: EmailMetadata[] = [];

    for (let index = 0; index < messageIds.length; index += concurrency) {
      const chunkIds = messageIds.slice(index, index + concurrency);

      const chunkResponses = await Promise.all(
        chunkIds.map((id) =>
          gmailClient.get({
            userId: "me",
            id,
            format: "full"
          })
        )
      );

      for (const response of chunkResponses) {
        emails.push(parseGmailMessage(response.data));
      }
    }

    fetchLogger.info(
      {
        event: "gmail.fetch_completed",
        durationMs: Date.now() - startedAt,
        unreadCount: emails.length
      },
      "Completed unread email fetch"
    );

    return emails;
  } catch (error) {
    fetchLogger.error(
      {
        event: "gmail.fetch_failed",
        durationMs: Date.now() - startedAt,
        maxResults,
        concurrency,
        code: GMAIL_LOG_CODES.fetchFailed,
        err: error
      },
      "Failed unread email fetch"
    );
    throw error;
  }
}
