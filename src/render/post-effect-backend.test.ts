import { describe, expect, it } from "vitest";
import { normalizePostEffectBackend } from "./post-effect-backend";

describe("normalizePostEffectBackend", () => {
    it("uses frame graph as the default backend", () => {
        expect(normalizePostEffectBackend(null)).toBe("frameGraph");
        expect(normalizePostEffectBackend("")).toBe("frameGraph");
        expect(normalizePostEffectBackend("unknown")).toBe("frameGraph");
        expect(normalizePostEffectBackend("classic")).toBe("classic");
    });

    it("uses the provided fallback for unknown values", () => {
        expect(normalizePostEffectBackend(null, "classic")).toBe("classic");
        expect(normalizePostEffectBackend("unknown", "classic")).toBe("classic");
    });

    it("accepts frame graph aliases for dev flags", () => {
        expect(normalizePostEffectBackend("frameGraph")).toBe("frameGraph");
        expect(normalizePostEffectBackend("frame-graph")).toBe("frameGraph");
        expect(normalizePostEffectBackend("frame_graph")).toBe("frameGraph");
    });
});
