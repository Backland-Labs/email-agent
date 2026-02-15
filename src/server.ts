import { handleAgentEndpoint } from "./handlers/agent-endpoint.js";
import { handleHealthEndpoint } from "./handlers/health-endpoint.js";

const DEFAULT_PORT = 3001;
const DEFAULT_IDLE_TIMEOUT_SECONDS = 120;

export type ServerRouteHandlers = {
  handleAgentEndpoint: (request: Request) => Promise<Response>;
  handleHealthEndpoint: () => Response;
};

const defaultHandlers: ServerRouteHandlers = {
  handleAgentEndpoint,
  handleHealthEndpoint
};

export function createServerFetchHandler(handlers: ServerRouteHandlers) {
  return async (request: Request): Promise<Response> => {
    const requestUrl = new URL(request.url);

    if (requestUrl.pathname === "/agent") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      return handlers.handleAgentEndpoint(request);
    }

    if (requestUrl.pathname === "/health") {
      if (request.method !== "GET") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      return handlers.handleHealthEndpoint();
    }

    return new Response("Not Found", { status: 404 });
  };
}

export function startServer(
  port: number = getConfiguredPort(),
  handlers: ServerRouteHandlers = defaultHandlers
) {
  return getBunRuntime().serve({
    port,
    fetch: createServerFetchHandler(handlers),
    idleTimeout: getConfiguredIdleTimeoutSeconds()
  });
}

function getConfiguredPort(): number {
  const value = process.env.PORT;

  if (!value) {
    return DEFAULT_PORT;
  }

  const parsedPort = Number.parseInt(value, 10);

  if (Number.isNaN(parsedPort)) {
    return DEFAULT_PORT;
  }

  return parsedPort;
}

function getConfiguredIdleTimeoutSeconds(): number {
  const value = process.env.IDLE_TIMEOUT_SECONDS;

  if (!value) {
    return DEFAULT_IDLE_TIMEOUT_SECONDS;
  }

  const parsedIdleTimeout = Number.parseInt(value, 10);

  if (Number.isNaN(parsedIdleTimeout) || parsedIdleTimeout <= 0) {
    return DEFAULT_IDLE_TIMEOUT_SECONDS;
  }

  return parsedIdleTimeout;
}

/* c8 ignore start */
if (isMainModule()) {
  startServer();
}
/* c8 ignore stop */

function getBunRuntime(): {
  serve: (options: {
    port: number;
    fetch: (request: Request) => Promise<Response>;
    idleTimeout?: number;
  }) => unknown;
} {
  const runtime = (globalThis as { Bun?: unknown }).Bun;

  if (!runtime || typeof runtime !== "object" || !("serve" in runtime)) {
    throw new Error("Bun runtime is required to start the server");
  }

  return runtime as {
    serve: (options: {
      port: number;
      fetch: (request: Request) => Promise<Response>;
      idleTimeout?: number;
    }) => unknown;
  };
}

function isMainModule(): boolean {
  const meta = import.meta as ImportMeta & { main?: boolean };
  return meta.main;
}
