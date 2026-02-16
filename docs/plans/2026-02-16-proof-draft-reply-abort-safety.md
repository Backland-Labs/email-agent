---
title: "Proof: Draft Reply Abort-Safety and Draft-Save Idempotency"
date: 2026-02-16
type: verification
status: completed
issue: "https://github.com/Backland-Labs/email-agent/issues/7"
---

# Draft Reply Abort-Safety and Draft-Save Idempotency

## Acceptance Checklist

- [x] Formal model defines a precise save boundary (`SaveDraftInvoke`) and abort precedence.
- [x] TLC check passes for:
  - [x] `InvStrictAbortSafe`: abort-before-save implies `saveAttempts = 0`.
  - [x] `InvAtMostOnceSave`: `saveAttempts <= 1`.
  - [x] `InvSaveGuarded`: save attempts only after validated request, fetched context, extracted draft, and non-aborted state.
- [x] Mutation scenario (removing pre-save abort guard) yields a model-check counterexample trace.
- [x] Runtime conformance tests deterministically verify:
  - [x] abort-after-generation-before-save => `createReplyDraft` called `0` times.
  - [x] success path => `createReplyDraft` called exactly `1` time.
- [x] CI runs formal verification and fails closed on violations.

## Implementation Notes

- Formal model directory: `formal/draft-reply-abort-safety/`
- Verification command: `bun run formal:verify`
- CI status check: `formal-verification` job in `.github/workflows/formal-verification.yml`
