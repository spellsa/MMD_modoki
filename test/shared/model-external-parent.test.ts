import { describe, expect, it } from "vitest";
import {
    selectModelExternalParentKeyframeAtFrame,
    wouldCreateModelExternalParentCycle,
} from "../../src/shared/model-external-parent";

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

describe("selectModelExternalParentKeyframeAtFrame", () => {
    const keyframes = [
        {
            frame: 5,
            childBoneName: "センター",
            parentModelPath: "plate.pmx",
            parentBoneName: "センター",
        },
        {
            frame: 20,
            childBoneName: "センター",
            parentModelPath: null,
            parentBoneName: null,
        },
    ];

    it("returns no relation before the first key", () => {
        expect(selectModelExternalParentKeyframeAtFrame(keyframes, 4)).toBeNull();
    });

    it("holds the latest relation until the next key", () => {
        expect(selectModelExternalParentKeyframeAtFrame(keyframes, 19)?.parentModelPath).toBe("plate.pmx");
    });

    it("selects an explicit detach key", () => {
        expect(selectModelExternalParentKeyframeAtFrame(keyframes, 20)).toMatchObject({
            frame: 20,
            parentModelPath: null,
            parentBoneName: null,
        });
    });
});
