export type PostEffectBackend = "classic" | "frameGraph";

export const POST_EFFECT_BACKEND_STORAGE_KEY = "mmd_modoki.postEffectBackend";

export function normalizePostEffectBackend(value: unknown, fallback: PostEffectBackend = "frameGraph"): PostEffectBackend {
    if (typeof value !== "string") {
        return fallback;
    }

    const normalized = value.trim().toLowerCase();
    if (normalized === "framegraph" || normalized === "frame-graph" || normalized === "frame_graph") {
        return "frameGraph";
    }
    if (normalized === "classic") {
        return "classic";
    }
    return fallback;
}

export function readPostEffectBackendLocalStorage(fallback: PostEffectBackend = "frameGraph"): PostEffectBackend {
    try {
        return normalizePostEffectBackend(globalThis.localStorage?.getItem(POST_EFFECT_BACKEND_STORAGE_KEY), fallback);
    } catch {
        return fallback;
    }
}
