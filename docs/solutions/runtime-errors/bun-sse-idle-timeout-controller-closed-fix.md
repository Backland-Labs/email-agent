---
title: Bun SSE stream closed under long Gmail fetch
date: 2026-02-14
category: runtime-errors
slug: bun-sse-idle-timeout-controller-closed
problem_type: runtime-error
status: fixed
related_to:
  - src/server.ts
  - tests/server.test.ts
  - /tmp/email-agent-server.log
tags:
  - bun
  - sse
  - stream-lifecycle
  - idle-timeout
---

# Symptom summary

Long-running `/agent` requests were failing after about 10 seconds even when Gmail fetch+LLM processing was still in progress. The SSE connection ended with partial events and the handler eventually threw:

- `[Bun.serve]: request timed out after 10 seconds`
- `TypeError: Invalid state: Controller is already closed`

When this happened, no `RUN_FINISHED` event was consistently delivered to the client.

# Reproduction / observed behavior

1. Start the server with `bun run start`.
2. Post a valid AG-UI payload to `POST /agent`.
3. Ensure mailbox has enough unread messages to exceed Bun default timeout.
4. Observe stream output:
   - `RUN_STARTED`
   - `TEXT_MESSAGE_START`
   - a few partial events
   - then client timeout or server abort
   - logs show `Bun.serve` timeout and `agent.run_failed`

This appeared in logs as run-in-progress entries followed by `run_failed` with `ERR_INVALID_STATE` from `agent-endpoint.ts` enqueue operations.

# Investigation notes

At first we verified the endpoint worked for short runs and that the handler intentionally streamed correctly in sequence.

Failed attempts/constraints identified:

- Relying on implicit Bun defaults gave too-short keep-alive for 20-message Gmail runs.
- The stream handler currently only checked `request.signal.aborted` and did not stop enqueueing safely if the underlying stream had already been closed by Bun due to idle timeout.

The key evidence was in:

- `/tmp/email-agent-server.log` (request timeout and closed-controller error)
- SSE capture file showing partial stream before termination
- test coverage that did not yet assert long-running SSE server timeout behavior

# Root cause

`Bun.serve` defaults to a short idle timeout, and this stream was longer than the default window. Once Bun closed the connection, the handler still proceeded and attempted `controller.enqueue(...)`, which raises `TypeError: Controller is already closed`.

The timeout and controller behavior are separate responsibilities:

- `src/server.ts` controls connection lifetime (`idleTimeout`).
- `src/handlers/agent-endpoint.ts` emits stream lifecycle events.

The connection was timing out before the run finished, so the second phase failed while writing to a closed stream.

# Fix implemented

1. Added configurable server idle timeout in `src/server.ts`.
2. Exposed `IDLE_TIMEOUT_SECONDS` env override for explicit control.
3. Set a safer default of `120` seconds (`DEFAULT_IDLE_TIMEOUT_SECONDS`).
4. Passed `idleTimeout` into the Bun serve options.
5. Updated Bun typing shape in `getBunRuntime()` so compile-time checks include the new option.
6. Added regression tests in `tests/server.test.ts` for:
   - configured idle timeout (`IDLE_TIMEOUT_SECONDS=180`)
   - invalid timeout fallback to default
   - missing timeout fallback to default

### Files changed

- `src/server.ts`
- `tests/server.test.ts`
- `docs/solutions/runtime-errors/bun-sse-idle-timeout-controller-closed-fix.md` (this note)

# Preventive checks and tests

Existing checks now in place:

- `bun run check`
- `tests/server.test.ts` covers `startServer` timeout configuration and fallback paths.
- Manual smoke check for a long `/agent` run now reaches `RUN_FINISHED` in `/tmp/email-agent-sse.log`.

Suggested follow-up guardrails:

1. Add a simulated long-running stream integration test that triggers a `TEXT_MESSAGE_START`, forces a controlled delay past timeout, and asserts no enqueue happens after cancellation.
2. Add a small wrapper helper in stream handlers to guard `controller.enqueue` calls if closed.
3. Export the timeout default to config docs (`README.md`) so deployers know the operational expectation.

# Related work and references

- `README.md` (agent run section)
- `AGENTS.md` (quality gates and reliability conventions)
- `docs/brainstorms/2026-02-14-gmail-agent-reliability-brainstorm.md`
- `docs/plans/2026-02-14-feat-gmail-agent-reliability-hardening-plan.md`
- `tests/observability/log-contract.test.ts` (ensures terminal event/error contract remains stable)
