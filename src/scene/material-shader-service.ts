// eslint-disable-next-line import/no-unresolved
import debugWhiteWgslText from "../../wgsl/toon_debug_white_shadow.wgsl?raw";
// eslint-disable-next-line import/no-unresolved
import fullLightWgslText from "../../wgsl/full_light.wgsl?raw";
// eslint-disable-next-line import/no-unresolved
import fullLightAddWgslText from "../../wgsl/full_light_add.wgsl?raw";
// eslint-disable-next-line import/no-unresolved
import glossHighlightWgslText from "../../wgsl/gloss_highlight.wgsl?raw";
// eslint-disable-next-line import/no-unresolved
import fullShadowWgslText from "../../wgsl/full_shadow.wgsl?raw";
// eslint-disable-next-line import/no-unresolved
import matteHighlightWgslText from "../../wgsl/matte_highlight.wgsl?raw";
// eslint-disable-next-line import/no-unresolved
import semiMatteHighlightWgslText from "../../wgsl/semi_matte_highlight.wgsl?raw";
// eslint-disable-next-line import/no-unresolved
import toonHardShadowWgslText from "../../wgsl/toon_hard_shadow.wgsl?raw";
// eslint-disable-next-line import/no-unresolved
import fallbackAccessoryToonTextureUrl from "../assets/textures/toon/fallback_accessory_toon.bmp?url";
// eslint-disable-next-line import/no-unresolved
import fallbackShadowToonTextureUrl from "../assets/textures/toon/fallback_shadow_toon.bmp?url";
import { Material } from "@babylonjs/core/Materials/material";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { ProjectModelMaterialShaderState } from "../types";

export type WgslMaterialShaderPresetId =
    | "wgsl-mmd-standard"
    | "wgsl-unlit"
    | "wgsl-soft-lit"
    | "wgsl-autoluminous"
    | "wgsl-debug-white"
    | "wgsl-full-light"
    | "wgsl-full-light-add"
    | "wgsl-full-alpha-test"
    | "wgsl-full-alpha-test-hard"
    | "wgsl-alpha-mask"
    | "wgsl-white-key-cutout"
    | "wgsl-black-key-cutout"
    | "wgsl-full-shadow"
    | "wgsl-light-and-shadow"
    | "wgsl-gloss-highlight"
    | "wgsl-semi-matte-highlight"
    | "wgsl-matte-highlight"
    | "wgsl-specular"
    | "wgsl-cel-sharp"
    | "wgsl-cel-shadow-sharp"
    | "wgsl-accessory-toon"
    | "wgsl-rim-lift"
    | "wgsl-mono-flat";

type MaterialShaderDefaults = {
    disableLighting: boolean | null;
    specularPower: number | null;
    emissiveColor: Color3 | null;
    ambientColor: Color3 | null;
    transparencyMode: number | null;
    alphaCutOff: number | null;
    forceDepthWrite: boolean | null;
    useAlphaFromDiffuseTexture: boolean | null;
    useAlphaFromAlbedoTexture: boolean | null;
    toonTexture: any;
    ignoreDiffuseWhenToonTextureIsNull: boolean | null;
};

const DEFAULT_WGSL_MATERIAL_SHADER_PRESET = "wgsl-mmd-standard";
const AUTO_LUMINOUS_BLOOM_WEIGHT = 0.42;
const AUTO_LUMINOUS_BLOOM_THRESHOLD = 1.05;
const AUTO_LUMINOUS_BLOOM_KERNEL = 64;
const AUTO_LUMINOUS_BASE_LEVEL = 1.28;
const AUTO_LUMINOUS_BRIGHTNESS_BIAS = 0.14;
const AUTO_LUMINOUS_TINT_STRENGTH = 0.72;
const presetFallbackAccessoryToonTextureByScene = new WeakMap<object, Texture>();
const presetFallbackShadowToonTextureByScene = new WeakMap<object, Texture>();

function getPresetCatalog(host: any): readonly { id: WgslMaterialShaderPresetId; label: string }[] {
    return host.constructor.WGSL_MATERIAL_SHADER_PRESETS ?? [];
}

function getDefaultPreset(host: any): WgslMaterialShaderPresetId {
    return host.constructor.DEFAULT_WGSL_MATERIAL_SHADER_PRESET ?? DEFAULT_WGSL_MATERIAL_SHADER_PRESET;
}

function getMaterialKey(material: any): object | null {
    return material && typeof material === "object" ? (material as object) : null;
}

function cloneColor3OrNull(value: any): Color3 | null {
    if (!value || typeof value !== "object") return null;
    const r = Number(value.r);
    const g = Number(value.g);
    const b = Number(value.b);
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
    return new Color3(r, g, b);
}

function setMaterialColorProperty(material: any, propertyName: string, color: Color3): void {
    if (!material || typeof material !== "object") return;

    const current = material[propertyName];
    if (current && typeof current.set === "function") {
        current.set(color.r, color.g, color.b);
        return;
    }

    material[propertyName] = new Color3(color.r, color.g, color.b);
}

function applyAlphaCutoutPreset(material: any, alphaCutOff: number): void {
    const hasAlphaTexture = hasActualAlphaTextureSource(material);
    if (!hasAlphaTexture) {
        return;
    }
    if ("alphaCutOff" in material) {
        material.alphaCutOff = alphaCutOff;
    }
    if ("forceDepthWrite" in material) {
        material.forceDepthWrite = false;
    }
    if ("transparencyMode" in material) {
        material.transparencyMode = Material.MATERIAL_ALPHATEST;
    }
}

function applyAlphaBlendCutoutPreset(material: any): void {
    const hasAlphaTexture = hasActualAlphaTextureSource(material);
    if (!hasAlphaTexture) {
        const materialName = typeof material?.name === "string" ? material.name : "material";
        console.warn(`[MaterialShader] Alpha Mask skipped for ${materialName}: source texture has no alpha channel.`);
        return;
    }
    if ("disableLighting" in material) {
        material.disableLighting = false;
    }
    if ("specularPower" in material) {
        material.specularPower = 0;
    }
    enableAlphaTextureFlags(material);
    if ("forceDepthWrite" in material) {
        material.forceDepthWrite = false;
    }
    if ("transparencyMode" in material) {
        material.transparencyMode = Material.MATERIAL_ALPHABLEND;
    }
}

function enableAlphaTextureFlags(material: any): void {
    const diffuseTextureHasAlpha = Boolean(material.diffuseTexture?.hasAlpha);
    if ("useAlphaFromDiffuseTexture" in material && diffuseTextureHasAlpha) {
        material.useAlphaFromDiffuseTexture = true;
    }

    const albedoTextureHasAlpha = Boolean(material.albedoTexture?.hasAlpha);
    if ("useAlphaFromAlbedoTexture" in material && albedoTextureHasAlpha) {
        material.useAlphaFromAlbedoTexture = true;
    }
}

function hasActualAlphaTextureSource(material: any): boolean {
    return Boolean(material?.diffuseTexture?.hasAlpha)
        || Boolean(material?.albedoTexture?.hasAlpha)
        || Boolean(material?.opacityTexture);
}

function markMaterialShaderDirty(material: any): void {
    if (!material || typeof material !== "object") return;

    if (typeof material.markAsDirty === "function") {
        try {
            material.markAsDirty(Material.AllDirtyFlag);
            return;
        } catch {
            try {
                material.markAsDirty();
                return;
            } catch {
                // ignore
            }
        }
    }

    if (typeof material._markAllSubMeshesAsTexturesDirty === "function") {
        material._markAllSubMeshesAsTexturesDirty();
    }
}

function setPresetWgslToonFragmentForMaterial(host: any, material: any, source: string | null): void {
    const key = getMaterialKey(material);
    if (!key) return;

    if (typeof source === "string" && source.length > 0) {
        host.constructor.presetWgslToonFragmentByMaterial.set(key, source);
        return;
    }

    host.constructor.presetWgslToonFragmentByMaterial.delete(key);
}

function getPresetFallbackShadowToonTexture(host: any): Texture | null {
    const scene = host?.scene;
    if (!scene || typeof scene !== "object") return null;

    const cached = presetFallbackShadowToonTextureByScene.get(scene as object);
    if (cached) return cached;

    const texture = new Texture(fallbackShadowToonTextureUrl, scene, false, true, Texture.BILINEAR_SAMPLINGMODE);
    texture.name = "preset:fallback_shadow_toon";
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    texture.updateSamplingMode(Texture.BILINEAR_SAMPLINGMODE);
    presetFallbackShadowToonTextureByScene.set(scene as object, texture);
    return texture;
}

function getPresetFallbackAccessoryToonTexture(host: any): Texture | null {
    const scene = host?.scene;
    if (!scene || typeof scene !== "object") return null;

    const cached = presetFallbackAccessoryToonTextureByScene.get(scene as object);
    if (cached) return cached;

    const texture = new Texture(fallbackAccessoryToonTextureUrl, scene, false, true, Texture.BILINEAR_SAMPLINGMODE);
    texture.name = "preset:fallback_accessory_toon";
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    texture.updateSamplingMode(Texture.BILINEAR_SAMPLINGMODE);
    presetFallbackAccessoryToonTextureByScene.set(scene as object, texture);
    return texture;
}

function setPresetFallbackToonTexture(host: any, material: any, kind: "shadow" | "accessory"): void {
    if (!material || typeof material !== "object") return;
    if (!("toonTexture" in material)) return;

    const fallbackTexture = kind === "accessory"
        ? getPresetFallbackAccessoryToonTexture(host)
        : getPresetFallbackShadowToonTexture(host);
    if (!fallbackTexture) return;

    material.toonTexture = fallbackTexture;
    if ("ignoreDiffuseWhenToonTextureIsNull" in material) {
        material.ignoreDiffuseWhenToonTextureIsNull = true;
    }
}

function ensurePresetFallbackToonTexture(host: any, material: any, kind: "shadow" | "accessory" = "shadow"): void {
    if (!material || typeof material !== "object") return;
    if (!("toonTexture" in material)) return;
    if (material.toonTexture) return;

    setPresetFallbackToonTexture(host, material, kind);
}

function ensureAccessoryPresetToonTexture(host: any, material: any): void {
    if (!material || typeof material !== "object") return;
    if (!("toonTexture" in material)) return;

    const toonTextureName = typeof material.toonTexture?.name === "string"
        ? material.toonTexture.name
        : "";
    if (material.toonTexture && toonTextureName !== "xAccessoryDefaultToon") {
        return;
    }

    setPresetFallbackToonTexture(host, material, "accessory");
}

function applyAccessoryAmbientTuning(material: any, defaults: MaterialShaderDefaults): void {
    if (!material || typeof material !== "object") return;
    if (!("ambientColor" in material)) return;

    const baseAmbient = defaults.ambientColor;
    if (!baseAmbient) return;

    const looksLikeLegacyXAmbient = baseAmbient.r >= 0.99
        && baseAmbient.g >= 0.99
        && baseAmbient.b >= 0.99;
    if (!looksLikeLegacyXAmbient) return;

    setMaterialColorProperty(material, "ambientColor", new Color3(0.22, 0.22, 0.22));
}

function collectLuminousMaterials(host: any): Set<object> {
    const luminousMaterials = new Set<object>();
    for (const entry of host.sceneModels ?? []) {
        for (const materialEntry of entry.materials ?? []) {
            if (host.isMaterialVisible?.(materialEntry.material) === false) {
                continue;
            }
            if (getWgslMaterialShaderPresetForMaterial(host, materialEntry.material) !== "wgsl-autoluminous") {
                continue;
            }
            luminousMaterials.add(materialEntry.material as object);
        }
    }
    return luminousMaterials;
}

export function syncLuminousGlowLayer(host: any): void {
    const luminousMaterials = collectLuminousMaterials(host);
    const hasLuminousMaterials = luminousMaterials.size > 0;

    const pipeline = host.defaultRenderingPipeline;
    if (!pipeline) {
        return;
    }

    const manualGlow = Boolean(host.postEffectGlowEnabledValue);
    const manualBloom = Boolean(host.postEffectBloomEnabledValue);
    const shouldEnableBloom = manualBloom || hasLuminousMaterials;

    pipeline.glowLayerEnabled = manualGlow;
    const glowLayer = pipeline.glowLayer;
    if (glowLayer) {
        glowLayer.customEmissiveColorSelector = null;
        glowLayer.customEmissiveTextureSelector = null;
        if (manualGlow) {
            glowLayer.intensity = host.postEffectGlowIntensityValue;
            glowLayer.blurKernelSize = host.postEffectGlowKernelValue;
        }
    }

    pipeline.bloomEnabled = shouldEnableBloom;
    const requestedBloomWeight = host.postEffectBloomWeightValue ?? 0;
    const requestedBloomThreshold = host.postEffectBloomThresholdValue ?? 2;
    const requestedBloomKernel = host.postEffectBloomKernelValue ?? 0;

    if (manualBloom) {
        pipeline.bloomWeight = requestedBloomWeight;
        pipeline.bloomThreshold = requestedBloomThreshold;
        pipeline.bloomKernel = requestedBloomKernel;
    } else if (hasLuminousMaterials) {
        // Keep the auto Luminous bloom selective so unrelated bright materials do not start glowing.
        pipeline.bloomWeight = AUTO_LUMINOUS_BLOOM_WEIGHT;
        pipeline.bloomThreshold = AUTO_LUMINOUS_BLOOM_THRESHOLD;
        pipeline.bloomKernel = AUTO_LUMINOUS_BLOOM_KERNEL;
    } else {
        pipeline.bloomWeight = requestedBloomWeight;
        pipeline.bloomThreshold = requestedBloomThreshold;
        pipeline.bloomKernel = requestedBloomKernel;
    }
}

export function ensureMaterialShaderDefaults(host: any, material: any): MaterialShaderDefaults {
    let defaults = host.materialShaderDefaultsByMaterial.get(material as object);
    if (!defaults) {
        defaults = {
            disableLighting: "disableLighting" in material ? Boolean(material.disableLighting) : null,
            specularPower: "specularPower" in material && Number.isFinite(Number(material.specularPower))
                ? Number(material.specularPower)
                : null,
            emissiveColor: cloneColor3OrNull(material.emissiveColor),
            ambientColor: cloneColor3OrNull(material.ambientColor),
            transparencyMode: "transparencyMode" in material && typeof material.transparencyMode === "number"
                ? material.transparencyMode
                : null,
            alphaCutOff: "alphaCutOff" in material && Number.isFinite(Number(material.alphaCutOff))
                ? Number(material.alphaCutOff)
                : null,
            forceDepthWrite: "forceDepthWrite" in material ? Boolean(material.forceDepthWrite) : null,
            useAlphaFromDiffuseTexture: "useAlphaFromDiffuseTexture" in material
                ? Boolean(material.useAlphaFromDiffuseTexture)
                : null,
            useAlphaFromAlbedoTexture: "useAlphaFromAlbedoTexture" in material
                ? Boolean(material.useAlphaFromAlbedoTexture)
                : null,
            toonTexture: "toonTexture" in material ? (material.toonTexture ?? null) : undefined,
            ignoreDiffuseWhenToonTextureIsNull: "ignoreDiffuseWhenToonTextureIsNull" in material
                ? Boolean(material.ignoreDiffuseWhenToonTextureIsNull)
                : null,
        };
        host.materialShaderDefaultsByMaterial.set(material as object, defaults);
    }

    return defaults;
}

function restoreMaterialShaderDefaults(host: any, material: any, defaults: MaterialShaderDefaults): void {
    if (!material || typeof material !== "object") return;

    if (defaults.disableLighting !== null && "disableLighting" in material) {
        material.disableLighting = defaults.disableLighting;
    }

    if (defaults.specularPower !== null && "specularPower" in material) {
        material.specularPower = defaults.specularPower;
    }

    if ("transparencyMode" in material) {
        material.transparencyMode = defaults.transparencyMode;
    }

    if (defaults.alphaCutOff !== null && "alphaCutOff" in material) {
        material.alphaCutOff = defaults.alphaCutOff;
    }

    if (defaults.forceDepthWrite !== null && "forceDepthWrite" in material) {
        material.forceDepthWrite = defaults.forceDepthWrite;
    }

    if (defaults.useAlphaFromDiffuseTexture !== null && "useAlphaFromDiffuseTexture" in material) {
        material.useAlphaFromDiffuseTexture = defaults.useAlphaFromDiffuseTexture;
    }

    if (defaults.useAlphaFromAlbedoTexture !== null && "useAlphaFromAlbedoTexture" in material) {
        material.useAlphaFromAlbedoTexture = defaults.useAlphaFromAlbedoTexture;
    }

    if (defaults.toonTexture !== undefined && "toonTexture" in material) {
        material.toonTexture = defaults.toonTexture;
    }

    if (defaults.ignoreDiffuseWhenToonTextureIsNull !== null && "ignoreDiffuseWhenToonTextureIsNull" in material) {
        material.ignoreDiffuseWhenToonTextureIsNull = defaults.ignoreDiffuseWhenToonTextureIsNull;
    }

    if (defaults.emissiveColor) {
        setMaterialColorProperty(material, "emissiveColor", defaults.emissiveColor);
    } else if ("emissiveColor" in material) {
        setMaterialColorProperty(material, "emissiveColor", new Color3(0, 0, 0));
    }

    if (defaults.ambientColor) {
        setMaterialColorProperty(material, "ambientColor", defaults.ambientColor);
    } else if ("ambientColor" in material) {
        setMaterialColorProperty(material, "ambientColor", new Color3(0, 0, 0));
    }
}

function applyWgslShaderPresetToMaterial(host: any, material: any, presetId: WgslMaterialShaderPresetId): void {
    if (!material || typeof material !== "object") return;

    const defaults = ensureMaterialShaderDefaults(host, material);
    restoreMaterialShaderDefaults(host, material, defaults);
    setPresetWgslToonFragmentForMaterial(host, material, null);

    switch (presetId) {
        case "wgsl-unlit": {
            if ("disableLighting" in material) {
                material.disableLighting = true;
            }
            if ("specularPower" in material) {
                material.specularPower = 0;
            }
            const diffuse = cloneColor3OrNull(material.diffuseColor);
            if (diffuse) {
                setMaterialColorProperty(
                    material,
                    "emissiveColor",
                    new Color3(
                        Math.min(1, diffuse.r * 0.95),
                        Math.min(1, diffuse.g * 0.95),
                        Math.min(1, diffuse.b * 0.95),
                    ),
                );
            }
            break;
        }
        case "wgsl-soft-lit": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            if ("specularPower" in material) {
                const base = defaults.specularPower ?? 32;
                material.specularPower = Math.max(8, base * 0.4);
            }
            const baseEmissive = defaults.emissiveColor ?? new Color3(0, 0, 0);
            setMaterialColorProperty(
                material,
                "emissiveColor",
                new Color3(
                    Math.min(1, baseEmissive.r + 0.04),
                    Math.min(1, baseEmissive.g + 0.04),
                    Math.min(1, baseEmissive.b + 0.04),
                ),
            );
            break;
        }
        case "wgsl-autoluminous": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            if ("specularPower" in material) {
                const base = defaults.specularPower ?? 32;
                material.specularPower = Math.max(6, base * 0.3);
            }
            const baseEmissive = defaults.emissiveColor ?? new Color3(0, 0, 0);
            const diffuse = cloneColor3OrNull(material.diffuseColor) ?? new Color3(0, 0, 0);
            const luminance = Math.max(0, diffuse.r * 0.299 + diffuse.g * 0.587 + diffuse.b * 0.114);
            const maxChannel = Math.max(0.0001, diffuse.r, diffuse.g, diffuse.b);
            const normalizedTint = new Color3(
                diffuse.r / maxChannel,
                diffuse.g / maxChannel,
                diffuse.b / maxChannel,
            );
            const balancedTint = new Color3(
                normalizedTint.r * AUTO_LUMINOUS_TINT_STRENGTH + diffuse.r * (1 - AUTO_LUMINOUS_TINT_STRENGTH),
                normalizedTint.g * AUTO_LUMINOUS_TINT_STRENGTH + diffuse.g * (1 - AUTO_LUMINOUS_TINT_STRENGTH),
                normalizedTint.b * AUTO_LUMINOUS_TINT_STRENGTH + diffuse.b * (1 - AUTO_LUMINOUS_TINT_STRENGTH),
            );
            const glowLevel = AUTO_LUMINOUS_BASE_LEVEL + luminance * AUTO_LUMINOUS_BRIGHTNESS_BIAS;
            setMaterialColorProperty(
                material,
                "emissiveColor",
                new Color3(
                    baseEmissive.r + balancedTint.r * glowLevel,
                    baseEmissive.g + balancedTint.g * glowLevel,
                    baseEmissive.b + balancedTint.b * glowLevel,
                ),
            );
            break;
        }
        case "wgsl-debug-white": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            setPresetWgslToonFragmentForMaterial(host, material, debugWhiteWgslText);
            break;
        }
        case "wgsl-full-light": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            if ("specularPower" in material) {
                material.specularPower = 0;
            }
            const diffuseTextureHasAlpha = Boolean(material.diffuseTexture?.hasAlpha);
            const albedoTextureHasAlpha = Boolean(material.albedoTexture?.hasAlpha);
            const hasOpacityTexture = Boolean(material.opacityTexture);
            const usesTextureAlpha = Boolean(material.useAlphaFromDiffuseTexture || material.useAlphaFromAlbedoTexture);
            const isTransparencyModeEnabled = typeof material.transparencyMode === "number" && material.transparencyMode !== 0;
            const isTransparentLike = diffuseTextureHasAlpha || albedoTextureHasAlpha || hasOpacityTexture || usesTextureAlpha || isTransparencyModeEnabled || Number(material.alpha ?? 1) < 0.999;
            const baseEmissive = defaults.emissiveColor ?? new Color3(0, 0, 0);
            const diffuse = cloneColor3OrNull(material.diffuseColor) ?? new Color3(0, 0, 0);
            const emissiveBoost = isTransparentLike ? 0.82 : 0.32;
            setMaterialColorProperty(
                material,
                "emissiveColor",
                new Color3(
                    Math.min(1, baseEmissive.r + diffuse.r * emissiveBoost),
                    Math.min(1, baseEmissive.g + diffuse.g * emissiveBoost),
                    Math.min(1, baseEmissive.b + diffuse.b * emissiveBoost),
                ),
            );
            ensurePresetFallbackToonTexture(host, material);
            setPresetWgslToonFragmentForMaterial(host, material, fullLightWgslText);
            break;
        }
        case "wgsl-full-light-add": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            if ("specularPower" in material) {
                material.specularPower = 0;
            }
            const diffuseTextureHasAlpha = Boolean(material.diffuseTexture?.hasAlpha);
            const albedoTextureHasAlpha = Boolean(material.albedoTexture?.hasAlpha);
            const hasOpacityTexture = Boolean(material.opacityTexture);
            const usesTextureAlpha = Boolean(material.useAlphaFromDiffuseTexture || material.useAlphaFromAlbedoTexture);
            const isTransparencyModeEnabled = typeof material.transparencyMode === "number" && material.transparencyMode !== 0;
            const isTransparentLike = diffuseTextureHasAlpha || albedoTextureHasAlpha || hasOpacityTexture || usesTextureAlpha || isTransparencyModeEnabled || Number(material.alpha ?? 1) < 0.999;
            const baseEmissive = defaults.emissiveColor ?? new Color3(0, 0, 0);
            const diffuse = cloneColor3OrNull(material.diffuseColor) ?? new Color3(0, 0, 0);
            const emissiveBoost = isTransparentLike ? 0.96 : 0.46;
            setMaterialColorProperty(
                material,
                "emissiveColor",
                new Color3(
                    Math.min(1, baseEmissive.r + diffuse.r * emissiveBoost),
                    Math.min(1, baseEmissive.g + diffuse.g * emissiveBoost),
                    Math.min(1, baseEmissive.b + diffuse.b * emissiveBoost),
                ),
            );
            setPresetWgslToonFragmentForMaterial(host, material, fullLightAddWgslText);
            break;
        }
        case "wgsl-full-alpha-test": {
            const preferredAlphaCutOff = defaults.alphaCutOff !== null
                ? Math.min(defaults.alphaCutOff, 0.28)
                : 0.28;
            enableAlphaTextureFlags(material);
            applyAlphaCutoutPreset(material, preferredAlphaCutOff);
            break;
        }
        case "wgsl-full-alpha-test-hard": {
            const preferredAlphaCutOff = defaults.alphaCutOff !== null
                ? Math.max(defaults.alphaCutOff, 0.56)
                : 0.56;
            enableAlphaTextureFlags(material);
            applyAlphaCutoutPreset(material, preferredAlphaCutOff);
            break;
        }
        case "wgsl-alpha-mask": {
            applyAlphaBlendCutoutPreset(material);
            break;
        }
        case "wgsl-white-key-cutout": {
            applyAlphaBlendCutoutPreset(material);
            break;
        }
        case "wgsl-black-key-cutout": {
            applyAlphaBlendCutoutPreset(material);
            break;
        }
        case "wgsl-full-shadow": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            if ("specularPower" in material) {
                material.specularPower = 0;
            }
            ensurePresetFallbackToonTexture(host, material);
            setPresetWgslToonFragmentForMaterial(host, material, fullShadowWgslText);
            break;
        }
        case "wgsl-light-and-shadow": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            ensurePresetFallbackToonTexture(host, material);
            break;
        }
        case "wgsl-gloss-highlight": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            if ("specularPower" in material) {
                const base = defaults.specularPower ?? 32;
                material.specularPower = Math.min(768, Math.max(96, base * 3.1));
            }
            setPresetWgslToonFragmentForMaterial(host, material, glossHighlightWgslText);
            break;
        }
        case "wgsl-semi-matte-highlight": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            if ("specularPower" in material) {
                const base = defaults.specularPower ?? 32;
                material.specularPower = Math.min(256, Math.max(28, base * 1.2));
            }
            setPresetWgslToonFragmentForMaterial(host, material, semiMatteHighlightWgslText);
            break;
        }
        case "wgsl-matte-highlight": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            if ("specularPower" in material) {
                const base = defaults.specularPower ?? 32;
                material.specularPower = Math.max(6, Math.min(48, base * 0.35));
            }
            setPresetWgslToonFragmentForMaterial(host, material, matteHighlightWgslText);
            break;
        }
        case "wgsl-specular": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            if ("specularPower" in material) {
                const base = defaults.specularPower ?? 32;
                material.specularPower = Math.min(512, Math.max(32, base * 1.85));
            }
            break;
        }
        case "wgsl-cel-sharp": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            if ("specularPower" in material) {
                const base = defaults.specularPower ?? 32;
                material.specularPower = Math.max(4, base * 0.18);
            }
            const baseEmissive = defaults.emissiveColor ?? new Color3(0, 0, 0);
            setMaterialColorProperty(
                material,
                "emissiveColor",
                new Color3(
                    Math.min(1, baseEmissive.r + 0.015),
                    Math.min(1, baseEmissive.g + 0.015),
                    Math.min(1, baseEmissive.b + 0.015),
                ),
            );
            break;
        }
        case "wgsl-cel-shadow-sharp": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            if ("specularPower" in material) {
                const base = defaults.specularPower ?? 32;
                material.specularPower = Math.max(4, base * 0.14);
            }
            ensurePresetFallbackToonTexture(host, material);
            setPresetWgslToonFragmentForMaterial(host, material, toonHardShadowWgslText);
            break;
        }
        case "wgsl-accessory-toon": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            ensureAccessoryPresetToonTexture(host, material);
            applyAccessoryAmbientTuning(material, defaults);
            break;
        }
        case "wgsl-rim-lift": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            if ("specularPower" in material) {
                const base = defaults.specularPower ?? 32;
                material.specularPower = Math.max(24, base * 0.75);
            }
            const baseEmissive = defaults.emissiveColor ?? new Color3(0, 0, 0);
            const diffuse = cloneColor3OrNull(material.diffuseColor) ?? new Color3(0, 0, 0);
            setMaterialColorProperty(
                material,
                "emissiveColor",
                new Color3(
                    Math.min(1, baseEmissive.r + diffuse.r * 0.12),
                    Math.min(1, baseEmissive.g + diffuse.g * 0.12),
                    Math.min(1, baseEmissive.b + diffuse.b * 0.12),
                ),
            );
            break;
        }
        case "wgsl-mono-flat": {
            if ("disableLighting" in material) {
                material.disableLighting = true;
            }
            if ("specularPower" in material) {
                material.specularPower = 0;
            }
            const diffuse = cloneColor3OrNull(material.diffuseColor);
            if (diffuse) {
                const luma = Math.max(0, Math.min(1, diffuse.r * 0.299 + diffuse.g * 0.587 + diffuse.b * 0.114));
                const mono = luma * 0.92;
                setMaterialColorProperty(material, "emissiveColor", new Color3(mono, mono, mono));
            }
            break;
        }
        case "wgsl-mmd-standard":
        default:
            break;
    }

    host.materialShaderPresetByMaterial.set(material as object, presetId);
    markMaterialShaderDirty(material);
}

export function isWgslMaterialShaderAssignmentAvailable(host: any): boolean {
    return Boolean(host.isWebGpuEngine?.());
}

export function getWgslMaterialShaderPresets(host: any): readonly { id: WgslMaterialShaderPresetId; label: string }[] {
    return getPresetCatalog(host);
}

export function getExternalWgslToonShaderPath(host: any, modelIndex?: number, materialKey: string | null = null): string | null {
    if (typeof modelIndex !== "number" || !Number.isFinite(modelIndex)) {
        return host.externalWgslToonShaderPathValue;
    }

    const entry = host.sceneModels[modelIndex];
    if (!entry) return null;

    if (materialKey !== null) {
        const target = entry.materials.find((material: any) => material.key === materialKey);
        return target ? getExternalWgslToonShaderPathForMaterial(host, target.material) : null;
    }

    const paths = new Set<string>();
    for (const material of entry.materials) {
        const path = getExternalWgslToonShaderPathForMaterial(host, material.material);
        if (path) {
            paths.add(path);
        }
    }
    return paths.size === 1 ? Array.from(paths)[0] : null;
}

export function hasExternalWgslToonShader(host: any, modelIndex?: number, materialKey: string | null = null): boolean {
    return getExternalWgslToonShaderPath(host, modelIndex, materialKey) !== null;
}

export function getExternalWgslToonShaderPathForMaterial(host: any, material: any): string | null {
    const key = getMaterialKey(material);
    if (!key) return null;
    return host.externalWgslToonShaderPathByMaterial.get(key) ?? null;
}

export function setExternalWgslToonShaderForMaterial(
    host: any,
    material: any,
    path: string | null,
    source: string | null,
): void {
    const key = getMaterialKey(material);
    if (!key) return;
    if (path && source) {
        host.externalWgslToonShaderPathByMaterial.set(key, path);
        host.constructor.externalWgslToonFragmentByMaterial.set(key, source);
        return;
    }

    host.externalWgslToonShaderPathByMaterial.delete(key);
    host.constructor.externalWgslToonFragmentByMaterial.delete(key);
}

export function setExternalWgslToonShader(host: any, path: string | null, source: string | null): void {
    const normalizedPath = typeof path === "string" && path.trim().length > 0 ? path.trim() : null;
    const normalizedSource = typeof source === "string" && source.trim().length > 0 ? source : null;

    host.externalWgslToonShaderPathValue = normalizedPath;
    for (const entry of host.sceneModels) {
        for (const material of entry.materials) {
            setExternalWgslToonShaderForMaterial(host, material.material, normalizedPath, normalizedSource);
            markMaterialShaderDirty(material.material);
        }
    }

    host.engine.releaseEffects();
    host.onMaterialShaderStateChanged?.();
}

export function setExternalWgslToonShaderForModel(
    host: any,
    modelIndex: number,
    materialKey: string | null,
    path: string | null,
    source: string | null,
): boolean {
    if (!isWgslMaterialShaderAssignmentAvailable(host)) return false;

    const entry = host.sceneModels[modelIndex];
    if (!entry) return false;

    const targets = materialKey === null
        ? entry.materials
        : entry.materials.filter((material: any) => material.key === materialKey);
    if (targets.length === 0) return false;

    const normalizedPath = typeof path === "string" && path.trim().length > 0 ? path.trim() : null;
    const normalizedSource = typeof source === "string" && source.trim().length > 0 ? source : null;

    for (const target of targets) {
        setExternalWgslToonShaderForMaterial(host, target.material, normalizedPath, normalizedSource);
        markMaterialShaderDirty(target.material);
    }
    host.externalWgslToonShaderPathValue = normalizedPath;

    host.engine.releaseEffects();
    host.onMaterialShaderStateChanged?.();
    return true;
}

export function getWgslMaterialShaderPresetForMaterial(host: any, material: any): WgslMaterialShaderPresetId {
    const key = getMaterialKey(material);
    if (!key) {
        return getDefaultPreset(host);
    }

    return host.materialShaderPresetByMaterial.get(key) ?? getDefaultPreset(host);
}

export function setWgslMaterialShaderPreset(
    host: any,
    modelIndex: number,
    materialKey: string | null,
    presetId: WgslMaterialShaderPresetId,
): boolean {
    if (!isWgslMaterialShaderAssignmentAvailable(host)) return false;
    if (!getPresetCatalog(host).some((item) => item.id === presetId)) return false;

    const entry = host.sceneModels[modelIndex];
    if (!entry) return false;

    const targets = materialKey === null
        ? entry.materials
        : entry.materials.filter((material: any) => material.key === materialKey);
    if (targets.length === 0) return false;

    for (const target of targets) {
        setExternalWgslToonShaderForMaterial(host, target.material, null, null);
        applyWgslShaderPresetToMaterial(host, target.material, presetId);
    }

    syncLuminousGlowLayer(host);
    host.engine.releaseEffects?.();
    host.onMaterialShaderStateChanged?.();
    return true;
}

export function applyWgslShaderPresetToMaterials(
    host: any,
    materials: Iterable<any>,
    presetId: WgslMaterialShaderPresetId,
): boolean {
    if (!isWgslMaterialShaderAssignmentAvailable(host)) return false;
    if (!getPresetCatalog(host).some((item) => item.id === presetId)) return false;

    const seen = new Set<object>();
    let applied = false;
    for (const material of materials) {
        const key = getMaterialKey(material);
        if (!key || seen.has(key)) continue;
        seen.add(key);

        setExternalWgslToonShaderForMaterial(host, material, null, null);
        applyWgslShaderPresetToMaterial(host, material, presetId);
        applied = true;
    }

    if (!applied) return false;

    syncLuminousGlowLayer(host);
    host.engine.releaseEffects?.();
    host.onMaterialShaderStateChanged?.();
    return true;
}

export function getWgslModelShaderStates(host: any): Array<{
    modelIndex: number;
    modelName: string;
    modelPath: string;
    active: boolean;
    materials: Array<{
        key: string;
        name: string;
        presetId: WgslMaterialShaderPresetId;
        externalWgslPath: string | null;
        visible: boolean;
    }>;
}> {
    return host.sceneModels.map((entry: any, modelIndex: number) => ({
        modelIndex,
        modelName: entry.info.name,
        modelPath: entry.info.path,
        active: entry.model === host.currentModel,
        materials: entry.materials.map((material: any) => ({
            key: material.key,
            name: material.name,
            presetId: getWgslMaterialShaderPresetForMaterial(host, material.material),
            externalWgslPath: getExternalWgslToonShaderPathForMaterial(host, material.material),
            visible: host.isMaterialVisible?.(material.material) !== false,
        })),
    }));
}

export function getSerializedMaterialShaderStates(host: any, entry: any): ProjectModelMaterialShaderState[] {
    const states: ProjectModelMaterialShaderState[] = [];
    for (const material of entry.materials) {
        const presetId = getWgslMaterialShaderPresetForMaterial(host, material.material);
        if (presetId === getDefaultPreset(host)) continue;
        states.push({
            materialKey: material.key,
            presetId,
        });
    }
    return states;
}

export function applyImportedMaterialShaderStates(
    host: any,
    modelIndex: number,
    states: ProjectModelMaterialShaderState[] | undefined,
    warnings: string[],
    modelPath: string,
): void {
    if (!Array.isArray(states) || states.length === 0) return;
    if (!isWgslMaterialShaderAssignmentAvailable(host)) return;

    const entry = host.sceneModels[modelIndex];
    if (!entry) return;

    for (const state of states) {
        if (!state || typeof state.materialKey !== "string" || typeof state.presetId !== "string") {
            warnings.push("Invalid material shader assignment: " + modelPath);
            continue;
        }

        const exists = getPresetCatalog(host).some((preset) => preset.id === state.presetId);
        if (!exists) {
            warnings.push("Unknown shader preset '" + state.presetId + "' for " + modelPath);
            continue;
        }

        const ok = setWgslMaterialShaderPreset(
            host,
            modelIndex,
            state.materialKey,
            state.presetId as WgslMaterialShaderPresetId,
        );
        if (!ok) {
            warnings.push("Material shader target not found: " + state.materialKey + " (" + modelPath + ")");
        }
    }
}
