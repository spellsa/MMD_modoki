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
import { enhanceBottomPanelControls } from "./ui/panel-control-helpers";
import { runPngSequenceExportJob } from "./png-sequence-exporter";
import { runWebmExportJob } from "./webm-exporter";
import { applyI18nToDom, getLocale, initializeI18n, setLocale, t } from "./i18n";
import { isDebugLogEnabled, logDebug, logError, logInfo, toLogErrorData } from "./app-logger";
import type { AppLogData, SmokeRendererReadyPayload, WebmExportPhase, WebmExportRequest } from "./types";
import { POST_EFFECT_BACKEND_STORAGE_KEY } from "./render/post-effect-backend";

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

function waitAnimationFrames(frameCount: number): Promise<void> {
  return new Promise((resolve) => {
    let remaining = Math.max(0, Math.floor(frameCount));
    const step = (): void => {
      if (remaining <= 0) {
        resolve();
        return;
      }
      remaining -= 1;
      window.requestAnimationFrame(step);
    };
    step();
  });
}

async function runSmokeLuminousScenario(
  mmdManager: MmdManager,
  modelPath: string,
  pbrMmdLike: boolean,
): Promise<AppLogData> {
  const beforeBackend = mmdManager.getPostEffectBackend();
  const modelInfo = await mmdManager.loadPMX(modelPath);
  if (!modelInfo) {
    throw new Error("Smoke model load returned no model info");
  }

  const shaderStates = mmdManager.getWgslModelShaderStates();
  const modelState = shaderStates.find((model) => model.modelPath === modelPath) ?? shaderStates.at(-1);
  if (!modelState) {
    throw new Error("Smoke model shader state was not found");
  }

  if (pbrMmdLike) {
    await waitAnimationFrames(12);
    const initialScattering = mmdManager.getPbrMmdLikeScatteringDiagnostics();
    mmdManager.setPbrMaterialPreset("pbr-standard");
    await waitAnimationFrames(6);
    const standard = mmdManager.getPbrMmdLikeScatteringDiagnostics();
    if (standard.materialCount !== 0 || standard.configurationEnabled) {
      throw new Error(`PBR Standard did not disable MMD Like scattering: ${JSON.stringify(standard)}`);
    }
    mmdManager.setPbrMaterialPreset("pbr-mmd-like");
    await waitAnimationFrames(12);
    const mmdLike = mmdManager.getPbrMmdLikeScatteringDiagnostics();
    if (
      mmdLike.materialCount === 0
      || !mmdLike.configurationEnabled
      || !mmdLike.prePassEnabled
    ) {
      throw new Error(`PBR MMD Like scattering was not activated: ${JSON.stringify(mmdLike)}`);
    }
    const skinMaterialKey = modelState.materials[0]?.key ?? null;
    if (!skinMaterialKey || !mmdManager.setPbrMaterialShaderPreset(
      modelState.modelIndex,
      skinMaterialKey,
      "pbr-skin",
    )) {
      throw new Error("PBR Skin could not be assigned for the scattering smoke scenario");
    }
    await waitAnimationFrames(12);
    const scattering = mmdManager.getPbrMmdLikeScatteringDiagnostics();
    if (
      scattering.materialCount === 0
      || !scattering.configurationEnabled
      || !scattering.prePassEnabled
    ) {
      throw new Error(`PBR Skin scattering was not activated: ${JSON.stringify(scattering)}`);
    }
    return {
      kind: "pbrSkinScattering",
      modelName: modelInfo.name,
      materialCount: modelState.materials.length,
      beforeBackend,
      afterBackend: mmdManager.getPostEffectBackend(),
      initialMaterialCount: initialScattering.materialCount,
      standardMaterialCount: standard.materialCount,
      mmdLikeMaterialCount: mmdLike.materialCount,
      ...scattering,
    };
  }

  mmdManager.setWgslMaterialShaderPreset(modelState.modelIndex, null, "wgsl-autoluminous");
  mmdManager.postEffectGlowEnabled = true;
  mmdManager.postEffectGlowIntensity = 1.5;
  mmdManager.postEffectGlowThreshold = 0;
  mmdManager.postEffectGlowKernel = 64;
  mmdManager.setFrameGraphPostEffectStackIds(["luminous"]);

  await waitAnimationFrames(12);

  return {
    kind: "frameGraphLuminous",
    modelName: modelInfo.name,
    materialCount: modelState.materials.length,
    beforeBackend,
    afterBackend: mmdManager.getPostEffectBackend(),
    frameGraphExecutedFrames: mmdManager.getFrameGraphPostEffectsExecutedFrameCount(),
    luminousMaskSubMeshes: mmdManager.getFrameGraphPostEffectsLuminousMaskRenderedSubMeshCount(),
    glowEnabled: mmdManager.postEffectGlowEnabled,
    glowIntensity: mmdManager.postEffectGlowIntensity,
    glowThreshold: mmdManager.postEffectGlowThreshold,
    glowKernel: mmdManager.postEffectGlowKernel,
  };
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
      logDebug("shader", "shader request started", { method, url });
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
          logError("shader", "suspicious shader response", {
            url: this.requestURL,
            status: this.status,
            statusText: this.statusText,
            contentType,
            preview,
          });
        } else {
          logDebug("shader", "shader response received", {
            url: this.requestURL,
            status: this.status,
            contentType,
          });
        }
      });
      this.addEventListener("error", () => {
        logError("shader", "shader request network error", {
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
  if (isDebugLogEnabled("shaderTrace")) {
    installShaderRequestTrace();
  }
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
  const smokeModelPath = searchParams.get("smokeModelPath");
  const smokePbrMmdLike = searchParams.get("smokePbrMmdLike") === "1";
  const smokeRenderStabilityDiagnostics =
    searchParams.get("smokeRenderStabilityDiagnostics") === "1";
  logInfo("renderer", "initialize app", { mode: mode ?? "editor" });
  if (mode === "exporter") {
    await initializePngSequenceExporter(searchParams);
    return;
  }
  if (mode === "webm-exporter") {
    await initializeWebmExporter(searchParams);
    return;
  }
  enhanceBottomPanelControls(document);
  if (smokeRenderStabilityDiagnostics) {
    try {
      localStorage.setItem("mmd_modoki.debug.renderStability", "1");
    } catch {
      // Smoke can continue and report renderer health if storage is unavailable.
    }
  }
  if (smokeModelPath) {
    try {
      localStorage.setItem(POST_EFFECT_BACKEND_STORAGE_KEY, "frameGraph");
    } catch {
      // Smoke should still report the actual backend if storage is unavailable.
    }
  }

  const canvas = document.getElementById("render-canvas") as HTMLCanvasElement;
  if (!canvas) {
    logError("renderer", "render canvas is missing");
    reportSmokeRendererFailure("Canvas not found");
    return;
  }

  try {
    const mmdManager = await MmdManager.create(canvas);
    if (smokePbrMmdLike) {
      mmdManager.setMmdMaterialPipelinePreset("pbr-standard");
      mmdManager.setPbrMaterialPreset("pbr-mmd-like");
    }
    let smokeWebGpuFailureReported = false;
    if (smokeRenderStabilityDiagnostics) {
      const reportWebGpuFailure = (message: string): void => {
        if (smokeWebGpuFailureReported) return;
        smokeWebGpuFailureReported = true;
        reportSmokeRendererFailure("WebGPU validation error", { message });
      };
      mmdManager.onWebGpuValidationError = reportWebGpuFailure;
      const existingDiagnostics = mmdManager.getWebGpuValidationDiagnostics();
      if (existingDiagnostics.count > 0) {
        reportWebGpuFailure(existingDiagnostics.messages[0] ?? "Unknown WebGPU validation error");
        return;
      }
    }
    await mmdManager.waitForPhysicsInitialization();
    window.mmdModokiDiagnostics = {
      dumpPerformanceSnapshot: () => mmdManager.dumpPerformanceSnapshot(),
    };
    window.mmdModokiDebug = {
      enableAlphaTextureView: () => mmdManager.enableAlphaTextureDebugView(),
      disableAlphaTextureView: () => mmdManager.disableAlphaTextureDebugView(),
    };
    const engine = mmdManager.getEngineType();
    const physicsBackend = mmdManager.getPhysicsBackendLabel();
    const physicsEvaluationType = mmdManager.getPhysicsEvaluationTypeLabel();
    logInfo("renderer", "MmdManager initialized", {
      engine,
      physicsBackend,
      physicsEvaluationType,
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
    if (smokeRenderStabilityDiagnostics) {
      const diagnostics = mmdManager.getWebGpuValidationDiagnostics();
      if (diagnostics.count > 0) {
        if (!smokeWebGpuFailureReported) {
          smokeWebGpuFailureReported = true;
          reportSmokeRendererFailure("WebGPU validation error", {
            count: diagnostics.count,
            messages: diagnostics.messages,
          });
        }
        return;
      }
      const environmentLightingWasEnabled = mmdManager.isEnvironmentLightingEnabled();
      mmdManager.setEnvironmentLightingEnabled(true);
      const environmentDiagnostics = mmdManager.getEnvironmentLightingDiagnostics();
      mmdManager.setEnvironmentLightingEnabled(environmentLightingWasEnabled);
      if (
        !environmentDiagnostics.textureReady
        || !environmentDiagnostics.hasSphericalPolynomial
      ) {
        reportSmokeRendererFailure("Environment lighting is not PBR-ready", {
          environmentDiagnostics,
        });
        return;
      }
    }
    const scenario = smokeModelPath
      ? await runSmokeLuminousScenario(mmdManager, smokeModelPath, smokePbrMmdLike)
      : undefined;
    reportSmokeRendererReady({
      engine,
      physicsBackend,
      crossOriginIsolated: globalThis.crossOriginIsolated,
      sharedArrayBufferAvailable: typeof SharedArrayBuffer !== "undefined",
      scenario,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logError("renderer", "failed to initialize MMD_modoki", toLogErrorData(err));
    reportSmokeRendererFailure(message, toLogErrorData(err));

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
    logError("render", "PNG sequence exporter canvas is missing");
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
    logError("render", "PNG sequence export failed", {
      jobId,
      ...toLogErrorData(err),
    });
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
    logError("webm", "exporter canvas is missing");
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

  let request: WebmExportRequest | null = null;

  try {
    request = await window.electronAPI.takeWebmExportJob(jobId);
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
        phase: phase as WebmExportPhase,
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
        const progressMessage = lastPhase === "encoding" && lastMessage
          ? lastMessage
          : `Encoding... ${encoded}/${total} (frame ${frame})`;
        setStatus(progressMessage);
        emitWebmProgress("encoding", progressMessage, encoded === total);
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
    setStatus(`Export failed: ${message}`);
    window.electronAPI.reportWebmExportProgress({
      jobId,
      phase: "failed",
      encoded: 0,
      total: 0,
      frame: 0,
      startFrame: request?.startFrame ?? 0,
      endFrame: request?.endFrame ?? 0,
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
