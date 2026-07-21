import { CubeMapToSphericalPolynomialTools } from "@babylonjs/core/Misc/HighDynamicRange/cubemapToSphericalPolynomial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import type { SphericalPolynomial } from "@babylonjs/core/Maths/sphericalPolynomial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { applyMmdLikePbrShaderSettings } from "./pbr-mmd-like-material-plugin";

type EnvironmentLightingMaterialLike = {
    getClassName(): string;
    isFrozen?: boolean;
    markDirty?: (forceMaterialDirty?: boolean) => void;
};

type EnvironmentLightingSceneLike = {
    environmentIntensity: number;
    iblIntensity: number;
    materials: EnvironmentLightingMaterialLike[];
    resetCachedMaterial?: () => void;
};

export type EnvironmentLightingIntensityResult = {
    intensity: number;
    refreshedMaterialCount: number;
    refreshedFrozenMaterialCount: number;
};

export type EnvironmentLightingDiagnosticProbeResult = {
    passed: boolean;
    darkLuminance: number;
    litLuminance: number;
    luminanceDelta: number;
};

export const ENVIRONMENT_LIGHTING_TARGET_LUMINANCE = 0.25;
export const MIN_ENVIRONMENT_TEXTURE_LEVEL = 0.01;
export const MAX_ENVIRONMENT_TEXTURE_LEVEL = 4;

function toByte(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(255, Math.round(value)));
}

function isPbrMaterial(material: EnvironmentLightingMaterialLike): boolean {
    const className = material.getClassName();
    return className === "PBRMaterial"
        || className === "PBRMetallicRoughnessMaterial"
        || className === "PBRSpecularGlossinessMaterial"
        || className === "OpenPBRMaterial";
}

/**
 * Normalizes HDRs with very different exposure ranges to an avatar-friendly
 * diffuse-IBL baseline. The diagonal spherical-polynomial coefficients
 * approximate the environment's average linear RGB irradiance.
 */
export function calculateEnvironmentTextureLevel(
    polynomial: SphericalPolynomial | null | undefined,
    targetLuminance = ENVIRONMENT_LIGHTING_TARGET_LUMINANCE,
): number {
    if (!polynomial) return 1;

    const red = (polynomial.xx.x + polynomial.yy.x + polynomial.zz.x) / 3;
    const green = (polynomial.xx.y + polynomial.yy.y + polynomial.zz.y) / 3;
    const blue = (polynomial.xx.z + polynomial.yy.z + polynomial.zz.z) / 3;
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    if (!Number.isFinite(luminance) || luminance <= 1e-6) return 1;

    const safeTarget = Number.isFinite(targetLuminance)
        ? Math.max(0, targetLuminance)
        : ENVIRONMENT_LIGHTING_TARGET_LUMINANCE;
    return Math.max(
        MIN_ENVIRONMENT_TEXTURE_LEVEL,
        Math.min(MAX_ENVIRONMENT_TEXTURE_LEVEL, safeTarget / luminance),
    );
}

/**
 * Applies the application's artistic environment-lighting control to both the
 * diffuse and specular IBL terms of Babylon PBR materials.
 *
 * Keep scene.iblIntensity neutral because Babylon BackgroundMaterial also
 * multiplies its displayed reflection texture by that scene-wide value. The
 * application's lighting slider therefore uses scene.environmentIntensity,
 * which affects PBR indirect lighting without changing the HDRI backdrop.
 * PBR material bindings are refreshed because scene intensity fields do not
 * invalidate already-synchronized material UBOs on their own.
 */
export function applyEnvironmentLightingIntensity(
    scene: EnvironmentLightingSceneLike,
    value: number,
    maximum = 4,
): EnvironmentLightingIntensityResult {
    const normalizedMaximum = Number.isFinite(maximum) ? Math.max(0, maximum) : 4;
    const intensity = Number.isFinite(value)
        ? Math.max(0, Math.min(normalizedMaximum, value))
        : 1;

    scene.iblIntensity = 1;
    scene.environmentIntensity = intensity;

    let refreshedMaterialCount = 0;
    let refreshedFrozenMaterialCount = 0;
    for (const material of scene.materials) {
        if (!isPbrMaterial(material) || typeof material.markDirty !== "function") continue;
        const frozen = material.isFrozen === true;
        material.markDirty(frozen);
        refreshedMaterialCount += 1;
        if (frozen) refreshedFrozenMaterialCount += 1;
    }
    scene.resetCachedMaterial?.();

    return {
        intensity,
        refreshedMaterialCount,
        refreshedFrozenMaterialCount,
    };
}

/**
 * Verifies the actual PBR output without loading a user model. The probe uses
 * an unlit-by-analytical-lights synthetic sphere and compares two offscreen
 * frames, so merely loading an HDR texture is not enough to pass.
 */
export async function runEnvironmentLightingDiagnosticProbe(
    scene: Scene,
    previousIntensity: number,
    maximum = 4,
): Promise<EnvironmentLightingDiagnosticProbeResult> {
    const environmentTexture = scene.environmentTexture;
    const camera = scene.activeCamera;
    if (!environmentTexture?.isReady() || !camera) {
        return {
            passed: false,
            darkLuminance: 0,
            litLuminance: 0,
            luminanceDelta: 0,
        };
    }

    const sphere = CreateSphere("mmdModokiIblDiagnosticSphere", {
        diameter: 5,
        segments: 24,
    }, scene);
    const forwardRay = camera.getForwardRay(8);
    sphere.position.copyFrom(forwardRay.origin).addInPlace(forwardRay.direction.scale(8));
    sphere.alwaysSelectAsActiveMesh = true;

    const material = new PBRMaterial("mmdModokiIblDiagnosticMaterial", scene);
    // Avoid tone-mapping saturation: a white probe under a strong daytime HDR
    // can read back as 1.0 across most useful intensity values.
    material.albedoColor = new Color3(0.18, 0.18, 0.18);
    material.metallic = 0;
    material.roughness = 1;
    material.directIntensity = 0;
    material.emissiveIntensity = 0;
    material.environmentIntensity = 1;
    applyMmdLikePbrShaderSettings(material, {
        mode: "mmd-like",
        toonTexture: null,
        fallbackColor: new Color3(0.55, 0.55, 0.55),
    });
    sphere.material = material;

    const renderTarget = new RenderTargetTexture(
        "mmdModokiIblDiagnosticTarget",
        64,
        scene,
        {
            generateDepthBuffer: true,
            generateMipMaps: false,
            samples: 1,
        },
    );
    renderTarget.activeCamera = camera;
    renderTarget.renderList = [sphere];
    renderTarget.clearColor = new Color4(0, 0, 0, 0);

    const sampleLuminance = async (intensity: number): Promise<number> => {
        applyEnvironmentLightingIntensity(scene, intensity, maximum);
        // The first explicit RTT render can finish a just-invalidated PBR
        // binding; the second is the stable frame measured by the probe.
        renderTarget.render(false);
        renderTarget.render(false);
        const pixels = await renderTarget.readPixels(0, 0, null, true, false, 20, 20, 24, 24);
        if (!pixels) return 0;
        const bytes = pixels instanceof Uint8Array
            ? pixels
            : new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
        let total = 0;
        let samples = 0;
        for (let offset = 0; offset + 3 < bytes.length; offset += 4) {
            total += (bytes[offset] + bytes[offset + 1] + bytes[offset + 2]) / (3 * 255);
            samples += 1;
        }
        return samples > 0 ? total / samples : 0;
    };

    try {
        await material.forceCompilationAsync(sphere);
        const darkLuminance = await sampleLuminance(0);
        const litLuminance = await sampleLuminance(0.5);
        const luminanceDelta = litLuminance - darkLuminance;
        return {
            passed: litLuminance >= 0.03 && luminanceDelta >= 0.02,
            darkLuminance,
            litLuminance,
            luminanceDelta,
        };
    } finally {
        applyEnvironmentLightingIntensity(scene, previousIntensity, maximum);
        renderTarget.dispose();
        sphere.dispose();
        material.dispose();
    }
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
