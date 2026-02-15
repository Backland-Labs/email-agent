# Gmail Insights Agent

A Bun + TypeScript agent that reads unread Gmail messages and streams structured insights over an AG-UI-compatible SSE endpoint.

## What It Does

- Connects to Gmail with OAuth2 (single-user env-based credentials)
- Fetches up to 20 unread emails from INBOX
- Extracts structured insight per email (priority, sentiment, action items, relationship, urgency)
- Streams markdown insights as AG-UI events for `agent-ui`

## Current Status

v1 is implemented and passing the full quality gate:

- Unread inbox fetch + parsing
- Insight extraction with the Vercel AI SDK and schema validation
- AG-UI SSE lifecycle (`RUN_STARTED` to `RUN_FINISHED`)
- Health endpoint and request validation
- 100% test coverage and lint/type checks

## Prerequisites

- Bun 1.1+
- Google Cloud project with Gmail API enabled
- OAuth consent screen configured
- OAuth client credentials (Web application)
- Anthropic API key

## Setup

1. Install dependencies:

```bash
bun install
```

2. Create a local env file:

```bash
cp .env.example .env.local
```

3. Fill in:

- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `ANTHROPIC_API_KEY`

4. Generate your Gmail refresh token:

```bash
bun run scripts/setup-gmail-oauth.ts
```

The script opens the Google consent screen, waits for the callback on `http://localhost:3456/oauth2callback`, then prints `GMAIL_REFRESH_TOKEN`.

5. Add the printed refresh token to `.env.local`:

```bash
GMAIL_REFRESH_TOKEN=...
```

## Running the Agent

Development:

```bash
bun run dev
```

Production mode:

```bash
bun run start
```

Default port is `3001` (override with `PORT`).

## Endpoints

- `GET /health` -> `{ "status": "ok" }`
- `POST /agent` -> AG-UI SSE stream (`RUN_STARTED`, text events, `RUN_FINISHED`)

## Next Improvements

- Add transient-retry and backoff for unstable Gmail/LLM calls
- Add startup env/config validation with actionable errors
- Add run telemetry (emails fetched, successful insights, skipped failures)
- Expand resilience tests (timeouts, partial failures, malformed payloads)

## Connect to agent-ui

In `../agent-ui/agents.config.json`, add:

```json
{
  "id": "gmail-insights-agent",
  "name": "Gmail Insights Agent",
  "endpoint_url": "http://localhost:3001/agent",
  "description": "Reads unread Gmail and streams structured insights"
}
```

## Quality Checks

Run the full local gate:

```bash
bun run check
```

## Opencode Thread Export Utility

Utility for posting Opencode session transcripts to GitHub PR comments:

```bash
bun run opencode:append-thread --pr <PR_NUMBER> [--format text|json]
```

- Defaults to JSON mode when run via script default and supports `--json`.
- Supports `--pr`, `--repo`, and `--session` overrides.
- Supports `--format text` and `--format json`.
- Automatically updates existing thread comments and removes stale split comments.

Required credentials:

- `GITHUB_TOKEN` or `GH_TOKEN` (or authenticated `gh` CLI)

Optional env:

- `OPENCODE_SESSION_ID`
- `OPENCODE_THREAD_FORMAT`
