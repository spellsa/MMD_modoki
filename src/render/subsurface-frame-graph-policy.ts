export type SubSurfaceFrameGraphPolicy = {
    sceneColorUseCameraPostProcesses: boolean;
    configurationNeedsImageProcessing: boolean;
};

/**
 * Babylon's PrePassRenderer automatically appends the scene-wide SSS post
 * process to every enabled prepass target. Image processing is owned by the
 * application's selected Classic / Frame Graph output path, so the SSS
 * configuration must not add its own full-screen image-processing pass.
 */
export function resolveSubSurfaceFrameGraphPolicy(
    frameGraphSceneColorTargetActive: boolean,
): SubSurfaceFrameGraphPolicy {
    void frameGraphSceneColorTargetActive;
    return {
        sceneColorUseCameraPostProcesses: false,
        configurationNeedsImageProcessing: false,
    };
}
