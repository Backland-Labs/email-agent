#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { createServer, type ServerResponse } from "node:http";

import { google } from "googleapis";

const CALLBACK_PORT = 3456;
const CALLBACK_PATH = "/oauth2callback";
const CALLBACK_URL = `http://localhost:${String(CALLBACK_PORT)}${CALLBACK_PATH}`;
const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const AUTH_TIMEOUT_MS = 5 * 60 * 1000;

async function main(): Promise<void> {
  printSetupInstructions();

  const clientId = requireEnv("GMAIL_CLIENT_ID");
  const clientSecret = requireEnv("GMAIL_CLIENT_SECRET");

  const oauthClient = new google.auth.OAuth2(clientId, clientSecret, CALLBACK_URL);

  const authUrl = oauthClient.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [GMAIL_READONLY_SCOPE],
    include_granted_scopes: true
  });

  const authCode = await waitForAuthorizationCode(authUrl);
  const tokenResponse = await oauthClient.getToken(authCode);
  const refreshToken = tokenResponse.tokens.refresh_token;

  if (!refreshToken) {
    throw new Error(
      "Google did not return a refresh token. Remove prior consent and retry with prompt=consent."
    );
  }

  console.log("\nOAuth setup complete. Add this to .env.local:\n");
  console.log(`GMAIL_REFRESH_TOKEN=${refreshToken}\n`);
}

function printSetupInstructions(): void {
  console.log("Gmail OAuth2 setup");
  console.log("==================");
  console.log("");
  console.log("Before continuing, confirm your Google Cloud project has:");
  console.log("1. Gmail API enabled");
  console.log("2. OAuth consent screen configured");
  console.log("3. OAuth client type: Web application");
  console.log(`4. Redirect URI includes: ${CALLBACK_URL}`);
  console.log("");
  console.log("Environment required before running this script:");
  console.log("- GMAIL_CLIENT_ID");
  console.log("- GMAIL_CLIENT_SECRET");
  console.log("");
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function waitForAuthorizationCode(authUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for OAuth callback."));
    }, AUTH_TIMEOUT_MS);

    const server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? "/", CALLBACK_URL);

      if (requestUrl.pathname !== CALLBACK_PATH) {
        response.statusCode = 404;
        response.end("Not found");
        return;
      }

      const error = requestUrl.searchParams.get("error");
      const code = requestUrl.searchParams.get("code");

      if (error) {
        sendHtml(response, 400, "Authorization failed", `Google returned error: ${error}`);
        cleanup();
        reject(new Error(`OAuth authorization failed: ${error}`));
        return;
      }

      if (!code) {
        sendHtml(response, 400, "Missing authorization code", "No code parameter was provided.");
        cleanup();
        reject(new Error("OAuth callback missing authorization code."));
        return;
      }

      sendHtml(
        response,
        200,
        "Authorization received",
        "You can close this tab and return to the terminal."
      );
      cleanup();
      resolve(code);
    });

    function cleanup(): void {
      clearTimeout(timeout);
      server.close();
    }

    server.listen(CALLBACK_PORT, () => {
      console.log(`Opening browser for consent: ${authUrl}`);
      openBrowser(authUrl);
      console.log(`Waiting for callback on ${CALLBACK_URL} ...`);
    });
  });
}

function sendHtml(response: ServerResponse, status: number, title: string, body: string): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.end(
    `<!doctype html><html><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p></body></html>`
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function openBrowser(url: string): void {
  const command =
    process.platform === "darwin"
      ? { bin: "open", args: [url] }
      : process.platform === "win32"
        ? { bin: "cmd", args: ["/c", "start", "", url] }
        : { bin: "xdg-open", args: [url] };

  const childProcess = spawn(command.bin, command.args, {
    detached: true,
    stdio: "ignore"
  });

  childProcess.unref();
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error("Unknown error during OAuth setup");
  }

  process.exit(1);
});
