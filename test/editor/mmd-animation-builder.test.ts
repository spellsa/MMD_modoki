import { describe, expect, it } from "vitest";
import { MmdAnimation } from "babylon-mmd/esm/Loader/Animation/mmdAnimation";
import { MmdCameraAnimationTrack, MmdMovableBoneAnimationTrack, MmdPropertyAnimationTrack } from "babylon-mmd/esm/Loader/Animation/mmdAnimationTrack";

import {
    buildMmdAnimationFromEditorMotion,
    createEditorModelMotionFromMmdAnimation,
} from "../../src/editor/mmd-animation-builder";
import { createEmptyEditorModelMotion, upsertBoneKey } from "../../src/editor/motion-document";
import type { ModelInfo } from "../../src/types";

function createModelInfo(): Pick<ModelInfo, "boneControlInfos"> {
    return {
        boneControlInfos: [
            { name: "右肩", movable: false, rotatable: true },
            { name: "センター", movable: true, rotatable: true },
        ],
    };
}

describe("buildMmdAnimationFromEditorMotion", () => {
    it("creates boneTracks for ordinary PMX bones", () => {
        const motion = createEmptyEditorModelMotion("manual");
        const first = upsertBoneKey(motion, "右肩", "bone", {
            frame: 20,
            rotation: [0, 0.2, 0, 0.98],
            rotationInterpolation: [20, 107, 20, 107],
            physicsToggle: 1,
        }).motion;
        const second = upsertBoneKey(first, "右肩", "bone", {
            frame: 0,
            rotation: [0, 0, 0, 1],
            rotationInterpolation: [20, 107, 20, 107],
            physicsToggle: 1,
        }).motion;

        const animation = buildMmdAnimationFromEditorMotion("manual", second, createModelInfo());

        expect(animation.boneTracks.map((track) => track.name)).toEqual(["右肩"]);
        expect(animation.movableBoneTracks).toHaveLength(0);
        expect(Array.from(animation.boneTracks[0].frameNumbers)).toEqual([0, 20]);
        expect(animation.endFrame).toBe(20);
    });

    it("creates movableBoneTracks for movable PMX bones", () => {
        const motion = upsertBoneKey(createEmptyEditorModelMotion("manual"), "センター", "movableBone", {
            frame: 15,
            position: [1, 2, 3],
            positionInterpolation: [20, 107, 20, 107, 20, 107, 20, 107, 20, 107, 20, 107],
            rotation: [0, 0, 0, 1],
            rotationInterpolation: [20, 107, 20, 107],
            physicsToggle: 1,
        }).motion;

        const animation = buildMmdAnimationFromEditorMotion("manual", motion, createModelInfo());

        expect(animation.boneTracks).toHaveLength(0);
        expect(animation.movableBoneTracks.map((track) => track.name)).toEqual(["センター"]);
        expect(Array.from(animation.movableBoneTracks[0].positions)).toEqual([1, 2, 3]);
    });

    it("overwrites duplicate frame with the latest key", () => {
        const first = upsertBoneKey(createEmptyEditorModelMotion("manual"), "右肩", "bone", {
            frame: 5,
            rotation: [0, 0.1, 0, 0.99],
            rotationInterpolation: [20, 107, 20, 107],
            physicsToggle: 1,
        }).motion;
        const second = upsertBoneKey(first, "右肩", "bone", {
            frame: 5,
            rotation: [0, 0.4, 0, 0.91],
            rotationInterpolation: [30, 30, 90, 90],
            physicsToggle: 0,
        }).motion;

        const animation = buildMmdAnimationFromEditorMotion("manual", second, createModelInfo());

        expect(Array.from(animation.boneTracks[0].frameNumbers)).toEqual([5]);
        expect(Array.from(animation.boneTracks[0].rotationInterpolations)).toEqual([30, 30, 90, 90]);
        expect(Array.from(animation.boneTracks[0].physicsToggles)).toEqual([0]);
    });

    it("converts an existing MmdAnimation into editor motion and builds a fresh MmdAnimation", () => {
        const sourceTrack = new MmdMovableBoneAnimationTrack("右肩", 1);
        sourceTrack.frameNumbers[0] = 12;
        sourceTrack.positions.set([9, 9, 9]);
        sourceTrack.rotations.set([0, 0.3, 0, 0.95]);
        sourceTrack.rotationInterpolations.set([20, 107, 20, 107]);
        sourceTrack.physicsToggles[0] = 1;
        const source = new MmdAnimation(
            "source",
            [],
            [sourceTrack],
            [],
            new MmdPropertyAnimationTrack(0, []),
            new MmdCameraAnimationTrack(0),
        );

        const motion = createEditorModelMotionFromMmdAnimation("source", source, createModelInfo());
        const rebuilt = buildMmdAnimationFromEditorMotion("source", motion, createModelInfo());

        expect(rebuilt.movableBoneTracks).toHaveLength(0);
        expect(rebuilt.boneTracks.map((track) => track.name)).toEqual(["右肩"]);
        expect(Array.from(rebuilt.boneTracks[0].frameNumbers)).toEqual([12]);
        expect(Array.from(rebuilt.boneTracks[0].rotations)).toEqual([
            expect.closeTo(0),
            expect.closeTo(0.301131),
            expect.closeTo(0),
            expect.closeTo(0.953583),
        ]);
    });
});
