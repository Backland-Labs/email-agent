import type { EmailInsight } from "../../../src/domain/email-insight.js";
import {
  handleAgentEndpoint,
  type AgentEndpointDependencies
} from "../../../src/handlers/agent-endpoint.js";
import {
  fetchUnreadEmails,
  type GmailMessagesApi
} from "../../../src/services/gmail/fetch-unread-emails.js";

const DEFAULT_INSIGHT: EmailInsight = {
  summary: "A routine quarterly update.",
  category: "business",
  urgency: "fyi",
  action: null
};

await runSuccessScenario();
await runFailureScenario();

async function runSuccessScenario(): Promise<void> {
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

async function runFailureScenario(): Promise<void> {
  const dependencies = createDependencies({
    list: () => Promise.reject(new Error("Gmail unavailable")),
    get: () => Promise.reject(new Error("Unreachable get in failure scenario"))
  });

  await runAgentRequest(dependencies);
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

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}
