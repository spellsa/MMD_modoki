import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const vite = require("vite");
const ViteConfigGenerator = require("@electron-forge/plugin-vite/dist/ViteConfig").default;
const electronExecutable = require("electron");

const timeoutMs = Number.parseInt(process.env.MMD_MODOKI_SMOKE_PARENT_TIMEOUT_MS ?? "45000", 10) || 45000;
const smokeTempDir = mkdtempSync(join(tmpdir(), "mmd-modoki-smoke-"));
const smokeResultPath = join(smokeTempDir, "result.json");
const childEnv = {
  ...process.env,
  MMD_MODOKI_SMOKE: "1",
  MMD_MODOKI_SMOKE_TIMEOUT_MS: process.env.MMD_MODOKI_SMOKE_TIMEOUT_MS ?? "25000",
  MMD_MODOKI_SMOKE_REQUIRE_WEBGPU: process.env.MMD_MODOKI_SMOKE_REQUIRE_WEBGPU ?? "1",
  MMD_MODOKI_SMOKE_RESULT_PATH: smokeResultPath,
};

// Codex shells may set this for tool execution. Electron smoke must run as an Electron app.
for (const key of Object.keys(childEnv)) {
  if (key.toUpperCase() === "ELECTRON_RUN_AS_NODE") {
    delete childEnv[key];
  }
}

const pluginConfig = {
  build: [
    {
      entry: "src/main.ts",
      config: "vite.main.config.ts",
      target: "main",
    },
    {
      entry: "src/preload.ts",
      config: "vite.preload.config.ts",
      target: "preload",
    },
  ],
  renderer: [
    {
      name: "main_window",
      config: "vite.renderer.config.ts",
    },
  ],
};

let child = null;
let childExit = null;
let finished = false;
let resultPollId = null;
let timeoutId = null;
let devServers = [];

const closeDevServers = async () => {
  await Promise.all(devServers.map((server) => server.close().catch(() => undefined)));
  devServers = [];
};

const cleanupTempDir = () => {
  try {
    rmSync(smokeTempDir, { recursive: true, force: true });
  } catch {
    // Best effort cleanup only.
  }
};

const printSmokeResult = () => {
  try {
    const result = JSON.parse(readFileSync(smokeResultPath, "utf8"));
    const engine = result?.data?.engine ?? "unknown";
    const physicsBackend = result?.data?.physicsBackend ?? "unknown";
    const status = result?.success ? "pass" : "fail";
    console.log(`[smoke] ${status}: ${result?.reason ?? "unknown result"} (engine=${engine}, physics=${physicsBackend})`);
    return result;
  } catch {
    console.warn("[smoke] result file was not written");
    return null;
  } finally {
    cleanupTempDir();
  }
};

const killChildTree = () => {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "inherit" });
    return;
  }
  child.kill("SIGTERM");
};

const stopTimers = () => {
  if (timeoutId) clearTimeout(timeoutId);
  if (resultPollId) clearInterval(resultPollId);
};

const exitAfterCleanup = async (exitCode) => {
  await closeDevServers();
  process.exit(exitCode);
};

const completeFromResult = () => {
  if (finished) return;
  finished = true;
  stopTimers();
  const result = printSmokeResult();
  if (!result?.success && !childExit) {
    killChildTree();
  }
  void exitAfterCleanup(result?.success ? 0 : 1);
};

const prepareViteDevBuild = async () => {
  const generator = new ViteConfigGenerator(pluginConfig, process.cwd(), false);
  const rendererConfigs = await generator.getRendererConfig();

  for (const config of rendererConfigs) {
    const server = await vite.createServer({
      configFile: false,
      ...config,
    });
    await server.listen();
    devServers.push(server);
  }

  const buildConfigs = await generator.getBuildConfigs();
  for (const config of buildConfigs) {
    await vite.build({
      ...config,
      build: {
        ...config.build,
        watch: null,
      },
    });
  }
};

const main = async () => {
  try {
    console.log("[smoke] preparing Vite dev server and Electron bundles");
    await prepareViteDevBuild();
    console.log("[smoke] launching Electron");

    child = spawn(electronExecutable, ["."], {
      stdio: "inherit",
      shell: false,
      env: childEnv,
      cwd: process.cwd(),
    });

    timeoutId = setTimeout(() => {
      if (finished) return;
      finished = true;
      stopTimers();
      console.error(`[smoke] timeout after ${timeoutMs}ms`);
      killChildTree();
      printSmokeResult();
      void exitAfterCleanup(1);
    }, timeoutMs);

    resultPollId = setInterval(() => {
      if (existsSync(smokeResultPath)) {
        completeFromResult();
      }
    }, 250);

    child.on("error", (err) => {
      if (finished) return;
      finished = true;
      stopTimers();
      console.error("[smoke] failed to start Electron:", err);
      printSmokeResult();
      void exitAfterCleanup(1);
    });

    child.on("exit", (code, signal) => {
      if (finished) return;
      childExit = { code, signal };
      if (existsSync(smokeResultPath)) {
        completeFromResult();
        return;
      }
      if (signal || (code !== null && code !== 0)) {
        finished = true;
        stopTimers();
        printSmokeResult();
      }
      if (signal) {
        console.error(`[smoke] process exited by signal ${signal}`);
        void exitAfterCleanup(1);
        return;
      }
      if (code !== null && code !== 0) {
        void exitAfterCleanup(code);
      }
    });
  } catch (err) {
    finished = true;
    stopTimers();
    console.error("[smoke] failed to prepare smoke launch:", err);
    cleanupTempDir();
    await closeDevServers();
    process.exit(1);
  }
};

void main();
