import { describe, expect, it } from "vitest";

import { MmdAnimation } from "babylon-mmd/esm/Loader/Animation/mmdAnimation";
import {
    MmdCameraAnimationTrack,
    MmdMovableBoneAnimationTrack,
    MmdPropertyAnimationTrack,
} from "babylon-mmd/esm/Loader/Animation/mmdAnimationTrack";

import {
    applyTimelineKeyframePayload,
    ensureModelAnimationForEditing,
} from "../../src/editor/timeline-edit-service";
import type { KeyframeTrack, ModelInfo } from "../../src/types";

type TestModel = {
    name: string;
};

type TestHost = Parameters<typeof ensureModelAnimationForEditing>[0];

function createModelInfo(bones: Array<{ name: string; movable: boolean }>): ModelInfo {
    return {
        name: "test-model",
        path: "test.pmx",
        vertexCount: 0,
        boneCount: bones.length,
        boneNames: bones.map((bone) => bone.name),
        boneControlInfos: bones.map((bone) => ({
            name: bone.name,
            movable: bone.movable,
            rotatable: true,
        })),
        morphCount: 0,
        morphNames: [],
        morphDisplayFrames: [],
    };
}

function createAnimation(): MmdAnimation {
    return new MmdAnimation(
        "test-animation",
        [],
        [],
        [],
        new MmdPropertyAnimationTrack(0, []),
        new MmdCameraAnimationTrack(0),
    );
}

function createHost(modelInfo: ModelInfo): { host: TestHost; model: TestModel } {
    const model: TestModel = { name: "model" };
    const host = {
        currentModel: model,
        activeModelInfo: modelInfo,
        sceneModels: [{ model }],
        modelKeyframeTracksByModel: new WeakMap<TestModel, Map<string, Uint32Array>>(),
        modelSourceAnimationsByModel: new WeakMap<TestModel, MmdAnimation>(),
        cameraKeyframeFrames: new Uint32Array(0),
        cameraSourceAnimation: null,
        cameraMotionPath: null,
        timelineTarget: "model",
        mmdRuntime: {
            animationFrameTimeDuration: 1 / 30,
            seekAnimation: () => undefined,
        },
        audioPlayer: null,
        _totalFrames: 300,
        _currentFrame: 0,
        manualPlaybackWithoutAudio: false,
        manualPlaybackFrameCursor: 0,
    } satisfies TestHost;
    return { host, model };
}

describe("timeline edit service model animation tracks", () => {
    it("creates a bone track for ordinary PMX bones", () => {
        const { host, model } = createHost(createModelInfo([{ name: "左肩", movable: false }]));
        const animation = createAnimation();
        host.modelSourceAnimationsByModel.set(model, animation);
        const track: Pick<KeyframeTrack, "name" | "category"> = { name: "左肩", category: "bone" };

        expect(ensureModelAnimationForEditing(host, track)).toBe(true);

        expect(animation.boneTracks.map((candidate) => candidate.name)).toEqual(["左肩"]);
        expect(animation.movableBoneTracks.map((candidate) => candidate.name)).toEqual([]);
    });

    it("migrates a stale movable track into a normal bone track", () => {
        const { host, model } = createHost(createModelInfo([{ name: "左肩", movable: false }]));
        const animation = createAnimation();
        const staleMovableTrack = new MmdMovableBoneAnimationTrack("左肩", 2);
        staleMovableTrack.frameNumbers.set([0, 20]);
        staleMovableTrack.rotations.set([0, 0, 0, 1, 0.25, 0, 0, 0.96875]);
        staleMovableTrack.rotationInterpolations.set([20, 20, 107, 107, 30, 30, 100, 100]);
        staleMovableTrack.physicsToggles.set([1, 0]);
        (animation.movableBoneTracks as MmdMovableBoneAnimationTrack[]).push(staleMovableTrack);
        host.modelSourceAnimationsByModel.set(model, animation);
        const track: Pick<KeyframeTrack, "name" | "category"> = { name: "左肩", category: "bone" };

        expect(ensureModelAnimationForEditing(host, track)).toBe(true);

        expect(animation.movableBoneTracks.map((candidate) => candidate.name)).toEqual([]);
        expect(animation.boneTracks.map((candidate) => candidate.name)).toEqual(["左肩"]);
        expect(Array.from(animation.boneTracks[0].frameNumbers)).toEqual([0, 20]);
        expect(Array.from(animation.boneTracks[0].rotations)).toEqual(Array.from(staleMovableTrack.rotations));
        expect(Array.from(animation.boneTracks[0].rotationInterpolations)).toEqual(Array.from(staleMovableTrack.rotationInterpolations));
        expect(Array.from(animation.boneTracks[0].physicsToggles)).toEqual([1, 0]);
    });

    it("keeps movable PMX bones in movable tracks", () => {
        const { host, model } = createHost(createModelInfo([{ name: "センター", movable: true }]));
        const animation = createAnimation();
        host.modelSourceAnimationsByModel.set(model, animation);
        const track: Pick<KeyframeTrack, "name" | "category"> = { name: "センター", category: "root" };

        expect(ensureModelAnimationForEditing(host, track)).toBe(true);

        expect(animation.boneTracks.map((candidate) => candidate.name)).toEqual([]);
        expect(animation.movableBoneTracks.map((candidate) => candidate.name)).toEqual(["センター"]);
    });

    it("applies movable payloads as rotation-only payloads for ordinary bones", () => {
        const { host, model } = createHost(createModelInfo([{ name: "左肩", movable: false }]));
        const animation = createAnimation();
        host.modelSourceAnimationsByModel.set(model, animation);
        const track: Pick<KeyframeTrack, "name" | "category"> = { name: "左肩", category: "bone" };

        const applied = applyTimelineKeyframePayload(host, track, 12, {
            kind: "movableBone",
            positions: [1, 2, 3],
            positionInterpolations: Array.from({ length: 12 }, () => 20),
            rotations: [0.1, 0.2, 0.3, 0.9],
            rotationInterpolations: [20, 20, 107, 107],
            physicsToggles: [1],
        });

        expect(applied).toBe(true);
        expect(animation.movableBoneTracks.map((candidate) => candidate.name)).toEqual([]);
        expect(animation.boneTracks.map((candidate) => candidate.name)).toEqual(["左肩"]);
        expect(Array.from(animation.boneTracks[0].frameNumbers)).toEqual([12]);
        expect(Array.from(animation.boneTracks[0].rotations)).toEqual([
            expect.closeTo(0.1),
            expect.closeTo(0.2),
            expect.closeTo(0.3),
            expect.closeTo(0.9),
        ]);
        expect(animation.startFrame).toBe(0);
        expect(animation.endFrame).toBe(12);
    });

    it("refreshes animation range when hand-keyed bone frames are added", () => {
        const { host, model } = createHost(createModelInfo([{ name: "右肩", movable: false }]));
        const animation = createAnimation();
        host.modelSourceAnimationsByModel.set(model, animation);
        const track: Pick<KeyframeTrack, "name" | "category"> = { name: "右肩", category: "bone" };

        expect(applyTimelineKeyframePayload(host, track, 0, {
            kind: "bone",
            rotations: [0, 0, 0, 1],
            rotationInterpolations: [20, 20, 107, 107],
            physicsToggles: [1],
        })).toBe(true);
        expect(applyTimelineKeyframePayload(host, track, 30, {
            kind: "bone",
            rotations: [0, 0.4, 0, 0.9165],
            rotationInterpolations: [20, 20, 107, 107],
            physicsToggles: [1],
        })).toBe(true);

        expect(Array.from(animation.boneTracks[0].frameNumbers)).toEqual([0, 30]);
        expect(animation.startFrame).toBe(0);
        expect(animation.endFrame).toBe(30);
    });
});
