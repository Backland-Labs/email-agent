import { defineConfig } from "vitest/config";

process.env.LOG_LEVEL ??= "silent";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      all: true,
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100
      }
    }
  }
});
