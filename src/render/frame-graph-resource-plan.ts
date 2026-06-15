import {
    FRAME_GRAPH_POST_EFFECT_IDS,
    normalizeFrameGraphPostEffectIds,
    type FrameGraphPostEffectId,
} from "../shared/frame-graph-post-effect-stack";

export type FrameGraphSharedResourceKey =
    | "sceneColor"
    | "depthScene"
    | "viewDepth"
    | "viewNormal"
    | "reflectivity"
    | "luminousMask";

export type FrameGraphResourcePlanSettings = {
    imageProcessingEnabled: boolean;
    dofEnabled: boolean;
    luminousEnabled: boolean;
    luminousIntensity: number;
    bloomEnabled: boolean;
    lutEnabled: boolean;
    sharpenEdge: number;
    grainIntensity: number;
    chromaticAberration: number;
    vignetteEnabled: boolean;
    vignetteWeight: number;
    edgeBlurStrength: number;
    lensDistortion: number;
    ssaoEnabled: boolean;
    ssaoStrength: number;
    ssrEnabled: boolean;
    ssrStrength: number;
    antialiasEnabled: boolean;
};

export type FrameGraphResourceRequirement = {
    key: FrameGraphSharedResourceKey;
    consumers: FrameGraphPostEffectId[];
    producer: "import" | "depthRenderer" | "geometryRenderer" | "luminousMask";
    resolution: "full";
};

export type FrameGraphResourcePlan = {
    effectOrder: FrameGraphPostEffectId[];
    activeEffects: FrameGraphPostEffectId[];
    requirements: FrameGraphResourceRequirement[];
    requirementKeys: FrameGraphSharedResourceKey[];
    needsGeometryRenderer: boolean;
    needsDepthRenderer: boolean;
    needsLuminousMask: boolean;
    fixedTasks: {
        imageProcessing: boolean;
        fxaa: boolean;
    };
};

function addConsumer(
    consumersByKey: Map<FrameGraphSharedResourceKey, Set<FrameGraphPostEffectId>>,
    key: FrameGraphSharedResourceKey,
    consumer: FrameGraphPostEffectId,
): void {
    const consumers = consumersByKey.get(key) ?? new Set<FrameGraphPostEffectId>();
    consumers.add(consumer);
    consumersByKey.set(key, consumers);
}

function isEffectActive(settings: FrameGraphResourcePlanSettings, id: FrameGraphPostEffectId): boolean {
    switch (id) {
        case "ssr":
            return settings.ssrEnabled && settings.ssrStrength > 0.00001;
        case "ssao":
            return settings.ssaoEnabled && settings.ssaoStrength > 0.00001;
        case "dof":
            return settings.dofEnabled;
        case "luminous":
            return settings.luminousEnabled && settings.luminousIntensity > 0.0001;
        case "bloom":
            return settings.bloomEnabled;
        case "lut":
            return settings.lutEnabled;
        case "sharpen":
            return settings.sharpenEdge > 0.0001;
        case "grain":
            return settings.grainIntensity > 0.0001;
        case "chromatic":
            return settings.chromaticAberration > 0.0001;
        case "vignette":
            return settings.vignetteEnabled && settings.vignetteWeight > 0.0001;
        case "edgeBlur":
            return settings.edgeBlurStrength > 0.0001;
        case "distortion":
            return Math.abs(settings.lensDistortion) > 0.0001;
    }
}

function getProducer(key: FrameGraphSharedResourceKey): FrameGraphResourceRequirement["producer"] {
    switch (key) {
        case "sceneColor":
            return "import";
        case "depthScene":
            return "depthRenderer";
        case "viewDepth":
        case "viewNormal":
        case "reflectivity":
            return "geometryRenderer";
        case "luminousMask":
            return "luminousMask";
    }
}

export function buildFrameGraphResourcePlan(
    settings: FrameGraphResourcePlanSettings,
    effectOrder: readonly FrameGraphPostEffectId[] = FRAME_GRAPH_POST_EFFECT_IDS,
): FrameGraphResourcePlan {
    const activeEffects = FRAME_GRAPH_POST_EFFECT_IDS.filter((id) => isEffectActive(settings, id));
    const normalizedOrder = normalizeFrameGraphPostEffectIds(effectOrder, activeEffects);
    const consumersByKey = new Map<FrameGraphSharedResourceKey, Set<FrameGraphPostEffectId>>();

    for (const id of activeEffects) {
        addConsumer(consumersByKey, "sceneColor", id);
    }

    if (activeEffects.includes("ssr")) {
        addConsumer(consumersByKey, "viewDepth", "ssr");
        addConsumer(consumersByKey, "viewNormal", "ssr");
        addConsumer(consumersByKey, "reflectivity", "ssr");
    }

    if (activeEffects.includes("ssao")) {
        addConsumer(consumersByKey, "viewDepth", "ssao");
        addConsumer(consumersByKey, "viewNormal", "ssao");
    }

    if (activeEffects.includes("dof")) {
        addConsumer(consumersByKey, "depthScene", "dof");
    }

    if (activeEffects.includes("luminous")) {
        addConsumer(consumersByKey, "luminousMask", "luminous");
    }

    const requirementKeys = Array.from(consumersByKey.keys());
    const requirements = requirementKeys.map((key) => ({
        key,
        consumers: Array.from(consumersByKey.get(key) ?? []),
        producer: getProducer(key),
        resolution: "full" as const,
    }));

    return {
        effectOrder: normalizedOrder,
        activeEffects,
        requirements,
        requirementKeys,
        needsGeometryRenderer: consumersByKey.has("viewDepth")
            || consumersByKey.has("viewNormal")
            || consumersByKey.has("reflectivity"),
        needsDepthRenderer: consumersByKey.has("depthScene"),
        needsLuminousMask: consumersByKey.has("luminousMask"),
        fixedTasks: {
            imageProcessing: settings.imageProcessingEnabled,
            fxaa: settings.antialiasEnabled,
        },
    };
}
