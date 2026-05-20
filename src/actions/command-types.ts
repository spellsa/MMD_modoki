import type { TrackCategory } from "../types";

export type CommandScope =
    | "keyframe"
    | "interpolation"
    | "edit"
    | "effect"
    | "project";

export type CommandDirection = "apply" | "revert";

export type CommandTrackRef = {
    category: TrackCategory;
    name: string;
};

export type KeyframeCommandDiff =
    | {
        type: "keyframe.add";
        track: CommandTrackRef;
        frame: number;
        beforeFrames: number[];
        afterFrames: number[];
    }
    | {
        type: "keyframe.delete";
        track: CommandTrackRef;
        frame: number;
        beforeFrames: number[];
        afterFrames: number[];
    }
    | {
        type: "keyframe.move";
        track: CommandTrackRef;
        fromFrame: number;
        toFrame: number;
        beforeFrames: number[];
        afterFrames: number[];
    };

export type BoneTransformCommandSnapshot = {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
};

export type EditCommandDiff =
    | {
        type: "edit.boneTransform";
        boneName: string;
        frame: number;
        before: BoneTransformCommandSnapshot;
        after: BoneTransformCommandSnapshot;
    };

export type CommandDiff = KeyframeCommandDiff | EditCommandDiff;

export type BuiltCommand = {
    id: string;
    label: string;
    scope: CommandScope;
    diff: CommandDiff;
    mergeKey?: string;
    createdAtMs: number;
};
