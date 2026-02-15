# Logging Event Catalog

This catalog defines the structured events emitted by backend boundaries.

## Global Conventions

- All events include `event`.
- Boundary events should include `requestId`.
- Agent run events should include `runId` and `threadId`.
- Error and warning events should include a `code` classification.
- Error objects must use the `err` field.

## Event Definitions

| Event                          | Level   | Required Fields                                                                                                                  | Notes                                                             |
| ------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `agent.run_started`            | `info`  | `event`, `requestId`, `runId`, `threadId`                                                                                        | Start of `/agent` lifecycle.                                      |
| `agent.run_completed`          | `info`  | `event`, `requestId`, `runId`, `threadId`, `durationMs`, `unreadCount`, `generatedInsightCount`, `failedInsightCount`, `aborted` | Canonical completion event for `/agent`.                          |
| `agent.run_failed`             | `error` | `event`, `requestId`, `runId`, `threadId`, `durationMs`, `code`, `err`                                                           | Failure in the `/agent` lifecycle.                                |
| `agent.insights_failed`        | `warn`  | `event`, `requestId`, `runId`, `threadId`, `code`, `failedInsightCount`, `err`                                                   | One or more per-email extraction failures were skipped.           |
| `draft_reply.run_started`      | `info`  | `event`, `requestId`, `runId`, `threadId`                                                                                        | Start of `/draft-reply` lifecycle.                                |
| `draft_reply.context_degraded` | `warn`  | `event`, `requestId`, `runId`, `threadId`, `code`, `contextMessageCount`                                                         | Thread context was unavailable; proceeded with target email only. |
| `draft_reply.run_completed`    | `info`  | `event`, `requestId`, `runId`, `threadId`, `durationMs`, `contextMessageCount`, `contextDegraded`, `riskFlags`                   | Canonical completion event for `/draft-reply`.                    |
| `draft_reply.run_failed`       | `error` | `event`, `requestId`, `runId`, `threadId`, `durationMs`, `code`, `err`                                                           | Failure in the `/draft-reply` lifecycle.                          |
| `gmail.fetch_started`          | `info`  | `event`, `requestId`, `runId`, `threadId`, `maxResults`, `concurrency`                                                           | Start of unread Gmail fetch boundary call.                        |
| `gmail.fetch_completed`        | `info`  | `event`, `requestId`, `runId`, `threadId`, `durationMs`, `unreadCount`                                                           | Completion of unread Gmail fetch boundary call.                   |
| `gmail.fetch_failed`           | `error` | `event`, `requestId`, `runId`, `threadId`, `durationMs`, `maxResults`, `concurrency`, `code`, `err`                              | Gmail fetch boundary failure.                                     |

## Error Code Taxonomy

| Code                      | Meaning                                                                    |
| ------------------------- | -------------------------------------------------------------------------- |
| `insight_extract_failed`  | A per-email insight extraction failure occurred and was skipped.           |
| `run_failed`              | The `/agent` run failed and returned `RUN_ERROR`.                          |
| `gmail_fetch_failed`      | Gmail unread list/get call failed.                                         |
| `invalid_request`         | Incoming `/draft-reply` payload failed schema or JSON parsing.             |
| `context_fetch_failed`    | `/draft-reply` failed while fetching target email or thread context.       |
| `draft_generation_failed` | `/draft-reply` failed while generating structured draft output.            |
| `request_aborted`         | The client aborted an active `/draft-reply` request.                       |
| `context_degraded`        | Thread context was unavailable; drafting continued with target email only. |
| `draft_reply_run_failed`  | Unexpected unclassified failure in `/draft-reply`.                         |

## No-Log Zones

Do not log user content or sensitive data:

- Email subject, body, snippet, and message content.
- OAuth tokens, API keys, passwords, secrets.
- Secret-bearing headers such as `authorization` and `cookie`.
- Prompt text and completion text.
