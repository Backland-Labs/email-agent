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
        { name: "Date", value: date }
      ],
      body: {
        data: toBase64Url(`Body ${id}`)
      }
    }
  };
}

const messageIds = {
  target: "17ce8a2b6f3d40a9e",
  duplicate: "17ce8a2b6f3d40a9f",
  contextOne: "17ce8a2b6f3d40aa0",
  contextTwo: "17ce8a2b6f3d40aa1",
  contextThree: "17ce8a2b6f3d40aa2"
} as const;

describe("fetchReplyContext edge cases", () => {
  it("deduplicates repeated thread messages by message ID", async () => {
    const gmailClient: GmailReplyContextApi = {
      getMessage: () =>
        Promise.resolve({
          data: createMessage(messageIds.target, "thread-1")
        }),
      getThread: () =>
        Promise.resolve({
          data: {
            messages: [
              createMessage(messageIds.duplicate, "thread-1"),
              createMessage(messageIds.duplicate, "thread-1"),
              createMessage(messageIds.target, "thread-1")
            ]
          }
        })
    };

    const context = await fetchReplyContext(gmailClient, {
      emailId: messageIds.target
    });

    expect(context.contextMessages.map((message) => message.id)).toEqual([
      messageIds.duplicate,
      messageIds.target
    ]);
  });

  it("ignores thread entries without a message ID", async () => {
    const gmailClient: GmailReplyContextApi = {
      getMessage: () =>
        Promise.resolve({
          data: createMessage(messageIds.target, "thread-1")
        }),
      getThread: () =>
        Promise.resolve({
          data: {
            messages: [null, {}, createMessage(messageIds.target, "thread-1")] as unknown as []
          }
        })
    };

    const context = await fetchReplyContext(gmailClient, {
      emailId: messageIds.target
    });

    expect(context.contextMessages.map((message) => message.id)).toEqual([messageIds.target]);
  });

  it("returns only target when maxContextMessages is one", async () => {
    const gmailClient: GmailReplyContextApi = {
      getMessage: () =>
        Promise.resolve({
          data: createMessage(messageIds.target, "thread-1")
        }),
      getThread: () =>
        Promise.resolve({
          data: {
            messages: [
              createMessage(messageIds.contextOne, "thread-1"),
              createMessage(messageIds.contextTwo, "thread-1"),
              createMessage(messageIds.contextThree, "thread-1")
            ]
          }
        })
    };

    const context = await fetchReplyContext(gmailClient, {
      emailId: messageIds.target,
      maxContextMessages: 1
    });

    expect(context.contextMessages.map((message) => message.id)).toEqual([messageIds.target]);
  });

  it("uses Message-ID as references when References header is missing", async () => {
    const targetMessage = createMessage(messageIds.target, "thread-1");
    targetMessage.payload.headers.push({ name: "Message-ID", value: "<target@example.com>" });

    const gmailClient: GmailReplyContextApi = {
      getMessage: () => Promise.resolve({ data: targetMessage }),
      getThread: () => Promise.resolve({ data: { messages: [targetMessage] } })
    };

    const context = await fetchReplyContext(gmailClient, {
      emailId: messageIds.target
    });

    expect(context.replyHeaders.inReplyTo).toBe("<target@example.com>");
    expect(context.replyHeaders.references).toBe("<target@example.com>");
  });

  it("keeps existing References header when it already contains Message-ID", async () => {
    const targetMessage = createMessage(messageIds.target, "thread-1");
    targetMessage.payload.headers.push({ name: "Message-ID", value: "<target@example.com>" });
    targetMessage.payload.headers.push({
      name: "References",
      value: "<ancestor@example.com> <target@example.com>"
    });

    const gmailClient: GmailReplyContextApi = {
      getMessage: () => Promise.resolve({ data: targetMessage }),
      getThread: () => Promise.resolve({ data: { messages: [targetMessage] } })
    };

    const context = await fetchReplyContext(gmailClient, {
      emailId: messageIds.target
    });

    expect(context.replyHeaders.inReplyTo).toBe("<target@example.com>");
    expect(context.replyHeaders.references).toBe("<ancestor@example.com> <target@example.com>");
  });

  it("handles target messages without payload headers", async () => {
    const gmailClient: GmailReplyContextApi = {
      getMessage: () =>
        Promise.resolve({
          data: {
            id: messageIds.target,
            threadId: "thread-1",
            snippet: "No payload"
          }
        }),
      getThread: () => Promise.resolve({ data: { messages: [] } })
    };

    const context = await fetchReplyContext(gmailClient, {
      emailId: messageIds.target
    });

    expect(context.replyHeaders).toEqual({});
  });

  it("keeps context ordering stable when dates are unparsable", async () => {
    const targetMessage = createMessage(messageIds.target, "thread-1", "not-a-date");
    const contextMessageOne = createMessage(messageIds.contextOne, "thread-1", "still-not-a-date");
    const contextMessageTwo = createMessage(
      messageIds.contextTwo,
      "thread-1",
      "another-unparsable-date"
    );

    const gmailClient: GmailReplyContextApi = {
      getMessage: () => Promise.resolve({ data: targetMessage }),
      getThread: () =>
        Promise.resolve({
          data: { messages: [targetMessage, contextMessageOne, contextMessageTwo] }
        })
    };

    const context = await fetchReplyContext(gmailClient, {
      emailId: messageIds.target,
      maxContextMessages: 2
    });

    expect(context.contextMessages.map((message) => message.id)).toEqual([
      messageIds.target,
      messageIds.contextTwo
    ]);
  });
});
