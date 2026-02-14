#!/usr/bin/env bun

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

interface GitHubComment {
  id: number;
  body: string | null;
}

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
  };
  messages?: OpencodeMessage[];
}

const THREAD_MARKER = "<!-- opencode-session-thread -->";

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

  const openPullRequests = await githubRequest<GitHubPullRequest[]>(
    token,
    "GET",
    `/repos/${owner}/${repo}/pulls?state=open&per_page=100`
  );

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

    const expectsValue = ["--pr", "-p", "--repo", "-r", "--session", "-s"].includes(arg);
    if (expectsValue) {
      i += 1;
    }
  }

  return positional;
}

function runCommand(command: string): string {
  return execSync(command, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
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

function escapeMarkdownFences(value: string): string {
  return value.split("```").join("``\u200b`");
}

function getThreadMessage(session: OpencodeSession, prNumber: number, repository: string): string {
  const title = session.info?.id ? `Session: \`${session.info.id}\`` : "OpenCode session";
  const lines = [
    THREAD_MARKER,
    "## OpenCode Session Thread",
    "",
    `- Title: ${title}`,
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

async function githubRequest<T>(
  token: string,
  method: "GET" | "POST" | "PATCH",
  url: string,
  body?: string
): Promise<T> {
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

  return response.json() as Promise<T>;
}

async function upsertComment(params: {
  owner: string;
  repo: string;
  prNumber: number;
  token: string;
  body: string;
}): Promise<void> {
  const { owner, repo, prNumber, token, body } = params;
  const commentBase = `/repos/${owner}/${repo}/issues/${prNumber}/comments`;
  const existing = (
    await githubRequest<GitHubComment[]>(token, "GET", `${commentBase}?per_page=100`)
  ).find((comment) => comment.body?.includes(THREAD_MARKER));

  if (existing) {
    await githubRequest(
      token,
      "PATCH",
      `/repos/${owner}/${repo}/issues/comments/${existing.id}`,
      JSON.stringify({ body })
    );
    console.log(`Updated existing opencode thread comment: ${existing.id}`);
    return;
  }

  const created = await githubRequest<{ id: number }>(
    token,
    "POST",
    commentBase,
    JSON.stringify({ body })
  );
  console.log(`Created opencode thread comment: ${created.id}`);
}

async function main() {
  const prArg = parseArgValue("--pr", "-p");
  const repoArg = parseArgValue("--repo", "-r");
  const sessionArg = parseArgValue("--session", "-s");
  const [positionalPr, positionalSession] = collectPositionalArgs();

  const resolvedPrArg = prArg ?? positionalPr;
  const resolvedSessionArg = sessionArg ?? positionalSession;

  const { owner, repo } = parseRepository(repoArg);
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!token) {
    throw new Error("Missing GitHub token. Set GH_TOKEN or GITHUB_TOKEN.");
  }

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
  const comment = getThreadMessage(session, prNumber, `${owner}/${repo}`);

  await upsertComment({
    owner,
    repo,
    prNumber,
    token,
    body: comment
  });
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error("Unknown error", error);
  }

  process.exit(1);
});
