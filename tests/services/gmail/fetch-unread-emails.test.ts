import { describe, expect, it } from "vitest";

import {
  fetchUnreadEmails,
  type GmailMessagesApi
} from "../../../src/services/gmail/fetch-unread-emails.js";

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

const messageIds = {
  one: "17ce8a2b6f3d40a9e",
  two: "17ce8a2b6f3d40a9f",
  three: "17ce8a2b6f3d40aa0",
  four: "17ce8a2b6f3d40aa1",
  five: "17ce8a2b6f3d40aa2",
  valid: "validid01",
  unused: "unusedmessageid"
} as const;

function createMessage(id: string) {
  return {
    id,
    threadId: `thread-${id}`,
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

describe("fetchUnreadEmails", () => {
  it("orchestrates list + get calls and returns parsed metadata", async () => {
    const listCalls: Array<{
      userId?: string;
      q?: string;
      labelIds?: string[];
      maxResults?: number;
    }> = [];
    const getCalls: Array<{ userId?: string; id?: string; format?: string }> = [];

    const gmailClient: GmailMessagesApi = {
      list: (params) => {
        listCalls.push(params);
        return Promise.resolve({
          data: {
            messages: [{ id: messageIds.one }, { id: messageIds.two }]
          }
        });
      },
      get: (params) => {
        getCalls.push(params);
        return Promise.resolve({ data: createMessage(params.id) });
      }
    };

    const result = await fetchUnreadEmails(gmailClient);

    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe(messageIds.one);
    expect(result[1]?.id).toBe(messageIds.two);
    expect(listCalls).toHaveLength(1);
    expect(getCalls).toHaveLength(2);
  });

  it("returns empty array when inbox has no unread messages", async () => {
    let getCallCount = 0;

    const gmailClient: GmailMessagesApi = {
      list: () =>
        Promise.resolve({
          data: {
            messages: []
          }
        }),
      get: () => {
        getCallCount += 1;
        return Promise.resolve({ data: createMessage(messageIds.unused) });
      }
    };

    const result = await fetchUnreadEmails(gmailClient);

    expect(result).toEqual([]);
    expect(getCallCount).toBe(0);
  });

  it("respects concurrency limit when fetching message details", async () => {
    let activeRequests = 0;
    let maxActiveRequests = 0;

    const gmailClient: GmailMessagesApi = {
      list: () =>
        Promise.resolve({
          data: {
            messages: [
              { id: messageIds.one },
              { id: messageIds.two },
              { id: messageIds.three },
              { id: messageIds.four },
              { id: messageIds.five }
            ]
          }
        }),
      get: async (params) => {
        activeRequests += 1;
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests);

        await new Promise((resolve) => {
          setTimeout(resolve, 10);
        });

        activeRequests -= 1;

        return {
          data: createMessage(params.id)
        };
      }
    };

    await fetchUnreadEmails(gmailClient, { concurrency: 2 });

    expect(maxActiveRequests).toBeLessThanOrEqual(2);
  });

  it("uses expected query parameters", async () => {
    const listCalls: Array<{
      userId?: string;
      q?: string;
      labelIds?: string[];
      maxResults?: number;
    }> = [];

    const gmailClient: GmailMessagesApi = {
      list: (params) => {
        listCalls.push(params);
        return Promise.resolve({
          data: {
            messages: []
          }
        });
      },
      get: () => Promise.resolve({ data: createMessage(messageIds.unused) })
    };

    await fetchUnreadEmails(gmailClient);

    expect(listCalls[0]).toEqual({
      userId: "me",
      q: "is:unread",
      labelIds: ["INBOX"],
      maxResults: 20
    });
  });

  it("ignores list results that do not include message IDs", async () => {
    const gmailClient: GmailMessagesApi = {
      list: () =>
        Promise.resolve({
          data: {
            messages: [{ id: null }, {}, { id: messageIds.valid }]
          }
        }),
      get: (params) => Promise.resolve({ data: createMessage(params.id) })
    };

    const result = await fetchUnreadEmails(gmailClient);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(messageIds.valid);
  });

  it("returns empty array when list response has undefined messages", async () => {
    const gmailClient: GmailMessagesApi = {
      list: () => Promise.resolve({ data: {} }),
      get: () => Promise.resolve({ data: createMessage(messageIds.unused) })
    };

    const result = await fetchUnreadEmails(gmailClient);

    expect(result).toEqual([]);
  });

  it("rethrows list failures", async () => {
    const gmailClient: GmailMessagesApi = {
      list: () => Promise.reject(new Error("List failed")),
      get: () => Promise.resolve({ data: createMessage(messageIds.unused) })
    };

    await expect(fetchUnreadEmails(gmailClient)).rejects.toThrow("List failed");
  });

  it("rethrows message fetch failures", async () => {
    const gmailClient: GmailMessagesApi = {
      list: () =>
        Promise.resolve({
          data: {
            messages: [{ id: messageIds.one }]
          }
        }),
      get: () => Promise.reject(new Error("Get failed"))
    };

    await expect(fetchUnreadEmails(gmailClient)).rejects.toThrow("Get failed");
  });
});
