// MMD_modoki の最終ボーン姿勢を Blender アドオンへ渡すレンダラー側処理。
//
// 役割分担:
// - MMD_modoki が権威。物理を進めるのは MMD_modoki だけ（Blender は進めない）。
// - /playback: Blender の再生開始・停止。開始時は開始フレームへ移動する。
// - Blender 再生中: MMD は通常描画を止め、代わりに「描画なしのステップ」を回して物理とアニメを進める。
//   描画を止めることで renderer が空き、/pose の応答が速くなる（描画と姿勢取得の取り合いを避ける）。
// - /pose（再生中）: いまの姿勢を読むだけ。
// - /pose（停止中）: 指定フレームまで前進ステップして返す（シーク・書き出し用の厳密経路）。
//
// Phase 1（計測）: 再生中に「MMD の時計のロス」と「Blender と MMD のフレーム番号の差」を
// 1秒ごとにアプリログへ出す。

import { logInfo } from "../app-logger";
import type { PoseBridgeModelSummary, PoseBridgeRequest } from "../shared/pose-bridge-contract";
import { readBoneNames, readBonePose, type SceneModelLike } from "./pose-sampler";

const TIMELINE_FPS = 30;
/** これを超える前進ジャンプはフレーム送りではなく既存シークへフォールバックする。 */
const MAX_FORWARD_STEPS = 240;
/** 計測ログの出力間隔(ms)。 */
const METRIC_INTERVAL_MS = 1000;
/** 描画なしステップの間隔(ms)。実経過時間を測って進めるので、間隔は目安。 */
const PLAYBACK_INTERVAL_MS = 1000 / 30;
/** 1ティックで進める時間の上限。タブ非アクティブ等の大きな間隔で暴走しないため。 */
const MAX_TICK_DELTA_MS = 100;

type PoseBridgeHost = {
    play(): void;
    pause(): void;
    seekTo(frame: number): void;
    stepPoseSimulation(deltaMs: number): void;
    getPhysicsEnabled(): boolean;
    setPhysicsEnabled(enabled: boolean): boolean;
    setExternalPlaybackSimulationEnabled(enabled: boolean): boolean;
    setExternalPlaybackFrame(frame: number): number;
    setAutoRenderEnabled?(enabled: boolean): void;
    isAutoRenderEnabled?(): boolean;
    getRenderFpsLimit?(): number;
    getLoadedModels(): PoseBridgeModelSummary[];
    readonly currentFrame: number;
    readonly totalFrames: number;
    readonly isPlaying: boolean;
    mmdRuntime?: {
        playAnimation(): Promise<unknown> | unknown;
        pauseAnimation(): void;
        readonly currentFrameTime?: number;
    };
    sceneModels?: SceneModelLike[];
};

let simulationFrame = -1;
let externalSimulationEnabled = false;
let playbackActive = false;
let playbackTimerId = 0;
let playbackLastMs = 0;
let playbackRangeStart = 0;
let playbackRangeEnd: number | null = null;

/** 再生中の計測値。Phase 1 の調査用。 */
type PlaybackMetrics = {
    startedAtMs: number;
    startFrame: number;
    poseCount: number;
    blenderFrame: number | null;
    diffMin: number | null;
    diffMax: number | null;
    lastPoseAtMs: number;
    maxPoseIntervalMs: number;
    intervalsMs: number[];
    timerId: number;
};

let metrics: PlaybackMetrics | null = null;

function readFrameTime(host: PoseBridgeHost): number | null {
    const value = host.mmdRuntime?.currentFrameTime;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function percentile(values: number[], ratio: number): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(ratio * sorted.length) - 1));
    return sorted[index];
}

function pickModel(host: PoseBridgeHost): { model: PoseBridgeModelSummary; entry: SceneModelLike } {
    const models = host.getLoadedModels();
    if (models.length === 0) {
        throw new Error("MMDモデルが読み込まれていません");
    }
    const model = models.find(item => item.active) ?? models[0];
    const entry = host.sceneModels?.[model.index];
    if (!entry) throw new Error("モデルの内部状態を取得できませんでした");
    return { model, entry };
}

function enableExternalSimulation(host: PoseBridgeHost): void {
    if (externalSimulationEnabled) return;
    // 描画ループと手動ステップが物理を二重に進めないよう、自動レンダーを止める。
    host.setAutoRenderEnabled?.(false);
    host.setExternalPlaybackSimulationEnabled(true);
    externalSimulationEnabled = true;
}

function restoreNormalSimulation(host: PoseBridgeHost): void {
    if (externalSimulationEnabled) {
        host.setExternalPlaybackSimulationEnabled(false);
        externalSimulationEnabled = false;
    }
    host.setAutoRenderEnabled?.(true);
}

function ensurePhysicsEnabled(host: PoseBridgeHost): void {
    if (host.getPhysicsEnabled()) return;
    // scene.physicsEnabled は物理コントローラの enabled と AND なので、
    // 外部プレイバックだけでは物理が動かない。姿勢取得では物理を有効化する。
    host.setPhysicsEnabled(true);
    simulationFrame = -1;
}

function hardSeek(host: PoseBridgeHost, targetFrame: number): void {
    host.seekTo(targetFrame);
    enableExternalSimulation(host);
    host.stepPoseSimulation(0);
    simulationFrame = targetFrame;
}

function stepSimulation(host: PoseBridgeHost, targetFrame: number): void {
    const current = host.currentFrame;
    if (current !== simulationFrame) {
        // GUI 操作などで外からフレームが動いた場合は実状態に合わせ直す。
        simulationFrame = current;
    }

    ensurePhysicsEnabled(host);

    const gap = targetFrame - simulationFrame;
    if (simulationFrame < 0 || gap < 0 || gap > MAX_FORWARD_STEPS) {
        hardSeek(host, targetFrame);
        return;
    }
    if (gap === 0) {
        enableExternalSimulation(host);
        host.stepPoseSimulation(0);
        return;
    }

    const runtime = host.mmdRuntime;
    if (!runtime) {
        hardSeek(host, targetFrame);
        return;
    }

    enableExternalSimulation(host);
    // beforePhysics は pause 中だとフレームを進めない。前方向ステップの間だけ再生状態にする。
    void runtime.playAnimation();
    const deltaMs = 1000 / TIMELINE_FPS;
    for (let frame = simulationFrame + 1; frame <= targetFrame; frame += 1) {
        host.setExternalPlaybackFrame(frame);
        host.stepPoseSimulation(deltaMs);
    }
    runtime.pauseAnimation();
    simulationFrame = targetFrame;
}

function logPlaybackMetric(host: PoseBridgeHost): void {
    const state = metrics;
    if (!state) return;
    const elapsedMs = performance.now() - state.startedAtMs;
    const frameTime = readFrameTime(host);
    // 実時間どおりに進んでいれば到達するはずのフレーム。
    const expectedFrame = state.startFrame + (elapsedMs / 1000) * TIMELINE_FPS;
    const loss = frameTime === null ? null : expectedFrame - frameTime;
    const p95 = percentile(state.intervalsMs, 0.95);
    logInfo("performance", "pose-sync metric", {
        elapsedMs: Math.round(elapsedMs),
        startFrame: state.startFrame,
        mmdFrameTime: frameTime === null ? null : Math.round(frameTime * 100) / 100,
        timeLossFrames: loss === null ? null : Math.round(loss * 100) / 100,
        poseCount: state.poseCount,
        blenderFrame: state.blenderFrame,
        diffMin: state.diffMin,
        diffMax: state.diffMax,
        poseIntervalMsMax: Math.round(state.maxPoseIntervalMs),
        poseIntervalMsP95: p95 === null ? null : Math.round(p95),
        playing: playbackActive,
        autoRender: host.isAutoRenderEnabled?.() ?? null,
        renderFpsLimit: host.getRenderFpsLimit?.() ?? null,
    });
}

function recordPlaybackPose(host: PoseBridgeHost, blenderFrame: number): void {
    const state = metrics;
    if (!state) return;
    const now = performance.now();
    if (state.lastPoseAtMs > 0) {
        const intervalMs = now - state.lastPoseAtMs;
        state.maxPoseIntervalMs = Math.max(state.maxPoseIntervalMs, intervalMs);
        state.intervalsMs.push(intervalMs);
    }
    state.lastPoseAtMs = now;
    state.poseCount += 1;
    const frameTime = readFrameTime(host);
    if (frameTime === null) return;
    const diff = blenderFrame - Math.floor(frameTime);
    state.blenderFrame = blenderFrame;
    state.diffMin = state.diffMin === null ? diff : Math.min(state.diffMin, diff);
    state.diffMax = state.diffMax === null ? diff : Math.max(state.diffMax, diff);
}

function clearPlaybackMetrics(): void {
    if (!metrics) return;
    if (metrics.timerId) window.clearInterval(metrics.timerId);
    metrics = null;
}

function beginPlaybackMetrics(host: PoseBridgeHost): void {
    clearPlaybackMetrics();
    const state: PlaybackMetrics = {
        startedAtMs: performance.now(),
        startFrame: host.currentFrame,
        poseCount: 0,
        blenderFrame: null,
        diffMin: null,
        diffMax: null,
        lastPoseAtMs: 0,
        maxPoseIntervalMs: 0,
        intervalsMs: [],
        timerId: 0,
    };
    metrics = state;
    state.timerId = window.setInterval(() => metricTick(host), METRIC_INTERVAL_MS);
    logInfo("performance", "pose-sync playback start", { frame: host.currentFrame });
}

function metricTick(host: PoseBridgeHost): void {
    logPlaybackMetric(host);
}

function playbackTick(host: PoseBridgeHost): void {
    if (!playbackActive) return;
    // ユーザーが MMD_modoki 側で停止した場合は、こちらのステップも止める。
    if (!host.isPlaying) {
        stopPlayback(host);
        return;
    }
    const frameTime = readFrameTime(host);
    if (playbackRangeEnd !== null && frameTime !== null && Math.floor(frameTime) >= playbackRangeEnd) {
        // Blender の再生範囲の最後に達したら、範囲の先頭へ戻る（Blender のループに合わせる）。
        host.seekTo(playbackRangeStart);
        playbackLastMs = performance.now();
        return;
    }
    const now = performance.now();
    const deltaMs = Math.min(MAX_TICK_DELTA_MS, Math.max(0, now - playbackLastMs));
    playbackLastMs = now;
    try {
        host.stepPoseSimulation(deltaMs);
        const stepped = readFrameTime(host);
        if (stepped !== null) host.setExternalPlaybackFrame(Math.floor(stepped));
    } catch (error) {
        stopPlayback(host);
        throw error;
    }
}

function startPlayback(host: PoseBridgeHost, frame: number | undefined, rangeStart: number | undefined, rangeEnd: number | undefined): void {
    if (playbackTimerId) window.clearInterval(playbackTimerId);
    playbackTimerId = 0;
    restoreNormalSimulation(host);
    if (typeof frame === "number" && frame !== host.currentFrame) {
        host.seekTo(frame);
    }
    host.play();
    // 描画を止め、手動ステップだけで物理とアニメを進める。
    enableExternalSimulation(host);
    playbackActive = true;
    playbackRangeStart = typeof rangeStart === "number" ? rangeStart : 0;
    playbackRangeEnd = typeof rangeEnd === "number" && rangeEnd > playbackRangeStart ? rangeEnd : null;
    simulationFrame = -1;
    playbackLastMs = performance.now();
    playbackTimerId = window.setInterval(() => playbackTick(host), PLAYBACK_INTERVAL_MS);
    beginPlaybackMetrics(host);
}

function stopPlayback(host: PoseBridgeHost): void {
    if (!playbackActive) return;
    playbackActive = false;
    playbackRangeEnd = null;
    if (playbackTimerId) window.clearInterval(playbackTimerId);
    playbackTimerId = 0;
    host.pause();
    restoreNormalSimulation(host);
    logPlaybackMetric(host);
    clearPlaybackMetrics();
    simulationFrame = -1;
    logInfo("performance", "pose-sync playback stop", { frame: host.currentFrame });
}

export async function handlePoseBridgeRequest(host: PoseBridgeHost, request: PoseBridgeRequest): Promise<unknown> {
    switch (request.command) {
        case "health": {
            return {
                ok: true,
                frame: host.currentFrame,
                totalFrames: host.totalFrames,
                playing: playbackActive,
                models: host.getLoadedModels(),
            };
        }
        case "bones": {
            const { model, entry } = pickModel(host);
            return { modelInstanceId: model.instanceId, bones: readBoneNames(entry) };
        }
        case "playback": {
            const playing = request.payload.playing === true;
            const rawFrame = Number(request.payload.frame);
            const frame = Number.isFinite(rawFrame) ? Math.max(0, Math.floor(rawFrame)) : undefined;
            const rawStart = Number(request.payload.frameStart);
            const rangeStart = Number.isFinite(rawStart) ? Math.max(0, Math.floor(rawStart)) : undefined;
            const rawEnd = Number(request.payload.frameEnd);
            const rangeEnd = Number.isFinite(rawEnd) ? Math.max(0, Math.floor(rawEnd)) : undefined;
            if (playing) startPlayback(host, frame, rangeStart, rangeEnd);
            else stopPlayback(host);
            return { playing: playbackActive, frame: host.currentFrame };
        }
        case "pose": {
            const rawFrame = Number(request.payload.frame);
            if (!Number.isFinite(rawFrame)) throw new Error("frame が不正です");
            const targetFrame = Math.max(0, Math.floor(rawFrame));
            const { entry } = pickModel(host);

            if (playbackActive) {
                // 再生中: tick がシミュレーションを進めている。ここでは読むだけ。
                recordPlaybackPose(host, targetFrame);
                const readStarted = performance.now();
                const data = readBonePose(entry);
                const readMs = performance.now() - readStarted;
                const frameTime = readFrameTime(host);
                return {
                    frame: frameTime === null ? host.currentFrame : Math.floor(frameTime),
                    data,
                    timings: { stepMs: 0, readMs: Math.round(readMs) },
                };
            }

            host.pause();
            const stepStarted = performance.now();
            stepSimulation(host, targetFrame);
            const stepMs = performance.now() - stepStarted;

            const readStarted = performance.now();
            const data = readBonePose(entry);
            const readMs = performance.now() - readStarted;
            return {
                frame: host.currentFrame,
                data,
                timings: { stepMs: Math.round(stepMs), readMs: Math.round(readMs) },
            };
        }
        default:
            throw new Error(`未知のコマンドです: ${String(request.command)}`);
    }
}

export function installPoseBridgeRenderer(mmdManager: unknown): void {
    const api = window.electronAPI?.poseBridge;
    if (!api) return;
    const host = mmdManager as unknown as PoseBridgeHost;
    api.onRequest(request => {
        void (async () => {
            try {
                const result = await handlePoseBridgeRequest(host, request);
                api.reply({ requestId: request.requestId, result });
            } catch (error) {
                api.reply({
                    requestId: request.requestId,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        })();
    });
}
