import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { BoneControlInfo, ModelInfo } from "../types";
import { MmdModelLoader } from "babylon-mmd/esm/Loader/mmdModelLoader";
import { MmdStandardMaterialProxy } from "babylon-mmd/esm/Runtime/mmdStandardMaterialProxy";
import type { MmdMesh } from "babylon-mmd/esm/Runtime/mmdMesh";
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
    material: any;
};

function collectSceneModelMaterials(host: any, meshes: Mesh[]): SceneModelMaterialEntry[] {
    const materialMap = new Map<object, SceneModelMaterialEntry>();
    let materialIndex = 0;

    const registerMaterial = (material: any, fallbackName: string): void => {
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

        ensureMaterialShaderDefaults(host, material);
        if (!host.materialShaderPresetByMaterial.has(material as object)) {
            host.materialShaderPresetByMaterial.set(
                material as object,
                host.constructor.DEFAULT_WGSL_MATERIAL_SHADER_PRESET,
            );
        }
    };

    for (const mesh of meshes) {
        const material = mesh.material as any;
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

export async function loadPMX(host: any, filePath: string): Promise<ModelInfo | null> {
    try {
        await host.physicsInitializationPromise;

        const { dir, fileName } = splitFilePath(filePath);
        const fileUrl = `file:///${dir}`;

        console.log("[PMX] Loading:", fileName, "from:", fileUrl);
        host.suspendSceneRendering();

        const result = await ImportMeshAsync(fileName, host.scene, {
            rootUrl: fileUrl,
            pluginOptions: {
                mmdmodel: {
                    materialBuilder: MmdModelLoader.SharedMaterialBuilder,
                    preserveSerializationData: true,
                },
            },
        });

        console.log("[PMX] ImportMeshAsync result:", {
            meshCount: result.meshes.length,
            skeletonCount: result.skeletons.length,
            meshNames: result.meshes.map((m) => m.name),
        });

        const mmdMesh = result.meshes[0] as MmdMesh;

        const skeletonPool: Skeleton[] = [];
        if (mmdMesh.skeleton) skeletonPool.push(mmdMesh.skeleton);
        for (const mesh of result.meshes) {
            if (mesh.skeleton) skeletonPool.push(mesh.skeleton);
        }
        for (const skeleton of result.skeletons) {
            if (skeleton) skeletonPool.push(skeleton);
        }
        const uniqueSkeletons = Array.from(new Set(skeletonPool));
        host.applyCpuSkinningFallbackForOversizedSkeletons(fileName, result.meshes as Mesh[], uniqueSkeletons);

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
                ik?: {
                    target?: number;
                    links: readonly { target?: number }[];
                };
            }[];
            rigidBodies?: readonly {
                physicsMode?: number;
                boneIndex?: number;
            }[];
        };
        const materialFlagMap = host.buildPmxMaterialFlagMap(mmdMetadata);
        let materialOrder = 0;
        for (const mesh of result.meshes) {
            mesh.setEnabled(true);
            mesh.isVisible = true;
            const shadowFlags = host.resolvePmxShadowFlagsForMaterial(mesh.material, materialFlagMap);
            mesh.receiveShadows = shadowFlags.receivesShadow;
            if ((mesh.getTotalVertices?.() ?? 0) > 0 && shadowFlags.castsShadow) {
                host.shadowGenerator.addShadowCaster(mesh, true);
            }

            if (mesh.material) {
                const isTransparentLike = host.applyMmdMaterialCompatibilityFixes(mesh.material as any);
                mesh.alphaIndex = materialOrder;
                if (isTransparentLike) {
                    mesh.alphaIndex = materialOrder;
                }
                materialOrder += 1;
            }
        }

        host.applyModelEdgeToMeshes(result.meshes as Mesh[]);
        host.applyCelShadingToMeshes(result.meshes as Mesh[]);
        const sceneMaterials = collectSceneModelMaterials(host, result.meshes as Mesh[]);

        const mmdModel = host.mmdRuntime.createMmdModel(mmdMesh, {
            materialProxyConstructor: MmdStandardMaterialProxy,
            buildPhysics: host.physicsAvailable
                ? { disableOffsetForConstraintFrame: true }
                : false,
        });
        host.applyPhysicsStateToModel(mmdModel);
        host.modelKeyframeTracksByModel.set(mmdModel, new Map());
        host.modelSourceAnimationsByModel.delete(mmdModel);
        host.setModelMotionImports(mmdModel, []);

        console.log("[PMX] MmdModel created, morph:", !!mmdModel.morph);

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
        for (let boneIndex = 0; boneIndex < metadataBones.length; boneIndex += 1) {
            const bone = metadataBones[boneIndex];
            if (!bone) continue;

            const isVisible = (bone.flag & PMX_BONE_FLAG_VISIBLE) !== 0;
            if (!isVisible) continue;
            if (physicsBoneIndices.has(boneIndex)) continue;

            const isRotatable = (bone.flag & PMX_BONE_FLAG_ROTATABLE) !== 0;
            const isMovable = (bone.flag & PMX_BONE_FLAG_MOVABLE) !== 0;
            const isIk = ikBoneIndices.has(boneIndex);
            const isIkAffected = ikAffectedBoneIndices.has(boneIndex);

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
            boneControlInfos,
            morphCount: morphEntries.length,
            morphNames,
            morphDisplayFrames,
        };

        console.log("[PMX] Model info:", modelInfo);

        host.sceneModels.push({
            mesh: mmdMesh,
            model: mmdModel,
            info: modelInfo,
            materials: sceneMaterials,
        });

        const activateAsCurrent = host.shouldActivateAsCurrent(modelInfo);
        if (activateAsCurrent) {
            host.currentMesh = mmdMesh;
            host.currentModel = mmdModel;
            host.activeModelInfo = modelInfo;
            host.timelineTarget = "model";
            host.refreshBoneVisualizerTarget();
            host.updateBoneGizmoTarget();
            host.onModelLoaded?.(modelInfo);
            host.emitMergedKeyframeTracks();
        }

        host.onSceneModelLoaded?.(modelInfo, host.sceneModels.length, activateAsCurrent);
        host.resumeSceneRendering();
        return modelInfo;
    } catch (err: unknown) {
        host.resumeSceneRendering();
        const message = err instanceof Error ? err.message : String(err);
        console.error("Failed to load PMX/PMD:", message);
        host.onError?.(`PMX/PMD load error: ${message}`);
        return null;
    }
}
