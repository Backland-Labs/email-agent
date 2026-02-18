import type { EmailMetadata } from "../domain/email-metadata.js";
import { LOOKBACK_WINDOW_MS } from "./narrative-constants.js";

const LOOKBACK_QUERY_BUFFER_SECONDS = 1;

export type LookbackWindow = {
  startMs: number;
  endMs: number;
  startEpochSeconds: number;
  endEpochSeconds: number;
};

export function resolveLookbackWindow(nowMs: number = Date.now()): LookbackWindow {
  const endMs = nowMs;
  const startMs = endMs - LOOKBACK_WINDOW_MS;

  return {
    startMs,
    endMs,
    startEpochSeconds: Math.floor(startMs / 1000),
    endEpochSeconds: Math.floor(endMs / 1000)
  };
}

export function buildLookbackQuery(nowMs: number = Date.now()): string {
  const window = resolveLookbackWindow(nowMs);
  const afterEpochSeconds = Math.max(0, window.startEpochSeconds - LOOKBACK_QUERY_BUFFER_SECONDS);
  const beforeEpochSeconds = window.endEpochSeconds + LOOKBACK_QUERY_BUFFER_SECONDS;

  return `is:unread after:${String(afterEpochSeconds)} before:${String(beforeEpochSeconds)}`;
}

export function filterEmailsInLookbackWindow(
  emails: EmailMetadata[],
  nowMs: number = Date.now()
): EmailMetadata[] {
  const window = resolveLookbackWindow(nowMs);

  return emails.filter((email) => {
    const timestamp = Date.parse(email.date);

    if (Number.isNaN(timestamp)) {
      return false;
    }

    return timestamp >= window.startMs && timestamp <= window.endMs;
  });
}
