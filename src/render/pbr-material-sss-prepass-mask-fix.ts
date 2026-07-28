import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import "@babylonjs/core/Shaders/pbr.vertex";
import "@babylonjs/core/Shaders/pbr.fragment";
import "@babylonjs/core/ShadersWGSL/pbr.vertex";
import "@babylonjs/core/ShadersWGSL/pbr.fragment";
import "@babylonjs/core/Shaders/ShadersInclude/pbrBlockPrePass";
import "@babylonjs/core/ShadersWGSL/ShadersInclude/pbrBlockPrePass";

const GLSL_MARKER =
    "writeGeometryInfo*scatteringDiffusionProfile/255.";
const GLSL_REPLACEMENT =
    "(writeGeometryInfo>0.0 ? scatteringDiffusionProfile/255. : 1.0)";

const WGSL_SCATTERING_MARKER =
    "writeGeometryInfo*uniforms.scatteringDiffusionProfile/255.";
const WGSL_SCATTERING_REPLACEMENT =
    "select(1.0,uniforms.scatteringDiffusionProfile/255.,writeGeometryInfo>0.0)";
const WGSL_NON_SCATTERING_MARKER =
    "vec4f(clamp(irradiance,vec3f(0.),vec3f(1.)),writeGeometryInfo);";
const WGSL_NON_SCATTERING_REPLACEMENT =
    "vec4f(clamp(irradiance,vec3f(0.),vec3f(1.)),1.0);";

export type PbrMaterialSssPrePassMaskPatchDiagnostics = {
    glslVertexShaderPresent: boolean;
    glslFragmentShaderPresent: boolean;
    wgslVertexShaderPresent: boolean;
    wgslFragmentShaderPresent: boolean;
    glslSourcePresent: boolean;
    glslScatteringMarkerPresent: boolean;
    glslTransparentExclusionPresent: boolean;
    wgslSourcePresent: boolean;
    wgslScatteringMarkerPresent: boolean;
    wgslTransparentExclusionPresent: boolean;
    wgslNonScatteringMarkerPresent: boolean;
    wgslNonScatteringExclusionPresent: boolean;
};

/**
 * Babylon encodes the SSS diffusion-profile index in the legacy irradiance
 * attachment alpha. Its stock PBR prepass writes alpha 0 when finalColor alpha
 * is below ALPHATESTVALUE. The SSS post-process interprets that 0 as diffusion
 * profile 0, so transparent/non-geometry pixels can incorrectly participate in
 * scattering and wash out the entire screen.
 *
 * Alpha 1 is the documented "not an SSS pixel" sentinel used by the
 * post-process. Preserve the actual profile only for visible SSS pixels.
 */
export function injectPbrMaterialSssPrePassMaskExclusion(
    source: string,
    shaderLanguage: "glsl" | "wgsl",
): string {
    if (shaderLanguage === "glsl") {
        if (source.includes(GLSL_REPLACEMENT)) return source;
        if (!source.includes(GLSL_MARKER)) return source;
        return source.replace(GLSL_MARKER, GLSL_REPLACEMENT);
    }

    let patched = source;
    if (
        !patched.includes(WGSL_SCATTERING_REPLACEMENT)
        && patched.includes(WGSL_SCATTERING_MARKER)
    ) {
        patched = patched.replace(
            WGSL_SCATTERING_MARKER,
            WGSL_SCATTERING_REPLACEMENT,
        );
    }
    if (
        !patched.includes(WGSL_NON_SCATTERING_REPLACEMENT)
        && patched.includes(WGSL_NON_SCATTERING_MARKER)
    ) {
        patched = patched.replace(
            WGSL_NON_SCATTERING_MARKER,
            WGSL_NON_SCATTERING_REPLACEMENT,
        );
    }
    return patched;
}

function inspectPatchState(
    source: unknown,
    shaderLanguage: "glsl" | "wgsl",
): Omit<
    PbrMaterialSssPrePassMaskPatchDiagnostics,
    "glslSourcePresent" | "wgslSourcePresent"
> {
    if (shaderLanguage === "glsl") {
        return {
            glslScatteringMarkerPresent:
                typeof source === "string" && source.includes(GLSL_MARKER),
            glslTransparentExclusionPresent:
                typeof source === "string" && source.includes(GLSL_REPLACEMENT),
            wgslScatteringMarkerPresent: false,
            wgslTransparentExclusionPresent: false,
            wgslNonScatteringMarkerPresent: false,
            wgslNonScatteringExclusionPresent: false,
        };
    }
    return {
        glslScatteringMarkerPresent: false,
        glslTransparentExclusionPresent: false,
        wgslScatteringMarkerPresent:
            typeof source === "string"
            && source.includes(WGSL_SCATTERING_MARKER),
        wgslTransparentExclusionPresent:
            typeof source === "string"
            && source.includes(WGSL_SCATTERING_REPLACEMENT),
        wgslNonScatteringMarkerPresent:
            typeof source === "string"
            && source.includes(WGSL_NON_SCATTERING_MARKER),
        wgslNonScatteringExclusionPresent:
            typeof source === "string"
            && source.includes(WGSL_NON_SCATTERING_REPLACEMENT),
    };
}

export function getPbrMaterialSssPrePassMaskPatchDiagnostics():
PbrMaterialSssPrePassMaskPatchDiagnostics {
    const glslSource =
        ShaderStore.IncludesShadersStore.pbrBlockPrePass;
    const wgslSource =
        ShaderStore.IncludesShadersStoreWGSL.pbrBlockPrePass;
    const glsl = inspectPatchState(glslSource, "glsl");
    const wgsl = inspectPatchState(wgslSource, "wgsl");
    return {
        glslVertexShaderPresent:
            typeof ShaderStore.ShadersStore.pbrVertexShader === "string",
        glslFragmentShaderPresent:
            typeof ShaderStore.ShadersStore.pbrPixelShader === "string",
        wgslVertexShaderPresent:
            typeof ShaderStore.ShadersStoreWGSL.pbrVertexShader === "string",
        wgslFragmentShaderPresent:
            typeof ShaderStore.ShadersStoreWGSL.pbrPixelShader === "string",
        glslSourcePresent: typeof glslSource === "string",
        glslScatteringMarkerPresent: glsl.glslScatteringMarkerPresent,
        glslTransparentExclusionPresent:
            glsl.glslTransparentExclusionPresent,
        wgslSourcePresent: typeof wgslSource === "string",
        wgslScatteringMarkerPresent: wgsl.wgslScatteringMarkerPresent,
        wgslTransparentExclusionPresent:
            wgsl.wgslTransparentExclusionPresent,
        wgslNonScatteringMarkerPresent:
            wgsl.wgslNonScatteringMarkerPresent,
        wgslNonScatteringExclusionPresent:
            wgsl.wgslNonScatteringExclusionPresent,
    };
}

function patchPbrMaterialSssPrePassMask(): void {
    const glsl = ShaderStore.IncludesShadersStore.pbrBlockPrePass;
    if (typeof glsl === "string") {
        ShaderStore.IncludesShadersStore.pbrBlockPrePass =
            injectPbrMaterialSssPrePassMaskExclusion(glsl, "glsl");
    }

    const wgsl = ShaderStore.IncludesShadersStoreWGSL.pbrBlockPrePass;
    if (typeof wgsl === "string") {
        ShaderStore.IncludesShadersStoreWGSL.pbrBlockPrePass =
            injectPbrMaterialSssPrePassMaskExclusion(wgsl, "wgsl");
    }
}

patchPbrMaterialSssPrePassMask();
