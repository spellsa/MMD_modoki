import type { CommandTrackRef } from "../actions/command-types";
import type { TimelineKeyframePayload } from "./timeline-edit-service";

export type MirrorPasteClipboardItem = {
    track: CommandTrackRef;
    sourceFrame: number;
    frameOffset: number;
    payload: TimelineKeyframePayload;
};

export type MirrorPasteItem = {
    track: CommandTrackRef;
    sourceFrame: number;
    targetFrame: number;
    after: TimelineKeyframePayload;
};

const ASCII_SIDE_PATTERNS: readonly [RegExp, string][] = [
    [/(^|[^A-Za-z])Left(?=$|[^A-Za-z])/i, "$1Right"],
    [/(^|[^A-Za-z])Right(?=$|[^A-Za-z])/i, "$1Left"],
    [/(^|[^A-Za-z])L(?=$|[^A-Za-z])/i, "$1R"],
    [/(^|[^A-Za-z])R(?=$|[^A-Za-z])/i, "$1L"],
];

export function resolveMirrorBoneName(sourceName: string, availableBoneNames: ReadonlySet<string>): string {
    const candidates = createMirrorBoneNameCandidates(sourceName);
    for (const candidate of candidates) {
        if (candidate !== sourceName && availableBoneNames.has(candidate)) {
            return candidate;
        }
    }
    return sourceName;
}

function createMirrorBoneNameCandidates(sourceName: string): string[] {
    const candidates: string[] = [];
    const push = (candidate: string): void => {
        if (candidate.length > 0 && !candidates.includes(candidate)) {
            candidates.push(candidate);
        }
    };

    if (sourceName.includes("左")) push(sourceName.replace(/左/g, "右"));
    if (sourceName.includes("右")) push(sourceName.replace(/右/g, "左"));
    if (sourceName.includes("Ｌ")) push(sourceName.replace(/Ｌ/g, "Ｒ"));
    if (sourceName.includes("Ｒ")) push(sourceName.replace(/Ｒ/g, "Ｌ"));

    for (const [pattern, replacement] of ASCII_SIDE_PATTERNS) {
        const candidate = sourceName.replace(pattern, replacement);
        if (candidate !== sourceName) push(candidate);
    }

    push(sourceName);
    return candidates;
}

export function createMirroredKeyframePayload(payload: TimelineKeyframePayload): TimelineKeyframePayload | null {
    switch (payload.kind) {
        case "movableBone":
            return {
                kind: "movableBone",
                positions: mirrorPositionBlock(payload.positions),
                positionInterpolations: [...payload.positionInterpolations],
                rotations: mirrorRotationQuaternionBlock(payload.rotations),
                rotationInterpolations: [...payload.rotationInterpolations],
                physicsToggles: [...payload.physicsToggles],
            };
        case "bone":
            return {
                kind: "bone",
                rotations: mirrorRotationQuaternionBlock(payload.rotations),
                rotationInterpolations: [...payload.rotationInterpolations],
                physicsToggles: [...payload.physicsToggles],
            };
        case "camera":
        case "morph":
            return null;
    }
}

function mirrorPositionBlock(values: readonly number[]): number[] {
    const next = [...values];
    if (next.length > 0) {
        next[0] = -normalizeFiniteNumber(next[0]);
    }
    return next.map(normalizeFiniteNumber);
}

function mirrorRotationQuaternionBlock(values: readonly number[]): number[] {
    const next = [...values].map(normalizeFiniteNumber);
    if (next.length >= 4) {
        next[1] = -next[1];
        next[2] = -next[2];
    }
    return next;
}

function normalizeFiniteNumber(value: number): number {
    return Number.isFinite(value) ? value : 0;
}

export function buildMirrorPasteItems(
    clipboardItems: readonly MirrorPasteClipboardItem[],
    pasteBaseFrame: number,
    availableBoneNames: ReadonlySet<string>,
): MirrorPasteItem[] {
    const normalizedBaseFrame = Math.max(0, Math.floor(pasteBaseFrame));
    const items: MirrorPasteItem[] = [];

    for (const item of clipboardItems) {
        const mirroredPayload = createMirroredKeyframePayload(item.payload);
        if (!mirroredPayload) continue;

        const targetFrame = normalizedBaseFrame + Math.floor(item.frameOffset);
        if (targetFrame < 0) continue;

        const targetName = resolveMirrorBoneName(item.track.name, availableBoneNames);
        items.push({
            track: {
                category: item.track.category,
                name: targetName,
            },
            sourceFrame: item.sourceFrame,
            targetFrame,
            after: mirroredPayload,
        });
    }

    return items;
}
