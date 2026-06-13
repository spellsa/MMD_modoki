import { describe, expect, it } from "vitest";
import {
    addFrameGraphPostEffectId,
    moveFrameGraphPostEffectId,
    normalizeFrameGraphPostEffectIds,
    normalizeFrameGraphPostEffectStack,
} from "./frame-graph-post-effect-stack";

describe("frame graph post effect stack helpers", () => {
    it("normalizes ids and appends active ids in canonical order", () => {
        expect(normalizeFrameGraphPostEffectIds(
            ["grain", "unknown", "lut", "grain"],
            ["bloom", "luminous", "ssao", "lut"],
        )).toEqual(["grain", "lut", "ssao", "luminous", "bloom"]);
    });

    it("normalizes saved stack entries", () => {
        expect(normalizeFrameGraphPostEffectStack([
            { id: "bloom", enabled: true },
            { id: "bad", enabled: true },
            { id: "bloom", enabled: false },
            { id: "lut" },
        ])).toEqual([
            { id: "bloom", enabled: true },
            { id: "lut", enabled: false },
        ]);
    });

    it("inserts new ids by canonical order", () => {
        expect(addFrameGraphPostEffectId(["ssao", "lut"], "bloom")).toEqual(["ssao", "bloom", "lut"]);
        expect(addFrameGraphPostEffectId(["dof", "bloom"], "luminous")).toEqual(["dof", "luminous", "bloom"]);
        expect(addFrameGraphPostEffectId(["ssao", "bloom"], "distortion")).toEqual(["ssao", "bloom", "distortion"]);
    });

    it("moves ids without dropping disabled stack positions", () => {
        expect(moveFrameGraphPostEffectId(["bloom", "lut", "grain"], "lut", -1)).toEqual(["lut", "bloom", "grain"]);
        expect(moveFrameGraphPostEffectId(["bloom", "lut", "grain"], "lut", 1)).toEqual(["bloom", "grain", "lut"]);
        expect(moveFrameGraphPostEffectId(["bloom", "lut"], "bloom", -1)).toEqual(["bloom", "lut"]);
    });
});

