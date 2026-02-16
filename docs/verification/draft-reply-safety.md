# Draft Reply No-Send Safety Verification

## Purpose

This note maps the TLA+ model in `formal/draft_reply_safety.tla` to the runtime
implementation in `src/handlers/draft-reply-endpoint.ts`.

The model verifies boundary-level safety for `POST /draft-reply`:

- request parsing and validation branches
- context fetch branches
- draft generation branches
- draft save branches
- abort checkpoints before save
- terminal SSE emission behavior

## State And Action Mapping

| Formal phase/action                                       | Runtime behavior                                                                             |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `EmitRunStarted`                                          | `encodeRunStarted(...)` is emitted when the stream starts.                                   |
| `MalformedJsonRequest`                                    | `parseDraftReplyRequestBody` detects invalid JSON and emits `RUN_ERROR` (`invalid_request`). |
| `InvalidRequestPayload`                                   | `parseDraftReplyRequest` throws for schema-invalid payload and emits `RUN_ERROR`.            |
| `AbortBeforeTextStart`                                    | `assertDraftReplyNotAborted(request.signal)` before `TEXT_MESSAGE_START`.                    |
| `ValidateRequestAndStartText`                             | `encodeTextMessageStart(...)` after request validation and pre-fetch abort check.            |
| `ContextFetchSuccess` / `ContextFetchFailure`             | `fetchReplyContext(...)` succeeds or throws (`context_fetch_failed`).                        |
| `AbortAfterContextFetch`                                  | abort checkpoint immediately after context fetch.                                            |
| `DraftGenerationSuccess` / `DraftGenerationFailure`       | `extractDraftReply(...)` succeeds or throws (`draft_generation_failed`).                     |
| `AbortBeforeDraftSave`                                    | abort checkpoint immediately before `createReplyDraft(...)`.                                 |
| `InvokeDraftsCreateSuccess` / `InvokeDraftsCreateFailure` | `createReplyDraft(...)` succeeds (`RUN_FINISHED`) or fails (`draft_save_failed`).            |
| `InvokeDraftsSendForbidden`                               | Explicitly modeled but disabled (`AllowDraftsSend = FALSE`).                                 |
| `InvokeMessagesSendForbidden`                             | Explicitly modeled but disabled (`AllowMessagesSend = FALSE`).                               |
| `StutterAtTerminal`                                       | `terminalEmitted` guards prevent additional events after terminal.                           |

## Verified Safety Properties

The following invariants are checked via `formal/draft_reply_safety.cfg`:

1. `InvNeverSend`: `drafts.send` and `messages.send` are never invoked.
2. `InvAtMostOneDraftSave`: `drafts.create` is invoked at most once.
3. `InvAbortBeforeSaveNoDraft`: abort-before-save implies no draft create.
4. `InvExactlyOneTerminalEvent`: terminal path emits exactly one of `RUN_FINISHED` or `RUN_ERROR`.
5. `InvNoPostTerminalEmits`: stream event list does not grow after terminal.
6. `InvFinishedImpliesDraftId`: finished runs include a draft id.

## Checked Path Coverage

The model includes transitions for all required path families:

- success path
- malformed JSON path
- invalid request payload path
- context fetch failure path
- draft generation failure path
- draft save failure path
- abort paths at all pre-save checkpoints

## What Is Proven

- At modeled boundary level, endpoint control flow cannot invoke send APIs.
- Draft save cannot happen more than once per run.
- Abort before save cannot produce a created draft.
- Terminal stream behavior remains single-terminal and terminal-final.
- Successful terminal outcome implies draft metadata includes an id.

## Out Of Scope

- Gmail/provider correctness (for example, provider-side send behavior).
- Transport-level failures outside modeled endpoint control flow.
- Full-system proofs for routes other than `POST /draft-reply`.
- Replacement of runtime tests; this complements existing tests.

## Reproduce

```bash
bun run formal:verify
```
