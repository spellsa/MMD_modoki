// MMD_modoki の最終ボーン姿勢を Blender アドオンへ返すレンダラー側処理。
//
// - 姿勢は rest 相対ローカル位置 + ローカル回転クォータニオン。
// - 物理は WebM 出力と同じ外部プレイバックで前方向に 1 フレームずつ進めて積算する。
//   seekAnimation だけでは Bullet の結果にならないため。
// - 大きく戻る／大きく飛ぶシークは既存の seekTo にフォールバックする（物理は再初期化）。
//
// 外部に公開するのは /health と /pose のみ。アドオンはこの 2 つしか使わない。

import { Matrix, Quaternion, Vector3 } from "@babylonjs/core";
import type { PoseBridgeBonePose, PoseBridgeModelSummary, PoseBridgeRequest } from "../shared/pose-bridge-contract";

const TIMELINE_FPS = 30;
/** これを超える前進ジャンプはフレーム送りではなく既存シークへフォールバックする。 */
const MAX_FORWARD_STEPS = 240;

type RuntimeBoneLike = {
    name: string;
    parentBone?: RuntimeBoneLike | null;
    getWorldMatrixToRef?(target: Matrix): Matrix;
    linkedBone?: {
        getRestMatrix(): Matrix;
    } | null;
};

type SceneModelLike = {
    model: { runtimeBones?: readonly RuntimeBoneLike[] };
    info: {
        instanceId: string;
        name: string;
        boneNames: string[];
    };
};

type PoseBridgeHost = {
    pause(): void;
    seekTo(frame: number): void;
    renderOnce(deltaMs?: number): void;
    getPhysicsEnabled(): boolean;
    setPhysicsEnabled(enabled: boolean): boolean;
    setExternalPlaybackSimulationEnabled(enabled: boolean): boolean;
    setExternalPlaybackFrame(frame: number): number;
    setAutoRenderEnabled?(enabled: boolean): void;
    getLoadedModels(): PoseBridgeModelSummary[];
    readonly currentFrame: number;
    readonly totalFrames: number;
    mmdRuntime?: { playAnimation(): unknown; pauseAnimation(): void };
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
    host.renderOnce(0);
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
        host.renderOnce(0);
        return;
    }

    const runtime = host.mmdRuntime;
    if (!runtime) {
        hardSeek(host, targetFrame);
        return;
    }

    enableExternalSimulation(host);
    const deltaMs = 1000 / TIMELINE_FPS;
    for (let frame = simulationFrame + 1; frame <= targetFrame; frame += 1) {
        host.setExternalPlaybackFrame(frame);
        await runtime.playAnimation();
        host.renderOnce(deltaMs);
        runtime.pauseAnimation();
    }
    simulationFrame = targetFrame;
}

function readBones(entry: SceneModelLike): PoseBridgeBonePose[] {
    // linkedBone のローカル値は物理結果を反映しないことがあるため、
    // MMD_modoki の getBoneTransformFromRuntimeBone と同じく
    // ワールド行列から親の逆行列でローカルを再構成する（物理込み）。
    const bones: PoseBridgeBonePose[] = [];
    const world = new Matrix();
    const parentWorld = new Matrix();
    const parentInverse = new Matrix();
    const local = new Matrix();
    const scaling = new Vector3();
    const rotation = new Quaternion();
    const position = new Vector3();
    const restPosition = new Vector3();
    for (const runtimeBone of entry.model.runtimeBones ?? []) {
        const linkedBone = runtimeBone.linkedBone;
        if (!linkedBone || typeof runtimeBone.getWorldMatrixToRef !== "function") continue;
        runtimeBone.getWorldMatrixToRef(world);
        const parent = runtimeBone.parentBone;
        if (parent && typeof parent.getWorldMatrixToRef === "function") {
            parent.getWorldMatrixToRef(parentWorld);
            parentWorld.invertToRef(parentInverse);
            world.multiplyToRef(parentInverse, local);
        } else {
            local.copyFrom(world);
        }
        local.decompose(scaling, rotation, position);
        linkedBone.getRestMatrix().getTranslationToRef(restPosition);
        const offsetX = position.x - restPosition.x;
        const offsetY = position.y - restPosition.y;
        const offsetZ = position.z - restPosition.z;
        const values = [offsetX, offsetY, offsetZ, rotation.x, rotation.y, rotation.z, rotation.w];
        if (!values.every(Number.isFinite)) continue;
        bones.push({
            name: runtimeBone.name,
            position: [offsetX, offsetY, offsetZ],
            rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
        });
    }
    return bones;
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
        case "pose": {
            const rawFrame = Number(request.payload.frame);
            if (!Number.isFinite(rawFrame)) throw new Error("frame が不正です");
            const targetFrame = Math.max(0, Math.floor(rawFrame));
            const { entry } = pickModel(host);
            host.pause();
            await stepSimulation(host, targetFrame);
            // 物理ステップ後に再描画して skeleton の最終行列を確定させる。
            host.renderOnce(0);
            return { frame: host.currentFrame, bones: readBones(entry) };
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
