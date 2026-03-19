import { MmdAnimation } from "babylon-mmd/esm/Loader/Animation/mmdAnimation";
import { MmdBoneAnimationTrack, MmdCameraAnimationTrack, MmdMorphAnimationTrack, MmdMovableBoneAnimationTrack, MmdPropertyAnimationTrack } from "babylon-mmd/esm/Loader/Animation/mmdAnimationTrack";
import type { KeyframeTrack, TrackCategory } from "../types";
import { addFrameNumber, classifyBone, createTrackKey, hasFrameNumber, mergeFrameNumbers, moveFrameNumber, parseTrackKey, removeFrameNumber } from "../shared/timeline-helpers";

const EMPTY_KEYFRAME_FRAMES = new Uint32Array(0);

export function getOrCreateModelTrackFrameMap(host: any, model: any): Map<string, Uint32Array> {
    let frameMap = host.modelKeyframeTracksByModel.get(model);
    if (!frameMap) {
        frameMap = new Map<string, Uint32Array>();
        host.modelKeyframeTracksByModel.set(model, frameMap);
    }
    return frameMap;
}

function createCameraAnimationFromTrack(cameraTrack: MmdCameraAnimationTrack, name: string): MmdAnimation {
    const propertyTrack = new MmdPropertyAnimationTrack(0, []);
    return new MmdAnimation(name, [], [], [], propertyTrack, cameraTrack);
}

function createFrameIndexMap(frames: Uint32Array): Map<number, number> {
    const indexMap = new Map<number, number>();
    for (let i = 0; i < frames.length; i += 1) {
        indexMap.set(frames[i], i);
    }
    return indexMap;
}

function copyFloatFrameBlock(
    source: Float32Array,
    sourceFrameIndex: number,
    stride: number,
    destination: Float32Array,
    destinationFrameIndex: number,
): void {
    const sourceOffset = sourceFrameIndex * stride;
    const destinationOffset = destinationFrameIndex * stride;
    destination.set(source.subarray(sourceOffset, sourceOffset + stride), destinationOffset);
}

function copyUint8FrameBlock(
    source: Uint8Array,
    sourceFrameIndex: number,
    stride: number,
    destination: Uint8Array,
    destinationFrameIndex: number,
): void {
    const sourceOffset = sourceFrameIndex * stride;
    const destinationOffset = destinationFrameIndex * stride;
    destination.set(source.subarray(sourceOffset, sourceOffset + stride), destinationOffset);
}

export function getRegisteredKeyframeStats(host: any): { hasAnyKeyframe: boolean; maxFrame: number } {
    let hasAnyKeyframe = false;
    let maxFrame = 0;

    if (host.cameraKeyframeFrames.length > 0) {
        hasAnyKeyframe = true;
        maxFrame = host.cameraKeyframeFrames[host.cameraKeyframeFrames.length - 1];
    }

    for (const sceneModel of host.sceneModels) {
        const frameMap = host.modelKeyframeTracksByModel.get(sceneModel.model);
        if (!frameMap) continue;
        for (const frames of frameMap.values()) {
            if (frames.length === 0) continue;
            hasAnyKeyframe = true;
            const trackMaxFrame = frames[frames.length - 1];
            if (trackMaxFrame > maxFrame) {
                maxFrame = trackMaxFrame;
            }
        }
    }

    return { hasAnyKeyframe, maxFrame };
}

export function getActiveModelTimelineTracks(host: any): KeyframeTrack[] {
    if (!host.currentModel || !host.activeModelInfo) return [];

    const visibleBoneNameSet = new Set(host.activeModelInfo.boneNames);
    const isVisibleBoneCategory = (category: TrackCategory): boolean => {
        return category === "root" || category === "semi-standard" || category === "bone";
    };

    const frameMap = getOrCreateModelTrackFrameMap(host, host.currentModel);
    const trackMap = new Map<string, KeyframeTrack>();

    for (const [key, frames] of frameMap.entries()) {
        const parsed = parseTrackKey(key);
        if (!parsed) continue;
        if (isVisibleBoneCategory(parsed.category) && !visibleBoneNameSet.has(parsed.name)) {
            continue;
        }
        trackMap.set(key, {
            name: parsed.name,
            category: parsed.category,
            frames,
        });
    }

    for (const boneName of host.activeModelInfo.boneNames) {
        const category = classifyBone(boneName);
        const key = createTrackKey(category, boneName);
        if (!trackMap.has(key)) {
            trackMap.set(key, {
                name: boneName,
                category,
                frames: EMPTY_KEYFRAME_FRAMES,
            });
        }
    }

    for (const morphName of host.activeModelInfo.morphNames) {
        const key = createTrackKey("morph", morphName);
        if (!trackMap.has(key)) {
            trackMap.set(key, {
                name: morphName,
                category: "morph",
                frames: EMPTY_KEYFRAME_FRAMES,
            });
        }
    }

    const ordered: KeyframeTrack[] = [];
    const consumed = new Set<string>();

    const appendByKey = (key: string): void => {
        const track = trackMap.get(key);
        if (!track) return;
        ordered.push(track);
        consumed.add(key);
    };

    for (const boneName of host.activeModelInfo.boneNames) {
        if (classifyBone(boneName) !== "root") continue;
        appendByKey(createTrackKey("root", boneName));
    }

    for (const boneName of host.activeModelInfo.boneNames) {
        const category = classifyBone(boneName);
        if (category === "root") continue;
        appendByKey(createTrackKey(category, boneName));
    }

    for (const morphName of host.activeModelInfo.morphNames) {
        appendByKey(createTrackKey("morph", morphName));
    }

    for (const [key, track] of trackMap) {
        if (consumed.has(key)) continue;
        ordered.push(track);
    }

    return ordered;
}

export function getCameraTimelineTracks(host: any): KeyframeTrack[] {
    return [
        {
            name: "Camera",
            category: "camera",
            frames: host.cameraKeyframeFrames.length > 0 ? host.cameraKeyframeFrames : EMPTY_KEYFRAME_FRAMES,
        },
    ];
}

export function refreshTotalFramesFromContent(host: any): void {
    const runtimeDurationFrame = Math.max(0, Math.floor(host.mmdRuntime.animationFrameTimeDuration));
    const { hasAnyKeyframe, maxFrame } = getRegisteredKeyframeStats(host);
    const hasAudio = host.audioPlayer !== null;
    const nextTotalFrames = hasAnyKeyframe && !hasAudio
        ? Math.max(maxFrame, 1)
        : Math.max(runtimeDurationFrame, maxFrame, hasAnyKeyframe ? 0 : 300);
    if (nextTotalFrames === host._totalFrames) return;

    host._totalFrames = nextTotalFrames;
    if (host._currentFrame > host._totalFrames) {
        host._currentFrame = host._totalFrames;
        host.mmdRuntime.seekAnimation(host._currentFrame, true);
        if (host.manualPlaybackWithoutAudio) {
            host.manualPlaybackFrameCursor = host._currentFrame;
        }
    }
    host.onFrameUpdate?.(host._currentFrame, host._totalFrames);
}

export function emitMergedKeyframeTracks(host: any): void {
    refreshTotalFramesFromContent(host);
    if (!host.onKeyframesLoaded) return;

    if (host.timelineTarget === "camera") {
        host.onKeyframesLoaded(getCameraTimelineTracks(host));
        return;
    }

    host.onKeyframesLoaded(getActiveModelTimelineTracks(host));
}

export function hasTimelineKeyframe(host: any, track: Pick<KeyframeTrack, "name" | "category">, frame: number): boolean {
    const normalized = Math.max(0, Math.floor(frame));

    if (track.category === "camera") {
        return hasFrameNumber(host.cameraKeyframeFrames, normalized);
    }

    if (!host.currentModel) return false;
    const frameMap = getOrCreateModelTrackFrameMap(host, host.currentModel);
    const key = createTrackKey(track.category, track.name);
    const frames = frameMap.get(key) ?? EMPTY_KEYFRAME_FRAMES;
    return hasFrameNumber(frames, normalized);
}

export function addTimelineKeyframe(host: any, track: Pick<KeyframeTrack, "name" | "category">, frame: number): boolean {
    const normalized = Math.max(0, Math.floor(frame));

    if (track.category === "camera") {
        if (!ensureCameraAnimationForEditing(host)) return false;
        const nextFrames = addFrameNumber(host.cameraKeyframeFrames, normalized);
        if (nextFrames === host.cameraKeyframeFrames) return false;
        host.cameraKeyframeFrames = nextFrames;
        emitMergedKeyframeTracks(host);
        return true;
    }

    if (!host.currentModel) return false;
    const frameMap = getOrCreateModelTrackFrameMap(host, host.currentModel);
    const key = createTrackKey(track.category, track.name);
    const currentFrames = frameMap.get(key) ?? EMPTY_KEYFRAME_FRAMES;
    const nextFrames = addFrameNumber(currentFrames, normalized);
    if (nextFrames === currentFrames) return false;
    frameMap.set(key, nextFrames);
    emitMergedKeyframeTracks(host);
    return true;
}

export function ensureCameraAnimationForEditing(host: any): boolean {
    if (host.cameraSourceAnimation) return true;

    const cameraTrack = new MmdCameraAnimationTrack(0);
    host.cameraSourceAnimation = createCameraAnimationFromTrack(cameraTrack, "editorCamera");
    host.cameraMotionPath = null;
    host.cameraKeyframeFrames = new Uint32Array(cameraTrack.frameNumbers);
    return true;
}

export function removeTimelineKeyframe(host: any, track: Pick<KeyframeTrack, "name" | "category">, frame: number): boolean {
    const normalized = Math.max(0, Math.floor(frame));

    if (track.category === "camera") {
        const nextFrames = removeFrameNumber(host.cameraKeyframeFrames, normalized);
        if (nextFrames === host.cameraKeyframeFrames) return false;
        host.cameraKeyframeFrames = nextFrames;
        emitMergedKeyframeTracks(host);
        return true;
    }

    if (!host.currentModel) return false;
    const frameMap = getOrCreateModelTrackFrameMap(host, host.currentModel);
    const key = createTrackKey(track.category, track.name);
    const currentFrames = frameMap.get(key) ?? EMPTY_KEYFRAME_FRAMES;
    const nextFrames = removeFrameNumber(currentFrames, normalized);
    if (nextFrames === currentFrames) return false;
    frameMap.set(key, nextFrames);
    emitMergedKeyframeTracks(host);
    return true;
}

export function moveTimelineKeyframe(
    host: any,
    track: Pick<KeyframeTrack, "name" | "category">,
    fromFrame: number,
    toFrame: number,
): boolean {
    const normalizedFrom = Math.max(0, Math.floor(fromFrame));
    const normalizedTo = Math.max(0, Math.floor(toFrame));

    if (track.category === "camera") {
        const nextFrames = moveFrameNumber(host.cameraKeyframeFrames, normalizedFrom, normalizedTo);
        if (nextFrames === host.cameraKeyframeFrames) return false;
        host.cameraKeyframeFrames = nextFrames;
        emitMergedKeyframeTracks(host);
        return true;
    }

    if (!host.currentModel) return false;
    const frameMap = getOrCreateModelTrackFrameMap(host, host.currentModel);
    const key = createTrackKey(track.category, track.name);
    const currentFrames = frameMap.get(key) ?? EMPTY_KEYFRAME_FRAMES;
    const nextFrames = moveFrameNumber(currentFrames, normalizedFrom, normalizedTo);
    if (nextFrames === currentFrames) return false;
    frameMap.set(key, nextFrames);
    emitMergedKeyframeTracks(host);
    return true;
}

export function buildModelTrackFrameMapFromAnimation(host: any, animation: any, frameOffset = 0): Map<string, Uint32Array> {
    const frameMap = new Map<string, Uint32Array>();
    const normalizedOffset = Math.max(0, Math.floor(frameOffset));

    const applyFrameOffset = (frames: Uint32Array): Uint32Array => {
        if (normalizedOffset === 0) {
            return new Uint32Array(frames);
        }
        const shiftedFrames = new Uint32Array(frames.length);
        for (let i = 0; i < frames.length; i += 1) {
            shiftedFrames[i] = frames[i] + normalizedOffset;
        }
        return shiftedFrames;
    };

    const upsertTrack = (name: string, category: TrackCategory, frames: Uint32Array): void => {
        if (!frames || frames.length === 0) return;
        const key = createTrackKey(category, name);
        const copiedFrames = applyFrameOffset(frames);
        const existing = frameMap.get(key);
        frameMap.set(key, existing ? mergeFrameNumbers(existing, copiedFrames) : copiedFrames);
    };

    for (const track of animation.movableBoneTracks ?? []) {
        upsertTrack(track.name, classifyBone(track.name), track.frameNumbers);
    }
    for (const track of animation.boneTracks ?? []) {
        upsertTrack(track.name, classifyBone(track.name), track.frameNumbers);
    }
    for (const track of animation.morphTracks ?? []) {
        upsertTrack(track.name, "morph", track.frameNumbers);
    }

    return frameMap;
}

export function getTimelineKeyframeStats(host: any): { hasAnyKeyframe: boolean; maxFrame: number } {
    return getRegisteredKeyframeStats(host);
}

export function createOffsetModelAnimation(animation: MmdAnimation, frameOffset: number): MmdAnimation {
    const offset = Math.max(0, Math.floor(frameOffset));
    if (offset === 0) return animation;

    const offsetFrames = (frames: Uint32Array): Uint32Array => {
        const shifted = new Uint32Array(frames.length);
        for (let i = 0; i < frames.length; i += 1) {
            shifted[i] = frames[i] + offset;
        }
        return shifted;
    };

    const movableBoneTracks = animation.movableBoneTracks.map((track) => {
        const nextTrack = new MmdMovableBoneAnimationTrack(track.name, track.frameNumbers.length);
        nextTrack.frameNumbers.set(offsetFrames(track.frameNumbers));
        nextTrack.positions.set(track.positions);
        nextTrack.positionInterpolations.set(track.positionInterpolations);
        nextTrack.rotations.set(track.rotations);
        nextTrack.rotationInterpolations.set(track.rotationInterpolations);
        nextTrack.physicsToggles.set(track.physicsToggles);
        return nextTrack;
    });

    const boneTracks = animation.boneTracks.map((track) => {
        const nextTrack = new MmdBoneAnimationTrack(track.name, track.frameNumbers.length);
        nextTrack.frameNumbers.set(offsetFrames(track.frameNumbers));
        nextTrack.rotations.set(track.rotations);
        nextTrack.rotationInterpolations.set(track.rotationInterpolations);
        nextTrack.physicsToggles.set(track.physicsToggles);
        return nextTrack;
    });

    const morphTracks = animation.morphTracks.map((track) => {
        const nextTrack = new MmdMorphAnimationTrack(track.name, track.frameNumbers.length);
        nextTrack.frameNumbers.set(offsetFrames(track.frameNumbers));
        nextTrack.weights.set(track.weights);
        return nextTrack;
    });

    return new MmdAnimation(
        `${animation.name}@${offset}`,
        boneTracks,
        movableBoneTracks,
        morphTracks,
        animation.propertyTrack,
        animation.cameraTrack,
    );
}

export function mergeModelAnimations(baseAnimation: MmdAnimation, overlayAnimation: MmdAnimation): MmdAnimation {
    const mergedBoneTracks = mergeBoneTrackArrays(baseAnimation.boneTracks, overlayAnimation.boneTracks);
    const mergedMovableBoneTracks = mergeMovableBoneTrackArrays(baseAnimation.movableBoneTracks, overlayAnimation.movableBoneTracks);
    const mergedMorphTracks = mergeMorphTrackArrays(baseAnimation.morphTracks, overlayAnimation.morphTracks);
    const mergedPropertyTrack = mergePropertyTrack(baseAnimation.propertyTrack, overlayAnimation.propertyTrack);

    return new MmdAnimation(
        `${baseAnimation.name}+${overlayAnimation.name}`,
        mergedBoneTracks,
        mergedMovableBoneTracks,
        mergedMorphTracks,
        mergedPropertyTrack,
        baseAnimation.cameraTrack,
    );
}

function mergePropertyTrack(
    baseTrack: MmdPropertyAnimationTrack,
    overlayTrack: MmdPropertyAnimationTrack,
): MmdPropertyAnimationTrack {
    if (overlayTrack.frameNumbers.length === 0) {
        return baseTrack;
    }
    if (baseTrack.frameNumbers.length === 0) {
        return overlayTrack;
    }

    const mergedFrames = mergeFrameNumbers(baseTrack.frameNumbers, overlayTrack.frameNumbers);
    const mergedIkBoneNames = [...baseTrack.ikBoneNames];
    for (const ikBoneName of overlayTrack.ikBoneNames) {
        if (!mergedIkBoneNames.includes(ikBoneName)) {
            mergedIkBoneNames.push(ikBoneName);
        }
    }

    const mergedTrack = new MmdPropertyAnimationTrack(mergedFrames.length, mergedIkBoneNames);
    mergedTrack.frameNumbers.set(mergedFrames);

    const baseIndexMap = createFrameIndexMap(baseTrack.frameNumbers);
    const overlayIndexMap = createFrameIndexMap(overlayTrack.frameNumbers);
    const baseIkIndexByName = new Map<string, number>();
    const overlayIkIndexByName = new Map<string, number>();

    for (let i = 0; i < baseTrack.ikBoneNames.length; i += 1) {
        baseIkIndexByName.set(baseTrack.ikBoneNames[i], i);
    }
    for (let i = 0; i < overlayTrack.ikBoneNames.length; i += 1) {
        overlayIkIndexByName.set(overlayTrack.ikBoneNames[i], i);
    }

    for (let i = 0; i < mergedFrames.length; i += 1) {
        const frame = mergedFrames[i];
        const overlayIndex = overlayIndexMap.get(frame);
        const baseIndex = baseIndexMap.get(frame);
        const preferredVisible = overlayIndex !== undefined
            ? overlayTrack.visibles[overlayIndex]
            : (baseIndex !== undefined ? baseTrack.visibles[baseIndex] : 0);
        mergedTrack.visibles[i] = preferredVisible;

        for (let ikIndex = 0; ikIndex < mergedIkBoneNames.length; ikIndex += 1) {
            const ikBoneName = mergedIkBoneNames[ikIndex];
            const overlayIkIndex = overlayIkIndexByName.get(ikBoneName);
            if (overlayIndex !== undefined && overlayIkIndex !== undefined) {
                mergedTrack.getIkState(ikIndex)[i] = overlayTrack.getIkState(overlayIkIndex)[overlayIndex];
                continue;
            }

            const baseIkIndex = baseIkIndexByName.get(ikBoneName);
            if (baseIndex !== undefined && baseIkIndex !== undefined) {
                mergedTrack.getIkState(ikIndex)[i] = baseTrack.getIkState(baseIkIndex)[baseIndex];
            }
        }
    }

    return mergedTrack;
}

function mergeMovableBoneTrackArrays(
    baseTracks: readonly MmdMovableBoneAnimationTrack[],
    overlayTracks: readonly MmdMovableBoneAnimationTrack[],
): MmdMovableBoneAnimationTrack[] {
    const overlayByName = new Map<string, MmdMovableBoneAnimationTrack>();
    for (const track of overlayTracks) {
        overlayByName.set(track.name, track);
    }

    const mergedTracks: MmdMovableBoneAnimationTrack[] = [];
    const mergedNames = new Set<string>();

    for (const baseTrack of baseTracks) {
        const overlayTrack = overlayByName.get(baseTrack.name);
        if (!overlayTrack) {
            mergedTracks.push(baseTrack);
            continue;
        }
        mergedNames.add(baseTrack.name);
        mergedTracks.push(mergeMovableBoneTrack(baseTrack, overlayTrack));
    }

    for (const overlayTrack of overlayTracks) {
        if (mergedNames.has(overlayTrack.name)) continue;
        mergedTracks.push(overlayTrack);
    }

    return mergedTracks;
}

function mergeBoneTrackArrays(
    baseTracks: readonly MmdBoneAnimationTrack[],
    overlayTracks: readonly MmdBoneAnimationTrack[],
): MmdBoneAnimationTrack[] {
    const overlayByName = new Map<string, MmdBoneAnimationTrack>();
    for (const track of overlayTracks) {
        overlayByName.set(track.name, track);
    }

    const mergedTracks: MmdBoneAnimationTrack[] = [];
    const mergedNames = new Set<string>();

    for (const baseTrack of baseTracks) {
        const overlayTrack = overlayByName.get(baseTrack.name);
        if (!overlayTrack) {
            mergedTracks.push(baseTrack);
            continue;
        }
        mergedNames.add(baseTrack.name);
        mergedTracks.push(mergeBoneTrack(baseTrack, overlayTrack));
    }

    for (const overlayTrack of overlayTracks) {
        if (mergedNames.has(overlayTrack.name)) continue;
        mergedTracks.push(overlayTrack);
    }

    return mergedTracks;
}

function mergeMorphTrackArrays(
    baseTracks: readonly MmdMorphAnimationTrack[],
    overlayTracks: readonly MmdMorphAnimationTrack[],
): MmdMorphAnimationTrack[] {
    const overlayByName = new Map<string, MmdMorphAnimationTrack>();
    for (const track of overlayTracks) {
        overlayByName.set(track.name, track);
    }

    const mergedTracks: MmdMorphAnimationTrack[] = [];
    const mergedNames = new Set<string>();

    for (const baseTrack of baseTracks) {
        const overlayTrack = overlayByName.get(baseTrack.name);
        if (!overlayTrack) {
            mergedTracks.push(baseTrack);
            continue;
        }
        mergedNames.add(baseTrack.name);
        mergedTracks.push(mergeMorphTrack(baseTrack, overlayTrack));
    }

    for (const overlayTrack of overlayTracks) {
        if (mergedNames.has(overlayTrack.name)) continue;
        mergedTracks.push(overlayTrack);
    }

    return mergedTracks;
}

function mergeMovableBoneTrack(
    baseTrack: MmdMovableBoneAnimationTrack,
    overlayTrack: MmdMovableBoneAnimationTrack,
): MmdMovableBoneAnimationTrack {
    const mergedFrames = mergeFrameNumbers(baseTrack.frameNumbers, overlayTrack.frameNumbers);
    const mergedTrack = new MmdMovableBoneAnimationTrack(baseTrack.name, mergedFrames.length);
    mergedTrack.frameNumbers.set(mergedFrames);

    const baseIndexMap = createFrameIndexMap(baseTrack.frameNumbers);
    const overlayIndexMap = createFrameIndexMap(overlayTrack.frameNumbers);

    for (let i = 0; i < mergedFrames.length; i += 1) {
        const frame = mergedFrames[i];
        const overlayIndex = overlayIndexMap.get(frame);
        if (overlayIndex !== undefined) {
            copyFloatFrameBlock(overlayTrack.positions, overlayIndex, 3, mergedTrack.positions, i);
            copyUint8FrameBlock(overlayTrack.positionInterpolations, overlayIndex, 12, mergedTrack.positionInterpolations, i);
            copyFloatFrameBlock(overlayTrack.rotations, overlayIndex, 4, mergedTrack.rotations, i);
            copyUint8FrameBlock(overlayTrack.rotationInterpolations, overlayIndex, 4, mergedTrack.rotationInterpolations, i);
            copyUint8FrameBlock(overlayTrack.physicsToggles, overlayIndex, 1, mergedTrack.physicsToggles, i);
            continue;
        }

        const baseIndex = baseIndexMap.get(frame);
        if (baseIndex === undefined) continue;
        copyFloatFrameBlock(baseTrack.positions, baseIndex, 3, mergedTrack.positions, i);
        copyUint8FrameBlock(baseTrack.positionInterpolations, baseIndex, 12, mergedTrack.positionInterpolations, i);
        copyFloatFrameBlock(baseTrack.rotations, baseIndex, 4, mergedTrack.rotations, i);
        copyUint8FrameBlock(baseTrack.rotationInterpolations, baseIndex, 4, mergedTrack.rotationInterpolations, i);
        copyUint8FrameBlock(baseTrack.physicsToggles, baseIndex, 1, mergedTrack.physicsToggles, i);
    }

    return mergedTrack;
}

function mergeBoneTrack(
    baseTrack: MmdBoneAnimationTrack,
    overlayTrack: MmdBoneAnimationTrack,
): MmdBoneAnimationTrack {
    const mergedFrames = mergeFrameNumbers(baseTrack.frameNumbers, overlayTrack.frameNumbers);
    const mergedTrack = new MmdBoneAnimationTrack(baseTrack.name, mergedFrames.length);
    mergedTrack.frameNumbers.set(mergedFrames);

    const baseIndexMap = createFrameIndexMap(baseTrack.frameNumbers);
    const overlayIndexMap = createFrameIndexMap(overlayTrack.frameNumbers);

    for (let i = 0; i < mergedFrames.length; i += 1) {
        const frame = mergedFrames[i];
        const overlayIndex = overlayIndexMap.get(frame);
        if (overlayIndex !== undefined) {
            copyFloatFrameBlock(overlayTrack.rotations, overlayIndex, 4, mergedTrack.rotations, i);
            copyUint8FrameBlock(overlayTrack.rotationInterpolations, overlayIndex, 4, mergedTrack.rotationInterpolations, i);
            copyUint8FrameBlock(overlayTrack.physicsToggles, overlayIndex, 1, mergedTrack.physicsToggles, i);
            continue;
        }

        const baseIndex = baseIndexMap.get(frame);
        if (baseIndex === undefined) continue;
        copyFloatFrameBlock(baseTrack.rotations, baseIndex, 4, mergedTrack.rotations, i);
        copyUint8FrameBlock(baseTrack.rotationInterpolations, baseIndex, 4, mergedTrack.rotationInterpolations, i);
        copyUint8FrameBlock(baseTrack.physicsToggles, baseIndex, 1, mergedTrack.physicsToggles, i);
    }

    return mergedTrack;
}

function mergeMorphTrack(
    baseTrack: MmdMorphAnimationTrack,
    overlayTrack: MmdMorphAnimationTrack,
): MmdMorphAnimationTrack {
    const mergedFrames = mergeFrameNumbers(baseTrack.frameNumbers, overlayTrack.frameNumbers);
    const mergedTrack = new MmdMorphAnimationTrack(baseTrack.name, mergedFrames.length);
    mergedTrack.frameNumbers.set(mergedFrames);

    const baseIndexMap = createFrameIndexMap(baseTrack.frameNumbers);
    const overlayIndexMap = createFrameIndexMap(overlayTrack.frameNumbers);

    for (let i = 0; i < mergedFrames.length; i += 1) {
        const frame = mergedFrames[i];
        const overlayIndex = overlayIndexMap.get(frame);
        if (overlayIndex !== undefined) {
            mergedTrack.weights[i] = overlayTrack.weights[overlayIndex];
            continue;
        }

        const baseIndex = baseIndexMap.get(frame);
        if (baseIndex === undefined) continue;
        mergedTrack.weights[i] = baseTrack.weights[baseIndex];
    }

    return mergedTrack;
}
