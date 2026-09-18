// MMD_modoki の最終ボーン姿勢を Blender アドオンへ渡すレンダラー側処理。
//
// 役割は「どのフレームを、どう進めて、どう読み出すか」のオーケストレーション。
// 実際の読み出しは pose-sampler.ts、wire形式は pose-bridge-protocol.ts、
// エンジン内部（描画なしステップ）は MmdManager.stepPoseSimulation が担当する。
//
// 方針:
// - MMD_modoki の描画は同期に不要なので、フルレンダーはせず stepPoseSimulation で進める。
// - 物理は前方向に 1 フレームずつ積算する。大きく戻る/飛ぶシークは既存の seekTo に
//   フォールバックする（物理は再初期化される）。

import type { PoseBridgeModelSummary, PoseBridgeRequest } from "../shared/pose-bridge-contract";
import { readBoneNames, readBonePose, type SceneModelLike } from "./pose-sampler";

const TIMELINE_FPS = 30;
/** これを超える前進ジャンプはフレーム送りではなく既存シークへフォールバックする。 */
const MAX_FORWARD_STEPS = 240;

type PoseBridgeHost = {
    pause(): void;
    seekTo(frame: number): void;
    stepPoseSimulation(deltaMs: number): void;
    getPhysicsEnabled(): boolean;
    setPhysicsEnabled(enabled: boolean): boolean;
    setExternalPlaybackSimulationEnabled(enabled: boolean): boolean;
    setExternalPlaybackFrame(frame: number): number;
    setAutoRenderEnabled?(enabled: boolean): void;
    getLoadedModels(): PoseBridgeModelSummary[];
    readonly currentFrame: number;
    readonly totalFrames: number;
    mmdRuntime?: { playAnimation(): Promise<unknown> | unknown; pauseAnimation(): void };
    sceneModels?: SceneModelLike[];
};

let simulationFrame = -1;
let externalSimulationEnabled = false;

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
    // MMD_modoki 側の自動レンダーと競合しないよう止めて、手動ステップに一本化する。
    host.setAutoRenderEnabled?.(false);
    host.setExternalPlaybackSimulationEnabled(true);
    externalSimulationEnabled = true;
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

async function stepSimulation(host: PoseBridgeHost, targetFrame: number): Promise<void> {
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
    await runtime.playAnimation();
    const deltaMs = 1000 / TIMELINE_FPS;
    for (let frame = simulationFrame + 1; frame <= targetFrame; frame += 1) {
        host.setExternalPlaybackFrame(frame);
        host.stepPoseSimulation(deltaMs);
    }
    runtime.pauseAnimation();
    simulationFrame = targetFrame;
}

export async function handlePoseBridgeRequest(host: PoseBridgeHost, request: PoseBridgeRequest): Promise<unknown> {
    switch (request.command) {
        case "health": {
            return {
                ok: true,
                frame: host.currentFrame,
                totalFrames: host.totalFrames,
                models: host.getLoadedModels(),
            };
        }
        case "bones": {
            const { model, entry } = pickModel(host);
            return { modelInstanceId: model.instanceId, bones: readBoneNames(entry) };
        }
        case "pose": {
            const rawFrame = Number(request.payload.frame);
            if (!Number.isFinite(rawFrame)) throw new Error("frame が不正です");
            const targetFrame = Math.max(0, Math.floor(rawFrame));
            const { entry } = pickModel(host);
            host.pause();

            const stepStarted = performance.now();
            await stepSimulation(host, targetFrame);
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
