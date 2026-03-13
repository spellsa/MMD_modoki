import {
    AudioBufferSource,
    StreamTarget,
    canEncode,
    canEncodeAudio,
    canEncodeVideo,
    Output,
    VideoSample,
    VideoSampleSource,
    WebMOutputFormat,
} from "mediabunny";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { Scene } from "@babylonjs/core/scene";
import { MmdManager } from "./mmd-manager";
import type { WebmExportPhase, WebmExportRequest } from "./types";

export interface WebmExportCallbacks {
    onStatus?: (message: string, phase: WebmExportPhase) => void;
    onProgress?: (encoded: number, total: number, frame: number, captured: number) => void;
}

export interface WebmExportResult {
    encodedFrames: number;
    totalFrames: number;
    codec: "vp9" | "vp8";
    outputBytes: number;
}

type ExportPerformanceStats = {
    renderMsTotal: number;
    captureMsTotal: number;
    encodeMsTotal: number;
    renderSamples: number;
    captureSamples: number;
    encodeSamples: number;
};

const updateStatus = (
    callbacks: WebmExportCallbacks,
    message: string,
    phase: WebmExportPhase,
): void => {
    callbacks.onStatus?.(message, phase);
};

const formatMs = (value: number): string => `${value.toFixed(1)}ms`;

const buildPerformanceSummary = (stats: ExportPerformanceStats): string => {
    const renderAvg = stats.renderSamples > 0 ? stats.renderMsTotal / stats.renderSamples : 0;
    const captureAvg = stats.captureSamples > 0 ? stats.captureMsTotal / stats.captureSamples : 0;
    const encodeAvg = stats.encodeSamples > 0 ? stats.encodeMsTotal / stats.encodeSamples : 0;
    return `avg render ${formatMs(renderAvg)} cap ${formatMs(captureAvg)} enc ${formatMs(encodeAvg)}`;
};

type ExportRuntimeInternals = {
    engine: AbstractEngine;
    camera: Camera;
    scene: Scene;
    mmdRuntime: {
        playAnimation: () => Promise<void>;
        pauseAnimation: () => void;
    };
};

type ExportQueueItem = {
    frame: number;
    videoSample: VideoSample;
};

type CapturedFrame = {
    width: number;
    height: number;
    rgbaData: Uint8Array;
};

type WebmVideoCodec = "vp9" | "vp8";
type WebmAudioCodec = "opus" | "vorbis";
type VideoHardwareAccelerationHint = "prefer-hardware" | "no-preference";
type SelectedWebmVideoEncoding = {
    codec: WebmVideoCodec;
    hardwareAcceleration: VideoHardwareAccelerationHint;
};

const TIMELINE_FPS = 30;

const waitForAnimationFrame = async (): Promise<void> => {
    await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
    });
};

const waitForAnimationFrames = async (count: number): Promise<void> => {
    const frames = Math.max(1, Math.floor(count));
    for (let i = 0; i < frames; i += 1) {
        await waitForAnimationFrame();
    }
};

const sleepMs = async (ms: number): Promise<void> => {
    const delay = Math.max(0, ms);
    await new Promise<void>((resolve) => {
        window.setTimeout(() => resolve(), delay);
    });
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
    let timeoutHandle = 0;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = window.setTimeout(() => {
            reject(new Error(`${label} timed out after ${timeoutMs} ms`));
        }, Math.max(1, timeoutMs));
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        window.clearTimeout(timeoutHandle);
    }
};

type ReusableFrameCapture = {
    captureFrameAsync: () => Promise<CapturedFrame | null>;
    dispose: () => void;
};

const flipRgbaRowsInPlace = (bytes: Uint8Array, width: number, height: number): void => {
    const rowStride = width * 4;
    const swapBuffer = new Uint8Array(rowStride);
    const halfRows = Math.floor(height / 2);
    for (let y = 0; y < halfRows; y += 1) {
        const topStart = y * rowStride;
        const bottomStart = (height - 1 - y) * rowStride;
        swapBuffer.set(bytes.subarray(topStart, topStart + rowStride));
        bytes.copyWithin(topStart, bottomStart, bottomStart + rowStride);
        bytes.set(swapBuffer, bottomStart);
    }
};

const createReusableFrameCapture = (
    exportInternals: ExportRuntimeInternals,
    width: number,
    height: number,
): ReusableFrameCapture => {
    const renderTarget = new RenderTargetTexture(
        "webm-export-capture",
        { width, height },
        exportInternals.scene,
        false,
        true,
    );
    renderTarget.activeCamera = exportInternals.camera;
    renderTarget.renderList = null;
    renderTarget.samples = 1;
    renderTarget.refreshRate = 1;
    renderTarget.ignoreCameraViewport = true;

    return {
        captureFrameAsync: async (): Promise<CapturedFrame | null> => {
            renderTarget.resetRefreshCounter();
            renderTarget.render(true);
            const pixelPromise = renderTarget.readPixels(0, 0, null, true, false, 0, 0, width, height);
            if (!pixelPromise) {
                return null;
            }

            const pixelData = await pixelPromise;
            const source = pixelData instanceof Uint8Array
                ? pixelData
                : new Uint8Array(pixelData.buffer, pixelData.byteOffset, pixelData.byteLength);
            const rgbaData = new Uint8Array(source);
            flipRgbaRowsInPlace(rgbaData, width, height);
            return {
                width,
                height,
                rgbaData,
            };
        },
        dispose: () => {
            renderTarget.dispose();
        },
    };
};

const selectWebmVideoEncoding = async (
    width: number,
    height: number,
    bitrate: number,
    preferredCodec: "auto" | WebmVideoCodec,
): Promise<SelectedWebmVideoEncoding | null> => {
    const codecOrder: WebmVideoCodec[] = preferredCodec === "auto"
        ? ["vp9", "vp8"]
        : [preferredCodec];
    for (const codec of codecOrder) {
        if (await canEncodeVideo(codec, {
            width,
            height,
            bitrate,
            hardwareAcceleration: "prefer-hardware",
        })) {
            return {
                codec,
                hardwareAcceleration: "prefer-hardware",
            };
        }
    }

    for (const codec of codecOrder) {
        if (await canEncodeVideo(codec, {
            width,
            height,
            bitrate,
            hardwareAcceleration: "no-preference",
        })) {
            return {
                codec,
                hardwareAcceleration: "no-preference",
            };
        }
    }

    for (const codec of codecOrder) {
        if (await canEncode(codec)) {
            return {
                codec,
                hardwareAcceleration: "no-preference",
            };
        }
    }

    return null;
};

const estimateVideoBitrate = (width: number, height: number, fps: number): number => {
    const megapixels = (width * height) / 1_000_000;
    const isHighFps = fps > 30;

    if (megapixels <= 2.2) {
        return isHighFps ? 12_000_000 : 8_000_000;
    }
    if (megapixels <= 3.8) {
        return isHighFps ? 24_000_000 : 16_000_000;
    }
    if (megapixels <= 8.6) {
        return isHighFps ? 53_000_000 : 35_000_000;
    }

    const bitratePerMegapixel = isHighFps ? 6_500_000 : 4_200_000;
    const fallbackBitrate = megapixels * bitratePerMegapixel;
    return Math.max(8_000_000, Math.min(80_000_000, Math.round(fallbackBitrate)));
};

const estimateAudioBitrate = (channelCount: number): number => {
    if (channelCount <= 1) {
        return 128_000;
    }
    return 192_000;
};

const selectWebmAudioCodec = async (
    channelCount: number,
    sampleRate: number,
    bitrate: number,
): Promise<WebmAudioCodec | null> => {
    if (await canEncodeAudio("opus", { numberOfChannels: channelCount, sampleRate, bitrate })) {
        return "opus";
    }
    if (await canEncodeAudio("vorbis", { numberOfChannels: channelCount, sampleRate, bitrate })) {
        return "vorbis";
    }
    return null;
};

const readFileAsArrayBuffer = async (filePath: string): Promise<ArrayBuffer | null> => {
    const buffer = await window.electronAPI.readBinaryFile(filePath);
    if (!buffer) {
        return null;
    }

    const bytes = buffer instanceof Uint8Array
        ? buffer
        : new Uint8Array(buffer as unknown as ArrayBuffer);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
};

const decodeAudioFile = async (filePath: string): Promise<AudioBuffer> => {
    const arrayBuffer = await readFileAsArrayBuffer(filePath);
    if (!arrayBuffer) {
        throw new Error(`Failed to read audio file: ${filePath}`);
    }

    const audioContext = new AudioContext();
    try {
        return await audioContext.decodeAudioData(arrayBuffer);
    } finally {
        try {
            await audioContext.close();
        } catch {
            // ignore close failures
        }
    }
};

const sliceAudioBuffer = (
    source: AudioBuffer,
    startSeconds: number,
    durationSeconds: number,
): AudioBuffer | null => {
    const sampleRate = Math.max(1, source.sampleRate);
    const startSample = Math.max(0, Math.floor(startSeconds * sampleRate));
    const endSample = Math.min(
        source.length,
        Math.ceil((startSeconds + Math.max(0, durationSeconds)) * sampleRate),
    );

    if (endSample <= startSample) {
        return null;
    }

    const slicedLength = endSample - startSample;
    const slicedBuffer = new AudioBuffer({
        length: slicedLength,
        numberOfChannels: source.numberOfChannels,
        sampleRate,
    });

    for (let channelIndex = 0; channelIndex < source.numberOfChannels; channelIndex += 1) {
        const channelData = source.getChannelData(channelIndex);
        slicedBuffer.copyToChannel(channelData.subarray(startSample, endSample), channelIndex, 0);
    }

    return slicedBuffer;
};

const finalizeWebmOutputWithDiagnostics = async (
    output: Output,
    callbacks: WebmExportCallbacks,
): Promise<void> => {
    const outputInternal = output as Output & {
        _finalizePromise?: Promise<void>;
        _tracks: Array<{ source: { _flushOrWaitForOngoingClose: (force: boolean) => Promise<void> } }>;
        _muxer: { finalize: () => Promise<void> };
        _writer: { flush: () => Promise<void>; finalize: () => Promise<void> };
        _mutex: { acquire: () => Promise<() => void> };
        state: string;
    };

    if (outputInternal.state === "pending") {
        throw new Error("Cannot finalize before starting.");
    }
    if (outputInternal.state === "canceled") {
        throw new Error("Cannot finalize after canceling.");
    }
    if (outputInternal._finalizePromise) {
        return outputInternal._finalizePromise;
    }

    outputInternal._finalizePromise = (async () => {
        outputInternal.state = "finalizing";
        updateStatus(callbacks, "Finalizing WebM: acquiring output mutex...", "finalizing");
        const release = await outputInternal._mutex.acquire();
        try {
            updateStatus(callbacks, "Finalizing WebM: flushing track sources...", "finalizing");
            await Promise.all(outputInternal._tracks.map((track) => track.source._flushOrWaitForOngoingClose(false)));
            updateStatus(callbacks, "Finalizing WebM: finalizing muxer...", "finalizing");
            await outputInternal._muxer.finalize();
            updateStatus(callbacks, "Finalizing WebM: flushing writer...", "finalizing");
            await outputInternal._writer.flush();
            updateStatus(callbacks, "Finalizing WebM: closing writer...", "finalizing");
            await outputInternal._writer.finalize();
            outputInternal.state = "finalized";
            updateStatus(callbacks, "Finalizing WebM: completed.", "finalizing");
        } finally {
            release();
        }
    })();

    return outputInternal._finalizePromise;
};

export async function runWebmExportJob(
    canvas: HTMLCanvasElement,
    request: WebmExportRequest,
    callbacks: WebmExportCallbacks = {},
): Promise<WebmExportResult> {
    if (!window.isSecureContext) {
        throw new Error("WebCodecs requires a secure context");
    }

    const startFrame = Math.max(0, Math.floor(request.startFrame));
    const endFrame = Math.max(startFrame, Math.floor(request.endFrame));
    const fps = Math.max(1, Math.floor(request.fps || 30));
    const outputWidth = Math.max(320, Math.min(8192, Math.floor(request.outputWidth || 1920)));
    const outputHeight = Math.max(180, Math.min(8192, Math.floor(request.outputHeight || 1080)));
    const timelineFrameCount = endFrame - startFrame + 1;
    if (timelineFrameCount <= 0) {
        throw new Error("No frames to export");
    }
    const totalFrames = Math.max(1, Math.round((timelineFrameCount / TIMELINE_FPS) * fps));
    const exportDurationSeconds = totalFrames / fps;

    const maxQueueLength = 16;
    const frameDuration = 1 / fps;

    updateStatus(callbacks, "Initializing WebM export renderer...", "initializing");
    const mmdManager = await MmdManager.create(canvas);

    try {
        updateStatus(callbacks, "Loading project into export renderer...", "loading-project");
        const importResult = await mmdManager.importProjectState(request.project, { forExport: true });
        const expectedModelCount = request.project.scene.models.length;
        if (importResult.loadedModels < expectedModelCount) {
            const warningText = importResult.warnings.slice(0, 3).join(" | ");
            throw new Error(
                `Project load incomplete (${importResult.loadedModels}/${expectedModelCount}). ${warningText}`
            );
        }

        mmdManager.setTimelineTarget("camera");
        await waitForAnimationFrames(1);
        mmdManager.pause();
        mmdManager.setAutoRenderEnabled(false);
        mmdManager.seekTo(startFrame);

        const videoBitrate = estimateVideoBitrate(outputWidth, outputHeight, fps);

        updateStatus(callbacks, "Checking WebM codec support...", "checking-codec");
        const selectedVideoEncoding = await selectWebmVideoEncoding(
            outputWidth,
            outputHeight,
            videoBitrate,
            request.preferredVideoCodec === "vp8" || request.preferredVideoCodec === "vp9"
                ? request.preferredVideoCodec
                : "auto",
        );
        if (!selectedVideoEncoding) {
            throw new Error("No supported WebM codec available (vp9/vp8)");
        }
        const { codec, hardwareAcceleration } = selectedVideoEncoding;

        let audioSource: AudioBufferSource | null = null;
        let audioSegment: AudioBuffer | null = null;
        let audioCodec: WebmAudioCodec | null = null;
        let audioSourceClosed = false;
        if (request.includeAudio && request.audioFilePath) {
            updateStatus(callbacks, "Decoding audio for WebM track...", "loading-project");
            const decodedAudio = await decodeAudioFile(request.audioFilePath);
            audioSegment = sliceAudioBuffer(
                decodedAudio,
                startFrame / TIMELINE_FPS,
                exportDurationSeconds,
            );
            if (!audioSegment) {
                throw new Error("Audio segment is empty for the selected export range");
            }

            const audioBitrate = estimateAudioBitrate(audioSegment.numberOfChannels);
            audioCodec = await selectWebmAudioCodec(
                audioSegment.numberOfChannels,
                audioSegment.sampleRate,
                audioBitrate,
            );
            if (!audioCodec) {
                throw new Error("No supported WebM audio codec available (opus/vorbis)");
            }

            audioSource = new AudioBufferSource({
                codec: audioCodec,
                bitrate: audioBitrate,
            });
        }

        const exportRuntimeInternals = mmdManager as unknown as ExportRuntimeInternals;
        const reusableFrameCapture = createReusableFrameCapture(exportRuntimeInternals, outputWidth, outputHeight);
        updateStatus(callbacks, "Opening WebM output file...", "opening-output");
        const saveSession = await window.electronAPI.beginWebmStreamSave(request.outputFilePath);
        if (!saveSession) {
            throw new Error("Failed to open WebM output file");
        }

        let saveSessionId: string | null = saveSession.saveId;
        let savedPath: string | null = null;
        let outputBytes = 0;
        const target = new StreamTarget(new WritableStream({
            write: async (chunk) => {
                if (!saveSessionId) {
                    throw new Error("WebM output stream is not open");
                }
                const written = await window.electronAPI.writeWebmStreamChunk(
                    saveSessionId,
                    chunk.data,
                    chunk.position,
                );
                if (!written) {
                    throw new Error("Failed to write WebM output chunk");
                }
                outputBytes = Math.max(outputBytes, chunk.position + chunk.data.byteLength);
            },
            close: async () => {
                if (!saveSessionId) {
                    return;
                }
                const finishedPath = await window.electronAPI.finishWebmStreamSave(saveSessionId);
                saveSessionId = null;
                if (!finishedPath) {
                    throw new Error("Failed to finalize WebM output file");
                }
                savedPath = finishedPath;
            },
            abort: async () => {
                if (!saveSessionId) {
                    return;
                }
                await window.electronAPI.cancelWebmStreamSave(saveSessionId);
                saveSessionId = null;
            },
        }), {
            chunked: true,
            chunkSize: 4 * 1024 * 1024,
        });
        const output = new Output({
            format: new WebMOutputFormat(),
            target,
        });
        let encoderConfigSummary = `${codec}/${hardwareAcceleration}`;
        const videoSource = new VideoSampleSource({
            codec,
            bitrate: videoBitrate,
            keyFrameInterval: 5,
            hardwareAcceleration,
            onEncoderConfig: (config) => {
                encoderConfigSummary = `${config.codec} ${config.width}x${config.height} ${config.hardwareAcceleration ?? "no-preference"}`;
            },
        });

        const queue: ExportQueueItem[] = [];
        let producerDone = false;
        let fatalError: Error | null = null;
        let encodedFrames = 0;
        let capturedFrames = 0;
        const performanceStats: ExportPerformanceStats = {
            renderMsTotal: 0,
            captureMsTotal: 0,
            encodeMsTotal: 0,
            renderSamples: 0,
            captureSamples: 0,
            encodeSamples: 0,
        };

        const reportProgress = (frame: number): void => {
            updateStatus(
                callbacks,
                `Exporting ${encodedFrames}/${totalFrames} encoded (${capturedFrames}/${totalFrames} captured, q=${queue.length}) ${buildPerformanceSummary(performanceStats)} ${encoderConfigSummary}`,
                "encoding",
            );
            callbacks.onProgress?.(encodedFrames, totalFrames, frame, capturedFrames);
        };

        const consumeQueue = async (): Promise<void> => {
            while (!producerDone || queue.length > 0) {
                if (fatalError) break;
                const item = queue.shift();
                if (!item) {
                    await sleepMs(1);
                    continue;
                }

                try {
                    const encodeStart = performance.now();
                    await videoSource.add(item.videoSample);
                    performanceStats.encodeMsTotal += performance.now() - encodeStart;
                    performanceStats.encodeSamples += 1;
                } finally {
                    item.videoSample.close();
                }

                encodedFrames += 1;
                reportProgress(item.frame);
            }
        };

        let started = false;
        let sourceClosed = false;
        try {
            output.addVideoTrack(videoSource, {
                frameRate: fps,
                maximumPacketCount: totalFrames,
            });
            if (audioSource) {
                output.addAudioTrack(audioSource);
            }
            await output.start();
            started = true;

            if (audioSource) {
                if (!audioSegment) {
                    throw new Error("Audio segment missing for WebM export");
                }
                updateStatus(callbacks, `Encoding audio track (${audioCodec ?? "unknown"})...`, "encoding");
                await audioSource.add(audioSegment);
                audioSource.close();
                audioSourceClosed = true;
            }

            const videoPathLabel = hardwareAcceleration === "prefer-hardware"
                ? `${codec} hw-preferred`
                : `${codec} fallback`;
            const codecLabel = audioCodec ? `${videoPathLabel} + ${audioCodec}` : videoPathLabel;
            updateStatus(callbacks, `Encoding ${totalFrames} frame(s) to WebM (${codecLabel})... ${encoderConfigSummary}`, "encoding");
            const consumerPromise = consumeQueue();

            try {
                let playbackStarted = false;
                for (let outputFrameIndex = 0; outputFrameIndex < totalFrames; outputFrameIndex += 1) {
                    if (fatalError) break;

                    while (queue.length >= maxQueueLength && !fatalError) {
                        await sleepMs(1);
                    }
                    if (fatalError) break;

                    const frame = Math.min(
                        endFrame,
                        startFrame + Math.round((outputFrameIndex * TIMELINE_FPS) / fps),
                    );
                    const renderStart = performance.now();
                    if (!playbackStarted) {
                        mmdManager.renderOnce(0);
                        playbackStarted = true;
                    } else {
                        await exportRuntimeInternals.mmdRuntime.playAnimation();
                        mmdManager.renderOnce(1000 / fps);
                        exportRuntimeInternals.mmdRuntime.pauseAnimation();
                    }
                    performanceStats.renderMsTotal += performance.now() - renderStart;
                    performanceStats.renderSamples += 1;

                    const captureStart = performance.now();
                    let videoSample: VideoSample | null = null;
                    try {
                        const capturedFrame = await reusableFrameCapture.captureFrameAsync();
                        if (!capturedFrame) {
                            fatalError = new Error(`Failed to capture frame ${frame}`);
                        } else {
                            videoSample = new VideoSample(capturedFrame.rgbaData, {
                                format: "RGBA",
                                codedWidth: capturedFrame.width,
                                codedHeight: capturedFrame.height,
                                timestamp: outputFrameIndex / fps,
                                duration: frameDuration,
                            });
                        }
                    } catch (error: unknown) {
                        fatalError = error instanceof Error
                            ? error
                            : new Error(`Failed to capture frame ${frame}: ${String(error)}`);
                    }
                    performanceStats.captureMsTotal += performance.now() - captureStart;
                    performanceStats.captureSamples += 1;
                    if (!videoSample) {
                        fatalError ??= new Error(`Failed to capture frame ${frame}`);
                        break;
                    }

                    queue.push({
                        frame,
                        videoSample,
                    });
                    capturedFrames += 1;
                }
            } finally {
                producerDone = true;
                await consumerPromise;
            }

            if (fatalError) {
                throw fatalError;
            }

            updateStatus(callbacks, `Closing WebM track (${codec})...`, "closing-track");
            videoSource.close();
            sourceClosed = true;

            updateStatus(callbacks, `Finalizing WebM (${codec})...`, "finalizing");
            await withTimeout(finalizeWebmOutputWithDiagnostics(output, callbacks), 15_000, "WebM finalize");
            if (!savedPath) {
                throw new Error("Failed to save WebM file");
            }

            return {
                encodedFrames,
                totalFrames,
                codec,
                outputBytes,
            };
        } finally {
            if (started && output.state !== "finalized" && output.state !== "canceled") {
                try {
                    if (!sourceClosed) {
                        videoSource.close();
                    }
                } catch {
                    // ignore cleanup failures
                }
                try {
                    if (audioSource && !audioSourceClosed) {
                        audioSource.close();
                    }
                } catch {
                    // ignore cleanup failures
                }
                try {
                    await withTimeout(output.cancel(), 5_000, "WebM cancel");
                } catch {
                    // ignore cleanup failures
                }
            }
            if (saveSessionId) {
                try {
                    await window.electronAPI.cancelWebmStreamSave(saveSessionId);
                } catch {
                    // ignore cleanup failures
                }
                saveSessionId = null;
            }
            while (queue.length > 0) {
                const queued = queue.shift();
                queued?.videoSample.close();
            }
            reusableFrameCapture.dispose();
        }
    } finally {
        // This exporter runs in a dedicated hidden window. Synchronous Babylon / physics disposal can stall
        // the renderer after the file is already finalized, so let window teardown reclaim these resources.
    }
}
