import { MmdAnimation } from "babylon-mmd/esm/Loader/Animation/mmdAnimation";
import {
    MmdBoneAnimationTrack,
    MmdCameraAnimationTrack,
    MmdMorphAnimationTrack,
    MmdMovableBoneAnimationTrack,
    MmdPropertyAnimationTrack,
} from "babylon-mmd/esm/Loader/Animation/mmdAnimationTrack";
import type { ModelInfo } from "../types";
import {
    createEmptyEditorModelMotion,
    normalizeFrame,
    normalizePhysicsToggle,
    sortAndDedupeBoneKeys,
    sortAndDedupeMorphKeys,
    type EditorBoneKey,
    type EditorBoneTrack,
    type EditorBoneTrackKind,
    type EditorIkStateTrack,
    type EditorModelMotion,
    type EditorMorphKey,
} from "./motion-document";

export function createEditorModelMotionFromMmdAnimation(
    name: string,
    animation: MmdAnimation | null | undefined,
    modelInfo: Pick<ModelInfo, "boneControlInfos"> | null | undefined,
): EditorModelMotion {
    const motion = createEmptyEditorModelMotion(name);
    if (!animation) return motion;

    for (const track of animation.boneTracks) {
        const kind = resolveBoneTrackKind(track.name, "bone", modelInfo);
        motion.boneTracks.set(track.name, {
            name: track.name,
            kind,
            keys: readBoneKeys(track, kind),
        });
    }

    for (const track of animation.movableBoneTracks) {
        const kind = resolveBoneTrackKind(track.name, "movableBone", modelInfo);
        const existing = motion.boneTracks.get(track.name);
        const keys = readMovableBoneKeys(track, kind);
        motion.boneTracks.set(track.name, {
            name: track.name,
            kind,
            keys: existing
                ? sortAndDedupeBoneKeys([...existing.keys, ...keys], kind)
                : keys,
        });
    }

    for (const track of animation.morphTracks) {
        motion.morphTracks.set(track.name, {
            name: track.name,
            keys: readMorphKeys(track),
        });
    }

    motion.propertyTrack = readPropertyTrack(animation.propertyTrack);
    return motion;
}

export function buildMmdAnimationFromEditorMotion(
    name: string,
    motion: EditorModelMotion,
    modelInfo: Pick<ModelInfo, "boneControlInfos"> | null | undefined,
    sourceCameraTrack?: MmdCameraAnimationTrack | null,
): MmdAnimation {
    const boneTracks: MmdBoneAnimationTrack[] = [];
    const movableBoneTracks: MmdMovableBoneAnimationTrack[] = [];
    const morphTracks: MmdMorphAnimationTrack[] = [];

    for (const track of motion.boneTracks.values()) {
        const kind = resolveBoneTrackKind(track.name, track.kind, modelInfo);
        const normalizedTrack: EditorBoneTrack = {
            name: track.name,
            kind,
            keys: sortAndDedupeBoneKeys(track.keys, kind),
        };
        if (normalizedTrack.keys.length === 0) continue;
        if (kind === "movableBone") {
            movableBoneTracks.push(createMovableBoneTrack(normalizedTrack));
        } else {
            boneTracks.push(createBoneTrack(normalizedTrack));
        }
    }

    for (const track of motion.morphTracks.values()) {
        const keys = sortAndDedupeMorphKeys(track.keys);
        if (keys.length === 0) continue;
        morphTracks.push(createMorphTrack(track.name, keys));
    }

    return new MmdAnimation(
        name,
        boneTracks,
        movableBoneTracks,
        morphTracks,
        createPropertyTrack(motion),
        sourceCameraTrack ? cloneCameraTrack(sourceCameraTrack) : new MmdCameraAnimationTrack(0),
    );
}

export function resolveBoneTrackKind(
    boneName: string,
    fallback: EditorBoneTrackKind,
    modelInfo: Pick<ModelInfo, "boneControlInfos"> | null | undefined,
): EditorBoneTrackKind {
    const boneControl = modelInfo?.boneControlInfos?.find((candidate) => candidate.name === boneName);
    if (boneControl) return boneControl.movable ? "movableBone" : "bone";
    return fallback;
}

function readBoneKeys(track: MmdBoneAnimationTrack, kind: EditorBoneTrackKind): EditorBoneKey[] {
    const keys: EditorBoneKey[] = [];
    for (let index = 0; index < track.frameNumbers.length; index += 1) {
        keys.push({
            frame: normalizeFrame(track.frameNumbers[index]),
            rotation: [
                track.rotations[index * 4],
                track.rotations[index * 4 + 1],
                track.rotations[index * 4 + 2],
                track.rotations[index * 4 + 3],
            ],
            rotationInterpolation: [
                track.rotationInterpolations[index * 4],
                track.rotationInterpolations[index * 4 + 1],
                track.rotationInterpolations[index * 4 + 2],
                track.rotationInterpolations[index * 4 + 3],
            ],
            physicsToggle: normalizePhysicsToggle(track.physicsToggles[index]),
        });
    }
    return sortAndDedupeBoneKeys(keys, kind);
}

function readMovableBoneKeys(track: MmdMovableBoneAnimationTrack, kind: EditorBoneTrackKind): EditorBoneKey[] {
    const keys: EditorBoneKey[] = [];
    for (let index = 0; index < track.frameNumbers.length; index += 1) {
        keys.push({
            frame: normalizeFrame(track.frameNumbers[index]),
            position: [
                track.positions[index * 3],
                track.positions[index * 3 + 1],
                track.positions[index * 3 + 2],
            ],
            positionInterpolation: [
                track.positionInterpolations[index * 12],
                track.positionInterpolations[index * 12 + 1],
                track.positionInterpolations[index * 12 + 2],
                track.positionInterpolations[index * 12 + 3],
                track.positionInterpolations[index * 12 + 4],
                track.positionInterpolations[index * 12 + 5],
                track.positionInterpolations[index * 12 + 6],
                track.positionInterpolations[index * 12 + 7],
                track.positionInterpolations[index * 12 + 8],
                track.positionInterpolations[index * 12 + 9],
                track.positionInterpolations[index * 12 + 10],
                track.positionInterpolations[index * 12 + 11],
            ],
            rotation: [
                track.rotations[index * 4],
                track.rotations[index * 4 + 1],
                track.rotations[index * 4 + 2],
                track.rotations[index * 4 + 3],
            ],
            rotationInterpolation: [
                track.rotationInterpolations[index * 4],
                track.rotationInterpolations[index * 4 + 1],
                track.rotationInterpolations[index * 4 + 2],
                track.rotationInterpolations[index * 4 + 3],
            ],
            physicsToggle: normalizePhysicsToggle(track.physicsToggles[index]),
        });
    }
    return sortAndDedupeBoneKeys(keys, kind);
}

function readMorphKeys(track: MmdMorphAnimationTrack): EditorMorphKey[] {
    const keys: EditorMorphKey[] = [];
    for (let index = 0; index < track.frameNumbers.length; index += 1) {
        keys.push({
            frame: normalizeFrame(track.frameNumbers[index]),
            weight: Number.isFinite(track.weights[index]) ? track.weights[index] : 0,
        });
    }
    return sortAndDedupeMorphKeys(keys);
}

function readPropertyTrack(track: MmdPropertyAnimationTrack) {
    const ikStates: EditorIkStateTrack[] = [];
    for (let index = 0; index < track.ikBoneNames.length; index += 1) {
        ikStates.push({
            boneName: track.ikBoneNames[index],
            states: Array.from(track.getIkState(index), (value) => value ? 1 : 0),
        });
    }
    return {
        keys: Array.from(track.frameNumbers, (frame, index) => ({
            frame: normalizeFrame(frame),
            visible: track.visibles[index] ? 1 : 0,
        })),
        ikStates,
    };
}

function createBoneTrack(track: EditorBoneTrack): MmdBoneAnimationTrack {
    const keys = sortAndDedupeBoneKeys(track.keys, "bone");
    const result = new MmdBoneAnimationTrack(track.name, keys.length);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        result.frameNumbers[index] = key.frame;
        result.rotations.set(key.rotation, index * 4);
        result.rotationInterpolations.set(key.rotationInterpolation, index * 4);
        result.physicsToggles[index] = key.physicsToggle;
    }
    return result;
}

function createMovableBoneTrack(track: EditorBoneTrack): MmdMovableBoneAnimationTrack {
    const keys = sortAndDedupeBoneKeys(track.keys, "movableBone");
    const result = new MmdMovableBoneAnimationTrack(track.name, keys.length);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        result.frameNumbers[index] = key.frame;
        result.positions.set(key.position ?? [0, 0, 0], index * 3);
        result.positionInterpolations.set(
            key.positionInterpolation ?? [20, 107, 20, 107, 20, 107, 20, 107, 20, 107, 20, 107],
            index * 12,
        );
        result.rotations.set(key.rotation, index * 4);
        result.rotationInterpolations.set(key.rotationInterpolation, index * 4);
        result.physicsToggles[index] = key.physicsToggle;
    }
    return result;
}

function createMorphTrack(name: string, keys: readonly EditorMorphKey[]): MmdMorphAnimationTrack {
    const result = new MmdMorphAnimationTrack(name, keys.length);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        result.frameNumbers[index] = key.frame;
        result.weights[index] = key.weight;
    }
    return result;
}

function createPropertyTrack(motion: EditorModelMotion): MmdPropertyAnimationTrack {
    const keys = [...motion.propertyTrack.keys].sort((a, b) => a.frame - b.frame);
    const ikBoneNames = motion.propertyTrack.ikStates.map((track) => track.boneName);
    const result = new MmdPropertyAnimationTrack(keys.length, ikBoneNames);
    for (let index = 0; index < keys.length; index += 1) {
        result.frameNumbers[index] = keys[index].frame;
        result.visibles[index] = keys[index].visible ? 1 : 0;
    }
    for (let ikIndex = 0; ikIndex < ikBoneNames.length; ikIndex += 1) {
        const states = motion.propertyTrack.ikStates[ikIndex].states;
        const target = result.getIkState(ikIndex);
        for (let frameIndex = 0; frameIndex < target.length; frameIndex += 1) {
            target[frameIndex] = states[frameIndex] ? 1 : 0;
        }
    }
    return result;
}

function cloneCameraTrack(track: MmdCameraAnimationTrack): MmdCameraAnimationTrack {
    const result = new MmdCameraAnimationTrack(track.frameNumbers.length);
    result.frameNumbers.set(track.frameNumbers);
    result.positions.set(track.positions);
    result.positionInterpolations.set(track.positionInterpolations);
    result.rotations.set(track.rotations);
    result.rotationInterpolations.set(track.rotationInterpolations);
    result.distances.set(track.distances);
    result.distanceInterpolations.set(track.distanceInterpolations);
    result.fovs.set(track.fovs);
    result.fovInterpolations.set(track.fovInterpolations);
    return result;
}
