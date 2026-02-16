import { describe, expect, it } from "vitest";

import {
  DRAFT_REPLY_ERROR_CODES,
  DraftReplyEndpointError,
  assertDraftReplyNotAborted,
  formatDraftReplyContent,
  parseDraftReplyRequestBody,
  resolveDraftReplyRunContext,
  toDraftReplyEndpointError,
  toErrorMessage
} from "../../src/handlers/draft-reply-endpoint-runtime.js";

describe("draft reply endpoint runtime helpers", () => {
  it("parses valid JSON body", async () => {
    const request = new Request("http://localhost:3001/draft-reply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emailId: "validemailid001" })
    });

    const parsed = await parseDraftReplyRequestBody(request);

    expect(parsed.invalidJson).toBe(false);
    expect(parsed.body).toEqual({ emailId: "validemailid001" });
  });

  it("returns empty body when request has no body", async () => {
    const request = new Request("http://localhost:3001/draft-reply", {
      method: "POST"
    });

    const parsed = await parseDraftReplyRequestBody(request);

    expect(parsed.invalidJson).toBe(false);
    expect(parsed.body).toEqual({});
  });

  it("marks invalid JSON body", async () => {
    const request = new Request("http://localhost:3001/draft-reply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{invalid-json"
    });

    const parsed = await parseDraftReplyRequestBody(request);

    expect(parsed.invalidJson).toBe(true);
    expect(parsed.error).toBeInstanceOf(Error);
  });

  it("resolves run context using body values", () => {
    const context = resolveDraftReplyRunContext(
      {
        runId: " run-1 ",
        threadId: "thread-1"
      },
      "request-1"
    );

    expect(context).toEqual({ runId: "run-1", threadId: "thread-1" });
  });

  it("falls back to generated run context for non-object body", () => {
    const context = resolveDraftReplyRunContext(null, "request-2");

    expect(context).toEqual({
      runId: "run-request-2",
      threadId: "thread-request-2"
    });
  });

  it("falls back to generated IDs when body values are empty", () => {
    const context = resolveDraftReplyRunContext(
      {
        runId: "   ",
        threadId: ""
      },
      "request-3"
    );

    expect(context).toEqual({
      runId: "run-request-3",
      threadId: "thread-request-3"
    });
  });

  it("formats draft content with optional subject and risk flags", () => {
    const content = formatDraftReplyContent({
      draftText: "Thanks for the update.",
      subjectSuggestion: "Re: Update",
      riskFlags: ["missing_context"]
    });

    expect(content).toContain("Subject suggestion: Re: Update");
    expect(content).toContain("Risk flags: missing_context");
  });

  it("formats draft content without optional fields", () => {
    const content = formatDraftReplyContent({
      draftText: "Thanks for the update.",
      riskFlags: []
    });

    expect(content).toBe("Thanks for the update.\n");
  });

  it("throws request_aborted for aborted signal", () => {
    const controller = new AbortController();
    controller.abort();

    expect(() => {
      assertDraftReplyNotAborted(controller.signal);
    }).toThrowError(DraftReplyEndpointError);

    try {
      assertDraftReplyNotAborted(controller.signal);
    } catch (error) {
      expect(error).toBeInstanceOf(DraftReplyEndpointError);
      expect((error as DraftReplyEndpointError).code).toBe(DRAFT_REPLY_ERROR_CODES.requestAborted);
    }
  });

  it("does not throw for active signal", () => {
    const controller = new AbortController();
    expect(() => {
      assertDraftReplyNotAborted(controller.signal);
    }).not.toThrow();
  });

  it("returns endpoint error as-is when already wrapped", () => {
    const error = new DraftReplyEndpointError(
      "Already wrapped",
      DRAFT_REPLY_ERROR_CODES.runFailed,
      {
        cause: "x"
      }
    );

    expect(toDraftReplyEndpointError(error)).toBe(error);
  });

  it("wraps standard errors with run_failed code", () => {
    const wrapped = toDraftReplyEndpointError(new Error("Boom"));

    expect(wrapped.code).toBe(DRAFT_REPLY_ERROR_CODES.runFailed);
    expect(wrapped.message).toBe("Boom");
  });

  it("wraps non-Error values with unknown message", () => {
    const wrapped = toDraftReplyEndpointError("boom");

    expect(wrapped.code).toBe(DRAFT_REPLY_ERROR_CODES.runFailed);
    expect(wrapped.message).toBe("Unknown error");
  });

  it("extracts message from errors and unknown values", () => {
    expect(toErrorMessage(new Error("Known"))).toBe("Known");
    expect(toErrorMessage(123)).toBe("Unknown error");
  });
});
