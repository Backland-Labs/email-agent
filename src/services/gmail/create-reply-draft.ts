type GmailDraftCreateResponse = {
  data: {
    id?: string | null;
    message?: {
      threadId?: string | null;
    } | null;
  };
};

export type GmailDraftCreateParams = {
  userId: string;
  requestBody: {
    message: {
      threadId: string;
      raw: string;
    };
  };
};

export type GmailDraftsApi = {
  create: (params: GmailDraftCreateParams) => Promise<GmailDraftCreateResponse>;
};

export type CreateReplyDraftInput = {
  threadId: string;
  to: string;
  subject: string;
  bodyText: string;
  inReplyTo?: string;
  references?: string;
};

export type CreatedReplyDraft = {
  id: string;
  threadId: string;
};

export async function createReplyDraft(
  gmailDraftsApi: GmailDraftsApi,
  input: CreateReplyDraftInput
): Promise<CreatedReplyDraft> {
  const threadId = input.threadId.trim();

  if (threadId.length === 0) {
    throw new Error("Reply threadId cannot be empty");
  }

  const to = input.to.trim();

  if (to.length === 0) {
    throw new Error("Reply recipient cannot be empty");
  }

  const subject = toReplySubject(input.subject);
  const raw = encodeRawMessage(
    buildMimeMessage({
      to,
      subject,
      bodyText: input.bodyText,
      ...(input.inReplyTo ? { inReplyTo: input.inReplyTo } : {}),
      ...(input.references ? { references: input.references } : {})
    })
  );

  const response = await gmailDraftsApi.create({
    userId: "me",
    requestBody: {
      message: {
        threadId,
        raw
      }
    }
  });

  const draftId = response.data.id?.trim();

  if (!draftId) {
    throw new Error("Gmail drafts.create response missing draft id");
  }

  return {
    id: draftId,
    threadId: response.data.message?.threadId?.trim() || threadId
  };
}

function toReplySubject(subject: string): string {
  const normalized = subject.trim().length > 0 ? subject.trim() : "(no subject)";

  if (normalized.toLowerCase().startsWith("re:")) {
    return normalized;
  }

  return `Re: ${normalized}`;
}

function buildMimeMessage(input: {
  to: string;
  subject: string;
  bodyText: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const headers = [
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit"
  ];

  if (input.inReplyTo?.trim()) {
    headers.push(`In-Reply-To: ${input.inReplyTo.trim()}`);
  }

  if (input.references?.trim()) {
    headers.push(`References: ${input.references.trim()}`);
  }

  const bodyText = input.bodyText.replace(/\r?\n/g, "\r\n").trimEnd();

  return `${headers.join("\r\n")}\r\n\r\n${bodyText}\r\n`;
}

function encodeRawMessage(mimeMessage: string): string {
  return Buffer.from(mimeMessage, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}
