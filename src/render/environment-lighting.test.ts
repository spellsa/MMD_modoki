import { describe, expect, it } from "vitest";
import { createConstantEnvironmentSphericalPolynomial } from "./environment-lighting";

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
