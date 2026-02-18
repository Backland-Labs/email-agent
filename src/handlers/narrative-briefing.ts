import type { EmailUrgency, EmailInsight } from "../domain/email-insight.js";
import type { EmailMetadata } from "../domain/email-metadata.js";
import { MAX_ACTION_ITEMS } from "./narrative-constants.js";

const MAX_INSIGHT_BULLETS = 3;
const SLANG_DENYLIST = ["asap", "btw", "gonna", "kinda", "lol"];

type NarrativeAnalysisLike = {
  email: EmailMetadata;
  insight: EmailInsight;
};

type NarrativeInput = {
  results: NarrativeAnalysisLike[];
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
  const { results } = input;
  const selectedResults = results.slice(0, MAX_INSIGHT_BULLETS);
  const actionRequired = selectedResults.filter(
    (result) => result.insight.urgency === "action_required"
  );
  const fyi = selectedResults.filter((result) => result.insight.urgency === "fyi");
  const noise = selectedResults.filter((result) => result.insight.urgency === "noise");

  if (results.length === 0) {
    return "No high-signal updates were found in the last 48 hours.";
  }

  const sections: string[] = [];

  if (fyi.length > 0) {
    sections.push(formatUrgencySection("fyi", fyi));
  }

  if (actionRequired.length > 0) {
    sections.push(formatUrgencySection("action_required", actionRequired));
  }

  if (noise.length > 0) {
    sections.push(formatUrgencySection("noise", noise));
  }

  return sections.join("\n\n");
}

export function formatUrgencySection(
  urgency: EmailUrgency,
  results: NarrativeAnalysisLike[]
): string {
  const lines = results
    .map(({ email, insight }) => {
      const summary = sanitizeNarrativeText(insight.summary);
      let line = `- ${extractSenderName(email.from)}: ${summary}`;

      if (insight.action) {
        line += `\n  -> ${sanitizeNarrativeText(insight.action)}`;
      }

      return line;
    })
    .join("\n");

  return `## ${URGENCY_LABELS[urgency]}\n${lines}`;
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
