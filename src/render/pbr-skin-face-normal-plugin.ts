import { Material } from "@babylonjs/core/Materials/material";
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";

type PbrSkinFaceNormalDefines = MaterialDefines & {
    PBR_SKIN_FACE_NORMAL: boolean;
};

export type PbrSkinFaceNormalSettings = {
    enabled: boolean;
    strength: number;
};

export const PBR_SKIN_FACE_NORMAL_STRENGTH = 0.3;
export const PBR_SKIN_FACE_NORMAL_UP_BIAS = 0.15;

function clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
}

function normalize3(
    x: number,
    y: number,
    z: number,
): readonly [number, number, number] {
    const length = Math.hypot(x, y, z);
    if (length <= Number.EPSILON) return [0, 0, -1];
    return [x / length, y / length, z / length];
}

export const PBR_SKIN_FACE_TARGET_NORMAL = normalize3(
    0,
    PBR_SKIN_FACE_NORMAL_UP_BIAS,
    -1,
);

export function blendPbrSkinFaceNormal(
    source: readonly [number, number, number],
    strength = PBR_SKIN_FACE_NORMAL_STRENGTH,
): readonly [number, number, number] {
    const sourceNormal = normalize3(source[0], source[1], source[2]);
    const weight = clamp01(strength);
    return normalize3(
        sourceNormal[0] + (PBR_SKIN_FACE_TARGET_NORMAL[0] - sourceNormal[0]) * weight,
        sourceNormal[1] + (PBR_SKIN_FACE_TARGET_NORMAL[1] - sourceNormal[1]) * weight,
        sourceNormal[2] + (PBR_SKIN_FACE_TARGET_NORMAL[2] - sourceNormal[2]) * weight,
    );
}

/**
 * Softens face-shaped normal shading without changing mesh geometry or shadow
 * casting. The target normal is in MMD model-local space, so the existing world
 * and bone transforms still make it follow the character.
 */
class PbrSkinFaceNormalPlugin extends MaterialPluginBase {
    private enabledValue = false;
    private strengthValue = PBR_SKIN_FACE_NORMAL_STRENGTH;

    public constructor(material: PBRMaterial) {
        super(
            material,
            "PbrSkinFaceNormal",
            205,
            { PBR_SKIN_FACE_NORMAL: false },
            true,
            false,
        );
        this.doNotSerialize = true;
    }

    public getClassName(): string {
        return "PbrSkinFaceNormalPlugin";
    }

    public isCompatible(shaderLanguage: ShaderLanguage): boolean {
        return shaderLanguage === ShaderLanguage.GLSL || shaderLanguage === ShaderLanguage.WGSL;
    }

    public applySettings(settings: PbrSkinFaceNormalSettings): void {
        const nextEnabled = settings.enabled;
        const enabledChanged = this.enabledValue !== nextEnabled;
        this.enabledValue = nextEnabled;
        this.strengthValue = clamp01(settings.strength);

        if (enabledChanged) {
            this._enable(nextEnabled);
            this.markAllDefinesAsDirty();
            this._material.markAsDirty(Material.MiscDirtyFlag);
        }
    }

    public prepareDefines(defines: MaterialDefines): void {
        (defines as PbrSkinFaceNormalDefines).PBR_SKIN_FACE_NORMAL = this.enabledValue;
    }

    public bindForSubMesh(uniformBuffer: UniformBuffer): void {
        if (!this.enabledValue) return;
        uniformBuffer.updateFloat4(
            "pbrSkinFaceNormal",
            PBR_SKIN_FACE_TARGET_NORMAL[0],
            PBR_SKIN_FACE_TARGET_NORMAL[1],
            PBR_SKIN_FACE_TARGET_NORMAL[2],
            this.strengthValue,
        );
    }

    public getUniforms(): {
        ubo: Array<{ name: string; size: number; type: string }>;
    } {
        return {
            ubo: [
                { name: "pbrSkinFaceNormal", size: 4, type: "vec4" },
            ],
        };
    }

    public getCustomCode(
        shaderType: string,
        shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL,
    ): { [pointName: string]: string } | null {
        if (shaderType !== "vertex") return null;

        if (shaderLanguage === ShaderLanguage.WGSL) {
            return {
                CUSTOM_VERTEX_UPDATE_NORMAL: `
#if defined(PBR_SKIN_FACE_NORMAL) && defined(NORMAL)
let pbrSkinFaceBlendedNormal = mix(
    normalUpdated,
    uniforms.pbrSkinFaceNormal.xyz,
    uniforms.pbrSkinFaceNormal.w
);
if (dot(pbrSkinFaceBlendedNormal, pbrSkinFaceBlendedNormal) > 0.000001) {
    normalUpdated = normalize(pbrSkinFaceBlendedNormal);
}
#endif
`,
            };
        }

        return {
            CUSTOM_VERTEX_UPDATE_NORMAL: `
#if defined(PBR_SKIN_FACE_NORMAL) && defined(NORMAL)
vec3 pbrSkinFaceBlendedNormal = mix(
    normalUpdated,
    pbrSkinFaceNormal.xyz,
    pbrSkinFaceNormal.w
);
if (dot(pbrSkinFaceBlendedNormal, pbrSkinFaceBlendedNormal) > 0.000001) {
    normalUpdated = normalize(pbrSkinFaceBlendedNormal);
}
#endif
`,
        };
    }
}

const PLUGINS = new WeakMap<PBRMaterial, PbrSkinFaceNormalPlugin>();

export function applyPbrSkinFaceNormal(
    material: PBRMaterial,
    settings: PbrSkinFaceNormalSettings,
): void {
    let plugin = PLUGINS.get(material);
    if (!plugin && !settings.enabled) return;
    if (!plugin) {
        plugin = new PbrSkinFaceNormalPlugin(material);
        PLUGINS.set(material, plugin);
    }
    plugin.applySettings(settings);
}
