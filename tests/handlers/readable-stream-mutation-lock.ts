const READABLE_STREAM_LOCK_KEY = Symbol.for("email-agent.tests.readable-stream-lock");

type LockState = {
  tail: Promise<void>;
};

function getLockState(): LockState {
  const globalObject = globalThis as typeof globalThis & {
    [READABLE_STREAM_LOCK_KEY]?: LockState;
  };

  if (!globalObject[READABLE_STREAM_LOCK_KEY]) {
    globalObject[READABLE_STREAM_LOCK_KEY] = {
      tail: Promise.resolve()
    };
  }

  return globalObject[READABLE_STREAM_LOCK_KEY];
}

export async function acquireReadableStreamMutationLock(): Promise<() => void> {
  const lockState = getLockState();
  const previousTail = lockState.tail;

  let releaseLock: (() => void) | undefined;
  const currentTail = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  lockState.tail = previousTail.then(() => currentTail);
  await previousTail;

  return () => {
    releaseLock?.();
  };
}
