import { describe, expect, it, vi } from "vitest";

import {
  createReplyDraft,
  type GmailDraftsApi
} from "../../../src/services/gmail/create-reply-draft.js";

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const missingPadding = base64.length % 4;
  const paddedValue = missingPadding === 0 ? base64 : `${base64}${"=".repeat(4 - missingPadding)}`;

  return Buffer.from(paddedValue, "base64").toString("utf8");
}

describe("createReplyDraft", () => {
  it("creates a Gmail draft with raw RFC 2822 content", async () => {
    const create = vi.fn((params: unknown) => {
      void params;

      return Promise.resolve({
        data: {
          id: "draft-1",
          message: {
            threadId: "thread-1"
          }
        }
      });
    });
    const gmailDraftsApi: GmailDraftsApi = { create };

    const result = await createReplyDraft(gmailDraftsApi, {
      threadId: "thread-1",
      to: "sender@example.com",
      subject: "Quarterly planning",
      bodyText: "Thanks for the update. I will follow up tomorrow."
    });

    expect(result).toEqual({
      id: "draft-1",
      threadId: "thread-1"
    });
    expect(create).toHaveBeenCalledTimes(1);

    const firstCall = create.mock.calls.at(0);

    if (!firstCall) {
      throw new Error("Missing drafts.create call");
    }

    const params = firstCall[0] as {
      userId: string;
      requestBody: {
        message: {
          threadId: string;
          raw: string;
        };
      };
    };

    expect(params.userId).toBe("me");
    expect(params.requestBody.message.threadId).toBe("thread-1");
    const decodedRaw = decodeBase64Url(params.requestBody.message.raw);

    expect(decodedRaw).toContain("To: sender@example.com");
    expect(decodedRaw).toContain("Subject: Re: Quarterly planning");
    expect(decodedRaw).toContain("Thanks for the update. I will follow up tomorrow.");
  });

  it("does not double-prefix subject when it already starts with Re:", async () => {
    const create = vi.fn((params: unknown) => {
      void params;

      return Promise.resolve({
        data: {
          id: "draft-2"
        }
      });
    });
    const gmailDraftsApi: GmailDraftsApi = { create };

    await createReplyDraft(gmailDraftsApi, {
      threadId: "thread-2",
      to: "sender@example.com",
      subject: "Re: Quarterly planning",
      bodyText: "Reply body"
    });

    const firstCall = create.mock.calls.at(0);

    if (!firstCall) {
      throw new Error("Missing drafts.create call");
    }

    const decodedRaw = decodeBase64Url(
      (firstCall[0] as { requestBody: { message: { raw: string } } }).requestBody.message.raw
    );

    expect(decodedRaw).toContain("Subject: Re: Quarterly planning");
    expect(decodedRaw).not.toContain("Subject: Re: Re: Quarterly planning");
  });

  it("includes In-Reply-To and References headers when provided", async () => {
    const create = vi.fn((params: unknown) => {
      void params;

      return Promise.resolve({
        data: {
          id: "draft-3"
        }
      });
    });
    const gmailDraftsApi: GmailDraftsApi = { create };

    await createReplyDraft(gmailDraftsApi, {
      threadId: "thread-3",
      to: "sender@example.com",
      subject: "Status",
      bodyText: "Here is the status update.",
      inReplyTo: "<target@example.com>",
      references: "<older@example.com> <target@example.com>"
    });

    const firstCall = create.mock.calls.at(0);

    if (!firstCall) {
      throw new Error("Missing drafts.create call");
    }

    const decodedRaw = decodeBase64Url(
      (firstCall[0] as { requestBody: { message: { raw: string } } }).requestBody.message.raw
    );

    expect(decodedRaw).toContain("In-Reply-To: <target@example.com>");
    expect(decodedRaw).toContain("References: <older@example.com> <target@example.com>");
  });

  it("throws when Gmail response does not include draft id", async () => {
    const gmailDraftsApi: GmailDraftsApi = {
      create: () => Promise.resolve({ data: {} })
    };

    await expect(
      createReplyDraft(gmailDraftsApi, {
        threadId: "thread-4",
        to: "sender@example.com",
        subject: "Subject",
        bodyText: "Body"
      })
    ).rejects.toThrow("Gmail drafts.create response missing draft id");
  });

  it("uses fallback subject when source subject is empty", async () => {
    const create = vi.fn((params: unknown) => {
      void params;

      return Promise.resolve({
        data: {
          id: "draft-4"
        }
      });
    });
    const gmailDraftsApi: GmailDraftsApi = { create };

    await createReplyDraft(gmailDraftsApi, {
      threadId: "thread-4",
      to: "sender@example.com",
      subject: "   ",
      bodyText: "Reply body"
    });

    const firstCall = create.mock.calls.at(0);

    if (!firstCall) {
      throw new Error("Missing drafts.create call");
    }

    const decodedRaw = decodeBase64Url(
      (firstCall[0] as { requestBody: { message: { raw: string } } }).requestBody.message.raw
    );

    expect(decodedRaw).toContain("Subject: Re: (no subject)");
  });

  it("throws when recipient is empty", async () => {
    const gmailDraftsApi: GmailDraftsApi = {
      create: () =>
        Promise.resolve({
          data: {
            id: "draft-5"
          }
        })
    };

    await expect(
      createReplyDraft(gmailDraftsApi, {
        threadId: "thread-5",
        to: "   ",
        subject: "Subject",
        bodyText: "Body"
      })
    ).rejects.toThrow("Reply recipient cannot be empty");
  });

  it("throws when thread ID is empty", async () => {
    const gmailDraftsApi: GmailDraftsApi = {
      create: () =>
        Promise.resolve({
          data: {
            id: "draft-6"
          }
        })
    };

    await expect(
      createReplyDraft(gmailDraftsApi, {
        threadId: "",
        to: "sender@example.com",
        subject: "Subject",
        bodyText: "Body"
      })
    ).rejects.toThrow("Reply threadId cannot be empty");
  });
});
