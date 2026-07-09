import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MmdRuntime } from "babylon-mmd/esm/Runtime/mmdRuntime";
import { MmdWasmRuntime } from "babylon-mmd/esm/Runtime/Optimized/mmdWasmRuntime";
import type { MmdModel } from "babylon-mmd/esm/Runtime/mmdModel";
import type { MmdWasmModel } from "babylon-mmd/esm/Runtime/Optimized/mmdWasmModel";
import { logDebugIfEnabled } from "../app-logger";
import type { WebmPhysicsModelSnapshot, WebmPhysicsRigidBodySnapshot } from "../types";

const MMD_CONSTRAINT_SOLVER_PARAMETER_VALUE = 0.25;
const MMD_CONSTRAINT_AXIS_COUNT = 6;
const MMD_CONSTRAINT_PARAMETER_IDS = [
    1, // ConstraintERP
    2, // ConstraintStopERP
    3, // ConstraintCFM
    4, // ConstraintStopCFM
] as const;

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
    _constraints?: Array<PhysicsConstraintParamContainerLike | null>;
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
    _constraints?: Array<PhysicsConstraintParamTargetLike | null>;
    _rigidBodyIndexMap?: Int32Array | number[];
    commitBodyStates?: (states: Uint8Array) => void;
    syncBones?: () => void;
};

type PhysicsModelInternal = {
    _physicsModel?: ClassicPhysicsModelLike | BulletPhysicsModelLike | null;
};

type PhysicsConstraintParamTargetLike = {
    setParam?: (num: number, value: number, axis: number) => void;
};

type PhysicsConstraintParamContainerLike = PhysicsConstraintParamTargetLike & {
    physicsJoint?: PhysicsConstraintParamTargetLike | null;
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

export type PhysicsRigidBodyDiagnosticEntry = {
    name: string;
    boneIndex: number;
    shapeType: number;
    physicsMode: number;
};

export type PhysicsModelControllerOptions = {
    getRuntime: () => PhysicsMmdRuntime;
    getPhysicsEnabled: () => boolean;
    isSimulationActive: () => boolean;
    getPhysicsBackendLabel: () => string;
    getPhysicsEvaluationTypeLabel: () => string;
    syncCpuSkinnedMorphSourceBuffers: (model: PhysicsRuntimeModel) => void;
    addRuntimeDiagnostic: (message: string) => void;
};

export class PhysicsModelController {
    private readonly getRuntime: () => PhysicsMmdRuntime;
    private readonly getPhysicsEnabled: () => boolean;
    private readonly isSimulationActive: () => boolean;
    private readonly getPhysicsBackendLabel: () => string;
    private readonly getPhysicsEvaluationTypeLabel: () => string;
    private readonly syncCpuSkinnedMorphSourceBuffers: (model: PhysicsRuntimeModel) => void;
    private readonly addRuntimeDiagnostic: (message: string) => void;
    private readonly afterPhysicsPatchedModels = new WeakSet<object>();
    private readonly solverParameterConfiguredPhysicsModels = new WeakSet<object>();

    constructor(options: PhysicsModelControllerOptions) {
        this.getRuntime = options.getRuntime;
        this.getPhysicsEnabled = options.getPhysicsEnabled;
        this.isSimulationActive = options.isSimulationActive;
        this.getPhysicsBackendLabel = options.getPhysicsBackendLabel;
        this.getPhysicsEvaluationTypeLabel = options.getPhysicsEvaluationTypeLabel;
        this.syncCpuSkinnedMorphSourceBuffers = options.syncCpuSkinnedMorphSourceBuffers;
        this.addRuntimeDiagnostic = options.addRuntimeDiagnostic;
    }

    public applyPhysicsStateToModel(model: PhysicsRuntimeModel): void {
        if (model.rigidBodyStates.length === 0) return;

        const shouldSimulatePhysics = this.getPhysicsEnabled() && this.isSimulationActive();
        model.rigidBodyStates.fill(shouldSimulatePhysics ? 1 : 0);
        if (shouldSimulatePhysics) {
            this.getRuntime().initializeMmdModelPhysics(model as never);
            this.applyMmdConstraintSolverParameters(model);
        }
    }

    public applyMmdConstraintSolverParameters(model: PhysicsRuntimeModel): void {
        const physicsModel = (model as unknown as PhysicsModelInternal)._physicsModel;
        if (!physicsModel || typeof physicsModel !== "object") return;

        const physicsModelObject = physicsModel as object;
        if (this.solverParameterConfiguredPhysicsModels.has(physicsModelObject)) return;

        const targets = PhysicsModelController.collectConstraintParamTargets(physicsModel);
        if (targets.length === 0) return;

        let appliedCount = 0;
        for (const target of targets) {
            if (PhysicsModelController.applyMmdConstraintSolverParametersToTarget(target)) {
                appliedCount += 1;
            }
        }

        if (appliedCount === 0) return;

        this.solverParameterConfiguredPhysicsModels.add(physicsModelObject);
        logDebugIfEnabled("physics", "physics", "MMD constraint solver parameters applied", {
            backend: this.getPhysicsBackendLabel(),
            evaluationType: this.getPhysicsEvaluationTypeLabel(),
            constraintCount: appliedCount,
            value: MMD_CONSTRAINT_SOLVER_PARAMETER_VALUE,
            params: ["ERP", "StopERP", "CFM", "StopCFM"],
            axisCount: MMD_CONSTRAINT_AXIS_COUNT,
        });
    }

    public logPhysicsStateApplication(
        model: PhysicsRuntimeModel,
        modelName: string,
        rigidBodies: readonly PhysicsRigidBodyDiagnosticEntry[],
        reason: string,
    ): void {
        if (model.rigidBodyStates.length === 0) return;

        const stateCounts = PhysicsModelController.countRigidBodyStates(model.rigidBodyStates);
        logDebugIfEnabled("physics", "physics", "physics state applied to model", {
            reason,
            modelName,
            rigidBodyCount: model.rigidBodyStates.length,
            stateOnCount: stateCounts.on,
            stateOffCount: stateCounts.off,
            physicsEnabled: this.getPhysicsEnabled(),
            simulationActive: this.isSimulationActive(),
            backend: this.getPhysicsBackendLabel(),
            evaluationType: this.getPhysicsEvaluationTypeLabel(),
            hasPhysicsModel: PhysicsModelController.hasPhysicsModel(model, model.rigidBodyStates.length),
            rigidBodyModes: PhysicsModelController.countRigidBodyModes(rigidBodies),
            diagnosticRigidBodies: PhysicsModelController.pickDiagnosticRigidBodies(rigidBodies),
        });
    }

    public logModelPhysicsMetadata(
        model: PhysicsRuntimeModel,
        modelName: string,
        rigidBodies: readonly PhysicsRigidBodyDiagnosticEntry[],
        reason: string,
    ): void {
        if (rigidBodies.length === 0 && model.rigidBodyStates.length === 0) return;

        logDebugIfEnabled("physics", "physics", "model physics metadata", {
            reason,
            modelName,
            rigidBodyCount: rigidBodies.length,
            runtimeRigidBodyStateCount: model.rigidBodyStates.length,
            backend: this.getPhysicsBackendLabel(),
            evaluationType: this.getPhysicsEvaluationTypeLabel(),
            hasPhysicsModel: PhysicsModelController.hasPhysicsModel(model, model.rigidBodyStates.length),
            rigidBodyModes: PhysicsModelController.countRigidBodyModes(rigidBodies),
            shapeTypes: PhysicsModelController.countRigidBodyShapeTypes(rigidBodies),
            diagnosticRigidBodies: PhysicsModelController.pickDiagnosticRigidBodies(rigidBodies),
        });
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

    private static collectConstraintParamTargets(
        physicsModel: ClassicPhysicsModelLike | BulletPhysicsModelLike,
    ): PhysicsConstraintParamTargetLike[] {
        const targets: PhysicsConstraintParamTargetLike[] = [];

        const constraints = physicsModel._constraints;
        if (Array.isArray(constraints)) {
            for (const constraint of constraints) {
                PhysicsModelController.appendConstraintParamTarget(targets, constraint);
            }
        }

        return targets;
    }

    private static appendConstraintParamTarget(
        targets: PhysicsConstraintParamTargetLike[],
        constraint: PhysicsConstraintParamContainerLike | null | undefined,
    ): void {
        if (!constraint) return;
        if (typeof constraint.setParam === "function") {
            targets.push(constraint);
            return;
        }
        if (constraint.physicsJoint && typeof constraint.physicsJoint.setParam === "function") {
            targets.push(constraint.physicsJoint);
        }
    }

    private static applyMmdConstraintSolverParametersToTarget(target: PhysicsConstraintParamTargetLike): boolean {
        if (typeof target.setParam !== "function") return false;

        for (let axis = 0; axis < MMD_CONSTRAINT_AXIS_COUNT; axis += 1) {
            for (const paramId of MMD_CONSTRAINT_PARAMETER_IDS) {
                target.setParam(paramId, MMD_CONSTRAINT_SOLVER_PARAMETER_VALUE, axis);
            }
        }
        return true;
    }

    private static countRigidBodyStates(states: Uint8Array): { on: number; off: number } {
        let on = 0;
        let off = 0;
        for (const state of states) {
            if (state) on += 1;
            else off += 1;
        }
        return { on, off };
    }

    private static countRigidBodyModes(
        rigidBodies: readonly PhysicsRigidBodyDiagnosticEntry[],
    ): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const rigidBody of rigidBodies) {
            const key = String(rigidBody.physicsMode);
            counts[key] = (counts[key] ?? 0) + 1;
        }
        return counts;
    }

    private static countRigidBodyShapeTypes(
        rigidBodies: readonly PhysicsRigidBodyDiagnosticEntry[],
    ): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const rigidBody of rigidBodies) {
            const key = String(rigidBody.shapeType);
            counts[key] = (counts[key] ?? 0) + 1;
        }
        return counts;
    }

    private static pickDiagnosticRigidBodies(
        rigidBodies: readonly PhysicsRigidBodyDiagnosticEntry[],
    ): Array<{ index: number; name: string; boneIndex: number; physicsMode: number; shapeType: number; category: string }> {
        const picked: Array<{
            index: number;
            name: string;
            boneIndex: number;
            physicsMode: number;
            shapeType: number;
            category: string;
        }> = [];
        for (let index = 0; index < rigidBodies.length; index += 1) {
            const rigidBody = rigidBodies[index];
            const category = PhysicsModelController.classifyRigidBodyName(rigidBody.name);
            if (category === "other" && picked.length >= 12) continue;
            if (category !== "other" || picked.length < 6) {
                picked.push({
                    index,
                    name: rigidBody.name,
                    boneIndex: rigidBody.boneIndex,
                    physicsMode: rigidBody.physicsMode,
                    shapeType: rigidBody.shapeType,
                    category,
                });
            }
            if (picked.length >= 24) break;
        }
        return picked;
    }

    private static classifyRigidBodyName(name: string): string {
        const normalized = name.toLowerCase();
        if (/髪|前髪|後髪|横髪|毛|hair|bang|tail|braid|pony/.test(normalized)) return "hair";
        if (/スカート|袖|裾|布|cloth|skirt|sleeve|ribbon/.test(normalized)) return "cloth";
        if (/胸|乳|breast/.test(normalized)) return "soft-body";
        return "other";
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
