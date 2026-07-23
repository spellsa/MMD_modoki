import { describe, expect, it } from "vitest";
import {
    PBR_SKIN_FACE_NORMAL_STRENGTH,
    PBR_SKIN_FACE_TARGET_NORMAL,
    blendPbrSkinFaceNormal,
} from "./pbr-skin-face-normal-plugin";

describe("PBR Skin Face normal blending", () => {
    it("uses a model-front target with a small upward bias", () => {
        expect(PBR_SKIN_FACE_TARGET_NORMAL[0]).toBeCloseTo(0);
        expect(PBR_SKIN_FACE_TARGET_NORMAL[1]).toBeGreaterThan(0);
        expect(PBR_SKIN_FACE_TARGET_NORMAL[2]).toBeLessThan(0);
        expect(Math.hypot(...PBR_SKIN_FACE_TARGET_NORMAL)).toBeCloseTo(1);
    });

    it("blends a side normal 30 percent toward the face target", () => {
        expect(PBR_SKIN_FACE_NORMAL_STRENGTH).toBe(0.3);
        const result = blendPbrSkinFaceNormal(
            [1, 0, 0],
            PBR_SKIN_FACE_NORMAL_STRENGTH,
        );

        expect(Math.hypot(...result)).toBeCloseTo(1);
        expect(result[0]).toBeGreaterThan(0);
        expect(result[2]).toBeLessThan(0);
        expect(result[1]).toBeGreaterThan(0);
    });

    it("clamps invalid or excessive strengths", () => {
        expect(blendPbrSkinFaceNormal([1, 0, 0], Number.NaN)).toEqual([1, 0, 0]);
        const fullStrength = blendPbrSkinFaceNormal([1, 0, 0], 2);
        expect(fullStrength[0]).toBeCloseTo(PBR_SKIN_FACE_TARGET_NORMAL[0]);
        expect(fullStrength[1]).toBeCloseTo(PBR_SKIN_FACE_TARGET_NORMAL[1]);
        expect(fullStrength[2]).toBeCloseTo(PBR_SKIN_FACE_TARGET_NORMAL[2]);
    });
});
