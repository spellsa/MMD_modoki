import { Material } from "@babylonjs/core/Materials/material";
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";

export type PbrNoShadowSettings = {
    enabled: boolean;
};

export const PBR_NO_SHADOW_MAX_LIGHTS = 8;

const PBR_NO_SHADOW_DEFINE_PREFIXES = [
    "SHADOW",
    "SHADOWCSM",
    "SHADOWCSMDEBUG",
    "SHADOWCSMNUM_CASCADES",
    "SHADOWCSMUSESHADOWMAXZ",
    "SHADOWCSMNOBLEND",
    "SHADOWCSM_RIGHTHANDED",
    "SHADOWPCF",
    "SHADOWPCSS",
    "SHADOWPOISSON",
    "SHADOWESM",
    "SHADOWCLOSEESM",
    "SHADOWCUBE",
    "SHADOWLOWQUALITY",
    "SHADOWMEDIUMQUALITY",
] as const;

/**
 * Babylon prepares the light/shadow feature flags before material plugins.
 * Reset the complete per-light shadow define family here. Clearing only
 * SHADOWn leaves CSM/PCF/PCSS subtype defines active and produces mismatched
 * WGSL varyings. This list mirrors Babylon's PrepareDefinesForLight reset while
 * preserving the analytical light blocks, IBL, AO, normals and exposure.
 */
export function preparePbrNoShadowDefines(
    defines: MaterialDefines,
    enabled: boolean,
): void {
    if (!enabled) return;
    const mutableDefines = defines as MaterialDefines & Record<string, boolean | number>;
    mutableDefines.SHADOWS = false;
    mutableDefines.SHADOWFLOAT = false;
    for (let index = 0; index < PBR_NO_SHADOW_MAX_LIGHTS; index += 1) {
        for (const prefix of PBR_NO_SHADOW_DEFINE_PREFIXES) {
            mutableDefines[`${prefix}${index}`] = false;
        }
    }
}

class PbrNoShadowMaterialPlugin extends MaterialPluginBase {
    private enabledValue = false;

    public constructor(material: PBRMaterial) {
        super(
            material,
            "PbrNoShadow",
            210,
            {},
            true,
            false,
        );
        this.doNotSerialize = true;
    }

    public getClassName(): string {
        return "PbrNoShadowMaterialPlugin";
    }

    public isCompatible(shaderLanguage: ShaderLanguage): boolean {
        return shaderLanguage === ShaderLanguage.GLSL || shaderLanguage === ShaderLanguage.WGSL;
    }

    public applySettings(settings: PbrNoShadowSettings): void {
        if (this.enabledValue === settings.enabled) return;
        this.enabledValue = settings.enabled;
        this._enable(settings.enabled);
        this.markAllDefinesAsDirty();
        this._material.markAsDirty(Material.MiscDirtyFlag);
    }

    public prepareDefines(defines: MaterialDefines): void {
        preparePbrNoShadowDefines(defines, this.enabledValue);
    }

    public get enabled(): boolean {
        return this.enabledValue;
    }
}

const PLUGINS = new WeakMap<PBRMaterial, PbrNoShadowMaterialPlugin>();

export function applyPbrNoShadow(
    material: PBRMaterial,
    settings: PbrNoShadowSettings,
): void {
    let plugin = PLUGINS.get(material);
    if (!plugin && !settings.enabled) return;
    if (!plugin) {
        plugin = new PbrNoShadowMaterialPlugin(material);
        PLUGINS.set(material, plugin);
    }
    plugin.applySettings(settings);
}

export function isPbrNoShadowEnabled(material: PBRMaterial): boolean {
    return PLUGINS.get(material)?.enabled ?? false;
}
