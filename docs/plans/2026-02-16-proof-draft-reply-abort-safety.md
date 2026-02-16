---
title: "Proof: Draft Reply Abort-Safety and Draft-Save Idempotency"
date: 2026-02-16
type: verification
---

# Proof: Draft Reply Abort-Safety and Draft-Save Idempotency

## Scope

- Target flow: `handleDraftReplyEndpoint`
- Safety invariants:
  - `I1` Create-side-effect (`createReplyDraft`) is not invoked when the request is aborted before draft save.
  - `I2` Create-side-effect is invoked at most once per request run.

## Evidence Surface

- Runtime control logic: `src/handlers/draft-reply-endpoint.ts`
  - Abort checks at lines `148`, `172`, `228`.
  - Draft save call at line `207`.
  - All terminal writes are guarded by `terminalEmitted`.
- Boundary contract: `src/handlers/draft-reply-endpoint-dependencies.ts`
- Default wiring: `src/handlers/draft-reply-endpoint-default-dependencies.ts`

## Assumptions

1. `Request` object cancellation is signaled only via `request.signal.aborted`.
2. `createReplyDraft` is side-effecting and non-idempotent, so invocations must be constrained by handler control flow.
3. The handler executes its async sequence in order within the stream `start` callback.

## Formal Sketch

### Invariant `I1` (Abort safety before save)

Claim: if `request.signal` is not aborted before draft generation but becomes aborted before the draft save call, then `createReplyDraft` is not invoked.

- The only place that may call `createReplyDraft` is `src/handlers/draft-reply-endpoint.ts:207`.
- Any path to that call must pass through `assertDraftReplyNotAborted(request.signal)` at `:228`.
- `assertDraftReplyNotAborted` throws `DraftReplyEndpointError` when `signal.aborted`.
- The throw is caught in the outer `try/catch`, where only `emitRunErrorIfNeeded` is executed and then the stream closes.
- Therefore, on an aborted signal, control never reaches the side-effect call in normal sequencing.

### Invariant `I2` (At most one draft save)

Claim: `createReplyDraft` is called at most once per `handleDraftReplyEndpoint` invocation.

- The handler has a single static invocation site for `createReplyDraft` and no retry loop around it.
- `terminalEmitted` blocks duplicate terminal outputs but does not influence draft invocation directly.
- A thrown error before/at that line aborts execution and prevents any later call.
- Therefore each request run can execute the draft-save branch at most once.

## Regression Tests Added

### Invariant `I1`

- `tests/handlers/draft-reply-endpoint.test.ts`
  - `does not call createReplyDraft when request is aborted before draft save`
    - Injects abort during `extractDraftReply`.
    - Asserts:
      - response contains `RUN_ERROR` with `request_aborted`
      - `createReplyDraft` call count is `0`.

### Invariant `I2`

- `tests/handlers/draft-reply-endpoint.test.ts`
  - `creates exactly one draft for a successful run`
    - Asserts `RUN_FINISHED` with no `RUN_ERROR`.
    - Asserts `createReplyDraft` call count is `1`.
- `tests/handlers/draft-reply-endpoint-default-dependencies.test.ts`
  - Existing coverage verifies default path wiring creates one draft per successful endpoint invocation.

## Open Risks / Non-covered Cases

- Retries/replays at caller or transport layer are out of scope; they can legitimately create multiple draft saves across separate HTTP runs.
- Concurrency-safety across processes is out of scope for this assertion.
- Future refactors should keep the explicit boundary assertions and single call-site shape to preserve this proof.

## Next Verification Step

- Add an end-to-end duplicate-run scenario if client-level retry behavior needs stronger idempotency guarantees (e.g. dedupe key in request contract).
