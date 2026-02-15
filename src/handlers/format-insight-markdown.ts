import type { EmailInsight, EmailUrgency } from "../domain/email-insight.js";
import type { EmailMetadata } from "../domain/email-metadata.js";

const URGENCY_SECTION_HEADERS: Record<EmailUrgency, string> = {
  action_required: "## Action Required\n\n",
  fyi: "## Updates\n\n",
  noise: "## Background\n\n"
};

export function formatSectionHeader(urgency: EmailUrgency): string {
  return URGENCY_SECTION_HEADERS[urgency];
}

export function formatInsightMarkdown(email: EmailMetadata, insight: EmailInsight): string {
  if (insight.urgency === "action_required") {
    return formatActionRequired(email, insight);
  }

  if (insight.urgency === "noise") {
    return formatNoise(email, insight);
  }

  if (insight.category === "newsletter_or_spam") {
    return formatNewsletter(email, insight);
  }

  return formatFyi(email, insight);
}

function formatActionRequired(email: EmailMetadata, insight: EmailInsight): string {
  let block = `**${insight.summary}**\n` + `_From: ${email.from} | Subject: ${email.subject}_\n`;

  if (insight.action) {
    block += `-> ${insight.action}\n`;
  }

  block += "\n---\n";
  return block;
}

function formatFyi(email: EmailMetadata, insight: EmailInsight): string {
  return (
    `**From:** ${email.from}\n` +
    `**Subject:** ${email.subject}\n` +
    `${insight.summary}\n\n` +
    "---\n"
  );
}

function formatNoise(email: EmailMetadata, insight: EmailInsight): string {
  return `- ${insight.summary} _(${extractSenderName(email.from)})_\n`;
}

function formatNewsletter(email: EmailMetadata, insight: EmailInsight): string {
  const senderName = extractSenderName(email.from);
  return `- **${email.subject}** (${senderName}) -- ${insight.summary}\n`;
}

export function formatDigestIntro(insights: EmailInsight[]): string {
  const actionCount = insights.filter((i) => i.urgency === "action_required").length;
  const fyiCount = insights.filter((i) => i.urgency === "fyi").length;
  const noiseCount = insights.filter((i) => i.urgency === "noise").length;

  let intro = `# Inbox Briefing\n\n`;
  intro += `${String(insights.length)} unread emails`;

  const parts: string[] = [];

  if (actionCount > 0) {
    parts.push(`**${String(actionCount)} need${actionCount === 1 ? "s" : ""} attention**`);
  }

  if (fyiCount > 0) {
    parts.push(`${String(fyiCount)} update${fyiCount === 1 ? "" : "s"}`);
  }

  if (noiseCount > 0) {
    parts.push(`${String(noiseCount)} background`);
  }

  if (parts.length > 0) {
    intro += `: ${parts.join(", ")}`;
  }

  intro += ".\n\n";

  return intro;
}

function extractSenderName(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*</);

  if (match?.[1]) {
    return match[1].trim();
  }

  const nameOnly = from.match(/^([^@<]+)/);

  if (nameOnly?.[1]) {
    return nameOnly[1].trim();
  }

  return from;
}
