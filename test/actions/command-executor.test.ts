import { describe, expect, it } from "vitest";

import { executeCommand, type CommandExecutionContext } from "../../src/actions/command-executor";
import type { BoneTransformCommandSnapshot, BuiltCommand, CommandDiff, CommandTrackRef } from "../../src/actions/command-types";

const track: CommandTrackRef = { category: "bone", name: "センター" };

type Call =
    | ["add", CommandTrackRef, number]
    | ["remove", CommandTrackRef, number]
    | ["move", CommandTrackRef, number, number]
    | ["boneTransform", string, BoneTransformCommandSnapshot]
    | ["select", number | null]
    | ["seek", number]
    | ["refresh"];

function createContext(result = true): { context: CommandExecutionContext; calls: Call[] } {
    const calls: Call[] = [];
    return {
        calls,
        context: {
            addTimelineKeyframe: (targetTrack, frame) => {
                calls.push(["add", targetTrack, frame]);
                return result;
            },
            removeTimelineKeyframe: (targetTrack, frame) => {
                calls.push(["remove", targetTrack, frame]);
                return result;
            },
            moveTimelineKeyframe: (targetTrack, fromFrame, toFrame) => {
                calls.push(["move", targetTrack, fromFrame, toFrame]);
                return result;
            },
            applyBoneTransform: (boneName, snapshot) => {
                calls.push(["boneTransform", boneName, snapshot]);
                return result;
            },
            setSelectedFrame: (frame) => {
                calls.push(["select", frame]);
            },
            seekToBoundary: (frame) => {
                calls.push(["seek", frame]);
            },
            refreshAfterKeyframeEdit: () => {
                calls.push(["refresh"]);
            },
        },
    };
}

function createCommand(diff: CommandDiff): BuiltCommand {
    return {
        id: diff.type,
        label: diff.type,
        scope: diff.type === "edit.boneTransform" ? "edit" : "keyframe",
        createdAtMs: 100,
        diff,
    };
}

describe("executeCommand", () => {
    it("applies keyframe add commands", () => {
        const { context, calls } = createContext();

        const result = executeCommand(createCommand({
            type: "keyframe.add",
            track,
            frame: 10,
            beforeFrames: [],
            afterFrames: [10],
        }), "apply", context);

        expect(result).toBe(true);
        expect(calls).toEqual([
            ["add", track, 10],
            ["select", 10],
            ["seek", 10],
            ["refresh"],
        ]);
    });

    it("reverts keyframe add commands", () => {
        const { context, calls } = createContext();

        const result = executeCommand(createCommand({
            type: "keyframe.add",
            track,
            frame: 10,
            beforeFrames: [],
            afterFrames: [10],
        }), "revert", context);

        expect(result).toBe(true);
        expect(calls).toEqual([
            ["remove", track, 10],
            ["select", null],
            ["seek", 10],
            ["refresh"],
        ]);
    });

    it("applies keyframe delete commands", () => {
        const { context, calls } = createContext();

        const result = executeCommand(createCommand({
            type: "keyframe.delete",
            track,
            frame: 10,
            beforeFrames: [10],
            afterFrames: [],
        }), "apply", context);

        expect(result).toBe(true);
        expect(calls).toEqual([
            ["remove", track, 10],
            ["select", null],
            ["seek", 10],
            ["refresh"],
        ]);
    });

    it("reverts keyframe delete commands", () => {
        const { context, calls } = createContext();

        const result = executeCommand(createCommand({
            type: "keyframe.delete",
            track,
            frame: 10,
            beforeFrames: [10],
            afterFrames: [],
        }), "revert", context);

        expect(result).toBe(true);
        expect(calls).toEqual([
            ["add", track, 10],
            ["select", 10],
            ["seek", 10],
            ["refresh"],
        ]);
    });

    it("applies keyframe move commands", () => {
        const { context, calls } = createContext();

        const result = executeCommand(createCommand({
            type: "keyframe.move",
            track,
            fromFrame: 10,
            toFrame: 11,
            beforeFrames: [10],
            afterFrames: [11],
        }), "apply", context);

        expect(result).toBe(true);
        expect(calls).toEqual([
            ["move", track, 10, 11],
            ["select", 11],
            ["seek", 11],
            ["refresh"],
        ]);
    });

    it("reverts keyframe move commands", () => {
        const { context, calls } = createContext();

        const result = executeCommand(createCommand({
            type: "keyframe.move",
            track,
            fromFrame: 10,
            toFrame: 11,
            beforeFrames: [10],
            afterFrames: [11],
        }), "revert", context);

        expect(result).toBe(true);
        expect(calls).toEqual([
            ["move", track, 11, 10],
            ["select", 10],
            ["seek", 10],
            ["refresh"],
        ]);
    });

    it("does not sync selection, seek, or refresh when the command operation fails", () => {
        const { context, calls } = createContext(false);

        const result = executeCommand(createCommand({
            type: "keyframe.move",
            track,
            fromFrame: 10,
            toFrame: 11,
            beforeFrames: [10],
            afterFrames: [11],
        }), "apply", context);

        expect(result).toBe(false);
        expect(calls).toEqual([
            ["move", track, 10, 11],
        ]);
    });

    it("applies and reverts bone transform commands", () => {
        const before = {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
        };
        const after = {
            position: { x: 1, y: 2, z: 3 },
            rotation: { x: 4, y: 5, z: 6 },
        };

        const applyContext = createContext();
        expect(executeCommand(createCommand({
            type: "edit.boneTransform",
            boneName: "センター",
            frame: 12,
            before,
            after,
        }), "apply", applyContext.context)).toBe(true);
        expect(applyContext.calls).toEqual([
            ["boneTransform", "センター", after],
        ]);

        const revertContext = createContext();
        expect(executeCommand(createCommand({
            type: "edit.boneTransform",
            boneName: "センター",
            frame: 12,
            before,
            after,
        }), "revert", revertContext.context)).toBe(true);
        expect(revertContext.calls).toEqual([
            ["boneTransform", "センター", before],
        ]);
    });
});
