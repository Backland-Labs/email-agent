import { describe, expect, it } from "vitest";
import type { RunAgentInput } from "@ag-ui/core";

import {
  encodeRunError,
  encodeRunFinished,
  encodeRunStarted,
  encodeTextMessageContent,
  encodeTextMessageEnd,
  encodeTextMessageStart
} from "../../../src/services/streaming/encode-ag-ui-events.js";

function decode(value: Uint8Array): string {
  return new TextDecoder().decode(value);
}

describe("encode AG-UI events", () => {
  it("encodes RUN_STARTED SSE event", () => {
    const encoded = encodeRunStarted({ threadId: "thread-1", runId: "run-1" });
    const content = decode(encoded);

    expect(content).toContain("data:");
    expect(content).toContain('"type":"RUN_STARTED"');
    expect(content).toContain('"threadId":"thread-1"');
    expect(content).toContain('"runId":"run-1"');
  });

  it("encodes RUN_STARTED with optional parentRunId", () => {
    const encoded = encodeRunStarted({
      threadId: "thread-1",
      runId: "run-1",
      parentRunId: "run-0"
    });
    const content = decode(encoded);

    expect(content).toContain('"parentRunId":"run-0"');
  });

  it("encodes RUN_STARTED with optional input", () => {
    const input: RunAgentInput = {
      threadId: "thread-1",
      runId: "run-1",
      state: {},
      messages: [
        {
          id: "message-user-1",
          role: "user",
          content: "Summarize unread emails"
        }
      ],
      tools: [],
      context: [],
      forwardedProps: {}
    };

    const encoded = encodeRunStarted({
      threadId: "thread-1",
      runId: "run-1",
      input
    });
    const content = decode(encoded);

    expect(content).toContain('"input":{');
    expect(content).toContain('"id":"message-user-1"');
  });

  it("encodes TEXT_MESSAGE_START SSE event", () => {
    const encoded = encodeTextMessageStart({ messageId: "message-1" });
    const content = decode(encoded);

    expect(content).toContain("data:");
    expect(content).toContain('"type":"TEXT_MESSAGE_START"');
    expect(content).toContain('"messageId":"message-1"');
  });

  it("encodes TEXT_MESSAGE_CONTENT SSE event", () => {
    const encoded = encodeTextMessageContent({
      messageId: "message-1",
      delta: "hello"
    });
    const content = decode(encoded);

    expect(content).toContain("data:");
    expect(content).toContain('"type":"TEXT_MESSAGE_CONTENT"');
    expect(content).toContain('"messageId":"message-1"');
    expect(content).toContain('"delta":"hello"');
  });

  it("encodes TEXT_MESSAGE_END SSE event", () => {
    const encoded = encodeTextMessageEnd({ messageId: "message-1" });
    const content = decode(encoded);

    expect(content).toContain("data:");
    expect(content).toContain('"type":"TEXT_MESSAGE_END"');
    expect(content).toContain('"messageId":"message-1"');
  });

  it("encodes RUN_FINISHED SSE event", () => {
    const encoded = encodeRunFinished({ threadId: "thread-1", runId: "run-1" });
    const content = decode(encoded);

    expect(content).toContain("data:");
    expect(content).toContain('"type":"RUN_FINISHED"');
    expect(content).toContain('"threadId":"thread-1"');
    expect(content).toContain('"runId":"run-1"');
  });

  it("encodes RUN_FINISHED with optional result", () => {
    const encoded = encodeRunFinished({
      threadId: "thread-1",
      runId: "run-1",
      result: { status: "done" }
    });
    const content = decode(encoded);

    expect(content).toContain('"result":{"status":"done"}');
  });

  it("encodes RUN_ERROR SSE event", () => {
    const encoded = encodeRunError({ message: "something failed" });
    const content = decode(encoded);

    expect(content).toContain("data:");
    expect(content).toContain('"type":"RUN_ERROR"');
    expect(content).toContain('"message":"something failed"');
  });

  it("encodes RUN_ERROR with optional code", () => {
    const encoded = encodeRunError({ message: "something failed", code: "gmail_error" });
    const content = decode(encoded);

    expect(content).toContain('"code":"gmail_error"');
  });
});
