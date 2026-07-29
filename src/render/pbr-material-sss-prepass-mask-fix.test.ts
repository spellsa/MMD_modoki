import { describe, expect, it } from "vitest";
import {
    getPbrMaterialSssPrePassMaskPatchDiagnostics,
    injectPbrMaterialSssCenterWeightedBlend,
    injectPbrMaterialSssPrePassHdrIrradiance,
    injectPbrMaterialSssPrePassMaskExclusion,
    restorePbrMaterialSssPrePassColorSubtraction,
} from "./pbr-material-sss-prepass-mask-fix";

describe("PBR material SSS prepass mask compatibility", () => {
    it("excludes transparent GLSL SSS pixels instead of selecting profile zero", () => {
        const source =
            "writeGeometryInfo*scatteringDiffusionProfile/255.";
        const patched = injectPbrMaterialSssPrePassMaskExclusion(
            source,
            "glsl",
        );

        expect(patched).toContain(
            "(writeGeometryInfo>0.0 ? scatteringDiffusionProfile/255. : 1.0)",
        );
        expect(injectPbrMaterialSssPrePassMaskExclusion(patched, "glsl"))
            .toBe(patched);
    });

    it("excludes transparent and non-SSS WGSL pixels", () => {
        const source = [
            "writeGeometryInfo*uniforms.scatteringDiffusionProfile/255.",
            "vec4f(clamp(irradiance,vec3f(0.),vec3f(1.)),writeGeometryInfo);",
        ].join("\n");
        const patched = injectPbrMaterialSssPrePassMaskExclusion(
            source,
            "wgsl",
        );

        expect(patched).toContain(
            "select(1.0,uniforms.scatteringDiffusionProfile/255.,writeGeometryInfo>0.0)",
        );
        expect(patched).toContain(
            "vec4f(clamp(irradiance,vec3f(0.),vec3f(1.)),1.0);",
        );
        expect(injectPbrMaterialSssPrePassMaskExclusion(patched, "wgsl"))
            .toBe(patched);
    });

    it("preserves bounded HDR irradiance only for GLSL SSS", () => {
        const source =
            "gl_FragData[PREPASS_IRRADIANCE_LEGACY_INDEX]=vec4(clamp(irradiance,vec3(0.),vec3(1.)),(writeGeometryInfo>0.0 ? scatteringDiffusionProfile/255. : 1.0));";
        const patched = injectPbrMaterialSssPrePassHdrIrradiance(
            source,
            "glsl",
        );

        expect(patched).toContain("#ifdef SS_SCATTERING");
        expect(patched).toContain(
            "clamp(irradiance,vec3(0.),vec3(30.))",
        );
        expect(patched).toContain(
            "clamp(irradiance,vec3(0.),vec3(1.))",
        );
        expect(injectPbrMaterialSssPrePassHdrIrradiance(patched, "glsl"))
            .toBe(patched);
    });

    it("preserves bounded HDR irradiance in the WGSL SSS branch", () => {
        const source =
            "vec4f(clamp(irradiance,vec3f(0.),vec3f(1.)),select(1.0,uniforms.scatteringDiffusionProfile/255.,writeGeometryInfo>0.0));";
        const patched = injectPbrMaterialSssPrePassHdrIrradiance(
            source,
            "wgsl",
        );

        expect(patched).toContain(
            "clamp(irradiance,vec3f(0.),vec3f(30.))",
        );
        expect(injectPbrMaterialSssPrePassHdrIrradiance(patched, "wgsl"))
            .toBe(patched);
    });

    it("restores GLSL irradiance subtraction after the abandoned experiment", () => {
        const source =
            "gl_FragData[PREPASS_COLOR_INDEX]=vec4(finalColor.rgb,finalColor.a);";
        const patched = restorePbrMaterialSssPrePassColorSubtraction(
            source,
            "glsl",
        );

        expect(patched).toContain(
            "vec4(finalColor.rgb-irradiance,finalColor.a)",
        );
        expect(restorePbrMaterialSssPrePassColorSubtraction(
            patched,
            "glsl",
        ))
            .toBe(patched);
    });

    it("restores WGSL irradiance subtraction after the abandoned experiment", () => {
        const source =
            "fragData[PREPASS_COLOR_INDEX]=vec4f(finalColor.rgb,finalColor.a);";
        const patched = restorePbrMaterialSssPrePassColorSubtraction(
            source,
            "wgsl",
        );

        expect(patched).toContain(
            "vec4f(finalColor.rgb-irradiance,finalColor.a)",
        );
        expect(restorePbrMaterialSssPrePassColorSubtraction(
            patched,
            "wgsl",
        ))
            .toBe(patched);
    });

    it("restores the restrained GLSL center blend after the delta experiment", () => {
        const source = [
            "gl_FragColor=vec4(inputColor.rgb,1.0);",
            "vec3 unscatteredIrradiance=max(centerIrradiance,vec3(0.0));",
            "vec3 scatteredIrradiance=max(totalIrradiance/totalWeight,vec3(0.0));",
            "vec3 scatteringDelta=max(scatteredIrradiance-unscatteredIrradiance,vec3(0.0))*0.15;",
            "gl_FragColor=vec4(inputColor.rgb+albedo*scatteringDelta,1.);",
        ].join("");
        const patched = injectPbrMaterialSssCenterWeightedBlend(
            source,
            "glsl",
        );

        expect(patched).toContain(
            "gl_FragColor=vec4(inputColor.rgb+albedo*centerIrradiance,1.0)",
        );
        expect(patched).toContain(
            "mix(unscatteredIrradiance,scatteredIrradiance,0.15)",
        );
        expect(patched).toContain(
            "inputColor.rgb+albedo*composedIrradiance",
        );
        expect(injectPbrMaterialSssCenterWeightedBlend(patched, "glsl"))
            .toBe(patched);
    });

    it("restores the restrained WGSL center blend after the delta experiment", () => {
        const source = [
            "fragmentOutputs.color=vec4f(inputColor.rgb,1.0);",
            "let unscatteredIrradiance=max(centerIrradiance,vec3f(0.0));",
            "let scatteredIrradiance=max(totalIrradiance/totalWeight,vec3f(0.0));",
            "let scatteringDelta=max(scatteredIrradiance-unscatteredIrradiance,vec3f(0.0))*0.15;",
            "fragmentOutputs.color=vec4f(inputColor.rgb+albedo*scatteringDelta,1.);",
        ].join("");
        const patched = injectPbrMaterialSssCenterWeightedBlend(
            source,
            "wgsl",
        );

        expect(patched).toContain(
            "fragmentOutputs.color=vec4f(inputColor.rgb+albedo*centerIrradiance,1.0)",
        );
        expect(patched).toContain(
            "mix(unscatteredIrradiance,scatteredIrradiance,0.15)",
        );
        expect(patched).toContain(
            "inputColor.rgb+albedo*composedIrradiance",
        );
        expect(injectPbrMaterialSssCenterWeightedBlend(patched, "wgsl"))
            .toBe(patched);
    });

    it("patches the installed Babylon PBR prepass includes", () => {
        expect(getPbrMaterialSssPrePassMaskPatchDiagnostics()).toEqual({
            glslVertexShaderPresent: true,
            glslFragmentShaderPresent: true,
            wgslVertexShaderPresent: true,
            wgslFragmentShaderPresent: true,
            glslSourcePresent: true,
            glslScatteringMarkerPresent: false,
            glslTransparentExclusionPresent: true,
            glslHdrIrradiancePresent: true,
            wgslSourcePresent: true,
            wgslScatteringMarkerPresent: false,
            wgslTransparentExclusionPresent: true,
            wgslHdrIrradiancePresent: true,
            wgslNonScatteringMarkerPresent: false,
            wgslNonScatteringExclusionPresent: true,
            glslSssCompositionSourcePresent: true,
            glslPrePassColorSubtractionPresent: true,
            glslSssCenterBlendPresent: true,
            wgslSssCompositionSourcePresent: true,
            wgslPrePassColorSubtractionPresent: true,
            wgslSssCenterBlendPresent: true,
        });
    });
});
