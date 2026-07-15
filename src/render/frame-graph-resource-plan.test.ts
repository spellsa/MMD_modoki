import { describe, expect, it } from "vitest";
import {
    buildFrameGraphResourcePlan,
    type FrameGraphResourcePlanSettings,
} from "./frame-graph-resource-plan";

function createSettings(
    overrides: Partial<FrameGraphResourcePlanSettings> = {},
): FrameGraphResourcePlanSettings {
    return {
        imageProcessingEnabled: false,
        dofEnabled: false,
        luminousEnabled: false,
        luminousIntensity: 0.5,
        bloomEnabled: false,
        lutEnabled: false,
        sharpenEdge: 0,
        grainIntensity: 0,
        chromaticAberration: 0,
        vignetteEnabled: false,
        vignetteWeight: 0,
        edgeBlurStrength: 0,
        lensDistortionEnabled: false,
        lensDistortion: 0,
        ssaoEnabled: false,
        ssaoStrength: 1,
        offsetShadowEnabled: false,
        offsetShadowStrength: 0.35,
        offsetHighlightEnabled: false,
        offsetHighlightStrength: 0.55,
        ssrEnabled: false,
        ssrStrength: 0.3,
        antialiasEnabled: true,
        ...overrides,
    };
}

describe("buildFrameGraphResourcePlan", () => {
    it("keeps color-only effects on scene color without geometry resources", () => {
        const plan = buildFrameGraphResourcePlan(createSettings({
            luminousEnabled: true,
            bloomEnabled: true,
            lutEnabled: true,
        }), ["luminous", "bloom", "lut"]);

        expect(plan.activeEffects).toEqual(["luminous", "bloom", "lut"]);
        expect(plan.requirementKeys).toEqual(["sceneColor", "luminousMask"]);
        expect(plan.needsGeometryRenderer).toBe(false);
        expect(plan.needsDepthRenderer).toBe(false);
        expect(plan.needsLuminousMask).toBe(true);
        expect(plan.requirements).toContainEqual({
            key: "luminousMask",
            consumers: ["luminous"],
            producer: "luminousMask",
            resolution: "full",
        });
    });

    it("uses one geometry plan for SSR and SSAO", () => {
        const plan = buildFrameGraphResourcePlan(createSettings({
            ssrEnabled: true,
            ssaoEnabled: true,
        }), ["ssao", "ssr"]);

        expect(plan.activeEffects).toEqual(["ssr", "ssao"]);
        expect(plan.needsGeometryRenderer).toBe(true);
        expect(plan.needsDepthRenderer).toBe(false);
        expect(plan.requirements).toContainEqual({
            key: "viewDepth",
            consumers: ["ssr", "ssao"],
            producer: "geometryRenderer",
            resolution: "full",
        });
        expect(plan.requirements).toContainEqual({
            key: "viewNormal",
            consumers: ["ssr", "ssao"],
            producer: "geometryRenderer",
            resolution: "full",
        });
        expect(plan.requirements).toContainEqual({
            key: "reflectivity",
            consumers: ["ssr"],
            producer: "geometryRenderer",
            resolution: "full",
        });
    });

    it("uses geometry depth for Offset Shadow", () => {
        const plan = buildFrameGraphResourcePlan(createSettings({
            offsetShadowEnabled: true,
            offsetShadowStrength: 0.55,
        }), ["offsetShadow"]);

        expect(plan.activeEffects).toEqual(["offsetShadow"]);
        expect(plan.needsGeometryRenderer).toBe(true);
        expect(plan.requirements).toContainEqual({
            key: "viewDepth",
            consumers: ["offsetShadow"],
            producer: "geometryRenderer",
            resolution: "full",
        });
        expect(plan.requirementKeys).not.toContain("viewNormal");
    });

    it("uses geometry depth for Offset Rim", () => {
        const plan = buildFrameGraphResourcePlan(createSettings({
            offsetHighlightEnabled: true,
            offsetHighlightStrength: 0.55,
        }), ["offsetHighlight"]);

        expect(plan.activeEffects).toEqual(["offsetHighlight"]);
        expect(plan.needsGeometryRenderer).toBe(true);
        expect(plan.requirements).toContainEqual({
            key: "viewDepth",
            consumers: ["offsetHighlight"],
            producer: "geometryRenderer",
            resolution: "full",
        });
        expect(plan.requirementKeys).not.toContain("viewNormal");
    });

    it("keeps DoF scene depth separate from geometry view depth", () => {
        const plan = buildFrameGraphResourcePlan(createSettings({
            dofEnabled: true,
            ssaoEnabled: true,
        }), ["dof", "ssao"]);

        expect(plan.needsDepthRenderer).toBe(true);
        expect(plan.needsGeometryRenderer).toBe(true);
        expect(plan.requirementKeys).toEqual(["sceneColor", "viewDepth", "viewNormal", "depthScene"]);
        expect(plan.requirements).toContainEqual({
            key: "depthScene",
            consumers: ["dof"],
            producer: "depthRenderer",
            resolution: "full",
        });
    });

    it("ignores zero-strength effects and appends active effects to the runtime order", () => {
        const plan = buildFrameGraphResourcePlan(createSettings({
            luminousEnabled: true,
            luminousIntensity: 0,
            ssrEnabled: true,
            ssrStrength: 0,
            grainIntensity: 12,
        }), ["lut"]);

        expect(plan.activeEffects).toEqual(["grain"]);
        expect(plan.effectOrder).toEqual(["lut", "grain"]);
        expect(plan.requirementKeys).toEqual(["sceneColor"]);
    });
});
