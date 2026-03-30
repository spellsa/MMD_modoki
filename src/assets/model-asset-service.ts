import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
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
    meshNames: string[];
};

function getTextureDebugSource(texture: any): string | null {
    if (!texture || typeof texture !== "object") return null;

    for (const candidate of [texture.name, texture.url]) {
        if (typeof candidate === "string" && candidate.trim().length > 0) {
            return candidate;
        }
    }

    return null;
}

function getTextureDebugSummary(texture: any): string {
    if (!texture || typeof texture !== "object") {
        return "null";
    }

    const source = getTextureDebugSource(texture) ?? "unknown";
    const hasAlpha = typeof texture.hasAlpha === "boolean" ? String(texture.hasAlpha) : "unknown";
    const ready = typeof texture.isReady === "function" ? String(Boolean(texture.isReady())) : "unknown";
    const size = typeof texture.getSize === "function" ? texture.getSize() : null;
    const sizeLabel = size && typeof size.width === "number" && typeof size.height === "number"
        ? `${size.width}x${size.height}`
        : "unknown";
    const format = typeof texture.format === "number" ? String(texture.format) : "unknown";
    const type = typeof texture.type === "number" ? String(texture.type) : "unknown";

    return `${source} [ready=${ready}, hasAlpha=${hasAlpha}, size=${sizeLabel}, format=${format}, type=${type}]`;
}

function isFaceRelatedMaterialName(materialName: string): boolean {
    return /(?:顔|ヘッド|まぶた|まつ毛|眉|目|瞳|口|歯|舌|髪|前髪|後髪|耳|頬|頬紅|アイシャドウ|黒目|白目)/.test(materialName);
}

function getTransparencyModeLabel(mode: unknown): string {
    switch (mode) {
        case 0:
            return "opaque";
        case 1:
            return "alpha-test";
        case 2:
            return "alpha-blend";
        default:
            return "unset";
    }
}

const PROBLEMATIC_BONE_DEBUG_PATTERN = /肩|腕|ひじ|手首|捩|IK|リボン|^[FSR][0-9]+$|^SR[0-9]+$/;

function roundDebugValue(value: number): number {
    return Number(value.toFixed(4));
}

function toRoundedVector(value: { x: number; y: number; z: number }): [number, number, number] {
    return [
        roundDebugValue(value.x),
        roundDebugValue(value.y),
        roundDebugValue(value.z),
    ];
}

function toRoundedMetadataVector(value: unknown): [number, number, number] | null {
    if (Array.isArray(value) && value.length >= 3) {
        const [x, y, z] = value;
        if ([x, y, z].every((component) => typeof component === "number" && Number.isFinite(component))) {
            return [roundDebugValue(x), roundDebugValue(y), roundDebugValue(z)];
        }
    }

    if (value && typeof value === "object") {
        const vector = value as { x?: unknown; y?: unknown; z?: unknown };
        if (
            typeof vector.x === "number" && Number.isFinite(vector.x) &&
            typeof vector.y === "number" && Number.isFinite(vector.y) &&
            typeof vector.z === "number" && Number.isFinite(vector.z)
        ) {
            return [
                roundDebugValue(vector.x),
                roundDebugValue(vector.y),
                roundDebugValue(vector.z),
            ];
        }
    }

    return null;
}

function subtractRoundedVectors(
    a: readonly [number, number, number] | null,
    b: readonly [number, number, number] | null,
): [number, number, number] | null {
    if (!a || !b) {
        return null;
    }

    return [
        roundDebugValue(a[0] - b[0]),
        roundDebugValue(a[1] - b[1]),
        roundDebugValue(a[2] - b[2]),
    ];
}

function buildBoneInfluenceSummary(meshes: readonly Mesh[]): Map<number, { vertices: number; totalWeight: number }> {
    const summary = new Map<number, { vertices: number; totalWeight: number }>();
    const addInfluence = (boneIndex: number, weight: number): void => {
        if (boneIndex < 0 || !Number.isFinite(weight) || weight <= 0) return;
        const current = summary.get(boneIndex) ?? { vertices: 0, totalWeight: 0 };
        current.vertices += 1;
        current.totalWeight += weight;
        summary.set(boneIndex, current);
    };

    for (const mesh of meshes) {
        const matricesIndices = mesh.getVerticesData("matricesIndices");
        const matricesWeights = mesh.getVerticesData("matricesWeights");
        if (!matricesIndices || !matricesWeights) continue;

        const matricesIndicesExtra = mesh.getVerticesData("matricesIndicesExtra");
        const matricesWeightsExtra = mesh.getVerticesData("matricesWeightsExtra");
        for (let i = 0; i < matricesIndices.length; i += 4) {
            addInfluence(Math.floor(matricesIndices[i + 0] ?? -1), matricesWeights[i + 0] ?? 0);
            addInfluence(Math.floor(matricesIndices[i + 1] ?? -1), matricesWeights[i + 1] ?? 0);
            addInfluence(Math.floor(matricesIndices[i + 2] ?? -1), matricesWeights[i + 2] ?? 0);
            addInfluence(Math.floor(matricesIndices[i + 3] ?? -1), matricesWeights[i + 3] ?? 0);

            if (!matricesIndicesExtra || !matricesWeightsExtra) {
                continue;
            }

            addInfluence(Math.floor(matricesIndicesExtra[i + 0] ?? -1), matricesWeightsExtra[i + 0] ?? 0);
            addInfluence(Math.floor(matricesIndicesExtra[i + 1] ?? -1), matricesWeightsExtra[i + 1] ?? 0);
            addInfluence(Math.floor(matricesIndicesExtra[i + 2] ?? -1), matricesWeightsExtra[i + 2] ?? 0);
            addInfluence(Math.floor(matricesIndicesExtra[i + 3] ?? -1), matricesWeightsExtra[i + 3] ?? 0);
        }
    }

    return summary;
}

function logProblematicBoneDiagnostics(
    fileName: string,
    meshes: readonly Mesh[],
    metadataBones: readonly {
        name: string;
        parentBoneIndex: number;
        position: readonly [number, number, number];
        flag: number;
        appendTransform?: { parentIndex: number; ratio: number };
    }[],
    model: any,
): void {
    try {
        const runtimeBones = model?.runtimeBones as Array<{
            name: string;
            linkedBone?: {
                getParent?: () => { name?: string } | null;
                getRestMatrix?: () => { getTranslationToRef: (target: Vector3) => Vector3 };
                position?: { x: number; y: number; z: number };
            };
            parentBone?: { name: string } | null;
            rigidBodyIndices?: readonly number[];
            transformOrder?: number;
            transformAfterPhysics?: boolean;
            getWorldTranslationToRef?: (target: Vector3) => Vector3;
        }> | undefined;
        console.log(`[PMX][BoneDebug] start: ${fileName}`, {
            metadataBoneCount: metadataBones.length,
            runtimeBoneCount: runtimeBones?.length ?? 0,
            meshCount: meshes.length,
        });

        if (!runtimeBones || runtimeBones.length === 0) {
            console.warn(`[PMX][BoneDebug] runtime bones unavailable: ${fileName}`, {
                metadataBoneCount: metadataBones.length,
                runtimeBoneCount: runtimeBones?.length ?? 0,
            });
            return;
        }

        model.beforePhysics?.(null);
        model.afterPhysics?.();

        const influenceSummary = buildBoneInfluenceSummary(meshes);
        const restPosition = new Vector3();
        const runtimeWorldPosition = new Vector3();
        const parentRuntimeWorldPosition = new Vector3();
        const suspectRows: Array<Record<string, unknown>> = [];
        const matchedBoneNames: string[] = [];
        const sortedRuntimeBones = Array.isArray((model as { sortedRuntimeBones?: unknown }).sortedRuntimeBones)
            ? ((model as { sortedRuntimeBones?: unknown }).sortedRuntimeBones as readonly unknown[])
            : [];
        const sortedBoneIndexMap = new Map<object, number>();
        for (let index = 0; index < sortedRuntimeBones.length; index += 1) {
            const sortedRuntimeBone = sortedRuntimeBones[index];
            if (sortedRuntimeBone && typeof sortedRuntimeBone === "object") {
                sortedBoneIndexMap.set(sortedRuntimeBone, index);
            }
        }

        for (let boneIndex = 0; boneIndex < metadataBones.length; boneIndex += 1) {
            const metadataBone = metadataBones[boneIndex];
            if (!metadataBone || !PROBLEMATIC_BONE_DEBUG_PATTERN.test(metadataBone.name)) {
                continue;
            }
            matchedBoneNames.push(metadataBone.name);

            const runtimeBone = runtimeBones[boneIndex];
            const linkedBone = runtimeBone?.linkedBone;
            const linkedBoneLocalPosition = linkedBone?.position
                ? toRoundedVector(linkedBone.position)
                : null;
            const linkedBoneRestPosition = linkedBone?.getRestMatrix
                ? toRoundedVector(linkedBone.getRestMatrix().getTranslationToRef(restPosition))
                : null;
            const runtimeWorld = runtimeBone?.getWorldTranslationToRef
                ? toRoundedVector(runtimeBone.getWorldTranslationToRef(runtimeWorldPosition))
                : null;
            const parentRuntimeWorld = runtimeBone?.parentBone && typeof (runtimeBone.parentBone as {
                getWorldTranslationToRef?: (target: Vector3) => Vector3;
            }).getWorldTranslationToRef === "function"
                ? toRoundedVector((runtimeBone.parentBone as {
                    getWorldTranslationToRef: (target: Vector3) => Vector3;
                }).getWorldTranslationToRef(parentRuntimeWorldPosition))
                : null;
            const metadataPosition = toRoundedMetadataVector(metadataBone.position);
            const influence = influenceSummary.get(boneIndex);
            const parentIndex = typeof metadataBone.parentBoneIndex === "number" ? metadataBone.parentBoneIndex : -1;

            suspectRows.push({
                index: boneIndex,
                name: metadataBone.name,
                sortedIndex: runtimeBone ? sortedBoneIndexMap.get(runtimeBone as unknown as object) ?? null : null,
                parentIndex,
                parentName: parentIndex >= 0 ? metadataBones[parentIndex]?.name ?? null : null,
                parentSortedIndex: runtimeBone?.parentBone ? sortedBoneIndexMap.get(runtimeBone.parentBone as unknown as object) ?? null : null,
                runtimeParentName: runtimeBone?.parentBone?.name ?? null,
                linkedBoneParentName: runtimeBone?.linkedBone?.getParent?.()?.name ?? null,
                metadataPosition,
                linkedBoneRestPosition,
                linkedBoneLocalPosition,
                runtimeWorld,
                parentRuntimeWorld,
                metadataToRestDelta: subtractRoundedVectors(linkedBoneRestPosition, metadataPosition),
                metadataToLocalDelta: subtractRoundedVectors(linkedBoneLocalPosition, metadataPosition),
                transformOrder: runtimeBone?.transformOrder ?? null,
                transformAfterPhysics: runtimeBone?.transformAfterPhysics ?? null,
                appendParentIndex: metadataBone.appendTransform?.parentIndex ?? null,
                appendParentName: metadataBone.appendTransform ? metadataBones[metadataBone.appendTransform.parentIndex]?.name ?? null : null,
                appendRatio: metadataBone.appendTransform?.ratio ?? null,
                rigidBodyCount: runtimeBone?.rigidBodyIndices?.length ?? 0,
                influencedVertices: influence?.vertices ?? 0,
                totalWeight: influence ? roundDebugValue(influence.totalWeight) : 0,
            });
        }

        if (suspectRows.length === 0) {
            console.warn(`[PMX][BoneDebug] no suspect rows collected: ${fileName}`, {
                matchedBoneNames,
                metadataBoneCount: metadataBones.length,
                runtimeBoneCount: runtimeBones.length,
            });
            return;
        }

        console.log(`[PMX][BoneDebug][JSON] suspect bone state: ${fileName} ${JSON.stringify(suspectRows)}`);

        const focusBoneNames = new Set([
            "左肩P", "左肩C", "左肩", "左腕", "左腕捩", "左ひじIK親", "左ひじ", "左手捩", "左手首",
            "S0", "S1", "S2", "S3", "S4", "S5", "F0", "F1", "F2", "F3", "F4", "F5",
            "右肩P", "右肩C", "右肩", "右腕", "右腕捩", "右ひじIK親", "右ひじ", "右手捩", "右手首",
            "R0", "R1", "R2", "R3", "R4", "R5", "R6", "SR0", "SR1", "SR2",
        ]);
        const focusRows = suspectRows.filter((row) => focusBoneNames.has(String(row.name ?? "")));
        console.log(`[PMX][BoneDebug][JSON][focus] ${fileName} ${JSON.stringify(focusRows)}`);
        console.log(`[PMX][BoneDebug] suspect bone state: ${fileName}`, suspectRows);
    } catch (error) {
        console.error(`[PMX][BoneDebug] failed: ${fileName}`, error);
    }
}

function decodePmxMaterialFlags(flag: number | null): string[] {
    if (flag === null || !Number.isFinite(flag)) {
        return [];
    }

    const decoded: string[] = [];
    if ((flag & 0x1) !== 0) decoded.push("doubleSided");
    if ((flag & 0x2) !== 0) decoded.push("groundShadow");
    if ((flag & 0x4) !== 0) decoded.push("drawShadow");
    if ((flag & 0x8) !== 0) decoded.push("receiveShadow");
    if ((flag & 0x10) !== 0) decoded.push("toonEdge");
    if ((flag & 0x20) !== 0) decoded.push("vertexColor");
    if ((flag & 0x40) !== 0) decoded.push("pointDraw");
    if ((flag & 0x80) !== 0) decoded.push("lineDraw");
    return decoded;
}

function buildPmxMaterialTransparencyDebugRow(entry: SceneModelMaterialEntry, pmxFlags: number | null): Record<string, unknown> {
    const material = entry.material ?? {};
    const diffuseTexture = material.diffuseTexture ?? null;
    const albedoTexture = material.albedoTexture ?? null;
    const opacityTexture = material.opacityTexture ?? null;
    const diffuseColor = material.diffuseColor ?? null;
    const diffuseRgba = diffuseColor && typeof diffuseColor === "object"
        ? [
            Number(diffuseColor.r ?? 0),
            Number(diffuseColor.g ?? 0),
            Number(diffuseColor.b ?? 0),
            Number(material.alpha ?? 1),
        ]
        : null;

    return {
        material: entry.name,
        meshNames: entry.meshNames,
        pmxFlags: pmxFlags === null ? null : `0x${pmxFlags.toString(16)}`,
        pmxFlagsDecoded: decodePmxMaterialFlags(pmxFlags),
        diffuseRGBA: diffuseRgba,
        alpha: Number(material.alpha ?? 1),
        transparencyMode: getTransparencyModeLabel(material.transparencyMode),
        useAlphaFromDiffuseTexture: Boolean(material.useAlphaFromDiffuseTexture),
        useAlphaFromAlbedoTexture: Boolean(material.useAlphaFromAlbedoTexture),
        diffuseHasAlpha: Boolean(diffuseTexture?.hasAlpha),
        albedoHasAlpha: Boolean(albedoTexture?.hasAlpha),
        hasOpacityTexture: Boolean(opacityTexture),
        forceDepthWrite: Boolean(material.forceDepthWrite),
        alphaCutOff: typeof material.alphaCutOff === "number" ? material.alphaCutOff : null,
        diffuseTexture: getTextureDebugSummary(diffuseTexture),
        albedoTexture: getTextureDebugSummary(albedoTexture),
        opacityTexture: getTextureDebugSummary(opacityTexture),
    };
}

function logPmxMaterialTransparencyDebug(fileName: string, sceneMaterials: SceneModelMaterialEntry[], materialFlagMap: WeakMap<object, number>): void {
    if (sceneMaterials.length === 0) {
        return;
    }

    const rows = sceneMaterials.map((entry) => buildPmxMaterialTransparencyDebugRow(entry, materialFlagMap.get(entry.material as object) ?? null));
    const transparentLikeCount = rows.filter((row) => {
        const alpha = typeof row.alpha === "number" ? row.alpha : 1;
        return alpha < 0.999
            || row.transparencyMode !== "opaque"
            || Boolean(row.useAlphaFromDiffuseTexture)
            || Boolean(row.useAlphaFromAlbedoTexture)
            || Boolean(row.diffuseHasAlpha)
            || Boolean(row.albedoHasAlpha)
            || Boolean(row.hasOpacityTexture);
    }).length;

    console.log(`[PMX] Transparency debug for ${fileName}: ${rows.length} materials (${transparentLikeCount} transparent-like)`);
    for (const row of rows) {
        console.log(`[PMX][transparency] ${JSON.stringify(row)}`);
    }

    for (const row of rows) {
        if (typeof row.material !== "string" || !isFaceRelatedMaterialName(row.material)) {
            continue;
        }
        console.log(`[PMX][face] ${JSON.stringify(row)}`);
    }
}

function collectSceneModelMaterials(host: any, meshes: Mesh[]): SceneModelMaterialEntry[] {
    const materialMap = new Map<object, SceneModelMaterialEntry>();
    let materialIndex = 0;

    const registerMaterial = (material: any, fallbackName: string, meshName: string): void => {
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
                registerMaterial(subMaterial, (mesh.name || "mesh") + "#" + String(subIndex + 1), mesh.name || "mesh");
            }
        } else {
            registerMaterial(material, mesh.name || ("material_" + String(materialIndex)), mesh.name || "mesh");
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
        for (const mesh of result.meshes) {
            mesh.setEnabled(true);
            mesh.isVisible = true;
            const shadowFlags = host.resolvePmxShadowFlagsForMaterial(mesh.material, materialFlagMap);
            mesh.receiveShadows = shadowFlags.receivesShadow;
            if ((mesh.getTotalVertices?.() ?? 0) > 0 && shadowFlags.castsShadow) {
                host.shadowGenerator.addShadowCaster(mesh, true);
            }

            if (mesh.material) {
                host.applyMmdMaterialCompatibilityFixes(mesh.material as any);
                mesh.alphaIndex = materialOrder;
                materialOrder += 1;
            }
        }

        host.applyModelEdgeToMeshes(result.meshes as Mesh[]);
        host.applyCelShadingToMeshes(result.meshes as Mesh[]);
        host.applyAnisotropicFilteringToMeshes?.(result.meshes as Mesh[]);
        const sceneMaterials = collectSceneModelMaterials(host, result.meshes as Mesh[]);
        // logPmxMaterialTransparencyDebug(fileName, sceneMaterials, materialFlagMap);

        const mmdModel = host.mmdRuntime.createMmdModel(mmdMesh, {
            materialProxyConstructor: MmdStandardMaterialProxy,
            buildPhysics: host.physicsAvailable
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
        // logProblematicBoneDiagnostics(fileName, result.meshes as Mesh[], metadataBones, mmdModel as any);
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
            rigidBodies: sceneRigidBodies,
        });
        host.refreshRigidBodyVisualizerTarget();
        host.syncLuminousGlowLayer?.();
        host.syncGlobalIlluminationSceneModels?.();

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
