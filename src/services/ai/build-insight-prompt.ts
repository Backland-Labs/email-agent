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
      "You are an executive assistant that triages email for a busy professional. " +
      "Extract structured insights with clear priority, sentiment, action items, and relationship context.",
    user:
      `Email ID: ${email.id}\n` +
      `Thread ID: ${email.threadId}\n` +
      `Subject: ${email.subject}\n` +
      `From: ${email.from}\n` +
      `To: ${email.to}\n` +
      `Date: ${email.date}\n` +
      `Snippet: ${email.snippet}\n\n` +
      `Body:\n${body}\n\n` +
      "Return a JSON object that matches the requested schema."
  };
}
