import { describe, expect, it } from "vitest";

import { isSupportedLutFilePath, normalizeLutFile } from "./lut-file";

const identityCube2 = [
    "TITLE \"identity\"",
    "# comments and empty lines should be ignored",
    "",
    "LUT_3D_SIZE 2",
    "0 0 0",
    "1 0 0",
    "0 1 0",
    "1 1 0",
    "0 0 1",
    "1 0 1",
    "0 1 1",
    "1 1 1",
].join("\n");

describe("isSupportedLutFilePath", () => {
    it("accepts .cube and .3dl paths case-insensitively", () => {
        expect(isSupportedLutFilePath("look.cube")).toBe(true);
        expect(isSupportedLutFilePath("C:\\luts\\look.CUBE")).toBe(true);
        expect(isSupportedLutFilePath("/luts/look.3dl")).toBe(true);
    });

    it("rejects unsupported extensions", () => {
        expect(isSupportedLutFilePath("look.txt")).toBe(false);
        expect(isSupportedLutFilePath("look")).toBe(false);
    });
});

describe("normalizeLutFile", () => {
    it("passes .3dl text through for runtime use", () => {
        const sourceText = "0 1\n0 0 0\n4095 4095 4095\n";
        const normalized = normalizeLutFile("C:\\luts\\soft.3dl", sourceText);

        expect(normalized.sourceFormat).toBe("3dl");
        expect(normalized.displayName).toBe("soft.3dl");
        expect(normalized.runtimeText).toBe(sourceText);
        expect(normalized.rawText).toBe(sourceText);
    });

    it("converts a minimal .cube file to runtime .3dl text", () => {
        const normalized = normalizeLutFile("/luts/identity.cube", identityCube2);
        const lines = normalized.runtimeText.trim().split("\n");

        expect(normalized.sourceFormat).toBe("cube");
        expect(normalized.displayName).toBe("identity.cube");
        expect(lines).toHaveLength(9);
        expect(lines[0]).toBe("0 1");
        expect(lines).toContain("0 0 0");
        expect(lines).toContain("4095 4095 4095");
    });

    it("throws when .cube data length does not match the declared size", () => {
        const malformedCube = [
            "LUT_3D_SIZE 2",
            "0 0 0",
            "1 0 0",
        ].join("\n");

        expect(() => normalizeLutFile("broken.cube", malformedCube))
            .toThrow("Cube LUT data length mismatch: expected 8, got 2");
    });

    it("throws for unsupported file types and empty content", () => {
        expect(() => normalizeLutFile("look.txt", "0 0 0"))
            .toThrow("Unsupported LUT file type: look.txt");
        expect(() => normalizeLutFile("empty.cube", "  \n "))
            .toThrow("LUT file is empty");
    });
});
