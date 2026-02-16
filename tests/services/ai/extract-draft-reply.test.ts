import { beforeEach, describe, expect, it, vi } from "vitest";

import { draftReplyModelOutputSchema } from "../../../src/domain/draft-reply-result.js";
import { createEmailMetadata } from "../../../src/domain/email-metadata.js";
import {
  extractDraftReply,
  type DraftReplyExtractionDependencies
} from "../../../src/services/ai/extract-draft-reply.js";

let streamTextMock: ReturnType<typeof vi.fn>;
let outputObjectMock: ReturnType<typeof vi.fn>;
let createModelMock: ReturnType<typeof vi.fn>;
let modelObject: { id: string };
let dependencies: DraftReplyExtractionDependencies;

const targetEmail = createEmailMetadata({
  id: "target-email",
  threadId: "thread-1",
  subject: "Re: Planning",
  from: "manager@example.com",
  to: "you@example.com",
  date: "Sat, 14 Feb 2026 11:10:00 +0000",
  snippet: "Need update",
  bodyText: "Can you share your update by tomorrow?"
});

const promptInput = {
  email: targetEmail,
  contextMessages: [targetEmail],
  contextDegraded: false,
  voiceInstructions: "Direct and polite"
};

describe("extractDraftReply", () => {
  beforeEach(() => {
    streamTextMock = vi.fn();
    outputObjectMock = vi.fn();
    outputObjectMock.mockReturnValue({ name: "mock-output" });
    modelObject = { id: "anthropic:test-model" };
    createModelMock = vi.fn().mockReturnValue(modelObject);

    dependencies = {
      streamText: streamTextMock,
      outputObject: outputObjectMock,
      createModel: createModelMock
    };
  });

  it("returns validated draft reply output on success", async () => {
    const output = {
      draftText: "Thanks for the note. I will send the update by tomorrow afternoon.",
      subjectSuggestion: "Re: Planning update",
      riskFlags: ["missing_context"]
    };

    streamTextMock.mockReturnValue({
      output: Promise.resolve(output)
    });

    const result = await extractDraftReply("claude-sonnet-4-20250514", promptInput, dependencies);

    expect(result).toEqual(output);
    expect(createModelMock).toHaveBeenCalledWith("claude-sonnet-4-20250514");
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: modelObject,
        output: { name: "mock-output" }
      })
    );
  });

  it("loads dependencies when explicit dependencies are omitted", async () => {
    streamTextMock.mockReturnValue({
      output: Promise.resolve({
        draftText: "Thanks. I will review and follow up.",
        riskFlags: []
      })
    });

    const result = await extractDraftReply("claude-sonnet-4-20250514", promptInput, undefined, () =>
      Promise.resolve(dependencies)
    );

    expect(result.draftText).toContain("Thanks");
    expect(createModelMock).toHaveBeenCalledWith("claude-sonnet-4-20250514");
  });

  it("wraps schema validation failures with email context", async () => {
    streamTextMock.mockReturnValue({
      output: Promise.resolve({
        draftText: "Valid draft",
        riskFlags: ["unknown-flag"]
      })
    });

    await expect(
      extractDraftReply("claude-sonnet-4-20250514", promptInput, dependencies)
    ).rejects.toThrow("Failed to extract draft reply for email (target-email)");
  });

  it("wraps model errors with email context", async () => {
    streamTextMock.mockImplementation(() => {
      throw new Error("Provider unavailable");
    });

    await expect(
      extractDraftReply("claude-sonnet-4-20250514", promptInput, dependencies)
    ).rejects.toThrow(
      "Failed to extract draft reply for email (target-email): Provider unavailable"
    );
  });

  it("calls Output.object with draft reply schema", async () => {
    streamTextMock.mockReturnValue({
      output: Promise.resolve({
        draftText: "Thanks for the message.",
        riskFlags: []
      })
    });

    await extractDraftReply("claude-sonnet-4-20250514", promptInput, dependencies);

    expect(outputObjectMock).toHaveBeenCalledWith({ schema: draftReplyModelOutputSchema });
  });

  it("wraps non-Error failures with unknown message", async () => {
    const nonErrorFailure: unknown = "boom";

    dependencies.streamText = vi.fn(() => ({
      output: Promise.resolve().then(() => {
        throw nonErrorFailure;
      })
    }));

    await expect(
      extractDraftReply("claude-sonnet-4-20250514", promptInput, dependencies)
    ).rejects.toThrow("Failed to extract draft reply for email (target-email): Unknown error");
  });
});
