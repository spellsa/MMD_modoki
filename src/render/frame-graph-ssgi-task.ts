import "@babylonjs/core/Engines/WebGPU/Extensions/engine.computeShader";
import { Constants } from "@babylonjs/core/Engines/constants";
import type { FrameGraph } from "@babylonjs/core/FrameGraph/frameGraph";
import type { FrameGraphPass } from "@babylonjs/core/FrameGraph/Passes/pass";
import type { FrameGraphRenderPass } from "@babylonjs/core/FrameGraph/Passes/renderPass";
import type { FrameGraphContext } from "@babylonjs/core/FrameGraph/frameGraphContext";
import type { FrameGraphRenderContext } from "@babylonjs/core/FrameGraph/frameGraphRenderContext";
import type { FrameGraphTextureHandle } from "@babylonjs/core/FrameGraph/frameGraphTypes";
import { FrameGraphComputeShaderTask } from "@babylonjs/core/FrameGraph/Tasks/Misc/computeShaderTask";
import { FrameGraphPostProcessTask } from "@babylonjs/core/FrameGraph/Tasks/PostProcesses/postProcessTask";
import type { EffectWrapper } from "@babylonjs/core/Materials/effectRenderer";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { SsgiBlendMode } from "../types";
import {
    FRAME_GRAPH_SSGI_DENOISE_COMPUTE_WGSL,
    FRAME_GRAPH_SSGI_GATHER_COMPUTE_WGSL,
    FRAME_GRAPH_SSGI_METHOD_NAME,
} from "./frame-graph-ssgi-shaders";

export type FrameGraphSsgiRuntimeSettings = {
    strength: number;
    sampleRadius: number;
    blendMode: SsgiBlendMode;
};

export type FrameGraphSsgiResolutionReport = {
    method: typeof FRAME_GRAPH_SSGI_METHOD_NAME;
    output: string;
    inputs: {
        sceneColor: string;
        viewDepth: string;
        viewNormal: string;
    };
    resolved: boolean;
};

function describeAllocatedTexture(
    context: FrameGraphRenderContext,
    handle: FrameGraphTextureHandle | undefined,
): string {
    if (handle === undefined) {
        return "unresolved";
    }
    const texture = context.getTextureFromHandle(handle);
    if (!texture) {
        return "unresolved";
    }
    return `${Math.max(1, texture.width)}x${Math.max(1, texture.height)}`;
}

function getBlendModeUniformValue(mode: SsgiBlendMode): number {
    switch (mode) {
        case "softLight":
            return 1;
        case "overlay":
            return 2;
        default:
            return 0;
    }
}

export class FrameGraphPostEffectsSsgiGatherTask extends FrameGraphComputeShaderTask {
    sourceTexture?: FrameGraphTextureHandle;
    depthTexture?: FrameGraphTextureHandle;
    normalTexture?: FrameGraphTextureHandle;
    readonly outputTexture: FrameGraphTextureHandle;
    readonly outputWidth: number;
    readonly outputHeight: number;

    private readonly paramsBuffer: UniformBuffer;
    private readonly inverseProjection = Matrix.Identity();
    private resolutionReport: FrameGraphSsgiResolutionReport;

    constructor(
        name: string,
        frameGraph: FrameGraph,
        fullWidth: number,
        fullHeight: number,
        private readonly camera: Camera,
        private readonly getSettings: () => FrameGraphSsgiRuntimeSettings,
    ) {
        super(
            name,
            frameGraph,
            { computeSource: FRAME_GRAPH_SSGI_GATHER_COMPUTE_WGSL },
            {
                bindingsMapping: {
                    sceneColor: { group: 0, binding: 0 },
                    viewDepth: { group: 0, binding: 1 },
                    viewNormal: { group: 0, binding: 2 },
                    outputGi: { group: 0, binding: 3 },
                    params: { group: 0, binding: 4 },
                },
            },
        );

        const inputWidth = Math.max(1, Math.round(fullWidth));
        const inputHeight = Math.max(1, Math.round(fullHeight));
        this.outputWidth = Math.max(1, Math.ceil(inputWidth / 2));
        this.outputHeight = Math.max(1, Math.ceil(inputHeight / 2));
        this.outputTexture = frameGraph.textureManager.createRenderTargetTexture(
            `${name} half resolution`,
            {
                size: {
                    width: this.outputWidth,
                    height: this.outputHeight,
                },
                sizeIsPercentage: false,
                options: {
                    createMipMaps: false,
                    types: [Constants.TEXTURETYPE_HALF_FLOAT],
                    formats: [Constants.TEXTUREFORMAT_RGBA],
                    samples: 1,
                    useSRGBBuffers: [false],
                    creationFlags: [Constants.TEXTURE_CREATIONFLAG_STORAGE],
                    labels: ["ssgiIndirectRadiance"],
                },
            },
        );
        this.dispatchSize = new Vector3(
            Math.ceil(this.outputWidth / 8),
            Math.ceil(this.outputHeight / 8),
            1,
        );
        this.paramsBuffer = this.createUniformBuffer("params", {
            inverseProjection: 16,
            inputSize: 2,
            outputSize: 2,
            sampleRadius: 1,
            thickness: 1,
            padding: 2,
        });
        this.resolutionReport = {
            method: FRAME_GRAPH_SSGI_METHOD_NAME,
            output: `${this.outputWidth}x${this.outputHeight}`,
            inputs: {
                sceneColor: "unresolved",
                viewDepth: "unresolved",
                viewNormal: "unresolved",
            },
            resolved: false,
        };

        this.onTexturesAllocatedObservable.add((context) => {
            const source = this.sourceTexture === undefined
                ? null
                : context.getTextureFromHandle(this.sourceTexture);
            const depth = this.depthTexture === undefined
                ? null
                : context.getTextureFromHandle(this.depthTexture);
            const normal = this.normalTexture === undefined
                ? null
                : context.getTextureFromHandle(this.normalTexture);
            const output = context.getTextureFromHandle(this.outputTexture);
            if (source && depth && normal && output) {
                this.setInternalTexture("sceneColor", source);
                this.setInternalTexture("viewDepth", depth);
                this.setInternalTexture("viewNormal", normal);
                this.setInternalTexture("outputGi", output);
            }
            this.resolutionReport = {
                method: FRAME_GRAPH_SSGI_METHOD_NAME,
                output: describeAllocatedTexture(context, this.outputTexture),
                inputs: {
                    sceneColor: describeAllocatedTexture(context, this.sourceTexture),
                    viewDepth: describeAllocatedTexture(context, this.depthTexture),
                    viewNormal: describeAllocatedTexture(context, this.normalTexture),
                },
                resolved: source !== null && depth !== null && normal !== null && output !== null,
            };
        });

        this.execute = () => {
            const settings = this.getSettings();
            this.camera.getProjectionMatrix().invertToRef(this.inverseProjection);
            this.paramsBuffer.updateMatrix("inverseProjection", this.inverseProjection);
            this.paramsBuffer.updateFloat2("inputSize", inputWidth, inputHeight);
            this.paramsBuffer.updateFloat2("outputSize", this.outputWidth, this.outputHeight);
            this.paramsBuffer.updateFloat(
                "sampleRadius",
                Math.max(1, Math.min(256, settings.sampleRadius)),
            );
            this.paramsBuffer.updateFloat("thickness", 0.01);
            this.paramsBuffer.updateFloat2("padding", 0, 0);
        };
    }

    override getClassName(): string {
        return "FrameGraphPostEffectsSsgiGatherTask";
    }

    override record(skipCreationOfDisabledPasses = false): FrameGraphPass<FrameGraphContext> {
        if (
            this.sourceTexture === undefined
            || this.depthTexture === undefined
            || this.normalTexture === undefined
        ) {
            throw new Error(`${this.name}: scene color, view depth, and view normal are required.`);
        }
        this.dependencies = new Set([
            this.sourceTexture,
            this.depthTexture,
            this.normalTexture,
            this.outputTexture,
        ]);
        return super.record(skipCreationOfDisabledPasses);
    }

    getResolutionReport(): FrameGraphSsgiResolutionReport {
        return {
            ...this.resolutionReport,
            inputs: { ...this.resolutionReport.inputs },
        };
    }
}

export class FrameGraphPostEffectsSsgiDenoiseTask extends FrameGraphComputeShaderTask {
    sourceTexture?: FrameGraphTextureHandle;
    sceneColorTexture?: FrameGraphTextureHandle;
    depthTexture?: FrameGraphTextureHandle;
    normalTexture?: FrameGraphTextureHandle;
    readonly outputTexture: FrameGraphTextureHandle;

    private readonly paramsBuffer: UniformBuffer;
    private readonly fullWidth: number;
    private readonly fullHeight: number;
    private readonly halfWidth: number;
    private readonly halfHeight: number;
    private readonly stepWidth: number;

    constructor(
        name: string,
        frameGraph: FrameGraph,
        fullWidth: number,
        fullHeight: number,
        halfWidth: number,
        halfHeight: number,
        stepWidth: number,
    ) {
        super(
            name,
            frameGraph,
            { computeSource: FRAME_GRAPH_SSGI_DENOISE_COMPUTE_WGSL },
            {
                bindingsMapping: {
                    inputGi: { group: 0, binding: 0 },
                    sceneColor: { group: 0, binding: 1 },
                    viewDepth: { group: 0, binding: 2 },
                    viewNormal: { group: 0, binding: 3 },
                    outputGi: { group: 0, binding: 4 },
                    params: { group: 0, binding: 5 },
                },
            },
        );

        this.fullWidth = Math.max(1, Math.round(fullWidth));
        this.fullHeight = Math.max(1, Math.round(fullHeight));
        this.halfWidth = Math.max(1, Math.round(halfWidth));
        this.halfHeight = Math.max(1, Math.round(halfHeight));
        this.stepWidth = Math.max(1, Math.round(stepWidth));
        this.outputTexture = frameGraph.textureManager.createRenderTargetTexture(
            `${name} half resolution`,
            {
                size: {
                    width: this.halfWidth,
                    height: this.halfHeight,
                },
                sizeIsPercentage: false,
                options: {
                    createMipMaps: false,
                    types: [Constants.TEXTURETYPE_HALF_FLOAT],
                    formats: [Constants.TEXTUREFORMAT_RGBA],
                    samples: 1,
                    useSRGBBuffers: [false],
                    creationFlags: [Constants.TEXTURE_CREATIONFLAG_STORAGE],
                    labels: [`ssgiDenoisedRadianceStep${this.stepWidth}`],
                },
            },
        );
        this.dispatchSize = new Vector3(
            Math.ceil(this.halfWidth / 8),
            Math.ceil(this.halfHeight / 8),
            1,
        );
        this.paramsBuffer = this.createUniformBuffer("params", {
            fullSize: 2,
            halfSize: 2,
            stepWidth: 1,
            padding: 3,
        });

        this.onTexturesAllocatedObservable.add((context) => {
            const source = this.sourceTexture === undefined
                ? null
                : context.getTextureFromHandle(this.sourceTexture);
            const sceneColor = this.sceneColorTexture === undefined
                ? null
                : context.getTextureFromHandle(this.sceneColorTexture);
            const depth = this.depthTexture === undefined
                ? null
                : context.getTextureFromHandle(this.depthTexture);
            const normal = this.normalTexture === undefined
                ? null
                : context.getTextureFromHandle(this.normalTexture);
            const output = context.getTextureFromHandle(this.outputTexture);
            if (source && sceneColor && depth && normal && output) {
                this.setInternalTexture("inputGi", source);
                this.setInternalTexture("sceneColor", sceneColor);
                this.setInternalTexture("viewDepth", depth);
                this.setInternalTexture("viewNormal", normal);
                this.setInternalTexture("outputGi", output);
            }
        });

        this.execute = () => {
            this.paramsBuffer.updateFloat2(
                "fullSize",
                this.fullWidth,
                this.fullHeight,
            );
            this.paramsBuffer.updateFloat2(
                "halfSize",
                this.halfWidth,
                this.halfHeight,
            );
            this.paramsBuffer.updateFloat("stepWidth", this.stepWidth);
            this.paramsBuffer.updateFloat3("padding", 0, 0, 0);
        };
    }

    override getClassName(): string {
        return "FrameGraphPostEffectsSsgiDenoiseTask";
    }

    override record(skipCreationOfDisabledPasses = false): FrameGraphPass<FrameGraphContext> {
        if (
            this.sourceTexture === undefined
            || this.sceneColorTexture === undefined
            || this.depthTexture === undefined
            || this.normalTexture === undefined
        ) {
            throw new Error(
                `${this.name}: input GI, scene color, view depth, and view normal are required.`,
            );
        }
        this.dependencies = new Set([
            this.sourceTexture,
            this.sceneColorTexture,
            this.depthTexture,
            this.normalTexture,
            this.outputTexture,
        ]);
        return super.record(skipCreationOfDisabledPasses);
    }
}

export class FrameGraphPostEffectsSsgiCompositeTask extends FrameGraphPostProcessTask {
    ssgiTexture?: FrameGraphTextureHandle;
    depthTexture?: FrameGraphTextureHandle;
    normalTexture?: FrameGraphTextureHandle;

    constructor(
        name: string,
        frameGraph: FrameGraph,
        postProcess: EffectWrapper,
        private readonly getSettings: () => FrameGraphSsgiRuntimeSettings,
    ) {
        super(name, frameGraph, postProcess);
    }

    override getClassName(): string {
        return "FrameGraphPostEffectsSsgiCompositeTask";
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
                const effect = this.postProcess.effect;
                effect.setFloat(
                    "strength",
                    Math.max(0, Math.min(1, this.getSettings().strength)),
                );
                effect.setFloat(
                    "blendMode",
                    getBlendModeUniformValue(this.getSettings().blendMode),
                );
                if (this.ssgiTexture !== undefined) {
                    context.bindTextureHandle(effect, "ssgiTexture", this.ssgiTexture);
                }
                if (this.depthTexture !== undefined) {
                    context.bindTextureHandle(effect, "viewDepthTexture", this.depthTexture);
                }
                if (this.normalTexture !== undefined) {
                    context.bindTextureHandle(effect, "viewNormalTexture", this.normalTexture);
                }
                additionalBindings?.(context);
            },
        );
        if (this.ssgiTexture !== undefined) {
            pass.addDependencies(this.ssgiTexture);
        }
        if (this.depthTexture !== undefined) {
            pass.addDependencies(this.depthTexture);
        }
        if (this.normalTexture !== undefined) {
            pass.addDependencies(this.normalTexture);
        }
        return pass;
    }
}
