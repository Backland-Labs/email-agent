import type { gmail_v1 } from "googleapis";

import { createEmailMetadata, type EmailMetadata } from "../../domain/email-metadata.js";

type MessagePart = gmail_v1.Schema$MessagePart;

export function parseGmailMessage(message: gmail_v1.Schema$Message): EmailMetadata {
  const id = message.id ?? "";
  const threadId = message.threadId ?? "";
  const snippet = message.snippet ?? "";
  const payload = message.payload;
  const headers = payload?.headers ?? [];

  return createEmailMetadata({
    id,
    threadId,
    subject: getHeaderValue(headers, "Subject") || "(no subject)",
    from: getHeaderValue(headers, "From"),
    to: getHeaderValue(headers, "To"),
    date: getHeaderValue(headers, "Date"),
    snippet,
    bodyText: extractBodyText(payload)
  });
}

function getHeaderValue(headers: gmail_v1.Schema$MessagePartHeader[], headerName: string): string {
  const matchedHeader = headers.find(
    (header) => header.name?.toLowerCase() === headerName.toLowerCase()
  );

  return matchedHeader?.value ?? "";
}

function extractBodyText(payload: MessagePart | undefined): string {
  if (!payload) {
    return "";
  }

  const plainBody = findBodyByMimeType(payload, "text/plain");

  if (plainBody) {
    return plainBody;
  }

  const htmlBody = findBodyByMimeType(payload, "text/html");

  if (htmlBody) {
    return stripHtmlTags(htmlBody);
  }

  const directBodyData = payload.body?.data;

  if (!directBodyData) {
    return "";
  }

  return decodeBase64Url(directBodyData);
}

function findBodyByMimeType(part: MessagePart, mimeType: string): string {
  if (part.mimeType === mimeType) {
    const data = part.body?.data;
    return data ? decodeBase64Url(data) : "";
  }

  const childParts = part.parts ?? [];

  for (const childPart of childParts) {
    const result = findBodyByMimeType(childPart, mimeType);

    if (result) {
      return result;
    }
  }

  return "";
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const missingPadding = base64.length % 4;
  const paddedValue = missingPadding === 0 ? base64 : `${base64}${"=".repeat(4 - missingPadding)}`;

  return Buffer.from(paddedValue, "base64").toString("utf8");
}

function stripHtmlTags(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
