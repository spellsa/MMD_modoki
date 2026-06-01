import { describe, expect, it } from "vitest";
import { buildCameraTransformCommand } from "./camera-transform-command-builder";
import type { CameraTransformCommandSnapshot } from "./command-types";

function createSnapshot(overrides: Partial<CameraTransformCommandSnapshot> = {}): CameraTransformCommandSnapshot {
    return {
        target: { x: 0, y: 10, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        distance: 45,
        fov: 30,
        ...overrides,
    };
}

describe("buildCameraTransformCommand", () => {
    it("returns null when before and after are identical", () => {
        const before = createSnapshot();
        const after = createSnapshot();

        expect(buildCameraTransformCommand({ frame: 12, before, after }, 1000)).toBeNull();
    });

    it("builds a command containing target, rotation, distance, and fov diffs", () => {
        const before = createSnapshot();
        const after = createSnapshot({
            target: { x: 1, y: 2, z: 3 },
            rotation: { x: 4, y: 5, z: 6 },
            distance: 60,
            fov: 40,
        });

        const command = buildCameraTransformCommand({ frame: 12, before, after }, 1000);

        expect(command).toMatchObject({
            id: "edit.cameraTransform:12:1000",
            label: "Edit camera transform",
            scope: "edit",
            mergeKey: "edit.cameraTransform",
            createdAtMs: 1000,
            diff: {
                type: "edit.cameraTransform",
                frame: 12,
                before,
                after,
            },
        });
    });

    it("uses a stable merge key across frames", () => {
        const before = createSnapshot();
        const after = createSnapshot({ fov: 35 });

        const first = buildCameraTransformCommand({ frame: 1, before, after }, 1000);
        const second = buildCameraTransformCommand({ frame: 2, before, after }, 2000);

        expect(first?.mergeKey).toBe("edit.cameraTransform");
        expect(second?.mergeKey).toBe("edit.cameraTransform");
    });

    it("returns null for invalid frame or invalid snapshots", () => {
        const before = createSnapshot();
        const after = createSnapshot({ distance: 50 });

        expect(buildCameraTransformCommand({ frame: -1, before, after }, 1000)).toBeNull();
        expect(buildCameraTransformCommand({ frame: 1, before: null, after }, 1000)).toBeNull();
        expect(buildCameraTransformCommand({
            frame: 1,
            before,
            after: createSnapshot({ fov: Number.NaN }),
        }, 1000)).toBeNull();
    });
});
