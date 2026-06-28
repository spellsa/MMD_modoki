import { describe, expect, it } from "vitest";
import { decodeBmpTextureToRgba, isBmpTexturePath } from "./bmp-texture-compat";

function create32BitBmp(width: number, height: number, pixelsBottomUpBgra: readonly number[]): ArrayBuffer {
    const rowStride = width * 4;
    const dataOffset = 54;
    const buffer = new ArrayBuffer(dataOffset + rowStride * height);
    const view = new DataView(buffer);
    view.setUint16(0, 0x4d42, true);
    view.setUint32(2, buffer.byteLength, true);
    view.setUint32(10, dataOffset, true);
    view.setUint32(14, 40, true);
    view.setInt32(18, width, true);
    view.setInt32(22, height, true);
    view.setUint16(26, 1, true);
    view.setUint16(28, 32, true);
    view.setUint32(30, 0, true);

    const bytes = new Uint8Array(buffer);
    bytes.set(pixelsBottomUpBgra, dataOffset);
    return buffer;
}

describe("bmp texture compatibility", () => {
    it("detects bmp paths without being confused by query strings", () => {
        expect(isBmpTexturePath("tex/shadow.bmp")).toBe(true);
        expect(isBmpTexturePath("tex/shadow.BMP?cache=1")).toBe(true);
        expect(isBmpTexturePath("tex/shadow.dds")).toBe(false);
    });

    it("decodes 32-bit bottom-up BMP pixels to top-down RGBA", () => {
        const buffer = create32BitBmp(1, 2, [
            10, 20, 30, 40,
            50, 60, 70, 255,
        ]);

        const decoded = decodeBmpTextureToRgba(buffer);

        expect(decoded?.width).toBe(1);
        expect(decoded?.height).toBe(2);
        expect(decoded?.hasAlpha).toBe(true);
        expect(decoded?.minAlpha).toBe(40);
        expect(decoded?.maxAlpha).toBe(255);
        expect(Array.from(decoded?.rgba ?? [])).toEqual([
            70, 60, 50, 255,
            30, 20, 10, 40,
        ]);
    });

    it("leaves non-32-bit BMPs to the regular texture path", () => {
        const buffer = create32BitBmp(1, 1, [0, 0, 0, 255]);
        new DataView(buffer).setUint16(28, 24, true);

        expect(decodeBmpTextureToRgba(buffer)).toBeNull();
    });
});
