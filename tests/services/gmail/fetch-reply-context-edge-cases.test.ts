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
        { name: "Date", value: "Sat, 14 Feb 2026 10:00:00 +0000" }
      ],
      body: {
        data: toBase64Url(`Body ${id}`)
      }
    }
  };
}

describe("fetchReplyContext edge cases", () => {
  it("deduplicates repeated thread messages by message ID", async () => {
    const gmailClient: GmailReplyContextApi = {
      getMessage: () =>
        Promise.resolve({
          data: createMessage("target-email", "thread-1")
        }),
      getThread: () =>
        Promise.resolve({
          data: {
            messages: [
              createMessage("dup-id", "thread-1"),
              createMessage("dup-id", "thread-1"),
              createMessage("target-email", "thread-1")
            ]
          }
        })
    };

    const context = await fetchReplyContext(gmailClient, {
      emailId: "target-email"
    });

    expect(context.contextMessages.map((message) => message.id)).toEqual([
      "dup-id",
      "target-email"
    ]);
  });

  it("ignores thread entries without a message ID", async () => {
    const gmailClient: GmailReplyContextApi = {
      getMessage: () =>
        Promise.resolve({
          data: createMessage("target-email", "thread-1")
        }),
      getThread: () =>
        Promise.resolve({
          data: {
            messages: [null, {}, createMessage("target-email", "thread-1")] as unknown as []
          }
        })
    };

    const context = await fetchReplyContext(gmailClient, {
      emailId: "target-email"
    });

    expect(context.contextMessages.map((message) => message.id)).toEqual(["target-email"]);
  });

  it("returns only target when maxContextMessages is one", async () => {
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
              createMessage("thread-3", "thread-1")
            ]
          }
        })
    };

    const context = await fetchReplyContext(gmailClient, {
      emailId: "target-email",
      maxContextMessages: 1
    });

    expect(context.contextMessages.map((message) => message.id)).toEqual(["target-email"]);
  });
});
