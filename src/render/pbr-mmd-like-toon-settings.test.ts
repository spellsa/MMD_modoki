import { describe, expect, it, vi } from "vitest";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Scene } from "@babylonjs/core/scene";
import {
    PBR_MMD_LIKE_ENVIRONMENT_INTENSITY,
    PBR_MMD_LIKE_TRANSLUCENCY_INTENSITY,
    PBR_SKIN_ENVIRONMENT_INTENSITY,
    PBR_SKIN_MAXIMUM_THICKNESS,
    PBR_SKIN_MINIMUM_THICKNESS,
    PBR_SKIN_TRANSLUCENCY_COLOR_RGB,
    PBR_SKIN_TRANSLUCENCY_INTENSITY,
    applyPbrMaterialShaderPreset,
    getPbrMaterialShaderPreset,
    registerPbrPresetMaterial,
    registerPbrPresetTransparencyBaseline,
    registerPbrPresetToonTexture,
    type MmdLikeSubSurfaceTarget,
    type MmdLikeToonTextureTarget,
} from "./pbr-mmd-like-toon-settings";

function createSubSurfaceTarget(): MmdLikeSubSurfaceTarget {
    return {
        isRefractionEnabled: true,
        isTranslucencyEnabled: false,
        isScatteringEnabled: false,
        refractionIntensity: 0.4,
        translucencyIntensity: 0.25,
        linkRefractionWithTransparency: true,
        legacyTranslucency: true,
        useAlbedoToTintTranslucency: true,
        minimumThickness: 0.1,
        maximumThickness: 0.9,
        tintColor: new Color3(0.8, 0.7, 0.6),
        translucencyColor: null,
        translucencyColorTexture: null,
        scatteringDiffusionProfile: null,
    };
}

function createMaterial() {
    const subSurfaceConfiguration = {
        enabled: false,
        metersPerUnit: 1,
    };
    const scene = {
        materials: [] as unknown[],
        subSurfaceConfiguration,
        enableSubSurfaceForPrePass: vi.fn(() => subSurfaceConfiguration),
    };
    const material = {
        subSurface: createSubSurfaceTarget(),
        ambientColor: new Color3(0.2, 0.3, 0.4),
        alpha: 1,
        transparencyMode: Material.MATERIAL_ALPHABLEND,
        useAlphaFromAlbedoTexture: true,
        forceDepthWrite: true,
        alphaCutOff: 0.4,
        roughness: 0.35,
        specularIntensity: 1,
        environmentIntensity: 0.9,
        reflectionColor: new Color3(0.05, 0.1, 0.15),
        getScene: () => scene,
        markAsDirty: vi.fn(),
    };
    scene.materials.push(material);
    return material;
}

function expectStandardBaseline(material: ReturnType<typeof createMaterial>): void {
    expect(material.subSurface.isRefractionEnabled).toBe(true);
    expect(material.subSurface.isTranslucencyEnabled).toBe(false);
    expect(material.subSurface.isScatteringEnabled).toBe(false);
    expect(material.subSurface.refractionIntensity).toBe(0.4);
    expect(material.subSurface.translucencyIntensity).toBe(0.25);
    expect(material.subSurface.linkRefractionWithTransparency).toBe(true);
    expect(material.subSurface.legacyTranslucency).toBe(true);
    expect(material.subSurface.useAlbedoToTintTranslucency).toBe(true);
    expect(material.subSurface.minimumThickness).toBe(0.1);
    expect(material.subSurface.maximumThickness).toBe(0.9);
    expect(material.subSurface.tintColor.equals(new Color3(0.8, 0.7, 0.6))).toBe(true);
    expect(material.alpha).toBe(1);
    expect(material.transparencyMode).toBe(Material.MATERIAL_ALPHABLEND);
    expect(material.useAlphaFromAlbedoTexture).toBe(true);
    expect(material.forceDepthWrite).toBe(true);
    expect(material.alphaCutOff).toBe(0.4);
    expect(material.roughness).toBe(0.35);
    expect(material.specularIntensity).toBe(1);
    expect(material.environmentIntensity).toBe(0.9);
    expect(material.reflectionColor.equals(Color3.White())).toBe(true);
}

describe("PBR material shader presets", () => {
    it(
        "keeps PBR Standard on the verified rendering baseline",
        () => {
            const material = createMaterial();
            registerPbrPresetMaterial(material, material.ambientColor);
            registerPbrPresetTransparencyBaseline(material);

            material.subSurface.isScatteringEnabled = true;
            material.subSurface.translucencyIntensity = 0;
            material.alpha = 0.5;
            material.transparencyMode = Material.MATERIAL_ALPHATEST;
            material.roughness = 1;
            material.specularIntensity = 0.2;

            expect(applyPbrMaterialShaderPreset(material, "pbr-base")).toBe(true);
            expect(getPbrMaterialShaderPreset(material)).toBe("pbr-base");
            expectStandardBaseline(material);
            expect(material.markAsDirty).toHaveBeenCalledWith(Material.AllDirtyFlag);
        },
    );

    it("uses the PMX toon shadow texel as PBR MMD Like translucency color", () => {
        const material = createMaterial();
        const toonSampleTexture = {
            uOffset: 0,
            vOffset: 0,
            uScale: 1,
            vScale: 1,
            wrapU: -1,
            wrapV: -1,
            getSize: () => ({ width: 256, height: 32 }),
        } as MmdLikeToonTextureTarget & BaseTexture;
        const toonTexture = {
            uOffset: 0,
            vOffset: 0,
            uScale: 1,
            vScale: 1,
            wrapU: -1,
            wrapV: -1,
            getSize: () => ({ width: 256, height: 32 }),
            clone: vi.fn(() => toonSampleTexture),
        } as unknown as MmdLikeToonTextureTarget & BaseTexture;
        registerPbrPresetMaterial(material, material.ambientColor);
        registerPbrPresetTransparencyBaseline(material);
        registerPbrPresetToonTexture(material, toonTexture);

        expect(applyPbrMaterialShaderPreset(material, "pbr-mmd-like")).toBe(true);
        expect(material.subSurface.isScatteringEnabled).toBe(false);
        expect(material.subSurface.isRefractionEnabled).toBe(false);
        expect(material.subSurface.isTranslucencyEnabled).toBe(true);
        expect(material.subSurface.translucencyIntensity).toBe(
            PBR_MMD_LIKE_TRANSLUCENCY_INTENSITY,
        );
        expect(material.subSurface.translucencyColor?.equals(Color3.White())).toBe(true);
        expect(material.subSurface.translucencyColorTexture).toBe(toonSampleTexture);
        expect(material.subSurface.useAlbedoToTintTranslucency).toBe(true);
        expect(material.environmentIntensity).toBe(PBR_MMD_LIKE_ENVIRONMENT_INTENSITY);

        // Freeze every material UV at the center of the toon texture's
        // left-bottom pixel. The original PMX toon texture remains unchanged.
        expect(toonSampleTexture.uScale).toBe(0);
        expect(toonSampleTexture.vScale).toBe(0);
        expect(toonSampleTexture.uOffset).toBeCloseTo(0.5 / 256);
        expect(toonSampleTexture.vOffset).toBeCloseTo(0.5 / 32);
        expect(toonTexture.uScale).toBe(1);
        expect(toonTexture.vScale).toBe(1);
        expect(toonTexture.uOffset).toBe(0);
        expect(toonTexture.vOffset).toBe(0);
    });

    it("falls back to the PMX ambient shadow color when no toon texture exists", () => {
        const material = createMaterial();
        registerPbrPresetMaterial(material, material.ambientColor);

        expect(applyPbrMaterialShaderPreset(material, "pbr-mmd-like")).toBe(true);
        expect(material.subSurface.translucencyColorTexture).toBeNull();
        expect(material.subSurface.translucencyColor?.equals(
            material.ambientColor,
        )).toBe(true);
        expect(material.subSurface.translucencyIntensity).toBe(
            PBR_MMD_LIKE_TRANSLUCENCY_INTENSITY,
        );
    });

    it("uses opaque translucency without screen-space scattering for PBR Skin", () => {
        const material = createMaterial();
        registerPbrPresetMaterial(material, material.ambientColor);
        registerPbrPresetTransparencyBaseline(material);

        expect(applyPbrMaterialShaderPreset(material, "pbr-skin")).toBe(true);
        expect(getPbrMaterialShaderPreset(material)).toBe("pbr-skin");
        expect(material.getScene().enableSubSurfaceForPrePass).not.toHaveBeenCalled();
        expect(material.getScene().subSurfaceConfiguration.enabled).toBe(false);
        expect(material.subSurface.isScatteringEnabled).toBe(false);
        expect(material.subSurface.isRefractionEnabled).toBe(false);
        expect(material.subSurface.refractionIntensity).toBe(0);
        expect(material.subSurface.linkRefractionWithTransparency).toBe(false);
        expect(material.subSurface.isTranslucencyEnabled).toBe(true);
        expect(material.subSurface.translucencyIntensity).toBe(
            PBR_SKIN_TRANSLUCENCY_INTENSITY,
        );
        expect(material.subSurface.translucencyColor?.equals(
            new Color3(...PBR_SKIN_TRANSLUCENCY_COLOR_RGB),
        )).toBe(true);
        expect(material.subSurface.translucencyColorTexture).toBeNull();
        expect(material.subSurface.useAlbedoToTintTranslucency).toBe(true);
        expect(material.subSurface.minimumThickness).toBe(PBR_SKIN_MINIMUM_THICKNESS);
        expect(material.subSurface.maximumThickness).toBe(PBR_SKIN_MAXIMUM_THICKNESS);
        expect(material.subSurface.legacyTranslucency).toBe(false);
        expect(material.subSurface.scatteringDiffusionProfile).toBeNull();

        // Skin does not rewrite opacity, enable refraction, or compensate with
        // emissive/custom lighting. Standard surface values remain intact.
        expect(material.alpha).toBe(1);
        expect(material.transparencyMode).toBe(Material.MATERIAL_ALPHABLEND);
        expect(material.useAlphaFromAlbedoTexture).toBe(true);
        expect(material.forceDepthWrite).toBe(true);
        expect(material.alphaCutOff).toBe(0.4);
        expect(material.roughness).toBe(0.35);
        expect(material.specularIntensity).toBe(1);
        expect(material.environmentIntensity).toBe(PBR_SKIN_ENVIRONMENT_INTENSITY);
        expect(material.reflectionColor.equals(Color3.White())).toBe(true);
    });

    it("configures Babylon PBRMaterial without requiring a scene prepass", () => {
        const engine = new NullEngine();
        (engine.getCaps() as { drawBuffersExtension: boolean }).drawBuffersExtension = true;
        const scene = new Scene(engine);
        const material = new PBRMaterial("skin", scene);
        try {
            registerPbrPresetMaterial(material, Color3.Black());
            const prePassBefore = scene.prePassRenderer;
            const subSurfaceConfigurationBefore = scene.subSurfaceConfiguration;

            expect(applyPbrMaterialShaderPreset(material, "pbr-skin")).toBe(true);
            expect(scene.prePassRenderer).toBe(prePassBefore);
            expect(scene.subSurfaceConfiguration).toBe(subSurfaceConfigurationBefore);
            expect(scene.subSurfaceConfiguration?.enabled ?? false).toBe(false);
            expect(material.subSurface.isScatteringEnabled).toBe(false);
            expect(material.subSurface.isRefractionEnabled).toBe(false);
            expect(material.subSurface.isTranslucencyEnabled).toBe(true);
            expect(material.subSurface.translucencyIntensity).toBe(
                PBR_SKIN_TRANSLUCENCY_INTENSITY,
            );
            expect(material.subSurface.translucencyColor?.equals(
                new Color3(...PBR_SKIN_TRANSLUCENCY_COLOR_RGB),
            )).toBe(true);
            expect(material.subSurface.useAlbedoToTintTranslucency).toBe(true);
            expect(material.environmentIntensity).toBe(PBR_SKIN_ENVIRONMENT_INTENSITY);
            expect(material.subSurface.minimumThickness).toBe(PBR_SKIN_MINIMUM_THICKNESS);
            expect(material.subSurface.maximumThickness).toBe(PBR_SKIN_MAXIMUM_THICKNESS);
            expect(material.subSurface.legacyTranslucency).toBe(false);
            expect(material.subSurface.scatteringDiffusionProfile).toBeNull();
        } finally {
            material.dispose();
            scene.dispose();
            engine.dispose();
        }
    });

    it("switches assignments without carrying MMD Like or Skin state", () => {
        const material = createMaterial();
        registerPbrPresetMaterial(material, material.ambientColor);
        registerPbrPresetTransparencyBaseline(material);

        expect(applyPbrMaterialShaderPreset(material, "pbr-mmd-like")).toBe(true);
        expect(applyPbrMaterialShaderPreset(material, "pbr-skin")).toBe(true);
        expect(applyPbrMaterialShaderPreset(material, "pbr-base")).toBe(true);

        expect(getPbrMaterialShaderPreset(material)).toBe("pbr-base");
        expect(material.getScene().subSurfaceConfiguration.enabled).toBe(false);
        expectStandardBaseline(material);
    });

    it("does not require Babylon's subsurface prepass", () => {
        const material = createMaterial();
        material.getScene().enableSubSurfaceForPrePass.mockReturnValueOnce(null);
        registerPbrPresetMaterial(material, material.ambientColor);

        expect(applyPbrMaterialShaderPreset(material, "pbr-skin")).toBe(true);
        expect(getPbrMaterialShaderPreset(material)).toBe("pbr-skin");
        expect(material.getScene().enableSubSurfaceForPrePass).not.toHaveBeenCalled();
        expect(material.subSurface.isScatteringEnabled).toBe(false);
        expect(material.subSurface.isTranslucencyEnabled).toBe(true);
    });

    it("restores the Standard baseline after using the PMX toon texture", () => {
        const material = createMaterial();
        const toonSampleTexture = {
            uOffset: 0,
            vOffset: 0,
            uScale: 1,
            vScale: 1,
            wrapU: -1,
            wrapV: -1,
            getSize: () => ({ width: 256, height: 32 }),
        } as MmdLikeToonTextureTarget & BaseTexture;
        const toonTexture = {
            uOffset: 0,
            vOffset: 0,
            uScale: 1,
            vScale: 1,
            wrapU: -1,
            wrapV: -1,
            getSize: () => ({ width: 256, height: 32 }),
            clone: vi.fn(() => toonSampleTexture),
        } as unknown as MmdLikeToonTextureTarget & BaseTexture;
        registerPbrPresetMaterial(material, material.ambientColor);
        registerPbrPresetToonTexture(material, toonTexture);

        expect(applyPbrMaterialShaderPreset(material, "pbr-mmd-like")).toBe(true);
        expect(applyPbrMaterialShaderPreset(material, "pbr-base")).toBe(true);
        expect(toonTexture.wrapU).toBe(-1);
        expect(toonTexture.wrapV).toBe(-1);
        expectStandardBaseline(material);
    });
});
