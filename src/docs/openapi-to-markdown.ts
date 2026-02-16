type OpenApiSpec = {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{
    url: string;
    description?: string;
  }>;
  paths: Record<
    string,
    Record<
      string,
      {
        summary?: string;
        description?: string;
        parameters?: Array<{
          name: string;
          in: string;
          required?: boolean;
          schema?: unknown;
          description?: string;
        }>;
        requestBody?: {
          description?: string;
          required?: boolean;
          content?: Record<string, { schema?: unknown }>;
        };
        responses?: Record<
          string,
          {
            description?: string;
            content?: Record<string, { schema?: unknown }>;
          }
        >;
      }
    >
  >;
  components?: {
    schemas?: Record<string, unknown>;
  };
};

export function convertOpenApiToMarkdown(spec: unknown): string {
  const openApiSpec = spec as OpenApiSpec;

  const lines: string[] = [];

  lines.push(`# ${openApiSpec.info.title}`);
  lines.push("");
  lines.push(`**Version:** ${openApiSpec.info.version}`);
  lines.push("");

  if (openApiSpec.info.description) {
    lines.push(openApiSpec.info.description);
    lines.push("");
  }

  if (openApiSpec.servers && openApiSpec.servers.length > 0) {
    lines.push("## Base URL");
    lines.push("");
    for (const server of openApiSpec.servers) {
      lines.push(`- \`${server.url}\``);
      if (server.description) {
        lines.push(`  ${server.description}`);
      }
    }
    lines.push("");
  }

  lines.push("## Endpoints");
  lines.push("");

  for (const [path, methods] of Object.entries(openApiSpec.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      lines.push(`### ${method.toUpperCase()} ${path}`);
      lines.push("");

      if (operation.summary) {
        lines.push(`**${operation.summary}**`);
        lines.push("");
      }

      if (operation.description) {
        lines.push(operation.description);
        lines.push("");
      }

      if (operation.parameters && operation.parameters.length > 0) {
        lines.push("**Parameters:**");
        lines.push("");
        for (const param of operation.parameters) {
          const required = param.required ? " (required)" : " (optional)";
          lines.push(`- \`${param.name}\` (${param.in})${required}`);
          if (param.description) {
            lines.push(`  ${param.description}`);
          }
        }
        lines.push("");
      }

      if (operation.requestBody) {
        lines.push("**Request Body:**");
        lines.push("");
        if (operation.requestBody.description) {
          lines.push(operation.requestBody.description);
          lines.push("");
        }
        if (operation.requestBody.content) {
          const contentTypes = Object.keys(operation.requestBody.content);
          lines.push(`Content-Type: ${contentTypes.join(", ")}`);
          lines.push("");

          if (operation.requestBody.content["application/json"]?.schema) {
            lines.push("```json");
            lines.push(
              JSON.stringify(operation.requestBody.content["application/json"].schema, null, 2)
            );
            lines.push("```");
            lines.push("");
          }
        }
      }

      if (operation.responses) {
        lines.push("**Responses:**");
        lines.push("");
        for (const [statusCode, response] of Object.entries(operation.responses)) {
          lines.push(`- **${statusCode}**: ${response.description || "No description"}`);

          if (response.content) {
            const contentTypes = Object.keys(response.content);
            lines.push(`  - Content-Type: ${contentTypes.join(", ")}`);
          }
        }
        lines.push("");
      }

      lines.push("---");
      lines.push("");
    }
  }

  if (openApiSpec.components?.schemas) {
    lines.push("## Schemas");
    lines.push("");

    for (const [schemaName, schemaDefinition] of Object.entries(openApiSpec.components.schemas)) {
      lines.push(`### ${schemaName}`);
      lines.push("");
      lines.push("```json");
      lines.push(JSON.stringify(schemaDefinition, null, 2));
      lines.push("```");
      lines.push("");
    }
  }

  return lines.join("\n");
}
