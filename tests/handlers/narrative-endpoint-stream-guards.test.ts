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
};

type ReadableStreamFactory = (source: unknown) => ReadableStream<Uint8Array>;

function createFailingReadableStreamFactory({
  shouldFail
}: FailingReadableStreamInput): ReadableStreamFactory {
  return (source) => {
    let enqueueIndex = 0;

    return new ReadableStream<Uint8Array>({
      start: (controller) =>
        (
          source as {
            start: (controller: {
              enqueue: (data: Uint8Array) => void;
              close: () => void;
            }) => Promise<void> | void;
          }
        ).start({
          enqueue: (data) => {
            enqueueIndex += 1;
            const error = shouldFail(enqueueIndex);
            if (error) {
              throw error;
            }

            controller.enqueue(data);
          },
          close: () => {
            controller.close();
          }
        })
    });
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
    dependencies.createReadableStream = createFailingReadableStreamFactory({
      shouldFail: (enqueueIndex) =>
        enqueueIndex === 2 ? new Error("Storage unavailable") : undefined
    });

    const response = await handleNarrativeEndpoint(createRequest(), dependencies);
    const body = await response.text();

    expect(body).toContain('"type":"RUN_STARTED"');
    expect(body).toContain('"type":"RUN_ERROR"');
    expect(body).toContain("Storage unavailable");
    expect(body).not.toContain('"type":"RUN_FINISHED"');
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
