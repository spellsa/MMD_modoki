/**
 * MMD modoki - Renderer Entry Point
 * Initializes Babylon.js, babylon-mmd, and all UI components.
 */

import "./index.css";
import { MmdManager } from "./mmd-manager";
import "./mmd-manager-x-extension";
import { Timeline } from "./timeline";
import { BottomPanel } from "./bottom-panel";
import { UIController } from "./ui-controller";
import { runPngSequenceExportJob } from "./png-sequence-exporter";
import { runWebmExportJob } from "./webm-exporter";
import { applyI18nToDom, getLocale, initializeI18n, setLocale } from "./i18n";

document.addEventListener("DOMContentLoaded", () => {
  initializeI18n(document);
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
    return;
  }

  try {
    const mmdManager = await MmdManager.create(canvas);
    const timeline = new Timeline(
      "timeline-canvas",
      "timeline-tracks-scroll",
      "timeline-label-canvas",
      "timeline-labels"
    );
    const bottomPanel = new BottomPanel();
    bottomPanel.setMmdManager(mmdManager);

    new UIController(mmdManager, timeline, bottomPanel);

    console.log("MMD modoki initialized");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Failed to initialize MMD modoki:", message);

    const statusText = document.getElementById("status-text");
    if (statusText) {
      statusText.textContent = "初期化に失敗しました";
    }

    const overlay = document.getElementById("viewport-overlay");
    if (overlay) {
      overlay.classList.remove("hidden");
      const title = overlay.querySelector("p");
      const hint = overlay.querySelector(".hint-text");
      if (title) title.textContent = "初期化に失敗しました";
      if (hint) hint.textContent = `詳細: ${message}`;
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
    setStatus("Export job id is missing");
    closeExporterWindowSoon();
    return;
  }

  try {
    const request = await window.electronAPI.takeWebmExportJob(jobId);
    if (!request) {
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
    console.error("WebM export failed:", message);
    setStatus(`Export failed: ${message}`);
    window.electronAPI.reportWebmExportProgress({
      jobId,
      phase: "failed",
      encoded: 0,
      total: 0,
      frame: 0,
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
