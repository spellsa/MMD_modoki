import { CubeMapToSphericalPolynomialTools } from "@babylonjs/core/Misc/HighDynamicRange/cubemapToSphericalPolynomial";
import type { SphericalPolynomial } from "@babylonjs/core/Maths/sphericalPolynomial";

function toByte(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(255, Math.round(value)));
}

/**
 * Creates the diffuse irradiance data required by Babylon PBR materials for a
 * constant-color cube map. Computing it on the CPU avoids relying on an
 * asynchronous GPU readback of a RawCubeTexture.
 */
export function createConstantEnvironmentSphericalPolynomial(
    red: number,
    green: number,
    blue: number,
): SphericalPolynomial {
    const face = new Uint8Array([
        toByte(red),
        toByte(green),
        toByte(blue),
        255,
    ]);
    return CubeMapToSphericalPolynomialTools.ConvertCubeMapToSphericalPolynomial({
        size: 1,
        right: face,
        left: face,
        up: face,
        down: face,
        front: face,
        back: face,
        format: 5,
        type: 0,
        gammaSpace: false,
    });
}
