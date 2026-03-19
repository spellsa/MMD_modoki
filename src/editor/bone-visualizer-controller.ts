import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Space } from "@babylonjs/core/Maths/math.axis";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton";
import type { BoneControlInfo } from "../types";
import type { IMmdRuntimeBone } from "babylon-mmd/esm/Runtime/IMmdRuntimeBone";

type BoneVisualizerTarget = {
    mesh: Mesh;
    skeleton: Skeleton | null;
    pairs: Array<[number, number]>;
    positionMesh: Mesh;
    runtimeBones: readonly IMmdRuntimeBone[] | null;
    runtimeUseMeshWorldMatrix: boolean;
    boneControlInfoByName: ReadonlyMap<string, BoneControlInfo>;
} | null;

export function refreshBoneVisualizerTarget(host: any): void {
    disposeBoneVisualizer(host);

    const sourceMesh = host.currentMesh;
    if (!sourceMesh) return;

    const visibleBoneNameSet = host.activeModelInfo
        ? new Set(host.activeModelInfo.boneNames)
        : null;
    const boneControlInfoByName = new Map<string, BoneControlInfo>(
        (host.activeModelInfo?.boneControlInfos ?? []).map((info) => [info.name, info] as const)
    );

    const runtimeBones = host.currentModel?.runtimeBones as readonly IMmdRuntimeBone[] | undefined;
    if (runtimeBones && runtimeBones.length > 0) {
        const runtimeBoneIndexMap = new Map(runtimeBones.map((bone, index) => [bone, index] as const));
        const runtimePairs: Array<[number, number]> = [];
        for (let i = 0; i < runtimeBones.length; ++i) {
            const childName = runtimeBones[i].name;
            if (visibleBoneNameSet && !visibleBoneNameSet.has(childName)) continue;

            const parent = runtimeBones[i].parentBone;
            if (!parent) continue;
            if (visibleBoneNameSet && !visibleBoneNameSet.has(parent.name)) continue;

            const parentIndex = runtimeBoneIndexMap.get(parent);
            if (parentIndex === undefined) continue;
            runtimePairs.push([i, parentIndex]);
        }

        if (runtimePairs.length > 0) {
            sourceMesh.computeWorldMatrix(true);
            const sampleLocal = new Vector3();
            const sampleWorld = new Vector3();
            runtimeBones[0].getWorldTranslationToRef(sampleLocal);
            Vector3.TransformCoordinatesToRef(sampleLocal, sourceMesh.getWorldMatrix(), sampleWorld);
            const meshWorld = sourceMesh.getAbsolutePosition();
            const rawDistance = Vector3.DistanceSquared(sampleLocal, meshWorld);
            const transformedDistance = Vector3.DistanceSquared(sampleWorld, meshWorld);
            const runtimeUseMeshWorldMatrix = transformedDistance <= rawDistance;

            console.log("[BoneViz] Overlay target:", {
                mode: "runtime",
                mesh: sourceMesh.name,
                bones: runtimeBones.length,
                visibleBones: visibleBoneNameSet?.size ?? runtimeBones.length,
                pairs: runtimePairs.length,
                runtimeUseMeshWorldMatrix,
            });

            host.boneVisualizerTarget = {
                mesh: sourceMesh,
                skeleton: sourceMesh.skeleton ?? null,
                pairs: runtimePairs,
                positionMesh: sourceMesh,
                runtimeBones,
                runtimeUseMeshWorldMatrix,
                boneControlInfoByName,
            };
            ensureBoneOverlayCanvas(host);
            syncBoneVisualizerVisibility(host);
            return;
        }
    }

    const skeletonHost = (
        sourceMesh.skeleton
            ? sourceMesh
            : sourceMesh.getChildMeshes().find((child: Mesh) => !!child.skeleton)
    ) as Mesh | undefined;
    const skeleton = skeletonHost?.skeleton;
    if (!skeletonHost || !skeleton || skeleton.bones.length === 0) return;

    const bones = skeleton.bones;
    const boneIndexMap = new Map(skeleton.bones.map((bone, index) => [bone, index] as const));
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < bones.length; ++i) {
        const childName = bones[i].name;
        if (visibleBoneNameSet && !visibleBoneNameSet.has(childName)) continue;

        const parent = bones[i].getParent();
        if (!parent) continue;
        if (visibleBoneNameSet && !visibleBoneNameSet.has(parent.name)) continue;

        const parentIndex = boneIndexMap.get(parent);
        if (parentIndex === undefined) continue;
        pairs.push([i, parentIndex]);
    }
    if (pairs.length === 0) return;

    skeleton.computeAbsoluteMatrices(true);

    const skeletonMeshes: Mesh[] = [];
    const pushMesh = (mesh: Mesh | null | undefined): void => {
        if (!mesh) return;
        if (mesh.skeleton !== skeleton) return;
        if (skeletonMeshes.includes(mesh)) return;
        skeletonMeshes.push(mesh);
    };

    pushMesh(sourceMesh);
    pushMesh(skeletonHost);
    for (const child of sourceMesh.getChildMeshes() as Mesh[]) {
        pushMesh(child);
    }

    let positionMesh = skeletonHost;
    let positionMeshVertices = -1;
    for (const candidate of skeletonMeshes) {
        const vertices = candidate.getTotalVertices?.() ?? 0;
        if (vertices > positionMeshVertices) {
            positionMeshVertices = vertices;
            positionMesh = candidate;
        }
    }

    console.log("[BoneViz] Overlay target:", {
        mode: "skeleton",
        mesh: skeletonHost.name,
        bones: bones.length,
        visibleBones: visibleBoneNameSet?.size ?? bones.length,
        pairs: pairs.length,
        positionMesh: positionMesh.name,
        positionMeshVertices,
        skeletonMeshes: skeletonMeshes.length,
    });

    host.boneVisualizerTarget = {
        mesh: skeletonHost,
        skeleton,
        pairs,
        positionMesh,
        runtimeBones: null,
        runtimeUseMeshWorldMatrix: false,
        boneControlInfoByName,
    };
    ensureBoneOverlayCanvas(host);
    syncBoneVisualizerVisibility(host);
}

export function updateBoneVisualizer(host: any): void {
    const target = host.boneVisualizerTarget as BoneVisualizerTarget;
    if (!target || !host.boneOverlayCanvas || !host.boneOverlayCtx) return;

    if (host._isPlaying || host.timelineTarget !== "model" || !host.getActiveModelVisibility()) {
        clearBoneOverlay(host);
        return;
    }

    const { mesh, skeleton, pairs, positionMesh, runtimeBones, runtimeUseMeshWorldMatrix, boneControlInfoByName } = target;
    const ctx = host.boneOverlayCtx;
    const width = host.boneOverlayCanvas.width / host.boneOverlayDpr;
    const height = host.boneOverlayCanvas.height / host.boneOverlayDpr;
    const viewport = host.camera.viewport.toGlobal(host.engine.getRenderWidth(), host.engine.getRenderHeight());
    const transformMatrix = host.scene.getTransformMatrix();
    const selectedBoneName = host.boneVisualizerSelectedBoneName;

    mesh.computeWorldMatrix(true);
    const meshWorldMatrix = mesh.getWorldMatrix();

    if (!runtimeBones || runtimeBones.length === 0) {
        if (!skeleton) {
            clearBoneOverlay(host);
            return;
        }
        positionMesh.computeWorldMatrix(true);
        skeleton.computeAbsoluteMatrices(true);
    }

    ctx.clearRect(0, 0, width, height);
    host.boneVisualizerPickPoints = [];

    if (runtimeBones && runtimeBones.length > 0) {
        const projectedPositions = new Map<number, { x: number; y: number }>();
        const segmentCommands: Array<{ fromX: number; fromY: number; toX: number; toY: number; selected: boolean; lineColor: string; lineWidth: number }> = [];

        for (const [childIndex, parentIndex] of pairs) {
            runtimeBones[childIndex].getWorldTranslationToRef(host.boneOverlayChildWorld);
            runtimeBones[parentIndex].getWorldTranslationToRef(host.boneOverlayParentWorld);

            if (runtimeUseMeshWorldMatrix) {
                Vector3.TransformCoordinatesToRef(host.boneOverlayChildWorld, meshWorldMatrix, host.boneOverlayChildWorld);
                Vector3.TransformCoordinatesToRef(host.boneOverlayParentWorld, meshWorldMatrix, host.boneOverlayParentWorld);
            }

            Vector3.ProjectToRef(host.boneOverlayChildWorld, host.boneOverlayIdentity, transformMatrix, viewport, host.boneOverlayChildScreen);
            Vector3.ProjectToRef(host.boneOverlayParentWorld, host.boneOverlayIdentity, transformMatrix, viewport, host.boneOverlayParentScreen);

            if (!Number.isFinite(host.boneOverlayChildScreen.x) || !Number.isFinite(host.boneOverlayChildScreen.y)) continue;
            if (!Number.isFinite(host.boneOverlayParentScreen.x) || !Number.isFinite(host.boneOverlayParentScreen.y)) continue;

            projectedPositions.set(childIndex, { x: host.boneOverlayChildScreen.x, y: host.boneOverlayChildScreen.y });
            projectedPositions.set(parentIndex, { x: host.boneOverlayParentScreen.x, y: host.boneOverlayParentScreen.y });
            const parentName = runtimeBones[parentIndex].name;
            const selected = selectedBoneName === parentName;
            const style = resolveBoneVisualizerStyle(host, boneControlInfoByName.get(parentName), selected);

            segmentCommands.push({
                fromX: host.boneOverlayParentScreen.x,
                fromY: host.boneOverlayParentScreen.y,
                toX: host.boneOverlayChildScreen.x,
                toY: host.boneOverlayChildScreen.y,
                selected,
                lineColor: style.lineColor,
                lineWidth: style.lineWidth,
            });
        }

        for (const command of segmentCommands) {
            if (command.selected) continue;
            drawBoneVisualizerSegment(host, ctx, { x: command.fromX, y: command.fromY }, { x: command.toX, y: command.toY }, command.lineColor, command.lineWidth);
        }
        for (const command of segmentCommands) {
            if (!command.selected) continue;
            drawBoneVisualizerSegment(host, ctx, { x: command.fromX, y: command.fromY }, { x: command.toX, y: command.toY }, command.lineColor, command.lineWidth);
        }

        const markerCommands: Array<{ boneName: string; x: number; y: number; selected: boolean; markerShape: "circle" | "square"; markerColor: string }> = [];
        for (const [boneIndex, projected] of projectedPositions) {
            const boneName = runtimeBones[boneIndex].name;
            const selected = selectedBoneName === boneName;
            const style = resolveBoneVisualizerStyle(host, boneControlInfoByName.get(boneName), selected);
            markerCommands.push({
                boneName,
                x: projected.x,
                y: projected.y,
                selected,
                markerShape: style.markerShape,
                markerColor: style.markerColor,
            });
        }

        for (const marker of markerCommands) {
            if (marker.selected) continue;
            drawBoneVisualizerMarker(host, ctx, marker.x, marker.y, marker.markerShape, marker.markerColor, false);
        }
        for (const marker of markerCommands) {
            if (!marker.selected) continue;
            drawBoneVisualizerMarker(host, ctx, marker.x, marker.y, marker.markerShape, marker.markerColor, true);
        }
        for (const marker of markerCommands) {
            host.boneVisualizerPickPoints.push({ boneName: marker.boneName, x: marker.x, y: marker.y });
        }
        return;
    }

    if (skeleton) {
        const bones = skeleton.bones;
        const projectedPositions = new Map<number, { x: number; y: number }>();
        const segmentCommands: Array<{ fromX: number; fromY: number; toX: number; toY: number; selected: boolean; lineColor: string; lineWidth: number }> = [];

        for (const [childIndex, parentIndex] of pairs) {
            getBoneWorldPositionToRef(host, bones[childIndex], positionMesh, host.boneOverlayChildWorld);
            getBoneWorldPositionToRef(host, bones[parentIndex], positionMesh, host.boneOverlayParentWorld);

            Vector3.ProjectToRef(host.boneOverlayChildWorld, host.boneOverlayIdentity, transformMatrix, viewport, host.boneOverlayChildScreen);
            Vector3.ProjectToRef(host.boneOverlayParentWorld, host.boneOverlayIdentity, transformMatrix, viewport, host.boneOverlayParentScreen);

            if (!Number.isFinite(host.boneOverlayChildScreen.x) || !Number.isFinite(host.boneOverlayChildScreen.y)) continue;
            if (!Number.isFinite(host.boneOverlayParentScreen.x) || !Number.isFinite(host.boneOverlayParentScreen.y)) continue;

            projectedPositions.set(childIndex, { x: host.boneOverlayChildScreen.x, y: host.boneOverlayChildScreen.y });
            projectedPositions.set(parentIndex, { x: host.boneOverlayParentScreen.x, y: host.boneOverlayParentScreen.y });
            const parentName = bones[parentIndex].name;
            const selected = selectedBoneName === parentName;
            const style = resolveBoneVisualizerStyle(host, boneControlInfoByName.get(parentName), selected);

            segmentCommands.push({
                fromX: host.boneOverlayParentScreen.x,
                fromY: host.boneOverlayParentScreen.y,
                toX: host.boneOverlayChildScreen.x,
                toY: host.boneOverlayChildScreen.y,
                selected,
                lineColor: style.lineColor,
                lineWidth: style.lineWidth,
            });
        }

        for (const command of segmentCommands) {
            if (command.selected) continue;
            drawBoneVisualizerSegment(host, ctx, { x: command.fromX, y: command.fromY }, { x: command.toX, y: command.toY }, command.lineColor, command.lineWidth);
        }
        for (const command of segmentCommands) {
            if (!command.selected) continue;
            drawBoneVisualizerSegment(host, ctx, { x: command.fromX, y: command.fromY }, { x: command.toX, y: command.toY }, command.lineColor, command.lineWidth);
        }

        const markerCommands: Array<{ boneName: string; x: number; y: number; selected: boolean; markerShape: "circle" | "square"; markerColor: string }> = [];
        for (const [boneIndex, projected] of projectedPositions) {
            const boneName = bones[boneIndex].name;
            const selected = selectedBoneName === boneName;
            const style = resolveBoneVisualizerStyle(host, boneControlInfoByName.get(boneName), selected);
            markerCommands.push({
                boneName,
                x: projected.x,
                y: projected.y,
                selected,
                markerShape: style.markerShape,
                markerColor: style.markerColor,
            });
        }

        for (const marker of markerCommands) {
            if (marker.selected) continue;
            drawBoneVisualizerMarker(host, ctx, marker.x, marker.y, marker.markerShape, marker.markerColor, false);
        }
        for (const marker of markerCommands) {
            if (!marker.selected) continue;
            drawBoneVisualizerMarker(host, ctx, marker.x, marker.y, marker.markerShape, marker.markerColor, true);
        }
        for (const marker of markerCommands) {
            host.boneVisualizerPickPoints.push({ boneName: marker.boneName, x: marker.x, y: marker.y });
        }
    }
}

export function tryPickBoneVisualizerAtClientPosition(host: any, clientX: number, clientY: number): void {
    if (host._isPlaying || host.timelineTarget !== "model" || !host.getActiveModelVisibility()) return;
    if (host.boneVisualizerTarget === null) return;
    if (host.boneVisualizerPickPoints.length === 0) return;

    const rect = host.renderingCanvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

    const pickRadius = 14;
    const pickRadiusSq = pickRadius * pickRadius;

    let pickedBoneName: string | null = null;
    let pickedDistanceSq = Number.POSITIVE_INFINITY;

    for (const point of host.boneVisualizerPickPoints) {
        const dx = point.x - x;
        const dy = point.y - y;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq > pickRadiusSq) continue;
        if (distanceSq >= pickedDistanceSq) continue;

        pickedBoneName = point.boneName;
        pickedDistanceSq = distanceSq;
    }

    if (!pickedBoneName) return;

    host.setBoneVisualizerSelectedBone(pickedBoneName);
    host.onBoneVisualizerBonePicked?.(pickedBoneName);
}

export function syncBoneVisualizerVisibility(host: any): void {
    if (!host.boneOverlayCanvas) return;

    const visible = host.timelineTarget === "model" && host.boneVisualizerTarget !== null && host.getActiveModelVisibility() && !host._isPlaying;
    host.boneOverlayCanvas.style.display = visible ? "block" : "none";
    if (!visible) {
        clearBoneOverlay(host);
    }
}

export function clearBoneOverlay(host: any): void {
    host.boneVisualizerPickPoints = [];
    if (!host.boneOverlayCanvas || !host.boneOverlayCtx) return;
    const width = host.boneOverlayCanvas.width / host.boneOverlayDpr;
    const height = host.boneOverlayCanvas.height / host.boneOverlayDpr;
    host.boneOverlayCtx.clearRect(0, 0, width, height);
}

export function ensureBoneOverlayCanvas(host: any): void {
    if (host.boneOverlayCanvas && host.boneOverlayCtx) return;

    const container = host.renderingCanvas.parentElement;
    if (!container) return;

    const overlay = document.createElement("canvas");
    overlay.id = "bone-overlay-canvas";
    overlay.style.position = "absolute";
    overlay.style.inset = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = "8";
    overlay.style.opacity = "0.5";

    const ctx = overlay.getContext("2d");
    if (!ctx) return;

    container.appendChild(overlay);
    host.boneOverlayCanvas = overlay;
    host.boneOverlayCtx = ctx;
    resizeBoneOverlayCanvas(host);
}

export function resizeBoneOverlayCanvas(host: any): void {
    if (!host.boneOverlayCanvas || !host.boneOverlayCtx) return;

    const width = Math.max(1, Math.floor(host.renderingCanvas.clientWidth));
    const height = Math.max(1, Math.floor(host.renderingCanvas.clientHeight));
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    host.boneOverlayDpr = dpr;
    const targetWidth = Math.floor(width * dpr);
    const targetHeight = Math.floor(height * dpr);

    if (host.boneOverlayCanvas.width !== targetWidth || host.boneOverlayCanvas.height !== targetHeight) {
        host.boneOverlayCanvas.width = targetWidth;
        host.boneOverlayCanvas.height = targetHeight;
    }

    host.boneOverlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function disposeBoneVisualizer(host: any): void {
    host.boneVisualizerTarget = null;
    clearBoneOverlay(host);
}

export function getBoneWorldPositionToRef(host: any, bone: Skeleton["bones"][number], mesh: Mesh, result: Vector3): void {
    bone.getAbsolutePositionToRef(mesh, result);
    if (!Number.isFinite(result.x) || !Number.isFinite(result.y) || !Number.isFinite(result.z)) {
        bone.getPositionToRef(Space.WORLD, mesh, result);
    }
    if (!Number.isFinite(result.x) || !Number.isFinite(result.y) || !Number.isFinite(result.z)) {
        Vector3.TransformCoordinatesFromFloatsToRef(0, 0, 0, bone.getAbsoluteMatrix(), result);
        Vector3.TransformCoordinatesToRef(result, mesh.getWorldMatrix(), result);
    }
}

export function resolveBoneVisualizerStyle(
    host: any,
    boneInfo: BoneControlInfo | undefined,
    isSelected: boolean
): { lineColor: string; markerColor: string; markerShape: "circle" | "square"; lineWidth: number } {
    void host;
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

export function drawBoneVisualizerSegment(
    host: any,
    ctx: CanvasRenderingContext2D,
    from: { x: number; y: number },
    to: { x: number; y: number },
    color: string,
    lineWidth: number
): void {
    void host;
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

export function drawBoneVisualizerMarker(
    host: any,
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    markerShape: "circle" | "square",
    color: string,
    selected: boolean
): void {
    void host;
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
