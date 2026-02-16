import "./zod-openapi-extensions.js";
import { z } from "zod";

import { parseEmailId, type EmailId } from "./email-metadata.js";

const nonEmptyTrimmedString = z.string().trim().min(1);

export type DraftReplyRequest = {
  emailId: EmailId;
  runId?: string;
  threadId?: string;
  voiceInstructions?: string;
};

export const draftReplyRequestSchema = z
  .object({
    emailId: nonEmptyTrimmedString.openapi({
      description: "Gmail message ID (alphanumeric string from Gmail API, typically 16+ characters)",
      example: "18d3c5e8f9a2b1c4"
    }),
    runId: nonEmptyTrimmedString.optional(),
    threadId: nonEmptyTrimmedString.optional(),
    voiceInstructions: nonEmptyTrimmedString.optional()
  })
  .strict();

export function parseDraftReplyRequest(input: unknown): DraftReplyRequest {
  const parsed = draftReplyRequestSchema.parse(input);

  return {
    emailId: parseEmailId(parsed.emailId),
    ...(parsed.runId ? { runId: parsed.runId } : {}),
    ...(parsed.threadId ? { threadId: parsed.threadId } : {}),
    ...(parsed.voiceInstructions ? { voiceInstructions: parsed.voiceInstructions } : {})
  };
}
