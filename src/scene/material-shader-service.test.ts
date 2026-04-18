import { describe, expect, it, vi } from "vitest";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import {
    setExternalWgslToonShader,
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
        onMaterialShaderStateChanged: vi.fn(),
        isWebGpuEngine: () => true,
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
});
