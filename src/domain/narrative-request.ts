import "./zod-openapi-extensions.js";
import { z } from "zod";

const nonEmptyTrimmedString = z.string().trim().min(1);

export type NarrativeRequest = {
  runId?: string;
  threadId?: string;
};

export const narrativeRequestSchema = z
  .object({
    runId: nonEmptyTrimmedString.optional(),
    threadId: nonEmptyTrimmedString.optional()
  })
  .strict();

export function parseNarrativeRequest(input: unknown): NarrativeRequest {
  const parsed = narrativeRequestSchema.parse(input);

  return {
    ...(parsed.runId ? { runId: parsed.runId } : {}),
    ...(parsed.threadId ? { threadId: parsed.threadId } : {})
  };
}
