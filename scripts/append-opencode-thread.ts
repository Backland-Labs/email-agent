#!/usr/bin/env bun

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

interface GitHubComment {
  id: number;
  body: string | null;
}

type ThreadExportFormat = "text" | "json";

interface GitHubPullRequest {
  number: number;
  state: string;
  head: {
    ref: string;
  };
}

interface OpencodePart {
  type: string;
  text?: string;
}

interface OpencodeMessage {
  info?: {
    role?: string;
    time?: {
      created?: number;
    };
  };
  parts?: OpencodePart[];
}

interface OpencodeSession {
  info?: {
    id?: string;
    title?: string;
  };
  messages?: OpencodeMessage[];
}

const THREAD_MARKER = "<!-- opencode-session-thread -->";
const JSON_FORMAT_MARKER = "<!-- opencode-session-format:json -->";
const MAX_COMMENT_BYTES = 60_000;
const JSON_CHUNK_BYTES = 40_000;

function parseArgValue(long: string, short: string): string | undefined {
  const args = process.argv.slice(2);

  const index = args.indexOf(long);
  if (index >= 0 && index + 1 < args.length) {
    return args[index + 1];
  }

  const shortIndex = args.indexOf(short);
  if (shortIndex >= 0 && shortIndex + 1 < args.length) {
    return args[shortIndex + 1];
  }

  return undefined;
}

function parseFlagValue(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

function parseRepository(repoArg?: string): { owner: string; repo: string } {
  const repo = repoArg ?? process.env.GITHUB_REPOSITORY;

  if (!repo) {
    throw new Error("Missing repository. Provide --repo owner/name or set GITHUB_REPOSITORY.");
  }

  const [owner, repoName] = repo.split("/");
  if (!owner || !repoName) {
    throw new Error("Repository must be in owner/name format.");
  }

  return { owner, repo: repoName };
}

function resolveGitHubToken(): string {
  const envToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (envToken) {
    return envToken;
  }

  try {
    const ghToken = runCommand("gh auth token").trim();
    if (ghToken) {
      return ghToken;
    }
  } catch {
    // Fall back to explicit error below.
  }

  throw new Error("Missing GitHub token. Set GH_TOKEN/GITHUB_TOKEN or run `gh auth login`.");
}

function parsePullRequestFromEventPath(): number | undefined {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    return undefined;
  }

  try {
    const event = JSON.parse(readFileSync(eventPath, "utf8"));
    const number = event?.pull_request?.number;

    if (typeof number === "number" && Number.isInteger(number) && number > 0) {
      return number;
    }
  } catch {
    // Ignore parse/read errors and continue with alternate detection.
  }

  return undefined;
}

function parsePullRequestFromRef(): number | undefined {
  const ref = process.env.GITHUB_REF;
  const match = ref?.match(/^refs\/pull\/(\d+)\//);

  if (!match) {
    return undefined;
  }

  const number = Number(match[1]);
  if (Number.isInteger(number) && number > 0) {
    return number;
  }

  return undefined;
}

async function detectPullRequestNumber(
  owner: string,
  repo: string,
  token: string
): Promise<number | undefined> {
  const fromEventPath = parsePullRequestFromEventPath();
  if (fromEventPath) {
    return fromEventPath;
  }

  const fromRef = parsePullRequestFromRef();
  if (fromRef) {
    return fromRef;
  }

  const headRef = process.env.GITHUB_HEAD_REF;
  if (!headRef) {
    return undefined;
  }

  const openPullRequests =
    (await githubRequest<GitHubPullRequest[]>(
      token,
      "GET",
      `/repos/${owner}/${repo}/pulls?state=open&per_page=100`
    )) ?? [];

  return openPullRequests.find((pr) => pr.state === "open" && pr.head.ref === headRef)?.number;
}

function collectPositionalArgs(): string[] {
  const args = process.argv.slice(2);
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (typeof arg !== "string") {
      continue;
    }

    if (!arg.startsWith("-")) {
      positional.push(arg);
      continue;
    }

    const expectsValue = [
      "--pr",
      "-p",
      "--repo",
      "-r",
      "--session",
      "-s",
      "--format",
      "-f"
    ].includes(arg);
    if (expectsValue) {
      i += 1;
    }
  }

  return positional;
}

function runCommand(command: string): string {
  return execSync(command, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024
  }) as string;
}

function parseJsonFromPrefixedOutput(output: string): unknown {
  const start = output.search(/[\[{]/);
  if (start === -1) {
    throw new Error("Expected JSON output from command, but none was found.");
  }

  return JSON.parse(output.slice(start));
}

function findLatestSessionId(payload: unknown): string | undefined {
  if (Array.isArray(payload)) {
    const first = payload.at(0);
    if (first && typeof first === "object") {
      const session = first as { id?: string };
      return session.id;
    }

    return undefined;
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;

    if ("sessions" in record) {
      const sessions = record.sessions;
      if (Array.isArray(sessions)) {
        const first = sessions.at(0);
        if (first && typeof first === "object" && "id" in first) {
          const id = first.id;
          if (typeof id === "string") {
            return id;
          }
        }
      }
    }

    if ("id" in record && typeof record.id === "string") {
      return record.id;
    }
  }

  return undefined;
}

function getLatestSessionId(): string {
  const output = runCommand("opencode session list --max-count 1 --format json");
  const parsed = parseJsonFromPrefixedOutput(output);
  const sessionId = findLatestSessionId(parsed);
  if (!sessionId) {
    throw new Error("No Opencode sessions found. Run this command from an Opencode session.");
  }

  return sessionId;
}

function parseExportFormat(
  formatArg: string | undefined,
  jsonFlagEnabled: boolean
): ThreadExportFormat {
  if (jsonFlagEnabled && !formatArg) {
    return "json";
  }

  if (!formatArg) {
    return "text";
  }

  const normalized = formatArg.toLowerCase();
  if (normalized !== "text" && normalized !== "json") {
    throw new Error("Invalid format. Use --format text or --format json.");
  }

  if (jsonFlagEnabled && normalized === "text") {
    throw new Error("Conflicting format options. Use --json with --format json, or remove --json.");
  }

  return normalized;
}

function escapeMarkdownFences(value: string): string {
  return value.split("```").join("``\u200b`");
}

function getSessionTitle(session: OpencodeSession): string {
  return session.info?.title ?? session.info?.id ?? "OpenCode session";
}

function getThreadMessage(session: OpencodeSession, prNumber: number, repository: string): string {
  const sessionLabel = `\`${getSessionTitle(session)}\``;
  const lines = [
    THREAD_MARKER,
    "## OpenCode Session Thread",
    "",
    `- Session: ${sessionLabel}`,
    `- Pull request: #${prNumber}`,
    `- Repository: ${repository}`,
    ""
  ];

  const messages = session.messages ?? [];

  for (const message of messages) {
    const text = message.parts
      ?.filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n");
    if (!text?.trim()) {
      continue;
    }

    const role = message.info?.role === "assistant" ? "Assistant" : "User";
    const created = message.info?.time?.created
      ? new Date(message.info.time.created).toISOString()
      : "unknown time";

    lines.push(`### ${role} • ${created}`);
    lines.push("```text");
    lines.push(escapeMarkdownFences(text.trim()));
    lines.push("```", "");
  }

  if (lines.length === 9) {
    lines.push("No text messages were found in this session.");
  }

  return `${lines.join("\n")}\n`;
}

function splitStringByMaxBytes(value: string, maxBytes: number): string[] {
  if (maxBytes <= 0) {
    throw new Error("maxBytes must be a positive integer.");
  }

  if (value.length === 0) {
    return [""];
  }

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    let low = 1;
    let high = value.length - cursor;
    let best = 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = value.slice(cursor, cursor + mid);
      const candidateBytes = Buffer.byteLength(candidate, "utf8");

      if (candidateBytes <= maxBytes) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    chunks.push(value.slice(cursor, cursor + best));
    cursor += best;
  }

  return chunks;
}

function getCommentPartNumber(commentBody: string | null): number {
  if (!commentBody) {
    return Number.MAX_SAFE_INTEGER;
  }

  const match = commentBody.match(/<!-- opencode-session-part:(\d+)\/(\d+) -->/);
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  const part = Number(match[1]);
  if (!Number.isInteger(part) || part <= 0) {
    return Number.MAX_SAFE_INTEGER;
  }

  return part;
}

function createJsonCommentBody(params: {
  chunk: string;
  chunkIndex: number;
  chunkCount: number;
  session: OpencodeSession;
  prNumber: number;
  repository: string;
}): string {
  const { chunk, chunkIndex, chunkCount, session, prNumber, repository } = params;
  const part = chunkIndex + 1;
  const partSuffix = chunkCount > 1 ? ` • Part ${part}/${chunkCount}` : "";

  const lines = [
    THREAD_MARKER,
    JSON_FORMAT_MARKER,
    `<!-- opencode-session-part:${part}/${chunkCount} -->`,
    `## OpenCode Session Export (JSON)${partSuffix}`,
    "",
    `- Session: \`${getSessionTitle(session)}\``,
    `- Pull request: #${prNumber}`,
    `- Repository: ${repository}`,
    "",
    "````json",
    chunk,
    "````",
    ""
  ];

  return lines.join("\n");
}

function getJsonThreadMessages(
  session: OpencodeSession,
  prNumber: number,
  repository: string
): string[] {
  const sessionJson = JSON.stringify(session, null, 2);
  const jsonChunks = splitStringByMaxBytes(sessionJson, JSON_CHUNK_BYTES);

  return jsonChunks.map((chunk, chunkIndex) =>
    createJsonCommentBody({
      chunk,
      chunkIndex,
      chunkCount: jsonChunks.length,
      session,
      prNumber,
      repository
    })
  );
}

function getCommentMessages(params: {
  session: OpencodeSession;
  prNumber: number;
  repository: string;
  format: ThreadExportFormat;
}): string[] {
  const { session, prNumber, repository, format } = params;

  if (format === "json") {
    return getJsonThreadMessages(session, prNumber, repository);
  }

  return [getThreadMessage(session, prNumber, repository)];
}

function validateCommentBodySize(commentBody: string): void {
  const bytes = Buffer.byteLength(commentBody, "utf8");

  if (bytes > MAX_COMMENT_BYTES) {
    throw new Error(
      `Generated comment is too large (${bytes} bytes). Max supported by this script: ${MAX_COMMENT_BYTES}.`
    );
  }
}

async function githubRequest<T>(
  token: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  body?: string
): Promise<T | undefined> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "opencode-thread-appender"
  };

  const options: RequestInit = {
    method,
    headers
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    options.body = body;
  }

  const response = await fetch(`https://api.github.com${url}`, options);

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`GitHub API request failed (${response.status}): ${details}`);
  }

  if (response.status === 204 || response.status === 205) {
    return undefined;
  }

  const responseBody = await response.text();
  if (!responseBody.trim()) {
    return undefined;
  }

  return JSON.parse(responseBody) as T;
}

async function upsertComments(params: {
  owner: string;
  repo: string;
  prNumber: number;
  token: string;
  bodies: string[];
}): Promise<void> {
  const { owner, repo, prNumber, token, bodies } = params;
  const commentBase = `/repos/${owner}/${repo}/issues/${prNumber}/comments`;

  for (const body of bodies) {
    validateCommentBodySize(body);
  }

  const existingThreadComments = (
    (await githubRequest<GitHubComment[]>(token, "GET", `${commentBase}?per_page=100`)) ?? []
  )
    .filter((comment) => comment.body?.includes(THREAD_MARKER))
    .sort((left, right) => {
      const leftPart = getCommentPartNumber(left.body);
      const rightPart = getCommentPartNumber(right.body);

      if (leftPart !== rightPart) {
        return leftPart - rightPart;
      }

      return left.id - right.id;
    });

  for (let index = 0; index < bodies.length; index++) {
    const body = bodies[index];
    const existing = existingThreadComments[index];

    if (existing) {
      await githubRequest(
        token,
        "PATCH",
        `/repos/${owner}/${repo}/issues/comments/${existing.id}`,
        JSON.stringify({ body })
      );
      console.log(`Updated opencode thread comment ${index + 1}/${bodies.length}: ${existing.id}`);
      continue;
    }

    const created = await githubRequest<{ id: number }>(
      token,
      "POST",
      commentBase,
      JSON.stringify({ body })
    );

    if (!created) {
      throw new Error("GitHub API did not return a created comment id.");
    }

    console.log(`Created opencode thread comment ${index + 1}/${bodies.length}: ${created.id}`);
  }

  for (let index = bodies.length; index < existingThreadComments.length; index++) {
    const staleComment = existingThreadComments[index];
    if (!staleComment) {
      continue;
    }

    await githubRequest(
      token,
      "DELETE",
      `/repos/${owner}/${repo}/issues/comments/${staleComment.id}`
    );
    console.log(`Deleted stale opencode thread comment: ${staleComment.id}`);
  }
}

async function main() {
  const prArg = parseArgValue("--pr", "-p");
  const repoArg = parseArgValue("--repo", "-r");
  const sessionArg = parseArgValue("--session", "-s");
  const formatArg = parseArgValue("--format", "-f");
  const jsonFlag = parseFlagValue("--json");
  const [positionalPr, positionalSession] = collectPositionalArgs();

  const resolvedPrArg = prArg ?? positionalPr;
  const resolvedSessionArg = sessionArg ?? positionalSession;
  const format = parseExportFormat(formatArg ?? process.env.OPENCODE_THREAD_FORMAT, jsonFlag);

  const { owner, repo } = parseRepository(repoArg);
  const token = resolveGitHubToken();

  let prNumber: number;

  if (resolvedPrArg) {
    prNumber = Number(resolvedPrArg);
    if (!Number.isInteger(prNumber) || prNumber <= 0) {
      throw new Error("Invalid PR number. Use a positive integer.");
    }
  } else {
    const detectedPrNumber = await detectPullRequestNumber(owner, repo, token);
    if (!detectedPrNumber) {
      throw new Error(
        "Missing PR number. Run with --pr, pass the PR number as the first argument, or run in a pull_request GitHub Action context."
      );
    }

    prNumber = detectedPrNumber;
  }

  const sessionId = resolvedSessionArg || process.env.OPENCODE_SESSION_ID || getLatestSessionId();
  const output = runCommand(`opencode export ${sessionId}`);
  const session = parseJsonFromPrefixedOutput(output) as OpencodeSession;
  const comments = getCommentMessages({
    session,
    prNumber,
    repository: `${owner}/${repo}`,
    format
  });

  await upsertComments({
    owner,
    repo,
    prNumber,
    token,
    bodies: comments
  });
}

export {
  getCommentMessages,
  getCommentPartNumber,
  getJsonThreadMessages,
  parseExportFormat,
  splitStringByMaxBytes
};

if (import.meta.main) {
  main().catch((error) => {
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error("Unknown error", error);
    }

    process.exit(1);
  });
}
