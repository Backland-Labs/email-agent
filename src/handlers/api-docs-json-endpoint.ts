import { generateOpenApiSpec } from "../docs/openapi-spec.js";

export function handleApiDocsJsonEndpoint(): Response {
  const spec = generateOpenApiSpec();

  return Response.json(spec, {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
