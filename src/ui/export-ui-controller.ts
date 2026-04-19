/**
 * Export UI controller
 *
 * Owns background export IPC state, progress tracking, and the busy overlay.
 * Builds PNG / WebM export requests from output UI state.
 */
import { t } from "../i18n";
import { logError, logInfo } from "../app-logger";
import type { MmdManager } from "../mmd-manager";
import type {
    MmdModokiProjectFileV1,
    PngSequenceExportProgress,
    PngSequenceExportState,
    ProjectOutputState,
    WebmExportProgress,
    WebmExportState,
} from "../types";

export type OutputSettings = { width: number; height: number; qualityScale: number; fps: number };

export type WebmOutputOptions = {
    includeAudio: boolean;
    preferredVideoCodec: "auto" | "vp8" | "vp9";
};

type ToastType = "success" | "error" | "info";

type ExportUiElements = {
    appRoot: HTMLElement;
    busyOverlay: HTMLElement | null;
    busyText: HTMLElement | null;
    outputAspectSelect: HTMLSelectElement | null;
    outputSizePresetSelect: HTMLSelectElement | null;
    outputWidthInput: HTMLInputElement | null;
    outputHeightInput: HTMLInputElement | null;
    outputLockAspectInput: HTMLInputElement | null;
    outputQualitySelect: HTMLSelectElement | null;
    outputFpsSelect: HTMLSelectElement | null;
    outputWebmCodecSelect: HTMLSelectElement | null;
    outputIncludeAudioInput: HTMLInputElement | null;
    outputStartFrameInput: HTMLInputElement | null;
    outputEndFrameInput: HTMLInputElement | null;
    playbackFrameStartToggleInput: HTMLInputElement | null;
    playbackFrameStopToggleInput: HTMLInputElement | null;
};

export type ExportUiControllerDeps = {
    mmdManager: MmdManager;
    buildProjectState: () => MmdModokiProjectFileV1;
    setStatus: (text: string, loading?: boolean) => void;
    showToast: (message: string, type?: ToastType) => void;
    isPlaybackActive: () => boolean;
    onPausePlayback: () => void;
    getViewportSize: () => { width: number; height: number };
    onOutputAspectChanged: () => void;
};

function resolveExportUiElements(): ExportUiElements {
    return {
        appRoot: document.getElementById("app") as HTMLElement,
        busyOverlay: document.getElementById("ui-busy-overlay"),
        busyText: document.getElementById("ui-busy-text"),
        outputAspectSelect: document.getElementById("output-aspect") as HTMLSelectElement | null,
        outputSizePresetSelect: document.getElementById("output-size-preset") as HTMLSelectElement | null,
        outputWidthInput: document.getElementById("output-width") as HTMLInputElement | null,
        outputHeightInput: document.getElementById("output-height") as HTMLInputElement | null,
        outputLockAspectInput: document.getElementById("output-lock-aspect") as HTMLInputElement | null,
        outputQualitySelect: document.getElementById("output-quality") as HTMLSelectElement | null,
        outputFpsSelect: document.getElementById("output-fps") as HTMLSelectElement | null,
        outputWebmCodecSelect: document.getElementById("output-webm-codec") as HTMLSelectElement | null,
        outputIncludeAudioInput: document.getElementById("output-include-audio") as HTMLInputElement | null,
        outputStartFrameInput: document.getElementById("output-start-frame") as HTMLInputElement | null,
        outputEndFrameInput: document.getElementById("output-end-frame") as HTMLInputElement | null,
        playbackFrameStartToggleInput: document.getElementById("playback-frame-start-toggle") as HTMLInputElement | null,
        playbackFrameStopToggleInput: document.getElementById("playback-frame-stop-toggle") as HTMLInputElement | null,
    };
}

function formatWebmExportPhaseLabel(phase: WebmExportProgress["phase"]): string {
    switch (phase) {
        case "initializing": return t("webm.phase.initializing");
        case "loading-project": return t("webm.phase.loadingProject");
        case "checking-codec": return t("webm.phase.checkingCodec");
        case "opening-output": return t("webm.phase.openingOutput");
        case "encoding": return t("webm.phase.encoding");
        case "closing-track": return t("webm.phase.closingTrack");
        case "finalizing": return t("webm.phase.finalizing");
        case "finishing-job": return t("webm.phase.finishingJob");
        case "completed": return t("webm.phase.completed");
        case "failed": return t("webm.phase.failed");
        default: return phase;
    }
}

export class ExportUiController {
    private readonly elements: ExportUiElements;
    private readonly mmdManager: MmdManager;
    private readonly buildProjectState: () => MmdModokiProjectFileV1;
    private readonly setStatus: (text: string, loading?: boolean) => void;
    private readonly showToast: (message: string, type?: ToastType) => void;
    private readonly isPlaybackActive: () => boolean;
    private readonly onPausePlayback: () => void;
    private readonly getViewportSize: () => { width: number; height: number };
    private readonly onOutputAspectChanged: () => void;

    private pngSequenceExportStateUnsubscribe: (() => void) | null = null;
    private pngSequenceExportProgressUnsubscribe: (() => void) | null = null;
    private webmExportStateUnsubscribe: (() => void) | null = null;
    private webmExportProgressUnsubscribe: (() => void) | null = null;
    private isPngSequenceExportActive = false;
    private pngSequenceExportActiveCount = 0;
    private latestPngSequenceExportProgress: PngSequenceExportProgress | null = null;
    private isWebmExportActive = false;
    private webmExportActiveCount = 0;
    private latestWebmExportProgress: WebmExportProgress | null = null;
    private backgroundExportMonitorIntervalId: number | null = null;
    private outputAspectRatio = 16 / 9;
    private isSyncingOutputSettings = false;
    private isSyncingFrameRange = false;
    private isFrameRangeCustomized = false;

    constructor(deps: ExportUiControllerDeps) {
        this.elements = resolveExportUiElements();
        this.mmdManager = deps.mmdManager;
        this.buildProjectState = deps.buildProjectState;
        this.setStatus = deps.setStatus;
        this.showToast = deps.showToast;
        this.isPlaybackActive = deps.isPlaybackActive;
        this.onPausePlayback = deps.onPausePlayback;
        this.getViewportSize = deps.getViewportSize;
        this.onOutputAspectChanged = deps.onOutputAspectChanged;

        this.setupOutputControls();
        this.setupPngSequenceExportStateBridge();
        this.setupWebmExportStateBridge();
        this.startBackgroundExportMonitor();
    }

    public dispose(): void {
        this.pngSequenceExportStateUnsubscribe?.();
        this.pngSequenceExportStateUnsubscribe = null;
        this.pngSequenceExportProgressUnsubscribe?.();
        this.pngSequenceExportProgressUnsubscribe = null;
        this.webmExportStateUnsubscribe?.();
        this.webmExportStateUnsubscribe = null;
        this.webmExportProgressUnsubscribe?.();
        this.webmExportProgressUnsubscribe = null;
        if (this.backgroundExportMonitorIntervalId !== null) {
            window.clearInterval(this.backgroundExportMonitorIntervalId);
            this.backgroundExportMonitorIntervalId = null;
        }
    }

    public hasBackgroundExportActive(): boolean {
        return this.isPngSequenceExportActive || this.isWebmExportActive;
    }

    public refreshLocalizedState(): void {
        if (!this.hasBackgroundExportActive()) return;
        this.updateBackgroundExportBusyMessage();
    }

    public exportProjectState(): ProjectOutputState {
        const outputSettings = this.getOutputSettings();
        const frameRange = this.getOutputFrameRange();
        const qualityRaw = Number.parseFloat(this.elements.outputQualitySelect?.value ?? "1");
        const fpsRaw = Number.parseInt(this.elements.outputFpsSelect?.value ?? "30", 10);

        return {
            aspectPreset: this.elements.outputAspectSelect?.value ?? "16:9",
            sizePreset: this.elements.outputSizePresetSelect?.value ?? "1920",
            width: outputSettings.width,
            height: outputSettings.height,
            lockAspect: Boolean(this.elements.outputLockAspectInput?.checked),
            qualityScale: Number.isFinite(qualityRaw) ? Math.max(0.25, Math.min(4, qualityRaw)) : 1,
            fps: Number.isFinite(fpsRaw) ? Math.max(1, Math.min(120, fpsRaw)) : 30,
            includeAudio: Boolean(this.elements.outputIncludeAudioInput?.checked),
            webmCodec: this.getWebmOutputOptions().preferredVideoCodec,
            startFrame: frameRange.startFrame,
            endFrame: frameRange.endFrame,
            frameStartEnabled: Boolean(this.elements.playbackFrameStartToggleInput?.checked),
            frameStopEnabled: Boolean(this.elements.playbackFrameStopToggleInput?.checked),
        };
    }

    public applyProjectState(state: ProjectOutputState | null | undefined): void {
        if (!state) return;

        const hasOption = (select: HTMLSelectElement, value: string): boolean =>
            Array.from(select.options).some((option) => option.value === value);

        if (
            this.elements.outputAspectSelect &&
            typeof state.aspectPreset === "string" &&
            hasOption(this.elements.outputAspectSelect, state.aspectPreset)
        ) {
            this.elements.outputAspectSelect.value = state.aspectPreset;
        }
        if (
            this.elements.outputSizePresetSelect &&
            typeof state.sizePreset === "string" &&
            hasOption(this.elements.outputSizePresetSelect, state.sizePreset)
        ) {
            this.elements.outputSizePresetSelect.value = state.sizePreset;
        }
        if (this.elements.outputWidthInput && Number.isFinite(state.width)) {
            this.elements.outputWidthInput.value = String(this.clampOutputWidth(state.width));
        }
        if (this.elements.outputHeightInput && Number.isFinite(state.height)) {
            this.elements.outputHeightInput.value = String(this.clampOutputHeight(state.height));
        }
        if (this.elements.outputLockAspectInput) {
            this.elements.outputLockAspectInput.checked = Boolean(state.lockAspect);
        }
        if (
            this.elements.outputQualitySelect &&
            Number.isFinite(state.qualityScale) &&
            hasOption(this.elements.outputQualitySelect, String(state.qualityScale))
        ) {
            this.elements.outputQualitySelect.value = String(state.qualityScale);
        }
        if (
            this.elements.outputFpsSelect &&
            Number.isFinite(state.fps) &&
            hasOption(this.elements.outputFpsSelect, String(state.fps))
        ) {
            this.elements.outputFpsSelect.value = String(state.fps);
        }
        if (this.elements.outputIncludeAudioInput) {
            this.elements.outputIncludeAudioInput.checked = Boolean(state.includeAudio);
        }
        if (
            this.elements.outputWebmCodecSelect &&
            typeof state.webmCodec === "string" &&
            hasOption(this.elements.outputWebmCodecSelect, state.webmCodec)
        ) {
            this.elements.outputWebmCodecSelect.value = state.webmCodec;
        }
        if (
            this.elements.outputStartFrameInput &&
            this.elements.outputEndFrameInput &&
            Number.isFinite(state.startFrame) &&
            Number.isFinite(state.endFrame)
        ) {
            this.isFrameRangeCustomized = true;
            this.setOutputFrameRangeValues(state.startFrame ?? 0, state.endFrame ?? 0);
        } else {
            this.isFrameRangeCustomized = false;
            this.syncFrameRangeFromTimeline(true);
        }
        if (this.elements.playbackFrameStartToggleInput) {
            this.elements.playbackFrameStartToggleInput.checked = Boolean(state.frameStartEnabled);
        }
        if (this.elements.playbackFrameStopToggleInput) {
            this.elements.playbackFrameStopToggleInput.checked = Boolean(state.frameStopEnabled);
        }

        const width = this.clampOutputWidth(Number.parseInt(this.elements.outputWidthInput?.value ?? "1920", 10));
        const height = this.clampOutputHeight(Number.parseInt(this.elements.outputHeightInput?.value ?? "1080", 10));
        this.outputAspectRatio = height > 0
            ? Math.max(0.1, width / height)
            : this.resolveSelectedOutputAspectRatio();
        this.onOutputAspectChanged();
    }

    public syncFrameRangeFromTimeline(force = false): void {
        if (!this.elements.outputStartFrameInput || !this.elements.outputEndFrameInput) return;
        if (!force && this.isFrameRangeCustomized) return;

        const maxFrame = this.getMaxOutputFrame();
        this.setOutputFrameRangeValues(0, maxFrame);
    }

    public getSelectedAspectPreset(): string {
        return this.elements.outputAspectSelect?.value ?? "16:9";
    }

    public resolveSelectedOutputAspectRatio(): number {
        if (!this.elements.outputAspectSelect) return this.outputAspectRatio > 0 ? this.outputAspectRatio : 16 / 9;
        const value = this.elements.outputAspectSelect.value;
        if (value === "viewport") {
            const { width, height } = this.getViewportSize();
            if (width > 0 && height > 0) {
                return Math.max(0.1, width / height);
            }
            return 16 / 9;
        }

        const parts = value.split(":");
        if (parts.length === 2) {
            const w = Number.parseFloat(parts[0]);
            const h = Number.parseFloat(parts[1]);
            if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
                return Math.max(0.1, w / h);
            }
        }

        return this.outputAspectRatio > 0 ? this.outputAspectRatio : 16 / 9;
    }

    public getOutputSettings(): OutputSettings {
        const widthRaw = Number.parseInt(this.elements.outputWidthInput?.value ?? "1920", 10);
        const heightRaw = Number.parseInt(this.elements.outputHeightInput?.value ?? "1080", 10);
        const qualityRaw = Number.parseFloat(this.elements.outputQualitySelect?.value ?? "1");
        const fpsRaw = Number.parseInt(this.elements.outputFpsSelect?.value ?? "30", 10);

        return {
            width: this.clampOutputWidth(widthRaw),
            height: this.clampOutputHeight(heightRaw),
            qualityScale: Number.isFinite(qualityRaw) ? Math.max(0.25, Math.min(4, qualityRaw)) : 1,
            fps: Number.isFinite(fpsRaw) ? Math.max(1, Math.min(120, fpsRaw)) : 30,
        };
    }

    public getWebmOutputOptions(): WebmOutputOptions {
        const selectedCodec = this.elements.outputWebmCodecSelect?.value;
        const preferredVideoCodec = selectedCodec === "auto" || selectedCodec === "vp8" || selectedCodec === "vp9"
            ? selectedCodec
            : "vp9";
        return {
            includeAudio: Boolean(this.elements.outputIncludeAudioInput?.checked),
            preferredVideoCodec,
        };
    }

    public async exportPNG(): Promise<void> {
        this.setStatus("Exporting PNG...", true);

        const outputSettings = this.getOutputSettings();
        const captureWidth = Math.max(320, Math.round(outputSettings.width * outputSettings.qualityScale));
        const captureHeight = Math.max(180, Math.round(outputSettings.height * outputSettings.qualityScale));
        const dataUrl = await this.mmdManager.capturePngDataUrl({
            width: captureWidth,
            height: captureHeight,
            precision: 1,
        });
        if (!dataUrl) {
            this.setStatus("PNG export failed", false);
            return;
        }

        const now = new Date();
        const pad = (value: number): string => String(value).padStart(2, "0");
        const fileName = `mmd_capture_${captureWidth}x${captureHeight}_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`;

        const savedPath = await window.electronAPI.savePngFile(dataUrl, fileName);
        if (!savedPath) {
            this.setStatus("Ready", false);
            this.showToast("PNG export canceled", "info");
            return;
        }

        const basename = savedPath.replace(/^.*[\\/]/, "");
        this.setStatus("PNG saved", false);
        this.showToast(`Saved PNG: ${basename}`, "success");
    }

    public async exportPNGSequence(): Promise<void> {
        const directoryPath = await window.electronAPI.openDirectoryDialog();
        if (!directoryPath) {
            this.showToast("PNG sequence export canceled", "info");
            return;
        }

        const { startFrame, endFrame } = this.getOutputFrameRange();
        const step = 1;
        const outputSettings = this.getOutputSettings();
        const prefix = `mmd_seq_${outputSettings.width}x${outputSettings.height}`;

        const frameList: number[] = [];
        for (let frame = startFrame; frame <= endFrame; frame += step) {
            frameList.push(frame);
        }
        if (frameList.length === 0) {
            this.showToast("No frames to export", "error");
            return;
        }

        const outputFolderName = this.buildPngSequenceFolderName(
            prefix,
            startFrame,
            endFrame,
            step
        );
        const outputDirectoryPath = this.joinPathForRenderer(directoryPath, outputFolderName);

        const project = this.buildProjectState();
        project.assets.audioPath = null;

        this.setStatus("Launching PNG sequence export window...", true);
        const result = await window.electronAPI.startPngSequenceExportWindow({
            project,
            outputDirectoryPath,
            startFrame,
            endFrame,
            step,
            prefix,
            fps: outputSettings.fps,
            precision: outputSettings.qualityScale,
            outputWidth: outputSettings.width,
            outputHeight: outputSettings.height,
        });

        if (!result) {
            this.setStatus("PNG sequence export launch failed", false);
            this.showToast("Failed to start PNG sequence export window", "error");
            return;
        }

        this.setStatus("PNG sequence export started", false);
        this.showToast(`PNG sequence export started (${frameList.length} files)`, "success");
    }

    public async exportWebm(): Promise<void> {
        if (!window.isSecureContext) {
            logError("webm", "export blocked by insecure context");
            this.showToast("WebM export requires a secure context", "error");
            return;
        }

        const { startFrame, endFrame } = this.getOutputFrameRange();
        const totalTimelineFrames = endFrame - startFrame + 1;
        if (totalTimelineFrames <= 0) {
            logError("webm", "export blocked because no frames are available", {
                startFrame,
                endFrame,
            });
            this.showToast("No frames to export", "error");
            return;
        }

        const outputSettings = this.getOutputSettings();
        const totalOutputFrames = Math.max(1, Math.round((totalTimelineFrames / 30) * outputSettings.fps));
        logInfo("webm", "export requested", {
            startFrame,
            endFrame,
            totalTimelineFrames,
            totalOutputFrames,
            fps: outputSettings.fps,
            outputWidth: outputSettings.width,
            outputHeight: outputSettings.height,
            qualityScale: outputSettings.qualityScale,
        });
        const defaultFileName = this.buildWebmFileName(
            outputSettings.width,
            outputSettings.height,
            startFrame,
            endFrame,
        );
        const outputFilePath = await window.electronAPI.saveWebmDialog(defaultFileName);
        if (!outputFilePath) {
            logInfo("webm", "export canceled before launch", { defaultFileName });
            this.showToast(t("toast.webmExportCanceled"), "info");
            return;
        }

        const project = this.buildProjectState();
        const audioFilePath = project.assets.audioPath;
        const webmOutputOptions = this.getWebmOutputOptions();
        const includeAudio = webmOutputOptions.includeAudio && typeof audioFilePath === "string" && audioFilePath.length > 0;
        const preferredVideoCodec = webmOutputOptions.preferredVideoCodec;
        if (webmOutputOptions.includeAudio && !includeAudio) {
            this.showToast(t("toast.audioMissingForWebm"), "info");
        }
        project.assets.audioPath = null;
        logInfo("webm", "export launching", {
            outputFilePath,
            startFrame,
            endFrame,
            fps: outputSettings.fps,
            outputWidth: outputSettings.width,
            outputHeight: outputSettings.height,
            includeAudio,
            audioFilePath: includeAudio ? audioFilePath : null,
            preferredVideoCodec,
        });

        this.setStatus(t("busy.webmExportLaunching"), true);
        const result = await window.electronAPI.startWebmExportWindow({
            project,
            outputFilePath,
            startFrame,
            endFrame,
            fps: outputSettings.fps,
            outputWidth: outputSettings.width,
            outputHeight: outputSettings.height,
            includeAudio,
            audioFilePath: includeAudio ? audioFilePath : null,
            preferredVideoCodec,
        });

        if (!result) {
            logError("webm", "export launch failed", { outputFilePath });
            this.setStatus("WebM export launch failed", false);
            this.showToast("Failed to start WebM export window", "error");
            return;
        }

        logInfo("webm", "export launch completed", {
            jobId: result.jobId,
            totalOutputFrames,
        });
        this.setStatus("WebM export started", false);
        this.showToast(`WebM export started (${totalOutputFrames} frames)`, "success");
    }

    private sanitizeFileNameSegment(value: string): string {
        const source = value.replace(/\s+/g, "_");
        let sanitized = "";
        for (const ch of source) {
            const code = ch.charCodeAt(0);
            if (code <= 31 || '<>:"/\\|?*'.includes(ch)) {
                sanitized += "_";
            } else {
                sanitized += ch;
            }
        }
        return sanitized.length > 0 ? sanitized : "mmd_seq";
    }

    private buildPngSequenceFolderName(prefix: string, startFrame: number, endFrame: number, step: number): string {
        const now = new Date();
        const pad = (value: number): string => String(value).padStart(2, "0");
        const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        return this.sanitizeFileNameSegment(`${prefix}_${timestamp}_${startFrame}-${endFrame}_s${step}`);
    }

    private buildWebmFileName(width: number, height: number, startFrame: number, endFrame: number): string {
        const now = new Date();
        const pad = (value: number): string => String(value).padStart(2, "0");
        const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        return `${this.sanitizeFileNameSegment(`mmd_capture_${width}x${height}_${timestamp}_${startFrame}-${endFrame}`)}.webm`;
    }

    private joinPathForRenderer(basePath: string, childName: string): string {
        const separator = basePath.includes("\\") ? "\\" : "/";
        const normalizedBase = basePath.replace(/[\\/]+$/, "");
        return `${normalizedBase}${separator}${childName}`;
    }

    private setupOutputControls(): void {
        if (
            !this.elements.outputAspectSelect ||
            !this.elements.outputSizePresetSelect ||
            !this.elements.outputWidthInput ||
            !this.elements.outputHeightInput ||
            !this.elements.outputQualitySelect ||
            !this.elements.outputFpsSelect ||
            !this.elements.outputStartFrameInput ||
            !this.elements.outputEndFrameInput
        ) {
            return;
        }

        const applyPreset = (): void => {
            const ratio = this.resolveSelectedOutputAspectRatio();
            const longEdgeRaw = Number.parseInt(this.elements.outputSizePresetSelect?.value ?? "1920", 10);
            const longEdge = Number.isFinite(longEdgeRaw) ? Math.max(320, Math.min(8192, longEdgeRaw)) : 1920;

            let nextWidth = longEdge;
            let nextHeight = Math.max(180, Math.round(longEdge / Math.max(0.1, ratio)));
            if (ratio < 1) {
                nextHeight = longEdge;
                nextWidth = Math.max(320, Math.round(longEdge * ratio));
            }

            this.isSyncingOutputSettings = true;
            this.elements.outputWidthInput.value = String(this.clampOutputWidth(nextWidth));
            this.elements.outputHeightInput.value = String(this.clampOutputHeight(nextHeight));
            this.isSyncingOutputSettings = false;

            const width = Number.parseInt(this.elements.outputWidthInput.value, 10);
            const height = Number.parseInt(this.elements.outputHeightInput.value, 10);
            if (Number.isFinite(width) && Number.isFinite(height) && height > 0) {
                this.outputAspectRatio = Math.max(0.1, width / height);
            }

            this.onOutputAspectChanged();
        };

        const syncDimensionWithLock = (source: "width" | "height"): void => {
            if (!this.elements.outputWidthInput || !this.elements.outputHeightInput) return;
            if (this.isSyncingOutputSettings) return;

            let width = this.clampOutputWidth(Number.parseInt(this.elements.outputWidthInput.value, 10));
            let height = this.clampOutputHeight(Number.parseInt(this.elements.outputHeightInput.value, 10));
            const locked = this.elements.outputLockAspectInput?.checked === true;
            const ratio = Math.max(0.1, this.outputAspectRatio);

            if (locked) {
                if (source === "width") {
                    height = this.clampOutputHeight(Math.round(width / ratio));
                } else {
                    width = this.clampOutputWidth(Math.round(height * ratio));
                }
            } else if (height > 0) {
                this.outputAspectRatio = Math.max(0.1, width / height);
            }

            this.isSyncingOutputSettings = true;
            this.elements.outputWidthInput.value = String(width);
            this.elements.outputHeightInput.value = String(height);
            this.isSyncingOutputSettings = false;
        };

        this.elements.outputAspectSelect.addEventListener("change", applyPreset);
        this.elements.outputSizePresetSelect.addEventListener("change", applyPreset);
        this.elements.outputWidthInput.addEventListener("input", () => syncDimensionWithLock("width"));
        this.elements.outputHeightInput.addEventListener("input", () => syncDimensionWithLock("height"));
        this.elements.outputLockAspectInput?.addEventListener("change", () => {
            if (!this.elements.outputLockAspectInput) return;
            if (this.elements.outputLockAspectInput.checked) {
                this.outputAspectRatio = this.resolveSelectedOutputAspectRatio();
                syncDimensionWithLock("width");
            }
        });
        const markFrameRangeCustomized = (): void => {
            if (this.isSyncingFrameRange) return;
            this.isFrameRangeCustomized = true;
        };
        this.elements.outputStartFrameInput.addEventListener("input", markFrameRangeCustomized);
        this.elements.outputEndFrameInput.addEventListener("input", markFrameRangeCustomized);
        this.elements.outputStartFrameInput.addEventListener("change", () => {
            this.sanitizeFrameRangeInputs("start");
        });
        this.elements.outputEndFrameInput.addEventListener("change", () => {
            this.sanitizeFrameRangeInputs("end");
        });

        this.elements.outputQualitySelect.value = this.elements.outputQualitySelect.value || "1";
        this.elements.outputFpsSelect.value = this.elements.outputFpsSelect.value || "30";
        this.outputAspectRatio = this.resolveSelectedOutputAspectRatio();
        applyPreset();
        this.syncFrameRangeFromTimeline(true);
        this.onOutputAspectChanged();
    }

    private getMaxOutputFrame(): number {
        const totalFrames = Math.floor(this.mmdManager.totalFrames);
        return Number.isFinite(totalFrames) ? Math.max(0, totalFrames) : 0;
    }

    public getOutputFrameRange(): { startFrame: number; endFrame: number } {
        const maxFrame = this.getMaxOutputFrame();
        const startRaw = Number.parseInt(this.elements.outputStartFrameInput?.value ?? "0", 10);
        const endRaw = Number.parseInt(this.elements.outputEndFrameInput?.value ?? String(maxFrame), 10);

        let startFrame = Number.isFinite(startRaw) ? Math.floor(startRaw) : 0;
        let endFrame = Number.isFinite(endRaw) ? Math.floor(endRaw) : maxFrame;

        startFrame = Math.max(0, Math.min(maxFrame, startFrame));
        endFrame = Math.max(startFrame, Math.min(maxFrame, endFrame));

        this.setOutputFrameRangeValues(startFrame, endFrame);
        return { startFrame, endFrame };
    }

    public isPlaybackFrameStartEnabled(): boolean {
        return Boolean(this.elements.playbackFrameStartToggleInput?.checked);
    }

    public isPlaybackFrameStopEnabled(): boolean {
        return Boolean(this.elements.playbackFrameStopToggleInput?.checked);
    }

    private sanitizeFrameRangeInputs(source: "start" | "end"): void {
        const maxFrame = this.getMaxOutputFrame();
        const startRaw = Number.parseInt(this.elements.outputStartFrameInput?.value ?? "0", 10);
        const endRaw = Number.parseInt(this.elements.outputEndFrameInput?.value ?? String(maxFrame), 10);

        let startFrame = Number.isFinite(startRaw) ? Math.floor(startRaw) : 0;
        let endFrame = Number.isFinite(endRaw) ? Math.floor(endRaw) : maxFrame;

        startFrame = Math.max(0, Math.min(maxFrame, startFrame));
        endFrame = Math.max(0, Math.min(maxFrame, endFrame));

        if (source === "start" && endFrame < startFrame) {
            endFrame = startFrame;
        } else if (source === "end" && startFrame > endFrame) {
            startFrame = endFrame;
        } else if (endFrame < startFrame) {
            endFrame = startFrame;
        }

        this.setOutputFrameRangeValues(startFrame, endFrame);
    }

    private setOutputFrameRangeValues(startFrame: number, endFrame: number): void {
        if (!this.elements.outputStartFrameInput || !this.elements.outputEndFrameInput) return;
        this.isSyncingFrameRange = true;
        this.elements.outputStartFrameInput.value = String(Math.max(0, Math.floor(startFrame)));
        this.elements.outputEndFrameInput.value = String(Math.max(Math.floor(startFrame), Math.floor(endFrame)));
        this.isSyncingFrameRange = false;
    }

    private clampOutputWidth(value: number): number {
        if (!Number.isFinite(value)) return 1920;
        return Math.max(320, Math.min(8192, Math.round(value)));
    }

    private clampOutputHeight(value: number): number {
        if (!Number.isFinite(value)) return 1080;
        return Math.max(180, Math.min(8192, Math.round(value)));
    }

    private setupPngSequenceExportStateBridge(): void {
        this.pngSequenceExportStateUnsubscribe?.();
        this.pngSequenceExportStateUnsubscribe = window.electronAPI.onPngSequenceExportState((state) => {
            this.applyPngSequenceExportState(state);
        });
        this.pngSequenceExportProgressUnsubscribe?.();
        this.pngSequenceExportProgressUnsubscribe = window.electronAPI.onPngSequenceExportProgress((progress) => {
            this.applyPngSequenceExportProgress(progress);
        });
    }

    private applyPngSequenceExportState(state: PngSequenceExportState): void {
        this.isPngSequenceExportActive = Boolean(state?.active);
        this.pngSequenceExportActiveCount = Math.max(0, Math.floor(state?.activeCount ?? 0));
        if (!this.isPngSequenceExportActive) {
            this.latestPngSequenceExportProgress = null;
        }
        this.refreshBackgroundExportLock();
    }

    private applyPngSequenceExportProgress(progress: PngSequenceExportProgress): void {
        if (!this.isPngSequenceExportActive) return;
        this.latestPngSequenceExportProgress = progress;
        this.refreshBackgroundExportLock();
    }

    private setupWebmExportStateBridge(): void {
        this.webmExportStateUnsubscribe?.();
        this.webmExportStateUnsubscribe = window.electronAPI.onWebmExportState((state) => {
            this.applyWebmExportState(state);
        });
        this.webmExportProgressUnsubscribe?.();
        this.webmExportProgressUnsubscribe = window.electronAPI.onWebmExportProgress((progress) => {
            this.applyWebmExportProgress(progress);
        });
    }

    private startBackgroundExportMonitor(): void {
        if (this.backgroundExportMonitorIntervalId !== null) return;
        this.backgroundExportMonitorIntervalId = window.setInterval(() => {
            if (!this.hasBackgroundExportActive()) return;
            this.refreshBackgroundExportLock();
        }, 500);
    }

    private applyWebmExportState(state: WebmExportState): void {
        this.isWebmExportActive = Boolean(state?.active);
        this.webmExportActiveCount = Math.max(0, Math.floor(state?.activeCount ?? 0));
        if (!this.isWebmExportActive) {
            this.latestWebmExportProgress = null;
        }
        this.refreshBackgroundExportLock();
    }

    private applyWebmExportProgress(progress: WebmExportProgress): void {
        if (!this.isWebmExportActive) return;
        this.latestWebmExportProgress = progress;
        this.refreshBackgroundExportLock();
    }

    private refreshBackgroundExportLock(): void {
        const active = this.hasBackgroundExportActive();
        this.elements.appRoot.classList.toggle("ui-export-lock", active);
        this.elements.busyOverlay?.classList.toggle("hidden", !active);
        this.elements.busyOverlay?.setAttribute("aria-hidden", active ? "false" : "true");

        if (!active) {
            if (this.elements.busyText) {
                this.elements.busyText.textContent = t("busy.backgroundExportFinished");
            }
            return;
        }

        if (this.isPlaybackActive()) {
            this.onPausePlayback();
        }
        this.updateBackgroundExportBusyMessage();
    }

    private updateBackgroundExportBusyMessage(): void {
        const busyText = this.elements.busyText;
        if (!busyText) return;

        if (this.isWebmExportActive) {
            const progress = this.latestWebmExportProgress;
            if (progress) {
                const total = Math.max(0, Math.floor(progress.total));
                const encoded = Math.max(0, Math.floor(progress.encoded));
                const frame = Math.max(0, Math.floor(progress.frame));
                const phaseLabel = formatWebmExportPhaseLabel(progress.phase);
                if (total > 0) {
                    const ratio = Math.min(100, Math.max(0, (encoded / total) * 100));
                    busyText.textContent = t("busy.webmProgress", { phase: phaseLabel, encoded, total, ratio: ratio.toFixed(1), frame });
                    return;
                }
                busyText.textContent = t("busy.webmExportRunning");
                return;
            }
            if (this.webmExportActiveCount > 1) {
                busyText.textContent = t("busy.webmExportActive", { count: this.webmExportActiveCount });
                return;
            }
            busyText.textContent = t("busy.webmExportRunning");
            return;
        }

        if (this.isPngSequenceExportActive) {
            const progress = this.latestPngSequenceExportProgress;
            if (progress) {
                const total = Math.max(0, Math.floor(progress.total));
                const saved = Math.max(0, Math.floor(progress.saved));
                const frame = Math.max(0, Math.floor(progress.frame));
                if (total > 0) {
                    const ratio = Math.min(100, Math.max(0, (saved / total) * 100));
                    busyText.textContent = t("busy.webmProgress", { phase: "PNG", encoded: saved, total, ratio: ratio.toFixed(1), frame });
                    return;
                }
            }
            if (this.pngSequenceExportActiveCount > 1) {
                busyText.textContent = t("busy.webmExportActive", { count: this.pngSequenceExportActiveCount });
                return;
            }
            busyText.textContent = t("busy.exportingPngSequence");
        }
    }
}
