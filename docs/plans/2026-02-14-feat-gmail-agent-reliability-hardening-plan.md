---
title: "feat: Gmail Agent Reliability Hardening"
type: feat
date: 2026-02-14
---

# Gmail Agent Reliability Hardening

## Overview

Harden the existing Gmail insights agent so runs are reliable, bounded, and observable under transient external failures. This plan adds startup validation, retry/backoff + timeout policies for Gmail and LLM calls, run-level telemetry, and stronger partial-failure handling without changing the user-facing insight feature scope.

## Problem Statement / Motivation

Current runs depend on multiple external systems (Gmail API, Anthropic via AI SDK) and can fail in ways that are hard to recover from or diagnose quickly. Reliability behavior exists in parts (per-email AI failure skipping), but retry and timeout policies are inconsistent and run telemetry is limited. The result is avoidable hard-failed runs and slow operator debugging.

## Stakeholders

- Operator/maintainer running `POST /agent` in production-like workflows.
- End user receiving streamed insights in `../agent-ui`.
- Engineering team maintaining strict quality gates (`bun run check`, structure rules, 100% coverage).

## Acceptance Criteria

### Functional

- [ ] Startup validation fails fast with actionable messages when required env vars are missing/invalid before serving requests.
- [ ] Gmail `messages.list`, Gmail `messages.get`, and LLM extraction each use `maxAttempts=3`, `initialDelayMs=250`, `maxDelayMs=2000`, `jitter="full"`, and `attemptTimeoutMs=10000`; retries apply only to transient classes (`429`, `5xx`, transport/network transient failures).
- [ ] Per-attempt timeout is `10000ms`; run hard-timeout is `90000ms` and maps to `RUN_ERROR` with `terminalReason="run_timeout"`.
- [ ] Partial failures are isolated: one email failure does not fail the full run when other emails can still produce insights.
- [ ] Terminal mapping is fixed: `empty_inbox -> RUN_FINISHED`, `partial_success -> RUN_FINISHED`, `all_emails_failed -> RUN_ERROR`, `retry_exhausted -> RUN_ERROR`, `run_timeout -> RUN_ERROR`, `aborted -> RUN_ERROR`.
- [ ] SSE ordering is `RUN_STARTED` -> zero or more text events -> exactly one terminal event (`RUN_FINISHED` or `RUN_ERROR`); no events are emitted after terminal.
- [ ] Emit exactly one run-summary JSON log per run with schema `{ schemaVersion, runId, emailsFetched, insightsSucceeded, emailsSkipped, retriesAttempted, durationMs, terminalStatus, terminalReason }`.
- [ ] Run-summary logs do not include email body, subject, sender address, prompt text, or completion text.

### Non-Functional

- [ ] `bun run check` passes (structure, format, lint, typecheck, tests).
- [ ] 100% Vitest coverage remains enforced.
- [ ] New/updated files remain under 300 non-comment, non-blank lines.
- [ ] No catch-all filenames; names remain domain-specific and discoverable.

### Success Metrics

- [ ] In deterministic fault-injection tests (`N=100`), hard-failed run rate under transient upstream faults decreases by at least 30% versus pre-change baseline fixture.
- [ ] Using a standardized failure-log fixture set, median diagnosis time for terminal cause decreases by at least 25%.

## Proposed Solution

Use service-level resilience wrappers (recommended approach from brainstorm) to keep complexity localized:

1. Add centralized startup config validation for required environment values.
2. Add a reusable resilience policy module for retry/backoff + timeout classification.
3. Integrate policy in Gmail fetch path (`messages.list` and per-message `messages.get`) and LLM insight extraction.
4. Add run telemetry aggregation in handler orchestration and emit one structured summary event per run.
5. Expand resilience-focused test coverage around aborts, transient failures, malformed payloads, and timeout edges.

This keeps architecture aligned with current single-handler design while avoiding a larger middleware refactor.

## Technical Considerations

- Keep stream lifecycle semantics unchanged in `src/handlers/agent-endpoint.ts` and `src/services/streaming/encode-ag-ui-events.ts`.
- Preserve existing dependency-injection pattern used by handler tests to keep external boundaries mockable.
- Ensure retry classification distinguishes transient transport/service failures (including 429/5xx) from deterministic schema/content failures.
- Define typed enums `RetryClassification` and `TerminalReason` with exhaustive mapping tests for HTTP, transport, timeout, auth, and schema/content errors.
- Abort precedence rule: if request abort is observed, terminal reason is `aborted`; subsequent timeout signals are ignored; exactly one terminal event is emitted.
- Prefer explicit typed result states over throwing from deep helpers where telemetry needs outcome categorization.
- Keep resilience helpers small and focused to satisfy structure checks.

## Research Notes

### Internal References

- Brainstorm decisions: `docs/brainstorms/2026-02-14-gmail-agent-reliability-brainstorm.md`
- Existing implementation plan and backlog: `docs/plans/2026-02-14-feat-gmail-insights-agent-plan.md`
- Stated next improvements: `README.md`
- Orchestration path: `src/handlers/agent-endpoint.ts`
- Gmail boundaries: `src/services/gmail/create-auth-client.ts`, `src/services/gmail/fetch-unread-emails.ts`
- LLM boundary: `src/services/ai/extract-email-insight.ts`
- Streaming contract: `src/services/streaming/encode-ag-ui-events.ts`
- Repo conventions and quality gates: `AGENTS.md`, `package.json`, `scripts/check-structure.mjs`

### Reusable Learnings (`docs/solutions/`)

- No matching `docs/solutions/` entries found in this repository.

### External Research Decision

- Skipped for this plan: uncertainty is low, scope is bounded, and strong local implementation patterns already exist.

## Dependencies and Risks

| Risk                                                          | Impact | Mitigation                                                                 |
| ------------------------------------------------------------- | ------ | -------------------------------------------------------------------------- |
| Retry loops increase run latency                              | Medium | Cap attempts, apply jittered backoff ceilings, enforce run hard-timeout    |
| Incorrect error classification retries non-transient failures | Medium | Explicit classifier tests for retryable vs non-retryable categories        |
| Telemetry adds noise or leaks sensitive content               | High   | Emit counts/status/timing only; avoid logging email body text              |
| Handler complexity grows beyond maintainable size             | Medium | Extract focused resilience/telemetry modules; keep files under size limits |
| Timeout policy conflicts with request abort signal            | Medium | Define precedence and test request abort vs internal timeout behavior      |
| Telemetry schema drift breaks parsers/alerts                  | High   | Version schema and add contract tests for keys, types, and enums           |

## Implementation Plan

### Phase 1: Validation and Resilience Primitives

- [ ] **RED:** Add tests for startup config validation (missing/invalid required envs) in `tests/config/validate-startup-config.test.ts`.
- [ ] **GREEN:** Create `src/config/validate-startup-config.ts` and wire server startup usage in `src/server.ts`.
- [ ] **RED:** Add retry/backoff/timeout policy tests in `tests/services/resilience/retry-policy.test.ts`.
- [ ] **GREEN:** Create `src/services/resilience/retry-policy.ts` with typed policy + classifier primitives.
- [ ] **REFACTOR:** Keep policy API minimal and explicit.
- [ ] Run `bun run check`.

### Phase 2: Gmail and LLM Integration

- [ ] **RED:** Extend Gmail service tests for transient list/get failures, retry exhaustion, and partial get failures in `tests/services/gmail/fetch-unread-emails.test.ts`.
- [ ] **GREEN:** Integrate resilience policy into `src/services/gmail/fetch-unread-emails.ts`.
- [ ] **RED:** Extend AI extraction tests for retryable 429/5xx-like failures, timeout handling, and non-retryable schema errors in `tests/services/ai/extract-email-insight.test.ts`.
- [ ] **GREEN:** Integrate resilience policy into `src/services/ai/extract-email-insight.ts`.
- [ ] **REFACTOR:** Ensure shared policy usage is consistent and typed.
- [ ] Run `bun run check`.

### Phase 3: Handler Telemetry and End-to-End Resilience

- [ ] **RED:** Add handler tests for run telemetry summary emission, run timeout at 90s, and abort precedence in `tests/handlers/agent-endpoint.test.ts`.
- [ ] **GREEN:** Add run telemetry aggregation and structured summary output in `src/handlers/agent-endpoint.ts`.
- [ ] **RED:** Add table-driven terminal-state matrix tests in `tests/handlers/agent-endpoint.test.ts` for `empty_inbox`, `partial_success`, `all_emails_failed`, `retry_exhausted`, `run_timeout`, `aborted`, and abort-vs-timeout race.
- [ ] **RED:** Add streaming contract regression tests ensuring valid terminal events under timeout and partial-failure cases in `tests/handlers/agent-endpoint.test.ts`.
- [ ] **GREEN:** Adjust handler orchestration to preserve stream contract under new resilience paths.
- [ ] **REFACTOR:** Extract helper(s) if handler approaches structure limit.
- [ ] Run `bun run check`.

### Phase 4: Documentation and Operational Validation

- [ ] Update `README.md` with reliability behavior defaults (retry scope, timeout policy, telemetry fields).
- [ ] Create `docs/reliability-smoke-checklist.md` with steps, expected terminal SSE event, expected telemetry fields, and pass/fail criteria for `empty_inbox`, transient recovery, retry exhaustion, run timeout, and client abort.
- [ ] Run `bun run check` and verify CI-equivalent local gate.

## References

- `docs/brainstorms/2026-02-14-gmail-agent-reliability-brainstorm.md`
- `docs/plans/2026-02-14-feat-gmail-insights-agent-plan.md`
- `README.md`
- `AGENTS.md`
- `src/handlers/agent-endpoint.ts`
- `src/services/gmail/fetch-unread-emails.ts`
- `src/services/ai/extract-email-insight.ts`
- `src/services/streaming/encode-ag-ui-events.ts`
- `tests/handlers/agent-endpoint.test.ts`
- `tests/services/gmail/fetch-unread-emails.test.ts`
- `tests/services/ai/extract-email-insight.test.ts`
