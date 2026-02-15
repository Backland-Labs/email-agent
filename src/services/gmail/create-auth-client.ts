import { google, type Auth } from "googleapis";

export type AuthClient = Auth.OAuth2Client;

export function createAuthClient(): AuthClient {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId) {
    throw new Error("GMAIL_CLIENT_ID environment variable is required");
  }

  if (!clientSecret) {
    throw new Error("GMAIL_CLIENT_SECRET environment variable is required");
  }

  if (!refreshToken) {
    throw new Error("GMAIL_REFRESH_TOKEN environment variable is required");
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, "http://localhost");

  oauth2Client.setCredentials({
    refresh_token: refreshToken
  });

  return oauth2Client;
}
