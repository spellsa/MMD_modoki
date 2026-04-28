import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MmdRuntime } from "babylon-mmd/esm/Runtime/mmdRuntime";
import { MmdWasmRuntime } from "babylon-mmd/esm/Runtime/Optimized/mmdWasmRuntime";
import type { MmdModel } from "babylon-mmd/esm/Runtime/mmdModel";
import type { MmdWasmModel } from "babylon-mmd/esm/Runtime/Optimized/mmdWasmModel";

export type PhysicsRuntimeModel = MmdModel | MmdWasmModel;
export type PhysicsMmdRuntime = MmdRuntime | MmdWasmRuntime;

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
