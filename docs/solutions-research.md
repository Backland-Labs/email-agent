# Institutional Learnings: Gmail Insights Agent

**Date**: 2026-02-14
**Task**: Research documented solutions and patterns relevant to building a Gmail Insights Agent with Vercel AI SDK, AG-UI, and TypeScript

## Search Context

- **Feature/Task**: Building a TypeScript AI agent for Gmail integration with AG-UI compatibility
- **Keywords Searched**: Gmail API, AG-UI protocol, Vercel AI SDK, TypeScript patterns, Email processing, Bun runtime, AI agent architecture
- **Sources Searched**:
  - `/Users/max/code/alpine/docs/solutions/` (7 files)
  - `/Users/max/code/agent-ui/docs/solutions/` (1 file)
  - Project brainstorm and architecture decisions
- **Relevant Matches Found**: 5 learnings across 2 categories

---

## Critical Patterns (Required Reading)

### Pattern #1: One Concern Per File, Named For What It Contains

**From**: `/Users/max/code/alpine/docs/solutions/patterns/critical-patterns.md`

**Relevance**: This is a MUST-FOLLOW pattern for this codebase. AI agents navigate by reading filenames first, then file contents. This directly impacts agent effectiveness.

**Key Requirements**:

- Each TypeScript file should have ONE concern, named for that concern
- Keep files under ~300 non-comment, non-blank lines (aim for ~200)
- File names become documentation: `gmail-sync.ts` not `utils.ts`
- Each test file mirrors its source file: `gmail-sync.ts` -> `gmail-sync.test.ts`

**Application to Gmail Insights Agent**:

When building this agent, structure like this:

```
src/
├── domain/
│   ├── insight.ts          -- Insight types and value objects
│   ├── insight-id.ts       -- Semantic ID type for insights
│   ├── email-metadata.ts   -- Email metadata types
│   └── gmail-credentials.ts -- Auth credential types
├── services/
│   ├── gmail/
│   │   ├── authenticate.ts  -- OAuth setup and token refresh
│   │   ├── fetch-emails.ts  -- Gmail API list/get calls
│   │   ├── parse-email.ts   -- Email body parsing
│   │   └── extract-headers.ts -- Header extraction
│   ├── insights/
│   │   ├── priority-analyzer.ts
│   │   ├── urgency-scorer.ts
│   │   ├── action-extractor.ts
│   │   ├── relationship-context.ts
│   │   └── sentiment-analyzer.ts
│   └── ai/
│       ├── vercel-ai-client.ts -- Vercel SDK wrapper
│       └── model-prompt.ts     -- System/user prompt builders
├── handlers/
│   ├── ag-ui-endpoint.ts    -- AG-UI protocol handler
│   └── ag-ui-response.ts    -- AG-UI schema serialization
└── index.ts                 -- Main entry point
```

**Prevention**:

- Do not put Gmail auth, parsing, and insights all in `gmail.ts`
- When adding new insight types (relationship, sentiment), create separate files
- Keep the Vercel AI SDK wrapper isolated from business logic
- Test file mirrors: `priority-analyzer.ts` -> `priority-analyzer.test.ts`

---

## Relevant Learnings

### Learning #1: Bun Runtime - Pino Logger Transport Bug Requires Workaround

**File**: `/Users/max/code/agent-ui/docs/solutions/integration-issues/pino-transport-bun-incompatibility-system-20260213.md`

**Module**: System (logging infrastructure)
**Severity**: Medium
**Problem Type**: Integration issue
**Component**: Tooling (Bun runtime compatibility)

**Relevance**: This repository uses Bun as its runtime and package manager. If you add logging via Pino, you'll hit this exact issue.

**Key Insight**:

- **BROKEN**: Pino's `transport: { target: "pino-pretty" }` option fails with Bun due to worker thread module resolution bug
- **SOLUTION**: Use pipe-based pretty-printing in `package.json` dev script instead

**Correct Pattern for this Project**:

```typescript
// src/lib/logger.ts - CORRECT for Bun
import pino from "pino";

const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug");

export const logger = pino({
  level,
  serializers: { err: pino.stdSerializers.err },
  redact: {
    paths: [
      "authorization",
      "cookie",
      "refreshToken",
      "secret",
      "token",
      "password",
      // Add sensitive fields for Gmail API responses
      "accessToken",
      "idToken"
    ],
    censor: "[REDACTED]"
  }
});
```

```json
// package.json - dev script uses pipe
{
  "scripts": {
    "dev": "tsx src/index.ts | bunx pino-pretty"
  }
}
```

**Prevention**:

- Never use Pino's `transport` option with Bun
- Always pipe stdout through `pino-pretty` in dev mode
- Log JSON to stdout in production (Railway/hosting parses it natively)
- When adding any Node.js library that uses worker threads, test explicitly with Bun

**Related Issue**: [oven-sh/bun#23062](https://github.com/oven-sh/bun/issues/23062)

---

### Learning #2: Authentication - OAuth Token Passthrough vs API Key

**File**: `/Users/max/code/alpine/docs/solutions/developer-experience/oauth-token-support-alpine-cli-20260212.md`

**Module**: System (authentication)
**Severity**: Medium
**Problem Type**: Developer experience
**Component**: Tooling

**Relevance**: Your agent will need to authenticate with Gmail API. This pattern shows the right way to handle multiple auth methods in a TypeScript/Bun context.

**Key Insight**:
Support multiple auth paths in order of preference:

1. OAuth token (`CLAUDE_CODE_OAUTH_TOKEN` or custom `GMAIL_OAUTH_TOKEN`)
2. API key fallback (`GMAIL_API_KEY`)
3. Interactive setup if neither is set

**Pattern for Gmail Insights Agent**:

```typescript
// src/services/gmail/authenticate.ts

export async function getGmailAuth() {
  // Path 1: OAuth token from environment
  const oauthToken = process.env.GMAIL_OAUTH_TOKEN;
  if (oauthToken) {
    return createOAuth2ClientFromToken(oauthToken);
  }

  // Path 2: API key fallback
  const apiKey = process.env.GMAIL_API_KEY;
  if (apiKey) {
    return createApiKeyClient(apiKey);
  }

  // Path 3: Interactive setup
  logger.info("No Gmail auth credentials found. Starting interactive setup...");
  const setupClient = await setupNewGmailAuth();
  return setupClient;
}
```

Use environment passthrough syntax (no literal values):

```typescript
// config/docker-compose.yml or Vercel deployment
// DO: Pass through env var
environment:
  - GMAIL_OAUTH_TOKEN
  - GMAIL_API_KEY

// DON'T: Hardcode values
environment:
  - GMAIL_OAUTH_TOKEN=abc123...
```

**Security Preserved**:

- OAuth tokens never written to logs (redact in logger config)
- API keys never committed to code
- Use `.env.local` for local development (in `.gitignore`)

---

### Learning #3: File Structure - Keep Concerns Separated for Agent Effectiveness

**File**: `/Users/max/code/alpine/docs/solutions/developer-experience/god-file-refactor-to-single-concern-files-alpine-cli-20260212.md`

**Module**: System (all)
**Severity**: Medium
**Problem Type**: Developer experience
**Component**: Tooling (codebase organization)

**Relevance**: Reinforces Critical Pattern #1 with a real-world refactor example. A 735-line `docker.go` was split into 7 focused files, improving agent navigation and reducing context costs.

**Applied Example for Gmail Agent**:

**BEFORE (BAD - Makes agents read unnecessary code)**:

```
src/
├── gmail.ts        -- 650 lines (auth + fetch + parse + analytics + insights)
└── gmail.test.ts   -- 800 lines
```

**AFTER (GOOD - Clear navigation)**:

```
src/services/gmail/
├── authenticate.ts      -- 85 lines (OAuth, token refresh)
├── fetch-emails.ts      -- 120 lines (Gmail API list/get)
├── parse-email.ts       -- 95 lines (Body/headers parsing)
└── gmail.test.ts        -- Split into 4 mirrors

src/services/insights/
├── priority-analyzer.ts -- 110 lines (Priority extraction)
├── urgency-scorer.ts    -- 105 lines (Urgency calculation)
├── action-extractor.ts  -- 130 lines (Action items)
├── sentiment-analyzer.ts -- 95 lines (Tone/mood)
└── insights.test.ts     -- Split into 4 mirrors
```

**Key Moves**:

- Move authentication logic to `services/gmail/authenticate.ts`
- Move email body parsing to `services/gmail/parse-email.ts`
- Move each insight type to its own file in `services/insights/`
- Move Vercel AI SDK wrapper to `services/ai/vercel-client.ts`
- Move AG-UI protocol handling to `handlers/ag-ui-endpoint.ts`

**Why This Works**:

1. Filenames become documentation (agent searching for "how to extract actions" finds `action-extractor.ts` immediately)
2. Context windows stay small (reading `priority-analyzer.ts` costs far less than a 650-line `gmail.ts`)
3. Grep results are meaningful (searching for `extractPriority` returns one focused file)

---

### Learning #4: TypeScript Type Safety - Semantic Types Over Primitives

**From**: `/Users/max/code/email-agent/AGENTS.md` (project guidelines)

**Relevance**: This repository enforces strict TypeScript. The pattern applies directly to Gmail insights agent design.

**Key Requirements**:

- Use semantic types over raw `string`/`number` in business logic
- Add runtime validation at external boundaries (Gmail API responses)
- Keep TypeScript in strict mode

**Application to Gmail Insights Agent**:

```typescript
// src/domain/insight-id.ts - Semantic ID type
export interface InsightId extends String {
  readonly __brand: "InsightId";
}

export function createInsightId(id: string): InsightId {
  if (!id || id.length === 0) {
    throw new Error("InsightId cannot be empty");
  }
  return id as InsightId;
}

// src/domain/insight.ts - Type-safe insight
export type InsightType = "priority" | "urgency" | "action_item" | "sentiment" | "relationship";

export interface Insight {
  id: InsightId;
  emailId: string;
  type: InsightType;
  confidence: number; // 0-1, validated at boundary
  value: string;
  extractedAt: Date;
}

// src/services/insights/priority-analyzer.ts - Runtime validation
import { z } from "zod";

const gmailApiResponseSchema = z.object({
  id: z.string().min(1),
  payload: z.object({
    headers: z.array(
      z.object({
        name: z.string(),
        value: z.string()
      })
    )
  })
});

export async function analyzePriority(emailResponse: unknown): Promise<Insight> {
  // Validate Gmail API response shape
  const validated = gmailApiResponseSchema.parse(emailResponse);

  // Business logic works with validated data
  const priority = extractPriorityFromHeaders(validated.payload.headers);
  return {
    id: createInsightId(`insight_${validated.id}`),
    emailId: validated.id,
    type: "priority",
    confidence: priority.confidence,
    value: priority.level,
    extractedAt: new Date()
  };
}
```

**Test 100% Coverage**:

- Keep vitest coverage at 100% (enforced in CI via `bun run test`)
- Each insight analyzer should have corresponding test file with full coverage
- Treat uncovered lines as immediate TODOs

---

### Learning #5: Vercel AI SDK Integration Pattern (From Project Context)

**From**: Agent-UI project structure and package.json (`@vercel/ai` usage)
**Relevance**: The agent-ui project already uses Vercel AI SDK. This agent should follow the same pattern for consistency.

**Key Context**:

- Agent-UI uses `@ag-ui/client` for UI-side protocol
- The backend likely uses `ai` package (Vercel AI SDK)
- Your agent needs to return AG-UI compatible responses

**Pattern for Gmail Insights Agent Endpoint**:

```typescript
// src/handlers/ag-ui-endpoint.ts
import { streamObject } from "ai";

export interface InsightResult {
  insights: Array<{
    type: "priority" | "urgency" | "action_item" | "sentiment" | "relationship";
    value: string;
    confidence: number;
    source: string;
  }>;
  metadata: {
    processedAt: string;
    emailCount: number;
    processingTimeMs: number;
  };
}

export async function analyzeEmails(gmail: GmailClient, maxResults: number = 10) {
  // Fetch emails
  const emails = await gmail.listEmails(maxResults);

  // Stream insights using Vercel AI SDK
  const { object } = await streamObject({
    model: defaultModel, // e.g., "gpt-4-turbo"
    schema: z.object({
      insights: z.array(
        z.object({
          type: z.enum(["priority", "urgency", "action_item", "sentiment", "relationship"]),
          value: z.string(),
          confidence: z.number().min(0).max(1),
          source: z.string()
        })
      ),
      metadata: z.object({
        processedAt: z.string(),
        emailCount: z.number(),
        processingTimeMs: z.number()
      })
    }),
    prompt: buildAnalysisPrompt(emails)
  });

  return object as InsightResult;
}

function buildAnalysisPrompt(emails: EmailMetadata[]): string {
  return `You are analyzing ${emails.length} emails for insights.

  For each email, extract:
  1. Priority level (high/medium/low)
  2. Urgency indicators
  3. Action items mentioned
  4. Sentiment/tone
  5. Key relationships mentioned

  Be concise and accurate. Return structured JSON.`;
}
```

Return AG-UI compatible response:

```typescript
// src/handlers/ag-ui-response.ts
export function createAgUiResponse(insights: InsightResult) {
  return {
    status: "success",
    data: insights,
    // AG-UI schema expects these fields
    timestamp: new Date().toISOString(),
    version: "1.0.0"
  };
}
```

---

## Implementation Recommendations

### Phase 1: Foundation (Type Safety & Structure)

1. Create domain types first (`insight.ts`, `insight-id.ts`, `email-metadata.ts`)
2. Set up test infrastructure with 100% coverage enforcement
3. Add logger configuration (pipe-based, no Pino transport option)
4. Create semantic ID types (use Zod for validation at boundaries)

### Phase 2: Gmail Integration

1. Create `services/gmail/authenticate.ts` (support OAuth token + API key + interactive)
2. Create `services/gmail/fetch-emails.ts` (Gmail API wrapper)
3. Create `services/gmail/parse-email.ts` (header/body extraction)
4. Each file under 200 lines, one concern per file
5. Add full test coverage for auth flows and parsing

### Phase 3: Insight Extraction

1. Create separate analyzers in `services/insights/`: priority, urgency, actions, sentiment, relationships
2. Each analyzer: extract feature -> confidence score -> insight object
3. Use Vercel AI SDK for LLM-powered insights (sentiment, relationships)
4. Keep extractors pure functions (testable, composable)

### Phase 4: AG-UI Endpoint

1. Create HTTP endpoint handler in `handlers/ag-ui-endpoint.ts`
2. Use Vercel AI SDK's `streamObject()` for structured output
3. Wrap response in AG-UI schema
4. Add streaming support for long-running analyses

### Phase 5: Security & Performance

1. Redact sensitive fields in logger (Gmail tokens, API keys)
2. Keep email bodies transient (only derive and persist insights)
3. Add rate limiting for Gmail API calls
4. Cache OAuth tokens (refresh when needed)
5. Test with Bun explicitly (runtime compatibility check)

---

## Key Files to Reference

- **Critical Patterns**: `/Users/max/code/alpine/docs/solutions/patterns/critical-patterns.md` (MUST READ)
- **File Structure**: `/Users/max/code/alpine/docs/solutions/developer-experience/god-file-refactor-to-single-concern-files-alpine-cli-20260212.md`
- **Bun Compatibility**: `/Users/max/code/agent-ui/docs/solutions/integration-issues/pino-transport-bun-incompatibility-system-20260213.md`
- **Auth Patterns**: `/Users/max/code/alpine/docs/solutions/developer-experience/oauth-token-support-alpine-cli-20260212.md`
- **Project Guidelines**: `/Users/max/code/email-agent/AGENTS.md`
- **Brainstorm**: `/Users/max/code/email-agent/docs/brainstorms/2026-02-14-gmail-insights-agent-brainstorm.md`

---

## Gotchas to Avoid

1. **Bun + Pino Transport**: Do NOT use Pino's `transport` option. Use stdout piping instead.
2. **God Files**: Do NOT put Gmail auth, parsing, and insights in one file. Split by concern.
3. **Unvalidated API Responses**: Do NOT trust Gmail API response structure. Use Zod validation at boundaries.
4. **Hardcoded Secrets**: Do NOT commit API keys. Use environment passthrough syntax.
5. **Coverage Gaps**: Do NOT merge code with <100% test coverage. Every line must be tested.
6. **Type Any**: Do NOT use `any` in business logic. Semantic types + Zod validation required.

---

## Success Criteria from Brainstorm

From `/Users/max/code/email-agent/docs/brainstorms/2026-02-14-gmail-insights-agent-brainstorm.md`:

- Build in TypeScript in this repository ✓
- Use direct Gmail inbox integration ✓
- Use an AG-UI endpoint backed by Vercel AI SDK ✓
- Keep v1 scope to insights only ✓
- Start with Gmail read-only plus metadata permissions ✓
- Prioritize insight accuracy as primary success metric ✓
- Keep full email bodies transient; persist only derived insights ✓
- Output insights in AG-UI schema compatible with `../agent-ui` ✓

This institutional research aligns with all decision criteria.
