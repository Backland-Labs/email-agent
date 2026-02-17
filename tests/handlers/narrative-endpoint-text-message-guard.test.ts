import type { Auth } from "googleapis";
import { describe, expect, it, vi } from "vitest";

import type { NarrativeEndpointDependencies } from "../../src/handlers/narrative-endpoint.js";

function createRequest(): Request {
  return new Request("http://localhost:3001/narrative", { method: "POST" });
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

describe("narrative text message boundaries", () => {
  it("skips text message end when text start fails", async () => {
    vi.resetModules();
    vi.doMock("../../src/services/streaming/encode-ag-ui-events.js", async () => {
      const actual = await vi.importActual<
        typeof import("../../src/services/streaming/encode-ag-ui-events.js")
      >("../../src/services/streaming/encode-ag-ui-events.js");

      return {
        ...actual,
        encodeTextMessageStart: vi.fn(() => {
          throw new Error("TEXT_MESSAGE_START failure");
        })
      };
    });

    const { handleNarrativeEndpoint } = await import("../../src/handlers/narrative-endpoint.js");
    try {
      const response = await handleNarrativeEndpoint(createRequest(), createDependencies());
      const body = await response.text();

      expect(body).toContain('"type":"RUN_STARTED"');
      expect(body).toContain('"type":"RUN_ERROR"');
      expect(body).toContain("TEXT_MESSAGE_START failure");
      expect(body).not.toContain('"type":"TEXT_MESSAGE_END"');
      expect(body).not.toContain('"type":"RUN_FINISHED"');
    } finally {
      vi.unmock("../../src/services/streaming/encode-ag-ui-events.js");
      vi.resetModules();
    }
  });
});
