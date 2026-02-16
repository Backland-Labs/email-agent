# Draft Reply Formal Verification

This directory contains TLA+ models for `POST /draft-reply` safety properties.

## Primary Model

- `draft_reply_safety.tla`
- `draft_reply_safety.cfg`

`draft_reply_safety.*` is the issue #6 boundary model for request parsing, context fetch, draft generation, draft save, abort handling, and terminal stream emission.

## Legacy Focused Model

- `draft-reply-abort-safety/DraftReplyAbortSafety.tla`
- `draft-reply-abort-safety/DraftReplyAbortSafety.cfg`
- `draft-reply-abort-safety/DraftReplyAbortSafetyMutation.cfg`

The legacy model keeps a narrower abort-guard proof and mutation check.

## TLC Setup

1. Install Java 21 (or newer).
2. Run `bun run formal:verify`.

The verification script downloads `tla2tools.jar` automatically to
`~/.cache/email-agent/tla2tools.jar` if it is missing.

Optional overrides:

- `JAVA_BIN` to pick a specific Java executable.
- `TLA2TOOLS_JAR` to use a custom jar path.
- `TLA2TOOLS_URL` to use a custom jar download URL.

## Model Bounds And TLC Options

- Single-run finite-state lifecycle (`Boot` to `Terminal`).
- At most one `drafts.create` transition per run (`draftCreateCalls = 0` guard).
- Forbidden send transitions (`drafts.send`, `messages.send`) are present but disabled by config constants.
- Terminal stuttering is allowed to keep the spec deadlock-free.
- TLC options used by the script:
  - `-cleanup`
  - `-workers 1`
  - isolated `-metadir` per run

## Invariants (`draft_reply_safety.cfg`)

- `InvNeverSend`: `drafts.send` and `messages.send` are never invoked.
- `InvAtMostOneDraftSave`: `drafts.create` is called at most once per run.
- `InvAbortBeforeSaveNoDraft`: abort-before-save implies zero draft creates.
- `InvExactlyOneTerminalEvent`: terminal state has exactly one terminal outcome (`RUN_FINISHED` xor `RUN_ERROR`).
- `InvNoPostTerminalEmits`: no stream events are emitted after the terminal event.
- `InvFinishedImpliesDraftId`: `RUN_FINISHED` implies a draft id exists.

## Reproducible Command

```bash
bun run formal:verify
```
