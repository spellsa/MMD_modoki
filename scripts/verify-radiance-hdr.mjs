import fs from "node:fs";
import path from "node:path";

import {
    GetCubeMapTextureData,
    RGBE_ReadHeader,
    RGBE_ReadPixels,
} from "@babylonjs/core/Misc/HighDynamicRange/hdr.js";

// Decode through Babylon.js so this check matches the application's HDR path.

const inputPath = path.resolve(
    process.argv[2] ?? "src/assets/ibl-shadows/white.hdr",
);
const file = fs.readFileSync(inputPath);
const bytes = new Uint8Array(file.buffer, file.byteOffset, file.byteLength);
const header = RGBE_ReadHeader(bytes);
const pixels = RGBE_ReadPixels(bytes, header);

const equatorY = Math.floor(header.height / 2);
let sum = 0;
let squareSum = 0;
let minimum = Number.POSITIVE_INFINITY;
let maximum = Number.NEGATIVE_INFINITY;
let oppositeDifferenceSum = 0;
let maximumRgbChannelMismatch = 0;

for (let x = 0; x < header.width; x += 1) {
    const pixelIndex = (equatorY * header.width + x) * 3;
    const oppositeX = (x + header.width / 2) % header.width;
    const oppositeIndex = (equatorY * header.width + oppositeX) * 3;
    const value = pixels[pixelIndex];

    sum += value;
    squareSum += value * value;
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
    oppositeDifferenceSum += Math.abs(value - pixels[oppositeIndex]);
    maximumRgbChannelMismatch = Math.max(
        maximumRgbChannelMismatch,
        Math.abs(value - pixels[pixelIndex + 1]),
        Math.abs(value - pixels[pixelIndex + 2]),
    );
}

const equatorMean = sum / header.width;
const sourceBuffer = file.buffer.slice(
    file.byteOffset,
    file.byteOffset + file.byteLength,
);
const cubeMap = GetCubeMapTextureData(sourceBuffer, 64, false);

const report = {
    path: inputPath,
    width: header.width,
    height: header.height,
    cubeSize: cubeMap.size,
    equatorMean,
    equatorStandardDeviation: Math.sqrt(
        squareSum / header.width - equatorMean * equatorMean,
    ),
    equatorMinimum: minimum,
    equatorMaximum: maximum,
    equatorOppositeDifferenceRatio:
        oppositeDifferenceSum / header.width / equatorMean,
    maximumRgbChannelMismatch,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
