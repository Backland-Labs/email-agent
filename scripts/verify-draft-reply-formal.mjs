import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";

const projectRoot = process.cwd();
const specDirectory = path.join(projectRoot, "formal", "draft-reply-abort-safety");
const specFile = "DraftReplyAbortSafety.tla";
const goodConfig = "DraftReplyAbortSafety.cfg";
const mutationConfig = "DraftReplyAbortSafetyMutation.cfg";

const jarPath =
  process.env.TLA2TOOLS_JAR ?? path.join(os.homedir(), ".cache", "email-agent", "tla2tools.jar");
const jarUrl =
  process.env.TLA2TOOLS_URL ??
  "https://github.com/tlaplus/tlaplus/releases/latest/download/tla2tools.jar";
const javaBin = resolveJavaBin();

if (!javaBin) {
  console.error("Java runtime is required for formal verification (TLC).");
  process.exit(1);
}

await ensureTlaJar();

const verifiedRun = runTlc(goodConfig);

if (verifiedRun.status !== 0) {
  process.stderr.write(verifiedRun.output);
  process.exit(1);
}

process.stdout.write(verifiedRun.output);

const mutationRun = runTlc(mutationConfig);
const mutationTraceMarkers = ["InvStrictAbortSafe", "State 1"];

if (mutationRun.status === 0) {
  process.stderr.write(mutationRun.output);
  console.error("Expected mutation model to violate InvStrictAbortSafe.");
  process.exit(1);
}

if (!mutationTraceMarkers.every((marker) => mutationRun.output.includes(marker))) {
  process.stderr.write(mutationRun.output);
  console.error("Mutation model did not emit the expected counterexample trace.");
  process.exit(1);
}

process.stdout.write(mutationRun.output);
console.log("Formal draft-reply checks passed, including mutation counterexample.");

async function ensureTlaJar() {
  if (existsSync(jarPath)) {
    return;
  }

  await mkdir(path.dirname(jarPath), { recursive: true });

  const response = await fetch(jarUrl);

  if (!response.ok) {
    throw new Error(`Failed to download tla2tools.jar from ${jarUrl}`);
  }

  const body = await response.arrayBuffer();
  await writeFile(jarPath, new Uint8Array(body));
}

function runTlc(configFile) {
  const result = spawnSync(
    javaBin,
    ["-cp", jarPath, "tlc2.TLC", "-cleanup", "-workers", "1", "-config", configFile, specFile],
    {
      cwd: specDirectory,
      encoding: "utf8"
    }
  );

  return {
    status: result.status ?? 1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`
  };
}

function resolveJavaBin() {
  const envCandidate = process.env.JAVA_BIN;

  if (envCandidate && canRunJava(envCandidate)) {
    return envCandidate;
  }

  if (canRunJava("java")) {
    return "java";
  }

  const brewCandidates = [
    "/opt/homebrew/opt/openjdk@21/bin/java",
    "/usr/local/opt/openjdk@21/bin/java"
  ];

  for (const candidate of brewCandidates) {
    if (existsSync(candidate) && canRunJava(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function canRunJava(binaryPath) {
  const result = spawnSync(binaryPath, ["-version"], { encoding: "utf8" });
  return result.status === 0;
}
