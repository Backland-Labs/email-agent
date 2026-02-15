import { describe, expect, it, vi } from "vitest";

import { createEmailMetadata } from "../../src/domain/email-metadata.js";
import type { EmailInsight, EmailCategory } from "../../src/domain/email-insight.js";
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
        category: "business" as const
      })
    ),
    model: "anthropic:claude-sonnet-4-20250514",
    createMessageId: () => "message-1"
  };
}

function createRequest(init?: RequestInit): Request {
  return new Request("http://localhost:3001/agent", {
    method: "POST",
    ...init
  });
}

function createInsight(category: EmailCategory): EmailInsight {
  return {
    summary: `A ${category} message.`,
    category
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
    dependencies.extractEmailInsight = vi.fn(() => Promise.resolve(createInsight("personal")));

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
      .mockResolvedValueOnce(createInsight("business"));

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
        category: "personal" as const
      })
    );

    const response = await handleAgentEndpoint(createRequest(), dependencies);
    const body = await response.text();

    expect(body).toContain("lead@example.com");
    expect(body).toContain("Action items email");
    expect(body).toContain("Lead is asking you to complete outstanding tasks.");
  });

  it("sorts results by category: personal, business, automated, newsletter_or_spam", async () => {
    const dependencies = createDependencies();

    const spamEmail = createEmailMetadata({
      id: "email-spam",
      threadId: "thread-spam",
      subject: "Weekly digest",
      from: "news@newsletter.com",
      to: "you@example.com",
      date: "Sat, 14 Feb 2026 12:00:00 +0000",
      snippet: "This week in tech",
      bodyText: "Newsletter content"
    });

    const personalEmail = createEmailMetadata({
      id: "email-personal",
      threadId: "thread-personal",
      subject: "Dinner tonight?",
      from: "friend@example.com",
      to: "you@example.com",
      date: "Sat, 14 Feb 2026 12:01:00 +0000",
      snippet: "Want to grab dinner",
      bodyText: "Hey Max, dinner tonight?"
    });

    const businessEmail = createEmailMetadata({
      id: "email-business",
      threadId: "thread-business",
      subject: "Q3 report",
      from: "cfo@company.com",
      to: "you@example.com",
      date: "Sat, 14 Feb 2026 12:02:00 +0000",
      snippet: "Q3 numbers",
      bodyText: "Please review the Q3 financials"
    });

    const automatedEmail = createEmailMetadata({
      id: "email-automated",
      threadId: "thread-automated",
      subject: "CI failed",
      from: "noreply@github.com",
      to: "you@example.com",
      date: "Sat, 14 Feb 2026 12:03:00 +0000",
      snippet: "Build failed",
      bodyText: "CI pipeline failed on main branch"
    });

    dependencies.fetchUnreadEmails = vi.fn(() =>
      Promise.resolve([spamEmail, personalEmail, automatedEmail, businessEmail])
    );

    dependencies.extractEmailInsight = vi
      .fn()
      .mockResolvedValueOnce(createInsight("newsletter_or_spam"))
      .mockResolvedValueOnce(createInsight("personal"))
      .mockResolvedValueOnce(createInsight("automated"))
      .mockResolvedValueOnce(createInsight("business"));

    const response = await handleAgentEndpoint(createRequest(), dependencies);
    const body = await response.text();

    const personalIndex = body.indexOf("Dinner tonight?");
    const businessIndex = body.indexOf("Q3 report");
    const automatedIndex = body.indexOf("CI failed");
    const spamIndex = body.indexOf("Weekly digest");

    expect(personalIndex).toBeGreaterThan(-1);
    expect(businessIndex).toBeGreaterThan(-1);
    expect(automatedIndex).toBeGreaterThan(-1);
    expect(spamIndex).toBeGreaterThan(-1);
    expect(personalIndex).toBeLessThan(businessIndex);
    expect(businessIndex).toBeLessThan(automatedIndex);
    expect(automatedIndex).toBeLessThan(spamIndex);
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
    dependencies.extractEmailInsight = vi.fn(() => Promise.resolve(createInsight("personal")));

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
