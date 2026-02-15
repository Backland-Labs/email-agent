import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

type LogEntry = Record<string, unknown>;

const REQUIRED_AGENT_RUN_FIELDS = ["event", "requestId", "runId", "threadId"];
const REQUIRED_GMAIL_BOUNDARY_FIELDS = ["event", "requestId", "runId", "threadId"];
const FORBIDDEN_KEYS = [
  "subject",
  "from",
  "to",
  "snippet",
  "body",
  "bodytext",
  "authorization",
  "cookie",
  "refresh_token",
  "client_secret",
  "password",
  "api_key"
];

describe("structured log contract", () => {
  it("emits required fields and excludes sensitive keys", () => {
    const scenarioPath = path.resolve(
      process.cwd(),
      "tests/observability/fixtures/log-contract-scenario.ts"
    );
    const scenarioRun = spawnSync("bun", [scenarioPath], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        LOG_LEVEL: "info",
        NODE_ENV: "test"
      },
      encoding: "utf8"
    });

    if (scenarioRun.status !== 0) {
      throw new Error(scenarioRun.stderr || "Log contract scenario failed");
    }

    const entries = parseJsonLogLines(scenarioRun.stdout);

    expect(entries.length).toBeGreaterThan(0);

    assertEntriesHaveFields(entries, "agent.run_started", REQUIRED_AGENT_RUN_FIELDS);
    assertEntriesHaveFields(entries, "agent.run_completed", [
      ...REQUIRED_AGENT_RUN_FIELDS,
      "durationMs",
      "unreadCount",
      "generatedInsightCount",
      "failedInsightCount",
      "aborted"
    ]);
    assertEntriesHaveFields(entries, "agent.run_failed", [
      ...REQUIRED_AGENT_RUN_FIELDS,
      "durationMs",
      "code",
      "err"
    ]);
    assertEntriesHaveFields(entries, "gmail.fetch_started", [
      ...REQUIRED_GMAIL_BOUNDARY_FIELDS,
      "maxResults",
      "concurrency"
    ]);
    assertEntriesHaveFields(entries, "gmail.fetch_completed", [
      ...REQUIRED_GMAIL_BOUNDARY_FIELDS,
      "durationMs",
      "unreadCount"
    ]);
    assertEntriesHaveFields(entries, "gmail.fetch_failed", [
      ...REQUIRED_GMAIL_BOUNDARY_FIELDS,
      "durationMs",
      "maxResults",
      "concurrency",
      "code",
      "err"
    ]);

    const runFailedEntry = getFirstEntry(entries, "agent.run_failed");
    const gmailFailedEntry = getFirstEntry(entries, "gmail.fetch_failed");

    expect(runFailedEntry.code).toBe("run_failed");
    expect(gmailFailedEntry.code).toBe("gmail_fetch_failed");
    expect(hasKey(runFailedEntry, "stack")).toBe(true);
    expect(hasKey(gmailFailedEntry, "stack")).toBe(true);

    const runIds = collectRunIds(entries);

    expect(runIds.length).toBeGreaterThanOrEqual(2);

    for (const runId of runIds) {
      assertRunUsesSingleRequestId(entries, runId);
    }

    assertNoForbiddenKeys(entries, FORBIDDEN_KEYS);
  });
});

function parseJsonLogLines(stdout: string): LogEntry[] {
  return stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line) as LogEntry);
}

function assertEntriesHaveFields(entries: LogEntry[], eventName: string, fields: string[]): void {
  const eventEntries = entries.filter((entry) => entry.event === eventName);

  expect(eventEntries.length).toBeGreaterThan(0);

  for (const entry of eventEntries) {
    for (const field of fields) {
      expect(entry).toHaveProperty(field);
    }
  }
}

function getFirstEntry(entries: LogEntry[], eventName: string): LogEntry {
  const matchedEntry = entries.find((entry) => entry.event === eventName);

  if (!matchedEntry) {
    throw new Error(`Missing event: ${eventName}`);
  }

  return matchedEntry;
}

function collectRunIds(entries: LogEntry[]): string[] {
  const runIds = entries
    .filter((entry) => entry.event === "agent.run_started")
    .map((entry) => entry.runId)
    .filter((runId): runId is string => typeof runId === "string" && runId.length > 0);

  return [...new Set(runIds)];
}

function assertRunUsesSingleRequestId(entries: LogEntry[], runId: string): void {
  const runEntries = entries.filter((entry) => entry.runId === runId);
  const requestIds = new Set(
    runEntries
      .map((entry) => entry.requestId)
      .filter(
        (requestId): requestId is string => typeof requestId === "string" && requestId.length > 0
      )
  );

  expect(runEntries.length).toBeGreaterThan(0);
  expect(requestIds.size).toBe(1);
}

function assertNoForbiddenKeys(entries: LogEntry[], forbiddenKeys: string[]): void {
  for (const entry of entries) {
    const normalizedKeys = collectNormalizedKeys(entry);

    for (const forbiddenKey of forbiddenKeys) {
      expect(normalizedKeys.has(forbiddenKey)).toBe(false);
    }
  }
}

function collectNormalizedKeys(value: unknown): Set<string> {
  const keys = new Set<string>();
  collectKeysRecursive(value, keys);
  return keys;
}

function collectKeysRecursive(value: unknown, keys: Set<string>): void {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectKeysRecursive(item, keys);
    }
    return;
  }

  for (const [rawKey, nestedValue] of Object.entries(value)) {
    keys.add(rawKey.toLowerCase());
    collectKeysRecursive(nestedValue, keys);
  }
}

function hasKey(value: unknown, targetKey: string): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasKey(item, targetKey));
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (key === targetKey || hasKey(nestedValue, targetKey)) {
      return true;
    }
  }

  return false;
}
