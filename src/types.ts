export interface ElectronAPI {
    openFileDialog: (filters: { name: string; extensions: string[] }[]) => Promise<string | null>;
    openDirectoryDialog: () => Promise<string | null>;
    saveWebmDialog: (defaultFileName?: string) => Promise<string | null>;
    snapMainWindowContentAspect: (aspectRatio: number) => Promise<boolean>;
    getPathForDroppedFile: (file: File) => string | null;
    readBinaryFile: (filePath: string) => Promise<Buffer | null>;
    readTextFile: (filePath: string) => Promise<string | null>;
    getFileInfo: (filePath: string) => Promise<{ name: string; path: string; size: number; extension: string } | null>;
    findNearbyFile: (baseDirectoryPath: string, targetPath: string) => Promise<string | null>;
    saveTextFile: (
        content: string,
        defaultFileName?: string,
        filters?: { name: string; extensions: string[] }[],
    ) => Promise<string | null>;
    listBundledWgslFiles: () => Promise<{ name: string; path: string }[]>;
    writeTextFileToPath: (filePath: string, content: string) => Promise<boolean>;
    savePngFile: (dataUrl: string, defaultFileName?: string) => Promise<string | null>;
    savePngFileToPath: (dataUrl: string, directoryPath: string, fileName: string) => Promise<string | null>;
    savePngRgbaFileToPath: (
        rgbaData: Uint8Array,
        width: number,
        height: number,
        directoryPath: string,
        fileName: string,
    ) => Promise<string | null>;
    saveWebmFileToPath: (bytes: Uint8Array, filePath: string) => Promise<string | null>;
    beginWebmStreamSave: (filePath: string) => Promise<{ saveId: string; filePath: string } | null>;
    writeWebmStreamChunk: (saveId: string, bytes: Uint8Array, position: number) => Promise<boolean>;
    finishWebmStreamSave: (saveId: string) => Promise<string | null>;
    cancelWebmStreamSave: (saveId: string) => Promise<boolean>;
    startPngSequenceExportWindow: (
        request: PngSequenceExportRequest,
    ) => Promise<PngSequenceExportLaunchResult | null>;
    takePngSequenceExportJob: (jobId: string) => Promise<PngSequenceExportRequest | null>;
    reportPngSequenceExportProgress: (progress: PngSequenceExportProgress) => void;
    onPngSequenceExportState: (callback: (state: PngSequenceExportState) => void) => () => void;
    onPngSequenceExportProgress: (callback: (progress: PngSequenceExportProgress) => void) => () => void;
    startWebmExportWindow: (
        request: WebmExportRequest,
    ) => Promise<WebmExportLaunchResult | null>;
    takeWebmExportJob: (jobId: string) => Promise<WebmExportRequest | null>;
    finishWebmExportJob: (jobId: string) => Promise<boolean>;
    reportWebmExportProgress: (progress: WebmExportProgress) => void;
    onWebmExportState: (callback: (state: WebmExportState) => void) => () => void;
    onWebmExportProgress: (callback: (progress: WebmExportProgress) => void) => () => void;
    logDebug: (scope: AppLogScope, message: string, data?: AppLogData) => void;
    logInfo: (scope: AppLogScope, message: string, data?: AppLogData) => void;
    logWarn: (scope: AppLogScope, message: string, data?: AppLogData) => void;
    logError: (scope: AppLogScope, message: string, data?: AppLogData) => void;
    reportSmokeRendererReady: (payload: SmokeRendererReadyPayload) => void;
    reportSmokeRendererFailure: (payload: SmokeRendererFailurePayload) => void;
    getLogFileInfo: () => Promise<AppLogFileInfo>;
    openLogFolder: () => Promise<boolean>;
}

export type UiLocale = "ja" | "en" | "zh-Hant" | "zh-Hans" | "ko";

export type AppLogLevel = "debug" | "info" | "warn" | "error";

export type AppLogScope =
    | "main"
    | "ipc"
    | "renderer"
    | "asset"
    | "camera-vmd"
    | "timeline"
    | "webm"
    | "physics"
    | "shader"
    | "project"
    | "ui";

export type AppLogData = Record<string, unknown>;

export interface SmokeRendererReadyPayload {
    engine: string;
    physicsBackend: string;
}

export interface SmokeRendererFailurePayload {
    message: string;
    details?: AppLogData;
}

export interface AppLogFileInfo {
    path: string;
    directoryPath: string;
    fileName: string;
    level: AppLogLevel | "off";
    sessionId: string;
    appName: "MMD_modoki";
    isDev: boolean;
    maxSizeBytes: number;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
        mmdI18n?: {
            getLocale: () => UiLocale;
            setLocale: (
                locale: UiLocale,
                options?: {
                    persist?: boolean;
                    applyToDom?: boolean;
                    root?: ParentNode;
                    emitEvent?: boolean;
                },
            ) => void;
            apply: (root?: ParentNode) => void;
        };
    }
}

export interface ModelInfo {
    name: string;
    path: string;
    vertexCount: number;
    boneCount: number;
    boneNames: string[];
    boneControlInfos?: BoneControlInfo[];
    morphCount: number;
    morphNames: string[];
    morphDisplayFrames: MorphDisplayFrameInfo[];
}

export interface BoneControlInfo {
    name: string;
    movable: boolean;
    rotatable: boolean;
    isIk?: boolean;
    isIkAffected?: boolean;
}

export interface MorphDisplayItemInfo {
    index: number;
    name: string;
}

export interface MorphDisplayFrameInfo {
    name: string;
    morphs: MorphDisplayItemInfo[];
}

export interface MotionInfo {
    name: string;
    path: string;
    frameCount: number;
}

/** Track category for timeline row ordering */
export type TrackCategory = 'root' | 'camera' | 'semi-standard' | 'bone' | 'morph';

/** A single row in the keyframe timeline */
export interface KeyframeTrack {
    /** Bone or morph name */
    name: string;
    /** Row ordering category */
    category: TrackCategory;
    /** Frame numbers that have keyframes (sorted ascending) */
    frames: Uint32Array;
}

export interface TimelineRotationOverlay {
    trackName: string;
    trackCategory: TrackCategory;
    frames: Uint32Array;
    x: Float32Array;
    y: Float32Array;
    z: Float32Array;
    maxAbsValue: number;
}

export interface InterpolationCurve {
    x1: number;
    x2: number;
    y1: number;
    y2: number;
}

export interface InterpolationChannelPreview {
    id: string;
    label: string;
    curve: InterpolationCurve;
    available: boolean;
}

export type InterpolationPreviewSource =
    | "none"
    | "bone-movable"
    | "bone-rotation-only"
    | "camera"
    | "morph";

export interface TimelineInterpolationPreview {
    source: InterpolationPreviewSource;
    frame: number;
    hasKeyframe: boolean;
    hasCurveData: boolean;
    channels: InterpolationChannelPreview[];
}

export interface AppState {
    modelLoaded: boolean;
    motionLoaded: boolean;
    isPlaying: boolean;
    currentFrame: number;
    totalFrames: number;
    modelInfo: ModelInfo | null;
    motionInfo: MotionInfo | null;
}

export interface ProjectMotionImport {
    type: "vmd" | "vpd";
    path: string;
    frame?: number;
}

export interface ProjectModelMaterialShaderState {
    materialKey: string;
    presetId: string;
}

export interface ProjectModelState {
    path: string;
    visible: boolean;
    motionImports: ProjectMotionImport[];
    materialShaders?: ProjectModelMaterialShaderState[];
    animation?: ProjectSerializedModelAnimation | null;
}

export interface ProjectCameraState {
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    fov: number;
    distance: number;
}

export interface ProjectRgbColor {
    r: number;
    g: number;
    b: number;
}

export interface ProjectLightingState {
    x: number;
    y: number;
    z: number;
    intensity: number;
    ambientIntensity: number;
    temperatureKelvin: number;
    lightColor?: ProjectRgbColor;
    lightFlatStrength?: number;
    lightFlatColorInfluence?: number;
    shadowColor?: ProjectRgbColor;
    toonShadowInfluence?: number;
    shadowEnabled: boolean;
    shadowDarkness: number;
    shadowFrustumSize?: number;
    shadowMaxZ?: number;
    shadowBias?: number;
    shadowNormalBias?: number;
    shadowEdgeSoftness?: number;
    selfShadowEdgeSoftness?: number;
    occlusionShadowEdgeSoftness?: number;
}

export interface ProjectViewportState {
    groundVisible: boolean;
    skydomeVisible: boolean;
    antialiasEnabled: boolean;
    backgroundImagePath?: string | null;
    backgroundVideoPath?: string | null;
}

export interface ProjectPhysicsState {
    enabled: boolean;
    simulationRateHz?: number;
    gravityAcceleration: number;
    gravityDirection: { x: number; y: number; z: number };
}

export interface ProjectEffectState {
    dofEnabled: boolean;
    dofFocusDistanceMm: number;
    dofFocusOffsetMm?: number;
    dofTargetModelPath?: string | null;
    dofTargetBoneName?: string | null;
    dofBlurLevel?: number;
    dofFStop: number;
    dofNearSuppressionScale?: number;
    dofLensSize: number;
    dofFocalLength?: number;
    dofFocalLengthDistanceInverted?: boolean;
    dofLensBlurStrength: number;
    dofLensEdgeBlur: number;
    dofLensDistortion?: number;
    dofLensDistortionInfluence: number;
    modelEdgeWidth: number;
    contrast?: number;
    gamma: number;
    exposure?: number;
    toneMappingEnabled?: boolean;
    toneMappingType?: number;
    ditheringEnabled?: boolean;
    ditheringIntensity?: number;
    vignetteEnabled?: boolean;
    vignetteWeight?: number;
    bloomEnabled?: boolean;
    bloomWeight?: number;
    bloomThreshold?: number;
    bloomKernel?: number;
    chromaticAberration?: number;
    grainIntensity?: number;
    sharpenEdge?: number;
    ssaoEnabled?: boolean;
    ssaoStrength?: number;
    ssaoRadius?: number;
    ssaoFadeEnd?: number;
    ssaoDebugView?: boolean;
    colorCurvesEnabled?: boolean;
    colorCurvesHue?: number;
    colorCurvesDensity?: number;
    colorCurvesSaturation?: number;
    colorCurvesExposure?: number;
    glowEnabled?: boolean;
    glowIntensity?: number;
    glowKernel?: number;
    lutEnabled?: boolean;
    lutIntensity?: number;
    lutPreset?: string;
    lutSourceMode?: "builtin" | "external-absolute" | "project-relative";
    lutExternalPath?: string | null;
    wgslToonShaderPath?: string | null;
    motionBlurEnabled?: boolean;
    motionBlurStrength?: number;
    motionBlurSamples?: number;
    ssrEnabled?: boolean;
    ssrStrength?: number;
    ssrStep?: number;
    vlsEnabled?: boolean;
    vlsExposure?: number;
    vlsDecay?: number;
    vlsWeight?: number;
    vlsDensity?: number;
    fogEnabled?: boolean;
    fogMode?: number;
    fogStart?: number;
    fogEnd?: number;
    fogDensity?: number;
    fogOpacity?: number;
    fogColor?: ProjectRgbColor;
    gammaEncodingVersion?: 2;
}

export interface ProjectOutputState {
    aspectPreset: string;
    sizePreset: string;
    width: number;
    height: number;
    lockAspect: boolean;
    qualityScale: number;
    fps?: number;
    includeAudio?: boolean;
    webmCodec?: "auto" | "vp8" | "vp9";
    usePlaybackRange?: boolean;
    startFrame?: number;
    endFrame?: number;
    frameStartEnabled?: boolean;
    frameStopEnabled?: boolean;
}

export interface ProjectAccessoryState {
    path: string;
    visible: boolean;
    transform?: {
        position: { x: number; y: number; z: number };
        rotationDeg: { x: number; y: number; z: number };
        scale: number;
    };
    parentModelPath?: string | null;
    parentBoneName?: string | null;
}

export interface ProjectSerializedAccessoryTransformTrack {
    frameNumbers: ProjectNumberArray;
    positions: ProjectNumberArray;
    rotations: ProjectNumberArray;
    scales: ProjectNumberArray;
}

export interface ProjectSerializedBoneTrack {
    name: string;
    frameNumbers: ProjectNumberArray;
    rotations: ProjectNumberArray;
    rotationInterpolations: ProjectNumberArray;
    physicsToggles: ProjectNumberArray;
}

export interface ProjectSerializedMovableBoneTrack {
    name: string;
    frameNumbers: ProjectNumberArray;
    positions: ProjectNumberArray;
    positionInterpolations: ProjectNumberArray;
    rotations: ProjectNumberArray;
    rotationInterpolations: ProjectNumberArray;
    physicsToggles: ProjectNumberArray;
}

export interface ProjectSerializedMorphTrack {
    name: string;
    frameNumbers: ProjectNumberArray;
    weights: ProjectNumberArray;
}

export interface ProjectSerializedPropertyTrack {
    frameNumbers: ProjectNumberArray;
    visibles: ProjectNumberArray;
    ikBoneNames: string[];
    ikStates: ProjectNumberArray[];
}

export interface ProjectSerializedCameraTrack {
    frameNumbers: ProjectNumberArray;
    positions: ProjectNumberArray;
    positionInterpolations: ProjectNumberArray;
    rotations: ProjectNumberArray;
    rotationInterpolations: ProjectNumberArray;
    distances: ProjectNumberArray;
    distanceInterpolations: ProjectNumberArray;
    fovs: ProjectNumberArray;
    fovInterpolations: ProjectNumberArray;
}

export interface ProjectPackedArray {
    encoding: "u8-b64" | "f32-b64" | "u32-delta-varint-b64";
    length: number;
    data: string;
}

export type ProjectNumberArray = number[] | ProjectPackedArray;

export interface ProjectSerializedModelAnimation {
    name: string;
    boneTracks: ProjectSerializedBoneTrack[];
    movableBoneTracks: ProjectSerializedMovableBoneTrack[];
    morphTracks: ProjectSerializedMorphTrack[];
    propertyTrack: ProjectSerializedPropertyTrack;
}

export interface ProjectKeyframeModelAnimation {
    modelPath: string;
    animation: ProjectSerializedModelAnimation | null;
}

export interface ProjectKeyframeBundle {
    modelAnimations: ProjectKeyframeModelAnimation[];
    cameraAnimation: ProjectSerializedCameraTrack | null;
    accessoryTransformAnimations?: Array<ProjectSerializedAccessoryTransformTrack | null>;
}

export interface MmdModokiProjectFileV1 {
    format: "mmd_modoki_project";
    version: 1;
    savedAt: string;
    scene: {
        models: ProjectModelState[];
        activeModelPath: string | null;
        timelineTarget: "model" | "camera";
        currentFrame: number;
        playbackSpeed: number;
    };
    assets: {
        cameraVmdPath: string | null;
        audioPath: string | null;
        cameraAnimation?: ProjectSerializedCameraTrack | null;
    };
    camera: ProjectCameraState;
    lighting: ProjectLightingState;
    viewport: ProjectViewportState;
    physics: ProjectPhysicsState;
    effects: ProjectEffectState;
    output?: ProjectOutputState;
    accessories?: ProjectAccessoryState[];
    keyframes?: ProjectKeyframeBundle;
}

export interface PngSequenceExportRequest {
    project: MmdModokiProjectFileV1;
    outputDirectoryPath: string;
    startFrame: number;
    endFrame: number;
    step: number;
    prefix: string;
    fps: number;
    precision: number;
    outputWidth: number;
    outputHeight: number;
}

export interface PngSequenceExportLaunchResult {
    jobId: string;
}

export interface PngSequenceExportState {
    active: boolean;
    activeCount: number;
}

export interface PngSequenceExportProgress {
    jobId: string;
    saved: number;
    captured: number;
    total: number;
    frame: number;
    startFrame?: number;
    endFrame?: number;
}

export interface WebmExportRequest {
    project: MmdModokiProjectFileV1;
    outputFilePath: string;
    startFrame: number;
    endFrame: number;
    fps: number;
    outputWidth: number;
    outputHeight: number;
    includeAudio?: boolean;
    audioFilePath?: string | null;
    preferredVideoCodec?: "auto" | "vp8" | "vp9";
}

export interface WebmExportLaunchResult {
    jobId: string;
}

export interface WebmExportState {
    active: boolean;
    activeCount: number;
}

export type WebmExportPhase =
    | "initializing"
    | "loading-project"
    | "checking-codec"
    | "opening-output"
    | "encoding"
    | "closing-track"
    | "finalizing"
    | "finishing-job"
    | "completed"
    | "failed";

export interface WebmExportProgress {
    jobId: string;
    phase: WebmExportPhase;
    encoded: number;
    total: number;
    frame: number;
    startFrame?: number;
    endFrame?: number;
    captured?: number;
    message?: string;
    timestampMs: number;
}
