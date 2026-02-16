import { vi } from "vitest";

import type { EmailInsight } from "../../src/domain/email-insight.js";
import type { AgentEndpointDependencies } from "../../src/handlers/agent-endpoint.js";

type FakeReadableStreamInput = {
  shouldFail: (enqueueIndex: number) => Error | undefined;
  shouldFailClose?: boolean;
};

type FakeReadableStreamHandle = {
  events: string[];
  streamStarted: Promise<void>;
  restore: () => void;
};

export function createFailingReadableStream({
  shouldFail,
  shouldFailClose = false
}: FakeReadableStreamInput): FakeReadableStreamHandle {
  const events: string[] = [];
  let streamStartedResolve: () => void = () => {};
  const streamStarted = new Promise<void>((resolve) => {
    streamStartedResolve = resolve;
  });

  const originalReadableStream = globalThis.ReadableStream;

  const FakeReadableStream = function (source: {
    start: (controller: {
      enqueue: (data: Uint8Array) => void;
      close: () => void;
    }) => Promise<void> | void;
  }) {
    let enqueueIndex = 0;

    const controller = {
      enqueue: (data: Uint8Array) => {
        enqueueIndex += 1;
        const error = shouldFail(enqueueIndex);
        if (error) {
          throw error;
        }

        events.push(new TextDecoder().decode(data));
      },
      close: () => {
        if (shouldFailClose) {
          throw new Error("Controller is already closed");
        }
      }
    };

    void Promise.resolve(source.start(controller)).finally(() => {
      streamStartedResolve();
    });
  } as unknown as typeof ReadableStream;

  (globalThis as { ReadableStream: unknown }).ReadableStream = FakeReadableStream;

  return {
    events,
    streamStarted,
    restore: () => {
      (globalThis as { ReadableStream: unknown }).ReadableStream = originalReadableStream;
    }
  };
}

export function createRunLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
}

export function createDependencies(): AgentEndpointDependencies {
  return {
    createAuthClient: vi.fn(() => ({ token: "token" })),
    createGmailMessagesApi: vi.fn(() => ({
      list: vi.fn(() => Promise.resolve({ data: { messages: [] } })),
      get: vi.fn(() => Promise.resolve({ data: {} }))
    })),
    fetchUnreadEmails: vi.fn(() => Promise.resolve([])),
    extractEmailInsight: vi.fn(() =>
      Promise.resolve({
        summary: "A routine message.",
        category: "business" as const,
        urgency: "fyi" as const,
        action: null
      })
    ),
    model: "anthropic:claude-sonnet-4-20250514",
    createMessageId: () => "message-2"
  };
}

export function createInsight(
  summary: string,
  category: EmailInsight["category"],
  urgency: EmailInsight["urgency"]
): EmailInsight {
  return {
    summary,
    category,
    urgency,
    action: null
  };
}
