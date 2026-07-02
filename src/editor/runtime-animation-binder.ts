import type { Scene } from "@babylonjs/core/scene";
import type { MmdAnimation } from "babylon-mmd/esm/Loader/Animation/mmdAnimation";
import type { MmdAnimationBase } from "babylon-mmd/esm/Loader/Animation/mmdAnimationBase";
import { MmdWasmAnimation } from "babylon-mmd/esm/Runtime/Optimized/Animation/mmdWasmAnimation";
import type { IMmdWasmInstance } from "babylon-mmd/esm/Runtime/Optimized/mmdWasmInstance";
import type { MmdRuntimeAnimationHandle } from "babylon-mmd/esm/Runtime/mmdRuntimeAnimationHandle";

type RuntimeBindableAnimation = MmdAnimation | MmdAnimationBase;

export type RuntimeAnimationBinderModel = {
    runtimeAnimations: ReadonlyMap<MmdRuntimeAnimationHandle, unknown>;
    destroyRuntimeAnimation: (handle: MmdRuntimeAnimationHandle) => boolean;
    createRuntimeAnimation: (
        animation: RuntimeBindableAnimation,
        retargetingMap?: Record<string, string>,
    ) => MmdRuntimeAnimationHandle;
    setRuntimeAnimation: (handle: MmdRuntimeAnimationHandle) => void;
};

export type RuntimeAnimationBinderRuntime = {
    seekAnimation: (frameTime: number, forceEvaluate?: boolean) => void | Promise<void>;
};

export type RuntimeAnimationBinderHost = {
    runtimeMode: "classic" | "wasm";
    scene: Scene;
    mmdWasmInstance: IMmdWasmInstance | null;
    mmdRuntime: RuntimeAnimationBinderRuntime;
    createWasmAnimation?: (animation: MmdAnimation) => RuntimeBindableAnimation;
};

export function bindModelAnimationToRuntime(
    host: RuntimeAnimationBinderHost,
    model: RuntimeAnimationBinderModel,
    animation: MmdAnimation,
    frame: number,
    retargetingMap?: Record<string, string>,
): MmdRuntimeAnimationHandle {
    for (const handle of Array.from(model.runtimeAnimations.keys())) {
        model.destroyRuntimeAnimation(handle);
    }

    const bindableAnimation = createRuntimeBindableAnimation(host, animation);
    const handle = model.createRuntimeAnimation(bindableAnimation, retargetingMap);
    model.setRuntimeAnimation(handle);
    void host.mmdRuntime.seekAnimation(Math.max(0, Math.floor(frame)), true);
    return handle;
}

function createRuntimeBindableAnimation(host: RuntimeAnimationBinderHost, animation: MmdAnimation): RuntimeBindableAnimation {
    if (host.runtimeMode === "wasm" && host.mmdWasmInstance) {
        return host.createWasmAnimation?.(animation)
            ?? new MmdWasmAnimation(animation, host.mmdWasmInstance, host.scene);
    }
    return animation;
}
