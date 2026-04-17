import { describe, expect, it } from "vitest";

import {
    buildProjectLutSavePlan,
    getCurrentLutPresetSelectValue,
    normalizeImportedLutPath,
    resolveLutSelection,
    type ImportedLutRegistryEntry,
} from "./lut-panel-state";

const importedEntry: ImportedLutRegistryEntry = {
    sourcePath: "C:\\Luts\\anime.cube",
    displayName: "anime.cube",
    rawText: "raw",
    runtimeText: "runtime",
    sourceFormat: "cube",
};

const getImportedEntry = (filePath: string): ImportedLutRegistryEntry | null => {
    return normalizeImportedLutPath(filePath) === normalizeImportedLutPath(importedEntry.sourcePath)
        ? importedEntry
        : null;
};

describe("normalizeImportedLutPath", () => {
    it("normalizes separators and case for registry keys", () => {
        expect(normalizeImportedLutPath("C:/LUTS/Anime.CUBE")).toBe("c:\\luts\\anime.cube");
        expect(normalizeImportedLutPath("C:\\LUTS\\\\Anime.CUBE")).toBe("c:\\luts\\anime.cube");
    });
});

describe("getCurrentLutPresetSelectValue", () => {
    it("returns the active imported source path when external LUT is registered", () => {
        expect(getCurrentLutPresetSelectValue({
            sourceMode: "external-absolute",
            externalPath: "c:/luts/anime.cube",
            builtinPreset: "anime-soft",
            getImportedEntry,
        })).toBe(importedEntry.sourcePath);
    });

    it("falls back to the external path when the registry entry is missing", () => {
        expect(getCurrentLutPresetSelectValue({
            sourceMode: "project-relative",
            externalPath: "luts/missing.3dl",
            builtinPreset: "anime-soft",
            getImportedEntry,
        })).toBe("luts/missing.3dl");
    });

    it("returns the builtin preset for builtin mode", () => {
        expect(getCurrentLutPresetSelectValue({
            sourceMode: "builtin",
            externalPath: importedEntry.sourcePath,
            builtinPreset: "sepia",
            getImportedEntry,
        })).toBe("sepia");
    });
});

describe("resolveLutSelection", () => {
    it("keeps project-relative mode for imported LUT selections", () => {
        expect(resolveLutSelection({
            selectedPresetValue: "c:/luts/anime.cube",
            requestedSourceMode: "project-relative",
            getImportedEntry,
        })).toEqual({
            selectedMode: "project-relative",
            hasLutSource: true,
            selectedImportedEntry: importedEntry,
        });
    });

    it("treats non-imported selections as builtin presets", () => {
        expect(resolveLutSelection({
            selectedPresetValue: "anime-soft",
            requestedSourceMode: "external-absolute",
            getImportedEntry,
        })).toEqual({
            selectedMode: "builtin",
            hasLutSource: true,
            selectedImportedEntry: null,
        });
    });
});

describe("buildProjectLutSavePlan", () => {
    const getBaseName = (filePath: string): string => filePath.replace(/^.*[\\/]/, "");

    it("clears external path for builtin LUTs", () => {
        expect(buildProjectLutSavePlan({
            sourceMode: "builtin",
            externalPath: importedEntry.sourcePath,
            externalText: importedEntry.rawText,
            getBaseName,
        })).toEqual({
            sourceMode: "builtin",
            externalPath: null,
            relativeFileName: null,
            externalText: null,
            disableLut: false,
        });
    });

    it("plans project-relative LUT sidecar output", () => {
        expect(buildProjectLutSavePlan({
            sourceMode: "project-relative",
            externalPath: importedEntry.sourcePath,
            externalText: importedEntry.rawText,
            getBaseName,
        })).toEqual({
            sourceMode: "project-relative",
            externalPath: "luts/anime.cube",
            relativeFileName: "anime.cube",
            externalText: "raw",
            disableLut: false,
        });
    });

    it("disables LUT when external mode has no loaded text", () => {
        expect(buildProjectLutSavePlan({
            sourceMode: "external-absolute",
            externalPath: importedEntry.sourcePath,
            externalText: null,
            getBaseName,
        })).toMatchObject({
            sourceMode: "external-absolute",
            externalPath: null,
            disableLut: true,
        });
    });
});
