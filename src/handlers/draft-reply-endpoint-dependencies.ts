import type { DraftReplyModelOutput } from "../domain/draft-reply-result.js";
import type { DraftReplyPromptInput } from "../services/ai/build-draft-reply-prompt.js";
import type {
  CreateReplyDraftInput,
  CreatedReplyDraft,
  GmailDraftsApi
} from "../services/gmail/create-reply-draft.js";
import type {
  FetchReplyContextOptions,
  GmailReplyContextApi,
  ReplyContext
} from "../services/gmail/fetch-reply-context.js";

export type DraftReplyEndpointDependencies = {
  createAuthClient: () => unknown;
  createGmailReplyContextApi: (authClient: unknown) => GmailReplyContextApi;
  fetchReplyContext: (
    gmailClient: GmailReplyContextApi,
    options: FetchReplyContextOptions
  ) => Promise<ReplyContext>;
  createGmailDraftsApi: (authClient: unknown) => GmailDraftsApi;
  createReplyDraft: (
    gmailDraftsApi: GmailDraftsApi,
    input: CreateReplyDraftInput
  ) => Promise<CreatedReplyDraft>;
  extractDraftReply: (
    modelName: string,
    input: DraftReplyPromptInput
  ) => Promise<DraftReplyModelOutput>;
  model: string;
  createMessageId: () => string;
};

export const DRAFT_REPLY_ENDPOINT_DEPENDENCIES_CONTRACT = "v1";
