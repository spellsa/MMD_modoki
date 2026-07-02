type PhysicsToggleTrack = {
    name: string;
    frameNumbers: ArrayLike<number>;
    physicsToggles: ArrayLike<number>;
};

type PhysicsToggleAnimation = {
    boneTracks: readonly PhysicsToggleTrack[];
    movableBoneTracks: readonly PhysicsToggleTrack[];
};

type PhysicsToggleSample = {
    frame: number;
    toggle: 0 | 1;
};

function normalizeFrame(frame: number): number {
    return Number.isFinite(frame) && frame > 0 ? Math.floor(frame) : 0;
}

function normalizePhysicsToggle(value: number | undefined): 0 | 1 {
    return value === 0 ? 0 : 1;
}

function sampleTrackPhysicsToggle(track: PhysicsToggleTrack | undefined, frame: number): PhysicsToggleSample | null {
    if (!track) return null;

    const normalizedFrame = normalizeFrame(frame);
    const length = Math.min(track.frameNumbers.length, track.physicsToggles.length);
    let sample: PhysicsToggleSample | null = null;
    for (let i = 0; i < length; i += 1) {
        const keyFrame = normalizeFrame(track.frameNumbers[i] ?? 0);
        if (keyFrame > normalizedFrame) continue;
        const toggle = normalizePhysicsToggle(track.physicsToggles[i]);
        if (!sample || keyFrame > sample.frame || (keyFrame === sample.frame && toggle === 0)) {
            sample = { frame: keyFrame, toggle };
        }
    }
    return sample;
}

export function getPhysicsOffBoneNamesAtFrame(
    animation: PhysicsToggleAnimation | null | undefined,
    physicsBoneNames: readonly string[] | null | undefined,
    frame: number,
): Set<string> {
    const result = new Set<string>();
    if (!animation || !physicsBoneNames || physicsBoneNames.length === 0) return result;

    const physicsBoneNameSet = new Set(physicsBoneNames);
    for (const boneName of physicsBoneNameSet) {
        const boneSample = sampleTrackPhysicsToggle(
            animation.boneTracks.find((track) => track.name === boneName),
            frame,
        );
        const movableBoneSample = sampleTrackPhysicsToggle(
            animation.movableBoneTracks.find((track) => track.name === boneName),
            frame,
        );
        const sample = !boneSample
            ? movableBoneSample
            : !movableBoneSample || boneSample.frame > movableBoneSample.frame
                ? boneSample
                : movableBoneSample.frame > boneSample.frame
                    ? movableBoneSample
                    : boneSample.toggle === 0 || movableBoneSample.toggle === 0
                        ? { frame: boneSample.frame, toggle: 0 as const }
                        : boneSample;

        if (sample?.toggle === 0) {
            result.add(boneName);
        }
    }

    return result;
}
