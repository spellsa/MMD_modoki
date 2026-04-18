import { describe, expect, it, vi } from "vitest";
import {
    getSerializedLightDirection,
    setLightDirection,
    setShadowFrustumSize,
    setShadowMaxZ,
} from "./light-shadow-controller";

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
        shadowMaxZValue: 4800,
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
