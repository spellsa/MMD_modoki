import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton";
import type { Scene } from "@babylonjs/core/scene";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { BoneControlInfo, ModelInfo } from "../types";
import { MmdModelLoader } from "babylon-mmd/esm/Loader/mmdModelLoader";
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
};

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

function collectSceneModelMaterials(host: ModelAssetHost, meshes: Mesh[]): SceneModelMaterialEntry[] {
    const materialMap = new Map<object, SceneModelMaterialEntry>();
    let materialIndex = 0;

    const registerMaterial = (material: ModelAssetMaterial | null | undefined, fallbackName: string, meshName: string): void => {
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
        const material = mesh.material as ModelAssetMaterial | null;
        if (!material) continue;

        if (Array.isArray(material.subMaterials)) {
            for (let subIndex = 0; subIndex < material.subMaterials.length; subIndex += 1) {
                const subMaterial = material.subMaterials[subIndex];
                registerMaterial(subMaterial, (mesh.name || "mesh") + "#" + String(subIndex + 1), mesh.name || "mesh");
            }
        } else {
            registerMaterial(material, mesh.name || ("material_" + String(materialIndex)), mesh.name || "mesh");
        }
    }

    return Array.from(materialMap.values());
}

export async function loadPMX(host: ModelAssetHost, filePath: string): Promise<ModelInfo | null> {
    let renderingSuspended = false;
    try {
        await host.physicsInitializationPromise;

        const { dir, fileName } = splitFilePath(filePath);
        const fileUrl = `file:///${dir}`;

        logInfo("asset", "model load started", { filePath, fileName });
        host.suspendSceneRendering();
        renderingSuspended = true;

        const result = await ImportMeshAsync(fileName, host.scene, {
            rootUrl: fileUrl,
            pluginOptions: {
                mmdmodel: {
                    materialBuilder: MmdModelLoader.SharedMaterialBuilder,
                    useSdef: true,
                    alwaysSetSubMeshesBoundingInfo: true,
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
                host.applyMmdMaterialCompatibilityFixes(mesh.material as ModelAssetMaterial);
                mesh.alphaIndex = materialOrder;
                materialOrder += 1;
            }
        }

        host.applyModelEdgeToMeshes(result.meshes as Mesh[]);
        host.applyCelShadingToMeshes(result.meshes as Mesh[]);
        host.applyAnisotropicFilteringToMeshes?.(result.meshes as Mesh[]);
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
