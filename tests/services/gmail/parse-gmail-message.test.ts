import { describe, expect, it } from "vitest";

import { emailMetadataSchema } from "../../../src/domain/email-metadata.js";
import { parseGmailMessage } from "../../../src/services/gmail/parse-gmail-message.js";

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

describe("parseGmailMessage", () => {
  it("extracts plain text body", () => {
    const message = {
      id: "validmessage001",
      threadId: "thread-1",
      snippet: "Plain text snippet",
      payload: {
        headers: [
          { name: "Subject", value: "Status update" },
          { name: "From", value: "sender@example.com" },
          { name: "To", value: "recipient@example.com" },
          { name: "Date", value: "Sat, 14 Feb 2026 10:00:00 +0000" }
        ],
        body: {
          data: toBase64Url("Hello from plain text")
        }
      }
    };

    const parsed = parseGmailMessage(message);

    expect(parsed.bodyText).toBe("Hello from plain text");
    expect(parsed.subject).toBe("Status update");
  });

  it("prefers text/plain over text/html in multipart messages", () => {
    const message = {
      id: "validmessage002",
      threadId: "thread-2",
      snippet: "Multipart snippet",
      payload: {
        headers: [
          { name: "Subject", value: "Multipart email" },
          { name: "From", value: "sender@example.com" },
          { name: "To", value: "recipient@example.com" },
          { name: "Date", value: "Sat, 14 Feb 2026 10:01:00 +0000" }
        ],
        parts: [
          {
            mimeType: "text/html",
            body: { data: toBase64Url("<p>HTML content</p>") }
          },
          {
            mimeType: "text/plain",
            body: { data: toBase64Url("Plain content") }
          }
        ]
      }
    };

    const parsed = parseGmailMessage(message);

    expect(parsed.bodyText).toBe("Plain content");
  });

  it("falls back to stripped HTML when plain text is unavailable", () => {
    const message = {
      id: "validmessage003",
      threadId: "thread-3",
      snippet: "HTML snippet",
      payload: {
        headers: [
          { name: "Subject", value: "HTML only" },
          { name: "From", value: "sender@example.com" },
          { name: "To", value: "recipient@example.com" },
          { name: "Date", value: "Sat, 14 Feb 2026 10:02:00 +0000" }
        ],
        parts: [
          {
            mimeType: "text/html",
            body: { data: toBase64Url("<div>Hello <strong>team</strong></div>") }
          }
        ]
      }
    };

    const parsed = parseGmailMessage(message);

    expect(parsed.bodyText).toBe("Hello team");
  });

  it("returns empty body when message body is missing", () => {
    const message = {
      id: "validmessage004",
      threadId: "thread-4",
      snippet: "No body snippet",
      payload: {
        headers: [
          { name: "Subject", value: "No body" },
          { name: "From", value: "sender@example.com" },
          { name: "To", value: "recipient@example.com" },
          { name: "Date", value: "Sat, 14 Feb 2026 10:03:00 +0000" }
        ]
      }
    };

    const parsed = parseGmailMessage(message);

    expect(parsed.bodyText).toBe("");
  });

  it("extracts required headers into metadata fields", () => {
    const message = {
      id: "validmessage005",
      threadId: "thread-5",
      snippet: "Header snippet",
      payload: {
        headers: [
          { name: "From", value: "manager@example.com" },
          { name: "To", value: "you@example.com" },
          { name: "Subject", value: "Q1 planning" },
          { name: "Date", value: "Sat, 14 Feb 2026 10:04:00 +0000" }
        ],
        body: {
          data: toBase64Url("Please review planning document")
        }
      }
    };

    const parsed = parseGmailMessage(message);

    expect(parsed.from).toBe("manager@example.com");
    expect(parsed.to).toBe("you@example.com");
    expect(parsed.subject).toBe("Q1 planning");
    expect(parsed.date).toBe("Sat, 14 Feb 2026 10:04:00 +0000");
    expect(emailMetadataSchema.parse(parsed)).toEqual(parsed);
  });

  it("uses fallback values when headers are missing", () => {
    const message = {
      id: "validmessage006",
      threadId: "thread-6",
      snippet: "Missing headers",
      payload: {
        headers: [],
        body: {
          data: toBase64Url("Body with missing headers")
        }
      }
    };

    const parsed = parseGmailMessage(message);

    expect(parsed.subject).toBe("(no subject)");
    expect(parsed.from).toBe("");
    expect(parsed.to).toBe("");
    expect(parsed.date).toBe("");
  });

  it("returns empty body when payload is missing", () => {
    const message = {
      id: "validmessage007",
      threadId: "thread-7",
      snippet: "No payload"
    };

    const parsed = parseGmailMessage(message);

    expect(parsed.bodyText).toBe("");
    expect(parsed.subject).toBe("(no subject)");
  });

  it("defaults missing threadId and snippet to empty strings", () => {
    const message = {
      id: "validmessage008",
      payload: {
        headers: [{ name: "Subject", value: "No thread/snippet" }],
        body: {
          data: toBase64Url("Body")
        }
      }
    };

    const parsed = parseGmailMessage(message);

    expect(parsed.threadId).toBe("");
    expect(parsed.snippet).toBe("");
  });

  it("throws when message id is missing", () => {
    const message = {
      threadId: "thread-9",
      snippet: "Missing id",
      payload: {
        headers: [{ name: "Subject", value: "Missing ID" }],
        body: {
          data: toBase64Url("Body")
        }
      }
    };

    expect(() => parseGmailMessage(message)).toThrow("EmailId cannot be empty");
  });

  it("handles text/plain part without body data", () => {
    const message = {
      id: "validmessage0010",
      threadId: "thread-10",
      snippet: "No plain data",
      payload: {
        headers: [{ name: "Subject", value: "No plain data" }],
        mimeType: "text/plain",
        body: {}
      }
    };

    const parsed = parseGmailMessage(message);

    expect(parsed.bodyText).toBe("");
  });
});
