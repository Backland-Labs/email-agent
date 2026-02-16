---- MODULE draft_reply_safety ----
EXTENDS Naturals, Sequences

CONSTANTS AllowDraftsSend, AllowMessagesSend

PHASES ==
  {
    "Boot",
    "AfterRunStarted",
    "RequestValidated",
    "ContextFetched",
    "DraftReady",
    "Terminal"
  }

STREAM_EVENTS ==
  {
    "RUN_STARTED",
    "TEXT_MESSAGE_START",
    "TEXT_MESSAGE_CONTENT",
    "TEXT_MESSAGE_END",
    "RUN_FINISHED",
    "RUN_ERROR"
  }

VARIABLES
  phase,
  streamEvents,
  terminalEventIndex,
  runFinishedEmitted,
  runErrorEmitted,
  draftCreateCalls,
  draftsSendCalls,
  messagesSendCalls,
  abortBeforeSave,
  draftIdPresent

vars ==
  <<
    phase,
    streamEvents,
    terminalEventIndex,
    runFinishedEmitted,
    runErrorEmitted,
    draftCreateCalls,
    draftsSendCalls,
    messagesSendCalls,
    abortBeforeSave,
    draftIdPresent
  >>

Append2(events, first, second) == Append(Append(events, first), second)

Append3(events, first, second, third) ==
  Append(Append(Append(events, first), second), third)

Init ==
  /\ phase = "Boot"
  /\ streamEvents = <<>>
  /\ terminalEventIndex = 0
  /\ runFinishedEmitted = FALSE
  /\ runErrorEmitted = FALSE
  /\ draftCreateCalls = 0
  /\ draftsSendCalls = 0
  /\ messagesSendCalls = 0
  /\ abortBeforeSave = FALSE
  /\ draftIdPresent = FALSE

EmitRunStarted ==
  /\ phase = "Boot"
  /\ phase' = "AfterRunStarted"
  /\ streamEvents' = Append(streamEvents, "RUN_STARTED")
  /\ UNCHANGED
       <<
         terminalEventIndex,
         runFinishedEmitted,
         runErrorEmitted,
         draftCreateCalls,
         draftsSendCalls,
         messagesSendCalls,
         abortBeforeSave,
         draftIdPresent
       >>

MalformedJsonRequest ==
  /\ phase = "AfterRunStarted"
  /\ phase' = "Terminal"
  /\ streamEvents' = Append(streamEvents, "RUN_ERROR")
  /\ terminalEventIndex' = Len(streamEvents')
  /\ runErrorEmitted' = TRUE
  /\ UNCHANGED
       <<
         runFinishedEmitted,
         draftCreateCalls,
         draftsSendCalls,
         messagesSendCalls,
         abortBeforeSave,
         draftIdPresent
       >>

InvalidRequestPayload ==
  /\ phase = "AfterRunStarted"
  /\ phase' = "Terminal"
  /\ streamEvents' = Append(streamEvents, "RUN_ERROR")
  /\ terminalEventIndex' = Len(streamEvents')
  /\ runErrorEmitted' = TRUE
  /\ UNCHANGED
       <<
         runFinishedEmitted,
         draftCreateCalls,
         draftsSendCalls,
         messagesSendCalls,
         abortBeforeSave,
         draftIdPresent
       >>

AbortBeforeTextStart ==
  /\ phase = "AfterRunStarted"
  /\ phase' = "Terminal"
  /\ streamEvents' = Append(streamEvents, "RUN_ERROR")
  /\ terminalEventIndex' = Len(streamEvents')
  /\ runErrorEmitted' = TRUE
  /\ abortBeforeSave' = TRUE
  /\ UNCHANGED
       <<
         runFinishedEmitted,
         draftCreateCalls,
         draftsSendCalls,
         messagesSendCalls,
         draftIdPresent
       >>

ValidateRequestAndStartText ==
  /\ phase = "AfterRunStarted"
  /\ phase' = "RequestValidated"
  /\ streamEvents' = Append(streamEvents, "TEXT_MESSAGE_START")
  /\ UNCHANGED
       <<
         terminalEventIndex,
         runFinishedEmitted,
         runErrorEmitted,
         draftCreateCalls,
         draftsSendCalls,
         messagesSendCalls,
         abortBeforeSave,
         draftIdPresent
       >>

ContextFetchFailure ==
  /\ phase = "RequestValidated"
  /\ phase' = "Terminal"
  /\ streamEvents' = Append2(streamEvents, "TEXT_MESSAGE_END", "RUN_ERROR")
  /\ terminalEventIndex' = Len(streamEvents')
  /\ runErrorEmitted' = TRUE
  /\ UNCHANGED
       <<
         runFinishedEmitted,
         draftCreateCalls,
         draftsSendCalls,
         messagesSendCalls,
         abortBeforeSave,
         draftIdPresent
       >>

ContextFetchSuccess ==
  /\ phase = "RequestValidated"
  /\ phase' = "ContextFetched"
  /\ UNCHANGED
       <<
         streamEvents,
         terminalEventIndex,
         runFinishedEmitted,
         runErrorEmitted,
         draftCreateCalls,
         draftsSendCalls,
         messagesSendCalls,
         abortBeforeSave,
         draftIdPresent
       >>

AbortAfterContextFetch ==
  /\ phase = "ContextFetched"
  /\ phase' = "Terminal"
  /\ streamEvents' = Append2(streamEvents, "TEXT_MESSAGE_END", "RUN_ERROR")
  /\ terminalEventIndex' = Len(streamEvents')
  /\ runErrorEmitted' = TRUE
  /\ abortBeforeSave' = TRUE
  /\ UNCHANGED
       <<
         runFinishedEmitted,
         draftCreateCalls,
         draftsSendCalls,
         messagesSendCalls,
         draftIdPresent
       >>

DraftGenerationFailure ==
  /\ phase = "ContextFetched"
  /\ phase' = "Terminal"
  /\ streamEvents' = Append2(streamEvents, "TEXT_MESSAGE_END", "RUN_ERROR")
  /\ terminalEventIndex' = Len(streamEvents')
  /\ runErrorEmitted' = TRUE
  /\ UNCHANGED
       <<
         runFinishedEmitted,
         draftCreateCalls,
         draftsSendCalls,
         messagesSendCalls,
         abortBeforeSave,
         draftIdPresent
       >>

DraftGenerationSuccess ==
  /\ phase = "ContextFetched"
  /\ phase' = "DraftReady"
  /\ UNCHANGED
       <<
         streamEvents,
         terminalEventIndex,
         runFinishedEmitted,
         runErrorEmitted,
         draftCreateCalls,
         draftsSendCalls,
         messagesSendCalls,
         abortBeforeSave,
         draftIdPresent
       >>

AbortBeforeDraftSave ==
  /\ phase = "DraftReady"
  /\ phase' = "Terminal"
  /\ streamEvents' = Append2(streamEvents, "TEXT_MESSAGE_END", "RUN_ERROR")
  /\ terminalEventIndex' = Len(streamEvents')
  /\ runErrorEmitted' = TRUE
  /\ abortBeforeSave' = TRUE
  /\ UNCHANGED
       <<
         runFinishedEmitted,
         draftCreateCalls,
         draftsSendCalls,
         messagesSendCalls,
         draftIdPresent
       >>

InvokeDraftsCreateFailure ==
  /\ phase = "DraftReady"
  /\ draftCreateCalls = 0
  /\ phase' = "Terminal"
  /\ draftCreateCalls' = draftCreateCalls + 1
  /\ streamEvents' = Append2(streamEvents, "TEXT_MESSAGE_END", "RUN_ERROR")
  /\ terminalEventIndex' = Len(streamEvents')
  /\ runErrorEmitted' = TRUE
  /\ UNCHANGED
       <<
         runFinishedEmitted,
         draftsSendCalls,
         messagesSendCalls,
         abortBeforeSave,
         draftIdPresent
       >>

InvokeDraftsCreateSuccess ==
  /\ phase = "DraftReady"
  /\ draftCreateCalls = 0
  /\ phase' = "Terminal"
  /\ draftCreateCalls' = draftCreateCalls + 1
  /\ streamEvents' =
       Append3(streamEvents, "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END", "RUN_FINISHED")
  /\ terminalEventIndex' = Len(streamEvents')
  /\ runFinishedEmitted' = TRUE
  /\ draftIdPresent' = TRUE
  /\ UNCHANGED
       <<
         runErrorEmitted,
         draftsSendCalls,
         messagesSendCalls,
         abortBeforeSave
       >>

InvokeDraftsSendForbidden ==
  /\ phase = "DraftReady"
  /\ AllowDraftsSend
  /\ phase' = "Terminal"
  /\ draftsSendCalls' = draftsSendCalls + 1
  /\ streamEvents' = Append2(streamEvents, "TEXT_MESSAGE_END", "RUN_ERROR")
  /\ terminalEventIndex' = Len(streamEvents')
  /\ runErrorEmitted' = TRUE
  /\ UNCHANGED
       <<
         runFinishedEmitted,
         draftCreateCalls,
         messagesSendCalls,
         abortBeforeSave,
         draftIdPresent
       >>

InvokeMessagesSendForbidden ==
  /\ phase = "DraftReady"
  /\ AllowMessagesSend
  /\ phase' = "Terminal"
  /\ messagesSendCalls' = messagesSendCalls + 1
  /\ streamEvents' = Append2(streamEvents, "TEXT_MESSAGE_END", "RUN_ERROR")
  /\ terminalEventIndex' = Len(streamEvents')
  /\ runErrorEmitted' = TRUE
  /\ UNCHANGED
       <<
         runFinishedEmitted,
         draftCreateCalls,
         draftsSendCalls,
         abortBeforeSave,
         draftIdPresent
       >>

StutterAtTerminal ==
  /\ phase = "Terminal"
  /\ UNCHANGED vars

Next ==
  \/ EmitRunStarted
  \/ MalformedJsonRequest
  \/ InvalidRequestPayload
  \/ AbortBeforeTextStart
  \/ ValidateRequestAndStartText
  \/ ContextFetchFailure
  \/ ContextFetchSuccess
  \/ AbortAfterContextFetch
  \/ DraftGenerationFailure
  \/ DraftGenerationSuccess
  \/ AbortBeforeDraftSave
  \/ InvokeDraftsCreateFailure
  \/ InvokeDraftsCreateSuccess
  \/ InvokeDraftsSendForbidden
  \/ InvokeMessagesSendForbidden
  \/ StutterAtTerminal

Spec == Init /\ [][Next]_vars

TypeOk ==
  /\ phase \in PHASES
  /\ streamEvents \in Seq(STREAM_EVENTS)
  /\ terminalEventIndex \in Nat
  /\ runFinishedEmitted \in BOOLEAN
  /\ runErrorEmitted \in BOOLEAN
  /\ draftCreateCalls \in Nat
  /\ draftsSendCalls \in Nat
  /\ messagesSendCalls \in Nat
  /\ abortBeforeSave \in BOOLEAN
  /\ draftIdPresent \in BOOLEAN

InvNeverSend ==
  /\ draftsSendCalls = 0
  /\ messagesSendCalls = 0

InvAtMostOneDraftSave == draftCreateCalls <= 1

InvAbortBeforeSaveNoDraft == abortBeforeSave => (draftCreateCalls = 0)

InvExactlyOneTerminalEvent ==
  /\ ~(runFinishedEmitted /\ runErrorEmitted)
  /\ phase = "Terminal" =>
       /\ runFinishedEmitted # runErrorEmitted
       /\ terminalEventIndex > 0

InvNoPostTerminalEmits == terminalEventIndex = 0 \/ terminalEventIndex = Len(streamEvents)

InvFinishedImpliesDraftId == runFinishedEmitted => draftIdPresent

====
