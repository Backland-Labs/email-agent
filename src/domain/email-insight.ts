import { z } from "zod";

export type InsightPriority = "high" | "medium" | "low";

export const insightPrioritySchema = z.enum(["high", "medium", "low"]);

export type InsightSentiment = "positive" | "neutral" | "negative" | "urgent";

export const insightSentimentSchema = z.enum(["positive", "neutral", "negative", "urgent"]);

export type ActionItem = {
  task: string;
  owner: string;
  deadline?: string | undefined;
};

export const actionItemSchema = z.object({
  task: z.string().min(1),
  owner: z.string(),
  deadline: z.string().optional()
});

export type RelationshipContext =
  | "Manager"
  | "Colleague"
  | "Direct Report"
  | "External"
  | "Unknown";

export const relationshipContextSchema = z.enum([
  "Manager",
  "Colleague",
  "Direct Report",
  "External",
  "Unknown"
]);

export type EmailInsight = {
  priority: InsightPriority;
  sentiment: InsightSentiment;
  actionItems: ActionItem[];
  relationshipContext: RelationshipContext;
  urgencySignals: string[];
};

export const emailInsightSchema = z.object({
  priority: insightPrioritySchema,
  sentiment: insightSentimentSchema,
  actionItems: z.array(actionItemSchema),
  relationshipContext: relationshipContextSchema,
  urgencySignals: z.array(z.string())
});
