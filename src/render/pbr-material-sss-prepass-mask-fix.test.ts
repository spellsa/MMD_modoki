import { describe, expect, it } from "vitest";
import {
    getPbrMaterialSssPrePassMaskPatchDiagnostics,
    injectPbrMaterialSssPrePassMaskExclusion,
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

    it("patches the installed Babylon PBR prepass includes", () => {
        expect(getPbrMaterialSssPrePassMaskPatchDiagnostics()).toEqual({
            glslVertexShaderPresent: true,
            glslFragmentShaderPresent: true,
            wgslVertexShaderPresent: true,
            wgslFragmentShaderPresent: true,
            glslSourcePresent: true,
            glslScatteringMarkerPresent: false,
            glslTransparentExclusionPresent: true,
            wgslSourcePresent: true,
            wgslScatteringMarkerPresent: false,
            wgslTransparentExclusionPresent: true,
            wgslNonScatteringMarkerPresent: false,
            wgslNonScatteringExclusionPresent: true,
        });
    });
});
