import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Scene } from "@babylonjs/core/scene";
import {
    PBR_NO_SHADOW_MAX_LIGHTS,
    applyPbrNoShadow,
    isPbrNoShadowEnabled,
    preparePbrNoShadowDefines,
} from "./pbr-no-shadow-material-plugin";

describe("PBR No Shadow material plugin", () => {
    it("disables shadow defines without disabling light or reflection defines", () => {
        const defines = {
            LIGHT0: true,
            REFLECTION: true,
            SHADOWS: true,
            SHADOWFLOAT: true,
            SHADOW1: true,
            SHADOWCSM1: true,
            SHADOWCSMDEBUG1: true,
            SHADOWCSMNUM_CASCADES1: 4,
            SHADOWCSMUSESHADOWMAXZ1: true,
            SHADOWCSMNOBLEND1: true,
            SHADOWCSM_RIGHTHANDED1: true,
            SHADOWPCF1: true,
            SHADOWPCSS1: true,
            SHADOWPOISSON1: true,
            SHADOWESM1: true,
            SHADOWCLOSEESM1: true,
            SHADOWCUBE1: true,
            SHADOWLOWQUALITY1: true,
            SHADOWMEDIUMQUALITY1: true,
        } as never;
        for (let index = 0; index < PBR_NO_SHADOW_MAX_LIGHTS; index += 1) {
            (defines as Record<string, boolean>)[`SHADOW${index}`] = true;
        }

        preparePbrNoShadowDefines(defines, true);

        expect((defines as Record<string, boolean>).SHADOWS).toBe(false);
        expect((defines as Record<string, boolean>).SHADOWFLOAT).toBe(false);
        for (let index = 0; index < PBR_NO_SHADOW_MAX_LIGHTS; index += 1) {
            expect((defines as Record<string, boolean>)[`SHADOW${index}`]).toBe(false);
        }
        expect((defines as Record<string, boolean>).SHADOWCSM1).toBe(false);
        expect((defines as Record<string, boolean>).SHADOWCSMDEBUG1).toBe(false);
        expect((defines as Record<string, boolean>).SHADOWCSMNUM_CASCADES1).toBe(false);
        expect((defines as Record<string, boolean>).SHADOWCSMUSESHADOWMAXZ1).toBe(false);
        expect((defines as Record<string, boolean>).SHADOWCSMNOBLEND1).toBe(false);
        expect((defines as Record<string, boolean>).SHADOWCSM_RIGHTHANDED1).toBe(false);
        expect((defines as Record<string, boolean>).SHADOWPCF1).toBe(false);
        expect((defines as Record<string, boolean>).SHADOWPCSS1).toBe(false);
        expect((defines as Record<string, boolean>).SHADOWPOISSON1).toBe(false);
        expect((defines as Record<string, boolean>).SHADOWESM1).toBe(false);
        expect((defines as Record<string, boolean>).SHADOWCLOSEESM1).toBe(false);
        expect((defines as Record<string, boolean>).SHADOWCUBE1).toBe(false);
        expect((defines as Record<string, boolean>).SHADOWLOWQUALITY1).toBe(false);
        expect((defines as Record<string, boolean>).SHADOWMEDIUMQUALITY1).toBe(false);
        expect((defines as Record<string, boolean>).LIGHT0).toBe(true);
        expect((defines as Record<string, boolean>).REFLECTION).toBe(true);
    });

    it("leaves shadow defines unchanged while disabled", () => {
        const defines = { SHADOW0: true } as never;

        preparePbrNoShadowDefines(defines, false);

        expect((defines as Record<string, boolean>).SHADOW0).toBe(true);
    });

    it("can be enabled and disabled independently per PBR material", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const material = new PBRMaterial("no-shadow", scene);
        try {
            expect(isPbrNoShadowEnabled(material)).toBe(false);
            applyPbrNoShadow(material, { enabled: true });
            expect(isPbrNoShadowEnabled(material)).toBe(true);
            expect(material.unlit).toBe(false);

            applyPbrNoShadow(material, { enabled: false });
            expect(isPbrNoShadowEnabled(material)).toBe(false);
            expect(material.unlit).toBe(false);
        } finally {
            material.dispose();
            scene.dispose();
            engine.dispose();
        }
    });
});
