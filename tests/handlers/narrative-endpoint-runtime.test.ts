import { describe, expect, it, vi } from "vitest";

import type { EmailInsight } from "../../src/domain/email-insight.js";
import { createEmailMetadata } from "../../src/domain/email-metadata.js";
import {
  MAX_ACTION_ITEMS,
  LOOKBACK_HOURS,
  analyzeEmails,
  buildLookbackQuery,
  buildNarrative,
  extractActionItems,
  filterEmailsInLookbackWindow,
  orderByPriorityAndCategory,
  parseNarrativeRequestBody,
  parseNarrativeRequestBodyAsObject,
  resolveLookbackWindow,
  resolveNarrativeRunContext,
  toErrorMessage,
  type NarrativeAnalysisResult
} from "../../src/handlers/narrative-endpoint-runtime.js";

describe("narrative runtime helpers", () => {
  function toValidEmailId(seed: string): string {
    const normalized = seed.toLowerCase().replace(/[^a-z0-9]/gu, "");
    const suffix = (normalized.length > 0 ? normalized : "x").padEnd(10, "0").slice(0, 10);

    return `17ce8a2b6f3d${suffix}`;
  }

  function createTestEmail(id: string) {
    const emailId = toValidEmailId(id);

    return createEmailMetadata({
      id: emailId,
      threadId: `thread-${emailId}`,
      subject: "Test",
      from: "Alice <alice@example.com>",
      to: "you@example.com",
      date: "Sat, 14 Feb 2026 12:00:00 +0000",
      snippet: "Snippet",
      bodyText: "Body"
    });
  }

  function createInsight(
    urgency: "action_required" | "fyi" | "noise",
    action: string | null
  ): EmailInsight {
    return {
      summary: `${urgency} summary`,
      category: "business",
      urgency,
      action
    };
  }

  it("keeps default run IDs when request body is absent", async () => {
    const request = new Request("http://localhost:3001/narrative", {
      method: "POST"
    });
    const parsed = await parseNarrativeRequestBody(request);
    const context = resolveNarrativeRunContext(parsed, "request-123");

    expect(context).toEqual({
      runId: "run-request-123",
      threadId: "thread-request-123"
    });
  });

  it("treats malformed request body as missing metadata", async () => {
    const request = new Request("http://localhost:3001/narrative", {
      method: "POST",
      body: "{invalid-json"
    });
    const parsed = parseNarrativeRequestBodyAsObject(await parseNarrativeRequestBody(request));

    expect(parsed).toEqual({});
  });

  it("parses narrative request payload only when schema-valid", () => {
    const parsed = parseNarrativeRequestBodyAsObject({ runId: "run-1", threadId: "thread-1" });

    expect(parsed).toEqual({ runId: "run-1", threadId: "thread-1" });
    expect(parseNarrativeRequestBodyAsObject({ runId: "" })).toEqual({});
    expect(parseNarrativeRequestBodyAsObject("invalid")).toEqual({});
  });

  it("builds epoch-based lookback query for exact rolling 48-hour window", () => {
    const nowMs = Date.parse("2026-02-16T12:00:00.000Z");

    expect(buildLookbackQuery(nowMs)).toBe("is:unread after:1771070399 before:1771243201");
    expect(LOOKBACK_HOURS).toBe(48);
  });

  it("resolves lookback window boundaries for inclusive timestamp checks", () => {
    const nowMs = Date.parse("2026-02-16T12:00:00.000Z");
    const window = resolveLookbackWindow(nowMs);

    expect(window.startMs).toBe(Date.parse("2026-02-14T12:00:00.000Z"));
    expect(window.endMs).toBe(nowMs);
  });

  it("filters messages to exact 48-hour range including boundary timestamps", () => {
    const nowMs = Date.parse("2026-02-16T12:00:00.000Z");

    const includedAtStart = createEmailMetadata({
      id: toValidEmailId("start"),
      threadId: "thread-start",
      subject: "Start",
      from: "sender@example.com",
      to: "you@example.com",
      date: "Sat, 14 Feb 2026 12:00:00 +0000",
      snippet: "Snippet",
      bodyText: "Body"
    });
    const includedAtEnd = createEmailMetadata({
      id: toValidEmailId("end"),
      threadId: "thread-end",
      subject: "End",
      from: "sender@example.com",
      to: "you@example.com",
      date: "Mon, 16 Feb 2026 12:00:00 +0000",
      snippet: "Snippet",
      bodyText: "Body"
    });
    const excludedBeforeStart = createEmailMetadata({
      id: toValidEmailId("before"),
      threadId: "thread-before",
      subject: "Before",
      from: "sender@example.com",
      to: "you@example.com",
      date: "Sat, 14 Feb 2026 11:59:59 +0000",
      snippet: "Snippet",
      bodyText: "Body"
    });
    const excludedInvalidDate = createEmailMetadata({
      id: toValidEmailId("invalid-date"),
      threadId: "thread-invalid-date",
      subject: "Invalid",
      from: "sender@example.com",
      to: "you@example.com",
      date: "not-a-date",
      snippet: "Snippet",
      bodyText: "Body"
    });

    const filtered = filterEmailsInLookbackWindow(
      [excludedBeforeStart, includedAtStart, includedAtEnd, excludedInvalidDate],
      nowMs
    );

    expect(filtered.map((email) => email.id)).toEqual([
      toValidEmailId("start"),
      toValidEmailId("end")
    ]);
  });

  it("analyzeEmails respects abort signals and continues after failures", async () => {
    const signal = new AbortController().signal;

    const results: NarrativeAnalysisResult[] = await analyzeEmails({
      emails: [createTestEmail("a"), createTestEmail("b")],
      signal,
      model: "anthropic:test",
      extractEmailInsight: vi
        .fn()
        .mockRejectedValueOnce(new Error("failed"))
        .mockResolvedValueOnce(createInsight("fyi", null)),
      onInsight: vi.fn(),
      onFailure: vi.fn(),
      onAbort: vi.fn()
    });

    expect(results).toHaveLength(1);
    expect(results.at(0)?.email.id).toBe(toValidEmailId("b"));
    expect(results.at(0)?.insight.urgency).toBe("fyi");
  });

  it("extracts and deduplicates action items", () => {
    const insights: NarrativeAnalysisResult[] = [
      {
        email: createTestEmail("a"),
        insight: createInsight("action_required", "Reply to client now.")
      },
      {
        email: createTestEmail("b"),
        insight: createInsight("action_required", "reply to client now")
      }
    ];

    expect(extractActionItems(insights)).toEqual(["Reply to client now."]);
  });

  it("skips blank action strings after trimming", () => {
    const insights: NarrativeAnalysisResult[] = [
      {
        email: createTestEmail("blank"),
        insight: createInsight("action_required", "   ")
      }
    ];

    expect(extractActionItems(insights)).toEqual([]);
  });

  it("caps action items and keeps stable first-seen ordering", () => {
    const insights: NarrativeAnalysisResult[] = [
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
      "Six",
      "Seven"
    ].map((action, index) => ({
      email: createTestEmail(String(index)),
      insight: createInsight("action_required", action)
    }));

    expect(extractActionItems(insights)).toEqual(["One", "Two", "Three", "Four", "Five", "Six"]);
    expect(MAX_ACTION_ITEMS).toBe(6);
  });

  it("orders insights by urgency then category", () => {
    const insights: NarrativeAnalysisResult[] = [
      {
        email: createEmailMetadata({
          id: toValidEmailId("b"),
          threadId: "thread-1",
          subject: "B",
          from: "a@example.com",
          to: "you@example.com",
          date: "Sat, 14 Feb 2026 12:00:00 +0000",
          snippet: "s",
          bodyText: "b"
        }),
        insight: createInsight("noise", null)
      },
      {
        email: createEmailMetadata({
          id: toValidEmailId("a"),
          threadId: "thread-1",
          subject: "A",
          from: "b@example.com",
          to: "you@example.com",
          date: "Sat, 14 Feb 2026 12:00:00 +0000",
          snippet: "s",
          bodyText: "a"
        }),
        insight: createInsight("action_required", "Do this")
      }
    ];

    const sorted = orderByPriorityAndCategory(insights);

    expect(sorted.at(0)?.insight.urgency).toBe("action_required");
    expect(sorted.at(1)?.insight.urgency).toBe("noise");
  });

  it("builds readable narrative for empty and non-empty insights", () => {
    const noResultsNarrative = buildNarrative({ results: [] });

    expect(noResultsNarrative).toContain("No high-signal updates were found in the last 48 hours.");

    const withResults = buildNarrative({
      results: [
        {
          email: createTestEmail("a"),
          insight: {
            summary: "Update",
            category: "personal",
            urgency: "fyi",
            action: "Draft a response"
          }
        }
      ]
    });

    expect(withResults).toContain("## Updates");
    expect(withResults).toContain("- Alice: Update\n  -> Draft a response");
  });

  it("falls back to raw sender value when sender name cannot be parsed", () => {
    const narrative = buildNarrative({
      results: [
        {
          email: createEmailMetadata({
            id: toValidEmailId("raw"),
            threadId: "thread-raw",
            subject: "Raw",
            from: "<invalid-from>",
            to: "you@example.com",
            date: "Sat, 14 Feb 2026 12:00:00 +0000",
            snippet: "Snippet",
            bodyText: "Body"
          }),
          insight: {
            summary: "Sender fallback check",
            category: "business",
            urgency: "fyi",
            action: null
          }
        }
      ]
    });

    expect(narrative).toContain("- <invalid-from>: Sender fallback check");
  });

  it("uses deterministic fallback text for no-results case", () => {
    const noResults = buildNarrative({ results: [] });

    expect(noResults).toContain("No high-signal updates were found in the last 48 hours.");
  });

  it("returns Unknown error message for non-error failure values", () => {
    expect(toErrorMessage("boom")).toBe("Unknown error");
  });
});
