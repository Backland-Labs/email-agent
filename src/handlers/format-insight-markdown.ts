import type { EmailCategory, EmailInsight } from "../domain/email-insight.js";
import type { EmailMetadata } from "../domain/email-metadata.js";

const CATEGORY_LABELS: Record<EmailCategory, string> = {
  personal: "Personal",
  business: "Business",
  automated: "Automated",
  newsletter_or_spam: "Newsletter / Spam"
};

export function formatCategoryHeader(category: EmailCategory): string {
  return `## ${CATEGORY_LABELS[category]}\n\n`;
}

export function formatInsightMarkdown(email: EmailMetadata, insight: EmailInsight): string {
  return (
    `**From:** ${email.from}\n` +
    `**Subject:** ${email.subject}\n` +
    `${insight.summary}\n\n` +
    "---\n"
  );
}
