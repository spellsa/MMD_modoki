import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Material } from "@babylonjs/core/Materials/material";

export type MeshSizeLike = {
    x: number;
    y: number;
    z: number;
};

export type LargeThinMeshClassificationOptions = {
    minMajorSize?: number;
    thinRatio?: number;
    maxThinSize?: number;
    minPlaneAspect?: number;
    lowPolyVertexLimit?: number;
    lowPolyIndexLimit?: number;
    planeNameHints?: readonly string[];
};

export type LargeThinMeshClassification = {
    isLargeThinPlane: boolean;
    majorSize: number;
    middleSize: number;
    thinSize: number;
    hasNameHint: boolean;
    isLowPoly: boolean;
};

type ExistingEffectLike = {
    isReady?: () => unknown;
};

type ExistingSubMeshEffectLike = {
    effect?: unknown;
};

const DEFAULT_PLANE_NAME_HINTS = [
    "floor",
    "ground",
    "stage",
    "plane",
    "back",
    "background",
    "wall",
    "sky",
    "\u5e8a",
    "\u5730\u9762",
    "\u30b9\u30c6\u30fc\u30b8",
    "\u80cc\u666f",
    "\u58c1",
];

function sortedSizeComponents(size: MeshSizeLike): [number, number, number] {
    const values = [
        Math.abs(size.x),
        Math.abs(size.y),
        Math.abs(size.z),
    ].sort((a, b) => b - a);
    return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];
}

export function classifyLargeThinMesh(
    size: MeshSizeLike,
    vertexCount: number,
    indexCount: number,
    meshName = "",
    options: LargeThinMeshClassificationOptions = {},
): LargeThinMeshClassification {
    const minMajorSize = options.minMajorSize ?? 60;
    const thinRatio = options.thinRatio ?? 0.015;
    const maxThinSize = options.maxThinSize ?? 0.5;
    const minPlaneAspect = options.minPlaneAspect ?? 0.35;
    const lowPolyVertexLimit = options.lowPolyVertexLimit ?? 256;
    const lowPolyIndexLimit = options.lowPolyIndexLimit ?? 768;
    const hints = options.planeNameHints ?? DEFAULT_PLANE_NAME_HINTS;
    const [majorSize, middleSize, thinSize] = sortedSizeComponents(size);

    const normalizedName = meshName.toLowerCase();
    const hasNameHint = hints.some((hint) => normalizedName.includes(hint.toLowerCase()));
    const hasVertexCount = Number.isFinite(vertexCount) && vertexCount > 0;
    const hasIndexCount = Number.isFinite(indexCount) && indexCount > 0;
    const isLowPoly = (hasVertexCount && vertexCount <= lowPolyVertexLimit)
        || (hasIndexCount && indexCount <= lowPolyIndexLimit);
    const isLarge = majorSize >= minMajorSize;
    const isThin = thinSize <= Math.max(maxThinSize, majorSize * thinRatio);
    const isBroad = middleSize >= majorSize * minPlaneAspect;

    return {
        isLargeThinPlane: isLarge && isThin && isBroad && (isLowPoly || hasNameHint),
        majorSize,
        middleSize,
        thinSize,
        hasNameHint,
        isLowPoly,
    };
}

export function refreshMeshBoundingInfoForRenderStability(mesh: AbstractMesh): void {
    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo({});
}

export function stabilizeAppGeneratedPlanarMesh(
    mesh: AbstractMesh,
    options: { zOffset?: number; zOffsetUnits?: number } = {},
): void {
    refreshMeshBoundingInfoForRenderStability(mesh);
    mesh.alwaysSelectAsActiveMesh = true;
    applyMaterialZOffset(mesh.material, options.zOffset, options.zOffsetUnits);
}

export function stabilizeLargeThinLoadedMesh(
    mesh: AbstractMesh,
    options: LargeThinMeshClassificationOptions = {},
): boolean {
    refreshMeshBoundingInfoForRenderStability(mesh);

    const boundingBox = mesh.getBoundingInfo().boundingBox;
    const size = {
        x: boundingBox.extendSizeWorld.x * 2,
        y: boundingBox.extendSizeWorld.y * 2,
        z: boundingBox.extendSizeWorld.z * 2,
    };
    const vertexCount = mesh.getTotalVertices?.() ?? 0;
    const indexCount = mesh.getTotalIndices?.() ?? 0;
    const classification = classifyLargeThinMesh(size, vertexCount, indexCount, mesh.name, options);
    if (!classification.isLargeThinPlane) return false;

    mesh.alwaysSelectAsActiveMesh = true;
    return true;
}

/**
 * Reads the state of an effect that Babylon has already compiled.
 *
 * Diagnostics must not call Material.isReadyForSubMesh() directly: that method
 * can start shader compilation with an incomplete render context and poison the
 * WebGPU pipeline used by subsequent frames.
 */
export function readExistingSubMeshEffectReadiness(subMesh: unknown): boolean | null {
    if (!subMesh || typeof subMesh !== "object") return null;

    let effect: unknown;
    try {
        effect = (subMesh as ExistingSubMeshEffectLike).effect;
    } catch {
        return false;
    }
    if (!effect || typeof effect !== "object") return null;

    const effectLike = effect as ExistingEffectLike;
    if (typeof effectLike.isReady !== "function") return null;
    try {
        return effectLike.isReady() === true;
    } catch {
        return false;
    }
}

function applyMaterialZOffset(
    material: Material | null | undefined,
    zOffset: number | undefined,
    zOffsetUnits: number | undefined,
): void {
    if (!material) return;
    if (typeof zOffset === "number" && Number.isFinite(zOffset)) {
        material.zOffset = zOffset;
    }
    if (typeof zOffsetUnits === "number" && Number.isFinite(zOffsetUnits)) {
        material.zOffsetUnits = zOffsetUnits;
    }
}
