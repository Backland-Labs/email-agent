import { describe, expect, it } from "vitest";

import {
  fetchReplyContext,
  type GmailReplyContextApi
} from "../../../src/services/gmail/fetch-reply-context.js";

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

function createMessage(id: string, threadId: string, date = "Sat, 14 Feb 2026 10:00:00 +0000") {
  return {
    id,
    threadId,
    snippet: `Snippet ${id}`,
    payload: {
      headers: [
        { name: "Subject", value: `Subject ${id}` },
        { name: "From", value: "sender@example.com" },
        { name: "To", value: "recipient@example.com" },
        { name: "Date", value: date },
        { name: "Message-ID", value: `<${id}@example.com>` },
        { name: "References", value: "<ancestor@example.com>" }
      ],
      body: {
        data: toBase64Url(`Body ${id}`)
      }
    }
  };
}

describe("fetchReplyContext", () => {
  it("fetches target email and thread context", async () => {
    const getMessageCalls: string[] = [];
    const getThreadCalls: string[] = [];

    const gmailClient: GmailReplyContextApi = {
      getMessage: (params) => {
        getMessageCalls.push(params.id);
        return Promise.resolve({
          data: createMessage("target-email", "thread-1")
        });
      },
      getThread: (params) => {
        getThreadCalls.push(params.id);
        return Promise.resolve({
          data: {
            messages: [
              createMessage("thread-1", "thread-1"),
              createMessage("target-email", "thread-1"),
              createMessage("thread-2", "thread-1")
            ]
          }
        });
      }
    };

    const context = await fetchReplyContext(gmailClient, {
      emailId: "target-email"
    });

    expect(getMessageCalls).toEqual(["target-email"]);
    expect(getThreadCalls).toEqual(["thread-1"]);
    expect(context.email.id).toBe("target-email");
    expect(context.threadId).toBe("thread-1");
    expect(context.contextDegraded).toBe(false);
    expect(context.contextMessageCount).toBe(3);
    expect(context.replyHeaders.inReplyTo).toBe("<target-email@example.com>");
    expect(context.replyHeaders.references).toBe(
      "<ancestor@example.com> <target-email@example.com>"
    );
    expect(context.contextMessages.map((message) => message.id)).toEqual([
      "thread-1",
      "target-email",
      "thread-2"
    ]);
  });

  it("uses explicit thread ID when provided", async () => {
    const threadCalls: string[] = [];

    const gmailClient: GmailReplyContextApi = {
      getMessage: () =>
        Promise.resolve({
          data: createMessage("target-email", "thread-from-email")
        }),
      getThread: (params) => {
        threadCalls.push(params.id);
        return Promise.resolve({
          data: {
            messages: [createMessage("target-email", "thread-from-request")]
          }
        });
      }
    };

    const context = await fetchReplyContext(gmailClient, {
      emailId: "target-email",
      threadId: "thread-from-request"
    });

    expect(threadCalls).toEqual(["thread-from-request"]);
    expect(context.threadId).toBe("thread-from-request");
  });

  it("truncates thread context deterministically and keeps target email", async () => {
    const gmailClient: GmailReplyContextApi = {
      getMessage: () =>
        Promise.resolve({
          data: createMessage("target-email", "thread-1")
        }),
      getThread: () =>
        Promise.resolve({
          data: {
            messages: [
              createMessage("target-email", "thread-1"),
              createMessage("thread-2", "thread-1"),
              createMessage("thread-3", "thread-1"),
              createMessage("thread-4", "thread-1"),
              createMessage("thread-5", "thread-1")
            ]
          }
        })
    };

    const context = await fetchReplyContext(gmailClient, {
      emailId: "target-email",
      maxContextMessages: 3
    });

    expect(context.contextMessages.map((message) => message.id)).toEqual([
      "target-email",
      "thread-4",
      "thread-5"
    ]);
    expect(context.contextMessageCount).toBe(3);
  });

  it("keeps chronological ordering when target is outside the recent window", async () => {
    const gmailClient: GmailReplyContextApi = {
      getMessage: () =>
        Promise.resolve({
          data: createMessage("target-email", "thread-1", "Mon, 10 Jan 2026 10:00:00 +0000")
        }),
      getThread: () =>
        Promise.resolve({
          data: {
            messages: [
              createMessage("thread-1", "thread-1", "Wed, 01 Jan 2026 10:00:00 +0000"),
              createMessage("target-email", "thread-1", "Mon, 10 Jan 2026 10:00:00 +0000"),
              createMessage("thread-2", "thread-1", "Sun, 31 Dec 2025 10:00:00 +0000"),
              createMessage("thread-3", "thread-1", "Fri, 09 Jan 2026 10:00:00 +0000"),
              createMessage("thread-4", "thread-1", "Tue, 14 Jan 2026 10:00:00 +0000")
            ]
          }
        })
    };

    const context = await fetchReplyContext(gmailClient, {
      emailId: "target-email",
      maxContextMessages: 3
    });

    expect(context.contextMessages.map((message) => message.id)).toEqual([
      "thread-3",
      "target-email",
      "thread-4"
    ]);
  });

  it("returns recent window when target is already in bounded context", async () => {
    const gmailClient: GmailReplyContextApi = {
      getMessage: () =>
        Promise.resolve({
          data: createMessage("target-email", "thread-1")
        }),
      getThread: () =>
        Promise.resolve({
          data: {
            messages: [
              createMessage("thread-1", "thread-1"),
              createMessage("thread-2", "thread-1"),
              createMessage("target-email", "thread-1"),
              createMessage("thread-4", "thread-1")
            ]
          }
        })
    };

    const context = await fetchReplyContext(gmailClient, {
      emailId: "target-email",
      maxContextMessages: 3
    });

    expect(context.contextMessages.map((message) => message.id)).toEqual([
      "thread-2",
      "target-email",
      "thread-4"
    ]);
  });

  it("includes target email when thread payload does not contain it", async () => {
    const gmailClient: GmailReplyContextApi = {
      getMessage: () =>
        Promise.resolve({
          data: createMessage("target-email", "thread-1")
        }),
      getThread: () =>
        Promise.resolve({
          data: {
            messages: [createMessage("thread-1", "thread-1")]
          }
        })
    };

    const context = await fetchReplyContext(gmailClient, {
      emailId: "target-email"
    });

    expect(context.contextMessages.map((message) => message.id)).toEqual([
      "thread-1",
      "target-email"
    ]);
  });

  it("continues with degraded context when thread fetch fails", async () => {
    const gmailClient: GmailReplyContextApi = {
      getMessage: () =>
        Promise.resolve({
          data: createMessage("target-email", "thread-1")
        }),
      getThread: () => Promise.reject(new Error("Thread lookup failed"))
    };

    const context = await fetchReplyContext(gmailClient, {
      emailId: "target-email"
    });

    expect(context.contextDegraded).toBe(true);
    expect(context.contextMessageCount).toBe(1);
    expect(context.contextMessages[0]?.id).toBe("target-email");
  });

  it("continues with degraded context when target has no thread ID", async () => {
    const threadFetches: number[] = [];

    const gmailClient: GmailReplyContextApi = {
      getMessage: () =>
        Promise.resolve({
          data: createMessage("target-email", "")
        }),
      getThread: () => {
        threadFetches.push(1);
        return Promise.resolve({ data: { messages: [] } });
      }
    };

    const context = await fetchReplyContext(gmailClient, {
      emailId: "target-email"
    });

    expect(threadFetches).toEqual([]);
    expect(context.contextDegraded).toBe(true);
    expect(context.threadId).toBe("");
  });

  it("handles thread responses without messages", async () => {
    const gmailClient: GmailReplyContextApi = {
      getMessage: () =>
        Promise.resolve({
          data: createMessage("target-email", "thread-1")
        }),
      getThread: () => Promise.resolve({ data: {} })
    };

    const context = await fetchReplyContext(gmailClient, {
      emailId: "target-email"
    });

    expect(context.contextDegraded).toBe(false);
    expect(context.contextMessages.map((message) => message.id)).toEqual(["target-email"]);
  });

  it("throws when target message fetch fails", async () => {
    const gmailClient: GmailReplyContextApi = {
      getMessage: () => Promise.reject(new Error("Target message missing")),
      getThread: () => Promise.resolve({ data: { messages: [] } })
    };

    await expect(
      fetchReplyContext(gmailClient, {
        emailId: "target-email"
      })
    ).rejects.toThrow("Target message missing");
  });

  it("throws when maxContextMessages is less than one", async () => {
    const gmailClient: GmailReplyContextApi = {
      getMessage: () =>
        Promise.resolve({
          data: createMessage("target-email", "thread-1")
        }),
      getThread: () => Promise.resolve({ data: { messages: [] } })
    };

    await expect(
      fetchReplyContext(gmailClient, {
        emailId: "target-email",
        maxContextMessages: 0
      })
    ).rejects.toThrow("maxContextMessages must be greater than 0");
  });
});
