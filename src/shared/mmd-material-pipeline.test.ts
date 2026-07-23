import { describe, expect, it } from "vitest";
import {
    DEFAULT_MMD_MATERIAL_PIPELINE_PRESET,
    isPbrMaterialPipelinePreset,
    normalizeMmdMaterialPipelinePreset,
    normalizePbrMaterialShaderPreset,
} from "./mmd-material-pipeline";

describe("mmd material pipeline", () => {
    it("keeps MMD Standard as the default", () => {
        expect(normalizeMmdMaterialPipelinePreset(undefined)).toBe(DEFAULT_MMD_MATERIAL_PIPELINE_PRESET);
        expect(normalizeMmdMaterialPipelinePreset("unknown")).toBe(DEFAULT_MMD_MATERIAL_PIPELINE_PRESET);
    });

    it("accepts the experimental PBR Standard preset", () => {
        expect(normalizeMmdMaterialPipelinePreset("pbr-standard")).toBe("pbr-standard");
        expect(isPbrMaterialPipelinePreset("pbr-standard")).toBe(true);
        expect(isPbrMaterialPipelinePreset("mmd-standard")).toBe(false);
    });

    it("normalizes per-material PBR shader presets independently", () => {
        expect(normalizePbrMaterialShaderPreset(undefined)).toBe("pbr-base");
        expect(normalizePbrMaterialShaderPreset("pbr-base")).toBe("pbr-base");
        expect(normalizePbrMaterialShaderPreset("pbr-mmd-like")).toBe("pbr-mmd-like");
        expect(normalizePbrMaterialShaderPreset("pbr-skin")).toBe("pbr-skin");
        expect(normalizePbrMaterialShaderPreset("pbr-skin-face")).toBe("pbr-skin-face");
        expect(normalizePbrMaterialShaderPreset("pbr-no-shadow")).toBe("pbr-no-shadow");
        expect(normalizePbrMaterialShaderPreset("unknown")).toBe("pbr-base");
    });
});
