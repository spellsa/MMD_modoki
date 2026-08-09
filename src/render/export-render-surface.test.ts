import { describe, expect, it } from "vitest";
import { normalizeExportRgbaRows } from "./export-render-surface";

describe("normalizeExportRgbaRows", () => {
    it("converts bottom-to-top RGBA readback into top-to-bottom row order", () => {
        const bottomRow = [1, 2, 3, 4, 5, 6, 7, 8];
        const topRow = [9, 10, 11, 12, 13, 14, 15, 16];
        const source = new Uint8Array([...bottomRow, ...topRow]);

        const result = normalizeExportRgbaRows(source, 2, 2);

        expect([...result]).toEqual([...topRow, ...bottomRow]);
        expect([...source]).toEqual([...bottomRow, ...topRow]);
    });

    it("rejects undersized readback buffers", () => {
        expect(() => normalizeExportRgbaRows(new Uint8Array(3), 1, 1)).toThrow(
            "RGBA readback is too small",
        );
    });
});
