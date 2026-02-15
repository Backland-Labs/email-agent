import { describe, expect, it, vi } from "vitest";

import { createServerFetchHandler, startServer, type ServerRouteHandlers } from "../src/server.js";

function createHandlers(): ServerRouteHandlers {
  return {
    handleAgentEndpoint: vi.fn(() => Promise.resolve(new Response("agent", { status: 200 }))),
    handleHealthEndpoint: vi.fn(() => Response.json({ status: "ok" }, { status: 200 }))
  };
}

describe("server routing", () => {
  it("dispatches POST /agent to agent handler", async () => {
    const handlers = createHandlers();
    const fetchHandler = createServerFetchHandler(handlers);

    const response = await fetchHandler(
      new Request("http://localhost:3001/agent", {
        method: "POST",
        body: JSON.stringify({ test: true })
      })
    );

    expect(handlers.handleAgentEndpoint).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("agent");
  });

  it("dispatches GET /health to health handler", async () => {
    const handlers = createHandlers();
    const fetchHandler = createServerFetchHandler(handlers);

    const response = await fetchHandler(
      new Request("http://localhost:3001/health", {
        method: "GET"
      })
    );

    expect(handlers.handleHealthEndpoint).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("returns 404 for unknown paths", async () => {
    const handlers = createHandlers();
    const fetchHandler = createServerFetchHandler(handlers);

    const response = await fetchHandler(
      new Request("http://localhost:3001/unknown", {
        method: "GET"
      })
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not Found");
  });

  it("returns 405 for non-POST /agent requests", async () => {
    const handlers = createHandlers();
    const fetchHandler = createServerFetchHandler(handlers);

    const response = await fetchHandler(
      new Request("http://localhost:3001/agent", {
        method: "GET"
      })
    );

    expect(response.status).toBe(405);
    expect(await response.text()).toBe("Method Not Allowed");
  });

  it("returns 405 for non-GET /health requests", async () => {
    const handlers = createHandlers();
    const fetchHandler = createServerFetchHandler(handlers);

    const response = await fetchHandler(
      new Request("http://localhost:3001/health", {
        method: "POST"
      })
    );

    expect(response.status).toBe(405);
    expect(await response.text()).toBe("Method Not Allowed");
  });

  it("starts server with configured PORT", () => {
    const originalBun = (globalThis as { Bun?: unknown }).Bun;
    const originalPort = process.env.PORT;
    const originalIdleTimeout = process.env.IDLE_TIMEOUT_SECONDS;
    const serveMock = vi.fn(() => ({ id: "server" }));

    Object.defineProperty(globalThis, "Bun", {
      configurable: true,
      writable: true,
      value: { serve: serveMock }
    });

    process.env.PORT = "4567";
    process.env.IDLE_TIMEOUT_SECONDS = "180";

    const result = startServer(undefined, createHandlers());

    expect(result).toEqual({ id: "server" });
    expect(serveMock).toHaveBeenCalledTimes(1);
    const firstCall = serveMock.mock.calls.at(0);

    if (!firstCall) {
      throw new Error("Missing serve call");
    }

    const options = (
      firstCall as unknown as [{ port: number; fetch: unknown; idleTimeout?: number }]
    )[0];
    expect(options.port).toBe(4567);
    expect(typeof options.fetch).toBe("function");
    expect(options.idleTimeout).toBe(180);

    process.env.PORT = originalPort;
    process.env.IDLE_TIMEOUT_SECONDS = originalIdleTimeout;
    Object.defineProperty(globalThis, "Bun", {
      configurable: true,
      writable: true,
      value: originalBun
    });
  });

  it("falls back to default port when PORT is invalid", () => {
    const originalBun = (globalThis as { Bun?: unknown }).Bun;
    const originalPort = process.env.PORT;
    const originalIdleTimeout = process.env.IDLE_TIMEOUT_SECONDS;
    const serveMock = vi.fn(() => ({ id: "server" }));

    Object.defineProperty(globalThis, "Bun", {
      configurable: true,
      writable: true,
      value: { serve: serveMock }
    });

    process.env.PORT = "invalid";
    process.env.IDLE_TIMEOUT_SECONDS = "invalid";

    startServer(undefined, createHandlers());

    expect(serveMock).toHaveBeenCalledTimes(1);
    const firstCall = serveMock.mock.calls.at(0);

    if (!firstCall) {
      throw new Error("Missing serve call");
    }

    const options = (
      firstCall as unknown as [{ port: number; fetch: unknown; idleTimeout?: number }]
    )[0];
    expect(options.port).toBe(3001);
    expect(typeof options.fetch).toBe("function");
    expect(options.idleTimeout).toBe(120);

    process.env.PORT = originalPort;
    process.env.IDLE_TIMEOUT_SECONDS = originalIdleTimeout;
    Object.defineProperty(globalThis, "Bun", {
      configurable: true,
      writable: true,
      value: originalBun
    });
  });

  it("falls back to default port when PORT is missing", () => {
    const originalBun = (globalThis as { Bun?: unknown }).Bun;
    const originalPort = process.env.PORT;
    const originalIdleTimeout = process.env.IDLE_TIMEOUT_SECONDS;
    const serveMock = vi.fn(() => ({ id: "server" }));

    Object.defineProperty(globalThis, "Bun", {
      configurable: true,
      writable: true,
      value: { serve: serveMock }
    });

    delete process.env.PORT;
    delete process.env.IDLE_TIMEOUT_SECONDS;

    startServer(undefined, createHandlers());

    expect(serveMock).toHaveBeenCalledTimes(1);
    const firstCall = serveMock.mock.calls.at(0);

    if (!firstCall) {
      throw new Error("Missing serve call");
    }

    const options = (
      firstCall as unknown as [{ port: number; fetch: unknown; idleTimeout?: number }]
    )[0];
    expect(options.port).toBe(3001);
    expect(typeof options.fetch).toBe("function");
    expect(options.idleTimeout).toBe(120);

    process.env.PORT = originalPort;
    process.env.IDLE_TIMEOUT_SECONDS = originalIdleTimeout;
    Object.defineProperty(globalThis, "Bun", {
      configurable: true,
      writable: true,
      value: originalBun
    });
  });

  it("throws when Bun runtime is unavailable", () => {
    const originalBun = (globalThis as { Bun?: unknown }).Bun;

    Object.defineProperty(globalThis, "Bun", {
      configurable: true,
      writable: true,
      value: undefined
    });

    expect(() => startServer(3001, createHandlers())).toThrow(
      "Bun runtime is required to start the server"
    );

    Object.defineProperty(globalThis, "Bun", {
      configurable: true,
      writable: true,
      value: originalBun
    });
  });
});
