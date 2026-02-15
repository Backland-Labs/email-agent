import { describe, expect, it } from "vitest";

import {
  draftReplyRequestSchema,
  parseDraftReplyRequest
} from "../../src/domain/draft-reply-request.js";

describe("parseDraftReplyRequest", () => {
  it("parses a minimal valid request", () => {
    const result = parseDraftReplyRequest({
      emailId: "email-123"
    });

    expect(result.emailId).toBe("email-123");
    expect(result.runId).toBeUndefined();
    expect(result.threadId).toBeUndefined();
    expect(result.voiceInstructions).toBeUndefined();
  });

  it("parses optional fields when provided", () => {
    const result = parseDraftReplyRequest({
      emailId: "email-456",
      runId: "run-1",
      threadId: "thread-1",
      voiceInstructions: "Keep it short and warm"
    });

    expect(result).toEqual({
      emailId: "email-456",
      runId: "run-1",
      threadId: "thread-1",
      voiceInstructions: "Keep it short and warm"
    });
  });

  it("throws when emailId is missing", () => {
    expect(() => parseDraftReplyRequest({ runId: "run-1" })).toThrow();
  });

  it("throws when emailId is empty after trimming", () => {
    expect(() => parseDraftReplyRequest({ emailId: "   " })).toThrow();
  });

  it("throws when unknown keys are present", () => {
    expect(() =>
      parseDraftReplyRequest({
        emailId: "email-789",
        unknown: true
      })
    ).toThrow();
  });
});

describe("draftReplyRequestSchema", () => {
  it("parses valid request shape", () => {
    const parsed = draftReplyRequestSchema.parse({
      emailId: "email-1",
      voiceInstructions: "Use plain language"
    });

    expect(parsed.emailId).toBe("email-1");
    expect(parsed.voiceInstructions).toBe("Use plain language");
  });

  it("rejects empty optional fields", () => {
    expect(() =>
      draftReplyRequestSchema.parse({
        emailId: "email-1",
        runId: ""
      })
    ).toThrow();
  });
});
