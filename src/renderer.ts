/**
 * MMD modoki - Renderer Entry Point
 * Initializes Babylon.js, babylon-mmd, and all UI components.
 */

import "@babylonjs/loaders/glTF";
import { WebRequest } from "@babylonjs/core/Misc/webRequest";
import "./index.css";
import { MmdManager } from "./mmd-manager";
import "./mmd-manager-x-extension";
import { Timeline } from "./timeline";
import { BottomPanel } from "./bottom-panel";
import { UIController } from "./ui-controller";
import { runPngSequenceExportJob } from "./png-sequence-exporter";
import { runWebmExportJob } from "./webm-exporter";
import { applyI18nToDom, getLocale, initializeI18n, setLocale, t } from "./i18n";
import { logError, logInfo, toLogErrorData } from "./app-logger";
import type { AppLogData, SmokeRendererReadyPayload } from "./types";

let shaderRequestTraceInstalled = false;

function reportSmokeRendererReady(payload: SmokeRendererReadyPayload): void {
  try {
    window.electronAPI.reportSmokeRendererReady(payload);
  } catch {
    // Smoke reporting must not affect normal editor startup.
  }
}

function reportSmokeRendererFailure(message: string, details?: AppLogData): void {
  try {
    window.electronAPI.reportSmokeRendererFailure({ message, details });
  } catch {
    // Smoke reporting must not affect normal editor startup.
  }
}

function isLikelyShaderRequestUrl(url: string): boolean {
  return /\.((vertex|fragment)\.fx|fx)(\?|$)/i.test(url)
    || /\/Shaders(WGSL)?\//i.test(url)
    || /shader/i.test(url);
}

function installShaderRequestTrace(): void {
  if (shaderRequestTraceInstalled) return;
  shaderRequestTraceInstalled = true;

  const originalOpen = WebRequest.prototype.open;
  const originalSend = WebRequest.prototype.send;

  WebRequest.prototype.open = function(method: string, url: string): void {
    if (isLikelyShaderRequestUrl(url)) {
      console.log("[ShaderTrace] request", { method, url });
    }
    originalOpen.call(this, method, url);
  };

  WebRequest.prototype.send = function(body?: XMLHttpRequestBodyInit | Document | null): void {
    const request = this as WebRequest & { __mmdShaderTraceAttached?: boolean };
    if (!request.__mmdShaderTraceAttached && isLikelyShaderRequestUrl(this.requestURL)) {
      request.__mmdShaderTraceAttached = true;
      this.addEventListener("load", () => {
        const contentType = this.getResponseHeader("content-type") || "";
        const responseText = typeof this.responseText === "string" ? this.responseText.trimStart() : "";
        const preview = responseText.slice(0, 120);
        const looksLikeHtml = preview.startsWith("<!doctype html") || preview.startsWith("<html");
        if (this.status >= 400 || looksLikeHtml || /text\/html/i.test(contentType)) {
          console.error("[ShaderTrace] suspicious response", {
            url: this.requestURL,
            status: this.status,
            statusText: this.statusText,
            contentType,
            preview,
          });
        } else {
          console.log("[ShaderTrace] response", {
            url: this.requestURL,
            status: this.status,
            contentType,
          });
        }
      });
      this.addEventListener("error", () => {
        console.error("[ShaderTrace] network error", {
          url: this.requestURL,
          status: this.status,
          statusText: this.statusText,
        });
      });
    }
    originalSend.call(this, body);
  };
}

document.addEventListener("DOMContentLoaded", () => {
  installShaderRequestTrace();
  initializeI18n(document);
  window.addEventListener("error", (event) => {
    logError("renderer", "uncaught renderer error", {
      message: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno,
      ...toLogErrorData(event.error),
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    logError("renderer", "unhandled renderer rejection", toLogErrorData(event.reason));
  });
  window.mmdI18n = {
    getLocale: () => getLocale(),
    setLocale: (locale) => {
      setLocale(locale);
    },
    apply: () => {
      applyI18nToDom(document);
    },
  };
  void initializeApp();
});

async function initializeApp(): Promise<void> {
  const searchParams = new URLSearchParams(window.location.search);
  const mode = searchParams.get("mode");
  logInfo("renderer", "initialize app", { mode: mode ?? "editor" });
  if (mode === "exporter") {
    await initializePngSequenceExporter(searchParams);
    return;
  }
  if (mode === "webm-exporter") {
    await initializeWebmExporter(searchParams);
    return;
  }

  const canvas = document.getElementById("render-canvas") as HTMLCanvasElement;
  if (!canvas) {
    console.error("Canvas not found");
    reportSmokeRendererFailure("Canvas not found");
    return;
  }

  try {
    const mmdManager = await MmdManager.create(canvas);
    const engine = mmdManager.getEngineType();
    const physicsBackend = mmdManager.getPhysicsBackendLabel();
    logInfo("renderer", "MmdManager initialized", {
      engine,
      physicsBackend,
    });
    const timeline = new Timeline(
      "timeline-canvas",
      "timeline-tracks-scroll",
      "timeline-label-canvas",
      "timeline-labels"
    );
    const bottomPanel = new BottomPanel();
    bottomPanel.setMmdManager(mmdManager);

    new UIController(mmdManager, timeline, bottomPanel);
    reportSmokeRendererReady({
      engine,
      physicsBackend,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logError("renderer", "failed to initialize MMD_modoki", toLogErrorData(err));
    reportSmokeRendererFailure(message, toLogErrorData(err));
    console.error("Failed to initialize MMD modoki:", message);

    const statusText = document.getElementById("status-text");
    if (statusText) {
      statusText.textContent = t("error.initializationFailed");
    }

    const overlay = document.getElementById("viewport-overlay");
    if (overlay) {
      overlay.classList.remove("hidden");
      const title = overlay.querySelector("p");
      const hint = overlay.querySelector(".hint-text");
      if (title) title.textContent = t("error.initializationFailed");
      if (hint) hint.textContent = t("error.details", { message });
    }
  }
}

async function initializePngSequenceExporter(searchParams: URLSearchParams): Promise<void> {
  document.body.classList.add("exporter-mode");

  const canvas = document.getElementById("render-canvas") as HTMLCanvasElement | null;
  const busyOverlay = document.getElementById("ui-busy-overlay");
  const busyText = document.getElementById("ui-busy-text");
  const viewportOverlay = document.getElementById("viewport-overlay");
  const statusText = document.getElementById("status-text");

  const setStatus = (message: string): void => {
    if (statusText) statusText.textContent = message;
    if (busyText) busyText.textContent = message;
    document.title = `PNG Sequence Export - ${message}`;
  };

  const closeExporterWindowSoon = (): void => {
    window.setTimeout(() => {
      window.close();
    }, 300);
  };

  if (!canvas) {
    console.error("Canvas not found");
    setStatus("Canvas not found");
    closeExporterWindowSoon();
    return;
  }

  if (viewportOverlay) {
    viewportOverlay.classList.add("hidden");
  }
  if (busyOverlay) {
    busyOverlay.classList.remove("hidden");
    busyOverlay.setAttribute("aria-hidden", "false");
  }

  const jobId = searchParams.get("jobId");
  if (!jobId) {
    setStatus("Export job id is missing");
    closeExporterWindowSoon();
    return;
  }

  try {
    const request = await window.electronAPI.takePngSequenceExportJob(jobId);
    if (!request) {
      setStatus("Export job is unavailable");
      closeExporterWindowSoon();
      return;
    }

    let lastProgressReportAt = 0;
    const result = await runPngSequenceExportJob(canvas, request, {
      onStatus: (message) => {
        setStatus(message);
      },
      onProgress: (saved, total, frame, captured) => {
        setStatus(`Exporting... ${saved}/${total} (frame ${frame})`);
        const now = performance.now();
        if (saved === total || now - lastProgressReportAt >= 200) {
          lastProgressReportAt = now;
          window.electronAPI.reportPngSequenceExportProgress({
            jobId,
            saved,
            captured,
            total,
            frame,
            startFrame: request.startFrame,
            endFrame: request.endFrame,
          });
        }
      },
    });

    setStatus(`Done: ${result.exportedFrames} frame(s)`);
    closeExporterWindowSoon();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("PNG sequence export failed:", message);
    setStatus(`Export failed: ${message}`);
    closeExporterWindowSoon();
  }
}

async function initializeWebmExporter(searchParams: URLSearchParams): Promise<void> {
  document.body.classList.add("exporter-mode");

  const canvas = document.getElementById("render-canvas") as HTMLCanvasElement | null;
  const busyOverlay = document.getElementById("ui-busy-overlay");
  const busyText = document.getElementById("ui-busy-text");
  const viewportOverlay = document.getElementById("viewport-overlay");
  const statusText = document.getElementById("status-text");

  const setStatus = (message: string): void => {
    if (statusText) statusText.textContent = message;
    if (busyText) busyText.textContent = message;
    document.title = `WebM Export - ${message}`;
  };

  const closeExporterWindowSoon = (): void => {
    window.setTimeout(() => {
      window.close();
    }, 300);
  };

  if (!canvas) {
    console.error("Canvas not found");
    setStatus("Canvas not found");
    closeExporterWindowSoon();
    return;
  }

  if (viewportOverlay) {
    viewportOverlay.classList.add("hidden");
  }
  if (busyOverlay) {
    busyOverlay.classList.remove("hidden");
    busyOverlay.setAttribute("aria-hidden", "false");
  }

  const jobId = searchParams.get("jobId");
  if (!jobId) {
    logError("webm", "export job id is missing");
    setStatus("Export job id is missing");
    closeExporterWindowSoon();
    return;
  }

  try {
    const request = await window.electronAPI.takeWebmExportJob(jobId);
    if (!request) {
      logError("webm", "export job is unavailable", { jobId });
      setStatus("Export job is unavailable");
      closeExporterWindowSoon();
      return;
    }

    canvas.style.width = `${request.outputWidth}px`;
    canvas.style.height = `${request.outputHeight}px`;
    canvas.width = request.outputWidth;
    canvas.height = request.outputHeight;

    let lastProgressReportAt = 0;
    let lastPhase = "initializing";
    let lastMessage = "";
    let encodedFrames = 0;
    let capturedFrames = 0;
    let currentFrame = request.startFrame;
    const totalOutputFrames = Math.max(1, Math.round(((request.endFrame - request.startFrame + 1) / 30) * Math.max(1, request.fps || 30)));
    logInfo("webm", "exporter job accepted", {
      jobId,
      startFrame: request.startFrame,
      endFrame: request.endFrame,
      fps: request.fps,
      outputWidth: request.outputWidth,
      outputHeight: request.outputHeight,
      includeAudio: request.includeAudio === true,
      preferredVideoCodec: request.preferredVideoCodec,
    });
    const emitWebmProgress = (phase: string, message: string, force = false): void => {
      const now = performance.now();
      const shouldReport = force || now - lastProgressReportAt >= 1000;
      if (!shouldReport) return;
      lastProgressReportAt = now;
      window.electronAPI.reportWebmExportProgress({
        jobId,
        phase: phase as import("./types").WebmExportPhase,
        encoded: encodedFrames,
        total: totalOutputFrames,
        frame: currentFrame,
        startFrame: request.startFrame,
        endFrame: request.endFrame,
        captured: capturedFrames,
        message,
        timestampMs: Date.now(),
      });
    };

    const result = await runWebmExportJob(canvas, request, {
      onStatus: (message, phase) => {
        setStatus(message);
        if (phase !== lastPhase || message !== lastMessage) {
          lastPhase = phase;
          lastMessage = message;
          emitWebmProgress(phase, message, true);
        }
      },
      onProgress: (encoded, total, frame, captured) => {
        encodedFrames = encoded;
        capturedFrames = captured;
        currentFrame = frame;
        setStatus(`Encoding... ${encoded}/${total} (frame ${frame})`);
        emitWebmProgress("encoding", `Encoding... ${encoded}/${total} (frame ${frame})`, encoded === total);
      },
    });

    setStatus(`Done: ${result.encodedFrames} frame(s) ${result.codec}`);
    logInfo("webm", "exporter job completed", {
      jobId,
      encodedFrames: result.encodedFrames,
      codec: result.codec,
    });
    encodedFrames = result.encodedFrames;
    currentFrame = request.endFrame;
    emitWebmProgress("completed", `Done: ${result.encodedFrames} frame(s) ${result.codec}`, true);
    setStatus("Completing WebM export job...");
    emitWebmProgress("finishing-job", "Completing WebM export job...", true);
    const finished = await window.electronAPI.finishWebmExportJob(jobId);
    if (!finished) {
      closeExporterWindowSoon();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logError("webm", "exporter job failed", {
      jobId,
      ...toLogErrorData(err),
    });
    console.error("WebM export failed:", message);
    setStatus(`Export failed: ${message}`);
    window.electronAPI.reportWebmExportProgress({
      jobId,
      phase: "failed",
      encoded: 0,
      total: 0,
      frame: 0,
      startFrame: request.startFrame,
      endFrame: request.endFrame,
      captured: 0,
      message,
      timestampMs: Date.now(),
    });
    const finished = await window.electronAPI.finishWebmExportJob(jobId);
    if (!finished) {
      closeExporterWindowSoon();
    }
  }
}
