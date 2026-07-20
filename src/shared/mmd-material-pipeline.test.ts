import { describe, expect, it } from "vitest";
import {
    DEFAULT_MMD_MATERIAL_PIPELINE_PRESET,
    DEFAULT_PBR_MATERIAL_PRESET,
    isPbrMaterialPipelinePreset,
    normalizeMmdMaterialPipelinePreset,
    normalizePbrMaterialPreset,
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

    it("normalizes the independently selected PBR preset", () => {
        expect(normalizePbrMaterialPreset(undefined)).toBe(DEFAULT_PBR_MATERIAL_PRESET);
        expect(normalizePbrMaterialPreset("pbr-standard")).toBe("pbr-standard");
        expect(normalizePbrMaterialPreset("pbr-mmd-like")).toBe("pbr-mmd-like");
        expect(normalizePbrMaterialPreset("pbr-skin")).toBe(DEFAULT_PBR_MATERIAL_PRESET);
        expect(normalizePbrMaterialPreset("unknown")).toBe(DEFAULT_PBR_MATERIAL_PRESET);
    });

    it("normalizes per-material PBR shader presets independently", () => {
        expect(normalizePbrMaterialShaderPreset(undefined)).toBe("pbr-base");
        expect(normalizePbrMaterialShaderPreset("pbr-base")).toBe("pbr-base");
        expect(normalizePbrMaterialShaderPreset("pbr-skin")).toBe("pbr-skin");
        expect(normalizePbrMaterialShaderPreset("unknown")).toBe("pbr-base");
    });
});
