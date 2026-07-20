import { describe, expect, it } from "vitest";
import {
    injectStandardMaterialSssExclusion,
} from "./standard-material-sss-prepass-fix";

describe("StandardMaterial SSS pre-pass compatibility", () => {
    it("marks non-SSS WGSL StandardMaterial pixels as excluded", () => {
        const source =
            "var writeGeometryInfo: f32=select(0.0,1.0,color.a>0.4);var fragData: array<vec4<f32>,SCENE_MRT_COUNT>;";
        const patched = injectStandardMaterialSssExclusion(source, "wgsl");

        expect(patched).toContain(
            "fragData[PREPASS_IRRADIANCE_LEGACY_INDEX]=vec4f(0.0,0.0,0.0,1.0);",
        );
        expect(injectStandardMaterialSssExclusion(patched, "wgsl")).toBe(patched);
    });

    it("marks non-SSS GLSL StandardMaterial pixels as excluded", () => {
        const source = "float writeGeometryInfo=color.a>0.4 ? 1.0 : 0.0;";
        const patched = injectStandardMaterialSssExclusion(source, "glsl");

        expect(patched).toContain(
            "gl_FragData[PREPASS_IRRADIANCE_LEGACY_INDEX]=vec4(0.0,0.0,0.0,1.0);",
        );
    });
});
