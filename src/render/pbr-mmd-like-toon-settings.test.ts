import { describe, expect, it } from "vitest";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import {
    applyPbrMaterialPresetToMaterial,
    applyPbrMaterialShaderPreset,
    applyMmdLikeFallbackSubSurfaceSettings,
    applyMmdLikeToonSubSurfaceSettings,
    MMD_LIKE_ALPHA_CUTOFF,
    MMD_LIKE_MIN_ROUGHNESS,
    MMD_LIKE_OPAQUE_ALPHA_THRESHOLD,
    MMD_LIKE_SCATTERING_PROFILE,
    MMD_LIKE_SPECULAR_INTENSITY,
    PBR_SKIN_MIN_ROUGHNESS,
    PBR_SKIN_SCATTERING_PROFILE,
    PBR_SKIN_SPECULAR_INTENSITY,
    getPbrMaterialShaderPreset,
    type MmdLikeSubSurfaceTarget,
    type MmdLikeToonTextureTarget,
    registerPbrPresetMaterial,
    registerPbrPresetTransparencyBaseline,
    registerPbrPresetToonTexture,
} from "./pbr-mmd-like-toon-settings";
import {
    getMmdLikeToonSampleUv,
    getPbrSkinScatterSourceStrength,
} from "./pbr-mmd-like-material-plugin";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Material } from "@babylonjs/core/Materials/material";

function createSubSurfaceTarget(): MmdLikeSubSurfaceTarget {
    return {
        isTranslucencyEnabled: false,
        isScatteringEnabled: false,
        translucencyIntensity: 0,
        useAlbedoToTintTranslucency: true,
        tintColor: Color3.Black(),
        translucencyColor: null,
        translucencyColorTexture: null,
        scatteringDiffusionProfile: null,
    };
}

describe("PBR MMD Like toon subsurface settings", () => {
    it("feeds more red scattering source into dark Skin pixels", () => {
        expect(getPbrSkinScatterSourceStrength(0)).toBeCloseTo(0.35);
        expect(getPbrSkinScatterSourceStrength(0.4)).toBeGreaterThan(
            getPbrSkinScatterSourceStrength(1),
        );
        expect(getPbrSkinScatterSourceStrength(1)).toBeCloseTo(0.1225);
    });

    it("uses the centre of the bottom-left toon texel in the material shader", () => {
        const subSurface = createSubSurfaceTarget();
        const toonTexture = {
            uOffset: 0,
            vOffset: 0,
            uScale: 1,
            vScale: 1,
            wrapU: -1,
            wrapV: -1,
            getSize: () => ({ width: 256, height: 32 }),
        } as MmdLikeToonTextureTarget & BaseTexture;

        applyMmdLikeToonSubSurfaceSettings(subSurface, toonTexture);

        expect(getMmdLikeToonSampleUv(toonTexture)).toEqual({
            u: 0.5 / 256,
            v: 0.5 / 32,
        });
        expect(subSurface.isTranslucencyEnabled).toBe(false);
        expect(subSurface.isScatteringEnabled).toBe(true);
        expect(subSurface.translucencyIntensity).toBe(0);
        expect(subSurface.useAlbedoToTintTranslucency).toBe(false);
        expect(subSurface.translucencyColor).toBeNull();
        expect(subSurface.translucencyColorTexture).toBeNull();
        expect(subSurface.scatteringDiffusionProfile?.equals(
            MMD_LIKE_SCATTERING_PROFILE,
        )).toBe(true);
    });

    it("uses scattering without translucency when a toon texture cannot be loaded", () => {
        const subSurface = createSubSurfaceTarget();

        applyMmdLikeFallbackSubSurfaceSettings(subSurface, [0.2, 0.3, 0.4]);

        expect(subSurface.isTranslucencyEnabled).toBe(false);
        expect(subSurface.isScatteringEnabled).toBe(true);
        expect(subSurface.translucencyIntensity).toBe(0);
        expect(subSurface.translucencyColor).toBeNull();
        expect(subSurface.translucencyColorTexture).toBeNull();
        expect(subSurface.scatteringDiffusionProfile?.equals(
            MMD_LIKE_SCATTERING_PROFILE,
        )).toBe(true);
    });

    it("switches an existing PBR material between Standard and MMD Like without recreating it", () => {
        const subSurface = createSubSurfaceTarget();
        subSurface.translucencyIntensity = 0.25;
        subSurface.tintColor = new Color3(0.8, 0.7, 0.6);
        const material = {
            subSurface,
            ambientColor: new Color3(0.2, 0.3, 0.4),
            roughness: 0.35,
            metallic: 0,
            metallicF0Factor: 1,
            specularIntensity: 1,
            reflectionColor: new Color3(0.05, 0.1, 0.15),
            markAsDirty: () => undefined,
        };
        const toonTexture = {
            uOffset: 0,
            vOffset: 0,
            uScale: 1,
            vScale: 1,
            wrapU: -1,
            wrapV: -1,
            getSize: () => ({ width: 256, height: 32 }),
        } as MmdLikeToonTextureTarget & BaseTexture;

        registerPbrPresetMaterial(material, [0.2, 0.3, 0.4]);
        registerPbrPresetToonTexture(material, toonTexture);

        expect(applyPbrMaterialPresetToMaterial(material, "pbr-mmd-like")).toBe(true);
        expect(material.subSurface.isTranslucencyEnabled).toBe(false);
        expect(material.subSurface.isScatteringEnabled).toBe(true);
        expect(material.subSurface.translucencyIntensity).toBe(0);
        expect(material.subSurface.translucencyColorTexture).toBeNull();
        expect(material.roughness).toBe(MMD_LIKE_MIN_ROUGHNESS);
        expect(material.specularIntensity).toBe(MMD_LIKE_SPECULAR_INTENSITY);
        expect(material.reflectionColor.equals(Color3.White())).toBe(true);

        expect(applyPbrMaterialPresetToMaterial(material, "pbr-standard")).toBe(true);
        expect(material.subSurface.isTranslucencyEnabled).toBe(false);
        expect(material.subSurface.isScatteringEnabled).toBe(false);
        expect(material.subSurface.translucencyIntensity).toBe(0.25);
        expect(material.subSurface.tintColor.equals(new Color3(0.8, 0.7, 0.6))).toBe(true);
        expect(material.subSurface.translucencyColorTexture).toBeNull();
        expect(material.roughness).toBe(0.35);
        expect(material.specularIntensity).toBe(1);
        expect(material.reflectionColor.equals(Color3.White())).toBe(true);
    });

    it("applies strong red scattering to an individually assigned Skin material", () => {
        const material = {
            subSurface: createSubSurfaceTarget(),
            ambientColor: new Color3(0.1, 0.2, 0.3),
            roughness: 0.35,
            specularIntensity: 1,
            reflectionColor: new Color3(0, 0, 0),
        };
        registerPbrPresetMaterial(material, material.ambientColor);

        expect(applyPbrMaterialShaderPreset(
            material,
            "pbr-mmd-like",
            "pbr-skin",
        )).toBe(true);
        expect(getPbrMaterialShaderPreset(material)).toBe("pbr-skin");
        expect(material.subSurface.isTranslucencyEnabled).toBe(false);
        expect(material.subSurface.isScatteringEnabled).toBe(true);
        expect(material.subSurface.scatteringDiffusionProfile?.equals(
            PBR_SKIN_SCATTERING_PROFILE,
        )).toBe(true);
        expect(material.roughness).toBe(PBR_SKIN_MIN_ROUGHNESS);
        expect(material.specularIntensity).toBe(PBR_SKIN_SPECULAR_INTENSITY);
        expect(material.reflectionColor.equals(Color3.White())).toBe(true);

        expect(applyPbrMaterialShaderPreset(
            material,
            "pbr-mmd-like",
            "pbr-base",
        )).toBe(true);
        expect(getPbrMaterialShaderPreset(material)).toBe("pbr-base");
        expect(material.subSurface.isTranslucencyEnabled).toBe(false);
        expect(material.subSurface.isScatteringEnabled).toBe(true);
        expect(material.subSurface.scatteringDiffusionProfile?.equals(
            MMD_LIKE_SCATTERING_PROFILE,
        )).toBe(true);
    });

    it("uses alpha test instead of alpha blend for opaque SSS surfaces with texture cutouts", () => {
        const material = {
            subSurface: createSubSurfaceTarget(),
            ambientColor: new Color3(0.1, 0.2, 0.3),
            alpha: 1,
            transparencyMode: Material.MATERIAL_ALPHABLEND,
            useAlphaFromAlbedoTexture: true,
            forceDepthWrite: true,
            alphaCutOff: 0.4,
            albedoTexture: { hasAlpha: true } as BaseTexture,
        };
        registerPbrPresetMaterial(material, material.ambientColor);
        registerPbrPresetTransparencyBaseline(material);

        expect(applyPbrMaterialPresetToMaterial(material, "pbr-mmd-like")).toBe(true);
        expect(material.alpha).toBe(1);
        expect(material.transparencyMode).toBe(Material.MATERIAL_ALPHATEST);
        expect(material.useAlphaFromAlbedoTexture).toBe(true);
        expect(material.forceDepthWrite).toBe(false);
        expect(material.alphaCutOff).toBe(MMD_LIKE_ALPHA_CUTOFF);
        expect(material.subSurface.isScatteringEnabled).toBe(true);

        expect(applyPbrMaterialPresetToMaterial(material, "pbr-standard")).toBe(true);
        expect(material.transparencyMode).toBe(Material.MATERIAL_ALPHABLEND);
        expect(material.useAlphaFromAlbedoTexture).toBe(true);
        expect(material.forceDepthWrite).toBe(true);
        expect(material.alphaCutOff).toBe(0.4);
    });

    it("keeps explicitly transparent materials out of screen-space scattering", () => {
        const material = {
            subSurface: createSubSurfaceTarget(),
            ambientColor: new Color3(0.1, 0.2, 0.3),
            alpha: 0.5,
            transparencyMode: Material.MATERIAL_ALPHABLEND,
            useAlphaFromAlbedoTexture: true,
            forceDepthWrite: true,
            alphaCutOff: 0.4,
            albedoTexture: { hasAlpha: true } as BaseTexture,
        };
        registerPbrPresetMaterial(material, material.ambientColor);
        registerPbrPresetTransparencyBaseline(material);

        expect(applyPbrMaterialPresetToMaterial(material, "pbr-mmd-like")).toBe(true);
        expect(material.alpha).toBe(0.5);
        expect(material.transparencyMode).toBe(Material.MATERIAL_ALPHABLEND);
        expect(material.subSurface.isScatteringEnabled).toBe(false);
    });

    it("treats near-opaque MMD alpha as an opaque alpha-test surface", () => {
        const material = {
            subSurface: createSubSurfaceTarget(),
            ambientColor: new Color3(0.1, 0.2, 0.3),
            alpha: MMD_LIKE_OPAQUE_ALPHA_THRESHOLD + 0.01,
            transparencyMode: Material.MATERIAL_ALPHABLEND,
            useAlphaFromAlbedoTexture: true,
            forceDepthWrite: true,
            alphaCutOff: 0.4,
            albedoTexture: { hasAlpha: true } as BaseTexture,
        };
        registerPbrPresetMaterial(material, material.ambientColor);
        registerPbrPresetTransparencyBaseline(material);

        expect(applyPbrMaterialPresetToMaterial(material, "pbr-mmd-like")).toBe(true);
        expect(material.alpha).toBe(1);
        expect(material.transparencyMode).toBe(Material.MATERIAL_ALPHATEST);
        expect(material.alphaCutOff).toBe(MMD_LIKE_ALPHA_CUTOFF);
        expect(material.subSurface.isScatteringEnabled).toBe(true);
    });
});
