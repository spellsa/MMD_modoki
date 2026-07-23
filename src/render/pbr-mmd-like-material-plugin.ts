import { Material } from "@babylonjs/core/Materials/material";
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import { Color3 } from "@babylonjs/core/Maths/math.color";

type MmdLikePbrShadowTintDefines = MaterialDefines & {
    MMD_LIKE_SHADOW_TINT: boolean;
};

export type MmdLikePbrShadowTintSettings = {
    enabled: boolean;
    color: Color3;
    strength: number;
};

export const PBR_MMD_LIKE_NORMAL_SHADOW_START = 0.12;
export const PBR_MMD_LIKE_NORMAL_SHADOW_END = 0.72;

function clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
    const t = clamp01((value - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
}

export function getMmdLikePbrShadowMask(
    shadowVisibility: number,
    directLightLuminance: number,
): number {
    const occlusionWeight = 1 - clamp01(shadowVisibility);
    const normalWeight = 1 - smoothstep(
        PBR_MMD_LIKE_NORMAL_SHADOW_START,
        PBR_MMD_LIKE_NORMAL_SHADOW_END,
        clamp01(directLightLuminance),
    );
    return Math.max(occlusionWeight, normalWeight);
}

export function getMmdLikePbrShadowTintMultiplier(
    tintChannel: number,
    shadowMask: number,
    strength: number,
): number {
    const weight = clamp01(shadowMask) * clamp01(strength);
    return 1 + (clamp01(tintChannel) - 1) * weight;
}

/**
 * Applies a deliberately non-physical MMD-style multiplier where Babylon's PBR
 * diffuse becomes dark from either the shadow map or the surface normal.
 * Specular, alpha and translucency stay on Babylon's standard paths.
 */
class MmdLikePbrShadowTintPlugin extends MaterialPluginBase {
    private enabledValue = false;
    private readonly colorValue = Color3.Black();
    private strengthValue = 0;

    public constructor(material: PBRMaterial) {
        super(
            material,
            "MmdLikePbrShadowTint",
            210,
            { MMD_LIKE_SHADOW_TINT: false },
            true,
            false,
        );
        this.doNotSerialize = true;
    }

    public getClassName(): string {
        return "MmdLikePbrShadowTintPlugin";
    }

    public isCompatible(shaderLanguage: ShaderLanguage): boolean {
        return shaderLanguage === ShaderLanguage.GLSL || shaderLanguage === ShaderLanguage.WGSL;
    }

    public applySettings(settings: MmdLikePbrShadowTintSettings): void {
        const nextEnabled = settings.enabled;
        const enabledChanged = this.enabledValue !== nextEnabled;
        this.enabledValue = nextEnabled;
        this.colorValue.set(
            clamp01(settings.color.r),
            clamp01(settings.color.g),
            clamp01(settings.color.b),
        );
        this.strengthValue = clamp01(settings.strength);

        if (enabledChanged) {
            this._enable(nextEnabled);
            this.markAllDefinesAsDirty();
            this._material.markAsDirty(Material.MiscDirtyFlag);
        }
    }

    public prepareDefines(defines: MaterialDefines): void {
        (defines as MmdLikePbrShadowTintDefines).MMD_LIKE_SHADOW_TINT = this.enabledValue;
    }

    public bindForSubMesh(uniformBuffer: UniformBuffer): void {
        if (!this.enabledValue) return;
        uniformBuffer.updateFloat4(
            "mmdLikeShadowTint",
            this.colorValue.r,
            this.colorValue.g,
            this.colorValue.b,
            this.strengthValue,
        );
    }

    public getUniforms(): {
        ubo: Array<{ name: string; size: number; type: string }>;
    } {
        return {
            ubo: [
                { name: "mmdLikeShadowTint", size: 4, type: "vec4" },
            ],
        };
    }

    public getCustomCode(
        shaderType: string,
        shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL,
    ): { [pointName: string]: string } | null {
        if (shaderType !== "fragment") return null;

        if (shaderLanguage === ShaderLanguage.WGSL) {
            return {
                CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `
#if defined(MMD_LIKE_SHADOW_TINT) && !defined(UNLIT)
let mmdLikeOcclusionWeight = clamp(1.0 - aggShadow, 0.0, 1.0);
let mmdLikeDirectLight = clamp(getLuminance(diffuseBase), 0.0, 1.0);
let mmdLikeNormalWeight = 1.0 - smoothstep(
    ${PBR_MMD_LIKE_NORMAL_SHADOW_START},
    ${PBR_MMD_LIKE_NORMAL_SHADOW_END},
    mmdLikeDirectLight
);
let mmdLikeShadowWeight = max(mmdLikeOcclusionWeight, mmdLikeNormalWeight)
    * uniforms.mmdLikeShadowTint.a;
let mmdLikeShadowMultiplier = mix(
    vec3f(1.0),
    clamp(uniforms.mmdLikeShadowTint.rgb, vec3f(0.0), vec3f(1.0)),
    clamp(mmdLikeShadowWeight, 0.0, 1.0)
);
finalDiffuse *= mmdLikeShadowMultiplier;
#ifdef REFLECTION
finalIrradiance *= mmdLikeShadowMultiplier;
#endif
#endif
`,
            };
        }

        return {
            CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `
#if defined(MMD_LIKE_SHADOW_TINT) && !defined(UNLIT)
float mmdLikeOcclusionWeight = clamp(1.0 - aggShadow, 0.0, 1.0);
float mmdLikeDirectLight = clamp(getLuminance(diffuseBase), 0.0, 1.0);
float mmdLikeNormalWeight = 1.0 - smoothstep(
    ${PBR_MMD_LIKE_NORMAL_SHADOW_START},
    ${PBR_MMD_LIKE_NORMAL_SHADOW_END},
    mmdLikeDirectLight
);
float mmdLikeShadowWeight = max(mmdLikeOcclusionWeight, mmdLikeNormalWeight)
    * mmdLikeShadowTint.a;
vec3 mmdLikeShadowMultiplier = mix(
    vec3(1.0),
    clamp(mmdLikeShadowTint.rgb, vec3(0.0), vec3(1.0)),
    clamp(mmdLikeShadowWeight, 0.0, 1.0)
);
finalDiffuse *= mmdLikeShadowMultiplier;
#ifdef REFLECTION
finalIrradiance *= mmdLikeShadowMultiplier;
#endif
#endif
`,
        };
    }
}

const PLUGINS = new WeakMap<PBRMaterial, MmdLikePbrShadowTintPlugin>();

export function applyMmdLikePbrShadowTint(
    material: PBRMaterial,
    settings: MmdLikePbrShadowTintSettings,
): void {
    let plugin = PLUGINS.get(material);
    if (!plugin) {
        plugin = new MmdLikePbrShadowTintPlugin(material);
        PLUGINS.set(material, plugin);
    }
    plugin.applySettings(settings);
}
