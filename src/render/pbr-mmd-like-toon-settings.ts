import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import "@babylonjs/core/Rendering/subSurfaceSceneComponent";
import {
    normalizePbrMaterialShaderPreset,
    type PbrMaterialPreset,
    type PbrMaterialShaderPreset,
} from "../shared/mmd-material-pipeline";
import { applyMmdLikePbrShaderSettings } from "./pbr-mmd-like-material-plugin";

export const MMD_LIKE_METERS_PER_UNIT = 0.08;
export const MMD_LIKE_SCATTERING_PROFILE = new Color3(0.5, 0.5, 0.5);
export const MMD_LIKE_MIN_ROUGHNESS = 0.82;
export const MMD_LIKE_SPECULAR_INTENSITY = 0.3;
export const PBR_SKIN_METERS_PER_UNIT = 0.08;
export const PBR_SKIN_SCATTERING_PROFILE = new Color3(1, 0.16, 0.08);
export const PBR_SKIN_MIN_ROUGHNESS = 0.72;
export const PBR_SKIN_SPECULAR_INTENSITY = 0.38;
export const MMD_LIKE_OPAQUE_ALPHA_THRESHOLD = 0.95;
export const MMD_LIKE_ALPHA_CUTOFF = 0.02;

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
    isTranslucencyEnabled: boolean;
    isScatteringEnabled: boolean;
    translucencyIntensity: number;
    useAlbedoToTintTranslucency: boolean;
    tintColor: Color3;
    translucencyColor: Color3 | null;
    translucencyColorTexture: BaseTexture | null;
    scatteringDiffusionProfile: Color3 | null;
};

type PbrPresetMaterialTarget = object & {
    subSurface: MmdLikeSubSurfaceTarget;
    ambientColor?: Color3;
    alpha?: number;
    transparencyMode?: number | null;
    useAlphaFromAlbedoTexture?: boolean;
    forceDepthWrite?: boolean;
    alphaCutOff?: number;
    albedoTexture?: BaseTexture | null;
    roughness?: number | null;
    specularIntensity?: number;
    markAsDirty?: (flag: number) => void;
};

type SubSurfaceSnapshot = {
    isTranslucencyEnabled: boolean;
    isScatteringEnabled: boolean;
    translucencyIntensity: number;
    useAlbedoToTintTranslucency: boolean;
    tintColor: Color3;
    translucencyColor: Color3 | null;
    translucencyColorTexture: BaseTexture | null;
    scatteringDiffusionProfile: Color3 | null;
};

type PbrPresetRuntimeState = {
    baseline: SubSurfaceSnapshot;
    baselineTransparency: PbrTransparencySnapshot | null;
    baselineRoughness: number | null | undefined;
    baselineSpecularIntensity: number | undefined;
    fallbackColor: Color3;
    toonTexture: (MmdLikeToonTextureTarget & BaseTexture) | null;
    materialShaderPreset: PbrMaterialShaderPreset;
    scatteringMetersPerUnit: number | null;
};

type PbrTransparencySnapshot = {
    alpha: number | undefined;
    transparencyMode: number | null | undefined;
    useAlphaFromAlbedoTexture: boolean | undefined;
    forceDepthWrite: boolean | undefined;
    alphaCutOff: number | undefined;
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
        isTranslucencyEnabled: subSurface.isTranslucencyEnabled,
        isScatteringEnabled: subSurface.isScatteringEnabled,
        translucencyIntensity: subSurface.translucencyIntensity,
        useAlbedoToTintTranslucency: subSurface.useAlbedoToTintTranslucency,
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
    subSurface.isTranslucencyEnabled = snapshot.isTranslucencyEnabled;
    subSurface.isScatteringEnabled = snapshot.isScatteringEnabled;
    subSurface.translucencyIntensity = snapshot.translucencyIntensity;
    subSurface.useAlbedoToTintTranslucency = snapshot.useAlbedoToTintTranslucency;
    subSurface.tintColor = snapshot.tintColor.clone();
    subSurface.translucencyColor = snapshot.translucencyColor?.clone() ?? null;
    subSurface.translucencyColorTexture = snapshot.translucencyColorTexture;
    subSurface.scatteringDiffusionProfile =
        snapshot.scatteringDiffusionProfile?.clone() ?? null;
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
        fallbackColor: resolvedFallbackColor,
        toonTexture: null,
        materialShaderPreset: "pbr-base",
        scatteringMetersPerUnit: null,
    };
    Object.defineProperty(target, PBR_PRESET_RUNTIME_STATE, {
        value: state,
        configurable: true,
    });
    return state;
}

export function applyMmdLikeToonSubSurfaceSettings(
    subSurface: MmdLikeSubSurfaceTarget,
    toonTexture: MmdLikeToonTextureTarget & BaseTexture,
): void {
    toonTexture.wrapU = Texture.CLAMP_ADDRESSMODE;
    toonTexture.wrapV = Texture.CLAMP_ADDRESSMODE;

    applyMmdLikeScatteringSettings(subSurface);
}

export function applyMmdLikeFallbackSubSurfaceSettings(
    subSurface: MmdLikeSubSurfaceTarget,
    fallbackColor: readonly [number, number, number] | Color3,
): void {
    // The shader uses this per-material fallback when no toon texture exists.
    void fallbackColor;
    applyMmdLikeScatteringSettings(subSurface);
}

function applyMmdLikeScatteringSettings(
    subSurface: MmdLikeSubSurfaceTarget,
): void {
    subSurface.isTranslucencyEnabled = false;
    subSurface.isScatteringEnabled = true;
    subSurface.translucencyIntensity = 0;
    subSurface.useAlbedoToTintTranslucency = false;
    subSurface.tintColor = Color3.White();
    subSurface.translucencyColor = null;
    subSurface.translucencyColorTexture = null;
    subSurface.scatteringDiffusionProfile = MMD_LIKE_SCATTERING_PROFILE;
}

function applyPbrSkinScatteringSettings(
    subSurface: MmdLikeSubSurfaceTarget,
    scatteringEnabled = true,
): void {
    subSurface.isTranslucencyEnabled = false;
    subSurface.isScatteringEnabled = scatteringEnabled;
    subSurface.translucencyIntensity = 0;
    subSurface.useAlbedoToTintTranslucency = false;
    subSurface.tintColor = Color3.White();
    subSurface.translucencyColor = null;
    subSurface.translucencyColorTexture = null;
    subSurface.scatteringDiffusionProfile = PBR_SKIN_SCATTERING_PROFILE;
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

function restorePbrTransparencySettings(
    material: PbrPresetMaterialTarget,
    snapshot: PbrTransparencySnapshot,
): void {
    material.alpha = snapshot.alpha;
    material.transparencyMode = snapshot.transparencyMode;
    material.useAlphaFromAlbedoTexture = snapshot.useAlphaFromAlbedoTexture;
    material.forceDepthWrite = snapshot.forceDepthWrite;
    material.alphaCutOff = snapshot.alphaCutOff;
}

function applyMmdLikeOpaqueSurfaceSettings(
    material: PbrPresetMaterialTarget,
    state: PbrPresetRuntimeState,
): boolean {
    const baseline = state.baselineTransparency;
    const alpha = baseline?.alpha ?? material.alpha ?? 1;
    if (alpha < MMD_LIKE_OPAQUE_ALPHA_THRESHOLD) {
        if (baseline) {
            restorePbrTransparencySettings(material, baseline);
        }
        return false;
    }

    if (!baseline) {
        return true;
    }

    material.alpha = 1;
    const usesTextureCutout = material.albedoTexture?.hasAlpha === true
        && (
            baseline.useAlphaFromAlbedoTexture === true
            || baseline.transparencyMode === Material.MATERIAL_ALPHATEST
            || baseline.transparencyMode === Material.MATERIAL_ALPHABLEND
            || baseline.transparencyMode === Material.MATERIAL_ALPHATESTANDBLEND
        );
    material.transparencyMode = usesTextureCutout
        ? Material.MATERIAL_ALPHATEST
        : Material.MATERIAL_OPAQUE;
    material.useAlphaFromAlbedoTexture = usesTextureCutout;
    material.forceDepthWrite = false;
    if (usesTextureCutout) {
        material.alphaCutOff = MMD_LIKE_ALPHA_CUTOFF;
    }
    return true;
}

function applyMmdLikeMatteSurfaceSettings(
    material: PbrPresetMaterialTarget,
    state: PbrPresetRuntimeState,
): void {
    if (state.baselineRoughness !== undefined) {
        material.roughness = Math.max(
            state.baselineRoughness ?? 0,
            MMD_LIKE_MIN_ROUGHNESS,
        );
    }
    if (state.baselineSpecularIntensity !== undefined) {
        material.specularIntensity = Math.min(
            state.baselineSpecularIntensity,
            MMD_LIKE_SPECULAR_INTENSITY,
        );
    }
}

function applyPbrSkinSurfaceSettings(
    material: PbrPresetMaterialTarget,
    state: PbrPresetRuntimeState,
): void {
    if (state.baselineRoughness !== undefined) {
        material.roughness = Math.max(
            state.baselineRoughness ?? 0,
            PBR_SKIN_MIN_ROUGHNESS,
        );
    }
    if (state.baselineSpecularIntensity !== undefined) {
        material.specularIntensity = Math.min(
            state.baselineSpecularIntensity,
            PBR_SKIN_SPECULAR_INTENSITY,
        );
    }
}

function restorePbrSurfaceSettings(
    material: PbrPresetMaterialTarget,
    state: PbrPresetRuntimeState,
): void {
    if (state.baselineRoughness !== undefined) {
        material.roughness = state.baselineRoughness;
    }
    if (state.baselineSpecularIntensity !== undefined) {
        material.specularIntensity = state.baselineSpecularIntensity;
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
    getOrCreatePbrPresetRuntimeState(material).toonTexture = toonTexture;
}

export function registerPbrPresetTransparencyBaseline(
    material: PbrPresetMaterialTarget,
): void {
    getOrCreatePbrPresetRuntimeState(material).baselineTransparency =
        capturePbrTransparencySnapshot(material);
}

function syncSceneSubSurfaceConfiguration(
    material: PBRMaterial,
): void {
    const scene = material.getScene();
    const activeMetersPerUnit = scene.materials.flatMap((candidate) => {
        if (!(candidate instanceof PBRMaterial)) return [];
        if (!candidate.subSurface.isScatteringEnabled) return [];
        const candidateState = (
            candidate as PbrPresetMaterialWithRuntimeState
        )[PBR_PRESET_RUNTIME_STATE];
        const value = candidateState?.scatteringMetersPerUnit;
        return [typeof value === "number" ? value : PBR_SKIN_METERS_PER_UNIT];
    });
    if (activeMetersPerUnit.length > 0) {
        const configuration = scene.enableSubSurfaceForPrePass();
        if (configuration) {
            configuration.metersPerUnit = Math.min(...activeMetersPerUnit);
            configuration.enabled = true;
        }
        return;
    }

    const hasScatteringMaterial = scene.materials.some((candidate) => (
        candidate instanceof PBRMaterial
        && candidate.subSurface.isScatteringEnabled
    ));
    if (!hasScatteringMaterial && scene.subSurfaceConfiguration) {
        scene.subSurfaceConfiguration.enabled = false;
    }
}

export function applyPbrMaterialPresetToMaterial(
    material: unknown,
    preset: PbrMaterialPreset | "pbr-skin",
): boolean {
    if (!isPbrPresetMaterialTarget(material)) return false;

    const state = getOrCreatePbrPresetRuntimeState(material);
    if (preset === "pbr-mmd-like") {
        const scatteringEnabled = applyMmdLikeOpaqueSurfaceSettings(
            material,
            state,
        );
        if (state.toonTexture) {
            applyMmdLikeToonSubSurfaceSettings(material.subSurface, state.toonTexture);
        } else {
            applyMmdLikeFallbackSubSurfaceSettings(material.subSurface, state.fallbackColor);
        }
        material.subSurface.isScatteringEnabled = scatteringEnabled;
        state.scatteringMetersPerUnit = scatteringEnabled ? MMD_LIKE_METERS_PER_UNIT : null;
        applyMmdLikeMatteSurfaceSettings(material, state);
        if (material instanceof PBRMaterial) {
            applyMmdLikePbrShaderSettings(material, {
                mode: "mmd-like",
                toonTexture: state.toonTexture,
                fallbackColor: state.fallbackColor,
            });
            syncSceneSubSurfaceConfiguration(material);
        }
    } else if (preset === "pbr-skin") {
        const scatteringEnabled = applyMmdLikeOpaqueSurfaceSettings(
            material,
            state,
        );
        applyPbrSkinScatteringSettings(material.subSurface, scatteringEnabled);
        state.scatteringMetersPerUnit = scatteringEnabled ? PBR_SKIN_METERS_PER_UNIT : null;
        applyPbrSkinSurfaceSettings(material, state);
        if (material instanceof PBRMaterial) {
            applyMmdLikePbrShaderSettings(material, {
                mode: scatteringEnabled ? "skin" : "off",
                toonTexture: state.toonTexture,
                fallbackColor: state.fallbackColor,
            });
            syncSceneSubSurfaceConfiguration(material);
        }
    } else {
        restoreSubSurfaceSnapshot(material.subSurface, state.baseline);
        if (state.baselineTransparency) {
            restorePbrTransparencySettings(material, state.baselineTransparency);
        }
        restorePbrSurfaceSettings(material, state);
        state.scatteringMetersPerUnit = null;
        if (material instanceof PBRMaterial) {
            applyMmdLikePbrShaderSettings(material, {
                mode: "off",
                toonTexture: state.toonTexture,
                fallbackColor: state.fallbackColor,
            });
            syncSceneSubSurfaceConfiguration(material);
        }
    }
    material.markAsDirty?.(Material.AllDirtyFlag);
    return true;
}

export function getPbrMaterialShaderPreset(
    material: unknown,
): PbrMaterialShaderPreset {
    if (!isPbrPresetMaterialTarget(material)) return "pbr-base";
    return getOrCreatePbrPresetRuntimeState(material).materialShaderPreset;
}

export function applyPbrMaterialShaderPreset(
    material: unknown,
    basePreset: PbrMaterialPreset,
    materialPreset: unknown,
): boolean {
    if (!isPbrPresetMaterialTarget(material)) return false;
    const state = getOrCreatePbrPresetRuntimeState(material);
    state.materialShaderPreset = normalizePbrMaterialShaderPreset(materialPreset);
    return applyPbrMaterialPresetToMaterial(
        material,
        state.materialShaderPreset === "pbr-skin" ? "pbr-skin" : basePreset,
    );
}
