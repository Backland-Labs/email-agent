import "./zod-openapi-extensions.js";
import { z } from "zod";

const nonNegativeCountSchema = z.number().int().nonnegative();
const timeframeHoursSchema = z.number().int().positive().max(168);

export type NarrativeRunResult = {
  unreadCount: number;
  analyzedCount: number;
  actionItemCount: number;
  timeframeHours: 48;
  narrative: string;
  actionItems: string[];
};

export const narrativeRunResultSchema = z
  .object({
    unreadCount: nonNegativeCountSchema,
    analyzedCount: nonNegativeCountSchema,
    actionItemCount: nonNegativeCountSchema,
    timeframeHours: timeframeHoursSchema,
    narrative: z.string(),
    actionItems: z.array(z.string().trim().min(1))
  })
  .strict();

export function createNarrativeRunResult(input: {
  unreadCount: number;
  analyzedCount: number;
  actionItems: string[];
  timeframeHours: 48;
  narrative: string;
}): NarrativeRunResult {
  const parsed = narrativeRunResultSchema.parse({
    unreadCount: input.unreadCount,
    analyzedCount: input.analyzedCount,
    actionItemCount: input.actionItems.length,
    timeframeHours: input.timeframeHours,
    narrative: input.narrative,
    actionItems: input.actionItems
  });

  return {
    unreadCount: parsed.unreadCount,
    analyzedCount: parsed.analyzedCount,
    actionItemCount: parsed.actionItemCount,
    timeframeHours: parsed.timeframeHours as 48,
    narrative: parsed.narrative,
    actionItems: parsed.actionItems
  };
}
