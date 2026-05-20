import type {
    BoneTransformCommandSnapshot,
    BuiltCommand,
    CommandDirection,
    CommandTrackRef,
    EditCommandDiff,
    KeyframeCommandDiff,
} from "./command-types";

export type CommandExecutionContext = {
    addTimelineKeyframe(track: CommandTrackRef, frame: number): boolean;
    removeTimelineKeyframe(track: CommandTrackRef, frame: number): boolean;
    moveTimelineKeyframe(track: CommandTrackRef, fromFrame: number, toFrame: number): boolean;
    applyBoneTransform?(boneName: string, snapshot: BoneTransformCommandSnapshot): boolean;
    setSelectedFrame(frame: number | null): void;
    seekToBoundary(frame: number): void;
    refreshAfterKeyframeEdit(): void;
};

export function executeCommand(
    command: BuiltCommand,
    direction: CommandDirection,
    context: CommandExecutionContext,
): boolean {
    switch (command.diff.type) {
        case "keyframe.add":
            return executeKeyframeAdd(command.diff, direction, context);
        case "keyframe.delete":
            return executeKeyframeDelete(command.diff, direction, context);
        case "keyframe.move":
            return executeKeyframeMove(command.diff, direction, context);
        case "edit.boneTransform":
            return executeBoneTransform(command.diff, direction, context);
    }
}

function executeKeyframeAdd(
    diff: Extract<KeyframeCommandDiff, { type: "keyframe.add" }>,
    direction: CommandDirection,
    context: CommandExecutionContext,
): boolean {
    const applied = direction === "apply"
        ? context.addTimelineKeyframe(diff.track, diff.frame)
        : context.removeTimelineKeyframe(diff.track, diff.frame);
    if (!applied) return false;

    context.setSelectedFrame(direction === "apply" ? diff.frame : null);
    context.seekToBoundary(diff.frame);
    context.refreshAfterKeyframeEdit();
    return true;
}

function executeBoneTransform(
    diff: Extract<EditCommandDiff, { type: "edit.boneTransform" }>,
    direction: CommandDirection,
    context: CommandExecutionContext,
): boolean {
    if (!context.applyBoneTransform) return false;
    const snapshot = direction === "apply" ? diff.after : diff.before;
    return context.applyBoneTransform(diff.boneName, snapshot);
}

function executeKeyframeDelete(
    diff: Extract<KeyframeCommandDiff, { type: "keyframe.delete" }>,
    direction: CommandDirection,
    context: CommandExecutionContext,
): boolean {
    const applied = direction === "apply"
        ? context.removeTimelineKeyframe(diff.track, diff.frame)
        : context.addTimelineKeyframe(diff.track, diff.frame);
    if (!applied) return false;

    context.setSelectedFrame(direction === "apply" ? null : diff.frame);
    context.seekToBoundary(diff.frame);
    context.refreshAfterKeyframeEdit();
    return true;
}

function executeKeyframeMove(
    diff: Extract<KeyframeCommandDiff, { type: "keyframe.move" }>,
    direction: CommandDirection,
    context: CommandExecutionContext,
): boolean {
    const fromFrame = direction === "apply" ? diff.fromFrame : diff.toFrame;
    const toFrame = direction === "apply" ? diff.toFrame : diff.fromFrame;
    const applied = context.moveTimelineKeyframe(diff.track, fromFrame, toFrame);
    if (!applied) return false;

    context.setSelectedFrame(toFrame);
    context.seekToBoundary(toFrame);
    context.refreshAfterKeyframeEdit();
    return true;
}
