# Gmail Insights Agent

A Bun + TypeScript agent that reads unread Gmail messages and streams structured insights over an AG-UI-compatible SSE endpoint.

## What It Does

- Connects to Gmail with OAuth2 (single-user env-based credentials)
- Fetches up to 20 unread emails from INBOX
- Extracts structured insight per email (priority, sentiment, action items, relationship, urgency)
- Streams markdown insights as AG-UI events for `agent-ui`

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
