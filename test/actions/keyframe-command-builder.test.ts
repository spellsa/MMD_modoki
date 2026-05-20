import { describe, expect, it } from "vitest";

import {
    buildKeyframeCommand,
    createCommandTrackKey,
    type KeyframeCommandSnapshot,
} from "../../src/actions/keyframe-command-builder";
import type { CommandTrackRef } from "../../src/actions/command-types";

const boneTrack: CommandTrackRef = { category: "bone", name: "センター" };
const morphTrack: CommandTrackRef = { category: "morph", name: "まばたき" };

function createSnapshot(overrides: Partial<KeyframeCommandSnapshot> = {}): KeyframeCommandSnapshot {
    const selectedTrack = overrides.selectedTrack === undefined ? boneTrack : overrides.selectedTrack;
    const framesByTrackKey = selectedTrack
        ? { [createCommandTrackKey(selectedTrack)]: [0, 10, 20] }
        : {};

    return {
        selectedTrack,
        selectedFrame: 10,
        currentFrame: 15,
        framesByTrackKey,
        ...overrides,
    };
}

describe("buildKeyframeCommand", () => {
    it("builds an add command for the current frame", () => {
        const command = buildKeyframeCommand(
            { type: "keyframe.addCurrent", source: "button" },
            createSnapshot(),
            100,
        );

        expect(command).toMatchObject({
            id: `keyframe.add:${createCommandTrackKey(boneTrack)}:15:100`,
            label: "Add keyframe at frame 15",
            scope: "keyframe",
            createdAtMs: 100,
            diff: {
                type: "keyframe.add",
                track: boneTrack,
                frame: 15,
                beforeFrames: [0, 10, 20],
                afterFrames: [0, 10, 15, 20],
            },
        });
    });

    it("does not build an add command when the frame already exists", () => {
        const command = buildKeyframeCommand(
            { type: "keyframe.addCurrent", source: "shortcut" },
            createSnapshot({ currentFrame: 10 }),
            100,
        );

        expect(command).toBeNull();
    });

    it("builds a delete command for the selected frame", () => {
        const command = buildKeyframeCommand(
            { type: "keyframe.deleteSelected", source: "shortcut" },
            createSnapshot(),
            200,
        );

        expect(command).toMatchObject({
            id: `keyframe.delete:${createCommandTrackKey(boneTrack)}:10:200`,
            label: "Delete keyframe at frame 10",
            scope: "keyframe",
            createdAtMs: 200,
            diff: {
                type: "keyframe.delete",
                track: boneTrack,
                frame: 10,
                beforeFrames: [0, 10, 20],
                afterFrames: [0, 20],
            },
        });
    });

    it("falls back to the current frame when deleting without a selected frame", () => {
        const command = buildKeyframeCommand(
            { type: "keyframe.deleteSelected", source: "button" },
            createSnapshot({ selectedFrame: null, currentFrame: 20 }),
            200,
        );

        expect(command).toMatchObject({
            id: `keyframe.delete:${createCommandTrackKey(boneTrack)}:20:200`,
            label: "Delete keyframe at frame 20",
            diff: {
                type: "keyframe.delete",
                track: boneTrack,
                frame: 20,
                beforeFrames: [0, 10, 20],
                afterFrames: [0, 10],
            },
        });
    });

    it("does not build a delete command when selected frame does not exist", () => {
        const command = buildKeyframeCommand(
            { type: "keyframe.deleteSelected", source: "button" },
            createSnapshot({ selectedFrame: 15 }),
            200,
        );

        expect(command).toBeNull();
    });

    it("builds a nudge command for the selected frame", () => {
        const command = buildKeyframeCommand(
            { type: "keyframe.nudgeSelected", source: "shortcut", deltaFrames: 1 },
            createSnapshot(),
            300,
        );

        expect(command).toMatchObject({
            id: `keyframe.move:${createCommandTrackKey(boneTrack)}:10:11:300`,
            label: "Move keyframe 10 -> 11",
            scope: "keyframe",
            mergeKey: `keyframe.move:${createCommandTrackKey(boneTrack)}`,
            createdAtMs: 300,
            diff: {
                type: "keyframe.move",
                track: boneTrack,
                fromFrame: 10,
                toFrame: 11,
                beforeFrames: [0, 10, 20],
                afterFrames: [0, 11, 20],
            },
        });
    });

    it("builds the same diff for button and shortcut sources", () => {
        const buttonCommand = buildKeyframeCommand(
            { type: "keyframe.nudgeSelected", source: "button", deltaFrames: -1 },
            createSnapshot(),
            400,
        );
        const shortcutCommand = buildKeyframeCommand(
            { type: "keyframe.nudgeSelected", source: "shortcut", deltaFrames: -1 },
            createSnapshot(),
            400,
        );

        expect(buttonCommand?.diff).toEqual(shortcutCommand?.diff);
        expect(buttonCommand?.mergeKey).toBe(shortcutCommand?.mergeKey);
    });

    it("does not build a nudge command when moving below frame zero", () => {
        const command = buildKeyframeCommand(
            { type: "keyframe.nudgeSelected", source: "shortcut", deltaFrames: -1 },
            createSnapshot({ selectedFrame: 0 }),
            300,
        );

        expect(command).toBeNull();
    });

    it("matches the existing frame merge behavior on nudge collision", () => {
        const command = buildKeyframeCommand(
            { type: "keyframe.nudgeSelected", source: "shortcut", deltaFrames: 1 },
            createSnapshot({ selectedFrame: 10, framesByTrackKey: { [createCommandTrackKey(boneTrack)]: [0, 10, 11, 20] } }),
            300,
        );

        expect(command?.diff).toEqual({
            type: "keyframe.move",
            track: boneTrack,
            fromFrame: 10,
            toFrame: 11,
            beforeFrames: [0, 10, 11, 20],
            afterFrames: [0, 11, 20],
        });
    });

    it("returns null when no timeline track is selected", () => {
        const snapshot = createSnapshot({ selectedTrack: null, framesByTrackKey: {} });

        expect(buildKeyframeCommand({ type: "keyframe.addCurrent", source: "button" }, snapshot, 100)).toBeNull();
        expect(buildKeyframeCommand({ type: "keyframe.deleteSelected", source: "button" }, snapshot, 100)).toBeNull();
        expect(buildKeyframeCommand(
            { type: "keyframe.nudgeSelected", source: "shortcut", deltaFrames: 1 },
            snapshot,
            100,
        )).toBeNull();
    });

    it("uses a stable merge key per track", () => {
        const boneCommand = buildKeyframeCommand(
            { type: "keyframe.nudgeSelected", source: "shortcut", deltaFrames: 1 },
            createSnapshot({ selectedTrack: boneTrack }),
            500,
        );
        const morphCommand = buildKeyframeCommand(
            { type: "keyframe.nudgeSelected", source: "shortcut", deltaFrames: 1 },
            createSnapshot({
                selectedTrack: morphTrack,
                framesByTrackKey: { [createCommandTrackKey(morphTrack)]: [0, 10, 20] },
            }),
            500,
        );

        expect(boneCommand?.mergeKey).toBe(`keyframe.move:${createCommandTrackKey(boneTrack)}`);
        expect(morphCommand?.mergeKey).toBe(`keyframe.move:${createCommandTrackKey(morphTrack)}`);
    });
});
