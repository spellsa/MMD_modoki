import type { TrackCategory } from "../types";

const EMPTY_KEYFRAME_FRAMES = new Uint32Array(0);
const TRACK_KEY_SEPARATOR = "\u001f";

export function classifyBone(name: string): TrackCategory {
    if (
        name.startsWith("\u30bb\u30f3\u30bf\u30fc")
        || name.startsWith("center")
        || name === "\u5168\u3066\u306e\u89aa"
    ) return "root";
    if (/^(左|右|L|R)/i.test(name) || /bone/i.test(name)) return "bone";
    if (name.includes("\u30e2\u30fc\u30d5") || name.includes("morph")) return "morph";
    return "bone";
}

export function mergeFrameNumbers(a: Uint32Array, b: Uint32Array): Uint32Array {
    if (a.length === 0) return new Uint32Array(b);
    if (b.length === 0) return new Uint32Array(a);

    const merged = new Uint32Array(a.length + b.length);
    let ai = 0;
    let bi = 0;
    let mi = 0;
    let last = -1;

    while (ai < a.length || bi < b.length) {
        const nextA = ai < a.length ? a[ai] : Number.POSITIVE_INFINITY;
        const nextB = bi < b.length ? b[bi] : Number.POSITIVE_INFINITY;
        const next = Math.min(nextA, nextB);
        if (next !== last) {
            merged[mi++] = next;
            last = next;
        }
        if (nextA === next) ai += 1;
        if (nextB === next) bi += 1;
    }

    return mi === merged.length ? merged : merged.subarray(0, mi);
}

export function hasFrameNumber(frames: Uint32Array, frame: number): boolean {
    let left = 0;
    let right = frames.length - 1;

    while (left <= right) {
        const mid = (left + right) >>> 1;
        const value = frames[mid];
        if (value === frame) return true;
        if (value < frame) left = mid + 1;
        else right = mid - 1;
    }

    return false;
}

export function addFrameNumber(frames: Uint32Array, frame: number): Uint32Array {
    if (hasFrameNumber(frames, frame)) return frames;

    const result = new Uint32Array(frames.length + 1);
    let inserted = false;
    let ri = 0;

    for (let i = 0; i < frames.length; i += 1) {
        const current = frames[i];
        if (!inserted && frame < current) {
            result[ri++] = frame;
            inserted = true;
        }
        result[ri++] = current;
    }

    if (!inserted) {
        result[ri++] = frame;
    }

    return result;
}

export function removeFrameNumber(frames: Uint32Array, frame: number): Uint32Array {
    const index = frames.indexOf(frame);
    if (index < 0) return frames;
    if (frames.length === 1) return EMPTY_KEYFRAME_FRAMES;

    const result = new Uint32Array(frames.length - 1);
    result.set(frames.subarray(0, index), 0);
    result.set(frames.subarray(index + 1), index);
    return result;
}

export function moveFrameNumber(frames: Uint32Array, fromFrame: number, toFrame: number): Uint32Array {
    if (fromFrame === toFrame) return frames;
    const removed = removeFrameNumber(frames, fromFrame);
    if (removed === frames) return frames;
    return addFrameNumber(removed, toFrame);
}

export function createTrackKey(category: TrackCategory, name: string): string {
    return `${category}${TRACK_KEY_SEPARATOR}${name}`;
}

export function parseTrackKey(key: string): { category: TrackCategory; name: string } | null {
    const separatorIndex = key.indexOf(TRACK_KEY_SEPARATOR);
    if (separatorIndex < 0) return null;

    const category = key.substring(0, separatorIndex) as TrackCategory;
    const name = key.substring(separatorIndex + 1);
    if (!category || !name) return null;
    return { category, name };
}
