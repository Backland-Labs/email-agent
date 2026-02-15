import type { EmailMetadata } from "../../domain/email-metadata.js";

const MAX_BODY_LENGTH = 4000;

export type InsightPrompt = {
  system: string;
  user: string;
};

export function buildInsightPrompt(email: EmailMetadata): InsightPrompt {
  const trimmedBody = email.bodyText.trim();
  const body =
    trimmedBody.length === 0 ? "(no body content)" : trimmedBody.slice(0, MAX_BODY_LENGTH);

  return {
    system:
      "You are an executive assistant triaging email for Max. " +
      "For each email, write one concise sentence that tells Max what he needs to know or do. " +
      "Focus on the actionable takeaway, not just restating the subject line. " +
      "If there is a deadline, amount, or key detail, include it. " +
      "Classify the email into exactly one category: " +
      '"personal" for messages from a real person writing directly to Max (friends, family, colleagues reaching out personally), ' +
      '"business" for work-related messages that require Max to take action or make a decision (invoices, account changes, direct requests), ' +
      '"automated" for CI/CD alerts, build failures, bot comments, deployment notifications, GitHub Actions, and other machine-generated technical notifications, ' +
      '"newsletter_or_spam" for bulk mail, marketing, newsletters, promotional content, and unsolicited messages.',
    user:
      `Subject: ${email.subject}\n` +
      `From: ${email.from}\n` +
      `To: ${email.to}\n` +
      `Date: ${email.date}\n` +
      `Snippet: ${email.snippet}\n\n` +
      `Body:\n${body}\n\n` +
      "Return a JSON object that matches the requested schema."
  };
}
