import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MmdRuntime } from "babylon-mmd/esm/Runtime/mmdRuntime";
import { MmdWasmRuntime } from "babylon-mmd/esm/Runtime/Optimized/mmdWasmRuntime";
import type { MmdModel } from "babylon-mmd/esm/Runtime/mmdModel";
import type { MmdWasmModel } from "babylon-mmd/esm/Runtime/Optimized/mmdWasmModel";
import type { WebmPhysicsModelSnapshot, WebmPhysicsRigidBodySnapshot } from "../types";

export type PhysicsRuntimeModel = MmdModel | MmdWasmModel;
export type PhysicsMmdRuntime = MmdRuntime | MmdWasmRuntime;

type PhysicsVectorLike = {
    x: number;
    y: number;
    z: number;
};

type PhysicsBodyLike = {
    transformNode?: {
        computeWorldMatrix?: (force?: boolean) => Matrix;
        scaling?: Vector3;
        rotationQuaternion?: Quaternion | null;
        position?: Vector3;
    };
    getLinearVelocityToRef?: (target: Vector3) => void;
    getAngularVelocityToRef?: (target: Vector3) => void;
    setTargetTransform?: (position: Vector3, rotation: Quaternion) => void;
    setLinearVelocity?: (velocity: Vector3) => void;
    setAngularVelocity?: (velocity: Vector3) => void;
};

type ClassicPhysicsNodeLike = {
    scaling?: Vector3;
    rotationQuaternion?: Quaternion | null;
    position?: Vector3;
    computeWorldMatrix?: (force?: boolean) => Matrix;
    physicsBody?: PhysicsBodyLike | null;
};

type ClassicPhysicsModelLike = {
    _nodes?: Array<ClassicPhysicsNodeLike | null>;
    _bodies?: Array<PhysicsBodyLike | null>;
    commitBodyStates?: (states: Uint8Array) => void;
    syncBones?: () => void;
};

type BulletPhysicsBundleLike = {
    count: number;
    getTransformMatrixToRef?: (index: number, target: Matrix) => Matrix;
    setDynamicTransformMatrix?: (index: number, matrix: Matrix, fallbackToSetTransformMatrix?: boolean) => void;
    setTransformMatrix?: (index: number, matrix: Matrix) => void;
    getLinearVelocityToRef?: (index: number, target: Vector3) => Vector3;
    getAngularVelocityToRef?: (index: number, target: Vector3) => Vector3;
    setLinearVelocity?: (index: number, velocity: Vector3, shouldSynced: boolean) => void;
    setAngularVelocity?: (index: number, velocity: Vector3, shouldSynced: boolean) => void;
    updateBufferedMotionStates?: (forceUseFrontBuffer: boolean) => void;
    needToCommit?: boolean;
    commitToWasm?: () => void;
};

type BulletPhysicsModelLike = {
    _bundle?: BulletPhysicsBundleLike | null;
    _rigidBodyIndexMap?: Int32Array | number[];
    commitBodyStates?: (states: Uint8Array) => void;
    syncBones?: () => void;
};

type PhysicsModelInternal = {
    _physicsModel?: ClassicPhysicsModelLike | BulletPhysicsModelLike | null;
};

type PhysicsRuntimeInitializationSetLike = {
    clear?: () => void;
};

type PhysicsRuntimeInitializerLike = {
    initializer?: PhysicsRuntimeInitializationSetLike | null;
};

type PhysicsRuntimeWithInitializationQueues = {
    _needToInitializePhysicsModels?: PhysicsRuntimeInitializationSetLike | null;
    _needToInitializePhysicsModelsBuffer?: PhysicsRuntimeInitializationSetLike | null;
    _physicsRuntime?: PhysicsRuntimeInitializerLike | null;
};

export type PhysicsModelControllerOptions = {
    getRuntime: () => PhysicsMmdRuntime;
    getPhysicsEnabled: () => boolean;
    isSimulationActive: () => boolean;
    syncCpuSkinnedMorphSourceBuffers: (model: PhysicsRuntimeModel) => void;
    addRuntimeDiagnostic: (message: string) => void;
};

export class PhysicsModelController {
    private readonly getRuntime: () => PhysicsMmdRuntime;
    private readonly getPhysicsEnabled: () => boolean;
    private readonly isSimulationActive: () => boolean;
    private readonly syncCpuSkinnedMorphSourceBuffers: (model: PhysicsRuntimeModel) => void;
    private readonly addRuntimeDiagnostic: (message: string) => void;
    private readonly afterPhysicsPatchedModels = new WeakSet<object>();

    constructor(options: PhysicsModelControllerOptions) {
        this.getRuntime = options.getRuntime;
        this.getPhysicsEnabled = options.getPhysicsEnabled;
        this.isSimulationActive = options.isSimulationActive;
        this.syncCpuSkinnedMorphSourceBuffers = options.syncCpuSkinnedMorphSourceBuffers;
        this.addRuntimeDiagnostic = options.addRuntimeDiagnostic;
    }

    public applyPhysicsStateToModel(model: PhysicsRuntimeModel): void {
        if (model.rigidBodyStates.length === 0) return;

        const shouldSimulatePhysics = this.getPhysicsEnabled() && this.isSimulationActive();
        model.rigidBodyStates.fill(shouldSimulatePhysics ? 1 : 0);
        if (shouldSimulatePhysics) {
            this.getRuntime().initializeMmdModelPhysics(model as never);
        }
    }

    public patchModelAfterPhysicsForPausedState(model: PhysicsRuntimeModel): void {
        if (this.getRuntime() instanceof MmdWasmRuntime) {
            return;
        }
        const modelObject = model as unknown as object;
        if (this.afterPhysicsPatchedModels.has(modelObject)) {
            return;
        }

        const modelInternal = model as unknown as {
            afterPhysics?: () => void;
            _physicsModel?: { syncBones?: () => void } | null;
            _update?: (afterPhysicsStage: boolean) => void;
            mesh?: { metadata?: { skeleton?: { _markAsDirty?: () => void } } };
        };

        if (typeof modelInternal.afterPhysics !== "function" || typeof modelInternal._update !== "function") {
            return;
        }

        modelInternal.afterPhysics = () => {
            if (this.getPhysicsEnabled() && this.isSimulationActive()) {
                modelInternal._physicsModel?.syncBones?.();
            }
            modelInternal._update?.(true);
            this.syncCpuSkinnedMorphSourceBuffers(model);
            modelInternal.mesh?.metadata?.skeleton?._markAsDirty?.();
        };

        this.afterPhysicsPatchedModels.add(modelObject);
    }

    public normalizeRuntimeBoneTransformStages(model: PhysicsRuntimeModel): void {
        if (this.getRuntime() instanceof MmdWasmRuntime) {
            return;
        }
        const runtimeBones = (model as unknown as {
            runtimeBones?: Array<{
                name?: string;
                parentBone?: object | null;
                childBones?: unknown[];
                transformAfterPhysics?: boolean;
            }>;
        }).runtimeBones;
        if (!Array.isArray(runtimeBones) || runtimeBones.length === 0) {
            return;
        }

        let adjustedBoneCount = 0;
        const adjustedBoneNames: string[] = [];
        const visited = new Set<object>();

        const propagateAfterPhysicsStage = (bone: {
            name?: string;
            childBones?: unknown[];
            transformAfterPhysics?: boolean;
        }): void => {
            const boneObject = bone as unknown as object;
            if (visited.has(boneObject)) {
                return;
            }
            visited.add(boneObject);

            const childBones = Array.isArray(bone.childBones) ? bone.childBones : [];
            for (const child of childBones) {
                if (!child || typeof child !== "object") {
                    continue;
                }

                const childBone = child as {
                    name?: string;
                    childBones?: unknown[];
                    transformAfterPhysics?: boolean;
                };
                if (childBone.transformAfterPhysics !== true) {
                    childBone.transformAfterPhysics = true;
                    adjustedBoneCount += 1;
                    if (typeof childBone.name === "string") {
                        adjustedBoneNames.push(childBone.name);
                    }
                }
                propagateAfterPhysicsStage(childBone);
            }
        };

        for (const runtimeBone of runtimeBones) {
            if (!runtimeBone || runtimeBone.transformAfterPhysics !== true) {
                continue;
            }
            propagateAfterPhysicsStage(runtimeBone);
        }

        if (adjustedBoneCount === 0) {
            return;
        }

        const modelName = typeof model.mesh?.name === "string" ? model.mesh.name : "model";
        console.warn(`[PMX] Normalized runtime bone transform stages for after-physics parent chains. ${modelName}: ${adjustedBoneCount} bone(s).`, {
            model: modelName,
            adjustedBoneCount,
            adjustedBoneNames,
        });
        this.addRuntimeDiagnostic(`Normalized after-physics bone stages: ${modelName} (${adjustedBoneCount} bone(s))`);
    }

    public normalizeRuntimeBoneEvaluationOrder(model: PhysicsRuntimeModel): void {
        if (this.getRuntime() instanceof MmdWasmRuntime) {
            return;
        }
        const modelInternal = model as unknown as {
            _sortedRuntimeBones?: Array<{
                name?: string;
                parentBone?: object | null;
                transformAfterPhysics?: boolean;
            }>;
        };

        const sortedRuntimeBones = modelInternal._sortedRuntimeBones;
        if (!Array.isArray(sortedRuntimeBones) || sortedRuntimeBones.length === 0) {
            return;
        }

        const originalOrderIndex = new Map<object, number>();
        for (let index = 0; index < sortedRuntimeBones.length; index += 1) {
            originalOrderIndex.set(sortedRuntimeBones[index] as unknown as object, index);
        }

        const sortGroupParentFirst = (afterPhysicsStage: boolean): Array<{
            name?: string;
            parentBone?: object | null;
            transformAfterPhysics?: boolean;
        }> => {
            const groupBones = sortedRuntimeBones.filter((bone) => bone.transformAfterPhysics === afterPhysicsStage);
            if (groupBones.length <= 1) {
                return groupBones;
            }

            const groupSet = new Set<object>(groupBones.map((bone) => bone as unknown as object));
            const indegree = new Map<object, number>();
            const childMap = new Map<object, Array<{
                name?: string;
                parentBone?: object | null;
                transformAfterPhysics?: boolean;
            }>>();
            for (const bone of groupBones) {
                const boneObject = bone as unknown as object;
                indegree.set(boneObject, 0);
                childMap.set(boneObject, []);
            }

            for (const bone of groupBones) {
                const parentBone = bone.parentBone;
                if (!parentBone || !groupSet.has(parentBone as object)) {
                    continue;
                }
                const boneObject = bone as unknown as object;
                indegree.set(boneObject, (indegree.get(boneObject) ?? 0) + 1);
                childMap.get(parentBone as object)?.push(bone);
            }

            const available = groupBones
                .filter((bone) => (indegree.get(bone as unknown as object) ?? 0) === 0)
                .sort((a, b) => (originalOrderIndex.get(a as unknown as object) ?? 0) - (originalOrderIndex.get(b as unknown as object) ?? 0));
            const reorderedGroup: typeof groupBones = [];
            const enqueueAvailable = (bone: typeof groupBones[number]): void => {
                available.push(bone);
                available.sort((a, b) => (originalOrderIndex.get(a as unknown as object) ?? 0) - (originalOrderIndex.get(b as unknown as object) ?? 0));
            };

            while (available.length > 0) {
                const bone = available.shift();
                if (!bone) {
                    break;
                }
                reorderedGroup.push(bone);

                for (const childBone of childMap.get(bone as unknown as object) ?? []) {
                    const childObject = childBone as unknown as object;
                    const nextIndegree = (indegree.get(childObject) ?? 0) - 1;
                    indegree.set(childObject, nextIndegree);
                    if (nextIndegree === 0) {
                        enqueueAvailable(childBone);
                    }
                }
            }

            if (reorderedGroup.length !== groupBones.length) {
                return groupBones;
            }
            return reorderedGroup;
        };

        const reorderedBones = [
            ...sortGroupParentFirst(false),
            ...sortGroupParentFirst(true),
        ];

        let changed = false;
        for (let index = 0; index < sortedRuntimeBones.length; index += 1) {
            if (sortedRuntimeBones[index] !== reorderedBones[index]) {
                changed = true;
                break;
            }
        }
        if (!changed) {
            return;
        }

        sortedRuntimeBones.splice(0, sortedRuntimeBones.length, ...reorderedBones);
        const modelName = typeof model.mesh?.name === "string" ? model.mesh.name : "model";
        console.warn(`[PMX] Normalized runtime bone evaluation order for parent-first traversal. ${modelName}.`, {
            model: modelName,
            runtimeBoneCount: sortedRuntimeBones.length,
        });
        this.addRuntimeDiagnostic(`Normalized runtime bone evaluation order: ${modelName} (${sortedRuntimeBones.length} bone(s))`);
    }

    public static hasPhysicsModel(model: PhysicsRuntimeModel, rigidBodyCount: number): boolean {
        const modelInternal = model as unknown as { _physicsModel?: unknown } | null;
        return Boolean(modelInternal?._physicsModel && rigidBodyCount > 0);
    }

    public static captureWebmPhysicsModelSnapshot(
        model: PhysicsRuntimeModel,
        modelIndex: number,
        modelName: string,
    ): WebmPhysicsModelSnapshot | null {
        const rigidBodyCount = model.rigidBodyStates.length;
        if (rigidBodyCount === 0) return null;

        const physicsModel = (model as unknown as PhysicsModelInternal)._physicsModel;
        if (!physicsModel) return null;

        const rigidBodies = PhysicsModelController.captureBulletRigidBodies(physicsModel, rigidBodyCount)
            ?? PhysicsModelController.captureClassicRigidBodies(physicsModel, rigidBodyCount);
        if (!rigidBodies) return null;

        return {
            modelIndex,
            modelName,
            rigidBodyStates: Array.from(model.rigidBodyStates),
            rigidBodies,
        };
    }

    public static applyWebmPhysicsModelSnapshot(
        model: PhysicsRuntimeModel,
        snapshot: WebmPhysicsModelSnapshot,
    ): boolean {
        if (model.rigidBodyStates.length === 0) return false;
        if (snapshot.rigidBodyStates.length !== model.rigidBodyStates.length) return false;

        const physicsModel = (model as unknown as PhysicsModelInternal)._physicsModel;
        if (!physicsModel) return false;

        model.rigidBodyStates.set(snapshot.rigidBodyStates.map((state) => state ? 1 : 0));
        physicsModel.commitBodyStates?.(model.rigidBodyStates);

        const restored = PhysicsModelController.applyBulletRigidBodies(physicsModel, snapshot)
            || PhysicsModelController.applyClassicRigidBodies(physicsModel, snapshot);
        if (!restored) return false;

        physicsModel.syncBones?.();
        return true;
    }

    public static clearPendingPhysicsInitializations(runtime: PhysicsMmdRuntime): boolean {
        const runtimeInternal = runtime as unknown as PhysicsRuntimeWithInitializationQueues;
        let cleared = false;

        const clearSet = (setLike: PhysicsRuntimeInitializationSetLike | null | undefined): void => {
            if (typeof setLike?.clear !== "function") return;
            setLike.clear();
            cleared = true;
        };

        clearSet(runtimeInternal._needToInitializePhysicsModels);
        clearSet(runtimeInternal._needToInitializePhysicsModelsBuffer);
        clearSet(runtimeInternal._physicsRuntime?.initializer);
        return cleared;
    }

    private static captureBulletRigidBodies(
        physicsModel: ClassicPhysicsModelLike | BulletPhysicsModelLike,
        rigidBodyCount: number,
    ): Array<WebmPhysicsRigidBodySnapshot | null> | null {
        const bulletModel = physicsModel as BulletPhysicsModelLike;
        const bundle = bulletModel._bundle;
        const indexMap = bulletModel._rigidBodyIndexMap;
        if (!bundle || !indexMap || typeof bundle.getTransformMatrixToRef !== "function") {
            return null;
        }

        const transform = Matrix.Identity();
        const linearVelocity = Vector3.Zero();
        const angularVelocity = Vector3.Zero();
        const rigidBodies: Array<WebmPhysicsRigidBodySnapshot | null> = [];
        for (let rigidBodyIndex = 0; rigidBodyIndex < rigidBodyCount; rigidBodyIndex += 1) {
            const mappedIndex = indexMap[rigidBodyIndex];
            if (!Number.isInteger(mappedIndex) || mappedIndex < 0 || mappedIndex >= bundle.count) {
                rigidBodies.push(null);
                continue;
            }

            bundle.getTransformMatrixToRef(mappedIndex, transform);
            linearVelocity.set(0, 0, 0);
            angularVelocity.set(0, 0, 0);
            bundle.getLinearVelocityToRef?.(mappedIndex, linearVelocity);
            bundle.getAngularVelocityToRef?.(mappedIndex, angularVelocity);
            rigidBodies.push({
                transformMatrix: Array.from(transform.m),
                linearVelocity: PhysicsModelController.vectorToTuple(linearVelocity),
                angularVelocity: PhysicsModelController.vectorToTuple(angularVelocity),
            });
        }
        return rigidBodies;
    }

    private static captureClassicRigidBodies(
        physicsModel: ClassicPhysicsModelLike | BulletPhysicsModelLike,
        rigidBodyCount: number,
    ): Array<WebmPhysicsRigidBodySnapshot | null> | null {
        const classicModel = physicsModel as ClassicPhysicsModelLike;
        const nodes = classicModel._nodes;
        const bodies = classicModel._bodies;
        if (!Array.isArray(nodes) || !Array.isArray(bodies)) {
            return null;
        }

        const transform = Matrix.Identity();
        const linearVelocity = Vector3.Zero();
        const angularVelocity = Vector3.Zero();
        const rigidBodies: Array<WebmPhysicsRigidBodySnapshot | null> = [];
        for (let rigidBodyIndex = 0; rigidBodyIndex < rigidBodyCount; rigidBodyIndex += 1) {
            const node = nodes[rigidBodyIndex] ?? null;
            const body = bodies[rigidBodyIndex] ?? node?.physicsBody ?? null;
            if (!node || !body) {
                rigidBodies.push(null);
                continue;
            }

            const nodeTransform = node.computeWorldMatrix?.(true)
                ?? body.transformNode?.computeWorldMatrix?.(true)
                ?? null;
            if (!nodeTransform) {
                rigidBodies.push(null);
                continue;
            }

            transform.copyFrom(nodeTransform);
            linearVelocity.set(0, 0, 0);
            angularVelocity.set(0, 0, 0);
            body.getLinearVelocityToRef?.(linearVelocity);
            body.getAngularVelocityToRef?.(angularVelocity);
            rigidBodies.push({
                transformMatrix: Array.from(transform.m),
                linearVelocity: PhysicsModelController.vectorToTuple(linearVelocity),
                angularVelocity: PhysicsModelController.vectorToTuple(angularVelocity),
            });
        }
        return rigidBodies;
    }

    private static applyBulletRigidBodies(
        physicsModel: ClassicPhysicsModelLike | BulletPhysicsModelLike,
        snapshot: WebmPhysicsModelSnapshot,
    ): boolean {
        const bulletModel = physicsModel as BulletPhysicsModelLike;
        const bundle = bulletModel._bundle;
        const indexMap = bulletModel._rigidBodyIndexMap;
        if (!bundle || !indexMap) return false;

        const transform = Matrix.Identity();
        const linearVelocity = Vector3.Zero();
        const angularVelocity = Vector3.Zero();
        let restoredCount = 0;
        for (let rigidBodyIndex = 0; rigidBodyIndex < snapshot.rigidBodies.length; rigidBodyIndex += 1) {
            const bodySnapshot = snapshot.rigidBodies[rigidBodyIndex];
            const mappedIndex = indexMap[rigidBodyIndex];
            if (!bodySnapshot || !Number.isInteger(mappedIndex) || mappedIndex < 0 || mappedIndex >= bundle.count) {
                continue;
            }

            Matrix.FromArrayToRef(bodySnapshot.transformMatrix, 0, transform);
            if (typeof bundle.setDynamicTransformMatrix === "function") {
                bundle.setDynamicTransformMatrix(mappedIndex, transform, true);
            } else {
                bundle.setTransformMatrix?.(mappedIndex, transform);
            }
            bundle.setTransformMatrix?.(mappedIndex, transform);
            PhysicsModelController.tupleToVector(bodySnapshot.linearVelocity, linearVelocity);
            PhysicsModelController.tupleToVector(bodySnapshot.angularVelocity, angularVelocity);
            bundle.setLinearVelocity?.(mappedIndex, linearVelocity, true);
            bundle.setAngularVelocity?.(mappedIndex, angularVelocity, true);
            restoredCount += 1;
        }
        if (bundle.needToCommit === true) {
            bundle.commitToWasm?.();
        }
        bundle.updateBufferedMotionStates?.(true);
        return restoredCount > 0;
    }

    private static applyClassicRigidBodies(
        physicsModel: ClassicPhysicsModelLike | BulletPhysicsModelLike,
        snapshot: WebmPhysicsModelSnapshot,
    ): boolean {
        const classicModel = physicsModel as ClassicPhysicsModelLike;
        const nodes = classicModel._nodes;
        const bodies = classicModel._bodies;
        if (!Array.isArray(nodes) || !Array.isArray(bodies)) return false;

        const transform = Matrix.Identity();
        const scaling = Vector3.One();
        const rotation = Quaternion.Identity();
        const position = Vector3.Zero();
        const linearVelocity = Vector3.Zero();
        const angularVelocity = Vector3.Zero();
        let restoredCount = 0;
        for (let rigidBodyIndex = 0; rigidBodyIndex < snapshot.rigidBodies.length; rigidBodyIndex += 1) {
            const bodySnapshot = snapshot.rigidBodies[rigidBodyIndex];
            const node = nodes[rigidBodyIndex] ?? null;
            const body = bodies[rigidBodyIndex] ?? node?.physicsBody ?? null;
            if (!bodySnapshot || !node || !body) {
                continue;
            }

            Matrix.FromArrayToRef(bodySnapshot.transformMatrix, 0, transform);
            transform.decompose(scaling, rotation, position);
            node.scaling?.copyFrom(scaling);
            if (node.rotationQuaternion) {
                node.rotationQuaternion.copyFrom(rotation);
            } else {
                node.rotationQuaternion = rotation.clone();
            }
            node.position?.copyFrom(position);
            body.setTargetTransform?.(position, rotation);
            PhysicsModelController.tupleToVector(bodySnapshot.linearVelocity, linearVelocity);
            PhysicsModelController.tupleToVector(bodySnapshot.angularVelocity, angularVelocity);
            body.setLinearVelocity?.(linearVelocity);
            body.setAngularVelocity?.(angularVelocity);
            restoredCount += 1;
        }
        return restoredCount > 0;
    }

    private static vectorToTuple(value: PhysicsVectorLike): [number, number, number] {
        return [value.x, value.y, value.z];
    }

    private static tupleToVector(value: [number, number, number], target: Vector3): Vector3 {
        target.set(value[0], value[1], value[2]);
        return target;
    }

    public static beforeAndAfterPhysics(model: PhysicsRuntimeModel): void {
        const modelInternal = model as unknown as {
            beforePhysics?: (frameTime: number | null) => void;
            afterPhysics?: () => void;
        };
        modelInternal.beforePhysics?.(null);
        modelInternal.afterPhysics?.();
    }

    public static collectMeshesForCpuMorphSync(model: PhysicsRuntimeModel): readonly Mesh[] {
        const metadataMeshes = (model.mesh.metadata as { meshes?: readonly Mesh[] } | null)?.meshes;
        return Array.isArray(metadataMeshes)
            ? metadataMeshes
            : ([model.mesh, ...model.mesh.getChildMeshes()] as Mesh[]);
    }
}
