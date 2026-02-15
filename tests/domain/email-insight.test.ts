import { describe, it, expect } from "vitest";
import {
  emailCategorySchema,
  emailUrgencySchema,
  emailInsightSchema,
  compareByCategory
} from "../../src/domain/email-insight.js";
import type { EmailInsight } from "../../src/domain/email-insight.js";

describe("EmailCategory", () => {
  it("parses valid category values", () => {
    expect(emailCategorySchema.parse("personal")).toBe("personal");
    expect(emailCategorySchema.parse("business")).toBe("business");
    expect(emailCategorySchema.parse("automated")).toBe("automated");
    expect(emailCategorySchema.parse("newsletter_or_spam")).toBe("newsletter_or_spam");
  });

  it("throws for invalid category values", () => {
    expect(() => emailCategorySchema.parse("urgent")).toThrow();
    expect(() => emailCategorySchema.parse("")).toThrow();
  });
});

describe("EmailUrgency", () => {
  it("parses valid urgency values", () => {
    expect(emailUrgencySchema.parse("action_required")).toBe("action_required");
    expect(emailUrgencySchema.parse("fyi")).toBe("fyi");
    expect(emailUrgencySchema.parse("noise")).toBe("noise");
  });

  it("throws for invalid urgency values", () => {
    expect(() => emailUrgencySchema.parse("urgent")).toThrow();
    expect(() => emailUrgencySchema.parse("")).toThrow();
  });
});

describe("EmailInsight", () => {
  it("parses full valid input", () => {
    const input = {
      summary: "Requesting a budget review by end of week.",
      category: "personal",
      urgency: "action_required",
      action: "Review the budget document by Friday."
    };
    const result = emailInsightSchema.parse(input);
    expect(result.summary).toBe("Requesting a budget review by end of week.");
    expect(result.category).toBe("personal");
    expect(result.urgency).toBe("action_required");
    expect(result.action).toBe("Review the budget document by Friday.");
  });

  it("parses input with null action", () => {
    const input = {
      summary: "CI failed on main branch.",
      category: "automated",
      urgency: "noise",
      action: null
    };
    const result = emailInsightSchema.parse(input);
    expect(result.action).toBeNull();
  });

  it("throws for empty summary", () => {
    const input = {
      summary: "",
      category: "business",
      urgency: "fyi",
      action: null
    };
    expect(() => emailInsightSchema.parse(input)).toThrow();
  });

  it("throws for invalid category", () => {
    const input = {
      summary: "A valid summary.",
      category: "critical",
      urgency: "fyi",
      action: null
    };
    expect(() => emailInsightSchema.parse(input)).toThrow();
  });

  it("throws for invalid urgency", () => {
    const input = {
      summary: "A valid summary.",
      category: "business",
      urgency: "critical",
      action: null
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
  it("sorts action_required before fyi", () => {
    const urgent: EmailInsight = {
      summary: "a",
      category: "business",
      urgency: "action_required",
      action: "Do something."
    };
    const fyi: EmailInsight = {
      summary: "b",
      category: "personal",
      urgency: "fyi",
      action: null
    };
    expect(compareByCategory(urgent, fyi)).toBeLessThan(0);
  });

  it("sorts fyi before noise", () => {
    const fyi: EmailInsight = {
      summary: "a",
      category: "business",
      urgency: "fyi",
      action: null
    };
    const noise: EmailInsight = {
      summary: "b",
      category: "automated",
      urgency: "noise",
      action: null
    };
    expect(compareByCategory(fyi, noise)).toBeLessThan(0);
  });

  it("sorts by category within same urgency", () => {
    const personal: EmailInsight = {
      summary: "a",
      category: "personal",
      urgency: "fyi",
      action: null
    };
    const automated: EmailInsight = {
      summary: "b",
      category: "automated",
      urgency: "fyi",
      action: null
    };
    expect(compareByCategory(personal, automated)).toBeLessThan(0);
  });

  it("returns zero for same urgency and category", () => {
    const a: EmailInsight = {
      summary: "a",
      category: "business",
      urgency: "fyi",
      action: null
    };
    const b: EmailInsight = {
      summary: "b",
      category: "business",
      urgency: "fyi",
      action: null
    };
    expect(compareByCategory(a, b)).toBe(0);
  });

  it("returns positive when first has lower urgency", () => {
    const noise: EmailInsight = {
      summary: "a",
      category: "automated",
      urgency: "noise",
      action: null
    };
    const urgent: EmailInsight = {
      summary: "b",
      category: "business",
      urgency: "action_required",
      action: "Act now."
    };
    expect(compareByCategory(noise, urgent)).toBeGreaterThan(0);
  });
});
