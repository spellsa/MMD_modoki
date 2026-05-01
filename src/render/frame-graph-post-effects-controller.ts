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
import { FrameGraphGeometryRendererTask } from "@babylonjs/core/FrameGraph/Tasks/Rendering/geometryRendererTask";
import { FrameGraphClearTextureTask } from "@babylonjs/core/FrameGraph/Tasks/Texture/clearTextureTask";
import { FrameGraphCopyToBackbufferColorTask } from "@babylonjs/core/FrameGraph/Tasks/Texture/copyToBackbufferColorTask";
import type { FrameGraphTextureHandle } from "@babylonjs/core/FrameGraph/frameGraphTypes";
import type { FrameGraphRenderPass } from "@babylonjs/core/FrameGraph/frameGraphRenderPass";
import type { FrameGraphRenderContext } from "@babylonjs/core/FrameGraph/frameGraphRenderContext";
import { EffectWrapper } from "@babylonjs/core/Materials/effectRenderer";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import type { InternalTexture } from "@babylonjs/core/Materials/Textures/internalTexture";
import { Vector2 } from "@babylonjs/core/Maths/math.vector";
import { ThinChromaticAberrationPostProcess } from "@babylonjs/core/PostProcesses/thinChromaticAberrationPostProcess";
import { ThinDepthOfFieldEffectBlurLevel } from "@babylonjs/core/PostProcesses/thinDepthOfFieldEffect";
import { ThinFXAAPostProcess } from "@babylonjs/core/PostProcesses/thinFXAAPostProcess";
import { ThinGrainPostProcess } from "@babylonjs/core/PostProcesses/thinGrainPostProcess";
import { ThinImageProcessingPostProcess } from "@babylonjs/core/PostProcesses/thinImageProcessingPostProcess";
import { ThinSharpenPostProcess } from "@babylonjs/core/PostProcesses/thinSharpenPostProcess";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { Scene } from "@babylonjs/core/scene";

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
    chromaticAberration: number;
    grainIntensity: number;
    sharpenEdge: number;
    ssaoEnabled: boolean;
    ssaoStrength: number;
    ssaoRadius: number;
    ssaoShadowColor: { r: number; g: number; b: number };
    ssaoToonInfluence: number;
    antialiasEnabled: boolean;
};

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

export class FrameGraphPostEffectsController {
    private activationWarningEmitted = false;
    private colorCorrectionEffect: EffectWrapper | null = null;
    private imageProcessingEffect: ThinImageProcessingPostProcess | null = null;
    private imageProcessingTask: FrameGraphImageProcessingTask | null = null;
    private geometryRendererTask: FrameGraphGeometryRendererTask | null = null;
    private ssaoTask: FrameGraphSSAO2RenderingPipelineTask | null = null;
    private ssaoToonCompositeEffect: EffectWrapper | null = null;
    private ssaoToonCompositeTask: FrameGraphPostEffectsSsaoToonCompositeTask | null = null;
    private depthOfFieldTask: FrameGraphDepthOfFieldTask | null = null;
    private bloomTask: FrameGraphBloomTask | null = null;
    private chromaticAberrationEffect: ThinChromaticAberrationPostProcess | null = null;
    private chromaticAberrationTask: FrameGraphChromaticAberrationTask | null = null;
    private grainEffect: ThinGrainPostProcess | null = null;
    private grainTask: FrameGraphGrainTask | null = null;
    private sharpenEffect: ThinSharpenPostProcess | null = null;
    private sharpenTask: FrameGraphSharpenTask | null = null;
    private fxaaEffect: ThinFXAAPostProcess | null = null;
    private fxaaTask: FrameGraphFXAATask | null = null;
    private frameGraph: FrameGraph | null = null;
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
            chromaticAberration: 0,
            grainIntensity: 0,
            sharpenEdge: 0,
            ssaoEnabled: false,
            ssaoStrength: 1,
            ssaoRadius: 2,
            ssaoShadowColor: { r: 0.15, g: 0.15, b: 0.2 },
            ssaoToonInfluence: 1,
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
        ensureSsaoToonCompositeShaders();

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
            ];
            geometryRendererTask.disabled = !initialSettings.ssaoEnabled || initialSettings.ssaoStrength <= 0.00001;
            frameGraph.addTask(geometryRendererTask);
            this.geometryRendererTask = geometryRendererTask;

            const ssaoTask = new FrameGraphSSAO2RenderingPipelineTask(
                "frameGraphPostEffectsSSAO2",
                frameGraph,
                0.75,
                0.75,
            );
            ssaoTask.sourceTexture = imageProcessingTask.outputTexture;
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

        const colorCorrectionTask = new FrameGraphPostEffectsColorCorrectionTask(
            "frameGraphPostEffectsColorCorrection",
            frameGraph,
            this.colorCorrectionEffect,
            () => {
                this.executedFrameCount += 1;
            },
            this.getSettings,
        );
        colorCorrectionTask.sourceTexture = bloomTask.outputTexture;
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
        fxaaTask.sourceTexture = chromaticAberrationTask.outputTexture;
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
        this.active = true;
        this.onInfo?.({
            message: "Frame Graph post effects backend active (image processing + SSAO2 + DoF + Bloom + color correction + Sharpen + Grain + Chromatic Aberration + FXAA).",
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
        if (this.imageProcessingTask) {
            this.imageProcessingTask.disabled = !settings.imageProcessingEnabled;
        }
        if (this.imageProcessingEffect && this.lastImageProcessingEnabled !== settings.imageProcessingEnabled) {
            this.imageProcessingEffect._updateParameters();
            this.lastImageProcessingEnabled = settings.imageProcessingEnabled;
        }
        if (this.depthOfFieldTask) {
            this.depthOfFieldTask.disabled = !settings.dofEnabled;
            this.applyDepthOfFieldSettings(this.depthOfFieldTask, settings);
        }
        if (this.geometryRendererTask) {
            this.geometryRendererTask.disabled = !settings.ssaoEnabled || settings.ssaoStrength <= 0.00001;
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
        this.imageProcessingEffect?.dispose();
        this.imageProcessingEffect = null;
        this.imageProcessingTask = null;
        this.geometryRendererTask = null;
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
