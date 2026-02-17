import type { Auth } from "googleapis";
import { describe, expect, it, vi } from "vitest";

import { createEmailMetadata } from "../../src/domain/email-metadata.js";
import type { EmailCategory, EmailInsight, EmailUrgency } from "../../src/domain/email-insight.js";
import {
  handleNarrativeEndpoint,
  type NarrativeEndpointDependencies
} from "../../src/handlers/narrative-endpoint.js";
import { LOOKBACK_HOURS } from "../../src/handlers/narrative-endpoint-runtime.js";

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
  const normalized = seed.toLowerCase().replace(/[^a-z0-9]/gu, "");
  const suffix = (normalized.length > 0 ? normalized : "x").padEnd(10, "0").slice(0, 10);

  return `17ce8a2b6f3d${suffix}`;
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

describe("handleNarrativeEndpoint contract invariants", () => {
  it("emits exactly one terminal event for both success and hard failures", async () => {
    const successDependencies = createDependencies();
    const successResponse = await handleNarrativeEndpoint(createRequest(), successDependencies);
    const successBody = await successResponse.text();

    expect(getTerminalEventCount(successBody)).toBe(1);

    const failingDependencies = createDependencies();
    failingDependencies.fetchUnreadEmails = vi.fn(() => Promise.reject(new Error("down")));
    const errorResponse = await handleNarrativeEndpoint(createRequest(), failingDependencies);
    const errorBody = await errorResponse.text();

    expect(errorBody).toContain('"type":"RUN_ERROR"');
    expect(getTerminalEventCount(errorBody)).toBe(1);
  });

  it("emits TEXT_MESSAGE_END before RUN_ERROR when error occurs after TEXT_MESSAGE_START", async () => {
    const dependencies = createDependencies();

    dependencies.fetchUnreadEmails = vi.fn(() => Promise.reject(new Error("Gmail down")));

    const response = await handleNarrativeEndpoint(createRequest(), dependencies);
    const body = await response.text();

    const textMessageStartIndex = body.indexOf('"type":"TEXT_MESSAGE_START"');
    const textMessageEndIndex = body.indexOf('"type":"TEXT_MESSAGE_END"');
    const runErrorIndex = body.indexOf('"type":"RUN_ERROR"');

    expect(textMessageStartIndex).toBeGreaterThan(-1);
    expect(textMessageEndIndex).toBeGreaterThan(textMessageStartIndex);
    expect(runErrorIndex).toBeGreaterThan(textMessageEndIndex);
  });

  it("includes run result metadata matching narrative action items", async () => {
    const dependencies = createDependencies();

    dependencies.fetchUnreadEmails = vi.fn(() => Promise.resolve([createTestEmail("email-1")]));
    dependencies.extractEmailInsight = vi.fn(() =>
      Promise.resolve(createInsight("business", "action_required", "Review contract terms"))
    );

    const response = await handleNarrativeEndpoint(createRequest(), dependencies);
    const body = await response.text();

    expect(body).toContain('"type":"RUN_FINISHED"');
    expect(body).toContain(`"timeframeHours":${String(LOOKBACK_HOURS)}`);
    expect(body).toContain('"actionItemCount":1');
  });
});

function getTerminalEventCount(sseBody: string): number {
  const finishedCount = sseBody.match(/"type":"RUN_FINISHED"/gu)?.length ?? 0;
  const errorCount = sseBody.match(/"type":"RUN_ERROR"/gu)?.length ?? 0;

  return finishedCount + errorCount;
}
