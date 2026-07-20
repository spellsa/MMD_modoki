export const MMD_MATERIAL_PIPELINE_PRESETS = [
    "mmd-standard",
    "pbr-standard",
] as const;

export type MmdMaterialPipelinePreset = typeof MMD_MATERIAL_PIPELINE_PRESETS[number];

export const DEFAULT_MMD_MATERIAL_PIPELINE_PRESET: MmdMaterialPipelinePreset = "mmd-standard";

export const PBR_MATERIAL_PRESETS = [
    "pbr-standard",
    "pbr-mmd-like",
] as const;

export type PbrMaterialPreset = typeof PBR_MATERIAL_PRESETS[number];

export const DEFAULT_PBR_MATERIAL_PRESET: PbrMaterialPreset = "pbr-standard";

export const PBR_MATERIAL_SHADER_PRESETS = [
    "pbr-base",
    "pbr-skin",
] as const;

export type PbrMaterialShaderPreset = typeof PBR_MATERIAL_SHADER_PRESETS[number];

export const DEFAULT_PBR_MATERIAL_SHADER_PRESET: PbrMaterialShaderPreset = "pbr-base";

export function normalizeMmdMaterialPipelinePreset(value: unknown): MmdMaterialPipelinePreset {
    return value === "pbr-standard" ? value : DEFAULT_MMD_MATERIAL_PIPELINE_PRESET;
}

export function isPbrMaterialPipelinePreset(value: unknown): boolean {
    return normalizeMmdMaterialPipelinePreset(value) === "pbr-standard";
}

export function normalizePbrMaterialPreset(value: unknown): PbrMaterialPreset {
    switch (value) {
        case "pbr-mmd-like":
            return value;
        case "pbr-standard":
        default:
            return DEFAULT_PBR_MATERIAL_PRESET;
    }
}

export function normalizePbrMaterialShaderPreset(value: unknown): PbrMaterialShaderPreset {
    return value === "pbr-skin" ? value : DEFAULT_PBR_MATERIAL_SHADER_PRESET;
}
