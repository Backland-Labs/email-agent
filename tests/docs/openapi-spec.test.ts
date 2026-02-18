import { describe, expect, it } from "vitest";

import { generateOpenApiSpec } from "../../src/docs/openapi-spec.js";

describe("generateOpenApiSpec", () => {
  it("generates a valid OpenAPI 3.0 spec", () => {
    const spec = generateOpenApiSpec() as {
      openapi: string;
      info: { title: string; version: string; description: string };
    };

    expect(spec.openapi).toBe("3.0.0");
    expect(spec.info).toBeDefined();
    expect(spec.info.title).toBe("Gmail Insights Agent API");
    expect(spec.info.version).toBe("1.0.0");
    expect(spec.info.description).toContain("Gmail messages");
  });

  it("includes server configuration", () => {
    const spec = generateOpenApiSpec() as {
      servers: Array<{ url: string; description: string }>;
    };

    expect(spec.servers).toBeDefined();
    expect(spec.servers).toHaveLength(1);
    expect(spec.servers[0]?.url).toBe("http://localhost:3001");
    expect(spec.servers[0]?.description).toBe("Local development server");
  });

  it("includes all endpoint paths", () => {
    const spec = generateOpenApiSpec() as { paths: Record<string, unknown> };

    expect(spec.paths).toBeDefined();
    expect(spec.paths["/health"]).toBeDefined();
    expect(spec.paths["/agent"]).toBeDefined();
    expect(spec.paths["/draft-reply"]).toBeDefined();
    expect(spec.paths["/narrative"]).toBeDefined();
    expect(spec.paths["/api-docs.json"]).toBeDefined();
    expect(spec.paths["/api-docs.md"]).toBeDefined();
  });

  it("includes schema components", () => {
    const spec = generateOpenApiSpec() as {
      components: { schemas: Record<string, unknown> };
    };

    expect(spec.components).toBeDefined();
    expect(spec.components.schemas).toBeDefined();
    expect(spec.components.schemas["DraftReplyRequest"]).toBeDefined();
    expect(spec.components.schemas["DraftReplyRunResult"]).toBeDefined();
    expect(spec.components.schemas["EmailInsight"]).toBeDefined();
    expect(spec.components.schemas["EmailMetadata"]).toBeDefined();
    expect(spec.components.schemas["NarrativeRequest"]).toBeDefined();
    expect(spec.components.schemas["NarrativeRunResult"]).toBeDefined();
  });

  it("includes GET method for health endpoint", () => {
    const spec = generateOpenApiSpec() as {
      paths: { "/health": { get: { summary: string; responses: Record<string, unknown> } } };
    };

    expect(spec.paths["/health"].get).toBeDefined();
    expect(spec.paths["/health"].get.summary).toBe("Check server health");
    expect(spec.paths["/health"].get.responses).toBeDefined();
  });

  it("includes POST method for agent endpoint", () => {
    const spec = generateOpenApiSpec() as {
      paths: { "/agent": { post: { summary: string; responses: Record<string, unknown> } } };
    };

    expect(spec.paths["/agent"].post).toBeDefined();
    expect(spec.paths["/agent"].post.summary).toBe("Stream email insights");
    expect(spec.paths["/agent"].post.responses).toBeDefined();
  });

  it("includes POST method for draft-reply endpoint with request body", () => {
    const spec = generateOpenApiSpec() as {
      paths: {
        "/draft-reply": {
          post: {
            summary: string;
            requestBody?: { required: boolean };
            responses: Record<string, unknown>;
          };
        };
      };
    };

    expect(spec.paths["/draft-reply"].post).toBeDefined();
    expect(spec.paths["/draft-reply"].post.summary).toBe("Draft a reply to an email");
    expect(spec.paths["/draft-reply"].post.requestBody?.required).toBe(true);
    expect(spec.paths["/draft-reply"].post.responses).toBeDefined();
  });

  it("includes POST method for narrative endpoint with optional request body", () => {
    const spec = generateOpenApiSpec() as {
      paths: {
        "/narrative": {
          post: {
            summary: string;
            requestBody?: { required: boolean };
            responses: Record<string, unknown>;
          };
        };
      };
    };

    expect(spec.paths["/narrative"].post).toBeDefined();
    expect(spec.paths["/narrative"].post.summary).toBe("Summarize unread inbox in markdown");
    expect(spec.paths["/narrative"].post.responses).toBeDefined();
    expect(spec.paths["/narrative"].post.requestBody?.required).toBe(false);
  });

  it("includes GET methods for api-docs endpoints", () => {
    const spec = generateOpenApiSpec() as {
      paths: {
        "/api-docs.json": { get: { summary: string } };
        "/api-docs.md": { get: { summary: string } };
      };
    };

    expect(spec.paths["/api-docs.json"].get).toBeDefined();
    expect(spec.paths["/api-docs.json"].get.summary).toContain("OpenAPI specification");

    expect(spec.paths["/api-docs.md"].get).toBeDefined();
    expect(spec.paths["/api-docs.md"].get.summary).toContain("Markdown");
  });
});
