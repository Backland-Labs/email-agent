import { EventType, type BaseEvent, type RunAgentInput } from "@ag-ui/core";
import { EventEncoder } from "@ag-ui/encoder";

const eventEncoder = new EventEncoder();
const textEncoder = new TextEncoder();

export type RunStartedParams = {
  threadId: string;
  runId: string;
  parentRunId?: string;
  input?: RunAgentInput;
};

export type TextMessageStartParams = {
  messageId: string;
};

export type TextMessageContentParams = {
  messageId: string;
  delta: string;
};

export type TextMessageEndParams = {
  messageId: string;
};

export type RunFinishedParams = {
  threadId: string;
  runId: string;
  result?: unknown;
};

export type RunErrorParams = {
  message: string;
  code?: string;
};

export function encodeRunStarted(params: RunStartedParams): Uint8Array {
  const event = {
    type: EventType.RUN_STARTED,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
    ...(params.input ? { input: params.input } : {})
  } as BaseEvent;

  return encodeEvent(event);
}

export function encodeTextMessageStart(params: TextMessageStartParams): Uint8Array {
  return encodeEvent({
    type: EventType.TEXT_MESSAGE_START,
    messageId: params.messageId,
    role: "assistant"
  } as BaseEvent);
}

export function encodeTextMessageContent(params: TextMessageContentParams): Uint8Array {
  return encodeEvent({
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: params.messageId,
    delta: params.delta
  } as BaseEvent);
}

export function encodeTextMessageEnd(params: TextMessageEndParams): Uint8Array {
  return encodeEvent({
    type: EventType.TEXT_MESSAGE_END,
    messageId: params.messageId
  } as BaseEvent);
}

export function encodeRunFinished(params: RunFinishedParams): Uint8Array {
  const event = {
    type: EventType.RUN_FINISHED,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.result ? { result: params.result } : {})
  } as BaseEvent;

  return encodeEvent(event);
}

export function encodeRunError(params: RunErrorParams): Uint8Array {
  return encodeEvent({
    type: EventType.RUN_ERROR,
    message: params.message,
    ...(params.code ? { code: params.code } : {})
  } as BaseEvent);
}

function encodeEvent(event: BaseEvent): Uint8Array {
  return textEncoder.encode(eventEncoder.encodeSSE(event));
}
