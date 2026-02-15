import { describe, it, expect } from "vitest";

import { createEmailMetadata } from "../../src/domain/email-metadata.js";
import type { EmailInsight } from "../../src/domain/email-insight.js";
import type { EmailCategory, EmailUrgency } from "../../src/domain/email-insight.js";
import {
  formatDigestIntro,
  formatSectionHeader,
  formatInsightMarkdown
} from "../../src/handlers/format-insight-markdown.js";

function createEmail(overrides: Partial<{ from: string; subject: string }> = {}) {
  return createEmailMetadata({
    id: "email-1",
    threadId: "thread-1",
    subject: overrides.subject ?? "Test Subject",
    from: overrides.from ?? "sender@example.com",
    to: "you@example.com",
    date: "Sat, 14 Feb 2026 12:00:00 +0000",
    snippet: "Snippet",
    bodyText: "Body"
  });
}

describe("formatSectionHeader", () => {
  it("returns Action Required header for action_required", () => {
    expect(formatSectionHeader("action_required")).toBe("## Action Required\n\n");
  });

  it("returns Updates header for fyi", () => {
    expect(formatSectionHeader("fyi")).toBe("## Updates\n\n");
  });

  it("returns Background header for noise", () => {
    expect(formatSectionHeader("noise")).toBe("## Background\n\n");
  });
});

describe("formatInsightMarkdown", () => {
  it("formats action_required with bold summary and action arrow", () => {
    const email = createEmail({ from: "Railway <hello@railway.app>" });
    const insight: EmailInsight = {
      summary: "Upgrade your Railway plan before tomorrow or your app gets paused.",
      category: "business",
      urgency: "action_required",
      action: "Upgrade your Railway plan in the dashboard."
    };

    const result = formatInsightMarkdown(email, insight);

    expect(result).toContain("**Upgrade your Railway plan");
    expect(result).toContain("-> Upgrade your Railway plan in the dashboard.");
    expect(result).toContain("---");
  });

  it("formats action_required without action arrow when action is null", () => {
    const email = createEmail();
    const insight: EmailInsight = {
      summary: "Something urgent happened.",
      category: "business",
      urgency: "action_required",
      action: null
    };

    const result = formatInsightMarkdown(email, insight);

    expect(result).toContain("**Something urgent happened.**");
    expect(result).not.toContain("->");
  });

  it("formats fyi with from, subject, and summary", () => {
    const email = createEmail({
      from: "billing@stripe.com",
      subject: "Payment receipt"
    });
    const insight: EmailInsight = {
      summary: "Railway charged $5.00 for your Hobby plan.",
      category: "business",
      urgency: "fyi",
      action: null
    };

    const result = formatInsightMarkdown(email, insight);

    expect(result).toContain("**From:** billing@stripe.com");
    expect(result).toContain("**Subject:** Payment receipt");
    expect(result).toContain("Railway charged $5.00");
    expect(result).toContain("---");
  });

  it("formats noise as compact bullet with sender name", () => {
    const email = createEmail({
      from: "Max Krueger <notifications@github.com>",
      subject: "CI failed"
    });
    const insight: EmailInsight = {
      summary: "CI failed on email-agent main branch.",
      category: "automated",
      urgency: "noise",
      action: null
    };

    const result = formatInsightMarkdown(email, insight);

    expect(result).toBe("- CI failed on email-agent main branch. _(Max Krueger)_\n");
  });

  it("formats newsletter as reading list entry", () => {
    const email = createEmail({
      from: "Every <hello@every.to>",
      subject: "The Two-slice Team"
    });
    const insight: EmailInsight = {
      summary: "Team size heuristics replacing Amazon's two-pizza rule.",
      category: "newsletter_or_spam",
      urgency: "fyi",
      action: null
    };

    const result = formatInsightMarkdown(email, insight);

    expect(result).toBe(
      "- **The Two-slice Team** (Every) -- Team size heuristics replacing Amazon's two-pizza rule.\n"
    );
  });

  it("extracts sender name from email-style from field", () => {
    const email = createEmail({ from: '"John Doe" <john@example.com>' });
    const insight: EmailInsight = {
      summary: "CI noise.",
      category: "automated",
      urgency: "noise",
      action: null
    };

    const result = formatInsightMarkdown(email, insight);

    expect(result).toContain("_(John Doe)_");
  });

  it("falls back to full from when no name is parseable", () => {
    const email = createEmail({ from: "<noreply@github.com>" });
    const insight: EmailInsight = {
      summary: "CI noise.",
      category: "automated",
      urgency: "noise",
      action: null
    };

    const result = formatInsightMarkdown(email, insight);

    expect(result).toContain("_(<noreply@github.com>)_");
  });
});

function createInsight(
  category: EmailCategory,
  urgency: EmailUrgency = "fyi",
  action: string | null = null
): EmailInsight {
  return { summary: `A ${category} message.`, category, urgency, action };
}

describe("formatDigestIntro", () => {
  it("uses singular 'needs' for 1 action_required", () => {
    const insights = [createInsight("business", "action_required", "Do it.")];
    const result = formatDigestIntro(insights);

    expect(result).toContain("**1 needs attention**");
  });

  it("uses plural 'need' for multiple action_required", () => {
    const insights = [
      createInsight("business", "action_required", "Do it."),
      createInsight("personal", "action_required", "Do it too.")
    ];
    const result = formatDigestIntro(insights);

    expect(result).toContain("**2 need attention**");
  });

  it("uses singular 'update' for 1 fyi", () => {
    const insights = [createInsight("business", "fyi")];
    const result = formatDigestIntro(insights);

    expect(result).toContain("1 update.");
  });

  it("uses plural 'updates' for multiple fyi", () => {
    const insights = [createInsight("business", "fyi"), createInsight("personal", "fyi")];
    const result = formatDigestIntro(insights);

    expect(result).toContain("2 updates");
  });

  it("includes background count", () => {
    const insights = [createInsight("automated", "noise"), createInsight("automated", "noise")];
    const result = formatDigestIntro(insights);

    expect(result).toContain("2 background");
  });

  it("omits categories with zero count", () => {
    const insights = [createInsight("business", "fyi")];
    const result = formatDigestIntro(insights);

    expect(result).not.toContain("attention");
    expect(result).not.toContain("background");
  });
});
