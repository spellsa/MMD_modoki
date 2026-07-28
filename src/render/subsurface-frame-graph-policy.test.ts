import { describe, expect, it } from "vitest";
import { resolveSubSurfaceFrameGraphPolicy } from "./subsurface-frame-graph-policy";

describe("resolveSubSurfaceFrameGraphPolicy", () => {
    it("leaves the intermediate scene color linear for Frame Graph output", () => {
        expect(resolveSubSurfaceFrameGraphPolicy(true)).toEqual({
            sceneColorUseCameraPostProcesses: false,
            configurationNeedsImageProcessing: false,
        });
    });

    it("leaves image processing to the application's classic output path", () => {
        expect(resolveSubSurfaceFrameGraphPolicy(false)).toEqual({
            sceneColorUseCameraPostProcesses: false,
            configurationNeedsImageProcessing: false,
        });
    });
});
