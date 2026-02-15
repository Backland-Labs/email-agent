import { z } from "zod";

import { parseEmailId, type EmailId } from "./email-metadata.js";

const nonEmptyTrimmedString = z.string().trim().min(1);

export const DRAFT_REPLY_RISK_FLAGS = [
  "missing_context",
  "uncertain_facts",
  "sensitive_request",
  "tone_mismatch"
] as const;

export const draftReplyRiskFlagSchema = z.enum(DRAFT_REPLY_RISK_FLAGS);

export type DraftReplyRiskFlag = z.infer<typeof draftReplyRiskFlagSchema>;

export type DraftReplyModelOutput = {
  draftText: string;
  subjectSuggestion?: string;
  riskFlags: DraftReplyRiskFlag[];
};

export const draftReplyModelOutputSchema = z
  .object({
    draftText: nonEmptyTrimmedString,
    subjectSuggestion: nonEmptyTrimmedString.optional(),
    riskFlags: z.array(draftReplyRiskFlagSchema)
  })
  .strict();

export type DraftReplyRunResult = {
  emailId: EmailId;
  contextMessageCount: number;
  contextDegraded: boolean;
  riskFlags: DraftReplyRiskFlag[];
};

export const draftReplyRunResultSchema = z
  .object({
    emailId: nonEmptyTrimmedString,
    contextMessageCount: z.number().int().nonnegative(),
    contextDegraded: z.boolean(),
    riskFlags: z.array(draftReplyRiskFlagSchema)
  })
  .strict();

export function parseDraftReplyModelOutput(input: unknown): DraftReplyModelOutput {
  const parsed = draftReplyModelOutputSchema.parse(input);

  return {
    draftText: parsed.draftText,
    ...(parsed.subjectSuggestion ? { subjectSuggestion: parsed.subjectSuggestion } : {}),
    riskFlags: parsed.riskFlags
  };
}

export function createDraftReplyRunResult(input: {
  emailId: string;
  contextMessageCount: number;
  contextDegraded: boolean;
  riskFlags: DraftReplyRiskFlag[];
}): DraftReplyRunResult {
  const parsed = draftReplyRunResultSchema.parse(input);

  return {
    emailId: parseEmailId(parsed.emailId),
    contextMessageCount: parsed.contextMessageCount,
    contextDegraded: parsed.contextDegraded,
    riskFlags: parsed.riskFlags
  };
}
