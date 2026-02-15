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
  if (value.trim().length === 0) {
    throw new Error("EmailId cannot be empty");
  }
  return value as EmailId;
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
