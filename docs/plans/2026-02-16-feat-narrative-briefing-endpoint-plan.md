---
title: "feat: Narrative Briefing Endpoint for 48-Hour Inbox"
type: feat
date: 2026-02-16
---

# Narrative Briefing Endpoint for 48-Hour Inbox

## Overview

Deliver a production-ready `POST /narrative` experience that produces a short, high-signal inbox briefing plus clear bullet-point action items from the last 48 hours of email. Keep output quick to scan, useful, and consistently light-professional in tone.

## Problem Statement / Motivation

The requested user outcome is a morning-brief style summary that is concise and actionable. The repository already contains a `POST /narrative` endpoint, but current behavior does not fully align with the ask:

- Time-window query is mislabeled as 48 hours while using `newer_than:48d` (days).
- Narrative formatting can be verbose and section-heavy for a "quick and to the point" briefing.
- Tone and prioritization are not explicitly validated against the desired brief style.

This plan closes those gaps and hardens the endpoint as a dependable daily briefing surface.

## Stakeholders

- End user consuming a daily inbox briefing for fast decision-making.
- Frontend/client integration consuming AG-UI SSE payloads.
- Maintainers responsible for endpoint reliability, logs, and contract stability.

## Acceptance Criteria

### Functional

- [ ] `POST /narrative` returns a short narrative plus bullet action items for unread email within a true 48-hour window.
- [ ] 48-hour inclusion rule is explicit and tested: include messages where `internalDate >= server_now_utc - 48h`; test boundary at exactly `now-48h` and around DST transitions.
- [ ] Gmail query semantics are corrected from day-based drift to a true 48-hour implementation, with deterministic post-fetch filtering if Gmail query granularity is coarser.
- [ ] Narrative is measurable and concise: max 160 words before `## Action Items`, max 3 briefing bullets, and max 3 bullets per urgency section.
- [ ] Priority ordering is measurable: `action_required` before `fyi` before `noise`; ties ordered by newest message first.
- [ ] Action items are deduplicated (exact normalized string dedupe required; semantic dedupe optional and deferred unless scoped in implementation).
- [ ] Tone remains light-professional: direct, neutral language with no slang, hype, or alarmist phrasing.
- [ ] Zero-analyzable fallback is explicit: narrative states no concise insights found and `## Action Items` contains exactly `- No immediate action items.` when no actions exist.

### Contract and Streaming

- [ ] SSE event lifecycle remains deterministic: `RUN_STARTED` -> `TEXT_MESSAGE_START` -> `TEXT_MESSAGE_CONTENT`+ -> `TEXT_MESSAGE_END` -> terminal (`RUN_FINISHED` or `RUN_ERROR`).
- [ ] Exactly one terminal event is emitted per run, including abort/error/disconnect race paths.
- [ ] Terminal precedence is deterministic: if a fatal runtime error occurs before terminal, emit `RUN_ERROR`; if request abort occurs without fatal error, end with `RUN_FINISHED` and `aborted=true` metadata (no post-close writes).
- [ ] `RUN_FINISHED.result` includes `timeframeHours=48`, `unreadCount`, `analyzedCount`, `actionItemCount`, `narrative`, and `actionItems`.
- [ ] Duplicate POST submissions are treated as independent runs; reconnect semantics are restart-only (no stream resume) and documented.

### Quality

- [ ] Existing and new tests pass via `bun run check`.
- [ ] New files remain under repo size constraints and naming conventions.
- [ ] Observability events for narrative success/failure continue to satisfy log-contract tests.
- [ ] Observability logs include run correlation and triage fields (`requestId`, `runId`, `threadId`, duration, counts, failure code/class).

## Proposed Solution

### 1) Correct 48-hour retrieval semantics

- Update narrative lookback query in `src/handlers/narrative-endpoint-runtime.ts` so the Gmail filter actually represents 48 hours.
- Add or adjust tests asserting exact query behavior in:
  - `tests/handlers/narrative-endpoint.test.ts`
  - `tests/handlers/narrative-endpoint-runtime.test.ts`

### 2) Tighten briefing composition for signal density

- Refine `buildNarrative` in `src/handlers/narrative-endpoint-runtime.ts` to:
  - Lead with high-priority developments.
  - Keep summary compact (short opening + short prioritized sections).
  - Preserve explicit action item section as compact bullets.
- Keep fallback behavior for zero analyzable messages.

### 3) Preserve endpoint and schema contracts

- Keep request and result contracts stable in:
  - `src/domain/narrative-request.ts`
  - `src/domain/narrative-run-result.ts`
- If text structure changes, ensure only narrative content changes and not transport/event contract semantics.

### 4) Observability and docs alignment

- Verify narrative log event coverage in `tests/observability/log-contract.test.ts` for run start, completion, partial extraction failures, and hard failures.
- Ensure API docs in `src/docs/openapi-spec.ts` still accurately describe endpoint behavior and response style.

## Technical Considerations

- Gmail query syntax supports date-based filters that can be interpreted in days; implementation must avoid accidental over-collection windows.
- SSE transport is long-running and must preserve single-terminal guarantees.
- Prompt/extraction output can vary; narrative formatting logic should be deterministic and resilient to sparse/partial insight data.
- Keep behavior deterministic under abort and partial insight failures.
- Auth scope and token-failure behavior should remain explicit: Gmail auth failures map to deterministic terminal error behavior and structured logs.

## Dependencies and Risks

- **Query correctness risk:** incorrect Gmail query token can silently widen or narrow the inbox window.
- **Tone drift risk:** generated insight text may vary; formatting must normalize output into consistent brief style.
- **Contract regression risk:** changing narrative composition must not break AG-UI event ordering or final payload structure.
- **Observability drift risk:** narrative logging codes/events must stay in sync with log-contract fixtures.

## Implementation Plan (Standard)

### Phase 1: Lock expected behavior with tests

- [ ] Add RED tests for true 48-hour inclusion boundaries (`now-48h` inclusive, DST-safe logic).
- [ ] Add RED tests for concise narrative constraints (word and section limits) and explicit tone guardrails.
- [ ] Add/adjust assertions for prioritized ordering and action-item concision.
- [ ] Add RED tests for zero-analyzable fallback shape and deterministic action-item fallback line.

### Phase 2: Runtime updates

- [ ] Update lookback query and any supporting constants in `src/handlers/narrative-endpoint-runtime.ts`.
- [ ] Refactor `buildNarrative` output shape to match brief-style requirements while preserving determinism.
- [ ] Keep action item extraction and dedupe behavior intact unless tests reveal needed tightening.

### Phase 3: Endpoint contract verification

- [ ] Validate `src/handlers/narrative-endpoint.ts` still emits expected SSE lifecycle and terminal behavior.
- [ ] Add/adjust tests for terminal precedence across abort/error/disconnect races and no post-close stream writes.
- [ ] Confirm `src/domain/narrative-run-result.ts` remains aligned with endpoint output.

### Phase 4: Observability and docs

- [ ] Ensure log contract coverage remains green for all narrative event variants.
- [ ] Update OpenAPI text in `src/docs/openapi-spec.ts` if behavior wording changes.

### Phase 5: Quality gate

- [ ] Run `bun run check`.
- [ ] Address any coverage, structure, or type issues.

## Research Notes

### Internal References

- `src/server.ts`
- `src/handlers/narrative-endpoint.ts`
- `src/handlers/narrative-endpoint-runtime.ts`
- `src/domain/narrative-request.ts`
- `src/domain/narrative-run-result.ts`
- `src/docs/openapi-spec.ts`
- `tests/handlers/narrative-endpoint.test.ts`
- `tests/handlers/narrative-endpoint-runtime.test.ts`
- `tests/observability/log-contract.test.ts`
- `docs/brainstorms/2026-02-14-gmail-insights-agent-brainstorm.md`
- `docs/brainstorms/2026-02-14-gmail-agent-reliability-brainstorm.md`

### Reusable Learnings (`docs/solutions/`)

- `docs/solutions/runtime-errors/bun-sse-idle-timeout-controller-closed-fix.md`:
  - Keep SSE lifecycle deterministic.
  - Avoid post-close stream writes.
  - Protect long-running endpoint behavior with focused tests.

### External Research Decision

- Skipped for this plan: domain is low-risk, current repository already has strong local patterns for Gmail, SSE, and narrative endpoint behavior.

## References

- `docs/brainstorms/2026-02-14-gmail-insights-agent-brainstorm.md`
- `docs/brainstorms/2026-02-14-gmail-agent-reliability-brainstorm.md`
- `docs/solutions/runtime-errors/bun-sse-idle-timeout-controller-closed-fix.md`
- `src/handlers/narrative-endpoint.ts`
- `src/handlers/narrative-endpoint-runtime.ts`
- `tests/handlers/narrative-endpoint.test.ts`
- `tests/handlers/narrative-endpoint-runtime.test.ts`
- `tests/observability/log-contract.test.ts`
