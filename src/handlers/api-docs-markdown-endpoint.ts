import { convertOpenApiToMarkdown } from "../docs/openapi-to-markdown.js";
import { generateOpenApiSpec } from "../docs/openapi-spec.js";

export function handleApiDocsMarkdownEndpoint(): Response {
  const spec = generateOpenApiSpec();
  const markdown = convertOpenApiToMarkdown(spec);

  return new Response(markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown"
    }
  });
}
