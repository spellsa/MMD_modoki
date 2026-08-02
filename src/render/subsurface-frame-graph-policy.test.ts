import { describe, expect, it } from "vitest";
import {
    buildSubSurfaceCompositionDefines,
    resolveSubSurfaceFrameGraphPolicy,
} from "./subsurface-frame-graph-policy";

describe("buildSubSurfaceCompositionDefines", () => {
    it("combines local gamma and Babylon's sample-count visualization", () => {
        expect(buildSubSurfaceCompositionDefines(true, "sample-count")).toBe([
            "#define MMD_MODOKI_SSS_LOCAL_GAMMA",
            "#define DEBUG_SSS_SAMPLES",
        ].join("\n"));
    });

    it("returns no defines for the ordinary linear composition", () => {
        expect(buildSubSurfaceCompositionDefines(false, "off")).toBeNull();
    });

    it("enables the amplified scattering-difference heatmap", () => {
        expect(buildSubSurfaceCompositionDefines(
            true,
            "scattering-delta",
        )).toContain("#define MMD_MODOKI_SSS_DEBUG_SCATTERING_DELTA");
    });

    it("enables the input-versus-difference split visualization", () => {
        expect(buildSubSurfaceCompositionDefines(
            true,
            "irradiance-split",
        )).toContain("#define MMD_MODOKI_SSS_DEBUG_IRRADIANCE_SPLIT");
    });
});

describe("resolveSubSurfaceFrameGraphPolicy", () => {
    it("activates the RTT PrePass workaround for Frame Graph SSS", () => {
        expect(resolveSubSurfaceFrameGraphPolicy(true, true, true, false)).toEqual({
            sceneColorUseCameraPostProcesses: false,
            configurationNeedsImageProcessing: false,
            sceneColorPrePassActivationPassRequired: true,
            compositionUsesLocalGamma: true,
        });
    });

    it("does not activate the RTT PrePass workaround for Classic SSS", () => {
        expect(resolveSubSurfaceFrameGraphPolicy(false, true, false, false)).toEqual({
            sceneColorUseCameraPostProcesses: false,
            configurationNeedsImageProcessing: false,
            sceneColorPrePassActivationPassRequired: false,
            compositionUsesLocalGamma: true,
        });
    });

    it("does not activate the RTT PrePass workaround without SSS", () => {
        expect(resolveSubSurfaceFrameGraphPolicy(true, false, true, false)).toEqual({
            sceneColorUseCameraPostProcesses: false,
            configurationNeedsImageProcessing: false,
            sceneColorPrePassActivationPassRequired: false,
            compositionUsesLocalGamma: false,
        });
    });

    it("leaves SSS linear for a Classic image-processing post-process", () => {
        expect(resolveSubSurfaceFrameGraphPolicy(false, true, false, true)).toEqual({
            sceneColorUseCameraPostProcesses: false,
            configurationNeedsImageProcessing: false,
            sceneColorPrePassActivationPassRequired: false,
            compositionUsesLocalGamma: false,
        });
    });
});
