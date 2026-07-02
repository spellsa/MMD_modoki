export type EditorBoneTrackKind = "bone" | "movableBone";

export type EditorVector3Tuple = readonly [number, number, number];
export type EditorQuaternionTuple = readonly [number, number, number, number];
export type EditorUint8Tuple4 = readonly [number, number, number, number];
export type EditorUint8Tuple12 = readonly [
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
];

export type EditorBoneKey = {
    frame: number;
    rotation: EditorQuaternionTuple;
    rotationInterpolation: EditorUint8Tuple4;
    physicsToggle: 0 | 1;
    position?: EditorVector3Tuple;
    positionInterpolation?: EditorUint8Tuple12;
};

export type EditorBoneTrack = {
    name: string;
    kind: EditorBoneTrackKind;
    keys: EditorBoneKey[];
};

export type EditorMorphKey = {
    frame: number;
    weight: number;
};

export type EditorMorphTrack = {
    name: string;
    keys: EditorMorphKey[];
};

export type EditorIkStateTrack = {
    boneName: string;
    states: number[];
};

export type EditorPropertyKey = {
    frame: number;
    visible: number;
};

export type EditorPropertyTrack = {
    keys: EditorPropertyKey[];
    ikStates: EditorIkStateTrack[];
};

export type EditorModelMotion = {
    name: string;
    boneTracks: Map<string, EditorBoneTrack>;
    morphTracks: Map<string, EditorMorphTrack>;
    propertyTrack: EditorPropertyTrack;
};

export type EditorBonePoseSample = {
    position: EditorVector3Tuple;
    rotation: EditorQuaternionTuple;
    physicsToggle: 0 | 1;
};

export function createEmptyEditorModelMotion(name: string): EditorModelMotion {
    return {
        name,
        boneTracks: new Map(),
        morphTracks: new Map(),
        propertyTrack: {
            keys: [],
            ikStates: [],
        },
    };
}

export function upsertBoneKey(
    motion: EditorModelMotion,
    trackName: string,
    kind: EditorBoneTrackKind,
    key: EditorBoneKey,
): { motion: EditorModelMotion; before: EditorBoneKey | null; after: EditorBoneKey } {
    const normalizedKey = normalizeBoneKey(key, kind);
    const previousTrack = motion.boneTracks.get(trackName);
    const previousKey = previousTrack?.keys.find((candidate) => candidate.frame === normalizedKey.frame) ?? null;
    const nextTrack: EditorBoneTrack = {
        name: trackName,
        kind,
        keys: sortAndDedupeBoneKeys([
            ...(previousTrack?.keys ?? []),
            normalizedKey,
        ], kind),
    };
    const nextMotion = cloneEditorModelMotion(motion);
    nextMotion.boneTracks.set(trackName, nextTrack);
    return {
        motion: nextMotion,
        before: previousKey,
        after: normalizedKey,
    };
}

export function removeBoneKey(
    motion: EditorModelMotion,
    trackName: string,
    frame: number,
): { motion: EditorModelMotion; removed: EditorBoneKey | null } {
    const normalizedFrame = normalizeFrame(frame);
    const previousTrack = motion.boneTracks.get(trackName);
    if (!previousTrack) {
        return { motion, removed: null };
    }

    const removed = previousTrack.keys.find((candidate) => candidate.frame === normalizedFrame) ?? null;
    if (!removed) {
        return { motion, removed: null };
    }

    const nextMotion = cloneEditorModelMotion(motion);
    const nextKeys = previousTrack.keys.filter((candidate) => candidate.frame !== normalizedFrame);
    if (nextKeys.length === 0) {
        nextMotion.boneTracks.delete(trackName);
    } else {
        nextMotion.boneTracks.set(trackName, {
            ...previousTrack,
            keys: nextKeys,
        });
    }
    return { motion: nextMotion, removed };
}

export function moveBoneKey(
    motion: EditorModelMotion,
    trackName: string,
    fromFrame: number,
    toFrame: number,
): { motion: EditorModelMotion; moved: EditorBoneKey | null; overwritten: EditorBoneKey | null } {
    const normalizedFrom = normalizeFrame(fromFrame);
    const normalizedTo = normalizeFrame(toFrame);
    if (normalizedFrom === normalizedTo) {
        return { motion, moved: null, overwritten: null };
    }

    const track = motion.boneTracks.get(trackName);
    const sourceKey = track?.keys.find((candidate) => candidate.frame === normalizedFrom) ?? null;
    if (!track || !sourceKey) {
        return { motion, moved: null, overwritten: null };
    }

    const overwritten = track.keys.find((candidate) => candidate.frame === normalizedTo) ?? null;
    const moved = { ...sourceKey, frame: normalizedTo };
    const nextTrack: EditorBoneTrack = {
        ...track,
        keys: sortAndDedupeBoneKeys([
            ...track.keys.filter((candidate) => candidate.frame !== normalizedFrom),
            moved,
        ], track.kind),
    };
    const nextMotion = cloneEditorModelMotion(motion);
    nextMotion.boneTracks.set(trackName, nextTrack);
    return { motion: nextMotion, moved, overwritten };
}

export function sampleBoneTrack(track: EditorBoneTrack, frame: number): EditorBonePoseSample | null {
    const keys = sortAndDedupeBoneKeys(track.keys, track.kind);
    if (keys.length === 0) return null;

    const normalizedFrame = normalizeFrame(frame);
    let lower = keys[0];
    let upper: EditorBoneKey | null = null;
    for (const key of keys) {
        if (key.frame <= normalizedFrame) {
            lower = key;
            continue;
        }
        upper = key;
        break;
    }

    if (!upper || upper.frame === lower.frame) {
        return {
            position: lower.position ?? [0, 0, 0],
            rotation: lower.rotation,
            physicsToggle: lower.physicsToggle,
        };
    }

    const gradient = (normalizedFrame - lower.frame) / (upper.frame - lower.frame);
    return {
        position: lerpVector3(lower.position ?? [0, 0, 0], upper.position ?? [0, 0, 0], gradient),
        rotation: lerpQuaternion(lower.rotation, upper.rotation, gradient),
        physicsToggle: lower.physicsToggle,
    };
}

export function cloneEditorModelMotion(motion: EditorModelMotion): EditorModelMotion {
    return {
        name: motion.name,
        boneTracks: new Map([...motion.boneTracks].map(([name, track]) => [name, cloneBoneTrack(track)])),
        morphTracks: new Map([...motion.morphTracks].map(([name, track]) => [name, {
            name: track.name,
            keys: track.keys.map((key) => ({ ...key })),
        }])),
        propertyTrack: {
            keys: motion.propertyTrack.keys.map((key) => ({ ...key })),
            ikStates: motion.propertyTrack.ikStates.map((track) => ({
                boneName: track.boneName,
                states: [...track.states],
            })),
        },
    };
}

export function normalizeFrame(frame: number): number {
    return Number.isFinite(frame) && frame > 0 ? Math.floor(frame) : 0;
}

export function normalizePhysicsToggle(value: number | undefined): 0 | 1 {
    return value === 0 ? 0 : 1;
}

export function normalizeUint8(value: number | undefined, fallback = 0): number {
    const normalized = Number.isFinite(value) ? Math.round(value) : fallback;
    return Math.max(0, Math.min(127, normalized));
}

export function sortAndDedupeBoneKeys(keys: readonly EditorBoneKey[], kind: EditorBoneTrackKind): EditorBoneKey[] {
    const byFrame = new Map<number, EditorBoneKey>();
    for (const key of keys) {
        const normalized = normalizeBoneKey(key, kind);
        byFrame.set(normalized.frame, normalized);
    }
    return [...byFrame.values()].sort((a, b) => a.frame - b.frame);
}

export function sortAndDedupeMorphKeys(keys: readonly EditorMorphKey[]): EditorMorphKey[] {
    const byFrame = new Map<number, EditorMorphKey>();
    for (const key of keys) {
        byFrame.set(normalizeFrame(key.frame), {
            frame: normalizeFrame(key.frame),
            weight: Number.isFinite(key.weight) ? key.weight : 0,
        });
    }
    return [...byFrame.values()].sort((a, b) => a.frame - b.frame);
}

function normalizeBoneKey(key: EditorBoneKey, kind: EditorBoneTrackKind): EditorBoneKey {
    const normalized: EditorBoneKey = {
        frame: normalizeFrame(key.frame),
        rotation: normalizeQuaternion(key.rotation),
        rotationInterpolation: normalizeUint8Tuple4(key.rotationInterpolation, [20, 107, 20, 107]),
        physicsToggle: normalizePhysicsToggle(key.physicsToggle),
    };
    if (kind === "movableBone") {
        normalized.position = normalizeVector3(key.position ?? [0, 0, 0]);
        normalized.positionInterpolation = normalizeUint8Tuple12(
            key.positionInterpolation ?? [20, 107, 20, 107, 20, 107, 20, 107, 20, 107, 20, 107],
        );
    }
    return normalized;
}

function cloneBoneTrack(track: EditorBoneTrack): EditorBoneTrack {
    return {
        name: track.name,
        kind: track.kind,
        keys: track.keys.map((key) => normalizeBoneKey(key, track.kind)),
    };
}

function normalizeVector3(value: readonly number[]): EditorVector3Tuple {
    return [
        Number.isFinite(value[0]) ? value[0] : 0,
        Number.isFinite(value[1]) ? value[1] : 0,
        Number.isFinite(value[2]) ? value[2] : 0,
    ];
}

function normalizeQuaternion(value: readonly number[]): EditorQuaternionTuple {
    const x = Number.isFinite(value[0]) ? value[0] : 0;
    const y = Number.isFinite(value[1]) ? value[1] : 0;
    const z = Number.isFinite(value[2]) ? value[2] : 0;
    const w = Number.isFinite(value[3]) ? value[3] : 1;
    const length = Math.hypot(x, y, z, w);
    if (length <= 0.000001) return [0, 0, 0, 1];
    return [x / length, y / length, z / length, w / length];
}

function normalizeUint8Tuple4(value: readonly number[], fallback: EditorUint8Tuple4): EditorUint8Tuple4 {
    return [
        normalizeUint8(value[0], fallback[0]),
        normalizeUint8(value[1], fallback[1]),
        normalizeUint8(value[2], fallback[2]),
        normalizeUint8(value[3], fallback[3]),
    ];
}

function normalizeUint8Tuple12(value: readonly number[]): EditorUint8Tuple12 {
    return [
        normalizeUint8(value[0], 20),
        normalizeUint8(value[1], 107),
        normalizeUint8(value[2], 20),
        normalizeUint8(value[3], 107),
        normalizeUint8(value[4], 20),
        normalizeUint8(value[5], 107),
        normalizeUint8(value[6], 20),
        normalizeUint8(value[7], 107),
        normalizeUint8(value[8], 20),
        normalizeUint8(value[9], 107),
        normalizeUint8(value[10], 20),
        normalizeUint8(value[11], 107),
    ];
}

function lerpVector3(a: EditorVector3Tuple, b: EditorVector3Tuple, t: number): EditorVector3Tuple {
    return [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
    ];
}

function lerpQuaternion(a: EditorQuaternionTuple, b: EditorQuaternionTuple, t: number): EditorQuaternionTuple {
    const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    const bx = dot < 0 ? -b[0] : b[0];
    const by = dot < 0 ? -b[1] : b[1];
    const bz = dot < 0 ? -b[2] : b[2];
    const bw = dot < 0 ? -b[3] : b[3];
    return normalizeQuaternion([
        a[0] + (bx - a[0]) * t,
        a[1] + (by - a[1]) * t,
        a[2] + (bz - a[2]) * t,
        a[3] + (bw - a[3]) * t,
    ]);
}
