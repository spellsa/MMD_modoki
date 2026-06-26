import { describe, expect, it } from "vitest";

import {
    buildMirrorPasteItems,
    createMirroredKeyframePayload,
    resolveMirrorBoneName,
} from "../../src/editor/mirror-paste-service";

describe("mirror paste service", () => {
    it("resolves Japanese left/right bone names when the counterpart exists", () => {
        const boneNames = new Set(["左腕", "右腕", "センター"]);

        expect(resolveMirrorBoneName("左腕", boneNames)).toBe("右腕");
        expect(resolveMirrorBoneName("右腕", boneNames)).toBe("左腕");
        expect(resolveMirrorBoneName("センター", boneNames)).toBe("センター");
    });

    it("resolves ASCII side tokens without replacing letters inside words", () => {
        const boneNames = new Set(["arm_L", "arm_R", "Shoulder"]);

        expect(resolveMirrorBoneName("arm_L", boneNames)).toBe("arm_R");
        expect(resolveMirrorBoneName("arm_R", boneNames)).toBe("arm_L");
        expect(resolveMirrorBoneName("Shoulder", boneNames)).toBe("Shoulder");
    });

    it("mirrors movable bone position X and quaternion Y/Z while keeping interpolation and physics", () => {
        const mirrored = createMirroredKeyframePayload({
            kind: "movableBone",
            positions: [1, 2, 3],
            positionInterpolations: [10, 20, 30],
            rotations: [0.1, 0.2, 0.3, 0.4],
            rotationInterpolations: [40, 50, 60, 70],
            physicsToggles: [1],
        });

        expect(mirrored).toEqual({
            kind: "movableBone",
            positions: [-1, 2, 3],
            positionInterpolations: [10, 20, 30],
            rotations: [0.1, -0.2, -0.3, 0.4],
            rotationInterpolations: [40, 50, 60, 70],
            physicsToggles: [1],
        });
    });

    it("builds mirrored paste items at the current-frame based offsets and skips non-bone payloads", () => {
        const items = buildMirrorPasteItems(
            [
                {
                    track: { category: "bone", name: "左腕" },
                    sourceFrame: 12,
                    frameOffset: 0,
                    payload: {
                        kind: "bone",
                        rotations: [0, 0.25, 0.5, 1],
                        rotationInterpolations: [20, 20, 107, 107],
                        physicsToggles: [1],
                    },
                },
                {
                    track: { category: "morph", name: "まばたき" },
                    sourceFrame: 18,
                    frameOffset: 6,
                    payload: {
                        kind: "morph",
                        weights: [0.75],
                    },
                },
            ],
            30,
            new Set(["左腕", "右腕"]),
        );

        expect(items).toEqual([
            {
                track: { category: "bone", name: "右腕" },
                sourceFrame: 12,
                targetFrame: 30,
                after: {
                    kind: "bone",
                    rotations: [0, -0.25, -0.5, 1],
                    rotationInterpolations: [20, 20, 107, 107],
                    physicsToggles: [1],
                },
            },
        ]);
    });
});
