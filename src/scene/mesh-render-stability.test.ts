import { describe, expect, it } from "vitest";
import { classifyLargeThinMesh } from "./mesh-render-stability";

describe("classifyLargeThinMesh", () => {
    it("accepts a large low-poly floor plane", () => {
        const result = classifyLargeThinMesh({ x: 120, y: 0.02, z: 90 }, 4, 6, "stage_floor");

        expect(result.isLargeThinPlane).toBe(true);
    });

    it("accepts a large named background board even when tessellated", () => {
        const result = classifyLargeThinMesh({ x: 160, y: 90, z: 0.1 }, 2000, 6000, "\u80cc\u666f\u677f");

        expect(result.isLargeThinPlane).toBe(true);
    });

    it("rejects small props", () => {
        const result = classifyLargeThinMesh({ x: 8, y: 0.1, z: 8 }, 4, 6, "floor_tile");

        expect(result.isLargeThinPlane).toBe(false);
    });

    it("rejects long narrow rods", () => {
        const result = classifyLargeThinMesh({ x: 120, y: 0.1, z: 6 }, 24, 72, "stage_bar");

        expect(result.isLargeThinPlane).toBe(false);
    });
});
