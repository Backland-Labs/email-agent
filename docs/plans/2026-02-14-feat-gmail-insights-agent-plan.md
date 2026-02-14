---
title: "feat: Gmail Insights Agent"
type: feat
date: 2026-02-14
---

# Gmail Insights Agent

## Overview

Build a TypeScript AI agent that connects to Gmail via OAuth2, reads unread emails, and streams structured insights (priority, urgency, action items, relationship context, sentiment) as formatted markdown through an AG-UI-compatible SSE endpoint. The agent runs on Bun, uses Vercel AI SDK 6 with Anthropic Claude for LLM-powered extraction, and integrates with the sibling `../agent-ui` frontend.

## Problem Statement

Email overload makes it hard to identify what matters. Manual triage is time-consuming and error-prone. An AI agent that reads Gmail and surfaces structured insights -- priority levels, action items, relationship context, and tone -- enables faster decision-making without requiring the user to read every message.

## Key Decisions

Decisions from brainstorm and planning:

- **Single-user model**: One set of Gmail credentials via environment variables. No multi-tenant OAuth.
- **No PII stripping in v1**: Full email content sent to LLM. PII stripping deferred to a future phase.
- **Streamed text delivery**: Insights delivered as formatted markdown via `TEXT_MESSAGE_CONTENT` events. No `STATE_SNAPSHOT` -- works with current agent-ui frontend without changes.
- **Unread only, up to 20**: Fetch up to 20 unread emails from INBOX per run.
- **Vercel AI SDK 6**: Use `streamText` with `Output.object()` and Zod schemas. `streamObject()` is deprecated.
- **AG-UI protocol**: SSE event stream with `@ag-ui/core` types and `@ag-ui/encoder` for wire format.
- **One LLM call per email**: Process emails individually for better error isolation and progressive streaming.
- **Test-Driven Development (TDD)**: Every implementation task follows the red-green-refactor cycle. Write failing tests first, then implement the minimum code to pass, then refactor. Tests are written before production code in every phase.

## Technical Approach

### Architecture

```
agent-ui (frontend)                    email-agent (this repo)
     |                                       |
     | POST /api/gateway                     |
     v                                       |
  Gateway ----POST /agent----->  Bun.serve() |
     |        RunAgentInput        |         |
     |                             v         |
     |                     Parse request     |
     |                             |         |
     |                     Fetch Gmail       |
     |                     (up to 20 unread) |
     |                             |         |
     |                     For each email:   |
     |                       Parse headers   |
     |                       Decode body     |
     |                       Build prompt    |
     |                       streamText()    |
     |                       Stream insight  |
     |                             |         |
     |  <--- SSE events ----------+         |
     |  RUN_STARTED                          |
     |  TEXT_MESSAGE_START                   |
     |  TEXT_MESSAGE_CONTENT (per insight)   |
     |  TEXT_MESSAGE_END                     |
     |  RUN_FINISHED                         |
```

### File Structure

```
src/
  domain/
    email-metadata.ts         -- EmailMetadata type, Zod schema, factory
    email-insight.ts          -- EmailInsight type, Zod schema, InsightPriority/Sentiment unions
  services/
    gmail/
      create-auth-client.ts   -- OAuth2 client from env vars, token refresh listener
      fetch-unread-emails.ts  -- messages.list (unread, INBOX) + concurrent messages.get
      parse-gmail-message.ts  -- Header extraction, base64url body decoding, MIME handling
    ai/
      build-insight-prompt.ts -- System + user prompt construction for single email
      extract-email-insight.ts-- streamText + Output.object() wrapper, Zod validation
    streaming/
      encode-ag-ui-events.ts  -- SSE event helpers using @ag-ui/encoder
  handlers/
    agent-endpoint.ts         -- POST /agent request handler, orchestrates the full pipeline
    health-endpoint.ts        -- GET /health handler
  server.ts                   -- Bun.serve() entry point, route dispatch
  index.ts                    -- Barrel exports for domain + services

tests/
  domain/
    email-metadata.test.ts
    email-insight.test.ts
  services/
    gmail/
      create-auth-client.test.ts
      fetch-unread-emails.test.ts
      parse-gmail-message.test.ts
    ai/
      build-insight-prompt.test.ts
      extract-email-insight.test.ts
    streaming/
      encode-ag-ui-events.test.ts
  handlers/
    agent-endpoint.test.ts
    health-endpoint.test.ts
  server.test.ts
```

### Dependencies

Production:

- `ai` -- Vercel AI SDK 6 (streamText, Output.object, tool)
- `@ai-sdk/anthropic` -- Anthropic provider for AI SDK
- `@ag-ui/core` -- AG-UI event types, RunAgentInput schema
- `@ag-ui/encoder` -- SSE event encoding
- `googleapis` -- Gmail API client (includes google-auth-library)
- `zod` -- Schema validation (required by AI SDK and for domain types)

No additional devDependencies needed -- the template already has TypeScript, Vitest, ESLint, Prettier.

### Environment Variables

```
# Gmail OAuth2 (single-user)
GMAIL_CLIENT_ID=           # Google Cloud OAuth2 client ID
GMAIL_CLIENT_SECRET=       # Google Cloud OAuth2 client secret
GMAIL_REFRESH_TOKEN=       # Refresh token from OAuth consent flow

# LLM
ANTHROPIC_API_KEY=         # Anthropic API key
ANTHROPIC_MODEL=claude-sonnet-4-20250514  # Optional, defaults to sonnet

# Server
PORT=3001                  # Optional, defaults to 3001
```

## Implementation Phases

### Phase 1: Foundation -- Domain Types and Project Setup

Remove the sample todo code and establish the domain layer. **TDD: write tests first, then implement.**

**Tasks:**

- [x] Remove `src/domain/todo-id.ts`, `src/domain/todo-item.ts`, `src/services/todos/complete-todo.ts`, `tests/todo-workflow.test.ts`
- [x] Update `src/index.ts` barrel exports (clear old, prepare for new)
- [x] Install production dependencies: `bun add ai @ai-sdk/anthropic @ag-ui/core @ag-ui/encoder googleapis zod`
- [x] **RED:** Write `tests/domain/email-metadata.test.ts` -- tests for branded `EmailId` parsing, `EmailMetadata` factory validation, Zod schema parsing (valid and invalid inputs). Tests fail because types do not exist yet.
- [x] **GREEN:** Create `src/domain/email-metadata.ts` -- branded `EmailId` type, `EmailMetadata` type (id, threadId, subject, from, to, date, snippet, bodyText), Zod schema, factory function. Tests pass.
- [x] **RED:** Write `tests/domain/email-insight.test.ts` -- tests for `InsightPriority` enum constraints, `InsightSentiment` enum constraints, `ActionItem` schema parsing, `EmailInsight` full schema validation with valid and invalid inputs. Tests fail.
- [x] **GREEN:** Create `src/domain/email-insight.ts` -- `InsightPriority` union (`"high" | "medium" | "low"`), `InsightSentiment` union (`"positive" | "neutral" | "negative" | "urgent"`), `ActionItem` type, `RelationshipContext` union, `EmailInsight` type with Zod schema. Tests pass.
- [x] **REFACTOR:** Review domain types for clarity. Ensure consistent naming and minimal API surface.
- [x] Run `bun run check` -- all passing

**Files:** `src/domain/email-metadata.ts`, `src/domain/email-insight.ts`, `src/index.ts`, `tests/domain/email-metadata.test.ts`, `tests/domain/email-insight.test.ts`

### Phase 2: Gmail Integration

Connect to Gmail and fetch unread emails. **TDD: write tests first, then implement.**

**Tasks:**

- [x] **RED:** Write `tests/services/gmail/create-auth-client.test.ts` -- tests that auth client is created when all env vars present, throws descriptive error when `GMAIL_CLIENT_ID` missing, throws when `GMAIL_CLIENT_SECRET` missing, throws when `GMAIL_REFRESH_TOKEN` missing. Tests fail.
- [x] **GREEN:** Create `src/services/gmail/create-auth-client.ts` -- reads env vars, creates `google.auth.OAuth2` client, sets credentials, returns authenticated client. Tests pass.
- [x] **RED:** Write `tests/services/gmail/parse-gmail-message.test.ts` -- tests for plain text body extraction, multipart MIME handling (text/plain preferred over text/html), HTML fallback with tag stripping, missing body returns empty string, header extraction (From, To, Subject, Date), base64url decoding, returns valid `EmailMetadata`. Tests fail.
- [x] **GREEN:** Create `src/services/gmail/parse-gmail-message.ts` -- extracts headers, decodes base64url body, handles MIME types, returns `EmailMetadata`. Tests pass.
- [x] **RED:** Write `tests/services/gmail/fetch-unread-emails.test.ts` -- tests for list + get orchestration with mocked Gmail client, empty inbox returns empty array, concurrent fetching respects concurrency limit, uses correct query params (`is:unread`, INBOX label, maxResults 20). Tests fail.
- [x] **GREEN:** Create `src/services/gmail/fetch-unread-emails.ts` -- calls `messages.list` then concurrent `messages.get`, parses results with `parse-gmail-message`. Tests pass.
- [x] **REFACTOR:** Extract shared test fixtures (mock Gmail responses) if patterns emerge across test files.
- [x] Run `bun run check` -- all passing

**Files:** `src/services/gmail/create-auth-client.ts`, `src/services/gmail/parse-gmail-message.ts`, `src/services/gmail/fetch-unread-emails.ts`, `tests/services/gmail/create-auth-client.test.ts`, `tests/services/gmail/parse-gmail-message.test.ts`, `tests/services/gmail/fetch-unread-emails.test.ts`

### Phase 3: LLM Insight Extraction

Build the prompt and extract structured insights using Vercel AI SDK 6. **TDD: write tests first, then implement.**

**Tasks:**

- [x] **RED:** Write `tests/services/ai/build-insight-prompt.test.ts` -- tests that prompt includes subject, from, to, date, and body text from `EmailMetadata`; handles empty body gracefully; truncates body over 4000 chars; includes role instruction for executive assistant. Tests fail.
- [x] **GREEN:** Create `src/services/ai/build-insight-prompt.ts` -- takes `EmailMetadata`, returns prompt string. System prompt establishes role. User prompt includes all email fields. Body truncated at 4000 chars. Tests pass.
- [x] **RED:** Write `tests/services/ai/extract-email-insight.test.ts` -- mocks `streamText` from `ai` module; tests successful extraction returns valid `EmailInsight`; tests schema validation failure is caught and wrapped; tests LLM API error is wrapped with email context (subject/id); tests that `Output.object()` is called with correct schema. Tests fail.
- [x] **GREEN:** Create `src/services/ai/extract-email-insight.ts` -- takes model + `EmailMetadata`, builds prompt, calls `streamText` with `Output.object({ schema })`, returns parsed `EmailInsight`. Wraps errors with email context. Tests pass.
- [x] **REFACTOR:** Review prompt structure for clarity. Ensure error messages are actionable.
- [x] Run `bun run check` -- all passing

**Files:** `src/services/ai/build-insight-prompt.ts`, `src/services/ai/extract-email-insight.ts`, `tests/services/ai/build-insight-prompt.test.ts`, `tests/services/ai/extract-email-insight.test.ts`

### Phase 4: AG-UI Streaming and HTTP Server

Wire everything together with AG-UI event streaming over SSE. **TDD: write tests first, then implement.**

**Tasks:**

- [x] **RED:** Write `tests/services/streaming/encode-ag-ui-events.test.ts` -- tests that each encoder helper (`encodeRunStarted`, `encodeTextMessageStart`, `encodeTextMessageContent`, `encodeTextMessageEnd`, `encodeRunFinished`, `encodeRunError`) produces correctly formatted SSE data lines with expected `type` fields. Tests fail.
- [x] **GREEN:** Create `src/services/streaming/encode-ag-ui-events.ts` -- thin helpers around `@ag-ui/encoder` `EventEncoder`. Each returns an encoded `Uint8Array`. Tests pass.
- [x] **RED:** Write `tests/handlers/health-endpoint.test.ts` -- tests that handler returns 200 with `{ status: "ok" }` JSON body. Tests fail.
- [x] **GREEN:** Create `src/handlers/health-endpoint.ts` -- returns JSON response. Tests pass.
- [x] **RED:** Write `tests/handlers/agent-endpoint.test.ts` -- mocks Gmail and AI services; tests full SSE event lifecycle (RUN_STARTED -> TEXT_MESSAGE_START -> TEXT_MESSAGE_CONTENT\* -> TEXT_MESSAGE_END -> RUN_FINISHED); tests RUN_ERROR on Gmail failure; tests RUN_ERROR on invalid request body; tests empty inbox emits "no unread emails" message; tests individual email LLM failure is skipped (remaining emails still processed). Tests fail.
- [x] **GREEN:** Create `src/handlers/agent-endpoint.ts` -- handles `POST /agent`, parses `RunAgentInput`, returns streaming `Response` with SSE headers. Orchestrates full pipeline. Respects `request.signal` for abort. Tests pass.
- [x] **RED:** Write `tests/server.test.ts` -- tests routing: POST /agent dispatches to agent handler, GET /health dispatches to health handler, unknown paths return 404, non-POST to /agent returns 405. Tests fail.
- [x] **GREEN:** Create `src/server.ts` -- `Bun.serve()` on `PORT` (default 3001), route dispatch. Tests pass.
- [x] Update `src/index.ts` -- re-export domain types and key service functions.
- [x] Update `package.json` -- add `"start": "bun run src/server.ts"` and `"dev": "bun --watch run src/server.ts"` scripts.
- [x] **REFACTOR:** Review handler orchestration for simplicity. Ensure error paths are consistent.
- [x] Run `bun run check` -- all passing

**Files:** `src/services/streaming/encode-ag-ui-events.ts`, `src/handlers/agent-endpoint.ts`, `src/handlers/health-endpoint.ts`, `src/server.ts`, `src/index.ts`, `package.json`, `tests/services/streaming/encode-ag-ui-events.test.ts`, `tests/handlers/agent-endpoint.test.ts`, `tests/handlers/health-endpoint.test.ts`, `tests/server.test.ts`

### Phase 5: OAuth Setup Script and Documentation

Provide a way to obtain the Gmail refresh token.

**Tasks:**

- [x] Create `scripts/setup-gmail-oauth.ts` -- interactive Bun script that: prints instructions for creating Google Cloud OAuth credentials, starts a temporary local HTTP server on port 3456, opens the OAuth consent URL in the browser, handles the redirect callback to exchange the auth code for tokens, prints the refresh token for the user to add to `.env.local`
- [x] Create `.env.example` -- documents all required and optional environment variables with descriptions
- [x] Update `README.md` -- add setup instructions: prerequisites (Bun, Google Cloud project), OAuth setup steps, running the agent, connecting to agent-ui
- [x] Add Gmail Insights Agent entry to `../agent-ui/agents.config.json` (endpoint_url: `http://localhost:3001/agent`)

**Files:** `scripts/setup-gmail-oauth.ts`, `.env.example`, `README.md`, `../agent-ui/agents.config.json`

## Insight Output Format

Each email insight is streamed as a markdown block within `TEXT_MESSAGE_CONTENT`:

```markdown
### Re: Q4 Budget Review

**From:** Sarah Chen <sarah@company.com>
**Priority:** High | **Sentiment:** Urgent

**Action Items:**

- Review updated budget spreadsheet (Owner: you, Deadline: Feb 15)
- Send approval to finance team (Owner: you, Deadline: Feb 16)

**Relationship:** Manager
**Urgency Signals:** "need this by EOD Friday", "please prioritize"

---
```

All emails are streamed progressively -- the user sees each insight appear as it is extracted.

## Acceptance Criteria

### Functional Requirements

- [x] Agent starts with `bun run start` and listens on configured port
- [x] `GET /health` returns 200 with `{ status: "ok" }`
- [x] `POST /agent` accepts `RunAgentInput`, returns SSE stream
- [x] SSE stream follows AG-UI event lifecycle: `RUN_STARTED` -> `TEXT_MESSAGE_START` -> `TEXT_MESSAGE_CONTENT`\* -> `TEXT_MESSAGE_END` -> `RUN_FINISHED`
- [x] Fetches up to 20 unread INBOX emails from Gmail
- [x] Extracts structured insights per email: priority, urgency indicators, action items, sentiment, relationship context
- [x] Streams each insight as formatted markdown
- [x] Handles Gmail API errors gracefully (emits `RUN_ERROR`)
- [x] Handles LLM errors gracefully (skips failed email, continues with remaining)
- [x] Handles empty inbox (streams a "no unread emails" message)
- [x] Works with existing agent-ui frontend without frontend changes

### Development Process

- [x] TDD red-green-refactor cycle followed for every production file
- [x] Tests written before implementation in each phase
- [x] Each phase ends with `bun run check` passing (no broken windows)

### Non-Functional Requirements

- [x] All files under 300 non-comment, non-blank lines
- [x] No catch-all filenames (utils, helpers, common, misc)
- [x] Branded/semantic types for domain identifiers
- [x] `bun run check` passes (structure + format + lint + typecheck + tests)
- [x] 100% test coverage (lines, functions, branches, statements)
- [x] All external boundaries mocked in tests (Gmail API, LLM provider)
- [x] `.js` extensions in all imports (NodeNext module resolution)
- [x] `import type` for type-only imports (verbatimModuleSyntax)
- [x] Double quotes, semicolons, no trailing commas (Prettier config)
- [x] `type` keyword for type definitions, never `interface` (ESLint rule)

## Dependencies and Risks

| Risk                                            | Likelihood      | Mitigation                                                      |
| ----------------------------------------------- | --------------- | --------------------------------------------------------------- |
| Gmail OAuth "Testing" mode 7-day token expiry   | High during dev | Document in README; move to production status for long-term use |
| `@ag-ui/encoder` Bun compatibility issues       | Low             | Falls back to manual SSE encoding (simple string concatenation) |
| AI SDK 6 API instability                        | Low             | Pin exact version in package.json                               |
| Gmail rate limiting during development          | Low             | Conservative concurrency (10 parallel), exponential backoff     |
| LLM context window exceeded on very long emails | Medium          | Truncate email body to 4000 chars in prompt builder             |

## References

### Internal

- Brainstorm: `docs/brainstorms/2026-02-14-gmail-insights-agent-brainstorm.md`
- Project conventions: `AGENTS.md`
- Existing patterns: `src/domain/todo-id.ts` (branded types), `src/domain/todo-item.ts` (factory functions)
- Agent-UI gateway: `../agent-ui/src/app/api/gateway/route.ts`
- Agent-UI chat hook: `../agent-ui/src/lib/hooks/useAgentChat.ts`

### External

- [AG-UI Protocol Documentation](https://docs.ag-ui.com)
- [Vercel AI SDK 6 Documentation](https://ai-sdk.dev/docs/introduction)
- [AI SDK 5 to 6 Migration Guide](https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0)
- [Gmail API Reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages)
- [Gmail API Scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Gmail API Quota Reference](https://developers.google.com/workspace/gmail/api/reference/quota)

### Institutional Learnings

- Pino logger transport incompatible with Bun worker threads -- use stdout piping (`docs/solutions-research.md`)
- One concern per file, named for what it contains -- agents navigate by filename first
- God files (>300 lines mixing concerns) dramatically reduce agent effectiveness
