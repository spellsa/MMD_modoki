export type SkydomeBackgroundMode = "gradient" | "solid";

export type SkydomeBackgroundColor = {
    r: number;
    g: number;
    b: number;
};

export type SkydomeBackgroundStyle = {
    mode: SkydomeBackgroundMode;
    topColor: SkydomeBackgroundColor;
    bottomColor: SkydomeBackgroundColor;
    brightness: number;
};

export const DEFAULT_SKYDOME_BACKGROUND_STYLE: Readonly<SkydomeBackgroundStyle> = Object.freeze({
    mode: "solid",
    topColor: Object.freeze({ r: 200 / 255, g: 200 / 255, b: 200 / 255 }),
    bottomColor: Object.freeze({ r: 200 / 255, g: 200 / 255, b: 200 / 255 }),
    brightness: 1,
});

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function normalizeComponent(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value)
        ? clamp(value, 0, 1)
        : fallback;
}

function normalizeColor(
    value: unknown,
    fallback: Readonly<SkydomeBackgroundColor>,
): SkydomeBackgroundColor {
    if (!isRecord(value)) {
        return { r: fallback.r, g: fallback.g, b: fallback.b };
    }
    return {
        r: normalizeComponent(value.r, fallback.r),
        g: normalizeComponent(value.g, fallback.g),
        b: normalizeComponent(value.b, fallback.b),
    };
}

export function normalizeSkydomeBackgroundStyle(value: unknown): SkydomeBackgroundStyle {
    const source = isRecord(value) ? value : {};
    const brightness = typeof source.brightness === "number" && Number.isFinite(source.brightness)
        ? clamp(source.brightness, 0.25, 2)
        : DEFAULT_SKYDOME_BACKGROUND_STYLE.brightness;
    return {
        mode: source.mode === "gradient" || source.mode === "solid"
            ? source.mode
            : DEFAULT_SKYDOME_BACKGROUND_STYLE.mode,
        topColor: normalizeColor(source.topColor, DEFAULT_SKYDOME_BACKGROUND_STYLE.topColor),
        bottomColor: normalizeColor(source.bottomColor, DEFAULT_SKYDOME_BACKGROUND_STYLE.bottomColor),
        brightness,
    };
}

export function colorToHex(color: Readonly<SkydomeBackgroundColor>): string {
    const componentToHex = (value: number): string => Math.round(clamp(value, 0, 1) * 255)
        .toString(16)
        .padStart(2, "0");
    return `#${componentToHex(color.r)}${componentToHex(color.g)}${componentToHex(color.b)}`;
}

export function hexToColor(value: string): SkydomeBackgroundColor | null {
    const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value.trim());
    if (!match) return null;
    return {
        r: Number.parseInt(match[1], 16) / 255,
        g: Number.parseInt(match[2], 16) / 255,
        b: Number.parseInt(match[3], 16) / 255,
    };
}
