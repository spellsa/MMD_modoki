import { Constants } from "@babylonjs/core/Engines/constants";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import { FrameGraph } from "@babylonjs/core/FrameGraph/frameGraph";
import { FrameGraphObjectList } from "@babylonjs/core/FrameGraph/frameGraphObjectList";
import { FrameGraphBloomTask } from "@babylonjs/core/FrameGraph/Tasks/PostProcesses/bloomTask";
import { FrameGraphChromaticAberrationTask } from "@babylonjs/core/FrameGraph/Tasks/PostProcesses/chromaticAberrationTask";
import { FrameGraphDepthOfFieldTask } from "@babylonjs/core/FrameGraph/Tasks/PostProcesses/depthOfFieldTask";
import { FrameGraphFXAATask } from "@babylonjs/core/FrameGraph/Tasks/PostProcesses/fxaaTask";
import { FrameGraphGrainTask } from "@babylonjs/core/FrameGraph/Tasks/PostProcesses/grainTask";
import { FrameGraphImageProcessingTask } from "@babylonjs/core/FrameGraph/Tasks/PostProcesses/imageProcessingTask";
import { FrameGraphPostProcessTask } from "@babylonjs/core/FrameGraph/Tasks/PostProcesses/postProcessTask";
import { FrameGraphSharpenTask } from "@babylonjs/core/FrameGraph/Tasks/PostProcesses/sharpenTask";
import { FrameGraphSSAO2RenderingPipelineTask } from "@babylonjs/core/FrameGraph/Tasks/PostProcesses/ssao2RenderingPipelineTask";
import { FrameGraphSSRRenderingPipelineTask } from "@babylonjs/core/FrameGraph/Tasks/PostProcesses/ssrRenderingPipelineTask";
import { FrameGraphGeometryRendererTask } from "@babylonjs/core/FrameGraph/Tasks/Rendering/geometryRendererTask";
import { FrameGraphClearTextureTask } from "@babylonjs/core/FrameGraph/Tasks/Texture/clearTextureTask";
import { FrameGraphCopyToBackbufferColorTask } from "@babylonjs/core/FrameGraph/Tasks/Texture/copyToBackbufferColorTask";
import type { FrameGraphTextureHandle } from "@babylonjs/core/FrameGraph/frameGraphTypes";
import type { FrameGraphRenderPass } from "@babylonjs/core/FrameGraph/frameGraphRenderPass";
import type { FrameGraphRenderContext } from "@babylonjs/core/FrameGraph/frameGraphRenderContext";
import { EffectWrapper } from "@babylonjs/core/Materials/effectRenderer";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import type { InternalTexture } from "@babylonjs/core/Materials/Textures/internalTexture";
import type { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Vector2 } from "@babylonjs/core/Maths/math.vector";
import { ThinChromaticAberrationPostProcess } from "@babylonjs/core/PostProcesses/thinChromaticAberrationPostProcess";
import { ThinDepthOfFieldEffectBlurLevel } from "@babylonjs/core/PostProcesses/thinDepthOfFieldEffect";
import { ThinFXAAPostProcess } from "@babylonjs/core/PostProcesses/thinFXAAPostProcess";
import { ThinGrainPostProcess } from "@babylonjs/core/PostProcesses/thinGrainPostProcess";
import { ThinImageProcessingPostProcess } from "@babylonjs/core/PostProcesses/thinImageProcessingPostProcess";
import { ThinSharpenPostProcess } from "@babylonjs/core/PostProcesses/thinSharpenPostProcess";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { Scene } from "@babylonjs/core/scene";
import { createLutAtlasTextureFrom3dlText } from "./lut-atlas-texture";

export type FrameGraphPostEffectsWarning = {
    message: string;
    reason: "not-connected" | "build-failed";
};

export type FrameGraphPostEffectsInfo = {
    message: string;
    event: "activated" | "ready";
};

export type FrameGraphPostEffectsSettings = {
    contrast: number;
    gammaPower: number;
    imageProcessingEnabled: boolean;
    dofEnabled: boolean;
    dofBlurLevel: number;
    dofFocusDistanceMm: number;
    dofEffectiveFStop: number;
    dofLensSize: number;
    dofFocalLength: number;
    bloomEnabled: boolean;
    bloomWeight: number;
    bloomThreshold: number;
    bloomKernel: number;
    vignetteEnabled: boolean;
    vignetteWeight: number;
    edgeBlurStrength: number;
    lensDistortion: number;
    chromaticAberration: number;
    grainIntensity: number;
    sharpenEdge: number;
    ssaoEnabled: boolean;
    ssaoStrength: number;
    ssaoRadius: number;
    ssaoShadowColor: { r: number; g: number; b: number };
    ssaoToonInfluence: number;
    ssrEnabled: boolean;
    ssrStrength: number;
    ssrStep: number;
    lutEnabled: boolean;
    lutIntensity: number;
    lutRuntimeText: string | null;
    lutTextureKey: string | null;
    antialiasEnabled: boolean;
};

function ensureLutShaders(): void {
    const shaderKey = "mmdFrameGraphLutPixelShader";
    if (!ShaderStore.ShadersStore[shaderKey]) {
        ShaderStore.ShadersStore[shaderKey] = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D textureSampler;
            uniform sampler2D lutSampler;
            uniform float lutSize;
            uniform float lutIntensity;

            vec3 sampleLutCell(float r, float g, float b) {
                float size = max(lutSize, 2.0);
                float atlasWidth = size * size;
                vec2 uv = vec2((r + b * size + 0.5) / atlasWidth, (g + 0.5) / size);
                return texture2D(lutSampler, uv).rgb;
            }

            vec3 sampleLut(vec3 color) {
                float size = max(lutSize, 2.0);
                vec3 scaled = clamp(color, vec3(0.0), vec3(1.0)) * (size - 1.0);
                vec3 lower = floor(scaled);
                vec3 upper = min(lower + vec3(1.0), vec3(size - 1.0));
                vec3 factor = scaled - lower;

                vec3 c000 = sampleLutCell(lower.r, lower.g, lower.b);
                vec3 c100 = sampleLutCell(upper.r, lower.g, lower.b);
                vec3 c010 = sampleLutCell(lower.r, upper.g, lower.b);
                vec3 c110 = sampleLutCell(upper.r, upper.g, lower.b);
                vec3 c001 = sampleLutCell(lower.r, lower.g, upper.b);
                vec3 c101 = sampleLutCell(upper.r, lower.g, upper.b);
                vec3 c011 = sampleLutCell(lower.r, upper.g, upper.b);
                vec3 c111 = sampleLutCell(upper.r, upper.g, upper.b);

                vec3 c00 = mix(c000, c100, factor.r);
                vec3 c10 = mix(c010, c110, factor.r);
                vec3 c01 = mix(c001, c101, factor.r);
                vec3 c11 = mix(c011, c111, factor.r);
                vec3 c0 = mix(c00, c10, factor.g);
                vec3 c1 = mix(c01, c11, factor.g);
                return mix(c0, c1, factor.b);
            }

            void main(void) {
                vec4 color = texture2D(textureSampler, vUV);
                vec3 graded = sampleLut(color.rgb);
                gl_FragColor = vec4(mix(color.rgb, graded, clamp(lutIntensity, 0.0, 1.0)), color.a);
            }
        `;
    }
    if (!ShaderStore.ShadersStoreWGSL[shaderKey]) {
        ShaderStore.ShadersStoreWGSL[shaderKey] = `
            varying vUV: vec2f;
            var textureSamplerSampler: sampler;
            var textureSampler: texture_2d<f32>;
            var lutSamplerSampler: sampler;
            var lutSampler: texture_2d<f32>;
            uniform lutSize: f32;
            uniform lutIntensity: f32;

            fn sampleLutCell(r: f32, g: f32, b: f32) -> vec3f {
                let size: f32 = max(uniforms.lutSize, 2.0);
                let atlasWidth: f32 = size * size;
                let uv: vec2f = vec2f((r + b * size + 0.5) / atlasWidth, (g + 0.5) / size);
                return textureSampleLevel(lutSampler, lutSamplerSampler, uv, 0.0).rgb;
            }

            fn sampleLut(color: vec3f) -> vec3f {
                let size: f32 = max(uniforms.lutSize, 2.0);
                let scaled: vec3f = clamp(color, vec3f(0.0), vec3f(1.0)) * (size - 1.0);
                let lower: vec3f = floor(scaled);
                let upper: vec3f = min(lower + vec3f(1.0), vec3f(size - 1.0));
                let factor: vec3f = scaled - lower;

                let c000: vec3f = sampleLutCell(lower.r, lower.g, lower.b);
                let c100: vec3f = sampleLutCell(upper.r, lower.g, lower.b);
                let c010: vec3f = sampleLutCell(lower.r, upper.g, lower.b);
                let c110: vec3f = sampleLutCell(upper.r, upper.g, lower.b);
                let c001: vec3f = sampleLutCell(lower.r, lower.g, upper.b);
                let c101: vec3f = sampleLutCell(upper.r, lower.g, upper.b);
                let c011: vec3f = sampleLutCell(lower.r, upper.g, upper.b);
                let c111: vec3f = sampleLutCell(upper.r, upper.g, upper.b);

                let c00: vec3f = mix(c000, c100, vec3f(factor.r));
                let c10: vec3f = mix(c010, c110, vec3f(factor.r));
                let c01: vec3f = mix(c001, c101, vec3f(factor.r));
                let c11: vec3f = mix(c011, c111, vec3f(factor.r));
                let c0: vec3f = mix(c00, c10, vec3f(factor.g));
                let c1: vec3f = mix(c01, c11, vec3f(factor.g));
                return mix(c0, c1, vec3f(factor.b));
            }

            #define CUSTOM_FRAGMENT_DEFINITIONS
            @fragment
            fn main(input: FragmentInputs)->FragmentOutputs {
                let color: vec4f = textureSample(textureSampler, textureSamplerSampler, input.vUV);
                let graded: vec3f = sampleLut(color.rgb);
                let amount: f32 = clamp(uniforms.lutIntensity, 0.0, 1.0);
                fragmentOutputs.color = vec4f(mix(color.rgb, graded, vec3f(amount)), color.a);
                return fragmentOutputs;
            }
        `;
    }
}

function ensureColorCorrectionShaders(): void {
    const shaderKey = "mmdFrameGraphColorCorrectionPixelShader";
    if (!ShaderStore.ShadersStore[shaderKey]) {
        ShaderStore.ShadersStore[shaderKey] = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D textureSampler;
            uniform float contrast;
            uniform float gammaPower;

            void main(void) {
                vec4 color = texture2D(textureSampler, vUV);
                vec3 contrasted = ((color.rgb - vec3(0.5)) * contrast) + vec3(0.5);
                vec3 corrected = pow(max(contrasted, vec3(0.0)), vec3(max(gammaPower, 0.0001)));
                gl_FragColor = vec4(corrected, color.a);
            }
        `;
    }
    if (!ShaderStore.ShadersStoreWGSL[shaderKey]) {
        ShaderStore.ShadersStoreWGSL[shaderKey] = `
            varying vUV: vec2f;
            var textureSamplerSampler: sampler;
            var textureSampler: texture_2d<f32>;
            uniform contrast: f32;
            uniform gammaPower: f32;

            #define CUSTOM_FRAGMENT_DEFINITIONS
            @fragment
            fn main(input: FragmentInputs)->FragmentOutputs {
                let color: vec4f = textureSample(textureSampler, textureSamplerSampler, input.vUV);
                let contrasted: vec3f = ((color.rgb - vec3f(0.5)) * uniforms.contrast) + vec3f(0.5);
                let safeGamma: f32 = max(uniforms.gammaPower, 0.0001);
                let corrected: vec3f = pow(max(contrasted, vec3f(0.0)), vec3f(safeGamma));
                fragmentOutputs.color = vec4f(corrected, color.a);
            }
        `;
    }
}

function ensureSsaoToonCompositeShaders(): void {
    const shaderKey = "mmdFrameGraphSsaoToonCompositePixelShader";
    if (!ShaderStore.ShadersStore[shaderKey]) {
        ShaderStore.ShadersStore[shaderKey] = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D textureSampler;
            uniform sampler2D originalColor;
            uniform vec3 shadowColor;
            uniform float toonInfluence;
            uniform float enabled;
            uniform vec2 texelSize;

            vec3 safeHue(vec3 color) {
                float maxChannel = max(max(color.r, color.g), color.b);
                return color / max(maxChannel, 0.0001);
            }

            float luminance(vec3 color) {
                return dot(color, vec3(0.299, 0.587, 0.114));
            }

            float neighborWeight(vec3 baseColor, vec3 sampleColor) {
                float colorDistance = distance(baseColor, sampleColor);
                float lumaDistance = abs(luminance(baseColor) - luminance(sampleColor));
                return (1.0 - smoothstep(0.18, 0.50, colorDistance)) * (1.0 - smoothstep(0.20, 0.55, lumaDistance));
            }

            void main(void) {
                vec4 ssaoColor = texture2D(textureSampler, vUV);
                vec4 original = texture2D(originalColor, vUV);
                if (enabled < 0.5) {
                    gl_FragColor = ssaoColor;
                    return;
                }

                vec3 ratio = ssaoColor.rgb / max(original.rgb, vec3(0.035));
                float aoMask = clamp(dot(clamp(ratio, vec3(0.0), vec3(1.0)), vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
                float ao = clamp(1.0 - aoMask, 0.0, 1.0);
                if (ao <= 0.0001) {
                    gl_FragColor = ssaoColor;
                    return;
                }

                vec3 baseColor = clamp(original.rgb, vec3(0.0), vec3(1.0));
                float baseMax = max(max(baseColor.r, baseColor.g), baseColor.b);
                float baseMin = min(min(baseColor.r, baseColor.g), baseColor.b);
                float baseChroma = baseMax - baseMin;
                float brightNeutralProtect = smoothstep(0.70, 0.92, baseMax) * (1.0 - smoothstep(0.035, 0.16, baseChroma));
                ao *= mix(1.0, 0.24, brightNeutralProtect);
                if (ao <= 0.0001) {
                    gl_FragColor = mix(ssaoColor, original, brightNeutralProtect);
                    return;
                }
                float colorValidity = smoothstep(0.12, 0.45, baseMax) * smoothstep(0.04, 0.22, baseChroma);
                vec3 materialToonBand = mix(vec3(0.70), safeHue(baseColor) * 0.66, colorValidity);

                vec2 sampleStep = texelSize * 1.5;
                vec3 nearColor = baseColor;
                float nearWeight = 1.0;
                vec3 sampleColor = clamp(texture2D(originalColor, clamp(vUV + vec2(sampleStep.x, 0.0), vec2(0.0), vec2(1.0))).rgb, vec3(0.0), vec3(1.0));
                float sampleWeight = neighborWeight(baseColor, sampleColor);
                nearColor += sampleColor * sampleWeight;
                nearWeight += sampleWeight;
                sampleColor = clamp(texture2D(originalColor, clamp(vUV + vec2(-sampleStep.x, 0.0), vec2(0.0), vec2(1.0))).rgb, vec3(0.0), vec3(1.0));
                sampleWeight = neighborWeight(baseColor, sampleColor);
                nearColor += sampleColor * sampleWeight;
                nearWeight += sampleWeight;
                sampleColor = clamp(texture2D(originalColor, clamp(vUV + vec2(0.0, sampleStep.y), vec2(0.0), vec2(1.0))).rgb, vec3(0.0), vec3(1.0));
                sampleWeight = neighborWeight(baseColor, sampleColor);
                nearColor += sampleColor * sampleWeight;
                nearWeight += sampleWeight;
                sampleColor = clamp(texture2D(originalColor, clamp(vUV + vec2(0.0, -sampleStep.y), vec2(0.0), vec2(1.0))).rgb, vec3(0.0), vec3(1.0));
                sampleWeight = neighborWeight(baseColor, sampleColor);
                nearColor += sampleColor * sampleWeight;
                nearWeight += sampleWeight;
                vec3 neighborhoodColor = nearColor / max(nearWeight, 0.0001);
                float neighborhoodMax = max(max(neighborhoodColor.r, neighborhoodColor.g), neighborhoodColor.b);
                float neighborhoodMin = min(min(neighborhoodColor.r, neighborhoodColor.g), neighborhoodColor.b);
                float neighborhoodChroma = neighborhoodMax - neighborhoodMin;
                float neighborhoodLuma = luminance(neighborhoodColor);
                float neighborhoodTone = mix(0.54, 0.84, smoothstep(0.16, 0.78, neighborhoodLuma));
                float neighborhoodColorValidity = smoothstep(0.08, 0.30, neighborhoodMax) * smoothstep(0.025, 0.18, neighborhoodChroma);
                vec3 neighborhoodBand = mix(vec3(neighborhoodTone), safeHue(neighborhoodColor) * neighborhoodTone, neighborhoodColorValidity);

                vec3 shadowHue = safeHue(clamp(shadowColor, vec3(0.0), vec3(1.0)));
                vec3 shadowBand = mix(vec3(0.68), shadowHue * 0.66, 0.72);
                vec3 toonBand = mix(shadowBand, materialToonBand, clamp(toonInfluence, 0.0, 1.0) * 0.55);
                float neighborhoodInfluence = smoothstep(0.04, 0.32, ao) * (1.0 - brightNeutralProtect * 0.55) * 0.42;
                toonBand = mix(toonBand, neighborhoodBand, neighborhoodInfluence);

                vec3 tinted = original.rgb * mix(vec3(1.0), toonBand, vec3(clamp(ao * 1.12, 0.0, 1.0)));
                vec3 result = mix(ssaoColor.rgb, tinted, clamp(0.82 + ao * 0.12 + brightNeutralProtect * 0.10, 0.0, 0.97));
                gl_FragColor = vec4(result, ssaoColor.a);
            }
        `;
    }
    if (!ShaderStore.ShadersStoreWGSL[shaderKey]) {
        ShaderStore.ShadersStoreWGSL[shaderKey] = `
            varying vUV: vec2f;
            var textureSamplerSampler: sampler;
            var textureSampler: texture_2d<f32>;
            var originalColorSampler: sampler;
            var originalColor: texture_2d<f32>;
            uniform shadowColor: vec3f;
            uniform toonInfluence: f32;
            uniform enabled: f32;
            uniform texelSize: vec2f;

            fn safeHue(color: vec3f) -> vec3f {
                let maxChannel = max(max(color.r, color.g), color.b);
                return color / max(maxChannel, 0.0001);
            }

            fn luminance(color: vec3f) -> f32 {
                return dot(color, vec3f(0.299, 0.587, 0.114));
            }

            fn neighborWeight(baseColor: vec3f, sampleColor: vec3f) -> f32 {
                let colorDistance = distance(baseColor, sampleColor);
                let lumaDistance = abs(luminance(baseColor) - luminance(sampleColor));
                return (1.0 - smoothstep(0.18, 0.50, colorDistance)) * (1.0 - smoothstep(0.20, 0.55, lumaDistance));
            }

            #define CUSTOM_FRAGMENT_DEFINITIONS
            @fragment
            fn main(input: FragmentInputs)->FragmentOutputs {
                let ssaoColor = textureSample(textureSampler, textureSamplerSampler, input.vUV);
                let original = textureSample(originalColor, originalColorSampler, input.vUV);
                if (uniforms.enabled < 0.5) {
                    fragmentOutputs.color = ssaoColor;
                    return fragmentOutputs;
                }

                let ratio = ssaoColor.rgb / max(original.rgb, vec3f(0.035));
                let aoMask = clamp(dot(clamp(ratio, vec3f(0.0), vec3f(1.0)), vec3f(0.299, 0.587, 0.114)), 0.0, 1.0);
                let ao = clamp(1.0 - aoMask, 0.0, 1.0);
                if (ao <= 0.0001) {
                    fragmentOutputs.color = ssaoColor;
                    return fragmentOutputs;
                }

                let baseColor = clamp(original.rgb, vec3f(0.0), vec3f(1.0));
                let baseMax = max(max(baseColor.r, baseColor.g), baseColor.b);
                let baseMin = min(min(baseColor.r, baseColor.g), baseColor.b);
                let baseChroma = baseMax - baseMin;
                let brightNeutralProtect = smoothstep(0.70, 0.92, baseMax) * (1.0 - smoothstep(0.035, 0.16, baseChroma));
                let protectedAo = ao * mix(1.0, 0.24, brightNeutralProtect);
                if (protectedAo <= 0.0001) {
                    fragmentOutputs.color = mix(ssaoColor, original, brightNeutralProtect);
                    return fragmentOutputs;
                }
                let colorValidity = smoothstep(0.12, 0.45, baseMax) * smoothstep(0.04, 0.22, baseChroma);
                let materialToonBand = mix(vec3f(0.70), safeHue(baseColor) * 0.66, vec3f(colorValidity));

                let sampleStep = uniforms.texelSize * 1.5;
                var nearColor = baseColor;
                var nearWeight = 1.0;
                var sampleColor = clamp(textureSampleLevel(originalColor, originalColorSampler, clamp(input.vUV + vec2f(sampleStep.x, 0.0), vec2f(0.0), vec2f(1.0)), 0.0).rgb, vec3f(0.0), vec3f(1.0));
                var sampleWeight = neighborWeight(baseColor, sampleColor);
                nearColor += sampleColor * sampleWeight;
                nearWeight += sampleWeight;
                sampleColor = clamp(textureSampleLevel(originalColor, originalColorSampler, clamp(input.vUV + vec2f(-sampleStep.x, 0.0), vec2f(0.0), vec2f(1.0)), 0.0).rgb, vec3f(0.0), vec3f(1.0));
                sampleWeight = neighborWeight(baseColor, sampleColor);
                nearColor += sampleColor * sampleWeight;
                nearWeight += sampleWeight;
                sampleColor = clamp(textureSampleLevel(originalColor, originalColorSampler, clamp(input.vUV + vec2f(0.0, sampleStep.y), vec2f(0.0), vec2f(1.0)), 0.0).rgb, vec3f(0.0), vec3f(1.0));
                sampleWeight = neighborWeight(baseColor, sampleColor);
                nearColor += sampleColor * sampleWeight;
                nearWeight += sampleWeight;
                sampleColor = clamp(textureSampleLevel(originalColor, originalColorSampler, clamp(input.vUV + vec2f(0.0, -sampleStep.y), vec2f(0.0), vec2f(1.0)), 0.0).rgb, vec3f(0.0), vec3f(1.0));
                sampleWeight = neighborWeight(baseColor, sampleColor);
                nearColor += sampleColor * sampleWeight;
                nearWeight += sampleWeight;
                let neighborhoodColor = nearColor / max(nearWeight, 0.0001);
                let neighborhoodMax = max(max(neighborhoodColor.r, neighborhoodColor.g), neighborhoodColor.b);
                let neighborhoodMin = min(min(neighborhoodColor.r, neighborhoodColor.g), neighborhoodColor.b);
                let neighborhoodChroma = neighborhoodMax - neighborhoodMin;
                let neighborhoodLuma = luminance(neighborhoodColor);
                let neighborhoodTone = mix(0.54, 0.84, smoothstep(0.16, 0.78, neighborhoodLuma));
                let neighborhoodColorValidity = smoothstep(0.08, 0.30, neighborhoodMax) * smoothstep(0.025, 0.18, neighborhoodChroma);
                let neighborhoodBand = mix(vec3f(neighborhoodTone), safeHue(neighborhoodColor) * neighborhoodTone, vec3f(neighborhoodColorValidity));

                let shadowHue = safeHue(clamp(uniforms.shadowColor, vec3f(0.0), vec3f(1.0)));
                let shadowBand = mix(vec3f(0.68), shadowHue * 0.66, vec3f(0.72));
                var toonBand = mix(shadowBand, materialToonBand, vec3f(clamp(uniforms.toonInfluence, 0.0, 1.0) * 0.55));
                let neighborhoodInfluence = smoothstep(0.04, 0.32, protectedAo) * (1.0 - brightNeutralProtect * 0.55) * 0.42;
                toonBand = mix(toonBand, neighborhoodBand, vec3f(neighborhoodInfluence));

                let tinted = original.rgb * mix(vec3f(1.0), toonBand, vec3f(clamp(protectedAo * 1.12, 0.0, 1.0)));
                let result = mix(ssaoColor.rgb, tinted, vec3f(clamp(0.82 + protectedAo * 0.12 + brightNeutralProtect * 0.10, 0.0, 0.97)));
                fragmentOutputs.color = vec4f(result, ssaoColor.a);
                return fragmentOutputs;
            }
        `;
    }
}

function ensureVignetteEdgeBlurShaders(): void {
    const shaderKey = "mmdFrameGraphVignetteEdgeBlurPixelShader";
    if (!ShaderStore.ShadersStore[shaderKey]) {
        ShaderStore.ShadersStore[shaderKey] = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D textureSampler;
            uniform vec2 texelSize;
            uniform float edgeBlurStrength;
            uniform float vignetteWeight;
            uniform float aspectRatio;

            float computeEdgeMask(vec2 uv) {
                vec2 centered = (uv - vec2(0.5)) * vec2(aspectRatio, 1.0);
                float radius = length(centered);
                float mask = smoothstep(0.50, 0.96, radius);
                return mask * mask * (3.0 - 2.0 * mask);
            }

            float computeVignetteMask(vec2 uv) {
                vec2 centered = (uv - vec2(0.5)) * vec2(aspectRatio, 1.0);
                float radius = length(centered);
                float mask = smoothstep(0.42, 0.92, radius);
                return mask * mask * (3.0 - 2.0 * mask);
            }

            float computeEdgeStrengthCurve(float strength) {
                float lifted = strength + 0.75 * strength * strength;
                return min(1.75, lifted);
            }

            vec4 sampleBlur(vec2 uv, vec2 stepRadius) {
                vec4 color = texture2D(textureSampler, uv) * 0.20;
                color += texture2D(textureSampler, clamp(uv + vec2(stepRadius.x, 0.0), vec2(0.001), vec2(0.999))) * 0.12;
                color += texture2D(textureSampler, clamp(uv - vec2(stepRadius.x, 0.0), vec2(0.001), vec2(0.999))) * 0.12;
                color += texture2D(textureSampler, clamp(uv + vec2(0.0, stepRadius.y), vec2(0.001), vec2(0.999))) * 0.12;
                color += texture2D(textureSampler, clamp(uv - vec2(0.0, stepRadius.y), vec2(0.001), vec2(0.999))) * 0.12;
                color += texture2D(textureSampler, clamp(uv + vec2(stepRadius.x, stepRadius.y), vec2(0.001), vec2(0.999))) * 0.08;
                color += texture2D(textureSampler, clamp(uv + vec2(-stepRadius.x, stepRadius.y), vec2(0.001), vec2(0.999))) * 0.08;
                color += texture2D(textureSampler, clamp(uv + vec2(stepRadius.x, -stepRadius.y), vec2(0.001), vec2(0.999))) * 0.08;
                color += texture2D(textureSampler, clamp(uv - vec2(stepRadius.x, stepRadius.y), vec2(0.001), vec2(0.999))) * 0.08;
                return color;
            }

            void main(void) {
                vec4 baseColor = texture2D(textureSampler, vUV);
                vec4 finalColor = baseColor;

                if (edgeBlurStrength > 0.0001) {
                    float edgeMask = computeEdgeMask(vUV);
                    if (edgeMask > 0.0001) {
                        float curvedStrength = computeEdgeStrengthCurve(edgeBlurStrength);
                        float blurPixels = (0.7 + 9.8 * curvedStrength) * (0.24 + 0.76 * edgeMask);
                        vec2 stepRadius = texelSize * blurPixels;
                        vec4 blurColor = sampleBlur(vUV, stepRadius);
                        float blurMix = edgeMask * (0.28 + 0.72 * min(1.0, curvedStrength));
                        finalColor = mix(finalColor, blurColor, clamp(blurMix, 0.0, 1.0));
                    }
                }

                if (vignetteWeight > 0.0001) {
                    float vignetteMask = computeVignetteMask(vUV);
                    float vignetteAmount = clamp(vignetteWeight * 0.35, 0.0, 1.0);
                    finalColor.rgb *= 1.0 - vignetteMask * vignetteAmount;
                }

                gl_FragColor = finalColor;
            }
        `;
    }
    if (!ShaderStore.ShadersStoreWGSL[shaderKey]) {
        ShaderStore.ShadersStoreWGSL[shaderKey] = `
            varying vUV: vec2f;
            var textureSamplerSampler: sampler;
            var textureSampler: texture_2d<f32>;
            uniform texelSize: vec2f;
            uniform edgeBlurStrength: f32;
            uniform vignetteWeight: f32;
            uniform aspectRatio: f32;

            fn computeEdgeMask(uv: vec2f) -> f32 {
                let centered: vec2f = (uv - vec2f(0.5, 0.5)) * vec2f(uniforms.aspectRatio, 1.0);
                let radius: f32 = length(centered);
                let mask: f32 = smoothstep(0.50, 0.96, radius);
                return mask * mask * (3.0 - 2.0 * mask);
            }

            fn computeVignetteMask(uv: vec2f) -> f32 {
                let centered: vec2f = (uv - vec2f(0.5, 0.5)) * vec2f(uniforms.aspectRatio, 1.0);
                let radius: f32 = length(centered);
                let mask: f32 = smoothstep(0.42, 0.92, radius);
                return mask * mask * (3.0 - 2.0 * mask);
            }

            fn computeEdgeStrengthCurve(strength: f32) -> f32 {
                let lifted: f32 = strength + 0.75 * strength * strength;
                return min(1.75, lifted);
            }

            fn sampleColor(uv: vec2f) -> vec4f {
                return textureSampleLevel(textureSampler, textureSamplerSampler, clamp(uv, vec2f(0.001, 0.001), vec2f(0.999, 0.999)), 0.0);
            }

            fn sampleBlur(uv: vec2f, stepRadius: vec2f) -> vec4f {
                var color: vec4f = sampleColor(uv) * 0.20;
                color += sampleColor(uv + vec2f(stepRadius.x, 0.0)) * 0.12;
                color += sampleColor(uv - vec2f(stepRadius.x, 0.0)) * 0.12;
                color += sampleColor(uv + vec2f(0.0, stepRadius.y)) * 0.12;
                color += sampleColor(uv - vec2f(0.0, stepRadius.y)) * 0.12;
                color += sampleColor(uv + vec2f(stepRadius.x, stepRadius.y)) * 0.08;
                color += sampleColor(uv + vec2f(-stepRadius.x, stepRadius.y)) * 0.08;
                color += sampleColor(uv + vec2f(stepRadius.x, -stepRadius.y)) * 0.08;
                color += sampleColor(uv - vec2f(stepRadius.x, stepRadius.y)) * 0.08;
                return color;
            }

            #define CUSTOM_FRAGMENT_DEFINITIONS
            @fragment
            fn main(input: FragmentInputs)->FragmentOutputs {
                let baseColor: vec4f = sampleColor(input.vUV);
                var finalColor: vec4f = baseColor;

                if (uniforms.edgeBlurStrength > 0.0001) {
                    let edgeMask: f32 = computeEdgeMask(input.vUV);
                    if (edgeMask > 0.0001) {
                        let curvedStrength: f32 = computeEdgeStrengthCurve(uniforms.edgeBlurStrength);
                        let blurPixels: f32 = (0.7 + 9.8 * curvedStrength) * (0.24 + 0.76 * edgeMask);
                        let stepRadius: vec2f = uniforms.texelSize * blurPixels;
                        let blurColor: vec4f = sampleBlur(input.vUV, stepRadius);
                        let blurMix: f32 = clamp(edgeMask * (0.28 + 0.72 * min(1.0, curvedStrength)), 0.0, 1.0);
                        finalColor = mix(finalColor, blurColor, vec4f(blurMix));
                    }
                }

                if (uniforms.vignetteWeight > 0.0001) {
                    let vignetteMask: f32 = computeVignetteMask(input.vUV);
                    let vignetteAmount: f32 = clamp(uniforms.vignetteWeight * 0.35, 0.0, 1.0);
                    finalColor = vec4f(finalColor.rgb * (1.0 - vignetteMask * vignetteAmount), finalColor.a);
                }

                fragmentOutputs.color = finalColor;
                return fragmentOutputs;
            }
        `;
    }
}

function ensureLensDistortionShaders(): void {
    const shaderKey = "mmdFrameGraphLensDistortionPixelShader";
    if (!ShaderStore.ShadersStore[shaderKey]) {
        ShaderStore.ShadersStore[shaderKey] = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D textureSampler;
            uniform float distortion;

            void main(void) {
                vec2 finalUv = vUV;
                vec2 centered = vUV - vec2(0.5);
                float radius2 = dot(centered, centered);

                if (abs(distortion) >= 0.0001 && radius2 >= 1e-8) {
                    vec2 direction = normalize(centered);
                    float amount = clamp(abs(distortion) * 0.23, 0.0, 1.0);

                    vec2 barrelUv = vec2(0.5) + direction * radius2;
                    barrelUv = mix(vUV, barrelUv, amount);

                    vec2 pincushionUv = vec2(0.5) - direction * radius2;
                    pincushionUv = mix(vUV, pincushionUv, amount);

                    finalUv = distortion >= 0.0 ? barrelUv : pincushionUv;
                    finalUv = clamp(finalUv, vec2(0.0), vec2(1.0));
                }

                gl_FragColor = texture2D(textureSampler, finalUv);
            }
        `;
    }
    if (!ShaderStore.ShadersStoreWGSL[shaderKey]) {
        ShaderStore.ShadersStoreWGSL[shaderKey] = `
            varying vUV: vec2f;
            var textureSamplerSampler: sampler;
            var textureSampler: texture_2d<f32>;
            uniform distortion: f32;

            #define CUSTOM_FRAGMENT_DEFINITIONS
            @fragment
            fn main(input: FragmentInputs)->FragmentOutputs {
                let centered: vec2f = input.vUV - vec2f(0.5);
                let radius2: f32 = dot(centered, centered);

                var finalUv: vec2f = input.vUV;
                if (abs(uniforms.distortion) >= 0.0001 && radius2 >= 1e-8) {
                    let direction: vec2f = normalize(centered);
                    let amount: f32 = clamp(abs(uniforms.distortion) * 0.23, 0.0, 1.0);

                    var barrelUv: vec2f = vec2f(0.5) + direction * radius2;
                    barrelUv = mix(input.vUV, barrelUv, amount);

                    var pincushionUv: vec2f = vec2f(0.5) - direction * radius2;
                    pincushionUv = mix(input.vUV, pincushionUv, amount);

                    finalUv = pincushionUv;
                    if (uniforms.distortion >= 0.0) {
                        finalUv = barrelUv;
                    }
                    finalUv = clamp(finalUv, vec2f(0.0), vec2f(1.0));
                }

                fragmentOutputs.color = textureSampleLevel(textureSampler, textureSamplerSampler, finalUv, 0.0);
                return fragmentOutputs;
            }
        `;
    }
}

class FrameGraphPostEffectsLutTask extends FrameGraphPostProcessTask {
    constructor(
        name: string,
        frameGraph: FrameGraph,
        postProcess: EffectWrapper,
        private readonly getSettings: () => FrameGraphPostEffectsSettings,
        private readonly getLutTexture: () => RawTexture | null,
    ) {
        super(name, frameGraph, postProcess);
    }

    override getClassName(): string {
        return "FrameGraphPostEffectsLutTask";
    }

    override record(
        skipCreationOfDisabledPasses = false,
        additionalExecute?: (context: FrameGraphRenderContext) => void,
        additionalBindings?: (context: FrameGraphRenderContext) => void,
    ): FrameGraphRenderPass {
        return super.record(
            skipCreationOfDisabledPasses,
            additionalExecute,
            (context) => {
                const settings = this.getSettings();
                const texture = this.getLutTexture();
                const effect = this.postProcess.effect;
                effect.setFloat("lutSize", texture?.getSize().height ?? 2);
                effect.setFloat("lutIntensity", settings.lutEnabled ? Math.max(0, Math.min(1, settings.lutIntensity)) : 0);
                if (texture) {
                    effect.setTexture("lutSampler", texture);
                }
                additionalBindings?.(context);
            },
        );
    }
}

class FrameGraphPostEffectsColorCorrectionTask extends FrameGraphPostProcessTask {
    constructor(
        name: string,
        frameGraph: FrameGraph,
        postProcess: EffectWrapper,
        private readonly onExecute: () => void,
        private readonly getSettings: () => FrameGraphPostEffectsSettings,
    ) {
        super(name, frameGraph, postProcess);
    }

    override getClassName(): string {
        return "FrameGraphPostEffectsColorCorrectionTask";
    }

    override record(
        skipCreationOfDisabledPasses = false,
        additionalExecute?: (context: FrameGraphRenderContext) => void,
        additionalBindings?: (context: FrameGraphRenderContext) => void,
    ): FrameGraphRenderPass {
        return super.record(
            skipCreationOfDisabledPasses,
            (context) => {
                this.onExecute();
                additionalExecute?.(context);
            },
            (context) => {
                const settings = this.getSettings();
                this.postProcess.effect.setFloat("contrast", settings.contrast);
                this.postProcess.effect.setFloat("gammaPower", settings.gammaPower);
                additionalBindings?.(context);
            },
        );
    }
}

class FrameGraphPostEffectsSsaoToonCompositeTask extends FrameGraphPostProcessTask {
    originalTexture?: FrameGraphTextureHandle;

    constructor(
        name: string,
        frameGraph: FrameGraph,
        postProcess: EffectWrapper,
        private readonly getSettings: () => FrameGraphPostEffectsSettings,
    ) {
        super(name, frameGraph, postProcess);
    }

    override getClassName(): string {
        return "FrameGraphPostEffectsSsaoToonCompositeTask";
    }

    override record(
        skipCreationOfDisabledPasses = false,
        additionalExecute?: (context: FrameGraphRenderContext) => void,
        additionalBindings?: (context: FrameGraphRenderContext) => void,
    ): FrameGraphRenderPass {
        const pass = super.record(
            skipCreationOfDisabledPasses,
            additionalExecute,
            (context) => {
                const settings = this.getSettings();
                const effect = this.postProcess.effect;
                const shadowColor = settings.ssaoShadowColor;
                const engine = this.postProcess.options.engine;
                effect.setFloat3("shadowColor", shadowColor.r, shadowColor.g, shadowColor.b);
                effect.setFloat("toonInfluence", settings.ssaoToonInfluence);
                effect.setFloat("enabled", settings.ssaoEnabled && settings.ssaoStrength > 0.00001 ? 1 : 0);
                effect.setFloat2(
                    "texelSize",
                    1 / Math.max(1, engine.getRenderWidth()),
                    1 / Math.max(1, engine.getRenderHeight()),
                );
                if (this.originalTexture !== undefined) {
                    context.bindTextureHandle(effect, "originalColor", this.originalTexture);
                }
                additionalBindings?.(context);
            },
        );
        if (this.originalTexture !== undefined) {
            pass.addDependencies(this.originalTexture);
        }
        return pass;
    }
}

class FrameGraphPostEffectsVignetteEdgeBlurTask extends FrameGraphPostProcessTask {
    constructor(
        name: string,
        frameGraph: FrameGraph,
        postProcess: EffectWrapper,
        private readonly getSettings: () => FrameGraphPostEffectsSettings,
    ) {
        super(name, frameGraph, postProcess);
    }

    override getClassName(): string {
        return "FrameGraphPostEffectsVignetteEdgeBlurTask";
    }

    override record(
        skipCreationOfDisabledPasses = false,
        additionalExecute?: (context: FrameGraphRenderContext) => void,
        additionalBindings?: (context: FrameGraphRenderContext) => void,
    ): FrameGraphRenderPass {
        return super.record(
            skipCreationOfDisabledPasses,
            additionalExecute,
            (context) => {
                const settings = this.getSettings();
                const effect = this.postProcess.effect;
                const engine = this.postProcess.options.engine;
                const width = Math.max(1, engine.getRenderWidth());
                const height = Math.max(1, engine.getRenderHeight());
                effect.setFloat2("texelSize", 1 / width, 1 / height);
                effect.setFloat("aspectRatio", width / height);
                effect.setFloat("vignetteWeight", settings.vignetteEnabled ? Math.max(0, settings.vignetteWeight) : 0);
                effect.setFloat("edgeBlurStrength", Math.max(0, Math.min(1, settings.edgeBlurStrength / 3)));
                additionalBindings?.(context);
            },
        );
    }
}

class FrameGraphPostEffectsLensDistortionTask extends FrameGraphPostProcessTask {
    constructor(
        name: string,
        frameGraph: FrameGraph,
        postProcess: EffectWrapper,
        private readonly getSettings: () => FrameGraphPostEffectsSettings,
    ) {
        super(name, frameGraph, postProcess);
    }

    override getClassName(): string {
        return "FrameGraphPostEffectsLensDistortionTask";
    }

    override record(
        skipCreationOfDisabledPasses = false,
        additionalExecute?: (context: FrameGraphRenderContext) => void,
        additionalBindings?: (context: FrameGraphRenderContext) => void,
    ): FrameGraphRenderPass {
        return super.record(
            skipCreationOfDisabledPasses,
            additionalExecute,
            (context) => {
                this.postProcess.effect.setFloat("distortion", this.getSettings().lensDistortion);
                additionalBindings?.(context);
            },
        );
    }
}

export class FrameGraphPostEffectsController {
    private activationWarningEmitted = false;
    private colorCorrectionEffect: EffectWrapper | null = null;
    private lutEffect: EffectWrapper | null = null;
    private lutTask: FrameGraphPostEffectsLutTask | null = null;
    private lutTexture: RawTexture | null = null;
    private lutTextureKey: string | null = null;
    private imageProcessingEffect: ThinImageProcessingPostProcess | null = null;
    private imageProcessingTask: FrameGraphImageProcessingTask | null = null;
    private geometryRendererTask: FrameGraphGeometryRendererTask | null = null;
    private ssaoTask: FrameGraphSSAO2RenderingPipelineTask | null = null;
    private ssaoToonCompositeEffect: EffectWrapper | null = null;
    private ssaoToonCompositeTask: FrameGraphPostEffectsSsaoToonCompositeTask | null = null;
    private ssrTask: FrameGraphSSRRenderingPipelineTask | null = null;
    private depthOfFieldTask: FrameGraphDepthOfFieldTask | null = null;
    private bloomTask: FrameGraphBloomTask | null = null;
    private chromaticAberrationEffect: ThinChromaticAberrationPostProcess | null = null;
    private chromaticAberrationTask: FrameGraphChromaticAberrationTask | null = null;
    private vignetteEdgeBlurEffect: EffectWrapper | null = null;
    private vignetteEdgeBlurTask: FrameGraphPostEffectsVignetteEdgeBlurTask | null = null;
    private lensDistortionEffect: EffectWrapper | null = null;
    private lensDistortionTask: FrameGraphPostEffectsLensDistortionTask | null = null;
    private grainEffect: ThinGrainPostProcess | null = null;
    private grainTask: FrameGraphGrainTask | null = null;
    private sharpenEffect: ThinSharpenPostProcess | null = null;
    private sharpenTask: FrameGraphSharpenTask | null = null;
    private fxaaEffect: ThinFXAAPostProcess | null = null;
    private fxaaTask: FrameGraphFXAATask | null = null;
    private frameGraph: FrameGraph | null = null;
    private activeScene: Scene | null = null;
    private ready = false;
    private active = false;
    private executedFrameCount = 0;
    private lastImageProcessingEnabled: boolean | null = null;

    constructor(
        private readonly onWarning: (warning: FrameGraphPostEffectsWarning) => void,
        private readonly onInfo?: (info: FrameGraphPostEffectsInfo) => void,
        private readonly getSettings: () => FrameGraphPostEffectsSettings = () => ({
            contrast: 1,
            gammaPower: 1,
            imageProcessingEnabled: false,
            dofEnabled: false,
            dofBlurLevel: ThinDepthOfFieldEffectBlurLevel.Medium,
            dofFocusDistanceMm: 55000,
            dofEffectiveFStop: 2.8,
            dofLensSize: 30,
            dofFocalLength: 50,
            bloomEnabled: false,
            bloomWeight: 1,
            bloomThreshold: 1,
            bloomKernel: 100,
            vignetteEnabled: false,
            vignetteWeight: 0.3,
            edgeBlurStrength: 0,
            lensDistortion: 0,
            chromaticAberration: 0,
            grainIntensity: 0,
            sharpenEdge: 0,
            ssaoEnabled: false,
            ssaoStrength: 1,
            ssaoRadius: 2,
            ssaoShadowColor: { r: 0.15, g: 0.15, b: 0.2 },
            ssaoToonInfluence: 1,
            ssrEnabled: false,
            ssrStrength: 0.3,
            ssrStep: 4,
            lutEnabled: false,
            lutIntensity: 1,
            lutRuntimeText: null,
            lutTextureKey: null,
            antialiasEnabled: true,
        }),
    ) {}

    activate(
        scene?: Scene,
        sourceTexture?: InternalTexture | null,
        depthTexture?: InternalTexture | null,
        camera?: Camera | null,
    ): boolean {
        if (this.active) {
            return true;
        }
        if (!scene || !sourceTexture) {
            this.emitWarningOnce({
                message: "Frame Graph post effects are not connected to a source texture. Using classic post effects.",
                reason: "not-connected",
            });
            return false;
        }

        ensureColorCorrectionShaders();
        ensureLutShaders();
        ensureSsaoToonCompositeShaders();
        ensureVignetteEdgeBlurShaders();
        ensureLensDistortionShaders();

        const frameGraph = new FrameGraph(scene, false);
        frameGraph.name = "MMD modoki post effects";
        this.colorCorrectionEffect = new EffectWrapper({
            engine: frameGraph.engine,
            fragmentShader: "mmdFrameGraphColorCorrection",
            useShaderStore: true,
            useAsPostProcess: true,
            uniforms: ["contrast", "gammaPower"],
            name: "mmdFrameGraphColorCorrection",
            shaderLanguage: frameGraph.engine.isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
        });

        const sourceTextureHandle = frameGraph.textureManager.importTexture(
            "frameGraphPostEffectsSceneColor",
            sourceTexture,
        );
        const depthTextureHandle = depthTexture
            ? frameGraph.textureManager.importTexture("frameGraphPostEffectsDepth", depthTexture)
            : undefined;

        this.imageProcessingEffect = new ThinImageProcessingPostProcess(
            "frameGraphPostEffectsImageProcessing",
            frameGraph.engine,
            {
                scene,
                shaderLanguage: frameGraph.engine.isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
            },
        );
        // The imported scene-color RT comes from the existing editor render path.
        // Treat it as display/gamma-space input so ImageProcessingTask does not
        // apply an extra final gamma lift when LUT is enabled.
        this.imageProcessingEffect.fromLinearSpace = false;
        const imageProcessingTask = new FrameGraphImageProcessingTask(
            "frameGraphPostEffectsImageProcessing",
            frameGraph,
            this.imageProcessingEffect,
        );
        const initialSettings = this.getSettings();
        this.updateLutTexture(scene, initialSettings);
        imageProcessingTask.sourceTexture = sourceTextureHandle;
        imageProcessingTask.disabled = !initialSettings.imageProcessingEnabled;
        this.lastImageProcessingEnabled = initialSettings.imageProcessingEnabled;
        frameGraph.addTask(imageProcessingTask);
        this.imageProcessingTask = imageProcessingTask;

        let dofSourceTexture = imageProcessingTask.outputTexture;
        if (camera) {
            const sourceTextureSize = this.getSourceTextureSize(scene, sourceTexture);
            const geometryDepthTexture = frameGraph.textureManager.createRenderTargetTexture(
                "frameGraphPostEffectsGeometryDepth",
                {
                    size: sourceTextureSize,
                    sizeIsPercentage: false,
                    options: {
                        createMipMaps: false,
                        types: [Constants.TEXTURETYPE_UNSIGNED_BYTE],
                        formats: [Constants.TEXTUREFORMAT_DEPTH32_FLOAT],
                        samples: 1,
                        useSRGBBuffers: [false],
                        labels: ["geometryDepth"],
                    },
                },
            );
            const clearGeometryDepthTask = new FrameGraphClearTextureTask(
                "frameGraphPostEffectsGeometryDepthClear",
                frameGraph,
            );
            clearGeometryDepthTask.clearColor = false;
            clearGeometryDepthTask.clearDepth = true;
            clearGeometryDepthTask.depthTexture = geometryDepthTexture;
            frameGraph.addTask(clearGeometryDepthTask);

            const geometryRendererTask = new FrameGraphGeometryRendererTask(
                "frameGraphPostEffectsGeometry",
                frameGraph,
                scene,
                { doNotChangeAspectRatio: true },
            );
            const objectList = new FrameGraphObjectList();
            objectList.meshes = null;
            objectList.particleSystems = null;
            geometryRendererTask.objectList = objectList;
            geometryRendererTask.camera = camera;
            geometryRendererTask.depthTexture = clearGeometryDepthTask.depthTexture;
            geometryRendererTask.size = sourceTextureSize;
            geometryRendererTask.sizeIsPercentage = false;
            geometryRendererTask.samples = 1;
            geometryRendererTask.textureDescriptions = [
                {
                    type: Constants.PREPASS_NORMAL_TEXTURE_TYPE,
                    textureType: Constants.TEXTURETYPE_HALF_FLOAT,
                    textureFormat: Constants.TEXTUREFORMAT_RGBA,
                },
                {
                    type: Constants.PREPASS_DEPTH_TEXTURE_TYPE,
                    textureType: Constants.TEXTURETYPE_HALF_FLOAT,
                    textureFormat: Constants.TEXTUREFORMAT_RED,
                },
                {
                    type: Constants.PREPASS_REFLECTIVITY_TEXTURE_TYPE,
                    textureType: Constants.TEXTURETYPE_HALF_FLOAT,
                    textureFormat: Constants.TEXTUREFORMAT_RGBA,
                },
            ];
            geometryRendererTask.disabled = !this.isGeometryRendererNeeded(initialSettings);
            frameGraph.addTask(geometryRendererTask);
            this.geometryRendererTask = geometryRendererTask;

            const ssrTask = new FrameGraphSSRRenderingPipelineTask(
                "frameGraphPostEffectsSSR",
                frameGraph,
                Constants.TEXTURETYPE_HALF_FLOAT,
            );
            ssrTask.sourceTexture = imageProcessingTask.outputTexture;
            ssrTask.depthTexture = geometryRendererTask.geometryViewDepthTexture;
            ssrTask.normalTexture = geometryRendererTask.geometryViewNormalTexture;
            ssrTask.reflectivityTexture = geometryRendererTask.geometryReflectivityTexture;
            ssrTask.camera = camera;
            ssrTask.disabled = !this.isSsrEnabled(initialSettings);
            this.applySsrSettings(ssrTask, initialSettings);
            frameGraph.addTask(ssrTask);
            this.ssrTask = ssrTask;

            const ssaoTask = new FrameGraphSSAO2RenderingPipelineTask(
                "frameGraphPostEffectsSSAO2",
                frameGraph,
                0.75,
                0.75,
            );
            ssaoTask.sourceTexture = ssrTask.outputTexture;
            ssaoTask.depthTexture = geometryRendererTask.geometryViewDepthTexture;
            ssaoTask.normalTexture = geometryRendererTask.geometryViewNormalTexture;
            ssaoTask.camera = camera;
            ssaoTask.disabled = !initialSettings.ssaoEnabled || initialSettings.ssaoStrength <= 0.00001;
            this.applySsaoSettings(ssaoTask, initialSettings, camera);
            frameGraph.addTask(ssaoTask);
            this.ssaoTask = ssaoTask;

            this.ssaoToonCompositeEffect = new EffectWrapper({
                engine: frameGraph.engine,
                fragmentShader: "mmdFrameGraphSsaoToonComposite",
                useShaderStore: true,
                useAsPostProcess: true,
                uniforms: ["shadowColor", "toonInfluence", "enabled", "texelSize"],
                samplers: ["originalColor"],
                name: "mmdFrameGraphSsaoToonComposite",
                shaderLanguage: frameGraph.engine.isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
            });
            const ssaoToonCompositeTask = new FrameGraphPostEffectsSsaoToonCompositeTask(
                "frameGraphPostEffectsSSAOToonComposite",
                frameGraph,
                this.ssaoToonCompositeEffect,
                this.getSettings,
            );
            ssaoToonCompositeTask.sourceTexture = ssaoTask.outputTexture;
            ssaoToonCompositeTask.originalTexture = imageProcessingTask.outputTexture;
            ssaoToonCompositeTask.disabled = !initialSettings.ssaoEnabled || initialSettings.ssaoStrength <= 0.00001;
            frameGraph.addTask(ssaoToonCompositeTask);
            this.ssaoToonCompositeTask = ssaoToonCompositeTask;
            dofSourceTexture = ssaoToonCompositeTask.outputTexture;
        }

        let bloomSourceTexture = dofSourceTexture;
        if (depthTextureHandle !== undefined && camera) {
            const blurLevel = initialSettings.dofBlurLevel <= ThinDepthOfFieldEffectBlurLevel.Low
                ? ThinDepthOfFieldEffectBlurLevel.Low
                : initialSettings.dofBlurLevel === ThinDepthOfFieldEffectBlurLevel.Medium
                    ? ThinDepthOfFieldEffectBlurLevel.Medium
                    : ThinDepthOfFieldEffectBlurLevel.High;
            const depthOfFieldTask = new FrameGraphDepthOfFieldTask(
                "frameGraphPostEffectsDepthOfField",
                frameGraph,
                blurLevel,
                false,
            );
            depthOfFieldTask.sourceTexture = dofSourceTexture;
            depthOfFieldTask.depthTexture = depthTextureHandle;
            depthOfFieldTask.camera = camera;
            depthOfFieldTask.disabled = !initialSettings.dofEnabled;
            this.applyDepthOfFieldSettings(depthOfFieldTask, initialSettings);
            frameGraph.addTask(depthOfFieldTask);
            this.depthOfFieldTask = depthOfFieldTask;
            bloomSourceTexture = depthOfFieldTask.outputTexture;
        }

        const bloomTask = new FrameGraphBloomTask(
            "frameGraphPostEffectsBloom",
            frameGraph,
            Math.max(0, initialSettings.bloomWeight),
            Math.max(1, initialSettings.bloomKernel),
            Math.max(0, initialSettings.bloomThreshold),
            false,
        );
        bloomTask.sourceTexture = bloomSourceTexture;
        bloomTask.disabled = !initialSettings.bloomEnabled;
        frameGraph.addTask(bloomTask);
        this.bloomTask = bloomTask;

        this.lutEffect = new EffectWrapper({
            engine: frameGraph.engine,
            fragmentShader: "mmdFrameGraphLut",
            useShaderStore: true,
            useAsPostProcess: true,
            uniforms: ["lutSize", "lutIntensity"],
            samplers: ["lutSampler"],
            name: "mmdFrameGraphLut",
            shaderLanguage: frameGraph.engine.isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
        });
        const lutTask = new FrameGraphPostEffectsLutTask(
            "frameGraphPostEffectsLut",
            frameGraph,
            this.lutEffect,
            this.getSettings,
            () => this.lutTexture,
        );
        lutTask.sourceTexture = bloomTask.outputTexture;
        lutTask.disabled = !this.isLutEnabled(initialSettings);
        frameGraph.addTask(lutTask);
        this.lutTask = lutTask;

        const colorCorrectionTask = new FrameGraphPostEffectsColorCorrectionTask(
            "frameGraphPostEffectsColorCorrection",
            frameGraph,
            this.colorCorrectionEffect,
            () => {
                this.executedFrameCount += 1;
            },
            this.getSettings,
        );
        colorCorrectionTask.sourceTexture = lutTask.outputTexture;
        frameGraph.addTask(colorCorrectionTask);

        this.sharpenEffect = new ThinSharpenPostProcess(
            "frameGraphPostEffectsSharpen",
            frameGraph.engine,
            {
                shaderLanguage: frameGraph.engine.isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
            },
        );
        const sharpenTask = new FrameGraphSharpenTask(
            "frameGraphPostEffectsSharpen",
            frameGraph,
            this.sharpenEffect,
        );
        sharpenTask.sourceTexture = colorCorrectionTask.outputTexture;
        sharpenTask.disabled = initialSettings.sharpenEdge <= 0.0001;
        this.applySharpenSettings(sharpenTask, initialSettings);
        frameGraph.addTask(sharpenTask);
        this.sharpenTask = sharpenTask;

        this.grainEffect = new ThinGrainPostProcess(
            "frameGraphPostEffectsGrain",
            frameGraph.engine,
            {
                shaderLanguage: frameGraph.engine.isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
            },
        );
        const grainTask = new FrameGraphGrainTask(
            "frameGraphPostEffectsGrain",
            frameGraph,
            this.grainEffect,
        );
        grainTask.sourceTexture = sharpenTask.outputTexture;
        grainTask.disabled = initialSettings.grainIntensity <= 0.0001;
        this.applyGrainSettings(grainTask, initialSettings);
        frameGraph.addTask(grainTask);
        this.grainTask = grainTask;

        this.chromaticAberrationEffect = new ThinChromaticAberrationPostProcess(
            "frameGraphPostEffectsChromaticAberration",
            frameGraph.engine,
            {
                shaderLanguage: frameGraph.engine.isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
            },
        );
        const chromaticAberrationTask = new FrameGraphChromaticAberrationTask(
            "frameGraphPostEffectsChromaticAberration",
            frameGraph,
            this.chromaticAberrationEffect,
        );
        chromaticAberrationTask.sourceTexture = grainTask.outputTexture;
        chromaticAberrationTask.disabled = initialSettings.chromaticAberration <= 0.0001;
        this.applyChromaticAberrationSettings(chromaticAberrationTask, initialSettings);
        frameGraph.addTask(chromaticAberrationTask);
        this.chromaticAberrationTask = chromaticAberrationTask;

        this.vignetteEdgeBlurEffect = new EffectWrapper({
            engine: frameGraph.engine,
            fragmentShader: "mmdFrameGraphVignetteEdgeBlur",
            useShaderStore: true,
            useAsPostProcess: true,
            uniforms: ["texelSize", "edgeBlurStrength", "vignetteWeight", "aspectRatio"],
            name: "mmdFrameGraphVignetteEdgeBlur",
            shaderLanguage: frameGraph.engine.isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
        });
        const vignetteEdgeBlurTask = new FrameGraphPostEffectsVignetteEdgeBlurTask(
            "frameGraphPostEffectsVignetteEdgeBlur",
            frameGraph,
            this.vignetteEdgeBlurEffect,
            this.getSettings,
        );
        vignetteEdgeBlurTask.sourceTexture = chromaticAberrationTask.outputTexture;
        vignetteEdgeBlurTask.disabled = !this.isVignetteEdgeBlurEnabled(initialSettings);
        frameGraph.addTask(vignetteEdgeBlurTask);
        this.vignetteEdgeBlurTask = vignetteEdgeBlurTask;

        this.lensDistortionEffect = new EffectWrapper({
            engine: frameGraph.engine,
            fragmentShader: "mmdFrameGraphLensDistortion",
            useShaderStore: true,
            useAsPostProcess: true,
            uniforms: ["distortion"],
            name: "mmdFrameGraphLensDistortion",
            shaderLanguage: frameGraph.engine.isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
        });
        const lensDistortionTask = new FrameGraphPostEffectsLensDistortionTask(
            "frameGraphPostEffectsLensDistortion",
            frameGraph,
            this.lensDistortionEffect,
            this.getSettings,
        );
        lensDistortionTask.sourceTexture = vignetteEdgeBlurTask.outputTexture;
        lensDistortionTask.disabled = Math.abs(initialSettings.lensDistortion) <= 0.0001;
        frameGraph.addTask(lensDistortionTask);
        this.lensDistortionTask = lensDistortionTask;

        this.fxaaEffect = new ThinFXAAPostProcess(
            "frameGraphPostEffectsFXAA",
            frameGraph.engine,
            {
                shaderLanguage: frameGraph.engine.isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
            },
        );
        const fxaaTask = new FrameGraphFXAATask(
            "frameGraphPostEffectsFXAA",
            frameGraph,
            this.fxaaEffect,
        );
        fxaaTask.sourceTexture = lensDistortionTask.outputTexture;
        fxaaTask.disabled = !initialSettings.antialiasEnabled;
        frameGraph.addTask(fxaaTask);
        this.fxaaTask = fxaaTask;

        const outputTask = new FrameGraphCopyToBackbufferColorTask(
            "frameGraphPostEffectsOutput",
            frameGraph,
        );
        outputTask.sourceTexture = fxaaTask.outputTexture;
        frameGraph.addTask(outputTask);

        this.frameGraph = frameGraph;
        this.activeScene = scene;
        this.active = true;
        this.onInfo?.({
            message: "Frame Graph post effects backend active (image processing + SSAO2 + DoF + Bloom + LUT + color correction + Sharpen + Grain + Chromatic Aberration + Vignette + EdgeBlur + Lens Distortion + FXAA).",
            event: "activated",
        });
        void this.frameGraph.buildAsync().then(() => {
            this.ready = true;
            this.onInfo?.({
                message: "Frame Graph post effects backend ready.",
                event: "ready",
            });
        }).catch((err: unknown) => {
            this.ready = false;
            this.active = false;
            const message = err instanceof Error ? err.message : String(err);
            this.emitWarningOnce({
                message: `Frame Graph post effects failed to build. Using classic post effects. Reason: ${message}`,
                reason: "build-failed",
            });
        });
        return true;
    }

    execute(): void {
        if (!this.active || !this.ready || !this.frameGraph?.isReady()) {
            return;
        }
        const settings = this.getSettings();
        if (this.activeScene) {
            this.updateLutTexture(this.activeScene, settings);
        }
        if (this.imageProcessingTask) {
            this.imageProcessingTask.disabled = !settings.imageProcessingEnabled;
        }
        if (this.imageProcessingEffect && this.lastImageProcessingEnabled !== settings.imageProcessingEnabled) {
            this.imageProcessingEffect._updateParameters();
            this.lastImageProcessingEnabled = settings.imageProcessingEnabled;
        }
        if (this.imageProcessingEffect?.vignetteEnabled) {
            this.imageProcessingEffect.vignetteEnabled = false;
        }
        if (this.depthOfFieldTask) {
            this.depthOfFieldTask.disabled = !settings.dofEnabled;
            this.applyDepthOfFieldSettings(this.depthOfFieldTask, settings);
        }
        if (this.geometryRendererTask) {
            this.geometryRendererTask.disabled = !this.isGeometryRendererNeeded(settings);
        }
        if (this.ssrTask) {
            this.ssrTask.disabled = !this.isSsrEnabled(settings);
            this.applySsrSettings(this.ssrTask, settings);
        }
        if (this.ssaoTask) {
            this.ssaoTask.disabled = !settings.ssaoEnabled || settings.ssaoStrength <= 0.00001;
            this.applySsaoSettings(this.ssaoTask, settings, this.ssaoTask.camera);
        }
        if (this.ssaoToonCompositeTask) {
            this.ssaoToonCompositeTask.disabled = !settings.ssaoEnabled || settings.ssaoStrength <= 0.00001;
        }
        if (this.bloomTask) {
            this.bloomTask.disabled = !settings.bloomEnabled;
            this.applyBloomSettings(this.bloomTask, settings);
        }
        if (this.lutTask) {
            this.lutTask.disabled = !this.isLutEnabled(settings);
        }
        if (this.sharpenTask) {
            this.sharpenTask.disabled = settings.sharpenEdge <= 0.0001;
            this.applySharpenSettings(this.sharpenTask, settings);
        }
        if (this.grainTask) {
            this.grainTask.disabled = settings.grainIntensity <= 0.0001;
            this.applyGrainSettings(this.grainTask, settings);
        }
        if (this.chromaticAberrationTask) {
            this.chromaticAberrationTask.disabled = settings.chromaticAberration <= 0.0001;
            this.applyChromaticAberrationSettings(this.chromaticAberrationTask, settings);
        }
        if (this.vignetteEdgeBlurTask) {
            this.vignetteEdgeBlurTask.disabled = !this.isVignetteEdgeBlurEnabled(settings);
        }
        if (this.lensDistortionTask) {
            this.lensDistortionTask.disabled = Math.abs(settings.lensDistortion) <= 0.0001;
        }
        if (this.fxaaTask) {
            this.fxaaTask.disabled = !settings.antialiasEnabled;
        }
        this.frameGraph.execute();
    }

    getExecutedFrameCount(): number {
        return this.executedFrameCount;
    }

    private emitWarningOnce(warning: FrameGraphPostEffectsWarning): void {
        if (!this.activationWarningEmitted) {
            this.activationWarningEmitted = true;
            this.onWarning(warning);
        }
    }

    dispose(): void {
        this.colorCorrectionEffect?.dispose();
        this.colorCorrectionEffect = null;
        this.lutEffect?.dispose();
        this.lutEffect = null;
        this.lutTask = null;
        this.disposeLutTexture();
        this.imageProcessingEffect?.dispose();
        this.imageProcessingEffect = null;
        this.imageProcessingTask = null;
        this.geometryRendererTask = null;
        this.ssrTask?.dispose();
        this.ssrTask = null;
        this.ssaoTask?.dispose();
        this.ssaoTask = null;
        this.ssaoToonCompositeEffect?.dispose();
        this.ssaoToonCompositeEffect = null;
        this.ssaoToonCompositeTask = null;
        this.depthOfFieldTask = null;
        this.bloomTask = null;
        this.chromaticAberrationEffect?.dispose();
        this.chromaticAberrationEffect = null;
        this.chromaticAberrationTask = null;
        this.vignetteEdgeBlurEffect?.dispose();
        this.vignetteEdgeBlurEffect = null;
        this.vignetteEdgeBlurTask = null;
        this.lensDistortionEffect?.dispose();
        this.lensDistortionEffect = null;
        this.lensDistortionTask = null;
        this.grainEffect?.dispose();
        this.grainEffect = null;
        this.grainTask = null;
        this.sharpenEffect?.dispose();
        this.sharpenEffect = null;
        this.sharpenTask = null;
        this.fxaaEffect?.dispose();
        this.fxaaEffect = null;
        this.fxaaTask = null;
        this.frameGraph?.dispose();
        this.frameGraph = null;
        this.activeScene = null;
        this.ready = false;
        this.active = false;
        this.executedFrameCount = 0;
        this.lastImageProcessingEnabled = null;
        this.activationWarningEmitted = false;
    }

    private applyDepthOfFieldSettings(
        depthOfFieldTask: FrameGraphDepthOfFieldTask,
        settings: FrameGraphPostEffectsSettings,
    ): void {
        depthOfFieldTask.depthOfField.focusDistance = Math.max(1, settings.dofFocusDistanceMm);
        depthOfFieldTask.depthOfField.fStop = Math.max(0.01, settings.dofEffectiveFStop);
        depthOfFieldTask.depthOfField.lensSize = Math.max(0.001, settings.dofLensSize);
        depthOfFieldTask.depthOfField.focalLength = Math.max(1, settings.dofFocalLength);
    }

    private applyBloomSettings(
        bloomTask: FrameGraphBloomTask,
        settings: FrameGraphPostEffectsSettings,
    ): void {
        bloomTask.bloom.weight = Math.max(0, settings.bloomWeight);
        bloomTask.bloom.threshold = Math.max(0, settings.bloomThreshold);
        bloomTask.bloom.kernel = Math.max(1, settings.bloomKernel);
    }

    private isLutEnabled(settings: FrameGraphPostEffectsSettings): boolean {
        return settings.lutEnabled
            && settings.lutIntensity > 0.00001
            && !!settings.lutRuntimeText
            && !!this.lutTexture
            && this.lutTexture.isReady();
    }

    private updateLutTexture(scene: Scene, settings: FrameGraphPostEffectsSettings): void {
        const textureKey = settings.lutTextureKey;
        if (!settings.lutEnabled || !settings.lutRuntimeText || !textureKey) {
            this.disposeLutTexture();
            return;
        }
        if (this.lutTexture && this.lutTextureKey === textureKey) {
            return;
        }

        this.disposeLutTexture();
        try {
            this.lutTexture = createLutAtlasTextureFrom3dlText(
                scene,
                `frameGraphLut:${textureKey}`,
                settings.lutRuntimeText,
            );
            this.lutTextureKey = textureKey;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`Failed to create Frame Graph LUT '${textureKey}': ${message}`);
            this.lutTexture = null;
            this.lutTextureKey = null;
        }
    }

    private disposeLutTexture(): void {
        if (this.lutTexture) {
            this.lutTexture.dispose();
            this.lutTexture = null;
        }
        this.lutTextureKey = null;
    }

    private applySsaoSettings(
        ssaoTask: FrameGraphSSAO2RenderingPipelineTask,
        settings: FrameGraphPostEffectsSettings,
        camera: Camera,
    ): void {
        ssaoTask.ssao.samples = 16;
        ssaoTask.ssao.expensiveBlur = true;
        ssaoTask.ssao.bilateralSamples = 16;
        ssaoTask.ssao.bilateralSoften = 0.25;
        ssaoTask.ssao.bilateralTolerance = 0.15;
        ssaoTask.ssao.base = 0;
        ssaoTask.ssao.totalStrength = Math.max(0, settings.ssaoStrength) * 2.2;
        ssaoTask.ssao.radius = Math.max(0.01, settings.ssaoRadius);
        ssaoTask.ssao.maxZ = Math.max(50, Math.min(2000, camera.maxZ));
        ssaoTask.ssao.minZAspect = 0.2;
        ssaoTask.ssao.epsilon = 0.02;
    }

    private applySsrSettings(
        ssrTask: FrameGraphSSRRenderingPipelineTask,
        settings: FrameGraphPostEffectsSettings,
    ): void {
        ssrTask.ssr.strength = Math.max(0, settings.ssrStrength);
        ssrTask.ssr.step = 4;
        ssrTask.ssr.maxDistance = 1000;
        ssrTask.ssr.maxSteps = 192;
        ssrTask.ssr.thickness = 0.22;
        ssrTask.ssr.reflectivityThreshold = 0.85;
        ssrTask.ssr.roughnessFactor = 0.28;
        ssrTask.ssr.blurDispersionStrength = 0.08;
        ssrTask.ssr.ssrDownsample = 0;
        ssrTask.ssr.blurDownsample = 0;
        ssrTask.ssr.enableSmoothReflections = true;
        ssrTask.ssr.inputTextureColorIsInGammaSpace = true;
        ssrTask.ssr.generateOutputInGammaSpace = true;
        ssrTask.ssr.normalsAreInWorldSpace = false;
        ssrTask.ssr.useScreenspaceDepth = false;
        ssrTask.ssr.debug = false;
    }

    private isSsrEnabled(settings: FrameGraphPostEffectsSettings): boolean {
        return settings.ssrEnabled && settings.ssrStrength > 0.00001;
    }

    private isGeometryRendererNeeded(settings: FrameGraphPostEffectsSettings): boolean {
        return this.isSsrEnabled(settings)
            || (settings.ssaoEnabled && settings.ssaoStrength > 0.00001);
    }

    private applyChromaticAberrationSettings(
        chromaticAberrationTask: FrameGraphChromaticAberrationTask,
        settings: FrameGraphPostEffectsSettings,
    ): void {
        chromaticAberrationTask.postProcess.aberrationAmount = Math.max(0, settings.chromaticAberration);
        chromaticAberrationTask.postProcess.radialIntensity = 2.2;
        chromaticAberrationTask.postProcess.direction = Vector2.Zero();
        chromaticAberrationTask.postProcess.centerPosition = new Vector2(0.5, 0.5);
    }

    private applyGrainSettings(
        grainTask: FrameGraphGrainTask,
        settings: FrameGraphPostEffectsSettings,
    ): void {
        grainTask.postProcess.intensity = Math.max(0, settings.grainIntensity);
        grainTask.postProcess.animated = false;
    }

    private applySharpenSettings(
        sharpenTask: FrameGraphSharpenTask,
        settings: FrameGraphPostEffectsSettings,
    ): void {
        sharpenTask.postProcess.edgeAmount = Math.max(0, settings.sharpenEdge);
        sharpenTask.postProcess.colorAmount = 1;
    }

    private isVignetteEdgeBlurEnabled(settings: FrameGraphPostEffectsSettings): boolean {
        return (settings.vignetteEnabled && settings.vignetteWeight > 0.0001)
            || settings.edgeBlurStrength > 0.0001;
    }

    private getSourceTextureSize(scene: Scene, sourceTexture: InternalTexture): { width: number; height: number } {
        const textureWithSize = sourceTexture as InternalTexture & {
            baseWidth?: number;
            baseHeight?: number;
        };
        return {
            width: Math.max(1, textureWithSize.width || textureWithSize.baseWidth || scene.getEngine().getRenderWidth()),
            height: Math.max(1, textureWithSize.height || textureWithSize.baseHeight || scene.getEngine().getRenderHeight()),
        };
    }
}
