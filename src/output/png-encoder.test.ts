import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { encodeRgba8ToPng } from "./png-encoder";

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const readChunks = (png: Uint8Array): Map<string, Uint8Array> => {
    const chunks = new Map<string, Uint8Array>();
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    let offset = PNG_SIGNATURE.length;
    while (offset < png.byteLength) {
        const length = view.getUint32(offset, false);
        const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
        chunks.set(type, png.slice(offset + 8, offset + 8 + length));
        offset += 12 + length;
    }
    return chunks;
};

describe("encodeRgba8ToPng", () => {
    it("encodes RGBA8 with filter None and preserves alpha bytes", async () => {
        const rgba = new Uint8Array([
            255, 0, 0, 255,
            0, 255, 0, 128,
            0, 0, 255, 1,
            10, 20, 30, 0,
        ]);

        const result = await encodeRgba8ToPng(rgba, 2, 2);
        const png = new Uint8Array(result.pngBuffer);
        const chunks = readChunks(png);
        const ihdr = chunks.get("IHDR");
        const idat = chunks.get("IDAT");

        expect([...png.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
        expect(ihdr).toBeDefined();
        expect(idat).toBeDefined();
        if (!ihdr || !idat) {
            throw new Error("Expected IHDR and IDAT chunks");
        }
        expect(new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength).getUint32(0, false)).toBe(2);
        expect(new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength).getUint32(4, false)).toBe(2);
        expect([...ihdr.subarray(8)]).toEqual([8, 6, 0, 0, 0]);
        expect([...inflateSync(idat)]).toEqual([
            0,
            ...rgba.subarray(0, 8),
            0,
            ...rgba.subarray(8, 16),
        ]);
        expect([...png.subarray(-12)]).toEqual([
            0, 0, 0, 0,
            73, 69, 78, 68,
            174, 66, 96, 130,
        ]);
        expect(result.filterStrategy).toBe("none");
        expect(result.byteLength).toBe(png.byteLength);
    });

    it("rejects a mismatched RGBA byte length", async () => {
        await expect(encodeRgba8ToPng(new Uint8Array(15), 2, 2)).rejects.toThrow(
            "RGBA byte length",
        );
    });

    it("rejects invalid dimensions", async () => {
        await expect(encodeRgba8ToPng(new Uint8Array(), 0, 1)).rejects.toThrow(
            "PNG dimensions",
        );
    });
});
