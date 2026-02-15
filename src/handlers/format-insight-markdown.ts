import type { EmailInsight } from "../domain/email-insight.js";
import type { EmailMetadata } from "../domain/email-metadata.js";

export function formatInsightMarkdown(email: EmailMetadata, insight: EmailInsight): string {
  return (
    `**From:** ${email.from}\n` +
    `**Subject:** ${email.subject}\n` +
    `${insight.summary}\n\n` +
    "---\n"
  );
}
