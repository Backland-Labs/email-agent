---
title: "fix: Enforce 48-Hour Narrative Briefing Contract"
type: fix
date: 2026-02-16
---

# Enforce 48-Hour Narrative Briefing Contract

## Overview

Align the existing `POST /narrative` endpoint with the requested morning-brief behavior: true 48-hour coverage, concise high-signal narrative output, and clear action-item bullets in a light professional tone.

## Problem Statement / Motivation

The endpoint already exists, but current behavior is not fully aligned with the requested outcome:

- `LOOKBACK_HOURS` is `48`, while `LOOKBACK_QUERY` currently uses `newer_than:48d`, which widens scope to roughly 48 days instead of 48 hours.
- Output can be longer and more section-heavy than the intended quick briefing style.
- Tone and brevity are not currently enforced with measurable tests.
- API docs and README need alignment with the endpoint's intended contract.

This plan reframes the request from "create endpoint" to "fix and harden existing endpoint contract."

## Detailed Background

- Routing already includes `POST /narrative` in `src/server.ts`.
- Runtime generation logic and narrative composition live in `src/handlers/narrative-endpoint-runtime.ts`.
- Endpoint orchestration, SSE event emission, and terminal result creation live in `src/handlers/narrative-endpoint.ts`.
- Gmail fetch query is passed through `src/services/gmail/fetch-unread-emails.ts`.
- Domain contracts are defined in `src/domain/narrative-request.ts` and `src/domain/narrative-run-result.ts`.
- Existing tests cover happy path and several failure paths in `tests/handlers/narrative-endpoint*.test.ts` and `tests/services/gmail/fetch-unread-emails.test.ts`.

## Stakeholders

- End user receiving a fast daily inbox briefing and action list.
- API and UI consumers relying on stable AG-UI SSE behavior.
- Maintainers accountable for reliability, observability, and docs correctness.

## Acceptance Criteria

### Functional

- [x] The narrative fetch query represents a rolling 48-hour window, not a day-count approximation, using epoch-based Gmail query terms (for example, `after:<epochStart> before:<epochNow>`), with explicit boundary tests for messages exactly at window start and end.
- [x] Scope is explicit and tested: v1 includes unread inbox messages only (`is:unread`) within the 48-hour window.
- [x] Returned narrative remains concise: max 4 briefing bullets and no more than 120 words in the narrative body before the action-item section (headings excluded).
- [x] Action items are explicit next steps, deduplicated by normalized text (trim, lowercase, collapse whitespace, strip trailing punctuation), capped at 6 bullets, and each item maps to at least one extracted insight.
- [x] Result ordering remains priority-first (`action_required`, `fyi`, `noise`) and deterministic for identical inputs.
- [x] No-email and no-action-item cases produce deterministic fallback text.
- [x] Tone rubric is testable and enforced for fixture outputs: neutral professional language, no slang denylist terms, and no exclamation marks.

### Contract and Streaming

- [x] SSE event lifecycle remains deterministic: `RUN_STARTED` -> `TEXT_MESSAGE_START` -> `TEXT_MESSAGE_CONTENT`+ -> `TEXT_MESSAGE_END` -> terminal (`RUN_FINISHED` or `RUN_ERROR`).
- [x] Exactly one terminal SSE event is emitted for every run.
- [x] `RUN_FINISHED.result.timeframeHours` equals `48` and `actionItemCount` equals the number of emitted action items.
- [x] Terminal rule is explicit and tested: `RUN_FINISHED` for full success and partial success (including request abort after run start); `RUN_ERROR` only for hard runtime failures.
- [x] Client abort/disconnect behavior is explicit and tested: processing stops on abort checks, no post-terminal events are emitted, and run logs include `aborted=true` when applicable.

### API Input Policy

- [x] Invalid or malformed JSON request bodies are handled by the existing permissive policy (safe default context), and this behavior is documented and tested explicitly.

### Non-Functional

- [x] `bun run check` passes (format, lint, typecheck, tests, structure).
- [x] New or modified files stay within repository structure constraints.
- [x] Existing observability contract tests continue to pass for success, partial-success, and failure scenarios.

### Success Metrics

- [x] Query-window correctness: fixture tests confirm no messages older than 48 hours are included.
- [x] Brevity compliance: 100% of deterministic fixture runs satisfy length and bullet-count limits.
- [x] Actionability quality: fixture assertions show every action item maps to an extracted per-email insight (no synthetic unsupported tasks).

## Proposed Solution

1. Correct lookback-window construction
   - Replace day-based lookback query construction in `src/handlers/narrative-endpoint-runtime.ts` with epoch-based 48-hour query builder logic.
   - Keep unread filtering as explicit query scope for v1.

2. Tighten narrative composition contract
   - Refine narrative assembly in `src/handlers/narrative-endpoint-runtime.ts` to enforce concise formatting caps.
   - Preserve existing urgency grouping and deterministic ordering.
   - Keep action-item extraction dedupe behavior while adding output limits.

3. Preserve endpoint and SSE contracts
   - Keep orchestration and terminal semantics stable in `src/handlers/narrative-endpoint.ts`.
   - Ensure run-result metadata remains consistent in `src/domain/narrative-run-result.ts`.

4. Align docs and tests
   - Update endpoint behavior descriptions in `src/docs/openapi-spec.ts`.
   - Update `README.md` endpoint list and narrative behavior notes.
   - Expand regression tests for query precision, formatting limits, and terminal-event invariants.

## Technical Considerations

- Gmail search query operators `newer_than` support `d/m/y` units, not hours; precise 48-hour filtering should use epoch-based `after:` and `before:` query terms.
- Date-literal Gmail queries are interpreted with PST assumptions; epoch seconds avoid timezone ambiguity.
- Streaming safety must preserve one-terminal-event guarantees and avoid post-terminal writes.
- Narrative generation should stay extractive from email insights to reduce hallucinated claims.
- Keep implementation modular to satisfy repo file-size and naming constraints.

## Dependencies and Risks

| Risk                                            | Impact | Mitigation                                                                     |
| ----------------------------------------------- | ------ | ------------------------------------------------------------------------------ |
| Query logic remains imprecise after refactor    | High   | Add explicit query-construction unit tests and endpoint integration assertions |
| Brevity constraints degrade information density | Medium | Use deterministic fixture set balancing concision with required signal fields  |
| SSE regressions during runtime refactor         | High   | Add lifecycle invariants and single-terminal regression tests                  |
| Permissive input parsing hides client errors    | Medium | Document behavior clearly and add tests for malformed payload scenarios        |
| Docs drift from runtime behavior                | Medium | Update OpenAPI + README in same change set and verify docs tests               |

## Implementation Plan (Standard)

### Phase 1: Lock expected behavior with RED tests

- [x] Add query-window regression tests in `tests/handlers/narrative-endpoint-runtime.test.ts` and `tests/handlers/narrative-endpoint.test.ts` for exact rolling 48-hour semantics.
- [x] Add boundary-window tests (exact start/end timestamps) in `tests/handlers/narrative-endpoint-runtime.test.ts`.
- [x] Add concise-output contract tests (word/bullet limits, deterministic fallback text) in `tests/handlers/narrative-endpoint-runtime.test.ts`.
- [x] Add SSE terminal invariant checks in `tests/handlers/narrative-endpoint.test.ts` for success, partial, abort, and error paths.

### Phase 2: Runtime and query corrections

- [x] Implement epoch-based lookback query builder and replace day-based query constant usage in `src/handlers/narrative-endpoint-runtime.ts`.
- [x] Refine narrative assembly to enforce concise briefing constraints while preserving urgency ordering.
- [x] Keep action-item dedupe and add output cap behavior with stable ordering.

### Phase 3: Endpoint contract verification

- [x] Verify `src/handlers/narrative-endpoint.ts` maintains event ordering and terminal semantics after runtime updates.
- [x] Confirm `src/domain/narrative-run-result.ts` metadata and invariants still match emitted result payloads.
- [x] Validate malformed JSON permissive parsing behavior remains explicit and tested.
- [x] Validate deterministic scope: ordering, section layout, and fallback text must be exact for deterministic fixture inputs.

### Phase 4: Docs and observability alignment

- [x] Update narrative endpoint wording in `src/docs/openapi-spec.ts` and related docs tests.
- [x] Add `/narrative` coverage in `README.md` endpoint and behavior documentation.
- [x] Ensure observability scenarios remain green in `tests/observability/log-contract.test.ts` and fixture helpers.

### Phase 5: Quality gate

- [x] Run `bun run check`.
- [x] Resolve any format, type, lint, test, and structure issues.

## Research Notes

### Internal References

- `docs/brainstorms/2026-02-14-gmail-insights-agent-brainstorm.md`
- `docs/brainstorms/2026-02-14-gmail-agent-reliability-brainstorm.md`
- `src/server.ts`
- `src/handlers/narrative-endpoint.ts`
- `src/handlers/narrative-endpoint-runtime.ts`
- `src/handlers/narrative-endpoint-default-dependencies.ts`
- `src/services/gmail/fetch-unread-emails.ts`
- `src/domain/narrative-request.ts`
- `src/domain/narrative-run-result.ts`
- `src/docs/openapi-spec.ts`
- `tests/handlers/narrative-endpoint.test.ts`
- `tests/handlers/narrative-endpoint-runtime.test.ts`
- `tests/handlers/narrative-endpoint-default-dependencies.test.ts`
- `tests/services/gmail/fetch-unread-emails.test.ts`
- `tests/observability/log-contract.test.ts`

### Reusable Learnings (`docs/solutions/`)

- `docs/solutions/runtime-errors/bun-sse-idle-timeout-controller-closed-fix.md`
  - Keep SSE lifecycle deterministic and protected against closed-stream writes.
  - Include timeout and terminal-path regressions in tests.

### External References

- Gmail API filtering guide: <https://developers.google.com/workspace/gmail/api/guides/filtering>
- Gmail search operator reference (`older_than` / `newer_than` units): <https://support.google.com/mail/answer/7190>
- Gmail list messages API reference: <https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list>

### Open Questions and Decisions

- Decision: keep v1 scope to unread emails in the 48-hour window to stay aligned with current repository behavior and avoid unbounded inbox volume in this fix.
- Follow-up candidate: optional mode for all inbox emails in 48 hours if product needs evolve.

## References

- `docs/brainstorms/2026-02-14-gmail-insights-agent-brainstorm.md`
- `docs/brainstorms/2026-02-14-gmail-agent-reliability-brainstorm.md`
- `docs/solutions/runtime-errors/bun-sse-idle-timeout-controller-closed-fix.md`
- `docs/plans/2026-02-16-feat-narrative-briefing-endpoint-plan.md`
- `src/handlers/narrative-endpoint.ts`
- `src/handlers/narrative-endpoint-runtime.ts`
- `src/services/gmail/fetch-unread-emails.ts`
- `src/docs/openapi-spec.ts`
- `tests/handlers/narrative-endpoint.test.ts`
- `tests/handlers/narrative-endpoint-runtime.test.ts`
- <https://developers.google.com/workspace/gmail/api/guides/filtering>
- <https://support.google.com/mail/answer/7190>
