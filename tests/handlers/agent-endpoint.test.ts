import { describe, expect, it, vi } from "vitest";

import { createEmailMetadata } from "../../src/domain/email-metadata.js";
import type { EmailInsight, EmailCategory, EmailUrgency } from "../../src/domain/email-insight.js";
import {
  handleAgentEndpoint,
  type AgentEndpointDependencies
} from "../../src/handlers/agent-endpoint.js";

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
    createMessageId: () => "message-1"
  };
}

function createRequest(init?: RequestInit): Request {
  return new Request("http://localhost:3001/agent", { method: "POST", ...init });
}

function createTestEmail(
  id: string,
  overrides: Partial<{ subject: string; from: string; bodyText: string }> = {}
) {
  return createEmailMetadata({
    id,
    threadId: `thread-${id}`,
    subject: overrides.subject ?? "Test",
    from: overrides.from ?? "sender@example.com",
    to: "you@example.com",
    date: "Sat, 14 Feb 2026 12:00:00 +0000",
    snippet: "Snippet",
    bodyText: overrides.bodyText ?? "Body"
  });
}

function createInsight(
  category: EmailCategory,
  urgency: EmailUrgency = "fyi",
  action: string | null = null
): EmailInsight {
  return {
    summary: `A ${category} message.`,
    category,
    urgency,
    action
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
    dependencies.extractEmailInsight = vi.fn(() =>
      Promise.resolve(createInsight("personal", "fyi"))
    );

    const response = await handleAgentEndpoint(createRequest(), dependencies);
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

    const response = await handleAgentEndpoint(createRequest(), dependencies);
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

    const response = await handleAgentEndpoint(createRequest(), dependencies);
    const body = await response.text();

    expect(body).toContain('"type":"RUN_ERROR"');
    expect(body).toContain("Unknown error");
  });

  it("ignores JSON request body and still runs", async () => {
    const dependencies = createDependencies();

    const response = await handleAgentEndpoint(
      createRequest({
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ invalid: true })
      }),
      dependencies
    );
    const body = await response.text();

    expect(body).toContain('"type":"RUN_FINISHED"');
    expect(body).not.toContain('"type":"RUN_ERROR"');
  });

  it("ignores malformed JSON body and still runs", async () => {
    const dependencies = createDependencies();

    const response = await handleAgentEndpoint(
      createRequest({
        headers: {
          "content-type": "application/json"
        },
        body: "{invalid-json"
      }),
      dependencies
    );
    const body = await response.text();

    expect(body).toContain('"type":"RUN_FINISHED"');
    expect(body).not.toContain('"type":"RUN_ERROR"');
  });

  it("emits no unread emails message when inbox is empty", async () => {
    const dependencies = createDependencies();

    dependencies.fetchUnreadEmails = vi.fn(() => Promise.resolve([]));

    const response = await handleAgentEndpoint(createRequest(), dependencies);
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
      .mockResolvedValueOnce(createInsight("business", "fyi"));

    const response = await handleAgentEndpoint(createRequest(), dependencies);
    const body = await response.text();

    expect(dependencies.extractEmailInsight).toHaveBeenCalledTimes(2);
    expect(body).toContain("Second email");
    expect(body).not.toContain("First email");
    expect(body).toContain('"type":"RUN_FINISHED"');
  });

  it("includes from, subject, and summary in formatted markdown", async () => {
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
        summary: "Lead is asking you to complete outstanding tasks.",
        category: "personal" as const,
        urgency: "fyi" as const,
        action: null
      })
    );

    const response = await handleAgentEndpoint(createRequest(), dependencies);
    const body = await response.text();

    expect(body).toContain("lead@example.com");
    expect(body).toContain("Action items email");
    expect(body).toContain("Lead is asking you to complete outstanding tasks.");
  });

  it("sorts results by urgency: action_required, fyi, noise", async () => {
    const dependencies = createDependencies();

    const noiseEmail = createTestEmail("noise", { subject: "CI failed" });
    const urgentEmail = createTestEmail("urgent", { subject: "Trial expiring" });
    const fyiEmail = createTestEmail("fyi", { subject: "Payment receipt" });

    dependencies.fetchUnreadEmails = vi.fn(() =>
      Promise.resolve([noiseEmail, urgentEmail, fyiEmail])
    );

    dependencies.extractEmailInsight = vi
      .fn()
      .mockResolvedValueOnce(createInsight("automated", "noise"))
      .mockResolvedValueOnce(
        createInsight("business", "action_required", "Upgrade your Railway plan.")
      )
      .mockResolvedValueOnce(createInsight("business", "fyi"));

    const response = await handleAgentEndpoint(createRequest(), dependencies);
    const body = await response.text();

    const actionRequiredIndex = body.indexOf("Action Required");
    const updatesIndex = body.indexOf("Updates");
    const backgroundIndex = body.indexOf("Background");

    expect(actionRequiredIndex).toBeGreaterThan(-1);
    expect(updatesIndex).toBeGreaterThan(-1);
    expect(backgroundIndex).toBeGreaterThan(-1);
    expect(actionRequiredIndex).toBeLessThan(updatesIndex);
    expect(updatesIndex).toBeLessThan(backgroundIndex);
  });

  it("emits Reading List sub-header before fyi newsletters", async () => {
    const dependencies = createDependencies();

    const businessEmail = createTestEmail("biz", { subject: "Invoice #123" });
    const newsletterEmail = createTestEmail("news", {
      subject: "Weekly roundup",
      from: "Every <hello@every.to>"
    });

    dependencies.fetchUnreadEmails = vi.fn(() => Promise.resolve([businessEmail, newsletterEmail]));

    dependencies.extractEmailInsight = vi
      .fn()
      .mockResolvedValueOnce(createInsight("business", "fyi"))
      .mockResolvedValueOnce(createInsight("newsletter_or_spam", "fyi"));

    const response = await handleAgentEndpoint(createRequest(), dependencies);
    const body = await response.text();

    const updatesIndex = body.indexOf("Updates");
    const readingListIndex = body.indexOf("Reading List");
    const newsletterIndex = body.indexOf("Weekly roundup");

    expect(readingListIndex).toBeGreaterThan(updatesIndex);
    expect(newsletterIndex).toBeGreaterThan(readingListIndex);
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
    dependencies.extractEmailInsight = vi.fn(() =>
      Promise.resolve(createInsight("personal", "fyi"))
    );

    abortController.abort();

    const response = await handleAgentEndpoint(
      createRequest({
        signal: abortController.signal
      }),
      dependencies
    );
    const body = await response.text();

    expect(dependencies.extractEmailInsight).toHaveBeenCalledTimes(0);
    expect(body).toContain('"type":"RUN_FINISHED"');
  });
});
