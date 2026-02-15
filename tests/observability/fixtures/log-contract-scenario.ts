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
  fetchUnreadEmails,
  type GmailMessagesApi
} from "../../../src/services/gmail/fetch-unread-emails.js";
import type { GmailReplyContextApi } from "../../../src/services/gmail/fetch-reply-context.js";

const DEFAULT_INSIGHT: EmailInsight = {
  summary: "A routine quarterly update.",
  category: "business",
  urgency: "fyi",
  action: null
};

await runAgentSuccessScenario();
await runAgentFailureScenario();
await runDraftReplySuccessScenario();
await runDraftReplyFailureScenario();

async function runAgentSuccessScenario(): Promise<void> {
  const dependencies = createDependencies({
    list: () =>
      Promise.resolve({
        data: {
          messages: [{ id: "email-1" }]
        }
      }),
    get: () =>
      Promise.resolve({
        data: {
          id: "email-1",
          threadId: "thread-email-1",
          snippet: "Short snippet",
          payload: {
            headers: [
              { name: "Subject", value: "Quarterly update" },
              { name: "From", value: "sender@example.com" },
              { name: "To", value: "recipient@example.com" },
              { name: "Date", value: "Sat, 14 Feb 2026 13:00:00 +0000" }
            ],
            body: {
              data: toBase64Url("Email body content")
            }
          }
        }
      })
  });

  await runAgentRequest(dependencies);
}

async function runAgentFailureScenario(): Promise<void> {
  const dependencies = createDependencies({
    list: () => Promise.reject(new Error("Gmail unavailable")),
    get: () => Promise.reject(new Error("Unreachable get in failure scenario"))
  });

  await runAgentRequest(dependencies);
}

async function runDraftReplySuccessScenario(): Promise<void> {
  const dependencies = createDraftReplyDependencies({
    getMessage: () => Promise.resolve({ data: createMessage("target-email", "thread-reply-1") }),
    getThread: () =>
      Promise.resolve({
        data: {
          messages: [createMessage("target-email", "thread-reply-1")]
        }
      })
  });

  await runDraftReplyRequest(
    dependencies,
    JSON.stringify({
      emailId: "target-email",
      runId: "run-draft-success",
      threadId: "thread-draft-success"
    })
  );
}

async function runDraftReplyFailureScenario(): Promise<void> {
  const dependencies = createDraftReplyDependencies({
    getMessage: () => Promise.resolve({ data: createMessage("target-email", "thread-reply-1") }),
    getThread: () => Promise.resolve({ data: { messages: [] } })
  });

  await runDraftReplyRequest(dependencies, "{malformed-json");
}

function createDependencies(gmailClient: GmailMessagesApi): AgentEndpointDependencies {
  return {
    createAuthClient: () => ({ id: "auth-client" }),
    createGmailMessagesApi: () => gmailClient,
    fetchUnreadEmails,
    extractEmailInsight: () => Promise.resolve(DEFAULT_INSIGHT),
    model: "anthropic:test-model",
    createMessageId: () => "message-1"
  };
}

async function runAgentRequest(dependencies: AgentEndpointDependencies): Promise<void> {
  const request = new Request("http://localhost:3001/agent", {
    method: "POST"
  });

  const response = await handleAgentEndpoint(request, dependencies);
  await response.text();
}

function createDraftReplyDependencies(
  gmailClient: GmailReplyContextApi
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
    createAuthClient: () => ({ id: "auth-client" }),
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
    createMessageId: () => "draft-message-1"
  };
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
        { name: "Date", value: "Sat, 14 Feb 2026 13:00:00 +0000" }
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
