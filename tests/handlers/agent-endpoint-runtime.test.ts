import { describe, expect, it, vi } from "vitest";

import { createEmailMetadata } from "../../src/domain/email-metadata.js";
import type { EmailInsight } from "../../src/domain/email-insight.js";
import {
  handleAgentEndpoint,
  type AgentEndpointDependencies
} from "../../src/handlers/agent-endpoint.js";
import { createAgentEndpointStream } from "../../src/handlers/agent-endpoint-runtime.js";
import { acquireReadableStreamMutationLock } from "./readable-stream-mutation-lock.js";

function createDependencies(): AgentEndpointDependencies {
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

function createRequest(init?: RequestInit): Request {
  return new Request("http://localhost:3001/agent", { method: "POST", ...init });
}

function createInsight(
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

describe("agent endpoint runtime behavior", () => {
  it("handles closed stream errors without failing the stream lifecycle", async () => {
    const dependencies = createDependencies();
    const request = new Request("http://localhost:3001/agent", { method: "POST" });
    const runLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    const encodedEvents: string[] = [];
    let streamStartedResolve = () => {};
    const streamStarted = new Promise<void>((resolve) => {
      streamStartedResolve = resolve;
    });

    const releaseLock = await acquireReadableStreamMutationLock();
    const originalReadableStream = globalThis.ReadableStream;

    const FakeReadableStream = function (source: {
      start: (controller: {
        enqueue: (data: Uint8Array) => void;
        close: () => void;
      }) => Promise<void> | void;
    }) {
      const controller = {
        enqueue: (data: Uint8Array) => {
          if (encodedEvents.length >= 1) {
            throw new Error("Controller is already closed");
          }

          encodedEvents.push(new TextDecoder().decode(data));
        },
        close: () => {
          // no-op for this test
        }
      };

      void Promise.resolve(source.start(controller)).finally(() => {
        streamStartedResolve();
      });
    } as unknown as typeof ReadableStream;

    try {
      (globalThis as { ReadableStream: unknown }).ReadableStream = FakeReadableStream;
      dependencies.fetchUnreadEmails = vi.fn(() => Promise.resolve([]));

      createAgentEndpointStream({
        request,
        dependencies,
        runContext: {
          runId: "run-stream-failure",
          threadId: "thread-stream-failure"
        },
        runLogger,
        messageId: "message-stream",
        requestId: "request-stream"
      });

      await streamStarted;

      expect(encodedEvents[0]).toContain('"type":"RUN_STARTED"');
      expect(runLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: "agent.run_aborted" }),
        "Agent run aborted by client disconnect"
      );
      expect(runLogger.info).not.toHaveBeenCalledWith(
        expect.objectContaining({ event: "agent.run_completed" }),
        "Completed agent run"
      );
    } finally {
      (globalThis as { ReadableStream: unknown }).ReadableStream = originalReadableStream;
      releaseLock();
    }
  });

  it("stops before processing remaining insights after aborting mid-run", async () => {
    const dependencies = createDependencies();
    const abortController = new AbortController();

    const firstEmail = createEmailMetadata({
      id: "email-early-1",
      threadId: "thread-email-early-1",
      subject: "First email",
      from: "lead@example.com",
      to: "you@example.com",
      date: "Sat, 14 Feb 2026 12:10:00 +0000",
      snippet: "First",
      bodyText: "First body"
    });

    const secondEmail = createEmailMetadata({
      id: "email-early-2",
      threadId: "thread-email-early-2",
      subject: "Second email",
      from: "peer@example.com",
      to: "you@example.com",
      date: "Sat, 14 Feb 2026 12:11:00 +0000",
      snippet: "Second",
      bodyText: "Second body"
    });

    let firstCallStartedResolve: (() => void) | undefined;
    const firstCallStarted = new Promise<void>((resolve) => {
      firstCallStartedResolve = resolve;
    });

    let allowFirstCallToFinishResolve: (() => void) | undefined;
    const allowFirstCallToFinish = new Promise<void>((resolve) => {
      allowFirstCallToFinishResolve = resolve;
    });

    let processedFirst = false;

    dependencies.fetchUnreadEmails = vi.fn(() => Promise.resolve([firstEmail, secondEmail]));
    dependencies.extractEmailInsight = vi.fn(async () => {
      if (!processedFirst) {
        processedFirst = true;
        firstCallStartedResolve?.();
        await allowFirstCallToFinish;
        return createInsight("Business urgency", "business", "action_required");
      }

      return createInsight("FYI", "personal", "fyi");
    });

    const response = await handleAgentEndpoint(
      createRequest({
        signal: abortController.signal
      }),
      dependencies
    );

    await firstCallStarted;
    abortController.abort();
    allowFirstCallToFinishResolve?.();

    const body = await response.text();

    expect(dependencies.extractEmailInsight).toHaveBeenCalledTimes(1);
    expect(body).toContain('"type":"RUN_FINISHED"');
    expect(body).not.toContain("FYI");
  });

  it("only emits section header once for repeated urgency blocks", async () => {
    const dependencies = createDependencies();

    const first = createEmailMetadata({
      id: "email-repeat-1",
      threadId: "thread-repeat",
      subject: "Same urgency one",
      from: "team@example.com",
      to: "you@example.com",
      date: "Sat, 14 Feb 2026 12:12:00 +0000",
      snippet: "One",
      bodyText: "body"
    });

    const second = createEmailMetadata({
      id: "email-repeat-2",
      threadId: "thread-repeat",
      subject: "Same urgency two",
      from: "team@example.com",
      to: "you@example.com",
      date: "Sat, 14 Feb 2026 12:13:00 +0000",
      snippet: "Two",
      bodyText: "body"
    });

    dependencies.fetchUnreadEmails = vi.fn(() => Promise.resolve([first, second]));
    dependencies.extractEmailInsight = vi
      .fn()
      .mockResolvedValue(createInsight("A fyi message.", "business", "fyi"));

    const response = await handleAgentEndpoint(createRequest(), dependencies);
    const body = await response.text();

    const firstHeaderIndex = body.indexOf("## Updates");
    const secondHeaderIndex = body.indexOf("## Updates", firstHeaderIndex + 1);

    expect(firstHeaderIndex).toBeGreaterThan(0);
    expect(secondHeaderIndex).toBe(-1);
    expect(body).toContain("Same urgency one");
    expect(body).toContain("Same urgency two");
  });
});
