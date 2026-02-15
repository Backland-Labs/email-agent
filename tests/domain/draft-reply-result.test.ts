import { describe, expect, it } from "vitest";

import {
  draftReplyModelOutputSchema,
  draftReplyRunResultSchema,
  parseDraftReplyModelOutput
} from "../../src/domain/draft-reply-result.js";

describe("parseDraftReplyModelOutput", () => {
  it("parses required and optional fields", () => {
    const result = parseDraftReplyModelOutput({
      draftText: "Thanks for the update. I can review this tomorrow.",
      subjectSuggestion: "Re: Quarterly planning",
      riskFlags: ["missing_context"]
    });

    expect(result).toEqual({
      draftText: "Thanks for the update. I can review this tomorrow.",
      subjectSuggestion: "Re: Quarterly planning",
      riskFlags: ["missing_context"]
    });
  });

  it("parses output without subject suggestion", () => {
    const result = parseDraftReplyModelOutput({
      draftText: "Sounds good. I will handle it.",
      riskFlags: []
    });

    expect(result.subjectSuggestion).toBeUndefined();
    expect(result.riskFlags).toEqual([]);
  });

  it("throws when draft text is empty", () => {
    expect(() =>
      parseDraftReplyModelOutput({
        draftText: "",
        riskFlags: []
      })
    ).toThrow();
  });

  it("throws when risk flag is not recognized", () => {
    expect(() =>
      parseDraftReplyModelOutput({
        draftText: "Test",
        riskFlags: ["unknown_flag"]
      })
    ).toThrow();
  });
});

describe("draftReplyModelOutputSchema", () => {
  it("rejects unknown keys", () => {
    expect(() =>
      draftReplyModelOutputSchema.parse({
        draftText: "Thanks",
        riskFlags: [],
        extra: "not-allowed"
      })
    ).toThrow();
  });
});

describe("draftReplyRunResultSchema", () => {
  it("parses metadata for RUN_FINISHED.result", () => {
    const result = draftReplyRunResultSchema.parse({
      emailId: "email-1",
      contextMessageCount: 4,
      contextDegraded: false,
      riskFlags: ["uncertain_facts"]
    });

    expect(result).toEqual({
      emailId: "email-1",
      contextMessageCount: 4,
      contextDegraded: false,
      riskFlags: ["uncertain_facts"]
    });
  });

  it("rejects negative context message count", () => {
    expect(() =>
      draftReplyRunResultSchema.parse({
        emailId: "email-1",
        contextMessageCount: -1,
        contextDegraded: false,
        riskFlags: []
      })
    ).toThrow();
  });
});
