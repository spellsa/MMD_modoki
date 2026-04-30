import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import { FrameGraph } from "@babylonjs/core/FrameGraph/frameGraph";
import { FrameGraphImageProcessingTask } from "@babylonjs/core/FrameGraph/Tasks/PostProcesses/imageProcessingTask";
import { FrameGraphPostProcessTask } from "@babylonjs/core/FrameGraph/Tasks/PostProcesses/postProcessTask";
import { FrameGraphCopyToBackbufferColorTask } from "@babylonjs/core/FrameGraph/Tasks/Texture/copyToBackbufferColorTask";
import type { FrameGraphRenderPass } from "@babylonjs/core/FrameGraph/frameGraphRenderPass";
import type { FrameGraphRenderContext } from "@babylonjs/core/FrameGraph/frameGraphRenderContext";
import { EffectWrapper } from "@babylonjs/core/Materials/effectRenderer";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import type { InternalTexture } from "@babylonjs/core/Materials/Textures/internalTexture";
import { ThinImageProcessingPostProcess } from "@babylonjs/core/PostProcesses/thinImageProcessingPostProcess";
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

export class FrameGraphPostEffectsController {
    private activationWarningEmitted = false;
    private colorCorrectionEffect: EffectWrapper | null = null;
    private imageProcessingEffect: ThinImageProcessingPostProcess | null = null;
    private imageProcessingTask: FrameGraphImageProcessingTask | null = null;
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
        }),
    ) {}

    activate(scene?: Scene, sourceTexture?: InternalTexture | null): boolean {
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

        const colorCorrectionTask = new FrameGraphPostEffectsColorCorrectionTask(
            "frameGraphPostEffectsColorCorrection",
            frameGraph,
            this.colorCorrectionEffect,
            () => {
                this.executedFrameCount += 1;
            },
            this.getSettings,
        );
        colorCorrectionTask.sourceTexture = imageProcessingTask.outputTexture;
        frameGraph.addTask(colorCorrectionTask);

        const outputTask = new FrameGraphCopyToBackbufferColorTask(
            "frameGraphPostEffectsOutput",
            frameGraph,
        );
        outputTask.sourceTexture = colorCorrectionTask.outputTexture;
        frameGraph.addTask(outputTask);

        this.frameGraph = frameGraph;
        this.active = true;
        this.onInfo?.({
            message: "Frame Graph post effects backend active (image processing + color correction).",
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
        this.frameGraph?.dispose();
        this.frameGraph = null;
        this.ready = false;
        this.active = false;
        this.executedFrameCount = 0;
        this.lastImageProcessingEnabled = null;
        this.activationWarningEmitted = false;
    }
}
