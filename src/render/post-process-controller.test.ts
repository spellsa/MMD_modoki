import { describe, expect, it, vi } from "vitest";
import { enforceFinalPostProcessOrder } from "./post-process-controller";

describe("enforceFinalPostProcessOrder", () => {
    it("keeps fog and bloom before volumetric light and final cleanup passes", () => {
        const fog = { name: "fog" };
        const bloomExtract = { name: "bloomExtract" };
        const bloomBlurX = { name: "bloomBlurX" };
        const bloomBlurY = { name: "bloomBlurY" };
        const bloomMerge = { name: "bloomMerge" };
        const lensBlur = { name: "lensBlur" };
        const vls = { name: "vls" };
        const motionBlur = { name: "motionBlur" };
        const lens = { name: "lens" };
        const aa = { name: "aa" };
        const camera = {
            detachPostProcess: vi.fn(),
            attachPostProcess: vi.fn(),
        };
        const host = {
            camera,
            originFogPostProcess: fog,
            standaloneBloomEffect: {
                _effects: [bloomExtract, bloomBlurX, bloomBlurY, bloomMerge],
            },
            standaloneLensBlurPostProcess: lensBlur,
            volumetricLightPostProcess: vls,
            motionBlurPostProcess: motionBlur,
            finalLensDistortionPostProcess: lens,
            finalAntialiasPostProcess: aa,
        };

        enforceFinalPostProcessOrder(host);

        expect(camera.detachPostProcess.mock.calls.map(([postProcess]) => postProcess)).toEqual([
            fog,
            bloomExtract,
            bloomBlurX,
            bloomBlurY,
            bloomMerge,
            lensBlur,
            vls,
            motionBlur,
            lens,
            aa,
        ]);
        expect(camera.attachPostProcess.mock.calls.map(([postProcess]) => postProcess)).toEqual([
            fog,
            bloomExtract,
            bloomBlurX,
            bloomBlurY,
            bloomMerge,
            lensBlur,
            vls,
            motionBlur,
            lens,
            aa,
        ]);
    });
});
