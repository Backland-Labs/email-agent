import { vi } from "vitest";

import { createEmailMetadata } from "../../src/domain/email-metadata.js";
import type { EmailInsight, EmailCategory, EmailUrgency } from "../../src/domain/email-insight.js";
import type { AgentEndpointDependencies } from "../../src/handlers/agent-endpoint.js";

export const TEST_EMAIL_IDS = {
  "email-1": "17ce8a2b6f3d40a9e",
  "email-2": "17ce8a2b6f3d40a9f",
  "email-3": "17ce8a2b6f3d40aa0",
  "email-4": "17ce8a2b6f3d40aa1",
  noise: "17ce8a2b6f3d40aa2",
  biz: "17ce8a2b6f3d40aa3",
  urgent: "17ce8a2b6f3d40aa4",
  fyi: "17ce8a2b6f3d40aa5",
  news: "17ce8a2b6f3d40aa6"
} as const;

export type TestEmailAlias = keyof typeof TEST_EMAIL_IDS;

export function getTestEmailId(id: TestEmailAlias): string {
  return TEST_EMAIL_IDS[id];
}

export function createDependencies(): AgentEndpointDependencies {
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

export function createRequest(init?: RequestInit): Request {
  return new Request("http://localhost:3001/agent", { method: "POST", ...init });
}

export function createTestEmail(
  id: TestEmailAlias,
  overrides: Partial<{ subject: string; from: string; bodyText: string }> = {}
) {
  return createEmailMetadata({
    id: getTestEmailId(id),
    threadId: `thread-${id}`,
    subject: overrides.subject ?? "Test",
    from: overrides.from ?? "sender@example.com",
    to: "you@example.com",
    date: "Sat, 14 Feb 2026 12:00:00 +0000",
    snippet: "Snippet",
    bodyText: overrides.bodyText ?? "Body"
  });
}

export function createInsight(
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
