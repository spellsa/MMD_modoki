import type { PngEncodeSuccess, PngFilterStrategy } from "./png-encoder-protocol";

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_COLOR_TYPE_RGBA = 6;
const PNG_BIT_DEPTH_8 = 8;
const PNG_COMPRESSION_DEFLATE = 0;
const PNG_FILTER_ADAPTIVE = 0;
const PNG_INTERLACE_NONE = 0;
const PNG_FILTER_NONE = 0;

const createCrc32Table = (): Uint32Array => {
    const table = new Uint32Array(256);
    for (let value = 0; value < table.length; value += 1) {
        let crc = value;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
        }
        table[value] = crc >>> 0;
    }
    return table;
};

const CRC32_TABLE = createCrc32Table();

const calculateCrc32 = (bytes: Uint8Array): number => {
    let crc = 0xffffffff;
    for (let index = 0; index < bytes.byteLength; index += 1) {
        crc = CRC32_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
};

const validateRgbaInput = (rgba: Uint8Array, width: number, height: number): void => {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
        throw new Error(`Invalid PNG dimensions: ${width}x${height}`);
    }
    const expectedByteLength = width * height * 4;
    if (!Number.isSafeInteger(expectedByteLength) || rgba.byteLength !== expectedByteLength) {
        throw new Error(
            `RGBA byte length mismatch: expected ${expectedByteLength}, received ${rgba.byteLength}`,
        );
    }
};

export const createNoneFilteredScanlines = (
    rgba: Uint8Array,
    width: number,
    height: number,
): Uint8Array<ArrayBuffer> => {
    validateRgbaInput(rgba, width, height);
    const sourceStride = width * 4;
    const targetStride = sourceStride + 1;
    const filtered = new Uint8Array(targetStride * height);
    for (let row = 0; row < height; row += 1) {
        const sourceOffset = row * sourceStride;
        const targetOffset = row * targetStride;
        filtered[targetOffset] = PNG_FILTER_NONE;
        filtered.set(rgba.subarray(sourceOffset, sourceOffset + sourceStride), targetOffset + 1);
    }
    return filtered;
};

const createChunkTypeBytes = (type: string): Uint8Array => {
    if (!/^[A-Za-z]{4}$/.test(type)) {
        throw new Error(`Invalid PNG chunk type: ${type}`);
    }
    return new Uint8Array([
        type.charCodeAt(0),
        type.charCodeAt(1),
        type.charCodeAt(2),
        type.charCodeAt(3),
    ]);
};

export const createPngChunk = (type: string, data: Uint8Array): Uint8Array<ArrayBuffer> => {
    if (data.byteLength > 0x7fffffff) {
        throw new Error(`PNG chunk is too large: ${data.byteLength}`);
    }
    const typeBytes = createChunkTypeBytes(type);
    const chunk = new Uint8Array(12 + data.byteLength);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, data.byteLength, false);
    chunk.set(typeBytes, 4);
    chunk.set(data, 8);
    const crcInput = chunk.subarray(4, 8 + data.byteLength);
    view.setUint32(8 + data.byteLength, calculateCrc32(crcInput), false);
    return chunk;
};

const createIhdrData = (width: number, height: number): Uint8Array<ArrayBuffer> => {
    const ihdr = new Uint8Array(13);
    const view = new DataView(ihdr.buffer);
    view.setUint32(0, width, false);
    view.setUint32(4, height, false);
    ihdr[8] = PNG_BIT_DEPTH_8;
    ihdr[9] = PNG_COLOR_TYPE_RGBA;
    ihdr[10] = PNG_COMPRESSION_DEFLATE;
    ihdr[11] = PNG_FILTER_ADAPTIVE;
    ihdr[12] = PNG_INTERLACE_NONE;
    return ihdr;
};

const concatBytes = (parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> => {
    const byteLength = parts.reduce((total, part) => total + part.byteLength, 0);
    const result = new Uint8Array(byteLength);
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.byteLength;
    }
    return result;
};

const compressZlib = async (bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> => {
    if (typeof CompressionStream !== "function") {
        throw new Error("CompressionStream is unavailable");
    }
    const compressionStream = new CompressionStream("deflate");
    const outputPromise = new Response(compressionStream.readable).arrayBuffer();
    const writer = compressionStream.writable.getWriter();
    await writer.write(bytes);
    await writer.close();
    return new Uint8Array(await outputPromise);
};

export const encodeRgba8ToPng = async (
    rgba: Uint8Array,
    width: number,
    height: number,
    filterStrategy: PngFilterStrategy = "none",
): Promise<Omit<PngEncodeSuccess, "type" | "taskId">> => {
    if (filterStrategy !== "none") {
        throw new Error(`Unsupported PNG filter strategy: ${String(filterStrategy)}`);
    }
    validateRgbaInput(rgba, width, height);

    const encodeStartedAt = performance.now();
    const filterStartedAt = performance.now();
    const filtered = createNoneFilteredScanlines(rgba, width, height);
    const filterMs = performance.now() - filterStartedAt;

    const deflateStartedAt = performance.now();
    const compressed = await compressZlib(filtered);
    const deflateMs = performance.now() - deflateStartedAt;

    const assembleStartedAt = performance.now();
    const png = concatBytes([
        PNG_SIGNATURE,
        createPngChunk("IHDR", createIhdrData(width, height)),
        createPngChunk("IDAT", compressed),
        createPngChunk("IEND", new Uint8Array()),
    ]);
    const assembleMs = performance.now() - assembleStartedAt;

    return {
        pngBuffer: png.buffer,
        byteLength: png.byteLength,
        filterStrategy,
        encodeMs: performance.now() - encodeStartedAt,
        filterMs,
        deflateMs,
        assembleMs,
    };
};
