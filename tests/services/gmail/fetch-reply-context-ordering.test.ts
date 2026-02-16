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

describe("fetchReplyContext ordering", () => {
  it("falls back to stable ordering when message dates are unparsable", async () => {
    const gmailClient: GmailReplyContextApi = {
      getMessage: () =>
        Promise.resolve({
          data: createMessage("target-email", "thread-1", "Sat, 14 Feb 2026 10:00:00 +0000")
        }),
      getThread: () =>
        Promise.resolve({
          data: {
            messages: [
              createMessage("target-email", "thread-1", "Sat, 14 Feb 2026 10:00:00 +0000"),
              createMessage("thread-1", "thread-1", "Mon, 15 Feb 2026 09:00:00 +0000"),
              createMessage("thread-2", "thread-1", "Tue, 16 Feb 2026 09:00:00 +0000"),
              createMessage("thread-3", "thread-1", "not-a-date")
            ]
          }
        })
    };

    const context = await fetchReplyContext(gmailClient, {
      emailId: "target-email",
      maxContextMessages: 2
    });

    expect(context.contextDegraded).toBe(false);
    expect(context.contextMessageCount).toBe(2);
    expect(context.contextMessages.map((message) => message.id)).toEqual([
      "target-email",
      "thread-3"
    ]);
  });
});
