import { handleAgentEndpoint } from "./handlers/agent-endpoint.js";
import { handleApiDocsJsonEndpoint } from "./handlers/api-docs-json-endpoint.js";
import { handleApiDocsMarkdownEndpoint } from "./handlers/api-docs-markdown-endpoint.js";
import { handleDraftReplyEndpoint } from "./handlers/draft-reply-endpoint.js";
import { handleHealthEndpoint } from "./handlers/health-endpoint.js";
import { handleNarrativeEndpoint } from "./handlers/narrative-endpoint.js";
import { logger } from "./observability/logger.js";

const DEFAULT_PORT = 3001;
const DEFAULT_IDLE_TIMEOUT_SECONDS = 120;

const serverLogger = logger.child({ service: "server" });

const SERVER_LOG_CODES = {
  methodNotAllowed: "method_not_allowed",
  routeNotFound: "route_not_found",
  requestFailed: "request_failed",
  runtimeUnavailable: "runtime_unavailable",
  invalidPort: "invalid_port",
  invalidIdleTimeout: "invalid_idle_timeout"
} as const;

export type ServerRouteHandlers = {
  handleAgentEndpoint: (request: Request) => Promise<Response>;
  handleDraftReplyEndpoint: (request: Request) => Promise<Response>;
  handleNarrativeEndpoint: (request: Request) => Promise<Response>;
  handleHealthEndpoint: () => Response;
  handleApiDocsJsonEndpoint: () => Response;
  handleApiDocsMarkdownEndpoint: () => Response;
};

type ServerRouteMethod = "GET" | "POST";

type ServerRouteDispatch = {
  route: "/agent" | "/draft-reply" | "/narrative" | "/health" | "/api-docs.json" | "/api-docs.md";
  expectedMethod: ServerRouteMethod;
  handle: () => Promise<Response> | Response;
};

const defaultHandlers: ServerRouteHandlers = {
  handleAgentEndpoint,
  handleDraftReplyEndpoint,
  handleNarrativeEndpoint,
  handleHealthEndpoint,
  handleApiDocsJsonEndpoint,
  handleApiDocsMarkdownEndpoint
};

export function createServerFetchHandler(handlers: ServerRouteHandlers) {
  return async (request: Request): Promise<Response> => {
    const startedAt = Date.now();
    const requestLogger = serverLogger.child({ method: request.method });
    const routeDispatch = resolveRouteDispatch(new URL(request.url).pathname, request, handlers);

    if (!routeDispatch) {
      requestLogger.warn(
        {
          event: "server.request_rejected",
          durationMs: Date.now() - startedAt,
          code: SERVER_LOG_CODES.routeNotFound,
          status: 404
        },
        "Rejected request for unknown route"
      );
      return new Response("Not Found", { status: 404 });
    }

    const routeLogger = requestLogger.child({ route: routeDispatch.route });

    if (request.method !== routeDispatch.expectedMethod) {
      routeLogger.warn(
        {
          event: "server.request_rejected",
          durationMs: Date.now() - startedAt,
          code: SERVER_LOG_CODES.methodNotAllowed,
          expectedMethod: routeDispatch.expectedMethod,
          status: 405
        },
        "Rejected request due to unsupported method"
      );
      return new Response("Method Not Allowed", { status: 405 });
    }

    try {
      return await Promise.resolve(routeDispatch.handle());
    } catch (error) {
      routeLogger.error(
        {
          event: "server.request_failed",
          durationMs: Date.now() - startedAt,
          code: SERVER_LOG_CODES.requestFailed,
          err: error
        },
        "Request handler failed"
      );
      throw error;
    }
  };
}

export function startServer(
  port: number = getConfiguredPort(),
  handlers: ServerRouteHandlers = defaultHandlers
) {
  const bunRuntime = getBunRuntime();
  const idleTimeoutSeconds = getConfiguredIdleTimeoutSeconds();

  serverLogger.info(
    {
      event: "server.started",
      port,
      idleTimeoutSeconds
    },
    "Started HTTP server"
  );

  return bunRuntime.serve({
    port,
    fetch: createServerFetchHandler(handlers),
    idleTimeout: idleTimeoutSeconds
  });
}

function getConfiguredPort(): number {
  const value = process.env.PORT;

  if (!value) {
    return DEFAULT_PORT;
  }

  const parsedPort = Number.parseInt(value, 10);

  if (Number.isNaN(parsedPort)) {
    serverLogger.warn(
      {
        event: "server.port_defaulted",
        code: SERVER_LOG_CODES.invalidPort,
        configuredPort: value,
        defaultPort: DEFAULT_PORT
      },
      "Defaulted server port because configured value is invalid"
    );
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
    serverLogger.warn(
      {
        event: "server.idle_timeout_defaulted",
        code: SERVER_LOG_CODES.invalidIdleTimeout,
        configuredIdleTimeoutSeconds: value,
        defaultIdleTimeoutSeconds: DEFAULT_IDLE_TIMEOUT_SECONDS
      },
      "Defaulted idle timeout because configured value is invalid"
    );
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
    const error = new Error("Bun runtime is required to start the server");

    serverLogger.error(
      {
        event: "server.start_failed",
        code: SERVER_LOG_CODES.runtimeUnavailable,
        err: error
      },
      "Failed to start server"
    );

    throw error;
  }

  return runtime as {
    serve: (options: {
      port: number;
      fetch: (request: Request) => Promise<Response>;
      idleTimeout?: number;
    }) => unknown;
  };
}

function resolveRouteDispatch(
  pathname: string,
  request: Request,
  handlers: ServerRouteHandlers
): ServerRouteDispatch | null {
  if (pathname === "/agent") {
    return {
      route: "/agent",
      expectedMethod: "POST",
      handle: () => handlers.handleAgentEndpoint(request)
    };
  }

  if (pathname === "/draft-reply") {
    return {
      route: "/draft-reply",
      expectedMethod: "POST",
      handle: () => handlers.handleDraftReplyEndpoint(request)
    };
  }

  if (pathname === "/narrative") {
    return {
      route: "/narrative",
      expectedMethod: "POST",
      handle: () => handlers.handleNarrativeEndpoint(request)
    };
  }

  if (pathname === "/health") {
    return {
      route: "/health",
      expectedMethod: "GET",
      handle: () => handlers.handleHealthEndpoint()
    };
  }

  if (pathname === "/api-docs.json") {
    return {
      route: "/api-docs.json",
      expectedMethod: "GET",
      handle: () => handlers.handleApiDocsJsonEndpoint()
    };
  }

  if (pathname === "/api-docs.md") {
    return {
      route: "/api-docs.md",
      expectedMethod: "GET",
      handle: () => handlers.handleApiDocsMarkdownEndpoint()
    };
  }

  return null;
}

function isMainModule(): boolean {
  const meta = import.meta as ImportMeta & { main?: boolean };
  return meta.main;
}
