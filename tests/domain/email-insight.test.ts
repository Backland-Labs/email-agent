import { describe, it, expect } from "vitest";
import {
  insightPrioritySchema,
  insightSentimentSchema,
  actionItemSchema,
  emailInsightSchema
} from "../../src/domain/email-insight.js";
import type { InsightPriority, InsightSentiment } from "../../src/domain/email-insight.js";

describe("InsightPriority", () => {
  it("parses valid priority values", () => {
    expect(insightPrioritySchema.parse("high")).toBe("high");
    expect(insightPrioritySchema.parse("medium")).toBe("medium");
    expect(insightPrioritySchema.parse("low")).toBe("low");
  });

  it("throws for invalid priority values", () => {
    expect(() => insightPrioritySchema.parse("critical")).toThrow();
    expect(() => insightPrioritySchema.parse("")).toThrow();
  });
});

describe("InsightSentiment", () => {
  it("parses valid sentiment values", () => {
    expect(insightSentimentSchema.parse("positive")).toBe("positive");
    expect(insightSentimentSchema.parse("neutral")).toBe("neutral");
    expect(insightSentimentSchema.parse("negative")).toBe("negative");
    expect(insightSentimentSchema.parse("urgent")).toBe("urgent");
  });

  it("throws for invalid sentiment values", () => {
    expect(() => insightSentimentSchema.parse("excited")).toThrow();
    expect(() => insightSentimentSchema.parse("")).toThrow();
  });
});

describe("ActionItem", () => {
  it("parses valid action item", () => {
    const input = {
      task: "Review the document",
      owner: "you",
      deadline: "Feb 15"
    };
    const result = actionItemSchema.parse(input);
    expect(result.task).toBe("Review the document");
    expect(result.owner).toBe("you");
    expect(result.deadline).toBe("Feb 15");
  });

  it("allows optional deadline", () => {
    const input = {
      task: "Review the document",
      owner: "you"
    };
    const result = actionItemSchema.parse(input);
    expect(result.task).toBe("Review the document");
    expect(result.deadline).toBeUndefined();
  });

  it("throws for missing task", () => {
    const input = {
      owner: "you"
    };
    expect(() => actionItemSchema.parse(input)).toThrow();
  });
});

describe("EmailInsight", () => {
  it("parses full valid input", () => {
    const input = {
      priority: "high" as InsightPriority,
      sentiment: "urgent" as InsightSentiment,
      actionItems: [{ task: "Review document", owner: "you", deadline: "Feb 15" }],
      relationshipContext: "Manager",
      urgencySignals: ["need this by EOD Friday", "please prioritize"]
    };
    const result = emailInsightSchema.parse(input);
    expect(result.priority).toBe("high");
    expect(result.sentiment).toBe("urgent");
    expect(result.actionItems).toHaveLength(1);
    expect(result.relationshipContext).toBe("Manager");
    expect(result.urgencySignals).toHaveLength(2);
  });

  it("allows empty action items and urgency signals", () => {
    const input = {
      priority: "low" as InsightPriority,
      sentiment: "neutral" as InsightSentiment,
      actionItems: [],
      relationshipContext: "Colleague",
      urgencySignals: []
    };
    const result = emailInsightSchema.parse(input);
    expect(result.actionItems).toHaveLength(0);
    expect(result.urgencySignals).toHaveLength(0);
  });

  it("throws for invalid priority", () => {
    const input = {
      priority: "super critical",
      sentiment: "neutral",
      actionItems: [],
      relationshipContext: "Colleague",
      urgencySignals: []
    };
    expect(() => emailInsightSchema.parse(input)).toThrow();
  });

  it("throws for missing required fields", () => {
    const input = {
      priority: "high"
      // missing other fields
    };
    expect(() => emailInsightSchema.parse(input)).toThrow();
  });
});
