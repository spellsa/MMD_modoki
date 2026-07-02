import { describe, expect, it } from "vitest";
import { buildLutAtlasDataFrom3dlText } from "./lut-atlas-texture";

describe("buildLutAtlasDataFrom3dlText", () => {
    it("packs runtime 3DL samples into r + b * size atlas order", () => {
        const text = [
            "0 1",
            "0 0 0",
            "0 0 4095",
            "0 4095 0",
            "0 4095 4095",
            "4095 0 0",
            "4095 0 4095",
            "4095 4095 0",
            "4095 4095 4095",
        ].join("\n");

        const atlas = buildLutAtlasDataFrom3dlText(text);
        expect(atlas.size).toBe(2);
        expect(atlas.width).toBe(4);
        expect(atlas.height).toBe(2);

        const pixel = (x: number, y: number): number[] => {
            const offset = (y * atlas.width + x) * 4;
            return Array.from(atlas.data.slice(offset, offset + 4));
        };

        expect(pixel(0, 0)).toEqual([0, 0, 0, 255]);
        expect(pixel(2, 0)).toEqual([0, 0, 255, 255]);
        expect(pixel(1, 0)).toEqual([255, 0, 0, 255]);
        expect(pixel(3, 1)).toEqual([255, 255, 255, 255]);
    });
});
