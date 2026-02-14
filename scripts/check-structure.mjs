import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve("src");
const bannedNames = new Set(["utils", "helpers", "common", "misc"]);
const maxLines = 300;
const problems = [];

if (!existsSync(root)) {
  console.error("Expected a src directory for structure checks.");
  process.exit(1);
}

walk(root);

if (problems.length > 0) {
  console.error("Structure check failed:");

  for (const problem of problems) {
    console.error(`- ${problem}`);
  }

  process.exit(1);
}

console.log("Structure check passed.");

function walk(currentDir) {
  const entries = readdirSync(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      const directoryName = entry.name.toLowerCase();

      if (bannedNames.has(directoryName)) {
        problems.push(`${entryPath}: rename generic directory name`);
      }

      walk(entryPath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const stem = path.basename(entry.name, path.extname(entry.name)).toLowerCase();

    if (bannedNames.has(stem)) {
      problems.push(`${entryPath}: rename generic file name`);
    }

    const lineCount = getLineCount(entryPath);

    if (lineCount > maxLines) {
      problems.push(`${entryPath}: ${lineCount} lines (max ${maxLines})`);
    }
  }
}

function getLineCount(filePath) {
  const stats = statSync(filePath);

  if (stats.size === 0) {
    return 0;
  }

  const content = readFileSync(filePath, "utf8");
  return content.split(/\r?\n/).length;
}
