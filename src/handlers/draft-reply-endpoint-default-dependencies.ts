import { google, type Auth } from "googleapis";
import { extractDraftReply } from "../services/ai/extract-draft-reply.js";
import { createAuthClient } from "../services/gmail/create-auth-client.js";
import {
  createReplyDraft,
  type GmailDraftCreateParams
} from "../services/gmail/create-reply-draft.js";
import {
  fetchReplyContext,
  type GmailMessageGetParams,
  type GmailThreadGetParams
} from "../services/gmail/fetch-reply-context.js";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

export function createDraftReplyEndpointDefaultDependencies() {
  const gmailClientCache = new WeakMap<object, ReturnType<typeof google.gmail>>();

  const createGmailClient = (authClient: unknown) => {
    if (typeof authClient !== "object" || authClient === null) {
      return google.gmail({
        version: "v1",
        auth: authClient as Auth.OAuth2Client
      });
    }

    const gmailClient = gmailClientCache.get(authClient);

    if (gmailClient) {
      return gmailClient;
    }

    const newGmailClient = google.gmail({
      version: "v1",
      auth: authClient as Auth.OAuth2Client
    });

    gmailClientCache.set(authClient, newGmailClient);

    return newGmailClient;
  };

  return {
    createAuthClient,
    createGmailReplyContextApi: (authClient: unknown) => {
      const gmail = createGmailClient(authClient);

      return {
        getMessage: (params: GmailMessageGetParams) =>
          gmail.users.messages.get({
            userId: params.userId,
            id: params.id,
            format: params.format
          }),
        getThread: (params: GmailThreadGetParams) =>
          gmail.users.threads.get({
            userId: params.userId,
            id: params.id,
            format: params.format
          })
      };
    },
    fetchReplyContext,
    extractDraftReply,
    createGmailDraftsApi: (authClient: unknown) => {
      const gmail = createGmailClient(authClient);

      return {
        create: (params: GmailDraftCreateParams) =>
          gmail.users.drafts.create({
            userId: params.userId,
            requestBody: params.requestBody
          })
      };
    },
    createReplyDraft,
    model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
    createMessageId: () => crypto.randomUUID()
  };
}
