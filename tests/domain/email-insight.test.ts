import { describe, it, expect } from "vitest";
import {
  emailCategorySchema,
  emailInsightSchema,
  compareByCategory
} from "../../src/domain/email-insight.js";
import type { EmailInsight } from "../../src/domain/email-insight.js";

describe("EmailCategory", () => {
  it("parses valid category values", () => {
    expect(emailCategorySchema.parse("personal")).toBe("personal");
    expect(emailCategorySchema.parse("business")).toBe("business");
    expect(emailCategorySchema.parse("newsletter_or_spam")).toBe("newsletter_or_spam");
  });

  it("throws for invalid category values", () => {
    expect(() => emailCategorySchema.parse("urgent")).toThrow();
    expect(() => emailCategorySchema.parse("")).toThrow();
  });
});

describe("EmailInsight", () => {
  it("parses full valid input", () => {
    const input = {
      summary: "Requesting a budget review by end of week.",
      category: "personal"
    };
    const result = emailInsightSchema.parse(input);
    expect(result.summary).toBe("Requesting a budget review by end of week.");
    expect(result.category).toBe("personal");
  });

  it("throws for empty summary", () => {
    const input = {
      summary: "",
      category: "business"
    };
    expect(() => emailInsightSchema.parse(input)).toThrow();
  });

  it("throws for invalid category", () => {
    const input = {
      summary: "A valid summary.",
      category: "critical"
    };
    expect(() => emailInsightSchema.parse(input)).toThrow();
  });

  it("throws for missing required fields", () => {
    const input = {
      summary: "Only summary"
    };
    expect(() => emailInsightSchema.parse(input)).toThrow();
  });
});

describe("compareByCategory", () => {
  it("sorts personal before business", () => {
    const personal: EmailInsight = { summary: "a", category: "personal" };
    const business: EmailInsight = { summary: "b", category: "business" };
    expect(compareByCategory(personal, business)).toBeLessThan(0);
  });

  it("sorts business before newsletter_or_spam", () => {
    const business: EmailInsight = { summary: "a", category: "business" };
    const spam: EmailInsight = { summary: "b", category: "newsletter_or_spam" };
    expect(compareByCategory(business, spam)).toBeLessThan(0);
  });

  it("sorts personal before newsletter_or_spam", () => {
    const personal: EmailInsight = { summary: "a", category: "personal" };
    const spam: EmailInsight = { summary: "b", category: "newsletter_or_spam" };
    expect(compareByCategory(personal, spam)).toBeLessThan(0);
  });

  it("returns zero for same category", () => {
    const a: EmailInsight = { summary: "a", category: "business" };
    const b: EmailInsight = { summary: "b", category: "business" };
    expect(compareByCategory(a, b)).toBe(0);
  });

  it("returns positive when first is lower priority", () => {
    const spam: EmailInsight = { summary: "a", category: "newsletter_or_spam" };
    const personal: EmailInsight = { summary: "b", category: "personal" };
    expect(compareByCategory(spam, personal)).toBeGreaterThan(0);
  });
});
