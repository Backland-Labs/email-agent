import { describe, expect, it } from "vitest";

import { logger, resolveLogLevel } from "../../src/observability/logger.js";

describe("resolveLogLevel", () => {
  it("returns a valid configured level", () => {
    expect(resolveLogLevel("warn", "production")).toBe("warn");
  });

  it("defaults to info in production when level is unset", () => {
    expect(resolveLogLevel(undefined, "production")).toBe("info");
  });

  it("defaults to debug outside production when level is invalid", () => {
    expect(resolveLogLevel("verbose", "development")).toBe("debug");
  });
});

describe("logger", () => {
  it("exposes pino logger methods", () => {
    expect(typeof logger.child).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(logger.level).toBe(resolveLogLevel(process.env.LOG_LEVEL, process.env.NODE_ENV));
  });
});
