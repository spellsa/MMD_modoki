import { describe, expect, it, vi } from "vitest";
import { FrameGraphPostEffectsController } from "./frame-graph-post-effects-controller";

describe("FrameGraphPostEffectsController", () => {
    it("falls back when no scene is connected", () => {
        const onWarning = vi.fn();
        const controller = new FrameGraphPostEffectsController(onWarning);

        expect(controller.activate()).toBe(false);
        expect(controller.activate()).toBe(false);
        expect(onWarning).toHaveBeenCalledTimes(1);
        expect(onWarning.mock.calls[0][0]).toMatchObject({ reason: "not-connected" });
    });

    it("allows warnings again after dispose", () => {
        const onWarning = vi.fn();
        const controller = new FrameGraphPostEffectsController(onWarning);

        controller.activate();
        controller.dispose();
        controller.activate();

        expect(onWarning).toHaveBeenCalledTimes(2);
    });

    it("does not execute before activation", () => {
        const controller = new FrameGraphPostEffectsController(vi.fn());

        controller.execute();

        expect(controller.getExecutedFrameCount()).toBe(0);
    });
});
