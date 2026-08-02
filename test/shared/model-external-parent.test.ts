import { describe, expect, it } from "vitest";
import { wouldCreateModelExternalParentCycle } from "../../src/shared/model-external-parent";

describe("wouldCreateModelExternalParentCycle", () => {
    it("rejects self parenting", () => {
        expect(wouldCreateModelExternalParentCycle(1, 1, new Map())).toBe(true);
    });

    it("rejects an indirect cycle", () => {
        const links = new Map([
            [1, { parentModelIndex: 0 }],
            [2, { parentModelIndex: 1 }],
        ]);

        expect(wouldCreateModelExternalParentCycle(0, 2, links)).toBe(true);
    });

    it("accepts an acyclic parent chain", () => {
        const links = new Map([
            [1, { parentModelIndex: 0 }],
        ]);

        expect(wouldCreateModelExternalParentCycle(2, 1, links)).toBe(false);
    });
});
