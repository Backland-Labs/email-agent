import { z } from "zod";

export type EmailCategory = "personal" | "business" | "automated" | "newsletter_or_spam";

export const emailCategorySchema = z.enum([
  "personal",
  "business",
  "automated",
  "newsletter_or_spam"
]);

export type EmailInsight = {
  summary: string;
  category: EmailCategory;
};

export const emailInsightSchema = z.object({
  summary: z.string().min(1),
  category: emailCategorySchema
});

const CATEGORY_SORT_ORDER: Record<EmailCategory, number> = {
  personal: 0,
  business: 1,
  automated: 2,
  newsletter_or_spam: 3
};

export function compareByCategory(a: EmailInsight, b: EmailInsight): number {
  return CATEGORY_SORT_ORDER[a.category] - CATEGORY_SORT_ORDER[b.category];
}
