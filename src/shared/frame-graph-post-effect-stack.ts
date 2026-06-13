export const FRAME_GRAPH_POST_EFFECT_IDS = [
    "ssr",
    "ssao",
    "dof",
    "bloom",
    "lut",
    "sharpen",
    "grain",
    "chromatic",
    "vignette",
    "edgeBlur",
    "distortion",
] as const;

export type FrameGraphPostEffectId = typeof FRAME_GRAPH_POST_EFFECT_IDS[number];

export type FrameGraphPostEffectStackEntry = {
    id: FrameGraphPostEffectId;
    enabled: boolean;
};

const FRAME_GRAPH_POST_EFFECT_ID_SET = new Set<string>(FRAME_GRAPH_POST_EFFECT_IDS);

export function isFrameGraphPostEffectId(value: string): value is FrameGraphPostEffectId {
    return FRAME_GRAPH_POST_EFFECT_ID_SET.has(value);
}

export function normalizeFrameGraphPostEffectIds(
    ids: readonly unknown[] | null | undefined,
    activeIds: readonly FrameGraphPostEffectId[] = [],
): FrameGraphPostEffectId[] {
    const result: FrameGraphPostEffectId[] = [];
    const seen = new Set<FrameGraphPostEffectId>();

    const add = (value: unknown): void => {
        if (typeof value !== "string" || !isFrameGraphPostEffectId(value) || seen.has(value)) {
            return;
        }
        seen.add(value);
        result.push(value);
    };

    ids?.forEach(add);
    FRAME_GRAPH_POST_EFFECT_IDS.forEach((id) => {
        if (activeIds.includes(id)) {
            add(id);
        }
    });
    return result;
}

export function normalizeFrameGraphPostEffectStack(
    entries: readonly unknown[] | null | undefined,
): FrameGraphPostEffectStackEntry[] {
    const result: FrameGraphPostEffectStackEntry[] = [];
    const seen = new Set<FrameGraphPostEffectId>();
    for (const entry of entries ?? []) {
        if (!entry || typeof entry !== "object") {
            continue;
        }
        const candidate = entry as { id?: unknown; enabled?: unknown };
        if (typeof candidate.id !== "string" || !isFrameGraphPostEffectId(candidate.id) || seen.has(candidate.id)) {
            continue;
        }
        seen.add(candidate.id);
        result.push({
            id: candidate.id,
            enabled: typeof candidate.enabled === "boolean" ? candidate.enabled : false,
        });
    }
    return result;
}

export function addFrameGraphPostEffectId(
    currentIds: readonly FrameGraphPostEffectId[],
    id: FrameGraphPostEffectId,
): FrameGraphPostEffectId[] {
    if (currentIds.includes(id)) {
        return [...currentIds];
    }
    const next = [...currentIds];
    const canonicalIndex = FRAME_GRAPH_POST_EFFECT_IDS.indexOf(id);
    const insertBeforeIndex = next.findIndex((candidate) => (
        FRAME_GRAPH_POST_EFFECT_IDS.indexOf(candidate) > canonicalIndex
    ));
    if (insertBeforeIndex < 0) {
        next.push(id);
    } else {
        next.splice(insertBeforeIndex, 0, id);
    }
    return next;
}

export function moveFrameGraphPostEffectId(
    currentIds: readonly FrameGraphPostEffectId[],
    id: FrameGraphPostEffectId,
    direction: -1 | 1,
): FrameGraphPostEffectId[] {
    const index = currentIds.indexOf(id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= currentIds.length) {
        return [...currentIds];
    }
    const next = [...currentIds];
    const [entry] = next.splice(index, 1);
    next.splice(targetIndex, 0, entry);
    return next;
}

