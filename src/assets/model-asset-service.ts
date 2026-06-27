import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton";
import type { Scene } from "@babylonjs/core/scene";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Material } from "@babylonjs/core/Materials/material";
import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { BoneControlInfo, ModelInfo } from "../types";
import { MmdModelLoader } from "babylon-mmd/esm/Loader/mmdModelLoader";
import { MmdStandardMaterialBuilder } from "babylon-mmd/esm/Loader/mmdStandardMaterialBuilder";
import { MmdMaterialRenderMethod } from "babylon-mmd/esm/Loader/materialBuilderBase";
import { MmdStandardMaterialProxy } from "babylon-mmd/esm/Runtime/mmdStandardMaterialProxy";
import type { MmdMesh } from "babylon-mmd/esm/Runtime/mmdMesh";
import { logDebugIfEnabled, logError, logInfo, logWarn, toLogErrorData } from "../app-logger";
import { ensureMaterialShaderDefaults } from "../scene/material-shader-service";

const PMX_BONE_FLAG_VISIBLE = 0x0008;
const PMX_BONE_FLAG_ROTATABLE = 0x0002;
const PMX_BONE_FLAG_MOVABLE = 0x0004;
const PMX_MORPH_CATEGORY_SYSTEM = 0;
const PMX_MORPH_CATEGORY_EYEBROW = 1;
const PMX_MORPH_CATEGORY_EYE = 2;
const PMX_MORPH_CATEGORY_LIP = 3;
const PMX_MORPH_CATEGORY_OTHER = 4;

function splitFilePath(filePath: string): { dir: string; fileName: string } {
    const pathParts = filePath.replace(/\\/g, "/");
    const lastSlash = pathParts.lastIndexOf("/");
    return {
        dir: pathParts.substring(0, lastSlash + 1),
        fileName: pathParts.substring(lastSlash + 1),
    };
}

type SceneModelMaterialEntry = {
    key: string;
    name: string;
    material: ModelAssetMaterial;
    meshNames: string[];
};

type ModelAssetMaterial = object & {
    name?: unknown;
    subMaterials?: Array<ModelAssetMaterial | null | undefined>;
    alpha?: number;
    transparencyMode?: number;
    useAlphaFromDiffuseTexture?: boolean;
    backFaceCulling?: boolean;
    disableColorWrite?: boolean;
    disableDepthWrite?: boolean;
    forceDepthWrite?: boolean;
    needDepthPrePass?: boolean;
    diffuseTexture?: {
        name?: string;
        hasAlpha?: boolean;
        metadata?: Record<string, unknown> | null;
        isReady?: () => boolean;
    } | null;
    getClassName?: () => string;
    _pluginMaterial?: {
        isMock?: boolean;
        constructor?: { name?: string };
    };
    onCompiled?: (effect: unknown) => void;
    onError?: (effect: unknown, errors: string) => void;
    isReadyForSubMesh?: (mesh: Mesh, subMesh: unknown, useInstances?: boolean) => boolean;
    markAsDirty?: (flag?: number) => void;
};

type ModelAssetSceneWithDirtyBlock = Scene & {
    blockMaterialDirtyMechanism?: boolean;
    _forceBlockMaterialDirtyMechanism?: (value: boolean) => void;
};

function getConstructorName(value: unknown): string | null {
    return typeof value === "object" && value !== null
        ? ((value as { constructor?: { name?: string } }).constructor?.name ?? null)
        : null;
}

function ensureSharedMmdMaterialBuilder(fileName: string): MmdStandardMaterialBuilder {
    const currentBuilder = MmdModelLoader.SharedMaterialBuilder;
    if (currentBuilder instanceof MmdStandardMaterialBuilder) {
        currentBuilder.renderMethod = MmdMaterialRenderMethod.DepthWriteAlphaBlendingWithEvaluation;
        logInfo("asset", "MMD material builder ready", {
            fileName,
            builder: getConstructorName(currentBuilder),
        });
        return currentBuilder;
    }

    const builder = new MmdStandardMaterialBuilder();
    builder.renderMethod = MmdMaterialRenderMethod.DepthWriteAlphaBlendingWithEvaluation;
    MmdModelLoader.SharedMaterialBuilder = builder;
    logWarn("asset", "MMD material builder replaced before model import", {
        fileName,
        previousBuilder: getConstructorName(currentBuilder),
        builder: getConstructorName(builder),
    });
    return builder;
}

type ModelAssetRuntimeModel = object;

type ModelAssetHost = {
    physicsInitializationPromise: Promise<unknown>;
    scene: Scene;
    materialShaderPresetByMaterial: WeakMap<object, string>;
    constructor: unknown;
    suspendSceneRendering(): void;
    resumeSceneRendering(): void;
    applyGpuBoneTextureStorageForLargeSkeletons?: (fileName: string, meshes: Mesh[], skeletons: Skeleton[]) => void;
    applyCpuSkinningFallbackForWebGpuSdefMeshes?: (fileName: string, meshes: Mesh[]) => void;
    buildPmxMaterialFlagMap(metadata: object): WeakMap<object, number>;
    resolvePmxShadowFlagsForMaterial(material: unknown, materialFlagMap: WeakMap<object, number>): {
        receivesShadow: boolean;
        castsShadow: boolean;
    };
    shadowGenerator: Pick<ShadowGenerator, "addShadowCaster">;
    applyMmdMaterialCompatibilityFixes(material: ModelAssetMaterial): boolean;
    applyModelEdgeToMeshes(meshes: Mesh[]): void;
    applyCelShadingToMeshes(meshes: Mesh[]): void;
    applyAnisotropicFilteringToMeshes?: (meshes: Mesh[]) => void;
    applyDebugMaterialOverrideToMeshes?: (fileName: string, meshes: Mesh[]) => void;
    mmdRuntime: {
        createMmdModel(mesh: MmdMesh, options: object): ModelAssetRuntimeModel;
    };
    isPhysicsAvailable(): boolean;
    normalizeRuntimeBoneTransformStages?: (model: ModelAssetRuntimeModel) => void;
    normalizeRuntimeBoneEvaluationOrder?: (model: ModelAssetRuntimeModel) => void;
    patchModelAfterPhysicsForPausedState?: (model: ModelAssetRuntimeModel) => void;
    applyPhysicsStateToModel(model: ModelAssetRuntimeModel): void;
    modelKeyframeTracksByModel: WeakMap<ModelAssetRuntimeModel, Map<string, Uint32Array>>;
    modelSourceAnimationsByModel: WeakMap<ModelAssetRuntimeModel, object>;
    setModelMotionImports(model: ModelAssetRuntimeModel, imports: []): void;
    sceneModels: Array<{
        mesh: MmdMesh;
        model: ModelAssetRuntimeModel;
        info: ModelInfo;
        materials: SceneModelMaterialEntry[];
        rigidBodies: Array<{
            name: string;
            boneIndex: number;
            shapeType: number;
            shapeSize: [number, number, number];
            physicsMode: number;
        }>;
        shadowCasterMeshes: Mesh[];
        contactShadowMesh: null;
        castShadow: boolean;
    }>;
    refreshRigidBodyVisualizerTarget(): void;
    syncLuminousGlowLayer?: () => void;
    syncGlobalIlluminationSceneModels?: () => void;
    syncIblShadowsScene?: () => void;
    refreshFrameGraphPostEffectsBackendForStackStateChange?: () => void;
    dumpRenderDiagnostics?: (reason: string) => void;
    shouldActivateAsCurrent(modelInfo: ModelInfo): boolean;
    currentMesh: MmdMesh | null;
    currentModel: ModelAssetRuntimeModel | null;
    activeModelInfo: ModelInfo | null;
    timelineTarget: "model" | "camera";
    refreshBoneVisualizerTarget(): void;
    setTimelineTarget(target: "model" | "camera"): void;
    updateBoneGizmoTarget(): void;
    onModelLoaded?: (modelInfo: ModelInfo) => void;
    emitMergedKeyframeTracks(): void;
    onSceneModelLoaded?: (modelInfo: ModelInfo, modelCount: number, activateAsCurrent: boolean) => void;
    onError?: (message: string) => void;
};

function visitModelMaterials(
    mesh: Mesh,
    visitor: (material: ModelAssetMaterial, fallbackName: string, meshName: string) => void,
): void {
    const meshName = mesh.name || "mesh";
    const material = mesh.material as ModelAssetMaterial | null;
    if (!material) return;

    if (Array.isArray(material.subMaterials)) {
        for (let subIndex = 0; subIndex < material.subMaterials.length; subIndex += 1) {
            const subMaterial = material.subMaterials[subIndex];
            if (subMaterial && typeof subMaterial === "object") {
                visitor(subMaterial, `${meshName}#${String(subIndex + 1)}`, meshName);
            }
        }
        return;
    }

    visitor(material, meshName, meshName);
}

function collectSceneModelMaterials(host: ModelAssetHost, meshes: Mesh[]): SceneModelMaterialEntry[] {
    const materialMap = new Map<object, SceneModelMaterialEntry>();
    let materialIndex = 0;

    const registerMaterial = (material: ModelAssetMaterial, fallbackName: string, meshName: string): void => {
        if (!material || typeof material !== "object") return;
        const materialName = typeof material.name === "string" && material.name.trim().length > 0
            ? material.name
            : fallbackName;

        let entry = materialMap.get(material as object);
        if (!entry) {
            const key = String(materialIndex) + ":" + materialName;
            materialIndex += 1;
            entry = {
                key,
                name: materialName,
                material,
                meshNames: [],
            };
            materialMap.set(material as object, entry);
        }

        if (!entry.meshNames.includes(meshName)) {
            entry.meshNames.push(meshName);
        }

        ensureMaterialShaderDefaults(host, material);
        if (!host.materialShaderPresetByMaterial.has(material as object)) {
            const hostConstructor = host.constructor as { DEFAULT_WGSL_MATERIAL_SHADER_PRESET: string };
            host.materialShaderPresetByMaterial.set(
                material as object,
                hostConstructor.DEFAULT_WGSL_MATERIAL_SHADER_PRESET,
            );
        }
    };

    for (const mesh of meshes) {
        visitModelMaterials(mesh, registerMaterial);
    }

    return Array.from(materialMap.values());
}

function markModelMaterialDirty(material: ModelAssetMaterial): void {
    if (typeof material.markAsDirty !== "function") return;
    try {
        material.markAsDirty(Material.AllDirtyFlag);
    } catch {
        try {
            material.markAsDirty();
        } catch {
            // Some Babylon internals can reject dirty marks during disposal.
        }
    }
}

function delayMs(ms: number): Promise<void> {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

function collectUniqueModelMaterials(meshes: readonly Mesh[]): ModelAssetMaterial[] {
    const materials = new Set<ModelAssetMaterial>();
    for (const mesh of meshes) {
        visitModelMaterials(mesh, (material) => {
            materials.add(material);
        });
    }
    return Array.from(materials);
}

function countPendingMmdMaterialPlugins(materials: readonly ModelAssetMaterial[]): number {
    return materials.filter((material) => material._pluginMaterial?.isMock === true).length;
}

function roundUvForLog(value: number): number {
    return Math.round(value * 100000) / 100000;
}

function summarizeMeshUv(mesh: Mesh): {
    min: [number, number];
    max: [number, number];
    outside01: number;
    samples: Array<[number, number]>;
} | null {
    const uvData = mesh.getVerticesData("uv") as ArrayLike<number> | null;
    if (!uvData || uvData.length < 2) return null;

    let minU = Number.POSITIVE_INFINITY;
    let minV = Number.POSITIVE_INFINITY;
    let maxU = Number.NEGATIVE_INFINITY;
    let maxV = Number.NEGATIVE_INFINITY;
    let outside01 = 0;
    const samples: Array<[number, number]> = [];

    for (let index = 0; index + 1 < uvData.length; index += 2) {
        const u = Number(uvData[index]);
        const v = Number(uvData[index + 1]);
        if (!Number.isFinite(u) || !Number.isFinite(v)) continue;

        minU = Math.min(minU, u);
        minV = Math.min(minV, v);
        maxU = Math.max(maxU, u);
        maxV = Math.max(maxV, v);
        if (u < 0 || u > 1 || v < 0 || v > 1) outside01 += 1;
        if (samples.length < 8) samples.push([roundUvForLog(u), roundUvForLog(v)]);
    }

    if (!Number.isFinite(minU) || !Number.isFinite(minV) || !Number.isFinite(maxU) || !Number.isFinite(maxV)) {
        return null;
    }

    return {
        min: [roundUvForLog(minU), roundUvForLog(minV)],
        max: [roundUvForLog(maxU), roundUvForLog(maxV)],
        outside01,
        samples,
    };
}

function shouldLogDetailedMaterialUv(name: string | null): boolean {
    if (!name) return false;
    const normalized = name.toLowerCase();
    return normalized.includes("eye")
        || name.includes("目")
        || name.includes("顔")
        || normalized.includes("hair")
        || name.includes("髪");
}

async function waitForMmdMaterialPluginsReady(fileName: string, meshes: readonly Mesh[]): Promise<void> {
    const materials = collectUniqueModelMaterials(meshes);
    const initialPending = countPendingMmdMaterialPlugins(materials);
    if (initialPending === 0) return;

    const timeoutMs = 2500;
    const startedAt = performance.now();
    let pending = initialPending;
    while (performance.now() - startedAt < timeoutMs) {
        await delayMs(16);
        pending = countPendingMmdMaterialPlugins(materials);
        if (pending === 0) break;
    }

    for (const material of materials) {
        markModelMaterialDirty(material);
    }

    logWarn("asset", "waited for MMD material shader plugin initialization", {
        fileName,
        materialCount: materials.length,
        initialPending,
        remainingPending: pending,
        waitedMs: Math.round(performance.now() - startedAt),
        pluginSamples: materials.slice(0, 8).map((material) => ({
            name: typeof material.name === "string" ? material.name : null,
            plugin: material._pluginMaterial?.constructor?.name ?? null,
            isMock: material._pluginMaterial?.isMock ?? null,
        })),
    });
}

function restoreMaterialDirtyMechanismAfterImport(scene: Scene, meshes: readonly Mesh[]): void {
    const dirtyScene = scene as ModelAssetSceneWithDirtyBlock;
    if (dirtyScene.blockMaterialDirtyMechanism === true) {
        dirtyScene._forceBlockMaterialDirtyMechanism?.(false);
        logWarn("asset", "material dirty mechanism was still blocked after model import; forced restore", {
            meshCount: meshes.length,
        });
    }

    for (const material of collectUniqueModelMaterials(meshes)) {
        markModelMaterialDirty(material);
    }
}

function useParentMeshBoundsForSubMeshes(meshes: readonly Mesh[]): void {
    let patchedMeshCount = 0;
    let patchedSubMeshCount = 0;

    for (const mesh of meshes) {
        if ((mesh.subMeshes?.length ?? 0) <= 1) continue;

        mesh.computeWorldMatrix(true);
        mesh.refreshBoundingInfo();
        const boundingInfo = mesh.getBoundingInfo();
        for (const subMesh of mesh.subMeshes) {
            if (subMesh.IsGlobal) continue;
            subMesh.setBoundingInfo(boundingInfo);
            patchedSubMeshCount += 1;
        }
        patchedMeshCount += 1;
    }

    if (patchedSubMeshCount > 0) {
        logDebugIfEnabled("renderStability", "asset", "PMX submesh bounds unified to parent mesh bounds", {
            meshCount: patchedMeshCount,
            subMeshCount: patchedSubMeshCount,
        });
    }
}

function logModelMaterialVisibilitySummary(fileName: string, meshes: readonly Mesh[], reason: string): void {
    const summary: Array<{
        mesh: string;
        visible: boolean;
        enabled: boolean;
        visibility: number;
        vertices: number;
        subMeshCount: number;
        material: string | null;
        materialClass: string | null;
        materialConstructor: string | null;
        alpha: number | null;
        transparencyMode: number | null;
        useAlphaFromDiffuseTexture: boolean | null;
        backFaceCulling: boolean | null;
        disableColorWrite: boolean | null;
        disableDepthWrite: boolean | null;
        forceDepthWrite: boolean | null;
        needDepthPrePass: boolean | null;
        materialReady: boolean | null;
        effectReady: boolean | null;
        effectName: string | null;
        pluginName: string | null;
        pluginIsMock: boolean | null;
        diffuseTexture: string | null;
        diffuseHasAlpha: boolean | null;
        diffuseReady: boolean | null;
        decodedDds: boolean;
        uv: ReturnType<typeof summarizeMeshUv>;
    }> = [];

    for (const mesh of meshes) {
        visitModelMaterials(mesh, (modelMaterial, fallbackName, meshName) => {
            const material = mesh.material as ModelAssetMaterial;
            const subMaterial = modelMaterial;
            const subMesh = mesh.subMeshes?.find((candidate) => candidate.getMaterial() === subMaterial)
                ?? mesh.subMeshes?.[0]
                ?? null;
            let materialReady: boolean | null = null;
            try {
                materialReady = subMesh && typeof subMaterial.isReadyForSubMesh === "function"
                    ? subMaterial.isReadyForSubMesh(mesh, subMesh, false)
                    : null;
            } catch {
                materialReady = false;
            }
            const effect = subMesh ? (subMesh as unknown as {
                effect?: {
                    isReady?: () => boolean;
                    name?: string;
                    _key?: string;
                } | null;
            }).effect : null;
            const materialName = subMaterial.name ?? fallbackName ?? material.name ?? null;
            summary.push({
                mesh: meshName,
                visible: mesh.isVisible,
                enabled: mesh.isEnabled(),
                visibility: mesh.visibility,
                vertices: mesh.getTotalVertices?.() ?? 0,
                subMeshCount: mesh.subMeshes?.length ?? 0,
                material: typeof materialName === "string" ? materialName : null,
                materialClass: subMaterial.getClassName?.() ?? null,
                materialConstructor: getConstructorName(subMaterial),
                alpha: subMaterial.alpha ?? null,
                transparencyMode: subMaterial.transparencyMode ?? null,
                useAlphaFromDiffuseTexture: subMaterial.useAlphaFromDiffuseTexture ?? null,
                backFaceCulling: subMaterial.backFaceCulling ?? null,
                disableColorWrite: subMaterial.disableColorWrite ?? null,
                disableDepthWrite: subMaterial.disableDepthWrite ?? null,
                forceDepthWrite: subMaterial.forceDepthWrite ?? null,
                needDepthPrePass: subMaterial.needDepthPrePass ?? null,
                materialReady,
                effectReady: effect?.isReady?.() ?? null,
                effectName: effect?.name ?? effect?._key ?? null,
                pluginName: subMaterial._pluginMaterial?.constructor?.name ?? null,
                pluginIsMock: subMaterial._pluginMaterial?.isMock ?? null,
                diffuseTexture: subMaterial.diffuseTexture?.name ?? null,
                diffuseHasAlpha: subMaterial.diffuseTexture?.hasAlpha ?? null,
                diffuseReady: subMaterial.diffuseTexture?.isReady?.() ?? null,
                decodedDds: subMaterial.diffuseTexture?.metadata?.mmdModokiDecodedDdsFallback === true,
                uv: shouldLogDetailedMaterialUv(typeof materialName === "string" ? materialName : null)
                    ? summarizeMeshUv(mesh)
                    : null,
            });
        });
        if (summary.length >= 40) break;
    }

    if (summary.some((item) => item.decodedDds || item.alpha === 0 || item.transparencyMode !== 0)) {
        logInfo("asset", "model material visibility summary", {
            fileName,
            reason,
            materialCount: summary.length,
            materials: summary,
        });
    }
}

function attachMaterialCompileDiagnostics(fileName: string, meshes: readonly Mesh[]): void {
    for (const material of collectUniqueModelMaterials(meshes)) {
        const previousOnCompiled = material.onCompiled;
        const previousOnError = material.onError;
        material.onCompiled = (effect: unknown) => {
            previousOnCompiled?.(effect);
            logInfo("asset", "model material effect compiled", {
                fileName,
                materialName: typeof material.name === "string" ? material.name : null,
                pluginName: material._pluginMaterial?.constructor?.name ?? null,
                pluginIsMock: material._pluginMaterial?.isMock ?? null,
            });
        };
        material.onError = (effect: unknown, errors: string) => {
            previousOnError?.(effect, errors);
            logError("asset", "model material effect compile failed", {
                fileName,
                materialName: typeof material.name === "string" ? material.name : null,
                pluginName: material._pluginMaterial?.constructor?.name ?? null,
                pluginIsMock: material._pluginMaterial?.isMock ?? null,
                errors,
            });
        };
    }
}

function schedulePostRenderMaterialDiagnostics(fileName: string, scene: Scene, meshes: readonly Mesh[]): void {
    let remainingFrames = 8;
    const observer = scene.onAfterRenderObservable.add(() => {
        remainingFrames -= 1;
        if (remainingFrames > 0) return;
        if (observer) {
            scene.onAfterRenderObservable.remove(observer);
        }
        logModelMaterialVisibilitySummary(fileName, meshes, "after-render-frames");
    });
    window.setTimeout(() => {
        if (observer) {
            scene.onAfterRenderObservable.remove(observer);
        }
        logModelMaterialVisibilitySummary(fileName, meshes, "after-timeout");
    }, 1500);
}

export async function loadPMX(host: ModelAssetHost, filePath: string): Promise<ModelInfo | null> {
    let renderingSuspended = false;
    try {
        await host.physicsInitializationPromise;

        const { dir, fileName } = splitFilePath(filePath);
        const fileUrl = `file:///${dir}`;

        logInfo("asset", "model load started", { filePath, fileName });
        const materialBuilder = ensureSharedMmdMaterialBuilder(fileName);
        host.suspendSceneRendering();
        renderingSuspended = true;

        const result = await ImportMeshAsync(fileName, host.scene, {
            rootUrl: fileUrl,
            pluginOptions: {
                mmdmodel: {
                    materialBuilder,
                    useSdef: true,
                    // Large, thin stage/background PMX meshes can be split into many
                    // submeshes whose per-material bounds are too fragile at shallow
                    // camera angles. Keep culling at the mesh bounds level for v0.2.
                    alwaysSetSubMeshesBoundingInfo: false,
                    optimizeSubmeshes: true,
                    optimizeSingleMaterialModel: true,
                    preserveSerializationData: true,
                },
            },
        });

        logDebugIfEnabled("modelLoad", "asset", "model import result", {
            filePath,
            fileName,
            meshCount: result.meshes.length,
            skeletonCount: result.skeletons.length,
            meshNames: result.meshes.map((m) => m.name),
        });

        if (result.meshes.length === 0) {
            logWarn("asset", "model import returned no meshes", { filePath, fileName });
            throw new Error("No mesh data found in PMX/PMD file");
        }

        const mmdMesh = result.meshes[0] as MmdMesh;
        if (!mmdMesh) {
            logWarn("asset", "model import first mesh is unavailable", {
                filePath,
                fileName,
                meshCount: result.meshes.length,
            });
            throw new Error("Imported PMX/PMD mesh is unavailable");
        }

        const skeletonPool: Skeleton[] = [];
        if (mmdMesh.skeleton) skeletonPool.push(mmdMesh.skeleton);
        for (const mesh of result.meshes) {
            if (mesh.skeleton) skeletonPool.push(mesh.skeleton);
        }
        for (const skeleton of result.skeletons) {
            if (skeleton) skeletonPool.push(skeleton);
        }
        const uniqueSkeletons = Array.from(new Set(skeletonPool));
        host.applyGpuBoneTextureStorageForLargeSkeletons?.(fileName, result.meshes as Mesh[], uniqueSkeletons);
        host.applyCpuSkinningFallbackForWebGpuSdefMeshes?.(fileName, result.meshes as Mesh[]);

        mmdMesh.setEnabled(true);
        mmdMesh.isVisible = true;
        const mmdMetadata = mmdMesh.metadata as typeof mmdMesh.metadata & {
            containsSerializationData?: boolean;
            materialsMetadata?: readonly { flag: number }[];
            displayFrames?: readonly {
                name: string;
                frames: readonly { type: number; index: number }[];
            }[];
            morphs?: readonly {
                name?: string;
                category?: number;
            }[];
            bones?: readonly {
                name: string;
                flag: number;
                parentBoneIndex: number;
                position: readonly [number, number, number];
                appendTransform?: {
                    parentIndex: number;
                    ratio: number;
                };
                ik?: {
                    target?: number;
                    links: readonly { target?: number }[];
                };
            }[];
            rigidBodies?: readonly {
                name?: string;
                shapeType?: number;
                shapeSize?: readonly [number, number, number];
                physicsMode?: number;
                boneIndex?: number;
            }[];
        };
        const materialFlagMap = host.buildPmxMaterialFlagMap(mmdMetadata);
        attachMaterialCompileDiagnostics(fileName, result.meshes as Mesh[]);
        let materialOrder = 0;
        const shadowCasterMeshes: Mesh[] = [];
        for (const mesh of result.meshes) {
            mesh.setEnabled(true);
            mesh.isVisible = true;
            const shadowFlags = host.resolvePmxShadowFlagsForMaterial(mesh.material, materialFlagMap);
            mesh.receiveShadows = shadowFlags.receivesShadow;
            if ((mesh.getTotalVertices?.() ?? 0) > 0 && shadowFlags.castsShadow) {
                host.shadowGenerator.addShadowCaster(mesh, true);
                shadowCasterMeshes.push(mesh as Mesh);
            }

            if (mesh.material) {
                visitModelMaterials(mesh, (material) => {
                    host.applyMmdMaterialCompatibilityFixes(material);
                });
                mesh.alphaIndex = materialOrder;
                materialOrder += 1;
            }
        }

        host.applyModelEdgeToMeshes(result.meshes as Mesh[]);
        host.applyCelShadingToMeshes(result.meshes as Mesh[]);
        host.applyAnisotropicFilteringToMeshes?.(result.meshes as Mesh[]);
        host.applyDebugMaterialOverrideToMeshes?.(fileName, result.meshes as Mesh[]);
        useParentMeshBoundsForSubMeshes(result.meshes as Mesh[]);
        await waitForMmdMaterialPluginsReady(fileName, result.meshes as Mesh[]);
        restoreMaterialDirtyMechanismAfterImport(host.scene, result.meshes as Mesh[]);
        logModelMaterialVisibilitySummary(fileName, result.meshes as Mesh[], "after-material-setup");
        const sceneMaterials = collectSceneModelMaterials(host, result.meshes as Mesh[]);

        const mmdModel = host.mmdRuntime.createMmdModel(mmdMesh, {
            materialProxyConstructor: MmdStandardMaterialProxy,
            buildPhysics: host.isPhysicsAvailable()
                ? { disableOffsetForConstraintFrame: true }
                : false,
        });
        host.normalizeRuntimeBoneTransformStages?.(mmdModel);
        host.normalizeRuntimeBoneEvaluationOrder?.(mmdModel);
        host.patchModelAfterPhysicsForPausedState?.(mmdModel);
        host.applyPhysicsStateToModel(mmdModel);
        logModelMaterialVisibilitySummary(fileName, result.meshes as Mesh[], "after-runtime-model-created");
        host.modelKeyframeTracksByModel.set(mmdModel, new Map());
        host.modelSourceAnimationsByModel.delete(mmdModel);
        host.setModelMotionImports(mmdModel, []);

        logDebugIfEnabled("modelLoad", "asset", "runtime model created", {
            filePath,
            fileName,
            hasMorph: !!mmdModel.morph,
        });

        const morphNames: string[] = [];
        const morphEntries: { index: number; name: string; category: number }[] = [];
        const metadataMorphs = Array.isArray(mmdMetadata.morphs) ? mmdMetadata.morphs : [];
        const seenMorphNames = new Set<string>();
        for (let morphIndex = 0; morphIndex < metadataMorphs.length; morphIndex += 1) {
            const morph = metadataMorphs[morphIndex];
            if (!morph?.name) continue;
            morphEntries.push({
                index: morphIndex,
                name: morph.name,
                category: typeof morph.category === "number" ? morph.category : PMX_MORPH_CATEGORY_OTHER,
            });
            if (!seenMorphNames.has(morph.name)) {
                seenMorphNames.add(morph.name);
                morphNames.push(morph.name);
            }
        }

        const vertexCount = result.meshes.reduce((sum, mesh) => {
            const meshVertices = mesh.getTotalVertices?.() ?? 0;
            return sum + meshVertices;
        }, 0);

        const boneCount = uniqueSkeletons.reduce((max, skeleton) => {
            return Math.max(max, skeleton.bones.length);
        }, 0);

        const boneNames: string[] = [];
        const boneControlInfos: BoneControlInfo[] = [];
        const metadataBones = Array.isArray(mmdMetadata.bones) ? mmdMetadata.bones : [];
        const metadataRigidBodies = Array.isArray(mmdMetadata.rigidBodies) ? mmdMetadata.rigidBodies : [];
        const sceneRigidBodies = metadataRigidBodies.map((rigidBody, index) => {
            const rawShapeSize = Array.isArray(rigidBody?.shapeSize) ? rigidBody.shapeSize : [0.5, 0.5, 0.5];
            return {
                name: rigidBody?.name || `RigidBody ${index + 1}`,
                boneIndex: typeof rigidBody?.boneIndex === "number" ? rigidBody.boneIndex : -1,
                shapeType: typeof rigidBody?.shapeType === "number" ? rigidBody.shapeType : 0,
                shapeSize: [
                    Number(rawShapeSize[0] ?? 0.5),
                    Number(rawShapeSize[1] ?? rawShapeSize[0] ?? 0.5),
                    Number(rawShapeSize[2] ?? rawShapeSize[0] ?? 0.5),
                ] as [number, number, number],
                physicsMode: typeof rigidBody?.physicsMode === "number" ? rigidBody.physicsMode : 0,
            };
        });
        const physicsBoneIndices = new Set<number>();
        for (const rigidBody of metadataRigidBodies) {
            if (!rigidBody) continue;
            if (rigidBody.physicsMode === 0) continue;
            if (typeof rigidBody.boneIndex !== "number" || rigidBody.boneIndex < 0) continue;
            physicsBoneIndices.add(rigidBody.boneIndex);
        }

        const ikBoneIndices = new Set<number>();
        const ikAffectedBoneIndices = new Set<number>();
        for (let boneIndex = 0; boneIndex < metadataBones.length; boneIndex += 1) {
            const bone = metadataBones[boneIndex];
            if (!bone?.ik) continue;

            ikBoneIndices.add(boneIndex);

            if (typeof bone.ik.target === "number" && bone.ik.target >= 0) {
                ikAffectedBoneIndices.add(bone.ik.target);
            }

            for (const ikLink of bone.ik.links) {
                if (typeof ikLink.target !== "number" || ikLink.target < 0) continue;
                ikAffectedBoneIndices.add(ikLink.target);
            }
        }

        const seenBoneNames = new Set<string>();
        const physicsBoneNames: string[] = [];
        for (let boneIndex = 0; boneIndex < metadataBones.length; boneIndex += 1) {
            const bone = metadataBones[boneIndex];
            if (!bone) continue;

            const isVisible = (bone.flag & PMX_BONE_FLAG_VISIBLE) !== 0;
            const isRotatable = (bone.flag & PMX_BONE_FLAG_ROTATABLE) !== 0;
            const isMovable = (bone.flag & PMX_BONE_FLAG_MOVABLE) !== 0;
            const isIk = ikBoneIndices.has(boneIndex);
            const isIkAffected = ikAffectedBoneIndices.has(boneIndex);
            const isPhysicsBone = physicsBoneIndices.has(boneIndex);

            if (isPhysicsBone) {
                if (!physicsBoneNames.includes(bone.name)) {
                    physicsBoneNames.push(bone.name);
                }
                if (!boneControlInfos.some((info) => info.name === bone.name)) {
                    boneControlInfos.push({
                        name: bone.name,
                        movable: isMovable,
                        rotatable: isRotatable,
                        isIk,
                        isIkAffected,
                    });
                }
                continue;
            }

            if (!isVisible) continue;

            if (!seenBoneNames.has(bone.name)) {
                seenBoneNames.add(bone.name);
                boneNames.push(bone.name);
                boneControlInfos.push({
                    name: bone.name,
                    movable: isMovable,
                    rotatable: isRotatable,
                    isIk,
                    isIkAffected,
                });
            }
        }

        const eyeMorphs: { index: number; name: string }[] = [];
        const lipMorphs: { index: number; name: string }[] = [];
        const eyebrowMorphs: { index: number; name: string }[] = [];
        const otherMorphs: { index: number; name: string }[] = [];
        for (const morphEntry of morphEntries) {
            const morphItem = {
                index: morphEntry.index,
                name: morphEntry.name,
            };
            switch (morphEntry.category) {
                case PMX_MORPH_CATEGORY_EYE:
                    eyeMorphs.push(morphItem);
                    break;
                case PMX_MORPH_CATEGORY_LIP:
                    lipMorphs.push(morphItem);
                    break;
                case PMX_MORPH_CATEGORY_EYEBROW:
                    eyebrowMorphs.push(morphItem);
                    break;
                case PMX_MORPH_CATEGORY_SYSTEM:
                case PMX_MORPH_CATEGORY_OTHER:
                default:
                    otherMorphs.push(morphItem);
                    break;
            }
        }
        const morphDisplayFrames = morphEntries.length > 0
            ? [
                { name: "\u76ee", morphs: eyeMorphs },
                { name: "\u30ea\u30c3\u30d7", morphs: lipMorphs },
                { name: "\u7709", morphs: eyebrowMorphs },
                { name: "\u305d\u306e\u4ed6", morphs: otherMorphs },
            ]
            : [];
        const modelInfo: ModelInfo = {
            name: fileName.replace(/\.(pmx|pmd)$/i, ""),
            path: filePath,
            vertexCount,
            boneCount,
            boneNames,
            physicsBoneNames,
            boneControlInfos,
            morphCount: morphEntries.length,
            morphNames,
            morphDisplayFrames,
        };

        logDebugIfEnabled("modelLoad", "asset", "model info resolved", {
            filePath,
            modelInfo,
        });

        host.sceneModels.push({
            mesh: mmdMesh,
            model: mmdModel,
            info: modelInfo,
            materials: sceneMaterials,
            rigidBodies: sceneRigidBodies,
            shadowCasterMeshes,
            contactShadowMesh: null,
            castShadow: true,
        });
        host.refreshRigidBodyVisualizerTarget();
        host.syncLuminousGlowLayer?.();
        host.syncGlobalIlluminationSceneModels?.();
        host.syncIblShadowsScene?.();
        host.refreshFrameGraphPostEffectsBackendForStackStateChange?.();
        host.dumpRenderDiagnostics?.("after model scene sync");

        const activateAsCurrent = host.shouldActivateAsCurrent(modelInfo);
        if (activateAsCurrent) {
            host.currentMesh = mmdMesh;
            host.currentModel = mmdModel;
            host.activeModelInfo = modelInfo;
            host.refreshBoneVisualizerTarget();
            host.setTimelineTarget("model");
            host.onModelLoaded?.(modelInfo);
            host.emitMergedKeyframeTracks();
            host.dumpRenderDiagnostics?.("after active model load");
        }

        host.onSceneModelLoaded?.(modelInfo, host.sceneModels.length, activateAsCurrent);
        logInfo("asset", "model load completed", {
            filePath,
            fileName,
            modelName: modelInfo.name,
            vertexCount,
            boneCount,
            morphCount: morphEntries.length,
            meshCount: result.meshes.length,
            sceneModelCount: host.sceneModels.length,
            activateAsCurrent,
        });
        host.resumeSceneRendering();
        renderingSuspended = false;
        schedulePostRenderMaterialDiagnostics(fileName, host.scene, result.meshes as Mesh[]);
        return modelInfo;
    } catch (err: unknown) {
        if (renderingSuspended) {
            host.resumeSceneRendering();
        }
        const message = err instanceof Error ? err.message : String(err);
        logError("asset", "model load failed", {
            filePath,
            ...toLogErrorData(err),
        });
        host.onError?.(`PMX/PMD load error: ${message}`);
        return null;
    }
}
