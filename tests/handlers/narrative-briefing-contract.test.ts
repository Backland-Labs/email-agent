import { describe, expect, it } from "vitest";

import { createEmailMetadata } from "../../src/domain/email-metadata.js";
import {
  MAX_BRIEFING_BULLETS,
  MAX_NARRATIVE_WORDS_BEFORE_ACTION_ITEMS,
  buildNarrative,
  type NarrativeAnalysisResult
} from "../../src/handlers/narrative-endpoint-runtime.js";

function createTestEmail(id: string) {
  const normalized = id.toLowerCase().replace(/[^a-z0-9]/gu, "");
  const suffix = (normalized.length > 0 ? normalized : "x").padEnd(10, "0").slice(0, 10);

  return createEmailMetadata({
    id: `17ce8a2b6f3d${suffix}`,
    threadId: "thread-1",
    subject: "Test",
    from: "Alice <alice@example.com>",
    to: "you@example.com",
    date: "Sat, 14 Feb 2026 12:00:00 +0000",
    snippet: "Snippet",
    bodyText: "Body"
  });
}

describe("narrative briefing contract", () => {
  it("enforces concise narrative contract and no-exclamation tone", () => {
    const results: NarrativeAnalysisResult[] = [
      {
        email: createTestEmail("a"),
        insight: {
          summary:
            "Please urgently review the plan with detailed notes about dependencies and sequencing now!",
          category: "business",
          urgency: "action_required",
          action: "Follow up with finance right away!"
        }
      },
      {
        email: createTestEmail("b"),
        insight: {
          summary: "A background update for your awareness with no action required at this time.",
          category: "automated",
          urgency: "noise",
          action: null
        }
      }
    ];

    const narrative = buildNarrative({
      results,
      unreadCount: 2,
      actionItems: ["Follow up with finance right away"]
    });
    const textBeforeActionItems = narrative.split("## Action Items")[0] ?? "";
    const briefingSection = narrative.match(/## Briefing\n([\s\S]*?)\n\n/u)?.[1] ?? "";
    const briefingBulletCount = briefingSection
      .split("\n")
      .filter((line) => line.startsWith("- ")).length;
    const wordCountBeforeActionItems = countWordsExcludingHeadings(textBeforeActionItems);

    expect(briefingBulletCount).toBeLessThanOrEqual(MAX_BRIEFING_BULLETS);
    expect(wordCountBeforeActionItems).toBeLessThanOrEqual(MAX_NARRATIVE_WORDS_BEFORE_ACTION_ITEMS);
    expect(narrative).not.toContain("!");
  });
});

function countWordsExcludingHeadings(value: string): number {
  const withoutHeadings = value
    .split("\n")
    .filter((line) => !line.startsWith("#"))
    .join(" ");

  const words = withoutHeadings.match(/\S+/gu);

  return words?.length ?? 0;
}
