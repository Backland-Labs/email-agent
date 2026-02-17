import type { Auth } from "googleapis";

import type { EmailInsight } from "../../../src/domain/email-insight.js";
import { createEmailMetadata } from "../../../src/domain/email-metadata.js";
import {
  handleAgentEndpoint,
  type AgentEndpointDependencies
} from "../../../src/handlers/agent-endpoint.js";
import {
  handleDraftReplyEndpoint,
  type DraftReplyEndpointDependencies
} from "../../../src/handlers/draft-reply-endpoint.js";
import {
  handleNarrativeEndpoint,
  type NarrativeEndpointDependencies
} from "../../../src/handlers/narrative-endpoint.js";
import {
  fetchUnreadEmails,
  type GmailMessagesApi
} from "../../../src/services/gmail/fetch-unread-emails.js";

type DraftReplyGmailContextClient = ReturnType<
  DraftReplyEndpointDependencies["createGmailReplyContextApi"]
>;

const DEFAULT_INSIGHT: EmailInsight = {
  summary: "A routine quarterly update.",
  category: "business",
  urgency: "fyi",
  action: null
};

function createDependencies(gmailClient: GmailMessagesApi): AgentEndpointDependencies {
  return {
    createAuthClient: () => ({ id: "auth-client" }) as unknown as Auth.OAuth2Client,
    createGmailMessagesApi: () => gmailClient,
    fetchUnreadEmails,
    extractEmailInsight: () => Promise.resolve(DEFAULT_INSIGHT),
    model: "anthropic:test-model",
    createMessageId: () => crypto.randomUUID()
  };
}

function createDraftReplyDependencies(
  gmailClient: DraftReplyGmailContextClient
): DraftReplyEndpointDependencies {
  const targetEmail = createEmailMetadata({
    id: "target-email",
    threadId: "thread-reply-1",
    subject: "Re: Planning",
    from: "manager@example.com",
    to: "you@example.com",
    date: "Sat, 14 Feb 2026 13:30:00 +0000",
    snippet: "Need your update",
    bodyText: "Can you send your update by tomorrow morning?"
  });

  return {
    createAuthClient: () => ({ id: "auth-client" }) as unknown as Auth.OAuth2Client,
    createGmailReplyContextApi: () => gmailClient,
    createGmailDraftsApi: () => ({
      create: () =>
        Promise.resolve({
          data: {
            id: "draft-id",
            message: {
              threadId: "thread-reply-1"
            }
          }
        })
    }),
    fetchReplyContext: () =>
      Promise.resolve({
        email: targetEmail,
        threadId: "thread-reply-1",
        contextMessages: [targetEmail],
        contextMessageCount: 1,
        contextDegraded: true,
        replyHeaders: {
          inReplyTo: "<target-email@example.com>",
          references: "<ancestor@example.com> <target-email@example.com>"
        }
      }),
    extractDraftReply: () =>
      Promise.resolve({
        draftText: "Thanks for the update request. I will send the status by tomorrow morning.",
        riskFlags: ["missing_context"]
      }),
    createReplyDraft: () =>
      Promise.resolve({
        id: "gmail-draft-1",
        threadId: "thread-reply-1"
      }),
    model: "anthropic:test-model",
    createMessageId: () => crypto.randomUUID()
  } as unknown as DraftReplyEndpointDependencies;
}

function createNarrativeDependencies(
  overrides: Partial<NarrativeEndpointDependencies> = {}
): NarrativeEndpointDependencies {
  const defaults: NarrativeEndpointDependencies = {
    createAuthClient: () => ({ token: "auth-token" }) as unknown as Auth.OAuth2Client,
    createGmailMessagesApi: (_authClient: Auth.OAuth2Client) => {
      void _authClient;
      return {
        list: () =>
          Promise.resolve({
            data: {
              messages: []
            }
          }),
        get: () =>
          Promise.resolve({
            data: createMessage("narrative-default", "thread-narrative-default")
          })
      } as unknown as ReturnType<NarrativeEndpointDependencies["createGmailMessagesApi"]>;
    },
    fetchUnreadEmails,
    extractEmailInsight: () => Promise.resolve(DEFAULT_INSIGHT),
    model: "anthropic:test-model",
    createMessageId: () => crypto.randomUUID()
  };

  return { ...defaults, ...overrides };
}

function createInsightSequence(
  results: Array<EmailInsight | Error>
): NarrativeEndpointDependencies["extractEmailInsight"] {
  let index = 0;

  return () => {
    const result = results[index] ?? DEFAULT_INSIGHT;
    index += 1;

    if (result instanceof Error) {
      return Promise.reject(result);
    }

    return Promise.resolve(result);
  };
}

async function runAgentRequest(dependencies: AgentEndpointDependencies): Promise<void> {
  const request = new Request("http://localhost:3001/agent", {
    method: "POST"
  });

  const response = await handleAgentEndpoint(request, dependencies);
  await response.text();
}

async function runDraftReplyRequest(
  dependencies: DraftReplyEndpointDependencies,
  body: string
): Promise<void> {
  const request = new Request("http://localhost:3001/draft-reply", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body
  });

  const response = await handleDraftReplyEndpoint(request, dependencies);
  await response.text();
}

async function runNarrativeRequest(
  dependencies: NarrativeEndpointDependencies,
  body: string,
  options: { signal?: AbortSignal } = {}
): Promise<void> {
  const requestInit: RequestInit = {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body,
    ...(options.signal ? { signal: options.signal } : {})
  };

  const response = await handleNarrativeEndpoint(
    new Request("http://localhost:3001/narrative", requestInit),
    dependencies
  );

  await response.text();
}

function createMessage(id: string, threadId: string) {
  return {
    id,
    threadId,
    snippet: `Snippet ${id}`,
    payload: {
      headers: [
        { name: "Subject", value: `Subject ${id}` },
        { name: "From", value: "sender@example.com" },
        { name: "To", value: "recipient@example.com" },
        { name: "Date", value: new Date().toUTCString() }
      ],
      body: {
        data: toBase64Url(`Body ${id}`)
      }
    }
  };
}

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

export {
  createDependencies,
  createDraftReplyDependencies,
  createInsightSequence,
  createNarrativeDependencies,
  createMessage,
  runAgentRequest,
  runDraftReplyRequest,
  runNarrativeRequest
};
