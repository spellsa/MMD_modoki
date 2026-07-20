import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import "@babylonjs/core/Shaders/default.fragment";
import "@babylonjs/core/ShadersWGSL/default.fragment";

const GLSL_MARKER = "float writeGeometryInfo=color.a>0.4 ? 1.0 : 0.0;";
const GLSL_SENTINEL = `
#ifdef PREPASS_IRRADIANCE_LEGACY
gl_FragData[PREPASS_IRRADIANCE_LEGACY_INDEX]=vec4(0.0,0.0,0.0,1.0);
#endif`;

const WGSL_MARKER =
    "var writeGeometryInfo: f32=select(0.0,1.0,color.a>0.4);var fragData: array<vec4<f32>,SCENE_MRT_COUNT>;";
const WGSL_SENTINEL = `
#ifdef PREPASS_IRRADIANCE_LEGACY
fragData[PREPASS_IRRADIANCE_LEGACY_INDEX]=vec4f(0.0,0.0,0.0,1.0);
#endif`;

export function injectStandardMaterialSssExclusion(
    source: string,
    shaderLanguage: "glsl" | "wgsl",
): string {
    const sentinel = shaderLanguage === "wgsl" ? WGSL_SENTINEL : GLSL_SENTINEL;
    if (source.includes(sentinel.trim())) return source;

    const marker = shaderLanguage === "wgsl" ? WGSL_MARKER : GLSL_MARKER;
    if (!source.includes(marker)) return source;
    return source.replace(marker, `${marker}${sentinel}`);
}

function patchStandardMaterialSssPrePassShaders(): void {
    const glsl = ShaderStore.ShadersStore.defaultPixelShader;
    if (typeof glsl === "string") {
        ShaderStore.ShadersStore.defaultPixelShader =
            injectStandardMaterialSssExclusion(glsl, "glsl");
    }

    const wgsl = ShaderStore.ShadersStoreWGSL.defaultPixelShader;
    if (typeof wgsl === "string") {
        ShaderStore.ShadersStoreWGSL.defaultPixelShader =
            injectStandardMaterialSssExclusion(wgsl, "wgsl");
    }
}

patchStandardMaterialSssPrePassShaders();
