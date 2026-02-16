import { describe, expect, it } from "vitest";

import { convertOpenApiToMarkdown } from "../../src/docs/openapi-to-markdown.js";

describe("convertOpenApiToMarkdown", () => {
  it("converts minimal OpenAPI spec to markdown", () => {
    const spec = {
      openapi: "3.0.0",
      info: {
        title: "Test API",
        version: "1.0.0"
      },
      paths: {}
    };

    const markdown = convertOpenApiToMarkdown(spec);

    expect(markdown).toContain("# Test API");
    expect(markdown).toContain("**Version:** 1.0.0");
  });

  it("includes API description when present", () => {
    const spec = {
      openapi: "3.0.0",
      info: {
        title: "Test API",
        version: "1.0.0",
        description: "This is a test API"
      },
      paths: {}
    };

    const markdown = convertOpenApiToMarkdown(spec);

    expect(markdown).toContain("This is a test API");
  });

  it("includes server information", () => {
    const spec = {
      openapi: "3.0.0",
      info: {
        title: "Test API",
        version: "1.0.0"
      },
      servers: [
        {
          url: "http://localhost:3000",
          description: "Local server"
        }
      ],
      paths: {}
    };

    const markdown = convertOpenApiToMarkdown(spec);

    expect(markdown).toContain("## Base URL");
    expect(markdown).toContain("`http://localhost:3000`");
    expect(markdown).toContain("Local server");
  });

  it("converts endpoint with basic info", () => {
    const spec = {
      openapi: "3.0.0",
      info: {
        title: "Test API",
        version: "1.0.0"
      },
      paths: {
        "/test": {
          get: {
            summary: "Test endpoint",
            description: "This is a test endpoint"
          }
        }
      }
    };

    const markdown = convertOpenApiToMarkdown(spec);

    expect(markdown).toContain("### GET /test");
    expect(markdown).toContain("**Test endpoint**");
    expect(markdown).toContain("This is a test endpoint");
  });

  it("includes request parameters", () => {
    const spec = {
      openapi: "3.0.0",
      info: {
        title: "Test API",
        version: "1.0.0"
      },
      paths: {
        "/test": {
          get: {
            summary: "Test endpoint",
            parameters: [
              {
                name: "id",
                in: "query",
                required: true,
                description: "Test ID"
              },
              {
                name: "cursor",
                in: "query"
              }
            ]
          }
        }
      }
    };

    const markdown = convertOpenApiToMarkdown(spec);

    expect(markdown).toContain("**Parameters:**");
    expect(markdown).toContain("`id` (query) (required)");
    expect(markdown).toContain("`cursor` (query) (optional)");
    expect(markdown).toContain("Test ID");
  });

  it("includes request body information", () => {
    const spec = {
      openapi: "3.0.0",
      info: {
        title: "Test API",
        version: "1.0.0"
      },
      paths: {
        "/test": {
          post: {
            summary: "Test endpoint",
            requestBody: {
              description: "Request body",
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      name: { type: "string" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    };

    const markdown = convertOpenApiToMarkdown(spec);

    expect(markdown).toContain("**Request Body:**");
    expect(markdown).toContain("Request body");
    expect(markdown).toContain("Content-Type: application/json");
    expect(markdown).toContain("```json");
  });

  it("includes response information", () => {
    const spec = {
      openapi: "3.0.0",
      info: {
        title: "Test API",
        version: "1.0.0"
      },
      paths: {
        "/test": {
          get: {
            summary: "Test endpoint",
            responses: {
              "200": {
                description: "Success response",
                content: {
                  "application/json": {
                    schema: { type: "object" }
                  }
                }
              },
              "400": {}
            }
          }
        }
      }
    };

    const markdown = convertOpenApiToMarkdown(spec);

    expect(markdown).toContain("**Responses:**");
    expect(markdown).toContain("**200**: Success response");
    expect(markdown).toContain("Content-Type: application/json");
    expect(markdown).toContain("**400**: No description");
  });

  it("includes schema definitions", () => {
    const spec = {
      openapi: "3.0.0",
      info: {
        title: "Test API",
        version: "1.0.0"
      },
      paths: {},
      components: {
        schemas: {
          TestSchema: {
            type: "object",
            properties: {
              id: { type: "string" }
            }
          }
        }
      }
    };

    const markdown = convertOpenApiToMarkdown(spec);

    expect(markdown).toContain("## Schemas");
    expect(markdown).toContain("### TestSchema");
    expect(markdown).toContain("```json");
  });

  it("handles endpoints with multiple methods", () => {
    const spec = {
      openapi: "3.0.0",
      info: {
        title: "Test API",
        version: "1.0.0"
      },
      paths: {
        "/test": {
          get: {
            summary: "Get test"
          },
          post: {
            summary: "Create test"
          }
        }
      }
    };

    const markdown = convertOpenApiToMarkdown(spec);

    expect(markdown).toContain("### GET /test");
    expect(markdown).toContain("**Get test**");
    expect(markdown).toContain("### POST /test");
    expect(markdown).toContain("**Create test**");
  });
});
