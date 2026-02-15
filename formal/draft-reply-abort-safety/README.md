# Draft Reply Abort Safety Model

This TLA+ model verifies the `POST /draft-reply` save boundary around `createReplyDraft`.

## Model Files

- `DraftReplyAbortSafety.tla` - finite-state lifecycle model
- `DraftReplyAbortSafety.cfg` - expected production behavior (`EnablePreSaveAbortGuard = TRUE`)
- `DraftReplyAbortSafetyMutation.cfg` - mutation scenario (`EnablePreSaveAbortGuard = FALSE`)

## Verified Invariants

- `InvStrictAbortSafe` - abort-before-save implies `saveAttempts = 0`
- `InvAtMostOnceSave` - `saveAttempts <= 1`
- `InvSaveGuarded` - save attempts only occur after request validation, context fetch, draft extraction, and non-aborted state at invocation

## Local Command

```bash
bun run formal:verify
```

The command runs TLC for the production config, then reruns TLC with the mutation config and requires an invariant counterexample trace.
