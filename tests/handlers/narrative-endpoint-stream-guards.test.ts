import type { Auth } from "googleapis";
import { describe, expect, it, vi } from "vitest";

import {
  handleNarrativeEndpoint,
  type NarrativeEndpointDependencies
} from "../../src/handlers/narrative-endpoint.js";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

type FetchUnreadResult = Awaited<ReturnType<NarrativeEndpointDependencies["fetchUnreadEmails"]>>;

type FailingReadableStreamInput = {
  shouldFail: (enqueueIndex: number) => Error | undefined;
  shouldFailClose?: boolean;
};

type FailingReadableStreamHandle = {
  restore: () => void;
};

function installFailingReadableStream({
  shouldFail,
  shouldFailClose = false
}: FailingReadableStreamInput): FailingReadableStreamHandle {
  const OriginalReadableStream = globalThis.ReadableStream;

  class FailingReadableStream extends OriginalReadableStream<Uint8Array> {
    public constructor(source: {
      start: (controller: {
        enqueue: (data: Uint8Array) => void;
        close: () => void;
      }) => Promise<void> | void;
    }) {
      let enqueueIndex = 0;

      super({
        start: (controller) =>
          source.start({
            enqueue: (data) => {
              enqueueIndex += 1;
              const error = shouldFail(enqueueIndex);
              if (error) {
                throw error;
              }

              controller.enqueue(data);
            },
            close: () => {
              if (shouldFailClose) {
                throw new Error("Controller is already closed");
              }

              controller.close();
            }
          })
      });
    }
  }

  (globalThis as { ReadableStream: typeof ReadableStream }).ReadableStream =
    FailingReadableStream as unknown as typeof ReadableStream;

  return {
    restore: () => {
      (globalThis as { ReadableStream: typeof ReadableStream }).ReadableStream =
        OriginalReadableStream;
    }
  };
}

function createDeferred<T>(): Deferred<T> {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return {
    promise,
    resolve: (value: T) => {
      resolve?.(value);
    },
    reject: (reason?: unknown) => {
      reject?.(reason);
    }
  };
}

function createRequest(init?: RequestInit): Request {
  return new Request("http://localhost:3001/narrative", { method: "POST", ...init });
}

function createDependencies(): NarrativeEndpointDependencies {
  return {
    createAuthClient: vi.fn(() => ({ token: "token" }) as unknown as Auth.OAuth2Client),
    createGmailMessagesApi: vi.fn((_authClient: Auth.OAuth2Client) => {
      void _authClient;

      return {
        list: vi.fn(() => Promise.resolve({ data: { messages: [] } })),
        get: vi.fn(() => Promise.resolve({ data: {} }))
      } as unknown as ReturnType<NarrativeEndpointDependencies["createGmailMessagesApi"]>;
    }),
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
    createMessageId: () => crypto.randomUUID()
  };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("narrative endpoint stream guards", () => {
  it("emits RUN_ERROR when enqueue fails with a non-closed error", async () => {
    const dependencies = createDependencies();
    const { restore } = installFailingReadableStream({
      shouldFail: (enqueueIndex) =>
        enqueueIndex === 2 ? new Error("Storage unavailable") : undefined
    });

    try {
      const response = await handleNarrativeEndpoint(createRequest(), dependencies);
      const body = await response.text();

      expect(body).toContain('"type":"RUN_STARTED"');
      expect(body).toContain('"type":"RUN_ERROR"');
      expect(body).toContain("Storage unavailable");
      expect(body).not.toContain('"type":"RUN_FINISHED"');
    } finally {
      restore();
    }
  });

  it("does not raise unhandled rejections after client disconnect mid-run", async () => {
    const dependencies = createDependencies();
    const pendingEmails = createDeferred<FetchUnreadResult>();
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown): void => {
      unhandledRejections.push(reason);
    };

    dependencies.fetchUnreadEmails = vi.fn(() => pendingEmails.promise);
    process.on("unhandledRejection", onUnhandledRejection);

    try {
      const response = await handleNarrativeEndpoint(createRequest(), dependencies);
      const reader = response.body?.getReader();

      expect(reader).toBeDefined();

      await reader?.read();
      await reader?.cancel();

      pendingEmails.resolve([]);
      await flushAsyncWork();

      expect(dependencies.fetchUnreadEmails).toHaveBeenCalledTimes(1);
      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });
});
