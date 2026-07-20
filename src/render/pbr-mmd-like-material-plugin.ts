import { Material } from "@babylonjs/core/Materials/material";
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";

const MMD_LIKE_TOON_SHADOW_STRENGTH = 0.62;
const MMD_LIKE_TOON_SHADOW_START = 0.12;
const MMD_LIKE_TOON_SHADOW_END = 0.72;
const MMD_LIKE_TOON_SHADOW_SATURATION = 1.35;
const PBR_SKIN_SCATTER_SOURCE_COLOR = new Color3(1, 0.35, 0.22);
const PBR_SKIN_SCATTER_SOURCE_STRENGTH = 0.35;

export type MmdLikePbrShaderMode = "off" | "mmd-like" | "skin";

export function getPbrSkinScatterSourceStrength(
    directLightLuminance: number,
): number {
    const value = Math.max(0, Math.min(1, directLightLuminance));
    const edge0 = 0.08;
    const edge1 = 0.75;
    const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
    const smooth = t * t * (3 - 2 * t);
    const shadowWeight = 1 - smooth;
    return PBR_SKIN_SCATTER_SOURCE_STRENGTH * (0.35 + 0.65 * shadowWeight);
}

type MmdLikePbrMaterialDefines = MaterialDefines & {
    MMD_LIKE_TOON_TEXTURE: boolean;
    MMD_LIKE_SKIN: boolean;
};

export type MmdLikePbrShaderSettings = {
    mode: MmdLikePbrShaderMode;
    toonTexture: BaseTexture | null;
    fallbackColor: Color3;
};

export function getMmdLikeToonSampleUv(
    texture: Pick<BaseTexture, "getSize"> | null,
): { u: number; v: number } {
    const size = texture?.getSize() ?? { width: 1, height: 1 };
    return {
        u: 0.5 / Math.max(1, size.width),
        v: 0.5 / Math.max(1, size.height),
    };
}

class MmdLikePbrMaterialPlugin extends MaterialPluginBase {
    private modeValue: MmdLikePbrShaderMode = "off";
    private toonTextureValue: BaseTexture | null = null;
    private fallbackColorValue = Color3.White();

    public constructor(material: PBRMaterial) {
        super(
            material,
            "MmdLikePbrMaterial",
            210,
            {
                MMD_LIKE_TOON_TEXTURE: false,
                MMD_LIKE_SKIN: false,
            },
            true,
            false,
        );
        // RSM/GI creates internal material clones. Those clones only need the
        // base PBR properties and must not instantiate this runtime-only plugin.
        this.doNotSerialize = true;
    }

    public getClassName(): string {
        return "MmdLikePbrMaterialPlugin";
    }

    public isCompatible(shaderLanguage: ShaderLanguage): boolean {
        return shaderLanguage === ShaderLanguage.GLSL || shaderLanguage === ShaderLanguage.WGSL;
    }

    public applySettings(settings: MmdLikePbrShaderSettings): void {
        const textureChanged = this.toonTextureValue !== settings.toonTexture;
        const modeChanged = this.modeValue !== settings.mode;
        this.modeValue = settings.mode;
        this.toonTextureValue = settings.toonTexture;
        this.fallbackColorValue.copyFrom(settings.fallbackColor);

        if (modeChanged) {
            this._enable(settings.mode !== "off");
        }
        if (modeChanged || textureChanged) {
            this.markAllDefinesAsDirty();
            this._material.markAsDirty(Material.TextureDirtyFlag);
        }
    }

    public isReadyForSubMesh(
        _defines: MaterialDefines,
        scene: Scene,
    ): boolean {
        return this.modeValue !== "mmd-like"
            || !scene.texturesEnabled
            || this.toonTextureValue === null
            || this.toonTextureValue.isReadyOrNotBlocking();
    }

    public prepareDefines(defines: MaterialDefines, scene: Scene): void {
        const mmdLikeDefines = defines as MmdLikePbrMaterialDefines;
        mmdLikeDefines.MMD_LIKE_TOON_TEXTURE = this.modeValue === "mmd-like"
            && scene.texturesEnabled
            && this.toonTextureValue !== null;
        mmdLikeDefines.MMD_LIKE_SKIN = this.modeValue === "skin";
    }

    public bindForSubMesh(
        uniformBuffer: UniformBuffer,
    ): void {
        if (this.modeValue === "off") return;

        const sampleUv = getMmdLikeToonSampleUv(this.toonTextureValue);
        uniformBuffer.updateFloat2(
            "mmdLikeToonSampleUv",
            sampleUv.u,
            sampleUv.v,
        );
        uniformBuffer.updateFloat4(
            "mmdLikeToonFallbackColor",
            this.fallbackColorValue.r,
            this.fallbackColorValue.g,
            this.fallbackColorValue.b,
            1,
        );
        uniformBuffer.updateFloat4(
            "mmdLikeToonParams",
            MMD_LIKE_TOON_SHADOW_STRENGTH,
            MMD_LIKE_TOON_SHADOW_START,
            MMD_LIKE_TOON_SHADOW_END,
            MMD_LIKE_TOON_SHADOW_SATURATION,
        );
        uniformBuffer.updateFloat4(
            "mmdLikeSkinScatterParams",
            PBR_SKIN_SCATTER_SOURCE_COLOR.r,
            PBR_SKIN_SCATTER_SOURCE_COLOR.g,
            PBR_SKIN_SCATTER_SOURCE_COLOR.b,
            PBR_SKIN_SCATTER_SOURCE_STRENGTH,
        );
        if (this.toonTextureValue) {
            uniformBuffer.setTexture("mmdLikeToonSampler", this.toonTextureValue);
        }
    }

    public getUniforms(): {
        ubo: Array<{ name: string; size: number; type: string }>;
    } {
        return {
            ubo: [
                { name: "mmdLikeToonSampleUv", size: 2, type: "vec2" },
                { name: "mmdLikeToonFallbackColor", size: 4, type: "vec4" },
                { name: "mmdLikeToonParams", size: 4, type: "vec4" },
                { name: "mmdLikeSkinScatterParams", size: 4, type: "vec4" },
            ],
        };
    }

    public getSamplers(samplers: string[]): void {
        samplers.push("mmdLikeToonSampler");
    }

    public hasTexture(texture: BaseTexture): boolean {
        return this.toonTextureValue === texture;
    }

    public getActiveTextures(activeTextures: BaseTexture[]): void {
        if (this.toonTextureValue) {
            activeTextures.push(this.toonTextureValue);
        }
    }

    public getCustomCode(
        shaderType: string,
        shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL,
    ): { [pointName: string]: string } | null {
        if (shaderType !== "fragment") return null;

        if (shaderLanguage === ShaderLanguage.WGSL) {
            return {
                CUSTOM_FRAGMENT_DEFINITIONS: `
#ifdef MMD_LIKE_TOON_TEXTURE
var mmdLikeToonSamplerSampler: sampler;
var mmdLikeToonSampler: texture_2d<f32>;
#endif
`,
                CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `
#ifndef UNLIT
#ifdef MMD_LIKE_SKIN
let mmdLikeSkinDirectLight = clamp(getLuminance(diffuseBase), 0.0, 1.0);
let mmdLikeSkinShadowWeight = 1.0 - smoothstep(0.08, 0.75, mmdLikeSkinDirectLight);
let mmdLikeSkinScatterStrength = uniforms.mmdLikeSkinScatterParams.w
    * (0.35 + 0.65 * mmdLikeSkinShadowWeight);
finalDiffuse += surfaceAlbedo
    * uniforms.mmdLikeSkinScatterParams.rgb
    * mmdLikeSkinScatterStrength;
#else
var mmdLikeToonShadow: vec3f = uniforms.mmdLikeToonFallbackColor.rgb;
#ifdef MMD_LIKE_TOON_TEXTURE
mmdLikeToonShadow = toLinearSpaceVec3(textureSampleLevel(
    mmdLikeToonSampler,
    mmdLikeToonSamplerSampler,
    uniforms.mmdLikeToonSampleUv,
    0.0
).rgb);
#endif
let mmdLikeToonLuminance = getLuminance(mmdLikeToonShadow);
mmdLikeToonShadow = clamp(
    vec3f(mmdLikeToonLuminance)
        + (mmdLikeToonShadow - vec3f(mmdLikeToonLuminance)) * uniforms.mmdLikeToonParams.w,
    vec3f(0.0),
    vec3f(1.0)
);
let mmdLikeDirectLight = clamp(getLuminance(diffuseBase), 0.0, 1.0);
let mmdLikeShadowWeight = 1.0 - smoothstep(
    uniforms.mmdLikeToonParams.y,
    uniforms.mmdLikeToonParams.z,
    mmdLikeDirectLight
);
let mmdLikeToonWeight = mmdLikeShadowWeight * uniforms.mmdLikeToonParams.x;
finalDiffuse *= mix(vec3f(1.0), clamp(mmdLikeToonShadow, vec3f(0.0), vec3f(1.0)), mmdLikeToonWeight);
#endif
#endif
`,
            };
        }

        return {
            CUSTOM_FRAGMENT_DEFINITIONS: `
#ifdef MMD_LIKE_TOON_TEXTURE
uniform sampler2D mmdLikeToonSampler;
#endif
`,
            CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `
#ifndef UNLIT
#ifdef MMD_LIKE_SKIN
float mmdLikeSkinDirectLight = clamp(getLuminance(diffuseBase), 0.0, 1.0);
float mmdLikeSkinShadowWeight = 1.0 - smoothstep(0.08, 0.75, mmdLikeSkinDirectLight);
float mmdLikeSkinScatterStrength = mmdLikeSkinScatterParams.w
    * (0.35 + 0.65 * mmdLikeSkinShadowWeight);
finalDiffuse += surfaceAlbedo
    * mmdLikeSkinScatterParams.rgb
    * mmdLikeSkinScatterStrength;
#else
vec3 mmdLikeToonShadow = mmdLikeToonFallbackColor.rgb;
#ifdef MMD_LIKE_TOON_TEXTURE
mmdLikeToonShadow = toLinearSpace(texture2D(
    mmdLikeToonSampler,
    mmdLikeToonSampleUv
).rgb);
#endif
float mmdLikeToonLuminance = getLuminance(mmdLikeToonShadow);
mmdLikeToonShadow = clamp(
    vec3(mmdLikeToonLuminance)
        + (mmdLikeToonShadow - vec3(mmdLikeToonLuminance)) * mmdLikeToonParams.w,
    0.0,
    1.0
);
float mmdLikeDirectLight = clamp(getLuminance(diffuseBase), 0.0, 1.0);
float mmdLikeShadowWeight = 1.0 - smoothstep(
    mmdLikeToonParams.y,
    mmdLikeToonParams.z,
    mmdLikeDirectLight
);
float mmdLikeToonWeight = mmdLikeShadowWeight * mmdLikeToonParams.x;
finalDiffuse *= mix(vec3(1.0), clamp(mmdLikeToonShadow, 0.0, 1.0), mmdLikeToonWeight);
#endif
#endif
`,
        };
    }
}

const PLUGINS = new WeakMap<PBRMaterial, MmdLikePbrMaterialPlugin>();

export function applyMmdLikePbrShaderSettings(
    material: PBRMaterial,
    settings: MmdLikePbrShaderSettings,
): void {
    let plugin = PLUGINS.get(material);
    if (!plugin) {
        plugin = new MmdLikePbrMaterialPlugin(material);
        PLUGINS.set(material, plugin);
    }
    plugin.applySettings(settings);
}
