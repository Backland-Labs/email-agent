import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("googleapis", () => ({
  google: {
    gmail: vi.fn(() => ({
      users: {
        messages: {
          get: vi.fn(() => Promise.resolve({ data: { id: "message-id", threadId: "thread-id" } }))
        },
        threads: {
          get: vi.fn(() => Promise.resolve({ data: { messages: [] } }))
        },
        drafts: {
          create: vi.fn(() =>
            Promise.resolve({
              data: {
                id: "draft-id",
                message: {
                  threadId: "thread-id"
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

vi.mock("../../src/services/gmail/fetch-reply-context.js", () => ({
  fetchReplyContext: vi.fn(() =>
    Promise.resolve({
      email: {
        id: "target-email",
        threadId: "thread-id",
        subject: "Re: Planning",
        from: "manager@example.com",
        to: "you@example.com",
        date: "Sat, 14 Feb 2026 14:00:00 +0000",
        snippet: "Need update",
        bodyText: "Can you reply with your status update?"
      },
      threadId: "thread-id",
      contextMessages: [
        {
          id: "target-email",
          threadId: "thread-id",
          subject: "Re: Planning",
          from: "manager@example.com",
          to: "you@example.com",
          date: "Sat, 14 Feb 2026 14:00:00 +0000",
          snippet: "Need update",
          bodyText: "Can you reply with your status update?"
        }
      ],
      contextMessageCount: 1,
      contextDegraded: false,
      replyHeaders: {
        inReplyTo: "<target-email@example.com>",
        references: "<ancestor@example.com> <target-email@example.com>"
      }
    })
  )
}));

vi.mock("../../src/services/gmail/create-reply-draft.js", () => ({
  createReplyDraft: vi.fn(() =>
    Promise.resolve({
      id: "gmail-draft-1",
      threadId: "thread-id"
    })
  )
}));

vi.mock("../../src/services/ai/extract-draft-reply.js", () => ({
  extractDraftReply: vi.fn(() =>
    Promise.resolve({
      draftText: "Thanks for the note. I will send the update tomorrow.",
      riskFlags: []
    })
  )
}));

import { google } from "googleapis";

import { createEmailMetadata } from "../../src/domain/email-metadata.js";
import { handleDraftReplyEndpoint } from "../../src/handlers/draft-reply-endpoint.js";
import { extractDraftReply } from "../../src/services/ai/extract-draft-reply.js";
import { createAuthClient } from "../../src/services/gmail/create-auth-client.js";
import { createReplyDraft } from "../../src/services/gmail/create-reply-draft.js";
import { fetchReplyContext } from "../../src/services/gmail/fetch-reply-context.js";

function createReplyContext() {
  const email = createEmailMetadata({
    id: "target-email",
    threadId: "thread-id",
    subject: "Re: Planning",
    from: "manager@example.com",
    to: "you@example.com",
    date: "Sat, 14 Feb 2026 14:00:00 +0000",
    snippet: "Need update",
    bodyText: "Can you reply with your status update?"
  });

  return {
    email,
    threadId: "thread-id",
    contextMessages: [email],
    contextMessageCount: 1,
    contextDegraded: false,
    replyHeaders: {
      inReplyTo: "<target-email@example.com>",
      references: "<ancestor@example.com> <target-email@example.com>"
    }
  };
}

describe("handleDraftReplyEndpoint with default dependencies", () => {
  beforeEach(() => {
    vi.mocked(createAuthClient).mockClear();
    vi.mocked(fetchReplyContext).mockClear();
    vi.mocked(createReplyDraft).mockClear();
    vi.mocked(extractDraftReply).mockClear();
    vi.mocked(google.gmail).mockClear();
    delete process.env.ANTHROPIC_MODEL;
  });

  it("uses default model when ANTHROPIC_MODEL is not set", async () => {
    vi.mocked(fetchReplyContext).mockImplementation(() => Promise.resolve(createReplyContext()));

    const response = await handleDraftReplyEndpoint(
      new Request("http://localhost:3001/draft-reply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          emailId: "target-email"
        })
      })
    );

    const body = await response.text();

    expect(vi.mocked(extractDraftReply)).toHaveBeenCalledWith(
      "claude-sonnet-4-20250514",
      expect.objectContaining({
        contextDegraded: false
      })
    );
    expect(vi.mocked(createReplyDraft)).toHaveBeenCalledTimes(1);
    expect(body).toContain('"type":"RUN_FINISHED"');
  });

  it("uses env model and wires Gmail get methods through fetchReplyContext", async () => {
    process.env.ANTHROPIC_MODEL = "custom-model";

    vi.mocked(fetchReplyContext).mockImplementation(async (gmailClient) => {
      await gmailClient.getMessage({
        userId: "me",
        id: "target-email",
        format: "full"
      });

      await gmailClient.getThread({
        userId: "me",
        id: "thread-id",
        format: "full"
      });

      return createReplyContext();
    });

    vi.mocked(createReplyDraft).mockImplementation(async (gmailDraftsApi, input) => {
      await gmailDraftsApi.create({
        userId: "me",
        requestBody: {
          message: {
            threadId: input.threadId,
            raw: "cmF3"
          }
        }
      });

      return {
        id: "gmail-draft-1",
        threadId: input.threadId
      };
    });

    const response = await handleDraftReplyEndpoint(
      new Request("http://localhost:3001/draft-reply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          emailId: "target-email",
          threadId: "thread-id"
        })
      })
    );

    await response.text();

    expect(vi.mocked(createAuthClient)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(google.gmail)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetchReplyContext)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createReplyDraft)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(extractDraftReply)).toHaveBeenCalledWith(
      "custom-model",
      expect.objectContaining({
        contextDegraded: false
      })
    );
  });
});
