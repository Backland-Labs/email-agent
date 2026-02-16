import { google, type Auth } from "googleapis";

import { logger } from "../observability/logger.js";
import { createAuthClient } from "../services/gmail/create-auth-client.js";
import {
  fetchUnreadEmails,
  type GmailGetParams,
  type GmailListParams
} from "../services/gmail/fetch-unread-emails.js";
import { extractEmailInsight } from "../services/ai/extract-email-insight.js";
import {
  createAgentEndpointStream,
  type AgentEndpointDependencies,
  toRunContext
} from "./agent-endpoint-runtime.js";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

const agentLogger = logger.child({ route: "/agent" });

const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache",
  connection: "keep-alive"
};

export { type AgentEndpointDependencies } from "./agent-endpoint-runtime.js";

export async function handleAgentEndpoint(
  request: Request,
  dependencies: AgentEndpointDependencies = createDefaultDependencies()
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const runContext = await toRunContext(request, requestId);
  const messageId = dependencies.createMessageId();
  const runLogger = agentLogger.child({
    requestId,
    runId: runContext.runId,
    threadId: runContext.threadId
  });

  const stream = createAgentEndpointStream({
    request,
    dependencies,
    runContext,
    runLogger,
    messageId,
    requestId
  });

  return Promise.resolve(
    new Response(stream, {
      status: 200,
      headers: SSE_HEADERS
    })
  );
}

function createDefaultDependencies(): AgentEndpointDependencies {
  return {
    createAuthClient,
    createGmailMessagesApi: (authClient) => {
      const gmail = google.gmail({
        version: "v1",
        auth: authClient as Auth.OAuth2Client
      });

      return {
        list: (params: GmailListParams) =>
          gmail.users.messages.list({
            userId: params.userId,
            q: params.q,
            labelIds: params.labelIds,
            maxResults: params.maxResults
          }),
        get: (params: GmailGetParams) =>
          gmail.users.messages.get({
            userId: params.userId,
            id: params.id,
            format: params.format
          })
      };
    },
    fetchUnreadEmails,
    extractEmailInsight,
    model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
    createMessageId: () => crypto.randomUUID()
  };
}
