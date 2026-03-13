import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { Scene } from "@babylonjs/core/scene";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { StreamTarget, canEncode, Output, VideoSample, VideoSampleSource, WebMOutputFormat } from "mediabunny";
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

const updateStatus = (
    callbacks: WebmExportCallbacks,
    message: string,
    phase: WebmExportPhase,
): void => {
    callbacks.onStatus?.(message, phase);
};

type ScreenshotInternals = {
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
    timestamp: number;
    duration: number;
    width: number;
    height: number;
    rgbaData: Uint8Array;
};

type WebmVideoCodec = "vp9" | "vp8";

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

type ReusableFrameCapture = {
    captureFrameAsync: () => Promise<{ width: number; height: number; rgbaData: Uint8Array } | null>;
    dispose: () => void;
};

const createReusableFrameCapture = (
    screenshotInternals: ScreenshotInternals,
    outputWidth: number,
    outputHeight: number,
): ReusableFrameCapture => {
    const renderTarget = new RenderTargetTexture(
        "webm-export-capture",
        { width: outputWidth, height: outputHeight },
        screenshotInternals.scene,
        false,
        true,
    );
    renderTarget.activeCamera = screenshotInternals.camera;
    renderTarget.renderList = null;
    renderTarget.samples = 1;
    renderTarget.refreshRate = 1;
    renderTarget.ignoreCameraViewport = true;

    const captureFrameAsync = async (): Promise<{ width: number; height: number; rgbaData: Uint8Array } | null> => {
        renderTarget.resetRefreshCounter();
        renderTarget.render(true);
        const pixelPromise = renderTarget.readPixels(0, 0, null, true, false, 0, 0, outputWidth, outputHeight);
        if (!pixelPromise) {
            return null;
        }

        const pixelData = await pixelPromise;
        const source = pixelData instanceof Uint8Array
            ? pixelData
            : new Uint8Array(pixelData.buffer, pixelData.byteOffset, pixelData.byteLength);
        const rgbaData = new Uint8Array(source);
        flipRgbaRowsInPlace(rgbaData, outputWidth, outputHeight);
        return {
            width: outputWidth,
            height: outputHeight,
            rgbaData,
        };
    };

    return {
        captureFrameAsync,
        dispose: () => {
            renderTarget.dispose();
        },
    };
};

const selectWebmCodec = async (): Promise<WebmVideoCodec | null> => {
    if (await canEncode("vp8")) {
        return "vp8";
    }
    if (await canEncode("vp9")) {
        return "vp9";
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
    const totalFrames = endFrame - startFrame + 1;
    if (totalFrames <= 0) {
        throw new Error("No frames to export");
    }

    const maxQueueLength = 8;
    const frameDuration = 1 / fps;

    updateStatus(callbacks, "Initializing WebM export renderer...", "initializing");
    const mmdManager = await MmdManager.create(canvas);

    try {
        updateStatus(callbacks, "Loading project into export renderer...", "loading-project");
        const importResult = await mmdManager.importProjectState(request.project);
        const expectedModelCount = request.project.scene.models.length;
        if (importResult.loadedModels < expectedModelCount) {
            const warningText = importResult.warnings.slice(0, 3).join(" | ");
            throw new Error(
                `Project load incomplete (${importResult.loadedModels}/${expectedModelCount}). ${warningText}`
            );
        }

        mmdManager.setTimelineTarget("camera");
        await waitForAnimationFrames(3);
        mmdManager.pause();
        mmdManager.setAutoRenderEnabled(false);
        mmdManager.seekTo(startFrame);

        updateStatus(callbacks, "Checking WebM codec support...", "checking-codec");
        const codec = await selectWebmCodec();
        if (!codec) {
            throw new Error("No supported WebM codec available (vp9/vp8)");
        }

        const screenshotInternals = mmdManager as unknown as ScreenshotInternals;
        const reusableFrameCapture = createReusableFrameCapture(
            screenshotInternals,
            outputWidth,
            outputHeight,
        );
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
        const videoSource = new VideoSampleSource({
            codec,
            bitrate: estimateVideoBitrate(outputWidth, outputHeight, fps),
            keyFrameInterval: 5,
        });

        const queue: ExportQueueItem[] = [];
        let producerDone = false;
        let fatalError: Error | null = null;
        let encodedFrames = 0;
        let capturedFrames = 0;

        const reportProgress = (frame: number): void => {
            updateStatus(
                callbacks,
                `Exporting ${encodedFrames}/${totalFrames} encoded (${capturedFrames}/${totalFrames} captured, q=${queue.length})`,
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

                const videoSample = new VideoSample(item.rgbaData, {
                    format: "RGBA",
                    codedWidth: item.width,
                    codedHeight: item.height,
                    timestamp: item.timestamp,
                    duration: item.duration,
                });

                try {
                    await videoSource.add(videoSample);
                } finally {
                    videoSample.close();
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
            await output.start();
            started = true;

            updateStatus(callbacks, `Encoding ${totalFrames} frame(s) to WebM (${codec})...`, "encoding");
            const consumerPromise = consumeQueue();

            try {
                let playbackStarted = false;
                for (let frame = startFrame; frame <= endFrame; frame += 1) {
                    if (fatalError) break;

                    while (queue.length >= maxQueueLength && !fatalError) {
                        await sleepMs(1);
                    }
                    if (fatalError) break;

                    if (!playbackStarted) {
                        mmdManager.renderOnce(0);
                        playbackStarted = true;
                    } else {
                        await screenshotInternals.mmdRuntime.playAnimation();
                        mmdManager.renderOnce(1000 / fps);
                        screenshotInternals.mmdRuntime.pauseAnimation();
                    }

                    const capturedFrame = await reusableFrameCapture.captureFrameAsync();
                    if (!capturedFrame) {
                        fatalError = new Error(`Failed to capture frame ${frame}`);
                        break;
                    }

                    queue.push({
                        frame,
                        timestamp: (frame - startFrame) / fps,
                        duration: frameDuration,
                        width: capturedFrame.width,
                        height: capturedFrame.height,
                        rgbaData: capturedFrame.rgbaData,
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
            await withTimeout(videoSource.close(), 15_000, "WebM video source close");
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
                        await withTimeout(videoSource.close(), 3_000, "WebM video source close");
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
            reusableFrameCapture.dispose();
        }
    } finally {
        // This exporter runs in a dedicated hidden window. Synchronous Babylon / physics disposal can stall
        // the renderer after the file is already finalized, so let window teardown reclaim these resources.
    }
}
