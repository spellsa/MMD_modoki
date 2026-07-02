export type DdsTextureInfo = {
    isDds: boolean;
    isCompressed: boolean;
    fourCc: string | null;
    width: number;
    height: number;
    dataOffset: number;
};

export type DecodedDdsTexture = DdsTextureInfo & {
    rgba: Uint8Array;
    hasAlpha: boolean;
    minAlpha: number;
    maxAlpha: number;
};

const DDS_MAGIC = 0x20534444;
const DDPF_FOURCC = 0x4;
const FOURCC_DXT1 = "DXT1";
const FOURCC_DXT3 = "DXT3";
const FOURCC_DXT5 = "DXT5";
const DDS_HEADER_LENGTH_BYTES = 128;

export function isDdsTexturePath(path: string): boolean {
    const withoutQuery = path.split(/[?#]/, 1)[0] ?? path;
    return withoutQuery.toLowerCase().endsWith(".dds");
}

export function inspectDdsTexture(data: ArrayBuffer | ArrayBufferView): DdsTextureInfo | null {
    const view = data instanceof ArrayBuffer
        ? new DataView(data)
        : new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (view.byteLength < DDS_HEADER_LENGTH_BYTES) return null;
    if (view.getUint32(0, true) !== DDS_MAGIC) return null;

    const height = view.getInt32(12, true);
    const width = view.getInt32(16, true);
    const headerSize = view.getUint32(4, true);
    const pixelFormatFlags = view.getUint32(80, true);
    const hasFourCc = (pixelFormatFlags & DDPF_FOURCC) === DDPF_FOURCC;
    const fourCc = hasFourCc
        ? String.fromCharCode(
            view.getUint8(84),
            view.getUint8(85),
            view.getUint8(86),
            view.getUint8(87),
        )
        : null;

    return {
        isDds: true,
        isCompressed: fourCc === FOURCC_DXT1 || fourCc === FOURCC_DXT3 || fourCc === FOURCC_DXT5,
        fourCc,
        width,
        height,
        dataOffset: 4 + headerSize + (fourCc === "DX10" ? 20 : 0),
    };
}

export function shouldSkipDdsTextureForWebGpu(
    data: ArrayBuffer | ArrayBufferView,
    supportsS3tc: boolean,
): DdsTextureInfo | null {
    const info = inspectDdsTexture(data);
    if (!info?.isCompressed) return null;
    return supportsS3tc ? null : info;
}

export function decodeDdsTextureToRgba(data: ArrayBuffer | ArrayBufferView): DecodedDdsTexture | null {
    const info = inspectDdsTexture(data);
    if (!info?.isCompressed || !info.fourCc) return null;

    const bytes = data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const rgba = new Uint8Array(info.width * info.height * 4);
    let hasAlpha = false;

    if (info.fourCc === FOURCC_DXT1) {
        hasAlpha = decodeDxt1(bytes, info.dataOffset, info.width, info.height, rgba);
    } else if (info.fourCc === FOURCC_DXT3) {
        hasAlpha = decodeDxt3(bytes, info.dataOffset, info.width, info.height, rgba);
    } else if (info.fourCc === FOURCC_DXT5) {
        hasAlpha = decodeDxt5(bytes, info.dataOffset, info.width, info.height, rgba);
    } else {
        return null;
    }

    const { minAlpha, maxAlpha } = computeAlphaRange(rgba);
    return { ...info, rgba, hasAlpha, minAlpha, maxAlpha };
}

function computeAlphaRange(rgba: Uint8Array): { minAlpha: number; maxAlpha: number } {
    let minAlpha = 255;
    let maxAlpha = 0;
    for (let index = 3; index < rgba.length; index += 4) {
        const alpha = rgba[index];
        minAlpha = Math.min(minAlpha, alpha);
        maxAlpha = Math.max(maxAlpha, alpha);
    }
    return { minAlpha, maxAlpha };
}

function decodeDxt1(bytes: Uint8Array, offset: number, width: number, height: number, out: Uint8Array): boolean {
    let hasAlpha = false;
    const blockCountX = Math.ceil(width / 4);
    const blockCountY = Math.ceil(height / 4);
    let cursor = offset;

    for (let blockY = 0; blockY < blockCountY; blockY += 1) {
        for (let blockX = 0; blockX < blockCountX; blockX += 1) {
            const blockHasAlpha = decodeDxtColorBlock(bytes, cursor, blockX, blockY, width, height, out, false);
            hasAlpha = hasAlpha || blockHasAlpha;
            cursor += 8;
        }
    }

    return hasAlpha;
}

function decodeDxt3(bytes: Uint8Array, offset: number, width: number, height: number, out: Uint8Array): boolean {
    const blockCountX = Math.ceil(width / 4);
    const blockCountY = Math.ceil(height / 4);
    let cursor = offset;
    let hasAlpha = false;

    for (let blockY = 0; blockY < blockCountY; blockY += 1) {
        for (let blockX = 0; blockX < blockCountX; blockX += 1) {
            const alphaCursor = cursor;
            const colorCursor = cursor + 8;
            decodeDxtColorBlock(bytes, colorCursor, blockX, blockY, width, height, out, true);
            const blockHasAlpha = applyDxt3Alpha(bytes, alphaCursor, blockX, blockY, width, height, out);
            hasAlpha = hasAlpha || blockHasAlpha;
            cursor += 16;
        }
    }

    return hasAlpha;
}

function decodeDxt5(bytes: Uint8Array, offset: number, width: number, height: number, out: Uint8Array): boolean {
    const blockCountX = Math.ceil(width / 4);
    const blockCountY = Math.ceil(height / 4);
    let cursor = offset;
    let hasAlpha = false;

    for (let blockY = 0; blockY < blockCountY; blockY += 1) {
        for (let blockX = 0; blockX < blockCountX; blockX += 1) {
            const alphaCursor = cursor;
            const colorCursor = cursor + 8;
            decodeDxtColorBlock(bytes, colorCursor, blockX, blockY, width, height, out, true);
            const blockHasAlpha = applyDxt5Alpha(bytes, alphaCursor, blockX, blockY, width, height, out);
            hasAlpha = hasAlpha || blockHasAlpha;
            cursor += 16;
        }
    }

    return hasAlpha;
}

function decodeDxtColorBlock(
    bytes: Uint8Array,
    offset: number,
    blockX: number,
    blockY: number,
    width: number,
    height: number,
    out: Uint8Array,
    forceFourColor: boolean,
): boolean {
    const color0 = readUint16(bytes, offset);
    const color1 = readUint16(bytes, offset + 2);
    const codes = readUint32(bytes, offset + 4);
    const colors = buildDxtColorTable(color0, color1, forceFourColor);
    let hasAlpha = false;

    for (let y = 0; y < 4; y += 1) {
        const py = blockY * 4 + y;
        if (py >= height) continue;
        for (let x = 0; x < 4; x += 1) {
            const px = blockX * 4 + x;
            if (px >= width) continue;
            const colorIndex = (codes >> (2 * (4 * y + x))) & 0x03;
            const color = colors[colorIndex];
            const outIndex = (py * width + px) * 4;
            out[outIndex] = color[0];
            out[outIndex + 1] = color[1];
            out[outIndex + 2] = color[2];
            out[outIndex + 3] = color[3];
            hasAlpha ||= color[3] < 255;
        }
    }

    return hasAlpha;
}

function applyDxt3Alpha(bytes: Uint8Array, offset: number, blockX: number, blockY: number, width: number, height: number, out: Uint8Array): boolean {
    let hasAlpha = false;
    for (let y = 0; y < 4; y += 1) {
        const alphaRow = readUint16(bytes, offset + y * 2);
        const py = blockY * 4 + y;
        if (py >= height) continue;
        for (let x = 0; x < 4; x += 1) {
            const px = blockX * 4 + x;
            if (px >= width) continue;
            const alpha4 = (alphaRow >> (x * 4)) & 0x0f;
            const alpha = alpha4 * 17;
            out[(py * width + px) * 4 + 3] = alpha;
            hasAlpha ||= alpha < 255;
        }
    }
    return hasAlpha;
}

function applyDxt5Alpha(bytes: Uint8Array, offset: number, blockX: number, blockY: number, width: number, height: number, out: Uint8Array): boolean {
    const alphaTable = buildDxt5AlphaTable(bytes[offset], bytes[offset + 1]);
    let alphaBits = 0n;
    let hasAlpha = false;
    for (let index = 0; index < 6; index += 1) {
        alphaBits |= BigInt(bytes[offset + 2 + index]) << BigInt(index * 8);
    }

    for (let y = 0; y < 4; y += 1) {
        const py = blockY * 4 + y;
        if (py >= height) continue;
        for (let x = 0; x < 4; x += 1) {
            const px = blockX * 4 + x;
            if (px >= width) continue;
            const bitIndex = BigInt(3 * (4 * y + x));
            const alphaIndex = Number((alphaBits >> bitIndex) & 0x07n);
            const alpha = alphaTable[alphaIndex];
            out[(py * width + px) * 4 + 3] = alpha;
            hasAlpha ||= alpha < 255;
        }
    }
    return hasAlpha;
}

function buildDxtColorTable(color0: number, color1: number, forceFourColor: boolean): [number, number, number, number][] {
    const c0 = color565ToRgb(color0);
    const c1 = color565ToRgb(color1);
    if (forceFourColor || color0 > color1) {
        return [
            [c0[0], c0[1], c0[2], 255],
            [c1[0], c1[1], c1[2], 255],
            [Math.round((2 * c0[0] + c1[0]) / 3), Math.round((2 * c0[1] + c1[1]) / 3), Math.round((2 * c0[2] + c1[2]) / 3), 255],
            [Math.round((c0[0] + 2 * c1[0]) / 3), Math.round((c0[1] + 2 * c1[1]) / 3), Math.round((c0[2] + 2 * c1[2]) / 3), 255],
        ];
    }

    return [
        [c0[0], c0[1], c0[2], 255],
        [c1[0], c1[1], c1[2], 255],
        [Math.round((c0[0] + c1[0]) / 2), Math.round((c0[1] + c1[1]) / 2), Math.round((c0[2] + c1[2]) / 2), 255],
        [0, 0, 0, 0],
    ];
}

function buildDxt5AlphaTable(alpha0: number, alpha1: number): number[] {
    if (alpha0 > alpha1) {
        return [
            alpha0,
            alpha1,
            Math.round((6 * alpha0 + alpha1) / 7),
            Math.round((5 * alpha0 + 2 * alpha1) / 7),
            Math.round((4 * alpha0 + 3 * alpha1) / 7),
            Math.round((3 * alpha0 + 4 * alpha1) / 7),
            Math.round((2 * alpha0 + 5 * alpha1) / 7),
            Math.round((alpha0 + 6 * alpha1) / 7),
        ];
    }

    return [
        alpha0,
        alpha1,
        Math.round((4 * alpha0 + alpha1) / 5),
        Math.round((3 * alpha0 + 2 * alpha1) / 5),
        Math.round((2 * alpha0 + 3 * alpha1) / 5),
        Math.round((alpha0 + 4 * alpha1) / 5),
        0,
        255,
    ];
}

function color565ToRgb(value: number): [number, number, number] {
    const r = (value >> 11) & 0x1f;
    const g = (value >> 5) & 0x3f;
    const b = value & 0x1f;
    return [
        Math.round((r * 255) / 31),
        Math.round((g * 255) / 63),
        Math.round((b * 255) / 31),
    ];
}

function readUint16(bytes: Uint8Array, offset: number): number {
    return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}
