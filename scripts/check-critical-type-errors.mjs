import { spawnSync } from "node:child_process";

const command = process.platform === "win32" ? "cmd.exe" : "npm";
const args = process.platform === "win32"
  ? ["/d", "/s", "/c", "npm.cmd run typecheck"]
  : ["run", "typecheck"];

const result = spawnSync(command, args, {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

const stdout = result.stdout ?? "";
const stderr = result.stderr ?? "";
if (stdout) process.stdout.write(stdout);
if (stderr) process.stderr.write(stderr);

if (result.error) {
  console.error(`Failed to run typecheck: ${result.error.message}`);
  process.exit(1);
}

const combined = `${stdout}\n${stderr}`;
const criticalMatches = combined.match(/error TS(?:2304|2552):[^\n]*/g) ?? [];

if (criticalMatches.length > 0) {
  console.error(`Critical typecheck errors found (${criticalMatches.length}):`);
  for (const line of criticalMatches) {
    console.error(line);
  }
  process.exit(1);
}

if (result.status === 0) {
  console.log("Typecheck passed with no errors.");
} else {
  console.log("No critical TS2304/TS2552 errors found; non-critical typecheck errors remain.");
}
