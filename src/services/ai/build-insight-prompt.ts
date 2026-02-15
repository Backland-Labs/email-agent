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
      "For each email, write one concise sentence summarizing what the sender wants or is communicating. " +
      "Classify the email into exactly one category: " +
      '"personal" for messages addressed personally to Max, ' +
      '"business" for work-related or professional messages, ' +
      '"newsletter_or_spam" for bulk mail, marketing, or automated notifications.',
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
