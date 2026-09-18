// ランタイムの最終ボーン姿勢を読み出す（描画とは独立した読み出し専用処理）。
//
// - ボーン名テーブルと、index整合した平坦な Float32Array を同じ並びで作る。
// - 物理結果を含めるため、linkedBone のローカル値ではなく
//   MMD_modoki の getBoneTransformFromRuntimeBone と同じく
//   ワールド行列から親の逆行列でローカルを再構成する。

import { Matrix, Quaternion, Vector3 } from "@babylonjs/core";
import { POSE_BRIDGE_STRIDE } from "../shared/pose-bridge-protocol";

export type RuntimeBoneLike = {
    name: string;
    parentBone?: RuntimeBoneLike | null;
    getWorldMatrixToRef?(target: Matrix): Matrix;
    linkedBone?: {
        getRestMatrix(): Matrix;
    } | null;
};

export type SceneModelLike = {
    model: { runtimeBones?: readonly RuntimeBoneLike[] };
    info: {
        instanceId: string;
        name: string;
        boneNames: string[];
    };
};

/** ボーン名テーブル。index は readBonePose の data と一致する。 */
export function readBoneNames(entry: SceneModelLike): string[] {
    return (entry.model.runtimeBones ?? []).map(bone => bone.name);
}

/** 全ボーンの最終姿勢を [px,py,pz, qx,qy,qz,qw] の平坦な Float32 で返す。 */
export function readBonePose(entry: SceneModelLike): Float32Array {
    const runtimeBones = entry.model.runtimeBones ?? [];
    const data = new Float32Array(runtimeBones.length * POSE_BRIDGE_STRIDE);
    // 既定は無回転（クォータニオン w=1）。読めないボーンはこのままにする。
    for (let i = 0; i < runtimeBones.length; i += 1) {
        data[i * POSE_BRIDGE_STRIDE + 6] = 1;
    }

    const world = new Matrix();
    const parentWorld = new Matrix();
    const parentInverse = new Matrix();
    const local = new Matrix();
    const scaling = new Vector3();
    const rotation = new Quaternion();
    const position = new Vector3();
    const restPosition = new Vector3();

    for (let i = 0; i < runtimeBones.length; i += 1) {
        const runtimeBone = runtimeBones[i];
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
        if (![offsetX, offsetY, offsetZ, rotation.x, rotation.y, rotation.z, rotation.w].every(Number.isFinite)) {
            continue;
        }
        const base = i * POSE_BRIDGE_STRIDE;
        data[base] = offsetX;
        data[base + 1] = offsetY;
        data[base + 2] = offsetZ;
        data[base + 3] = rotation.x;
        data[base + 4] = rotation.y;
        data[base + 5] = rotation.z;
        data[base + 6] = rotation.w;
    }
    return data;
}
