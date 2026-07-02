import { describe, expect, it, vi } from "vitest";
import {
    getSerializedLightDirection,
    setShadowBlurKernel,
    setShadowFrustumSize,
    setLightDirection,
    setShadowPenumbraEnabled,
    setShadowPenumbraSize,
    setSoftTransparentShadowEnabled,
    setShadowMaxZ,
    setTransparentShadowEnabled,
} from "./light-shadow-controller";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";

function createHost() {
    return {
        dirLight: {
            direction: null,
            position: null,
            shadowFrustumSize: 0,
            shadowMinZ: 0,
            shadowMaxZ: 0,
        },
        shadowGenerator: null,
        shadowFrustumSizeValue: 220,
        shadowMaxZValue: 1000,
        constructor: {},
        applyVolumetricLightSettings: vi.fn(),
        refreshGlobalIlluminationLightParameters: vi.fn(),
    };
}

describe("light direction serialization", () => {
    it("keeps raw light direction after shadow frustum changes", () => {
        const host = createHost();

        setLightDirection(host, 0.2, -0.7, 0.4);
        setShadowFrustumSize(host, 640);

        const direction = getSerializedLightDirection(host);
        expect(direction.x).toBeCloseTo(0.2);
        expect(direction.y).toBeCloseTo(-0.7);
        expect(direction.z).toBeCloseTo(0.4);
    });

    it("keeps raw light direction after shadow max z changes", () => {
        const host = createHost();

        setLightDirection(host, -0.35, -1.15, 0.6);
        setShadowMaxZ(host, 3200);

        const direction = getSerializedLightDirection(host);
        expect(direction.x).toBeCloseTo(-0.35);
        expect(direction.y).toBeCloseTo(-1.15);
        expect(direction.z).toBeCloseTo(0.6);
    });
});

describe("shadow projection range", () => {
    it("uses shadowMaxZ as the standard shadow draw distance", () => {
        const host = createHost();

        setShadowFrustumSize(host, 220);
        setShadowMaxZ(host, 4800);

        expect(host.dirLight.shadowFrustumSize).toBe(4800);
        expect(host.dirLight.shadowMaxZ).toBe(4800);
    });

    it("uses shadowMaxZ for aerial standard shadow coverage", () => {
        const host = createHost();

        setShadowMaxZ(host, 100000);

        expect(host.dirLight.shadowFrustumSize).toBe(100000);
        expect(host.dirLight.shadowMaxZ).toBe(100000);
    });
});

describe("transparent shadow controls", () => {
    it("can disable transparent shadow sampling independently", () => {
        const host = {
            ...createHost(),
            transparentShadowEnabledValue: true,
            softTransparentShadowEnabledValue: true,
            shadowGenerator: {
                transparencyShadow: true,
                enableSoftTransparentShadow: true,
                useOpacityTextureForTransparentShadow: true,
            },
            engine: {
                releaseEffects: vi.fn(),
            },
        };

        setTransparentShadowEnabled(host, false);

        expect(host.shadowGenerator.transparencyShadow).toBe(false);
        expect(host.shadowGenerator.enableSoftTransparentShadow).toBe(false);
        expect(host.shadowGenerator.useOpacityTextureForTransparentShadow).toBe(false);
        expect(host.engine.releaseEffects).toHaveBeenCalledTimes(1);
    });

    it("keeps transparent casters while toggling soft transparent shadows", () => {
        const host = {
            ...createHost(),
            transparentShadowEnabledValue: true,
            softTransparentShadowEnabledValue: true,
            shadowGenerator: {
                transparencyShadow: true,
                enableSoftTransparentShadow: true,
                useOpacityTextureForTransparentShadow: true,
            },
            engine: {
                releaseEffects: vi.fn(),
            },
        };

        setSoftTransparentShadowEnabled(host, false);

        expect(host.shadowGenerator.transparencyShadow).toBe(true);
        expect(host.shadowGenerator.enableSoftTransparentShadow).toBe(false);
        expect(host.shadowGenerator.useOpacityTextureForTransparentShadow).toBe(true);
        expect(host.engine.releaseEffects).toHaveBeenCalledTimes(1);

        setSoftTransparentShadowEnabled(host, true);

        expect(host.shadowGenerator.transparencyShadow).toBe(true);
        expect(host.shadowGenerator.enableSoftTransparentShadow).toBe(true);
        expect(host.shadowGenerator.useOpacityTextureForTransparentShadow).toBe(true);
        expect(host.engine.releaseEffects).toHaveBeenCalledTimes(2);
    });
});

describe("shadow filter controls", () => {
    it("switches to blurred ESM when blur kernel is set", () => {
        const host = {
            ...createHost(),
            shadowBlurKernelValue: 0,
            shadowPenumbraEnabledValue: false,
            shadowPenumbraSizeValue: 0.035,
            shadowFilteringQualityValue: ShadowGenerator.QUALITY_MEDIUM,
            shadowGenerator: {
                filter: ShadowGenerator.FILTER_PCF,
                filteringQuality: ShadowGenerator.QUALITY_MEDIUM,
                useKernelBlur: false,
                blurScale: 1,
                blurKernel: 0,
                contactHardeningLightSizeUVRatio: 0,
            },
            engine: {
                releaseEffects: vi.fn(),
            },
        };

        setShadowBlurKernel(host, 24);

        expect(host.shadowGenerator.filter).toBe(ShadowGenerator.FILTER_BLUREXPONENTIALSHADOWMAP);
        expect(host.shadowGenerator.useKernelBlur).toBe(true);
        expect(host.shadowGenerator.blurScale).toBe(2);
        expect(host.shadowGenerator.blurKernel).toBe(24);
    });

    it("uses PCSS and penumbra size when penumbra is enabled", () => {
        const host = {
            ...createHost(),
            shadowBlurKernelValue: 24,
            shadowPenumbraEnabledValue: false,
            shadowPenumbraSizeValue: 0.035,
            shadowFilteringQualityValue: ShadowGenerator.QUALITY_MEDIUM,
            shadowGenerator: {
                filter: ShadowGenerator.FILTER_BLUREXPONENTIALSHADOWMAP,
                filteringQuality: ShadowGenerator.QUALITY_MEDIUM,
                contactHardeningLightSizeUVRatio: 0,
            },
            engine: {
                releaseEffects: vi.fn(),
            },
        };

        setShadowPenumbraSize(host, 0.08);
        setShadowPenumbraEnabled(host, true);

        expect(host.shadowGenerator.filter).toBe(ShadowGenerator.FILTER_PCSS);
        expect(host.shadowGenerator.contactHardeningLightSizeUVRatio).toBeCloseTo(0.08);
    });
});
