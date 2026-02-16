import { describe, expect, it, vi } from "vitest";

import { createEmailMetadata } from "../../src/domain/email-metadata.js";
import { createAgentEndpointStream } from "../../src/handlers/agent-endpoint-runtime.js";
import {
  createDependencies,
  createFailingReadableStream,
  createInsight,
  createRunLogger
} from "./agent-endpoint-runtime-stream-helpers.js";

describe("agent endpoint runtime coverage", () => {
  it("converts non-closed enqueue errors into run failures", async () => {
    const dependencies = createDependencies();
    const runLogger = createRunLogger();
    const request = new Request("http://localhost:3001/agent", { method: "POST" });

    const { events, streamStarted, restore } = createFailingReadableStream({
      shouldFail: (enqueueIndex) =>
        enqueueIndex === 2 ? new Error("Storage unavailable") : undefined
    });

    try {
      createAgentEndpointStream({
        request,
        dependencies,
        runContext: {
          runId: "run-stream-error",
          threadId: "thread-stream-error"
        },
        runLogger,
        messageId: "message-stream-error",
        requestId: "request-stream-error"
      });

      await streamStarted;
      const body = events.join("");

      expect(events.length).toBeGreaterThan(0);
      expect(body).toContain('"type":"RUN_STARTED"');
      expect(body).toContain('"type":"RUN_ERROR"');
      expect(body).toContain("Storage unavailable");
      expect(runLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ event: "agent.run_failed", code: "run_failed" }),
        "Failed agent run"
      );
      expect(runLogger.info).not.toHaveBeenCalledWith(
        expect.objectContaining({ event: "agent.run_aborted" }),
        "Agent run aborted by client disconnect"
      );
    } finally {
      restore();
    }
  });

  it("handles closed stream errors while emitting section header", async () => {
    const dependencies = createDependencies();
    const runLogger = createRunLogger();
    const request = new Request("http://localhost:3001/agent", { method: "POST" });
    const email = createEmailMetadata({
      id: "email-section-fail",
      threadId: "thread-section-fail",
      subject: "Action required email",
      from: "lead@example.com",
      to: "you@example.com",
      date: "Sat, 14 Feb 2026 12:15:00 +0000",
      snippet: "Needs action",
      bodyText: "Please review"
    });

    dependencies.fetchUnreadEmails = vi.fn(() => Promise.resolve([email]));
    dependencies.extractEmailInsight = vi.fn(() =>
      Promise.resolve(createInsight("A business message.", "business", "action_required"))
    );

    const { events, streamStarted, restore } = createFailingReadableStream({
      shouldFail: (enqueueIndex) =>
        enqueueIndex === 4 ? new Error("Controller is already closed") : undefined
    });

    try {
      createAgentEndpointStream({
        request,
        dependencies,
        runContext: {
          runId: "run-section-fail",
          threadId: "thread-section-fail"
        },
        runLogger,
        messageId: "message-section-fail",
        requestId: "request-section-fail"
      });

      await streamStarted;
      const body = events.join("");

      expect(events.length).toBeGreaterThan(0);
      expect(body).toContain('"type":"RUN_STARTED"');
      expect(body).not.toContain('"type":"RUN_ERROR"');
      expect(runLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: "agent.run_aborted" }),
        "Agent run aborted by client disconnect"
      );
    } finally {
      restore();
    }
  });

  it("handles closed stream errors while emitting reading list header", async () => {
    const dependencies = createDependencies();
    const runLogger = createRunLogger();
    const request = new Request("http://localhost:3001/agent", { method: "POST" });
    const email = createEmailMetadata({
      id: "email-reading-list-fail",
      threadId: "thread-reading-list-fail",
      subject: "Weekly roundup",
      from: "news@example.com",
      to: "you@example.com",
      date: "Sat, 14 Feb 2026 12:16:00 +0000",
      snippet: "Your weekly update",
      bodyText: "Newsletter content"
    });

    dependencies.fetchUnreadEmails = vi.fn(() => Promise.resolve([email]));
    dependencies.extractEmailInsight = vi.fn(() =>
      Promise.resolve(createInsight("A newsletter.", "newsletter_or_spam", "fyi"))
    );

    const { events, streamStarted, restore } = createFailingReadableStream({
      shouldFail: (enqueueIndex) =>
        enqueueIndex === 5 ? new Error("Controller is already closed") : undefined
    });

    try {
      createAgentEndpointStream({
        request,
        dependencies,
        runContext: {
          runId: "run-reading-list-fail",
          threadId: "thread-reading-list-fail"
        },
        runLogger,
        messageId: "message-reading-list-fail",
        requestId: "request-reading-list-fail"
      });

      await streamStarted;
      const body = events.join("");

      expect(events.length).toBeGreaterThan(0);
      expect(body).not.toContain("### Reading List");
      expect(body).toContain('"type":"RUN_STARTED"');
      expect(body).not.toContain('"type":"RUN_ERROR"');
      expect(runLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: "agent.run_aborted" }),
        "Agent run aborted by client disconnect"
      );
    } finally {
      restore();
    }
  });

  it("handles closed stream errors while emitting insight markdown", async () => {
    const dependencies = createDependencies();
    const runLogger = createRunLogger();
    const request = new Request("http://localhost:3001/agent", { method: "POST" });
    const email = createEmailMetadata({
      id: "email-markdown-fail",
      threadId: "thread-markdown-fail",
      subject: "Monthly report",
      from: "manager@example.com",
      to: "you@example.com",
      date: "Sat, 14 Feb 2026 12:17:00 +0000",
      snippet: "Update",
      bodyText: "Report details"
    });

    dependencies.fetchUnreadEmails = vi.fn(() => Promise.resolve([email]));
    dependencies.extractEmailInsight = vi.fn(() =>
      Promise.resolve(createInsight("A monthly update.", "business", "fyi"))
    );

    const { events, streamStarted, restore } = createFailingReadableStream({
      shouldFail: (enqueueIndex) =>
        enqueueIndex === 5 ? new Error("Controller is already closed") : undefined
    });

    try {
      createAgentEndpointStream({
        request,
        dependencies,
        runContext: {
          runId: "run-markdown-fail",
          threadId: "thread-markdown-fail"
        },
        runLogger,
        messageId: "message-markdown-fail",
        requestId: "request-markdown-fail"
      });

      await streamStarted;
      const body = events.join("");

      expect(events.length).toBeGreaterThan(0);
      expect(body).toContain('"type":"RUN_STARTED"');
      expect(body).not.toContain("A monthly update.");
      expect(body).not.toContain('"type":"RUN_ERROR"');
      expect(runLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: "agent.run_aborted" }),
        "Agent run aborted by client disconnect"
      );
    } finally {
      restore();
    }
  });

  it("handles controller.close() throwing an error in finally block", async () => {
    const dependencies = createDependencies();
    const runLogger = createRunLogger();
    const request = new Request("http://localhost:3001/agent", { method: "POST" });

    dependencies.fetchUnreadEmails = vi.fn(() => Promise.resolve([]));

    const { events, streamStarted, restore } = createFailingReadableStream({
      shouldFail: () => undefined,
      shouldFailClose: true
    });

    try {
      createAgentEndpointStream({
        request,
        dependencies,
        runContext: {
          runId: "run-close-fail",
          threadId: "thread-close-fail"
        },
        runLogger,
        messageId: "message-close-fail",
        requestId: "request-close-fail"
      });

      await streamStarted;
      const body = events.join("");

      expect(events.length).toBeGreaterThan(0);
      expect(body).toContain('"type":"RUN_STARTED"');
      expect(body).toContain('"type":"RUN_FINISHED"');
      expect(runLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: "agent.run_completed" }),
        "Completed agent run"
      );
    } finally {
      restore();
    }
  });
});
