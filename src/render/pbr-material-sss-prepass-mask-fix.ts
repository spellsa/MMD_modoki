import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import "@babylonjs/core/Shaders/pbr.vertex";
import "@babylonjs/core/Shaders/pbr.fragment";
import "@babylonjs/core/ShadersWGSL/pbr.vertex";
import "@babylonjs/core/ShadersWGSL/pbr.fragment";
import "@babylonjs/core/Shaders/subSurfaceScattering.fragment";
import "@babylonjs/core/ShadersWGSL/subSurfaceScattering.fragment";
import "@babylonjs/core/Shaders/ShadersInclude/pbrBlockPrePass";
import "@babylonjs/core/ShadersWGSL/ShadersInclude/pbrBlockPrePass";

export const PBR_MATERIAL_SSS_SCATTERING_BLEND_STRENGTH = 0.15;

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
const GLSL_HDR_IRRADIANCE_MARKER =
    "gl_FragData[PREPASS_IRRADIANCE_LEGACY_INDEX]=vec4(clamp(irradiance,vec3(0.),vec3(1.)),(writeGeometryInfo>0.0 ? scatteringDiffusionProfile/255. : 1.0));";
const GLSL_HDR_IRRADIANCE_REPLACEMENT = [
    "#ifdef SS_SCATTERING",
    "gl_FragData[PREPASS_IRRADIANCE_LEGACY_INDEX]=vec4(clamp(irradiance,vec3(0.),vec3(30.)),(writeGeometryInfo>0.0 ? scatteringDiffusionProfile/255. : 1.0));",
    "#else",
    GLSL_HDR_IRRADIANCE_MARKER,
    "#endif",
].join("\n");
const WGSL_HDR_IRRADIANCE_MARKER =
    "vec4f(clamp(irradiance,vec3f(0.),vec3f(1.)),select(1.0,uniforms.scatteringDiffusionProfile/255.,writeGeometryInfo>0.0));";
const WGSL_HDR_IRRADIANCE_REPLACEMENT =
    "vec4f(clamp(irradiance,vec3f(0.),vec3f(30.)),select(1.0,uniforms.scatteringDiffusionProfile/255.,writeGeometryInfo>0.0));";
const GLSL_PREPASS_COLOR_SUBTRACTION_MARKER =
    "gl_FragData[PREPASS_COLOR_INDEX]=vec4(finalColor.rgb-irradiance,finalColor.a);";
const GLSL_PREPASS_COLOR_PRESERVATION =
    "gl_FragData[PREPASS_COLOR_INDEX]=vec4(finalColor.rgb,finalColor.a);";
const WGSL_PREPASS_COLOR_SUBTRACTION_MARKER =
    "fragData[PREPASS_COLOR_INDEX]=vec4f(finalColor.rgb-irradiance,finalColor.a);";
const WGSL_PREPASS_COLOR_PRESERVATION =
    "fragData[PREPASS_COLOR_INDEX]=vec4f(finalColor.rgb,finalColor.a);";
const GLSL_SSS_FALLBACK_MARKER =
    "gl_FragColor=vec4(inputColor.rgb+albedo*centerIrradiance,1.0);";
const GLSL_SSS_FALLBACK_REPLACEMENT =
    "gl_FragColor=vec4(inputColor.rgb,1.0);";
const WGSL_SSS_FALLBACK_MARKER =
    "fragmentOutputs.color=vec4f(inputColor.rgb+albedo*centerIrradiance,1.0);";
const WGSL_SSS_FALLBACK_REPLACEMENT =
    "fragmentOutputs.color=vec4f(inputColor.rgb,1.0);";
const GLSL_SSS_COMPOSITION_MARKER =
    "gl_FragColor=vec4(inputColor.rgb+albedo*max(totalIrradiance/totalWeight,vec3(0.0)),1.);";
const GLSL_SSS_CENTER_BLEND_REPLACEMENT = [
    "vec3 unscatteredIrradiance=max(centerIrradiance,vec3(0.0));",
    "vec3 scatteredIrradiance=max(totalIrradiance/totalWeight,vec3(0.0));",
    `vec3 composedIrradiance=mix(unscatteredIrradiance,scatteredIrradiance,${PBR_MATERIAL_SSS_SCATTERING_BLEND_STRENGTH.toFixed(2)});`,
    "gl_FragColor=vec4(inputColor.rgb+albedo*composedIrradiance,1.);",
].join("");
const GLSL_SSS_DELTA_COMPOSITION_REPLACEMENT = [
    "vec3 unscatteredIrradiance=max(centerIrradiance,vec3(0.0));",
    "vec3 scatteredIrradiance=max(totalIrradiance/totalWeight,vec3(0.0));",
    `vec3 scatteringDelta=max(scatteredIrradiance-unscatteredIrradiance,vec3(0.0))*${PBR_MATERIAL_SSS_SCATTERING_BLEND_STRENGTH.toFixed(2)};`,
    "gl_FragColor=vec4(inputColor.rgb+albedo*scatteringDelta,1.);",
].join("");
const WGSL_SSS_COMPOSITION_MARKER =
    "fragmentOutputs.color=vec4f(inputColor.rgb+albedo*max(totalIrradiance/totalWeight,vec3f(0.0)),1.);";
const WGSL_SSS_CENTER_BLEND_REPLACEMENT = [
    "let unscatteredIrradiance=max(centerIrradiance,vec3f(0.0));",
    "let scatteredIrradiance=max(totalIrradiance/totalWeight,vec3f(0.0));",
    `let composedIrradiance=mix(unscatteredIrradiance,scatteredIrradiance,${PBR_MATERIAL_SSS_SCATTERING_BLEND_STRENGTH.toFixed(2)});`,
    "fragmentOutputs.color=vec4f(inputColor.rgb+albedo*composedIrradiance,1.);",
].join("");
const WGSL_SSS_DELTA_COMPOSITION_REPLACEMENT = [
    "let unscatteredIrradiance=max(centerIrradiance,vec3f(0.0));",
    "let scatteredIrradiance=max(totalIrradiance/totalWeight,vec3f(0.0));",
    `let scatteringDelta=max(scatteredIrradiance-unscatteredIrradiance,vec3f(0.0))*${PBR_MATERIAL_SSS_SCATTERING_BLEND_STRENGTH.toFixed(2)};`,
    "fragmentOutputs.color=vec4f(inputColor.rgb+albedo*scatteringDelta,1.);",
].join("");

export type PbrMaterialSssPrePassMaskPatchDiagnostics = {
    glslVertexShaderPresent: boolean;
    glslFragmentShaderPresent: boolean;
    wgslVertexShaderPresent: boolean;
    wgslFragmentShaderPresent: boolean;
    glslSourcePresent: boolean;
    glslScatteringMarkerPresent: boolean;
    glslTransparentExclusionPresent: boolean;
    glslHdrIrradiancePresent: boolean;
    wgslSourcePresent: boolean;
    wgslScatteringMarkerPresent: boolean;
    wgslTransparentExclusionPresent: boolean;
    wgslHdrIrradiancePresent: boolean;
    wgslNonScatteringMarkerPresent: boolean;
    wgslNonScatteringExclusionPresent: boolean;
    glslSssCompositionSourcePresent: boolean;
    glslPrePassColorSubtractionPresent: boolean;
    glslSssCenterBlendPresent: boolean;
    wgslSssCompositionSourcePresent: boolean;
    wgslPrePassColorSubtractionPresent: boolean;
    wgslSssCenterBlendPresent: boolean;
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

/**
 * Babylon's legacy SSS prepass clamps irradiance to 0..1 before the
 * screen-space scattering pass. With HDR directional or environment lighting,
 * the base color has already had the unclamped irradiance removed, so losing
 * the value above 1 here can make SSS materials much darker than PBR Standard.
 *
 * Keep the stock 0..1 range for non-SSS materials and retain a bounded HDR
 * range only for SS_SCATTERING. The upper bound protects the half-float
 * prepass from pathological values while preserving normal HDR highlights.
 */
export function injectPbrMaterialSssPrePassHdrIrradiance(
    source: string,
    shaderLanguage: "glsl" | "wgsl",
): string {
    if (shaderLanguage === "glsl") {
        if (source.includes(GLSL_HDR_IRRADIANCE_REPLACEMENT)) return source;
        if (!source.includes(GLSL_HDR_IRRADIANCE_MARKER)) return source;
        return source.replace(
            GLSL_HDR_IRRADIANCE_MARKER,
            GLSL_HDR_IRRADIANCE_REPLACEMENT,
        );
    }

    if (source.includes(WGSL_HDR_IRRADIANCE_REPLACEMENT)) return source;
    if (!source.includes(WGSL_HDR_IRRADIANCE_MARKER)) return source;
    return source.replace(
        WGSL_HDR_IRRADIANCE_MARKER,
        WGSL_HDR_IRRADIANCE_REPLACEMENT,
    );
}

/**
 * Restore Babylon's stock SSS prepass contract. The SSS post-process expects
 * PREPASS_COLOR to contain the base color with irradiance removed and rebuilds
 * that component after filtering. Preserving finalColor here exposed the
 * intermediate-looking dark layer on real PMX materials.
 */
export function restorePbrMaterialSssPrePassColorSubtraction(
    source: string,
    shaderLanguage: "glsl" | "wgsl",
): string {
    if (shaderLanguage === "glsl") {
        if (source.includes(GLSL_PREPASS_COLOR_SUBTRACTION_MARKER)) return source;
        if (!source.includes(GLSL_PREPASS_COLOR_PRESERVATION)) return source;
        return source.replace(
            GLSL_PREPASS_COLOR_PRESERVATION,
            GLSL_PREPASS_COLOR_SUBTRACTION_MARKER,
        );
    }

    if (source.includes(WGSL_PREPASS_COLOR_SUBTRACTION_MARKER)) return source;
    if (!source.includes(WGSL_PREPASS_COLOR_PRESERVATION)) return source;
    return source.replace(
        WGSL_PREPASS_COLOR_PRESERVATION,
        WGSL_PREPASS_COLOR_SUBTRACTION_MARKER,
    );
}

/**
 * Keep most of the unfiltered irradiance while mixing in a restrained amount
 * of Babylon's spatially filtered irradiance. This preserves the stock
 * prepass/reconstruction contract and avoids the much darker intermediate
 * layer produced by the abandoned base-preserving delta experiment.
 *
 * The patch is intentionally global because Babylon's SSS post-process is
 * scene-wide rather than material-local.
 */
export function injectPbrMaterialSssCenterWeightedBlend(
    source: string,
    shaderLanguage: "glsl" | "wgsl",
): string {
    if (shaderLanguage === "glsl") {
        let patched = source;
        if (patched.includes(GLSL_SSS_FALLBACK_REPLACEMENT)) {
            patched = patched.replace(
                GLSL_SSS_FALLBACK_REPLACEMENT,
                GLSL_SSS_FALLBACK_MARKER,
            );
        }
        if (patched.includes(GLSL_SSS_CENTER_BLEND_REPLACEMENT)) {
            return patched;
        }
        if (patched.includes(GLSL_SSS_DELTA_COMPOSITION_REPLACEMENT)) {
            return patched.replace(
                GLSL_SSS_DELTA_COMPOSITION_REPLACEMENT,
                GLSL_SSS_CENTER_BLEND_REPLACEMENT,
            );
        }
        if (!patched.includes(GLSL_SSS_COMPOSITION_MARKER)) return patched;
        return patched.replace(
            GLSL_SSS_COMPOSITION_MARKER,
            GLSL_SSS_CENTER_BLEND_REPLACEMENT,
        );
    }

    let patched = source;
    if (patched.includes(WGSL_SSS_FALLBACK_REPLACEMENT)) {
        patched = patched.replace(
            WGSL_SSS_FALLBACK_REPLACEMENT,
            WGSL_SSS_FALLBACK_MARKER,
        );
    }
    if (patched.includes(WGSL_SSS_CENTER_BLEND_REPLACEMENT)) {
        return patched;
    }
    if (patched.includes(WGSL_SSS_DELTA_COMPOSITION_REPLACEMENT)) {
        return patched.replace(
            WGSL_SSS_DELTA_COMPOSITION_REPLACEMENT,
            WGSL_SSS_CENTER_BLEND_REPLACEMENT,
        );
    }
    if (!patched.includes(WGSL_SSS_COMPOSITION_MARKER)) return patched;
    return patched.replace(
        WGSL_SSS_COMPOSITION_MARKER,
        WGSL_SSS_CENTER_BLEND_REPLACEMENT,
    );
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
            glslHdrIrradiancePresent:
                typeof source === "string"
                && source.includes(GLSL_HDR_IRRADIANCE_REPLACEMENT),
            wgslScatteringMarkerPresent: false,
            wgslTransparentExclusionPresent: false,
            wgslHdrIrradiancePresent: false,
            wgslNonScatteringMarkerPresent: false,
            wgslNonScatteringExclusionPresent: false,
        };
    }
    return {
        glslScatteringMarkerPresent: false,
        glslTransparentExclusionPresent: false,
        glslHdrIrradiancePresent: false,
        wgslScatteringMarkerPresent:
            typeof source === "string"
            && source.includes(WGSL_SCATTERING_MARKER),
        wgslTransparentExclusionPresent:
            typeof source === "string"
            && source.includes(WGSL_SCATTERING_REPLACEMENT),
        wgslHdrIrradiancePresent:
            typeof source === "string"
            && source.includes(WGSL_HDR_IRRADIANCE_REPLACEMENT),
        wgslNonScatteringMarkerPresent:
            typeof source === "string"
            && source.includes(WGSL_NON_SCATTERING_MARKER),
        wgslNonScatteringExclusionPresent:
            typeof source === "string"
            && source.includes(WGSL_NON_SCATTERING_REPLACEMENT),
    };
}

function inspectCompositionPatchState(
    source: unknown,
    shaderLanguage: "glsl" | "wgsl",
): Pick<
    PbrMaterialSssPrePassMaskPatchDiagnostics,
    | "glslSssCompositionSourcePresent"
    | "glslSssCenterBlendPresent"
    | "wgslSssCompositionSourcePresent"
    | "wgslSssCenterBlendPresent"
> {
    if (shaderLanguage === "glsl") {
        return {
            glslSssCompositionSourcePresent: typeof source === "string",
            glslSssCenterBlendPresent:
                typeof source === "string"
                && source.includes(GLSL_SSS_CENTER_BLEND_REPLACEMENT),
            wgslSssCompositionSourcePresent: false,
            wgslSssCenterBlendPresent: false,
        };
    }
    return {
        glslSssCompositionSourcePresent: false,
        glslSssCenterBlendPresent: false,
        wgslSssCompositionSourcePresent: typeof source === "string",
        wgslSssCenterBlendPresent:
            typeof source === "string"
            && source.includes(WGSL_SSS_CENTER_BLEND_REPLACEMENT),
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
    const glslSssCompositionSource =
        ShaderStore.ShadersStore.subSurfaceScatteringPixelShader;
    const wgslSssCompositionSource =
        ShaderStore.ShadersStoreWGSL.subSurfaceScatteringPixelShader;
    const glslComposition = inspectCompositionPatchState(
        glslSssCompositionSource,
        "glsl",
    );
    const wgslComposition = inspectCompositionPatchState(
        wgslSssCompositionSource,
        "wgsl",
    );
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
        glslHdrIrradiancePresent:
            glsl.glslHdrIrradiancePresent,
        wgslSourcePresent: typeof wgslSource === "string",
        wgslScatteringMarkerPresent: wgsl.wgslScatteringMarkerPresent,
        wgslTransparentExclusionPresent:
            wgsl.wgslTransparentExclusionPresent,
        wgslHdrIrradiancePresent:
            wgsl.wgslHdrIrradiancePresent,
        wgslNonScatteringMarkerPresent:
            wgsl.wgslNonScatteringMarkerPresent,
        wgslNonScatteringExclusionPresent:
            wgsl.wgslNonScatteringExclusionPresent,
        glslSssCompositionSourcePresent:
            glslComposition.glslSssCompositionSourcePresent,
        glslPrePassColorSubtractionPresent:
            typeof glslSource === "string"
            && glslSource.includes(GLSL_PREPASS_COLOR_SUBTRACTION_MARKER),
        glslSssCenterBlendPresent:
            glslComposition.glslSssCenterBlendPresent,
        wgslSssCompositionSourcePresent:
            wgslComposition.wgslSssCompositionSourcePresent,
        wgslPrePassColorSubtractionPresent:
            typeof wgslSource === "string"
            && wgslSource.includes(WGSL_PREPASS_COLOR_SUBTRACTION_MARKER),
        wgslSssCenterBlendPresent:
            wgslComposition.wgslSssCenterBlendPresent,
    };
}

function patchPbrMaterialSssCompatibility(): void {
    const glsl = ShaderStore.IncludesShadersStore.pbrBlockPrePass;
    if (typeof glsl === "string") {
        const maskPatched =
            injectPbrMaterialSssPrePassMaskExclusion(glsl, "glsl");
        const hdrPatched =
            injectPbrMaterialSssPrePassHdrIrradiance(maskPatched, "glsl");
        ShaderStore.IncludesShadersStore.pbrBlockPrePass =
            restorePbrMaterialSssPrePassColorSubtraction(
                hdrPatched,
                "glsl",
            );
    }

    const wgsl = ShaderStore.IncludesShadersStoreWGSL.pbrBlockPrePass;
    if (typeof wgsl === "string") {
        const maskPatched =
            injectPbrMaterialSssPrePassMaskExclusion(wgsl, "wgsl");
        const hdrPatched =
            injectPbrMaterialSssPrePassHdrIrradiance(maskPatched, "wgsl");
        ShaderStore.IncludesShadersStoreWGSL.pbrBlockPrePass =
            restorePbrMaterialSssPrePassColorSubtraction(
                hdrPatched,
                "wgsl",
            );
    }

    const glslComposition =
        ShaderStore.ShadersStore.subSurfaceScatteringPixelShader;
    if (typeof glslComposition === "string") {
        ShaderStore.ShadersStore.subSurfaceScatteringPixelShader =
            injectPbrMaterialSssCenterWeightedBlend(
                glslComposition,
                "glsl",
            );
    }

    const wgslComposition =
        ShaderStore.ShadersStoreWGSL.subSurfaceScatteringPixelShader;
    if (typeof wgslComposition === "string") {
        ShaderStore.ShadersStoreWGSL.subSurfaceScatteringPixelShader =
            injectPbrMaterialSssCenterWeightedBlend(
                wgslComposition,
                "wgsl",
            );
    }
}

patchPbrMaterialSssCompatibility();
