import { describe, expect, it } from "vitest";
import { normalizePostEffectBackend } from "./post-effect-backend";

describe("normalizePostEffectBackend", () => {
    it("keeps classic as the default backend", () => {
        expect(normalizePostEffectBackend(null)).toBe("classic");
        expect(normalizePostEffectBackend("")).toBe("classic");
        expect(normalizePostEffectBackend("unknown")).toBe("classic");
        expect(normalizePostEffectBackend("classic")).toBe("classic");
    });

    it("accepts frame graph aliases for dev flags", () => {
        expect(normalizePostEffectBackend("frameGraph")).toBe("frameGraph");
        expect(normalizePostEffectBackend("frame-graph")).toBe("frameGraph");
        expect(normalizePostEffectBackend("frame_graph")).toBe("frameGraph");
    });
});
