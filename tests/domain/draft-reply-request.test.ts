import { describe, expect, it } from "vitest";

import {
  draftReplyRequestSchema,
  parseDraftReplyRequest
} from "../../src/domain/draft-reply-request.js";

describe("parseDraftReplyRequest", () => {
  it("parses a minimal valid request", () => {
    const result = parseDraftReplyRequest({
      emailId: "valid123email456"
    });

    expect(result.emailId).toBe("valid123email456");
    expect(result.runId).toBeUndefined();
    expect(result.threadId).toBeUndefined();
    expect(result.voiceInstructions).toBeUndefined();
  });

  it("parses optional fields when provided", () => {
    const result = parseDraftReplyRequest({
      emailId: "valid456email789",
      runId: "run-1",
      threadId: "thread-1",
      voiceInstructions: "Keep it short and warm"
    });

    expect(result).toEqual({
      emailId: "valid456email789",
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

  it("throws when emailId is an invalid placeholder (test-email)", () => {
    expect(() => parseDraftReplyRequest({ emailId: "test-email" })).toThrow(
      "Invalid emailId format"
    );
  });

  it("throws when emailId is too short", () => {
    expect(() => parseDraftReplyRequest({ emailId: "short" })).toThrow("Invalid emailId format");
  });

  it("throws when unknown keys are present", () => {
    expect(() =>
      parseDraftReplyRequest({
        emailId: "valid789emailabc",
        unknown: true
      })
    ).toThrow();
  });
});

describe("draftReplyRequestSchema", () => {
  it("parses valid request shape", () => {
    const parsed = draftReplyRequestSchema.parse({
      emailId: "validemailid001",
      voiceInstructions: "Use plain language"
    });

    expect(parsed.emailId).toBe("validemailid001");
    expect(parsed.voiceInstructions).toBe("Use plain language");
  });

  it("rejects empty optional fields", () => {
    expect(() =>
      draftReplyRequestSchema.parse({
        emailId: "validemailid001",
        runId: ""
      })
    ).toThrow();
  });
});
