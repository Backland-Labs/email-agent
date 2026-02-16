---- MODULE DraftReplyAbortSafety ----
EXTENDS Naturals

CONSTANT EnablePreSaveAbortGuard

PHASES ==
  {
    "RunStarted",
    "RequestValidated",
    "ContextFetched",
    "DraftExtracted",
    "SaveReady",
    "TerminalSuccess",
    "TerminalError",
    "TerminalAborted"
  }

VARIABLES
  phase,
  requestValidated,
  contextFetched,
  draftExtracted,
  aborted,
  abortBeforeSave,
  saveAttempts,
  saveInvokedWhenAborted

vars ==
  <<
    phase,
    requestValidated,
    contextFetched,
    draftExtracted,
    aborted,
    abortBeforeSave,
    saveAttempts,
    saveInvokedWhenAborted
  >>

Init ==
  /\ phase = "RunStarted"
  /\ requestValidated = FALSE
  /\ contextFetched = FALSE
  /\ draftExtracted = FALSE
  /\ aborted = FALSE
  /\ abortBeforeSave = FALSE
  /\ saveAttempts = 0
  /\ saveInvokedWhenAborted = FALSE

ValidateRequestSuccess ==
  /\ phase = "RunStarted"
  /\ phase' = "RequestValidated"
  /\ requestValidated' = TRUE
  /\ UNCHANGED
       <<
         contextFetched,
         draftExtracted,
         aborted,
         abortBeforeSave,
         saveAttempts,
         saveInvokedWhenAborted
       >>

ValidateRequestFailure ==
  /\ phase = "RunStarted"
  /\ phase' = "TerminalError"
  /\ UNCHANGED
       <<
         requestValidated,
         contextFetched,
         draftExtracted,
         aborted,
         abortBeforeSave,
         saveAttempts,
         saveInvokedWhenAborted
       >>

FetchContextSuccess ==
  /\ phase = "RequestValidated"
  /\ phase' = "ContextFetched"
  /\ contextFetched' = TRUE
  /\ UNCHANGED
       <<
         requestValidated,
         draftExtracted,
         aborted,
         abortBeforeSave,
         saveAttempts,
         saveInvokedWhenAborted
       >>

FetchContextFailure ==
  /\ phase = "RequestValidated"
  /\ phase' = "TerminalError"
  /\ UNCHANGED
       <<
         requestValidated,
         contextFetched,
         draftExtracted,
         aborted,
         abortBeforeSave,
         saveAttempts,
         saveInvokedWhenAborted
       >>

ExtractDraftSuccess ==
  /\ phase = "ContextFetched"
  /\ phase' = "DraftExtracted"
  /\ draftExtracted' = TRUE
  /\ UNCHANGED
       <<
         requestValidated,
         contextFetched,
         aborted,
         abortBeforeSave,
         saveAttempts,
         saveInvokedWhenAborted
       >>

ExtractDraftFailure ==
  /\ phase = "ContextFetched"
  /\ phase' = "TerminalError"
  /\ UNCHANGED
       <<
         requestValidated,
         contextFetched,
         draftExtracted,
         aborted,
         abortBeforeSave,
         saveAttempts,
         saveInvokedWhenAborted
       >>

AbortBeforeSave ==
   /\ phase \in {"RunStarted", "RequestValidated", "ContextFetched", "DraftExtracted"}
   /\ ~aborted
   /\ saveAttempts = 0
   \* Modeling note: this action sets `aborted = TRUE` without forcing terminal transition.
   \* Runtime checks in `src/handlers/draft-reply-endpoint.ts` (`assertDraftReplyNotAborted`)
   \* short-circuit execution after abort, so this intentionally over-approximates behavior.
   \* This preserves safety-soundness (invariants that hold here also hold at runtime),
   \* but liveness properties such as "abort always reaches TerminalAborted" are not guaranteed
   \* by this model.
   /\ aborted' = TRUE
   /\ abortBeforeSave' = TRUE
  /\ UNCHANGED
       <<
         phase,
         requestValidated,
         contextFetched,
         draftExtracted,
         saveAttempts,
         saveInvokedWhenAborted
       >>

PreSaveGuardAbort ==
  /\ phase = "DraftExtracted"
  /\ EnablePreSaveAbortGuard
  /\ aborted
  /\ phase' = "TerminalAborted"
  /\ UNCHANGED
       <<
         requestValidated,
         contextFetched,
         draftExtracted,
         aborted,
         abortBeforeSave,
         saveAttempts,
         saveInvokedWhenAborted
       >>

PrepareSave ==
  /\ phase = "DraftExtracted"
  /\ (~EnablePreSaveAbortGuard) \/ ~aborted
  /\ phase' = "SaveReady"
  /\ UNCHANGED
       <<
         requestValidated,
         contextFetched,
         draftExtracted,
         aborted,
         abortBeforeSave,
         saveAttempts,
         saveInvokedWhenAborted
       >>

SaveDraftInvoke ==
  /\ phase = "SaveReady"
  /\ requestValidated
  /\ contextFetched
  /\ draftExtracted
  /\ saveAttempts = 0
  /\ phase' = "TerminalSuccess"
  /\ saveAttempts' = saveAttempts + 1
  /\ saveInvokedWhenAborted' = aborted
  /\ UNCHANGED
       <<
         requestValidated,
         contextFetched,
         draftExtracted,
         aborted,
         abortBeforeSave
       >>

StutterAtTerminal ==
  /\ phase \in {"TerminalSuccess", "TerminalError", "TerminalAborted"}
  /\ UNCHANGED vars

Next ==
  \/ ValidateRequestSuccess
  \/ ValidateRequestFailure
  \/ FetchContextSuccess
  \/ FetchContextFailure
  \/ ExtractDraftSuccess
  \/ ExtractDraftFailure
  \/ AbortBeforeSave
  \/ PreSaveGuardAbort
  \/ PrepareSave
  \/ SaveDraftInvoke
  \/ StutterAtTerminal

Spec == Init /\ [][Next]_vars

TypeOk ==
  /\ phase \in PHASES
  /\ requestValidated \in BOOLEAN
  /\ contextFetched \in BOOLEAN
  /\ draftExtracted \in BOOLEAN
  /\ aborted \in BOOLEAN
  /\ abortBeforeSave \in BOOLEAN
  /\ saveAttempts \in 0..1
  /\ saveInvokedWhenAborted \in BOOLEAN

InvStrictAbortSafe == abortBeforeSave => saveAttempts = 0

InvAtMostOnceSave == saveAttempts <= 1

InvSaveGuarded ==
  saveAttempts = 0 \/
    (requestValidated /\ contextFetched /\ draftExtracted /\ ~saveInvokedWhenAborted)

====
