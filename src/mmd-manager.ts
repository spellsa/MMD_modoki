import { Engine } from "@babylonjs/core/Engines/engine";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { WebGPUTintWASM } from "@babylonjs/core/Engines/WebGPU/webgpuTintWASM";
import { Scene } from "@babylonjs/core/scene";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Space } from "@babylonjs/core/Maths/math.axis";
import { Matrix, Quaternion, Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { Material } from "@babylonjs/core/Materials/material";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { CascadedShadowGenerator } from "@babylonjs/core/Lights/Shadows/cascadedShadowGenerator";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Layer } from "@babylonjs/core/Layers/layer";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { MirrorTexture } from "@babylonjs/core/Materials/Textures/mirrorTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { RawCubeTexture } from "@babylonjs/core/Materials/Textures/rawCubeTexture";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";
import { ColorGradingTexture } from "@babylonjs/core/Materials/Textures/colorGradingTexture";
import { Effect } from "@babylonjs/core/Materials/effect";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { CreateScreenshotUsingRenderTargetAsync } from "@babylonjs/core/Misc/screenshotTools";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { FxaaPostProcess } from "@babylonjs/core/PostProcesses/fxaaPostProcess";
import { BloomEffect } from "@babylonjs/core/PostProcesses/bloomEffect";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { LensRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/lensRenderingPipeline";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline";
import { SSRRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssrRenderingPipeline";
import { IblShadowsRenderPipeline } from "@babylonjs/core/Rendering/IBLShadows/iblShadowsRenderPipeline";
import { VolumetricLightScatteringPostProcess } from "@babylonjs/core/PostProcesses/volumetricLightScatteringPostProcess";
import { DepthOfFieldEffectBlurLevel } from "@babylonjs/core/PostProcesses/depthOfFieldEffect";
import { GizmoManager } from "@babylonjs/core/Gizmos/gizmoManager";
import { DepthRenderer } from "@babylonjs/core/Rendering/depthRenderer";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import type { PerfCounter } from "@babylonjs/core/Misc/perfCounter";
import type { SmartArray } from "@babylonjs/core/Misc/smartArray";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import type {
    BoneControlInfo,
    MmdModokiProjectFileV1,
    ModelInfo,
    MotionInfo,
    ProjectMotionImport,
    ProjectNumberArray,
    ProjectPackedArray,
    ProjectModelMaterialShaderState,
    KeyframeTrack,
} from "./types";
import type { IMmdBindableCameraAnimation } from "babylon-mmd/esm/Runtime/Animation/IMmdBindableAnimation";
import type { IMmdRuntimeBone } from "babylon-mmd/esm/Runtime/IMmdRuntimeBone";
import { exportProjectState as exportProjectStateImpl } from "./project/project-serializer";
import { importProjectState as importProjectStateImpl } from "./project/project-importer";
import {
    loadCameraVMD as loadCameraVMDImpl,
    loadMP3 as loadMP3Impl,
    loadVMD as loadVMDImpl,
    loadVPD as loadVPDImpl,
} from "./assets/motion-asset-service";
import { isDebugLogEnabled, logDebugIfEnabled, logInfo, logWarn, toLogErrorData } from "./app-logger";
import { loadPMX as loadPMXImpl } from "./assets/model-asset-service";
import {
    applyImportedMaterialShaderStates as applyImportedMaterialShaderStatesImpl,
    getExternalWgslToonShaderPath as getExternalWgslToonShaderPathImpl,
    getExternalWgslToonShaderPathForMaterial as getExternalWgslToonShaderPathForMaterialImpl,
    getSerializedMaterialShaderStates as getSerializedMaterialShaderStatesImpl,
    getWgslMaterialShaderPresetForMaterial as getWgslMaterialShaderPresetForMaterialImpl,
    getWgslMaterialShaderPresets as getWgslMaterialShaderPresetsImpl,
    getWgslModelShaderStates as getWgslModelShaderStatesImpl,
    getFrameGraphLuminousMaskMaterialState as getFrameGraphLuminousMaskMaterialStateImpl,
    hasExternalWgslToonShader as hasExternalWgslToonShaderImpl,
    isWgslMaterialShaderAssignmentAvailable as isWgslMaterialShaderAssignmentAvailableImpl,
    ensureMaterialShaderDefaults as ensureMaterialShaderDefaultsImpl,
    setExternalWgslToonShader as setExternalWgslToonShaderImpl,
    setExternalWgslToonShaderForModel as setExternalWgslToonShaderForModelImpl,
    setWgslMaterialShaderPreset as setWgslMaterialShaderPresetImpl,
    syncLuminousGlowLayer as syncLuminousGlowLayerImpl,
} from "./scene/material-shader-service";
import {
    getAntialiasEnabled as getAntialiasEnabledImpl,
    getDofAutoFocusEnabled as getDofAutoFocusEnabledImpl,
    getDofAutoFocusNearOffsetMm as getDofAutoFocusNearOffsetMmImpl,
    getDofAutoFocusRangeMeters as getDofAutoFocusRangeMetersImpl,
    getDofBlurLevel as getDofBlurLevelImpl,
    getDofEffectiveFStop as getDofEffectiveFStopImpl,
    getDofEnabled as getDofEnabledImpl,
    getDofFocalLength as getDofFocalLengthImpl,
    getDofFocalLengthDistanceInverted as getDofFocalLengthDistanceInvertedImpl,
    getDofFocalLengthLinkedToCameraDistance as getDofFocalLengthLinkedToCameraDistanceImpl,
    getDofFocalLengthLinkedToCameraFov as getDofFocalLengthLinkedToCameraFovImpl,
    getDofFStop as getDofFStopImpl,
    getDofFocusDistanceMm as getDofFocusDistanceMmImpl,
    getDofLensBlurEnabled as getDofLensBlurEnabledImpl,
    getDofLensBlurStrength as getDofLensBlurStrengthImpl,
    getDofLensDistortion as getDofLensDistortionImpl,
    getDofLensDistortionInfluence as getDofLensDistortionInfluenceImpl,
    getDofLensDistortionLinkedToCameraFov as getDofLensDistortionLinkedToCameraFovImpl,
    getDofLensEdgeBlur as getDofLensEdgeBlurImpl,
    getDofLensSize as getDofLensSizeImpl,
    getDofNearSuppressionScale as getDofNearSuppressionScaleImpl,
    getPostEffectFarDofStrength as getPostEffectFarDofStrengthImpl,
    getPostEffectFogColor as getPostEffectFogColorImpl,
    getPostEffectFogDensity as getPostEffectFogDensityImpl,
    getPostEffectFogEnabled as getPostEffectFogEnabledImpl,
    getPostEffectFogEnd as getPostEffectFogEndImpl,
    getPostEffectFogMode as getPostEffectFogModeImpl,
    getPostEffectFogOpacity as getPostEffectFogOpacityImpl,
    getPostEffectFogStart as getPostEffectFogStartImpl,
    getPostEffectLutPresetOptions as getPostEffectLutPresetOptionsImpl,
    getPostEffectMotionBlurEnabled as getPostEffectMotionBlurEnabledImpl,
    getPostEffectMotionBlurSamples as getPostEffectMotionBlurSamplesImpl,
    getPostEffectMotionBlurStrength as getPostEffectMotionBlurStrengthImpl,
    getPostEffectSsrEnabled as getPostEffectSsrEnabledImpl,
    getPostEffectSsrStep as getPostEffectSsrStepImpl,
    getPostEffectSsrStrength as getPostEffectSsrStrengthImpl,
    getPostEffectVlsDecay as getPostEffectVlsDecayImpl,
    getPostEffectVlsDensity as getPostEffectVlsDensityImpl,
    getPostEffectVlsEnabled as getPostEffectVlsEnabledImpl,
    getPostEffectVlsExposure as getPostEffectVlsExposureImpl,
    getPostEffectVlsWeight as getPostEffectVlsWeightImpl,
    setAntialiasEnabled as setAntialiasEnabledImpl,
    setDofAutoFocusNearOffsetMm as setDofAutoFocusNearOffsetMmImpl,
    setDofBlurLevel as setDofBlurLevelImpl,
    setDofEnabled as setDofEnabledImpl,
    setDofFocalLength as setDofFocalLengthImpl,
    setDofFocalLengthDistanceInverted as setDofFocalLengthDistanceInvertedImpl,
    setDofFStop as setDofFStopImpl,
    setDofFocusDistanceMm as setDofFocusDistanceMmImpl,
    setDofLensBlurEnabled as setDofLensBlurEnabledImpl,
    setDofLensBlurStrength as setDofLensBlurStrengthImpl,
    setDofLensDistortion as setDofLensDistortionImpl,
    setDofLensDistortionInfluence as setDofLensDistortionInfluenceImpl,
    setDofLensEdgeBlur as setDofLensEdgeBlurImpl,
    setDofLensSize as setDofLensSizeImpl,
    setDofNearSuppressionScale as setDofNearSuppressionScaleImpl,
    setPostEffectExternalLut as setPostEffectExternalLutImpl,
    setPostEffectFarDofStrength as setPostEffectFarDofStrengthImpl,
    setPostEffectFogColor as setPostEffectFogColorImpl,
    setPostEffectFogDensity as setPostEffectFogDensityImpl,
    setPostEffectFogEnabled as setPostEffectFogEnabledImpl,
    setPostEffectFogEnd as setPostEffectFogEndImpl,
    setPostEffectFogMode as setPostEffectFogModeImpl,
    setPostEffectFogOpacity as setPostEffectFogOpacityImpl,
    setPostEffectFogStart as setPostEffectFogStartImpl,
    setPostEffectMotionBlurEnabled as setPostEffectMotionBlurEnabledImpl,
    setPostEffectMotionBlurSamples as setPostEffectMotionBlurSamplesImpl,
    setPostEffectMotionBlurStrength as setPostEffectMotionBlurStrengthImpl,
    setPostEffectSsrEnabled as setPostEffectSsrEnabledImpl,
    setPostEffectSsrStep as setPostEffectSsrStepImpl,
    setPostEffectSsrStrength as setPostEffectSsrStrengthImpl,
    setPostEffectVlsDecay as setPostEffectVlsDecayImpl,
    setPostEffectVlsDensity as setPostEffectVlsDensityImpl,
    setPostEffectVlsEnabled as setPostEffectVlsEnabledImpl,
    setPostEffectVlsExposure as setPostEffectVlsExposureImpl,
    setPostEffectVlsWeight as setPostEffectVlsWeightImpl,
} from "./render/effects-pipeline-controller";
import {
    applyAntialiasSettings as applyAntialiasSettingsImpl,
    applyDefaultPipelinePostProcessSettings as applyDefaultPipelinePostProcessSettingsImpl,
    applyDofLensBlurSettings as applyDofLensBlurSettingsImpl,
    applyDofLensOpticsSettings as applyDofLensOpticsSettingsImpl,
    applyEditorDofSettings as applyEditorDofSettingsImpl,
    applyFogSettings as applyFogSettingsImpl,
    applyImageProcessingSettings as applyImageProcessingSettingsImpl,
    applyMotionBlurSettings as applyMotionBlurSettingsImpl,
    applyLutSettings as applyLutSettingsImpl,
    applySsrSettings as applySsrSettingsImpl,
    applyVolumetricLightSettings as applyVolumetricLightSettingsImpl,
    computeAdjustedAutoMinFStop as computeAdjustedAutoMinFStopImpl,
    computeAutoFocusMinFStop as computeAutoFocusMinFStopImpl,
    configureDofDepthRenderer as configureDofDepthRendererImpl,
    enforceFinalPostProcessOrder as enforceFinalPostProcessOrderImpl,
    getOrCreateExternalLutBlobUrl as getOrCreateExternalLutBlobUrlImpl,
    getOrCreateLutPresetBlobUrl as getOrCreateLutPresetBlobUrlImpl,
    isImageProcessingEffectsEnabled as isImageProcessingEffectsEnabledImpl,
    isLutSourceReady as isLutSourceReadyImpl,
    setupFarDofPostProcess as setupFarDofPostProcessImpl,
    setupFinalLensDistortionPostProcess as setupFinalLensDistortionPostProcessImpl,
    setupLensHighlightsPipeline as setupLensHighlightsPipelineImpl,
    setupOriginFogPostProcess as setupOriginFogPostProcessImpl,
    updateDofFocalLengthFromCameraFov as updateDofFocalLengthFromCameraFovImpl,
    updateDofLensDistortionFromCameraFov as updateDofLensDistortionFromCameraFovImpl,
    updateEditorDofFocusAndFStop as updateEditorDofFocusAndFStopImpl,
    updateSimpleMotionBlurState as updateSimpleMotionBlurStateImpl,
} from "./render/post-process-controller";
import {
    applySsaoSettings as applySsaoSettingsImpl,
    configureSsaoDepthRenderer as configureSsaoDepthRendererImpl,
    disposeSsaoDepthRenderer as disposeSsaoDepthRendererImpl,
    ensureSsaoFallbackPostProcess as ensureSsaoFallbackPostProcessImpl,
    getSsaoPostProcessScale as getSsaoPostProcessScaleImpl,
    shouldUseToonTintedSsaoComposite as shouldUseToonTintedSsaoCompositeImpl,
    syncShaderContactAoState as syncShaderContactAoStateImpl,
} from "./render/ssao-controller";
import { ensureSimpleSsaoShader as ensureSimpleSsaoShaderImpl } from "./render/ssao-shader";
import {
    POST_EFFECT_BACKEND_STORAGE_KEY,
    readPostEffectBackendLocalStorage,
    type PostEffectBackend,
} from "./render/post-effect-backend";
import { FrameGraphPostEffectsController } from "./render/frame-graph-post-effects-controller";
import {
    FRAME_GRAPH_POST_EFFECT_IDS,
    normalizeFrameGraphPostEffectIds,
    type FrameGraphPostEffectId,
    type FrameGraphPostEffectStackEntry,
} from "./shared/frame-graph-post-effect-stack";
import {
    applyLightColorTemperature as applyLightColorTemperatureImpl,
    applyShadowEdgeSoftness as applyShadowEdgeSoftnessImpl,
    applyShadowFrustumSize as applyShadowFrustumSizeImpl,
    applyToonShadowInfluenceToAllModels as applyToonShadowInfluenceToAllModelsImpl,
    applyToonShadowInfluenceToMeshes as applyToonShadowInfluenceToMeshesImpl,
    getLightColor as getLightColorImpl,
    getLightDirection as getLightDirectionImpl,
    getSerializedLightDirection as getSerializedLightDirectionImpl,
    getShadowColor as getShadowColorImpl,
    getShadowEnabled as getShadowEnabledImpl,
    getShadowBias as getShadowBiasImpl,
    getShadowMaxZ as getShadowMaxZImpl,
    getShadowNormalBias as getShadowNormalBiasImpl,
    setLightColor as setLightColorImpl,
    setLightDirection as setLightDirectionImpl,
    setShadowColor as setShadowColorImpl,
    setShadowEnabled as setShadowEnabledImpl,
    setShadowBias as setShadowBiasImpl,
    setShadowMaxZ as setShadowMaxZImpl,
    setShadowNormalBias as setShadowNormalBiasImpl,
} from "./scene/light-shadow-controller";
import { GlobalIlluminationController } from "./render/global-illumination-controller";
import {
    addTimelineKeyframe as addTimelineKeyframeImpl,
    buildModelTrackFrameMapFromAnimation as buildModelTrackFrameMapFromAnimationImpl,
    addInfoKeyframe as addInfoKeyframeImpl,
    emitMergedKeyframeTracks as emitMergedKeyframeTracksImpl,
    createOffsetModelAnimation as createOffsetModelAnimationImpl,
    ensureCameraAnimationForEditing as ensureCameraAnimationForEditingImpl,
    ensureModelAnimationForEditing as ensureModelAnimationForEditingImpl,
    getActiveModelTimelineTracks as getActiveModelTimelineTracksImpl,
    getCameraTimelineTracks as getCameraTimelineTracksImpl,
    getOrCreateModelTrackFrameMap as getOrCreateModelTrackFrameMapImpl,
    getRegisteredKeyframeStats as getRegisteredKeyframeStatsImpl,
    hasInfoKeyframe as hasInfoKeyframeImpl,
    hasTimelineKeyframe as hasTimelineKeyframeImpl,
    moveTimelineKeyframe as moveTimelineKeyframeImpl,
    mergeModelAnimations as mergeModelAnimationsImpl,
    refreshTotalFramesFromContent as refreshTotalFramesFromContentImpl,
    removeTimelineKeyframe as removeTimelineKeyframeImpl,
} from "./editor/timeline-edit-service";
import {
    disposeBoneGizmoSystem as disposeBoneGizmoSystemImpl,
    handleBoneGizmoBeforeRender as handleBoneGizmoBeforeRenderImpl,
    initializeBoneGizmoSystem as initializeBoneGizmoSystemImpl,
    resetBoneGizmoInteraction as resetBoneGizmoInteractionImpl,
    updateBoneGizmoTarget as updateBoneGizmoTargetImpl,
} from "./editor/bone-gizmo-controller";
import {
    clearBoneOverlay as clearBoneOverlayImpl,
    disposeBoneVisualizer as disposeBoneVisualizerImpl,
    ensureBoneOverlayCanvas as ensureBoneOverlayCanvasImpl,
    getBoneWorldPositionToRef as getBoneWorldPositionToRefImpl,
    refreshBoneVisualizerTarget as refreshBoneVisualizerTargetImpl,
    syncBoneVisualizerVisibility as syncBoneVisualizerVisibilityImpl,
    resizeBoneOverlayCanvas as resizeBoneOverlayCanvasImpl,
    tryPickBoneVisualizerAtClientPosition as tryPickBoneVisualizerAtClientPositionImpl,
    updateBoneVisualizer as updateBoneVisualizerImpl,
} from "./editor/bone-visualizer-controller";
import {
    disposeRigidBodyVisualizer as disposeRigidBodyVisualizerImpl,
    refreshRigidBodyVisualizerTarget as refreshRigidBodyVisualizerTargetImpl,
    syncRigidBodyVisualizerVisibility as syncRigidBodyVisualizerVisibilityImpl,
    updateRigidBodyVisualizer as updateRigidBodyVisualizerImpl,
} from "./editor/rigid-body-visualizer-controller";
import {
    PhysicsRuntimeController,
    type PhysicsBackendLabel,
    type PhysicsSimulationRateHz,
} from "./physics/physics-runtime-controller";
import {
    PhysicsModelController,
    type PhysicsRuntimeModel,
} from "./physics/physics-model-controller";

type EditorRuntimeBone = IMmdRuntimeBone & {
    getAnimationPositionOffsetToRef?: (target: Vector3) => Vector3;
    getAnimatedRotationToRef?: (target: Quaternion) => Quaternion;
    getWorldMatrixToRef(target: Matrix): Matrix;
};

type RuntimeMode = "classic" | "wasm";
type RuntimeModel = PhysicsRuntimeModel;
type RuntimeMmdRuntime = MmdRuntime | MmdWasmRuntime;
type FramePerformanceSection =
    | "frameTotal"
    | "manualPlayback"
    | "motionBlur"
    | "backgroundVideo"
    | "sceneRender"
    | "cameraMotionToViewport"
    | "viewportCameraInput"
    | "boneGizmo"
    | "boneVisualizer"
    | "rigidBodyVisualizer"
    | "editorDof"
    | "frameStateUpdate";
type FramePerformanceStats = {
    samples: number;
    totalMs: number;
    maxMs: number;
};

const FRAME_PERFORMANCE_SECTIONS: readonly FramePerformanceSection[] = [
    "frameTotal",
    "manualPlayback",
    "motionBlur",
    "backgroundVideo",
    "sceneRender",
    "cameraMotionToViewport",
    "viewportCameraInput",
    "boneGizmo",
    "boneVisualizer",
    "rigidBodyVisualizer",
    "editorDof",
    "frameStateUpdate",
];

let bundledMprWasmInstancePromise: Promise<IMmdWasmInstance> | null = null;
let bundledSprWasmInstancePromise: Promise<IMmdWasmInstance> | null = null;
const DEFAULT_CSM_FRUSTUM_SIZE = 960;
const DOF_FOCUS_BONE_CANDIDATES = [
    "頭",
    "head",
    "Head",
    "首",
    "neck",
    "Neck",
    "上半身2",
    "upperbody2",
    "upper body2",
    "upperbody",
    "上半身",
    "センター",
    "center",
    "Center",
] as const;

function localPathToFileUrl(pathText: string): string {
    const normalized = pathText.replace(/\\/g, "/");
    const rawUrl = /^[A-Za-z]:\//.test(normalized)
        ? `file:///${normalized}`
        : `file://${normalized}`;
    return encodeURI(rawUrl);
}

const EMPTY_KEYFRAME_FRAMES = new Uint32Array(0);
const PMX_MATERIAL_FLAG_ENABLED_DRAW_SHADOW = 0x0004;
const PMX_MATERIAL_FLAG_ENABLED_RECEIVE_SHADOW = 0x0008;


function mergeFrameNumbers(a: Uint32Array, b: Uint32Array): Uint32Array {
    if (a.length === 0) return b;
    if (b.length === 0) return a;

    const merged = new Uint32Array(a.length + b.length);
    let i = 0;
    let j = 0;
    let k = 0;
    let last = -1;

    while (i < a.length || j < b.length) {
        const pickA = j >= b.length || (i < a.length && a[i] <= b[j]);
        const value = pickA ? a[i++] : b[j++];
        if (value === last) continue;
        merged[k++] = value;
        last = value;
    }

    return merged.subarray(0, k);
}

async function loadBundledSprWasmInstance(): Promise<IMmdWasmInstance> {
    if (bundledSprWasmInstancePromise) return bundledSprWasmInstancePromise;

    bundledSprWasmInstancePromise = (async () => {
        const initOutput = await sprWasmBindgen.default({ module_or_path: sprWasmBinaryUrl });
        sprWasmBindgen.init();

        const memory = initOutput.memory;
        const mmdWasmInstance = { ...sprWasmBindgen } as unknown as IMmdWasmInstance;
        mmdWasmInstance.memory = memory;
        mmdWasmInstance.createTypedArray = <T extends ArrayBufferView>(
            typedArrayConstructor: new (buffer: ArrayBufferLike, byteOffset: number, length: number) => T,
            byteOffset: number,
            length: number,
        ) => {
            if (memory.buffer instanceof ArrayBuffer) {
                return new WasmTypedArray(typedArrayConstructor, memory, byteOffset, length);
            }
            return new WasmSharedTypedArray(typedArrayConstructor, memory, byteOffset, length);
        };

        await mmdWasmInstance.initThreadPool?.(navigator.hardwareConcurrency);
        return mmdWasmInstance;
    })();

    return bundledSprWasmInstancePromise;
}

async function loadBundledMprWasmInstance(): Promise<IMmdWasmInstance> {
    if (bundledMprWasmInstancePromise) return bundledMprWasmInstancePromise;

    bundledMprWasmInstancePromise = (async () => {
        const importModule = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<typeof import("babylon-mmd/esm/Runtime/Optimized/wasm/mpr")>;
        const mprWasmBindgen = await importModule("/node_modules/babylon-mmd/esm/Runtime/Optimized/wasm/mpr/index.js");
        const initOutput = await mprWasmBindgen.default({ module_or_path: mprWasmBinaryUrl });
        mprWasmBindgen.init();

        const memory = initOutput.memory;
        const mmdWasmInstance = { ...mprWasmBindgen } as unknown as IMmdWasmInstance;
        mmdWasmInstance.memory = memory;
        mmdWasmInstance.createTypedArray = <T extends ArrayBufferView>(
            typedArrayConstructor: new (buffer: ArrayBufferLike, byteOffset: number, length: number) => T,
            byteOffset: number,
            length: number,
        ) => {
            if (memory.buffer instanceof ArrayBuffer) {
                return new WasmTypedArray(typedArrayConstructor, memory, byteOffset, length);
            }
            return new WasmSharedTypedArray(typedArrayConstructor, memory, byteOffset, length);
        };

        await mmdWasmInstance.initThreadPool?.(navigator.hardwareConcurrency);
        return mmdWasmInstance;
    })();

    return bundledMprWasmInstancePromise;
}

// Side effects - register loaders
import "babylon-mmd/esm/Loader/pmxLoader";
import "babylon-mmd/esm/Loader/pmdLoader";
import "babylon-mmd/esm/Loader/mmdOutlineRenderer";
import "babylon-mmd/esm/Runtime/Animation/mmdRuntimeModelAnimation";
import "babylon-mmd/esm/Runtime/Animation/mmdRuntimeCameraAnimation";
import "babylon-mmd/esm/Runtime/Optimized/Animation/mmdWasmRuntimeModelAnimation";
import "@babylonjs/core/Materials/Textures/Loaders/tgaTextureLoader";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import "@babylonjs/core/Rendering/depthRendererSceneComponent";
import "@babylonjs/core/Rendering/prePassRendererSceneComponent";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.dynamicTexture";
import "@babylonjs/core/Engines/Extensions/engine.rawTexture";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.rawTexture";
import "@babylonjs/core/ShadersWGSL/default.vertex";
import "@babylonjs/core/ShadersWGSL/default.fragment";
import "@babylonjs/core/ShadersWGSL/postprocess.vertex";
import "@babylonjs/core/ShadersWGSL/imageProcessing.fragment";
import "@babylonjs/core/ShadersWGSL/rgbdDecode.fragment";
import "@babylonjs/core/ShadersWGSL/bloomMerge.fragment";
import "@babylonjs/core/ShadersWGSL/chromaticAberration.fragment";
import "@babylonjs/core/ShadersWGSL/copyTextureToTexture.fragment";
import "@babylonjs/core/ShadersWGSL/depth.vertex";
import "@babylonjs/core/ShadersWGSL/depth.fragment";
import "@babylonjs/core/ShadersWGSL/extractHighlights.fragment";
import "@babylonjs/core/ShadersWGSL/fxaa.vertex";
import "@babylonjs/core/ShadersWGSL/fxaa.fragment";
import "@babylonjs/core/ShadersWGSL/grain.fragment";
import "@babylonjs/core/ShadersWGSL/circleOfConfusion.fragment";
import "@babylonjs/core/ShadersWGSL/depthOfFieldMerge.fragment";
import "@babylonjs/core/ShadersWGSL/kernelBlur.vertex";
import "@babylonjs/core/ShadersWGSL/kernelBlur.fragment";
import "@babylonjs/core/ShadersWGSL/motionBlur.fragment";
import "@babylonjs/core/ShadersWGSL/oitBackBlend.fragment";
import "@babylonjs/core/ShadersWGSL/oitFinalSimpleBlend.fragment";
import "@babylonjs/core/ShadersWGSL/sharpen.fragment";
import "@babylonjs/core/ShadersWGSL/shadowMap.vertex";
import "@babylonjs/core/ShadersWGSL/shadowMap.fragment";
import "@babylonjs/core/ShadersWGSL/screenSpaceReflection2.fragment";
import "@babylonjs/core/ShadersWGSL/screenSpaceReflection2Blur.fragment";
import "@babylonjs/core/ShadersWGSL/screenSpaceReflection2BlurCombiner.fragment";
import "@babylonjs/core/ShadersWGSL/ssao2.fragment";
import "@babylonjs/core/ShadersWGSL/ssaoCombine.fragment";
import "@babylonjs/core/ShadersWGSL/volumetricLightingRenderVolume.vertex";
import "@babylonjs/core/ShadersWGSL/volumetricLightingRenderVolume.fragment";
import "@babylonjs/core/ShadersWGSL/volumetricLightingBlendVolume.fragment";
import "babylon-mmd/esm/Loader/ShadersWGSL/textureAlphaChecker.vertex";
import "babylon-mmd/esm/Loader/ShadersWGSL/textureAlphaChecker.fragment";

import { MmdRuntime } from "babylon-mmd/esm/Runtime/mmdRuntime";
import { MmdWasmRuntime } from "babylon-mmd/esm/Runtime/Optimized/mmdWasmRuntime";
import { MmdWasmAnimation } from "babylon-mmd/esm/Runtime/Optimized/Animation/mmdWasmAnimation";
import { MmdCamera } from "babylon-mmd/esm/Runtime/mmdCamera";
import { VmdLoader } from "babylon-mmd/esm/Loader/vmdLoader";
import { VpdLoader } from "babylon-mmd/esm/Loader/vpdLoader";
import { MmdAnimation } from "babylon-mmd/esm/Loader/Animation/mmdAnimation";
import { MmdBoneAnimationTrack, MmdMorphAnimationTrack, MmdMovableBoneAnimationTrack, MmdPropertyAnimationTrack } from "babylon-mmd/esm/Loader/Animation/mmdAnimationTrack";
import { MmdStandardMaterialBuilder } from "babylon-mmd/esm/Loader/mmdStandardMaterialBuilder";
import { MmdMaterialRenderMethod } from "babylon-mmd/esm/Loader/materialBuilderBase";
import { MmdPluginMaterial as MmdStandardShaderPluginGLSL } from "babylon-mmd/esm/Loader/Shaders/mmdStandard";
import { MmdPluginMaterial as MmdStandardShaderPluginWGSL } from "babylon-mmd/esm/Loader/ShadersWGSL/mmdStandard";
import { MmdModelLoader } from "babylon-mmd/esm/Loader/mmdModelLoader";
import { PathNormalize } from "babylon-mmd/esm/Loader/Util/pathNormalize";
import { SdefInjector } from "babylon-mmd/esm/Loader/sdefInjector";
import { StreamAudioPlayer } from "babylon-mmd/esm/Runtime/Audio/streamAudioPlayer";
import { MmdWasmPhysics } from "babylon-mmd/esm/Runtime/Optimized/Physics/mmdWasmPhysics";
import * as sprWasmBindgen from "babylon-mmd/esm/Runtime/Optimized/wasm/spr";
import type { IMmdWasmInstance } from "babylon-mmd/esm/Runtime/Optimized/mmdWasmInstance";
import { WasmTypedArray } from "babylon-mmd/esm/Runtime/Optimized/Misc/wasmTypedArray";
import { WasmSharedTypedArray } from "babylon-mmd/esm/Runtime/Optimized/Misc/wasmSharedTypedArray";
// eslint-disable-next-line import/no-unresolved
import mprWasmBinaryUrl from "babylon-mmd/esm/Runtime/Optimized/wasm/mpr/index_bg.wasm?url";
// eslint-disable-next-line import/no-unresolved
import sprWasmBinaryUrl from "babylon-mmd/esm/Runtime/Optimized/wasm/spr/index_bg.wasm?url";
// eslint-disable-next-line import/no-unresolved
import glslangJsUrl from "@babylonjs/core/assets/glslang/glslang.js?url";
// eslint-disable-next-line import/no-unresolved
import glslangWasmUrl from "@babylonjs/core/assets/glslang/glslang.wasm?url";
// eslint-disable-next-line import/no-unresolved
import twgslJsUrl from "@babylonjs/core/assets/twgsl/twgsl.js?url";
// eslint-disable-next-line import/no-unresolved
import twgslWasmUrl from "@babylonjs/core/assets/twgsl/twgsl.wasm?url";
// eslint-disable-next-line import/no-unresolved
import iblShadowTestEnvironmentUrl from "./assets/ibl-shadows/white.hdr?url";
// eslint-disable-next-line import/no-unresolved
import blobShadowTextureUrl from "./assets/blob-shadows/BlobShadow.png?url";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton";
// eslint-disable-next-line import/no-unresolved
import animeSoftLutText from "../lut/anime-soft.3dl?raw";
// eslint-disable-next-line import/no-unresolved
import animeCoolLutText from "../lut/anime-cool.3dl?raw";
// eslint-disable-next-line import/no-unresolved
import animeDramaticLutText from "../lut/anime-dramatic.3dl?raw";
// eslint-disable-next-line import/no-unresolved
import monotoneLutText from "../lut/monotone.3dl?raw";
// eslint-disable-next-line import/no-unresolved
import sepiaLutText from "../lut/sepia.3dl?raw";
// eslint-disable-next-line import/no-unresolved
import tealOrangeLutText from "../lut/teal-orange.3dl?raw";
import type { MmdMesh } from "babylon-mmd/esm/Runtime/mmdMesh";
import type { MmdRuntimeAnimationHandle } from "babylon-mmd/esm/Runtime/mmdRuntimeAnimationHandle";

// IBL Shadows is intentionally frozen: Babylon.js 9.2 WebGPU validation issues
// and dynamic/skinned mesh costs made it unsuitable for MMD contact shadows.
const IBL_SHADOWS_EXPERIMENT_ENABLED = false;

export type WgslMaterialShaderPresetId =
    | "wgsl-mmd-standard"
    | "wgsl-unlit"
    | "wgsl-soft-lit"
    | "wgsl-autoluminous"
    | "wgsl-debug-white"
    | "wgsl-full-light"
    | "wgsl-full-light-add"
    | "wgsl-full-alpha-test"
    | "wgsl-full-alpha-test-hard"
    | "wgsl-alpha-mask"
    | "wgsl-white-key-cutout"
    | "wgsl-black-key-cutout"
    | "wgsl-full-shadow"
    | "wgsl-light-and-shadow"
    | "wgsl-gloss-highlight"
    | "wgsl-semi-matte-highlight"
    | "wgsl-matte-highlight"
    | "wgsl-specular"
    | "wgsl-ssr-reflective"
    | "wgsl-cel-sharp"
    | "wgsl-cel-shadow-sharp"
    | "wgsl-accessory-toon"
    | "wgsl-rim-lift"
    | "wgsl-mono-flat";

export interface WgslMaterialShaderPresetInfo {
    id: WgslMaterialShaderPresetId;
    label: string;
    description: string;
}

export interface WgslMaterialShaderInfo {
    key: string;
    name: string;
    presetId: WgslMaterialShaderPresetId;
    externalWgslPath: string | null;
    visible: boolean;
}

export interface WgslModelShaderInfo {
    modelIndex: number;
    modelName: string;
    modelPath: string;
    active: boolean;
    materials: WgslMaterialShaderInfo[];
}

type SceneModelMaterialEntry = {
    key: string;
    name: string;
    material: MmdManagerMaterialLike;
};

type MmdManagerMaterialLike = object & {
    name?: unknown;
    alpha?: unknown;
    diffuseTexture?: { hasAlpha?: unknown } | null;
    albedoTexture?: { hasAlpha?: unknown } | null;
    opacityTexture?: unknown;
    useAlphaFromDiffuseTexture?: unknown;
    useAlphaFromAlbedoTexture?: unknown;
    transparencyMode?: unknown;
    zOffset?: number;
    zOffsetUnits?: number;
    useLogarithmicDepth?: boolean;
    subMaterials?: Array<MmdManagerMaterialLike | null | undefined>;
    renderOutline?: boolean;
    outlineWidth?: number;
    outlineAlpha?: number;
    outlineColor?: { r?: unknown; g?: unknown; b?: unknown; set?: (r: number, g: number, b: number) => void };
    toonTexture?: Texture | null;
    ignoreDiffuseWhenToonTextureIsNull?: boolean;
    markAsDirty?: (flag?: number) => void;
    _markAllSubMeshesAsTexturesDirty?: () => void;
} & Record<string, unknown>;

type SceneModelRigidBodyEntry = {
    name: string;
    boneIndex: number;
    shapeType: number;
    shapeSize: [number, number, number];
    physicsMode: number;
};

type SceneModelEntry = {
    mesh: MmdMesh;
    model: RuntimeModel;
    info: ModelInfo;
    materials: SceneModelMaterialEntry[];
    rigidBodies: SceneModelRigidBodyEntry[];
    shadowCasterMeshes: Mesh[];
    contactShadowMesh: Mesh | null;
    castShadow: boolean;
};

type ContactShadowBlobKind = "body" | "leftFoot" | "rightFoot";
type ContactShadowBlobMeshes = Partial<Record<ContactShadowBlobKind, Mesh>>;
type ContactShadowTarget = {
    kind: ContactShadowBlobKind;
    position: Vector3;
    width: number;
    depth: number;
    opacityScale: number;
};

type MaterialShaderDefaults = {
    disableLighting: boolean | null;
    specularPower: number | null;
    specularColor: Color3 | null;
    emissiveColor: Color3 | null;
};

type PostEffectLutSourceMode = "builtin" | "external-absolute" | "project-relative";

interface PreferredEngineResult {
    engine: Engine | WebGPUEngine;
    startupDiagnostics: string[];
}

export class MmdManager {
    private static readonly RENDER_ENGINE_OPTIONS = {
        preserveDrawingBuffer: false,
        stencil: true,
        antialias: true,
        alpha: false,
        premultipliedAlpha: false,
        desynchronized: false,
        adaptToDeviceRatio: false,
    };
    private static readonly RENDER_HARDWARE_SCALING_LEVEL = 0.75;
    private static readonly WEBGPU_COMPATIBILITY_MODE = true;
    private static readonly WEBGPU_SDEF_CPU_FALLBACK_STORAGE_KEY = "mmd_modoki.webGpuSdefCpuFallback";
    private static readonly RUNTIME_MODE_STORAGE_KEY = "mmd_modoki.runtimeMode";
    private static readonly FRAME_PERFORMANCE_LOG_STORAGE_KEY = "mmd_modoki.framePerfLog";
    private static readonly DEFAULT_WGSL_MATERIAL_SHADER_PRESET: WgslMaterialShaderPresetId = "wgsl-mmd-standard";
    private static readonly WGSL_MATERIAL_SHADER_PRESETS: readonly WgslMaterialShaderPresetInfo[] = [
        {
            id: "wgsl-mmd-standard",
            label: "MMD Standard",
            description: "Default MMD shading",
        },
        {
            id: "wgsl-unlit",
            label: "Unlit Flat",
            description: "Disable lighting for flat anime-like output",
        },
        {
            id: "wgsl-soft-lit",
            label: "Soft Lit",
            description: "Softer highlights with gentle emissive lift",
        },
        {
            id: "wgsl-full-alpha-test",
            label: "AlphaCutOff",
            description: "Convert semi-transparent layers into softer alpha-cutoff rendering with more preserved edge coverage",
        },
        {
            id: "wgsl-full-alpha-test-hard",
            label: "AlphaCutOff Hard",
            description: "Stronger alpha-cutoff rendering for textures that need a firmer transparency mask",
        },
        {
            id: "wgsl-alpha-mask",
            label: "Alpha Mask",
            description: "Use the source texture alpha directly for transparency",
        },
        {
            id: "wgsl-white-key-cutout",
            label: "White Key Cutout",
            description: "Cut out bright backgrounds by keying on luminance instead of texture alpha",
        },
        {
            id: "wgsl-black-key-cutout",
            label: "Black Key Cutout",
            description: "Cut out dark backgrounds by keying on luminance instead of texture alpha",
        },
        {
            id: "wgsl-autoluminous",
            label: "Luminous",
            description: "GlowLayer-based luminous preset that routes into LuminousGlow",
        },
        {
            id: "wgsl-full-light",
            label: "full_light",
            description: "Treat the material as always facing light regardless of PMX toon flags",
        },
        {
            id: "wgsl-full-light-add",
            label: "full_light_add",
            description: "Read light sliders directly and add a dedicated light boost regardless of PMX toon flags",
        },
        {
            id: "wgsl-full-shadow",
            label: "full_shadow",
            description: "Treat the material as always in shadow regardless of PMX toon flags",
        },
        {
            id: "wgsl-light-and-shadow",
            label: "light_and_shadow",
            description: "Use the standard MMD light-and-shadow path, including fallback toon ramps for non-toon materials",
        },
        {
            id: "wgsl-cel-shadow-sharp",
            label: "Cel Shadow Sharp",
            description: "Hardens the self-shadow boundary for a crisper cel-look shadow band",
        },
        {
            id: "wgsl-gloss-highlight",
            label: "Gloss Highlight",
            description: "Narrow, strong highlight that tightens toward the light direction",
        },
        {
            id: "wgsl-semi-matte-highlight",
            label: "Semi-Matte Highlight",
            description: "Balanced highlight with moderate spread toward the light direction",
        },
        {
            id: "wgsl-matte-highlight",
            label: "Matte Highlight",
            description: "Broad, soft highlight with a restrained light-facing lift",
        },
        {
            id: "wgsl-specular",
            label: "Specular Boost",
            description: "Sharper highlights for glossy materials",
        },
        {
            id: "wgsl-ssr-reflective",
            label: "SSR Reflective",
            description: "Marks a stage material as reflective for Frame Graph SSR",
        },
        {
            id: "wgsl-cel-sharp",
            label: "Cel Sharp",
            description: "Stronger toon contrast with reduced specular spread",
        },
        {
            id: "wgsl-accessory-toon",
            label: "Accessory Toon",
            description: "Use the standard MMD shading path with an accessory-oriented fallback toon ramp",
        },
        {
            id: "wgsl-rim-lift",
            label: "Rim Lift",
            description: "Adds diffuse-based emissive lift for a brighter anime edge feel",
        },
        {
            id: "wgsl-mono-flat",
            label: "Mono Flat",
            description: "Monochrome flat shading with lighting disabled",
        },
        {
            id: "wgsl-debug-white",
            label: "debug_white",
            description: "White-shadow debug view using the built-in toon debug WGSL",
        },
    ];
    private static readonly POST_EFFECT_LUT_PRESETS = [
        { id: "anime-soft", label: "Anime Soft" },
        { id: "anime-cool", label: "Anime Cool" },
        { id: "anime-dramatic", label: "Anime Dramatic" },
        { id: "monotone", label: "Monotone" },
        { id: "sepia", label: "Sepia" },
        { id: "teal-orange", label: "Teal Orange" },
    ] as const;
    private static readonly POST_EFFECT_LUT_TEXT_BY_ID: Record<string, string> = {
        "anime-soft": animeSoftLutText,
        "anime-cool": animeCoolLutText,
        "anime-dramatic": animeDramaticLutText,
        "monotone": monotoneLutText,
        "sepia": sepiaLutText,
        "teal-orange": tealOrangeLutText,
    };
    private static toonLightSeparationShaderPatched = false;
    private static toonSelfShadowBoundarySoftness = 0.055;
    private static toonOcclusionShadowBoundarySoftness = 0.075;
    private static toonFlatLightColorInfluence = 0.35;
    private static toonContactAoEnabled = false;
    private static toonContactAoStrength = 0;
    private static toonContactAoRadius = 0.8;
    private static toonContactAoFadeStartMeters = 6;
    private static toonContactAoFadeEndMeters = 14;
    private static toonContactAoDebugView = false;
    private static toonContactAoDepthRenderer: DepthRenderer | null = null;
    private static toonContactAoFallbackTexture: DynamicTexture | null = null;
    private static externalWgslToonFragmentReplacement: string | null = null;
    private static externalWgslToonSourcePath: string | null = null;
    private static readonly externalWgslToonFragmentByMaterial = new WeakMap<object, string>();
    private static readonly presetWgslToonFragmentByMaterial = new WeakMap<object, string>();

    private static shadowSoftnessToToonBoundaryWidth(v: number): number {
        if (!Number.isFinite(v)) return 0.09;
        return Math.max(0.02, Math.min(0.35, v * 2.5));
    }

    private static getToonContactAoFallbackTexture(scene: Scene): DynamicTexture {
        if (MmdManager.toonContactAoFallbackTexture) {
            return MmdManager.toonContactAoFallbackTexture;
        }

        const texture = new DynamicTexture(
            "mmdContactAoFallback",
            { width: 1, height: 1 },
            scene,
            false,
            Texture.NEAREST_SAMPLINGMODE,
        );
        const context = texture.getContext();
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, 1, 1);
        texture.update(false);
        MmdManager.toonContactAoFallbackTexture = texture;
        return texture;
    }

    private static patchMmdToonLightSeparationShader(): void {
        if (MmdManager.toonLightSeparationShaderPatched) return;

        const patchGetCustomCode = (
            ctor: { prototype: { getCustomCode?: (shaderType: string) => unknown } },
            isWgsl: boolean,
        ): void => {
            const originalGetCustomCode = ctor.prototype.getCustomCode;
            if (typeof originalGetCustomCode !== "function") return;

            ctor.prototype.getCustomCode = function patchedGetCustomCode(shaderType: string): unknown {
                const codes = originalGetCustomCode.call(this, shaderType);
                if (shaderType !== "fragment" || !codes || typeof codes !== "object") {
                    return codes;
                }

                const target = "diffuseBase+=mix(info.diffuse*shadow,toonNdl*info.diffuse,info.isToon);";
                const selfWidth = MmdManager.shadowSoftnessToToonBoundaryWidth(MmdManager.toonSelfShadowBoundarySoftness);
                const occlusionWidth = MmdManager.shadowSoftnessToToonBoundaryWidth(MmdManager.toonOcclusionShadowBoundarySoftness);
                const selfMaskMin = (0.5 - selfWidth).toFixed(6);
                const selfMaskMax = (0.5 + selfWidth).toFixed(6);
                const occlusionMaskMin = (0.5 - occlusionWidth).toFixed(6);
                const occlusionMaskMax = (0.5 + occlusionWidth).toFixed(6);
                const lightColorInfluence = MmdManager.toonFlatLightColorInfluence.toFixed(6);
                const toonBandAlignment = 0.75;
                const defaultReplacementLine = isWgsl
                    ? `#ifdef TOON_TEXTURE_COLOR
{
let one=vec3f(1.0);
let lightTint=max(uniforms.toonTextureMultiplicativeColor.rgb,vec3f(0.0));
let flatStrength=clamp(uniforms.toonTextureMultiplicativeColor.a,0.0,1.0);
let shadowTint=clamp(uniforms.toonTextureAdditiveColor.rgb,vec3f(0.0),vec3f(1.0));
let toonInfluence=clamp(uniforms.toonTextureAdditiveColor.a,0.0,1.0);
var toonRaw=vec3f(clamp(info.ndl*shadow,0.02,0.98));
toonRaw.r=textureSample(toonSampler,toonSamplerSampler,vec2f(0.5,toonRaw.r)).r;
toonRaw.g=textureSample(toonSampler,toonSamplerSampler,vec2f(0.5,toonRaw.g)).g;
toonRaw.b=textureSample(toonSampler,toonSamplerSampler,vec2f(0.5,toonRaw.b)).b;
let selfMask=smoothstep(${selfMaskMin},${selfMaskMax},clamp(info.ndl,0.0,1.0));
let occlusionMask=smoothstep(${occlusionMaskMin},${occlusionMaskMax},clamp(shadow,0.0,1.0));
let toneBandLuma=clamp(dot(toonRaw,vec3f(0.299,0.587,0.114)),0.0,1.0);
let geometricLitMask=clamp(selfMask*occlusionMask,0.0,1.0);
let litMask=clamp(geometricLitMask*mix(1.0,toneBandLuma,${toonBandAlignment.toFixed(6)}),0.0,1.0);
let shadowMask=1.0-litMask;
let toonShadowBand=mix(shadowTint,toonRaw,toonInfluence);
let shadowTerm=info.diffuse*mix(one,toonShadowBand,shadowMask);
let lightBoost=max(lightTint-one,vec3f(0.0));
let boostEnergy=max(lightBoost.r,max(lightBoost.g,lightBoost.b));
toonFlatLightMask=litMask*clamp(boostEnergy*(0.9+flatStrength*2.6),0.0,1.0);
toonFlatLightColor=lightBoost*(0.7+flatStrength*2.8)*(0.4+${lightColorInfluence}*1.8);
diffuseBase+=shadowTerm;
}
#else
diffuseBase+=mix(info.diffuse*shadow,toonNdl*info.diffuse,info.isToon);
#endif`
                    : `#ifdef TOON_TEXTURE_COLOR
{
vec3 one=vec3(1.0);
vec3 lightTint=max(toonTextureMultiplicativeColor.rgb,vec3(0.0));
float flatStrength=clamp(toonTextureMultiplicativeColor.a,0.0,1.0);
vec3 shadowTint=clamp(toonTextureAdditiveColor.rgb,vec3(0.0),vec3(1.0));
float toonInfluence=clamp(toonTextureAdditiveColor.a,0.0,1.0);
vec3 toonRaw=vec3(clamp(info.ndl*shadow,0.02,0.98));
toonRaw.r=texture2D(toonSampler,vec2(0.5,toonRaw.r)).r;
toonRaw.g=texture2D(toonSampler,vec2(0.5,toonRaw.g)).g;
toonRaw.b=texture2D(toonSampler,vec2(0.5,toonRaw.b)).b;
float selfMask=smoothstep(${selfMaskMin},${selfMaskMax},clamp(info.ndl,0.0,1.0));
float occlusionMask=smoothstep(${occlusionMaskMin},${occlusionMaskMax},clamp(shadow,0.0,1.0));
float toneBandLuma=clamp(dot(toonRaw,vec3(0.299,0.587,0.114)),0.0,1.0);
float geometricLitMask=clamp(selfMask*occlusionMask,0.0,1.0);
float litMask=clamp(geometricLitMask*mix(1.0,toneBandLuma,${toonBandAlignment.toFixed(6)}),0.0,1.0);
float shadowMask=1.0-litMask;
vec3 toonShadowBand=mix(shadowTint,toonRaw,toonInfluence);
vec3 shadowTerm=info.diffuse*mix(one,toonShadowBand,shadowMask);
vec3 lightBoost=max(lightTint-one,vec3(0.0));
float boostEnergy=max(lightBoost.r,max(lightBoost.g,lightBoost.b));
toonFlatLightMask=litMask*clamp(boostEnergy*(0.9+flatStrength*2.6),0.0,1.0);
toonFlatLightColor=lightBoost*(0.7+flatStrength*2.8)*(0.4+${lightColorInfluence}*1.8);
diffuseBase+=shadowTerm;
}
#else
diffuseBase+=mix(info.diffuse*shadow,toonNdl*info.diffuse,info.isToon);
#endif`;

                const pluginMaterial = (this as { _material?: unknown })._material;
                const replacementLine = isWgsl && pluginMaterial && typeof pluginMaterial === "object"
                    ? (
                        MmdManager.externalWgslToonFragmentByMaterial.get(pluginMaterial as object)
                        ?? MmdManager.presetWgslToonFragmentByMaterial.get(pluginMaterial as object)
                        ?? null
                    )
                    : null;
                const applyWithoutToonTexture = typeof replacementLine === "string"
                    && replacementLine.includes("@apply-without-toon");
                const replacementBlock = isWgsl && replacementLine && applyWithoutToonTexture
                    ? `#ifdef TOON_TEXTURE
toonNdl=vec3f(clamp(info.ndl*shadow,0.02,0.98));
toonNdl.r=textureSample(toonSampler,toonSamplerSampler,vec2f(0.5,toonNdl.r)).r;
toonNdl.g=textureSample(toonSampler,toonSamplerSampler,vec2f(0.5,toonNdl.g)).g;
toonNdl.b=textureSample(toonSampler,toonSamplerSampler,vec2f(0.5,toonNdl.b)).b;
${replacementLine}
#elif defined(IGNORE_DIFFUSE_WHEN_TOON_TEXTURE_DISABLED)
${replacementLine}
#else
${replacementLine}
#endif`
                    : (replacementLine ?? defaultReplacementLine);

                const codeMap = codes as Record<string, unknown>;
                const contactAoDefinitions = isWgsl
                    ? `
#ifdef MMD_CONTACT_AO
var mmdContactAoDepthSamplerSampler: sampler;
var mmdContactAoDepthSampler: texture_2d<f32>;
fn mmdContactAoReadDepth(uv: vec2f) -> f32 {
    return abs(textureSampleLevel(mmdContactAoDepthSampler, mmdContactAoDepthSamplerSampler, clamp(uv, vec2f(0.001), vec2f(0.999)), 0.0).r);
}
fn mmdContactAoDirection(index: i32) -> vec2f {
    switch index {
        case 0: { return vec2f(1.0, 0.0); }
        case 1: { return vec2f(0.7071, 0.7071); }
        case 2: { return vec2f(0.0, 1.0); }
        case 3: { return vec2f(-0.7071, 0.7071); }
        case 4: { return vec2f(-1.0, 0.0); }
        case 5: { return vec2f(-0.7071, -0.7071); }
        case 6: { return vec2f(0.0, -1.0); }
        default: { return vec2f(0.7071, -0.7071); }
    }
}
fn mmdComputeContactAo(screenUv: vec2f, positionW: vec3f, normalW: vec3f) -> f32 {
    let strength = clamp(uniforms.mmdContactAoParams.x * 2.4, 0.0, 28.0);
    if (strength <= 0.00001) {
        return 0.0;
    }
    let centerDepth = mmdContactAoReadDepth(screenUv);
    if (centerDepth <= 0.00001) {
        return 0.0;
    }
    let safeScreen = max(uniforms.mmdContactAoScreenSize, vec2f(1.0));
    let texel = vec2f(1.0) / safeScreen;
    let resolutionScale = safeScreen.y / 1080.0;
    let radiusNorm = clamp((uniforms.mmdContactAoParams.y - 0.2) / 2.4, 0.0, 1.0);
    let sampleRadiusPx = mix(0.8, 3.2, radiusNorm) * resolutionScale;
    let dL = mmdContactAoReadDepth(screenUv - vec2f(texel.x, 0.0));
    let dR = mmdContactAoReadDepth(screenUv + vec2f(texel.x, 0.0));
    let dD = mmdContactAoReadDepth(screenUv - vec2f(0.0, texel.y));
    let dU = mmdContactAoReadDepth(screenUv + vec2f(0.0, texel.y));
    let depthGrad = max(max(abs(dR - dL), abs(dU - dD)), 0.00003);
    let depthSlopePerPx = vec2f((dR - dL) * 0.5, (dU - dD) * 0.5);
    let nearDepth = min(min(dL, dR), min(dD, dU));
    let microCavity = smoothstep(
        depthGrad * 0.14 + 0.00004,
        depthGrad * 1.45 + 0.00055,
        centerDepth - nearDepth
    );
    var occlusion = 0.0;
    var totalWeight = 0.0;
    for (var ring: i32 = 1; ring <= 2; ring = ring + 1) {
        let ringFactor = f32(ring) / 2.0;
        let ringWeight = mix(1.0, 0.5, ringFactor);
        for (var i: i32 = 0; i < 8; i = i + 1) {
            let sampleOffsetPx = mmdContactAoDirection(i) * sampleRadiusPx * ringFactor;
            let sampleSpanPx = max(1.0, sampleRadiusPx * ringFactor);
            let sampleUv = clamp(
                screenUv + sampleOffsetPx * texel,
                vec2f(0.001),
                vec2f(0.999)
            );
            let sampleDepth = mmdContactAoReadDepth(sampleUv);
            if (sampleDepth <= 0.00001) {
                continue;
            }
            let expectedDepth = centerDepth + dot(depthSlopePerPx, sampleOffsetPx);
            let planeDelta = expectedDepth - sampleDepth;
            let gradientAllowance = depthGrad * sampleSpanPx;
            let shallowLo = gradientAllowance * (0.2 + ringFactor * 0.18) + 0.00004;
            let shallowMid = gradientAllowance * (1.65 + ringFactor * 1.25) + (0.00022 + ringFactor * 0.00028);
            let shallowHi = gradientAllowance * (3.8 + ringFactor * 2.4) + (0.00072 + ringFactor * 0.00082);
            let positiveGate = smoothstep(shallowLo, shallowMid, planeDelta);
            let shallowGate = 1.0 - smoothstep(shallowMid, shallowHi, planeDelta);
            let largeGapReject = 1.0 - smoothstep(shallowHi * 1.15, shallowHi * 2.9, abs(planeDelta));
            occlusion += positiveGate * shallowGate * largeGapReject * ringWeight;
            totalWeight += ringWeight;
        }
    }
    let aoRaw = occlusion / max(totalWeight, 0.0001);
    let aoCombined = clamp(aoRaw * 1.1 + microCavity * 0.05, 0.0, 1.0);
    let cameraDistance = length(scene.vEyePosition.xyz - positionW);
    let worldFade = 1.0 - smoothstep(uniforms.mmdContactAoFade.x, uniforms.mmdContactAoFade.y, cameraDistance);
    let viewFacing = clamp(dot(normalize(normalW), normalize(scene.vEyePosition.xyz - positionW)), 0.0, 1.0);
    let viewWeight = smoothstep(0.34, 0.86, viewFacing);
    var ao = clamp(pow(aoCombined, 3.0) * strength * 0.48, 0.0, 0.82);
    ao *= worldFade * viewWeight;
    return ao;
}
#endif`
                    : "";
                const contactAoBeforeLights = isWgsl
                    ? `
#ifdef MMD_CONTACT_AO
let toonContactAoUv = clamp(
    fragmentInputs.position.xy / max(uniforms.mmdContactAoScreenSize, vec2f(1.0)),
    vec2f(0.001),
    vec2f(0.999)
);
toonContactAo = mmdComputeContactAo(toonContactAoUv, fragmentInputs.vPositionW, normalW);
#endif
`
                    : `
toonContactAo=0.0;
`;
                for (const key of Object.keys(codeMap)) {
                    const value = codeMap[key];
                    if (typeof value !== "string") continue;

                    if (!value.includes(target)) continue;
                    codeMap[key] = applyWithoutToonTexture
                        ? replacementBlock
                        : (codeMap[key] as string).replace(target, replacementBlock);
                }

                if (isWgsl && typeof codeMap["CUSTOM_FRAGMENT_DEFINITIONS"] === "string") {
                    const definitions = codeMap["CUSTOM_FRAGMENT_DEFINITIONS"] as string;
                    if (!definitions.includes("mmdContactAoDepthSampler")) {
                        codeMap["CUSTOM_FRAGMENT_DEFINITIONS"] = `${definitions}
${contactAoDefinitions}
`;
                    }
                }

                if (typeof codeMap["CUSTOM_FRAGMENT_MAIN_BEGIN"] === "string") {
                    const begin = codeMap["CUSTOM_FRAGMENT_MAIN_BEGIN"] as string;
                    if (!begin.includes("toonFlatLightMask")) {
                        codeMap["CUSTOM_FRAGMENT_MAIN_BEGIN"] = `${begin}
${isWgsl
        ? "var toonFlatLightMask: f32=0.0;\nvar toonFlatLightColor: vec3f=vec3f(0.0);\nvar toonContactAo: f32=0.0;\nvar toonFinalOverrideMix: f32=0.0;\nvar toonFinalOverrideColor: vec3f=vec3f(0.0);\nvar toonFinalOverrideUseColorLuma: f32=0.0;\nvar toonFinalOverrideLumaMin: f32=0.0;\nvar toonFinalOverrideLumaMax: f32=1.0;"
        : "float toonFlatLightMask=0.0;\nvec3 toonFlatLightColor=vec3(0.0);\nfloat toonContactAo=0.0;\nfloat toonFinalOverrideMix=0.0;\nvec3 toonFinalOverrideColor=vec3(0.0);\nfloat toonFinalOverrideUseColorLuma=0.0;\nfloat toonFinalOverrideLumaMin=0.0;\nfloat toonFinalOverrideLumaMax=1.0;"}
`;
                    }
                }

                if (typeof codeMap["CUSTOM_FRAGMENT_BEFORE_LIGHTS"] === "string") {
                    const beforeLights = codeMap["CUSTOM_FRAGMENT_BEFORE_LIGHTS"] as string;
                    if (!beforeLights.includes("toonContactAoUv")) {
                        codeMap["CUSTOM_FRAGMENT_BEFORE_LIGHTS"] = `${beforeLights}
${contactAoBeforeLights}
`;
                    }
                } else {
                    codeMap["CUSTOM_FRAGMENT_BEFORE_LIGHTS"] = contactAoBeforeLights;
                }

                const beforeFogAppendBlock = isWgsl
                    ? `
let toonFlatMix=clamp(toonFlatLightMask,0.0,1.0);
color=vec4f(color.rgb+toonFlatLightColor*toonFlatMix,color.a);
let toonFinalMix=clamp(toonFinalOverrideMix,0.0,1.0);
let toonFinalColorLumaMix=clamp(toonFinalOverrideUseColorLuma,0.0,1.0);
let toonColorLuma=clamp(dot(color.rgb,vec3f(0.299,0.587,0.114)),0.0,1.0);
let toonLumaMin=clamp(toonFinalOverrideLumaMin,0.0,1.0);
let toonLumaMax=clamp(max(toonLumaMin,toonFinalOverrideLumaMax),toonLumaMin,1.0);
let toonRemappedLuma=mix(toonLumaMin,toonLumaMax,toonColorLuma);
let toonFinalColor=mix(toonFinalOverrideColor,vec3f(toonRemappedLuma),toonFinalColorLumaMix);
color=vec4f(mix(color.rgb,toonFinalColor,toonFinalMix),color.a);
let toonContactAoMix=clamp(toonContactAo,0.0,1.0);
let toonContactAoDebug=clamp(uniforms.mmdContactAoParams.z,0.0,1.0);
let toonContactAoApplied=1.0-pow(1.0-clamp(toonContactAoMix*7.0,0.0,0.998),1.15);
let toonContactAoMask=vec3f(1.0-toonContactAoApplied);
color=vec4f(mix(color.rgb*toonContactAoMask,toonContactAoMask,toonContactAoDebug),color.a);
`
                    : `
float toonFlatMix=clamp(toonFlatLightMask,0.0,1.0);
color.rgb+=toonFlatLightColor*toonFlatMix;
float toonFinalMix=clamp(toonFinalOverrideMix,0.0,1.0);
float toonFinalColorLumaMix=clamp(toonFinalOverrideUseColorLuma,0.0,1.0);
float toonColorLuma=clamp(dot(color.rgb,vec3(0.299,0.587,0.114)),0.0,1.0);
float toonLumaMin=clamp(toonFinalOverrideLumaMin,0.0,1.0);
float toonLumaMax=clamp(max(toonLumaMin,toonFinalOverrideLumaMax),toonLumaMin,1.0);
float toonRemappedLuma=mix(toonLumaMin,toonLumaMax,toonColorLuma);
vec3 toonFinalColor=mix(toonFinalOverrideColor,vec3(toonRemappedLuma),toonFinalColorLumaMix);
color.rgb=mix(color.rgb,toonFinalColor,toonFinalMix);
float toonContactAoMix=clamp(toonContactAo,0.0,1.0);
float toonContactAoApplied=1.0-pow(1.0-clamp(toonContactAoMix*7.0,0.0,0.998),1.15);
color.rgb*=(1.0-toonContactAoApplied);
`;
                if (typeof codeMap["CUSTOM_FRAGMENT_BEFORE_FOG"] === "string") {
                    const beforeFog = codeMap["CUSTOM_FRAGMENT_BEFORE_FOG"] as string;
                    if (!beforeFog.includes("toonFinalOverrideMix")) {
                        codeMap["CUSTOM_FRAGMENT_BEFORE_FOG"] = `${beforeFog}
${beforeFogAppendBlock}
`;
                    }
                } else {
                    codeMap["CUSTOM_FRAGMENT_BEFORE_FOG"] = beforeFogAppendBlock;
                }

                return codes;
            };
        };

        const patchGetSamplers = (
            ctor: { prototype: { getSamplers?: (samplers: string[]) => void } },
        ): void => {
            const originalGetSamplers = ctor.prototype.getSamplers;
            if (typeof originalGetSamplers !== "function") return;

            ctor.prototype.getSamplers = function patchedGetSamplers(samplers: string[]): void {
                originalGetSamplers.call(this, samplers);
                if (MmdManager.toonContactAoEnabled && !samplers.includes("mmdContactAoDepthSampler")) {
                    samplers.push("mmdContactAoDepthSampler");
                }
            };
        };

        const patchPrepareDefines = (
            ctor: { prototype: { prepareDefines?: (...args: unknown[]) => void } },
        ): void => {
            const originalPrepareDefines = ctor.prototype.prepareDefines;
            if (typeof originalPrepareDefines !== "function") return;

            ctor.prototype.prepareDefines = function patchedPrepareDefines(...args: unknown[]): void {
                originalPrepareDefines.apply(this, args);

                const defines = args[0] as Record<string, unknown> | undefined;
                if (!defines || typeof defines !== "object") return;
                defines.MMD_CONTACT_AO = MmdManager.toonContactAoEnabled;
            };
        };

        const patchGetUniforms = (
            ctor: { prototype: { getUniforms?: (shaderLanguage?: ShaderLanguage) => unknown } },
        ): void => {
            const originalGetUniforms = ctor.prototype.getUniforms;
            if (typeof originalGetUniforms !== "function") return;

            ctor.prototype.getUniforms = function patchedGetUniforms(shaderLanguage?: ShaderLanguage): unknown {
                const uniforms = originalGetUniforms.call(this, shaderLanguage) as {
                    ubo?: { name: string; size: number; type: string }[];
                    fragment?: string;
                };
                if (!uniforms || typeof uniforms !== "object") {
                    return uniforms;
                }

                uniforms.ubo ??= [];
                if (!uniforms.ubo.some((entry) => entry.name === "mmdContactAoParams")) {
                    uniforms.ubo.push(
                        { name: "mmdContactAoParams", size: 4, type: "vec4" },
                        { name: "mmdContactAoScreenSize", size: 2, type: "vec2" },
                        { name: "mmdContactAoFade", size: 2, type: "vec2" },
                    );
                }
                return uniforms;
            };
        };

        const patchBindForSubMesh = (
            ctor: { prototype: { bindForSubMesh?: (...args: unknown[]) => void } },
        ): void => {
            const originalBindForSubMesh = ctor.prototype.bindForSubMesh;
            if (typeof originalBindForSubMesh !== "function") return;

            ctor.prototype.bindForSubMesh = function patchedBindForSubMesh(...args: unknown[]): void {
                originalBindForSubMesh.apply(this, args);

                const uniformBuffer = args[0] as {
                    updateFloat4?: (name: string, x: number, y: number, z: number, w: number) => void;
                    updateFloat2?: (name: string, x: number, y: number) => void;
                    setTexture?: (name: string, texture: Texture | null) => void;
                    _currentEffect?: Effect | null;
                } | undefined;
                const scene = args[1] as Scene | undefined;
                if (!uniformBuffer || !scene) return;

                const strength = MmdManager.toonContactAoEnabled ? MmdManager.toonContactAoStrength : 0;
                const radius = MmdManager.toonContactAoEnabled ? MmdManager.toonContactAoRadius : 0.8;
                const debugView = MmdManager.toonContactAoEnabled && MmdManager.toonContactAoDebugView ? 1 : 0;
                uniformBuffer.updateFloat4?.("mmdContactAoParams", strength, radius, debugView, 0);
                uniformBuffer.updateFloat2?.(
                    "mmdContactAoScreenSize",
                    Math.max(1, scene.getEngine().getRenderWidth()),
                    Math.max(1, scene.getEngine().getRenderHeight()),
                );
                uniformBuffer.updateFloat2?.(
                    "mmdContactAoFade",
                    MmdManager.toonContactAoFadeStartMeters,
                    MmdManager.toonContactAoFadeEndMeters,
                );

                if (!MmdManager.toonContactAoEnabled) {
                    return;
                }

                const depthMap = MmdManager.toonContactAoDepthRenderer?.getDepthMap()
                    ?? MmdManager.getToonContactAoFallbackTexture(scene);
                const subMesh = args[3] as { effect?: Effect | null } | undefined;
                const effect = subMesh?.effect ?? uniformBuffer._currentEffect ?? null;
                effect?.setTexture("mmdContactAoDepthSampler", depthMap);
                uniformBuffer.setTexture?.("mmdContactAoDepthSampler", depthMap);
            };
        };

        patchGetCustomCode(MmdStandardShaderPluginGLSL as unknown as { prototype: { getCustomCode?: (shaderType: string) => unknown } }, false);
        patchGetCustomCode(MmdStandardShaderPluginWGSL as unknown as { prototype: { getCustomCode?: (shaderType: string) => unknown } }, true);
        patchGetSamplers(MmdStandardShaderPluginWGSL as unknown as { prototype: { getSamplers?: (samplers: string[]) => void } });
        patchPrepareDefines(MmdStandardShaderPluginWGSL as unknown as { prototype: { prepareDefines?: (...args: unknown[]) => void } });
        patchGetUniforms(MmdStandardShaderPluginWGSL as unknown as { prototype: { getUniforms?: (shaderLanguage?: ShaderLanguage) => unknown } });
        patchBindForSubMesh(MmdStandardShaderPluginWGSL as unknown as { prototype: { bindForSubMesh?: (...args: unknown[]) => void } });
        MmdManager.toonLightSeparationShaderPatched = true;
    }
    private readonly renderingCanvas: HTMLCanvasElement;
    private engine: Engine | WebGPUEngine;
    private readonly runtimeDiagnostics = new Set<string>();
    private readonly webGpuTextureMipmapDecisionCache = new Map<string, Promise<boolean>>();
    private scene: Scene;
    private readonly framePerformanceLogEnabled = MmdManager.readBooleanLocalStorage(
        MmdManager.FRAME_PERFORMANCE_LOG_STORAGE_KEY,
        false,
    );
    private readonly requestedPostEffectBackend = readPostEffectBackendLocalStorage();
    private postEffectBackend: PostEffectBackend = this.requestedPostEffectBackend;
    private frameGraphPostEffectsController: FrameGraphPostEffectsController | null = null;
    private sceneInstrumentation: SceneInstrumentation | null = null;
    private camera: ArcRotateCamera;
    private mmdCamera: MmdCamera;
    private mmdRuntime: RuntimeMmdRuntime;
    private runtimeMode: RuntimeMode = MmdManager.readRuntimeModeLocalStorage();
    private mmdWasmInstance: IMmdWasmInstance | null = null;
    private vmdLoader: VmdLoader;
    private vpdLoader: VpdLoader;
    private currentMesh: MmdMesh | null = null;
    private currentModel: RuntimeModel | null = null;
    private activeModelInfo: ModelInfo | null = null;
    private sceneModels: SceneModelEntry[] = [];
    private _isPlaying = false;
    private _currentFrame = 0;
    private _totalFrames = 300;
    private _playbackSpeed = 1;
    private manualPlaybackWithoutAudio = false;
    private externalPlaybackSimulationEnabled = false;
    private manualPlaybackFrameCursor = 0;
    private lastRenderTimestampMs = performance.now();
    private nextRenderDueTimestampMs = performance.now();
    private renderFpsLimit = 0;
    private nextFramePerformanceLogMs = performance.now() + 10_000;
    private framePerformanceStats = MmdManager.createFramePerformanceStats();
    private ground: Mesh | null = null;
    private mirroringFloor: Mesh | null = null;
    private mirroringFloorMaterial: StandardMaterial | null = null;
    private mirroringFloorTexture: MirrorTexture | null = null;
    private mirroringFloorEnabledValue = false;
    private mirroringFloorReflectanceValue = 0.35;
    private mirroringFloorSizeValue = 40;
    private mirroringFloorHeightValue = 0;
    private mirroringFloorResolutionValue = 512;
    private skydome: Mesh | null = null;
    private backgroundImageLayer: Layer | null = null;
    private backgroundImagePath: string | null = null;
    private backgroundVideoLayer: Layer | null = null;
    private backgroundVideoTexture: DynamicTexture | null = null;
    private backgroundVideoElement: HTMLVideoElement | null = null;
    private backgroundVideoCanvas: HTMLCanvasElement | null = null;
    private backgroundVideoPath: string | null = null;
    private backgroundMediaVisible = true;
    private backgroundVideoLastSyncedTime = Number.NaN;
    private backgroundVideoLastDrawnTime = Number.NaN;
    private readonly defaultClearColor = new Color4(0.94, 0.94, 0.94, 1);
    private readonly blackClearColor = new Color4(0, 0, 0, 1);
    private backgroundBlackEnabled = false;
    private audioPlayer: StreamAudioPlayer | null = null;
    private audioBlobUrl: string | null = null;
    // Lighting references
    private dirLight!: DirectionalLight;
    private hemiLight!: HemisphericLight;
    private shadowGenerator!: ShadowGenerator;
    private iblShadowsPipeline: IblShadowsRenderPipeline | null = null;
    private iblFallbackEnvironmentTexture: RawCubeTexture | null = null;
    private iblTestEnvironmentTexture: HDRCubeTexture | null = null;
    private iblWebGpuCdfFallbackTexture: RawTexture | null = null;
    private iblWebGpuSuppressedEnvironmentTexture: BaseTexture | null = null;
    private iblShadowDebugPassSignature = "";
    private contactShadowTexture: DynamicTexture | null = null;
    private contactShadowBlobTexture: Texture | null = null;
    private contactShadowMaterial: StandardMaterial | null = null;
    private contactShadowMeshesByModel = new WeakMap<SceneModelEntry, ContactShadowBlobMeshes>();
    private characterContactShadowEnabledValue = false;
    private characterContactShadowOpacityValue = 0.35;
    private characterContactShadowScaleValue = 1.0;
    private cameraRotationEulerDeg = new Vector3(0, 0, 0);
    private cameraAnimationHandle: MmdRuntimeAnimationHandle | null = null;
    private hasCameraMotion = false;
    private readonly modelKeyframeTracksByModel = new WeakMap<RuntimeModel, Map<string, Uint32Array>>();
    private readonly modelSourceAnimationsByModel = new WeakMap<RuntimeModel, MmdAnimation>();
    private cameraSourceAnimation: MmdAnimation | null = null;
    private readonly modelMotionImportsByModel = new WeakMap<RuntimeModel, ProjectMotionImport[]>();
    private cameraMotionPath: string | null = null;
    private audioSourcePath: string | null = null;
    private cameraKeyframeFrames: Uint32Array = EMPTY_KEYFRAME_FRAMES;
    private timelineTarget: "model" | "camera" = "model";
    private boneVisualizerTarget: { mesh: Mesh; skeleton: Skeleton | null; pairs: Array<[number, number]>; positionMesh: Mesh; runtimeBones: readonly IMmdRuntimeBone[] | null; runtimeUseMeshWorldMatrix: boolean; boneControlInfoByName: ReadonlyMap<string, BoneControlInfo> } | null = null;
    private boneOverlayCanvas: HTMLCanvasElement | null = null;
    private boneOverlayCtx: CanvasRenderingContext2D | null = null;
    private boneOverlayDpr = 1;
    private readonly boneOverlayChildWorld = new Vector3();
    private readonly boneOverlayParentWorld = new Vector3();
    private readonly boneOverlayChildScreen = new Vector3();
    private readonly boneOverlayParentScreen = new Vector3();
    private readonly boneOverlayIdentity = Matrix.Identity();
    private boneVisualizerSelectedBoneName: string | null = null;
    private boneVisualizerPickPoints: { boneName: string; x: number; y: number }[] = [];
    private bonePickPointerDown: { pointerId: number; clientX: number; clientY: number } | null = null;
    private captureEditorOverlaysSuppressed = false;
    private rigidBodyVisualizerEnabled = false;
    private rigidBodyVisualizerTargets: {
        sceneModel: SceneModelEntry;
        backend: "ammo" | "bullet";
        physicsModel: unknown;
        rigidBodies: SceneModelRigidBodyEntry[];
        meshes: Mesh[];
    }[] = [];
    private readonly rigidBodyVisualizerTempMatrix = Matrix.Identity();
    private readonly rigidBodyVisualizerTempScaling = new Vector3(1, 1, 1);
    private readonly rigidBodyVisualizerTempPosition = new Vector3();
    private readonly rigidBodyVisualizerTempRotation = Quaternion.Identity();
    private readonly rigidBodyVisualizerMaterials = new Map<number, StandardMaterial>();
    private cameraMouseDragState: {
        pointerId: number;
        mode: "rotate" | "pan" | "zoom";
        lastClientX: number;
        lastClientY: number;
    } | null = null;
    private lastViewportCameraSyncState:
        | {
            position: Vector3;
            target: Vector3;
            radius: number;
            fov: number;
        }
        | null = null;
    private boneGizmoManager: GizmoManager | null = null;
    private boneGizmoRuntimeBone: EditorRuntimeBone | null = null;
    private boneGizmoProxyNode: TransformNode | null = null;
    private readonly boneGizmoTempMatrix = Matrix.Identity();
    private readonly boneGizmoTempMatrix2 = Matrix.Identity();
    private readonly boneGizmoTempScale = new Vector3(1, 1, 1);
    private readonly boneGizmoTempScale2 = new Vector3(1, 1, 1);
    private readonly boneGizmoTempPosition = new Vector3();
    private readonly boneGizmoTempPosition2 = new Vector3();
    private readonly boneGizmoTempPosition3 = new Vector3();
    private readonly boneGizmoTempRotation = Quaternion.Identity();
    private readonly boneGizmoTempRotation2 = Quaternion.Identity();
    private physicsEnabledBeforeBoneGizmoDrag: boolean | null = null;
    private globalIlluminationController: GlobalIlluminationController | null = null;
    private physicsController!: PhysicsRuntimeController;
    private physicsModelController!: PhysicsModelController;
    private physicsInitializationPromise: Promise<boolean>;
    private webGpuSdefCpuFallbackEnabled = MmdManager.readBooleanLocalStorage(
        MmdManager.WEBGPU_SDEF_CPU_FALLBACK_STORAGE_KEY,
        false,
    );
    private shadowEnabled = true;
    private shadowDarknessValue = 0.0;
    private shadowFrustumSizeValue = 220;
    private shadowMaxZValue = 1000;
    private shadowBiasValue = 0.0005;
    private shadowNormalBiasValue = 0.01;
    private shadowFilteringQualityValue = ShadowGenerator.QUALITY_MEDIUM;
    private softTransparentShadowEnabledValue = true;
    private iblShadowsEnabledValue = false;
    private iblShadowOpacityValue = 0.6;
    private iblShadowDistanceScaleValue = 4;
    private selfShadowEdgeSoftnessValue = 0.05;
    private occlusionShadowEdgeSoftnessValue = 0.01;
    private toonShadowInfluenceValue = 1;

    private lightColorTemperatureKelvin = 6500;
    private lightColorScaleValue = new Color3(1, 1, 1);
    private lightFlatStrengthValue = 0;
    private lightFlatColorInfluenceValue = 0.35;
    private shadowGroundColorValue = new Color3(0.5, 0.5, 0.5);
    private postEffectContrastValue = 1;
    private postEffectGammaValue = 1;
    private postEffectExposureValue = 1;
    private postEffectToneMappingEnabledValue = false;
    private postEffectToneMappingTypeValue = ImageProcessingConfiguration.TONEMAPPING_STANDARD;
    private postEffectDitheringEnabledValue = false;
    private postEffectDitheringIntensityValue = 1 / 255;
    private postEffectVignetteEnabledValue = false;
    private postEffectVignetteWeightValue = 0.3;
    private postEffectBloomEnabledValue = false;
    private postEffectBloomWeightValue = 1;
    private postEffectBloomThresholdValue = 1;
    private postEffectBloomKernelValue = 100;
    private postEffectChromaticAberrationValue = 0;
    private postEffectGrainIntensityValue = 0;
    private postEffectSharpenEdgeValue = 0;
    private postEffectSsaoEnabledValue = false;
    private postEffectSsaoStrengthValue = 1;
    private postEffectSsaoRadiusValue = 2;
    private postEffectSsaoFadeEndValue = 200;
    private postEffectSsaoDebugViewValue = false;
    private postEffectColorCurvesEnabledValue = false;
    private postEffectColorCurvesHueValue = 30;
    private postEffectColorCurvesDensityValue = 0;
    private postEffectColorCurvesSaturationValue = 0;
    private postEffectColorCurvesExposureValue = 0;
    private postEffectGlowEnabledValue = false;
    private postEffectGlowIntensityValue = 0.5;
    private postEffectGlowThresholdValue = 0.5;
    private postEffectGlowKernelValue = 20;
    private postEffectLutEnabledValue = false;
    private postEffectLutIntensityValue = 1;
    private postEffectLutPresetValue = "anime-soft";
    private postEffectLutSourceModeValue: PostEffectLutSourceMode = "builtin";
    private postEffectLutExternalPathValue: string | null = null;
    private postEffectLutExternalTextValue: string | null = null;
    private postEffectLutExternalSourceFormatValue: "3dl" | "cube" | null = null;
    private postEffectLutExternalRevision = 0;
    private postEffectMotionBlurEnabledValue = false;
    private postEffectMotionBlurStrengthValue = 0.5;
    private postEffectMotionBlurSamplesValue = 32;
    private postEffectSsrEnabledValue = false;
    private postEffectSsrStrengthValue = 0.3;
    private postEffectSsrStepValue = 4;
    private postEffectVlsEnabledValue = false;
    private postEffectVlsExposureValue = 0.3;
    private postEffectVlsDecayValue = 0.95;
    private postEffectVlsWeightValue = 0.4;
    private postEffectVlsDensityValue = 0.9;
    private postEffectFogEnabledValue = false;
    private postEffectFogModeValue = 2;
    private postEffectFogStartValue = 100;
    private postEffectFogEndValue = 300;
    private postEffectFogDensityValue = 0.002;
    private postEffectFogOpacityValue = 0.2;
    private postEffectFogColorValue = new Color3(0.04, 0.04, 0.06);
    private frameGraphPostEffectStackIdsValue: FrameGraphPostEffectId[] = [];
    private antialiasEnabledValue = true;
    private postEffectFarDofStrengthValue = 0;
    private readonly farDofEnabled = false;
    private readonly farDofFocusSharpRadiusMm = 1000;
    private modelEdgeWidthValue = 0;
    private readonly modelEdgeMaterialDefaults = new WeakMap<object, { enabled: boolean; width: number; alpha: number; colorR: number; colorG: number; colorB: number }>();
    private readonly materialBaseAlphaByMaterial = new WeakMap<object, number>();
    private readonly materialShaderDefaultsByMaterial = new WeakMap<object, MaterialShaderDefaults>();
    private readonly materialShaderPresetByMaterial = new WeakMap<object, WgslMaterialShaderPresetId>();
    private readonly externalWgslToonShaderPathByMaterial = new WeakMap<object, string>();
    private readonly materialHiddenByMaterial = new WeakMap<object, boolean>();
    private externalWgslToonShaderPathValue: string | null = null;
    private colorCorrectionPostProcess: PostProcess | null = null;
    private frameGraphPostEffectsSceneColorTarget: RenderTargetTexture | null = null;
    private frameGraphPostEffectsLuminousMaskTarget: RenderTargetTexture | null = null;
    private frameGraphPostEffectsLuminousMaskMaterial: StandardMaterial | null = null;
    private frameGraphPostEffectsLuminousMaskRenderedSubMeshCount = 0;
    private frameGraphPostEffectsLuminousMaskZeroWarningEmitted = false;
    private originFogPostProcess: PostProcess | null = null;
    private finalAntialiasPostProcess: FxaaPostProcess | null = null;
    private finalLensDistortionPostProcess: PostProcess | null = null;
    private dofPostProcess: PostProcess | null = null;
    private depthRenderer: DepthRenderer | null = null;
    private ssaoDepthRenderer: DepthRenderer | null = null;
    private defaultRenderingPipeline: DefaultRenderingPipeline | null = null;
    private lensRenderingPipeline: LensRenderingPipeline | null = null;
    private ssaoRenderingPipeline: SSAO2RenderingPipeline | null = null;
    private ssaoPostProcess: PostProcess | null = null;
    private ssrRenderingPipeline: SSRRenderingPipeline | null = null;
    private motionBlurPostProcess: PostProcess | null = null;
    private motionBlurPreviousCameraPosition: Vector3 | null = null;
    private motionBlurScreenDirection = new Vector2(0, 0);
    private motionBlurScreenAmount = 0;
    private standaloneBloomEffect: BloomEffect | null = null;
    private luminousGlowLayer: GlowLayer | null = null;
    private luminousGlowCoreLayer: GlowLayer | null = null;
    private luminousGlowMorphRevision = 0;
    private standaloneLensBlurPostProcess: PostProcess | null = null;
    private standaloneEdgeBlurPostProcess: PostProcess | null = null;
    private volumetricLightPostProcess: VolumetricLightScatteringPostProcess | null = null;
    private postEffectLutTexture: ColorGradingTexture | null = null;
    private postEffectLutTextureKey: string | null = null;
    private readonly postEffectLutPresetBlobUrlById = new Map<string, string>();
    private postEffectLutExternalBlobUrl: string | null = null;
    private dofEnabledValue = false;
    private dofBlurLevelValue = DepthOfFieldEffectBlurLevel.Medium;
    private dofFocusDistanceMmValue = 55000;
    private dofFStopValue = 2.8;
    private dofEffectiveFStopValue = 2.8;
    private dofLensBlurStrengthValue = 0;
    private dofLensBlurEnabledValue = true;
    private dofLensEdgeBlurValue = 0;
    private dofLensDistortionValue = 0;
    private readonly dofLensDistortionFollowsCameraFov = true;
    private readonly dofLensDistortionNeutralFovDeg = 30;
    private readonly dofLensDistortionMinTeleFovDeg = 10;
    private readonly dofLensDistortionMaxWideFovDeg = 120;
    private dofLensDistortionInfluenceValue = 0;
    private readonly dofLensHighlightsBaseGain = 1.1;
    private readonly dofLensHighlightsGainRange = 8.0;
    private readonly dofLensHighlightsBaseThreshold = 0.62;
    private readonly dofLensHighlightsThresholdRange = 0.72;
    private dofLensSizeValue = 30;
    private dofFocalLengthValue = 50;
    private readonly dofFocalLengthFollowsCameraFov = true;
    private readonly dofFovLinkSensorWidthMm = 36;
    private dofFocalLengthDistanceInvertedValue = false;
    private readonly dofAutoFocusToCameraTarget = true;
    private readonly dofAutoFocusInFocusRadiusMm = 6000;
    private readonly dofAutoFocusCocAtRangeEdge = 0.05;
    private readonly dofAutoFocusLensCompensationExponent = 0.72;
    private dofNearSuppressionScaleValue = 4.0;
    private dofAutoFocusNearOffsetMmValue = 0;
    private dofFocusTargetModelPathValue: string | null = null;
    private dofFocusTargetBoneNameValue: string | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private autoRenderEnabled = true;
    private readonly onWindowResize = () => {
        this.resize();
    };
    private isBoneGizmoPointerInteractionActive(clientX?: number, clientY?: number): boolean {
        const gizmoManager = this.boneGizmoManager;
        if (!gizmoManager) return false;
        if (gizmoManager.isDragging || gizmoManager.isHovered) return true;
        if (clientX === undefined || clientY === undefined) return false;

        const utilityLayerScene = gizmoManager.utilityLayer.utilityLayerScene;
        const canvasRect = this.renderingCanvas.getBoundingClientRect();
        const pickX = clientX - canvasRect.left;
        const pickY = clientY - canvasRect.top;
        if (pickX < 0 || pickY < 0 || pickX > canvasRect.width || pickY > canvasRect.height) {
            return false;
        }

        const pickInfo = utilityLayerScene.pick(pickX, pickY);
        return pickInfo?.hit === true && pickInfo.pickedMesh !== null;
    }
    private readonly onCanvasPointerDown = (event: PointerEvent) => {
        if (event.button === 0) {
            if (this.isBoneGizmoPointerInteractionActive(event.clientX, event.clientY)) {
                this.bonePickPointerDown = null;
                return;
            }
            this.bonePickPointerDown = {
                pointerId: event.pointerId,
                clientX: event.clientX,
                clientY: event.clientY,
            };
            return;
        }

        const dragMode = this.resolveCameraMouseDragMode(event);
        if (!dragMode) return;

        this.cameraMouseDragState = {
            pointerId: event.pointerId,
            mode: dragMode,
            lastClientX: event.clientX,
            lastClientY: event.clientY,
        };
        this.bonePickPointerDown = null;

        try {
            this.renderingCanvas.setPointerCapture(event.pointerId);
        } catch {
            // ignore capture errors
        }

        event.preventDefault();
    };
    private readonly onCanvasPointerMove = (event: PointerEvent) => {
        const dragState = this.cameraMouseDragState;
        if (!dragState || dragState.pointerId !== event.pointerId) return;

        const deltaX = event.clientX - dragState.lastClientX;
        const deltaY = event.clientY - dragState.lastClientY;
        dragState.lastClientX = event.clientX;
        dragState.lastClientY = event.clientY;

        this.applyCameraMouseDrag(dragState.mode, deltaX, deltaY);
        event.preventDefault();
    };
    private readonly onCanvasPointerUp = (event: PointerEvent) => {
        if (event.button === 0) {
            const pointerDown = this.bonePickPointerDown;
            this.bonePickPointerDown = null;
            if (!pointerDown || pointerDown.pointerId !== event.pointerId) return;
            if (this.isBoneGizmoPointerInteractionActive(event.clientX, event.clientY)) return;

            const movedDistance = Math.hypot(event.clientX - pointerDown.clientX, event.clientY - pointerDown.clientY);
            if (movedDistance > 6) return;

            this.tryPickBoneVisualizerAtClientPosition(event.clientX, event.clientY);
            return;
        }

        const dragState = this.cameraMouseDragState;
        if (!dragState || dragState.pointerId !== event.pointerId) return;

        this.cameraMouseDragState = null;
        try {
            this.renderingCanvas.releasePointerCapture(event.pointerId);
        } catch {
            // ignore capture errors
        }
        event.preventDefault();
    };
    private readonly onCanvasPointerCancel = (event?: PointerEvent) => {
        this.bonePickPointerDown = null;
        if (!event || !this.cameraMouseDragState || this.cameraMouseDragState.pointerId === event.pointerId) {
            this.cameraMouseDragState = null;
        }
    };
    private readonly onCanvasContextMenu = (event: MouseEvent) => {
        // Keep RMB drag available for camera control (MMD-like).
        event.preventDefault();
    };
    private readonly onCanvasMouseDown = (event: MouseEvent) => {
        // Suppress Chromium autoscroll so MMB drag behaves like MMD viewport pan.
        if (event.button === 1) {
            event.preventDefault();
        }
    };
    private readonly onCanvasAuxClick = (event: MouseEvent) => {
        if (event.button === 1) {
            event.preventDefault();
        }
    };
    private suspendSceneRenderCount = 0;

    private resolveCameraMouseDragMode(event: PointerEvent): "rotate" | "pan" | "zoom" | null {
        if (this.hasActiveCameraAnimation() && this._isPlaying) {
            return null;
        }
        if (event.button === 1) {
            return "pan";
        }

        if (event.button !== 2) {
            return null;
        }

        if (event.shiftKey) {
            return "pan";
        }

        if (event.ctrlKey || event.metaKey) {
            return "zoom";
        }

        return "rotate";
    }

    private applyCameraMouseDrag(mode: "rotate" | "pan" | "zoom", deltaX: number, deltaY: number): void {
        if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;

        if (mode === "rotate") {
            const sensibilityX = Math.max(80, this.camera.angularSensibilityX || 1000);
            const sensibilityY = Math.max(80, this.camera.angularSensibilityY || 1000);
            this.camera.alpha -= deltaX / sensibilityX;
            this.camera.beta -= deltaY / sensibilityY;
            if (this.camera.lowerBetaLimit !== null && this.camera.lowerBetaLimit !== undefined) {
                this.camera.beta = Math.max(this.camera.lowerBetaLimit, this.camera.beta);
            }
            if (this.camera.upperBetaLimit !== null && this.camera.upperBetaLimit !== undefined) {
                this.camera.beta = Math.min(this.camera.upperBetaLimit, this.camera.beta);
            }
        } else if (mode === "pan") {
            const forward = this.camera.target.subtract(this.camera.position);
            if (forward.lengthSquared() > 1e-8) {
                forward.normalize();
                const up = this.camera.upVector.clone();
                if (up.lengthSquared() < 1e-8) {
                    up.set(0, 1, 0);
                } else {
                    up.normalize();
                }
                let right = Vector3.Cross(forward, up);
                if (right.lengthSquared() < 1e-8) {
                    right = Vector3.Right();
                } else {
                    right.normalize();
                }
                const trueUp = Vector3.Cross(right, forward).normalize();
                const panScale = Math.max(0.001, this.camera.radius * 0.0014);
                const move = right.scale(deltaX * panScale).add(trueUp.scale(deltaY * panScale));
                this.camera.target.addInPlace(move);
                this.camera.position.addInPlace(move);
            }
        } else {
            const zoomScale = Math.max(0.01, this.camera.radius * 0.0045);
            this.camera.radius = this.clampCameraRadius(this.camera.radius + deltaY * zoomScale);
        }

        this.syncCameraRotationFromCurrentView();
        this.syncMmdCameraFromViewportCamera();
        this.updateOrthographicCameraBounds();
        this.onCameraTransformEdited?.();
    }

    private hasActiveCameraAnimation(): boolean {
        return this.cameraSourceAnimation !== null || this.cameraAnimationHandle !== null || this.hasCameraMotion;
    }

    private shouldApplyCameraMotionToViewport(): boolean {
        return this.hasActiveCameraAnimation() && (this._isPlaying || this.externalPlaybackSimulationEnabled);
    }

    private shouldSyncViewportCameraToMmdCamera(): boolean {
        if (!this.hasActiveCameraAnimation()) return true;
        if (this._isPlaying || this.externalPlaybackSimulationEnabled) return false;
        return this.timelineTarget === "camera";
    }

    private clampCameraRadius(radius: number): number {
        const lower = this.camera.lowerRadiusLimit ?? 0.1;
        const upper = this.camera.upperRadiusLimit ?? Number.POSITIVE_INFINITY;
        return Math.max(lower, Math.min(upper, radius));
    }

    // Callbacks
    public onFrameUpdate: ((frame: number, total: number) => void) | null = null;
    public onModelLoaded: ((info: ModelInfo) => void) | null = null;
    public onSceneModelLoaded: ((info: ModelInfo, totalCount: number, active: boolean) => void) | null = null;
    public onMotionLoaded: ((info: MotionInfo) => void) | null = null;
    public onCameraMotionLoaded: ((info: MotionInfo) => void) | null = null;
    public onKeyframesLoaded: ((tracks: KeyframeTrack[]) => void) | null = null;
    public onError: ((message: string) => void) | null = null;
    public onAudioLoaded: ((name: string) => void) | null = null;
    public onPhysicsStateChanged: ((enabled: boolean, available: boolean) => void) | null = null;
    public onBoneVisualizerBonePicked: ((boneName: string) => void) | null = null;
    public onBoneTransformEditStarted: ((boneName: string) => void) | null = null;
    public onBoneTransformEdited: ((boneName: string) => void) | null = null;
    public onBoneTransformEditCommitted: ((boneName: string) => void) | null = null;
    public onCameraTransformEdited: (() => void) | null = null;
    public onMaterialShaderStateChanged: (() => void) | null = null;
    public onGlobalIlluminationStateChanged: ((enabled: boolean) => void) | null = null;
    public onDofFocusTargetChanged: (() => void) | null = null;

    public getLoadedModels(): { index: number; name: string; path: string; active: boolean; castsShadow: boolean }[] {
        return this.sceneModels.map((entry, index) => ({
            index,
            name: entry.info.name,
            path: entry.info.path,
            active: entry.model === this.currentModel,
            castsShadow: entry.castShadow,
        }));
    }

    public getActiveModelInfo(): ModelInfo | null {
        return this.activeModelInfo;
    }

    public setModelMotionImports(model: RuntimeModel, imports: ProjectMotionImport[]): void {
        this.modelMotionImportsByModel.set(model, imports.map((item) => ({ ...item })));
    }

    public appendModelMotionImport(model: RuntimeModel, value: ProjectMotionImport): void {
        const current = this.modelMotionImportsByModel.get(model) ?? [];
        current.push({ ...value });
        this.modelMotionImportsByModel.set(model, current);
    }

    public isWgslMaterialShaderAssignmentAvailable(): boolean {
        return isWgslMaterialShaderAssignmentAvailableImpl(this);
    }

    public getWgslMaterialShaderPresets(): readonly WgslMaterialShaderPresetInfo[] {
        return getWgslMaterialShaderPresetsImpl(this) as readonly WgslMaterialShaderPresetInfo[];
    }

    public getPostEffectLutPresetOptions(): ReadonlyArray<{ id: string; label: string }> {
        return getPostEffectLutPresetOptionsImpl(this);
    }

    public getExternalWgslToonShaderPath(modelIndex?: number, materialKey: string | null = null): string | null {
        return getExternalWgslToonShaderPathImpl(this, modelIndex, materialKey);
    }

    public hasExternalWgslToonShader(modelIndex?: number, materialKey: string | null = null): boolean {
        return hasExternalWgslToonShaderImpl(this, modelIndex, materialKey);
    }

    public setExternalWgslToonShader(path: string | null, source: string | null): void {
        setExternalWgslToonShaderImpl(this, path, source);
    }

    public setExternalWgslToonShaderForModel(
        modelIndex: number,
        materialKey: string | null,
        path: string | null,
        source: string | null,
    ): boolean {
        return setExternalWgslToonShaderForModelImpl(this, modelIndex, materialKey, path, source);
    }

    public getWgslModelShaderStates(): WgslModelShaderInfo[] {
        return getWgslModelShaderStatesImpl(this);
    }

    public isMaterialVisible(material: MmdManagerMaterialLike | null | undefined): boolean {
        if (!material || typeof material !== "object") return true;
        return this.materialHiddenByMaterial.get(material as object) !== true;
    }

    public toggleModelMaterialVisibility(modelIndex: number, materialKey: string | null): boolean | null {
        const targetMaterial = this.findTargetSceneMaterials(modelIndex, materialKey)[0]?.material;
        if (!targetMaterial) {
            return null;
        }

        const nextVisible = !this.isMaterialVisible(targetMaterial);
        const ok = this.setModelMaterialVisibility(modelIndex, materialKey, nextVisible);
        return ok ? nextVisible : null;
    }

    public setModelMaterialVisibility(modelIndex: number, materialKey: string | null, visible: boolean): boolean {
        const targets = this.findTargetSceneMaterials(modelIndex, materialKey);
        if (targets.length === 0) {
            return false;
        }

        for (const target of targets) {
            this.setMaterialHiddenState(target.material, !visible);
        }

        syncLuminousGlowLayerImpl(this);
        this.onMaterialShaderStateChanged?.();
        return true;
    }

    public getSerializedMaterialShaderStates(entry: SceneModelEntry): ProjectModelMaterialShaderState[] {
        return getSerializedMaterialShaderStatesImpl(this, entry);
    }

    public setWgslMaterialShaderPreset(
        modelIndex: number,
        materialKey: string | null,
        presetId: WgslMaterialShaderPresetId,
    ): boolean {
        return setWgslMaterialShaderPresetImpl(this, modelIndex, materialKey, presetId);
    }

    private findTargetSceneMaterials(modelIndex: number, materialKey: string | null): SceneModelMaterialEntry[] {
        const entry = this.sceneModels[modelIndex];
        if (!entry) {
            return [];
        }

        if (materialKey === null) {
            return entry.materials;
        }

        return entry.materials.filter((materialEntry) => materialEntry.key === materialKey);
    }

    private getMaterialBaseAlpha(material: MmdManagerMaterialLike | null | undefined): number {
        if (!material || typeof material !== "object") {
            return 1;
        }

        const key = material as object;
        const cached = this.materialBaseAlphaByMaterial.get(key);
        if (cached !== undefined) {
            return cached;
        }

        const alpha = Number(material.alpha);
        const resolved = Number.isFinite(alpha) ? alpha : 1;
        this.materialBaseAlphaByMaterial.set(key, resolved);
        return resolved;
    }

    private setMaterialHiddenState(material: MmdManagerMaterialLike | null | undefined, hidden: boolean): void {
        if (!material || typeof material !== "object") {
            return;
        }

        const key = material as object;
        this.getMaterialBaseAlpha(material);

        if (hidden) {
            this.materialHiddenByMaterial.set(key, true);
        } else {
            this.materialHiddenByMaterial.delete(key);
        }

        if ("alpha" in material) {
            material.alpha = hidden ? 0 : this.getMaterialBaseAlpha(material);
        }

        const outlineDefaults = this.modelEdgeMaterialDefaults.get(key);
        if (hidden) {
            if ("renderOutline" in material) {
                material.renderOutline = false;
            }
            if ("outlineWidth" in material) {
                material.outlineWidth = 0;
            }
            if ("outlineAlpha" in material) {
                material.outlineAlpha = 0;
            }
        } else if (outlineDefaults && "renderOutline" in material && "outlineWidth" in material) {
            const enabled = outlineDefaults.enabled && this.modelEdgeWidthValue > 0;
            material.renderOutline = enabled;
            material.outlineWidth = enabled ? outlineDefaults.width * this.modelEdgeWidthValue : 0;
            if ("outlineAlpha" in material) {
                material.outlineAlpha = outlineDefaults.alpha;
            }
        }

        this.markMaterialShaderDirty(material);
    }

    private syncLuminousGlowLayer(): void {
        return syncLuminousGlowLayerImpl(this);
    }

    private markMaterialShaderDirty(material: MmdManagerMaterialLike | null | undefined): void {
        if (!material || typeof material !== "object") return;

        if (typeof material.markAsDirty === "function") {
            try {
                material.markAsDirty(Material.AllDirtyFlag);
                return;
            } catch {
                try {
                    material.markAsDirty();
                    return;
                } catch {
                    // ignore
                }
            }
        }

        if (typeof material._markAllSubMeshesAsTexturesDirty === "function") {
            material._markAllSubMeshesAsTexturesDirty();
        }
    }

    private applyImportedMaterialShaderStates(
        modelIndex: number,
        states: ProjectModelMaterialShaderState[] | undefined,
        warnings: string[],
        modelPath: string,
    ): void {
        applyImportedMaterialShaderStatesImpl(this, modelIndex, states, warnings, modelPath);
    }

    private getModelVisibility(mesh: MmdMesh): boolean {
        if (mesh.isEnabled() && mesh.isVisible) return true;

        for (const childMesh of mesh.getChildMeshes()) {
            if (childMesh.isEnabled() && childMesh.isVisible) {
                return true;
            }
        }

        return false;
    }

    public getActiveModelCastsShadow(): boolean {
        const entry = this.currentModel
            ? this.sceneModels.find((sceneModel) => sceneModel.model === this.currentModel)
            : null;
        return entry?.castShadow ?? false;
    }

    public getModelCastsShadow(entry: { castShadow?: boolean }): boolean {
        return entry.castShadow !== false;
    }

    public setModelCastsShadowByIndex(index: number, castShadow: boolean): boolean {
        const entry = this.sceneModels[index];
        if (!entry) return false;
        if (entry.castShadow === castShadow) return true;

        entry.castShadow = castShadow;
        this.applyModelShadowCasterState(entry);
        return true;
    }

    public setActiveModelCastsShadow(castShadow: boolean): boolean {
        if (!this.currentModel) return false;
        const index = this.sceneModels.findIndex((entry) => entry.model === this.currentModel);
        if (index < 0) return false;
        return this.setModelCastsShadowByIndex(index, castShadow);
    }

    private applyModelShadowCasterState(entry: SceneModelEntry): void {
        for (const mesh of entry.shadowCasterMeshes) {
            if (entry.castShadow) {
                this.shadowGenerator.addShadowCaster(mesh, true);
            } else {
                this.shadowGenerator.removeShadowCaster(mesh, true);
            }
        }
    }

    private createConfiguredShadowGenerator(dirLight: DirectionalLight): ShadowGenerator {
        const maxTextureSize = this.engine.getCaps().maxTextureSize ?? 4096;
        const shadowMapSize = Math.min(8192, maxTextureSize);
        const shadowGenerator = CascadedShadowGenerator.IsSupported
            ? new CascadedShadowGenerator(shadowMapSize, dirLight, undefined, this.camera)
            : new ShadowGenerator(shadowMapSize, dirLight);

        if (shadowGenerator instanceof CascadedShadowGenerator) {
            shadowGenerator.numCascades = 2;
            shadowGenerator.stabilizeCascades = true;
            shadowGenerator.lambda = 0.82;
            shadowGenerator.cascadeBlendPercentage = 0.05;
            shadowGenerator.autoCalcDepthBounds = true;
            shadowGenerator.shadowMaxZ = this.shadowMaxZValue;
            dirLight.shadowFrustumSize = DEFAULT_CSM_FRUSTUM_SIZE;
            dirLight.shadowMaxZ = this.shadowMaxZValue;
        }

        shadowGenerator.usePercentageCloserFiltering = true;
        shadowGenerator.filteringQuality = this.shadowFilteringQualityValue;
        shadowGenerator.useContactHardeningShadow = false;

        shadowGenerator.bias = this.shadowBiasValue;
        shadowGenerator.normalBias = this.shadowNormalBiasValue;
        shadowGenerator.frustumEdgeFalloff = 0.26;
        shadowGenerator.transparencyShadow = true;
        shadowGenerator.enableSoftTransparentShadow = this.softTransparentShadowEnabledValue;
        shadowGenerator.useOpacityTextureForTransparentShadow = true;
        shadowGenerator.darkness = this.shadowEnabled ? this.shadowDarknessValue : 0;
        return shadowGenerator;
    }

    public getActiveModelVisibility(): boolean {
        if (!this.currentMesh) return false;
        if (this.currentMesh.isEnabled() && this.currentMesh.isVisible) return true;

        for (const childMesh of this.currentMesh.getChildMeshes()) {
            if (childMesh.isEnabled() && childMesh.isVisible) {
                return true;
            }
        }

        return false;
    }

    public setActiveModelVisibility(visible: boolean): boolean {
        if (!this.currentMesh) return false;

        this.applySceneMeshVisibility(this.currentMesh, visible);

        this.syncBoneVisualizerVisibility();
        this.syncRigidBodyVisualizerVisibility();
        this.updateBoneGizmoTarget();
        return visible;
    }

    private applySceneMeshVisibility(mesh: MmdMesh, visible: boolean): void {
        mesh.setEnabled(visible);
        mesh.isVisible = visible;

        for (const childMesh of mesh.getChildMeshes()) {
            childMesh.setEnabled(visible);
            childMesh.isVisible = visible;
        }
    }

    public toggleActiveModelVisibility(): boolean {
        const next = !this.getActiveModelVisibility();
        this.setActiveModelVisibility(next);
        return next;
    }

    public removeActiveModel(): boolean {
        if (!this.currentModel || !this.currentMesh) return false;

        const removeIndex = this.sceneModels.findIndex((entry) => entry.model === this.currentModel);
        if (removeIndex < 0) return false;

        const removed = this.sceneModels[removeIndex];
        removed.castShadow = false;
        this.applyModelShadowCasterState(removed);

        try {
            this.mmdRuntime.destroyMmdModel(removed.model as never);
        } catch {
            // no-op
        }

        this.removeGlobalIlluminationSceneModel(removed);
        this.modelKeyframeTracksByModel.delete(removed.model);
        this.modelSourceAnimationsByModel.delete(removed.model);
        this.modelMotionImportsByModel.delete(removed.model);
        this.disposeContactShadowForModel(removed);
        removed.mesh.dispose();
        this.sceneModels.splice(removeIndex, 1);
        this.syncLuminousGlowLayer();

        if (this.sceneModels.length === 0) {
            this.currentMesh = null;
            this.currentModel = null;
            this.activeModelInfo = null;
        } else {
            const nextIndex = Math.min(removeIndex, this.sceneModels.length - 1);
            const nextModel = this.sceneModels[nextIndex];
            this.currentMesh = nextModel.mesh;
            this.currentModel = nextModel.model;
            this.activeModelInfo = nextModel.info;
            this.timelineTarget = "model";
            this.onModelLoaded?.(nextModel.info);
        }

        this.refreshBoneVisualizerTarget();
        this.refreshRigidBodyVisualizerTarget();
        this.updateBoneGizmoTarget();
        this.emitMergedKeyframeTracks();
        return true;
    }
    public setActiveModelByIndex(index: number): boolean {
        const target = this.sceneModels[index];
        if (!target) return false;

        this.currentMesh = target.mesh;
        this.currentModel = target.model;
        this.activeModelInfo = target.info;
        this.timelineTarget = "model";
        this.refreshBoneVisualizerTarget();
        this.refreshRigidBodyVisualizerTarget();
        this.updateBoneGizmoTarget();
        this.onModelLoaded?.(target.info);
        this.emitMergedKeyframeTracks();
        return true;
    }

    public getDofFocusTargetModelPath(): string | null {
        return this.dofFocusTargetModelPathValue;
    }

    public getDofFocusTargetBoneName(): string | null {
        return this.dofFocusTargetBoneNameValue;
    }

    public setDofFocusTargetByIndex(index: number | null, boneName: string | null): void {
        if (index === null || !Number.isInteger(index) || index < 0 || index >= this.sceneModels.length) {
            this.setDofFocusTargetByPath(null, null);
            return;
        }
        this.setDofFocusTargetByPath(this.sceneModels[index]?.info.path ?? null, boneName);
    }

    public setDofFocusTargetByPath(modelPath: string | null, boneName: string | null): void {
        const nextModelPath = typeof modelPath === "string" && modelPath.length > 0 ? modelPath : null;
        const entry = nextModelPath !== null ? this.findSceneModelEntryByPath(nextModelPath) : null;
        let nextBoneName = typeof boneName === "string" && boneName.length > 0 ? boneName : null;

        if (entry) {
            const boneNames = Array.isArray(entry.info.boneNames) ? entry.info.boneNames : [];
            if (nextBoneName === null || !boneNames.includes(nextBoneName)) {
                nextBoneName = this.findPreferredDofFocusBoneName(boneNames) ?? boneNames[0] ?? null;
            }
        } else {
            nextBoneName = null;
        }

        const changed =
            this.dofFocusTargetModelPathValue !== nextModelPath ||
            this.dofFocusTargetBoneNameValue !== nextBoneName;

        this.dofFocusTargetModelPathValue = nextModelPath;
        this.dofFocusTargetBoneNameValue = nextBoneName;

        if (this.dofAutoFocusEnabled) {
            this.dofFocusDistanceMmValue = this.getDofAutoFocusDistanceMm();
            this.updateEditorDofFocusAndFStop();
        }

        if (changed) {
            this.onDofFocusTargetChanged?.();
        }
    }

    public setTimelineTarget(target: "model" | "camera"): void {
        this.timelineTarget = target;
        if (target === "camera" && this.hasActiveCameraAnimation() && !this._isPlaying) {
            this.syncViewportCameraFromMmdCamera();
        }
        this.syncBoneVisualizerVisibility();
        this.syncRigidBodyVisualizerVisibility();
        this.updateBoneGizmoTarget();
        this.emitMergedKeyframeTracks();
    }
    public getTimelineTarget(): "model" | "camera" {
        return this.timelineTarget;
    }

    public isGlobalIlluminationEnabled(): boolean {
        return this.globalIlluminationController?.isEnabled() ?? false;
    }

    public isGlobalIlluminationPending(): boolean {
        return this.globalIlluminationController?.isPending() ?? false;
    }

    public setGlobalIlluminationEnabled(enabled: boolean): boolean {
        return this.globalIlluminationController?.setEnabled(enabled) ?? false;
    }

    public toggleGlobalIlluminationEnabled(): boolean {
        return this.globalIlluminationController?.toggleEnabled() ?? false;
    }

    public syncGlobalIlluminationSceneModels(): void {
        this.globalIlluminationController?.syncSceneModels();
    }

    public removeGlobalIlluminationSceneModel(sceneModel: { mesh: Mesh }): void {
        this.globalIlluminationController?.removeSceneModel(sceneModel);
    }

    public refreshGlobalIlluminationLightParameters(): void {
        this.globalIlluminationController?.updateLightParameters();
    }

    public isIblShadowsEnabled(): boolean {
        return this.iblShadowsEnabledValue;
    }

    public setIblShadowsEnabled(enabled: boolean): boolean {
        // Keep old project data and debug code readable, but do not instantiate
        // the rejected IBL Shadows pipeline in normal builds.
        if (!IBL_SHADOWS_EXPERIMENT_ENABLED) {
            this.iblShadowsEnabledValue = false;
            this.iblShadowsPipeline?.toggleShadow(false);
            return false;
        }

        this.iblShadowsEnabledValue = Boolean(enabled);

        if (!this.iblShadowsEnabledValue) {
            this.iblShadowsPipeline?.toggleShadow(false);
            return true;
        }

        if (!this.ensureIblShadowsPipeline()) {
            this.iblShadowsEnabledValue = false;
            return false;
        }

        this.iblShadowsPipeline?.toggleShadow(true);
        this.applyIblShadowDebugSettings();
        this.syncIblShadowsScene();
        return true;
    }

    public toggleIblShadowsEnabled(): boolean {
        this.setIblShadowsEnabled(!this.iblShadowsEnabledValue);
        return this.iblShadowsEnabledValue;
    }

    public get iblShadowOpacity(): number {
        return this.iblShadowOpacityValue;
    }

    public set iblShadowOpacity(value: number) {
        const next = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.25));
        this.iblShadowOpacityValue = next;
        if (this.iblShadowsPipeline) {
            this.iblShadowsPipeline.shadowOpacity = next;
            this.iblShadowsPipeline.resetAccumulation();
        }
    }

    public get iblShadowDistanceScale(): number {
        return this.iblShadowDistanceScaleValue;
    }

    public set iblShadowDistanceScale(value: number) {
        const next = Math.max(0.5, Math.min(12, Number.isFinite(value) ? value : 4));
        this.iblShadowDistanceScaleValue = next;
        if (this.iblShadowsPipeline) {
            this.iblShadowsPipeline.ssShadowDistanceScale = next;
            this.iblShadowsPipeline.resetAccumulation();
        }
    }

    public syncIblShadowsScene(): void {
        if (!this.iblShadowsEnabledValue || !this.iblShadowsPipeline) return;

        this.applyIblShadowDebugSettings();
        const castingMeshes = this.collectIblShadowCastingMeshes();
        this.iblShadowsPipeline.clearShadowCastingMeshes();
        if (castingMeshes.length > 0) {
            this.iblShadowsPipeline.addShadowCastingMesh(castingMeshes);
        }

        this.iblShadowsPipeline.clearShadowReceivingMaterials();
        this.iblShadowsPipeline.addShadowReceivingMaterial();
        this.iblShadowsPipeline.shadowOpacity = this.iblShadowOpacityValue;

        if (castingMeshes.length === 0) {
            this.iblShadowsPipeline.resetAccumulation();
            return;
        }

        try {
            this.iblShadowsPipeline.updateSceneBounds();
            logInfo("render", "IBL Shadows scene bounds updated", {
                casterCount: castingMeshes.length,
                voxelGridSize: this.iblShadowsPipeline.voxelGridSize,
            });
            this.iblShadowsPipeline.updateVoxelization();
            this.iblShadowsPipeline.resetAccumulation();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            logWarn("render", "IBL Shadows voxel update failed", { message });
            this.onError?.(`IBL Shadows update failed: ${message}`);
        }
    }

    private ensureIblShadowsPipeline(): boolean {
        if (this.iblShadowsPipeline) return true;

        if (!IblShadowsRenderPipeline.IsSupported) {
            this.onError?.("IBL Shadows are not supported by this engine.");
            return false;
        }

        this.ensureFallbackIblEnvironmentTexture();

        try {
            this.prepareIblCdfSourceForWebGpuBeforePipelineCreation();
            this.iblShadowsPipeline = new IblShadowsRenderPipeline(
                "MmdModokiIblShadows",
                this.scene,
                {
                    resolutionExp: 5,
                    sampleDirections: 8,
                    shadowOpacity: this.iblShadowOpacityValue,
                    shadowRenderSizeFactor: 0.35,
                    shadowRemanence: 0.9,
                    ssShadowsEnabled: false,
                    ssShadowSampleCount: 8,
                    ssShadowStride: 12,
                    ssShadowDistanceScale: Math.min(this.iblShadowDistanceScaleValue, 2),
                    triPlanarVoxelization: true,
                    voxelShadowOpacity: 1,
                },
                [this.camera],
            );
            this.configureIblCdfSourceForWebGpu();
            this.iblShadowsPipeline.toggleShadow(this.iblShadowsEnabledValue);
            this.applyIblShadowDebugSettings();
            this.iblShadowsPipeline.onVoxelizationCompleteObservable.add(() => {
                logInfo("render", "IBL Shadows voxelization complete", {
                    voxelGridSize: this.iblShadowsPipeline?.voxelGridSize ?? 0,
                });
            });
            return true;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            logWarn("render", "IBL Shadows initialization failed", { message });
            this.onError?.(`IBL Shadows initialization failed: ${message}`);
            this.iblShadowsPipeline = null;
            return false;
        }
    }

    private shouldUseEnvironmentCdfForIblShadows(): boolean {
        try {
            const raw = globalThis.localStorage?.getItem("mmd_modoki.iblShadowUseEnvironmentCdf") ?? "";
            return raw === "1" || raw.toLowerCase() === "true";
        } catch {
            return false;
        }
    }

    private shouldUseIblWebGpuCdfFallback(): boolean {
        return this.engine instanceof WebGPUEngine && !this.shouldUseEnvironmentCdfForIblShadows();
    }

    private ensureIblWebGpuCdfFallbackTexture(): RawTexture {
        if (!this.iblWebGpuCdfFallbackTexture) {
            this.iblWebGpuCdfFallbackTexture = new RawTexture(
                new Uint8Array([255, 255, 255, 255]),
                1,
                1,
                Engine.TEXTUREFORMAT_RGBA,
                this.scene,
                false,
                false,
                Texture.NEAREST_SAMPLINGMODE,
                Engine.TEXTURETYPE_UNSIGNED_BYTE,
            );
            this.iblWebGpuCdfFallbackTexture.name = "mmdModokiIblWebGpuCdfFallback";
            this.iblWebGpuCdfFallbackTexture.gammaSpace = false;
        }
        return this.iblWebGpuCdfFallbackTexture;
    }

    private prepareIblCdfSourceForWebGpuBeforePipelineCreation(): void {
        if (!this.shouldUseIblWebGpuCdfFallback()) return;

        const fallbackTexture = this.ensureIblWebGpuCdfFallbackTexture();
        if (this.scene.environmentTexture !== fallbackTexture) {
            this.iblWebGpuSuppressedEnvironmentTexture = this.scene.environmentTexture;
            this.scene.environmentTexture = fallbackTexture;
        }
        logInfo("render", "IBL Shadows using WebGPU CDF fallback texture", {
            reason: "avoid r32float mipmap validation errors",
            timing: "before pipeline creation",
        });
    }

    private configureIblCdfSourceForWebGpu(): void {
        if (!this.shouldUseIblWebGpuCdfFallback()) return;

        const cdfGenerator = this.scene.iblCdfGenerator;
        if (!cdfGenerator) return;

        cdfGenerator.iblSource = this.ensureIblWebGpuCdfFallbackTexture();
    }

    private getIblShadowDebugPasses(): Set<string> {
        try {
            const raw = globalThis.localStorage?.getItem("mmd_modoki.iblShadowDebugPasses") ?? "";
            return new Set(raw.split(/[\s,]+/).map((value) => value.trim().toLowerCase()).filter(Boolean));
        } catch {
            return new Set<string>();
        }
    }

    private applyIblShadowDebugSettings(): void {
        if (!this.iblShadowsPipeline) return;

        const passes = this.getIblShadowDebugPasses();
        const all = passes.has("all") || passes.has("1") || passes.has("true");
        const includesPass = (...names: string[]): boolean => all || names.some((name) => passes.has(name));
        const gbuffer = includesPass("gbuffer", "g-buffer");
        const cdf = includesPass("cdf");
        const voxel = includesPass("voxel", "voxels");
        const tracing = includesPass("trace", "tracing", "voxel-tracing");
        const blur = includesPass("blur", "spatial-blur");
        const accumulation = includesPass("accum", "accumulation");
        const enabled = gbuffer || cdf || voxel || tracing || blur || accumulation;

        this.iblShadowsPipeline.allowDebugPasses = enabled;
        this.iblShadowsPipeline.gbufferDebugEnabled = gbuffer;
        this.iblShadowsPipeline.cdfDebugEnabled = cdf;
        this.iblShadowsPipeline.voxelDebugEnabled = voxel;
        this.iblShadowsPipeline.voxelTracingDebugEnabled = tracing;
        this.iblShadowsPipeline.spatialBlurPassDebugEnabled = blur;
        this.iblShadowsPipeline.accumulationPassDebugEnabled = accumulation;

        const signature = enabled ? [...passes].sort().join(",") || "all" : "";
        if (signature !== this.iblShadowDebugPassSignature) {
            this.iblShadowDebugPassSignature = signature;
            if (enabled) {
                logInfo("render", "IBL Shadows debug passes enabled", { passes: signature });
            }
        }
    }

    private ensureFallbackIblEnvironmentTexture(): void {
        if (this.scene.environmentTexture) return;
        if (!this.iblFallbackEnvironmentTexture) {
            const face = new Uint8Array([190, 190, 190]);
            this.iblFallbackEnvironmentTexture = new RawCubeTexture(
                this.scene,
                [face.slice(), face.slice(), face.slice(), face.slice(), face.slice(), face.slice()],
                1,
                Engine.TEXTUREFORMAT_RGB,
                Engine.TEXTURETYPE_UNSIGNED_BYTE,
                false,
                false,
                Texture.TRILINEAR_SAMPLINGMODE,
            );
            this.iblFallbackEnvironmentTexture.name = "mmdModokiIblFallbackEnvironment";
            this.iblFallbackEnvironmentTexture.gammaSpace = false;
            this.iblFallbackEnvironmentTexture.coordinatesMode = Texture.CUBIC_MODE;
        }
        this.scene.environmentTexture = this.iblFallbackEnvironmentTexture;
    }

    private configureIblTestEnvironmentTexture(): void {
        if (!IBL_SHADOWS_EXPERIMENT_ENABLED) return;
        if (this.scene.environmentTexture) return;

        try {
            this.iblTestEnvironmentTexture = new HDRCubeTexture(
                iblShadowTestEnvironmentUrl,
                this.scene,
                128,
                false,
                true,
                false,
                false,
                () => {
                    logInfo("render", "IBL test environment texture loaded", {
                        url: iblShadowTestEnvironmentUrl,
                        name: this.iblTestEnvironmentTexture?.name ?? "iblShadowTestEnvironment",
                    });
                },
                (message, exception) => {
                    logWarn("render", "IBL test environment texture failed", {
                        message: message ?? "unknown",
                        exception: exception instanceof Error ? exception.message : String(exception ?? ""),
                    });
                },
            );
            this.iblTestEnvironmentTexture.name = "iblShadowTestEnvironment";
            this.iblTestEnvironmentTexture.gammaSpace = false;
            this.iblTestEnvironmentTexture.coordinatesMode = Texture.CUBIC_MODE;
            this.scene.environmentTexture = this.iblTestEnvironmentTexture;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            logWarn("render", "IBL test environment texture initialization failed", { message });
            this.iblTestEnvironmentTexture = null;
        }
    }

    private collectIblShadowCastingMeshes(): Mesh[] {
        const meshes: Mesh[] = [];
        const seen = new Set<Mesh>();
        const addMesh = (mesh: unknown): void => {
            if (!(mesh instanceof Mesh)) return;
            if (seen.has(mesh)) return;
            if (mesh.isDisposed()) return;
            if (!mesh.isEnabled() || !mesh.isVisible) return;
            if (mesh.skeleton) return;
            if ((mesh.getTotalVertices?.() ?? 0) <= 0) return;
            seen.add(mesh);
            meshes.push(mesh);
        };

        for (const entry of this.sceneModels) {
            if (entry.castShadow === false) continue;
            for (const mesh of entry.shadowCasterMeshes) {
                addMesh(mesh);
            }
        }

        const accessoryMeshes = (this as unknown as { getIblShadowAccessoryMeshes?: () => unknown[] }).getIblShadowAccessoryMeshes?.() ?? [];
        for (const mesh of accessoryMeshes) {
            addMesh(mesh);
        }

        return meshes;
    }

    public get characterContactShadowEnabled(): boolean {
        return this.characterContactShadowEnabledValue;
    }

    public set characterContactShadowEnabled(enabled: boolean) {
        this.characterContactShadowEnabledValue = Boolean(enabled);
        this.updateCharacterContactShadows();
    }

    public get characterContactShadowOpacity(): number {
        return this.characterContactShadowOpacityValue;
    }

    public set characterContactShadowOpacity(value: number) {
        this.characterContactShadowOpacityValue = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.35));
        this.updateCharacterContactShadows();
    }

    public get characterContactShadowScale(): number {
        return this.characterContactShadowScaleValue;
    }

    public set characterContactShadowScale(value: number) {
        this.characterContactShadowScaleValue = Math.max(0.5, Math.min(3, Number.isFinite(value) ? value : 1));
        this.updateCharacterContactShadows();
    }

    private ensureContactShadowMaterial(): StandardMaterial {
        if (this.contactShadowMaterial) return this.contactShadowMaterial;

        const texture = new Texture(blobShadowTextureUrl, this.scene, false, false, Texture.TRILINEAR_SAMPLINGMODE);
        texture.name = "characterContactBlobShadowTexture";
        texture.hasAlpha = true;
        texture.wrapU = Texture.CLAMP_ADDRESSMODE;
        texture.wrapV = Texture.CLAMP_ADDRESSMODE;

        const material = new StandardMaterial("characterContactShadowMaterial", this.scene);
        material.diffuseTexture = texture;
        material.useAlphaFromDiffuseTexture = true;
        material.diffuseColor = new Color3(0, 0, 0);
        material.emissiveColor = new Color3(0, 0, 0);
        material.specularColor = new Color3(0, 0, 0);
        material.disableLighting = true;
        material.backFaceCulling = false;
        material.transparencyMode = Material.MATERIAL_ALPHABLEND;
        material.useLogarithmicDepth = true;
        material.disableDepthWrite = true;
        material.zOffset = -1;
        material.zOffsetUnits = -4;
        material.alpha = 1;

        this.contactShadowBlobTexture = texture;
        this.contactShadowMaterial = material;
        return material;
    }

    private ensureContactShadowMesh(entry: SceneModelEntry, kind: ContactShadowBlobKind): Mesh {
        if (kind === "body" && entry.contactShadowMesh && !entry.contactShadowMesh.isDisposed()) {
            return entry.contactShadowMesh;
        }

        const blobMeshes = this.contactShadowMeshesByModel.get(entry) ?? {};
        const existing = blobMeshes[kind];
        if (existing && !existing.isDisposed()) {
            return existing;
        }

        const mesh = CreateGround(
            `characterContactShadow:${kind}:${entry.info.name}`,
            { width: 1, height: 1, subdivisions: 1, updatable: false },
            this.scene,
        );
        mesh.material = this.ensureContactShadowMaterial();
        mesh.isPickable = false;
        mesh.receiveShadows = false;
        mesh.doNotSyncBoundingInfo = true;
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.alphaIndex = 10;
        mesh.setEnabled(false);
        if (kind === "body") {
            entry.contactShadowMesh = mesh;
        }
        blobMeshes[kind] = mesh;
        this.contactShadowMeshesByModel.set(entry, blobMeshes);
        return mesh;
    }

    private disposeContactShadowForModel(entry: SceneModelEntry): void {
        const blobMeshes = this.contactShadowMeshesByModel.get(entry);
        if (blobMeshes) {
            for (const mesh of Object.values(blobMeshes)) {
                mesh?.dispose();
            }
            this.contactShadowMeshesByModel.delete(entry);
        } else {
            entry.contactShadowMesh?.dispose();
        }
        entry.contactShadowMesh = null;
    }

    private hideContactShadowMeshes(entry: SceneModelEntry): void {
        const blobMeshes = this.contactShadowMeshesByModel.get(entry);
        if (blobMeshes) {
            for (const mesh of Object.values(blobMeshes)) {
                mesh?.setEnabled(false);
            }
            return;
        }
        entry.contactShadowMesh?.setEnabled(false);
    }

    private getContactShadowBoneWorldPosition(entry: SceneModelEntry, candidates: readonly string[]): Vector3 | null {
        for (const boneName of candidates) {
            const runtimeBone = this.getRuntimeBoneByNameFromModel(entry.model, boneName);
            if (!runtimeBone) continue;
            const worldMatrix = Matrix.Identity();
            const worldPosition = Vector3.Zero();
            runtimeBone.getWorldMatrixToRef(worldMatrix);
            worldMatrix.getTranslationToRef(worldPosition);
            if (Number.isFinite(worldPosition.x) && Number.isFinite(worldPosition.y) && Number.isFinite(worldPosition.z)) {
                return worldPosition;
            }
        }
        return null;
    }

    private collectContactShadowTargets(entry: SceneModelEntry, bounds: { min: Vector3; max: Vector3 }): ContactShadowTarget[] {
        const min = bounds.min;
        const max = bounds.max;
        const modelWidth = Math.max(0.1, max.x - min.x);
        const modelDepth = Math.max(0.1, max.z - min.z);
        const targets: ContactShadowTarget[] = [];
        const leftFoot = this.getContactShadowBoneWorldPosition(entry, ["左足首", "左足", "左つま先", "左足ＩＫ", "左足IK", "左つま先ＩＫ", "左つま先IK"]);
        const rightFoot = this.getContactShadowBoneWorldPosition(entry, ["右足首", "右足", "右つま先", "右足ＩＫ", "右足IK", "右つま先ＩＫ", "右つま先IK"]);
        const footWidth = Math.max(1.1, Math.min(3.6, modelWidth * 0.72 * this.characterContactShadowScaleValue));
        const footDepth = Math.max(0.9, Math.min(3.0, modelDepth * 0.62 * this.characterContactShadowScaleValue));

        if (leftFoot) {
            targets.push({ kind: "leftFoot", position: leftFoot, width: footWidth, depth: footDepth, opacityScale: 1 });
        }
        if (rightFoot) {
            targets.push({ kind: "rightFoot", position: rightFoot, width: footWidth, depth: footDepth, opacityScale: 1 });
        }

        return targets;
    }

    private updateCharacterContactShadows(): void {
        const enabled = this.characterContactShadowEnabledValue && this.sceneModels.length > 0;
        for (const entry of this.sceneModels) {
            if (!enabled || !this.getModelVisibility(entry.mesh)) {
                this.hideContactShadowMeshes(entry);
                continue;
            }

            let vectors: { min: Vector3; max: Vector3 };
            try {
                vectors = entry.mesh.getHierarchyBoundingVectors(true);
            } catch {
                this.hideContactShadowMeshes(entry);
                continue;
            }

            const groundY = this.ground?.position.y ?? 0;
            const targets = this.collectContactShadowTargets(entry, vectors);
            const visibleKinds = new Set<ContactShadowBlobKind>();
            const maxDistance = 5.0;
            const liftAboveFloor = 0.018;
            const footTargets = targets.filter((target) => target.kind === "leftFoot" || target.kind === "rightFoot");
            const footOverlapScale = new Map<ContactShadowBlobKind, number>();
            if (footTargets.length >= 2) {
                const [first, second] = footTargets;
                const dx = first.position.x - second.position.x;
                const dz = first.position.z - second.position.z;
                const centerDistance = Math.sqrt(dx * dx + dz * dz);
                const overlapDistance = Math.max(0.1, (first.width + second.width + first.depth + second.depth) * 0.18);
                const overlap = Math.max(0, Math.min(1, 1 - centerDistance / overlapDistance));
                const scale = 1 - overlap * 0.45;
                footOverlapScale.set(first.kind, scale);
                footOverlapScale.set(second.kind, scale);
            }

            for (const target of targets) {
                if (!Number.isFinite(target.width) || !Number.isFinite(target.depth)) continue;
                const distance = Math.max(0, target.position.y - groundY);
                const t = Math.max(0, Math.min(1, 1 - distance / maxDistance));
                const heightFade = Math.pow(t, 1.25);
                const overlapOpacityScale = footOverlapScale.get(target.kind) ?? 1;
                const opacity = this.characterContactShadowOpacityValue * target.opacityScale * heightFade * overlapOpacityScale;
                const mesh = this.ensureContactShadowMesh(entry, target.kind);
                mesh.position.set(target.position.x, groundY + liftAboveFloor, target.position.z);
                mesh.scaling.set(target.width, 1, target.depth);
                mesh.visibility = opacity;
                mesh.setEnabled(opacity > 0.001);
                visibleKinds.add(target.kind);
            }

            const blobMeshes = this.contactShadowMeshesByModel.get(entry);
            if (blobMeshes) {
                for (const [kind, mesh] of Object.entries(blobMeshes) as Array<[ContactShadowBlobKind, Mesh | undefined]>) {
                    if (!visibleKinds.has(kind)) {
                        mesh?.setEnabled(false);
                    }
                }
            }
        }
    }

    private ensureMirroringFloor(): Mesh {
        if (this.mirroringFloor && !this.mirroringFloor.isDisposed()) {
            return this.mirroringFloor;
        }

        const mirrorTexture = new MirrorTexture(
            "mirroringFloorTexture",
            this.mirroringFloorResolutionValue,
            this.scene,
            true,
            undefined,
            Texture.TRILINEAR_SAMPLINGMODE,
            true,
        );
        mirrorTexture.name = "mirroringFloorTexture";
        mirrorTexture.wrapU = Texture.CLAMP_ADDRESSMODE;
        mirrorTexture.wrapV = Texture.CLAMP_ADDRESSMODE;
        mirrorTexture.blurKernel = 2;

        const material = new StandardMaterial("mirroringFloorMaterial", this.scene);
        material.reflectionTexture = mirrorTexture;
        material.diffuseColor = new Color3(0.04, 0.04, 0.04);
        material.ambientColor = new Color3(0, 0, 0);
        material.emissiveColor = new Color3(0, 0, 0);
        material.specularColor = new Color3(0, 0, 0);
        material.backFaceCulling = false;
        material.transparencyMode = Material.MATERIAL_ALPHABLEND;
        material.useLogarithmicDepth = true;
        material.disableDepthWrite = true;
        material.zOffset = -2;
        material.zOffsetUnits = -8;

        const floor = CreateGround(
            "mirroringFloor",
            { width: 1, height: 1, subdivisions: 1, updatable: false },
            this.scene,
        );
        floor.material = material;
        floor.isPickable = false;
        floor.receiveShadows = false;
        floor.alphaIndex = 8;

        this.mirroringFloorTexture = mirrorTexture;
        this.mirroringFloorMaterial = material;
        this.mirroringFloor = floor;
        this.applyMirroringFloorTransform();
        this.applyMirroringFloorMirrorPlane();
        this.applyMirroringFloorMaterialState();
        this.updateMirroringFloorRenderList();
        return floor;
    }

    private applyMirroringFloorTransform(): void {
        if (!this.mirroringFloor) return;
        const size = this.mirroringFloorSizeValue;
        this.mirroringFloor.position.set(0, this.mirroringFloorHeightValue + 0.006, 0);
        this.mirroringFloor.scaling.set(size, 1, size);
    }

    private applyMirroringFloorMirrorPlane(): void {
        if (!this.mirroringFloorTexture) return;
        this.mirroringFloorTexture.mirrorPlane = new Plane(0, -1, 0, this.mirroringFloorHeightValue);
    }

    private applyMirroringFloorMaterialState(): void {
        if (!this.mirroringFloorMaterial || !this.mirroringFloorTexture) return;
        const reflectance = this.mirroringFloorReflectanceValue;
        this.mirroringFloorMaterial.alpha = reflectance;
        this.mirroringFloorTexture.level = 1;
    }

    private collectMirroringFloorRenderMeshes(): Mesh[] {
        const meshes: Mesh[] = [];
        const seen = new Set<Mesh>();
        const addMesh = (mesh: unknown): void => {
            if (!(mesh instanceof Mesh)) return;
            if (seen.has(mesh)) return;
            if (mesh === this.ground || mesh === this.skydome || mesh === this.mirroringFloor) return;
            if (mesh.name.startsWith("characterContactShadow:")) return;
            if (mesh.isDisposed()) return;
            if (!mesh.isEnabled() || !mesh.isVisible) return;
            if ((mesh.getTotalVertices?.() ?? 0) <= 0) return;
            seen.add(mesh);
            meshes.push(mesh);
        };

        for (const entry of this.sceneModels) {
            if (!this.getModelVisibility(entry.mesh)) continue;
            addMesh(entry.mesh);
            for (const mesh of entry.mesh.getChildMeshes(false)) {
                addMesh(mesh);
            }
        }

        return meshes;
    }

    private updateMirroringFloorRenderList(): void {
        if (!this.mirroringFloorTexture) return;
        this.mirroringFloorTexture.renderList = this.collectMirroringFloorRenderMeshes();
    }

    private syncMirroringFloorState(): void {
        if (!this.mirroringFloorEnabledValue) {
            this.mirroringFloor?.setEnabled(false);
            return;
        }

        const floor = this.ensureMirroringFloor();
        floor.setEnabled(true);
        this.applyMirroringFloorTransform();
        this.applyMirroringFloorMirrorPlane();
        this.applyMirroringFloorMaterialState();
        this.updateMirroringFloorRenderList();
    }

    private disposeMirroringFloorResources(): void {
        this.mirroringFloor?.dispose();
        this.mirroringFloor = null;
        this.mirroringFloorMaterial?.dispose();
        this.mirroringFloorMaterial = null;
        this.mirroringFloorTexture?.dispose();
        this.mirroringFloorTexture = null;
    }

    public setBoneVisualizerSelectedBone(boneName: string | null): void {
        this.boneVisualizerSelectedBoneName = boneName && boneName.length > 0 ? boneName : null;
        this.updateBoneGizmoTarget();
    }

    public setCaptureEditorOverlaysSuppressed(suppressed: boolean): void {
        if (this.captureEditorOverlaysSuppressed === suppressed) return;
        this.captureEditorOverlaysSuppressed = suppressed;
        this.syncBoneVisualizerVisibility();
    }

    private updateBoneGizmoTarget(): void {
        return updateBoneGizmoTargetImpl(this);
    }

    private resetBoneGizmoInteraction(): void {
        return resetBoneGizmoInteractionImpl(this);
    }

    private initializeBoneGizmoSystem(): void {
        return initializeBoneGizmoSystemImpl(this);
    }

    private handleBoneGizmoBeforeRender(): void {
        return handleBoneGizmoBeforeRenderImpl(this);
    }

    private disposeBoneGizmoSystem(): void {
        return disposeBoneGizmoSystemImpl(this);
    }

    private refreshBoneVisualizerTarget(): void {
        return refreshBoneVisualizerTargetImpl(this);
    }

    private updateBoneVisualizer(): void {
        return updateBoneVisualizerImpl(this);
    }

    private refreshRigidBodyVisualizerTarget(): void {
        return refreshRigidBodyVisualizerTargetImpl(this);
    }

    private syncRigidBodyVisualizerVisibility(): void {
        return syncRigidBodyVisualizerVisibilityImpl(this);
    }

    private updateRigidBodyVisualizer(): void {
        return updateRigidBodyVisualizerImpl(this);
    }

    private disposeRigidBodyVisualizer(): void {
        return disposeRigidBodyVisualizerImpl(this);
    }

    private tryPickBoneVisualizerAtClientPosition(clientX: number, clientY: number): void {
        return tryPickBoneVisualizerAtClientPositionImpl(this, clientX, clientY);
    }
    private resolveBoneVisualizerStyle(
        boneInfo: BoneControlInfo | undefined,
        isSelected: boolean
    ): { lineColor: string; markerColor: string; markerShape: "circle" | "square"; lineWidth: number } {
        const normalBlue = "rgba(120, 132, 255, 0.95)";
        const normalOrange = "rgba(255, 182, 74, 0.96)";
        const selectedColor = "rgba(255, 94, 108, 1)";

        const isIk = boneInfo?.isIk === true;
        const isIkAffected = boneInfo?.isIkAffected === true;

        const markerShape = isIk
            ? "square"
            : isIkAffected
                ? "circle"
                : boneInfo?.movable
                    ? "square"
                    : "circle";

        const baseColor = (isIk || isIkAffected) ? normalOrange : normalBlue;
        const color = isSelected ? selectedColor : baseColor;

        return {
            lineColor: color,
            markerColor: color,
            markerShape,
            lineWidth: isSelected ? 2.3 : 1.6,
        };
    }

    private drawBoneVisualizerSegment(
        ctx: CanvasRenderingContext2D,
        from: { x: number; y: number },
        to: { x: number; y: number },
        color: string,
        lineWidth: number
    ): void {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy);
        if (length <= 0.0001) return;

        const nx = -dy / length;
        const ny = dx / length;
        const halfWidth = Math.max(1.2, Math.min(6, length * 0.08));

        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;

        ctx.beginPath();
        ctx.moveTo(from.x + nx * halfWidth, from.y + ny * halfWidth);
        ctx.lineTo(to.x, to.y);
        ctx.moveTo(from.x - nx * halfWidth, from.y - ny * halfWidth);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
    }

    private drawBoneVisualizerMarker(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        markerShape: "circle" | "square",
        color: string,
        selected: boolean
    ): void {
        const size = selected ? 10 : 8;
        const half = size / 2;
        const innerSize = selected ? 4.2 : 3.2;

        ctx.lineWidth = selected ? 2.3 : 1.8;
        ctx.strokeStyle = color;
        ctx.fillStyle = "rgba(255, 255, 255, 0.78)";

        if (markerShape === "square") {
            ctx.beginPath();
            ctx.rect(x - half, y - half, size, size);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = color;
            ctx.fillRect(x - innerSize / 2, y - innerSize / 2, innerSize, innerSize);
            return;
        }

        ctx.beginPath();
        ctx.arc(x, y, half, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, innerSize / 2, 0, Math.PI * 2);
        ctx.fill();
    }

    private getBoneWorldPositionToRef(bone: Skeleton["bones"][number], mesh: Mesh, result: Vector3): void {
        return getBoneWorldPositionToRefImpl(bone, mesh, result);
    }

    private syncBoneVisualizerVisibility(): void {
        return syncBoneVisualizerVisibilityImpl(this);
    }

    private clearBoneOverlay(): void {
        return clearBoneOverlayImpl(this);
    }

    private ensureBoneOverlayCanvas(): void {
        return ensureBoneOverlayCanvasImpl(this);
    }

    private resizeBoneOverlayCanvas(): void {
        return resizeBoneOverlayCanvasImpl(this);
    }

    private disposeBoneVisualizer(): void {
        return disposeBoneVisualizerImpl(this);
    }

    public hasTimelineKeyframe(track: Pick<KeyframeTrack, "name" | "category">, frame: number): boolean {
        return hasTimelineKeyframeImpl(this, track, frame);
    }

    public addTimelineKeyframe(track: Pick<KeyframeTrack, "name" | "category">, frame: number): boolean {
        const result = addTimelineKeyframeImpl(this, track, frame);
        return result;
    }

    public hasInfoKeyframe(frame: number): boolean {
        return hasInfoKeyframeImpl(this, frame);
    }

    public addInfoKeyframe(frame: number): boolean {
        const result = addInfoKeyframeImpl(this, frame);
        return result;
    }

    public ensureCameraAnimationForEditing(): boolean {
        return ensureCameraAnimationForEditingImpl(this);
    }

    public ensureModelAnimationForEditing(track: Pick<KeyframeTrack, "name" | "category">): boolean {
        return ensureModelAnimationForEditingImpl(this, track);
    }

    public removeTimelineKeyframe(track: Pick<KeyframeTrack, "name" | "category">, frame: number): boolean {
        return removeTimelineKeyframeImpl(this, track, frame);
    }

    public moveTimelineKeyframe(
        track: Pick<KeyframeTrack, "name" | "category">,
        fromFrame: number,
        toFrame: number,
    ): boolean {
        return moveTimelineKeyframeImpl(this, track, fromFrame, toFrame);
    }

    public isGroundVisible(): boolean {
        return this.ground?.isEnabled() ?? false;
    }

    public isBackgroundBlack(): boolean {
        return this.backgroundBlackEnabled;
    }

    public setBackgroundBlack(enabled: boolean): void {
        this.backgroundBlackEnabled = Boolean(enabled);
        this.scene.clearColor = this.backgroundBlackEnabled
            ? this.blackClearColor.clone()
            : this.defaultClearColor.clone();
    }

    public toggleBackgroundBlack(): boolean {
        const next = !this.backgroundBlackEnabled;
        this.setBackgroundBlack(next);
        return next;
    }

    public setGroundVisible(visible: boolean): void {
        if (!this.ground) return;
        this.ground.setEnabled(visible);
    }

    public toggleGroundVisible(): boolean {
        const next = !this.isGroundVisible();
        this.setGroundVisible(next);
        return next;
    }

    public get mirroringFloorEnabled(): boolean {
        return this.mirroringFloorEnabledValue;
    }

    public set mirroringFloorEnabled(enabled: boolean) {
        this.mirroringFloorEnabledValue = Boolean(enabled);
        this.syncMirroringFloorState();
    }

    public get mirroringFloorReflectance(): number {
        return this.mirroringFloorReflectanceValue;
    }

    public set mirroringFloorReflectance(value: number) {
        this.mirroringFloorReflectanceValue = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.35));
        this.applyMirroringFloorMaterialState();
    }

    public get mirroringFloorSize(): number {
        return this.mirroringFloorSizeValue;
    }

    public set mirroringFloorSize(value: number) {
        this.mirroringFloorSizeValue = Math.max(1, Math.min(200, Number.isFinite(value) ? value : 40));
        this.applyMirroringFloorTransform();
    }

    public get mirroringFloorHeight(): number {
        return this.mirroringFloorHeightValue;
    }

    public set mirroringFloorHeight(value: number) {
        this.mirroringFloorHeightValue = Math.max(-20, Math.min(20, Number.isFinite(value) ? value : 0));
        this.applyMirroringFloorTransform();
        this.applyMirroringFloorMirrorPlane();
    }

    public get mirroringFloorResolution(): number {
        return this.mirroringFloorResolutionValue;
    }

    public set mirroringFloorResolution(value: number) {
        const normalized = Number.isFinite(value) ? value : 512;
        const next = normalized <= 256 ? 256 : normalized <= 512 ? 512 : normalized <= 1024 ? 1024 : 2048;
        if (this.mirroringFloorResolutionValue === next) return;
        this.mirroringFloorResolutionValue = next;
        if (this.mirroringFloorTexture) {
            this.disposeMirroringFloorResources();
            this.syncMirroringFloorState();
        }
    }

    public isSkydomeVisible(): boolean {
        return this.skydome?.isEnabled() ?? false;
    }

    public getBackgroundImagePath(): string | null {
        return this.backgroundImagePath;
    }

    public getBackgroundVideoPath(): string | null {
        return this.backgroundVideoPath;
    }

    public hasBackgroundImage(): boolean {
        return this.backgroundImageLayer !== null;
    }

    public hasBackgroundVideo(): boolean {
        return this.backgroundVideoLayer !== null;
    }

    public hasBackgroundMedia(): boolean {
        return this.backgroundImageLayer !== null || this.backgroundVideoLayer !== null;
    }

    public isBackgroundMediaVisible(): boolean {
        return this.backgroundMediaVisible && this.hasBackgroundMedia();
    }

    public setSkydomeVisible(visible: boolean): void {
        if (!this.skydome) return;
        this.skydome.setEnabled(visible);
    }

    public toggleSkydomeVisible(): boolean {
        const next = !this.isSkydomeVisible();
        this.setSkydomeVisible(next);
        return next;
    }

    public setBackgroundMediaVisible(visible: boolean): boolean {
        this.backgroundMediaVisible = Boolean(visible);
        if (this.backgroundImageLayer) {
            this.backgroundImageLayer.isEnabled = this.backgroundMediaVisible;
        }
        if (this.backgroundVideoLayer) {
            this.backgroundVideoLayer.isEnabled = this.backgroundMediaVisible;
        }
        return this.isBackgroundMediaVisible();
    }

    public toggleBackgroundMediaVisible(): boolean {
        return this.setBackgroundMediaVisible(!this.backgroundMediaVisible);
    }

    public clearBackgroundImage(): void {
        if (this.backgroundImageLayer) {
            this.backgroundImageLayer.dispose();
            this.backgroundImageLayer = null;
        }
        this.backgroundImagePath = null;
    }

    public clearBackgroundVideo(): void {
        if (this.backgroundVideoElement) {
            this.backgroundVideoElement.pause();
            this.backgroundVideoElement.removeAttribute("src");
            this.backgroundVideoElement.load();
            this.backgroundVideoElement = null;
        }
        if (this.backgroundVideoTexture) {
            this.backgroundVideoTexture.dispose();
            this.backgroundVideoTexture = null;
        }
        this.backgroundVideoCanvas = null;
        if (this.backgroundVideoLayer) {
            this.backgroundVideoLayer.dispose();
            this.backgroundVideoLayer = null;
        }
        this.backgroundVideoPath = null;
        this.backgroundVideoLastSyncedTime = Number.NaN;
        this.backgroundVideoLastDrawnTime = Number.NaN;
    }

    public clearBackgroundMedia(): void {
        this.clearBackgroundVideo();
        this.clearBackgroundImage();
    }

    public async setBackgroundImageFromPath(filePath: string): Promise<void> {
        const normalizedPath = filePath.trim();
        if (normalizedPath.length === 0) {
            this.clearBackgroundMedia();
            return;
        }

        const texture = await new Promise<Texture>((resolve, reject) => {
            let settled = false;
            const nextTexture = new Texture(
                localPathToFileUrl(normalizedPath),
                this.scene,
                false,
                true,
                Texture.TRILINEAR_SAMPLINGMODE,
                () => {
                    if (settled) return;
                    settled = true;
                    resolve(nextTexture);
                },
                (message, exception) => {
                    if (settled) return;
                    settled = true;
                    nextTexture.dispose();
                    const detail = typeof message === "string" && message.trim().length > 0
                        ? message
                        : exception instanceof Error
                            ? exception.message
                            : "Background image load failed";
                    reject(new Error(detail));
                },
            );
            if (nextTexture.isReady()) {
                settled = true;
                resolve(nextTexture);
            }
        });

        texture.name = `background:${normalizedPath.replace(/^.*[\\/]/, "")}`;
        texture.wrapU = Texture.CLAMP_ADDRESSMODE;
        texture.wrapV = Texture.CLAMP_ADDRESSMODE;
        texture.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE);

        const previousLayer = this.backgroundImageLayer;
        const nextLayer = new Layer("backgroundImageLayer", null, this.scene, true, new Color4(1, 1, 1, 1));
        nextLayer.texture = texture;
        this.backgroundImageLayer = nextLayer;
        this.backgroundImagePath = normalizedPath;
        this.backgroundMediaVisible = true;
        this.backgroundImageLayer.isEnabled = true;
        previousLayer?.dispose();
        this.clearBackgroundVideo();

        // A fullscreen background image should replace the flat skydome rather than hide behind it.
        this.setSkydomeVisible(false);
    }

    public async setBackgroundVideoFromPath(filePath: string): Promise<void> {
        const normalizedPath = filePath.trim();
        if (normalizedPath.length === 0) {
            this.clearBackgroundMedia();
            return;
        }

        const video = document.createElement("video");
        video.preload = "auto";
        video.muted = true;
        video.defaultMuted = true;
        video.volume = 0;
        video.loop = false;
        video.playsInline = true;
        video.setAttribute("playsinline", "");
        video.src = localPathToFileUrl(normalizedPath);

        let texture: DynamicTexture | null = null;
        let canvas: HTMLCanvasElement | null = null;
        try {
            texture = await new Promise<DynamicTexture>((resolve, reject) => {
                let settled = false;
                const cleanup = (): void => {
                    video.removeEventListener("error", onVideoError);
                    video.removeEventListener("loadeddata", onVideoLoaded);
                };
                const onVideoLoaded = (): void => {
                    if (settled) return;
                    const width = Math.max(1, video.videoWidth || 1);
                    const height = Math.max(1, video.videoHeight || 1);
                    canvas = document.createElement("canvas");
                    canvas.width = width;
                    canvas.height = height;
                    texture = new DynamicTexture(
                        `backgroundVideo:${normalizedPath.replace(/^.*[\\/]/, "")}`,
                        { width, height },
                        this.scene,
                        false,
                        Texture.TRILINEAR_SAMPLINGMODE,
                    );
                    const ctx = texture.getContext();
                    ctx.save();
                    ctx.translate(0, height);
                    ctx.scale(1, -1);
                    ctx.drawImage(video, 0, 0, width, height);
                    ctx.restore();
                    texture.update(false);
                    settled = true;
                    cleanup();
                    resolve(texture);
                };
                const onVideoError = (): void => {
                    if (settled) return;
                    settled = true;
                    cleanup();
                    const mediaError = video.error;
                    const detail = mediaError?.message
                        || `Background video load failed (${mediaError?.code ?? "unknown"})`;
                    reject(new Error(detail));
                };
                video.addEventListener("error", onVideoError, { once: true });
                video.addEventListener("loadeddata", onVideoLoaded, { once: true });
                if (video.readyState >= video.HAVE_CURRENT_DATA) {
                    onVideoLoaded();
                }
            });
        } catch (err) {
            video.pause();
            video.removeAttribute("src");
            video.load();
            throw err;
        }

        texture.wrapU = Texture.CLAMP_ADDRESSMODE;
        texture.wrapV = Texture.CLAMP_ADDRESSMODE;
        texture.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE);

        const previousLayer = this.backgroundVideoLayer;
        const previousTexture = this.backgroundVideoTexture;
        const previousVideo = this.backgroundVideoElement;
        const nextLayer = new Layer("backgroundVideoLayer", null, this.scene, true, new Color4(1, 1, 1, 1));
        nextLayer.texture = texture;
        this.backgroundVideoLayer = nextLayer;
        this.backgroundVideoTexture = texture;
        this.backgroundVideoElement = video;
        this.backgroundVideoCanvas = canvas;
        this.backgroundVideoPath = normalizedPath;
        this.backgroundMediaVisible = true;
        this.backgroundVideoLayer.isEnabled = true;
        this.backgroundVideoLastSyncedTime = Number.NaN;
        this.backgroundVideoLastDrawnTime = Number.NaN;
        previousLayer?.dispose();
        previousTexture?.dispose();
        if (previousVideo) {
            previousVideo.pause();
            previousVideo.removeAttribute("src");
            previousVideo.load();
        }
        this.clearBackgroundImage();
        this.syncBackgroundVideoFrame(true);

        // A fullscreen background video should replace the flat skydome rather than hide behind it.
        this.setSkydomeVisible(false);
    }

    private syncBackgroundVideoFrame(force = false): void {
        const texture = this.backgroundVideoTexture;
        const video = this.backgroundVideoElement;
        const canvas = this.backgroundVideoCanvas;
        if (!texture || !video || !canvas) return;
        if (video.readyState < video.HAVE_METADATA) return;

        const duration = Number.isFinite(video.duration) ? video.duration : Number.POSITIVE_INFINITY;
        const clampedTarget = Math.max(0, Math.min(this._currentFrame / 30, Math.max(0, duration - 0.001)));

        if (this._isPlaying) {
            if (video.paused) {
                void video.play().catch(() => {
                    // Some containers/codecs may reject autoplay despite mute. Keep falling back to manual seeks.
                });
            }
            if (Math.abs(video.currentTime - clampedTarget) > 0.2) {
                this.backgroundVideoLastSyncedTime = clampedTarget;
                try {
                    video.currentTime = clampedTarget;
                } catch {
                    // Browser may reject seeks while metadata is still settling. Try again next frame.
                }
            }
        } else {
            if (!video.paused) {
                video.pause();
            }
            if (force || Math.abs(clampedTarget - this.backgroundVideoLastSyncedTime) >= (1 / 120)) {
                this.backgroundVideoLastSyncedTime = clampedTarget;
                try {
                    video.currentTime = clampedTarget;
                } catch {
                    // Browser may reject seeks while metadata is still settling. Try again next frame.
                }
            }
        }
        if (video.readyState < video.HAVE_CURRENT_DATA) return;

        const width = Math.max(1, video.videoWidth || canvas.width || 1);
        const height = Math.max(1, video.videoHeight || canvas.height || 1);
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }

        if (!force && Math.abs(video.currentTime - this.backgroundVideoLastDrawnTime) < (1 / 240)) {
            return;
        }

        const ctx = texture.getContext();
        ctx.clearRect(0, 0, width, height);
        ctx.save();
        ctx.translate(0, height);
        ctx.scale(1, -1);
        ctx.drawImage(video, 0, 0, width, height);
        ctx.restore();
        texture.update(false);
        this.backgroundVideoLastDrawnTime = video.currentTime;
    }

    public isRigidBodyVisualizerEnabled(): boolean {
        return this.rigidBodyVisualizerEnabled;
    }

    public isRigidBodyVisualizerAvailable(): boolean {
        return this.sceneModels.some((sceneModel) => PhysicsModelController.hasPhysicsModel(
            sceneModel.model,
            sceneModel.rigidBodies.length,
        ));
    }

    public setRigidBodyVisualizerEnabled(enabled: boolean): boolean {
        this.rigidBodyVisualizerEnabled = Boolean(enabled);
        this.syncRigidBodyVisualizerVisibility();
        if (this.rigidBodyVisualizerEnabled) {
            this.updateRigidBodyVisualizer();
        }
        return this.rigidBodyVisualizerEnabled;
    }

    public toggleRigidBodyVisualizerEnabled(): boolean {
        return this.setRigidBodyVisualizerEnabled(!this.rigidBodyVisualizerEnabled);
    }

    public isPhysicsAvailable(): boolean {
        return this.physicsController.isAvailable();
    }

    public getPhysicsEnabled(): boolean {
        return this.physicsController.getEnabled();
    }

    public async waitForPhysicsInitialization(): Promise<boolean> {
        return this.physicsInitializationPromise;
    }

    public isWebGpuSdefCpuFallbackEnabled(): boolean {
        return this.webGpuSdefCpuFallbackEnabled;
    }

    public setWebGpuSdefCpuFallbackEnabled(enabled: boolean): boolean {
        this.webGpuSdefCpuFallbackEnabled = Boolean(enabled);
        MmdManager.writeBooleanLocalStorage(
            MmdManager.WEBGPU_SDEF_CPU_FALLBACK_STORAGE_KEY,
            this.webGpuSdefCpuFallbackEnabled,
        );
        return this.webGpuSdefCpuFallbackEnabled;
    }

    private isPhysicsSimulationActive(): boolean {
        return this._isPlaying || this.externalPlaybackSimulationEnabled;
    }

    private syncScenePhysicsSimulationState(): void {
        this.physicsController.syncScenePhysicsSimulationState(this.isPhysicsSimulationActive());
    }

    public setExternalPlaybackSimulationEnabled(enabled: boolean): boolean {
        this.externalPlaybackSimulationEnabled = Boolean(enabled);
        this.physicsController.syncBulletEvaluationTypeForPlayback();
        this.applyPhysicsStateToAllModels();
        this.syncScenePhysicsSimulationState();
        return this.externalPlaybackSimulationEnabled;
    }

    public setPhysicsEnabled(enabled: boolean): boolean {
        const nextEnabled = this.physicsController.setEnabled(enabled, this.isPhysicsSimulationActive());
        this.applyPhysicsStateToAllModels();
        return nextEnabled;
    }

    public togglePhysicsEnabled(): boolean {
        return this.setPhysicsEnabled(!this.getPhysicsEnabled());
    }

    public getPhysicsSimulationRateHz(): PhysicsSimulationRateHz {
        return this.physicsController.getSimulationRateHz();
    }

    public setPhysicsSimulationRateHz(value: number): PhysicsSimulationRateHz {
        return this.physicsController.setSimulationRateHz(value);
    }

    public getPhysicsGravityAcceleration(): number {
        return this.physicsController.getGravityAcceleration();
    }

    public setPhysicsGravityAcceleration(value: number): void {
        this.physicsController.setGravityAcceleration(value);
    }

    public getPhysicsGravityDirection(): { x: number; y: number; z: number } {
        return this.physicsController.getGravityDirection();
    }

    public setPhysicsGravityDirection(x: number, y: number, z: number): void {
        this.physicsController.setGravityDirection(x, y, z);
    }

    static async create(canvas: HTMLCanvasElement): Promise<MmdManager> {
        const { engine, startupDiagnostics } = await MmdManager.createPreferredEngine(canvas);
        return new MmdManager(canvas, engine, startupDiagnostics);
    }

    private static createWebGlEngine(canvas: HTMLCanvasElement): Engine {
        return new Engine(canvas, false, MmdManager.RENDER_ENGINE_OPTIONS);
    }

    private static async createPreferredEngine(canvas: HTMLCanvasElement): Promise<PreferredEngineResult> {
        const startupDiagnostics: string[] = [];
        try {
            const isWebGpuSupported = await WebGPUEngine.IsSupportedAsync;
            if (!isWebGpuSupported) {
                console.info("WebGPU unavailable. Falling back to WebGL2.");
                logInfo("shader", "WebGPU unavailable; falling back to WebGL2");
                startupDiagnostics.push("WebGPU unavailable. Using WebGL2.");
                return { engine: MmdManager.createWebGlEngine(canvas), startupDiagnostics };
            }

            WebGPUTintWASM.DisableUniformityAnalysis = true;
            const engine = await WebGPUEngine.CreateAsync(canvas, {
                ...MmdManager.RENDER_ENGINE_OPTIONS,
                glslangOptions: {
                    jsPath: glslangJsUrl,
                    wasmPath: glslangWasmUrl,
                },
                twgslOptions: {
                    jsPath: twgslJsUrl,
                    wasmPath: twgslWasmUrl,
                },
            });
            engine.compatibilityMode = MmdManager.WEBGPU_COMPATIBILITY_MODE;
            const webGpuMode = engine.compatibilityMode ? "compatibility" : "native";
            console.info(`Using WebGPU renderer (${webGpuMode}, WGSL-first).`);
            logInfo("shader", "using WebGPU renderer", { mode: webGpuMode });
            return { engine, startupDiagnostics };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`WebGPU initialization failed. Falling back to WebGL2. Reason: ${message}`);
            logWarn("shader", "WebGPU initialization failed; falling back to WebGL2", toLogErrorData(err));
            startupDiagnostics.push("WebGPU initialization failed. Using WebGL2.");
            return { engine: MmdManager.createWebGlEngine(canvas), startupDiagnostics };
        }
    }

    private static readBooleanLocalStorage(key: string, fallback: boolean): boolean {
        try {
            const value = globalThis.localStorage?.getItem(key);
            if (value === "1" || value === "true") return true;
            if (value === "0" || value === "false") return false;
        } catch {
            // Optional experiment flags must never block startup.
        }
        return fallback;
    }

    private static writeBooleanLocalStorage(key: string, value: boolean): void {
        try {
            globalThis.localStorage?.setItem(key, value ? "1" : "0");
        } catch {
            // Ignore persistence failures for optional experiment flags.
        }
    }

    private static createFramePerformanceStats(): Record<FramePerformanceSection, FramePerformanceStats> {
        const stats = {} as Record<FramePerformanceSection, FramePerformanceStats>;
        for (const section of FRAME_PERFORMANCE_SECTIONS) {
            stats[section] = {
                samples: 0,
                totalMs: 0,
                maxMs: 0,
            };
        }
        return stats;
    }

    private static summarizePerfCounter(counter: PerfCounter): {
        current: number;
        lastSecAverage: number;
        average: number;
        max: number;
    } {
        return {
            current: Math.round(counter.current * 1000) / 1000,
            lastSecAverage: Math.round(counter.lastSecAverage * 1000) / 1000,
            average: Math.round(counter.average * 1000) / 1000,
            max: Math.round(counter.max * 1000) / 1000,
        };
    }

    private static readRuntimeModeLocalStorage(): RuntimeMode {
        try {
            const value = globalThis.localStorage?.getItem(MmdManager.RUNTIME_MODE_STORAGE_KEY);
            return value === "wasm" ? "wasm" : "classic";
        } catch {
            // Optional experiment flags must never block startup.
            return "classic";
        }
    }

    constructor(canvas: HTMLCanvasElement, engine?: Engine | WebGPUEngine, startupDiagnostics: readonly string[] = []) {
        this.renderingCanvas = canvas;
        for (const diagnostic of startupDiagnostics) {
            this.runtimeDiagnostics.add(diagnostic);
        }

        MmdManager.patchMmdToonLightSeparationShader();

        // Register default material builder explicitly (avoids Vite tree-shaking side-effect imports)
        if (MmdModelLoader.SharedMaterialBuilder === null) {
            MmdModelLoader.SharedMaterialBuilder = new MmdStandardMaterialBuilder();
        }
        if (MmdModelLoader.SharedMaterialBuilder instanceof MmdStandardMaterialBuilder) {
            // Keep the loader's default alpha path so ordinary translucent
            // materials continue to render as semi-transparent.
            MmdModelLoader.SharedMaterialBuilder.renderMethod =
                MmdMaterialRenderMethod.DepthWriteAlphaBlendingWithEvaluation;
        }

        // Create engine (WebGPU preferred path is handled by MmdManager.create)
        this.engine = engine ?? MmdManager.createWebGlEngine(canvas);
        this.configureMmdTextureLoaderForWebGpu();
        this.configureWebGpuRawTextureUploadForNonPOT();
        this.engine.setHardwareScalingLevel(MmdManager.RENDER_HARDWARE_SCALING_LEVEL);
        this.resizeToCanvasClientSize();
        this.ensureBoneOverlayCanvas();

        // Create scene
        this.scene = new Scene(this.engine);
        if (this.framePerformanceLogEnabled) {
            this.sceneInstrumentation = new SceneInstrumentation(this.scene);
            this.sceneInstrumentation.captureActiveMeshesEvaluationTime = true;
            this.sceneInstrumentation.captureRenderTargetsRenderTime = true;
            this.sceneInstrumentation.captureFrameTime = true;
            this.sceneInstrumentation.captureRenderTime = true;
            this.sceneInstrumentation.captureParticlesRenderTime = true;
            this.sceneInstrumentation.captureSpritesRenderTime = true;
            this.sceneInstrumentation.capturePhysicsTime = true;
            this.sceneInstrumentation.captureAnimationsTime = true;
            this.sceneInstrumentation.captureCameraRenderTime = true;
            logInfo("performance", "frame performance log enabled", {
                storageKey: MmdManager.FRAME_PERFORMANCE_LOG_STORAGE_KEY,
            });
        }
        this.scene.clearColor = this.defaultClearColor.clone();
        this.scene.ambientColor = new Color3(0.5, 0.5, 0.5);
        this.scene.imageProcessingConfiguration.isEnabled = true;
        this.scene.imageProcessingConfiguration.applyByPostProcess = false;
        this.scene.imageProcessingConfiguration.contrast = 1;

        // SDEF support
        SdefInjector.OverrideEngineCreateEffect(this.engine);

        // Camera
        this.camera = new ArcRotateCamera(
            "camera",
            -Math.PI / 2,
            Math.PI / 2,
            40,
            new Vector3(0, 10, 0),
            this.scene
        );
        this.camera.fov = (30 * Math.PI) / 180;
        this.camera.minZ = 0.15;
        this.camera.maxZ = 100000;
        this.camera.lowerRadiusLimit = 3;
        this.camera.upperRadiusLimit = null;
        this.camera.wheelDeltaPercentage = 0.01;
        this.camera.attachControl(canvas, true);
        this.camera.inputs.removeByType("ArcRotateCameraPointersInput");
        this.scene.activeCamera = this.camera;
        this.initializeBoneGizmoSystem();
        canvas.addEventListener("pointerdown", this.onCanvasPointerDown);
        canvas.addEventListener("pointermove", this.onCanvasPointerMove);
        canvas.addEventListener("pointerup", this.onCanvasPointerUp);
        canvas.addEventListener("pointercancel", this.onCanvasPointerCancel);
        canvas.addEventListener("pointerleave", this.onCanvasPointerCancel);
        canvas.addEventListener("mousedown", this.onCanvasMouseDown);
        canvas.addEventListener("auxclick", this.onCanvasAuxClick);
        canvas.addEventListener("contextmenu", this.onCanvasContextMenu);
        this.syncCameraRotationFromCurrentView();
        this.recordViewportCameraSyncState();
        this.updateDofFocalLengthFromCameraFov();
        this.dofFocusDistanceMmValue = this.getDofAutoFocusDistanceMm();
        this.initializePostEffectBackend();
        this.initializeDofPipeline();
        this.setupColorCorrectionPostProcess();

        // Lights
        const hemiLight = this.hemiLight = new HemisphericLight(
            "hemiLight",
            new Vector3(0, 1, 0),
            this.scene
        );
        hemiLight.intensity = 0.0;
        hemiLight.diffuse = new Color3(0.9, 0.9, 1.0);
        hemiLight.groundColor = this.shadowGroundColorValue.clone();

        const dirLight = this.dirLight = new DirectionalLight(
            "dirLight",
            new Vector3(0.3, -0.5, 0.5),
            this.scene
        );
        dirLight.intensity = 1.0;
        dirLight.position = new Vector3(-20, 30, -20);
        // Keep a wide fixed shadow frustum so shadows can cover the stage and distant background geometry.
        dirLight.shadowMinZ = 1;
        dirLight.shadowMaxZ = 500;
        dirLight.autoUpdateExtends = true;
        dirLight.autoCalcShadowZBounds = true;
        this.applyShadowFrustumSize();
        this.applyLightColorTemperature();

        this.shadowGenerator = this.createConfiguredShadowGenerator(dirLight);
        this.applyShadowEdgeSoftness();

        // Ground
        this.ground = CreateGround("ground", {
            width: 80,
            height: 80,
            subdivisions: 2,
            updatable: false,
        }, this.scene);

        const groundMat = new StandardMaterial("groundMat", this.scene);
        groundMat.diffuseColor = new Color3(1, 1, 1);
        groundMat.ambientColor = new Color3(1, 1, 1);
        groundMat.specularColor = new Color3(0, 0, 0);
        groundMat.alpha = 1.0;
        groundMat.useLogarithmicDepth = true;

        const gridTextureSize = 512;
        const gridCell = 64;
        const groundGridTexture = new DynamicTexture(
            "groundGridTexture",
            { width: gridTextureSize, height: gridTextureSize },
            this.scene,
            true
        );
        const gridCtx = groundGridTexture.getContext();
        gridCtx.fillStyle = "#ededed";
        gridCtx.fillRect(0, 0, gridTextureSize, gridTextureSize);
        for (let i = 0; i <= gridTextureSize; i += gridCell) {
            const isMajor = i % (gridCell * 4) === 0;
            gridCtx.strokeStyle = isMajor ? "#b6b6b6" : "#c8c8c8";
            gridCtx.lineWidth = isMajor ? 3 : 1;
            gridCtx.beginPath();
            gridCtx.moveTo(i, 0);
            gridCtx.lineTo(i, gridTextureSize);
            gridCtx.stroke();
            gridCtx.beginPath();
            gridCtx.moveTo(0, i);
            gridCtx.lineTo(gridTextureSize, i);
            gridCtx.stroke();
        }
        groundGridTexture.wrapU = Texture.WRAP_ADDRESSMODE;
        groundGridTexture.wrapV = Texture.WRAP_ADDRESSMODE;
        groundGridTexture.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE);
        const maxAnisotropy = this.engine.getCaps().maxAnisotropy ?? 1;
        groundGridTexture.anisotropicFilteringLevel = Math.min(16, maxAnisotropy);
        groundGridTexture.uScale = 20;
        groundGridTexture.vScale = 20;
        groundGridTexture.update();
        groundMat.diffuseTexture = groundGridTexture;
        this.ground.material = groundMat;
        this.ground.receiveShadows = true;
        this.configureIblTestEnvironmentTexture();

        this.skydome = CreateSphere("skydome", {
            diameter: 1200,
            segments: 24,
            updatable: false,
        }, this.scene);
        const skydomeMat = new StandardMaterial("skydomeMat", this.scene);
        const skydomeColor = new Color3(0.94, 0.94, 0.94);
        skydomeMat.diffuseColor = skydomeColor;
        skydomeMat.emissiveColor = skydomeColor;
        skydomeMat.specularColor = new Color3(0, 0, 0);
        skydomeMat.disableLighting = true;
        skydomeMat.backFaceCulling = false;
        skydomeMat.useLogarithmicDepth = true;
        this.skydome.material = skydomeMat;
        this.skydome.infiniteDistance = true;
        this.skydome.isPickable = false;
        this.skydome.receiveShadows = false;
        // MMD Runtime (without physics for initial version)
        this.mmdRuntime = new MmdRuntime(this.scene);
        this.mmdRuntime.register(this.scene);
        this.physicsController = new PhysicsRuntimeController({
            scene: this.scene,
            runtime: this.mmdRuntime,
            getMprUnavailableReason: () => this.getMprUnavailableReason(),
            loadMprWasmInstance: () => loadBundledMprWasmInstance(),
            loadSprWasmInstance: () => loadBundledSprWasmInstance(),
            onStateChanged: (enabled, available) => this.onPhysicsStateChanged?.(enabled, available),
            onError: (message) => this.onError?.(message),
        });
        this.physicsModelController = new PhysicsModelController({
            getRuntime: () => this.mmdRuntime,
            getPhysicsEnabled: () => this.getPhysicsEnabled(),
            isSimulationActive: () => this.isPhysicsSimulationActive(),
            syncCpuSkinnedMorphSourceBuffers: (model) => this.syncCpuSkinnedMorphSourceBuffers(model),
            addRuntimeDiagnostic: (message) => this.addRuntimeDiagnostic(message),
        });

        // MMD camera runtime object (used for camera VMD evaluation)
        this.mmdCamera = new MmdCamera("mmdRuntimeCamera", this.camera.target.clone(), this.scene, false);
        this.syncMmdCameraFromViewportCamera();
        this.mmdRuntime.addAnimatable(this.mmdCamera);
        this.physicsInitializationPromise = this.initializeRuntimeModeAndPhysics();

        // VMD Loader
        this.vmdLoader = new VmdLoader(this.scene);
        this.vpdLoader = new VpdLoader(this.scene);
        this.globalIlluminationController = new GlobalIlluminationController(
            this.scene,
            this.renderingCanvas,
            () => this.dirLight ?? null,
            () => this.sceneModels,
            (enabled) => this.onGlobalIlluminationStateChanged?.(enabled),
        );

        this.scene.onBeforeRenderObservable.add(() => {
            if (!this.framePerformanceLogEnabled) {
                if (this.shouldApplyCameraMotionToViewport()) {
                    this.syncViewportCameraFromMmdCamera();
                }
                this.syncViewportCameraDrivenStateFromNativeInputs();
                this.handleBoneGizmoBeforeRender();
                this.updateBoneVisualizer();
                this.updateRigidBodyVisualizer();
                this.updateCharacterContactShadows();
                this.updateMirroringFloorRenderList();
                this.updateEditorDofFocusAndFStop();
                return;
            }

            let sectionStartMs = performance.now();
            if (this.shouldApplyCameraMotionToViewport()) {
                this.syncViewportCameraFromMmdCamera();
            }
            this.recordFramePerformanceSection("cameraMotionToViewport", performance.now() - sectionStartMs);
            sectionStartMs = performance.now();
            this.syncViewportCameraDrivenStateFromNativeInputs();
            this.recordFramePerformanceSection("viewportCameraInput", performance.now() - sectionStartMs);
            sectionStartMs = performance.now();
            this.handleBoneGizmoBeforeRender();
            this.recordFramePerformanceSection("boneGizmo", performance.now() - sectionStartMs);
            sectionStartMs = performance.now();
            this.updateBoneVisualizer();
            this.recordFramePerformanceSection("boneVisualizer", performance.now() - sectionStartMs);
            sectionStartMs = performance.now();
            this.updateRigidBodyVisualizer();
            this.recordFramePerformanceSection("rigidBodyVisualizer", performance.now() - sectionStartMs);
            sectionStartMs = performance.now();
            this.updateCharacterContactShadows();
            this.recordFramePerformanceSection("characterContactShadow", performance.now() - sectionStartMs);
            this.updateMirroringFloorRenderList();
            sectionStartMs = performance.now();
            this.updateEditorDofFocusAndFStop();
            this.recordFramePerformanceSection("editorDof", performance.now() - sectionStartMs);
        });

        // Start render loop
        this.engine.runRenderLoop(() => {
            const frameStartMs = this.framePerformanceLogEnabled ? performance.now() : 0;
            const nowMs = performance.now();
            if (this.suspendSceneRenderCount > 0) {
                this.lastRenderTimestampMs = nowMs;
                this.nextRenderDueTimestampMs = nowMs;
                return;
            }
            if (!this.autoRenderEnabled) {
                this.lastRenderTimestampMs = nowMs;
                this.nextRenderDueTimestampMs = nowMs;
                return;
            }

            if (this.renderFpsLimit > 0) {
                if (nowMs < this.nextRenderDueTimestampMs) {
                    return;
                }
                this.nextRenderDueTimestampMs = nowMs + (1000 / this.renderFpsLimit);
            }

            const deltaMs = Math.max(0, Math.min(100, nowMs - this.lastRenderTimestampMs));
            this.lastRenderTimestampMs = nowMs;

            let sectionStartMs = this.framePerformanceLogEnabled ? performance.now() : 0;
            const advancedManualPlayback = this.advanceManualPlaybackWithoutAudio(deltaMs);
            if (this.framePerformanceLogEnabled) {
                this.recordFramePerformanceSection("manualPlayback", performance.now() - sectionStartMs);
            }

            sectionStartMs = this.framePerformanceLogEnabled ? performance.now() : 0;
            this.updateSimpleMotionBlurState(deltaMs);
            if (this.framePerformanceLogEnabled) {
                this.recordFramePerformanceSection("motionBlur", performance.now() - sectionStartMs);
            }
            sectionStartMs = this.framePerformanceLogEnabled ? performance.now() : 0;
            this.syncBackgroundVideoFrame();
            if (this.framePerformanceLogEnabled) {
                this.recordFramePerformanceSection("backgroundVideo", performance.now() - sectionStartMs);
            }
            sectionStartMs = this.framePerformanceLogEnabled ? performance.now() : 0;
            this.scene.render();
            this.executePostEffectBackend();
            this.renderBoneGizmoUtilityLayerAfterPostEffects();
            const afterRenderMs = performance.now();
            if (this.framePerformanceLogEnabled) {
                this.recordFramePerformanceSection("sceneRender", afterRenderMs - sectionStartMs);
            }
            this.logPhysicsPerformanceSample(afterRenderMs);
            if (!this._isPlaying) {
                if (this.framePerformanceLogEnabled) {
                    this.recordFramePerformanceSection("frameTotal", afterRenderMs - frameStartMs);
                    this.logFramePerformanceSample(afterRenderMs);
                }
                return;
            }

            sectionStartMs = this.framePerformanceLogEnabled ? performance.now() : 0;
            if (advancedManualPlayback) {
                this.onFrameUpdate?.(this._currentFrame, this._totalFrames);
                if (this.framePerformanceLogEnabled) {
                    const frameEndMs = performance.now();
                    this.recordFramePerformanceSection("frameStateUpdate", frameEndMs - sectionStartMs);
                    this.recordFramePerformanceSection("frameTotal", frameEndMs - frameStartMs);
                    this.logFramePerformanceSample(frameEndMs);
                }
                return;
            }

            const runtimeFrame = Math.floor(this.mmdRuntime.currentFrameTime);
            this._currentFrame = Math.min(runtimeFrame, this._totalFrames);
            this.onFrameUpdate?.(this._currentFrame, this._totalFrames);
            if (this.framePerformanceLogEnabled) {
                const frameEndMs = performance.now();
                this.recordFramePerformanceSection("frameStateUpdate", frameEndMs - sectionStartMs);
                this.recordFramePerformanceSection("frameTotal", frameEndMs - frameStartMs);
                this.logFramePerformanceSample(frameEndMs);
            }
        });

        // Handle resize
        window.addEventListener("resize", this.onWindowResize);

        this.resizeObserver = new ResizeObserver(() => {
            this.resizeToCanvasClientSize();
        });
        this.resizeObserver.observe(canvas.parentElement ?? canvas);
    }

    private async initializeRuntimeModeAndPhysics(): Promise<boolean> {
        if (this.runtimeMode !== "wasm") {
            return await this.physicsController.initializeClassic();
        }

        try {
            await this.initializeWasmRuntimeMode();
            logInfo("physics", "experimental MMD WASM runtime initialized", {
                runtimeMode: this.runtimeMode,
                backend: this.getPhysicsBackendLabel(),
                simulationRateHz: this.getPhysicsSimulationRateHz(),
            });
            return true;
        } catch (err: unknown) {
            logWarn("physics", "experimental MMD WASM runtime failed; falling back to classic runtime", toLogErrorData(err));
            console.warn("Experimental MMD WASM runtime failed. Falling back to classic runtime:", err);
            this.runtimeMode = "classic";
            this.mmdWasmInstance = null;
            this.physicsController.setRuntime(this.mmdRuntime);
            return await this.physicsController.initializeClassic();
        }
    }

    private async initializeWasmRuntimeMode(): Promise<void> {
        const mprUnavailableReason = this.getMprUnavailableReason();
        if (mprUnavailableReason !== null) {
            throw new Error(mprUnavailableReason);
        }

        const wasmInstance = await loadBundledMprWasmInstance();
        const wasmRuntime = new MmdWasmRuntime(wasmInstance, this.scene, new MmdWasmPhysics(this.scene));
        wasmRuntime.register(this.scene);

        this.mmdRuntime.unregister(this.scene);
        this.mmdRuntime.dispose(this.scene);
        this.mmdRuntime = wasmRuntime;
        this.mmdWasmInstance = wasmInstance;
        this.mmdRuntime.addAnimatable(this.mmdCamera);
        this.physicsController.useWasmRuntime(wasmRuntime);
        this.syncScenePhysicsSimulationState();
        this.applyPhysicsStateToAllModels();
    }

    private getMprUnavailableReason(): string | null {
        if (!import.meta.env.DEV) {
            return "MPR packaged build integration is pending";
        }
        if (typeof WebAssembly === "undefined") {
            return "WebAssembly is unavailable";
        }
        if (typeof SharedArrayBuffer === "undefined") {
            return "SharedArrayBuffer is unavailable";
        }
        if (!globalThis.crossOriginIsolated) {
            return "crossOriginIsolated is false";
        }
        return null;
    }

    private logPhysicsPerformanceSample(nowMs: number): void {
        if (!this.framePerformanceLogEnabled && !isDebugLogEnabled("performance")) return;

        this.physicsController.logPerformanceSample(nowMs, {
            runtimeMode: this.runtimeMode,
            engine: this.getEngineType(),
            fps: this.getFps(),
            modelCount: this.sceneModels.length,
            simulationActive: this.isPhysicsSimulationActive(),
        });
    }

    private recordFramePerformanceSection(section: FramePerformanceSection, durationMs: number): void {
        if (!this.framePerformanceLogEnabled) return;
        if (!Number.isFinite(durationMs) || durationMs < 0) return;
        const stats = this.framePerformanceStats[section];
        stats.samples += 1;
        stats.totalMs += durationMs;
        stats.maxMs = Math.max(stats.maxMs, durationMs);
    }

    private logFramePerformanceSample(nowMs: number): void {
        if (!this.framePerformanceLogEnabled) return;
        if (nowMs < this.nextFramePerformanceLogMs) {
            return;
        }
        this.nextFramePerformanceLogMs = nowMs + 10_000;

        const sections: Record<string, { samples: number; avgMs: number | null; maxMs: number | null }> = {};
        for (const section of FRAME_PERFORMANCE_SECTIONS) {
            const stats = this.framePerformanceStats[section];
            sections[section] = {
                samples: stats.samples,
                avgMs: stats.samples > 0 ? Math.round((stats.totalMs / stats.samples) * 1000) / 1000 : null,
                maxMs: stats.samples > 0 ? Math.round(stats.maxMs * 1000) / 1000 : null,
            };
        }

        logInfo("performance", "frame performance sample", {
            runtimeMode: this.runtimeMode,
            engine: this.getEngineType(),
            fps: this.getFps(),
            modelCount: this.sceneModels.length,
            isPlaying: this._isPlaying,
            physicsBackend: this.getPhysicsBackendLabel(),
            rigidBodyVisualizerEnabled: this.rigidBodyVisualizerEnabled,
            boneVisualizerTarget: this.boneVisualizerTarget !== null,
            sections,
            sceneInstrumentation: this.getSceneInstrumentationSnapshot(),
        });
        this.framePerformanceStats = MmdManager.createFramePerformanceStats();
    }

    private getSceneInstrumentationSnapshot(): Record<string, unknown> | null {
        const instrumentation = this.sceneInstrumentation;
        if (!instrumentation) return null;

        return {
            activeMeshes: this.scene.getActiveMeshes().length,
            totalVertices: this.scene.totalVerticesPerfCounter.current,
            activeMeshesEvaluationTime: MmdManager.summarizePerfCounter(instrumentation.activeMeshesEvaluationTimeCounter),
            animationsTime: MmdManager.summarizePerfCounter(instrumentation.animationsTimeCounter),
            physicsTime: MmdManager.summarizePerfCounter(instrumentation.physicsTimeCounter),
            renderTargetsRenderTime: MmdManager.summarizePerfCounter(instrumentation.renderTargetsRenderTimeCounter),
            renderTime: MmdManager.summarizePerfCounter(instrumentation.renderTimeCounter),
            cameraRenderTime: MmdManager.summarizePerfCounter(instrumentation.cameraRenderTimeCounter),
            particlesRenderTime: MmdManager.summarizePerfCounter(instrumentation.particlesRenderTimeCounter),
            spritesRenderTime: MmdManager.summarizePerfCounter(instrumentation.spritesRenderTimeCounter),
            frameTime: MmdManager.summarizePerfCounter(instrumentation.frameTimeCounter),
            drawCalls: MmdManager.summarizePerfCounter(instrumentation.drawCallsCounter),
        };
    }

    private applyPhysicsStateToModel(model: RuntimeModel): void {
        this.physicsModelController.applyPhysicsStateToModel(model);
    }

    private patchModelAfterPhysicsForPausedState(model: RuntimeModel): void {
        this.physicsModelController.patchModelAfterPhysicsForPausedState(model);
    }

    private syncCpuSkinnedMorphSourceBuffers(model: RuntimeModel): void {
        const meshes = PhysicsModelController.collectMeshesForCpuMorphSync(model);

        for (const mesh of meshes) {
            const morphTargetManager = mesh.morphTargetManager;
            if (!morphTargetManager) continue;
            if (mesh.computeBonesUsingShaders) continue;
            if (!mesh.useBones || mesh.numBoneInfluencers <= 0 || !mesh.skeleton) continue;

            const meshInternal = mesh as unknown as {
                _internalMeshDataInfo?: {
                    _sourcePositions?: Float32Array | null;
                    _sourceNormals?: Float32Array | null;
                    _mmdMorphCpuBasePositions?: Float32Array | null;
                    _mmdMorphCpuBaseNormals?: Float32Array | null;
                };
                geometry?: { _softwareSkinningFrameId?: number };
                setPositionsForCPUSkinning?: () => Float32Array | null | undefined;
                setNormalsForCPUSkinning?: () => Float32Array | null | undefined;
            };
            const internalData = meshInternal._internalMeshDataInfo;
            if (!internalData) continue;

            if (morphTargetManager.hasPositions) {
                const sourcePositions = internalData._sourcePositions
                    ?? meshInternal.setPositionsForCPUSkinning?.()
                    ?? null;
                if (sourcePositions) {
                    if (!internalData._mmdMorphCpuBasePositions || internalData._mmdMorphCpuBasePositions.length !== sourcePositions.length) {
                        internalData._mmdMorphCpuBasePositions = new Float32Array(sourcePositions);
                    }
                    const morphedPositions = mesh.getPositionData(
                        false,
                        true,
                        new Float32Array(internalData._mmdMorphCpuBasePositions),
                    );
                    if (morphedPositions && morphedPositions.length === sourcePositions.length) {
                        sourcePositions.set(morphedPositions);
                    }
                }
            }

            if (morphTargetManager.hasNormals) {
                const sourceNormals = internalData._sourceNormals
                    ?? meshInternal.setNormalsForCPUSkinning?.()
                    ?? null;
                if (sourceNormals) {
                    if (!internalData._mmdMorphCpuBaseNormals || internalData._mmdMorphCpuBaseNormals.length !== sourceNormals.length) {
                        internalData._mmdMorphCpuBaseNormals = new Float32Array(sourceNormals);
                    }
                    const morphedNormals = mesh.getNormalsData(false, true);
                    if (morphedNormals && morphedNormals.length === sourceNormals.length) {
                        sourceNormals.set(morphedNormals);
                    }
                }
            }

            if (meshInternal.geometry) {
                meshInternal.geometry._softwareSkinningFrameId = -1;
            }
        }
    }

    private normalizeRuntimeBoneTransformStages(model: RuntimeModel): void {
        this.physicsModelController.normalizeRuntimeBoneTransformStages(model);
    }

    private normalizeRuntimeBoneEvaluationOrder(model: RuntimeModel): void {
        this.physicsModelController.normalizeRuntimeBoneEvaluationOrder(model);
    }

    private applyPhysicsStateToAllModels(): void {
        for (const sceneModel of this.sceneModels) {
            this.applyPhysicsStateToModel(sceneModel.model);
        }
    }

    private applyMmdMaterialCompatibilityFixes(material: MmdManagerMaterialLike | null | undefined): boolean {
        if (!material || typeof material !== "object") {
            return false;
        }

        // Some loaders leave opaque materials at alpha=0, but restoring alpha on
        // texture-driven transparent materials can break face/eyelash draw order.
        const diffuseTextureHasAlpha = Boolean(material.diffuseTexture?.hasAlpha);
        const albedoTextureHasAlpha = Boolean(material.albedoTexture?.hasAlpha);
        const hasOpacityTexture = Boolean(material.opacityTexture);
        const usesTextureAlpha = Boolean(material.useAlphaFromDiffuseTexture || material.useAlphaFromAlbedoTexture);
        const isTransparencyModeEnabled = typeof material.transparencyMode === "number" && material.transparencyMode !== 0;

        // babylon-mmd already evaluates PMX transparency using actual texture
        // contents. Keep that result intact here so we do not accidentally force
        // opaque PNG textures into the transparent queue.
        const hasTransparentTexturePath = diffuseTextureHasAlpha || albedoTextureHasAlpha || hasOpacityTexture || usesTextureAlpha || isTransparencyModeEnabled;

        if (material.alpha === 0) {
            if (!hasTransparentTexturePath && !isTransparencyModeEnabled && (material.diffuseTexture || material.albedoTexture)) {
                material.alpha = 1;
            }
        }

        // Preserve the loader/runtime depth setup for transparent materials.
        // The forced zOffset helped some face-layer cases, but it breaks normal
        // half-transparent rendering and sphere-material ordering on other models.
        material.zOffset = 0;
        material.zOffsetUnits = 0;

        // Logarithmic depth keeps close-up models stable without forcing the
        // near plane to stay overly small for the whole scene.
        if ("useLogarithmicDepth" in material) {
            material.useLogarithmicDepth = true;
        }

        // Preserve the loader's culling decision. Forcing double-sided rendering on
        // every PMX material tends to reveal inner mouth/face polygons on some models.
        return hasTransparentTexturePath;
    }

    private buildPmxMaterialFlagMap(metadata: {
        materials?: readonly unknown[];
        materialsMetadata?: readonly { flag: number }[];
    }): WeakMap<object, number> {
        const materialFlagMap = new WeakMap<object, number>();
        const materials = Array.isArray(metadata.materials) ? metadata.materials : [];
        const materialsMetadata = Array.isArray(metadata.materialsMetadata) ? metadata.materialsMetadata : [];
        const count = Math.min(materials.length, materialsMetadata.length);

        for (let index = 0; index < count; index += 1) {
            const material = materials[index];
            const materialMetadata = materialsMetadata[index];
            if (!material || typeof material !== "object" || !materialMetadata) continue;
            materialFlagMap.set(material as object, Number(materialMetadata.flag) || 0);
        }

        return materialFlagMap;
    }

    private resolvePmxShadowFlagsForMaterial(
        material: unknown,
        materialFlagMap: WeakMap<object, number>,
    ): { castsShadow: boolean; receivesShadow: boolean } {
        if (!material || typeof material !== "object") {
            return { castsShadow: true, receivesShadow: true };
        }

        const subMaterials = Array.isArray((material as { subMaterials?: unknown[] }).subMaterials)
            ? (material as { subMaterials: unknown[] }).subMaterials
            : [material];

        let castsShadow = false;
        let receivesShadow = false;
        let sawMappedMaterial = false;

        for (const subMaterial of subMaterials) {
            if (!subMaterial || typeof subMaterial !== "object") continue;

            const materialFlag = materialFlagMap.get(subMaterial as object);
            if (materialFlag === undefined) {
                castsShadow = true;
                receivesShadow = true;
                continue;
            }

            sawMappedMaterial = true;
            castsShadow ||= (materialFlag & PMX_MATERIAL_FLAG_ENABLED_DRAW_SHADOW) !== 0;
            receivesShadow ||= (materialFlag & PMX_MATERIAL_FLAG_ENABLED_RECEIVE_SHADOW) !== 0;
        }

        if (!sawMappedMaterial) {
            return { castsShadow: true, receivesShadow: true };
        }

        return { castsShadow, receivesShadow };
    }

    private getSkeletonBoneTextureSize(skeleton: Skeleton): { width: number; height: number; elementCount: number } {
        const requiredElementCount = 4 * (skeleton.bones.length + 1);
        let width = requiredElementCount;
        let height = 1;
        if (skeleton.isUsingTextureForMatrices) {
            const maxTextureSize = this.engine.getCaps().maxTextureSize & ~3;
            if (maxTextureSize > 0 && maxTextureSize < width) {
                width = maxTextureSize;
                height = Math.ceil(requiredElementCount / maxTextureSize);
            }
        }
        return {
            width,
            height,
            elementCount: width * height * 4,
        };
    }

    private applyGpuBoneTextureStorageForLargeSkeletons(
        modelLabel: string,
        meshes: readonly Mesh[],
        skeletons: readonly Skeleton[],
    ): void {
        const maxTextureSize = this.engine.getCaps().maxTextureSize;
        if (!Number.isFinite(maxTextureSize) || maxTextureSize <= 0) {
            return;
        }

        const largeSkeletons = skeletons.filter((skeleton) => {
            const requiredOneRowWidth = Math.max(1, (skeleton.bones.length + 1) * 4);
            return requiredOneRowWidth > maxTextureSize;
        });
        if (largeSkeletons.length === 0) {
            return;
        }

        let affectedMeshCount = 0;
        let maxBones = 0;
        let maxBoneTextureWidth = 1;
        let maxBoneTextureHeight = 1;

        const largeSkeletonSet = new Set(largeSkeletons);
        for (const skeleton of largeSkeletons) {
            skeleton.useTextureToStoreBoneMatrices = true;
            maxBones = Math.max(maxBones, skeleton.bones.length);
            const textureSize = this.getSkeletonBoneTextureSize(skeleton);
            maxBoneTextureWidth = Math.max(maxBoneTextureWidth, textureSize.width);
            maxBoneTextureHeight = Math.max(maxBoneTextureHeight, textureSize.height);
        }

        for (const mesh of meshes) {
            const skeleton = mesh.skeleton;
            if (!skeleton || !largeSkeletonSet.has(skeleton)) {
                continue;
            }
            if (!mesh.useBones || mesh.numBoneInfluencers <= 0) {
                continue;
            }

            mesh.computeBonesUsingShaders = true;
            affectedMeshCount += 1;
        }

        console.info(`[PMX] GPU bone texture storage enabled for large skeleton. ${modelLabel}: ${maxBones} bones uses ${maxBoneTextureWidth}x${maxBoneTextureHeight} bone texture.`, {
            model: modelLabel,
            skeletonCount: largeSkeletons.length,
            affectedMeshCount,
            maxBones,
            maxBoneTextureWidth,
            maxBoneTextureHeight,
            maxTextureSize,
            engine: this.getEngineType(),
        });
        this.addRuntimeDiagnostic(`GPU bone texture: ${modelLabel} (${maxBones} bones, ${maxBoneTextureWidth}x${maxBoneTextureHeight})`);
    }

    private applyCpuSkinningFallbackForWebGpuSdefMeshes(
        modelLabel: string,
        meshes: readonly Mesh[],
    ): void {
        if (!this.isWebGpuEngine()) {
            return;
        }
        if (!this.webGpuSdefCpuFallbackEnabled) {
            return;
        }

        let affectedMeshCount = 0;
        let positionMorphMeshCount = 0;
        const positionMorphMeshes: Array<{
            mesh: string;
            material: string[];
            morphTargetCount: number;
        }> = [];
        for (const mesh of meshes) {
            if (!mesh.useBones || mesh.numBoneInfluencers <= 0) {
                continue;
            }
            if (!mesh.skeleton) {
                continue;
            }
            if (!mesh.isVerticesDataPresent("matricesSdefC")) {
                continue;
            }
            if (mesh.morphTargetManager?.hasPositions) {
                positionMorphMeshCount += 1;
                const material = mesh.material as { name?: string; subMaterials?: Array<{ name?: string } | null> } | null;
                const materialNames = Array.isArray(material?.subMaterials)
                    ? material.subMaterials
                        .map((subMaterial) => (typeof subMaterial?.name === "string" && subMaterial.name.length > 0) ? subMaterial.name : null)
                        .filter((name): name is string => name !== null)
                    : ((typeof material?.name === "string" && material.name.length > 0) ? [material.name] : []);
                positionMorphMeshes.push({
                    mesh: mesh.name || "(unnamed mesh)",
                    material: materialNames,
                    morphTargetCount: mesh.morphTargetManager?.numTargets ?? 0,
                });
            }

            mesh.computeBonesUsingShaders = false;
            affectedMeshCount += 1;
        }

        if (affectedMeshCount === 0 && positionMorphMeshCount === 0) {
            return;
        }

        console.warn(`[PMX] CPU skinning fallback evaluated for WebGPU SDEF meshes. ${modelLabel}: ${affectedMeshCount} fallback mesh(es), ${positionMorphMeshCount} position-morph mesh(es) forced to CPU.`, {
            model: modelLabel,
            affectedMeshCount,
            positionMorphMeshCount,
            positionMorphMeshes,
            engine: this.getEngineType(),
        });
        for (const positionMorphMesh of positionMorphMeshes) {
            console.warn(`[PMX] Position-morph mesh forced to CPU: ${JSON.stringify({
                model: modelLabel,
                mesh: positionMorphMesh.mesh,
                material: positionMorphMesh.material,
                morphTargetCount: positionMorphMesh.morphTargetCount,
            })}`);
        }
        this.addRuntimeDiagnostic(`CPU skinning fallback for WebGPU SDEF: ${modelLabel} (${affectedMeshCount} fallback, ${positionMorphMeshCount} morph-forced)`);
    }

    private suspendSceneRendering(): void {
        this.suspendSceneRenderCount += 1;
    }

    private resumeSceneRendering(): void {
        if (this.suspendSceneRenderCount > 0) {
            this.suspendSceneRenderCount -= 1;
        }
    }

    async loadPMX(filePath: string): Promise<ModelInfo | null> {
        return await loadPMXImpl(this, filePath);
    }

    private shouldActivateAsCurrent(info: ModelInfo): boolean {
        void info;
        // Prefer the most recently loaded PMX/PMD as the active model so
        // the info panel and editing target follow the user's latest import.
        return true;
    }

    private applyModelEdgeToAllModels(): void {
        for (const sceneModel of this.sceneModels) {
            const meshes = [sceneModel.mesh, ...sceneModel.mesh.getChildMeshes()];
            this.applyModelEdgeToMeshes(meshes as Mesh[]);
        }
    }

    private collectSceneModelMaterials(meshes: Mesh[]): SceneModelMaterialEntry[] {
        const materialMap = new Map<object, SceneModelMaterialEntry>();
        let materialIndex = 0;

        const registerMaterial = (material: MmdManagerMaterialLike | null | undefined, fallbackName: string): void => {
            if (!material || typeof material !== "object") return;
            if (materialMap.has(material as object)) return;

            const materialName = typeof material.name === "string" && material.name.trim().length > 0
                ? material.name
                : fallbackName;
            const key = String(materialIndex) + ":" + materialName;
            materialIndex += 1;

            materialMap.set(material as object, {
                key,
                name: materialName,
                material,
            });

            ensureMaterialShaderDefaultsImpl(this, material);
            if (!this.materialShaderPresetByMaterial.has(material as object)) {
                this.materialShaderPresetByMaterial.set(
                    material as object,
                    MmdManager.DEFAULT_WGSL_MATERIAL_SHADER_PRESET,
                );
            }
        };

        for (const mesh of meshes) {
            const material = mesh.material as MmdManagerMaterialLike | null;
            if (!material) continue;

            if (Array.isArray(material.subMaterials)) {
                for (let subIndex = 0; subIndex < material.subMaterials.length; subIndex += 1) {
                    const subMaterial = material.subMaterials[subIndex];
                    registerMaterial(subMaterial, (mesh.name || "mesh") + "#" + String(subIndex + 1));
                }
            } else {
                registerMaterial(material, mesh.name || ("material_" + String(materialIndex)));
            }
        }

        return Array.from(materialMap.values());
    }

    applyToonShadowInfluenceToAllModels(): void {
        return applyToonShadowInfluenceToAllModelsImpl(this);
    }

    private applyModelEdgeToMeshes(meshes: Mesh[]): void {
        const scale = this.modelEdgeWidthValue;
        const materials = new Set<MmdManagerMaterialLike>();

        for (const mesh of meshes) {
            const material = mesh.material as MmdManagerMaterialLike | null;
            if (!material) continue;
            if (Array.isArray(material.subMaterials)) {
                for (const sub of material.subMaterials) {
                    if (sub) materials.add(sub);
                }
            } else {
                materials.add(material);
            }
        }

        for (const mat of materials) {
            if (!("renderOutline" in mat) || !("outlineWidth" in mat)) continue;

            let defaults = this.modelEdgeMaterialDefaults.get(mat as object);
            if (!defaults) {
                defaults = {
                    enabled: Boolean(mat.renderOutline),
                    width: Number(mat.outlineWidth) || 0,
                    alpha: Number(mat.outlineAlpha ?? 1),
                    colorR: Number(mat.outlineColor?.r ?? 0),
                    colorG: Number(mat.outlineColor?.g ?? 0),
                    colorB: Number(mat.outlineColor?.b ?? 0),
                };
                this.modelEdgeMaterialDefaults.set(mat as object, defaults);
            }

            if (!this.isMaterialVisible(mat)) {
                mat.renderOutline = false;
                mat.outlineWidth = 0;
                if ("outlineAlpha" in mat) {
                    mat.outlineAlpha = 0;
                }
                continue;
            }

            const enabled = defaults.enabled && scale > 0;
            mat.renderOutline = enabled;
            mat.outlineWidth = enabled ? defaults.width * scale : 0;
            if ("outlineAlpha" in mat) {
                mat.outlineAlpha = defaults.alpha;
            }
            if ("outlineColor" in mat && mat.outlineColor?.set) {
                mat.outlineColor.set(defaults.colorR, defaults.colorG, defaults.colorB);
            }
        }
    }

    applyToonShadowInfluenceToMeshes(meshes: Mesh[]): void {
        return applyToonShadowInfluenceToMeshesImpl(this, meshes);
    }
    private applyCelShadingToMeshes(meshes: Mesh[]): void {
        const materials = new Set<MmdManagerMaterialLike>();

        for (const mesh of meshes) {
            const material = mesh.material as MmdManagerMaterialLike | null;
            if (!material) continue;
            if (Array.isArray(material.subMaterials)) {
                for (const sub of material.subMaterials) {
                    if (sub) materials.add(sub);
                }
            } else {
                materials.add(material);
            }
        }

        for (const mat of materials) {
            if (!("toonTexture" in mat)) continue;
            const toonTexture = mat.toonTexture as Texture | null | undefined;
            if (toonTexture) {
                toonTexture.wrapU = Texture.CLAMP_ADDRESSMODE;
                toonTexture.wrapV = Texture.CLAMP_ADDRESSMODE;
                toonTexture.updateSamplingMode(Texture.BILINEAR_SAMPLINGMODE);
            }
            if ("ignoreDiffuseWhenToonTextureIsNull" in mat) {
                mat.ignoreDiffuseWhenToonTextureIsNull = true;
            }
        }

        this.applyToonShadowInfluenceToMeshes(meshes);
    }

    private applyAnisotropicFilteringToMeshes(meshes: Mesh[]): void {
        const maxAnisotropy = Math.min(16, this.engine.getCaps().maxAnisotropy ?? 1);
        if (maxAnisotropy <= 1) {
            return;
        }

        const textures = new Set<{ anisotropicFilteringLevel?: number }>();
        const textureKeys = [
            "diffuseTexture",
            "albedoTexture",
            "opacityTexture",
            "bumpTexture",
            "normalTexture",
            "emissiveTexture",
            "ambientTexture",
            "specularTexture",
            "reflectionTexture",
            "refractionTexture",
            "lightmapTexture",
            "metallicTexture",
            "microSurfaceTexture",
            "toonTexture",
        ] as const;

        for (const mesh of meshes) {
            const material = mesh.material as MmdManagerMaterialLike | null;
            if (!material) continue;

            const materials = Array.isArray(material.subMaterials) ? material.subMaterials : [material];
            for (const subMaterial of materials) {
                if (!subMaterial || typeof subMaterial !== "object") continue;
                for (const key of textureKeys) {
                    const texture = (subMaterial as Record<string, unknown>)[key] as { anisotropicFilteringLevel?: number } | undefined;
                    if (texture && typeof texture === "object" && "anisotropicFilteringLevel" in texture) {
                        textures.add(texture);
                    }
                }
            }
        }

        for (const texture of textures) {
            texture.anisotropicFilteringLevel = maxAnisotropy;
        }
    }

    async loadVMD(filePath: string): Promise<MotionInfo | null> {
        return loadVMDImpl(this, filePath);
    }

    async loadVPD(filePath: string): Promise<MotionInfo | null> {
        return loadVPDImpl(this, filePath);
    }

    async loadCameraVMD(filePath: string): Promise<MotionInfo | null> {
        return loadCameraVMDImpl(this, filePath);
    }

    async loadMP3(filePath: string): Promise<boolean> {
        return loadMP3Impl(this, filePath);
    }

    private getAudioMimeType(fileName: string): string {
        const ext = fileName.split(".").pop()?.toLowerCase();
        switch (ext) {
            case "wav":
            case "wave":
                return "audio/wav";
            case "ogg":
                return "audio/ogg";
            case "mp3":
            default:
                return "audio/mpeg";
        }
    }

    play(): void {
        if (!this.currentModel) return;
        this._isPlaying = true;
        this.manualPlaybackWithoutAudio = this.audioPlayer === null;
        this.refreshActiveRuntimeAnimationHandles();
        this.mmdRuntime.seekAnimation(this._currentFrame, true);
        this.syncBackgroundVideoFrame(true);
        this.applyPhysicsStateToAllModels();
        this.syncScenePhysicsSimulationState();
        this.physicsController.syncBulletEvaluationTypeForPlayback();
        if (this.manualPlaybackWithoutAudio) {
            this.manualPlaybackFrameCursor = this._currentFrame;
            this.mmdRuntime.pauseAnimation();
        } else {
            this.mmdRuntime.playAnimation();
        }
        this.syncBoneVisualizerVisibility();
        this.updateBoneGizmoTarget();
    }

    pause(): void {
        this._isPlaying = false;
        this.manualPlaybackWithoutAudio = false;
        this.physicsController.syncBulletEvaluationTypeForPlayback();
        this.syncBoneVisualizerVisibility();
        this.updateBoneGizmoTarget();
        this.syncScenePhysicsSimulationState();
        this.mmdRuntime.pauseAnimation();
        this.syncBackgroundVideoFrame(true);
    }

    stop(): void {
        this._isPlaying = false;
        this.manualPlaybackWithoutAudio = false;
        this.manualPlaybackFrameCursor = 0;
        this.physicsController.syncBulletEvaluationTypeForPlayback();
        this.syncBoneVisualizerVisibility();
        this.updateBoneGizmoTarget();
        this.syncScenePhysicsSimulationState();
        this.mmdRuntime.pauseAnimation();
        this.refreshActiveRuntimeAnimationHandles();
        this.mmdRuntime.seekAnimation(0, true);
        this.syncViewportCameraFromMmdCameraAfterSeek();
        this.applyPhysicsStateToAllModels();
        this._currentFrame = 0;
        this.syncBackgroundVideoFrame(true);
        this.onFrameUpdate?.(0, this._totalFrames);
    }

    seekTo(frame: number): void {
        const targetFrame = Math.max(0, Math.floor(frame));
        this.physicsController.syncBulletEvaluationTypeForSeek();
        if (targetFrame > this._totalFrames) {
            this._totalFrames = targetFrame;
        }
        this._currentFrame = targetFrame;
        this.mmdRuntime.seekAnimation(this._currentFrame, true);
        this.syncViewportCameraFromMmdCameraAfterSeek();
        if (!this._isPlaying && this.getPhysicsEnabled()) {
            this.applyPhysicsStateToAllModels();
        }
        if (this.manualPlaybackWithoutAudio) {
            this.manualPlaybackFrameCursor = this._currentFrame;
        }
        this.syncBackgroundVideoFrame(true);
        this.onFrameUpdate?.(this._currentFrame, this._totalFrames);
    }

    seekToBoundary(frame: number): void {
        const wasPlaying = this._isPlaying;
        if (wasPlaying) {
            this.pause();
        }

        this.resetBoneGizmoInteraction();
        this.seekTo(frame);
        this.stabilizePhysicsAfterHardSeek();
        this.updateBoneGizmoTarget();

        if (wasPlaying) {
            this.play();
        }
    }

    private refreshActiveRuntimeAnimationHandles(): void {
        if (this.cameraSourceAnimation) {
            if (this.cameraAnimationHandle !== null) {
                this.mmdCamera.destroyRuntimeAnimation(this.cameraAnimationHandle);
                this.cameraAnimationHandle = null;
            }

            const handle = this.mmdCamera.createRuntimeAnimation(
                this.cameraSourceAnimation as unknown as IMmdBindableCameraAnimation,
            );
            this.mmdCamera.setRuntimeAnimation(handle);
            this.cameraAnimationHandle = handle;
        }

        if (!this.currentModel) return;
        const animation = this.modelSourceAnimationsByModel.get(this.currentModel);
        if (!animation) return;

        const existingHandles = Array.from(this.currentModel.runtimeAnimations.keys());
        for (const handle of existingHandles) {
            this.currentModel.destroyRuntimeAnimation(handle);
        }

        const handle = this.createModelRuntimeAnimation(this.currentModel, animation);
        this.currentModel.setRuntimeAnimation(handle);
    }

    private createModelRuntimeAnimation(model: RuntimeModel, animation: MmdAnimation): MmdRuntimeAnimationHandle {
        if (this.runtimeMode === "wasm" && this.mmdWasmInstance) {
            return model.createRuntimeAnimation(new MmdWasmAnimation(animation, this.mmdWasmInstance, this.scene));
        }
        return model.createRuntimeAnimation(animation);
    }

    private stabilizePhysicsAfterHardSeek(): void {
        if (!this.getPhysicsEnabled()) return;

        // Reinitialize rigid bodies from current animation pose to avoid explosive inertia after large jumps.
        this.applyPhysicsStateToAllModels();
        this.mmdRuntime.seekAnimation(this._currentFrame, true);
    }

    setPlaybackSpeed(speed: number): void {
        this._playbackSpeed = speed;
        this.mmdRuntime.timeScale = speed;
    }

    get isPlaying(): boolean {
        return this._isPlaying;
    }

    get currentFrame(): number {
        return this._currentFrame;
    }

    getAudioSourcePath(): string | null {
        return this.audioSourcePath;
    }

    get totalFrames(): number {
        return this._totalFrames;
    }

    private isPackedProjectArray(value: unknown): value is ProjectPackedArray {
        if (!value || typeof value !== "object") return false;
        const packed = value as Partial<ProjectPackedArray>;
        if (typeof packed.data !== "string") return false;
        if (typeof packed.length !== "number" || !Number.isFinite(packed.length) || packed.length < 0) return false;
        return packed.encoding === "u8-b64" || packed.encoding === "f32-b64" || packed.encoding === "u32-delta-varint-b64";
    }

    private encodeUint8ToBase64(bytes: Uint8Array): string {
        if (bytes.length === 0) return "";
        const chunkSize = 0x8000;
        const parts: string[] = [];
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            let binary = "";
            for (let j = 0; j < chunk.length; j += 1) {
                binary += String.fromCharCode(chunk[j]);
            }
            parts.push(binary);
        }
        return btoa(parts.join(""));
    }

    private decodeBase64ToUint8(value: string): Uint8Array {
        if (value.length === 0) return new Uint8Array(0);
        try {
            const binary = atob(value);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i += 1) {
                bytes[i] = binary.charCodeAt(i) & 0xff;
            }
            return bytes;
        } catch {
            return new Uint8Array(0);
        }
    }

    private getProjectArrayLength(source: ProjectNumberArray | null | undefined): number {
        if (Array.isArray(source)) return source.length;
        if (!this.isPackedProjectArray(source)) return 0;
        return Math.max(0, Math.floor(source.length));
    }

    private packUint8Array(source: Uint8Array): ProjectNumberArray {
        return {
            encoding: "u8-b64",
            length: source.length,
            data: this.encodeUint8ToBase64(source),
        };
    }

    private packFloat32Array(source: Float32Array): ProjectNumberArray {
        const bytes = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
        return {
            encoding: "f32-b64",
            length: source.length,
            data: this.encodeUint8ToBase64(bytes),
        };
    }

    private packFrameNumbers(source: Uint32Array): ProjectNumberArray {
        if (source.length === 0) {
            return {
                encoding: "u32-delta-varint-b64",
                length: 0,
                data: "",
            };
        }

        const encoded: number[] = [];
        let previous = 0;
        for (let i = 0; i < source.length; i += 1) {
            const current = source[i];
            if (i > 0 && current < previous) {
                // Fallback for unexpected unsorted input.
                return Array.from(source);
            }
            let delta = i === 0 ? current : current - previous;
            previous = current;

            while (delta >= 0x80) {
                encoded.push((delta & 0x7f) | 0x80);
                delta = Math.floor(delta / 128);
            }
            encoded.push(delta & 0x7f);
        }

        return {
            encoding: "u32-delta-varint-b64",
            length: source.length,
            data: this.encodeUint8ToBase64(Uint8Array.from(encoded)),
        };
    }

    private copyProjectArrayToFloat32(source: ProjectNumberArray | null | undefined, destination: Float32Array): void {
        if (Array.isArray(source)) {
            const count = Math.min(source.length, destination.length);
            for (let i = 0; i < count; i += 1) {
                const value = source[i];
                destination[i] = Number.isFinite(value) ? value : 0;
            }
            return;
        }
        if (!this.isPackedProjectArray(source) || source.encoding !== "f32-b64") return;

        const bytes = this.decodeBase64ToUint8(source.data);
        const available = Math.floor(bytes.length / 4);
        const count = Math.min(destination.length, this.getProjectArrayLength(source), available);
        const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        for (let i = 0; i < count; i += 1) {
            destination[i] = dataView.getFloat32(i * 4, true);
        }
    }

    private copyProjectArrayToUint8(source: ProjectNumberArray | null | undefined, destination: Uint8Array): void {
        if (Array.isArray(source)) {
            const count = Math.min(source.length, destination.length);
            for (let i = 0; i < count; i += 1) {
                const value = source[i];
                const normalized = Number.isFinite(value) ? Math.round(value) : 0;
                destination[i] = Math.max(0, Math.min(255, normalized));
            }
            return;
        }
        if (!this.isPackedProjectArray(source) || source.encoding !== "u8-b64") return;

        const bytes = this.decodeBase64ToUint8(source.data);
        const count = Math.min(destination.length, this.getProjectArrayLength(source), bytes.length);
        for (let i = 0; i < count; i += 1) {
            destination[i] = bytes[i];
        }
    }

    private copyProjectArrayToUint32(source: ProjectNumberArray | null | undefined, destination: Uint32Array): void {
        if (Array.isArray(source)) {
            const count = Math.min(source.length, destination.length);
            for (let i = 0; i < count; i += 1) {
                const value = source[i];
                destination[i] = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
            }
            return;
        }
        if (!this.isPackedProjectArray(source) || source.encoding !== "u32-delta-varint-b64") return;

        const bytes = this.decodeBase64ToUint8(source.data);
        const targetCount = Math.min(destination.length, this.getProjectArrayLength(source));
        let byteOffset = 0;
        let previous = 0;

        for (let i = 0; i < targetCount; i += 1) {
            let delta = 0;
            let base = 1;
            let completed = false;
            while (byteOffset < bytes.length) {
                const byteValue = bytes[byteOffset++];
                delta += (byteValue & 0x7f) * base;
                if ((byteValue & 0x80) === 0) {
                    completed = true;
                    break;
                }
                base *= 128;
            }
            if (!completed) break;

            const frame = i === 0 ? delta : previous + delta;
            const normalized = Number.isFinite(frame) ? Math.max(0, Math.floor(frame)) : 0;
            destination[i] = normalized;
            previous = normalized;
        }
    }

    private clearProjectForImport(): void {
        this.pause();
        (this as unknown as { clearAccessories?: () => void }).clearAccessories?.();
        this.clearBackgroundMedia();

        if (this.cameraAnimationHandle !== null) {
            this.mmdCamera.destroyRuntimeAnimation(this.cameraAnimationHandle);
            this.cameraAnimationHandle = null;
        }
        this.hasCameraMotion = false;
        this.cameraKeyframeFrames = EMPTY_KEYFRAME_FRAMES;
        this.cameraMotionPath = null;
        this.cameraSourceAnimation = null;

        if (this.audioPlayer) {
            void this.mmdRuntime.setAudioPlayer(null);
            this.audioPlayer.dispose();
            this.audioPlayer = null;
        }
        if (this.audioBlobUrl) {
            URL.revokeObjectURL(this.audioBlobUrl);
            this.audioBlobUrl = null;
        }
        this.audioSourcePath = null;

        for (const entry of this.sceneModels) {
            this.removeGlobalIlluminationSceneModel(entry);
            try {
                this.mmdRuntime.destroyMmdModel(entry.model as never);
            } catch {
                // no-op
            }
            this.modelKeyframeTracksByModel.delete(entry.model);
            this.modelSourceAnimationsByModel.delete(entry.model);
            this.modelMotionImportsByModel.delete(entry.model);
            this.disposeContactShadowForModel(entry);
            entry.mesh.dispose();
        }

        this.sceneModels = [];
        this.syncLuminousGlowLayer();
        this.currentMesh = null;
        this.currentModel = null;
        this.activeModelInfo = null;
        this.timelineTarget = "camera";

        this._isPlaying = false;
        this.manualPlaybackWithoutAudio = false;
        this.manualPlaybackFrameCursor = 0;
        this._currentFrame = 0;
        this._totalFrames = 300;
        this.mmdRuntime.pauseAnimation();
        this.mmdRuntime.seekAnimation(0, true);

        this.refreshBoneVisualizerTarget();
        this.refreshRigidBodyVisualizerTarget();
        this.updateBoneGizmoTarget();
        this.emitMergedKeyframeTracks();
        this.onFrameUpdate?.(this._currentFrame, this._totalFrames);
    }

    private isProjectFileV1(value: unknown): value is MmdModokiProjectFileV1 {
        if (!value || typeof value !== "object") return false;
        const maybeProject = value as Partial<MmdModokiProjectFileV1>;
        return maybeProject.format === "mmd_modoki_project" && maybeProject.version === 1;
    }
    public exportProjectState(): MmdModokiProjectFileV1 {
        return exportProjectStateImpl(this);
    }

    public async importProjectState(
        data: unknown,
        options: { forExport?: boolean } = {},
    ): Promise<{ loadedModels: number; warnings: string[] }> {
        return importProjectStateImpl(this, data, options);
    }

    /** Current render FPS (rounded) */
    getFps(): number {
        return Math.round(this.engine.getFps());
    }

    private isWebGpuEngine(): boolean {
        return this.engine instanceof WebGPUEngine;
    }

    private isPowerOfTwo(value: number): boolean {
        return value > 0 && (value & (value - 1)) === 0;
    }

    private async inspectImageDimensionsFromUrl(url: string): Promise<{ width: number; height: number } | null> {
        return await new Promise((resolve) => {
            const image = new Image();
            image.onload = () => {
                resolve({
                    width: image.naturalWidth || image.width,
                    height: image.naturalHeight || image.height,
                });
            };
            image.onerror = () => resolve(null);
            image.src = url;
        });
    }

    private async inspectImageDimensionsFromBuffer(arrayBufferOrBlob: ArrayBuffer | Blob): Promise<{ width: number; height: number } | null> {
        const blob = arrayBufferOrBlob instanceof Blob ? arrayBufferOrBlob : new Blob([arrayBufferOrBlob]);

        if (typeof createImageBitmap === "function") {
            try {
                const bitmap = await createImageBitmap(blob);
                try {
                    return { width: bitmap.width, height: bitmap.height };
                } finally {
                    bitmap.close();
                }
            } catch {
                // Fallback to a regular image element below.
            }
        }

        const objectUrl = URL.createObjectURL(blob);
        try {
            return await this.inspectImageDimensionsFromUrl(objectUrl);
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
    }

    private async shouldGenerateMipmapsForWebGpuTextureUrl(url: string): Promise<boolean> {
        const cacheKey = `url:${url}`;
        const cached = this.webGpuTextureMipmapDecisionCache.get(cacheKey);
        if (cached) {
            return await cached;
        }

        const promise = (async () => {
            const dimensions = await this.inspectImageDimensionsFromUrl(url);
            if (!dimensions) {
                return false;
            }
            return this.isPowerOfTwo(dimensions.width) && this.isPowerOfTwo(dimensions.height);
        })();
        this.webGpuTextureMipmapDecisionCache.set(cacheKey, promise);
        return await promise;
    }

    private async shouldGenerateMipmapsForWebGpuTextureBuffer(key: string, arrayBufferOrBlob: ArrayBuffer | Blob): Promise<boolean> {
        const cacheKey = `buffer:${key}`;
        const cached = this.webGpuTextureMipmapDecisionCache.get(cacheKey);
        if (cached) {
            return await cached;
        }

        const promise = (async () => {
            const dimensions = await this.inspectImageDimensionsFromBuffer(arrayBufferOrBlob);
            if (!dimensions) {
                return false;
            }
            return this.isPowerOfTwo(dimensions.width) && this.isPowerOfTwo(dimensions.height);
        })();
        this.webGpuTextureMipmapDecisionCache.set(cacheKey, promise);
        return await promise;
    }

    private configureMmdTextureLoaderForWebGpu(): void {
        if (!this.isWebGpuEngine()) {
            return;
        }

        const sharedBuilder = MmdModelLoader.SharedMaterialBuilder;
        if (!(sharedBuilder instanceof MmdStandardMaterialBuilder)) {
            return;
        }

        type TextureLoaderOptions = { noMipmap?: boolean };
        const textureLoader = ((sharedBuilder as unknown as { [key: string]: unknown })._textureLoader as {
            loadTextureAsync?: (
                uniqueId: unknown,
                rootUrl: string,
                relativeTexturePathOrIndex: string | number,
                scene: unknown,
                assetContainer: unknown,
                options: TextureLoaderOptions,
            ) => Promise<unknown>;
            loadTextureFromBufferAsync?: (
                uniqueId: unknown,
                textureName: string,
                arrayBufferOrBlob: ArrayBuffer | Blob,
                scene: unknown,
                assetContainer: unknown,
                options: TextureLoaderOptions,
                applyPathNormalization?: boolean,
            ) => Promise<unknown>;
        } | undefined);
        if (!textureLoader) {
            return;
        }

        const originalLoadTextureAsync = textureLoader.loadTextureAsync?.bind(textureLoader);
        if (originalLoadTextureAsync) {
            textureLoader.loadTextureAsync = (async (uniqueId, rootUrl, relativeTexturePathOrIndex, scene, assetContainer, options) => {
                const textureOptions = { ...options };
                if (!textureOptions.noMipmap) {
                    if (typeof relativeTexturePathOrIndex === "number") {
                        textureOptions.noMipmap = true;
                    } else {
                        const textureUrl = PathNormalize(rootUrl + relativeTexturePathOrIndex);
                        textureOptions.noMipmap = !(await this.shouldGenerateMipmapsForWebGpuTextureUrl(textureUrl));
                    }
                }

                return await originalLoadTextureAsync(
                    uniqueId,
                    rootUrl,
                    relativeTexturePathOrIndex,
                    scene,
                    assetContainer,
                    textureOptions,
                );
            }) as typeof textureLoader.loadTextureAsync;
        }

        const originalLoadTextureFromBufferAsync = textureLoader.loadTextureFromBufferAsync?.bind(textureLoader);
        if (originalLoadTextureFromBufferAsync) {
            textureLoader.loadTextureFromBufferAsync = (async (uniqueId, textureName, arrayBufferOrBlob, scene, assetContainer, options, applyPathNormalization = true) => {
                const textureOptions = { ...options };
                if (!textureOptions.noMipmap) {
                    const cacheKey = applyPathNormalization ? PathNormalize(textureName) : textureName;
                    textureOptions.noMipmap = !(await this.shouldGenerateMipmapsForWebGpuTextureBuffer(cacheKey, arrayBufferOrBlob));
                }

                return await originalLoadTextureFromBufferAsync(
                    uniqueId,
                    textureName,
                    arrayBufferOrBlob,
                    scene,
                    assetContainer,
                    textureOptions,
                    applyPathNormalization,
                );
            }) as typeof textureLoader.loadTextureFromBufferAsync;
        }
    }

    private configureWebGpuRawTextureUploadForNonPOT(): void {
        if (!this.isWebGpuEngine()) {
            return;
        }

        const engine = this.engine as WebGPUEngine & {
            _uploadDataToTextureDirectly?: (...args: unknown[]) => unknown;
        };
        const originalUploadDataToTextureDirectly = engine._uploadDataToTextureDirectly?.bind(engine);
        if (!originalUploadDataToTextureDirectly) {
            return;
        }

        engine._uploadDataToTextureDirectly = ((
            texture,
            imageData,
            faceIndex = 0,
            lod = 0,
            babylonInternalFormat,
            useTextureWidthAndHeight = false,
        ) => {
            if (!useTextureWidthAndHeight) {
                const textureWidth = typeof texture?.width === "number" ? texture.width : 0;
                const textureHeight = typeof texture?.height === "number" ? texture.height : 0;
                if (textureWidth > 0 && textureHeight > 0 && (!this.isPowerOfTwo(textureWidth) || !this.isPowerOfTwo(textureHeight))) {
                    useTextureWidthAndHeight = true;
                }
            }

            return originalUploadDataToTextureDirectly(
                texture,
                imageData,
                faceIndex,
                lod,
                babylonInternalFormat,
                useTextureWidthAndHeight,
            );
        }) as typeof engine._uploadDataToTextureDirectly;
    }

    private hasPrePassRendererSupport(): boolean {
        if (this.isWebGpuEngine()) {
            // WebGPU compatibility mode in Babylon 8.45.3 can expose prepass APIs
            // while MRT allocation still fails at runtime. Keep prepass off.
            return false;
        }
        const hasEnableFn = typeof (this.scene as Scene & { enablePrePassRenderer?: () => unknown }).enablePrePassRenderer === "function";
        const hasMrtFn = typeof (this.engine as Engine & { createMultipleRenderTarget?: unknown }).createMultipleRenderTarget === "function";
        return hasEnableFn && hasMrtFn;
    }

    private disablePrePassRendererIfSupported(): void {
        const sceneWithPrePass = this.scene as Scene & { disablePrePassRenderer?: () => void };
        if (typeof sceneWithPrePass.disablePrePassRenderer === "function") {
            sceneWithPrePass.disablePrePassRenderer();
        }
    }

    private initializePostEffectBackend(): void {
        if (this.requestedPostEffectBackend !== "frameGraph") {
            this.postEffectBackend = "classic";
            return;
        }

        this.frameGraphPostEffectsController = new FrameGraphPostEffectsController((warning) => {
            logWarn("render", "frame graph post effect backend requested but not active", {
                storageKey: POST_EFFECT_BACKEND_STORAGE_KEY,
                fallback: "classic",
                reason: warning.reason,
                message: warning.message,
                stack: warning.stack,
            });
            this.addRuntimeDiagnostic(warning.message);
            this.disposeFrameGraphPostEffectsSceneColorTarget();
            this.disposeFrameGraphPostEffectsLuminousMaskTarget();
            this.postEffectBackend = "classic";
        }, (info) => {
            logDebugIfEnabled("postfx", "render", "frame graph post effect backend", {
                event: info.event,
                storageKey: POST_EFFECT_BACKEND_STORAGE_KEY,
            });
        }, () => ({
            contrast: this.postEffectContrastValue,
            gammaPower: this.postEffectGammaValue,
            imageProcessingEnabled: this.isFrameGraphImageProcessingTaskNeeded(),
            dofEnabled: this.dofEnabledValue,
            dofBlurLevel: this.dofBlurLevelValue,
            dofFocusDistanceMm: this.dofFocusDistanceMmValue,
            dofEffectiveFStop: this.dofFStopValue,
            dofLensSize: this.dofLensSizeValue,
            dofFocalLength: this.dofFocalLengthValue,
            luminousEnabled: this.postEffectGlowEnabledValue,
            luminousIntensity: this.postEffectGlowIntensityValue,
            luminousThreshold: this.postEffectGlowThresholdValue,
            luminousRadius: this.postEffectGlowKernelValue,
            bloomEnabled: this.postEffectBloomEnabledValue,
            bloomWeight: this.postEffectBloomWeightValue,
            bloomThreshold: this.postEffectBloomThresholdValue,
            bloomKernel: this.postEffectBloomKernelValue,
            vignetteEnabled: this.postEffectVignetteEnabledValue,
            vignetteWeight: this.postEffectVignetteWeightValue,
            edgeBlurStrength: this.dofLensEdgeBlurValue,
            lensDistortion: this.dofLensDistortionValue,
            chromaticAberration: this.postEffectChromaticAberrationValue,
            grainIntensity: this.postEffectGrainIntensityValue,
            sharpenEdge: this.postEffectSharpenEdgeValue,
            ssaoEnabled: this.postEffectSsaoEnabledValue,
            ssaoStrength: this.postEffectSsaoStrengthValue,
            ssaoRadius: this.postEffectSsaoRadiusValue,
            ssaoShadowColor: this.getShadowColor(),
            ssaoToonInfluence: this.toonShadowInfluenceValue,
            ssrEnabled: this.postEffectSsrEnabledValue,
            ssrStrength: this.postEffectSsrStrengthValue,
            ssrStep: this.postEffectSsrStepValue,
            lutEnabled: this.postEffectLutEnabledValue && isLutSourceReadyImpl(this),
            lutIntensity: this.postEffectLutIntensityValue,
            lutRuntimeText: this.getFrameGraphPostEffectLutRuntimeText(),
            lutTextureKey: this.getFrameGraphPostEffectLutTextureKey(),
            antialiasEnabled: this.antialiasEnabledValue,
        }));

        this.configureDofDepthRenderer();
        const sourceTexture = this.createFrameGraphPostEffectsSceneColorTarget();
        const luminousMaskTexture = this.createFrameGraphPostEffectsLuminousMaskTarget();
        const depthTexture = this.depthRenderer?.getDepthMap().getInternalTexture() ?? null;
        const activated = this.frameGraphPostEffectsController.activate(
            this.scene,
            sourceTexture?.getInternalTexture() ?? null,
            depthTexture,
            this.camera,
            this.getFrameGraphPostEffectRuntimeOrder(),
            luminousMaskTexture?.getInternalTexture() ?? null,
        );
        if (!activated) {
            this.disposeFrameGraphPostEffectsSceneColorTarget();
            this.disposeFrameGraphPostEffectsLuminousMaskTarget();
        }
        this.postEffectBackend = activated ? "frameGraph" : "classic";
    }

    private isFrameGraphImageProcessingTaskNeeded(): boolean {
        const epsilon = 1e-4;
        return this.postEffectToneMappingEnabledValue
            || this.postEffectDitheringEnabledValue
            || this.postEffectColorCurvesEnabledValue
            || Math.abs(this.postEffectExposureValue - 1) > epsilon;
    }

    private getFrameGraphPostEffectLutRuntimeText(): string | null {
        if (!this.postEffectLutEnabledValue || !isLutSourceReadyImpl(this)) {
            return null;
        }
        if (this.postEffectLutSourceModeValue === "builtin") {
            return MmdManager.POST_EFFECT_LUT_TEXT_BY_ID[this.postEffectLutPresetValue] ?? null;
        }
        return this.postEffectLutExternalTextValue;
    }

    private getFrameGraphPostEffectLutTextureKey(): string | null {
        if (!this.postEffectLutEnabledValue || !isLutSourceReadyImpl(this)) {
            return null;
        }
        if (this.postEffectLutSourceModeValue === "builtin") {
            return `builtin:${this.postEffectLutPresetValue}`;
        }
        return [
            "external",
            this.postEffectLutSourceModeValue,
            this.postEffectLutExternalPathValue ?? "",
            this.postEffectLutExternalSourceFormatValue ?? "",
            String(this.postEffectLutExternalRevision),
        ].join(":");
    }

    private createFrameGraphPostEffectsSceneColorTarget(): RenderTargetTexture | null {
        if (!this.camera) {
            return null;
        }
        this.disposeFrameGraphPostEffectsSceneColorTarget();
        const size = this.getFrameGraphPostEffectsRenderTargetSize();

        const renderTarget = new RenderTargetTexture(
            "frameGraphPostEffectsSceneColor",
            size,
            this.scene,
            {
                generateMipMaps: false,
                doNotChangeAspectRatio: true,
                generateDepthBuffer: true,
                generateStencilBuffer: true,
                samples: 1,
            },
        );
        renderTarget.activeCamera = this.camera;
        renderTarget.renderList = [];
        // Use the camera custom RT path instead of scene.customRenderTargets:
        // camera RTs are collected after active-mesh evaluation, which is
        // closer to the normal camera render path used by the editor viewport.
        renderTarget.getCustomRenderList = () => this.scene.meshes;
        renderTarget.renderParticles = true;
        renderTarget.renderSprites = true;
        renderTarget.skipInitialClear = false;
        this.camera.customRenderTargets.push(renderTarget);
        this.frameGraphPostEffectsSceneColorTarget = renderTarget;
        return renderTarget;
    }

    private createFrameGraphPostEffectsLuminousMaskTarget(): RenderTargetTexture | null {
        if (!this.camera) {
            return null;
        }
        this.disposeFrameGraphPostEffectsLuminousMaskTarget();
        const size = this.getFrameGraphPostEffectsRenderTargetSize();

        const renderTarget = new RenderTargetTexture(
            "frameGraphPostEffectsLuminousMask",
            size,
            this.scene,
            {
                generateMipMaps: false,
                doNotChangeAspectRatio: true,
                generateDepthBuffer: true,
                generateStencilBuffer: false,
                samples: 1,
            },
        );
        renderTarget.activeCamera = this.camera;
        renderTarget.renderList = [];
        renderTarget.getCustomRenderList = () => this.scene.meshes;
        renderTarget.renderParticles = false;
        renderTarget.renderSprites = false;
        renderTarget.skipInitialClear = false;
        renderTarget.clearColor = new Color4(0, 0, 0, 1);
        renderTarget.onBeforeRenderObservable.add(() => {
            this.frameGraphPostEffectsLuminousMaskRenderedSubMeshCount = 0;
        });
        renderTarget.onAfterRenderObservable.add(() => {
            this.reportFrameGraphLuminousMaskDiagnostics();
        });
        renderTarget.customRenderFunction = (
            opaqueSubMeshes,
            alphaTestSubMeshes,
            transparentSubMeshes,
            _depthOnlySubMeshes,
            beforeTransparents,
        ) => {
            this.renderFrameGraphLuminousMaskSubMeshes(opaqueSubMeshes, false);
            this.renderFrameGraphLuminousMaskSubMeshes(alphaTestSubMeshes, false);
            beforeTransparents?.();
            const previousAlphaMode = this.engine.getAlphaMode();
            this.renderFrameGraphLuminousMaskSubMeshes(transparentSubMeshes, true);
            this.engine.setAlphaMode(previousAlphaMode);
        };
        this.camera.customRenderTargets.push(renderTarget);
        this.frameGraphPostEffectsLuminousMaskTarget = renderTarget;
        return renderTarget;
    }

    private renderFrameGraphLuminousMaskSubMeshes(
        subMeshes: SmartArray<SubMesh>,
        enableAlphaMode: boolean,
    ): void {
        for (let i = 0; i < subMeshes.length; i++) {
            const subMesh = subMeshes.data[i];
            if (!subMesh) {
                continue;
            }
            const material = subMesh.getMaterial() as MmdManagerMaterialLike | null;
            if (!material || this.isMaterialVisible(material) === false) {
                continue;
            }
            const renderingMesh = subMesh.getRenderingMesh();
            const maskState = getFrameGraphLuminousMaskMaterialStateImpl(this, renderingMesh, material);
            if (!maskState) {
                continue;
            }
            const replacementMesh = subMesh.getReplacementMesh();
            const renderPassId = this.frameGraphPostEffectsLuminousMaskTarget?.renderPassId;
            const maskMaterial = this.configureFrameGraphLuminousMaskMaterial(
                maskState.color,
                maskState.alpha,
                maskState.texture,
            );
            if (renderPassId === undefined || !maskMaterial) {
                continue;
            }
            const previousRenderPassMaterial = renderingMesh.getMaterialForRenderPass(renderPassId);
            renderingMesh.setMaterialForRenderPass(renderPassId, maskMaterial);
            try {
                renderingMesh.render(subMesh, enableAlphaMode, replacementMesh || undefined);
                this.frameGraphPostEffectsLuminousMaskRenderedSubMeshCount += 1;
            } finally {
                renderingMesh.setMaterialForRenderPass(renderPassId, previousRenderPassMaterial);
            }
        }
    }

    private reportFrameGraphLuminousMaskDiagnostics(): void {
        if (this.postEffectBackend !== "frameGraph" || !this.postEffectGlowEnabledValue) {
            return;
        }
        const renderedCount = this.frameGraphPostEffectsLuminousMaskRenderedSubMeshCount;
        if (renderedCount > 0) {
            logDebugIfEnabled("postfx", "render", "frame graph luminous mask rendered", {
                subMeshCount: renderedCount,
            });
            this.frameGraphPostEffectsLuminousMaskZeroWarningEmitted = false;
            return;
        }
        if (this.sceneModels.length === 0 || this.frameGraphPostEffectsLuminousMaskZeroWarningEmitted) {
            return;
        }
        this.frameGraphPostEffectsLuminousMaskZeroWarningEmitted = true;
        const message = "FrameGraph Luminous is enabled, but no AutoLuminous material submeshes were rendered into the luminous mask.";
        logWarn("render", "frame graph luminous mask has no AutoLuminous submeshes", {
            modelCount: this.sceneModels.length,
            stack: [...this.getFrameGraphPostEffectStackIds()],
        });
        this.addRuntimeDiagnostic(message);
    }

    private configureFrameGraphLuminousMaskMaterial(
        color: Color3,
        alpha: number,
        texture: Texture | null,
    ): StandardMaterial | null {
        const material = this.ensureFrameGraphLuminousMaskMaterial();
        if (!material) {
            return null;
        }
        const clampedAlpha = Math.max(0, Math.min(1, alpha));
        material.diffuseColor.copyFrom(color);
        material.ambientColor.copyFrom(color);
        material.emissiveColor.copyFrom(color);
        material.alpha = clampedAlpha;
        material.diffuseTexture = texture;
        material.emissiveTexture = texture;
        material.opacityTexture = null;
        material.useAlphaFromDiffuseTexture = Boolean(texture?.hasAlpha);
        material.transparencyMode = texture?.hasAlpha || clampedAlpha < 0.999
            ? Material.MATERIAL_ALPHABLEND
            : Material.MATERIAL_OPAQUE;
        material.markAsDirty(Material.AllDirtyFlag);
        return material;
    }

    private ensureFrameGraphLuminousMaskMaterial(): StandardMaterial | null {
        if (this.frameGraphPostEffectsLuminousMaskMaterial) {
            return this.frameGraphPostEffectsLuminousMaskMaterial;
        }
        const material = new StandardMaterial("frameGraphPostEffectsLuminousMaskMaterial", this.scene);
        material.disableLighting = true;
        material.backFaceCulling = false;
        material.specularColor = Color3.Black();
        material.emissiveColor = Color3.White();
        material.diffuseColor = Color3.White();
        material.ambientColor = Color3.White();
        material.forceDepthWrite = true;
        this.frameGraphPostEffectsLuminousMaskMaterial = material;
        return material;
    }

    private getFrameGraphPostEffectsRenderTargetSize(): { width: number; height: number } {
        return {
            width: Math.max(1, this.engine.getRenderWidth()),
            height: Math.max(1, this.engine.getRenderHeight()),
        };
    }

    private refreshFrameGraphPostEffectsBackendAfterResize(): void {
        if (this.postEffectBackend !== "frameGraph" || !this.frameGraphPostEffectsController) {
            return;
        }
        this.disposeFrameGraphPostEffectsController();
        this.initializePostEffectBackend();
    }

    private disposeFrameGraphPostEffectsSceneColorTarget(): void {
        if (!this.frameGraphPostEffectsSceneColorTarget) {
            return;
        }
        const index = this.camera?.customRenderTargets.indexOf(this.frameGraphPostEffectsSceneColorTarget) ?? -1;
        if (index >= 0) {
            this.camera?.customRenderTargets.splice(index, 1);
        }
        this.frameGraphPostEffectsSceneColorTarget.dispose();
        this.frameGraphPostEffectsSceneColorTarget = null;
    }

    private disposeFrameGraphPostEffectsLuminousMaskTarget(): void {
        if (!this.frameGraphPostEffectsLuminousMaskTarget) {
            return;
        }
        const index = this.camera?.customRenderTargets.indexOf(this.frameGraphPostEffectsLuminousMaskTarget) ?? -1;
        if (index >= 0) {
            this.camera?.customRenderTargets.splice(index, 1);
        }
        this.frameGraphPostEffectsLuminousMaskTarget.dispose();
        this.frameGraphPostEffectsLuminousMaskTarget = null;
        this.frameGraphPostEffectsLuminousMaskMaterial?.dispose();
        this.frameGraphPostEffectsLuminousMaskMaterial = null;
        this.frameGraphPostEffectsLuminousMaskRenderedSubMeshCount = 0;
        this.frameGraphPostEffectsLuminousMaskZeroWarningEmitted = false;
    }

    private executePostEffectBackend(): void {
        if (this.postEffectBackend !== "frameGraph") {
            return;
        }
        this.frameGraphPostEffectsController?.execute();
    }

    private renderBoneGizmoUtilityLayerAfterPostEffects(): void {
        if (this.postEffectBackend !== "frameGraph") {
            return;
        }
        const utilityLayer = this.boneGizmoManager?.utilityLayer as { render?: () => void } | undefined;
        utilityLayer?.render?.();
    }

    private disposeFrameGraphPostEffectsController(): void {
        if (!this.frameGraphPostEffectsController) {
            return;
        }
        this.frameGraphPostEffectsController.dispose();
        this.frameGraphPostEffectsController = null;
        this.disposeFrameGraphPostEffectsSceneColorTarget();
        this.disposeFrameGraphPostEffectsLuminousMaskTarget();
    }

    private shutdownPostEffectBackend(): void {
        if (this.postEffectBackend === "frameGraph") {
            // Future Frame Graph backends should detach before classic post
            // effects are disposed.
        }
        this.postEffectBackend = "classic";
        this.disposeFrameGraphPostEffectsController();
    }

    getPostEffectBackend(): PostEffectBackend {
        return this.postEffectBackend;
    }

    getFrameGraphPostEffectsExecutedFrameCount(): number {
        return this.frameGraphPostEffectsController?.getExecutedFrameCount() ?? 0;
    }

    getFrameGraphPostEffectsLuminousMaskRenderedSubMeshCount(): number {
        return this.frameGraphPostEffectsLuminousMaskRenderedSubMeshCount;
    }

    public getFrameGraphPostEffectStackIds(): readonly FrameGraphPostEffectId[] {
        return normalizeFrameGraphPostEffectIds(
            this.frameGraphPostEffectStackIdsValue,
            this.getActiveFrameGraphPostEffectIds(),
        );
    }

    public setFrameGraphPostEffectStackIds(ids: readonly FrameGraphPostEffectId[]): void {
        const normalized = normalizeFrameGraphPostEffectIds(ids);
        if (this.areFrameGraphPostEffectIdsEqual(this.frameGraphPostEffectStackIdsValue, normalized)) {
            return;
        }
        this.frameGraphPostEffectStackIdsValue = normalized;
        this.refreshFrameGraphPostEffectsBackendForOrderChange();
    }

    public getFrameGraphPostEffectStackEntries(): FrameGraphPostEffectStackEntry[] {
        return this.getFrameGraphPostEffectStackIds().map((id) => ({
            id,
            enabled: this.isFrameGraphPostEffectActive(id),
        }));
    }

    public getFrameGraphPostEffectRuntimeOrder(): readonly FrameGraphPostEffectId[] {
        return normalizeFrameGraphPostEffectIds(
            this.getFrameGraphPostEffectStackIds(),
            FRAME_GRAPH_POST_EFFECT_IDS,
        );
    }

    public isFrameGraphPostEffectActive(id: FrameGraphPostEffectId): boolean {
        switch (id) {
            case "ssr":
                return this.postEffectSsrEnabledValue;
            case "ssao":
                return this.postEffectSsaoEnabledValue;
            case "dof":
                return this.dofEnabledValue;
            case "luminous":
                return this.postEffectGlowEnabledValue;
            case "bloom":
                return this.postEffectBloomEnabledValue;
            case "lut":
                return this.postEffectLutEnabledValue;
            case "sharpen":
                return this.postEffectSharpenEdgeValue > 0.000001;
            case "grain":
                return this.postEffectGrainIntensityValue > 0.000001;
            case "chromatic":
                return this.postEffectChromaticAberrationValue > 0.000001;
            case "vignette":
                return this.postEffectVignetteEnabledValue;
            case "edgeBlur":
                return this.dofLensEdgeBlurValue > 0.000001;
            case "distortion":
                return Math.abs(this.dofLensDistortionValue) > 0.000001
                    || Math.abs(this.dofLensDistortionInfluenceValue) > 0.000001;
        }
    }

    private getActiveFrameGraphPostEffectIds(): FrameGraphPostEffectId[] {
        return FRAME_GRAPH_POST_EFFECT_IDS.filter((id) => this.isFrameGraphPostEffectActive(id));
    }

    private areFrameGraphPostEffectIdsEqual(
        a: readonly FrameGraphPostEffectId[],
        b: readonly FrameGraphPostEffectId[],
    ): boolean {
        return a.length === b.length && a.every((id, index) => id === b[index]);
    }

    private refreshFrameGraphPostEffectsBackendForOrderChange(): void {
        if (this.postEffectBackend !== "frameGraph" || !this.frameGraphPostEffectsController) {
            return;
        }
        this.disposeFrameGraphPostEffectsController();
        this.initializePostEffectBackend();
    }

    private getPostProcessShaderLanguage(): ShaderLanguage {
        return this.isWebGpuEngine() ? ShaderLanguage.WGSL : ShaderLanguage.GLSL;
    }

    /** Engine type string: "WebGL2", "WebGL1", or "WebGPU" */
    getEngineType(): string {
        if (this.isWebGpuEngine()) return "WebGPU";
        return (this.engine as Engine).webGLVersion >= 2 ? "WebGL2" : "WebGL1";
    }

    consumeRuntimeDiagnosticSummary(): string | null {
        const diagnostics = [...this.runtimeDiagnostics];
        this.runtimeDiagnostics.clear();
        if (diagnostics.length === 0) {
            return null;
        }
        if (diagnostics.length === 1) {
            return diagnostics[0];
        }
        const preview = diagnostics.slice(0, 2).join(" / ");
        const suffix = diagnostics.length > 2 ? ` (+${diagnostics.length - 2} more)` : "";
        return `Rendering warnings: ${preview}${suffix}`;
    }

    /** High-level shader/runtime label shown beside the engine badge. */
    getShaderRuntimeLabel(): "WGSL-first" | "WGSL-custom" | "GLSL" {
        if (!this.isWebGpuEngine()) {
            return "GLSL";
        }

        for (const entry of this.sceneModels) {
            for (const materialEntry of entry.materials) {
                if (getExternalWgslToonShaderPathForMaterialImpl(this, materialEntry.material)) {
                    return "WGSL-custom";
                }
                if (getWgslMaterialShaderPresetForMaterialImpl(this, materialEntry.material) !== MmdManager.DEFAULT_WGSL_MATERIAL_SHADER_PRESET) {
                    return "WGSL-custom";
                }
            }
        }

        return "WGSL-first";
    }

    getPhysicsBackendLabel(): PhysicsBackendLabel {
        return this.physicsController.getBackendLabel();
    }

    private addRuntimeDiagnostic(message: string): void {
        this.runtimeDiagnostics.add(message);
    }

    private copyBgraToRgba(source: Uint8Array, target: Uint8Array, width: number, height: number): void {
        const pixelCount = width * height;
        for (let i = 0; i < pixelCount; i += 1) {
            const offset = i * 4;
            target[offset + 0] = source[offset + 2];
            target[offset + 1] = source[offset + 1];
            target[offset + 2] = source[offset + 0];
            target[offset + 3] = source[offset + 3];
        }
    }

    private async captureCurrentFramebufferPngRgbaData(
        width: number | null,
        height: number | null,
    ): Promise<{ width: number; height: number; rgbaData: Uint8Array } | null> {
        const sourceWidth = Math.max(1, Math.floor(this.engine.getRenderWidth(true) || this.renderingCanvas.width || 1));
        const sourceHeight = Math.max(1, Math.floor(this.engine.getRenderHeight(true) || this.renderingCanvas.height || 1));
        const outputWidth = width ?? sourceWidth;
        const outputHeight = height ?? sourceHeight;
        const engine = this.engine as typeof this.engine & {
            readPixels: (
                x: number,
                y: number,
                width: number,
                height: number,
                hasAlpha?: boolean,
                flushRenderer?: boolean,
                data?: Uint8Array | null,
            ) => Promise<ArrayBufferView>;
            flushFramebuffer?: () => void;
        };

        engine.flushFramebuffer?.();
        const pixelData = await engine.readPixels(0, 0, sourceWidth, sourceHeight, true, true, null);
        const source = pixelData instanceof Uint8Array
            ? pixelData
            : new Uint8Array(pixelData.buffer, pixelData.byteOffset, pixelData.byteLength);
        const rgbaData = new Uint8Array(source.byteLength);
        if (this.engine instanceof WebGPUEngine) {
            this.copyBgraToRgba(source, rgbaData, sourceWidth, sourceHeight);
        } else {
            rgbaData.set(source);
        }

        const sourceCanvas = document.createElement("canvas");
        sourceCanvas.width = sourceWidth;
        sourceCanvas.height = sourceHeight;
        const sourceContext = sourceCanvas.getContext("2d");
        if (!sourceContext) return null;
        sourceContext.putImageData(new ImageData(new Uint8ClampedArray(rgbaData.buffer), sourceWidth, sourceHeight), 0, 0);

        const outputCanvas = document.createElement("canvas");
        outputCanvas.width = outputWidth;
        outputCanvas.height = outputHeight;
        const outputContext = outputCanvas.getContext("2d");
        if (!outputContext) return null;
        outputContext.drawImage(sourceCanvas, 0, 0, sourceWidth, sourceHeight, 0, 0, outputWidth, outputHeight);
        const outputImage = outputContext.getImageData(0, 0, outputWidth, outputHeight);
        return {
            width: outputWidth,
            height: outputHeight,
            rgbaData: new Uint8Array(outputImage.data),
        };
    }

    async capturePngRgbaData(
        precisionOrOptions: number | { precision?: number; width?: number; height?: number } = 1
    ): Promise<{ width: number; height: number; rgbaData: Uint8Array } | null> {
        try {
            const options = typeof precisionOrOptions === "number"
                ? { precision: precisionOrOptions }
                : (precisionOrOptions ?? {});
            const clampedPrecision = Math.max(0.25, Math.min(4, options.precision ?? 1));
            const requestedWidth = options.width;
            const requestedHeight = options.height;
            const width = typeof requestedWidth === "number" && Number.isFinite(requestedWidth)
                ? Math.max(320, Math.min(8192, Math.floor(requestedWidth)))
                : Math.max(320, Math.min(8192, Math.floor(this.engine.getRenderWidth(true) * clampedPrecision)));
            const height = typeof requestedHeight === "number" && Number.isFinite(requestedHeight)
                ? Math.max(180, Math.min(8192, Math.floor(requestedHeight)))
                : Math.max(180, Math.min(8192, Math.floor(this.engine.getRenderHeight(true) * clampedPrecision)));

            return await this.captureCurrentFramebufferPngRgbaData(width, height);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("Failed to capture PNG RGBA:", message);
            this.onError?.(`PNG RGBA capture error: ${message}`);
            return null;
        }
    }

    getRenderingCanvasClientRect(): { x: number; y: number; width: number; height: number } {
        const rect = this.renderingCanvas.getBoundingClientRect();
        return {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
        };
    }

    /** Capture current viewport as PNG data URL */
    async capturePngDataUrl(
        precisionOrOptions: number | { precision?: number; width?: number; height?: number } = 1
    ): Promise<string | null> {
        try {
            const options = typeof precisionOrOptions === "number"
                ? { precision: precisionOrOptions }
                : (precisionOrOptions ?? {});
            const clampedPrecision = Math.max(0.25, Math.min(4, options.precision ?? 1));
            const requestedWidth = options.width;
            const requestedHeight = options.height;
            const width = typeof requestedWidth === "number" && Number.isFinite(requestedWidth)
                ? Math.max(320, Math.min(8192, Math.floor(requestedWidth)))
                : null;
            const height = typeof requestedHeight === "number" && Number.isFinite(requestedHeight)
                ? Math.max(180, Math.min(8192, Math.floor(requestedHeight)))
                : null;
            const screenshotSize = width !== null && height !== null
                ? { width, height }
                : { precision: clampedPrecision };

            if (this.mirroringFloorEnabledValue && this.scene.frameGraph) {
                // Babylon's screenshot helpers can conflict with MirrorTexture + FrameGraph
                // on WebGPU. Read the visible framebuffer directly, matching the WebM
                // webgpu-copy capture path.
                const rgbaFrame = await this.captureCurrentFramebufferPngRgbaData(width, height);
                if (!rgbaFrame) return null;
                const canvas = document.createElement("canvas");
                canvas.width = rgbaFrame.width;
                canvas.height = rgbaFrame.height;
                const context = canvas.getContext("2d");
                if (!context) return null;
                context.putImageData(new ImageData(new Uint8ClampedArray(rgbaFrame.rgbaData), rgbaFrame.width, rgbaFrame.height), 0, 0);
                return canvas.toDataURL("image/png");
            }

            return await CreateScreenshotUsingRenderTargetAsync(
                this.engine,
                this.camera,
                screenshotSize,
                "image/png",
                1,
                true
            );
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("Failed to capture PNG:", message);
            this.onError?.(`PNG capture error: ${message}`);
            return null;
        }
    }
    get volume(): number {
        return this.audioPlayer?.volume ?? 1;
    }
    set volume(value: number) {
        if (this.audioPlayer) {
            this.audioPlayer.volume = Math.max(0, Math.min(1, value));
        }
    }

    /** Whether audio is muted (playing silently) */
    get muted(): boolean {
        return this.audioPlayer?.muted ?? false;
    }
    async toggleMute(): Promise<void> {
        if (!this.audioPlayer) return;
        if (this.audioPlayer.muted) {
            await this.audioPlayer.unmute();
        } else {
            this.audioPlayer.mute();
        }
    }

    /** Post-process contrast (0.0=flat, 1.0=neutral, up to 3.0 for stronger effect) */
    get postEffectContrast(): number {
        return this.postEffectContrastValue;
    }
    set postEffectContrast(v: number) {
        this.postEffectContrastValue = Math.max(0, Math.min(3, v));
    }

    /** Gamma power for mid-tone correction (1.0 = neutral). */
    get postEffectGamma(): number {
        return this.postEffectGammaValue;
    }
    set postEffectGamma(v: number) {
        this.postEffectGammaValue = Math.max(0.25, Math.min(4, v));
    }

    /** Image-processing exposure scale (1.0 = neutral). */
    get postEffectExposure(): number {
        return this.postEffectExposureValue;
    }
    set postEffectExposure(v: number) {
        this.postEffectExposureValue = Math.max(0, Math.min(8, v));
        this.applyImageProcessingSettings();
    }

    /** Image-processing tone mapping enabled state. */
    get postEffectToneMappingEnabled(): boolean {
        return this.postEffectToneMappingEnabledValue;
    }
    set postEffectToneMappingEnabled(v: boolean) {
        this.postEffectToneMappingEnabledValue = Boolean(v);
        this.applyImageProcessingSettings();
    }

    /** Image-processing tone mapping operator type. */
    get postEffectToneMappingType(): number {
        return this.postEffectToneMappingTypeValue;
    }
    set postEffectToneMappingType(v: number) {
        const normalized = Math.floor(v);
        const allowed = new Set<number>([
            ImageProcessingConfiguration.TONEMAPPING_STANDARD,
            ImageProcessingConfiguration.TONEMAPPING_ACES,
            ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL,
        ]);
        this.postEffectToneMappingTypeValue = allowed.has(normalized)
            ? normalized
            : ImageProcessingConfiguration.TONEMAPPING_STANDARD;
        this.applyImageProcessingSettings();
    }

    /** Image-processing dithering enabled state. */
    get postEffectDitheringEnabled(): boolean {
        return this.postEffectDitheringEnabledValue;
    }
    set postEffectDitheringEnabled(v: boolean) {
        this.postEffectDitheringEnabledValue = Boolean(v);
        this.applyImageProcessingSettings();
    }

    /** Image-processing dithering intensity (0.0..1.0). */
    get postEffectDitheringIntensity(): number {
        return this.postEffectDitheringIntensityValue;
    }
    set postEffectDitheringIntensity(v: number) {
        this.postEffectDitheringIntensityValue = Math.max(0, Math.min(1, v));
        this.applyImageProcessingSettings();
    }

    /** Image-processing vignette enabled state. */
    get postEffectVignetteEnabled(): boolean {
        return this.postEffectVignetteEnabledValue;
    }
    set postEffectVignetteEnabled(v: boolean) {
        this.postEffectVignetteEnabledValue = Boolean(v);
        this.applyImageProcessingSettings();
    }

    /** Image-processing vignette weight (0.0..4.0). */
    get postEffectVignetteWeight(): number {
        return this.postEffectVignetteWeightValue;
    }
    set postEffectVignetteWeight(v: number) {
        this.postEffectVignetteWeightValue = Math.max(0, Math.min(4, v));
        this.applyImageProcessingSettings();
    }

    /** Default pipeline bloom enabled state for grouped bloom controls. */
    get postEffectBloomEnabled(): boolean {
        return this.postEffectBloomEnabledValue;
    }
    set postEffectBloomEnabled(v: boolean) {
        this.postEffectBloomEnabledValue = Boolean(v);
        this.applyDefaultPipelinePostProcessSettings();
    }

    /** Default pipeline bloom weight (0.0..2.0, 0 = OFF). */
    get postEffectBloomWeight(): number {
        return this.postEffectBloomWeightValue;
    }
    set postEffectBloomWeight(v: number) {
        this.postEffectBloomWeightValue = Math.max(0, Math.min(2, v));
        this.applyDefaultPipelinePostProcessSettings();
    }

    /** Default pipeline bloom threshold (0.0..2.0). */
    get postEffectBloomThreshold(): number {
        return this.postEffectBloomThresholdValue;
    }
    set postEffectBloomThreshold(v: number) {
        this.postEffectBloomThresholdValue = Math.max(0, Math.min(2, v));
        this.applyDefaultPipelinePostProcessSettings();
    }

    /** Default pipeline bloom kernel (1..256). */
    get postEffectBloomKernel(): number {
        return this.postEffectBloomKernelValue;
    }
    set postEffectBloomKernel(v: number) {
        this.postEffectBloomKernelValue = Math.max(1, Math.min(256, Math.round(v)));
        this.applyDefaultPipelinePostProcessSettings();
    }

    /** Default pipeline chromatic aberration amount (0..200, 0 = OFF). */
    get postEffectChromaticAberration(): number {
        return this.postEffectChromaticAberrationValue;
    }
    set postEffectChromaticAberration(v: number) {
        this.postEffectChromaticAberrationValue = Math.max(0, Math.min(200, v));
        this.applyDefaultPipelinePostProcessSettings();
    }

    /** Default pipeline grain intensity (0..100, 0 = OFF). */
    get postEffectGrainIntensity(): number {
        return this.postEffectGrainIntensityValue;
    }
    set postEffectGrainIntensity(v: number) {
        this.postEffectGrainIntensityValue = Math.max(0, Math.min(100, v));
        this.applyDefaultPipelinePostProcessSettings();
    }

    /** Default pipeline sharpen edge amount (0.0..4.0, 0 = OFF). */
    get postEffectSharpenEdge(): number {
        return this.postEffectSharpenEdgeValue;
    }
    set postEffectSharpenEdge(v: number) {
        this.postEffectSharpenEdgeValue = Math.max(0, Math.min(4, v));
        this.applyDefaultPipelinePostProcessSettings();
    }
    /** SSAO2 enabled state. */
    get postEffectSsaoEnabled(): boolean {
        return this.postEffectSsaoEnabledValue;
    }
    set postEffectSsaoEnabled(v: boolean) {
        this.postEffectSsaoEnabledValue = Boolean(v);
        this.applySsaoSettings();
    }
    /** SSAO2 intensity (0.0..2.0). */
    get postEffectSsaoStrength(): number {
        return this.postEffectSsaoStrengthValue;
    }
    set postEffectSsaoStrength(v: number) {
        this.postEffectSsaoStrengthValue = Math.max(0, Math.min(2, v));
        this.applySsaoSettings();
    }
    /** SSAO2 sampling radius (0.01..2.0). */
    get postEffectSsaoRadius(): number {
        return this.postEffectSsaoRadiusValue;
    }
    set postEffectSsaoRadius(v: number) {
        this.postEffectSsaoRadiusValue = Math.max(0.01, Math.min(2, v));
        this.applySsaoSettings();
    }

    /** SSAO fade-out end distance in meters (4..200). */
    get postEffectSsaoFadeEnd(): number {
        return this.postEffectSsaoFadeEndValue;
    }
    set postEffectSsaoFadeEnd(v: number) {
        this.postEffectSsaoFadeEndValue = Math.max(4, Math.min(200, v));
        this.applySsaoSettings();
    }

    /** SSAO debug view state. */
    get postEffectSsaoDebugView(): boolean {
        return this.postEffectSsaoDebugViewValue;
    }
    set postEffectSsaoDebugView(v: boolean) {
        this.postEffectSsaoDebugViewValue = Boolean(v);
        this.applySsaoSettings();
    }

    /** Color curves enabled state. */
    get postEffectColorCurvesEnabled(): boolean {
        return this.postEffectColorCurvesEnabledValue;
    }
    set postEffectColorCurvesEnabled(v: boolean) {
        this.postEffectColorCurvesEnabledValue = Boolean(v);
        this.applyImageProcessingSettings();
    }

    /** Color curves hue (0..360). */
    get postEffectColorCurvesHue(): number {
        return this.postEffectColorCurvesHueValue;
    }
    set postEffectColorCurvesHue(v: number) {
        this.postEffectColorCurvesHueValue = Math.max(0, Math.min(360, v));
        this.applyImageProcessingSettings();
    }

    /** Color curves density (-100..100). */
    get postEffectColorCurvesDensity(): number {
        return this.postEffectColorCurvesDensityValue;
    }
    set postEffectColorCurvesDensity(v: number) {
        this.postEffectColorCurvesDensityValue = Math.max(-100, Math.min(100, v));
        this.applyImageProcessingSettings();
    }

    /** Color curves saturation (-100..100). */
    get postEffectColorCurvesSaturation(): number {
        return this.postEffectColorCurvesSaturationValue;
    }
    set postEffectColorCurvesSaturation(v: number) {
        this.postEffectColorCurvesSaturationValue = Math.max(-100, Math.min(100, v));
        this.applyImageProcessingSettings();
    }

    /** Color curves exposure (-100..100). */
    get postEffectColorCurvesExposure(): number {
        return this.postEffectColorCurvesExposureValue;
    }
    set postEffectColorCurvesExposure(v: number) {
        this.postEffectColorCurvesExposureValue = Math.max(-100, Math.min(100, v));
        this.applyImageProcessingSettings();
    }

    /** LuminousGlow enabled state. */
    get postEffectGlowEnabled(): boolean {
        return this.postEffectGlowEnabledValue;
    }
    set postEffectGlowEnabled(v: boolean) {
        this.postEffectGlowEnabledValue = Boolean(v);
        this.applyDefaultPipelinePostProcessSettings();
    }

    /** LuminousGlow intensity (0..4). */
    get postEffectGlowIntensity(): number {
        return this.postEffectGlowIntensityValue;
    }
    set postEffectGlowIntensity(v: number) {
        this.postEffectGlowIntensityValue = Math.max(0, Math.min(4, v));
        this.applyDefaultPipelinePostProcessSettings();
    }

    /** LuminousGlow threshold (0..1.5). */
    get postEffectGlowThreshold(): number {
        return this.postEffectGlowThresholdValue;
    }
    set postEffectGlowThreshold(v: number) {
        this.postEffectGlowThresholdValue = Math.max(0, Math.min(1.5, v));
        this.applyDefaultPipelinePostProcessSettings();
    }

    /** LuminousGlow kernel size (1..256). */
    get postEffectGlowKernel(): number {
        return this.postEffectGlowKernelValue;
    }
    set postEffectGlowKernel(v: number) {
        this.postEffectGlowKernelValue = Math.max(1, Math.min(256, Math.round(v)));
        this.applyDefaultPipelinePostProcessSettings();
    }

    /** LUT enabled state. */
    get postEffectLutEnabled(): boolean {
        return this.postEffectLutEnabledValue;
    }
    set postEffectLutEnabled(v: boolean) {
        this.postEffectLutEnabledValue = Boolean(v);
        this.applyImageProcessingSettings();
    }

    /** LUT intensity (0..2). */
    get postEffectLutIntensity(): number {
        return this.postEffectLutIntensityValue;
    }
    set postEffectLutIntensity(v: number) {
        this.postEffectLutIntensityValue = Math.max(0, Math.min(2, v));
        this.applyImageProcessingSettings();
    }

    /** LUT preset id. */
    get postEffectLutPreset(): string {
        return this.postEffectLutPresetValue;
    }
    set postEffectLutPreset(v: string) {
        const normalized = typeof v === "string" ? v.trim().toLowerCase() : "anime-soft";
        this.postEffectLutPresetValue = MmdManager.POST_EFFECT_LUT_PRESETS.some((preset) => preset.id === normalized)
            ? normalized
            : "anime-soft";
        this.applyImageProcessingSettings();
    }

    /** LUT source mode. */
    get postEffectLutSourceMode(): PostEffectLutSourceMode {
        return this.postEffectLutSourceModeValue;
    }
    set postEffectLutSourceMode(v: PostEffectLutSourceMode) {
        const normalized = typeof v === "string" ? v.trim().toLowerCase() : "builtin";
        this.postEffectLutSourceModeValue = normalized === "external-absolute" || normalized === "project-relative"
            ? normalized
            : "builtin";
        this.applyImageProcessingSettings();
    }

    /** External LUT source path. */
    get postEffectLutExternalPath(): string | null {
        return this.postEffectLutExternalPathValue;
    }

    /** Set external LUT source path/text. */
    public setPostEffectExternalLut(path: string | null, text: string | null, sourceFormat: "3dl" | "cube" | null = null): void {
        setPostEffectExternalLutImpl(this, path, text, sourceFormat);
    }

    /** Motion blur enabled state. */
    get postEffectMotionBlurEnabled(): boolean {
        return getPostEffectMotionBlurEnabledImpl(this);
    }
    set postEffectMotionBlurEnabled(v: boolean) {
        setPostEffectMotionBlurEnabledImpl(this, v);
    }

    /** Motion blur strength (0..2). */
    get postEffectMotionBlurStrength(): number {
        return getPostEffectMotionBlurStrengthImpl(this);
    }
    set postEffectMotionBlurStrength(v: number) {
        setPostEffectMotionBlurStrengthImpl(this, v);
    }

    /** Motion blur sample count (8..64). */
    get postEffectMotionBlurSamples(): number {
        return getPostEffectMotionBlurSamplesImpl(this);
    }
    set postEffectMotionBlurSamples(v: number) {
        setPostEffectMotionBlurSamplesImpl(this, v);
    }

    /** SSR enabled state. */
    get postEffectSsrEnabled(): boolean {
        return getPostEffectSsrEnabledImpl(this);
    }
    set postEffectSsrEnabled(v: boolean) {
        setPostEffectSsrEnabledImpl(this, v);
    }

    /** SSR reflection strength (0..2). */
    get postEffectSsrStrength(): number {
        return getPostEffectSsrStrengthImpl(this);
    }
    set postEffectSsrStrength(v: number) {
        setPostEffectSsrStrengthImpl(this, v);
    }

    /** SSR step size (1..8). */
    get postEffectSsrStep(): number {
        return getPostEffectSsrStepImpl(this);
    }
    set postEffectSsrStep(v: number) {
        setPostEffectSsrStepImpl(this, v);
    }

    /** Volumetric light enabled state. */
    get postEffectVlsEnabled(): boolean {
        return getPostEffectVlsEnabledImpl(this);
    }
    set postEffectVlsEnabled(v: boolean) {
        setPostEffectVlsEnabledImpl(this, v);
    }

    /** Volumetric light exposure (0..2). */
    get postEffectVlsExposure(): number {
        return getPostEffectVlsExposureImpl(this);
    }
    set postEffectVlsExposure(v: number) {
        setPostEffectVlsExposureImpl(this, v);
    }

    /** Volumetric light decay (0..1). */
    get postEffectVlsDecay(): number {
        return getPostEffectVlsDecayImpl(this);
    }
    set postEffectVlsDecay(v: number) {
        setPostEffectVlsDecayImpl(this, v);
    }

    /** Volumetric light weight (0..1). */
    get postEffectVlsWeight(): number {
        return getPostEffectVlsWeightImpl(this);
    }
    set postEffectVlsWeight(v: number) {
        setPostEffectVlsWeightImpl(this, v);
    }

    /** Volumetric light density (0..2). */
    get postEffectVlsDensity(): number {
        return getPostEffectVlsDensityImpl(this);
    }
    set postEffectVlsDensity(v: number) {
        setPostEffectVlsDensityImpl(this, v);
    }

    /** Fog enabled state. */
    get postEffectFogEnabled(): boolean {
        return getPostEffectFogEnabledImpl(this);
    }
    set postEffectFogEnabled(v: boolean) {
        setPostEffectFogEnabledImpl(this, v);
    }

    /** Fog mode is fixed to Exp2. */
    get postEffectFogMode(): number {
        return getPostEffectFogModeImpl(this);
    }
    set postEffectFogMode(_v: number) {
        setPostEffectFogModeImpl(this, _v);
    }

    /** Fog start distance for linear mode. */
    get postEffectFogStart(): number {
        return getPostEffectFogStartImpl(this);
    }
    set postEffectFogStart(v: number) {
        setPostEffectFogStartImpl(this, v);
    }

    /** Fog end distance for linear mode. */
    get postEffectFogEnd(): number {
        return getPostEffectFogEndImpl(this);
    }
    set postEffectFogEnd(v: number) {
        setPostEffectFogEndImpl(this, v);
    }

    /** Fog density for exponential modes. */
    get postEffectFogDensity(): number {
        return getPostEffectFogDensityImpl(this);
    }
    set postEffectFogDensity(v: number) {
        setPostEffectFogDensityImpl(this, v);
    }

    get postEffectFogOpacity(): number {
        return getPostEffectFogOpacityImpl(this);
    }
    set postEffectFogOpacity(v: number) {
        setPostEffectFogOpacityImpl(this, v);
    }

    getPostEffectFogColor(): { r: number; g: number; b: number } {
        return getPostEffectFogColorImpl(this);
    }

    setPostEffectFogColor(r: number, g: number, b: number): void {
        setPostEffectFogColorImpl(this, r, g, b);
    }
    /** Post-process anti-aliasing enabled state. */
    get antialiasEnabled(): boolean {
        return getAntialiasEnabledImpl(this);
    }
    set antialiasEnabled(v: boolean) {
        setAntialiasEnabledImpl(this, v);
    }

    /** Editor-style depth of field enabled state. */
    get dofEnabled(): boolean {
        return getDofEnabledImpl(this);
    }
    set dofEnabled(v: boolean) {
        setDofEnabledImpl(this, v);
    }

    /** Editor-style depth of field blur quality (0=Low, 1=Medium, 2=High). */
    get dofBlurLevel(): number {
        return getDofBlurLevelImpl(this);
    }
    set dofBlurLevel(v: number) {
        setDofBlurLevelImpl(this, v);
    }

    /** DoF focus distance in scene units/1000 (mm). */
    get dofFocusDistanceMm(): number {
        return getDofFocusDistanceMmImpl(this);
    }
    set dofFocusDistanceMm(v: number) {
        setDofFocusDistanceMmImpl(this, v);
    }

    /** Whether focus distance follows camera target each frame. */
    get dofAutoFocusEnabled(): boolean {
        return getDofAutoFocusEnabledImpl(this);
    }
    /** In-focus radius used by auto-focus mode (meters). */
    get dofAutoFocusRangeMeters(): number {
        return getDofAutoFocusRangeMetersImpl(this);
    }
    /** Signed auto-focus offset from camera target in mm. Positive moves nearer, negative moves farther. */
    get dofAutoFocusNearOffsetMm(): number {
        return getDofAutoFocusNearOffsetMmImpl(this);
    }
    set dofAutoFocusNearOffsetMm(v: number) {
        setDofAutoFocusNearOffsetMmImpl(this, v);
    }
    /** Foreground blur suppression scale for auto-focus near side. */
    get dofNearSuppressionScale(): number {
        return getDofNearSuppressionScaleImpl(this);
    }
    set dofNearSuppressionScale(v: number) {
        setDofNearSuppressionScaleImpl(this, v);
    }
    /** Current effective F-stop after auto-focus compensation. */
    get dofEffectiveFStop(): number {
        return getDofEffectiveFStopImpl(this);
    }

    /** DoF F-stop. Smaller value means stronger blur. */
    get dofFStop(): number {
        return getDofFStopImpl(this);
    }
    set dofFStop(v: number) {
        setDofFStopImpl(this, v);
    }



    /** Whether lens-blur highlights are enabled. */
    get dofLensBlurEnabled(): boolean {
        return getDofLensBlurEnabledImpl(this);
    }
    set dofLensBlurEnabled(v: boolean) {
        setDofLensBlurEnabledImpl(this, v);
    }

    /** Additional lens-blur strength for bright highlights (0.0..1.0). */
    get dofLensBlurStrength(): number {
        return getDofLensBlurStrengthImpl(this);
    }
    set dofLensBlurStrength(v: number) {
        setDofLensBlurStrengthImpl(this, v);
    }

    /** Lens edge blur strength (0.0..3.0). */
    get dofLensEdgeBlur(): number {
        return getDofLensEdgeBlurImpl(this);
    }
    set dofLensEdgeBlur(v: number) {
        setDofLensEdgeBlurImpl(this, v);
    }

    /** Lens distortion strength (-1.0..1.0). */
    get dofLensDistortion(): number {
        return getDofLensDistortionImpl(this);
    }
    set dofLensDistortion(v: number) {
        setDofLensDistortionImpl(this, v);
    }
    get dofLensDistortionLinkedToCameraFov(): boolean {
        return getDofLensDistortionLinkedToCameraFovImpl(this);
    }
    /** Distortion influence scale for FoV-linked distortion (0.0..1.0). */
    get dofLensDistortionInfluence(): number {
        return getDofLensDistortionInfluenceImpl(this);
    }
    set dofLensDistortionInfluence(v: number) {
        setDofLensDistortionInfluenceImpl(this, v);
    }
    /** DoF lens size in scene units/1000 (mm). */
    get dofLensSize(): number {
        return getDofLensSizeImpl(this);
    }
    set dofLensSize(v: number) {
        setDofLensSizeImpl(this, v);
    }

    /** DoF focal length in scene units/1000 (mm). */
    get dofFocalLength(): number {
        return getDofFocalLengthImpl(this);
    }
    set dofFocalLength(v: number) {
        setDofFocalLengthImpl(this, v);
    }
    /** Whether camera-distance-linked DoF focal length mapping is inverted. */
    get dofFocalLengthDistanceInverted(): boolean {
        return getDofFocalLengthDistanceInvertedImpl(this);
    }
    set dofFocalLengthDistanceInverted(v: boolean) {
        setDofFocalLengthDistanceInvertedImpl(this, v);
    }
    /** Whether DoF focal length is linked to camera FoV. */
    /** @deprecated Use dofFocalLengthLinkedToCameraFov. */
    get dofFocalLengthLinkedToCameraDistance(): boolean {
        return getDofFocalLengthLinkedToCameraDistanceImpl(this);
    }
    get dofFocalLengthLinkedToCameraFov(): boolean {
        return getDofFocalLengthLinkedToCameraFovImpl(this);
    }
    /** Far background depth-of-field strength (0.0..1.0). */
    get postEffectFarDofStrength(): number {
        return getPostEffectFarDofStrengthImpl(this);
    }
    set postEffectFarDofStrength(v: number) {
        setPostEffectFarDofStrengthImpl(this, v);
    }

    /** Model outline scale. 1.0 keeps PMX edge color/visibility/width as-is. */
    get modelEdgeWidth(): number {
        return this.modelEdgeWidthValue;
    }
    set modelEdgeWidth(v: number) {
        this.modelEdgeWidthValue = Math.max(0, Math.min(2, v));
        this.applyModelEdgeToAllModels();
    }

    /** Light color temperature in Kelvin (1000..20000). */
    get lightColorTemperature(): number {
        return this.lightColorTemperatureKelvin;
    }
    set lightColorTemperature(kelvin: number) {
        this.lightColorTemperatureKelvin = Math.max(1000, Math.min(20000, Math.round(kelvin)));
        this.applyLightColorTemperature();
    }

    get lightIntensity(): number { return this.dirLight.intensity; }
    set lightIntensity(v: number) { this.dirLight.intensity = Math.max(0, Math.min(2, v)); }

    getLightColor(): { r: number; g: number; b: number } {
        return getLightColorImpl(this);
    }

    setLightColor(r: number, g: number, b: number): void {
        return setLightColorImpl(this, r, g, b);
    }

    get lightFlatStrength(): number {
        return this.lightFlatStrengthValue;
    }

    set lightFlatStrength(v: number) {
        this.lightFlatStrengthValue = Math.max(0, Math.min(0.1, v));
        this.applyToonShadowInfluenceToAllModels();
    }

    get lightFlatColorInfluence(): number {
        return this.lightFlatColorInfluenceValue;
    }

    set lightFlatColorInfluence(v: number) {
        this.lightFlatColorInfluenceValue = this.clampColor01(v);
        MmdManager.toonFlatLightColorInfluence = this.lightFlatColorInfluenceValue;
        this.applyToonShadowInfluenceToAllModels();
    }

    getShadowColor(): { r: number; g: number; b: number } {
        return getShadowColorImpl(this);
    }

    setShadowColor(r: number, g: number, b: number): void {
        return setShadowColorImpl(this, r, g, b);
    }

    get ambientIntensity(): number { return this.hemiLight.intensity; }
    set ambientIntensity(v: number) { this.hemiLight.intensity = Math.max(0, Math.min(2, v)); }

    get toonShadowInfluence(): number {
        return this.toonShadowInfluenceValue;
    }

    set toonShadowInfluence(v: number) {
        this.toonShadowInfluenceValue = this.clampColor01(v);
        this.applyToonShadowInfluenceToAllModels();
    }

    /** Shadow darkness (0.0=no shadow, 1.0=full black shadow) */
    get shadowDarkness(): number { return this.shadowDarknessValue; }
    set shadowDarkness(v: number) {
        this.shadowDarknessValue = Math.max(0, Math.min(1, v));
        if (this.shadowEnabled) {
            this.shadowGenerator.darkness = this.shadowDarknessValue;
        }
    }

    get shadowFrustumSize(): number { return this.shadowFrustumSizeValue; }
    set shadowFrustumSize(v: number) {
        this.shadowFrustumSizeValue = this.clampShadowFrustumSize(v);
        this.applyShadowFrustumSize();
        if (this.dirLight) {
            const direction = this.getSerializedLightDirection();
            this.setLightDirection(direction.x, direction.y, direction.z);
        }
    }

    get shadowMaxZ(): number {
        return getShadowMaxZImpl(this);
    }
    set shadowMaxZ(v: number) {
        setShadowMaxZImpl(this, v);
    }

    get shadowBias(): number {
        return getShadowBiasImpl(this);
    }
    set shadowBias(v: number) {
        setShadowBiasImpl(this, v);
    }

    get shadowNormalBias(): number {
        return getShadowNormalBiasImpl(this);
    }
    set shadowNormalBias(v: number) {
        setShadowNormalBiasImpl(this, v);
    }

    get shadowFilteringQuality(): number {
        return this.shadowFilteringQualityValue;
    }
    set shadowFilteringQuality(v: number) {
        const fallback = ShadowGenerator.QUALITY_MEDIUM;
        const rounded = Math.round(Number.isFinite(v) ? v : fallback);
        this.shadowFilteringQualityValue = Math.max(ShadowGenerator.QUALITY_HIGH, Math.min(ShadowGenerator.QUALITY_LOW, rounded));
        if (this.shadowGenerator) {
            this.shadowGenerator.filteringQuality = this.shadowFilteringQualityValue;
            this.engine.releaseEffects();
        }
    }

    get softTransparentShadowEnabled(): boolean {
        return this.softTransparentShadowEnabledValue;
    }
    set softTransparentShadowEnabled(v: boolean) {
        this.softTransparentShadowEnabledValue = Boolean(v);
        if (this.shadowGenerator) {
            this.shadowGenerator.transparencyShadow = true;
            this.shadowGenerator.enableSoftTransparentShadow = this.softTransparentShadowEnabledValue;
            this.shadowGenerator.useOpacityTextureForTransparentShadow = true;
            this.engine.releaseEffects();
        }
    }

    get iblShadowsEnabled(): boolean {
        return this.iblShadowsEnabledValue;
    }
    set iblShadowsEnabled(v: boolean) {
        this.setIblShadowsEnabled(v);
    }

    getShadowEnabled(): boolean {
        return getShadowEnabledImpl(this);
    }
    setShadowEnabled(enabled: boolean): void {
        return setShadowEnabledImpl(this, enabled);
    }

    /** Shadow edge softness for contact hardening (0.005..0.12) */
    get shadowEdgeSoftness(): number {
        return this.getEffectiveShadowEdgeSoftness();
    }
    set shadowEdgeSoftness(v: number) {
        const clamped = this.clampShadowEdgeSoftness(v);
        this.selfShadowEdgeSoftnessValue = clamped;
        this.occlusionShadowEdgeSoftnessValue = clamped;
        this.applyShadowEdgeSoftness();
    }

    get selfShadowEdgeSoftness(): number {
        return this.selfShadowEdgeSoftnessValue;
    }
    set selfShadowEdgeSoftness(v: number) {
        this.selfShadowEdgeSoftnessValue = this.clampShadowEdgeSoftness(v);
        this.applyShadowEdgeSoftness();
    }

    get occlusionShadowEdgeSoftness(): number {
        return this.occlusionShadowEdgeSoftnessValue;
    }
    set occlusionShadowEdgeSoftness(v: number) {
        this.occlusionShadowEdgeSoftnessValue = this.clampShadowEdgeSoftness(v);
        this.applyShadowEdgeSoftness();
    }

    private clampShadowEdgeSoftness(v: number): number {
        return Math.max(0.005, Math.min(0.12, v));
    }

    private clampShadowFrustumSize(v: number): number {
        return Math.max(120, Math.min(6000, v));
    }

    private getEffectiveShadowEdgeSoftness(): number {
        return (this.selfShadowEdgeSoftnessValue + this.occlusionShadowEdgeSoftnessValue) * 0.5;
    }

    applyShadowFrustumSize(): void {
        return applyShadowFrustumSizeImpl(this);
    }

    applyShadowEdgeSoftness(): void {
        return applyShadowEdgeSoftnessImpl(this);
    }

    /** Set directional light direction from editor XYZ vector. */
    setLightDirection(x: number, y: number, z: number): void {
        return setLightDirectionImpl(this, x, y, z);
    }

    /** Current normalized directional light vector. */
    getLightDirection(): Vector3 {
        return getLightDirectionImpl(this);
    }

    /** Current editor light vector before normalization. */
    getSerializedLightDirection(): Vector3 {
        return getSerializedLightDirectionImpl(this);
    }

    applyLightColorTemperature(): void {
        return applyLightColorTemperatureImpl(this);
    }

    private clampColor01(v: number): number {
        if (!Number.isFinite(v)) return 0;
        return Math.max(0, Math.min(1, v));
    }

    private clampLightColorScale(v: number): number {
        if (!Number.isFinite(v)) return 1;
        return Math.max(0, Math.min(2, v));
    }

    private kelvinToColor(kelvin: number): Color3 {
        const temp = Math.max(10, Math.min(200, kelvin / 100));
        let red: number;
        let green: number;
        let blue: number;

        if (temp <= 66) {
            red = 255;
            green = 99.4708025861 * Math.log(temp) - 161.1195681661;
            blue = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
        } else {
            red = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
            green = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
            blue = 255;
        }

        const clamp01 = (v: number) => Math.max(0, Math.min(1, v / 255));
        return new Color3(clamp01(red), clamp01(green), clamp01(blue));
    }

    private initializeDofPipeline(): void {
        try {
            this.setupEditorDofPipeline();
            if (this.farDofEnabled) {
                this.setupFarDofPostProcess();
            } else {
                this.postEffectFarDofStrengthValue = 0;
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`DoF pipeline initialization failed on ${this.getEngineType()}. DoF features were disabled. Reason: ${message}`);
            this.addRuntimeDiagnostic(`DoF disabled on ${this.getEngineType()}.`);

            this.dofEnabledValue = false;
            this.postEffectFarDofStrengthValue = 0;

            if (this.dofPostProcess) {
                this.dofPostProcess.dispose(this.camera);
                this.dofPostProcess = null;
            }
            if (this.finalAntialiasPostProcess) {
                this.finalAntialiasPostProcess.dispose(this.camera);
                this.finalAntialiasPostProcess = null;
            }
            if (this.finalLensDistortionPostProcess) {
                this.finalLensDistortionPostProcess.dispose(this.camera);
                this.finalLensDistortionPostProcess = null;
            }
            if (this.lensRenderingPipeline) {
                this.lensRenderingPipeline.dispose(false);
                this.lensRenderingPipeline = null;
            }
            if (this.ssaoRenderingPipeline) {
                this.ssaoRenderingPipeline.dispose(true);
                this.ssaoRenderingPipeline = null;
            }
            if (this.ssaoPostProcess) {
                this.ssaoPostProcess.dispose(this.camera);
                this.ssaoPostProcess = null;
            }
            if (this.ssrRenderingPipeline) {
                this.ssrRenderingPipeline.dispose(false);
                this.ssrRenderingPipeline = null;
            }
            this.disablePrePassRendererIfSupported();
            if (this.motionBlurPostProcess) {
                this.motionBlurPostProcess.dispose(this.camera);
                this.motionBlurPostProcess = null;
            }
            if (this.standaloneBloomEffect) {
                this.standaloneBloomEffect.disposeEffects(this.camera);
                this.standaloneBloomEffect = null;
            }
            if (this.luminousGlowLayer) {
                this.luminousGlowLayer.dispose();
                this.luminousGlowLayer = null;
            }
            if (this.luminousGlowCoreLayer) {
                this.luminousGlowCoreLayer.dispose();
                this.luminousGlowCoreLayer = null;
            }
            if (this.standaloneLensBlurPostProcess) {
                this.standaloneLensBlurPostProcess.dispose(this.camera);
                this.standaloneLensBlurPostProcess = null;
            }
            if (this.standaloneEdgeBlurPostProcess) {
                this.standaloneEdgeBlurPostProcess.dispose(this.camera);
                this.standaloneEdgeBlurPostProcess = null;
            }
            if (this.volumetricLightPostProcess) {
                this.volumetricLightPostProcess.dispose(this.camera);
                this.volumetricLightPostProcess = null;
            }
            if (this.originFogPostProcess) {
                this.originFogPostProcess.dispose(this.camera);
                this.originFogPostProcess = null;
            }
            if (this.defaultRenderingPipeline) {
                this.defaultRenderingPipeline.dispose();
                this.defaultRenderingPipeline = null;
            }
            if (this.depthRenderer) {
                this.depthRenderer.dispose();
                this.depthRenderer = null;
                MmdManager.toonContactAoDepthRenderer = null;
            }
            if (this.ssaoDepthRenderer) {
                this.disposeSsaoDepthRenderer();
            }
            if (MmdManager.toonContactAoFallbackTexture) {
                MmdManager.toonContactAoFallbackTexture.dispose();
                MmdManager.toonContactAoFallbackTexture = null;
            }
        }
    }

    private setupColorCorrectionPostProcess(): void {
        if (this.postEffectBackend === "frameGraph") {
            return;
        }
        const shaderKey = "mmdColorCorrectionFragmentShader";
        if (!Effect.ShadersStore[shaderKey]) {
            Effect.ShadersStore[shaderKey] = `
                precision highp float;
                varying vec2 vUV;
                uniform sampler2D textureSampler;
                uniform float contrast;
                uniform float gammaPower;

                void main(void) {
                    vec4 color = texture2D(textureSampler, vUV);
                    vec3 contrasted = ((color.rgb - vec3(0.5)) * contrast) + vec3(0.5);
                    vec3 corrected = pow(max(contrasted, vec3(0.0)), vec3(gammaPower));
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
                    var contrasted: vec3f = ((color.rgb - vec3f(0.5)) * uniforms.contrast) + vec3f(0.5);
                    let safeGamma: f32 = max(uniforms.gammaPower, 0.0001);
                    let corrected: vec3f = pow(max(contrasted, vec3f(0.0)), vec3f(safeGamma));
                    fragmentOutputs.color = vec4f(corrected, color.a);
                }
            `;
        }

        this.colorCorrectionPostProcess = new PostProcess(
            "colorCorrection",
            "mmdColorCorrection",
            {
                uniforms: ["contrast", "gammaPower"],
                size: 1.0,
                camera: this.camera,
                samplingMode: Texture.BILINEAR_SAMPLINGMODE,
                engine: this.engine,
                reusable: false,
                shaderLanguage: this.getPostProcessShaderLanguage(),
            },
        );
        this.colorCorrectionPostProcess.onApplyObservable.add((effect) => {
            effect.setFloat("contrast", this.postEffectContrastValue);
            effect.setFloat("gammaPower", this.postEffectGammaValue);
        });
    }

    private setupEditorDofPipeline(): void {
        if (this.defaultRenderingPipeline) {
            this.defaultRenderingPipeline.dispose();
            this.defaultRenderingPipeline = null;
        }
        if (this.lensRenderingPipeline) {
            this.lensRenderingPipeline.dispose(false);
            this.lensRenderingPipeline = null;
        }
        if (this.ssaoRenderingPipeline) {
            this.ssaoRenderingPipeline.dispose(true);
            this.ssaoRenderingPipeline = null;
        }
        if (this.ssaoPostProcess) {
            this.ssaoPostProcess.dispose(this.camera);
            this.ssaoPostProcess = null;
        }
        if (this.ssrRenderingPipeline) {
            this.ssrRenderingPipeline.dispose(false);
            this.ssrRenderingPipeline = null;
        }
        this.disablePrePassRendererIfSupported();
        if (this.motionBlurPostProcess) {
            this.motionBlurPostProcess.dispose(this.camera);
            this.motionBlurPostProcess = null;
        }
        if (this.standaloneBloomEffect) {
            this.standaloneBloomEffect.disposeEffects(this.camera);
            this.standaloneBloomEffect = null;
        }
        if (this.luminousGlowLayer) {
            this.luminousGlowLayer.dispose();
            this.luminousGlowLayer = null;
        }
        if (this.luminousGlowCoreLayer) {
            this.luminousGlowCoreLayer.dispose();
            this.luminousGlowCoreLayer = null;
        }
        if (this.standaloneLensBlurPostProcess) {
            this.standaloneLensBlurPostProcess.dispose(this.camera);
            this.standaloneLensBlurPostProcess = null;
        }
        if (this.standaloneEdgeBlurPostProcess) {
            this.standaloneEdgeBlurPostProcess.dispose(this.camera);
            this.standaloneEdgeBlurPostProcess = null;
        }
        if (this.volumetricLightPostProcess) {
            this.volumetricLightPostProcess.dispose(this.camera);
            this.volumetricLightPostProcess = null;
        }
        if (this.originFogPostProcess) {
            this.originFogPostProcess.dispose(this.camera);
            this.originFogPostProcess = null;
        }

        this.defaultRenderingPipeline = new DefaultRenderingPipeline(
            "DefaultRenderingPipeline",
            false,
            this.scene,
            [this.camera]
        );

        this.defaultRenderingPipeline.samples = 4;
        this.defaultRenderingPipeline.fxaaEnabled = false;
        this.defaultRenderingPipeline.glowLayerEnabled = false;
        this.applyImageProcessingSettings();
        this.applyDefaultPipelinePostProcessSettings();
        this.applySsaoSettings();
        this.applySsrSettings();
        this.applyFogSettings();

        this.configureDofDepthRenderer();
        this.setupOriginFogPostProcess();
        if (this.dofLensDistortionFollowsCameraFov) {
            this.updateDofLensDistortionFromCameraFov();
        }
        this.setupLensHighlightsPipeline();
        this.defaultRenderingPipeline.depthOfFieldBlurLevel = this.dofBlurLevelValue;
        this.applyEditorDofSettings();
        this.setupFinalLensDistortionPostProcess();
        this.applyAntialiasSettings();
        this.applyVolumetricLightSettings();
        this.applyMotionBlurSettings();
        this.enforceFinalPostProcessOrder();
    }

        private isImageProcessingEffectsEnabled(): boolean {
        return isImageProcessingEffectsEnabledImpl(this);
    }

        private applyImageProcessingSettings(): void {
        return applyImageProcessingSettingsImpl(this);
    }

        private isLutSourceReady(): boolean {
        return isLutSourceReadyImpl(this);
    }

        private applyLutSettings(): void {
        return applyLutSettingsImpl(this);
    }

        private getOrCreateLutPresetBlobUrl(presetId: string): string {
        return getOrCreateLutPresetBlobUrlImpl(this, presetId);
    }

        private getOrCreateExternalLutBlobUrl(): string {
        return getOrCreateExternalLutBlobUrlImpl(this);
    }

        private applyDefaultPipelinePostProcessSettings(): void {
        return applyDefaultPipelinePostProcessSettingsImpl(this);
    }

        private syncShaderContactAoState(): void {
        return syncShaderContactAoStateImpl(this);
    }

        private applySsaoSettings(): void {
        return applySsaoSettingsImpl(this);
    }

        private ensureSsaoFallbackPostProcess(initialDepthMap?: Texture | null): void {
        return ensureSsaoFallbackPostProcessImpl(this, initialDepthMap);
    }

        private shouldUseToonTintedSsaoComposite(): boolean {
        return shouldUseToonTintedSsaoCompositeImpl(this);
    }

        private getSsaoPostProcessScale(): number {
        return getSsaoPostProcessScaleImpl(this);
    }

        private applySsrSettings(): void {
        return applySsrSettingsImpl(this);
    }

        private applyMotionBlurSettings(): void {
        return applyMotionBlurSettingsImpl(this);
    }

    

        private applyVolumetricLightSettings(): void {
        return applyVolumetricLightSettingsImpl(this);
    }

        private ensureSimpleSsaoShader(): void {
        return ensureSimpleSsaoShaderImpl();
    }
    private ensureSimpleMotionBlurShader(): void {
        const shaderKey = "mmdSimpleMotionBlurFragmentShader";
        if (!Effect.ShadersStore[shaderKey]) {
            Effect.ShadersStore[shaderKey] = `
                precision highp float;
                varying vec2 vUV;
                uniform sampler2D textureSampler;
                uniform vec2 blurDirection;
                uniform float blurAmount;

                vec4 sampleClamped(vec2 uv) {
                    return texture2D(textureSampler, clamp(uv, vec2(0.0), vec2(1.0)));
                }

                void main(void) {
                    float dirLen = length(blurDirection);
                    if (blurAmount < 0.00001 || dirLen < 0.00001) {
                        gl_FragColor = texture2D(textureSampler, vUV);
                        return;
                    }

                    vec2 dir = normalize(blurDirection) * blurAmount;
                    vec4 color = sampleClamped(vUV) * 0.28;
                    color += sampleClamped(vUV + dir * 0.25) * 0.18;
                    color += sampleClamped(vUV - dir * 0.25) * 0.18;
                    color += sampleClamped(vUV + dir * 0.5) * 0.14;
                    color += sampleClamped(vUV - dir * 0.5) * 0.14;
                    color += sampleClamped(vUV + dir * 0.9) * 0.04;
                    color += sampleClamped(vUV - dir * 0.9) * 0.04;
                    gl_FragColor = color;
                }
            `;
        }

        if (!ShaderStore.ShadersStoreWGSL[shaderKey]) {
            ShaderStore.ShadersStoreWGSL[shaderKey] = `
                varying vUV: vec2f;
                var textureSamplerSampler: sampler;
                var textureSampler: texture_2d<f32>;
                uniform blurDirection: vec2f;
                uniform blurAmount: f32;

                fn sampleClamped(uv: vec2f) -> vec4f {
                    let clampedUv = clamp(uv, vec2f(0.0), vec2f(1.0));
                    return textureSample(textureSampler, textureSamplerSampler, clampedUv);
                }

                #define CUSTOM_FRAGMENT_DEFINITIONS
                @fragment
                fn main(input: FragmentInputs)->FragmentOutputs {
                    let dirLen = length(uniforms.blurDirection);
                    if (uniforms.blurAmount < 0.00001 || dirLen < 0.00001) {
                        fragmentOutputs.color = textureSample(textureSampler, textureSamplerSampler, input.vUV);
                        return fragmentOutputs;
                    }

                    let dir = normalize(uniforms.blurDirection) * uniforms.blurAmount;
                    var color = sampleClamped(input.vUV) * 0.28;
                    color += sampleClamped(input.vUV + dir * 0.25) * 0.18;
                    color += sampleClamped(input.vUV - dir * 0.25) * 0.18;
                    color += sampleClamped(input.vUV + dir * 0.5) * 0.14;
                    color += sampleClamped(input.vUV - dir * 0.5) * 0.14;
                    color += sampleClamped(input.vUV + dir * 0.9) * 0.04;
                    color += sampleClamped(input.vUV - dir * 0.9) * 0.04;
                    fragmentOutputs.color = color;
                }
            `;
        }
    }

        private updateSimpleMotionBlurState(deltaMs: number): void {
        return updateSimpleMotionBlurStateImpl(this, deltaMs);
    }
        private applyFogSettings(): void {
        return applyFogSettingsImpl(this);
    }

        private setupOriginFogPostProcess(): void {
        return setupOriginFogPostProcessImpl(this);
    }

        private setupFinalLensDistortionPostProcess(): void {
        return setupFinalLensDistortionPostProcessImpl(this);
    }

        private applyAntialiasSettings(): void {
        return applyAntialiasSettingsImpl(this);
    }

        private enforceFinalPostProcessOrder(): void {
        return enforceFinalPostProcessOrderImpl(this);
    }

    

        private setupLensHighlightsPipeline(): void {
        return setupLensHighlightsPipelineImpl(this);
    }
        private applyDofLensOpticsSettings(): void {
        return applyDofLensOpticsSettingsImpl(this);
    }
        private applyEditorDofSettings(): void {
        return applyEditorDofSettingsImpl(this);
    }
        private applyDofLensBlurSettings(): void {
        return applyDofLensBlurSettingsImpl(this);
    }
        private updateEditorDofFocusAndFStop(): void {
        return updateEditorDofFocusAndFStopImpl(this);
    }
        private updateDofLensDistortionFromCameraFov(): void {
        return updateDofLensDistortionFromCameraFovImpl(this);
    }
        private updateDofFocalLengthFromCameraFov(): void {
        return updateDofFocalLengthFromCameraFovImpl(this);
    }
        private computeAdjustedAutoMinFStop(baseFStop: number, autoMinFStop: number, focusDistanceMm: number): number {
        return computeAdjustedAutoMinFStopImpl(this, baseFStop, autoMinFStop, focusDistanceMm);
    }

        private computeAutoFocusMinFStop(focusDistanceMm: number): number {
        return computeAutoFocusMinFStopImpl(this, focusDistanceMm);
    }
        private configureDofDepthRenderer(): void {
        return configureDofDepthRendererImpl(this);
    }
        private configureSsaoDepthRenderer(): void {
        return configureSsaoDepthRendererImpl(this);
    }
        private disposeSsaoDepthRenderer(): void {
        return disposeSsaoDepthRendererImpl(this);
    }
    private setupFarDofPostProcess(): void {
        return setupFarDofPostProcessImpl(this);
    }

    private findSceneModelEntryByPath(modelPath: string): SceneModelEntry | null {
        for (const entry of this.sceneModels) {
            if (entry.info.path === modelPath) {
                return entry;
            }
        }
        return null;
    }

    private normalizeDofFocusBoneName(name: string): string {
        return name.trim().replace(/\s+/g, "").toLowerCase();
    }

    public getPreferredDofFocusBoneName(modelIndex: number): string | null {
        const modelEntry = this.sceneModels[modelIndex];
        if (!modelEntry) return null;
        return this.findPreferredDofFocusBoneName(modelEntry.info.boneNames);
    }

    private findPreferredDofFocusBoneName(boneNames: readonly string[]): string | null {
        if (!Array.isArray(boneNames) || boneNames.length === 0) {
            return null;
        }

        const normalizedToActual = new Map<string, string>();
        for (const boneName of boneNames) {
            if (typeof boneName !== "string") continue;
            const normalized = this.normalizeDofFocusBoneName(boneName);
            if (!normalizedToActual.has(normalized)) {
                normalizedToActual.set(normalized, boneName);
            }
        }

        for (const candidate of DOF_FOCUS_BONE_CANDIDATES) {
            const actual = normalizedToActual.get(this.normalizeDofFocusBoneName(candidate));
            if (actual) {
                return actual;
            }
        }

        return boneNames.find((name): name is string => typeof name === "string" && name.length > 0) ?? null;
    }

    private getRuntimeBoneByNameFromModel(model: RuntimeModel | null, boneName: string): EditorRuntimeBone | null {
        const runtimeBones = model?.runtimeBones;
        if (!runtimeBones) return null;

        for (const runtimeBone of runtimeBones as readonly EditorRuntimeBone[]) {
            if (runtimeBone.name === boneName) {
                return runtimeBone;
            }
        }

        return null;
    }

    private getDofFocusTargetPosition(): Vector3 | null {
        const modelPath = this.dofFocusTargetModelPathValue;
        if (!modelPath) {
            return this.camera.target.clone();
        }

        const entry = this.findSceneModelEntryByPath(modelPath);
        if (!entry) {
            return this.camera.target.clone();
        }

        const boneName = this.dofFocusTargetBoneNameValue;
        if (boneName) {
            const runtimeBone = this.getRuntimeBoneByNameFromModel(entry.model, boneName);
            if (runtimeBone) {
                const worldMatrix = Matrix.Identity();
                const worldPosition = Vector3.Zero();
                runtimeBone.getWorldMatrixToRef(worldMatrix);
                worldMatrix.getTranslationToRef(worldPosition);
                return worldPosition;
            }
        }

        return entry.mesh.getBoundingInfo().boundingBox.centerWorld.clone();
    }

    private getDofAutoFocusDistanceMm(): number {
        const focusTarget = this.getDofFocusTargetPosition() ?? this.camera.target;
        const distance = Vector3.Distance(this.camera.globalPosition, focusTarget);
        return Math.max(this.camera.minZ, distance) * 1000;
    }

    private getCameraFocusDistanceMm(): number {
        const distance = Vector3.Distance(this.camera.globalPosition, this.camera.target);
        return Math.max(this.camera.minZ, distance) * 1000;
    }
    getMorphWeight(morphName: string): number {
        const modelMorph = this.currentModel?.morph;
        if (!modelMorph) return 0;
        try {
            return modelMorph.getMorphWeight(morphName);
        } catch { /* ignore */ }
        return 0;
    }
    getMorphWeightByIndex(morphIndex: number): number {
        const modelMorph = this.currentModel?.morph;
        if (!modelMorph) return 0;
        if (!Number.isInteger(morphIndex) || morphIndex < 0) return 0;
        try {
            return modelMorph.getMorphWeightFromIndex(morphIndex);
        } catch { /* ignore */ }
        return 0;
    }
    setMorphWeight(morphName: string, weight: number): void {
        const modelMorph = this.currentModel?.morph;
        if (!modelMorph) return;
        const clampedWeight = Math.max(0, Math.min(1, weight));
        try {
            modelMorph.setMorphWeight(morphName, clampedWeight);
            this.refreshCurrentModelAfterMorphEdit();
        } catch { /* ignore */ }
    }
    setMorphWeightByIndex(morphIndex: number, weight: number): void {
        const modelMorph = this.currentModel?.morph;
        if (!modelMorph) return;
        if (!Number.isInteger(morphIndex) || morphIndex < 0) return;
        const clampedWeight = Math.max(0, Math.min(1, weight));
        try {
            modelMorph.setMorphWeightFromIndex(morphIndex, clampedWeight);
            this.refreshCurrentModelAfterMorphEdit();
        } catch { /* ignore */ }
    }

    private refreshCurrentModelAfterMorphEdit(): void {
        this.luminousGlowMorphRevision += 1;
        this.recomputeCurrentModelPoseAfterManualEdit();
        this.currentMesh?.computeWorldMatrix(true);
        this.currentMesh?.metadata?.skeleton?.computeAbsoluteMatrices(true);
        this.boneVisualizerTarget?.mesh?.computeWorldMatrix(true);
        this.boneVisualizerTarget?.skeleton?.computeAbsoluteMatrices(true);
    }

    private getRuntimeBoneByName(boneName: string): EditorRuntimeBone | null {
        const runtimeBones = this.currentModel?.runtimeBones;
        if (!runtimeBones) return null;

        for (const runtimeBone of runtimeBones as readonly EditorRuntimeBone[]) {
            if (runtimeBone.name === boneName) {
                return runtimeBone;
            }
        }

        return null;
    }

    getBoneTransform(boneName: string): { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number } } | null {
        const runtimeBone = this.getRuntimeBoneByName(boneName);
        if (!runtimeBone) return null;

        const linkedBone = runtimeBone.linkedBone as
            | (TransformNode & {
                getRestMatrix?: () => Matrix;
                rotationQuaternion?: Quaternion | null;
            })
            | undefined;

        if (linkedBone) {
            const worldMatrix = Matrix.Identity();
            const localMatrix = Matrix.Identity();
            const parentWorldMatrix = Matrix.Identity();
            const parentWorldInverseMatrix = Matrix.Identity();
            const localScaling = Vector3.Zero();
            const localRotation = Quaternion.Identity();
            const localPosition = Vector3.Zero();
            const restPosition = Vector3.Zero();

            runtimeBone.getWorldMatrixToRef(worldMatrix);

            if (runtimeBone.parentBone) {
                runtimeBone.parentBone.getWorldMatrixToRef(parentWorldMatrix);
                parentWorldMatrix.invertToRef(parentWorldInverseMatrix);
                worldMatrix.multiplyToRef(parentWorldInverseMatrix, localMatrix);
            } else {
                localMatrix.copyFrom(worldMatrix);
            }

            localMatrix.decompose(localScaling, localRotation, localPosition);
            linkedBone.getRestMatrix?.().getTranslationToRef(restPosition);

            const rotationEuler = localRotation.toEulerAngles();
            const radToDeg = 180 / Math.PI;
            const snapshot = {
                position: {
                    x: localPosition.x - restPosition.x,
                    y: localPosition.y - restPosition.y,
                    z: localPosition.z - restPosition.z,
                },
                rotation: {
                    x: rotationEuler.x * radToDeg,
                    y: rotationEuler.y * radToDeg,
                    z: rotationEuler.z * radToDeg,
                },
            };
            return snapshot;
        }

        const positionOffset = new Vector3();
        runtimeBone.getAnimationPositionOffsetToRef?.(positionOffset);
        const rotationQuaternion = typeof runtimeBone.getAnimatedRotationToRef === "function"
            ? runtimeBone.getAnimatedRotationToRef(Quaternion.Identity())
            : Quaternion.Identity();
        const rotationEuler = rotationQuaternion.toEulerAngles();
        const radToDeg = 180 / Math.PI;

        const snapshot = {
            position: {
                x: positionOffset.x,
                y: positionOffset.y,
                z: positionOffset.z,
            },
            rotation: {
                x: rotationEuler.x * radToDeg,
                y: rotationEuler.y * radToDeg,
                z: rotationEuler.z * radToDeg,
            },
        };
        return snapshot;
    }

    getAnimatedBoneTransform(boneName: string): { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number } } | null {
        const runtimeBone = this.getRuntimeBoneByName(boneName);
        if (!runtimeBone) return null;

        if (
            typeof runtimeBone.getAnimationPositionOffsetToRef !== "function" ||
            typeof runtimeBone.getAnimatedRotationToRef !== "function"
        ) {
            return this.getBoneTransform(boneName);
        }

        const positionOffset = new Vector3();
        runtimeBone.getAnimationPositionOffsetToRef(positionOffset);
        const rotationQuaternion = runtimeBone.getAnimatedRotationToRef(Quaternion.Identity());
        const rotationEuler = rotationQuaternion.toEulerAngles();
        const radToDeg = 180 / Math.PI;
        const snapshot = {
            position: {
                x: positionOffset.x,
                y: positionOffset.y,
                z: positionOffset.z,
            },
            rotation: {
                x: rotationEuler.x * radToDeg,
                y: rotationEuler.y * radToDeg,
                z: rotationEuler.z * radToDeg,
            },
        };
        return snapshot;
    }

    setBoneTranslation(boneName: string, x: number, y: number, z: number, notifyEdited = true): void {
        const runtimeBone = this.getRuntimeBoneByName(boneName);
        if (!runtimeBone) return;

        const restMatrix = runtimeBone.linkedBone.getRestMatrix();
        const restX = restMatrix.m[12];
        const restY = restMatrix.m[13];
        const restZ = restMatrix.m[14];

        runtimeBone.linkedBone.position = new Vector3(restX + x, restY + y, restZ + z);
        this.invalidateBoneVisualizerPose(runtimeBone, notifyEdited);
    }

    setBoneRotation(boneName: string, xDeg: number, yDeg: number, zDeg: number, notifyEdited = true): void {
        const runtimeBone = this.getRuntimeBoneByName(boneName);
        if (!runtimeBone) return;

        const xRad = (xDeg * Math.PI) / 180;
        const yRad = (yDeg * Math.PI) / 180;
        const zRad = (zDeg * Math.PI) / 180;
        const rotation = Quaternion.RotationYawPitchRoll(yRad, xRad, zRad);

        runtimeBone.linkedBone.setRotationQuaternion(rotation, Space.LOCAL);
        this.invalidateBoneVisualizerPose(runtimeBone, notifyEdited);
    }

    private recomputeCurrentModelPoseAfterManualEdit(): void {
        const currentModel = this.currentModel;
        if (!currentModel) return;
        PhysicsModelController.beforeAndAfterPhysics(currentModel);
    }

    private invalidateBoneVisualizerPose(runtimeBone: EditorRuntimeBone, notifyEdited = true): void {
        const linkedBone = runtimeBone.linkedBone;
        const linkedBoneInternal = linkedBone as unknown as {
            markAsDirty?: () => void;
            getSkeleton?: () => Skeleton;
        };
        linkedBoneInternal.markAsDirty?.();
        this.recomputeCurrentModelPoseAfterManualEdit();
        linkedBoneInternal.getSkeleton?.()?.computeAbsoluteMatrices(true);
        this.boneVisualizerTarget?.skeleton?.computeAbsoluteMatrices(true);
        if (notifyEdited) {
            this.onBoneTransformEdited?.(runtimeBone.name);
        }
    }
    getCameraPosition(): { x: number; y: number; z: number } {
        const pos = this.camera.position;
        return { x: pos.x, y: pos.y, z: pos.z };
    }

    getCameraTarget(): { x: number; y: number; z: number } {
        const target = this.camera.target;
        return { x: target.x, y: target.y, z: target.z };
    }

    setCameraPosition(x: number, y: number, z: number): void {
        this.camera.setPosition(new Vector3(x, y, z));
        this.applyCameraRotationFromEuler();
        this.syncMmdCameraFromViewportCamera();
    }

    getCameraRotation(): { x: number; y: number; z: number } {
        return {
            x: this.cameraRotationEulerDeg.x,
            y: this.cameraRotationEulerDeg.y,
            z: this.cameraRotationEulerDeg.z,
        };
    }

    setCameraRotation(xDeg: number, yDeg: number, zDeg: number): void {
        this.cameraRotationEulerDeg.set(xDeg, yDeg, zDeg);
        this.applyCameraRotationFromEuler();
        this.syncMmdCameraFromViewportCamera();
    }

    setCameraTarget(x: number, y: number, z: number): void {
        this.camera.target = new Vector3(x, y, z);
        this.syncCameraRotationFromCurrentView();
        this.syncMmdCameraFromViewportCamera();
    }

    getCameraFov(): number {
        return (this.camera.fov * 180) / Math.PI;
    }

    getCameraDistance(): number {
        return Math.max(this.camera.minZ, Vector3.Distance(this.camera.position, this.camera.target));
    }

    getPerspectiveEnabled(): boolean {
        return this.camera.mode !== Camera.ORTHOGRAPHIC_CAMERA;
    }

    setPerspectiveEnabled(enabled: boolean): void {
        const nextMode = enabled ? Camera.PERSPECTIVE_CAMERA : Camera.ORTHOGRAPHIC_CAMERA;
        if (this.camera.mode === nextMode) return;
        this.camera.mode = nextMode;
        this.updateOrthographicCameraBounds();
    }

    setCameraDistance(distance: number): void {
        const min = Math.max(0.1, this.camera.lowerRadiusLimit ?? this.camera.minZ);
        const max = this.camera.upperRadiusLimit ?? Number.POSITIVE_INFINITY;
        this.camera.radius = Math.max(min, Math.min(max, distance));
        this.syncCameraRotationFromCurrentView();
        this.syncMmdCameraFromViewportCamera();
        this.updateOrthographicCameraBounds();
        this.updateEditorDofFocusAndFStop();
    }

    setCameraFov(degrees: number): void {
        this.camera.fov = (degrees * Math.PI) / 180;
        this.syncMmdCameraFromViewportCamera();
        this.updateOrthographicCameraBounds();
        this.updateEditorDofFocusAndFStop();
    }

    panCameraByViewportDelta(deltaX: number, deltaY: number): void {
        this.applyCameraMouseDrag("pan", deltaX, deltaY);
    }

    applyCameraTrackPose(
        target: { x: number; y: number; z: number },
        rotationDeg: { x: number; y: number; z: number },
        distance: number,
        fovDeg?: number,
    ): void {
        this.mmdCamera.target.set(target.x, target.y, target.z);
        this.mmdCamera.rotation.set(
            (rotationDeg.x * Math.PI) / 180,
            (rotationDeg.y * Math.PI) / 180,
            (rotationDeg.z * Math.PI) / 180,
        );
        this.mmdCamera.distance = -Math.abs(distance);
        if (typeof fovDeg === "number") {
            this.mmdCamera.fov = (fovDeg * Math.PI) / 180;
        }
        this.syncViewportCameraFromMmdCamera();
        this.updateOrthographicCameraBounds();
    }

    applyCameraAnimation(animation: MmdAnimation, sourcePath: string | null): void {
        if (this.cameraAnimationHandle !== null) {
            this.mmdCamera.destroyRuntimeAnimation(this.cameraAnimationHandle);
            this.cameraAnimationHandle = null;
        }

        this.cameraAnimationHandle = this.mmdCamera.createRuntimeAnimation(
            animation as unknown as IMmdBindableCameraAnimation,
        );
        this.mmdCamera.setRuntimeAnimation(this.cameraAnimationHandle);
        this.hasCameraMotion = true;
        this.cameraMotionPath = sourcePath;
        this.cameraSourceAnimation = animation;
        this.cameraKeyframeFrames = new Uint32Array(animation.cameraTrack.frameNumbers);
        this.emitMergedKeyframeTracks();
    }

    setCameraView(view: "left" | "front" | "right" | "top" | "back" | "bottom"): void {
        const distance = Math.max(5, this.getCameraDistance());
        const fovDeg = (this.camera.fov * 180) / Math.PI;
        let rotationDeg = { x: 0, y: 0, z: 0 };
        switch (view) {
            case "left":
                rotationDeg = { x: 0, y: -90, z: 0 };
                break;
            case "right":
                rotationDeg = { x: 0, y: 90, z: 0 };
                break;
            case "back":
                rotationDeg = { x: 0, y: 180, z: 0 };
                break;
            case "top":
                rotationDeg = { x: -90, y: 0, z: 0 };
                break;
            case "bottom":
                rotationDeg = { x: 90, y: 0, z: 0 };
                break;
            case "front":
            default:
                rotationDeg = { x: 0, y: 0, z: 0 };
                break;
        }

        this.applyCameraTrackPose({ x: 0, y: 10, z: 0 }, rotationDeg, distance, fovDeg);
    }

    private updateOrthographicCameraBounds(): void {
        if (!this.camera || this.camera.mode !== Camera.ORTHOGRAPHIC_CAMERA) return;

        const width = Math.max(1, this.renderingCanvas.clientWidth || this.engine.getRenderWidth(true) || 1);
        const height = Math.max(1, this.renderingCanvas.clientHeight || this.engine.getRenderHeight(true) || 1);
        const aspect = width / height;
        const distance = Math.max(0.1, this.getCameraDistance());
        const verticalSize = Math.max(0.1, 2 * distance * Math.tan(Math.max(0.01, this.camera.fov) * 0.5));
        const horizontalSize = verticalSize * aspect;

        this.camera.orthoLeft = -horizontalSize * 0.5;
        this.camera.orthoRight = horizontalSize * 0.5;
        this.camera.orthoTop = verticalSize * 0.5;
        this.camera.orthoBottom = -verticalSize * 0.5;
    }

    private syncMmdCameraFromViewportCamera(force = false): void {
        if (!force && !this.shouldSyncViewportCameraToMmdCamera()) {
            return;
        }

        this.mmdCamera.target.copyFrom(this.camera.target);
        this.mmdCamera.position = this.camera.position.clone();
        this.mmdCamera.rotation.z = (this.cameraRotationEulerDeg.z * Math.PI) / 180;
        this.mmdCamera.fov = this.camera.fov;
        this.recordViewportCameraSyncState();
    }
    private syncViewportCameraFromMmdCamera(): void {
        // MmdCamera is not the active scene camera, so keep its position up to date explicitly.
        this.mmdCamera.updatePosition();
        const rotationMatrix = Matrix.RotationYawPitchRoll(
            -this.mmdCamera.rotation.y,
            -this.mmdCamera.rotation.x,
            -this.mmdCamera.rotation.z,
        );
        const rotatedUp = Vector3.TransformNormal(this.mmdCamera.upVector, rotationMatrix).normalize();
        this.camera.upVector = rotatedUp;
        this.camera.setPosition(this.mmdCamera.position);
        this.camera.setTarget(this.mmdCamera.target);
        this.camera.fov = this.mmdCamera.fov;
        this.cameraRotationEulerDeg.set(
            (this.mmdCamera.rotation.x * 180) / Math.PI,
            (this.mmdCamera.rotation.y * 180) / Math.PI,
            (this.mmdCamera.rotation.z * 180) / Math.PI,
        );
        this.recordViewportCameraSyncState();
        this.updateDofFocalLengthFromCameraFov();
        this.updateOrthographicCameraBounds();
    }

    private recordViewportCameraSyncState(): void {
        this.lastViewportCameraSyncState = {
            position: this.camera.position.clone(),
            target: this.camera.target.clone(),
            radius: this.camera.radius,
            fov: this.camera.fov,
        };
    }

    private hasViewportCameraChangedSinceLastSync(): boolean {
        const previous = this.lastViewportCameraSyncState;
        if (!previous) return true;
        const epsilon = 1e-4;
        return Vector3.DistanceSquared(previous.position, this.camera.position) > epsilon
            || Vector3.DistanceSquared(previous.target, this.camera.target) > epsilon
            || Math.abs(previous.radius - this.camera.radius) > epsilon
            || Math.abs(previous.fov - this.camera.fov) > epsilon;
    }

    private syncViewportCameraDrivenStateFromNativeInputs(): void {
        if (!this.shouldSyncViewportCameraToMmdCamera()) {
            this.recordViewportCameraSyncState();
            return;
        }
        if (!this.hasViewportCameraChangedSinceLastSync()) return;

        this.syncCameraRotationFromCurrentView();
        this.syncMmdCameraFromViewportCamera(true);
        this.updateDofFocalLengthFromCameraFov();
        this.onCameraTransformEdited?.();
    }

    private applyCameraRotationFromEuler(): void {
        const xRad = (this.cameraRotationEulerDeg.x * Math.PI) / 180;
        const yRad = (this.cameraRotationEulerDeg.y * Math.PI) / 180;
        const zRad = (this.cameraRotationEulerDeg.z * Math.PI) / 180;
        const rot = Matrix.RotationYawPitchRoll(-yRad, -xRad, -zRad);
        const forwardOffset = Vector3.TransformNormal(new Vector3(0, 0, 1), rot).normalize();
        const up = Vector3.TransformNormal(new Vector3(0, 1, 0), rot).normalize();
        const distance = Math.max(this.camera.radius, this.camera.lowerRadiusLimit ?? 2);
        const target = this.camera.position.add(forwardOffset.scale(distance));

        this.camera.upVector = up;
        this.camera.target = target;
    }

    private syncCameraRotationFromCurrentView(): void {
        const toPosition = this.camera.position.subtract(this.camera.target);
        if (toPosition.lengthSquared() < 1e-8) return;

        toPosition.normalize();
        this.cameraRotationEulerDeg.x = (Math.asin(-toPosition.y) * 180) / Math.PI;
        this.cameraRotationEulerDeg.y = (Math.atan2(toPosition.x, -toPosition.z) * 180) / Math.PI;
    }

    private getOrCreateModelTrackFrameMap(model: RuntimeModel): Map<string, Uint32Array> {
        return getOrCreateModelTrackFrameMapImpl(this, model);
    }

    private createFrameIndexMap(frames: Uint32Array): Map<number, number> {
        const indexMap = new Map<number, number>();
        for (let i = 0; i < frames.length; i += 1) {
            indexMap.set(frames[i], i);
        }
        return indexMap;
    }

    private copyFloatFrameBlock(
        source: Float32Array,
        sourceFrameIndex: number,
        stride: number,
        destination: Float32Array,
        destinationFrameIndex: number,
    ): void {
        const sourceOffset = sourceFrameIndex * stride;
        const destinationOffset = destinationFrameIndex * stride;
        destination.set(source.subarray(sourceOffset, sourceOffset + stride), destinationOffset);
    }

    private copyUint8FrameBlock(
        source: Uint8Array,
        sourceFrameIndex: number,
        stride: number,
        destination: Uint8Array,
        destinationFrameIndex: number,
    ): void {
        const sourceOffset = sourceFrameIndex * stride;
        const destinationOffset = destinationFrameIndex * stride;
        destination.set(source.subarray(sourceOffset, sourceOffset + stride), destinationOffset);
    }

    private createOffsetModelAnimation(animation: MmdAnimation, frameOffset: number): MmdAnimation {
        return createOffsetModelAnimationImpl(animation, frameOffset);
    }

    private mergeModelAnimations(baseAnimation: MmdAnimation, overlayAnimation: MmdAnimation): MmdAnimation {
        return mergeModelAnimationsImpl(baseAnimation, overlayAnimation);
    }

    private mergePropertyTrack(
        baseTrack: MmdPropertyAnimationTrack,
        overlayTrack: MmdPropertyAnimationTrack,
    ): MmdPropertyAnimationTrack {
        if (overlayTrack.frameNumbers.length === 0) {
            return baseTrack;
        }
        if (baseTrack.frameNumbers.length === 0) {
            return overlayTrack;
        }

        const mergedFrames = mergeFrameNumbers(baseTrack.frameNumbers, overlayTrack.frameNumbers);
        const mergedIkBoneNames = [...baseTrack.ikBoneNames];
        for (const ikBoneName of overlayTrack.ikBoneNames) {
            if (!mergedIkBoneNames.includes(ikBoneName)) {
                mergedIkBoneNames.push(ikBoneName);
            }
        }

        const mergedTrack = new MmdPropertyAnimationTrack(mergedFrames.length, mergedIkBoneNames);
        mergedTrack.frameNumbers.set(mergedFrames);

        const baseIndexMap = this.createFrameIndexMap(baseTrack.frameNumbers);
        const overlayIndexMap = this.createFrameIndexMap(overlayTrack.frameNumbers);
        const baseIkIndexByName = new Map<string, number>();
        const overlayIkIndexByName = new Map<string, number>();

        for (let i = 0; i < baseTrack.ikBoneNames.length; i += 1) {
            baseIkIndexByName.set(baseTrack.ikBoneNames[i], i);
        }
        for (let i = 0; i < overlayTrack.ikBoneNames.length; i += 1) {
            overlayIkIndexByName.set(overlayTrack.ikBoneNames[i], i);
        }

        for (let i = 0; i < mergedFrames.length; i += 1) {
            const frame = mergedFrames[i];
            const overlayIndex = overlayIndexMap.get(frame);
            const baseIndex = baseIndexMap.get(frame);
            const preferredVisible = overlayIndex !== undefined
                ? overlayTrack.visibles[overlayIndex]
                : (baseIndex !== undefined ? baseTrack.visibles[baseIndex] : 0);
            mergedTrack.visibles[i] = preferredVisible;

            for (let ikIndex = 0; ikIndex < mergedIkBoneNames.length; ikIndex += 1) {
                const ikBoneName = mergedIkBoneNames[ikIndex];
                const overlayIkIndex = overlayIkIndexByName.get(ikBoneName);
                if (overlayIndex !== undefined && overlayIkIndex !== undefined) {
                    mergedTrack.getIkState(ikIndex)[i] = overlayTrack.getIkState(overlayIkIndex)[overlayIndex];
                    continue;
                }

                const baseIkIndex = baseIkIndexByName.get(ikBoneName);
                if (baseIndex !== undefined && baseIkIndex !== undefined) {
                    mergedTrack.getIkState(ikIndex)[i] = baseTrack.getIkState(baseIkIndex)[baseIndex];
                }
            }
        }

        return mergedTrack;
    }

    private mergeMovableBoneTrackArrays(
        baseTracks: readonly MmdMovableBoneAnimationTrack[],
        overlayTracks: readonly MmdMovableBoneAnimationTrack[],
    ): MmdMovableBoneAnimationTrack[] {
        const overlayByName = new Map<string, MmdMovableBoneAnimationTrack>();
        for (const track of overlayTracks) {
            overlayByName.set(track.name, track);
        }

        const mergedTracks: MmdMovableBoneAnimationTrack[] = [];
        const mergedNames = new Set<string>();

        for (const baseTrack of baseTracks) {
            const overlayTrack = overlayByName.get(baseTrack.name);
            if (!overlayTrack) {
                mergedTracks.push(baseTrack);
                continue;
            }
            mergedNames.add(baseTrack.name);
            mergedTracks.push(this.mergeMovableBoneTrack(baseTrack, overlayTrack));
        }

        for (const overlayTrack of overlayTracks) {
            if (mergedNames.has(overlayTrack.name)) continue;
            mergedTracks.push(overlayTrack);
        }

        return mergedTracks;
    }

    private mergeBoneTrackArrays(
        baseTracks: readonly MmdBoneAnimationTrack[],
        overlayTracks: readonly MmdBoneAnimationTrack[],
    ): MmdBoneAnimationTrack[] {
        const overlayByName = new Map<string, MmdBoneAnimationTrack>();
        for (const track of overlayTracks) {
            overlayByName.set(track.name, track);
        }

        const mergedTracks: MmdBoneAnimationTrack[] = [];
        const mergedNames = new Set<string>();

        for (const baseTrack of baseTracks) {
            const overlayTrack = overlayByName.get(baseTrack.name);
            if (!overlayTrack) {
                mergedTracks.push(baseTrack);
                continue;
            }
            mergedNames.add(baseTrack.name);
            mergedTracks.push(this.mergeBoneTrack(baseTrack, overlayTrack));
        }

        for (const overlayTrack of overlayTracks) {
            if (mergedNames.has(overlayTrack.name)) continue;
            mergedTracks.push(overlayTrack);
        }

        return mergedTracks;
    }

    private mergeMorphTrackArrays(
        baseTracks: readonly MmdMorphAnimationTrack[],
        overlayTracks: readonly MmdMorphAnimationTrack[],
    ): MmdMorphAnimationTrack[] {
        const overlayByName = new Map<string, MmdMorphAnimationTrack>();
        for (const track of overlayTracks) {
            overlayByName.set(track.name, track);
        }

        const mergedTracks: MmdMorphAnimationTrack[] = [];
        const mergedNames = new Set<string>();

        for (const baseTrack of baseTracks) {
            const overlayTrack = overlayByName.get(baseTrack.name);
            if (!overlayTrack) {
                mergedTracks.push(baseTrack);
                continue;
            }
            mergedNames.add(baseTrack.name);
            mergedTracks.push(this.mergeMorphTrack(baseTrack, overlayTrack));
        }

        for (const overlayTrack of overlayTracks) {
            if (mergedNames.has(overlayTrack.name)) continue;
            mergedTracks.push(overlayTrack);
        }

        return mergedTracks;
    }

    private mergeMovableBoneTrack(
        baseTrack: MmdMovableBoneAnimationTrack,
        overlayTrack: MmdMovableBoneAnimationTrack,
    ): MmdMovableBoneAnimationTrack {
        const mergedFrames = mergeFrameNumbers(baseTrack.frameNumbers, overlayTrack.frameNumbers);
        const mergedTrack = new MmdMovableBoneAnimationTrack(baseTrack.name, mergedFrames.length);
        mergedTrack.frameNumbers.set(mergedFrames);

        const baseIndexMap = this.createFrameIndexMap(baseTrack.frameNumbers);
        const overlayIndexMap = this.createFrameIndexMap(overlayTrack.frameNumbers);

        for (let i = 0; i < mergedFrames.length; i += 1) {
            const frame = mergedFrames[i];
            const overlayIndex = overlayIndexMap.get(frame);
            if (overlayIndex !== undefined) {
                this.copyFloatFrameBlock(overlayTrack.positions, overlayIndex, 3, mergedTrack.positions, i);
                this.copyUint8FrameBlock(overlayTrack.positionInterpolations, overlayIndex, 12, mergedTrack.positionInterpolations, i);
                this.copyFloatFrameBlock(overlayTrack.rotations, overlayIndex, 4, mergedTrack.rotations, i);
                this.copyUint8FrameBlock(overlayTrack.rotationInterpolations, overlayIndex, 4, mergedTrack.rotationInterpolations, i);
                this.copyUint8FrameBlock(overlayTrack.physicsToggles, overlayIndex, 1, mergedTrack.physicsToggles, i);
                continue;
            }

            const baseIndex = baseIndexMap.get(frame);
            if (baseIndex === undefined) continue;
            this.copyFloatFrameBlock(baseTrack.positions, baseIndex, 3, mergedTrack.positions, i);
            this.copyUint8FrameBlock(baseTrack.positionInterpolations, baseIndex, 12, mergedTrack.positionInterpolations, i);
            this.copyFloatFrameBlock(baseTrack.rotations, baseIndex, 4, mergedTrack.rotations, i);
            this.copyUint8FrameBlock(baseTrack.rotationInterpolations, baseIndex, 4, mergedTrack.rotationInterpolations, i);
            this.copyUint8FrameBlock(baseTrack.physicsToggles, baseIndex, 1, mergedTrack.physicsToggles, i);
        }

        return mergedTrack;
    }

    private mergeBoneTrack(
        baseTrack: MmdBoneAnimationTrack,
        overlayTrack: MmdBoneAnimationTrack,
    ): MmdBoneAnimationTrack {
        const mergedFrames = mergeFrameNumbers(baseTrack.frameNumbers, overlayTrack.frameNumbers);
        const mergedTrack = new MmdBoneAnimationTrack(baseTrack.name, mergedFrames.length);
        mergedTrack.frameNumbers.set(mergedFrames);

        const baseIndexMap = this.createFrameIndexMap(baseTrack.frameNumbers);
        const overlayIndexMap = this.createFrameIndexMap(overlayTrack.frameNumbers);

        for (let i = 0; i < mergedFrames.length; i += 1) {
            const frame = mergedFrames[i];
            const overlayIndex = overlayIndexMap.get(frame);
            if (overlayIndex !== undefined) {
                this.copyFloatFrameBlock(overlayTrack.rotations, overlayIndex, 4, mergedTrack.rotations, i);
                this.copyUint8FrameBlock(overlayTrack.rotationInterpolations, overlayIndex, 4, mergedTrack.rotationInterpolations, i);
                this.copyUint8FrameBlock(overlayTrack.physicsToggles, overlayIndex, 1, mergedTrack.physicsToggles, i);
                continue;
            }

            const baseIndex = baseIndexMap.get(frame);
            if (baseIndex === undefined) continue;
            this.copyFloatFrameBlock(baseTrack.rotations, baseIndex, 4, mergedTrack.rotations, i);
            this.copyUint8FrameBlock(baseTrack.rotationInterpolations, baseIndex, 4, mergedTrack.rotationInterpolations, i);
            this.copyUint8FrameBlock(baseTrack.physicsToggles, baseIndex, 1, mergedTrack.physicsToggles, i);
        }

        return mergedTrack;
    }

    private mergeMorphTrack(
        baseTrack: MmdMorphAnimationTrack,
        overlayTrack: MmdMorphAnimationTrack,
    ): MmdMorphAnimationTrack {
        const mergedFrames = mergeFrameNumbers(baseTrack.frameNumbers, overlayTrack.frameNumbers);
        const mergedTrack = new MmdMorphAnimationTrack(baseTrack.name, mergedFrames.length);
        mergedTrack.frameNumbers.set(mergedFrames);

        const baseIndexMap = this.createFrameIndexMap(baseTrack.frameNumbers);
        const overlayIndexMap = this.createFrameIndexMap(overlayTrack.frameNumbers);

        for (let i = 0; i < mergedFrames.length; i += 1) {
            const frame = mergedFrames[i];
            const overlayIndex = overlayIndexMap.get(frame);
            if (overlayIndex !== undefined) {
                mergedTrack.weights[i] = overlayTrack.weights[overlayIndex];
                continue;
            }

            const baseIndex = baseIndexMap.get(frame);
            if (baseIndex === undefined) continue;
            mergedTrack.weights[i] = baseTrack.weights[baseIndex];
        }

        return mergedTrack;
    }
    private buildModelTrackFrameMapFromAnimation(animation: MmdAnimation, frameOffset = 0): Map<string, Uint32Array> {
        return buildModelTrackFrameMapFromAnimationImpl(this, animation, frameOffset);
    }

    private getActiveModelTimelineTracks(): KeyframeTrack[] {
        return getActiveModelTimelineTracksImpl(this);
    }
    private createCameraChannelTracks(frames: Uint32Array): KeyframeTrack[] {
        const cameraFrames = frames.length > 0 ? frames : EMPTY_KEYFRAME_FRAMES;
        return [
            { name: "Camera", category: "camera", frames: cameraFrames },
        ];
    }

    private getCameraTimelineTracks(): KeyframeTrack[] {
        return getCameraTimelineTracksImpl(this);
    }

    private getRegisteredKeyframeStats(): { hasAnyKeyframe: boolean; maxFrame: number } {
        return getRegisteredKeyframeStatsImpl(this);
    }

    private refreshTotalFramesFromContent(): void {
        refreshTotalFramesFromContentImpl(this);
    }

    private emitMergedKeyframeTracks(): void {
        emitMergedKeyframeTracksImpl(this);
    }

    private advanceManualPlaybackWithoutAudio(deltaMs: number): boolean {
        if (!this._isPlaying || !this.manualPlaybackWithoutAudio) return false;

        const deltaFrames = (deltaMs / (1000 / 30)) * this._playbackSpeed;
        this.manualPlaybackFrameCursor = Math.min(this._totalFrames, this.manualPlaybackFrameCursor + deltaFrames);
        const nextFrame = Math.floor(this.manualPlaybackFrameCursor);
        if (nextFrame !== this._currentFrame) {
            this._currentFrame = nextFrame;
            this.mmdRuntime.seekAnimation(this._currentFrame, true);
            this.syncViewportCameraFromMmdCameraAfterSeek();
        }
        return true;
    }

    private syncViewportCameraFromMmdCameraAfterSeek(): void {
        if (!this.hasActiveCameraAnimation()) return;
        if (!this._isPlaying && this.timelineTarget !== "camera") return;
        this.syncViewportCameraFromMmdCamera();
    }

    resize(): void {
        this.resizeToCanvasClientSize();
    }

    public setAutoRenderEnabled(enabled: boolean): void {
        this.autoRenderEnabled = Boolean(enabled);
        const now = performance.now();
        this.lastRenderTimestampMs = now;
        this.nextRenderDueTimestampMs = now;
    }

    public renderOnce(deltaMs = 1000 / 30): void {
        const clampedDeltaMs = Math.max(0, Math.min(100, deltaMs));
        const now = performance.now();
        this.lastRenderTimestampMs = now;
        this.nextRenderDueTimestampMs = now;
        const engineWithDelta = this.engine as typeof this.engine & { _deltaTime?: number };
        engineWithDelta._deltaTime = clampedDeltaMs;
        const advancedManualPlayback = this.advanceManualPlaybackWithoutAudio(clampedDeltaMs);

        this.updateSimpleMotionBlurState(clampedDeltaMs);
        this.syncBackgroundVideoFrame();
        this.scene.render();
        if (!this._isPlaying) return;

        if (advancedManualPlayback) {
            this.onFrameUpdate?.(this._currentFrame, this._totalFrames);
            return;
        }

        const runtimeFrame = Math.floor(this.mmdRuntime.currentFrameTime);
        this._currentFrame = Math.min(runtimeFrame, this._totalFrames);
        this.onFrameUpdate?.(this._currentFrame, this._totalFrames);
    }

    public setRenderFpsLimit(limit: number): void {
        if (!Number.isFinite(limit)) {
            this.renderFpsLimit = 0;
        } else {
            this.renderFpsLimit = Math.max(0, Math.floor(limit));
        }
        const now = performance.now();
        this.lastRenderTimestampMs = now;
        this.nextRenderDueTimestampMs = now;
    }

    dispose(): void {
        this.renderingCanvas.removeEventListener("pointerdown", this.onCanvasPointerDown);
        this.renderingCanvas.removeEventListener("pointermove", this.onCanvasPointerMove);
        this.renderingCanvas.removeEventListener("pointerup", this.onCanvasPointerUp);
        this.renderingCanvas.removeEventListener("pointercancel", this.onCanvasPointerCancel);
        this.renderingCanvas.removeEventListener("pointerleave", this.onCanvasPointerCancel);
        this.renderingCanvas.removeEventListener("mousedown", this.onCanvasMouseDown);
        this.renderingCanvas.removeEventListener("auxclick", this.onCanvasAuxClick);
        this.renderingCanvas.removeEventListener("contextmenu", this.onCanvasContextMenu);
        this.disposeBoneGizmoSystem();
        window.removeEventListener("resize", this.onWindowResize);
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        if (this.audioBlobUrl) {
            URL.revokeObjectURL(this.audioBlobUrl);
            this.audioBlobUrl = null;
        }
        if (this.audioPlayer) {
            void this.mmdRuntime.setAudioPlayer(null);
            this.audioPlayer.dispose();
            this.audioPlayer = null;
        }
        for (const sceneModel of this.sceneModels) {
            try {
                this.mmdRuntime.destroyMmdModel(sceneModel.model as never);
            } catch {
                // no-op
            }
            this.disposeContactShadowForModel(sceneModel);
            sceneModel.mesh.dispose();
        }
        this.sceneModels = [];
        this.disposeBoneVisualizer();
        this.disposeRigidBodyVisualizer();
        if (this.boneOverlayCanvas) {
            this.boneOverlayCanvas.remove();
            this.boneOverlayCanvas = null;
            this.boneOverlayCtx = null;
        }
        if (this.cameraAnimationHandle !== null) {
            this.mmdCamera.destroyRuntimeAnimation(this.cameraAnimationHandle);
            this.cameraAnimationHandle = null;
        }
        this.mmdRuntime.removeAnimatable(this.mmdCamera);
        this.mmdCamera.dispose();
        this.mmdRuntime.dispose(this.scene);
        this.physicsController.dispose();
        this.sceneInstrumentation?.dispose();
        this.sceneInstrumentation = null;
        this.shutdownPostEffectBackend();
        if (this.defaultRenderingPipeline) {
            this.defaultRenderingPipeline.dispose();
            this.defaultRenderingPipeline = null;
        }
        if (this.lensRenderingPipeline) {
            this.lensRenderingPipeline.dispose(false);
            this.lensRenderingPipeline = null;
        }
        if (this.ssaoRenderingPipeline) {
            this.ssaoRenderingPipeline.dispose(true);
            this.ssaoRenderingPipeline = null;
        }
        if (this.ssaoPostProcess) {
            this.ssaoPostProcess.dispose(this.camera);
            this.ssaoPostProcess = null;
        }
        if (this.ssrRenderingPipeline) {
            this.ssrRenderingPipeline.dispose(false);
            this.ssrRenderingPipeline = null;
        }
        this.disablePrePassRendererIfSupported();
        if (this.motionBlurPostProcess) {
            this.motionBlurPostProcess.dispose(this.camera);
            this.motionBlurPostProcess = null;
        }
        if (this.standaloneBloomEffect) {
            this.standaloneBloomEffect.disposeEffects(this.camera);
            this.standaloneBloomEffect = null;
        }
        if (this.luminousGlowLayer) {
            this.luminousGlowLayer.dispose();
            this.luminousGlowLayer = null;
        }
        if (this.luminousGlowCoreLayer) {
            this.luminousGlowCoreLayer.dispose();
            this.luminousGlowCoreLayer = null;
        }
        if (this.standaloneLensBlurPostProcess) {
            this.standaloneLensBlurPostProcess.dispose(this.camera);
            this.standaloneLensBlurPostProcess = null;
        }
        if (this.standaloneEdgeBlurPostProcess) {
            this.standaloneEdgeBlurPostProcess.dispose(this.camera);
            this.standaloneEdgeBlurPostProcess = null;
        }
        if (this.volumetricLightPostProcess) {
            this.volumetricLightPostProcess.dispose(this.camera);
            this.volumetricLightPostProcess = null;
        }
        if (this.originFogPostProcess) {
            this.originFogPostProcess.dispose(this.camera);
            this.originFogPostProcess = null;
        }
        if (this.postEffectLutTexture) {
            this.postEffectLutTexture.dispose();
            this.postEffectLutTexture = null;
            this.postEffectLutTextureKey = null;
        }

        for (const blobUrl of this.postEffectLutPresetBlobUrlById.values()) {
            URL.revokeObjectURL(blobUrl);
        }
        this.postEffectLutPresetBlobUrlById.clear();
        if (this.postEffectLutExternalBlobUrl) {
            URL.revokeObjectURL(this.postEffectLutExternalBlobUrl);
            this.postEffectLutExternalBlobUrl = null;
        }
        if (this.colorCorrectionPostProcess) {
            this.colorCorrectionPostProcess.dispose(this.camera);
            this.colorCorrectionPostProcess = null;
        }
        if (this.standaloneLensBlurPostProcess) {
            this.standaloneLensBlurPostProcess.dispose(this.camera);
            this.standaloneLensBlurPostProcess = null;
        }
        if (this.standaloneEdgeBlurPostProcess) {
            this.standaloneEdgeBlurPostProcess.dispose(this.camera);
            this.standaloneEdgeBlurPostProcess = null;
        }
        if (this.finalLensDistortionPostProcess) {
            this.finalLensDistortionPostProcess.dispose(this.camera);
            this.finalLensDistortionPostProcess = null;
        }
        if (this.finalAntialiasPostProcess) {
            this.finalAntialiasPostProcess.dispose(this.camera);
            this.finalAntialiasPostProcess = null;
        }
        if (this.dofPostProcess) {
            this.dofPostProcess.dispose(this.camera);
            this.dofPostProcess = null;
        }
        if (this.depthRenderer) {
            this.depthRenderer.dispose();
            this.depthRenderer = null;
            MmdManager.toonContactAoDepthRenderer = null;
        }
        if (this.ssaoDepthRenderer) {
            this.disposeSsaoDepthRenderer();
        }
        if (MmdManager.toonContactAoFallbackTexture) {
            MmdManager.toonContactAoFallbackTexture.dispose();
            MmdManager.toonContactAoFallbackTexture = null;
        }
        if (this.iblShadowsPipeline) {
            this.iblShadowsPipeline.dispose();
            this.iblShadowsPipeline = null;
        }
        if (this.iblFallbackEnvironmentTexture) {
            if (this.scene.environmentTexture === this.iblFallbackEnvironmentTexture) {
                this.scene.environmentTexture = null;
            }
            this.iblFallbackEnvironmentTexture.dispose();
            this.iblFallbackEnvironmentTexture = null;
        }
        if (this.iblTestEnvironmentTexture) {
            if (this.scene.environmentTexture === this.iblTestEnvironmentTexture) {
                this.scene.environmentTexture = null;
            }
            this.iblTestEnvironmentTexture.dispose();
            this.iblTestEnvironmentTexture = null;
        }
        if (this.iblWebGpuCdfFallbackTexture) {
            this.iblWebGpuCdfFallbackTexture.dispose();
            this.iblWebGpuCdfFallbackTexture = null;
        }
        this.iblWebGpuSuppressedEnvironmentTexture = null;
        if (this.contactShadowMaterial) {
            this.contactShadowMaterial.dispose();
            this.contactShadowMaterial = null;
        }
        if (this.contactShadowTexture) {
            this.contactShadowTexture.dispose();
            this.contactShadowTexture = null;
        }
        if (this.contactShadowBlobTexture) {
            this.contactShadowBlobTexture.dispose();
            this.contactShadowBlobTexture = null;
        }
        if (this.skydome) {
            this.skydome.dispose();
            this.skydome = null;
        }
        this.disposeMirroringFloorResources();
        this.clearBackgroundMedia();
        this.globalIlluminationController?.dispose();
        this.scene.dispose();
        this.engine.dispose();
    }

    private resizeToCanvasClientSize(): void {
        const width = Math.max(1, Math.floor(this.renderingCanvas.clientWidth));
        const height = Math.max(1, Math.floor(this.renderingCanvas.clientHeight));
        if (width === 0 || height === 0) return;

        this.resizeBoneOverlayCanvas();

        // Babylon's picking path applies hardwareScalingLevel to pointer coordinates,
        // so the drawing buffer must stay in scaled render pixels, not raw CSS pixels.
        const hardwareScalingLevel = Math.max(0.0001, this.engine.getHardwareScalingLevel());
        const renderWidth = Math.max(1, Math.round(width / hardwareScalingLevel));
        const renderHeight = Math.max(1, Math.round(height / hardwareScalingLevel));
        if (this.engine.getRenderWidth() !== renderWidth || this.engine.getRenderHeight() !== renderHeight) {
            this.engine.setSize(renderWidth, renderHeight);
            this.resizeGlobalIllumination();
            if (this.depthRenderer) {
                const depthMap = this.depthRenderer.getDepthMap();
                depthMap.resize({ width: renderWidth, height: renderHeight });
                if (this.defaultRenderingPipeline) {
                    this.defaultRenderingPipeline.depthOfField.depthTexture = depthMap;
                }
            }
            if (this.ssaoDepthRenderer) {
                this.disposeSsaoDepthRenderer();
                if (this.postEffectSsaoEnabledValue) {
                    this.configureSsaoDepthRenderer();
                    MmdManager.toonContactAoDepthRenderer = this.isWebGpuEngine() && this.postEffectSsaoEnabledValue
                        ? this.ssaoDepthRenderer
                        : null;
                }
            }
            if (this.ssaoPostProcess && this.postEffectSsaoEnabledValue) {
                this.ssaoPostProcess.dispose(this.camera);
                this.ssaoPostProcess = null;
                this.ensureSsaoFallbackPostProcess();
                this.enforceFinalPostProcessOrder();
            }
            this.refreshFrameGraphPostEffectsBackendAfterResize();
        }
        this.updateOrthographicCameraBounds();
    }

    private resizeGlobalIllumination(): void {
        this.globalIlluminationController?.resize();
    }
}
