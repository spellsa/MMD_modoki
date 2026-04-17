export type LutSourceMode = "builtin" | "external-absolute" | "project-relative";

export type ImportedLutRegistryEntry = {
    sourcePath: string;
    displayName: string;
    rawText: string;
    runtimeText: string;
    sourceFormat: "3dl" | "cube";
};

export type LutSelectionResolution = {
    selectedMode: LutSourceMode;
    hasLutSource: boolean;
    selectedImportedEntry: ImportedLutRegistryEntry | null;
};

export type ProjectLutSavePlan = {
    sourceMode: LutSourceMode;
    externalPath: string | null;
    relativeFileName: string | null;
    externalText: string | null;
    disableLut: boolean;
};

export function normalizeImportedLutPath(filePath: string): string {
    return filePath.replace(/[\\/]+/g, "\\").toLowerCase();
}

export function getCurrentLutPresetSelectValue(params: {
    sourceMode: LutSourceMode;
    externalPath: string | null;
    builtinPreset: string;
    getImportedEntry: (filePath: string) => ImportedLutRegistryEntry | null;
}): string {
    if (params.sourceMode !== "builtin") {
        const activeImportedEntry = params.externalPath ? params.getImportedEntry(params.externalPath) : null;
        if (activeImportedEntry) {
            return activeImportedEntry.sourcePath;
        }
        if (params.externalPath) {
            return params.externalPath;
        }
    }
    return params.builtinPreset;
}

export function resolveLutSelection(params: {
    selectedPresetValue: string;
    requestedSourceMode: string;
    getImportedEntry: (filePath: string) => ImportedLutRegistryEntry | null;
}): LutSelectionResolution {
    const selectedImportedEntry = params.getImportedEntry(params.selectedPresetValue);
    if (!selectedImportedEntry) {
        return {
            selectedMode: "builtin",
            hasLutSource: true,
            selectedImportedEntry: null,
        };
    }

    return {
        selectedMode: params.requestedSourceMode === "project-relative" ? "project-relative" : "external-absolute",
        hasLutSource: true,
        selectedImportedEntry,
    };
}

export function buildProjectLutSavePlan(params: {
    sourceMode: LutSourceMode;
    externalPath: string | null;
    externalText: string | null;
    getBaseName: (filePath: string) => string;
}): ProjectLutSavePlan {
    if (params.sourceMode === "builtin") {
        return {
            sourceMode: "builtin",
            externalPath: null,
            relativeFileName: null,
            externalText: null,
            disableLut: false,
        };
    }

    if (!params.externalPath || !params.externalText) {
        return {
            sourceMode: params.sourceMode,
            externalPath: null,
            relativeFileName: null,
            externalText: null,
            disableLut: true,
        };
    }

    if (params.sourceMode === "project-relative") {
        const relativeFileName = params.getBaseName(params.externalPath) || "external_lut.cube";
        return {
            sourceMode: "project-relative",
            externalPath: `luts/${relativeFileName}`,
            relativeFileName,
            externalText: params.externalText,
            disableLut: false,
        };
    }

    return {
        sourceMode: "external-absolute",
        externalPath: params.externalPath,
        relativeFileName: null,
        externalText: null,
        disableLut: false,
    };
}
