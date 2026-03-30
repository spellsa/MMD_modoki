import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PmxObject } from "babylon-mmd/esm/Loader/Parser/pmxObject";

type RigidBodyVisualizerBackend = "ammo" | "bullet";

function shouldShowRigidBodyVisualizer(host: any, target: any): boolean {
    return Boolean(host.rigidBodyVisualizerEnabled && host.getModelVisibility?.(target.sceneModel?.mesh));
}

function disposeRigidBodyVisualizerMeshes(host: any): void {
    const targets = Array.isArray(host.rigidBodyVisualizerTargets) ? host.rigidBodyVisualizerTargets : [];
    if (targets.length === 0) {
        host.rigidBodyVisualizerTargets = [];
        return;
    }

    for (const target of targets) {
        for (const mesh of target.meshes ?? []) {
            mesh?.dispose();
        }
    }
    host.rigidBodyVisualizerTargets = [];
}

function resolveRigidBodyVisualizerBackend(physicsModel: any): RigidBodyVisualizerBackend | null {
    if (Array.isArray(physicsModel?._nodes)) {
        return "ammo";
    }
    if (physicsModel?._bundle?.getTransformMatrixToRef) {
        return "bullet";
    }
    return null;
}

function resolveRigidBodyColor(physicsMode: number): Color3 {
    switch (physicsMode) {
        case PmxObject.RigidBody.PhysicsMode.FollowBone:
            return new Color3(0.36, 0.76, 1.0);
        case PmxObject.RigidBody.PhysicsMode.PhysicsWithBone:
            return new Color3(1.0, 0.46, 0.76);
        case PmxObject.RigidBody.PhysicsMode.Physics:
        default:
            return new Color3(1.0, 0.72, 0.26);
    }
}

function getRigidBodyVisualizerMaterial(host: any, physicsMode: number): StandardMaterial {
    const existing = host.rigidBodyVisualizerMaterials.get(physicsMode) as StandardMaterial | undefined;
    if (existing) {
        return existing;
    }

    const material = new StandardMaterial(`rigid-body-debug-mat-${physicsMode}`, host.scene);
    material.disableLighting = true;
    material.emissiveColor = resolveRigidBodyColor(physicsMode);
    material.wireframe = true;
    material.alpha = 0.95;
    material.backFaceCulling = false;
    material.useLogarithmicDepth = true;
    host.rigidBodyVisualizerMaterials.set(physicsMode, material);
    return material;
}

function createRigidBodyDebugMesh(host: any, rigidBody: any, index: number): Mesh {
    const shapeSize = Array.isArray(rigidBody?.shapeSize) ? rigidBody.shapeSize : [0.5, 0.5, 0.5];
    const safeX = Math.max(0.01, Number(shapeSize[0] ?? 0.5));
    const safeY = Math.max(0.01, Number(shapeSize[1] ?? safeX));
    const safeZ = Math.max(0.01, Number(shapeSize[2] ?? safeX));
    const name = String(rigidBody?.name || `RigidBody ${index + 1}`);
    const shapeType = typeof rigidBody?.shapeType === "number"
        ? rigidBody.shapeType
        : PmxObject.RigidBody.ShapeType.Sphere;

    let mesh: Mesh;
    switch (shapeType) {
        case PmxObject.RigidBody.ShapeType.Box:
            mesh = CreateBox(`rigid-body-debug-${index}`, {
                width: safeX * 2,
                height: safeY * 2,
                depth: safeZ * 2,
            }, host.scene);
            break;
        case PmxObject.RigidBody.ShapeType.Capsule:
            mesh = CreateCapsule(`rigid-body-debug-${index}`, {
                radius: safeX,
                height: Math.max((safeY * 2) + (safeX * 2), safeX * 2.1),
                tessellation: 12,
                subdivisions: 4,
            }, host.scene);
            break;
        case PmxObject.RigidBody.ShapeType.Sphere:
        default:
            mesh = CreateSphere(`rigid-body-debug-${index}`, {
                diameter: safeX * 2,
                segments: 12,
            }, host.scene);
            break;
    }

    mesh.metadata = {
        kind: "rigid-body-debug",
        rigidBodyName: name,
        rigidBodyIndex: index,
        physicsMode: rigidBody?.physicsMode ?? PmxObject.RigidBody.PhysicsMode.Physics,
    };
    mesh.material = getRigidBodyVisualizerMaterial(
        host,
        typeof rigidBody?.physicsMode === "number" ? rigidBody.physicsMode : PmxObject.RigidBody.PhysicsMode.Physics,
    );
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.renderingGroupId = 2;
    mesh.rotationQuaternion = Quaternion.Identity();
    mesh.setEnabled(false);
    mesh.isVisible = false;
    return mesh;
}

function setRigidBodyMeshVisible(mesh: Mesh, visible: boolean): void {
    mesh.setEnabled(visible);
    mesh.isVisible = visible;
}

function applyTransformToDebugMesh(host: any, mesh: Mesh, matrix: any): boolean {
    if (!matrix) return false;

    matrix.decompose(
        host.rigidBodyVisualizerTempScaling,
        host.rigidBodyVisualizerTempRotation,
        host.rigidBodyVisualizerTempPosition,
    );

    const position = host.rigidBodyVisualizerTempPosition;
    const scaling = host.rigidBodyVisualizerTempScaling;
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) {
        return false;
    }
    if (!Number.isFinite(scaling.x) || !Number.isFinite(scaling.y) || !Number.isFinite(scaling.z)) {
        return false;
    }

    mesh.position.copyFrom(position);
    mesh.scaling.copyFrom(scaling);
    if (!mesh.rotationQuaternion) {
        mesh.rotationQuaternion = Quaternion.Identity();
    }
    mesh.rotationQuaternion.copyFrom(host.rigidBodyVisualizerTempRotation);
    return true;
}

export function refreshRigidBodyVisualizerTarget(host: any): void {
    disposeRigidBodyVisualizerMeshes(host);
    const sceneModels = Array.isArray(host.sceneModels) ? host.sceneModels : [];
    host.rigidBodyVisualizerTargets = sceneModels.flatMap((sceneModel: any) => {
        const rigidBodies = Array.isArray(sceneModel?.rigidBodies) ? sceneModel.rigidBodies : [];
        const physicsModel = sceneModel?.model?._physicsModel ?? null;
        const backend = resolveRigidBodyVisualizerBackend(physicsModel);
        if (rigidBodies.length === 0 || !physicsModel || !backend) {
            return [];
        }

        const meshes = rigidBodies.map((rigidBody: any, index: number) => createRigidBodyDebugMesh(host, rigidBody, index));
        return [{
            sceneModel,
            backend,
            physicsModel,
            rigidBodies,
            meshes,
        }];
    });
    syncRigidBodyVisualizerVisibility(host);
    updateRigidBodyVisualizer(host);
}

export function syncRigidBodyVisualizerVisibility(host: any): void {
    const targets = Array.isArray(host.rigidBodyVisualizerTargets) ? host.rigidBodyVisualizerTargets : [];
    for (const target of targets) {
        const visible = shouldShowRigidBodyVisualizer(host, target);
        for (const mesh of target.meshes) {
            setRigidBodyMeshVisible(mesh, visible);
        }
    }
}

export function updateRigidBodyVisualizer(host: any): void {
    const targets = Array.isArray(host.rigidBodyVisualizerTargets) ? host.rigidBodyVisualizerTargets as {
        sceneModel: any;
        backend: RigidBodyVisualizerBackend;
        physicsModel: any;
        meshes: Mesh[];
    }[] : [];
    if (targets.length === 0) return;

    for (const target of targets) {
        const shouldShow = shouldShowRigidBodyVisualizer(host, target);
        if (!shouldShow) {
            for (const mesh of target.meshes) {
                setRigidBodyMeshVisible(mesh, false);
            }
            continue;
        }

        if (target.backend === "bullet") {
            const bundle = target.physicsModel?._bundle;
            if (!bundle?.getTransformMatrixToRef) continue;

            for (let i = 0; i < target.meshes.length; i += 1) {
                const mesh = target.meshes[i];
                let hasTransform = false;
                if (i < bundle.count) {
                    bundle.getTransformMatrixToRef(i, host.rigidBodyVisualizerTempMatrix);
                    hasTransform = applyTransformToDebugMesh(host, mesh, host.rigidBodyVisualizerTempMatrix);
                }
                setRigidBodyMeshVisible(mesh, hasTransform);
            }
            continue;
        }

        const nodes = Array.isArray(target.physicsModel?._nodes) ? target.physicsModel._nodes : [];
        for (let i = 0; i < target.meshes.length; i += 1) {
            const mesh = target.meshes[i];
            const node = nodes[i];
            const worldMatrix = node?.computeWorldMatrix?.(true) ?? node?.getWorldMatrix?.();
            const hasTransform = applyTransformToDebugMesh(host, mesh, worldMatrix);
            setRigidBodyMeshVisible(mesh, hasTransform);
        }
    }
}

export function disposeRigidBodyVisualizer(host: any): void {
    disposeRigidBodyVisualizerMeshes(host);
    for (const material of host.rigidBodyVisualizerMaterials.values() as Iterable<StandardMaterial>) {
        material.dispose();
    }
    host.rigidBodyVisualizerMaterials.clear();
}
