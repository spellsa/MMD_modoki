export const MMD_MATERIAL_PIPELINE_PRESETS = [
    "mmd-standard",
    "pbr-standard",
] as const;

export type MmdMaterialPipelinePreset = typeof MMD_MATERIAL_PIPELINE_PRESETS[number];

export const DEFAULT_MMD_MATERIAL_PIPELINE_PRESET: MmdMaterialPipelinePreset = "mmd-standard";

export const PBR_MATERIAL_SHADER_PRESETS = [
    "pbr-base",
    "pbr-mmd-like",
    "pbr-skin",
    "pbr-skin-face",
    "pbr-no-shadow",
] as const;

export type PbrMaterialShaderPreset = typeof PBR_MATERIAL_SHADER_PRESETS[number];

export const DEFAULT_PBR_MATERIAL_SHADER_PRESET: PbrMaterialShaderPreset = "pbr-base";

export function normalizeMmdMaterialPipelinePreset(value: unknown): MmdMaterialPipelinePreset {
    return value === "pbr-standard" ? value : DEFAULT_MMD_MATERIAL_PIPELINE_PRESET;
}

export function isPbrMaterialPipelinePreset(value: unknown): boolean {
    return normalizeMmdMaterialPipelinePreset(value) === "pbr-standard";
}

export function normalizePbrMaterialShaderPreset(value: unknown): PbrMaterialShaderPreset {
    switch (value) {
        case "pbr-mmd-like":
        case "pbr-skin":
        case "pbr-skin-face":
        case "pbr-no-shadow":
            return value;
        case "pbr-base":
        default:
            return DEFAULT_PBR_MATERIAL_SHADER_PRESET;
    }
}
