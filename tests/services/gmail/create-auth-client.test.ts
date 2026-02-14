import { beforeEach, describe, expect, it } from "vitest";
import { createAuthClient } from "../../../src/services/gmail/create-auth-client.js";

describe("createAuthClient", () => {
  beforeEach(() => {
    delete process.env.GMAIL_CLIENT_ID;
    delete process.env.GMAIL_CLIENT_SECRET;
    delete process.env.GMAIL_REFRESH_TOKEN;
  });

  it("creates an OAuth2 client when all env vars are present", () => {
    process.env.GMAIL_CLIENT_ID = "test-client-id";
    process.env.GMAIL_CLIENT_SECRET = "test-client-secret";
    process.env.GMAIL_REFRESH_TOKEN = "test-refresh-token";

    const client = createAuthClient();

    expect(client.credentials.refresh_token).toBe("test-refresh-token");
  });

  it("throws when GMAIL_CLIENT_ID is missing", () => {
    process.env.GMAIL_CLIENT_SECRET = "test-client-secret";
    process.env.GMAIL_REFRESH_TOKEN = "test-refresh-token";

    expect(() => createAuthClient()).toThrow("GMAIL_CLIENT_ID environment variable is required");
  });

  it("throws when GMAIL_CLIENT_SECRET is missing", () => {
    process.env.GMAIL_CLIENT_ID = "test-client-id";
    process.env.GMAIL_REFRESH_TOKEN = "test-refresh-token";

    expect(() => createAuthClient()).toThrow(
      "GMAIL_CLIENT_SECRET environment variable is required"
    );
  });

  it("throws when GMAIL_REFRESH_TOKEN is missing", () => {
    process.env.GMAIL_CLIENT_ID = "test-client-id";
    process.env.GMAIL_CLIENT_SECRET = "test-client-secret";

    expect(() => createAuthClient()).toThrow(
      "GMAIL_REFRESH_TOKEN environment variable is required"
    );
  });
});
