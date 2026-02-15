import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("googleapis", () => ({
  google: {
    gmail: vi.fn(() => ({
      users: {
        messages: {
          list: vi.fn(() => Promise.resolve({ data: { messages: [] } })),
          get: vi.fn(() =>
            Promise.resolve({
              data: {
                id: "message-id",
                threadId: "thread-id",
                snippet: "Snippet",
                payload: {
                  headers: [
                    { name: "Subject", value: "Subject" },
                    { name: "From", value: "sender@example.com" },
                    { name: "To", value: "recipient@example.com" },
                    { name: "Date", value: "Sat, 14 Feb 2026 12:05:00 +0000" }
                  ],
                  body: {
                    data: "SGVsbG8"
                  }
                }
              }
            })
          )
        }
      }
    }))
  }
}));

vi.mock("../../src/services/gmail/create-auth-client.js", () => ({
  createAuthClient: vi.fn(() => ({ token: "mock-token" }))
}));

vi.mock("../../src/services/gmail/fetch-unread-emails.js", () => ({
  fetchUnreadEmails: vi.fn(() => Promise.resolve([]))
}));

vi.mock("../../src/services/ai/extract-email-insight.js", () => ({
  extractEmailInsight: vi.fn(() =>
    Promise.resolve({
      priority: "low",
      sentiment: "neutral",
      actionItems: [],
      relationshipContext: "Unknown",
      urgencySignals: []
    })
  )
}));

import { google } from "googleapis";

import { createEmailMetadata } from "../../src/domain/email-metadata.js";
import { handleAgentEndpoint } from "../../src/handlers/agent-endpoint.js";
import { extractEmailInsight } from "../../src/services/ai/extract-email-insight.js";
import { createAuthClient } from "../../src/services/gmail/create-auth-client.js";
import { fetchUnreadEmails } from "../../src/services/gmail/fetch-unread-emails.js";

function createValidRunInput() {
  return {
    threadId: "thread-1",
    runId: "run-1",
    state: {},
    messages: [
      {
        id: "message-user-1",
        role: "user",
        content: "Summarize unread emails"
      }
    ],
    tools: [],
    context: [],
    forwardedProps: {}
  };
}

describe("handleAgentEndpoint with default dependencies", () => {
  beforeEach(() => {
    vi.mocked(createAuthClient).mockClear();
    vi.mocked(fetchUnreadEmails).mockClear();
    vi.mocked(extractEmailInsight).mockClear();
    vi.mocked(google.gmail).mockClear();
    delete process.env.ANTHROPIC_MODEL;
  });

  it("uses default model when ANTHROPIC_MODEL is not set", async () => {
    const email = createEmailMetadata({
      id: "email-default-model",
      threadId: "thread-default-model",
      subject: "Default model",
      from: "sender@example.com",
      to: "recipient@example.com",
      date: "Sat, 14 Feb 2026 12:06:00 +0000",
      snippet: "Default",
      bodyText: "Body"
    });

    vi.mocked(fetchUnreadEmails).mockImplementation(() => Promise.resolve([email]));

    await handleAgentEndpoint(
      new Request("http://localhost:3001/agent", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(createValidRunInput())
      })
    );

    expect(vi.mocked(extractEmailInsight)).toHaveBeenCalledWith("claude-sonnet-4-20250514", email);
  });

  it("uses env model and wires Gmail list/get through fetchUnreadEmails", async () => {
    process.env.ANTHROPIC_MODEL = "custom-model";

    vi.mocked(fetchUnreadEmails).mockImplementation(async (gmailClient) => {
      await gmailClient.list({
        userId: "me",
        q: "is:unread",
        labelIds: ["INBOX"],
        maxResults: 20
      });

      await gmailClient.get({
        userId: "me",
        id: "message-id",
        format: "full"
      });

      return [];
    });

    const response = await handleAgentEndpoint(
      new Request("http://localhost:3001/agent", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(createValidRunInput())
      })
    );

    const body = await response.text();

    expect(vi.mocked(createAuthClient)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(google.gmail)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetchUnreadEmails)).toHaveBeenCalledTimes(1);
    expect(body).toContain("No unread emails found in your inbox");
    expect(body).toContain('"type":"RUN_FINISHED"');
  });
});
