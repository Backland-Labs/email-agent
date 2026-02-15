# Logging Event Catalog

This catalog defines the structured events emitted by backend boundaries.

## Global Conventions

- All events include `event`.
- Boundary events should include `requestId`.
- Agent run events should include `runId` and `threadId`.
- Error and warning events should include a `code` classification.
- Error objects must use the `err` field.

## Event Definitions

| Event                      | Level   | Required Fields                                                                                                                  | Notes                                                   |
| -------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `agent.run_started`        | `info`  | `event`, `requestId`, `runId`, `threadId`                                                                                        | Start of `/agent` lifecycle.                            |
| `agent.run_completed`      | `info`  | `event`, `requestId`, `runId`, `threadId`, `durationMs`, `unreadCount`, `generatedInsightCount`, `failedInsightCount`, `aborted` | Canonical completion event for `/agent`.                |
| `agent.run_failed`         | `error` | `event`, `requestId`, `runId`, `threadId`, `durationMs`, `code`, `err`                                                           | Failure in the `/agent` lifecycle.                      |
| `agent.request_rejected`   | `warn`  | `event`, `requestId`, `method`, `reason`, `code`                                                                                 | Invalid `RunAgentInput` payload.                        |
| `agent.input_parse_failed` | `warn`  | `event`, `requestId`, `code`, `err`                                                                                              | JSON/body parsing failure before validation.            |
| `agent.insights_failed`    | `warn`  | `event`, `requestId`, `runId`, `threadId`, `code`, `failedInsightCount`, `err`                                                   | One or more per-email extraction failures were skipped. |
| `gmail.fetch_started`      | `info`  | `event`, `requestId`, `runId`, `threadId`, `maxResults`, `concurrency`                                                           | Start of unread Gmail fetch boundary call.              |
| `gmail.fetch_completed`    | `info`  | `event`, `requestId`, `runId`, `threadId`, `durationMs`, `unreadCount`                                                           | Completion of unread Gmail fetch boundary call.         |
| `gmail.fetch_failed`       | `error` | `event`, `requestId`, `runId`, `threadId`, `durationMs`, `maxResults`, `concurrency`, `code`, `err`                              | Gmail fetch boundary failure.                           |

## Error Code Taxonomy

| Code                     | Meaning                                                          |
| ------------------------ | ---------------------------------------------------------------- |
| `invalid_input`          | Request payload is structurally invalid for `RunAgentInput`.     |
| `input_parse_failed`     | Request body could not be parsed (for example malformed JSON).   |
| `insight_extract_failed` | A per-email insight extraction failure occurred and was skipped. |
| `run_failed`             | The `/agent` run failed and returned `RUN_ERROR`.                |
| `gmail_fetch_failed`     | Gmail unread list/get call failed.                               |

## No-Log Zones

Do not log user content or sensitive data:

- Email subject, body, snippet, and message content.
- OAuth tokens, API keys, passwords, secrets.
- Secret-bearing headers such as `authorization` and `cookie`.
