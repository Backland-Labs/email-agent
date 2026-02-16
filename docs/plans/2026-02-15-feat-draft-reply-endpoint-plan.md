---
title: "feat: Draft Reply Endpoint for Specific Gmail Email"
type: feat
date: 2026-02-15
---

# Draft Reply Endpoint for Specific Gmail Email

## Overview

Add a new `POST /draft-reply` endpoint that drafts a reply for one specific Gmail message in the user's voice, using message and thread context. Keep AG-UI-compatible SSE streaming and strict typed contracts. This endpoint generates draft content only (no send side effects, no Gmail draft creation in v1).

## Problem Statement / Motivation

The current backend only supports inbox insight summarization through `POST /agent`. Users still have to manually turn context into a reply. A focused draft endpoint reduces response time, keeps tone consistent, and makes the agent materially more useful for daily email execution.

## Stakeholders

- Primary user drafting replies faster while preserving personal voice.
- Operator or maintainer running the Bun service and monitoring logs.
- Frontend or client integrations that consume AG-UI SSE.
- Engineering team maintaining strict quality gates and test coverage.

## Acceptance Criteria

### Functional

- [x] `POST /draft-reply` is routed in `src/server.ts` with `405` on non-POST and `404` for unknown routes.
- [x] Request schema is validated with Zod and requires `emailId`; supports optional `runId`, `threadId`, `voiceInstructions`.
- [x] Invalid requests emit deterministic failure behavior (typed error code and exactly one terminal outcome).
- [x] Endpoint fetches target message (`messages.get`) and thread context (`threads.get`) from Gmail.
- [x] Context assembly includes target email plus bounded thread context (deterministic truncation policy).
- [x] If thread fetch fails but target message is available, drafting continues with `contextDegraded=true`.
- [x] LLM output is schema-validated and includes at minimum `draftText`, optional `subjectSuggestion`, and `riskFlags`.
- [x] SSE event order is preserved: `RUN_STARTED` -> `TEXT_MESSAGE_START` -> `TEXT_MESSAGE_CONTENT`+ -> `TEXT_MESSAGE_END` -> terminal (`RUN_FINISHED` or `RUN_ERROR`).
- [x] Exactly one terminal event is emitted and no events are sent after terminal.
- [x] `RUN_FINISHED.result` includes machine-readable metadata (`emailId`, `contextMessageCount`, `contextDegraded`, `riskFlags`).
- [x] Endpoint does not call `drafts.create`, `drafts.send`, or `messages.send` in this phase.

### Security and Privacy

- [x] Logs for draft flow follow structured event contract and include `event`, `requestId`, `runId`, `threadId`, plus typed `code` for warn or error.
- [x] No logs include sensitive keys or content (`subject`, `body`, `snippet`, `from`, `to`, prompt text, completion text, secrets).
- [x] Email and thread content are treated as untrusted input in prompts (prompt-injection defense in system instructions and schema gating).

### Non-Functional / Quality

- [x] `bun run check` passes.
- [x] 100% coverage remains enforced.
- [x] New or updated `src/` files remain under 300 non-comment, non-blank lines.
- [x] Naming stays domain-specific (no catch-all filenames).

## Proposed Solution

### Endpoint and Contracts

- Add handler: `src/handlers/draft-reply-endpoint.ts`
- Add route wiring: `src/server.ts`
- Add export updates: `src/index.ts`
- Add request and result domain types:
  - `src/domain/draft-reply-request.ts`
  - `src/domain/draft-reply-result.ts`

### Gmail Context Service

- Add service: `src/services/gmail/fetch-reply-context.ts`
- Responsibilities:
  - Fetch target message (`users.messages.get`, `format: "full"`).
  - Fetch thread (`users.threads.get`, `format: "full"`).
  - Normalize MIME and body text using existing parsing style from `src/services/gmail/parse-gmail-message.ts`.
  - Apply bounded context window and deterministic truncation.

### AI Drafting Service

- Add prompt builder: `src/services/ai/build-draft-reply-prompt.ts`
- Add extraction or generation service: `src/services/ai/extract-draft-reply.ts`
- Reuse AI SDK structured output pattern from `src/services/ai/extract-email-insight.ts`.
- Enforce schema-validated output and fail closed on invalid model output.

### Streaming and Observability

- Reuse existing AG-UI encoder helpers in `src/services/streaming/encode-ag-ui-events.ts`.
- Add or extend logging catalog in `docs/logging-event-catalog.md`.
- Extend log contract coverage in `tests/observability/log-contract.test.ts`.

## Technical Considerations

- Choose a dedicated endpoint (`/draft-reply`) instead of overloading `/agent` to keep handler responsibilities clear and testable.
- Keep no-side-effects boundary explicit in code and tests for safety.
- Apply least-privilege Gmail scopes; this phase requires read access, not send.
- Use bounded retries and timeouts for transient Gmail and LLM failures aligned with reliability direction in `docs/plans/2026-02-14-feat-gmail-agent-reliability-hardening-plan.md`.
- Preserve AG-UI stream determinism and single-terminal-event guarantees.
- Keep prompt and system policy explicit: mirror user tone without inventing facts or commitments not grounded in email context.

## Research Notes

### Internal References

- `src/server.ts`
- `src/handlers/agent-endpoint.ts`
- `src/services/streaming/encode-ag-ui-events.ts`
- `src/services/gmail/fetch-unread-emails.ts`
- `src/services/gmail/parse-gmail-message.ts`
- `src/services/ai/build-insight-prompt.ts`
- `src/services/ai/extract-email-insight.ts`
- `docs/brainstorms/2026-02-14-gmail-insights-agent-brainstorm.md`
- `docs/brainstorms/2026-02-14-gmail-agent-reliability-brainstorm.md`
- `docs/solutions/runtime-errors/bun-sse-idle-timeout-controller-closed-fix.md`
- `docs/logging-event-catalog.md`
- `tests/handlers/agent-endpoint.test.ts`
- `tests/server.test.ts`
- `tests/observability/log-contract.test.ts`

### Reusable Learnings (`docs/solutions/`)

- Long-running SSE needs explicit timeout handling and deterministic terminal behavior.
- Avoid stream writes after close or abort and protect lifecycle invariants.
- Add regression tests for timeout or fallback configuration and terminal events.

### External References

- Gmail messages.get: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get
- Gmail threads.get: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/get
- Gmail drafts guide: https://developers.google.com/workspace/gmail/api/guides/drafts
- Gmail scopes: https://developers.google.com/workspace/gmail/api/auth/scopes
- Gmail error handling: https://developers.google.com/workspace/gmail/api/guides/handle-errors
- Gmail quota: https://developers.google.com/workspace/gmail/api/reference/quota
- AI SDK structured output: https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data
- OWASP LLM prompt injection guidance: https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html

## Dependencies and Risks

- Gmail API rate limits or transient failures -> bounded retry and backoff with typed retryable error mapping.
- Prompt injection via email content -> strict system policy, treat email as data, schema-validated outputs.
- Privacy leaks in logs -> contract tests plus forbidden-key assertions.
- Handler complexity growth -> extract focused services and keep files below structure limits.
- Tone mismatch or low-quality drafts -> explicit voice controls and deterministic prompt constraints.

## Alternatives Considered

- Extend existing `/agent` with mode flag: rejected for now to avoid mixed concerns in one large handler.
- Auto-create Gmail drafts in v1: deferred to reduce risk and scope; text draft generation first.
- JSON response endpoint: rejected for now to align with existing AG-UI SSE architecture.

## Implementation Plan (Comprehensive)

### Phase 1: Contracts and Routing (TDD)

- [x] **RED:** Add route and method tests in `tests/server.test.ts` for `POST /draft-reply`.
- [x] **RED:** Add domain schema tests in `tests/domain/draft-reply-request.test.ts` and `tests/domain/draft-reply-result.test.ts`.
- [x] **GREEN:** Implement `src/domain/draft-reply-request.ts` and `src/domain/draft-reply-result.ts`.
- [x] **GREEN:** Wire route in `src/server.ts`.
- [x] **REFACTOR:** Keep contract APIs minimal and explicit.
- [x] Run `bun run check`.

### Phase 2: Gmail Context Retrieval (TDD)

- [x] **RED:** Add tests in `tests/services/gmail/fetch-reply-context.test.ts` for target fetch, thread fetch, truncation, and degraded fallback.
- [x] **GREEN:** Implement `src/services/gmail/fetch-reply-context.ts`.
- [x] **REFACTOR:** Reuse parsing primitives from `src/services/gmail/parse-gmail-message.ts` without duplication.
- [x] Run `bun run check`.

### Phase 3: AI Draft Generation (TDD)

- [x] **RED:** Add tests in `tests/services/ai/build-draft-reply-prompt.test.ts` for context inclusion, tone controls, and injection-resistance prompt rules.
- [x] **RED:** Add tests in `tests/services/ai/extract-draft-reply.test.ts` for structured output success or failure and error wrapping.
- [x] **GREEN:** Implement `src/services/ai/build-draft-reply-prompt.ts` and `src/services/ai/extract-draft-reply.ts`.
- [x] **REFACTOR:** Keep output schema and error messages actionable.
- [x] Run `bun run check`.

### Phase 4: Endpoint Orchestration and SSE Contract (TDD)

- [x] **RED:** Add handler tests in `tests/handlers/draft-reply-endpoint.test.ts` covering happy path, invalid input, Gmail failures, degraded context, abort, and single-terminal-event guarantee.
- [x] **RED:** Add default dependency wiring tests in `tests/handlers/draft-reply-endpoint-default-dependencies.test.ts`.
- [x] **GREEN:** Implement `src/handlers/draft-reply-endpoint.ts` with AG-UI event lifecycle.
- [x] **GREEN:** Update `src/index.ts` exports and any required stream result metadata handling.
- [x] Run `bun run check`.

### Phase 5: Observability, Docs, and Hardening

- [x] Update `docs/logging-event-catalog.md` with draft endpoint events and codes.
- [x] Extend `tests/observability/log-contract.test.ts` fixture coverage for new events and no-log-zone enforcement.
- [x] Update `README.md` endpoint documentation and request contract.
- [x] Final quality gate: `bun run check`.

## Non-Functional Requirements and Quality Gates

- [x] Full local quality gate passes (`bun run check`).
- [x] 100% test coverage remains intact.
- [x] SSE terminal behavior is deterministic under success, failure, and abort.
- [x] Privacy guardrails verified by automated log-contract tests.

## Future Considerations

- Optional phase to create Gmail draft objects (`drafts.create`) after text-draft flow is stable.
- Optional persisted voice profile derived from sent-mail samples with explicit user consent.
- Optional idempotency-key support for retry-safe repeated draft requests.

## References

- `docs/brainstorms/2026-02-14-gmail-insights-agent-brainstorm.md`
- `docs/brainstorms/2026-02-14-gmail-agent-reliability-brainstorm.md`
- `docs/solutions/runtime-errors/bun-sse-idle-timeout-controller-closed-fix.md`
- `docs/plans/2026-02-14-feat-gmail-insights-agent-plan.md`
- `docs/plans/2026-02-14-feat-gmail-agent-reliability-hardening-plan.md`
- `src/server.ts`
- `src/handlers/agent-endpoint.ts`
- `src/services/gmail/fetch-unread-emails.ts`
- `src/services/gmail/parse-gmail-message.ts`
- `src/services/ai/build-insight-prompt.ts`
- `src/services/ai/extract-email-insight.ts`
- `src/services/streaming/encode-ag-ui-events.ts`
- `docs/logging-event-catalog.md`
- `tests/server.test.ts`
- `tests/handlers/agent-endpoint.test.ts`
- `tests/observability/log-contract.test.ts`
