import type { EmailInsight } from "../domain/email-insight.js";
import type { EmailMetadata } from "../domain/email-metadata.js";

export function formatInsightMarkdown(email: EmailMetadata, insight: EmailInsight): string {
  const actionItems =
    insight.actionItems.length === 0
      ? "- None"
      : insight.actionItems
          .map((actionItem) => {
            const deadline = actionItem.deadline ? `, Deadline: ${actionItem.deadline}` : "";
            return `- ${actionItem.task} (Owner: ${actionItem.owner}${deadline})`;
          })
          .join("\n");

  const urgencySignals =
    insight.urgencySignals.length === 0
      ? "None"
      : insight.urgencySignals.map((signal) => `"${signal}"`).join(", ");

  return (
    `### ${email.subject}\n` +
    `**From:** ${email.from}\n` +
    `**Priority:** ${capitalize(insight.priority)} | **Sentiment:** ${capitalize(insight.sentiment)}\n\n` +
    `**Action Items:**\n${actionItems}\n\n` +
    `**Relationship:** ${insight.relationshipContext}\n` +
    `**Urgency Signals:** ${urgencySignals}\n\n` +
    "---\n"
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
