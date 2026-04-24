import type { MmdModokiProjectFileV1, ProjectAccessoryState, ProjectSerializedAccessoryTransformTrack, ProjectSerializedModelAnimation } from "../types";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { createCameraAnimationFromTrack, deserializeCameraTrack, deserializeModelAnimation } from "./project-codec";

function normalizePathForCompare(value: string): string {
    return value.replace(/\\/g, "/").toLowerCase();
}

function readFiniteNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readLightingDirectionComponent(
    lighting: { x?: unknown; y?: unknown; z?: unknown; _x?: unknown; _y?: unknown; _z?: unknown },
    key: "x" | "y" | "z",
): number | null {
    const direct = lighting[key];
    if (typeof direct === "number" && Number.isFinite(direct)) {
        return direct;
    }

    const legacyKey = (`_${key}`) as "_x" | "_y" | "_z";
    const legacy = lighting[legacyKey];
    if (typeof legacy === "number" && Number.isFinite(legacy)) {
        return legacy;
    }

    return null;
}

function isProjectFileV1(value: unknown): value is MmdModokiProjectFileV1 {
    return !!value
        && typeof value === "object"
        && (value as MmdModokiProjectFileV1).format === "mmd_modoki_project"
        && (value as MmdModokiProjectFileV1).version === 1;
}

function finalizeImportedRenderState(
    host: any,
    data: MmdModokiProjectFileV1,
    warnings: string[],
): void {
    const lightDirectionX = readLightingDirectionComponent(data.lighting, "x");
    const lightDirectionY = readLightingDirectionComponent(data.lighting, "y");
    const lightDirectionZ = readLightingDirectionComponent(data.lighting, "z");
    for (let modelIndex = 0; modelIndex < data.scene.models.length; modelIndex += 1) {
        const modelState = data.scene.models[modelIndex];
        host.applyImportedMaterialShaderStates(modelIndex, modelState.materialShaders, warnings, modelState.path);
    }

    if (
        lightDirectionX !== null
        && lightDirectionY !== null
        && lightDirectionZ !== null
    ) {
        host.setLightDirection(lightDirectionX, lightDirectionY, lightDirectionZ);
    }

    host.setDofFocusTargetByPath?.(
        typeof data.effects.dofTargetModelPath === "string" && data.effects.dofTargetModelPath.length > 0
            ? data.effects.dofTargetModelPath
            : null,
        typeof data.effects.dofTargetBoneName === "string" && data.effects.dofTargetBoneName.length > 0
            ? data.effects.dofTargetBoneName
            : null,
    );
    host.updateEditorDofFocusAndFStop?.();
    host.applyEditorDofSettings?.();
    host.applyDofLensBlurSettings?.();
    host.applyLightColorTemperature?.();
    host.applyToonShadowInfluenceToAllModels?.();
    host.syncLuminousGlowLayer?.();
    host.engine?.releaseEffects?.();
}

export async function importProjectState(
    host: any,
    data: unknown,
    options: { forExport?: boolean } = {},
): Promise<{ loadedModels: number; warnings: string[] }> {
    if (!isProjectFileV1(data)) {
        throw new Error("Invalid project file format or version");
    }

    const warnings: string[] = [];
    const isExportImport = options.forExport === true;
    const lightDirectionX = readLightingDirectionComponent(data.lighting, "x");
    const lightDirectionY = readLightingDirectionComponent(data.lighting, "y");
    const lightDirectionZ = readLightingDirectionComponent(data.lighting, "z");
    host.clearProjectForImport();

    let loadedModels = 0;
    const embeddedModelAnimationsByPath = new Map<string, ProjectSerializedModelAnimation | null>();
    const keyframeModelAnimations = Array.isArray(data.keyframes?.modelAnimations)
        ? data.keyframes.modelAnimations
        : [];
    for (const keyframeModel of keyframeModelAnimations) {
        if (!keyframeModel || typeof keyframeModel.modelPath !== "string") continue;
        embeddedModelAnimationsByPath.set(
            normalizePathForCompare(keyframeModel.modelPath),
            keyframeModel.animation ?? null,
        );
    }

    for (const modelState of data.scene.models) {
        const modelInfo = await host.loadPMX(modelState.path);
        if (!modelInfo) {
            warnings.push(`Model load failed: ${modelState.path}`);
            continue;
        }

        loadedModels += 1;
        const modelIndex = host.sceneModels.length - 1;
        if (modelIndex < 0) continue;

        const targetEntry = host.sceneModels[modelIndex];
        if (!targetEntry) {
            warnings.push(`Failed to activate model for motion restore: ${modelState.path}`);
            continue;
        }

        if (!isExportImport) {
            host.setActiveModelByIndex(modelIndex);
            host.setActiveModelVisibility(Boolean(modelState.visible));
        } else {
            host.applySceneMeshVisibility(targetEntry.mesh, Boolean(modelState.visible));
        }

        const targetModel = targetEntry.model;

        let restoredEmbeddedAnimation = false;
        const embeddedAnimationData = embeddedModelAnimationsByPath.get(
            normalizePathForCompare(modelState.path),
        ) ?? modelState.animation ?? null;
        if (embeddedAnimationData) {
            const embeddedAnimation = deserializeModelAnimation(embeddedAnimationData, `${modelInfo.name}@project`);
            if (embeddedAnimation) {
                host.modelSourceAnimationsByModel.set(targetModel, embeddedAnimation);
                host.setModelMotionImports(targetModel, (modelState.motionImports ?? []).map((item: any) => ({ ...item })));
                const animHandle = targetModel.createRuntimeAnimation(embeddedAnimation);
                targetModel.setRuntimeAnimation(animHandle);
                host.modelKeyframeTracksByModel.set(
                    targetModel,
                    host.buildModelTrackFrameMapFromAnimation(embeddedAnimation),
                );
                host.emitMergedKeyframeTracks();
                restoredEmbeddedAnimation = true;
            } else {
                warnings.push(`Embedded model animation restore failed: ${modelState.path}`);
            }
        }

        if (!restoredEmbeddedAnimation) {
            host.setModelMotionImports(targetModel, []);
            for (const motionImport of modelState.motionImports ?? []) {
                if (motionImport.type === "vmd") {
                    const motion = await host.loadVMD(motionImport.path);
                    if (!motion) {
                        warnings.push(`Model VMD load failed: ${motionImport.path}`);
                    }
                    continue;
                }

                if (motionImport.type === "vpd") {
                    if (typeof motionImport.frame === "number" && Number.isFinite(motionImport.frame)) {
                        host.seekTo(Math.max(0, Math.floor(motionImport.frame)));
                    }
                    const pose = await host.loadVPD(motionImport.path);
                    if (!pose) {
                        warnings.push(`Model VPD load failed: ${motionImport.path}`);
                    }
                }
            }
        }
    }

    let restoredEmbeddedCamera = false;
    const embeddedCameraAnimationData = data.keyframes?.cameraAnimation ?? data.assets.cameraAnimation ?? null;
    if (embeddedCameraAnimationData) {
        const cameraTrack = deserializeCameraTrack(embeddedCameraAnimationData);
        if (cameraTrack.frameNumbers.length > 0) {
            const cameraAnimation = createCameraAnimationFromTrack(cameraTrack, "projectCamera");
            host.applyCameraAnimation(cameraAnimation, data.assets.cameraVmdPath ?? null);
            restoredEmbeddedCamera = true;
        } else {
            warnings.push("Embedded camera animation is empty");
        }
    }

    if (!restoredEmbeddedCamera && data.assets.cameraVmdPath) {
        const loaded = await host.loadCameraVMD(data.assets.cameraVmdPath);
        if (!loaded) warnings.push(`Camera VMD load failed: ${data.assets.cameraVmdPath}`);
    }

    if (
        !restoredEmbeddedCamera &&
        data.camera &&
        typeof data.camera === "object" &&
        data.camera.target &&
        data.camera.rotation &&
        Number.isFinite(data.camera.target.x) &&
        Number.isFinite(data.camera.target.y) &&
        Number.isFinite(data.camera.target.z) &&
        Number.isFinite(data.camera.rotation.x) &&
        Number.isFinite(data.camera.rotation.y) &&
        Number.isFinite(data.camera.rotation.z)
    ) {
        const fallbackDistance = typeof data.camera.distance === "number" && Number.isFinite(data.camera.distance)
            ? data.camera.distance
            : (
                data.camera.position &&
                Number.isFinite(data.camera.position.x) &&
                Number.isFinite(data.camera.position.y) &&
                Number.isFinite(data.camera.position.z)
            )
                ? Math.max(
                    0.1,
                    Math.hypot(
                        data.camera.position.x - data.camera.target.x,
                        data.camera.position.y - data.camera.target.y,
                        data.camera.position.z - data.camera.target.z,
                    ),
                )
                : host.getCameraDistance();
        const fallbackFov = typeof data.camera.fov === "number" && Number.isFinite(data.camera.fov)
            ? data.camera.fov
            : host.getCameraFov();

        host.applyCameraTrackPose(
            {
                x: data.camera.target.x,
                y: data.camera.target.y,
                z: data.camera.target.z,
            },
            {
                x: data.camera.rotation.x,
                y: data.camera.rotation.y,
                z: data.camera.rotation.z,
            },
            fallbackDistance,
            fallbackFov,
        );
    }

    if (data.assets.audioPath) {
        const loaded = await host.loadMP3(data.assets.audioPath);
        if (!loaded) warnings.push(`Audio load failed: ${data.assets.audioPath}`);
    }

    if (!isExportImport && data.scene.activeModelPath) {
        const targetPath = normalizePathForCompare(data.scene.activeModelPath);
        const targetIndex = host.sceneModels.findIndex(
            (entry: any) => normalizePathForCompare(entry.info.path) === targetPath,
        );
        if (targetIndex >= 0) {
            host.setActiveModelByIndex(targetIndex);
        } else {
            warnings.push(`Active model path not found: ${data.scene.activeModelPath}`);
        }
    }

    const accessoryExtension = host as {
        loadX?: (filePath: string) => Promise<boolean>;
        loadGlb?: (filePath: string) => Promise<boolean>;
        getLoadedAccessories?: () => Array<{ index: number }>;
        setAccessoryVisibility?: (index: number, visible: boolean) => boolean;
        setAccessoryTransform?: (
            index: number,
            transform: Partial<NonNullable<ProjectAccessoryState["transform"]>>,
        ) => boolean;
        setAccessoryParent?: (index: number, modelIndex: number | null, boneName: string | null) => boolean;
        setAccessoryTransformKeyframes?: (index: number, track: ProjectSerializedAccessoryTransformTrack | null) => boolean;
    };
    const accessories = Array.isArray(data.accessories) ? data.accessories : [];
    const accessoryKeyframeTracks = Array.isArray(data.keyframes?.accessoryTransformAnimations)
        ? data.keyframes.accessoryTransformAnimations
        : [];
    if (accessories.length > 0) {
        if (typeof accessoryExtension.loadX !== "function") {
            warnings.push("Accessory restore skipped: accessory loader is unavailable");
        } else {
            for (let accessoryIndex = 0; accessoryIndex < accessories.length; accessoryIndex += 1) {
                const accessoryState = accessories[accessoryIndex];
                if (!accessoryState || typeof accessoryState.path !== "string" || accessoryState.path.trim().length === 0) {
                    warnings.push(`Accessory restore skipped at index ${accessoryIndex}: invalid path`);
                    continue;
                }

                const normalizedPath = accessoryState.path.replace(/\\/g, "/");
                const ext = normalizedPath.substring(normalizedPath.lastIndexOf(".") + 1).toLowerCase();
                const loadAccessory = ext === "glb"
                    ? accessoryExtension.loadGlb
                    : accessoryExtension.loadX;
                if (typeof loadAccessory !== "function") {
                    warnings.push(`Accessory restore skipped: unsupported accessory type for ${accessoryState.path}`);
                    continue;
                }

                const beforeCount = accessoryExtension.getLoadedAccessories?.().length ?? 0;
                const loaded = await loadAccessory(accessoryState.path);
                if (!loaded) {
                    warnings.push(`Accessory load failed: ${accessoryState.path}`);
                    continue;
                }
                const restoredAccessoryIndex = Math.max(
                    0,
                    (accessoryExtension.getLoadedAccessories?.().length ?? (beforeCount + 1)) - 1,
                );

                accessoryExtension.setAccessoryVisibility?.(restoredAccessoryIndex, Boolean(accessoryState.visible));

                const transform = accessoryState.transform;
                if (transform) {
                    accessoryExtension.setAccessoryTransform?.(restoredAccessoryIndex, {
                        position: {
                            x: Number.isFinite(transform.position?.x) ? transform.position.x : 0,
                            y: Number.isFinite(transform.position?.y) ? transform.position.y : 0,
                            z: Number.isFinite(transform.position?.z) ? transform.position.z : 0,
                        },
                        rotationDeg: {
                            x: Number.isFinite(transform.rotationDeg?.x) ? transform.rotationDeg.x : 0,
                            y: Number.isFinite(transform.rotationDeg?.y) ? transform.rotationDeg.y : 0,
                            z: Number.isFinite(transform.rotationDeg?.z) ? transform.rotationDeg.z : 0,
                        },
                        scale: Number.isFinite(transform.scale) ? transform.scale : 1,
                    });
                }

                let parentModelIndex: number | null = null;
                if (typeof accessoryState.parentModelPath === "string" && accessoryState.parentModelPath.trim().length > 0) {
                    const normalizedParentPath = normalizePathForCompare(accessoryState.parentModelPath);
                    parentModelIndex = host.sceneModels.findIndex(
                        (entry: any) => normalizePathForCompare(entry.info.path) === normalizedParentPath,
                    );
                    if (parentModelIndex < 0) {
                        warnings.push(
                            `Accessory parent model not found: ${accessoryState.parentModelPath} (${accessoryState.path})`,
                        );
                        parentModelIndex = null;
                    }
                }

                accessoryExtension.setAccessoryParent?.(
                    restoredAccessoryIndex,
                    parentModelIndex,
                    typeof accessoryState.parentBoneName === "string" && accessoryState.parentBoneName.length > 0
                        ? accessoryState.parentBoneName
                        : null,
                );

                const keyframeTrack = accessoryKeyframeTracks[accessoryIndex] ?? null;
                if (accessoryExtension.setAccessoryTransformKeyframes && keyframeTrack) {
                    accessoryExtension.setAccessoryTransformKeyframes(restoredAccessoryIndex, keyframeTrack);
                }
            }
        }
    }

    host.setGroundVisible(Boolean(data.viewport.groundVisible));
    host.setSkydomeVisible(Boolean(data.viewport.skydomeVisible));
    host.antialiasEnabled = Boolean(data.viewport.antialiasEnabled);
    if (typeof data.viewport.backgroundVideoPath === "string" && data.viewport.backgroundVideoPath.trim().length > 0) {
        try {
            await host.setBackgroundVideoFromPath(data.viewport.backgroundVideoPath);
        } catch {
            warnings.push(`Background video load failed: ${data.viewport.backgroundVideoPath}`);
            host.clearBackgroundMedia();
        }
    } else if (typeof data.viewport.backgroundImagePath === "string" && data.viewport.backgroundImagePath.trim().length > 0) {
        try {
            await host.setBackgroundImageFromPath(data.viewport.backgroundImagePath);
        } catch {
            warnings.push(`Background image load failed: ${data.viewport.backgroundImagePath}`);
            host.clearBackgroundMedia();
        }
    } else {
        host.clearBackgroundMedia();
    }

    if (lightDirectionX !== null && lightDirectionY !== null && lightDirectionZ !== null) {
        host.setLightDirection(lightDirectionX, lightDirectionY, lightDirectionZ);
    }
    host.lightIntensity = data.lighting.intensity;
    host.ambientIntensity = data.lighting.ambientIntensity;
    host.lightColorTemperature = data.lighting.temperatureKelvin;
    if (data.lighting.lightColor &&
        Number.isFinite(data.lighting.lightColor.r) &&
        Number.isFinite(data.lighting.lightColor.g) &&
        Number.isFinite(data.lighting.lightColor.b)) {
        host.setLightColor(data.lighting.lightColor.r, data.lighting.lightColor.g, data.lighting.lightColor.b);
    }
    host.lightFlatStrength = typeof data.lighting.lightFlatStrength === "number" && Number.isFinite(data.lighting.lightFlatStrength)
        ? data.lighting.lightFlatStrength
        : 0;
    host.lightFlatColorInfluence = typeof data.lighting.lightFlatColorInfluence === "number" && Number.isFinite(data.lighting.lightFlatColorInfluence)
        ? data.lighting.lightFlatColorInfluence
        : 0.35;
    if (data.lighting.shadowColor &&
        Number.isFinite(data.lighting.shadowColor.r) &&
        Number.isFinite(data.lighting.shadowColor.g) &&
        Number.isFinite(data.lighting.shadowColor.b)) {
        host.setShadowColor(data.lighting.shadowColor.r, data.lighting.shadowColor.g, data.lighting.shadowColor.b);
    }
    host.toonShadowInfluence = typeof data.lighting.toonShadowInfluence === "number" && Number.isFinite(data.lighting.toonShadowInfluence)
        ? data.lighting.toonShadowInfluence
        : 1;
    host.shadowDarkness = typeof data.lighting.shadowDarkness === "number" && Number.isFinite(data.lighting.shadowDarkness)
        ? data.lighting.shadowDarkness
        : 0;
    host.shadowFrustumSize = typeof data.lighting.shadowFrustumSize === "number" && Number.isFinite(data.lighting.shadowFrustumSize)
        ? data.lighting.shadowFrustumSize
        : host.shadowFrustumSizeValue;
    host.shadowMaxZ = typeof data.lighting.shadowMaxZ === "number" && Number.isFinite(data.lighting.shadowMaxZ)
        ? data.lighting.shadowMaxZ
        : host.shadowMaxZValue;
    host.shadowBias = typeof data.lighting.shadowBias === "number" && Number.isFinite(data.lighting.shadowBias)
        ? data.lighting.shadowBias
        : host.shadowBiasValue;
    host.shadowNormalBias = typeof data.lighting.shadowNormalBias === "number" && Number.isFinite(data.lighting.shadowNormalBias)
        ? data.lighting.shadowNormalBias
        : host.shadowNormalBiasValue;
    const legacyShadowEdgeSoftness = typeof data.lighting.shadowEdgeSoftness === "number" && Number.isFinite(data.lighting.shadowEdgeSoftness)
        ? data.lighting.shadowEdgeSoftness
        : null;
    const selfShadowEdgeSoftness = typeof data.lighting.selfShadowEdgeSoftness === "number" && Number.isFinite(data.lighting.selfShadowEdgeSoftness)
        ? data.lighting.selfShadowEdgeSoftness
        : legacyShadowEdgeSoftness;
    const occlusionShadowEdgeSoftness = typeof data.lighting.occlusionShadowEdgeSoftness === "number" && Number.isFinite(data.lighting.occlusionShadowEdgeSoftness)
        ? data.lighting.occlusionShadowEdgeSoftness
        : legacyShadowEdgeSoftness ?? selfShadowEdgeSoftness;
    if (typeof selfShadowEdgeSoftness === "number") host.selfShadowEdgeSoftness = selfShadowEdgeSoftness;
    if (typeof occlusionShadowEdgeSoftness === "number") host.occlusionShadowEdgeSoftness = occlusionShadowEdgeSoftness;
    host.setShadowEnabled(Boolean(data.lighting.shadowEnabled));

    host.setPhysicsSimulationRateHz(data.physics.simulationRateHz ?? 60);
    host.setPhysicsGravityAcceleration(data.physics.gravityAcceleration);
    host.setPhysicsGravityDirection(
        data.physics.gravityDirection.x,
        data.physics.gravityDirection.y,
        data.physics.gravityDirection.z,
    );
    if (host.physicsAvailable) {
        host.setPhysicsEnabled(Boolean(data.physics.enabled));
    } else if (data.physics.enabled) {
        warnings.push("Physics was enabled in project, but physics is unavailable in this environment");
    }

    host.dofEnabled = Boolean(data.effects.dofEnabled);
    host.dofFocusDistanceMm = readFiniteNumber(data.effects.dofFocusDistanceMm, 10000);
    host.dofAutoFocusNearOffsetMm = readFiniteNumber(data.effects.dofFocusOffsetMm, 0);
    host.dofBlurLevel = readFiniteNumber(data.effects.dofBlurLevel, 1);
    host.setDofFocusTargetByPath?.(
        typeof data.effects.dofTargetModelPath === "string" && data.effects.dofTargetModelPath.length > 0
            ? data.effects.dofTargetModelPath
            : null,
        typeof data.effects.dofTargetBoneName === "string" && data.effects.dofTargetBoneName.length > 0
            ? data.effects.dofTargetBoneName
            : null,
    );
    host.dofFStop = readFiniteNumber(data.effects.dofFStop, 5.6);
    host.dofNearSuppressionScale = readFiniteNumber(data.effects.dofNearSuppressionScale, 4);
    host.dofLensSize = readFiniteNumber(data.effects.dofLensSize, 50);
    host.dofFocalLengthDistanceInverted = typeof data.effects.dofFocalLengthDistanceInverted === "boolean"
        ? data.effects.dofFocalLengthDistanceInverted
        : false;
    host.dofFocalLength = readFiniteNumber(data.effects.dofFocalLength, 50);
    host.dofLensBlurStrength = readFiniteNumber(data.effects.dofLensBlurStrength, 0);
    host.dofLensEdgeBlur = readFiniteNumber(data.effects.dofLensEdgeBlur, 0);
    host.dofLensDistortion = readFiniteNumber(data.effects.dofLensDistortion, 0);
    host.dofLensDistortionInfluence = readFiniteNumber(data.effects.dofLensDistortionInfluence, 0);
    host.modelEdgeWidth = readFiniteNumber(data.effects.modelEdgeWidth, 1);
    host.postEffectContrast = readFiniteNumber(data.effects.contrast, 1);
    const importedGamma = readFiniteNumber(data.effects.gamma, 1);
    const gammaEncodingVersion = (data.effects as { gammaEncodingVersion?: unknown }).gammaEncodingVersion;
    host.postEffectGamma = gammaEncodingVersion === 2 ? importedGamma : importedGamma * 0.5;
    host.postEffectExposure = typeof data.effects.exposure === "number" && Number.isFinite(data.effects.exposure)
        ? data.effects.exposure
        : 1;
    host.postEffectToneMappingEnabled = typeof data.effects.toneMappingEnabled === "boolean"
        ? data.effects.toneMappingEnabled
        : false;
    host.postEffectToneMappingType = typeof data.effects.toneMappingType === "number" && Number.isFinite(data.effects.toneMappingType)
        ? data.effects.toneMappingType
        : ImageProcessingConfiguration.TONEMAPPING_STANDARD;
    host.postEffectDitheringEnabled = typeof data.effects.ditheringEnabled === "boolean"
        ? data.effects.ditheringEnabled
        : false;
    host.postEffectDitheringIntensity = typeof data.effects.ditheringIntensity === "number" && Number.isFinite(data.effects.ditheringIntensity)
        ? data.effects.ditheringIntensity
        : (1 / 255);
    host.postEffectVignetteEnabled = typeof data.effects.vignetteEnabled === "boolean"
        ? data.effects.vignetteEnabled
        : false;
    host.postEffectVignetteWeight = typeof data.effects.vignetteWeight === "number" && Number.isFinite(data.effects.vignetteWeight)
        ? data.effects.vignetteWeight
        : 0.3;
    host.postEffectBloomEnabled = typeof data.effects.bloomEnabled === "boolean"
        ? data.effects.bloomEnabled
        : (typeof data.effects.bloomWeight === "number" && Number.isFinite(data.effects.bloomWeight)
            ? data.effects.bloomWeight > 0.0001
            : false);
    host.postEffectBloomWeight = typeof data.effects.bloomWeight === "number" && Number.isFinite(data.effects.bloomWeight)
        ? data.effects.bloomWeight
        : 1;
    host.postEffectBloomThreshold = typeof data.effects.bloomThreshold === "number" && Number.isFinite(data.effects.bloomThreshold)
        ? data.effects.bloomThreshold
        : 1;
    host.postEffectBloomKernel = typeof data.effects.bloomKernel === "number" && Number.isFinite(data.effects.bloomKernel)
        ? data.effects.bloomKernel
        : 100;
    host.postEffectChromaticAberration = typeof data.effects.chromaticAberration === "number" && Number.isFinite(data.effects.chromaticAberration)
        ? data.effects.chromaticAberration
        : 0;
    host.postEffectGrainIntensity = typeof data.effects.grainIntensity === "number" && Number.isFinite(data.effects.grainIntensity)
        ? data.effects.grainIntensity
        : 0;
    host.postEffectSharpenEdge = typeof data.effects.sharpenEdge === "number" && Number.isFinite(data.effects.sharpenEdge)
        ? data.effects.sharpenEdge
        : 0;
    host.postEffectSsaoStrength = typeof data.effects.ssaoStrength === "number" && Number.isFinite(data.effects.ssaoStrength)
        ? data.effects.ssaoStrength
        : 1;
    host.postEffectSsaoRadius = typeof data.effects.ssaoRadius === "number" && Number.isFinite(data.effects.ssaoRadius)
        ? data.effects.ssaoRadius
        : 2;
    host.postEffectSsaoFadeEnd = typeof data.effects.ssaoFadeEnd === "number" && Number.isFinite(data.effects.ssaoFadeEnd)
        ? data.effects.ssaoFadeEnd
        : 200;
    host.postEffectSsaoDebugView = typeof data.effects.ssaoDebugView === "boolean"
        ? data.effects.ssaoDebugView
        : false;
    host.postEffectSsaoEnabled = typeof data.effects.ssaoEnabled === "boolean"
        ? data.effects.ssaoEnabled
        : false;
    host.postEffectColorCurvesEnabled = typeof data.effects.colorCurvesEnabled === "boolean"
        ? data.effects.colorCurvesEnabled
        : false;
    host.postEffectColorCurvesHue = typeof data.effects.colorCurvesHue === "number" && Number.isFinite(data.effects.colorCurvesHue)
        ? data.effects.colorCurvesHue
        : 30;
    host.postEffectColorCurvesDensity = typeof data.effects.colorCurvesDensity === "number" && Number.isFinite(data.effects.colorCurvesDensity)
        ? data.effects.colorCurvesDensity
        : 0;
    host.postEffectColorCurvesSaturation = typeof data.effects.colorCurvesSaturation === "number" && Number.isFinite(data.effects.colorCurvesSaturation)
        ? data.effects.colorCurvesSaturation
        : 0;
    host.postEffectColorCurvesExposure = typeof data.effects.colorCurvesExposure === "number" && Number.isFinite(data.effects.colorCurvesExposure)
        ? data.effects.colorCurvesExposure
        : 0;
    host.postEffectGlowEnabled = typeof data.effects.glowEnabled === "boolean"
        ? data.effects.glowEnabled
        : false;
    host.postEffectGlowIntensity = typeof data.effects.glowIntensity === "number" && Number.isFinite(data.effects.glowIntensity)
        ? data.effects.glowIntensity
        : 0.5;
    host.postEffectGlowKernel = typeof data.effects.glowKernel === "number" && Number.isFinite(data.effects.glowKernel)
        ? data.effects.glowKernel
        : 20;
    host.postEffectLutPreset = typeof data.effects.lutPreset === "string"
        ? data.effects.lutPreset
        : host.postEffectLutPreset;
    host.postEffectLutSourceMode = typeof data.effects.lutSourceMode === "string"
        ? data.effects.lutSourceMode
        : host.postEffectLutSourceMode;
    host.setPostEffectExternalLut(
        typeof data.effects.lutExternalPath === "string" ? data.effects.lutExternalPath : null,
        null,
        null,
    );
    host.postEffectLutIntensity = typeof data.effects.lutIntensity === "number" && Number.isFinite(data.effects.lutIntensity)
        ? data.effects.lutIntensity
        : 1;
    host.postEffectLutEnabled = typeof data.effects.lutEnabled === "boolean"
        ? data.effects.lutEnabled
        : false;
    host.setExternalWgslToonShader(
        typeof data.effects.wgslToonShaderPath === "string" ? data.effects.wgslToonShaderPath : null,
        null,
    );
    host.postEffectMotionBlurEnabled = typeof data.effects.motionBlurEnabled === "boolean"
        ? data.effects.motionBlurEnabled
        : false;
    host.postEffectMotionBlurStrength = typeof data.effects.motionBlurStrength === "number" && Number.isFinite(data.effects.motionBlurStrength)
        ? data.effects.motionBlurStrength
        : 0.35;
    host.postEffectMotionBlurSamples = typeof data.effects.motionBlurSamples === "number" && Number.isFinite(data.effects.motionBlurSamples)
        ? data.effects.motionBlurSamples
        : 8;
    host.postEffectSsrEnabled = typeof data.effects.ssrEnabled === "boolean"
        ? data.effects.ssrEnabled
        : false;
    host.postEffectSsrStrength = typeof data.effects.ssrStrength === "number" && Number.isFinite(data.effects.ssrStrength)
        ? data.effects.ssrStrength
        : 0.8;
    host.postEffectSsrStep = typeof data.effects.ssrStep === "number" && Number.isFinite(data.effects.ssrStep)
        ? data.effects.ssrStep
        : 0.75;
    host.postEffectVlsEnabled = typeof data.effects.vlsEnabled === "boolean"
        ? data.effects.vlsEnabled
        : false;
    host.postEffectVlsExposure = typeof data.effects.vlsExposure === "number" && Number.isFinite(data.effects.vlsExposure)
        ? data.effects.vlsExposure
        : 0.18;
    host.postEffectVlsDecay = typeof data.effects.vlsDecay === "number" && Number.isFinite(data.effects.vlsDecay)
        ? data.effects.vlsDecay
        : 0.95;
    host.postEffectVlsWeight = typeof data.effects.vlsWeight === "number" && Number.isFinite(data.effects.vlsWeight)
        ? data.effects.vlsWeight
        : 0.2;
    host.postEffectVlsDensity = typeof data.effects.vlsDensity === "number" && Number.isFinite(data.effects.vlsDensity)
        ? data.effects.vlsDensity
        : 0.8;
    host.postEffectFogEnabled = typeof data.effects.fogEnabled === "boolean"
        ? data.effects.fogEnabled
        : false;
    host.postEffectFogMode = typeof data.effects.fogMode === "number" && Number.isFinite(data.effects.fogMode)
        ? data.effects.fogMode
        : 0;
    host.postEffectFogStart = typeof data.effects.fogStart === "number" && Number.isFinite(data.effects.fogStart)
        ? data.effects.fogStart
        : 100;
    host.postEffectFogEnd = typeof data.effects.fogEnd === "number" && Number.isFinite(data.effects.fogEnd)
        ? data.effects.fogEnd
        : 300;
    host.postEffectFogDensity = typeof data.effects.fogDensity === "number" && Number.isFinite(data.effects.fogDensity)
        ? data.effects.fogDensity
        : 0.01;
    host.postEffectFogOpacity = typeof data.effects.fogOpacity === "number" && Number.isFinite(data.effects.fogOpacity)
        ? data.effects.fogOpacity
        : 1;
    if (data.effects.fogColor &&
        Number.isFinite(data.effects.fogColor.r) &&
        Number.isFinite(data.effects.fogColor.g) &&
        Number.isFinite(data.effects.fogColor.b)) {
        host.setPostEffectFogColor(data.effects.fogColor.r, data.effects.fogColor.g, data.effects.fogColor.b);
    }

    host.refreshTotalFramesFromContent();
    host.setRenderFpsLimit(host.renderFpsLimit);
    host.seekTo(Math.max(0, Math.floor(data.scene.currentFrame ?? 0)));
    host.setPlaybackSpeed(Math.max(0.01, data.scene.playbackSpeed));
    host.setTimelineTarget(data.scene.timelineTarget === "camera" ? "camera" : "model");
    finalizeImportedRenderState(host, data, warnings);

    return { loadedModels, warnings };
}
