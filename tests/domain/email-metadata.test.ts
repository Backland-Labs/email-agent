import { describe, it, expect } from "vitest";
import {
  parseEmailId,
  createEmailMetadata,
  emailMetadataSchema
} from "../../src/domain/email-metadata.js";

describe("parseEmailId", () => {
  it("parses a valid email ID", () => {
    const id = "abc123def456";
    const result = parseEmailId(id);
    expect(result).toBe(id);
  });

  it("throws for empty string", () => {
    expect(() => parseEmailId("")).toThrow("EmailId cannot be empty");
  });

  it("throws for whitespace-only string", () => {
    expect(() => parseEmailId("   ")).toThrow("EmailId cannot be empty");
  });
});

describe("createEmailMetadata", () => {
  it("creates valid EmailMetadata from valid input", () => {
    const input = {
      id: "msg123",
      threadId: "thread123",
      subject: "Test Subject",
      from: "sender@example.com",
      to: "recipient@example.com",
      date: "2024-01-15T10:00:00Z",
      snippet: "This is a preview",
      bodyText: "Full email body"
    };
    const result = createEmailMetadata(input);
    expect(result.id).toBe("msg123");
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
      id: "msg123",
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
      id: "msg123",
      threadId: "thread123",
      subject: "Test Subject",
      from: "sender@example.com",
      to: "recipient@example.com",
      date: "2024-01-15T10:00:00Z",
      snippet: "This is a preview",
      bodyText: "Full email body"
    };
    const result = emailMetadataSchema.parse(input);
    expect(result.id).toBe("msg123");
  });

  it("fails parsing with missing required fields", () => {
    const input = {
      id: "msg123"
      // missing other fields
    };
    expect(() => emailMetadataSchema.parse(input)).toThrow();
  });
});
