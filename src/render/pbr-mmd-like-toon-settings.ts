import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Material } from "@babylonjs/core/Materials/material";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import "@babylonjs/core/Rendering/prePassRendererSceneComponent";
import "@babylonjs/core/Rendering/subSurfaceSceneComponent";
import {
    normalizePbrMaterialShaderPreset,
    type PbrMaterialShaderPreset,
} from "../shared/mmd-material-pipeline";

export const PBR_MMD_LIKE_ENVIRONMENT_INTENSITY = 0.8;
export const PBR_MMD_LIKE_TRANSLUCENCY_INTENSITY = 0.02;
export const PBR_SKIN_ENVIRONMENT_INTENSITY = 0.8;
export const PBR_SKIN_TRANSLUCENCY_INTENSITY = 0.02;
export const PBR_SKIN_TRANSLUCENCY_COLOR_RGB = [1, 0.68, 0.58] as const;
export const PBR_SKIN_MINIMUM_THICKNESS = 0;
export const PBR_SKIN_MAXIMUM_THICKNESS = 0.3;

export type MmdLikeToonTextureTarget = {
    uOffset: number;
    vOffset: number;
    uScale: number;
    vScale: number;
    wrapU: number;
    wrapV: number;
    getSize: () => { width: number; height: number };
};

export type MmdLikeSubSurfaceTarget = {
    isRefractionEnabled: boolean;
    isTranslucencyEnabled: boolean;
    isScatteringEnabled: boolean;
    refractionIntensity: number;
    translucencyIntensity: number;
    linkRefractionWithTransparency: boolean;
    legacyTranslucency: boolean;
    useAlbedoToTintTranslucency: boolean;
    minimumThickness: number;
    maximumThickness: number;
    tintColor: Color3;
    translucencyColor: Color3 | null;
    translucencyColorTexture: BaseTexture | null;
    scatteringDiffusionProfile: Color3 | null;
};

type PbrPresetMaterialTarget = object & {
    subSurface: MmdLikeSubSurfaceTarget;
    ambientColor?: Color3;
    reflectionColor?: Color3;
    alpha?: number;
    transparencyMode?: number | null;
    useAlphaFromAlbedoTexture?: boolean;
    forceDepthWrite?: boolean;
    alphaCutOff?: number;
    roughness?: number | null;
    specularIntensity?: number;
    environmentIntensity?: number;
    getScene?: () => PbrPresetSceneTarget;
    markAsDirty?: (flag: number) => void;
};

type PbrPresetSubSurfaceConfigurationTarget = {
    enabled: boolean;
    metersPerUnit: number;
};

type PbrPresetSceneTarget = {
    materials?: readonly unknown[];
    subSurfaceConfiguration?: PbrPresetSubSurfaceConfigurationTarget | null;
    enableSubSurfaceForPrePass?: () => PbrPresetSubSurfaceConfigurationTarget | null;
};

type SubSurfaceSnapshot = {
    isRefractionEnabled: boolean;
    isTranslucencyEnabled: boolean;
    isScatteringEnabled: boolean;
    refractionIntensity: number;
    translucencyIntensity: number;
    linkRefractionWithTransparency: boolean;
    legacyTranslucency: boolean;
    useAlbedoToTintTranslucency: boolean;
    minimumThickness: number;
    maximumThickness: number;
    tintColor: Color3;
    translucencyColor: Color3 | null;
    translucencyColorTexture: BaseTexture | null;
    scatteringDiffusionProfile: Color3 | null;
};

type PbrTransparencySnapshot = {
    alpha: number | undefined;
    transparencyMode: number | null | undefined;
    useAlphaFromAlbedoTexture: boolean | undefined;
    forceDepthWrite: boolean | undefined;
    alphaCutOff: number | undefined;
};

type PbrPresetRuntimeState = {
    baseline: SubSurfaceSnapshot;
    baselineTransparency: PbrTransparencySnapshot | null;
    baselineRoughness: number | null | undefined;
    baselineSpecularIntensity: number | undefined;
    baselineEnvironmentIntensity: number | undefined;
    baselineReflectionColor: Color3 | undefined;
    fallbackColor: Color3;
    toonTexture: (MmdLikeToonTextureTarget & BaseTexture) | null;
    toonTranslucencyTexture: (MmdLikeToonTextureTarget & BaseTexture) | null;
    materialShaderPreset: PbrMaterialShaderPreset;
};

const PBR_PRESET_RUNTIME_STATE = Symbol.for("mmdModoki.pbrPresetRuntimeState");

type PbrPresetMaterialWithRuntimeState = PbrPresetMaterialTarget & {
    [PBR_PRESET_RUNTIME_STATE]?: PbrPresetRuntimeState;
};

function isPbrPresetMaterialTarget(value: unknown): value is PbrPresetMaterialTarget {
    if (!value || typeof value !== "object") return false;
    const subSurface = (value as { subSurface?: unknown }).subSurface;
    return Boolean(subSurface && typeof subSurface === "object");
}

function captureSubSurfaceSnapshot(subSurface: MmdLikeSubSurfaceTarget): SubSurfaceSnapshot {
    return {
        isRefractionEnabled: subSurface.isRefractionEnabled,
        isTranslucencyEnabled: subSurface.isTranslucencyEnabled,
        isScatteringEnabled: subSurface.isScatteringEnabled,
        refractionIntensity: subSurface.refractionIntensity,
        translucencyIntensity: subSurface.translucencyIntensity,
        linkRefractionWithTransparency: subSurface.linkRefractionWithTransparency,
        legacyTranslucency: subSurface.legacyTranslucency,
        useAlbedoToTintTranslucency: subSurface.useAlbedoToTintTranslucency,
        minimumThickness: subSurface.minimumThickness,
        maximumThickness: subSurface.maximumThickness,
        tintColor: subSurface.tintColor.clone(),
        translucencyColor: subSurface.translucencyColor?.clone() ?? null,
        translucencyColorTexture: subSurface.translucencyColorTexture,
        scatteringDiffusionProfile: subSurface.scatteringDiffusionProfile?.clone() ?? null,
    };
}

function restoreSubSurfaceSnapshot(
    subSurface: MmdLikeSubSurfaceTarget,
    snapshot: SubSurfaceSnapshot,
): void {
    subSurface.isRefractionEnabled = snapshot.isRefractionEnabled;
    subSurface.isTranslucencyEnabled = snapshot.isTranslucencyEnabled;
    subSurface.isScatteringEnabled = snapshot.isScatteringEnabled;
    subSurface.refractionIntensity = snapshot.refractionIntensity;
    subSurface.translucencyIntensity = snapshot.translucencyIntensity;
    subSurface.linkRefractionWithTransparency = snapshot.linkRefractionWithTransparency;
    subSurface.legacyTranslucency = snapshot.legacyTranslucency;
    subSurface.useAlbedoToTintTranslucency = snapshot.useAlbedoToTintTranslucency;
    subSurface.minimumThickness = snapshot.minimumThickness;
    subSurface.maximumThickness = snapshot.maximumThickness;
    subSurface.tintColor = snapshot.tintColor.clone();
    subSurface.translucencyColor = snapshot.translucencyColor?.clone() ?? null;
    subSurface.translucencyColorTexture = snapshot.translucencyColorTexture;
    // Babylon's setter enables the SubSurface pre-pass even when assigned null.
    // There is no profile to restore when the baseline is null, and the profile
    // is ignored while scattering is disabled, so avoid creating that pass.
    if (snapshot.scatteringDiffusionProfile) {
        subSurface.scatteringDiffusionProfile = snapshot.scatteringDiffusionProfile.clone();
    }
}

function getOrCreatePbrPresetRuntimeState(
    material: PbrPresetMaterialTarget,
    fallbackColor?: readonly [number, number, number] | Color3,
): PbrPresetRuntimeState {
    const target = material as PbrPresetMaterialWithRuntimeState;
    const existing = target[PBR_PRESET_RUNTIME_STATE];
    if (existing) {
        if (fallbackColor) {
            existing.fallbackColor = fallbackColor instanceof Color3
                ? fallbackColor.clone()
                : new Color3(fallbackColor[0], fallbackColor[1], fallbackColor[2]);
        }
        return existing;
    }

    const resolvedFallbackColor = fallbackColor instanceof Color3
        ? fallbackColor.clone()
        : fallbackColor
            ? new Color3(fallbackColor[0], fallbackColor[1], fallbackColor[2])
            : material.ambientColor?.clone() ?? Color3.Black();
    const state: PbrPresetRuntimeState = {
        baseline: captureSubSurfaceSnapshot(material.subSurface),
        baselineTransparency: null,
        baselineRoughness: material.roughness,
        baselineSpecularIntensity: material.specularIntensity,
        baselineEnvironmentIntensity: material.environmentIntensity,
        baselineReflectionColor: material.reflectionColor?.clone(),
        fallbackColor: resolvedFallbackColor,
        toonTexture: null,
        toonTranslucencyTexture: null,
        materialShaderPreset: "pbr-base",
    };
    Object.defineProperty(target, PBR_PRESET_RUNTIME_STATE, {
        value: state,
        configurable: true,
    });
    return state;
}

function capturePbrTransparencySnapshot(
    material: PbrPresetMaterialTarget,
): PbrTransparencySnapshot {
    return {
        alpha: material.alpha,
        transparencyMode: material.transparencyMode,
        useAlphaFromAlbedoTexture: material.useAlphaFromAlbedoTexture,
        forceDepthWrite: material.forceDepthWrite,
        alphaCutOff: material.alphaCutOff,
    };
}

function restorePbrStandardSettings(
    material: PbrPresetMaterialTarget,
    state: PbrPresetRuntimeState,
): void {
    restoreSubSurfaceSnapshot(material.subSurface, state.baseline);
    if (state.baselineTransparency) {
        material.alpha = state.baselineTransparency.alpha;
        material.transparencyMode = state.baselineTransparency.transparencyMode;
        material.useAlphaFromAlbedoTexture = state.baselineTransparency.useAlphaFromAlbedoTexture;
        material.forceDepthWrite = state.baselineTransparency.forceDepthWrite;
        material.alphaCutOff = state.baselineTransparency.alphaCutOff;
    }
    material.roughness = state.baselineRoughness;
    material.specularIntensity = state.baselineSpecularIntensity;
    material.environmentIntensity = state.baselineEnvironmentIntensity;

    // babylon-mmd maps MMD specular color to reflectionColor, while Babylon
    // also multiplies diffuse IBL by this value. Keep the verified Standard
    // behavior that uses a neutral environment-map tint.
    if (state.baselineReflectionColor !== undefined) {
        material.reflectionColor = Color3.White();
    }
}

function createPbrSkinTranslucencyColor(): Color3 {
    return new Color3(...PBR_SKIN_TRANSLUCENCY_COLOR_RGB);
}

function createMmdLikeToonTranslucencyTexture(
    state: PbrPresetRuntimeState,
): (MmdLikeToonTextureTarget & BaseTexture) | null {
    if (state.toonTranslucencyTexture) {
        return state.toonTranslucencyTexture;
    }
    const source = state.toonTexture;
    if (!source) return null;

    const clone = source.clone();
    if (
        !clone
        || !("uOffset" in clone)
        || !("vOffset" in clone)
        || !("uScale" in clone)
        || !("vScale" in clone)
        || !("wrapU" in clone)
        || !("wrapV" in clone)
    ) {
        clone?.dispose();
        return null;
    }

    const sampleTexture = clone as MmdLikeToonTextureTarget & BaseTexture;
    const size = source.getSize();
    // MMD's deepest toon/shadow color is the left-bottom texel. Freeze the
    // cloned texture matrix at its texel center so Babylon's standard
    // translucency path receives one constant PMX shadow color for all UVs.
    sampleTexture.uScale = 0;
    sampleTexture.vScale = 0;
    sampleTexture.uOffset = 0.5 / Math.max(1, size.width);
    sampleTexture.vOffset = 0.5 / Math.max(1, size.height);
    state.toonTranslucencyTexture = sampleTexture;
    return sampleTexture;
}

function hasScreenSpaceScattering(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    const subSurface = (value as { subSurface?: { isScatteringEnabled?: boolean } }).subSurface;
    return subSurface?.isScatteringEnabled === true;
}

function syncPbrSkinSceneConfiguration(material: PbrPresetMaterialTarget): void {
    const scene = material.getScene?.();
    const configuration = scene?.subSurfaceConfiguration;
    if (!configuration || !scene.materials) return;
    configuration.enabled = scene.materials.some(hasScreenSpaceScattering);
}

function applyPbrSkinSubSurfaceSettings(material: PbrPresetMaterialTarget): boolean {
    // Use Babylon.js' opaque diffuse-transmission path without the screen-space
    // scattering pass. Even a narrow diffusion profile currently breaks the
    // application's final composition and darkens the selected skin material.
    // Refraction and alpha remain disabled/untouched, so the surface stays opaque.
    material.subSurface.isRefractionEnabled = false;
    material.subSurface.refractionIntensity = 0;
    material.subSurface.linkRefractionWithTransparency = false;
    material.subSurface.isTranslucencyEnabled = true;
    material.subSurface.translucencyIntensity = PBR_SKIN_TRANSLUCENCY_INTENSITY;
    material.subSurface.translucencyColor = createPbrSkinTranslucencyColor();
    material.subSurface.translucencyColorTexture = null;
    material.subSurface.useAlbedoToTintTranslucency = true;
    material.subSurface.minimumThickness = PBR_SKIN_MINIMUM_THICKNESS;
    material.subSurface.maximumThickness = PBR_SKIN_MAXIMUM_THICKNESS;
    material.subSurface.legacyTranslucency = false;
    material.subSurface.isScatteringEnabled = false;
    if (material.environmentIntensity !== undefined) {
        material.environmentIntensity = PBR_SKIN_ENVIRONMENT_INTENSITY;
    }
    return true;
}

function applyPbrMmdLikeSubSurfaceSettings(
    material: PbrPresetMaterialTarget,
    state: PbrPresetRuntimeState,
): void {
    const toonColorTexture = createMmdLikeToonTranslucencyTexture(state);

    material.subSurface.isRefractionEnabled = false;
    material.subSurface.refractionIntensity = 0;
    material.subSurface.linkRefractionWithTransparency = false;
    material.subSurface.isTranslucencyEnabled = true;
    material.subSurface.translucencyIntensity = PBR_MMD_LIKE_TRANSLUCENCY_INTENSITY;
    material.subSurface.translucencyColor = toonColorTexture
        ? Color3.White()
        : state.fallbackColor.clone();
    material.subSurface.translucencyColorTexture = toonColorTexture;
    material.subSurface.useAlbedoToTintTranslucency = true;
    material.subSurface.minimumThickness = PBR_SKIN_MINIMUM_THICKNESS;
    material.subSurface.maximumThickness = PBR_SKIN_MAXIMUM_THICKNESS;
    material.subSurface.legacyTranslucency = false;
    material.subSurface.isScatteringEnabled = false;
    if (material.environmentIntensity !== undefined) {
        material.environmentIntensity = PBR_MMD_LIKE_ENVIRONMENT_INTENSITY;
    }
}

export function registerPbrPresetMaterial(
    material: PbrPresetMaterialTarget,
    fallbackColor: readonly [number, number, number] | Color3,
): void {
    getOrCreatePbrPresetRuntimeState(material, fallbackColor);
}

export function registerPbrPresetToonTexture(
    material: PbrPresetMaterialTarget,
    toonTexture: MmdLikeToonTextureTarget & BaseTexture,
): void {
    const state = getOrCreatePbrPresetRuntimeState(material);
    if (state.toonTexture === toonTexture) return;
    state.toonTranslucencyTexture?.dispose();
    state.toonTranslucencyTexture = null;
    state.toonTexture = toonTexture;
}

export function registerPbrPresetTransparencyBaseline(
    material: PbrPresetMaterialTarget,
): void {
    getOrCreatePbrPresetRuntimeState(material).baselineTransparency =
        capturePbrTransparencySnapshot(material);
}

export function getPbrMaterialShaderPreset(
    material: unknown,
): PbrMaterialShaderPreset {
    if (!isPbrPresetMaterialTarget(material)) return "pbr-base";
    return getOrCreatePbrPresetRuntimeState(material).materialShaderPreset;
}

export function applyPbrMaterialShaderPreset(
    material: unknown,
    materialPreset: unknown,
): boolean {
    if (!isPbrPresetMaterialTarget(material)) return false;
    const state = getOrCreatePbrPresetRuntimeState(material);
    const nextPreset = normalizePbrMaterialShaderPreset(materialPreset);
    restorePbrStandardSettings(material, state);

    if (nextPreset === "pbr-mmd-like") {
        applyPbrMmdLikeSubSurfaceSettings(material, state);
    }

    if (nextPreset === "pbr-skin" && !applyPbrSkinSubSurfaceSettings(material)) {
        state.materialShaderPreset = "pbr-base";
        syncPbrSkinSceneConfiguration(material);
        material.markAsDirty?.(Material.AllDirtyFlag);
        return false;
    }

    state.materialShaderPreset = nextPreset;
    syncPbrSkinSceneConfiguration(material);

    material.markAsDirty?.(Material.AllDirtyFlag);
    return true;
}
