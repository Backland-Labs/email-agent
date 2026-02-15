import { describe, expect, it } from "vitest";

import {
  getCommentPartNumber,
  getJsonThreadMessages,
  parseExportFormat,
  splitStringByMaxBytes
} from "../../scripts/append-opencode-thread.js";

describe("append-opencode-thread helpers", () => {
  it("parses export format from args and flags", () => {
    expect(parseExportFormat(undefined, false)).toBe("text");
    expect(parseExportFormat(undefined, true)).toBe("json");
    expect(parseExportFormat("JSON", false)).toBe("json");
    expect(() => parseExportFormat("yaml", false)).toThrowError(/Invalid format/);
    expect(() => parseExportFormat("text", true)).toThrowError(/Conflicting format options/);
  });

  it("splits strings by max byte size", () => {
    const chunks = splitStringByMaxBytes("abcdefghijklmnopqrstuvwxyz", 5);
    expect(chunks.join("")).toBe("abcdefghijklmnopqrstuvwxyz");

    for (const chunk of chunks) {
      expect(Buffer.byteLength(chunk, "utf8")).toBeLessThanOrEqual(5);
    }
  });

  it("builds chunked JSON comments that fit GitHub limits", () => {
    const largeMessage = "x".repeat(95_000);
    const comments = getJsonThreadMessages(
      {
        info: {
          id: "ses_example"
        },
        messages: [
          {
            info: {
              role: "user"
            },
            parts: [
              {
                type: "text",
                text: largeMessage
              }
            ]
          }
        ]
      },
      42,
      "acme/email-agent"
    );

    expect(comments.length).toBeGreaterThan(1);

    comments.forEach((comment, index) => {
      const part = index + 1;

      expect(comment).toContain("<!-- opencode-session-thread -->");
      expect(comment).toContain(
        `<!-- opencode-session-part:${String(part)}/${String(comments.length)} -->`
      );
      expect(Buffer.byteLength(comment, "utf8")).toBeLessThanOrEqual(60_000);
    });
  });

  it("extracts part numbers from existing comments", () => {
    expect(getCommentPartNumber(null)).toBe(Number.MAX_SAFE_INTEGER);
    expect(getCommentPartNumber("<!-- opencode-session-part:2/7 -->")).toBe(2);
    expect(getCommentPartNumber("no part marker")).toBe(Number.MAX_SAFE_INTEGER);
  });
});
