import type { EmailUrgency, EmailInsight } from "../domain/email-insight.js";
import type { EmailMetadata } from "../domain/email-metadata.js";
import { LOOKBACK_HOURS, MAX_ACTION_ITEMS, MAX_BRIEFING_BULLETS } from "./narrative-constants.js";

const MAX_INSIGHT_BULLETS = 3;
const SLANG_DENYLIST = ["asap", "btw", "gonna", "kinda", "lol"];

type NarrativeAnalysisLike = {
  email: EmailMetadata;
  insight: EmailInsight;
};

type NarrativeInput = {
  results: NarrativeAnalysisLike[];
  unreadCount: number;
  actionItems: string[];
};

const URGENCY_LABELS: Record<EmailUrgency, string> = {
  action_required: "Action Required",
  fyi: "Updates",
  noise: "Background"
};

export function extractActionItems(results: NarrativeAnalysisLike[]): string[] {
  const actionItems: string[] = [];
  const normalizedActionItems = new Set<string>();

  for (const { insight } of results) {
    if (!insight.action) {
      continue;
    }

    const action = insight.action.trim();

    if (action.length === 0) {
      continue;
    }

    const normalizedAction = normalizeActionItem(action);

    if (normalizedActionItems.has(normalizedAction)) {
      continue;
    }

    actionItems.push(sanitizeNarrativeText(action));
    normalizedActionItems.add(normalizedAction);
  }

  return actionItems.slice(0, MAX_ACTION_ITEMS);
}

export function buildNarrative(input: NarrativeInput): string {
  const { results, unreadCount, actionItems } = input;
  const analyzedCount = results.length;
  const selectedResults = results.slice(0, MAX_INSIGHT_BULLETS);
  const actionRequired = selectedResults.filter(
    (result) => result.insight.urgency === "action_required"
  );
  const fyi = selectedResults.filter((result) => result.insight.urgency === "fyi");
  const noise = selectedResults.filter((result) => result.insight.urgency === "noise");

  const bodySections: string[] = [
    "# 48h Inbox Narrative",
    "",
    formatBriefingSection({
      analyzedCount,
      unreadCount,
      actionItemCount: actionItems.length
    })
  ];

  if (results.length === 0) {
    bodySections.push("", "No high-signal updates were found in the last 48 hours.");
  } else {
    const sections: string[] = [];

    if (actionRequired.length > 0) {
      sections.push(formatUrgencySection("action_required", actionRequired));
    }

    if (fyi.length > 0) {
      sections.push(formatUrgencySection("fyi", fyi));
    }

    if (noise.length > 0) {
      sections.push(formatUrgencySection("noise", noise));
    }

    if (sections.length > 0) {
      bodySections.push("", sections.join("\n\n"));
    }
  }

  const constrainedBody = bodySections
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trimEnd();

  return `${constrainedBody}\n\n${formatActionItemsSection(actionItems)}`;
}

export function formatUrgencySection(
  urgency: EmailUrgency,
  results: NarrativeAnalysisLike[]
): string {
  const lines = results
    .map(({ email, insight }) => {
      const summary = sanitizeNarrativeText(insight.summary);
      const action = insight.action ? ` (${sanitizeNarrativeText(insight.action)})` : "";

      return `- ${extractSenderName(email.from)}: ${summary}${action}`;
    })
    .join("\n");

  return `## ${URGENCY_LABELS[urgency]}\n${lines}`;
}

export function formatActionItemsSection(actionItems: string[]): string {
  if (actionItems.length === 0) {
    return "## Action Items\n\n- No immediate action items.";
  }

  const lines = actionItems
    .map((actionItem) => `- ${sanitizeNarrativeText(actionItem)}`)
    .join("\n");

  return `## Action Items\n\n${lines}`;
}

function formatBriefingSection(input: {
  analyzedCount: number;
  unreadCount: number;
  actionItemCount: number;
}): string {
  const { analyzedCount, unreadCount, actionItemCount } = input;
  const lines: string[] = [];

  lines.push(
    `- Reviewed ${pluralize(unreadCount, "unread email")} in the ${String(LOOKBACK_HOURS)}-hour window.`
  );
  lines.push(`- ${pluralize(analyzedCount, "message")} produced high-signal insights.`);
  lines.push(
    actionItemCount > 0
      ? `- ${pluralize(actionItemCount, "immediate action item")} identified.`
      : "- No immediate action items were identified."
  );

  if (unreadCount > analyzedCount) {
    lines.push(`- ${pluralize(unreadCount - analyzedCount, "message")} could not be summarized.`);
  }

  return ["## Briefing", ...lines.slice(0, MAX_BRIEFING_BULLETS)].join("\n");
}

function normalizeActionItem(value: string): string {
  return sanitizeNarrativeText(value)
    .toLowerCase()
    .replace(/[.!?]+$/u, "");
}

function sanitizeNarrativeText(value: string): string {
  let sanitized = value.replace(/!/gu, "");

  for (const deniedTerm of SLANG_DENYLIST) {
    sanitized = sanitized.replace(new RegExp(`\\b${deniedTerm}\\b`, "giu"), "");
  }

  return sanitized.replace(/\s+/gu, " ").trim();
}

function pluralize(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? "" : "s"}`;
}

function extractSenderName(from: string): string {
  const parsedName = from.match(/^"?([^"<]+)"?\s*</);

  if (parsedName?.[1]) {
    return parsedName[1].trim();
  }

  const nameOnly = from.match(/^([^@<]+)/);

  if (nameOnly?.[1]) {
    return nameOnly[1].trim();
  }

  return from;
}
