import { describe, expect, it, vi } from "vitest";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import {
    setExternalWgslToonShader,
    syncLuminousGlowLayer,
    setWgslMaterialShaderPreset,
} from "./material-shader-service";

function createHost() {
    const material = {
        name: "face",
        disableLighting: false,
        specularPower: 32,
        diffuseColor: new Color3(1, 0.8, 0.8),
        emissiveColor: new Color3(0, 0, 0),
        ambientColor: new Color3(0, 0, 0),
        toonTexture: null,
        ignoreDiffuseWhenToonTextureIsNull: false,
        markAsDirty: vi.fn(),
    };

    return {
        constructor: {
            DEFAULT_WGSL_MATERIAL_SHADER_PRESET: "wgsl-mmd-standard",
            WGSL_MATERIAL_SHADER_PRESETS: [
                { id: "wgsl-mmd-standard", label: "standard" },
                { id: "wgsl-full-shadow", label: "full_shadow" },
            ],
            externalWgslToonFragmentByMaterial: new WeakMap<object, string>(),
            presetWgslToonFragmentByMaterial: new WeakMap<object, string>(),
        },
        material,
        sceneModels: [{
            materials: [{
                key: "0:face",
                material,
            }],
        }],
        materialShaderDefaultsByMaterial: new WeakMap<object, unknown>(),
        materialShaderPresetByMaterial: new WeakMap<object, string>(),
        externalWgslToonShaderPathByMaterial: new WeakMap<object, string>(),
        engine: {
            releaseEffects: vi.fn(),
        },
        defaultRenderingPipeline: {
            glowLayerEnabled: false,
            bloomEnabled: false,
            bloomWeight: 0,
            bloomThreshold: 0,
            bloomKernel: 0,
        },
        luminousGlowLayer: {
            mmdLuminousGlowLayer: true,
            intensity: 0,
            blurKernelSize: 0,
            customEmissiveColorSelector: null,
            customEmissiveTextureSelector: null,
            dispose: vi.fn(),
        },
        postEffectGlowEnabledValue: false,
        postEffectGlowIntensityValue: 0,
        postEffectGlowKernelValue: 20,
        postEffectBloomEnabledValue: false,
        postEffectBloomWeightValue: 1,
        postEffectBloomThresholdValue: 1,
        postEffectBloomKernelValue: 64,
        onMaterialShaderStateChanged: vi.fn(),
        isWebGpuEngine: () => true,
        isMaterialVisible: () => true,
    };
}

describe("material shader preset restore", () => {
    it("keeps preset fragment override when clearing global external wgsl override", () => {
        const host = createHost();

        const applied = setWgslMaterialShaderPreset(host, 0, "0:face", "wgsl-full-shadow");
        expect(applied).toBe(true);

        const presetBefore = host.constructor.presetWgslToonFragmentByMaterial.get(host.material);
        expect(typeof presetBefore).toBe("string");
        expect(presetBefore?.length ?? 0).toBeGreaterThan(0);

        setExternalWgslToonShader(host, null, null);

        expect(host.externalWgslToonShaderPathByMaterial.get(host.material)).toBeUndefined();
        expect(host.constructor.externalWgslToonFragmentByMaterial.get(host.material)).toBeUndefined();
        expect(host.constructor.presetWgslToonFragmentByMaterial.get(host.material)).toBe(presetBefore);
    });

    it("configures LuminousGlow selector from shininess and diffuse/ambient colors", () => {
        const host = createHost();
        const fakeTexture = { name: "diffuse" };
        host.material.specularPower = 120;
        host.material.specularColor = new Color3(0, 0, 0);
        host.material.diffuseColor = new Color3(0.8, 0.2, 0.1);
        host.material.ambientColor = new Color3(0.1, 0.05, 0.2);
        host.material.diffuseTexture = fakeTexture;
        host.postEffectGlowEnabledValue = true;
        host.postEffectGlowIntensityValue = 1.4;

        syncLuminousGlowLayer(host);

        expect(host.defaultRenderingPipeline.glowLayerEnabled).toBe(false);
        expect(host.luminousGlowLayer.intensity).toBe(1.4);

        const result = {
            values: [0, 0, 0, 0],
            set(r: number, g: number, b: number, a: number) {
                this.values = [r, g, b, a];
            },
        };
        host.luminousGlowLayer.customEmissiveColorSelector(null, null, host.material, result);

        expect(result.values[0]).toBeGreaterThan(0.8);
        expect(result.values[1]).toBeGreaterThan(0.2);
        expect(result.values[2]).toBeGreaterThan(0.2);
        expect(result.values[3]).toBeGreaterThan(0);
        expect(host.luminousGlowLayer.customEmissiveTextureSelector(null, null, host.material)).toBe(fakeTexture);
    });

    it("keeps an opaque black occluder pass when shininess is below the AutoLuminous threshold", () => {
        const host = createHost();
        const fakeTexture = { name: "diffuse" };
        host.material.specularPower = 99;
        host.material.specularColor = new Color3(0, 0, 0);
        host.material.diffuseColor = new Color3(1, 1, 1);
        host.material.ambientColor = new Color3(0.2, 0.2, 0.2);
        host.material.alpha = 0.8;
        host.material.diffuseTexture = fakeTexture;
        host.postEffectGlowEnabledValue = true;
        host.postEffectGlowIntensityValue = 1;

        syncLuminousGlowLayer(host);

        const result = {
            values: [1, 1, 1, 1],
            set(r: number, g: number, b: number, a: number) {
                this.values = [r, g, b, a];
            },
        };
        host.luminousGlowLayer.customEmissiveColorSelector(null, null, host.material, result);

        expect(result.values).toEqual([0, 0, 0, 1]);
        expect(host.luminousGlowLayer.customEmissiveTextureSelector(null, null, host.material)).toBe(fakeTexture);
    });

    it("keeps ordinary shiny materials as occluders when specular color is not dark", () => {
        const host = createHost();
        host.material.specularPower = 120;
        host.material.specularColor = new Color3(0.2, 0.2, 0.2);
        host.material.diffuseColor = new Color3(1, 1, 1);
        host.material.ambientColor = new Color3(0, 0, 0);
        host.postEffectGlowEnabledValue = true;
        host.postEffectGlowIntensityValue = 1;

        syncLuminousGlowLayer(host);

        const result = {
            values: [1, 1, 1, 1],
            set(r: number, g: number, b: number, a: number) {
                this.values = [r, g, b, a];
            },
        };
        host.luminousGlowLayer.customEmissiveColorSelector(null, null, host.material, result);

        expect(result.values[0]).toBe(0);
        expect(result.values[1]).toBe(0);
        expect(result.values[2]).toBe(0);
        expect(result.values[3]).toBe(1);
    });
});
