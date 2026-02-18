import { google, type Auth } from "googleapis";

import { extractEmailInsight } from "../services/ai/extract-email-insight.js";
import { createAuthClient } from "../services/gmail/create-auth-client.js";
import {
  fetchUnreadEmails,
  type GmailGetParams,
  type GmailListParams,
  type GmailMessagesApi
} from "../services/gmail/fetch-unread-emails.js";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

export function createNarrativeEndpointDefaultDependencies() {
  const gmailClientCache = new WeakMap<object, ReturnType<typeof google.gmail>>();

  const authClientCacheKey = (authClient: unknown): object =>
    typeof authClient === "object" && authClient !== null ? authClient : { authClient };

  const createGmailClient = (authClient: Auth.OAuth2Client) => {
    const cacheKey = authClientCacheKey(authClient);
    const gmailClient = gmailClientCache.get(cacheKey);

    if (gmailClient) {
      return gmailClient;
    }

    const newGmailClient = google.gmail({
      version: "v1",
      auth: authClient
    });

    gmailClientCache.set(cacheKey, newGmailClient);

    return newGmailClient;
  };

  return {
    createAuthClient,
    createGmailMessagesApi: (authClient: Auth.OAuth2Client): GmailMessagesApi => {
      const gmail = createGmailClient(authClient);

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
