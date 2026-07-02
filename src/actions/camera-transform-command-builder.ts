import type { BuiltCommand, CameraTransformCommandSnapshot, EditCommandDiff } from "./command-types";

const SNAPSHOT_EPSILON = 0.0001;

export type CameraTransformCommandInput = {
    frame: number;
    before: CameraTransformCommandSnapshot | null;
    after: CameraTransformCommandSnapshot | null;
};

export function buildCameraTransformCommand(
    input: CameraTransformCommandInput,
    nowMs = Date.now(),
): BuiltCommand | null {
    const frame = normalizeFrame(input.frame);
    if (frame === null) return null;
    if (!input.before || !input.after) return null;
    if (!isSnapshotFinite(input.before) || !isSnapshotFinite(input.after)) return null;
    if (areSnapshotsEqual(input.before, input.after)) return null;

    const diff: EditCommandDiff = {
        type: "edit.cameraTransform",
        frame,
        before: cloneSnapshot(input.before),
        after: cloneSnapshot(input.after),
    };

    return {
        id: `edit.cameraTransform:${frame}:${nowMs}`,
        label: "Edit camera transform",
        scope: "edit",
        diff,
        mergeKey: "edit.cameraTransform",
        createdAtMs: nowMs,
    };
}

function normalizeFrame(frame: number): number | null {
    if (!Number.isFinite(frame) || frame < 0) return null;
    return Math.floor(frame);
}

function cloneSnapshot(snapshot: CameraTransformCommandSnapshot): CameraTransformCommandSnapshot {
    return {
        target: { ...snapshot.target },
        rotation: { ...snapshot.rotation },
        distance: snapshot.distance,
        fov: snapshot.fov,
    };
}

function isSnapshotFinite(snapshot: CameraTransformCommandSnapshot): boolean {
    return isVectorFinite(snapshot.target)
        && isVectorFinite(snapshot.rotation)
        && Number.isFinite(snapshot.distance)
        && Number.isFinite(snapshot.fov);
}

function isVectorFinite(value: { x: number; y: number; z: number }): boolean {
    return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function areSnapshotsEqual(
    left: CameraTransformCommandSnapshot,
    right: CameraTransformCommandSnapshot,
): boolean {
    return areVectorValuesEqual(left.target, right.target)
        && areVectorValuesEqual(left.rotation, right.rotation)
        && Math.abs(left.distance - right.distance) <= SNAPSHOT_EPSILON
        && Math.abs(left.fov - right.fov) <= SNAPSHOT_EPSILON;
}

function areVectorValuesEqual(
    left: { x: number; y: number; z: number },
    right: { x: number; y: number; z: number },
): boolean {
    return Math.abs(left.x - right.x) <= SNAPSHOT_EPSILON
        && Math.abs(left.y - right.y) <= SNAPSHOT_EPSILON
        && Math.abs(left.z - right.z) <= SNAPSHOT_EPSILON;
}
