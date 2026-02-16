import { describe, expect, it } from "vitest";

import { handleApiDocsJsonEndpoint } from "../../src/handlers/api-docs-json-endpoint.js";

describe("handleApiDocsJsonEndpoint", () => {
  it("returns OpenAPI spec in JSON format", async () => {
    const response = handleApiDocsJsonEndpoint();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");

    const spec = (await response.json()) as {
      openapi: string;
      info: { title: string; version: string };
      paths: Record<string, unknown>;
    };

    expect(spec.openapi).toBe("3.0.0");
    expect(spec.info.title).toBe("Gmail Insights Agent API");
    expect(spec.info.version).toBe("1.0.0");
    expect(spec.paths).toBeDefined();
  });

  it("includes all API endpoints in the spec", async () => {
    const response = handleApiDocsJsonEndpoint();
    const spec = (await response.json()) as { paths: Record<string, unknown> };

    expect(spec.paths["/health"]).toBeDefined();
    expect(spec.paths["/agent"]).toBeDefined();
    expect(spec.paths["/draft-reply"]).toBeDefined();
    expect(spec.paths["/api-docs.json"]).toBeDefined();
    expect(spec.paths["/api-docs.md"]).toBeDefined();
  });

  it("includes schema definitions in components", async () => {
    const response = handleApiDocsJsonEndpoint();
    const spec = (await response.json()) as {
      components?: { schemas?: Record<string, unknown> };
    };

    expect(spec.components?.schemas).toBeDefined();
    expect(spec.components?.schemas?.["DraftReplyRequest"]).toBeDefined();
    expect(spec.components?.schemas?.["DraftReplyRunResult"]).toBeDefined();
    expect(spec.components?.schemas?.["EmailInsight"]).toBeDefined();
    expect(spec.components?.schemas?.["EmailMetadata"]).toBeDefined();
  });
});
