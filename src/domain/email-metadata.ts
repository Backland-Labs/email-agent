import "./zod-openapi-extensions.js";
import { z } from "zod";

declare const emailIdBrand: unique symbol;

export type EmailId = string & {
  readonly [emailIdBrand]: "EmailId";
};

export type EmailMetadata = {
  id: EmailId;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  bodyText: string;
};

export const emailMetadataSchema = z.object({
  id: z.string().min(1),
  threadId: z.string(),
  subject: z.string().min(1),
  from: z.string(),
  to: z.string(),
  date: z.string(),
  snippet: z.string(),
  bodyText: z.string()
});

export function parseEmailId(value: string): EmailId {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new Error("EmailId cannot be empty");
  }

  // Reject obviously invalid placeholder-like patterns
  // Gmail message IDs are typically hexadecimal strings of significant length
  // This catches common test/placeholder patterns without being overly strict
  const invalidPatterns = [
    /^test[-_]?email$/i, // test-email, test_email, testemail
    /^email[-_]?\d+$/i, // email-123, email_456
    /^(msg|message)[-_]?\d+$/i, // msg-1, message_123
    /^(id|msgid)[-_]?\d+$/i, // id-1, msgid_123
    /^placeholder/i, // placeholder, placeholder-id
    /^example/i, // example, example-id
    /^dummy/i, // dummy, dummy-id
    /^fake/i // fake, fake-id
  ];

  const isObviouslyInvalid = invalidPatterns.some((pattern) => pattern.test(trimmed));

  if (isObviouslyInvalid) {
    throw new Error(
      `Invalid emailId format: "${trimmed}" appears to be a placeholder or test value. ` +
        "Gmail message IDs should be alphanumeric strings from the Gmail API."
    );
  }

  // Require minimum length to catch other obviously invalid short IDs
  if (trimmed.length < 8) {
    throw new Error(
      `Invalid emailId format: "${trimmed}" is too short. ` +
        "Gmail message IDs are typically 16+ characters."
    );
  }

  return trimmed as EmailId;
}

export function createEmailMetadata(input: {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  bodyText: string;
}): EmailMetadata {
  const parsedId = parseEmailId(input.id);
  const normalizedSubject = input.subject.trim();

  if (normalizedSubject.length === 0) {
    throw new Error("Subject cannot be empty");
  }

  return {
    id: parsedId,
    threadId: input.threadId,
    subject: normalizedSubject,
    from: input.from,
    to: input.to,
    date: input.date,
    snippet: input.snippet,
    bodyText: input.bodyText
  };
}
