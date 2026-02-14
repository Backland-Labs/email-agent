import { describe, expect, it } from "vitest";

import * as indexExports from "../src/index.js";

describe("index exports", () => {
  it("re-exports core domain and service functions", () => {
    expect(typeof indexExports.createEmailMetadata).toBe("function");
    expect(typeof indexExports.parseEmailId).toBe("function");
    expect(typeof indexExports.createAuthClient).toBe("function");
    expect(typeof indexExports.parseGmailMessage).toBe("function");
    expect(typeof indexExports.fetchUnreadEmails).toBe("function");
    expect(typeof indexExports.buildInsightPrompt).toBe("function");
    expect(typeof indexExports.extractEmailInsight).toBe("function");
    expect(typeof indexExports.handleAgentEndpoint).toBe("function");
    expect(typeof indexExports.handleHealthEndpoint).toBe("function");
    expect(typeof indexExports.createServerFetchHandler).toBe("function");
    expect(typeof indexExports.startServer).toBe("function");
  });
});
