export type LutFileFormat = "3dl" | "cube";

export interface NormalizedLutFile {
    sourceFormat: LutFileFormat;
    displayName: string;
    runtimeText: string;
    rawText: string;
}

type CubeKind = "1d" | "3d";

type CubeSection = {
    kind: CubeKind;
    size: number;
    samples: Float32Array;
};

type CubeParsedFile = {
    oneD: CubeSection | null;
    threeD: CubeSection | null;
    domainMin: [number, number, number];
    domainMax: [number, number, number];
    inputRange: [number, number] | null;
};

function getFileExtension(filePath: string): string {
    const normalized = filePath.replace(/\\/g, "/");
    const fileName = normalized.substring(normalized.lastIndexOf("/") + 1);
    const dot = fileName.lastIndexOf(".");
    if (dot < 0) return "";
    return fileName.substring(dot + 1).toLowerCase();
}

function getBaseName(filePath: string): string {
    const normalized = filePath.replace(/[\\/]+$/, "");
    const index = Math.max(normalized.lastIndexOf("\\"), normalized.lastIndexOf("/"));
    if (index < 0) return normalized;
    return normalized.slice(index + 1);
}

function isSupportedCubeLutExtension(extension: string): extension is LutFileFormat {
    return extension === "3dl" || extension === "cube";
}

function stripCubeComment(line: string): string {
    const hashIndex = line.indexOf("#");
    const slashIndex = line.indexOf("//");
    let cutIndex = -1;
    if (hashIndex >= 0) cutIndex = hashIndex;
    if (slashIndex >= 0 && (cutIndex < 0 || slashIndex < cutIndex)) cutIndex = slashIndex;
    return cutIndex >= 0 ? line.slice(0, cutIndex) : line;
}

function parseFloatTokens(tokens: string[], expectedCount: number): number[] | null {
    if (tokens.length < expectedCount) return null;
    const values: number[] = [];
    for (let index = 0; index < expectedCount; index += 1) {
        const value = Number.parseFloat(tokens[index]);
        if (!Number.isFinite(value)) return null;
        values.push(value);
    }
    return values;
}

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function mapToSampleCoordinate(value: number, min: number, max: number, size: number): number {
    if (size <= 1) return 0;
    if (!Number.isFinite(value)) return 0;
    if (!Number.isFinite(min) || !Number.isFinite(max) || Math.abs(max - min) < 1e-12) {
        return clamp01(value) * (size - 1);
    }
    return clamp01((value - min) / (max - min)) * (size - 1);
}

function getCubeSampleIndex(size: number, r: number, g: number, b: number): number {
    return (r + g * size + b * size * size) * 3;
}

function getChannelSample(samples: Float32Array, index: number, channel: 0 | 1 | 2): number {
    const sampleIndex = index * 3 + channel;
    return sampleIndex >= 0 && sampleIndex < samples.length ? samples[sampleIndex] : 0;
}

function sampleOneDimensionalChannel(
    samples: Float32Array,
    size: number,
    channel: 0 | 1 | 2,
    value: number,
    min: number,
    max: number,
): number {
    if (size <= 0 || samples.length === 0) {
        return 0;
    }
    const coordinate = mapToSampleCoordinate(value, min, max, size);
    const left = Math.max(0, Math.min(size - 1, Math.floor(coordinate)));
    const right = Math.max(0, Math.min(size - 1, left + 1));
    const factor = coordinate - left;
    const leftValue = getChannelSample(samples, left, channel);
    const rightValue = getChannelSample(samples, right, channel);
    return lerp(leftValue, rightValue, factor);
}

function sampleOneDimensionalCube(
    section: CubeSection,
    color: [number, number, number],
    domainMin: [number, number, number],
    domainMax: [number, number, number],
    inputRange: [number, number] | null,
): [number, number, number] {
    const minMax = inputRange
        ? ([inputRange[0], inputRange[1]] as const)
        : null;
    return [
        sampleOneDimensionalChannel(section.samples, section.size, 0, color[0], minMax ? minMax[0] : domainMin[0], minMax ? minMax[1] : domainMax[0]),
        sampleOneDimensionalChannel(section.samples, section.size, 1, color[1], minMax ? minMax[0] : domainMin[1], minMax ? minMax[1] : domainMax[1]),
        sampleOneDimensionalChannel(section.samples, section.size, 2, color[2], minMax ? minMax[0] : domainMin[2], minMax ? minMax[1] : domainMax[2]),
    ];
}

function addScaled3(base: [number, number, number], delta: [number, number, number], scale: number): [number, number, number] {
    return [
        base[0] + delta[0] * scale,
        base[1] + delta[1] * scale,
        base[2] + delta[2] * scale,
    ];
}

function sampleThreeDimensionalCube(
    section: CubeSection,
    color: [number, number, number],
    domainMin: [number, number, number],
    domainMax: [number, number, number],
): [number, number, number] {
    const coordinateR = mapToSampleCoordinate(color[0], domainMin[0], domainMax[0], section.size);
    const coordinateG = mapToSampleCoordinate(color[1], domainMin[1], domainMax[1], section.size);
    const coordinateB = mapToSampleCoordinate(color[2], domainMin[2], domainMax[2], section.size);

    const r0 = Math.max(0, Math.min(section.size - 1, Math.floor(coordinateR)));
    const g0 = Math.max(0, Math.min(section.size - 1, Math.floor(coordinateG)));
    const b0 = Math.max(0, Math.min(section.size - 1, Math.floor(coordinateB)));
    const r1 = Math.max(0, Math.min(section.size - 1, r0 + 1));
    const g1 = Math.max(0, Math.min(section.size - 1, g0 + 1));
    const b1 = Math.max(0, Math.min(section.size - 1, b0 + 1));

    const tr = coordinateR - r0;
    const tg = coordinateG - g0;
    const tb = coordinateB - b0;

    const sample = (r: number, g: number, b: number): [number, number, number] => {
        const index = getCubeSampleIndex(section.size, r, g, b);
        return [
            section.samples[index] ?? 0,
            section.samples[index + 1] ?? 0,
            section.samples[index + 2] ?? 0,
        ];
    };

    const c000 = sample(r0, g0, b0);
    const c100 = sample(r1, g0, b0);
    const c010 = sample(r0, g1, b0);
    const c110 = sample(r1, g1, b0);
    const c001 = sample(r0, g0, b1);
    const c101 = sample(r1, g0, b1);
    const c011 = sample(r0, g1, b1);
    const c111 = sample(r1, g1, b1);

    if (tr >= tg) {
        if (tg >= tb) {
            return addScaled3(
                addScaled3(addScaled3(c000, [c100[0] - c000[0], c100[1] - c000[1], c100[2] - c000[2]], tr), [c110[0] - c100[0], c110[1] - c100[1], c110[2] - c100[2]], tg),
                [c111[0] - c110[0], c111[1] - c110[1], c111[2] - c110[2]],
                tb,
            );
        }
        if (tr >= tb) {
            return addScaled3(
                addScaled3(addScaled3(c000, [c100[0] - c000[0], c100[1] - c000[1], c100[2] - c000[2]], tr), [c101[0] - c100[0], c101[1] - c100[1], c101[2] - c100[2]], tb),
                [c111[0] - c101[0], c111[1] - c101[1], c111[2] - c101[2]],
                tg,
            );
        }
        return addScaled3(
            addScaled3(addScaled3(c000, [c001[0] - c000[0], c001[1] - c000[1], c001[2] - c000[2]], tb), [c101[0] - c001[0], c101[1] - c001[1], c101[2] - c001[2]], tr),
            [c111[0] - c101[0], c111[1] - c101[1], c111[2] - c101[2]],
            tg,
        );
    }
    if (tr >= tb) {
        return addScaled3(
            addScaled3(addScaled3(c000, [c010[0] - c000[0], c010[1] - c000[1], c010[2] - c000[2]], tg), [c110[0] - c010[0], c110[1] - c010[1], c110[2] - c010[2]], tr),
            [c111[0] - c110[0], c111[1] - c110[1], c111[2] - c110[2]],
            tb,
        );
    }
    if (tg >= tb) {
        return addScaled3(
            addScaled3(addScaled3(c000, [c010[0] - c000[0], c010[1] - c000[1], c010[2] - c000[2]], tg), [c011[0] - c010[0], c011[1] - c010[1], c011[2] - c010[2]], tb),
            [c111[0] - c011[0], c111[1] - c011[1], c111[2] - c011[2]],
            tr,
        );
    }
    return addScaled3(
        addScaled3(addScaled3(c000, [c001[0] - c000[0], c001[1] - c000[1], c001[2] - c000[2]], tb), [c011[0] - c001[0], c011[1] - c001[1], c011[2] - c001[2]], tg),
        [c111[0] - c011[0], c111[1] - c011[1], c111[2] - c011[2]],
        tr,
    );
}

function evaluateCubeAtColor(parsed: CubeParsedFile, color: [number, number, number]): [number, number, number] {
    let currentColor = color;
    if (parsed.oneD) {
        currentColor = sampleOneDimensionalCube(parsed.oneD, currentColor, parsed.domainMin, parsed.domainMax, parsed.inputRange);
    }
    if (parsed.threeD) {
        return sampleThreeDimensionalCube(parsed.threeD, currentColor, parsed.domainMin, parsed.domainMax);
    }
    return currentColor;
}

function parseCubeSectionHeader(tokens: string[]): CubeSection | null {
    if (tokens.length === 0) return null;

    const kind = tokens[0] === "LUT_1D_SIZE"
        ? "1d"
        : tokens[0] === "LUT_3D_SIZE"
            ? "3d"
            : null;
    if (!kind) return null;

    const size = Number.parseInt(tokens[1] ?? "", 10);
    if (!Number.isFinite(size) || size <= 0) return null;

    return {
        size,
        kind,
        samples: new Float32Array(0),
    };
}

function parseCubeFile(sourceText: string): CubeParsedFile {
    const lines = sourceText.replace(/\r\n?/g, "\n").split("\n");
    let activeSectionKind: CubeKind | null = null;
    let oneDSize = 0;
    let threeDSize = 0;
    let domainMin: [number, number, number] = [0, 0, 0];
    let domainMax: [number, number, number] = [1, 1, 1];
    let inputRange: [number, number] | null = null;
    const oneDData: number[][] = [];
    const threeDData: number[][] = [];

    for (const rawLine of lines) {
        const line = stripCubeComment(rawLine).trim();
        if (line.length === 0) {
            continue;
        }

        const tokens = line.split(/\s+/);
        const header = parseCubeSectionHeader(tokens);
        if (header) {
            activeSectionKind = header.kind;
            if (header.kind === "1d") {
                oneDSize = header.size;
            } else {
                threeDSize = header.size;
            }
            continue;
        }

        const keyword = tokens[0];
        if (keyword === "TITLE") {
            continue;
        }
        if (keyword === "DOMAIN_MIN") {
            const values = parseFloatTokens(tokens.slice(1), 3);
            if (values) {
                domainMin = [values[0], values[1], values[2]];
            }
            continue;
        }
        if (keyword === "DOMAIN_MAX") {
            const values = parseFloatTokens(tokens.slice(1), 3);
            if (values) {
                domainMax = [values[0], values[1], values[2]];
            }
            continue;
        }
        if (keyword === "LUT_1D_INPUT_RANGE") {
            const values = parseFloatTokens(tokens.slice(1), 2);
            if (values) {
                inputRange = [values[0], values[1]];
            }
            continue;
        }

        const values = parseFloatTokens(tokens, 3);
        if (!values) {
            throw new Error(`Invalid cube data line: ${rawLine}`);
        }
        if (activeSectionKind === "1d") {
            oneDData.push(values);
        } else if (activeSectionKind === "3d") {
            threeDData.push(values);
        } else {
            oneDData.push(values);
        }
    }

    const hasValid3dData = threeDSize > 0 && threeDData.length === threeDSize * threeDSize * threeDSize;
    const hasValid1dData = oneDSize > 0 && oneDData.length === oneDSize;

    if (threeDSize > 0 && !hasValid3dData) {
        throw new Error(`Cube LUT data length mismatch: expected ${threeDSize * threeDSize * threeDSize}, got ${threeDData.length}`);
    }
    if (oneDSize > 0 && !hasValid1dData) {
        throw new Error(`Cube LUT data length mismatch: expected ${oneDSize}, got ${oneDData.length}`);
    }

    let oneDSection: CubeSection | null = null;
    let threeDSection: CubeSection | null = null;

    if (hasValid1dData) {
        const samples = new Float32Array(oneDSize * 3);
        for (let index = 0; index < oneDData.length; index += 1) {
            const sample = oneDData[index];
            if (!sample) {
                throw new Error("Cube LUT sample missing");
            }
            const offset = index * 3;
            samples[offset] = sample[0];
            samples[offset + 1] = sample[1];
            samples[offset + 2] = sample[2];
        }
        oneDSection = {
            kind: "1d",
            size: oneDSize,
            samples,
        };
    }

    if (hasValid3dData) {
        const samples = new Float32Array(threeDSize * threeDSize * threeDSize * 3);
        let index = 0;
        for (let b = 0; b < threeDSize; b += 1) {
            for (let g = 0; g < threeDSize; g += 1) {
                for (let r = 0; r < threeDSize; r += 1) {
                    const sample = threeDData[index];
                    if (!sample) {
                        throw new Error("Cube LUT sample missing");
                    }
                    const offset = getCubeSampleIndex(threeDSize, r, g, b);
                    samples[offset] = sample[0];
                    samples[offset + 1] = sample[1];
                    samples[offset + 2] = sample[2];
                    index += 1;
                }
            }
        }
        threeDSection = {
            kind: "3d",
            size: threeDSize,
            samples,
        };
    }

    if (!oneDSection && !threeDSection && threeDData.length > 0) {
        const cubeRoot = Math.round(Math.cbrt(threeDData.length));
        if (cubeRoot > 0 && cubeRoot * cubeRoot * cubeRoot === threeDData.length) {
            const samples = new Float32Array(cubeRoot * cubeRoot * cubeRoot * 3);
            let index = 0;
            for (let b = 0; b < cubeRoot; b += 1) {
                for (let g = 0; g < cubeRoot; g += 1) {
                    for (let r = 0; r < cubeRoot; r += 1) {
                        const sample = threeDData[index];
                        if (!sample) {
                            throw new Error("Cube LUT sample missing");
                        }
                        const offset = getCubeSampleIndex(cubeRoot, r, g, b);
                        samples[offset] = sample[0];
                        samples[offset + 1] = sample[1];
                        samples[offset + 2] = sample[2];
                        index += 1;
                    }
                }
            }
            threeDSection = {
                kind: "3d",
                size: cubeRoot,
                samples,
            };
        }
    }

    if (!oneDSection && !threeDSection && oneDData.length > 0) {
        const samples = new Float32Array(oneDData.length * 3);
        for (let index = 0; index < oneDData.length; index += 1) {
            const sample = oneDData[index];
            if (!sample) {
                throw new Error("Cube LUT sample missing");
            }
            const offset = index * 3;
            samples[offset] = sample[0];
            samples[offset + 1] = sample[1];
            samples[offset + 2] = sample[2];
        }
        oneDSection = {
            kind: "1d",
            size: oneDData.length,
            samples,
        };
    }

    if (!oneDSection && !threeDSection) {
        throw new Error("Cube LUT file is empty");
    }

    return {
        oneD: oneDSection,
        threeD: threeDSection,
        domainMin,
        domainMax,
        inputRange,
    };
}

function build3dlHeader(size: number): string {
    return Array.from({ length: size }, (_, index) => String(index)).join(" ");
}

function format3dlValue(value: number): string {
    const normalized = Math.max(0, Math.min(1, value));
    return String(Math.round(normalized * 4095));
}

function buildRuntime3dlTextFromCube(parsed: CubeParsedFile): string {
    const outputSize = parsed.threeD?.size
        ?? (parsed.oneD ? Math.max(16, Math.min(32, parsed.oneD.size)) : 0);
    if (outputSize <= 0) {
        throw new Error("Cube LUT file is empty");
    }
    const lines: string[] = [build3dlHeader(outputSize)];

    for (let r = 0; r < outputSize; r += 1) {
        for (let g = 0; g < outputSize; g += 1) {
            for (let b = 0; b < outputSize; b += 1) {
                const color = [
                    outputSize <= 1 ? 0 : r / (outputSize - 1),
                    outputSize <= 1 ? 0 : g / (outputSize - 1),
                    outputSize <= 1 ? 0 : b / (outputSize - 1),
                ] as [number, number, number];
                const sample = evaluateCubeAtColor(parsed, color);
                lines.push(`${format3dlValue(sample[0])} ${format3dlValue(sample[1])} ${format3dlValue(sample[2])}`);
            }
        }
    }

    return `${lines.join("\n")}\n`;
}

export function normalizeLutFile(filePath: string, sourceText: string): NormalizedLutFile {
    const extension = getFileExtension(filePath);
    if (!isSupportedCubeLutExtension(extension)) {
        throw new Error(`Unsupported LUT file type: ${filePath}`);
    }

    const trimmedText = sourceText.trim();
    if (trimmedText.length === 0) {
        throw new Error("LUT file is empty");
    }

    if (extension === "3dl") {
        return {
            sourceFormat: "3dl",
            displayName: getBaseName(filePath) || filePath,
            runtimeText: sourceText,
            rawText: sourceText,
        };
    }

    const parsed = parseCubeFile(sourceText);
    return {
        sourceFormat: "cube",
        displayName: getBaseName(filePath) || filePath,
        runtimeText: buildRuntime3dlTextFromCube(parsed),
        rawText: sourceText,
    };
}

export function isSupportedLutFilePath(filePath: string): boolean {
    return isSupportedCubeLutExtension(getFileExtension(filePath));
}
