import { describe, expect, it } from "vitest";
import {
    getMmdLikePbrShadowMask,
    getMmdLikePbrShadowTintMultiplier,
} from "./pbr-mmd-like-material-plugin";

describe("PBR MMD Like shadow mask", () => {
    it("treats shadow-map occlusion as shadow", () => {
        expect(getMmdLikePbrShadowMask(0.1, 1)).toBeCloseTo(0.9);
    });

    it("treats a normal-facing dark surface as shadow without occlusion", () => {
        expect(getMmdLikePbrShadowMask(1, 0)).toBe(1);
    });

    it("keeps a fully lit unoccluded surface outside the shadow mask", () => {
        expect(getMmdLikePbrShadowMask(1, 1)).toBe(0);
    });
});

describe("PBR MMD Like shadow tint multiplier", () => {
    it("keeps white neutral even in full shadow", () => {
        expect(getMmdLikePbrShadowTintMultiplier(1, 1, 1)).toBe(1);
    });

    it("multiplies a fully shadowed channel by its tint", () => {
        expect(getMmdLikePbrShadowTintMultiplier(0.4, 1, 1)).toBeCloseTo(0.4);
    });

    it("blends between neutral and the tint by strength", () => {
        expect(getMmdLikePbrShadowTintMultiplier(0.2, 1, 0.25)).toBeCloseTo(0.8);
    });

    it("does not alter a lit channel", () => {
        expect(getMmdLikePbrShadowTintMultiplier(0, 0, 1)).toBe(1);
    });
});
