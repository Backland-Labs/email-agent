/* eslint-disable max-lines */
import { describe, expect, it, vi } from "vitest";
import type { Auth } from "googleapis";

import { createEmailMetadata } from "../../src/domain/email-metadata.js";
import {
  handleDraftReplyEndpoint,
  type DraftReplyEndpointDependencies
} from "../../src/handlers/draft-reply-endpoint.js";

function createDependencies(): DraftReplyEndpointDependencies {
  const targetEmail = createEmailMetadata({
    id: "target-email",
    threadId: "thread-1",
    subject: "Re: Planning",
    from: "manager@example.com",
    to: "you@example.com",
    date: "Sat, 14 Feb 2026 13:00:00 +0000",
    snippet: "Need your update",
    bodyText: "Can you reply with your status update?"
  });

  return {
    createAuthClient: vi.fn(() => ({ token: "token" }) as unknown as Auth.OAuth2Client),
    createGmailReplyContextApi: vi.fn(() => ({
      getMessage: vi.fn(),
      getThread: vi.fn()
    })),
    createGmailDraftsApi: vi.fn(() => ({
      create: vi.fn()
    })),
    fetchReplyContext: vi.fn(() =>
      Promise.resolve({
        email: targetEmail,
        threadId: "thread-1",
        contextMessages: [targetEmail],
        contextMessageCount: 1,
        contextDegraded: false,
        replyHeaders: {
          inReplyTo: "<target-email@example.com>",
          references: "<ancestor@example.com> <target-email@example.com>"
        }
      })
    ),
    extractDraftReply: vi.fn(() =>
      Promise.resolve({
        draftText: "Thanks for the note. I will send the update by tomorrow.",
        subjectSuggestion: "Re: Planning",
        riskFlags: []
      })
    ),
    createReplyDraft: vi.fn(() =>
      Promise.resolve({
        id: "gmail-draft-1",
        threadId: "thread-1"
      })
    ),
    model: "claude-sonnet-4-20250514",
    createMessageId: () => "00000000-0000-0000-0000-000000000001"
  };
}

function createRequest(init?: RequestInit): Request {
  return new Request("http://localhost:3001/draft-reply", { method: "POST", ...init });
}

function countOccurrences(content: string, target: string): number {
  return content.split(target).length - 1;
}

function terminalEventCount(body: string): number {
  return (
    countOccurrences(body, '"type":"RUN_FINISHED"') + countOccurrences(body, '"type":"RUN_ERROR"')
  );
}

describe("handleDraftReplyEndpoint", () => {
  it("streams full SSE lifecycle for successful draft generation", async () => {
    const dependencies = createDependencies();

    const response = await handleDraftReplyEndpoint(
      createRequest({
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          emailId: "target-email",
          runId: "run-1",
          threadId: "thread-1",
          voiceInstructions: "Keep this short"
        })
      }),
      dependencies
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body.indexOf('"type":"RUN_STARTED"')).toBeGreaterThanOrEqual(0);
    expect(body.indexOf('"type":"TEXT_MESSAGE_START"')).toBeGreaterThan(
      body.indexOf('"type":"RUN_STARTED"')
    );
    expect(body.indexOf('"type":"TEXT_MESSAGE_CONTENT"')).toBeGreaterThan(
      body.indexOf('"type":"TEXT_MESSAGE_START"')
    );
    expect(body.indexOf('"type":"TEXT_MESSAGE_END"')).toBeGreaterThan(
      body.indexOf('"type":"TEXT_MESSAGE_CONTENT"')
    );
    expect(body.indexOf('"type":"RUN_FINISHED"')).toBeGreaterThan(
      body.indexOf('"type":"TEXT_MESSAGE_END"')
    );
    expect(body).toContain('"result":{');
    expect(body).toContain('"emailId":"target-email"');
    expect(body).toContain('"gmailDraftId":"gmail-draft-1"');
    expect(body).toContain('"contextMessageCount":1');
    expect(body).toContain('"contextDegraded":false');
  });

  it("emits RUN_ERROR with invalid_request code for malformed request", async () => {
    const dependencies = createDependencies();

    const response = await handleDraftReplyEndpoint(
      createRequest({
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId: "run-1"
        })
      }),
      dependencies
    );
    const body = await response.text();

    expect(body).toContain('"type":"RUN_ERROR"');
    expect(body).toContain('"code":"invalid_request"');
    expect(terminalEventCount(body)).toBe(1);
    expect(body).not.toContain('"type":"RUN_FINISHED"');
  });

  it("emits RUN_ERROR for malformed JSON payload", async () => {
    const dependencies = createDependencies();

    const response = await handleDraftReplyEndpoint(
      createRequest({
        headers: { "content-type": "application/json" },
        body: "{invalid-json"
      }),
      dependencies
    );
    const body = await response.text();

    expect(body).toContain('"type":"RUN_ERROR"');
    expect(body).toContain('"code":"invalid_request"');
    expect(terminalEventCount(body)).toBe(1);
  });

  it("emits RUN_ERROR when Gmail context fetch fails", async () => {
    const dependencies = createDependencies();
    dependencies.fetchReplyContext = vi.fn(() => Promise.reject(new Error("Gmail unavailable")));

    const response = await handleDraftReplyEndpoint(
      createRequest({
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emailId: "target-email" })
      }),
      dependencies
    );
    const body = await response.text();

    expect(body).toContain('"type":"RUN_ERROR"');
    expect(body).toContain('"code":"context_fetch_failed"');
    expect(body).toContain("Gmail unavailable");
    expect(terminalEventCount(body)).toBe(1);
  });

  it("emits RUN_ERROR when Gmail draft creation fails", async () => {
    const dependencies = createDependencies();
    dependencies.createReplyDraft = vi.fn(() =>
      Promise.reject(new Error("Gmail draft save failed"))
    );

    const response = await handleDraftReplyEndpoint(
      createRequest({
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emailId: "target-email" })
      }),
      dependencies
    );
    const body = await response.text();

    expect(body).toContain('"type":"RUN_ERROR"');
    expect(body).toContain('"code":"draft_save_failed"');
    expect(body).toContain("Gmail draft save failed");
    expect(terminalEventCount(body)).toBe(1);
  });

  it("finishes successfully when context is degraded", async () => {
    const dependencies = createDependencies();

    const targetEmail = createEmailMetadata({
      id: "target-email",
      threadId: "thread-1",
      subject: "Re: Planning",
      from: "manager@example.com",
      to: "you@example.com",
      date: "Sat, 14 Feb 2026 13:00:00 +0000",
      snippet: "Need your update",
      bodyText: "Can you reply with your status update?"
    });

    dependencies.fetchReplyContext = vi.fn(() =>
      Promise.resolve({
        email: targetEmail,
        threadId: "thread-1",
        contextMessages: [targetEmail],
        contextMessageCount: 1,
        contextDegraded: true,
        replyHeaders: {
          inReplyTo: "<target-email@example.com>",
          references: "<ancestor@example.com> <target-email@example.com>"
        }
      })
    );

    const response = await handleDraftReplyEndpoint(
      createRequest({
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emailId: "target-email" })
      }),
      dependencies
    );
    const body = await response.text();

    expect(body).toContain('"type":"RUN_FINISHED"');
    expect(body).toContain('"contextDegraded":true');
    expect(terminalEventCount(body)).toBe(1);
  });

  it("creates drafts without reply headers when target headers are unavailable", async () => {
    const dependencies = createDependencies();
    const targetEmail = createEmailMetadata({
      id: "target-email",
      threadId: "thread-1",
      subject: "Planning",
      from: "manager@example.com",
      to: "you@example.com",
      date: "Sat, 14 Feb 2026 13:00:00 +0000",
      snippet: "Need your update",
      bodyText: "Can you reply with your status update?"
    });

    dependencies.fetchReplyContext = vi.fn(() =>
      Promise.resolve({
        email: targetEmail,
        threadId: "thread-1",
        contextMessages: [targetEmail],
        contextMessageCount: 1,
        contextDegraded: false,
        replyHeaders: {}
      })
    );

    const response = await handleDraftReplyEndpoint(
      createRequest({
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emailId: "target-email" })
      }),
      dependencies
    );

    await response.text();

    const firstDraftCreateCall = vi.mocked(dependencies.createReplyDraft).mock.calls.at(0);

    if (!firstDraftCreateCall) {
      throw new Error("Expected createReplyDraft call");
    }

    const draftInput = firstDraftCreateCall[1] as {
      threadId: string;
      to: string;
      inReplyTo?: string;
      references?: string;
    };

    expect(draftInput.threadId).toBe("thread-1");
    expect(draftInput.to).toBe("manager@example.com");
    expect(draftInput.inReplyTo).toBeUndefined();
    expect(draftInput.references).toBeUndefined();
  });

  it("emits request_aborted when request signal is already aborted", async () => {
    const dependencies = createDependencies();
    const abortController = new AbortController();

    abortController.abort();

    const response = await handleDraftReplyEndpoint(
      createRequest({
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emailId: "target-email" }),
        signal: abortController.signal
      }),
      dependencies
    );
    const body = await response.text();

    expect(body).toContain('"type":"RUN_ERROR"');
    expect(body).toContain('"code":"request_aborted"');
    expect(dependencies.fetchReplyContext).toHaveBeenCalledTimes(0);
    expect(terminalEventCount(body)).toBe(1);
  });

  it("does not call createReplyDraft when request is aborted before draft save", async () => {
    const dependencies = createDependencies();
    const abortController = new AbortController();

    dependencies.extractDraftReply = vi.fn(async () => {
      abortController.abort();

      await Promise.resolve();

      return {
        draftText: "Thanks for the note. I will send the update by tomorrow.",
        subjectSuggestion: "Re: Planning",
        riskFlags: []
      };
    });

    const response = await handleDraftReplyEndpoint(
      createRequest({
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emailId: "target-email" }),
        signal: abortController.signal
      }),
      dependencies
    );
    const body = await response.text();

    expect(body).toContain('"type":"RUN_ERROR"');
    expect(body).toContain('"code":"request_aborted"');
    expect(dependencies.createReplyDraft).toHaveBeenCalledTimes(0);
    expect(dependencies.extractDraftReply).toHaveBeenCalledTimes(1);
    expect(terminalEventCount(body)).toBe(1);
  });

  it("creates exactly one draft for a successful run", async () => {
    const dependencies = createDependencies();

    const response = await handleDraftReplyEndpoint(
      createRequest({
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emailId: "target-email", runId: "run-once" })
      }),
      dependencies
    );
    const body = await response.text();

    expect(body).toContain('"type":"RUN_FINISHED"');
    expect(body).not.toContain('"type":"RUN_ERROR"');
    expect(dependencies.createReplyDraft).toHaveBeenCalledTimes(1);
  });

  it("never emits events after terminal event", async () => {
    const dependencies = createDependencies();
    dependencies.extractDraftReply = vi.fn(() => Promise.reject(new Error("Model failure")));

    const response = await handleDraftReplyEndpoint(
      createRequest({
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emailId: "target-email" })
      }),
      dependencies
    );
    const body = await response.text();

    const runErrorIndex = body.lastIndexOf('"type":"RUN_ERROR"');
    const runFinishedIndex = body.lastIndexOf('"type":"RUN_FINISHED"');
    const terminalIndex = Math.max(runErrorIndex, runFinishedIndex);

    expect(terminalIndex).toBeGreaterThan(-1);
    expect(terminalEventCount(body)).toBe(1);
    expect(body.slice(terminalIndex + 1)).not.toContain('"type":"TEXT_MESSAGE_CONTENT"');
  });
});
