import type { Auth } from "googleapis";
import { describe, expect, it, vi } from "vitest";

import { createEmailMetadata } from "../../src/domain/email-metadata.js";
import type { EmailInsight, EmailCategory, EmailUrgency } from "../../src/domain/email-insight.js";
import {
  handleNarrativeEndpoint,
  type NarrativeEndpointDependencies
} from "../../src/handlers/narrative-endpoint.js";
import {
  LOOKBACK_HOURS,
  buildNarrative,
  extractActionItems,
  type NarrativeAnalysisResult
} from "../../src/handlers/narrative-endpoint-runtime.js";

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

function createRequest(init?: RequestInit): Request {
  return new Request("http://localhost:3001/narrative", { method: "POST", ...init });
}

function toValidEmailId(seed: string): string {
  const normalized = (seed.toLowerCase().replace(/[^a-z0-9]/gu, "") || "x").padEnd(10, "0");
  return `17ce8a2b6f3d${normalized.slice(0, 10)}`;
}

function createTestEmail(
  id: string,
  overrides: Partial<{ subject: string; from: string; bodyText: string }> = {}
) {
  const emailId = toValidEmailId(id);
  return createEmailMetadata({
    id: emailId,
    threadId: `thread-${emailId}`,
    subject: overrides.subject ?? "Test",
    from: overrides.from ?? "sender@example.com",
    to: "you@example.com",
    date: new Date(Date.now() - 60 * 60 * 1000).toUTCString(),
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

describe("handleNarrativeEndpoint", () => {
  it("streams full SSE lifecycle for successful run", async () => {
    const dependencies = createDependencies();
    dependencies.fetchUnreadEmails = vi.fn(() => Promise.resolve([createTestEmail("email-1")]));
    dependencies.extractEmailInsight = vi.fn(() =>
      Promise.resolve(
        createInsight("personal", "action_required", "Review and reply to this email")
      )
    );
    const response = await handleNarrativeEndpoint(
      createRequest({
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ runId: "run-narrative", threadId: "thread-narrative" })
      }),
      dependencies
    );
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
    expect(body).toContain("Action Required");
  });

  it("uses default IDs when request body is missing", async () => {
    const dependencies = createDependencies();

    const response = await handleNarrativeEndpoint(createRequest(), dependencies);
    const body = await response.text();

    expect(body).toContain('"runId":"run-');
    expect(body).toContain('"threadId":"thread-');
  });

  it("retries on malformed body by using defaults", async () => {
    const dependencies = createDependencies();

    dependencies.fetchUnreadEmails = vi.fn(() => Promise.resolve([]));

    const response = await handleNarrativeEndpoint(
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

  it("passes a 48-hour unread query to fetchUnreadEmails", async () => {
    const dependencies = createDependencies();

    const fetchUnreadEmails = vi.fn().mockResolvedValue([createTestEmail("email-1")]);

    dependencies.fetchUnreadEmails = fetchUnreadEmails;

    await handleNarrativeEndpoint(createRequest(), dependencies);

    const options = fetchUnreadEmails.mock.calls[0]?.[1] as { query?: string } | undefined;
    const query = options?.query;

    expect(typeof query).toBe("string");
    expect(query).toMatch(/^is:unread after:\d+ before:\d+$/u);
  });

  it("filters out emails older than the rolling 48-hour window", async () => {
    const dependencies = createDependencies();
    const now = Date.now();

    dependencies.fetchUnreadEmails = vi.fn(() =>
      Promise.resolve([
        createEmailMetadata({
          id: toValidEmailId("older"),
          threadId: "thread-older",
          subject: "Older",
          from: "sender@example.com",
          to: "you@example.com",
          date: new Date(now - (LOOKBACK_HOURS * 60 * 60 * 1000 + 1000)).toUTCString(),
          snippet: "Snippet",
          bodyText: "Body"
        }),
        createEmailMetadata({
          id: toValidEmailId("inside"),
          threadId: "thread-inside",
          subject: "Inside",
          from: "sender@example.com",
          to: "you@example.com",
          date: new Date(now - 60 * 60 * 1000).toUTCString(),
          snippet: "Snippet",
          bodyText: "Body"
        })
      ])
    );

    const response = await handleNarrativeEndpoint(createRequest(), dependencies);
    const body = await response.text();

    expect(dependencies.extractEmailInsight).toHaveBeenCalledTimes(1);
    expect(body).toContain(`"timeframeHours":${String(LOOKBACK_HOURS)}`);
  });

  it("emits RUN_ERROR when Gmail fetch fails", async () => {
    const dependencies = createDependencies();

    dependencies.fetchUnreadEmails = vi.fn(() => Promise.reject(new Error("Gmail unavailable")));

    const response = await handleNarrativeEndpoint(createRequest(), dependencies);
    const body = await response.text();

    expect(body).toContain('"type":"RUN_ERROR"');
    expect(body).toContain("Gmail unavailable");

    const textMessageEndIndex = body.indexOf('"type":"TEXT_MESSAGE_END"');
    const runErrorIndex = body.indexOf('"type":"RUN_ERROR"');

    expect(textMessageEndIndex).toBeGreaterThan(-1);
    expect(runErrorIndex).toBeGreaterThan(textMessageEndIndex);
  });

  it("emits unknown error message for non-Error failures", async () => {
    const dependencies = createDependencies();

    dependencies.fetchUnreadEmails = vi.fn(() => Promise.reject({} as Error));

    const response = await handleNarrativeEndpoint(createRequest(), dependencies);
    const body = await response.text();

    expect(body).toContain('"type":"RUN_ERROR"');
    expect(body).toContain("Unknown error");
  });

  it("continues processing after failed insight extraction", async () => {
    const dependencies = createDependencies();

    const firstEmail = createTestEmail("email-1", { subject: "First" });
    const secondEmail = createTestEmail("email-2", { subject: "Second" });

    dependencies.fetchUnreadEmails = vi.fn(() => Promise.resolve([firstEmail, secondEmail]));
    dependencies.extractEmailInsight = vi
      .fn()
      .mockRejectedValueOnce(new Error("LLM failure"))
      .mockResolvedValueOnce(createInsight("business", "fyi", "Follow up with client"));

    const response = await handleNarrativeEndpoint(createRequest(), dependencies);
    const body = await response.text();

    expect(dependencies.extractEmailInsight).toHaveBeenCalledTimes(2);
    expect(body).toContain("Follow up with client");
    expect(body).not.toContain("RUN_ERROR");
    expect(body).toContain('"type":"RUN_FINISHED"');
    const terminalCount =
      (body.match(/"type":"RUN_FINISHED"/gu)?.length ?? 0) +
      (body.match(/"type":"RUN_ERROR"/gu)?.length ?? 0);

    expect(terminalCount).toBe(1);
  });

  it("deduplicates repeated action items", () => {
    const messages: NarrativeAnalysisResult[] = [
      {
        email: createTestEmail("dup-1"),
        insight: createInsight("business", "action_required", "Review the renewal terms.")
      },
      {
        email: createTestEmail("dup-2"),
        insight: createInsight("business", "action_required", "  review the renewal terms  ")
      }
    ];

    const actionItems = extractActionItems(messages);

    expect(actionItems).toHaveLength(1);
    expect(actionItems).toEqual(["Review the renewal terms."]);
  });

  it("buildNarrative includes urgency sections without briefing or action items", () => {
    const narrative = buildNarrative({
      results: [
        {
          email: createTestEmail("business"),
          insight: createInsight("business", "action_required", "Reply to client")
        }
      ]
    });

    expect(narrative).toContain("## Action Required");
    expect(narrative).not.toContain("# 48h Inbox Narrative");
  });

  it("sorts insight sections by urgency and builds action items", async () => {
    const dependencies = createDependencies();

    const noiseEmail = createTestEmail("noise", { subject: "Noise" });
    const urgentEmail = createTestEmail("urgent", { subject: "Urgent" });
    const fyiEmail = createTestEmail("fyi", { subject: "FYI" });

    dependencies.fetchUnreadEmails = vi.fn(() =>
      Promise.resolve([noiseEmail, urgentEmail, fyiEmail])
    );
    dependencies.extractEmailInsight = vi
      .fn()
      .mockResolvedValueOnce(createInsight("automated", "noise", null))
      .mockResolvedValueOnce(
        createInsight("business", "action_required", "Renew license and check invoice")
      )
      .mockResolvedValueOnce(createInsight("personal", "fyi", "Review profile"));

    const response = await handleNarrativeEndpoint(createRequest(), dependencies);
    const body = await response.text();

    const updatesIndex = body.indexOf("## Updates");
    const actionRequiredIndex = body.indexOf("## Action Required");
    const backgroundIndex = body.indexOf("## Background");

    expect(updatesIndex).toBeGreaterThan(-1);
    expect(actionRequiredIndex).toBeGreaterThan(-1);
    expect(backgroundIndex).toBeGreaterThan(-1);
    expect(updatesIndex).toBeLessThan(actionRequiredIndex);
    expect(actionRequiredIndex).toBeLessThan(backgroundIndex);
    expect(body).toContain("Renew license and check invoice");
    expect(body).toContain("Review profile");
  });

  it("stops processing insight extraction when request is already aborted", async () => {
    const dependencies = createDependencies();
    const abortController = new AbortController();

    dependencies.fetchUnreadEmails = vi.fn(() => Promise.resolve([createTestEmail("email-1")]));
    dependencies.extractEmailInsight = vi.fn(() =>
      Promise.resolve(createInsight("personal", "fyi"))
    );

    abortController.abort();

    const response = await handleNarrativeEndpoint(
      createRequest({
        signal: abortController.signal
      }),
      dependencies
    );
    const body = await response.text();

    expect(dependencies.extractEmailInsight).toHaveBeenCalledTimes(0);
    expect(body).toContain('"type":"RUN_FINISHED"');
    expect(body).toContain('"actionItemCount":0');
    const terminalCount =
      (body.match(/"type":"RUN_FINISHED"/gu)?.length ?? 0) +
      (body.match(/"type":"RUN_ERROR"/gu)?.length ?? 0);

    expect(terminalCount).toBe(1);
  });
});
