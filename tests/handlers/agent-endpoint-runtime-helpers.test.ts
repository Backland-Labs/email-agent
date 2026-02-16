import { describe, expect, it } from "vitest";

import { toErrorMessage, toRunContext } from "../../src/handlers/agent-endpoint-runtime-helpers.js";

describe("agent endpoint helper functions", () => {
  it("uses generated ids when request has no body", async () => {
    const request = new Request("http://localhost:3001/agent", {
      method: "POST"
    });

    const context = await toRunContext(request, "request-123");

    expect(context).toEqual({
      runId: "run-request-123",
      threadId: "thread-request-123"
    });
  });

  it("falls back to defaults when JSON body is null", async () => {
    const request = new Request("http://localhost:3001/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "null"
    });

    const context = await toRunContext(request, "request-124");

    expect(context).toEqual({
      runId: "run-request-124",
      threadId: "thread-request-124"
    });
  });

  it("resolves provided run context values with trimming", async () => {
    const request = new Request("http://localhost:3001/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId: "  run-custom  ",
        threadId: "  thread-custom  "
      })
    });

    const context = await toRunContext(request, "request-125");

    expect(context).toEqual({
      runId: "run-custom",
      threadId: "thread-custom"
    });
  });

  it("falls back when provided ids are blank", async () => {
    const request = new Request("http://localhost:3001/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId: "   ",
        threadId: "\n"
      })
    });

    const context = await toRunContext(request, "request-126");

    expect(context).toEqual({
      runId: "run-request-126",
      threadId: "thread-request-126"
    });
  });

  it("extracts message text from Error objects", () => {
    expect(toErrorMessage(new Error("Known error"))).toBe("Known error");
    expect(toErrorMessage(123)).toBe("Unknown error");
  });
});
