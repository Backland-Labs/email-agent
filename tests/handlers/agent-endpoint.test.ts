import { describe, expect, it, vi } from "vitest";

import { createEmailMetadata } from "../../src/domain/email-metadata.js";
import type { EmailInsight } from "../../src/domain/email-insight.js";
import {
  handleAgentEndpoint,
  type AgentEndpointDependencies
} from "../../src/handlers/agent-endpoint.js";

function createValidRunInput() {
  return {
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
}

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
        priority: "low" as const,
        sentiment: "neutral" as const,
        actionItems: [],
        relationshipContext: "Unknown" as const,
        urgencySignals: []
      })
    ),
    model: "anthropic:claude-sonnet-4-20250514",
    createMessageId: () => "message-1"
  };
}

function createRequest(body: unknown): Request {
  return new Request("http://localhost:3001/agent", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

function createInsight(priority: EmailInsight["priority"]): EmailInsight {
  return {
    priority,
    sentiment: "neutral",
    actionItems: [],
    relationshipContext: "Unknown",
    urgencySignals: []
  };
}

describe("handleAgentEndpoint", () => {
  it("streams full SSE lifecycle for successful run", async () => {
    const dependencies = createDependencies();

    const email = createEmailMetadata({
      id: "email-1",
      threadId: "thread-email-1",
      subject: "Budget review",
      from: "manager@example.com",
      to: "you@example.com",
      date: "Sat, 14 Feb 2026 12:00:00 +0000",
      snippet: "Please review",
      bodyText: "Please review the budget by tomorrow"
    });

    dependencies.fetchUnreadEmails = vi.fn(() => Promise.resolve([email]));
    dependencies.extractEmailInsight = vi.fn(() => Promise.resolve(createInsight("high")));

    const response = await handleAgentEndpoint(createRequest(createValidRunInput()), dependencies);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body.indexOf('"type":"RUN_STARTED"')).toBeGreaterThanOrEqual(0);
    expect(body.indexOf('"type":"TEXT_MESSAGE_START"')).toBeGreaterThan(
      body.indexOf('"type":"RUN_STARTED"')
    );
    expect(body.indexOf('"type":"TEXT_MESSAGE_CONTENT"')).toBeGreaterThan(
      body.indexOf('"type":"TEXT_MESSAGE_START"')
    );
    expect(body.indexOf('"type":"TEXT_MESSAGE_END"')).toBeGreaterThan(
      body.indexOf('"type":"TEXT_MESSAGE_CONTENT"')
    );
    expect(body.indexOf('"type":"RUN_FINISHED"')).toBeGreaterThan(
      body.indexOf('"type":"TEXT_MESSAGE_END"')
    );
  });

  it("emits RUN_ERROR when Gmail fetch fails", async () => {
    const dependencies = createDependencies();

    dependencies.fetchUnreadEmails = vi.fn(() => Promise.reject(new Error("Gmail unavailable")));

    const response = await handleAgentEndpoint(createRequest(createValidRunInput()), dependencies);
    const body = await response.text();

    expect(body).toContain('"type":"RUN_ERROR"');
    expect(body).toContain("Gmail unavailable");
  });

  it("emits unknown error message for non-Error failures", async () => {
    const dependencies = createDependencies();
    const nonErrorFailure: unknown = "boom";

    dependencies.fetchUnreadEmails = vi.fn(() =>
      Promise.resolve().then(() => {
        throw nonErrorFailure;
      })
    );

    const response = await handleAgentEndpoint(createRequest(createValidRunInput()), dependencies);
    const body = await response.text();

    expect(body).toContain('"type":"RUN_ERROR"');
    expect(body).toContain("Unknown error");
  });

  it("emits RUN_ERROR for invalid request body", async () => {
    const dependencies = createDependencies();

    const response = await handleAgentEndpoint(createRequest({ invalid: true }), dependencies);
    const body = await response.text();

    expect(body).toContain('"type":"RUN_ERROR"');
    expect(body).toContain("Invalid RunAgentInput payload");
  });

  it("emits RUN_ERROR for malformed JSON", async () => {
    const dependencies = createDependencies();

    const response = await handleAgentEndpoint(
      new Request("http://localhost:3001/agent", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: "{invalid-json"
      }),
      dependencies
    );
    const body = await response.text();

    expect(body).toContain('"type":"RUN_ERROR"');
    expect(body).toContain("Invalid RunAgentInput payload");
  });

  it("emits no unread emails message when inbox is empty", async () => {
    const dependencies = createDependencies();

    dependencies.fetchUnreadEmails = vi.fn(() => Promise.resolve([]));

    const response = await handleAgentEndpoint(createRequest(createValidRunInput()), dependencies);
    const body = await response.text();

    expect(body).toContain('"type":"TEXT_MESSAGE_CONTENT"');
    expect(body).toContain("No unread emails");
    expect(body).toContain('"type":"RUN_FINISHED"');
  });

  it("skips failed email insight extraction and continues remaining emails", async () => {
    const dependencies = createDependencies();

    const firstEmail = createEmailMetadata({
      id: "email-1",
      threadId: "thread-email-1",
      subject: "First email",
      from: "manager@example.com",
      to: "you@example.com",
      date: "Sat, 14 Feb 2026 12:01:00 +0000",
      snippet: "First",
      bodyText: "First body"
    });

    const secondEmail = createEmailMetadata({
      id: "email-2",
      threadId: "thread-email-2",
      subject: "Second email",
      from: "peer@example.com",
      to: "you@example.com",
      date: "Sat, 14 Feb 2026 12:02:00 +0000",
      snippet: "Second",
      bodyText: "Second body"
    });

    dependencies.fetchUnreadEmails = vi.fn(() => Promise.resolve([firstEmail, secondEmail]));

    dependencies.extractEmailInsight = vi
      .fn()
      .mockRejectedValueOnce(new Error("LLM failure"))
      .mockResolvedValueOnce(createInsight("medium"));

    const response = await handleAgentEndpoint(createRequest(createValidRunInput()), dependencies);
    const body = await response.text();

    expect(dependencies.extractEmailInsight).toHaveBeenCalledTimes(2);
    expect(body).toContain("Second email");
    expect(body).not.toContain("First email");
    expect(body).toContain('"type":"RUN_FINISHED"');
  });

  it("includes action items and urgency signals in formatted markdown", async () => {
    const dependencies = createDependencies();

    const email = createEmailMetadata({
      id: "email-3",
      threadId: "thread-email-3",
      subject: "Action items email",
      from: "lead@example.com",
      to: "you@example.com",
      date: "Sat, 14 Feb 2026 12:03:00 +0000",
      snippet: "Action items",
      bodyText: "Please complete these tasks"
    });

    dependencies.fetchUnreadEmails = vi.fn(() => Promise.resolve([email]));
    dependencies.extractEmailInsight = vi.fn(() =>
      Promise.resolve({
        priority: "high" as const,
        sentiment: "urgent" as const,
        actionItems: [
          { task: "Review budget", owner: "you", deadline: "Feb 15" },
          { task: "Reply to finance", owner: "you" }
        ],
        relationshipContext: "Manager" as const,
        urgencySignals: ["need this by EOD"]
      })
    );

    const response = await handleAgentEndpoint(createRequest(createValidRunInput()), dependencies);
    const body = await response.text();

    expect(body).toContain("Review budget (Owner: you, Deadline: Feb 15)");
    expect(body).toContain("Reply to finance (Owner: you)");
    expect(body).toContain("need this by EOD");
    expect(body).toContain("Priority:** High | **Sentiment:** Urgent");
  });

  it("stops processing email insights when request is already aborted", async () => {
    const dependencies = createDependencies();
    const abortController = new AbortController();

    const email = createEmailMetadata({
      id: "email-4",
      threadId: "thread-email-4",
      subject: "Aborted",
      from: "lead@example.com",
      to: "you@example.com",
      date: "Sat, 14 Feb 2026 12:04:00 +0000",
      snippet: "Aborted",
      bodyText: "Should not process"
    });

    dependencies.fetchUnreadEmails = vi.fn(() => Promise.resolve([email]));
    dependencies.extractEmailInsight = vi.fn(() => Promise.resolve(createInsight("high")));

    abortController.abort();

    const response = await handleAgentEndpoint(
      new Request("http://localhost:3001/agent", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(createValidRunInput()),
        signal: abortController.signal
      }),
      dependencies
    );
    const body = await response.text();

    expect(dependencies.extractEmailInsight).toHaveBeenCalledTimes(0);
    expect(body).toContain('"type":"RUN_FINISHED"');
  });
});
