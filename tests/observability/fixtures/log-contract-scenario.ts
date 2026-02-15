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
  category: "business"
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

  await runAgentRequest("run-success", "thread-success", dependencies);
}

async function runFailureScenario(): Promise<void> {
  const dependencies = createDependencies({
    list: () => Promise.reject(new Error("Gmail unavailable")),
    get: () => Promise.reject(new Error("Unreachable get in failure scenario"))
  });

  await runAgentRequest("run-failure", "thread-failure", dependencies);
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

async function runAgentRequest(
  runId: string,
  threadId: string,
  dependencies: AgentEndpointDependencies
): Promise<void> {
  const request = new Request("http://localhost:3001/agent", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(createRunInput(runId, threadId))
  });

  const response = await handleAgentEndpoint(request, dependencies);
  await response.text();
}

function createRunInput(runId: string, threadId: string) {
  return {
    threadId,
    runId,
    state: {},
    messages: [
      {
        id: `message-${runId}`,
        role: "user",
        content: "Summarize unread emails"
      }
    ],
    tools: [],
    context: [],
    forwardedProps: {}
  };
}

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}
