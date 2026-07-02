import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const APP_NAME = "MMD_modoki";

function parseArgs(argv) {
  const options = {
    lines: 120,
    level: null,
    scope: null,
    session: null,
    latestSession: false,
    file: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const readValue = () => argv[++i] ?? "";
    if (arg === "--lines" || arg === "-n") options.lines = Math.max(1, Number.parseInt(readValue(), 10) || options.lines);
    else if (arg === "--level") options.level = readValue();
    else if (arg === "--scope") options.scope = readValue();
    else if (arg === "--session") options.session = readValue();
    else if (arg === "--latest-session") options.latestSession = true;
    else if (arg === "--file") options.file = readValue();
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/show-app-log.mjs [options]

Options:
  --lines, -n <count>    Number of matching lines to print. Default: 120
  --level <list>         Comma-separated level keywords. Example: warn,error
  --scope <text>         Filter by scope text such as asset, physics, render
  --session <id>         Filter by app log session id
  --latest-session       Show only the latest session found in the log
  --file <path>          Read a specific log file
`);
}

function getDefaultLogCandidates() {
  const candidates = [];
  if (process.env.APPDATA) {
    candidates.push(path.join(process.env.APPDATA, APP_NAME, "logs", "dev", "main-dev.log"));
    candidates.push(path.join(process.env.APPDATA, APP_NAME, "logs", "main.log"));
  }
  candidates.push(path.join(os.homedir(), "AppData", "Roaming", APP_NAME, "logs", "dev", "main-dev.log"));
  candidates.push(path.join(os.homedir(), "AppData", "Roaming", APP_NAME, "logs", "main.log"));
  candidates.push(path.join(os.homedir(), "Library", "Logs", APP_NAME, "dev", "main-dev.log"));
  candidates.push(path.join(os.homedir(), "Library", "Logs", APP_NAME, "main.log"));
  candidates.push(path.join(os.homedir(), ".config", APP_NAME, "logs", "dev", "main-dev.log"));
  candidates.push(path.join(os.homedir(), ".config", APP_NAME, "logs", "main.log"));
  return Array.from(new Set(candidates));
}

function resolveLogFile(explicitFile) {
  if (explicitFile) {
    const resolved = path.resolve(explicitFile);
    if (fs.existsSync(resolved)) return resolved;
    throw new Error(`Log file not found: ${resolved}`);
  }

  const existing = getDefaultLogCandidates()
    .filter((candidate) => fs.existsSync(candidate))
    .map((candidate) => ({ path: candidate, mtimeMs: fs.statSync(candidate).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (existing.length > 0) return existing[0].path;
  throw new Error(`No ${APP_NAME} electron-log file found in the default locations.`);
}

function readRecords(filePath) {
  const text = fs.readFileSync(filePath, "utf-8");
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  const records = [];
  let current = [];
  for (const line of lines) {
    if (/^\[\d{4}-\d{2}-\d{2} /.test(line) && current.length > 0) {
      records.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) records.push(current.join("\n"));
  return records;
}

function findLatestSession(records) {
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const match = records[i].match(/sessionId:\s*'([^']+)'/);
    if (match) return match[1];
  }
  return null;
}

function createMatcher(options) {
  const levels = options.level
    ? options.level.split(",").map((level) => level.trim().toLowerCase()).filter(Boolean)
    : null;
  const scope = options.scope?.toLowerCase() ?? null;
  const session = options.session ?? null;

  return (record) => {
    const lower = record.toLowerCase();
    if (levels && !levels.some((level) => lower.includes(`[${level}]`))) return false;
    if (scope && !lower.includes(`(${scope})`)) return false;
    if (session && !record.includes(session)) return false;
    return true;
  };
}

const options = parseArgs(process.argv.slice(2));
const logFilePath = resolveLogFile(options.file);
const records = readRecords(logFilePath);
if (options.latestSession && !options.session) {
  options.session = findLatestSession(records);
}
const matches = records.filter(createMatcher(options));
const lines = matches.join("\n").split(/\r?\n/).filter((line) => line.length > 0).slice(-options.lines);

console.log(`[log] ${logFilePath}`);
if (options.session) {
  console.log(`[log] session ${options.session}`);
}
if (lines.length === 0) {
  console.log("[log] no matching lines");
} else {
  console.log(lines.join("\n"));
}
