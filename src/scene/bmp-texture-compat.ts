export type DecodedBmpTexture = {
    width: number;
    height: number;
    rgba: Uint8Array;
    hasAlpha: boolean;
    minAlpha: number;
    maxAlpha: number;
};

const BMP_MAGIC = 0x4d42;
const BITMAPINFOHEADER_SIZE = 40;
const BI_RGB = 0;

export function isBmpTexturePath(path: string): boolean {
    const withoutQuery = path.split(/[?#]/, 1)[0] ?? path;
    return withoutQuery.toLowerCase().endsWith(".bmp");
}

export function decodeBmpTextureToRgba(data: ArrayBuffer | ArrayBufferView): DecodedBmpTexture | null {
    const view = data instanceof ArrayBuffer
        ? new DataView(data)
        : new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (view.byteLength < 54) return null;
    if (view.getUint16(0, true) !== BMP_MAGIC) return null;

    const dataOffset = view.getUint32(10, true);
    const dibHeaderSize = view.getUint32(14, true);
    if (dibHeaderSize < BITMAPINFOHEADER_SIZE) return null;

    const width = view.getInt32(18, true);
    const signedHeight = view.getInt32(22, true);
    const planes = view.getUint16(26, true);
    const bitsPerPixel = view.getUint16(28, true);
    const compression = view.getUint32(30, true);
    if (planes !== 1 || width <= 0 || signedHeight === 0) return null;
    if (bitsPerPixel !== 32 || compression !== BI_RGB) return null;

    const height = Math.abs(signedHeight);
    const topDown = signedHeight < 0;
    const rowStride = width * 4;
    const requiredBytes = dataOffset + rowStride * height;
    if (requiredBytes > view.byteLength) return null;

    const rgba = new Uint8Array(width * height * 4);
    let hasAlpha = false;
    let minAlpha = 255;
    let maxAlpha = 0;

    for (let y = 0; y < height; y += 1) {
        const sourceY = topDown ? y : height - 1 - y;
        const sourceRow = dataOffset + sourceY * rowStride;
        const targetRow = y * width * 4;
        for (let x = 0; x < width; x += 1) {
            const source = sourceRow + x * 4;
            const target = targetRow + x * 4;
            const alpha = view.getUint8(source + 3);
            rgba[target] = view.getUint8(source + 2);
            rgba[target + 1] = view.getUint8(source + 1);
            rgba[target + 2] = view.getUint8(source);
            rgba[target + 3] = alpha;
            hasAlpha ||= alpha < 255;
            minAlpha = Math.min(minAlpha, alpha);
            maxAlpha = Math.max(maxAlpha, alpha);
        }
    }

    return {
        width,
        height,
        rgba,
        hasAlpha,
        minAlpha,
        maxAlpha,
    };
}
