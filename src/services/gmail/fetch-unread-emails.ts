import type { gmail_v1 } from "googleapis";

import type { EmailMetadata } from "../../domain/email-metadata.js";
import { parseGmailMessage } from "./parse-gmail-message.js";

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
};

export async function fetchUnreadEmails(
  gmailClient: GmailMessagesApi,
  options: FetchUnreadEmailsOptions = {}
): Promise<EmailMetadata[]> {
  const maxResults = options.maxResults ?? 20;
  const concurrency = options.concurrency ?? 10;

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

  return emails;
}
