import { describe, expect, it, vi } from "vitest";
import {
    applyEnvironmentLightingIntensity,
    calculateEnvironmentTextureLevel,
    createConstantEnvironmentSphericalPolynomial,
} from "./environment-lighting";

describe("applyEnvironmentLightingIntensity", () => {
    it("uses PBR environment intensity while keeping the shared IBL texture level neutral", () => {
        const pbrMaterial = {
            getClassName: () => "PBRMaterial",
            isFrozen: false,
            markDirty: vi.fn(),
        };
        const standardMaterial = {
            getClassName: () => "StandardMaterial",
            markDirty: vi.fn(),
        };
        const scene = {
            environmentIntensity: 1,
            iblIntensity: 3,
            materials: [pbrMaterial, standardMaterial],
            resetCachedMaterial: vi.fn(),
        };

        const result = applyEnvironmentLightingIntensity(scene, 2.5);

        expect(scene.environmentIntensity).toBe(2.5);
        expect(scene.iblIntensity).toBe(1);
        expect(pbrMaterial.markDirty).toHaveBeenCalledWith(false);
        expect(standardMaterial.markDirty).not.toHaveBeenCalled();
        expect(scene.resetCachedMaterial).toHaveBeenCalledOnce();
        expect(result).toEqual({
            intensity: 2.5,
            refreshedMaterialCount: 1,
            refreshedFrozenMaterialCount: 0,
        });
    });

    it("forces a rebind for frozen PBR materials and clamps invalid values", () => {
        const pbrMaterial = {
            getClassName: () => "PBRMaterial",
            isFrozen: true,
            markDirty: vi.fn(),
        };
        const scene = {
            environmentIntensity: 1,
            iblIntensity: 1,
            materials: [pbrMaterial],
        };

        const high = applyEnvironmentLightingIntensity(scene, 99);
        expect(high.intensity).toBe(4);
        expect(pbrMaterial.markDirty).toHaveBeenLastCalledWith(true);

        const invalid = applyEnvironmentLightingIntensity(scene, Number.NaN);
        expect(invalid.intensity).toBe(1);
        expect(scene.iblIntensity).toBe(1);
        expect(scene.environmentIntensity).toBe(1);
    });
});

describe("createConstantEnvironmentSphericalPolynomial", () => {
    it("creates uniform diffuse irradiance for a constant gray cube", () => {
        const polynomial = createConstantEnvironmentSphericalPolynomial(190, 190, 190);
        const expected = 190 / 255;

        expect(polynomial.x.lengthSquared()).toBeCloseTo(0, 8);
        expect(polynomial.y.lengthSquared()).toBeCloseTo(0, 8);
        expect(polynomial.z.lengthSquared()).toBeCloseTo(0, 8);
        expect(polynomial.xx.x).toBeCloseTo(expected, 3);
        expect(polynomial.yy.y).toBeCloseTo(expected, 3);
        expect(polynomial.zz.z).toBeCloseTo(expected, 3);
    });

    it("clamps invalid channel values", () => {
        const polynomial = createConstantEnvironmentSphericalPolynomial(-20, 300, Number.NaN);

        expect(polynomial.xx.x).toBeCloseTo(0, 3);
        expect(polynomial.xx.y).toBeCloseTo(1, 3);
        expect(polynomial.xx.z).toBeCloseTo(0, 3);
    });
});

describe("calculateEnvironmentTextureLevel", () => {
    it("reduces a high-radiance HDR to the neutral lighting baseline", () => {
        const polynomial = createConstantEnvironmentSphericalPolynomial(255, 255, 255);
        polynomial.xx.scaleInPlace(12);
        polynomial.yy.scaleInPlace(12);
        polynomial.zz.scaleInPlace(12);

        expect(calculateEnvironmentTextureLevel(polynomial)).toBeCloseTo(0.25 / 12, 5);
    });

    it("keeps missing data neutral and clamps very dark environments", () => {
        expect(calculateEnvironmentTextureLevel(null)).toBe(1);
        const dark = createConstantEnvironmentSphericalPolynomial(1, 1, 1);
        expect(calculateEnvironmentTextureLevel(dark)).toBe(4);
    });
});
