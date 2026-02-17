import {
  createDependencies,
  createDraftReplyDependencies,
  createInsightSequence,
  createNarrativeDependencies,
  createMessage,
  runAgentRequest,
  runDraftReplyRequest,
  runNarrativeRequest
} from "./log-contract-scenario-helpers.js";
import type { Auth } from "googleapis";
import type { NarrativeEndpointDependencies } from "../../../src/handlers/narrative-endpoint.js";
import type { DraftReplyEndpointDependencies } from "../../../src/handlers/draft-reply-endpoint.js";

type DraftReplyGmailContextClient = ReturnType<
  DraftReplyEndpointDependencies["createGmailReplyContextApi"]
>;

export async function runLogContractScenarios(): Promise<void> {
  await runAgentSuccessScenario();
  await runAgentFailureScenario();
  await runDraftReplySuccessScenario();
  await runDraftReplyFailureScenario();
  await runNarrativeSuccessScenario();
  await runNarrativeFailureScenario();
  await runNarrativePartialInsightFailureScenario();
  await runNarrativeAbortScenario();
}

async function runAgentSuccessScenario(): Promise<void> {
  const dependencies = createDependencies({
    list: () =>
      Promise.resolve({
        data: {
          messages: [{ id: "email-1" }]
        }
      }),
    get: () =>
      Promise.resolve({
        data: {
          id: "email-1",
          threadId: "thread-email-1",
          snippet: "Short snippet",
          payload: {
            headers: [
              { name: "Subject", value: "Quarterly update" },
              { name: "From", value: "sender@example.com" },
              { name: "To", value: "recipient@example.com" },
              { name: "Date", value: "Sat, 14 Feb 2026 13:00:00 +0000" }
            ],
            body: {
              data: toBase64Url("Email body content")
            }
          }
        }
      })
  });

  await runAgentRequest(dependencies);
}

async function runAgentFailureScenario(): Promise<void> {
  const dependencies = createDependencies({
    list: () => Promise.reject(new Error("Gmail unavailable")),
    get: () => Promise.reject(new Error("Unreachable get in failure scenario"))
  });

  await runAgentRequest(dependencies);
}

async function runDraftReplySuccessScenario(): Promise<void> {
  const gmailClient = {
    getMessage: (() =>
      Promise.resolve({
        data: createMessage("target-email", "thread-reply-1")
      })) as unknown as DraftReplyGmailContextClient["getMessage"],
    getThread: (() =>
      Promise.resolve({
        data: {
          messages: [createMessage("target-email", "thread-reply-1")]
        }
      })) as unknown as DraftReplyGmailContextClient["getThread"]
  } as DraftReplyGmailContextClient;

  const dependencies = createDraftReplyDependencies(gmailClient);

  await runDraftReplyRequest(
    dependencies,
    JSON.stringify({
      emailId: "target-email",
      runId: "run-draft-success",
      threadId: "thread-draft-success"
    })
  );
}

async function runDraftReplyFailureScenario(): Promise<void> {
  const gmailClient = {
    getMessage: (() =>
      Promise.resolve({
        data: createMessage("target-email", "thread-reply-1")
      })) as unknown as DraftReplyGmailContextClient["getMessage"],
    getThread: (() =>
      Promise.resolve({
        data: { messages: [] }
      })) as unknown as DraftReplyGmailContextClient["getThread"]
  } as DraftReplyGmailContextClient;

  const dependencies = createDraftReplyDependencies(gmailClient);

  await runDraftReplyRequest(dependencies, "{malformed-json");
}

async function runNarrativeSuccessScenario(): Promise<void> {
  const dependencies = createNarrativeDependencies({
    createGmailMessagesApi: (_authClient: Auth.OAuth2Client) => {
      void _authClient;
      return {
        list: () =>
          Promise.resolve({
            data: {
              messages: [{ id: "narrative-1" }, { id: "narrative-2" }]
            }
          }),
        get: ({ id }: { id: string }) =>
          Promise.resolve({
            data: createMessage(`narrative-${id}`, `thread-narrative`)
          })
      } as unknown as ReturnType<NarrativeEndpointDependencies["createGmailMessagesApi"]>;
    }
  });

  await runNarrativeRequest(
    dependencies,
    JSON.stringify({
      runId: "run-narrative-success",
      threadId: "thread-narrative-success"
    })
  );
}

async function runNarrativeFailureScenario(): Promise<void> {
  const dependencies = createNarrativeDependencies({
    fetchUnreadEmails: () => Promise.reject(new Error("Gmail unavailable"))
  });

  await runNarrativeRequest(dependencies, JSON.stringify({ runId: "run-narrative-failed" }));
}

async function runNarrativePartialInsightFailureScenario(): Promise<void> {
  const dependencies = createNarrativeDependencies({
    createGmailMessagesApi: (_authClient: Auth.OAuth2Client) => {
      void _authClient;
      return {
        list: () =>
          Promise.resolve({
            data: {
              messages: [{ id: "narrative-partial-1" }, { id: "narrative-partial-2" }]
            }
          }),
        get: ({ id }: { id: string }) =>
          Promise.resolve({
            data: createMessage(`narrative-${id}`, `thread-narrative-partial`)
          })
      } as unknown as ReturnType<NarrativeEndpointDependencies["createGmailMessagesApi"]>;
    },
    extractEmailInsight: createInsightSequence([
      new Error("LLM failed"),
      {
        summary: "A routine quarterly update.",
        category: "business",
        urgency: "fyi",
        action: null
      }
    ])
  });

  await runNarrativeRequest(
    dependencies,
    JSON.stringify({
      runId: "run-narrative-partial",
      threadId: "thread-narrative-partial"
    })
  );
}

async function runNarrativeAbortScenario(): Promise<void> {
  const dependencies = createNarrativeDependencies({
    createGmailMessagesApi: (_authClient: Auth.OAuth2Client) => {
      void _authClient;
      return {
        list: () =>
          Promise.resolve({
            data: {
              messages: [{ id: "narrative-abort-1" }]
            }
          }),
        get: ({ id }: { id: string }) =>
          Promise.resolve({
            data: createMessage(`narrative-${id}`, "thread-narrative-abort")
          })
      } as unknown as ReturnType<NarrativeEndpointDependencies["createGmailMessagesApi"]>;
    }
  });
  const abortController = new AbortController();

  abortController.abort();

  await runNarrativeRequest(
    dependencies,
    JSON.stringify({
      runId: "run-narrative-abort",
      threadId: "thread-narrative-abort"
    }),
    { signal: abortController.signal }
  );
}

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}
