import { GizmoManager } from "@babylonjs/core/Gizmos/gizmoManager";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

function getActiveBoneControlInfo(host: any, boneName: string) {
    return host.activeModelInfo?.boneControlInfos?.find((info: any) => info.name === boneName);
}

function disableBoneGizmo(host: any): void {
    const gizmoManager = host.boneGizmoManager;
    if (gizmoManager) {
        gizmoManager.attachToNode(null);
        gizmoManager.positionGizmoEnabled = false;
        gizmoManager.rotationGizmoEnabled = false;
    }

    host.boneGizmoRuntimeBone = null;
    host.boneGizmoProxyNode?.setEnabled(false);
}

function syncBoneGizmoProxyToRuntimeBone(host: any, runtimeBone: any): void {
    const proxyNode = host.boneGizmoProxyNode;
    if (!proxyNode) return;

    runtimeBone.getWorldMatrixToRef(host.boneGizmoTempMatrix);
    host.boneGizmoTempMatrix.decompose(
        host.boneGizmoTempScale,
        host.boneGizmoTempRotation,
        host.boneGizmoTempPosition
    );

    const useMeshWorldMatrix = host.boneVisualizerTarget?.runtimeUseMeshWorldMatrix === true && host.currentMesh !== null;
    if (useMeshWorldMatrix && host.currentMesh) {
        const meshWorldMatrix = host.currentMesh.computeWorldMatrix(true);
        Vector3.TransformCoordinatesToRef(host.boneGizmoTempPosition, meshWorldMatrix, host.boneGizmoTempPosition2);
        meshWorldMatrix.decompose(
            host.boneGizmoTempScale2,
            host.boneGizmoTempRotation2,
            host.boneGizmoTempPosition3
        );
        host.boneGizmoTempRotation2.multiplyToRef(
            host.boneGizmoTempRotation,
            host.boneGizmoTempRotation
        );
        proxyNode.position.copyFrom(host.boneGizmoTempPosition2);
    } else {
        proxyNode.position.copyFrom(host.boneGizmoTempPosition);
    }

    if (!proxyNode.rotationQuaternion) {
        proxyNode.rotationQuaternion = Quaternion.Identity();
    }
    proxyNode.rotationQuaternion.copyFrom(host.boneGizmoTempRotation);
}

function applyBoneGizmoProxyToRuntimeBone(host: any, runtimeBone: any): void {
    const proxyNode = host.boneGizmoProxyNode;
    if (!proxyNode) return;

    const controlInfo = getActiveBoneControlInfo(host, runtimeBone.name);
    const movable = controlInfo?.movable ?? true;
    const rotatable = controlInfo?.rotatable ?? true;
    if (!movable && !rotatable) return;

    proxyNode.computeWorldMatrix(true);
    proxyNode.getWorldMatrix().decompose(
        host.boneGizmoTempScale,
        host.boneGizmoTempRotation,
        host.boneGizmoTempPosition
    );

    const useMeshWorldMatrix = host.boneVisualizerTarget?.runtimeUseMeshWorldMatrix === true && host.currentMesh !== null;
    if (useMeshWorldMatrix && host.currentMesh) {
        const meshWorldMatrix = host.currentMesh.computeWorldMatrix(true);
        meshWorldMatrix.invertToRef(host.boneGizmoTempMatrix2);
        Vector3.TransformCoordinatesToRef(host.boneGizmoTempPosition, host.boneGizmoTempMatrix2, host.boneGizmoTempPosition2);

        meshWorldMatrix.decompose(
            host.boneGizmoTempScale2,
            host.boneGizmoTempRotation2,
            host.boneGizmoTempPosition3
        );
        Quaternion.InverseToRef(host.boneGizmoTempRotation2, host.boneGizmoTempRotation2);
        host.boneGizmoTempRotation2.multiplyToRef(
            host.boneGizmoTempRotation,
            host.boneGizmoTempRotation
        );
    } else {
        host.boneGizmoTempPosition2.copyFrom(host.boneGizmoTempPosition);
    }

    let localPositionX = host.boneGizmoTempPosition2.x;
    let localPositionY = host.boneGizmoTempPosition2.y;
    let localPositionZ = host.boneGizmoTempPosition2.z;
    let localRotation = host.boneGizmoTempRotation;

    const parentBone = runtimeBone.parentBone;
    if (parentBone) {
        parentBone.getWorldMatrixToRef(host.boneGizmoTempMatrix);
        host.boneGizmoTempMatrix.invertToRef(host.boneGizmoTempMatrix2);
        Vector3.TransformCoordinatesToRef(
            host.boneGizmoTempPosition2,
            host.boneGizmoTempMatrix2,
            host.boneGizmoTempPosition3
        );
        localPositionX = host.boneGizmoTempPosition3.x;
        localPositionY = host.boneGizmoTempPosition3.y;
        localPositionZ = host.boneGizmoTempPosition3.z;

        host.boneGizmoTempMatrix.decompose(
            host.boneGizmoTempScale2,
            host.boneGizmoTempRotation2,
            host.boneGizmoTempPosition3
        );
        Quaternion.InverseToRef(host.boneGizmoTempRotation2, host.boneGizmoTempRotation2);
        host.boneGizmoTempRotation2.multiplyToRef(host.boneGizmoTempRotation, host.boneGizmoTempRotation2);
        localRotation = host.boneGizmoTempRotation2;
    }

    if (movable && Number.isFinite(localPositionX) && Number.isFinite(localPositionY) && Number.isFinite(localPositionZ)) {
        runtimeBone.linkedBone.position.set(localPositionX, localPositionY, localPositionZ);
    }

    if (rotatable && Number.isFinite(localRotation.x) && Number.isFinite(localRotation.y) && Number.isFinite(localRotation.z) && Number.isFinite(localRotation.w)) {
        if (!runtimeBone.linkedBone.rotationQuaternion) {
            runtimeBone.linkedBone.rotationQuaternion = Quaternion.Identity();
        }
        localRotation.normalize();
        runtimeBone.linkedBone.rotationQuaternion.copyFrom(localRotation);
    }
}

export function initializeBoneGizmoSystem(host: any): void {
    host.boneGizmoManager = new GizmoManager(host.scene, 1.8);
    host.boneGizmoManager.usePointerToAttachGizmos = false;
    host.boneGizmoManager.clearGizmoOnEmptyPointerEvent = false;
    host.boneGizmoManager.scaleGizmoEnabled = false;
    host.boneGizmoManager.boundingBoxGizmoEnabled = false;
    host.boneGizmoManager.positionGizmoEnabled = false;
    host.boneGizmoManager.rotationGizmoEnabled = false;
    host.boneGizmoProxyNode = new TransformNode("boneGizmoProxy", host.scene);
    host.boneGizmoProxyNode.rotationQuaternion = Quaternion.Identity();
    host.boneGizmoProxyNode.setEnabled(false);
}

export function updateBoneGizmoTarget(host: any): void {
    const gizmoManager = host.boneGizmoManager;
    const proxyNode = host.boneGizmoProxyNode;
    if (!gizmoManager || !proxyNode) return;

    if (host.timelineTarget !== "model" || host._isPlaying || !host.getActiveModelVisibility()) {
        disableBoneGizmo(host);
        return;
    }

    const boneName = host.boneVisualizerSelectedBoneName;
    if (!boneName) {
        disableBoneGizmo(host);
        return;
    }

    const runtimeBone = host.getRuntimeBoneByName(boneName);
    if (!runtimeBone) {
        disableBoneGizmo(host);
        return;
    }

    const controlInfo = getActiveBoneControlInfo(host, boneName);
    const movable = controlInfo?.movable ?? true;
    const rotatable = controlInfo?.rotatable ?? true;

    if (!movable && !rotatable) {
        disableBoneGizmo(host);
        return;
    }

    syncBoneGizmoProxyToRuntimeBone(host, runtimeBone);

    gizmoManager.scaleGizmoEnabled = false;
    gizmoManager.boundingBoxGizmoEnabled = false;
    gizmoManager.positionGizmoEnabled = movable;
    gizmoManager.rotationGizmoEnabled = rotatable;
    proxyNode.setEnabled(true);
    gizmoManager.attachToNode(proxyNode);

    host.boneGizmoRuntimeBone = runtimeBone;
    host.invalidateBoneVisualizerPose(runtimeBone);
}

export function handleBoneGizmoBeforeRender(host: any): void {
    const boneRuntime = host.boneGizmoRuntimeBone;
    const boneGizmoDragging = host.boneGizmoManager?.isDragging === true && boneRuntime !== null;
    if (boneGizmoDragging && boneRuntime) {
        if (host.physicsEnabledBeforeBoneGizmoDrag === null) {
            const currentPhysicsState = host.getPhysicsEnabled();
            host.physicsEnabledBeforeBoneGizmoDrag = currentPhysicsState;
            if (currentPhysicsState) {
                host.setPhysicsEnabled(false);
            }
        }

        applyBoneGizmoProxyToRuntimeBone(host, boneRuntime);
        host.invalidateBoneVisualizerPose(boneRuntime);
        return;
    }

    if (host.physicsEnabledBeforeBoneGizmoDrag !== null) {
        const resumePhysics = host.physicsEnabledBeforeBoneGizmoDrag;
        host.physicsEnabledBeforeBoneGizmoDrag = null;
        if (resumePhysics) {
            host.setPhysicsEnabled(true);
        }
    }

    if (boneRuntime) {
        syncBoneGizmoProxyToRuntimeBone(host, boneRuntime);
    }
}

export function disposeBoneGizmoSystem(host: any): void {
    if (host.boneGizmoManager) {
        host.boneGizmoManager.dispose();
        host.boneGizmoManager = null;
    }
    host.boneGizmoRuntimeBone = null;
    host.boneGizmoProxyNode?.dispose();
    host.boneGizmoProxyNode = null;
}
