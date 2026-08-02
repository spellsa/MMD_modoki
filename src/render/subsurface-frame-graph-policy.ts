export type SubSurfaceFrameGraphPolicy = {
    sceneColorUseCameraPostProcesses: boolean;
    configurationNeedsImageProcessing: boolean;
    sceneColorPrePassActivationPassRequired: boolean;
    compositionUsesLocalGamma: boolean;
};

export type SubSurfaceDebugVisualization =
    | "off"
    | "sample-count"
    | "scattering-delta"
    | "irradiance-split";

export function buildSubSurfaceCompositionDefines(
    usesLocalGamma: boolean,
    debugVisualization: SubSurfaceDebugVisualization,
): string | null {
    const defines: string[] = [];
    if (usesLocalGamma) {
        defines.push("#define MMD_MODOKI_SSS_LOCAL_GAMMA");
    }
    if (debugVisualization === "sample-count") {
        // Babylon's stock SSS shader renders green when sampleCount < 1 and
        // blue-to-red as the active sample count approaches its budget.
        defines.push("#define DEBUG_SSS_SAMPLES");
    }
    if (debugVisualization === "scattering-delta") {
        defines.push("#define MMD_MODOKI_SSS_DEBUG_SCATTERING_DELTA");
    }
    if (debugVisualization === "irradiance-split") {
        defines.push("#define MMD_MODOKI_SSS_DEBUG_IRRADIANCE_SPLIT");
    }
    return defines.length > 0 ? defines.join("\n") : null;
}

/**
 * Babylon's PrePassRenderer appends the scene-wide SSS post process to every
 * enabled prepass target. Babylon.js 9.x does not automatically enable a user
 * RTT's target when only a material requests PrePass, so MmdManager separately
 * attaches a pass-through activation post-process while Frame Graph SSS is in
 * use. Image processing remains owned by the application's selected Classic /
 * Frame Graph output path and must not be duplicated by the SSS configuration.
 */
export function resolveSubSurfaceFrameGraphPolicy(
    frameGraphSceneColorTargetActive: boolean,
    screenSpaceScatteringActive: boolean,
    frameGraphBackendActive: boolean,
    classicImageProcessingActive: boolean,
): SubSurfaceFrameGraphPolicy {
    return {
        sceneColorUseCameraPostProcesses: false,
        configurationNeedsImageProcessing: false,
        sceneColorPrePassActivationPassRequired:
            frameGraphSceneColorTargetActive && screenSpaceScatteringActive,
        // Frame Graph currently imports display-space scene color. Classic can
        // leave SSS linear only when its own ImageProcessing post-process is
        // active; otherwise the SSS-only pixels need a local gamma conversion.
        compositionUsesLocalGamma: screenSpaceScatteringActive
            && (frameGraphBackendActive || !classicImageProcessingActive),
    };
}
