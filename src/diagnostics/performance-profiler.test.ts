import { describe, expect, it } from "vitest";
import { normalizePerformanceLogMode, PerformanceProfiler } from "./performance-profiler";

describe("PerformanceProfiler", () => {
    it("summarizes section samples", () => {
        const profiler = new PerformanceProfiler(["scene", "postfx"] as const);

        profiler.record("scene", 10);
        profiler.record("scene", 14.2468);
        profiler.record("postfx", 1.5);

        expect(profiler.summarize()).toEqual({
            scene: { samples: 2, avgMs: 12.123, maxMs: 14.247 },
            postfx: { samples: 1, avgMs: 1.5, maxMs: 1.5 },
        });
    });

    it("ignores invalid durations and resets on request", () => {
        const profiler = new PerformanceProfiler(["frame"] as const);

        profiler.record("frame", Number.NaN);
        profiler.record("frame", -1);
        profiler.record("frame", 3);

        expect(profiler.summarizeAndReset()).toEqual({
            frame: { samples: 1, avgMs: 3, maxMs: 3 },
        });
        expect(profiler.summarize()).toEqual({
            frame: { samples: 0, avgMs: null, maxMs: null },
        });
    });

    it("normalizes localStorage log modes", () => {
        expect(normalizePerformanceLogMode("1")).toBe("summary");
        expect(normalizePerformanceLogMode("true")).toBe("summary");
        expect(normalizePerformanceLogMode("summary")).toBe("summary");
        expect(normalizePerformanceLogMode("trace")).toBe("trace");
        expect(normalizePerformanceLogMode("0")).toBe("off");
        expect(normalizePerformanceLogMode(null)).toBe("off");
    });
});
