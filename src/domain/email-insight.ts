import { z } from "zod";

export type EmailCategory = "personal" | "business" | "automated" | "newsletter_or_spam";

export type EmailUrgency = "action_required" | "fyi" | "noise";

export const emailCategorySchema = z.enum([
  "personal",
  "business",
  "automated",
  "newsletter_or_spam"
]);

export const emailUrgencySchema = z.enum(["action_required", "fyi", "noise"]);

export type EmailInsight = {
  summary: string;
  category: EmailCategory;
  urgency: EmailUrgency;
  action: string | null;
};

export const emailInsightSchema = z.object({
  summary: z.string().min(1),
  category: emailCategorySchema,
  urgency: emailUrgencySchema,
  action: z.string().nullable()
});

const URGENCY_SORT_ORDER: Record<EmailUrgency, number> = {
  action_required: 0,
  fyi: 1,
  noise: 2
};

const CATEGORY_SORT_ORDER: Record<EmailCategory, number> = {
  personal: 0,
  business: 1,
  automated: 2,
  newsletter_or_spam: 3
};

export function compareByCategory(a: EmailInsight, b: EmailInsight): number {
  const urgencyDiff = URGENCY_SORT_ORDER[a.urgency] - URGENCY_SORT_ORDER[b.urgency];

  if (urgencyDiff !== 0) {
    return urgencyDiff;
  }

  return CATEGORY_SORT_ORDER[a.category] - CATEGORY_SORT_ORDER[b.category];
}
