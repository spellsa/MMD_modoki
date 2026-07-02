import { describe, expect, it } from "vitest";
import { Scene } from "@babylonjs/core/scene";
import { MmdAnimation } from "babylon-mmd/esm/Loader/Animation/mmdAnimation";
import { MmdCameraAnimationTrack, MmdPropertyAnimationTrack } from "babylon-mmd/esm/Loader/Animation/mmdAnimationTrack";
import type { MmdRuntimeAnimationHandle } from "babylon-mmd/esm/Runtime/mmdRuntimeAnimationHandle";

import {
    bindModelAnimationToRuntime,
    type RuntimeAnimationBinderHost,
    type RuntimeAnimationBinderModel,
} from "../../src/editor/runtime-animation-binder";

function createAnimation(): MmdAnimation {
    return new MmdAnimation(
        "manual",
        [],
        [],
        [],
        new MmdPropertyAnimationTrack(0, []),
        new MmdCameraAnimationTrack(0),
    );
}

function createHandle(value: number): MmdRuntimeAnimationHandle {
    return value as MmdRuntimeAnimationHandle;
}

function createHost(): RuntimeAnimationBinderHost {
    return {
        runtimeMode: "classic",
        scene: {} as Scene,
        mmdWasmInstance: null,
        mmdRuntime: {
            seekAnimation: () => undefined,
        },
    };
}

describe("bindModelAnimationToRuntime", () => {
    it("destroys stale handles and binds a fresh animation handle", () => {
        const destroyed: MmdRuntimeAnimationHandle[] = [];
        const model: RuntimeAnimationBinderModel = {
            runtimeAnimations: new Map([[createHandle(1), {}], [createHandle(2), {}]]),
            destroyRuntimeAnimation: (handle) => {
                destroyed.push(handle);
                return true;
            },
            createRuntimeAnimation: () => createHandle(3),
            setRuntimeAnimation: (handle) => {
                expect(handle).toBe(createHandle(3));
            },
        };

        const handle = bindModelAnimationToRuntime(createHost(), model, createAnimation(), 12.8);

        expect(handle).toBe(createHandle(3));
        expect(destroyed).toEqual([createHandle(1), createHandle(2)]);
    });

    it("seeks the runtime to the normalized current frame", () => {
        const seeks: Array<{ frame: number; forceEvaluate?: boolean }> = [];
        const host = createHost();
        host.mmdRuntime = {
            seekAnimation: (frame, forceEvaluate) => {
                seeks.push({ frame, forceEvaluate });
            },
        };
        const model: RuntimeAnimationBinderModel = {
            runtimeAnimations: new Map(),
            destroyRuntimeAnimation: () => true,
            createRuntimeAnimation: () => createHandle(4),
            setRuntimeAnimation: () => undefined,
        };

        bindModelAnimationToRuntime(host, model, createAnimation(), 8.9);

        expect(seeks).toEqual([{ frame: 8, forceEvaluate: true }]);
    });

    it("passes retargeting map to runtime animation creation", () => {
        const retargetingMap = { "linked-bone": "runtime-bone" };
        const received: Array<Record<string, string> | undefined> = [];
        const model: RuntimeAnimationBinderModel = {
            runtimeAnimations: new Map(),
            destroyRuntimeAnimation: () => true,
            createRuntimeAnimation: (_animation, map) => {
                received.push(map);
                return createHandle(5);
            },
            setRuntimeAnimation: () => undefined,
        };

        bindModelAnimationToRuntime(createHost(), model, createAnimation(), 0, retargetingMap);

        expect(received).toEqual([retargetingMap]);
    });
});
