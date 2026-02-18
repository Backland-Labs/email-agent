import "../domain/zod-openapi-extensions.js";

import { OpenAPIRegistry, OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { draftReplyRequestSchema } from "../domain/draft-reply-request.js";
import { draftReplyRunResultSchema } from "../domain/draft-reply-result.js";
import { narrativeRequestSchema } from "../domain/narrative-request.js";
import { narrativeRunResultSchema } from "../domain/narrative-run-result.js";
import { emailInsightSchema } from "../domain/email-insight.js";
import { emailMetadataSchema } from "../domain/email-metadata.js";

const registry = new OpenAPIRegistry();

// Health endpoint
registry.registerPath({
  method: "get",
  path: "/health",
  description: "Health check endpoint",
  summary: "Check server health",
  responses: {
    200: {
      description: "Server is healthy",
      content: {
        "application/json": {
          schema: z.object({
            status: z.literal("ok")
          })
        }
      }
    }
  }
});

// Agent endpoint
registry.registerPath({
  method: "post",
  path: "/agent",
  description:
    "Streams email insights for unread Gmail messages via Server-Sent Events (SSE). " +
    "Returns AG-UI compatible event stream with insights for up to 20 unread emails.",
  summary: "Stream email insights",
  responses: {
    200: {
      description:
        "SSE stream containing AG-UI events (RUN_STARTED, text chunks, RUN_FINISHED). " +
        "Each insight includes email metadata and structured analysis.",
      content: {
        "text/event-stream": {
          schema: z.object({
            event: z.enum(["RUN_STARTED", "text", "RUN_FINISHED"]),
            data: z.string()
          })
        }
      }
    },
    405: {
      description: "Method not allowed - only POST is supported"
    }
  }
});

// Narrative endpoint
registry.registerPath({
  method: "post",
  path: "/narrative",
  description:
    "Summarizes unread Gmail inbox messages from a rolling 48-hour window into a concise markdown brief. " +
    "Returns AG-UI compatible SSE events with narrative text plus action items and a structured run result.",
  summary: "Summarize unread inbox in markdown",
  request: {
    body: {
      description:
        "Optional run metadata. Malformed or non-object JSON falls back to safe defaults for runId/threadId.",
      content: {
        "application/json": {
          schema: narrativeRequestSchema
        }
      },
      required: false
    }
  },
  responses: {
    200: {
      description:
        "SSE stream containing AG-UI events with concise narrative text and run result summary " +
        "(timeframeHours=48 and actionItemCount).",
      content: {
        "text/event-stream": {
          schema: z.object({
            event: z.enum(["RUN_STARTED", "text", "RUN_FINISHED"]),
            data: z.string()
          })
        }
      }
    },
    405: {
      description: "Method not allowed - only POST is supported"
    }
  }
});

// Draft reply endpoint
registry.registerPath({
  method: "post",
  path: "/draft-reply",
  description:
    "Drafts a reply to a specific Gmail message with thread-aware context. " +
    "Streams the draft via SSE and persists it as a Gmail draft (does not send).",
  summary: "Draft a reply to an email",
  request: {
    body: {
      description: "Draft reply request parameters",
      content: {
        "application/json": {
          schema: draftReplyRequestSchema
        }
      },
      required: true
    }
  },
  responses: {
    200: {
      description:
        "SSE stream containing AG-UI events with draft reply content. " +
        "RUN_FINISHED includes gmailDraftId and metadata.",
      content: {
        "text/event-stream": {
          schema: z.object({
            event: z.enum(["RUN_STARTED", "text", "RUN_FINISHED"]),
            data: z.string()
          })
        }
      }
    },
    400: {
      description: "Invalid request body - missing or malformed emailId"
    },
    405: {
      description: "Method not allowed - only POST is supported"
    }
  }
});

// API docs endpoints
registry.registerPath({
  method: "get",
  path: "/api-docs.json",
  description: "Returns the OpenAPI specification in JSON format",
  summary: "Get OpenAPI specification (JSON)",
  responses: {
    200: {
      description: "OpenAPI 3.0 specification",
      content: {
        "application/json": {
          schema: z.object({})
        }
      }
    }
  }
});

registry.registerPath({
  method: "get",
  path: "/api-docs.md",
  description: "Returns API documentation in Markdown format",
  summary: "Get API documentation (Markdown)",
  responses: {
    200: {
      description: "API documentation in Markdown",
      content: {
        "text/markdown": {
          schema: z.string()
        }
      }
    }
  }
});

// Register schemas as components
registry.register("DraftReplyRequest", draftReplyRequestSchema);
registry.register("DraftReplyRunResult", draftReplyRunResultSchema);
registry.register("NarrativeRequest", narrativeRequestSchema);
registry.register("NarrativeRunResult", narrativeRunResultSchema);
registry.register("EmailInsight", emailInsightSchema);
registry.register("EmailMetadata", emailMetadataSchema);

const generator = new OpenApiGeneratorV3(registry.definitions);

export const openApiSpec = generator.generateDocument({
  openapi: "3.0.0",
  info: {
    version: "1.0.0",
    title: "Gmail Insights Agent API",
    description:
      "A Bun + TypeScript agent that reads unread Gmail messages and streams structured insights " +
      "over AG-UI-compatible SSE endpoints. Supports email insight extraction and draft reply generation."
  },
  servers: [
    {
      url: "http://localhost:3001",
      description: "Local development server"
    }
  ]
});

export function generateOpenApiSpec(): unknown {
  return openApiSpec;
}
