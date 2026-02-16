import { beforeEach, describe, expect, it, vi } from "vitest";

import { emailInsightSchema } from "../../../src/domain/email-insight.js";
import { createEmailMetadata } from "../../../src/domain/email-metadata.js";
import {
  extractEmailInsight,
  type ExtractEmailInsightDependencies
} from "../../../src/services/ai/extract-email-insight.js";

const emailIds = {
  base: "17ce8a2b6f3d40a9e",
  loader: "17ce8a2b6f3d40a9f",
  validation: "17ce8a2b6f3d40aa0",
  provider: "17ce8a2b6f3d40aa1",
  schema: "17ce8a2b6f3d40aa2",
  unknown: "17ce8a2b6f3d40aa4"
} as const;

let streamTextMock: ReturnType<typeof vi.fn>;
let outputObjectMock: ReturnType<typeof vi.fn>;
let createModelMock: ReturnType<typeof vi.fn>;
let modelObject: { id: string };
let dependencies: ExtractEmailInsightDependencies;

describe("extractEmailInsight", () => {
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

  it("returns a validated EmailInsight on success", async () => {
    const email = createEmailMetadata({
      id: emailIds.base,
      threadId: "thread-1",
      subject: "Planning",
      from: "manager@example.com",
      to: "you@example.com",
      date: "Sat, 14 Feb 2026 11:10:00 +0000",
      snippet: "Please review",
      bodyText: "Please send feedback by tomorrow"
    });

    const insight = {
      summary: "Manager is requesting feedback on the planning document by tomorrow.",
      category: "personal",
      urgency: "action_required",
      action: "Review the planning document and send feedback."
    };

    streamTextMock.mockReturnValue({
      output: Promise.resolve(insight)
    });

    const result = await extractEmailInsight(
      "anthropic:claude-sonnet-4-20250514",
      email,
      dependencies
    );

    expect(result).toEqual(insight);
    expect(createModelMock).toHaveBeenCalledWith("anthropic:claude-sonnet-4-20250514");
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: modelObject,
        output: { name: "mock-output" }
      })
    );
  });

  it("loads dependencies when explicit dependencies are omitted", async () => {
    const email = createEmailMetadata({
      id: emailIds.loader,
      threadId: "thread-loader",
      subject: "Loader path",
      from: "sender@example.com",
      to: "recipient@example.com",
      date: "Sat, 14 Feb 2026 11:10:30 +0000",
      snippet: "Loader",
      bodyText: "Body"
    });

    streamTextMock.mockReturnValue({
      output: Promise.resolve({
        summary: "A routine message.",
        category: "business",
        urgency: "fyi",
        action: null
      })
    });

    const result = await extractEmailInsight(
      "anthropic:claude-sonnet-4-20250514",
      email,
      undefined,
      () => Promise.resolve(dependencies)
    );

    expect(result.category).toBe("business");
    expect(result.urgency).toBe("fyi");
    expect(createModelMock).toHaveBeenCalledWith("anthropic:claude-sonnet-4-20250514");
  });

  it("wraps schema validation failures with email context", async () => {
    const email = createEmailMetadata({
      id: emailIds.validation,
      threadId: "thread-2",
      subject: "Schema failure",
      from: "sender@example.com",
      to: "recipient@example.com",
      date: "Sat, 14 Feb 2026 11:11:00 +0000",
      snippet: "Bad output",
      bodyText: "Body"
    });

    streamTextMock.mockReturnValue({
      output: Promise.resolve({
        summary: "Valid summary.",
        category: "invalid_category",
        urgency: "fyi",
        action: null
      })
    });

    await expect(
      extractEmailInsight("anthropic:claude-sonnet-4-20250514", email, dependencies)
    ).rejects.toThrow(`Failed to extract insight for email (${emailIds.validation})`);
  });

  it("wraps LLM errors with email context", async () => {
    const email = createEmailMetadata({
      id: emailIds.provider,
      threadId: "thread-3",
      subject: "Provider failure",
      from: "sender@example.com",
      to: "recipient@example.com",
      date: "Sat, 14 Feb 2026 11:12:00 +0000",
      snippet: "Provider issue",
      bodyText: "Body"
    });

    streamTextMock.mockImplementation(() => {
      throw new Error("Provider unavailable");
    });

    await expect(
      extractEmailInsight("anthropic:claude-sonnet-4-20250514", email, dependencies)
    ).rejects.toThrow(
      `Failed to extract insight for email (${emailIds.provider}): Provider unavailable`
    );
  });

  it("calls Output.object with the EmailInsight schema", async () => {
    const email = createEmailMetadata({
      id: emailIds.schema,
      threadId: "thread-4",
      subject: "Output schema",
      from: "sender@example.com",
      to: "recipient@example.com",
      date: "Sat, 14 Feb 2026 11:13:00 +0000",
      snippet: "Schema check",
      bodyText: "Body"
    });

    streamTextMock.mockReturnValue({
      output: Promise.resolve({
        summary: "Routine schema check.",
        category: "business",
        urgency: "fyi",
        action: null
      })
    });

    await extractEmailInsight("anthropic:claude-sonnet-4-20250514", email, dependencies);

    expect(outputObjectMock).toHaveBeenCalledWith({ schema: emailInsightSchema });
  });

  it("wraps non-Error failures with unknown error message", async () => {
    const email = createEmailMetadata({
      id: emailIds.unknown,
      threadId: "thread-6",
      subject: "Unknown failure",
      from: "sender@example.com",
      to: "recipient@example.com",
      date: "Sat, 14 Feb 2026 11:15:00 +0000",
      snippet: "Unknown error",
      bodyText: "Body"
    });

    const nonErrorFailure: unknown = "boom";

    dependencies.streamText = vi.fn(() => ({
      output: Promise.resolve().then(() => {
        throw nonErrorFailure;
      })
    }));

    await expect(
      extractEmailInsight("anthropic:claude-sonnet-4-20250514", email, dependencies)
    ).rejects.toThrow(`Failed to extract insight for email (${emailIds.unknown}): Unknown error`);
  });
});
