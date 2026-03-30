import type { MmdModokiProjectFileV1, ProjectAccessoryState, ProjectKeyframeBundle, ProjectSerializedAccessoryTransformTrack } from "../types";
import { serializeCameraTrack, serializeModelAnimation } from "./project-codec";

type ProjectExportAccessory = {
    index: number;
    path: string;
    visible: boolean;
};

export function exportProjectState(host: any): MmdModokiProjectFileV1 {
    const accessoryExtension = host as {
        getLoadedAccessories?: () => ProjectExportAccessory[];
        getAccessoryTransform?: (index: number) => {
            position: { x: number; y: number; z: number };
            rotationDeg: { x: number; y: number; z: number };
            scale: number;
        } | null;
        getAccessoryParent?: (index: number) => { modelIndex: number | null; boneName: string | null } | null;
        getAccessoryTransformKeyframes?: (index: number) => ProjectSerializedAccessoryTransformTrack | null;
    };

    const models = host.sceneModels.map((entry: any) => ({
        path: entry.info.path,
        visible: host.getModelVisibility(entry.mesh),
        motionImports: (host.modelMotionImportsByModel.get(entry.model) ?? []).map((item: any) => ({ ...item })),
        materialShaders: host.getSerializedMaterialShaderStates(entry),
    }));

    const accessories: ProjectAccessoryState[] = (accessoryExtension.getLoadedAccessories?.() ?? []).map((entry) => {
        const transform = accessoryExtension.getAccessoryTransform?.(entry.index) ?? null;
        const parent = accessoryExtension.getAccessoryParent?.(entry.index) ?? null;
        const parentModelPath = typeof parent?.modelIndex === "number" && parent.modelIndex >= 0
            ? host.sceneModels[parent.modelIndex]?.info.path ?? null
            : null;

        return {
            path: entry.path,
            visible: entry.visible,
            transform: transform ?? undefined,
            parentModelPath,
            parentBoneName: parent?.boneName ?? null,
        };
    });

    const keyframes: ProjectKeyframeBundle = {
        modelAnimations: host.sceneModels.map((entry: any) => ({
            modelPath: entry.info.path,
            animation: serializeModelAnimation(host.modelSourceAnimationsByModel.get(entry.model)),
        })),
        cameraAnimation: serializeCameraTrack(host.cameraSourceAnimation?.cameraTrack),
    };

    const accessoryTransformAnimations = (accessoryExtension.getLoadedAccessories?.() ?? [])
        .map((entry) => accessoryExtension.getAccessoryTransformKeyframes?.(entry.index) ?? null);
    if (accessoryTransformAnimations.length > 0) {
        keyframes.accessoryTransformAnimations = accessoryTransformAnimations;
    }

    return {
        format: "mmd_modoki_project",
        version: 1,
        savedAt: new Date().toISOString(),
        scene: {
            models,
            activeModelPath: host.activeModelInfo?.path ?? null,
            timelineTarget: host.timelineTarget,
            currentFrame: host._currentFrame,
            playbackSpeed: host._playbackSpeed,
        },
        assets: {
            cameraVmdPath: host.cameraMotionPath,
            audioPath: host.audioSourcePath,
        },
        camera: {
            position: {
                x: host.camera.position.x,
                y: host.camera.position.y,
                z: host.camera.position.z,
            },
            target: {
                x: host.camera.target.x,
                y: host.camera.target.y,
                z: host.camera.target.z,
            },
            rotation: {
                x: host.cameraRotationEulerDeg.x,
                y: host.cameraRotationEulerDeg.y,
                z: host.cameraRotationEulerDeg.z,
            },
            fov: host.getCameraFov(),
            distance: host.getCameraDistance(),
        },
        lighting: {
            ...host.getLightDirection(),
            intensity: host.lightIntensity,
            ambientIntensity: host.ambientIntensity,
            temperatureKelvin: host.lightColorTemperature,
            lightColor: host.getLightColor(),
            lightFlatStrength: host.lightFlatStrength,
            lightFlatColorInfluence: host.lightFlatColorInfluence,
            shadowColor: host.getShadowColor(),
            toonShadowInfluence: host.toonShadowInfluence,
            shadowEnabled: host.shadowEnabled,
            shadowDarkness: host.shadowDarkness,
            shadowFrustumSize: host.shadowFrustumSize,
            shadowBias: host.shadowBias,
            shadowNormalBias: host.shadowNormalBias,
            shadowEdgeSoftness: host.shadowEdgeSoftness,
            selfShadowEdgeSoftness: host.selfShadowEdgeSoftness,
            occlusionShadowEdgeSoftness: host.occlusionShadowEdgeSoftness,
        },
        viewport: {
            groundVisible: host.isGroundVisible(),
            skydomeVisible: host.isSkydomeVisible(),
            antialiasEnabled: host.antialiasEnabled,
        },
        physics: {
            enabled: host.physicsEnabled,
            simulationRateHz: host.physicsSimulationRateHz,
            gravityAcceleration: host.physicsGravityAcceleration,
            gravityDirection: {
                x: host.physicsGravityDirection.x,
                y: host.physicsGravityDirection.y,
                z: host.physicsGravityDirection.z,
            },
        },
        effects: {
            dofEnabled: host.dofEnabled,
            dofFocusDistanceMm: host.dofFocusDistanceMm,
            dofFocusOffsetMm: host.dofAutoFocusNearOffsetMm,
            dofFStop: host.dofFStop,
            dofLensSize: host.dofLensSize,
            dofLensBlurStrength: host.dofLensBlurStrength,
            dofLensEdgeBlur: host.dofLensEdgeBlur,
            dofLensDistortionInfluence: host.dofLensDistortionInfluence,
            modelEdgeWidth: host.modelEdgeWidth,
            gamma: host.postEffectGamma,
            exposure: host.postEffectExposure,
            toneMappingEnabled: host.postEffectToneMappingEnabled,
            toneMappingType: host.postEffectToneMappingType,
            ditheringEnabled: host.postEffectDitheringEnabled,
            ditheringIntensity: host.postEffectDitheringIntensity,
            vignetteEnabled: host.postEffectVignetteEnabled,
            vignetteWeight: host.postEffectVignetteWeight,
            bloomEnabled: host.postEffectBloomEnabled,
            bloomWeight: host.postEffectBloomWeight,
            bloomThreshold: host.postEffectBloomThreshold,
            bloomKernel: host.postEffectBloomKernel,
            chromaticAberration: host.postEffectChromaticAberration,
            grainIntensity: host.postEffectGrainIntensity,
            sharpenEdge: host.postEffectSharpenEdge,
            ssaoEnabled: host.postEffectSsaoEnabled,
            ssaoStrength: host.postEffectSsaoStrength,
            ssaoRadius: host.postEffectSsaoRadius,
            ssaoFadeEnd: host.postEffectSsaoFadeEnd,
            ssaoDebugView: host.postEffectSsaoDebugView,
            colorCurvesEnabled: host.postEffectColorCurvesEnabled,
            colorCurvesHue: host.postEffectColorCurvesHue,
            colorCurvesDensity: host.postEffectColorCurvesDensity,
            colorCurvesSaturation: host.postEffectColorCurvesSaturation,
            colorCurvesExposure: host.postEffectColorCurvesExposure,
            glowEnabled: host.postEffectGlowEnabled,
            glowIntensity: host.postEffectGlowIntensity,
            glowKernel: host.postEffectGlowKernel,
            lutEnabled: host.postEffectLutEnabled,
            lutIntensity: host.postEffectLutIntensity,
            lutPreset: host.postEffectLutPreset,
            lutSourceMode: host.postEffectLutSourceMode,
            lutExternalPath: host.postEffectLutExternalPath,
            wgslToonShaderPath: host.getExternalWgslToonShaderPath(),
            motionBlurEnabled: host.postEffectMotionBlurEnabled,
            motionBlurStrength: host.postEffectMotionBlurStrength,
            motionBlurSamples: host.postEffectMotionBlurSamples,
            ssrEnabled: host.postEffectSsrEnabled,
            ssrStrength: host.postEffectSsrStrength,
            ssrStep: host.postEffectSsrStep,
            vlsEnabled: host.postEffectVlsEnabled,
            vlsExposure: host.postEffectVlsExposure,
            vlsDecay: host.postEffectVlsDecay,
            vlsWeight: host.postEffectVlsWeight,
            vlsDensity: host.postEffectVlsDensity,
            fogEnabled: host.postEffectFogEnabled,
            fogMode: host.postEffectFogMode,
            fogStart: host.postEffectFogStart,
            fogEnd: host.postEffectFogEnd,
            fogDensity: host.postEffectFogDensity,
            fogOpacity: host.postEffectFogOpacity,
            fogColor: host.getPostEffectFogColor(),
            gammaEncodingVersion: 2,
        },
        accessories,
        keyframes,
    };
}
