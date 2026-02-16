import { describe, it, expect } from "vitest";
import { parseEmailId, createEmailMetadata, emailMetadataSchema } from "../../src/domain/email-metadata.js";

describe("parseEmailId", () => {
  it("parses a valid email ID", () => {
    const id = "abc123def456";
    const result = parseEmailId(id);
    expect(result).toBe(id);
  });

  it("parses a typical Gmail message ID", () => {
    const id = "18d3c5e8f9a2b1c4";
    const result = parseEmailId(id);
    expect(result).toBe(id);
  });

  it("throws for empty string", () => {
    expect(() => parseEmailId("")).toThrow("EmailId cannot be empty");
  });

  it("throws for whitespace-only string", () => {
    expect(() => parseEmailId("   ")).toThrow("EmailId cannot be empty");
  });

  it("throws for obviously invalid placeholder: test-email", () => {
    expect(() => parseEmailId("test-email")).toThrow(
      'Invalid emailId format: "test-email" appears to be a placeholder or test value'
    );
  });

  it("throws for obviously invalid placeholder: email-123", () => {
    expect(() => parseEmailId("email-123")).toThrow(
      'Invalid emailId format: "email-123" appears to be a placeholder or test value'
    );
  });

  it("throws for obviously invalid placeholder: msg-1", () => {
    expect(() => parseEmailId("msg-1")).toThrow(
      'Invalid emailId format: "msg-1" appears to be a placeholder or test value'
    );
  });

  it("throws for obviously invalid placeholder: message_123", () => {
    expect(() => parseEmailId("message_123")).toThrow(
      'Invalid emailId format: "message_123" appears to be a placeholder or test value'
    );
  });

  it("throws for too-short IDs", () => {
    expect(() => parseEmailId("abc123")).toThrow(
      'Invalid emailId format: "abc123" is too short'
    );
  });

  it("throws for single character ID", () => {
    expect(() => parseEmailId("a")).toThrow(
      'Invalid emailId format: "a" is too short'
    );
  });
});

describe("createEmailMetadata", () => {
  it("creates valid EmailMetadata from valid input", () => {
    const input = {
      id: "validmsg123abc",
      threadId: "thread123",
      subject: "Test Subject",
      from: "sender@example.com",
      to: "recipient@example.com",
      date: "2024-01-15T10:00:00Z",
      snippet: "This is a preview",
      bodyText: "Full email body"
    };
    const result = createEmailMetadata(input);
    expect(result.id).toBe("validmsg123abc");
    expect(result.subject).toBe("Test Subject");
    expect(result.bodyText).toBe("Full email body");
  });

  it("throws when id is empty", () => {
    const input = {
      id: "",
      threadId: "thread123",
      subject: "Test Subject",
      from: "sender@example.com",
      to: "recipient@example.com",
      date: "2024-01-15T10:00:00Z",
      snippet: "This is a preview",
      bodyText: "Full email body"
    };
    expect(() => createEmailMetadata(input)).toThrow("EmailId cannot be empty");
  });

  it("throws when subject is missing", () => {
    const input = {
      id: "validmsg123abc",
      threadId: "thread123",
      subject: "",
      from: "sender@example.com",
      to: "recipient@example.com",
      date: "2024-01-15T10:00:00Z",
      snippet: "This is a preview",
      bodyText: "Full email body"
    };
    expect(() => createEmailMetadata(input)).toThrow("Subject cannot be empty");
  });
});

describe("emailMetadataSchema", () => {
  it("parses valid input", () => {
    const input = {
      id: "validmsg123abc",
      threadId: "thread123",
      subject: "Test Subject",
      from: "sender@example.com",
      to: "recipient@example.com",
      date: "2024-01-15T10:00:00Z",
      snippet: "This is a preview",
      bodyText: "Full email body"
    };
    const result = emailMetadataSchema.parse(input);
    expect(result.id).toBe("validmsg123abc");
  });

  it("fails parsing with missing required fields", () => {
    const input = {
      id: "validmsg123abc"
      // missing other fields
    };
    expect(() => emailMetadataSchema.parse(input)).toThrow();
  });
});
