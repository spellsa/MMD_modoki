import { Constants } from "@babylonjs/core/Engines/constants";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";

export type LutAtlasData = {
    size: number;
    width: number;
    height: number;
    data: Uint8Array;
};

function parseNumericTokens(line: string): number[] | null {
    const tokens = line.trim().split(/\s+/);
    if (tokens.length === 0) return null;
    const values = tokens.map((token) => Number.parseFloat(token));
    return values.every(Number.isFinite) ? values : null;
}

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

function stripComment(line: string): string {
    const hashIndex = line.indexOf("#");
    const slashIndex = line.indexOf("//");
    let cutIndex = -1;
    if (hashIndex >= 0) cutIndex = hashIndex;
    if (slashIndex >= 0 && (cutIndex < 0 || slashIndex < cutIndex)) cutIndex = slashIndex;
    return cutIndex >= 0 ? line.slice(0, cutIndex) : line;
}

export function buildLutAtlasDataFrom3dlText(runtimeText: string): LutAtlasData {
    const lines = runtimeText
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map((line) => stripComment(line).trim())
        .filter((line) => line.length > 0);

    if (lines.length < 2) {
        throw new Error("3DL LUT text is empty");
    }

    const header = parseNumericTokens(lines[0]);
    if (!header || header.length < 2) {
        throw new Error("3DL LUT header is invalid");
    }

    const size = header.length;
    const expectedSampleCount = size * size * size;
    const samples = lines
        .slice(1)
        .map((line) => parseNumericTokens(line))
        .filter((tokens): tokens is number[] => !!tokens && tokens.length >= 3);

    if (samples.length < expectedSampleCount) {
        throw new Error(`3DL LUT has ${samples.length} samples, expected ${expectedSampleCount}`);
    }

    const width = size * size;
    const height = size;
    const data = new Uint8Array(width * height * 4);
    const valueScale = samples.some((sample) => sample[0] > 1 || sample[1] > 1 || sample[2] > 1)
        ? 1 / 4095
        : 1;

    let sampleIndex = 0;
    for (let r = 0; r < size; r += 1) {
        for (let g = 0; g < size; g += 1) {
            for (let b = 0; b < size; b += 1) {
                const sample = samples[sampleIndex];
                sampleIndex += 1;
                const x = r + b * size;
                const y = g;
                const offset = (y * width + x) * 4;
                data[offset] = Math.round(clamp01(sample[0] * valueScale) * 255);
                data[offset + 1] = Math.round(clamp01(sample[1] * valueScale) * 255);
                data[offset + 2] = Math.round(clamp01(sample[2] * valueScale) * 255);
                data[offset + 3] = 255;
            }
        }
    }

    return {
        size,
        width,
        height,
        data,
    };
}

export function createLutAtlasTextureFrom3dlText(scene: Scene, name: string, runtimeText: string): RawTexture {
    const atlas = buildLutAtlasDataFrom3dlText(runtimeText);
    const texture = new RawTexture(
        atlas.data,
        atlas.width,
        atlas.height,
        Constants.TEXTUREFORMAT_RGBA,
        scene,
        false,
        false,
        Texture.NEAREST_SAMPLINGMODE,
        Constants.TEXTURETYPE_UNSIGNED_BYTE,
    );
    texture.name = name;
    texture.gammaSpace = false;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    return texture;
}
