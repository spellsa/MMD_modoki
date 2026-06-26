import { describe, expect, it } from "vitest";

import { getPhysicsOffBoneNamesAtFrame } from "../../src/editor/physics-bone-visibility";

function createAnimation(
    tracks: Array<{ name: string; frames: number[]; toggles: number[] }>,
): {
    boneTracks: Array<{ name: string; frameNumbers: Uint32Array; physicsToggles: Uint8Array }>;
    movableBoneTracks: Array<{ name: string; frameNumbers: Uint32Array; physicsToggles: Uint8Array }>;
} {
    return {
        boneTracks: tracks.map((track) => ({
            name: track.name,
            frameNumbers: new Uint32Array(track.frames),
            physicsToggles: new Uint8Array(track.toggles),
        })),
        movableBoneTracks: [],
    };
}

describe("physics bone viewport visibility", () => {
    it("shows a physics bone while the latest physics toggle key is OFF", () => {
        const animation = createAnimation([
            { name: "skirt_0_0", frames: [0, 20], toggles: [0, 1] },
        ]);

        expect([...getPhysicsOffBoneNamesAtFrame(animation, ["skirt_0_0"], 0)]).toEqual(["skirt_0_0"]);
        expect([...getPhysicsOffBoneNamesAtFrame(animation, ["skirt_0_0"], 10)]).toEqual(["skirt_0_0"]);
        expect([...getPhysicsOffBoneNamesAtFrame(animation, ["skirt_0_0"], 20)]).toEqual([]);
    });

    it("keeps physics bones hidden when they have no explicit OFF key", () => {
        const animation = createAnimation([
            { name: "skirt_0_0", frames: [15], toggles: [1] },
        ]);

        expect([...getPhysicsOffBoneNamesAtFrame(animation, ["skirt_0_0"], 0)]).toEqual([]);
        expect([...getPhysicsOffBoneNamesAtFrame(animation, ["skirt_0_0"], 30)]).toEqual([]);
    });

    it("prefers OFF when bone and movable tracks contain the same frame", () => {
        const animation = {
            boneTracks: [{
                name: "skirt_0_0",
                frameNumbers: new Uint32Array([12]),
                physicsToggles: new Uint8Array([1]),
            }],
            movableBoneTracks: [{
                name: "skirt_0_0",
                frameNumbers: new Uint32Array([12]),
                physicsToggles: new Uint8Array([0]),
            }],
        };

        expect([...getPhysicsOffBoneNamesAtFrame(animation, ["skirt_0_0"], 12)]).toEqual(["skirt_0_0"]);
    });
});
