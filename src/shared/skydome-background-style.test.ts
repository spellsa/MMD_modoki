import { describe, expect, it } from "vitest";
import {
    DEFAULT_SKYDOME_BACKGROUND_STYLE,
    colorToHex,
    hexToColor,
    normalizeSkydomeBackgroundStyle,
} from "./skydome-background-style";

describe("skydome background style", () => {
    it("uses the legacy light gray as the default BackgroundMaterial color", () => {
        expect(normalizeSkydomeBackgroundStyle(undefined)).toEqual(DEFAULT_SKYDOME_BACKGROUND_STYLE);
        expect(DEFAULT_SKYDOME_BACKGROUND_STYLE.mode).toBe("solid");
        expect(colorToHex(DEFAULT_SKYDOME_BACKGROUND_STYLE.topColor)).toBe("#c8c8c8");
        expect(colorToHex(DEFAULT_SKYDOME_BACKGROUND_STYLE.bottomColor)).toBe("#c8c8c8");
        expect(DEFAULT_SKYDOME_BACKGROUND_STYLE.brightness).toBe(1);
    });

    it("normalizes persisted values without sharing color objects", () => {
        const normalized = normalizeSkydomeBackgroundStyle({
            mode: "solid",
            topColor: { r: 2, g: -1, b: 0.5 },
            bottomColor: { r: Number.NaN, g: 0.25, b: 0.75 },
            brightness: 99,
        });

        expect(normalized).toEqual({
            mode: "solid",
            topColor: { r: 1, g: 0, b: 0.5 },
            bottomColor: {
                r: DEFAULT_SKYDOME_BACKGROUND_STYLE.bottomColor.r,
                g: 0.25,
                b: 0.75,
            },
            brightness: 2,
        });
        expect(normalized.topColor).not.toBe(DEFAULT_SKYDOME_BACKGROUND_STYLE.topColor);
        expect(normalized.bottomColor).not.toBe(DEFAULT_SKYDOME_BACKGROUND_STYLE.bottomColor);
    });

    it("converts color-picker values to and from normalized RGB", () => {
        expect(hexToColor("#336699")).toEqual({
            r: 0.2,
            g: 0.4,
            b: 0.6,
        });
        expect(hexToColor("invalid")).toBeNull();
        expect(colorToHex({ r: 0.2, g: 0.4, b: 0.6 })).toBe("#336699");
    });
});
