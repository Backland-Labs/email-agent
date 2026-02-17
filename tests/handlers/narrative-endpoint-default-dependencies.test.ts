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
                    { name: "Date", value: new Date().toUTCString() }
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
  createAuthClient: vi.fn(() => ({}) as unknown as Auth.OAuth2Client)
}));

vi.mock("../../src/services/gmail/fetch-unread-emails.js", () => ({
  fetchUnreadEmails: vi.fn(() => Promise.resolve([]))
}));

vi.mock("../../src/services/ai/extract-email-insight.js", () => ({
  extractEmailInsight: vi.fn(() =>
    Promise.resolve({
      summary: "A routine message.",
      category: "business",
      urgency: "fyi",
      action: null
    })
  )
}));

import { google } from "googleapis";
import type { Auth } from "googleapis";

import { createEmailMetadata } from "../../src/domain/email-metadata.js";
import { handleNarrativeEndpoint } from "../../src/handlers/narrative-endpoint.js";
import { createAuthClient } from "../../src/services/gmail/create-auth-client.js";
import { extractEmailInsight } from "../../src/services/ai/extract-email-insight.js";
import { fetchUnreadEmails } from "../../src/services/gmail/fetch-unread-emails.js";
import { createNarrativeEndpointDefaultDependencies } from "../../src/handlers/narrative-endpoint-default-dependencies.js";

describe("handleNarrativeEndpoint with default dependencies", () => {
  beforeEach(() => {
    vi.mocked(createAuthClient).mockClear();
    vi.mocked(fetchUnreadEmails).mockClear();
    vi.mocked(extractEmailInsight).mockClear();
    vi.mocked(google.gmail).mockClear();
    delete process.env.ANTHROPIC_MODEL;
  });

  it("uses default model when ANTHROPIC_MODEL is not set", async () => {
    const email = createEmailMetadata({
      id: "message-id",
      threadId: "thread-id",
      subject: "Default model",
      from: "sender@example.com",
      to: "you@example.com",
      date: new Date().toUTCString(),
      snippet: "Default",
      bodyText: "Body"
    });

    vi.mocked(fetchUnreadEmails).mockImplementation(() => Promise.resolve([email]));

    const response = await handleNarrativeEndpoint(
      new Request("http://localhost:3001/narrative", {
        method: "POST"
      })
    );

    const body = await response.text();

    expect(vi.mocked(extractEmailInsight)).toHaveBeenCalledWith("claude-sonnet-4-20250514", email);
    expect(body).toContain("# 48h Inbox Narrative");
  });

  it("uses env model and wires Gmail list/get through fetchUnreadEmails", async () => {
    process.env.ANTHROPIC_MODEL = "custom-model";

    vi.mocked(fetchUnreadEmails).mockImplementation(async (gmailClient) => {
      await gmailClient.list({
        userId: "me",
        q: "is:unread after:1 before:2",
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

    const response = await handleNarrativeEndpoint(
      new Request("http://localhost:3001/narrative", {
        method: "POST"
      })
    );

    const body = await response.text();

    expect(vi.mocked(createAuthClient)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(google.gmail)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetchUnreadEmails)).toHaveBeenCalledTimes(1);
    const query = vi.mocked(fetchUnreadEmails).mock.calls[0]?.[1]?.query;

    expect(typeof query).toBe("string");
    expect(query).toMatch(/^is:unread after:\d+ before:\d+$/u);
    expect(body).toContain('"type":"RUN_FINISHED"');
  });

  it("reuses Gmail client wrapper for object auth inputs", () => {
    const dependencies = createNarrativeEndpointDefaultDependencies();

    dependencies.createGmailMessagesApi({} as unknown as Auth.OAuth2Client);

    expect(vi.mocked(google.gmail)).toHaveBeenCalledTimes(1);
  });

  it("creates uncached Gmail client for non-object auth input", () => {
    const dependencies = createNarrativeEndpointDefaultDependencies();

    dependencies.createGmailMessagesApi(null as unknown as Auth.OAuth2Client);

    expect(vi.mocked(google.gmail)).toHaveBeenCalledWith({
      version: "v1",
      auth: null
    });
  });

  it("creates new Gmail client when object auth input changes", () => {
    const dependencies = createNarrativeEndpointDefaultDependencies();

    dependencies.createGmailMessagesApi({} as unknown as Auth.OAuth2Client);
    dependencies.createGmailMessagesApi({} as unknown as Auth.OAuth2Client);

    expect(vi.mocked(google.gmail)).toHaveBeenCalledTimes(2);
  });

  it("reuses cached Gmail client for repeated same auth object", () => {
    const dependencies = createNarrativeEndpointDefaultDependencies();
    const authClient = {} as Auth.OAuth2Client;

    dependencies.createGmailMessagesApi(authClient);
    dependencies.createGmailMessagesApi(authClient);

    expect(vi.mocked(google.gmail)).toHaveBeenCalledTimes(1);
  });
});
