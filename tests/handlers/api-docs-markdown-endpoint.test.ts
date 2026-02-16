import { describe, expect, it } from "vitest";

import { handleApiDocsMarkdownEndpoint } from "../../src/handlers/api-docs-markdown-endpoint.js";

describe("handleApiDocsMarkdownEndpoint", () => {
  it("returns markdown documentation", async () => {
    const response = handleApiDocsMarkdownEndpoint();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/markdown");

    const markdown = await response.text();

    expect(markdown).toContain("# Gmail Insights Agent API");
    expect(markdown).toContain("**Version:** 1.0.0");
  });

  it("includes all endpoint documentation", async () => {
    const response = handleApiDocsMarkdownEndpoint();
    const markdown = await response.text();

    expect(markdown).toContain("GET /health");
    expect(markdown).toContain("POST /agent");
    expect(markdown).toContain("POST /draft-reply");
    expect(markdown).toContain("GET /api-docs.json");
    expect(markdown).toContain("GET /api-docs.md");
  });

  it("includes base URL section", async () => {
    const response = handleApiDocsMarkdownEndpoint();
    const markdown = await response.text();

    expect(markdown).toContain("## Base URL");
    expect(markdown).toContain("http://localhost:3001");
  });

  it("includes schemas section", async () => {
    const response = handleApiDocsMarkdownEndpoint();
    const markdown = await response.text();

    expect(markdown).toContain("## Schemas");
    expect(markdown).toContain("### DraftReplyRequest");
    expect(markdown).toContain("### EmailInsight");
  });
});
