import { describe, expect, it } from "vitest";

import { createEmailMetadata } from "../../../src/domain/email-metadata.js";
import { buildInsightPrompt } from "../../../src/services/ai/build-insight-prompt.js";

const emailIds = {
  base: "17ce8a2b6f3d40a9e",
  email2: "17ce8a2b6f3d40a9f",
  email3: "17ce8a2b6f3d40aa0",
  email4: "17ce8a2b6f3d40aa1",
  email5: "17ce8a2b6f3d40aa2",
  email6: "17ce8a2b6f3d40aa3",
  email7: "17ce8a2b6f3d40aa4"
} as const;

describe("buildInsightPrompt", () => {
  it("includes subject, from, to, date, and body text", () => {
    const email = createEmailMetadata({
      id: emailIds.base,
      threadId: "thread-1",
      subject: "Quarterly planning",
      from: "manager@example.com",
      to: "you@example.com",
      date: "Sat, 14 Feb 2026 11:00:00 +0000",
      snippet: "Please review",
      bodyText: "Please review the attached planning notes."
    });

    const prompt = buildInsightPrompt(email);

    expect(prompt.user).toContain("Quarterly planning");
    expect(prompt.user).toContain("manager@example.com");
    expect(prompt.user).toContain("you@example.com");
    expect(prompt.user).toContain("Sat, 14 Feb 2026 11:00:00 +0000");
    expect(prompt.user).toContain("Please review the attached planning notes.");
  });

  it("does not include email ID or thread ID in user prompt", () => {
    const email = createEmailMetadata({
      id: emailIds.base,
      threadId: "thread-1",
      subject: "Test",
      from: "sender@example.com",
      to: "recipient@example.com",
      date: "Sat, 14 Feb 2026 11:00:00 +0000",
      snippet: "Test",
      bodyText: "Body"
    });

    const prompt = buildInsightPrompt(email);

    expect(prompt.user).not.toContain("Email ID:");
    expect(prompt.user).not.toContain("Thread ID:");
  });

  it("handles empty body text gracefully", () => {
    const email = createEmailMetadata({
      id: emailIds.email2,
      threadId: "thread-2",
      subject: "No body",
      from: "sender@example.com",
      to: "recipient@example.com",
      date: "Sat, 14 Feb 2026 11:01:00 +0000",
      snippet: "No content",
      bodyText: ""
    });

    const prompt = buildInsightPrompt(email);

    expect(prompt.user).toContain("Body:\n(no body content)");
  });

  it("truncates body text over 4000 characters", () => {
    const longBody = "x".repeat(4100);
    const email = createEmailMetadata({
      id: emailIds.email3,
      threadId: "thread-3",
      subject: "Long body",
      from: "sender@example.com",
      to: "recipient@example.com",
      date: "Sat, 14 Feb 2026 11:02:00 +0000",
      snippet: "Long content",
      bodyText: longBody
    });

    const prompt = buildInsightPrompt(email);
    const bodySection = prompt.user.split("Body:\n")[1] ?? "";
    const truncatedBody = bodySection.replace(
      "\n\nReturn a JSON object that matches the requested schema.",
      ""
    );

    expect(truncatedBody.length).toBe(4000);
  });

  it("includes chief of staff role instruction mentioning Max", () => {
    const email = createEmailMetadata({
      id: emailIds.email4,
      threadId: "thread-4",
      subject: "Role check",
      from: "sender@example.com",
      to: "recipient@example.com",
      date: "Sat, 14 Feb 2026 11:03:00 +0000",
      snippet: "Role content",
      bodyText: "Check role instruction"
    });

    const prompt = buildInsightPrompt(email);

    expect(prompt.system.toLowerCase()).toContain("chief of staff");
    expect(prompt.system).toContain("Max");
  });

  it("includes category classification instructions", () => {
    const email = createEmailMetadata({
      id: emailIds.email5,
      threadId: "thread-5",
      subject: "Category check",
      from: "sender@example.com",
      to: "recipient@example.com",
      date: "Sat, 14 Feb 2026 11:04:00 +0000",
      snippet: "Category content",
      bodyText: "Check category instruction"
    });

    const prompt = buildInsightPrompt(email);

    expect(prompt.system).toContain("personal");
    expect(prompt.system).toContain("business");
    expect(prompt.system).toContain("automated");
    expect(prompt.system).toContain("newsletter_or_spam");
  });

  it("includes urgency classification instructions", () => {
    const email = createEmailMetadata({
      id: emailIds.email6,
      threadId: "thread-6",
      subject: "Urgency check",
      from: "sender@example.com",
      to: "recipient@example.com",
      date: "Sat, 14 Feb 2026 11:05:00 +0000",
      snippet: "Urgency content",
      bodyText: "Check urgency instruction"
    });

    const prompt = buildInsightPrompt(email);

    expect(prompt.system).toContain("action_required");
    expect(prompt.system).toContain("fyi");
    expect(prompt.system).toContain("noise");
  });

  it("includes action field instructions", () => {
    const email = createEmailMetadata({
      id: emailIds.email7,
      threadId: "thread-7",
      subject: "Action check",
      from: "sender@example.com",
      to: "recipient@example.com",
      date: "Sat, 14 Feb 2026 11:06:00 +0000",
      snippet: "Action content",
      bodyText: "Check action instruction"
    });

    const prompt = buildInsightPrompt(email);

    expect(prompt.system).toContain('"action"');
    expect(prompt.system).toContain("null");
  });

  it("includes explicit high-signal and anti-vague guidance", () => {
    const email = createEmailMetadata({
      id: "email-8",
      threadId: "thread-8",
      subject: "Signal check",
      from: "sender@example.com",
      to: "recipient@example.com",
      date: "Sat, 14 Feb 2026 11:07:00 +0000",
      snippet: "Signal content",
      bodyText: "Check signal rubric"
    });

    const prompt = buildInsightPrompt(email);

    expect(prompt.system).toContain("Signal bar");
    expect(prompt.system).toContain("what changed, why it matters");
    expect(prompt.system).toContain("Never invent facts");
    expect(prompt.system).toContain("avoid generic actions");
  });
});
