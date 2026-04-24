import type { MmdManager } from "./mmd-manager";
import type { Timeline } from "./timeline";
import type { BottomPanel } from "./bottom-panel";
import { applyI18nToDom, getLocale, setLocale, t } from "./i18n";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type {
    InterpolationChannelPreview,
    InterpolationCurve,
    KeyframeTrack,
    MmdModokiProjectFileV1,
    ModelInfo,
    MotionInfo,
    ProjectLightingState,
    ProjectOutputState,
    TimelineRotationOverlay,
    UiLocale,
    TrackCategory,
    TimelineInterpolationPreview,
} from "./types";
import { AccessoryPanelController } from "./ui/accessory-panel-controller";
import { BloomToneMapController } from "./ui/bloom-tone-map-controller";
import { CameraPanelController } from "./ui/camera-panel-controller";
import { ColorPostFxController } from "./ui/color-postfx-controller";
import { DofPanelController } from "./ui/dof-panel-controller";
import { ExperimentalPostFxController } from "./ui/experimental-postfx-controller";
import { ExportUiController } from "./ui/export-ui-controller";
import { FogPanelController } from "./ui/fog-panel-controller";
import { LayoutUiController } from "./ui/layout-ui-controller";
import { LensEffectController } from "./ui/lens-effect-controller";
import { LutPanelController } from "./ui/lut-panel-controller";
import { ModelInfoPanelController, MODEL_INFO_CAMERA_SELECT_VALUE, type ModelInfoSelectState } from "./ui/model-info-panel-controller";
import { ModelEdgeController } from "./ui/model-edge-controller";
import { RuntimeFeatureUiController } from "./ui/runtime-feature-ui-controller";
import { SceneEnvironmentUiController } from "./ui/scene-environment-ui-controller";
import { ShaderPanelController } from "./ui/shader-panel-controller";

type SectionKeyframeButtonState = "none" | "dirty" | "registered";
type SectionKeyframeSection = "info" | "interpolation" | "bone" | "morph" | "accessory";
type NumericArrayLike = ArrayLike<number> | null | undefined;
type SelectedBonePoseSnapshot = {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    target?: { x: number; y: number; z: number };
    distance?: number;
    fov?: number;
};

type RuntimeMovableBoneTrackLike = {
    name: string;
    frameNumbers: ArrayLike<number>;
    positions: ArrayLike<number>;
    positionInterpolations: ArrayLike<number>;
    rotations: ArrayLike<number>;
    rotationInterpolations: ArrayLike<number>;
    physicsToggles: ArrayLike<number>;
};

type RuntimeBoneTrackLike = {
    name: string;
    frameNumbers: ArrayLike<number>;
    rotations: ArrayLike<number>;
    rotationInterpolations: ArrayLike<number>;
    physicsToggles: ArrayLike<number>;
};

type RuntimeCameraTrackLike = {
    frameNumbers: ArrayLike<number>;
    positions: ArrayLike<number>;
    positionInterpolations: ArrayLike<number>;
    rotations: ArrayLike<number>;
    rotationInterpolations: ArrayLike<number>;
    distances: ArrayLike<number>;
    distanceInterpolations: ArrayLike<number>;
    fovs: ArrayLike<number>;
    fovInterpolations: ArrayLike<number>;
};

type RuntimeMovableBoneTrackMutable = {
    frameNumbers: Uint32Array;
    positions: Float32Array;
    positionInterpolations: Uint8Array;
    rotations: Float32Array;
    rotationInterpolations: Uint8Array;
    physicsToggles: Uint8Array;
};

type RuntimeBoneTrackMutable = {
    frameNumbers: Uint32Array;
    rotations: Float32Array;
    rotationInterpolations: Uint8Array;
    physicsToggles: Uint8Array;
};

type RuntimeCameraTrackMutable = {
    frameNumbers: Uint32Array;
    positions: Float32Array;
    positionInterpolations: Uint8Array;
    rotations: Float32Array;
    rotationInterpolations: Uint8Array;
    distances: Float32Array;
    distanceInterpolations: Uint8Array;
    fovs: Float32Array;
    fovInterpolations: Uint8Array;
};

type RuntimeModelAnimationLike = {
    movableBoneTracks: readonly RuntimeMovableBoneTrackLike[];
    boneTracks: readonly RuntimeBoneTrackLike[];
};

type RuntimeCameraAnimationLike = {
    cameraTrack: RuntimeCameraTrackLike;
};

type RuntimeAnimatableLike = {
    createRuntimeAnimation: (animation: unknown) => unknown;
    setRuntimeAnimation: (handle: unknown) => void;
};

type RuntimeCameraLike = RuntimeAnimatableLike & {
    destroyRuntimeAnimation: (handle: unknown) => void;
};

type NumericWritableArray = {
    length: number;
    [index: number]: number;
};

type InterpolationChannelBinding = {
    values: NumericWritableArray;
    offset: number;
};

type InterpolationDragState = {
    channelId: string;
    pointIndex: 1 | 2;
    changed: boolean;
    dirtyMarked: boolean;
};

type InterpolationCurveClipboard = {
    curves: InterpolationCurve[];
    sourceChannelCount: number;
};

type MmdManagerInternalView = {
    currentModel: (object & RuntimeAnimatableLike) | null;
    modelSourceAnimationsByModel: WeakMap<object, RuntimeModelAnimationLike>;
    cameraSourceAnimation: RuntimeCameraAnimationLike | null;
    mmdCamera: RuntimeCameraLike;
    cameraAnimationHandle: unknown | null;
};

export class UIController {
    private static readonly DEBUG_KEYFRAME_FLOW = false;
    private static readonly INTERP_CURVE_VIEWBOX_WIDTH = 120;
    private static readonly INTERP_CURVE_VIEWBOX_HEIGHT = 120;
    private static readonly TIMELINE_WAVEFORM_FPS = 30;
    private mmdManager: MmdManager;
    private timeline: Timeline;
    private bottomPanel: BottomPanel;

    // Button elements
    private btnLoadFile: HTMLElement;
    private btnSaveProject: HTMLElement;
    private btnLoadProject: HTMLElement;
    private btnExportPng: HTMLElement;
    private btnExportPngSeq: HTMLElement | null = null;
    private btnExportWebm: HTMLElement | null = null;
    private toolbarLocaleSelect: HTMLSelectElement | null = null;
    private btnPlay: HTMLElement;
    private btnPause: HTMLElement;
    private btnStop: HTMLElement | null;
    private btnSkipStart: HTMLElement;
    private btnSkipEnd: HTMLElement;
    private currentFrameEl: HTMLInputElement;
    private totalFramesEl: HTMLElement;
    private statusText: HTMLElement;
    private statusDot: HTMLElement;
    private viewportOverlay: HTMLElement;
    private btnKeyframeAdd: HTMLButtonElement;
    private btnKeyframeDelete: HTMLButtonElement;
    private btnKeyframeNudgeLeft: HTMLButtonElement;
    private btnKeyframeNudgeRight: HTMLButtonElement;
    private btnFrameStepLeft: HTMLButtonElement;
    private btnFrameStepRight: HTMLButtonElement;
    private btnFrameRangeStart: HTMLButtonElement;
    private btnFrameRangeEnd: HTMLButtonElement;
    private timelineSelectionLabel: HTMLElement | null;
    private interpolationTrackNameLabel: HTMLElement;
    private interpolationFrameLabel: HTMLElement;
    private interpolationTypeSelect: HTMLSelectElement;
    private interpolationStatusLabel: HTMLElement;
    private interpolationCurveList: HTMLElement;
    private btnInterpolationCopy: HTMLButtonElement | null = null;
    private btnInterpolationPaste: HTMLButtonElement | null = null;
    private btnInterpolationLinear: HTMLButtonElement | null = null;
    private shaderModelSelect: HTMLSelectElement | null = null;
    private shaderPresetSelect: HTMLSelectElement | null = null;
    private shaderApplySelectedButton: HTMLButtonElement | null = null;
    private shaderApplyAllButton: HTMLButtonElement | null = null;
    private shaderResetButton: HTMLButtonElement | null = null;
    private shaderPanelNote: HTMLElement | null = null;
    private shaderMaterialList: HTMLElement | null = null;
    private btnInfoKeyframe: HTMLButtonElement | null = null;
    private btnInterpolationKeyframe: HTMLButtonElement | null = null;
    private btnBoneKeyframe: HTMLButtonElement | null = null;
    private btnMorphKeyframe: HTMLButtonElement | null = null;
    private btnAccessoryKeyframe: HTMLButtonElement | null = null;
    private shortcutEdgeWidthRestore = 1;
    private readonly rangeNumberInputs = new WeakMap<HTMLInputElement, HTMLInputElement>();
    private syncingBoneSelection = false;
    private selectedBoneTrackCategory: TrackCategory | null = null;
    private readonly sectionKeyframeDirtyKeys: Record<SectionKeyframeSection, Set<string>> = {
        info: new Set<string>(),
        interpolation: new Set<string>(),
        bone: new Set<string>(),
        morph: new Set<string>(),
        accessory: new Set<string>(),
    };
    private readonly pendingBonePoseSnapshots = new Map<string, { frame: number; snapshot: SelectedBonePoseSnapshot }>();
    private readonly interpolationChannelBindings = new Map<string, InterpolationChannelBinding>();
    private interpolationDragState: InterpolationDragState | null = null;
    private currentInterpolationPreview: TimelineInterpolationPreview | null = null;
    private interpolationCurveClipboard: InterpolationCurveClipboard | null = null;
    private timelineWaveformRequestId = 0;
    private lastObservedFrame: number | null = null;
    private accessoryPanelController: AccessoryPanelController | null = null;
    private bloomToneMapController: BloomToneMapController | null = null;
    private cameraPanelController: CameraPanelController | null = null;
    private colorPostFxController: ColorPostFxController | null = null;
    private dofPanelController: DofPanelController | null = null;
    private experimentalPostFxController: ExperimentalPostFxController | null = null;
    private exportUiController: ExportUiController | null = null;
    private fogPanelController: FogPanelController | null = null;
    private layoutUiController: LayoutUiController | null = null;
    private lensEffectController: LensEffectController | null = null;
    private lutPanelController: LutPanelController | null = null;
    private modelEdgeController: ModelEdgeController | null = null;
    private modelInfoPanelController: ModelInfoPanelController | null = null;
    private runtimeFeatureUiController: RuntimeFeatureUiController | null = null;
    private sceneEnvironmentUiController: SceneEnvironmentUiController | null = null;
    private shaderPanelController: ShaderPanelController | null = null;
    private postFxWgslToonPath: string | null = null;
    private postFxWgslToonText: string | null = null;
    private currentProjectFilePath: string | null = null;
    private readonly onLocaleChanged = (): void => {
        this.applyLocalizedUiState();
        this.dofPanelController?.refreshFocusTargetControls();
        this.refreshShaderPanel();
    };

    private debugKeyframeFlow(message: string, payload?: unknown): void {
        if (!UIController.DEBUG_KEYFRAME_FLOW) return;
        if (payload === undefined) {
            console.info(`[KeyframeFlow] ${message}`);
            return;
        }
        console.info(`[KeyframeFlow] ${message}`, payload);
    }

    constructor(mmdManager: MmdManager, timeline: Timeline, bottomPanel: BottomPanel) {
        this.mmdManager = mmdManager;
        this.timeline = timeline;
        this.bottomPanel = bottomPanel;
        this.bottomPanel.onRangeInputsRendered = (root) => this.installRangeNumberInputs(root);
        this.bottomPanel.onRangeSliderSynced = (slider) => this.syncRangeNumberInput(slider);

        // Get DOM elements
        this.btnLoadFile = document.getElementById("btn-load-file")!;
        this.btnSaveProject = document.getElementById("btn-save-project")!;
        this.btnLoadProject = document.getElementById("btn-load-project")!;
        this.btnExportPng = document.getElementById("btn-export-png")!;
        this.btnExportPngSeq = document.getElementById("btn-export-png-seq");
        this.btnExportWebm = document.getElementById("btn-export-webm");
        this.toolbarLocaleSelect = document.getElementById("toolbar-locale-select") as HTMLSelectElement | null;
        this.btnPlay = document.getElementById("btn-play")!;
        this.btnPause = document.getElementById("btn-pause")!;
        this.btnStop = document.getElementById("btn-stop");
        this.btnSkipStart = document.getElementById("btn-skip-start")!;
        this.btnSkipEnd = document.getElementById("btn-skip-end")!;
        this.currentFrameEl = document.getElementById("current-frame") as HTMLInputElement;
        this.totalFramesEl = document.getElementById("total-frames")!;
        this.statusText = document.getElementById("status-text")!;
        this.statusDot = document.querySelector(".status-dot")!;
        this.viewportOverlay = document.getElementById("viewport-overlay")!;
        this.btnKeyframeAdd = document.getElementById("btn-kf-add") as HTMLButtonElement;
        this.btnKeyframeDelete = document.getElementById("btn-kf-delete") as HTMLButtonElement;
        this.btnKeyframeNudgeLeft = document.getElementById("btn-kf-nudge-left") as HTMLButtonElement;
        this.btnKeyframeNudgeRight = document.getElementById("btn-kf-nudge-right") as HTMLButtonElement;
        this.btnFrameStepLeft = document.getElementById("btn-frame-step-left") as HTMLButtonElement;
        this.btnFrameStepRight = document.getElementById("btn-frame-step-right") as HTMLButtonElement;
        this.btnFrameRangeStart = document.getElementById("btn-frame-range-start") as HTMLButtonElement;
        this.btnFrameRangeEnd = document.getElementById("btn-frame-range-end") as HTMLButtonElement;
        this.timelineSelectionLabel = document.getElementById("timeline-selection-label");
        this.interpolationTrackNameLabel = document.getElementById("interp-track-name")!;
        this.interpolationFrameLabel = document.getElementById("interp-frame")!;
        this.interpolationTypeSelect = document.getElementById("interp-type") as HTMLSelectElement;
        this.interpolationStatusLabel = document.getElementById("interp-status")!;
        this.interpolationCurveList = document.getElementById("interp-curve-list")!;
        this.btnInterpolationCopy = document.getElementById("btn-interp-copy") as HTMLButtonElement | null;
        this.btnInterpolationPaste = document.getElementById("btn-interp-paste") as HTMLButtonElement | null;
        this.btnInterpolationLinear = document.getElementById("btn-interp-linear") as HTMLButtonElement | null;
        this.shaderModelSelect = document.getElementById("shader-model-select") as HTMLSelectElement | null;
        this.shaderPresetSelect = document.getElementById("shader-preset-select") as HTMLSelectElement | null;
        this.shaderApplySelectedButton = document.getElementById("btn-shader-apply-selected") as HTMLButtonElement | null;
        this.shaderApplyAllButton = document.getElementById("btn-shader-apply-all") as HTMLButtonElement | null;
        this.shaderResetButton = document.getElementById("btn-shader-reset") as HTMLButtonElement | null;
        this.shaderPanelNote = document.getElementById("shader-panel-note");
        this.shaderMaterialList = document.getElementById("shader-material-list");

        this.modelEdgeController = new ModelEdgeController({
            mmdManager: this.mmdManager,
            syncRangeNumberInput: (slider) => this.syncRangeNumberInput(slider),
        });
        this.lensEffectController = new LensEffectController({
            mmdManager: this.mmdManager,
            syncRangeNumberInput: (slider) => this.syncRangeNumberInput(slider),
            isRangeInputEditing: (slider) => this.isRangeInputEditing(slider),
        });
        this.fogPanelController = new FogPanelController({
            mmdManager: this.mmdManager,
            syncRangeNumberInput: (slider) => this.syncRangeNumberInput(slider),
            normalizeRangeInputValue: (slider, value) => this.normalizeRangeInputValue(slider, value),
            formatRangeInputValue: (slider, value) => this.formatRangeInputValue(slider, value),
        });
        this.modelInfoPanelController = new ModelInfoPanelController({
            mmdManager: this.mmdManager,
            showToast: (message, type) => this.showToast(message, type),
            onTargetSelected: (value, showToast) => this.handleModelTargetSelection(value, showToast),
            onModelVisibilityChanged: () => {
                this.markSectionKeyframeDirty("info", this.getInfoKeyframeContextKey());
                this.runtimeFeatureUiController?.refreshRigidBodies();
                this.updateSectionKeyframeButtons();
            },
            onModelDeleted: (hasRemainingModels) => {
                if (!hasRemainingModels) {
                    this.mmdManager.setTimelineTarget("camera");
                    this.applyCameraSelectionUI();
                } else {
                    this.applyActiveModelSelectionUI();
                }
                this.refreshModelSelector();
                this.refreshShaderPanel();
            },
        });
        this.cameraPanelController = new CameraPanelController({
            mmdManager: this.mmdManager,
            syncRangeNumberInput: (slider) => this.syncRangeNumberInput(slider),
            normalizeRangeInputValue: (slider, value) => this.normalizeRangeInputValue(slider, value),
            formatRangeInputValue: (slider, value) => this.formatRangeInputValue(slider, value),
            isRangeInputEditing: (slider) => this.isRangeInputEditing(slider),
            onCameraEdited: () => this.handleCameraControlEdited(),
        });
        this.setupEventListeners();
        this.setupCallbacks();
        this.setupKeyboard();
        this.setupFileDrop();
        this.exportUiController = new ExportUiController({
            mmdManager: this.mmdManager,
            buildProjectState: () => this.buildProjectStateForPersistence(),
            setStatus: (text, loading) => this.setStatus(text, loading),
            showToast: (message, type) => this.showToast(message, type),
            isPlaybackActive: () => this.mmdManager.isPlaying,
            onPausePlayback: () => this.pause(false),
            getViewportSize: () => ({
                width: document.getElementById("viewport-container")?.clientWidth ?? 0,
                height: document.getElementById("viewport-container")?.clientHeight ?? 0,
            }),
            onOutputAspectChanged: () => {
                this.layoutUiController?.applyViewportAspectPresentation();
                this.layoutUiController?.syncMainWindowPresentationAspect();
            },
        });
        this.layoutUiController = new LayoutUiController({
            mmdManager: this.mmdManager,
            exportUiController: this.exportUiController,
            showToast: (message, type) => this.showToast(message, type),
        });
        this.sceneEnvironmentUiController = new SceneEnvironmentUiController({
            mmdManager: this.mmdManager,
            setStatus: (text, loading) => this.setStatus(text, loading),
            showToast: (message, type) => this.showToast(message, type),
        });
        this.runtimeFeatureUiController = new RuntimeFeatureUiController({
            mmdManager: this.mmdManager,
            showToast: (message, type) => this.showToast(message, type),
        });
        this.accessoryPanelController = new AccessoryPanelController({
            mmdManager: this.mmdManager,
            showToast: (message, type) => this.showToast(message, type),
            syncRangeNumberInput: (slider) => this.syncRangeNumberInput(slider),
            onAccessoryTransformChanged: (accessoryIndex) => {
                this.markSectionKeyframeDirty("accessory", this.getAccessoryKeyframeContextKey(accessoryIndex));
                this.updateSectionKeyframeButtons();
            },
            onSelectionChanged: () => this.updateSectionKeyframeButtons(),
        });
        this.colorPostFxController = new ColorPostFxController({
            mmdManager: this.mmdManager,
        });
        this.bloomToneMapController = new BloomToneMapController({
            mmdManager: this.mmdManager,
        });
        this.experimentalPostFxController = new ExperimentalPostFxController({
            mmdManager: this.mmdManager,
        });
        this.dofPanelController = new DofPanelController({
            mmdManager: this.mmdManager,
            syncRangeNumberInput: (slider) => this.syncRangeNumberInput(slider),
            isRangeInputEditing: (slider) => this.isRangeInputEditing(slider),
        });
        this.lutPanelController = new LutPanelController({
            mmdManager: this.mmdManager,
            getBaseNameForRenderer: (filePath) => this.getBaseNameForRenderer(filePath),
            setStatus: (text, loading) => this.setStatus(text, loading),
            showToast: (message, type) => this.showToast(message, type),
            refreshShaderPanel: () => this.refreshShaderPanel(),
        });
        this.shaderPanelController = new ShaderPanelController({
            mmdManager: this.mmdManager,
            getInfoModelSelectState: () => this.getInfoModelSelectState(),
            onModelTargetSelected: (value, showToast) => this.handleModelTargetSelection(value, showToast),
            renderCameraPostEffectsPanel: () => this.renderShaderCameraPostEffectsPanel(),
            restoreCameraDofControlsToCameraPanel: () => this.dofPanelController?.restoreControlsToCameraPanel(),
            getBaseNameForRenderer: (filePath) => this.getBaseNameForRenderer(filePath),
            showToast: (message, type) => this.showToast(message, type),
            onExternalWgslToonChanged: (path, text) => {
                this.postFxWgslToonPath = path;
                this.postFxWgslToonText = text;
            },
        });
        this.setupPerfDisplay();
        this.showStartupRenderingDiagnostics();
        this.refreshModelSelector();
        this.accessoryPanelController?.refresh();
        this.sceneEnvironmentUiController?.refresh();
        this.runtimeFeatureUiController?.refresh();
        this.updateInfoActionButtons();
        this.refreshShaderPanel();
        this.installRangeNumberInputs();
        void this.shaderPanelController.reloadBundledWgslShaderFiles();
        this.updateTimelineEditState();
        this.timeline.setWaveformPeaks(null);
        this.shortcutEdgeWidthRestore = Math.max(0.01, this.mmdManager.modelEdgeWidth || 1);
        this.applyLocalizedUiState();
        document.addEventListener("app:locale-changed", this.onLocaleChanged as EventListener);

        window.addEventListener("beforeunload", (event) => {
            if (this.hasBackgroundExportActive()) {
                event.preventDefault();
                event.returnValue = "";
                return;
            }
            this.exportUiController?.dispose();
            this.layoutUiController?.dispose();
            document.removeEventListener("app:locale-changed", this.onLocaleChanged as EventListener);
        });
    }

    private setupEventListeners(): void {
        // File loading
        this.btnLoadFile.addEventListener("click", () => {
            void this.loadFileFromDialog();
        });
        this.btnSaveProject.addEventListener("click", () => this.saveProject(true));
        this.btnLoadProject.addEventListener("click", () => this.loadProject());
        this.btnExportPng.addEventListener("click", () => {
            void this.exportUiController?.exportPNG();
        });
        this.btnExportPngSeq?.addEventListener("click", () => {
            void this.exportUiController?.exportPNGSequence();
        });
        this.btnExportWebm?.addEventListener("click", () => {
            void this.exportUiController?.exportWebm();
        });
        this.interpolationTypeSelect.addEventListener("change", () => this.updateTimelineEditState());
        this.btnInterpolationCopy?.addEventListener("click", () => this.copyInterpolationCurves());
        this.btnInterpolationPaste?.addEventListener("click", () => this.pasteInterpolationCurves());
        this.btnInterpolationLinear?.addEventListener("click", () => this.resetInterpolationCurvesToLinear());
        this.toolbarLocaleSelect?.addEventListener("change", () => {
            const nextLocale = this.getSelectedToolbarLocale();
            if (!nextLocale || nextLocale === getLocale()) {
                this.syncToolbarLocaleSelect();
                return;
            }
            setLocale(nextLocale);
        });
        // Playback
        this.btnPlay.addEventListener("click", () => this.play());
        this.btnPause.addEventListener("click", () => this.pause());
        this.btnStop?.addEventListener("click", () => this.stop());
        this.btnSkipStart.addEventListener("click", () => {
            const { startFrame } = this.getPlaybackFrameRange();
            this.mmdManager.seekToBoundary(startFrame);
        });
        this.btnSkipEnd.addEventListener("click", () => {
            const { endFrame } = this.getPlaybackFrameRange();
            this.mmdManager.seekToBoundary(endFrame);
        });
        this.currentFrameEl.addEventListener("focus", () => {
            this.currentFrameEl.select();
        });
        this.currentFrameEl.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                this.commitCurrentFrameInput();
                this.currentFrameEl.blur();
                return;
            }
            if (event.key === "Escape") {
                event.preventDefault();
                this.currentFrameEl.value = String(this.mmdManager.currentFrame);
                this.currentFrameEl.blur();
            }
        });
        this.currentFrameEl.addEventListener("blur", () => {
            this.commitCurrentFrameInput();
        });

        this.btnInfoKeyframe = document.getElementById("btn-info-keyframe") as HTMLButtonElement | null;
        this.btnInterpolationKeyframe = document.getElementById("btn-interpolation-keyframe") as HTMLButtonElement | null;
        this.btnBoneKeyframe = document.getElementById("btn-bone-keyframe") as HTMLButtonElement | null;
        this.btnMorphKeyframe = document.getElementById("btn-morph-keyframe") as HTMLButtonElement | null;
        this.btnAccessoryKeyframe = document.getElementById("btn-accessory-keyframe") as HTMLButtonElement | null;
        this.btnInfoKeyframe?.addEventListener("click", () => this.registerInfoKeyframe());
        this.btnInterpolationKeyframe?.addEventListener("click", () => this.addKeyframeAtCurrentFrame());
        this.btnBoneKeyframe?.addEventListener("click", () => this.registerBoneKeyframeAtCurrentFrame());
        this.btnMorphKeyframe?.addEventListener("click", () => this.registerMorphKeyframesAtCurrentFrame());
        this.btnAccessoryKeyframe?.addEventListener("click", () => this.registerAccessoryTransformKeyframe());

        // Timeline seek
        this.timeline.onSeek = (frame) => {
            this.mmdManager.seekToBoundary(frame);
            this.updateSectionKeyframeButtons();
        };
        this.timeline.onSelectionChanged = (track) => {
            this.syncBoneVisualizerSelection(track);
            this.syncBottomBoneSelectionFromTimeline(track);
            this.refreshSelectedTrackRotationOverlay();
            this.updateTimelineEditState();
            this.updateSectionKeyframeButtons();
        };
        this.bottomPanel.onBoneSelectionChanged = (boneName) => {
            this.syncTimelineBoneSelectionFromBottomPanel(boneName);
            this.updateSectionKeyframeButtons();
        };
        this.bottomPanel.onMorphFrameSelectionChanged = () => {
            this.updateSectionKeyframeButtons();
        };
        this.bottomPanel.onBoneTransformEdited = (boneName) => {
            this.rememberEditedBonePoseSnapshot(boneName, this.bottomPanel.getSelectedBoneTransformSnapshot());
            this.markSectionKeyframeDirty("bone", this.getBoneKeyframeContextKey(boneName));
            this.syncBottomPanelBoneFromEditedPose(boneName);
            this.refreshCameraUiFromRuntime();
            this.updateSectionKeyframeButtons();
        };
        this.mmdManager.onBoneTransformEdited = (boneName) => {
            this.rememberEditedBonePoseSnapshot(boneName, this.mmdManager.getBoneTransform(boneName));
            this.markSectionKeyframeDirty("bone", this.getBoneKeyframeContextKey(boneName));
            this.syncBottomPanelBoneFromEditedPose(boneName);
            this.refreshCameraUiFromRuntime();
            this.updateSectionKeyframeButtons();
        };
        this.mmdManager.onCameraTransformEdited = () => {
            const cameraSelected = this.bottomPanel.getSelectedBone() === "Camera"
                || this.mmdManager.getTimelineTarget() === "camera";
            if (cameraSelected) {
                this.rememberEditedBonePoseSnapshot("Camera", this.captureCurrentBonePoseSnapshot("Camera"));
                this.markSectionKeyframeDirty("bone", this.getBoneKeyframeContextKey("Camera"));
                this.syncBottomPanelBoneFromEditedPose("Camera");
            }
            this.refreshCameraUiFromRuntime();
            this.updateSectionKeyframeButtons();
        };
        this.bottomPanel.onMorphValueEdited = (frameIndex) => {
            this.markSectionKeyframeDirty("morph", this.getMorphKeyframeContextKey(frameIndex));
            this.updateSectionKeyframeButtons();
        };

        this.btnKeyframeAdd.addEventListener("click", () => this.addKeyframeAtCurrentFrame());
        this.btnKeyframeDelete.addEventListener("click", () => this.deleteSelectedKeyframe());
        this.btnKeyframeNudgeLeft.addEventListener("click", () => this.seekToAdjacentKeyframePoint(-1));
        this.btnKeyframeNudgeRight.addEventListener("click", () => this.seekToAdjacentKeyframePoint(1));
        this.btnFrameStepLeft.addEventListener("click", () => {
            this.mmdManager.seekToBoundary(this.mmdManager.currentFrame - 1);
        });
        this.btnFrameStepRight.addEventListener("click", () => {
            this.mmdManager.seekToBoundary(this.mmdManager.currentFrame + 1);
        });
        this.btnFrameRangeStart.addEventListener("click", () => {
            this.mmdManager.seekToBoundary(0);
        });
        this.btnFrameRangeEnd.addEventListener("click", () => {
            this.mmdManager.seekToBoundary(this.mmdManager.totalFrames);
        });

        // Lighting controls
        const elLightDirectionX = document.getElementById("light-direction-x") as HTMLInputElement;
        const elLightDirectionY = document.getElementById("light-direction-y") as HTMLInputElement;
        const elLightDirectionZ = document.getElementById("light-direction-z") as HTMLInputElement;
        const elIntensity = document.getElementById("light-intensity") as HTMLInputElement;
        const elAmbient = document.getElementById("light-ambient") as HTMLInputElement;
        const elLightColorR = document.getElementById("light-color-r") as HTMLInputElement;
        const elLightColorG = document.getElementById("light-color-g") as HTMLInputElement;
        const elLightColorB = document.getElementById("light-color-b") as HTMLInputElement;
        const elLightFlatStrength = document.getElementById("light-flat-strength") as HTMLInputElement;
        const elLightFlatColorInfluence = document.getElementById("light-flat-color-influence") as HTMLInputElement;
        const elShadow = document.getElementById("light-shadow") as HTMLInputElement;
        const elShadowFrustumSize = document.getElementById("light-shadow-frustum-size") as HTMLInputElement;
        const elShadowMaxZ = document.getElementById("light-shadow-max-z") as HTMLInputElement;
        const elShadowBias = document.getElementById("light-shadow-bias") as HTMLInputElement;
        const elShadowNormalBias = document.getElementById("light-shadow-normal-bias") as HTMLInputElement;
        const elShadowColorR = document.getElementById("light-shadow-color-r") as HTMLInputElement;
        const elShadowColorG = document.getElementById("light-shadow-color-g") as HTMLInputElement;
        const elShadowColorB = document.getElementById("light-shadow-color-b") as HTMLInputElement;
        const elToonShadowInfluence = document.getElementById("light-toon-shadow-influence") as HTMLInputElement;
        const elSelfShadowSoftness = document.getElementById("light-self-shadow-softness") as HTMLInputElement;
        const elOcclusionShadowSoftness = document.getElementById("light-occlusion-shadow-softness") as HTMLInputElement;
        const elLightMode = document.getElementById("light-mode-select") as HTMLSelectElement | null;
        const valLightDirectionX = document.getElementById("light-direction-x-val")!;
        const valLightDirectionY = document.getElementById("light-direction-y-val")!;
        const valLightDirectionZ = document.getElementById("light-direction-z-val")!;
        const valInt = document.getElementById("light-intensity-val")!;
        const valAmb = document.getElementById("light-ambient-val")!;
        const valLightColorR = document.getElementById("light-color-r-val")!;
        const valLightColorG = document.getElementById("light-color-g-val")!;
        const valLightColorB = document.getElementById("light-color-b-val")!;
        const valLightFlatStrength = document.getElementById("light-flat-strength-val")!;
        const valLightFlatColorInfluence = document.getElementById("light-flat-color-influence-val")!;
        const valSh = document.getElementById("light-shadow-val")!;
        const valShadowFrustumSize = document.getElementById("light-shadow-frustum-size-val")!;
        const valShadowMaxZ = document.getElementById("light-shadow-max-z-val")!;
        const valShadowBias = document.getElementById("light-shadow-bias-val")!;
        const valShadowNormalBias = document.getElementById("light-shadow-normal-bias-val")!;
        const valShadowColorR = document.getElementById("light-shadow-color-r-val")!;
        const valShadowColorG = document.getElementById("light-shadow-color-g-val")!;
        const valShadowColorB = document.getElementById("light-shadow-color-b-val")!;
        const valToonShadowInfluence = document.getElementById("light-toon-shadow-influence-val")!;
        const valSelfShSoftness = document.getElementById("light-self-shadow-softness-val")!;
        const valOcclusionShSoftness = document.getElementById("light-occlusion-shadow-softness-val")!;
        const lightRows = Array.from(document.querySelectorAll(".light-row--light"));
        const shadowRows = Array.from(document.querySelectorAll(".light-row--shadow"));
        const elEffectColorTemp = document.getElementById("effect-color-temp") as HTMLInputElement | null;
        const valEffectColorTemp = document.getElementById("effect-color-temp-val");
        const elEffectContrast = document.getElementById("effect-contrast") as HTMLInputElement | null;
        const valEffectContrast = document.getElementById("effect-contrast-val");
        const elEffectGamma = document.getElementById("effect-gamma") as HTMLInputElement | null;
        const valEffectGamma = document.getElementById("effect-gamma-val");

        const updateDir = () => {
            const x = Number(elLightDirectionX.value);
            const y = Number(elLightDirectionY.value);
            const z = Number(elLightDirectionZ.value);
            valLightDirectionX.textContent = x.toFixed(2);
            valLightDirectionY.textContent = y.toFixed(2);
            valLightDirectionZ.textContent = z.toFixed(2);
            this.mmdManager.setLightDirection(x, y, z);
        };

        const applyLightMode = () => {
            const mode = elLightMode?.value === "shadow" ? "shadow" : "light";
            for (const row of lightRows) {
                row.classList.toggle("light-row--hidden", mode !== "light");
            }
            for (const row of shadowRows) {
                row.classList.toggle("light-row--hidden", mode !== "shadow");
            }
        };

        if (elLightMode) {
            elLightMode.value = "light";
            elLightMode.addEventListener("change", applyLightMode);
        }
        applyLightMode();

        elLightDirectionX.addEventListener("input", updateDir);
        elLightDirectionY.addEventListener("input", updateDir);
        elLightDirectionZ.addEventListener("input", updateDir);

        const initialLightDirection = this.mmdManager.getSerializedLightDirection();
        elLightDirectionX.value = this.formatRangeInputValue(elLightDirectionX, initialLightDirection.x);
        elLightDirectionY.value = this.formatRangeInputValue(elLightDirectionY, initialLightDirection.y);
        elLightDirectionZ.value = this.formatRangeInputValue(elLightDirectionZ, initialLightDirection.z);
        updateDir();

        elIntensity.addEventListener("input", () => {
            const v = Number(elIntensity.value) / 100;
            valInt.textContent = v.toFixed(1);
            this.mmdManager.lightIntensity = v;
        });
        elAmbient.addEventListener("input", () => {
            const v = Number(elAmbient.value) / 100;
            valAmb.textContent = v.toFixed(1);
            this.mmdManager.ambientIntensity = v;
        });
        const applyLightColor = () => {
            const r = Number(elLightColorR.value) / 127.5;
            const g = Number(elLightColorG.value) / 127.5;
            const b = Number(elLightColorB.value) / 127.5;
            this.mmdManager.setLightColor(r, g, b);
            valLightColorR.textContent = `${Math.round(r * 100)}%`;
            valLightColorG.textContent = `${Math.round(g * 100)}%`;
            valLightColorB.textContent = `${Math.round(b * 100)}%`;
        };
        elLightColorR.addEventListener("input", applyLightColor);
        elLightColorG.addEventListener("input", applyLightColor);
        elLightColorB.addEventListener("input", applyLightColor);
        const applyLightFlatStrength = () => {
            const v = Number(elLightFlatStrength.value) / 100;
            this.mmdManager.lightFlatStrength = v;
            valLightFlatStrength.textContent = `${Math.round(v * 100)}%`;
        };
        elLightFlatStrength.addEventListener("input", applyLightFlatStrength);
        const applyLightFlatColorInfluence = () => {
            const v = Number(elLightFlatColorInfluence.value) / 100;
            this.mmdManager.lightFlatColorInfluence = v;
            valLightFlatColorInfluence.textContent = `${Math.round(v * 100)}%`;
        };
        elLightFlatColorInfluence.addEventListener("input", applyLightFlatColorInfluence);

        // Initialize lighting sliders from runtime defaults.
        elIntensity.value = String(Math.round(this.mmdManager.lightIntensity * 100));
        valInt.textContent = this.mmdManager.lightIntensity.toFixed(1);
        elAmbient.value = String(Math.round(this.mmdManager.ambientIntensity * 100));
        valAmb.textContent = this.mmdManager.ambientIntensity.toFixed(1);
        const initialLightColor = this.mmdManager.getLightColor();
        elLightColorR.value = String(Math.round(initialLightColor.r * 127.5));
        elLightColorG.value = String(Math.round(initialLightColor.g * 127.5));
        elLightColorB.value = String(Math.round(initialLightColor.b * 127.5));
        applyLightColor();
        elLightFlatStrength.value = String(Math.round(this.mmdManager.lightFlatStrength * 100));
        applyLightFlatStrength();
        elLightFlatColorInfluence.value = String(Math.round(this.mmdManager.lightFlatColorInfluence * 100));
        applyLightFlatColorInfluence();

        elShadow.addEventListener("input", () => {
            const v = Number(elShadow.value) / 100;
            valSh.textContent = v.toFixed(2);
            this.mmdManager.shadowDarkness = v;
        });
        elShadowFrustumSize.addEventListener("input", () => {
            const v = Number(elShadowFrustumSize.value);
            valShadowFrustumSize.textContent = String(Math.round(v));
            this.mmdManager.shadowFrustumSize = v;
        });
        elShadowMaxZ.addEventListener("input", () => {
            const v = Number(elShadowMaxZ.value);
            valShadowMaxZ.textContent = String(Math.round(v));
            this.mmdManager.shadowMaxZ = v;
        });
        elShadowBias.addEventListener("input", () => {
            const v = Number(elShadowBias.value) / 1_000_000;
            valShadowBias.textContent = v.toFixed(5);
            this.mmdManager.shadowBias = v;
        });
        elShadowNormalBias.addEventListener("input", () => {
            const v = Number(elShadowNormalBias.value) / 100_000;
            valShadowNormalBias.textContent = v.toFixed(5);
            this.mmdManager.shadowNormalBias = v;
        });
        const applyShadowColor = () => {
            const r = Number(elShadowColorR.value) / 255;
            const g = Number(elShadowColorG.value) / 255;
            const b = Number(elShadowColorB.value) / 255;
            this.mmdManager.setShadowColor(r, g, b);
            valShadowColorR.textContent = String(Math.round(r * 255));
            valShadowColorG.textContent = String(Math.round(g * 255));
            valShadowColorB.textContent = String(Math.round(b * 255));
        };
        elShadowColorR.addEventListener("input", applyShadowColor);
        elShadowColorG.addEventListener("input", applyShadowColor);
        elShadowColorB.addEventListener("input", applyShadowColor);
        const applyToonShadowInfluence = () => {
            const influence = Number(elToonShadowInfluence.value) / 100;
            this.mmdManager.toonShadowInfluence = influence;
            valToonShadowInfluence.textContent = `${Math.round(influence * 100)}%`;
        };
        elToonShadowInfluence.addEventListener("input", applyToonShadowInfluence);
        elSelfShadowSoftness.addEventListener("input", () => {
            const v = Number(elSelfShadowSoftness.value) / 1000;
            valSelfShSoftness.textContent = v.toFixed(3);
            this.mmdManager.selfShadowEdgeSoftness = v;
        });
        elOcclusionShadowSoftness.addEventListener("input", () => {
            const v = Number(elOcclusionShadowSoftness.value) / 1000;
            valOcclusionShSoftness.textContent = v.toFixed(3);
            this.mmdManager.occlusionShadowEdgeSoftness = v;
        });

        elShadow.value = String(Math.round(this.mmdManager.shadowDarkness * 100));
        valSh.textContent = this.mmdManager.shadowDarkness.toFixed(2);
        elShadowFrustumSize.value = String(Math.round(this.mmdManager.shadowFrustumSize));
        valShadowFrustumSize.textContent = String(Math.round(this.mmdManager.shadowFrustumSize));
        elShadowMaxZ.value = String(Math.round(this.mmdManager.shadowMaxZ));
        valShadowMaxZ.textContent = String(Math.round(this.mmdManager.shadowMaxZ));
        elShadowBias.value = String(Math.round(this.mmdManager.shadowBias * 1_000_000));
        valShadowBias.textContent = this.mmdManager.shadowBias.toFixed(5);
        elShadowNormalBias.value = String(Math.round(this.mmdManager.shadowNormalBias * 100_000));
        valShadowNormalBias.textContent = this.mmdManager.shadowNormalBias.toFixed(5);
        const initialShadowColor = this.mmdManager.getShadowColor();
        elShadowColorR.value = String(Math.round(initialShadowColor.r * 255));
        elShadowColorG.value = String(Math.round(initialShadowColor.g * 255));
        elShadowColorB.value = String(Math.round(initialShadowColor.b * 255));
        applyShadowColor();
        elToonShadowInfluence.value = String(Math.round(this.mmdManager.toonShadowInfluence * 100));
        applyToonShadowInfluence();
        elSelfShadowSoftness.value = String(Math.round(this.mmdManager.selfShadowEdgeSoftness * 1000));
        valSelfShSoftness.textContent = this.mmdManager.selfShadowEdgeSoftness.toFixed(3);
        elOcclusionShadowSoftness.value = String(Math.round(this.mmdManager.occlusionShadowEdgeSoftness * 1000));
        valOcclusionShSoftness.textContent = this.mmdManager.occlusionShadowEdgeSoftness.toFixed(3);

        if (elEffectColorTemp && valEffectColorTemp) {
            const applyColorTemperature = () => {
                const kelvin = Number(elEffectColorTemp.value);
                this.mmdManager.lightColorTemperature = kelvin;
                valEffectColorTemp.textContent = `${Math.round(this.mmdManager.lightColorTemperature)} K`;
            };
            elEffectColorTemp.value = String(Math.round(this.mmdManager.lightColorTemperature));
            applyColorTemperature();
            elEffectColorTemp.addEventListener("input", applyColorTemperature);
        }

        if (elEffectContrast && valEffectContrast) {
            const applyContrast = () => {
                const offsetPercent = Number(elEffectContrast.value);
                const contrast = 1 + offsetPercent / 100;
                this.mmdManager.postEffectContrast = contrast;
                const roundedOffset = Math.round((this.mmdManager.postEffectContrast - 1) * 100);
                valEffectContrast.textContent = `${roundedOffset}%`;
            };
            elEffectContrast.value = String(Math.round((this.mmdManager.postEffectContrast - 1) * 100));
            applyContrast();
            elEffectContrast.addEventListener("input", applyContrast);
        }

        if (elEffectGamma && valEffectGamma) {
            const applyGamma = () => {
                const offsetPercent = Number(elEffectGamma.value);
                // 0% is neutral (gamma=1.0). Positive values brighten, negative values darken.
                const gammaPower = Math.pow(2, -offsetPercent / 100);
                this.mmdManager.postEffectGamma = gammaPower;
                const roundedOffset = Math.round(-Math.log2(this.mmdManager.postEffectGamma) * 100);
                valEffectGamma.textContent = `${roundedOffset}%`;
            };
            elEffectGamma.value = String(Math.round(-Math.log2(this.mmdManager.postEffectGamma) * 100));
            applyGamma();
            elEffectGamma.addEventListener("input", applyGamma);
        }

        // Initialize direction from HTML default values
        updateDir();
    }

    private setupCallbacks(): void {
        // Frame update
        this.mmdManager.onFrameUpdate = (frame, total) => {
            if (document.activeElement !== this.currentFrameEl) {
                this.currentFrameEl.value = String(frame);
            }
            this.totalFramesEl.textContent = String(total);
            this.timeline.setTotalFrames(total);
            this.timeline.setCurrentFrame(frame);
            const frameChanged = this.lastObservedFrame !== frame;
            this.lastObservedFrame = frame;
            this.debugKeyframeFlow("frame update", {
                frame,
                total,
                frameChanged,
                selectedBone: this.bottomPanel.getSelectedBone(),
                selectedTrack: this.getSelectedTimelineTrack()?.name ?? null,
            });
            if (frameChanged) {
                this.clearTransientEditingStateForFrameChange();
                if (this.timeline.getSelectedFrame() !== null) {
                    this.timeline.setSelectedFrame(null);
                }
            }
            this.updateTimelineEditState();
            const sourcePose = this.getDisplayBonePoseSnapshot(frame);
            const selectedBone = this.bottomPanel.getSelectedBone();
            const shouldApplyPoseToRuntime = selectedBone !== "Camera" || frameChanged;
            if (shouldApplyPoseToRuntime) {
                this.applySelectedBonePoseSnapshotToRuntime(frame, sourcePose);
            }
            this.debugKeyframeFlow("display pose", {
                frame,
                source: sourcePose ? "snapshot-or-source" : "none",
                pose: sourcePose,
            });
            if (sourcePose) {
                this.bottomPanel.syncSelectedBoneSlidersFromSnapshot(sourcePose, true);
            } else {
                this.bottomPanel.syncSelectedBoneSlidersFromRuntime(true);
            }
            this.bottomPanel.syncSelectedMorphFrameSlidersFromRuntime(true);

            this.cameraPanelController?.refresh(false, sourcePose?.distance ?? this.mmdManager.getCameraDistance());
            this.dofPanelController?.refreshAutoFocusReadout();
            this.lensEffectController?.refreshAutoReadout();
            this.exportUiController?.syncFrameRangeFromTimeline();

            const { endFrame } = this.getPlaybackFrameRange();
            if (this.mmdManager.isPlaying && this.isPlaybackFrameStopEnabled() && frame >= endFrame) {
                this.stopAtPlaybackEnd(endFrame);
            }
        };

        // Active model changed
        this.mmdManager.onModelLoaded = () => {
            this.setStatus("Model ready", false);
            this.viewportOverlay.classList.add("hidden");
            if (this.mmdManager.getTimelineTarget() === "camera") {
                this.applyCameraSelectionUI();
            } else {
                this.applyActiveModelSelectionUI();
            }
            this.refreshModelSelector();
            this.dofPanelController?.refreshFocusTargetControls();
            this.refreshShaderPanel();
            this.runtimeFeatureUiController?.refreshRigidBodies();
        };

        // Any model loaded into scene
        this.mmdManager.onSceneModelLoaded = (info: ModelInfo, totalCount: number, active: boolean) => {
            this.setStatus("Model loaded", false);
            this.viewportOverlay.classList.add("hidden");
            if (active) {
                this.applyActiveModelSelectionUI();
            }
            this.refreshModelSelector();
            this.dofPanelController?.refreshFocusTargetControls();
            this.refreshShaderPanel();
            this.runtimeFeatureUiController?.refreshRigidBodies();
            const activeLabel = active ? " [active]" : "";
            this.showToast(`Loaded model: ${info.name} (${totalCount})${activeLabel}`, "success");
        };

        this.mmdManager.onDofFocusTargetChanged = () => {
            this.dofPanelController?.refreshFocusTargetControls();
            this.dofPanelController?.refreshAutoFocusReadout();
        };

        // Motion loaded
        this.mmdManager.onMotionLoaded = (info: MotionInfo) => {
            this.setStatus("Motion loaded", false);
            this.timeline.setTotalFrames(info.frameCount);
            this.totalFramesEl.textContent = String(info.frameCount);
            this.exportUiController?.syncFrameRangeFromTimeline();
            this.showToast(`Loaded motion: ${info.name}`, "success");
        };

        this.mmdManager.onCameraMotionLoaded = (info: MotionInfo) => {
            this.setStatus("Camera motion loaded", false);
            this.timeline.setTotalFrames(info.frameCount);
            this.totalFramesEl.textContent = String(info.frameCount);
            this.exportUiController?.syncFrameRangeFromTimeline();
            this.showToast(`Loaded camera motion: ${info.name}`, "success");
        };

        // Keyframe data loaded
        this.mmdManager.onKeyframesLoaded = (tracks) => {
            this.timeline.setKeyframeTracks(tracks);
            if (this.mmdManager.getTimelineTarget() === "model") {
                const selectedBone = this.bottomPanel.getSelectedBone();
                if (selectedBone) {
                    this.syncTimelineBoneSelectionFromBottomPanel(selectedBone);
                }
            } else {
                this.timeline.selectTrackByNameAndCategory("Camera", ["camera"]);
            }
            this.syncBoneVisualizerSelection(this.timeline.getSelectedTrack());
            this.syncBottomBoneSelectionFromTimeline(this.timeline.getSelectedTrack());
            this.refreshSelectedTrackRotationOverlay();
            this.updateTimelineEditState();
        };

        // Audio loaded
        this.mmdManager.onAudioLoaded = (name: string) => {
            this.setStatus("Audio loaded", false);
            this.showToast(`Loaded audio: ${name}`, "success");
            void this.refreshTimelineWaveformFromAudio();
        };

        // Error
        this.mmdManager.onError = (message: string) => {
            this.setStatus("Error", false);
            this.showToast(message, "error");
        };

        this.mmdManager.onPhysicsStateChanged = () => {
            this.runtimeFeatureUiController?.refreshPhysics();
            this.runtimeFeatureUiController?.refreshRigidBodies();
        };

        this.mmdManager.onGlobalIlluminationStateChanged = () => {
            this.runtimeFeatureUiController?.refreshGi();
        };

        this.mmdManager.onBoneVisualizerBonePicked = (boneName: string) => {
            if (this.mmdManager.getTimelineTarget() !== "model") return;
            const selected = this.bottomPanel.setSelectedBone(boneName);
            if (!selected) return;
            this.syncTimelineBoneSelectionFromBottomPanel(boneName);
        };

        this.mmdManager.onMaterialShaderStateChanged = () => {
            this.refreshShaderPanel();
        };
    }

    private async refreshTimelineWaveformFromAudio(): Promise<void> {
        const requestId = ++this.timelineWaveformRequestId;
        const audioPath = this.mmdManager.getAudioSourcePath();
        if (!audioPath) {
            this.timeline.setWaveformPeaks(null);
            return;
        }

        try {
            const arrayBuffer = await this.readRendererBinaryFileAsArrayBuffer(audioPath);
            if (!arrayBuffer) {
                if (requestId === this.timelineWaveformRequestId) {
                    this.timeline.setWaveformPeaks(null);
                }
                return;
            }

            const audioContext = new AudioContext();
            let audioBuffer: AudioBuffer;
            try {
                audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            } finally {
                try {
                    await audioContext.close();
                } catch {
                    // ignore close failures
                }
            }

            if (requestId !== this.timelineWaveformRequestId) {
                return;
            }

            const peaks = this.buildTimelineWaveformPeaks(audioBuffer, UIController.TIMELINE_WAVEFORM_FPS);
            this.timeline.setWaveformPeaks(peaks);
        } catch (err: unknown) {
            if (requestId !== this.timelineWaveformRequestId) {
                return;
            }
            console.warn("Failed to refresh timeline waveform:", err);
            this.timeline.setWaveformPeaks(null);
        }
    }

    private async readRendererBinaryFileAsArrayBuffer(filePath: string): Promise<ArrayBuffer | null> {
        const buffer = await window.electronAPI.readBinaryFile(filePath);
        if (!buffer) {
            return null;
        }

        const bytes = buffer instanceof Uint8Array
            ? buffer
            : new Uint8Array(buffer as unknown as ArrayBuffer);
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        return copy.buffer;
    }

    private buildTimelineWaveformPeaks(audioBuffer: AudioBuffer, fps: number): Float32Array {
        const normalizedFps = Math.max(1, Math.floor(fps));
        const sampleRate = Math.max(1, audioBuffer.sampleRate);
        const frameCount = Math.max(1, Math.ceil(audioBuffer.duration * normalizedFps));
        const peaks = new Float32Array(frameCount);
        const channelData = Array.from({ length: audioBuffer.numberOfChannels }, (_, index) =>
            audioBuffer.getChannelData(index)
        );

        for (let frame = 0; frame < frameCount; frame += 1) {
            const startSample = Math.min(audioBuffer.length, Math.floor(frame * sampleRate / normalizedFps));
            const nextStartSample = Math.min(audioBuffer.length, Math.floor((frame + 1) * sampleRate / normalizedFps));
            const endSample = Math.max(startSample + 1, nextStartSample);

            let peak = 0;
            for (let channelIndex = 0; channelIndex < channelData.length; channelIndex += 1) {
                const samples = channelData[channelIndex];
                const sampleLimit = Math.min(endSample, samples.length);
                for (let sampleIndex = startSample; sampleIndex < sampleLimit; sampleIndex += 1) {
                    const amplitude = Math.abs(samples[sampleIndex] ?? 0);
                    if (amplitude > peak) {
                        peak = amplitude;
                    }
                }
            }

            peaks[frame] = peak;
        }

        return peaks;
    }

    private hasBackgroundExportActive(): boolean {
        return this.exportUiController?.hasBackgroundExportActive() ?? false;
    }

    private setupFileDrop(): void {
        let dragDepth = 0;
        const setDragActive = (active: boolean): void => {
            document.body.classList.toggle("file-drag-active", active);
        };
        const isFileDragEvent = (event: DragEvent): boolean => {
            const types = event.dataTransfer?.types;
            if (!types) return false;
            return Array.from(types).includes("Files");
        };

        document.addEventListener("dragenter", (event) => {
            if (!isFileDragEvent(event)) return;
            event.preventDefault();
            dragDepth += 1;
            setDragActive(true);
        });

        document.addEventListener("dragover", (event) => {
            if (!isFileDragEvent(event)) return;
            event.preventDefault();
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = "copy";
            }
        });

        document.addEventListener("dragleave", (event) => {
            if (!isFileDragEvent(event)) return;
            event.preventDefault();
            dragDepth = Math.max(0, dragDepth - 1);
            if (dragDepth === 0) {
                setDragActive(false);
            }
        });

        document.addEventListener("drop", (event) => {
            event.preventDefault();
            dragDepth = 0;
            setDragActive(false);

            if (this.hasBackgroundExportActive()) {
                this.showToast("Cannot load files during background export", "error");
                return;
            }

            const files = Array.from(event.dataTransfer?.files ?? []);
            if (files.length === 0) return;

            void (async () => {
                const entries = files
                    .map((file) => {
                        const resolvedPath =
                            window.electronAPI.getPathForDroppedFile(file) ??
                            (file as File & { path?: string }).path ??
                            "";
                        if (!resolvedPath) return null;
                        const filePath = resolvedPath;
                        const ext = this.getFileExtension(filePath);
                        const priority = ext === "3dl" || ext === "cube"
                            ? 0
                            : ext === "pmx" || ext === "pmd"
                                ? 1
                                : ext === "x"
                                    ? 1
                                    : ext === "vmd" || ext === "vpd"
                                        ? 2
                                        : ext === "mp3" || ext === "wav" || ext === "ogg"
                                            ? 3
                                            : 4;
                        return { filePath, priority };
                    })
                    .filter((entry): entry is { filePath: string; priority: number } => entry !== null)
                    .sort((a, b) => a.priority - b.priority);

                if (entries.length === 0) {
                    this.showToast("Could not resolve dropped file path", "error");
                    return;
                }

                for (const entry of entries) {
                    const filePath = entry.filePath;
                    if (!filePath) continue;
                    await this.loadFileByPath(filePath, "drop");
                }
            })();
        });
    }

    private setupKeyboard(): void {
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && this.layoutUiController?.isUiFullscreenModeActive()) {
                e.preventDefault();
                this.layoutUiController.exitUiFullscreenMode();
                return;
            }

            if (this.hasBackgroundExportActive()) {
                e.preventDefault();
                return;
            }

            // Don't handle shortcuts while editing text fields.
            if (this.isTextInputLikeTarget(e.target)) return;

            const lowerKey = e.key.length === 1 ? e.key.toLowerCase() : e.key;
            const hasModifier = e.ctrlKey || e.metaKey || e.altKey;

            // Alt+Enter: MMD-like fullscreen toggle (mapped to UI fullscreen mode).
            if (!e.ctrlKey && !e.metaKey && e.altKey && e.key === "Enter") {
                e.preventDefault();
                this.layoutUiController?.toggleUiFullscreenMode();
                return;
            }

            // Ctrl+S: save project (overwrite current project when possible)
            if (!e.metaKey && !e.altKey && e.ctrlKey && !e.shiftKey && lowerKey === "s") {
                e.preventDefault();
                void this.saveProject();
                return;
            }

            // Ctrl + arrow: jump to previous/next keyframe point
            if (!e.metaKey && !e.altKey && e.ctrlKey) {
                if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                    e.preventDefault();
                    this.seekToAdjacentKeyframePoint(-1);
                    return;
                }
                if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                    e.preventDefault();
                    this.seekToAdjacentKeyframePoint(1);
                    return;
                }
            }

            const isAddKeyShortcut =
                !hasModifier &&
                (
                    lowerKey === "i" ||
                    lowerKey === "k" ||
                    e.key === "+" ||
                    e.code === "NumpadAdd" ||
                    e.key === "Enter"
                );
            if (isAddKeyShortcut) {
                e.preventDefault();
                this.addKeyframeAtCurrentFrame();
                return;
            }

            if (!hasModifier && e.key === "Delete") {
                e.preventDefault();
                this.deleteSelectedKeyframe();
                return;
            }

            // Tab / Shift+Tab / めE IntlRo ) : cycle active model
            if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "Tab" || e.code === "IntlRo")) {
                e.preventDefault();
                this.cycleActiveModelByShortcut(e.shiftKey ? -1 : 1);
                return;
            }

            if (e.altKey && e.key === "ArrowLeft") {
                e.preventDefault();
                this.nudgeSelectedKeyframe(-1);
                return;
            }

            if (e.altKey && e.key === "ArrowRight") {
                e.preventDefault();
                this.nudgeSelectedKeyframe(1);
                return;
            }

            // MMD-like playback / display shortcuts
            if (!hasModifier) {
                if (lowerKey === "p") {
                    e.preventDefault();
                    if (this.mmdManager.isPlaying) {
                        this.pause();
                    } else {
                        this.play();
                    }
                    return;
                }

                if (lowerKey === "g") {
                    e.preventDefault();
                    this.sceneEnvironmentUiController?.toggleGround();
                    return;
                }

                if (lowerKey === "e") {
                    e.preventDefault();
                    this.toggleEdgeWidthByShortcut();
                    return;
                }

                if (lowerKey === "b") {
                    e.preventDefault();
                    this.sceneEnvironmentUiController?.toggleBackgroundBlack();
                    return;
                }
            }

            switch (e.key) {
                case " ":
                    e.preventDefault();
                    if (this.mmdManager.isPlaying) {
                        this.pause();
                    } else {
                        this.play();
                    }
                    break;
                case "Home":
                    this.mmdManager.seekToBoundary(this.getPlaybackFrameRange().startFrame);
                    break;
                case "End":
                    this.mmdManager.seekToBoundary(this.getPlaybackFrameRange().endFrame);
                    break;
                case "ArrowLeft":
                    this.mmdManager.seekToBoundary(this.mmdManager.currentFrame - (e.shiftKey ? 10 : 1));
                    break;
                case "ArrowRight":
                    this.mmdManager.seekToBoundary(this.mmdManager.currentFrame + (e.shiftKey ? 10 : 1));
                    break;
            }

            // Ctrl+Alt+O = open project file
            if (e.ctrlKey && e.altKey && !e.shiftKey && (e.key === "O" || e.key === "o")) {
                e.preventDefault();
                this.loadProject();
            }

            // Ctrl+Alt+S = save project as
            if (e.ctrlKey && e.altKey && !e.shiftKey && (e.key === "S" || e.key === "s")) {
                e.preventDefault();
                void this.saveProject(true);
            }

            // Ctrl+O = open PMX/PMD
            if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === "O" || e.key === "o")) {
                e.preventDefault();
                this.loadPMX();
            }

            // Ctrl+M = open VMD/VPD
            if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === "M" || e.key === "m")) {
                e.preventDefault();
                this.loadVMD();
            }

            // Ctrl+Shift+M = open camera VMD
            if (e.ctrlKey && e.shiftKey && !e.altKey && (e.key === "M" || e.key === "m")) {
                e.preventDefault();
                this.loadCameraVMD();
            }

            // Ctrl+Shift+A = open MP3
            if (e.ctrlKey && e.shiftKey && !e.altKey && (e.key === "A" || e.key === "a")) {
                e.preventDefault();
                this.loadMP3();
            }

            // Ctrl+Shift+S = export PNG
            if (e.ctrlKey && e.shiftKey && !e.altKey && (e.key === "S" || e.key === "s")) {
                e.preventDefault();
                void this.exportUiController?.exportPNG();
            }
        });
    }

    private isTextInputLikeTarget(target: EventTarget | null): boolean {
        if (!(target instanceof HTMLElement)) return false;
        if (target instanceof HTMLInputElement) return true;
        if (target instanceof HTMLSelectElement) return true;
        if (target instanceof HTMLTextAreaElement) return true;
        return target.isContentEditable || target.closest("[contenteditable='true']") !== null;
    }

    private commitCurrentFrameInput(): void {
        const rawValue = this.currentFrameEl.value.trim();
        if (rawValue.length === 0) {
            this.currentFrameEl.value = String(this.mmdManager.currentFrame);
            return;
        }

        const parsedFrame = Number.parseInt(rawValue, 10);
        if (!Number.isFinite(parsedFrame)) {
            this.currentFrameEl.value = String(this.mmdManager.currentFrame);
            return;
        }

        const nextFrame = Math.max(0, parsedFrame);
        this.currentFrameEl.value = String(nextFrame);
        this.mmdManager.seekToBoundary(nextFrame);
    }

    private cycleActiveModelByShortcut(direction: 1 | -1): void {
        const models = this.mmdManager.getLoadedModels();
        if (models.length === 0) return;

        const timelineTarget = this.mmdManager.getTimelineTarget();
        let nextModel = models[0];

        if (timelineTarget !== "model") {
            nextModel = direction > 0 ? models[0] : models[models.length - 1];
        } else {
            const active = models.find((model) => model.active) ?? models[0];
            const activeIndex = models.findIndex((model) => model.index === active.index);
            const nextIndex = (activeIndex + direction + models.length) % models.length;
            nextModel = models[nextIndex];
        }

        const ok = this.mmdManager.setActiveModelByIndex(nextModel.index);
        if (!ok) return;

        this.mmdManager.setTimelineTarget("model");
        this.refreshModelSelector();
        this.refreshShaderPanel();
    }

    private seekToAdjacentKeyframePoint(direction: 1 | -1): void {
        const track = this.getSelectedTimelineTrack();
        const frames = track?.frames;
        if (!frames || frames.length === 0) return;

        const currentFrame = Math.max(0, Math.floor(this.mmdManager.currentFrame));
        let targetFrame: number | null = null;

        if (direction > 0) {
            for (let i = 0; i < frames.length; i += 1) {
                const frame = Math.max(0, Math.floor(frames[i] ?? 0));
                if (frame > currentFrame) {
                    targetFrame = frame;
                    break;
                }
            }
        } else {
            for (let i = frames.length - 1; i >= 0; i -= 1) {
                const frame = Math.max(0, Math.floor(frames[i] ?? 0));
                if (frame < currentFrame) {
                    targetFrame = frame;
                    break;
                }
            }
        }

        if (targetFrame === null) return;
        this.mmdManager.seekToBoundary(targetFrame);
        this.timeline.setSelectedFrame(targetFrame);
        this.updateTimelineEditState();
    }

    private toggleEdgeWidthByShortcut(): void {
        const currentEdgeWidth = this.mmdManager.modelEdgeWidth;
        if (currentEdgeWidth > 0.001) {
            this.shortcutEdgeWidthRestore = Math.max(0.01, currentEdgeWidth);
            this.mmdManager.modelEdgeWidth = 0;
            this.showToast(t("toast.edge.off"), "info");
        } else {
            const restore = Math.max(0.01, this.shortcutEdgeWidthRestore || 1);
            this.mmdManager.modelEdgeWidth = restore;
            this.showToast(t("toast.edge.on"), "info");
        }
        this.modelEdgeController?.refresh();
    }

    private setupPerfDisplay(): void {
        const fpsEl = document.getElementById("fps-value")!;
        const engineEl = document.getElementById("engine-type-badge")!;
        const shaderEl = document.getElementById("shader-type-badge")!;
        const physicsEl = document.getElementById("physics-type-badge")!;

        const updatePerfBadges = (): void => {
            const engineType = this.mmdManager.getEngineType();
            const shaderType = this.mmdManager.getShaderRuntimeLabel();
            const physicsType = this.mmdManager.getPhysicsBackendLabel();
            const shaderBadgeLabel = shaderType === "WGSL-first" ? "WGSL" : shaderType;
            engineEl.textContent = engineType;
            shaderEl.textContent = shaderBadgeLabel;
            physicsEl.textContent = physicsType;

            if (engineType === "WebGPU") {
                engineEl.style.background = "rgba(139,92,246,0.15)";
                engineEl.style.color = "#a78bfa";
                engineEl.style.borderColor = "rgba(139,92,246,0.3)";
            } else if (engineType === "WebGL1") {
                engineEl.style.background = "rgba(245,158,11,0.15)";
                engineEl.style.color = "#fbbf24";
                engineEl.style.borderColor = "rgba(245,158,11,0.3)";
            } else {
                engineEl.style.background = "";
                engineEl.style.color = "";
                engineEl.style.borderColor = "";
            }

            if (shaderType === "WGSL-first") {
                shaderEl.style.background = "rgba(34,197,94,0.15)";
                shaderEl.style.color = "#86efac";
                shaderEl.style.borderColor = "rgba(34,197,94,0.3)";
            } else if (shaderType === "Mixed") {
                shaderEl.style.background = "rgba(245,158,11,0.15)";
                shaderEl.style.color = "#fbbf24";
                shaderEl.style.borderColor = "rgba(245,158,11,0.3)";
            } else {
                shaderEl.style.background = "rgba(56,189,248,0.12)";
                shaderEl.style.color = "#7dd3fc";
                shaderEl.style.borderColor = "rgba(56,189,248,0.24)";
            }

            if (physicsType === "Bullet") {
                physicsEl.style.background = "rgba(34,197,94,0.15)";
                physicsEl.style.color = "#86efac";
                physicsEl.style.borderColor = "rgba(34,197,94,0.3)";
            } else if (physicsType === "Ammo") {
                physicsEl.style.background = "rgba(245,158,11,0.15)";
                physicsEl.style.color = "#fbbf24";
                physicsEl.style.borderColor = "rgba(245,158,11,0.3)";
            } else {
                physicsEl.style.background = "rgba(148,163,184,0.14)";
                physicsEl.style.color = "#cbd5e1";
                physicsEl.style.borderColor = "rgba(148,163,184,0.24)";
            }
        };

        updatePerfBadges();

        // FPS - update every second
        setInterval(() => {
            const fps = this.mmdManager.getFps();
            fpsEl.textContent = String(fps);
            fpsEl.style.color = fps >= 55 ? "var(--accent-green)"
                : fps >= 30 ? "var(--accent-amber)"
                    : "var(--accent-red)";
            updatePerfBadges();
            this.dofPanelController?.refreshAutoFocusReadout();
        }, 1000);

        // Volume fader
        const slider = document.getElementById("volume-slider") as HTMLInputElement;
        const volLabel = document.getElementById("volume-value")!;
        const muteBtn = document.getElementById("btn-mute")!;
        const iconOn = document.getElementById("icon-volume-on")!;
        const iconOff = document.getElementById("icon-volume-off")!;

        const updateVolumeUI = (isMuted: boolean) => {
            const pct = Number(slider.value);
            volLabel.textContent = `${pct}%`;
            iconOn.style.display = isMuted ? "none" : "";
            iconOff.style.display = isMuted ? "" : "none";
            muteBtn.classList.toggle("muted", isMuted);
        };

        slider.addEventListener("input", () => {
            this.mmdManager.volume = Number(slider.value) / 100;
            updateVolumeUI(this.mmdManager.muted);
        });

        muteBtn.addEventListener("click", async () => {
            await this.mmdManager.toggleMute();
            updateVolumeUI(this.mmdManager.muted);
        });
    }

    private showStartupRenderingDiagnostics(): void {
        const summary = this.mmdManager.consumeRuntimeDiagnosticSummary();
        if (!summary) {
            return;
        }
        this.showToast(summary, "info");
    }

    private buildProjectDefaultFileName(): string {
        const now = new Date();
        const pad = (v: number) => String(v).padStart(2, "0");
        return `project_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.modoki.json`;
    }

    private buildProjectStateForPersistence(): MmdModokiProjectFileV1 {
        const project = this.mmdManager.exportProjectState();
        project.output = this.exportOutputProjectState();
        return project;
    }

    private exportOutputProjectState(): ProjectOutputState {
        return this.exportUiController?.exportProjectState() ?? {
            aspectPreset: "16:9",
            sizePreset: "1920",
            width: 1920,
            height: 1080,
            lockAspect: false,
            qualityScale: 1,
            fps: 30,
            includeAudio: false,
            webmCodec: "vp8",
            webmCaptureMode: "readpixels",
            startFrame: 0,
            endFrame: 0,
            frameStartEnabled: false,
            frameStopEnabled: false,
        };
    }

    private applyOutputProjectState(state: ProjectOutputState | null | undefined): void {
        this.exportUiController?.applyProjectState(state);
    }

    private reapplyImportedLightingState(lighting: Partial<ProjectLightingState> | null | undefined): void {
        if (!lighting) return;

        if (
            typeof lighting.x === "number"
            && Number.isFinite(lighting.x)
            && typeof lighting.y === "number"
            && Number.isFinite(lighting.y)
            && typeof lighting.z === "number"
            && Number.isFinite(lighting.z)
        ) {
            this.mmdManager.setLightDirection(lighting.x, lighting.y, lighting.z);
        }

        if (typeof lighting.shadowFrustumSize === "number" && Number.isFinite(lighting.shadowFrustumSize)) {
            this.mmdManager.shadowFrustumSize = lighting.shadowFrustumSize;
        }
        if (typeof lighting.shadowMaxZ === "number" && Number.isFinite(lighting.shadowMaxZ)) {
            this.mmdManager.shadowMaxZ = lighting.shadowMaxZ;
        }
    }

    private async saveProject(forceChoosePath = false): Promise<void> {
        this.setStatus("Saving project...", true);
        try {
            const project = this.buildProjectStateForPersistence();
            let relativeLutFileName: string | null = null;
            let relativeLutText: string | null = null;
            let relativeWgslFileName: string | null = null;
            const lutSavePlan = this.lutPanelController?.prepareProjectSave();
            if (lutSavePlan) {
                project.effects.lutSourceMode = lutSavePlan.sourceMode;
                project.effects.lutExternalPath = lutSavePlan.externalPath;
                relativeLutFileName = lutSavePlan.relativeFileName;
                relativeLutText = lutSavePlan.externalText;
                if (lutSavePlan.disableLut) {
                    project.effects.lutEnabled = false;
                    this.showToast("External LUT is missing, saving with LUT disabled", "info");
                }
            }
            if (!this.postFxWgslToonPath || !this.postFxWgslToonText) {
                project.effects.wgslToonShaderPath = null;
            } else {
                relativeWgslFileName = this.getBaseNameForRenderer(this.postFxWgslToonPath) || "external_toon.wgsl";
                project.effects.wgslToonShaderPath = `wgsl/${relativeWgslFileName}`;
            }

            const json = JSON.stringify(project, null, 2);
            let savedPath = this.currentProjectFilePath;
            if (forceChoosePath || !savedPath) {
                const defaultFileName = savedPath
                    ? this.getBaseNameForRenderer(savedPath) || this.buildProjectDefaultFileName()
                    : this.buildProjectDefaultFileName();
                savedPath = await window.electronAPI.saveTextFile(json, defaultFileName, [
                    { name: "MMD Modoki Project", extensions: ["mmdproj", "json"] },
                    { name: "All files", extensions: ["*"] },
                ]);
                if (!savedPath) {
                    this.setStatus("Ready", false);
                    this.showToast("Project save canceled", "info");
                    return;
                }
            } else {
                const wrote = await window.electronAPI.writeTextFileToPath(savedPath, json);
                if (!wrote) {
                    this.setStatus("Project save failed", false);
                    this.showToast("Failed to overwrite project file", "error");
                    return;
                }
            }

            if (relativeLutFileName && relativeLutText) {
                const projectDir = this.getDirectoryPathForRenderer(savedPath);
                const lutDir = this.joinPathForRenderer(projectDir, "luts");
                const lutPath = this.joinPathForRenderer(lutDir, relativeLutFileName);
                const wrote = await window.electronAPI.writeTextFileToPath(lutPath, relativeLutText);
                if (!wrote) {
                    this.showToast("Failed to save project-relative LUT file", "error");
                }
            }
            if (relativeWgslFileName && this.postFxWgslToonText) {
                const projectDir = this.getDirectoryPathForRenderer(savedPath);
                const wgslDir = this.joinPathForRenderer(projectDir, "wgsl");
                const wgslPath = this.joinPathForRenderer(wgslDir, relativeWgslFileName);
                const wrote = await window.electronAPI.writeTextFileToPath(wgslPath, this.postFxWgslToonText);
                if (!wrote) {
                    this.showToast("Failed to save project-relative WGSL file", "error");
                }
            }

            this.currentProjectFilePath = savedPath;
            const basename = savedPath.replace(/^.*[\\/]/, "");
            this.setStatus("Project saved", false);
            this.showToast(`Saved project: ${basename}`, "success");
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            this.setStatus("Project save failed", false);
            this.showToast(`Project save error: ${message}`, "error");
        }
    }

    private async loadProject(): Promise<void> {
        const filePath = await window.electronAPI.openFileDialog([
            { name: "MMD Modoki Project", extensions: ["mmdproj", "json"] },
            { name: "All files", extensions: ["*"] },
        ]);
        if (!filePath) return;

        this.setStatus("Loading project...", true);
        try {
            const text = await window.electronAPI.readTextFile(filePath);
            if (!text) {
                this.setStatus("Project load failed", false);
                this.showToast("Failed to read project file", "error");
                return;
            }

            let parsed: unknown;
            try {
                parsed = JSON.parse(text);
            } catch {
                this.setStatus("Project load failed", false);
                this.showToast("Project JSON parse failed", "error");
                return;
            }

            const parsedProject = parsed as Partial<MmdModokiProjectFileV1>;
            const requestedLutMode = parsedProject.effects?.lutSourceMode;
            const requestedLutPath = parsedProject.effects?.lutExternalPath;
            const requestedWgslToonPath = parsedProject.effects?.wgslToonShaderPath;
            const isExternalLutMode = requestedLutMode === "external-absolute" || requestedLutMode === "project-relative";

            let resolvedExternalLutPath: string | null = null;
            let resolvedExternalLutText: string | null = null;
            let externalLutWarning: string | null = null;
            let resolvedWgslToonPath: string | null = null;
            let resolvedWgslToonText: string | null = null;
            let wgslToonWarning: string | null = null;

            if (isExternalLutMode) {
                if (typeof requestedLutPath === "string" && requestedLutPath.trim().length > 0) {
                    const normalizedPath = requestedLutPath.trim();
                    resolvedExternalLutPath = requestedLutMode === "project-relative" && !this.isAbsolutePathForRenderer(normalizedPath)
                        ? this.resolveProjectRelativePath(filePath, normalizedPath)
                        : normalizedPath;
                    const lutText = await window.electronAPI.readTextFile(resolvedExternalLutPath);
                    if (lutText) {
                        resolvedExternalLutText = lutText;
                        const imported = await this.lutPanelController?.importExternalLutFile(
                            resolvedExternalLutPath,
                            "project",
                            false,
                            lutText,
                            requestedLutMode === "project-relative" ? "project-relative" : "external-absolute",
                        ) ?? false;
                        if (!imported) {
                            resolvedExternalLutText = null;
                            this.lutPanelController?.clearExternalAsset();
                            externalLutWarning = 'External LUT parse failed: ' + requestedLutPath;
                        }
                    } else {
                        externalLutWarning = 'External LUT load failed: ' + requestedLutPath;
                    }
                } else {
                    externalLutWarning = 'External LUT path is missing';
                }
            }
            if (typeof requestedWgslToonPath === "string" && requestedWgslToonPath.trim().length > 0) {
                const normalizedPath = requestedWgslToonPath.trim();
                resolvedWgslToonPath = this.isAbsolutePathForRenderer(normalizedPath)
                    ? normalizedPath
                    : this.resolveProjectRelativePath(filePath, normalizedPath);
                const wgslText = await window.electronAPI.readTextFile(resolvedWgslToonPath);
                if (wgslText) {
                    const validationError = this.shaderPanelController?.validateExternalWgslToonSnippet(wgslText) ?? null;
                    if (validationError) {
                        wgslToonWarning = `WGSL shader invalid (${requestedWgslToonPath}): ${validationError}`;
                        resolvedWgslToonPath = null;
                        resolvedWgslToonText = null;
                    } else {
                        resolvedWgslToonText = wgslText;
                    }
                } else {
                    wgslToonWarning = `WGSL shader load failed: ${requestedWgslToonPath}`;
                }
            }

            const result = await this.mmdManager.importProjectState(parsed);
            this.currentProjectFilePath = filePath;

            this.postFxWgslToonPath = resolvedWgslToonPath;
            this.postFxWgslToonText = resolvedWgslToonText;
            this.shaderPanelController?.setExternalWgslToonAsset(resolvedWgslToonPath, resolvedWgslToonText);
            this.mmdManager.setExternalWgslToonShader(resolvedWgslToonPath, resolvedWgslToonText);
            this.lutPanelController?.restoreProjectExternalAsset(resolvedExternalLutPath, resolvedExternalLutText);
            if (isExternalLutMode && !resolvedExternalLutText) {
                this.mmdManager.postEffectLutEnabled = false;
            }
            this.applyOutputProjectState(parsedProject.output);
            if (externalLutWarning) {
                result.warnings.push(externalLutWarning);
            }
            if (wgslToonWarning) {
                result.warnings.push(wgslToonWarning);
            }

            this.refreshModelSelector();
            this.refreshShaderPanel();
            this.applyLocalizedUiState();
            this.refreshCameraUiFromRuntime();
            this.refreshLightingUiFromRuntime();
            this.runtimeFeatureUiController?.refreshPhysics();
            this.accessoryPanelController?.refresh();
            if (this.mmdManager.getTimelineTarget() === "camera") {
                this.applyCameraSelectionUI();
            } else {
                const activeModel = this.mmdManager.getLoadedModels().find((item) => item.active);
                if (activeModel) {
                    this.mmdManager.setActiveModelByIndex(activeModel.index);
                }
            }
            this.reapplyImportedLightingState(parsedProject.lighting);
            this.refreshLightingUiFromRuntime();
            this.updateTimelineEditState();

            if (result.warnings.length > 0) {
                this.setStatus("Project loaded (with warnings)", false);
                this.showToast(
                    `Project loaded (${result.loadedModels} models, ${result.warnings.length} warnings)`,
                    "info",
                );
            } else {
                this.setStatus("Project loaded", false);
                this.showToast(`Project loaded (${result.loadedModels} models)`, "success");
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            this.setStatus("Project load failed", false);
            this.showToast(`Project load error: ${message}`, "error");
        }
    }

    private async loadFileFromDialog(): Promise<void> {
        const filePath = await window.electronAPI.openFileDialog([
            { name: "Supported files", extensions: ["pmx", "pmd", "x", "vmd", "vpd", "mp3", "wav", "ogg", "png", "jpg", "jpeg", "bmp", "webp", "webm", "mp4", "avi"] },
            { name: "All files", extensions: ["*"] },
        ]);

        if (!filePath) return;
        await this.loadFileByPath(filePath, "dialog");
    }

    private getFileExtension(filePath: string): string {
        const normalized = filePath.replace(/\\/g, "/");
        const fileName = normalized.substring(normalized.lastIndexOf("/") + 1);
        const dot = fileName.lastIndexOf(".");
        if (dot < 0) return "";
        return fileName.substring(dot + 1).toLowerCase();
    }

    private isLikelyCameraVmdPath(filePath: string): boolean {
        if (this.mmdManager.getTimelineTarget() === "camera") return true;
        if (this.mmdManager.getLoadedModels().length === 0) return true;
        const normalized = filePath.replace(/\\/g, "/").toLowerCase();
        const fileName = normalized.substring(normalized.lastIndexOf("/") + 1);
        return fileName.includes("camera") || fileName.includes("cam") || fileName.includes("カメラ");
    }

    private async loadFileByPath(filePath: string, source: "dialog" | "drop"): Promise<void> {
        const ext = this.getFileExtension(filePath);
        switch (ext) {
            case "pmx":
            case "pmd":
                this.setStatus("Loading PMX/PMD...", true);
                await this.mmdManager.loadPMX(filePath);
                return;
            case "x": {
                this.setStatus("Loading X model...", true);
                const ok = await this.mmdManager.loadX(filePath);
                if (ok) {
                    this.setStatus("X model loaded", false);
                    this.accessoryPanelController?.refresh();
                    this.showToast(`Loaded X model: ${filePath.replace(/^.*[\\/]/, "")}`, "success");
                } else {
                    this.setStatus("X model load failed", false);
                }
                return;
            }
            case "3dl":
            case "cube":
                this.setStatus("Loading LUT...", true);
                if (await this.lutPanelController?.importExternalLutFile(filePath, source)) {
                    this.setStatus("LUT loaded", false);
                } else {
                    this.setStatus("LUT load failed", false);
                }
                return;
            case "vpd":
                this.setStatus("Loading motion/pose...", true);
                await this.mmdManager.loadVMD(filePath);
                return;
            case "vmd": {
                const preferCamera = this.isLikelyCameraVmdPath(filePath);
                if (preferCamera) {
                    this.setStatus("Loading camera VMD...", true);
                    const cameraInfo = await this.mmdManager.loadCameraVMD(filePath);
                    if (cameraInfo) return;
                    this.setStatus("Loading motion/pose...", true);
                    await this.mmdManager.loadVMD(filePath);
                    return;
                }

                this.setStatus("Loading motion/pose...", true);
                const motionInfo = await this.mmdManager.loadVMD(filePath);
                if (motionInfo) return;
                this.setStatus("Loading camera VMD...", true);
                await this.mmdManager.loadCameraVMD(filePath);
                return;
            }
            case "mp3":
            case "wav":
            case "ogg":
                this.setStatus("Loading audio...", true);
                await this.mmdManager.loadMP3(filePath);
                return;
            case "png":
            case "jpg":
            case "jpeg":
            case "bmp":
            case "webp":
                await this.sceneEnvironmentUiController?.applyBackgroundImage(filePath);
                return;
            case "webm":
            case "mp4":
            case "avi":
                await this.sceneEnvironmentUiController?.applyBackgroundVideo(filePath);
                return;
            case "glb":
                this.showToast("GLB import is currently disabled", "error");
                return;
            default:
                if (source === "drop") {
                    this.showToast(`Unsupported file: ${filePath.replace(/^.*[\\/]/, "")}`, "error");
                } else {
                    this.showToast("Unsupported file type", "error");
                }
                return;
        }
    }

    private async loadPMX(): Promise<void> {
        const filePath = await window.electronAPI.openFileDialog([
            { name: "PMX/PMD model", extensions: ["pmx", "pmd"] },
            { name: "All files", extensions: ["*"] },
        ]);

        if (!filePath) return;

        this.setStatus("Loading PMX/PMD...", true);
        await this.mmdManager.loadPMX(filePath);
    }

    private async loadVMD(): Promise<void> {
        const filePath = await window.electronAPI.openFileDialog([
            { name: "VMD/VPD motion or pose", extensions: ["vmd", "vpd"] },
            { name: "All files", extensions: ["*"] },
        ]);

        if (!filePath) return;

        this.setStatus("Loading motion/pose...", true);
        await this.mmdManager.loadVMD(filePath);
    }

    private async loadCameraVMD(): Promise<void> {
        const filePath = await window.electronAPI.openFileDialog([
            { name: "VMD camera motion", extensions: ["vmd"] },
            { name: "All files", extensions: ["*"] },
        ]);

        if (!filePath) return;

        this.setStatus("Loading camera VMD...", true);
        await this.mmdManager.loadCameraVMD(filePath);
    }

    private async loadMP3(): Promise<void> {
        const filePath = await window.electronAPI.openFileDialog([
            { name: "Audio", extensions: ["mp3", "wav", "ogg"] },
            { name: "All files", extensions: ["*"] },
        ]);

        if (!filePath) return;

        this.setStatus("Loading audio...", true);
        await this.mmdManager.loadMP3(filePath);
    }

    private joinPathForRenderer(basePath: string, childName: string): string {
        const separator = basePath.includes("\\") ? "\\" : "/";
        const normalizedBase = basePath.replace(/[\\/]+$/, "");
        return `${normalizedBase}${separator}${childName}`;
    }

    private getDirectoryPathForRenderer(filePath: string): string {
        const normalized = filePath.replace(/[\\/]+$/, "");
        const index = Math.max(normalized.lastIndexOf("\\"), normalized.lastIndexOf("/"));
        if (index < 0) return normalized;
        return normalized.slice(0, index);
    }

    private getBaseNameForRenderer(filePath: string): string {
        const normalized = filePath.replace(/[\\/]+$/, "");
        const index = Math.max(normalized.lastIndexOf("\\"), normalized.lastIndexOf("/"));
        if (index < 0) return normalized;
        return normalized.slice(index + 1);
    }

    private isAbsolutePathForRenderer(filePath: string): boolean {
        return /^[A-Za-z]:[\\/]/.test(filePath)
            || /^\\\\/.test(filePath)
            || filePath.startsWith("/");
    }

    private normalizeRelativePathForRenderer(filePath: string): string {
        return filePath.replace(/^[.][\\/]/, "").replace(/[\\]+/g, "/");
    }

    private resolveProjectRelativePath(projectFilePath: string, relativePath: string): string {
        const projectDir = this.getDirectoryPathForRenderer(projectFilePath);
        const normalizedRelative = this.normalizeRelativePathForRenderer(relativePath);
        return this.joinPathForRenderer(projectDir, normalizedRelative.replace(/\//g, "\\"));
    }

    private isSamePathForRenderer(a: string, b: string): boolean {
        const norm = (v: string): string => v.replace(/[\\/]+/g, "\\").toLowerCase();
        return norm(a) === norm(b);
    }

    private getCameraPanelInfo(): ModelInfo {
        return {
            name: "Camera",
            path: "",
            vertexCount: 0,
            boneCount: 1,
            boneNames: ["Camera"],
            boneControlInfos: [{ name: "Camera", movable: true, rotatable: true }],
            morphCount: 0,
            morphNames: [],
            morphDisplayFrames: [],
        };
    }

    private applyCameraSelectionUI(): void {
        const cameraInfo = this.getCameraPanelInfo();
        this.bottomPanel.updateBoneControls(cameraInfo);
        this.bottomPanel.updateMorphControls(cameraInfo);
        this.bottomPanel.updateModelInfo(cameraInfo);
        this.bottomPanel.syncSelectedBoneSlidersFromRuntime(true);
        this.refreshCameraUiFromRuntime(true);
        this.mmdManager.setBoneVisualizerSelectedBone(null);
        this.updateInfoActionButtons();
    }

    private applyActiveModelSelectionUI(): void {
        if (this.mmdManager.getTimelineTarget() !== "model") return;
        const info = this.mmdManager.getActiveModelInfo();
        if (!info) return;

        this.bottomPanel.updateBoneControls(info);
        this.bottomPanel.updateMorphControls(info);
        this.bottomPanel.updateModelInfo(info);
        this.syncBoneVisualizerSelection(this.timeline.getSelectedTrack());
        this.syncBottomBoneSelectionFromTimeline(this.timeline.getSelectedTrack());
        this.updateInfoActionButtons();
    }

    private updateInfoActionButtons(): void {
        this.modelInfoPanelController?.updateActionButtons();
        this.updateSectionKeyframeButtons();
    }

    private refreshModelSelector(): void {
        this.modelInfoPanelController?.refresh();
        this.shaderPanelController?.syncModelSelectorFromInfo();
        this.updateInfoActionButtons();
        this.runtimeFeatureUiController?.refreshRigidBodies();
        this.accessoryPanelController?.refresh();
    }

    private getInfoModelSelectState(): ModelInfoSelectState {
        return this.modelInfoPanelController?.getSelectState() ?? {
            innerHTML: '<option value="">-</option>',
            value: "",
            disabled: true,
        };
    }

    private handleModelTargetSelection(value: string, showToast: boolean): void {
        if (value === MODEL_INFO_CAMERA_SELECT_VALUE) {
            this.mmdManager.setTimelineTarget("camera");
            this.applyCameraSelectionUI();
            this.refreshModelSelector();
            this.refreshShaderPanel();
            if (showToast) {
                this.showToast("Timeline target: Camera", "success");
            }
            return;
        }

        const index = Number.parseInt(value, 10);
        if (Number.isNaN(index)) return;
        const ok = this.mmdManager.setActiveModelByIndex(index);
        if (!ok) {
            if (showToast) {
                this.showToast("Failed to switch active model", "error");
            }
            return;
        }

        this.mmdManager.setTimelineTarget("model");
        this.applyActiveModelSelectionUI();
        this.refreshModelSelector();
        this.refreshShaderPanel();
        if (showToast) {
            this.showToast("Active model switched", "success");
        }
    }

    private installRangeNumberInputs(root: ParentNode = document): void {
        const sliders = root.querySelectorAll<HTMLInputElement>(
            'input[type="range"].bone-slider, .morph-slider-row input[type="range"], input[type="range"].cam-slider, input[type="range"].light-slider, input[type="range"].accessory-slider, input[type="range"].effect-slider',
        );

        for (const slider of sliders) {
            if (this.rangeNumberInputs.has(slider)) continue;

            const parent = slider.parentElement;
            if (!parent) continue;

            const numberInput = document.createElement("input");
            numberInput.type = "number";
            numberInput.className = "range-number-input";
            numberInput.min = this.formatRangeDisplayValue(
                slider,
                slider.min === "" ? Number.NEGATIVE_INFINITY : Number(slider.min),
            );
            numberInput.max = this.formatRangeDisplayValue(
                slider,
                slider.max === "" ? Number.POSITIVE_INFINITY : Number(slider.max),
            );
            numberInput.step = this.formatRangeDisplayValue(slider, slider.step && slider.step !== "any" ? Number(slider.step) : 1);
            numberInput.disabled = slider.disabled;

            const labelText = parent.querySelector("label, .light-label, .effect-label, .accessory-label")?.textContent?.trim();
            if (labelText) {
                numberInput.setAttribute("aria-label", `${labelText} value`);
            }

            parent.classList.add("range-has-number");
            parent.insertBefore(numberInput, slider.nextSibling);
            this.rangeNumberInputs.set(slider, numberInput);

            const commit = (): void => {
                const parsed = Number(numberInput.value);
                if (!Number.isFinite(parsed)) {
                    this.syncRangeNumberInput(slider);
                    return;
                }

                const nextValue = this.formatRangeInputValue(
                    slider,
                    this.normalizeRangeInputValue(slider, this.parseRangeDisplayValue(slider, parsed)),
                );

                if (slider.value !== nextValue) {
                    slider.value = nextValue;
                }

                slider.dispatchEvent(new Event("input", { bubbles: true }));
                this.syncRangeNumberInput(slider);
            };

            slider.addEventListener("input", () => this.syncRangeNumberInput(slider));
            slider.addEventListener("change", () => this.syncRangeNumberInput(slider));
            numberInput.addEventListener("change", commit);
            numberInput.addEventListener("blur", commit);
            numberInput.addEventListener("keydown", (event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                numberInput.blur();
            });

            this.syncRangeNumberInput(slider);
        }
    }

    private syncRangeNumberInput(slider: HTMLInputElement): void {
        const numberInput = this.rangeNumberInputs.get(slider);
        if (!numberInput) return;

        numberInput.disabled = slider.disabled;
        const parsed = Number(slider.value);
        if (!Number.isFinite(parsed)) return;

        const nextValue = this.formatRangeDisplayValue(slider, parsed);
        if (numberInput.value !== nextValue) {
            numberInput.value = nextValue;
        }
    }

    private getRangeDisplayScale(slider: HTMLInputElement): number {
        const parsed = Number(slider.dataset.displayScale ?? "1");
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    }

    private getRangeDisplayDecimals(slider: HTMLInputElement): number {
        const parsed = Number.parseInt(slider.dataset.displayDecimals ?? "", 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : this.getRangeStepDecimals(slider.step);
    }

    private parseRangeDisplayValue(slider: HTMLInputElement, displayValue: number): number {
        return displayValue / this.getRangeDisplayScale(slider);
    }

    private formatRangeDisplayValue(slider: HTMLInputElement, internalValue: number): string {
        if (!Number.isFinite(internalValue)) return "";
        const displayValue = internalValue * this.getRangeDisplayScale(slider);
        const decimals = this.getRangeDisplayDecimals(slider);
        return decimals > 0
            ? String(Number(displayValue.toFixed(decimals)))
            : String(Math.round(displayValue));
    }

    private isRangeInputEditing(slider: HTMLInputElement): boolean {
        const activeElement = document.activeElement;
        return activeElement === slider || activeElement === this.rangeNumberInputs.get(slider);
    }

    private normalizeRangeInputValue(slider: HTMLInputElement, value: number): number {
        let next = value;
        const min = slider.min === "" ? -Infinity : Number(slider.min);
        const max = slider.max === "" ? Infinity : Number(slider.max);

        if (Number.isFinite(min)) next = Math.max(min, next);
        if (Number.isFinite(max)) next = Math.min(max, next);

        if (slider.step && slider.step !== "any") {
            const step = Number(slider.step);
            if (Number.isFinite(step) && step > 0) {
                const base = Number.isFinite(min) ? min : 0;
                next = base + Math.round((next - base) / step) * step;
                if (Number.isFinite(min)) next = Math.max(min, next);
                if (Number.isFinite(max)) next = Math.min(max, next);
            }
        }

        return next;
    }

    private formatRangeInputValue(slider: HTMLInputElement, value: number): string {
        const decimals = this.getRangeStepDecimals(slider.step);
        return decimals > 0
            ? String(Number(value.toFixed(decimals)))
            : String(Math.round(value));
    }

    private getRangeStepDecimals(stepValue: string): number {
        if (!stepValue || stepValue === "any") return 0;

        const normalized = stepValue.toLowerCase();
        if (normalized.includes("e-")) {
            const exponent = Number.parseInt(normalized.split("e-")[1] ?? "0", 10);
            return Number.isFinite(exponent) ? exponent : 0;
        }

        const decimalIndex = normalized.indexOf(".");
        return decimalIndex >= 0 ? normalized.length - decimalIndex - 1 : 0;
    }

    private refreshShaderPanel(): void {
        this.shaderPanelController?.refresh();
    }

    private renderShaderCameraPostEffectsPanel(): void {
        if (
            !this.shaderModelSelect ||
            !this.shaderPresetSelect ||
            !this.shaderApplySelectedButton ||
            !this.shaderApplyAllButton ||
            !this.shaderResetButton ||
            !this.shaderPanelNote ||
            !this.shaderMaterialList
        ) {
            return;
        }

        this.shaderPanelController?.syncModelSelectorFromInfo();
        const infoModelState = this.getInfoModelSelectState();
        this.shaderModelSelect.value = MODEL_INFO_CAMERA_SELECT_VALUE;
        this.shaderModelSelect.disabled = infoModelState.disabled;
        this.shaderPresetSelect.innerHTML = `<option value="postfx">${t("shader.camera.postfx")}</option>`;
        this.shaderPresetSelect.value = "postfx";
        this.shaderPresetSelect.disabled = true;
        this.shaderApplySelectedButton.disabled = true;
        this.shaderApplyAllButton.disabled = true;
        this.shaderResetButton.disabled = true;
        this.shaderPanelNote.textContent = t("shader.camera.note");
        const lutPresetOptionsHtml = this.lutPanelController?.buildPresetOptionsHtml() ?? "";

        this.shaderMaterialList.innerHTML = `
            <div class="shader-postfx-controls">
                <div class="effect-row" style="display:none;">
                    <span class="effect-label" data-i18n="shader.postfx.contrast">Contrast</span>
                    <input data-postfx="contrast" type="range" class="effect-slider" min="-100" max="200" value="0" step="1">
                    <span data-postfx-val="contrast" class="effect-value">0%</span>
                </div>
                <div class="effect-row">
                    <span class="effect-label" data-i18n="shader.postfx.gamma">Gamma</span>
                    <input data-postfx="gamma" type="range" class="effect-slider" min="-100" max="100" value="0" step="1">
                    <span data-postfx-val="gamma" class="effect-value">0%</span>
                </div>
                <div class="effect-row" style="display:none;">
                    <span class="effect-label" data-i18n="shader.postfx.exposure">Exposure</span>
                    <input data-postfx="exposure" type="range" class="effect-slider" min="0" max="8" value="1" step="0.01">
                    <span data-postfx-val="exposure" class="effect-value">x1.00</span>
                </div>
                <div class="effect-row" style="display:none;">
                    <span class="effect-label" data-i18n="shader.postfx.dithering">Dither</span>
                    <input data-postfx="dithering-intensity" type="range" class="effect-slider" min="0" max="1" value="0" step="0.0001">
                    <span data-postfx-val="dithering" class="effect-value" data-i18n="status.off">OFF</span>
                </div>
                <div class="effect-row">
                    <span class="effect-label" data-i18n="shader.postfx.vignette">Vignette</span>
                    <input data-postfx="vignette-weight" type="range" class="effect-slider" min="0" max="4" value="0" step="0.01">
                    <span data-postfx-val="vignette" class="effect-value" data-i18n="status.off">OFF</span>
                </div>
                <div class="effect-row">
                    <span class="effect-label" data-i18n="shader.postfx.chroma">Chroma</span>
                    <input data-postfx="chromatic-aberration" type="range" class="effect-slider" min="0" max="200" value="0" step="1">
                    <span data-postfx-val="chromatic-aberration" class="effect-value" data-i18n="status.off">OFF</span>
                </div>
                <div class="effect-row">
                    <span class="effect-label" data-i18n="shader.postfx.edgeBlur">EdgeBlur</span>
                    <input data-postfx="lens-edge-blur" type="range" class="effect-slider" min="0" max="100" value="0" step="1">
                    <span data-postfx-val="lens-edge-blur" class="effect-value">0%</span>
                </div>
                <div class="effect-row">
                    <span class="effect-label" data-i18n="shader.postfx.distortion">Distortion</span>
                    <input data-postfx="distortion-influence" type="range" class="effect-slider" min="0" max="100" value="0" step="1">
                    <span data-postfx-val="distortion-influence" class="effect-value">0%</span>
                </div>
                <div class="effect-row">
                    <span class="effect-label" data-i18n="shader.postfx.grain">Grain</span>
                    <input data-postfx="grain-intensity" type="range" class="effect-slider" min="0" max="100" value="0" step="1">
                    <span data-postfx-val="grain-intensity" class="effect-value" data-i18n="status.off">OFF</span>
                </div>
                <div class="effect-row">
                    <span class="effect-label" data-i18n="shader.postfx.sharpen">Sharpen</span>
                    <input data-postfx="sharpen-edge" type="range" class="effect-slider" min="0" max="400" value="0" step="1">
                    <span data-postfx-val="sharpen-edge" class="effect-value" data-i18n="status.off">OFF</span>
                </div>
                <div class="effect-row" style="display:none;">
                    <span class="effect-label" data-i18n="shader.postfx.curves">Curves</span>
                    <input data-postfx="color-curves-saturation" type="range" class="effect-slider" min="-100" max="100" value="0" step="1">
                    <span data-postfx-val="color-curves-saturation" class="effect-value" data-i18n="status.off">OFF</span>
                </div>
                <div class="effect-row">
                    <span class="effect-label" data-i18n="shader.postfx.glow">Glow</span>
                    <input data-postfx="glow-intensity" type="range" class="effect-slider" min="0" max="100" value="50" step="1">
                    <span data-postfx-val="glow-intensity" class="effect-value" data-i18n="status.off">OFF</span>
                </div>
                <div class="effect-row" style="display:none;">
                    <span class="effect-label" data-i18n="shader.postfx.lutSource">LUTSrc</span>
                    <select data-postfx-select="lut-source" class="effect-select">
                        <option value="builtin" data-i18n="shader.option.builtin">Builtin</option>
                        <option value="external-absolute" data-i18n="shader.option.externalAbsolute">External Abs</option>
                        <option value="project-relative" data-i18n="shader.option.projectLut">Project LUT</option>
                    </select>
                    <span data-postfx-val="lut-source" class="effect-value" data-i18n="shader.option.builtin">Builtin</span>
                </div>
                <div class="effect-row" style="display:none;">
                    <span class="effect-label" data-i18n="shader.postfx.lutFile">LUTFile</span>
                    <button data-postfx-btn="lut-file" type="button" class="effect-button" data-i18n="button.load">Load...</button>
                    <span data-postfx-val="lut-file" class="effect-value" data-i18n="option.none">None</span>
                </div>
                <div class="effect-row" style="display:none;">
                    <span class="effect-label" data-i18n="shader.postfx.motionBlur">MBlur</span>
                    <input data-postfx="motion-blur-strength" type="range" class="effect-slider" min="0" max="200" value="50" step="1">
                    <span data-postfx-val="motion-blur-strength" class="effect-value" data-i18n="status.off">OFF</span>
                </div>
                <div class="effect-row" style="display:none;">
                    <span class="effect-label" data-i18n="shader.postfx.ssr">SSR</span>
                    <input data-postfx="ssr-strength" type="range" class="effect-slider" min="0" max="200" value="80" step="1">
                    <span data-postfx-val="ssr-strength" class="effect-value" data-i18n="status.off">OFF</span>
                </div>
                <div class="effect-row" style="display:none;">
                    <span class="effect-label" data-i18n="shader.postfx.volumetricLight">VLight</span>
                    <input data-postfx="vls-exposure" type="range" class="effect-slider" min="0" max="200" value="30" step="1">
                    <span data-postfx-val="vls-exposure" class="effect-value" data-i18n="status.off">OFF</span>
                </div>
                <div class="effect-row">
                    <span class="effect-label" data-i18n="shader.postfx.edge">Edge</span>
                    <input data-postfx="edge-width" type="range" class="effect-slider" min="0" max="200" value="0" step="1">
                    <span data-postfx-val="edge-width" class="effect-value">0%</span>
                </div>
                <div class="effect-row effect-row-check">
                    <span class="effect-label" data-i18n="shader.postfx.lut">LUT</span>
                    <label class="effect-check-wrap">
                        <input data-postfx-check="lut" type="checkbox" class="effect-check">
                        <span data-i18n="status.on">On</span>
                    </label>
                    <select data-postfx-select="lut-preset" class="effect-select">
                        ${lutPresetOptionsHtml}
                    </select>
                    <span data-postfx-val="lut" class="effect-value" data-i18n="status.off">OFF</span>
                </div>
                <div class="effect-row">
                    <span class="effect-label" data-i18n="shader.postfx.lutIntensity">LUTInt</span>
                    <input data-postfx="lut-intensity" type="range" class="effect-slider" min="0" max="100" value="100" step="1">
                    <span data-postfx-val="lut-intensity" class="effect-value">1.00</span>
                </div>
                <div class="effect-row effect-row-toggle">
                    <span class="effect-label" data-i18n="shader.postfx.bloom">Bloom</span>
                    <label class="effect-check-wrap">
                        <input data-postfx-check="bloom" type="checkbox" class="effect-check">
                        <span data-i18n="status.on">On</span>
                    </label>
                    <span data-postfx-val="bloom-enabled" class="effect-value" data-i18n="status.off">OFF</span>
                </div>
                <div class="effect-row">
                    <span class="effect-label" data-i18n="label.bloomStrength">Bloom���x</span>
                    <input data-postfx="bloom-weight" type="range" class="effect-slider" min="0" max="200" value="100" step="1">
                    <span data-postfx-val="bloom-weight" class="effect-value" data-i18n="status.off">OFF</span>
                </div>
                <div class="effect-row">
                    <span class="effect-label" data-i18n="shader.postfx.bloomThreshold">BloomTh</span>
                    <input data-postfx="bloom-threshold" type="range" class="effect-slider" min="0" max="200" value="100" step="1">
                    <span data-postfx-val="bloom-threshold" class="effect-value">1.00</span>
                </div>
                <div class="effect-row">
                    <span class="effect-label" data-i18n="shader.postfx.bloomKernel">BloomK</span>
                    <input data-postfx="bloom-kernel" type="range" class="effect-slider" min="1" max="256" value="100" step="1">
                    <span data-postfx-val="bloom-kernel" class="effect-value">100</span>
                </div>
                <div class="effect-row">
                    <span class="effect-label" data-i18n="shader.postfx.toneMap">ToneMap</span>
                    <select data-postfx-select="tone-mapping-type" class="effect-select">
                        <option value="-1" data-i18n="option.none">None</option>
                        <option value="0" data-i18n="shader.option.standard">Standard</option>
                        <option value="1" data-i18n="shader.option.aces">ACES</option>
                        <option value="2" data-i18n="shader.option.neutral">Neutral</option>
                    </select>
                    <span data-postfx-val="tone-mapping" class="effect-value" data-i18n="option.none">None</span>
                </div>
            </div>
        `;
        applyI18nToDom(this.shaderMaterialList);

        const postFxControls = this.shaderMaterialList.querySelector<HTMLElement>(".shader-postfx-controls");
        if (
            !postFxControls ||
            !this.colorPostFxController?.connect(postFxControls) ||
            !this.lutPanelController?.connect(postFxControls) ||
            !this.modelEdgeController?.connect(postFxControls) ||
            !this.lensEffectController?.connect(postFxControls) ||
            !this.bloomToneMapController?.connect(postFxControls) ||
            !this.experimentalPostFxController?.connect(postFxControls)
        ) {
            return;
        }
        this.dofPanelController?.attachControlsToShaderPanel(postFxControls);
        this.installRangeNumberInputs(postFxControls);
    }

    private applyLocalizedUiState(): void {
        this.sceneEnvironmentUiController?.refresh();
        this.runtimeFeatureUiController?.refresh();
        this.layoutUiController?.refreshLocalizedState();
        this.updateInfoActionButtons();
        this.exportUiController?.refreshLocalizedState();
        this.fogPanelController?.refresh();
        this.syncToolbarLocaleSelect();
    }

    private getSelectedToolbarLocale(): UiLocale | null {
        if (!this.toolbarLocaleSelect) return null;
        const value = this.toolbarLocaleSelect.value;
        return value === "ja"
            || value === "en"
            || value === "zh-Hant"
            || value === "zh-Hans"
            || value === "ko"
            ? value
            : null;
    }

    private syncToolbarLocaleSelect(): void {
        if (!this.toolbarLocaleSelect) return;
        const locale = getLocale();
        if (this.toolbarLocaleSelect.value !== locale) {
            this.toolbarLocaleSelect.value = locale;
        }
    }

    private refreshLightingUiFromRuntime(): void {
        const setSliderValue = (
            sliderId: string,
            valueId: string,
            rawValue: number,
            formatter: (value: number) => string,
        ): void => {
            const slider = document.getElementById(sliderId) as HTMLInputElement | null;
            const valueEl = document.getElementById(valueId);
            if (!slider || !valueEl) return;

            const normalized = this.normalizeRangeInputValue(slider, rawValue);
            slider.value = this.formatRangeInputValue(slider, normalized);
            valueEl.textContent = formatter(rawValue);
            this.syncRangeNumberInput(slider);
        };

        const lightDirection = this.mmdManager.getSerializedLightDirection();
        setSliderValue("light-direction-x", "light-direction-x-val", lightDirection.x, (value) => value.toFixed(2));
        setSliderValue("light-direction-y", "light-direction-y-val", lightDirection.y, (value) => value.toFixed(2));
        setSliderValue("light-direction-z", "light-direction-z-val", lightDirection.z, (value) => value.toFixed(2));
        setSliderValue("light-intensity", "light-intensity-val", this.mmdManager.lightIntensity * 100, (value) => (value / 100).toFixed(1));
        setSliderValue("light-ambient", "light-ambient-val", this.mmdManager.ambientIntensity * 100, (value) => (value / 100).toFixed(1));

        const lightColor = this.mmdManager.getLightColor();
        setSliderValue("light-color-r", "light-color-r-val", lightColor.r * 127.5, (value) => `${Math.round((value / 127.5) * 100)}%`);
        setSliderValue("light-color-g", "light-color-g-val", lightColor.g * 127.5, (value) => `${Math.round((value / 127.5) * 100)}%`);
        setSliderValue("light-color-b", "light-color-b-val", lightColor.b * 127.5, (value) => `${Math.round((value / 127.5) * 100)}%`);
        setSliderValue("light-flat-strength", "light-flat-strength-val", this.mmdManager.lightFlatStrength * 100, (value) => `${Math.round(value)}%`);
        setSliderValue(
            "light-flat-color-influence",
            "light-flat-color-influence-val",
            this.mmdManager.lightFlatColorInfluence * 100,
            (value) => `${Math.round(value)}%`,
        );

        const shadowColor = this.mmdManager.getShadowColor();
        setSliderValue("light-shadow", "light-shadow-val", this.mmdManager.shadowDarkness * 100, (value) => (value / 100).toFixed(2));
        setSliderValue("light-shadow-frustum-size", "light-shadow-frustum-size-val", this.mmdManager.shadowFrustumSize, (value) => String(Math.round(value)));
        setSliderValue("light-shadow-max-z", "light-shadow-max-z-val", this.mmdManager.shadowMaxZ, (value) => String(Math.round(value)));
        setSliderValue("light-shadow-bias", "light-shadow-bias-val", this.mmdManager.shadowBias * 1_000_000, (value) => (value / 1_000_000).toFixed(5));
        setSliderValue("light-shadow-normal-bias", "light-shadow-normal-bias-val", this.mmdManager.shadowNormalBias * 100_000, (value) => (value / 100_000).toFixed(5));
        setSliderValue("light-shadow-color-r", "light-shadow-color-r-val", shadowColor.r * 255, (value) => String(Math.round(value)));
        setSliderValue("light-shadow-color-g", "light-shadow-color-g-val", shadowColor.g * 255, (value) => String(Math.round(value)));
        setSliderValue("light-shadow-color-b", "light-shadow-color-b-val", shadowColor.b * 255, (value) => String(Math.round(value)));
        setSliderValue(
            "light-toon-shadow-influence",
            "light-toon-shadow-influence-val",
            this.mmdManager.toonShadowInfluence * 100,
            (value) => `${Math.round(value)}%`,
        );
        setSliderValue(
            "light-self-shadow-softness",
            "light-self-shadow-softness-val",
            this.mmdManager.selfShadowEdgeSoftness * 1000,
            (value) => (value / 1000).toFixed(3),
        );
        setSliderValue(
            "light-occlusion-shadow-softness",
            "light-occlusion-shadow-softness-val",
            this.mmdManager.occlusionShadowEdgeSoftness * 1000,
            (value) => (value / 1000).toFixed(3),
        );
    }

    private handleCameraControlEdited(): void {
        this.bottomPanel.syncSelectedBoneSlidersFromRuntime();
        this.markSectionKeyframeDirty("bone", this.getBoneKeyframeContextKey("Camera"));
        this.updateSectionKeyframeButtons();
        this.dofPanelController?.refreshAutoFocusReadout();
    }

    private refreshCameraUiFromRuntime(force = false): void {
        this.cameraPanelController?.refresh(force);
        this.lensEffectController?.refresh();
        this.fogPanelController?.refresh();
    }

    private getSelectedTimelineTrack(): KeyframeTrack | null {
        const track = this.timeline.getSelectedTrack();
        if (!track) return null;
        return track;
    }

    private getTrackTypeLabel(track: Pick<KeyframeTrack, "category">): string {
        switch (track.category) {
            case "camera":
                return "Camera";
            case "morph":
                return "Morph";
            case "root":
            case "semi-standard":
            case "bone":
                return "Bone";
            default:
                return "Property";
        }
    }

    private isBoneTrackForEditor(track: KeyframeTrack | null): track is KeyframeTrack {
        if (!track) return false;
        return track.category === "root" || track.category === "semi-standard" || track.category === "bone" || track.category === "camera";
    }

    private syncBottomBoneSelectionFromTimeline(track: KeyframeTrack | null): void {
        if (this.mmdManager.getTimelineTarget() !== "model") return;
        if (this.syncingBoneSelection) return;

        this.syncingBoneSelection = true;
        try {
            if (this.isBoneTrackForEditor(track)) {
                this.selectedBoneTrackCategory = track.category;
                this.bottomPanel.setSelectedBone(track.name);
            } else {
                this.selectedBoneTrackCategory = null;
                this.bottomPanel.clearSelectedBone();
            }
        } finally {
            this.syncingBoneSelection = false;
        }
    }

    private syncTimelineBoneSelectionFromBottomPanel(boneName: string | null): void {
        if (!boneName) return;
        if (this.mmdManager.getTimelineTarget() !== "model") return;
        if (this.syncingBoneSelection) return;

        this.mmdManager.setBoneVisualizerSelectedBone(boneName);
        this.syncingBoneSelection = true;
        try {
            const fallbackCategories: TrackCategory[] = boneName === "Camera"
                ? ["camera", "bone", "semi-standard", "root"]
                : ["bone", "semi-standard", "root"];
            const preferredCategories: TrackCategory[] = this.selectedBoneTrackCategory
                ? [
                    this.selectedBoneTrackCategory,
                    ...fallbackCategories.filter((category) => category !== this.selectedBoneTrackCategory),
                ]
                : fallbackCategories;
            if (this.timeline.selectTrackByNameAndCategory(boneName, preferredCategories)) {
                const selectedTrack = this.timeline.getSelectedTrack();
                this.selectedBoneTrackCategory = this.isBoneTrackForEditor(selectedTrack) ? selectedTrack.category : null;
            }
        } finally {
            this.syncingBoneSelection = false;
        }
    }

    private syncBoneVisualizerSelection(track: KeyframeTrack | null): void {
        if (this.mmdManager.getTimelineTarget() !== "model") {
            this.selectedBoneTrackCategory = null;
            this.mmdManager.setBoneVisualizerSelectedBone(null);
            return;
        }

        if (this.isBoneTrackForEditor(track)) {
            this.selectedBoneTrackCategory = track.category;
            this.mmdManager.setBoneVisualizerSelectedBone(track.name);
            return;
        }

        this.selectedBoneTrackCategory = null;
        this.mmdManager.setBoneVisualizerSelectedBone(null);
    }

    private refreshSelectedTrackRotationOverlay(): void {
        const track = this.getSelectedTimelineTrack();
        if (!this.isRotationOverlayTrack(track)) {
            this.timeline.setSelectedTrackRotationOverlay(null);
            return;
        }

        this.timeline.setSelectedTrackRotationOverlay(this.buildSelectedTrackRotationOverlay(track));
    }

    private isRotationOverlayTrack(track: KeyframeTrack | null): track is KeyframeTrack {
        if (!track) return false;
        return track.category === "root"
            || track.category === "semi-standard"
            || track.category === "bone"
            || track.category === "camera";
    }

    private buildSelectedTrackRotationOverlay(track: KeyframeTrack): TimelineRotationOverlay | null {
        if (track.frames.length === 0) return null;

        const managerInternal = this.mmdManager as unknown as Partial<MmdManagerInternalView>;

        if (track.category === "camera") {
            const cameraTrack = managerInternal.cameraSourceAnimation?.cameraTrack;
            if (!cameraTrack) return null;

            const firstFrame = Math.max(0, Math.floor(track.frames[0] ?? 0));
            const lastFrame = Math.max(firstFrame, Math.floor(track.frames[track.frames.length - 1] ?? firstFrame));
            const sampleCount = lastFrame - firstFrame + 1;
            if (sampleCount <= 0) return null;

            const frames = new Uint32Array(sampleCount);
            const x = new Float32Array(sampleCount);
            const y = new Float32Array(sampleCount);
            const z = new Float32Array(sampleCount);
            let maxAbsValue = 0;

            for (let i = 0; i < sampleCount; i += 1) {
                const frame = firstFrame + i;
                const pose = this.sampleCameraPoseFromTrack(cameraTrack, frame);
                const rotation = pose?.rotation ?? { x: 0, y: 0, z: 0 };

                frames[i] = frame;
                x[i] = rotation.x;
                y[i] = rotation.y;
                z[i] = rotation.z;
                maxAbsValue = Math.max(maxAbsValue, Math.abs(rotation.x), Math.abs(rotation.y), Math.abs(rotation.z));
            }

            return {
                trackName: track.name,
                trackCategory: track.category,
                frames,
                x,
                y,
                z,
                maxAbsValue,
            };
        }

        const currentModel = managerInternal.currentModel;
        if (!currentModel) return null;

        const modelAnimation = managerInternal.modelSourceAnimationsByModel?.get(currentModel as object);
        if (!modelAnimation) return null;

        const movableTrack = modelAnimation.movableBoneTracks.find((runtimeTrack) => runtimeTrack.name === track.name) ?? null;
        const boneTrack = modelAnimation.boneTracks.find((runtimeTrack) => runtimeTrack.name === track.name) ?? null;
        if (!movableTrack && !boneTrack) return null;

        const firstFrame = Math.max(0, Math.floor(track.frames[0] ?? 0));
        const lastFrame = Math.max(firstFrame, Math.floor(track.frames[track.frames.length - 1] ?? firstFrame));
        const sampleCount = lastFrame - firstFrame + 1;
        if (sampleCount <= 0) return null;

        const frames = new Uint32Array(sampleCount);
        const x = new Float32Array(sampleCount);
        const y = new Float32Array(sampleCount);
        const z = new Float32Array(sampleCount);
        let maxAbsValue = 0;

        for (let i = 0; i < sampleCount; i += 1) {
            const frame = firstFrame + i;
            const pose = movableTrack
                ? this.sampleMovableBonePoseFromTrack(movableTrack, frame)
                : this.sampleBonePoseFromTrack(boneTrack, frame);
            const rotation = pose?.rotation ?? { x: 0, y: 0, z: 0 };

            frames[i] = frame;
            x[i] = rotation.x;
            y[i] = rotation.y;
            z[i] = rotation.z;
            maxAbsValue = Math.max(maxAbsValue, Math.abs(rotation.x), Math.abs(rotation.y), Math.abs(rotation.z));
        }

        return {
            trackName: track.name,
            trackCategory: track.category,
            frames,
            x,
            y,
            z,
            maxAbsValue,
        };
    }

    private updateTimelineEditState(): void {
        const track = this.getSelectedTimelineTrack();
        const selectedFrame = this.timeline.getSelectedFrame();
        const currentFrame = this.mmdManager.currentFrame;

        if (!track) {
            if (this.timelineSelectionLabel) {
                this.timelineSelectionLabel.textContent = "No track selected";
            }
            this.interpolationTrackNameLabel.textContent = "-";
            this.interpolationFrameLabel.textContent = "-";
            this.resetInterpolationTypeSelect();
            this.interpolationStatusLabel.textContent = "No track selected";
            this.currentInterpolationPreview = null;
            this.renderInterpolationCurves(null);
            this.updateInterpolationActionButtons();
            this.btnKeyframeAdd.disabled = true;
            this.btnKeyframeDelete.disabled = true;
            this.btnKeyframeNudgeLeft.disabled = false;
            this.btnKeyframeNudgeRight.disabled = false;
            this.updateSectionKeyframeButtons();
            return;
        }

        const frameLabel = selectedFrame !== null ? ` @${selectedFrame}` : "";
        const trackTypeLabel = this.getTrackTypeLabel(track);
        if (this.timelineSelectionLabel) {
            this.timelineSelectionLabel.textContent = `[${trackTypeLabel}] ${track.name}${frameLabel}`;
        }
        const interpolationFrame = selectedFrame ?? currentFrame;
        this.interpolationTrackNameLabel.textContent = `${trackTypeLabel}: ${track.name}`;
        this.interpolationFrameLabel.textContent = String(interpolationFrame);
        this.updateInterpolationPreview(track, interpolationFrame);
        this.btnKeyframeAdd.disabled = false;

        const hasCurrentFrameKey = this.mmdManager.hasTimelineKeyframe(track, currentFrame);
        const canDelete = selectedFrame !== null || hasCurrentFrameKey;
        this.btnKeyframeDelete.disabled = !canDelete;

        this.btnKeyframeNudgeLeft.disabled = false;
        this.btnKeyframeNudgeRight.disabled = false;
        this.updateSectionKeyframeButtons();
    }

    private updateSectionKeyframeButtons(): void {
        this.setSectionKeyframeButtonState(this.btnInfoKeyframe, this.getInfoKeyframeButtonState());
        this.setSectionKeyframeButtonState(this.btnInterpolationKeyframe, this.getInterpolationKeyframeButtonState());
        this.setSectionKeyframeButtonState(this.btnBoneKeyframe, this.getBoneKeyframeButtonState());
        this.setSectionKeyframeButtonState(this.btnMorphKeyframe, this.getMorphKeyframeButtonState());
        this.setSectionKeyframeButtonState(this.btnAccessoryKeyframe, this.getAccessoryKeyframeButtonState());
    }

    private setSectionKeyframeButtonState(button: HTMLButtonElement | null, state: SectionKeyframeButtonState): void {
        if (!button) return;

        button.classList.remove("is-none", "is-empty", "is-registered");
        button.hidden = this.mmdManager.isPlaying;
        if (this.mmdManager.isPlaying) {
            button.disabled = true;
            button.textContent = "";
            return;
        }
        button.disabled = state === "none";
        button.textContent = state === "registered" ? "♦" : state === "dirty" ? "♢" : "";
        if (state === "none") {
            button.classList.add("is-none");
        } else if (state === "dirty") {
            button.classList.add("is-empty");
        } else {
            button.classList.add("is-registered");
        }
    }

    private markSectionKeyframeDirty(section: SectionKeyframeSection, contextKey: string | null): void {
        if (!contextKey) return;
        this.sectionKeyframeDirtyKeys[section].add(contextKey);
    }

    private clearSectionKeyframeDirty(section: SectionKeyframeSection, contextKey: string | null): void {
        if (!contextKey) return;
        this.sectionKeyframeDirtyKeys[section].delete(contextKey);
    }

    private clearTransientEditingStateForFrameChange(): void {
        for (const section of Object.keys(this.sectionKeyframeDirtyKeys) as SectionKeyframeSection[]) {
            this.sectionKeyframeDirtyKeys[section].clear();
        }
        this.pendingBonePoseSnapshots.clear();
        this.debugKeyframeFlow("cleared transient editing state for frame change");
        this.updateSectionKeyframeButtons();
    }

    private rememberEditedBonePoseSnapshot(
        boneName: string | null,
        snapshotOverride: SelectedBonePoseSnapshot | null = null,
    ): void {
        if (!boneName) return;
        const snapshot = snapshotOverride ?? this.captureCurrentBonePoseSnapshot(boneName);
        if (!snapshot) return;
        this.pendingBonePoseSnapshots.set(boneName, {
            frame: this.mmdManager.currentFrame,
            snapshot,
        });
        this.debugKeyframeFlow("remember edited bone pose", {
            boneName,
            frame: this.mmdManager.currentFrame,
            snapshot,
            snapshotText: this.formatPoseSnapshotText(snapshot),
        });
    }

    private captureCurrentBonePoseSnapshot(boneName: string): SelectedBonePoseSnapshot | null {
        if (boneName === "Camera") {
            const snapshot = {
                position: this.mmdManager.getCameraPosition(),
                rotation: this.mmdManager.getCameraRotation(),
                target: this.mmdManager.getCameraTarget(),
                distance: this.mmdManager.getCameraDistance(),
                fov: this.mmdManager.getCameraFov(),
            };
            this.debugKeyframeFlow("capture camera pose snapshot", {
                boneName,
                snapshot: this.formatBonePoseSnapshotForLog(snapshot),
            });
            return snapshot;
        }

        const pendingSnapshot = this.getPendingBonePoseSnapshot(boneName);
        if (pendingSnapshot) {
            this.debugKeyframeFlow("capture bone pose snapshot from pending", {
                boneName,
                snapshot: this.formatBonePoseSnapshotForLog(pendingSnapshot),
            });
            return pendingSnapshot;
        }

        const panelSnapshot = this.bottomPanel.getSelectedBoneTransformSnapshot();
        if (panelSnapshot && this.bottomPanel.getSelectedBone() === boneName) {
            this.debugKeyframeFlow("capture bone pose snapshot from panel", {
                boneName,
                snapshot: this.formatBonePoseSnapshotForLog(panelSnapshot),
            });
            return panelSnapshot;
        }

        const managerSnapshot = this.mmdManager.getBoneTransform(boneName);
        if (managerSnapshot) {
            this.debugKeyframeFlow("capture bone pose snapshot from manager", {
                boneName,
                snapshot: this.formatBonePoseSnapshotForLog(managerSnapshot),
            });
            return managerSnapshot;
        }

        return null;
    }

    private getPendingBonePoseSnapshot(boneName: string | null, frame = this.mmdManager.currentFrame): SelectedBonePoseSnapshot | null {
        if (!boneName) return null;
        const entry = this.pendingBonePoseSnapshots.get(boneName);
        if (!entry) return null;
        const normalizedFrame = Math.max(0, Math.floor(frame));
        if (entry.frame !== normalizedFrame) {
            this.debugKeyframeFlow("pending bone pose miss by frame", { boneName, frame: normalizedFrame, pendingFrame: entry.frame });
            return null;
        }
        this.debugKeyframeFlow("pending bone pose hit", { boneName, frame: normalizedFrame, snapshot: entry.snapshot });
        return entry.snapshot;
    }

    private syncBottomPanelBoneFromEditedPose(boneName: string | null): void {
        if (!boneName) return;
        const snapshot = this.getPendingBonePoseSnapshot(boneName);
        if (snapshot) {
            this.debugKeyframeFlow("sync bottom panel from edited pose", { boneName, snapshot });
            this.bottomPanel.syncSelectedBoneSlidersFromSnapshot(snapshot, true);
            return;
        }
        this.debugKeyframeFlow("sync bottom panel from runtime pose", { boneName });
        this.bottomPanel.syncSelectedBoneSlidersFromRuntime(true);
    }

    private formatBonePoseSnapshotForLog(snapshot: SelectedBonePoseSnapshot): {
        position: { x: number; y: number; z: number };
        rotation: { x: number; y: number; z: number };
        target?: { x: number; y: number; z: number };
        distance?: number;
        fov?: number;
    } {
        const round = (value: number): number => Math.round(value * 1000) / 1000;
        return {
            position: {
                x: round(snapshot.position.x),
                y: round(snapshot.position.y),
                z: round(snapshot.position.z),
            },
            rotation: {
                x: round(snapshot.rotation.x),
                y: round(snapshot.rotation.y),
                z: round(snapshot.rotation.z),
            },
            ...(snapshot.target ? {
                target: {
                    x: round(snapshot.target.x),
                    y: round(snapshot.target.y),
                    z: round(snapshot.target.z),
                },
            } : {}),
            ...(typeof snapshot.distance === "number" ? { distance: round(snapshot.distance) } : {}),
            ...(typeof snapshot.fov === "number" ? { fov: round(snapshot.fov) } : {}),
        };
    }

    private formatNumberBlockForLog(values: ArrayLike<number> | readonly number[], precision = 3): string {
        const factor = 10 ** precision;
        return `[${Array.from(values, (value) => {
            const normalized = Number.isFinite(value) ? value : 0;
            return Math.round(normalized * factor) / factor;
        }).join(", ")}]`;
    }

    private formatPoseSnapshotText(snapshot: SelectedBonePoseSnapshot | null): string | null {
        if (!snapshot) return null;
        const formatted = this.formatBonePoseSnapshotForLog(snapshot);
        const parts = [
            `pos=${this.formatNumberBlockForLog([formatted.position.x, formatted.position.y, formatted.position.z])}`,
            `rot=${this.formatNumberBlockForLog([formatted.rotation.x, formatted.rotation.y, formatted.rotation.z])}`,
        ];
        if (formatted.distance !== undefined) {
            parts.push(`dist=${formatted.distance}`);
        }
        if (formatted.fov !== undefined) {
            parts.push(`fov=${formatted.fov}`);
        }
        return parts.join(" ");
    }

    private getDisplayBonePoseSnapshot(frame: number): SelectedBonePoseSnapshot | null {
        const boneName = this.bottomPanel.getSelectedBone();
        if (!boneName) {
            const source = this.getSelectedBonePoseSnapshotFromSource(frame);
            this.debugKeyframeFlow("display pose from source (no selected bone)", { frame, source });
            return source;
        }

        const pendingSnapshot = this.getPendingBonePoseSnapshot(boneName, frame);
        if (pendingSnapshot) {
            this.debugKeyframeFlow("display pose from pending snapshot", { boneName, frame, snapshot: pendingSnapshot });
            return pendingSnapshot;
        }

        const source = this.getSelectedBonePoseSnapshotFromSource(frame);
        this.debugKeyframeFlow("display pose from source", { boneName, frame, source });
        return source;
    }

    private applySelectedBonePoseSnapshotToRuntime(frame: number, snapshot: SelectedBonePoseSnapshot | null): void {
        if (this.mmdManager.isPlaying) return;

        const boneName = this.bottomPanel.getSelectedBone();
        if (!boneName || !snapshot) return;

        if (boneName === "Camera") {
            const target = snapshot.target ?? this.computeCameraTargetFromViewportSnapshot(snapshot);
            this.mmdManager.applyCameraTrackPose(
                target,
                snapshot.rotation,
                snapshot.distance ?? this.mmdManager.getCameraDistance(),
                snapshot.fov,
            );
            return;
        }

        this.debugKeyframeFlow("apply sampled pose to runtime", {
            boneName,
            frame,
            snapshot,
            snapshotText: this.formatPoseSnapshotText(snapshot),
        });
        this.mmdManager.setBoneTranslation(
            boneName,
            snapshot.position.x,
            snapshot.position.y,
            snapshot.position.z,
            false,
        );
        this.mmdManager.setBoneRotation(
            boneName,
            snapshot.rotation.x,
            snapshot.rotation.y,
            snapshot.rotation.z,
            false,
        );
    }

    private getSectionKeyframeContextPrefix(section: SectionKeyframeSection): string {
        return section;
    }

    private getInfoKeyframeContextKey(): string | null {
        if (this.mmdManager.getTimelineTarget() !== "model") return null;
        const model = this.mmdManager.getLoadedModels().find((item) => item.active) ?? null;
        if (!model) return null;
        const modelKey = model.path || model.name || String(model.index);
        return `${this.getSectionKeyframeContextPrefix("info")}:${modelKey}:frame:${this.mmdManager.currentFrame}`;
    }

    private getInterpolationKeyframeContextKey(track: KeyframeTrack | null = null): string | null {
        const selectedTrack = track ?? this.getSelectedTimelineTrack();
        if (!selectedTrack) return null;
        if (selectedTrack.category === "morph") return null;
        return `${this.getSectionKeyframeContextPrefix("interpolation")}:${selectedTrack.category}:${selectedTrack.name}:frame:${this.mmdManager.currentFrame}`;
    }

    private getBoneKeyframeContextKey(boneName: string | null = this.bottomPanel.getSelectedBone()): string | null {
        if (!boneName) return null;
        return `${this.getSectionKeyframeContextPrefix("bone")}:${boneName}:frame:${this.mmdManager.currentFrame}`;
    }

    private getMorphKeyframeContextKey(frameIndex: number | null = this.bottomPanel.getSelectedMorphFrameIndex()): string | null {
        if (frameIndex === null || frameIndex < 0) return null;
        return `${this.getSectionKeyframeContextPrefix("morph")}:frame:${frameIndex}:key:${this.mmdManager.currentFrame}`;
    }

    private getAccessoryKeyframeContextKey(
        accessoryIndex: number | null = this.accessoryPanelController?.getSelectedAccessoryIndex() ?? null,
    ): string | null {
        if (accessoryIndex === null || accessoryIndex < 0) return null;
        return `${this.getSectionKeyframeContextPrefix("accessory")}:${accessoryIndex}:frame:${this.mmdManager.currentFrame}`;
    }

    private getSelectedBonePoseSnapshotFromSource(frame: number): SelectedBonePoseSnapshot | null {
        const boneName = this.bottomPanel.getSelectedBone();
        if (!boneName) return null;

        const normalizedFrame = Math.max(0, Math.floor(frame));
        const managerInternal = this.mmdManager as unknown as Partial<MmdManagerInternalView>;

        if (boneName === "Camera") {
            const cameraTrack = managerInternal.cameraSourceAnimation?.cameraTrack;
            if (!cameraTrack) return null;
            return this.sampleCameraPoseFromTrack(cameraTrack, normalizedFrame);
        }

        const currentModel = managerInternal.currentModel;
        if (!currentModel) return null;

        const modelAnimation = managerInternal.modelSourceAnimationsByModel?.get(currentModel as object);
        if (!modelAnimation) {
            this.debugKeyframeFlow("source pose fallback to animated runtime (no model animation)", { boneName, frame });
            return this.mmdManager.getAnimatedBoneTransform(boneName);
        }

        const movableTrack = modelAnimation.movableBoneTracks.find((track) => track.name === boneName) ?? null;
        if (movableTrack) {
            const sampled = this.sampleMovableBonePoseFromTrack(movableTrack, normalizedFrame);
            if (sampled) {
                this.debugKeyframeFlow("source pose sampled from movable track", {
                    boneName,
                    frame: normalizedFrame,
                    trackFrameNumbers: Array.from(movableTrack.frameNumbers),
                    trackFrameNumbersText: this.formatNumberBlockForLog(movableTrack.frameNumbers, 0),
                    sampled: this.formatBonePoseSnapshotForLog(sampled),
                    sampledText: this.formatPoseSnapshotText(sampled),
                });
                return sampled;
            }
        }

        const boneTrack = modelAnimation.boneTracks.find((track) => track.name === boneName) ?? null;
        if (boneTrack) {
            const sampled = this.sampleBonePoseFromTrack(boneTrack, normalizedFrame);
            if (sampled) {
                this.debugKeyframeFlow("source pose sampled from bone track", {
                    boneName,
                    frame: normalizedFrame,
                    trackFrameNumbers: Array.from(boneTrack.frameNumbers),
                    trackFrameNumbersText: this.formatNumberBlockForLog(boneTrack.frameNumbers, 0),
                    sampled: this.formatBonePoseSnapshotForLog(sampled),
                    sampledText: this.formatPoseSnapshotText(sampled),
                });
                return sampled;
            }
        }

        this.debugKeyframeFlow("source pose fallback to animated runtime", { boneName, frame });
        return this.mmdManager.getAnimatedBoneTransform(boneName);
    }

    private computeCameraTargetFromViewportSnapshot(snapshot: SelectedBonePoseSnapshot): Vector3 {
        const xRad = (snapshot.rotation.x * Math.PI) / 180;
        const yRad = (snapshot.rotation.y * Math.PI) / 180;
        const zRad = (snapshot.rotation.z * Math.PI) / 180;
        const rotation = Matrix.RotationYawPitchRoll(-yRad, -xRad, -zRad);
        const distance = Math.max(0.0001, snapshot.distance ?? this.mmdManager.getCameraDistance());
        const offset = Vector3.TransformNormal(new Vector3(0, 0, distance), rotation);
        return new Vector3(snapshot.position.x, snapshot.position.y, snapshot.position.z).add(offset);
    }

    private computeViewportCameraPositionFromTrackPose(
        target: Vector3,
        rotationDeg: { x: number; y: number; z: number },
        trackDistance: number,
    ): Vector3 {
        const xRad = (rotationDeg.x * Math.PI) / 180;
        const yRad = (rotationDeg.y * Math.PI) / 180;
        const zRad = (rotationDeg.z * Math.PI) / 180;
        const rotation = Matrix.RotationYawPitchRoll(-yRad, -xRad, -zRad);
        const offset = Vector3.TransformNormal(new Vector3(0, 0, trackDistance), rotation);
        return target.add(offset);
    }

    private sampleCameraPoseFromTrack(track: RuntimeCameraTrackLike, frame: number): SelectedBonePoseSnapshot | null {
        const frameNumbers = track.frameNumbers;
        if (!frameNumbers || frameNumbers.length === 0) return null;

        const clampedFrame = this.clampFrameToTrackRange(frame, frameNumbers);
        const upperBoundIndex = this.findUpperBoundFrameIndex(frameNumbers, clampedFrame);
        const lowerIndex = Math.max(0, upperBoundIndex - 1);

        const lowerFrame = frameNumbers[lowerIndex] ?? frameNumbers[0] ?? clampedFrame;
        const upperFrame = frameNumbers[upperBoundIndex];
        if (upperFrame === undefined || lowerFrame + 1 === upperFrame) {
            const position = this.readFloatBlock(track.positions, lowerIndex, 3, [0, 0, 0]);
            const rotation = this.readFloatBlock(track.rotations, lowerIndex, 3, [0, 0, 0]);
            const distance = this.readFloatBlock(track.distances, lowerIndex, 1, [this.mmdManager.getCameraDistance()]);
            const fov = this.readFloatBlock(track.fovs, lowerIndex, 1, [this.mmdManager.getCameraFov()]);
            const rotationDeg = {
                x: rotation[0] * (180 / Math.PI),
                y: rotation[1] * (180 / Math.PI),
                z: rotation[2] * (180 / Math.PI),
            };
            const target = new Vector3(position[0], position[1], position[2]);
            const viewportPosition = this.computeViewportCameraPositionFromTrackPose(target, rotationDeg, distance[0]);
            return {
                position: { x: viewportPosition.x, y: viewportPosition.y, z: viewportPosition.z },
                rotation: rotationDeg,
                target: { x: target.x, y: target.y, z: target.z },
                distance: Math.abs(distance[0]),
                fov: fov[0],
            };
        }

        const gradient = (clampedFrame - lowerFrame) / (upperFrame - lowerFrame);
        const positionA = this.readFloatBlock(track.positions, lowerIndex, 3, [0, 0, 0]);
        const positionB = this.readFloatBlock(track.positions, upperBoundIndex, 3, positionA);
        const rotationA = this.readFloatBlock(track.rotations, lowerIndex, 3, [0, 0, 0]);
        const rotationB = this.readFloatBlock(track.rotations, upperBoundIndex, 3, rotationA);
        const distanceA = this.readFloatBlock(track.distances, lowerIndex, 1, [this.mmdManager.getCameraDistance()]);
        const distanceB = this.readFloatBlock(track.distances, upperBoundIndex, 1, distanceA);
        const fovA = this.readFloatBlock(track.fovs, lowerIndex, 1, [this.mmdManager.getCameraFov()]);
        const fovB = this.readFloatBlock(track.fovs, upperBoundIndex, 1, fovA);

        const positionInterpolation = this.readFloatBlock(
            track.positionInterpolations,
            upperBoundIndex,
            12,
            [20, 107, 20, 107, 20, 107, 20, 107, 20, 107, 20, 107],
        );
        const positionWeightX = this.bezierInterpolate(
            positionInterpolation[0] / 127,
            positionInterpolation[1] / 127,
            positionInterpolation[2] / 127,
            positionInterpolation[3] / 127,
            gradient,
        );
        const positionWeightY = this.bezierInterpolate(
            positionInterpolation[4] / 127,
            positionInterpolation[5] / 127,
            positionInterpolation[6] / 127,
            positionInterpolation[7] / 127,
            gradient,
        );
        const positionWeightZ = this.bezierInterpolate(
            positionInterpolation[8] / 127,
            positionInterpolation[9] / 127,
            positionInterpolation[10] / 127,
            positionInterpolation[11] / 127,
            gradient,
        );
        const rotationInterp = this.readFloatBlock(track.rotationInterpolations, upperBoundIndex, 4, [20, 107, 20, 107]);
        const rotationWeight = this.bezierInterpolate(
            rotationInterp[0] / 127,
            rotationInterp[1] / 127,
            rotationInterp[2] / 127,
            rotationInterp[3] / 127,
            gradient,
        );
        const distanceInterp = this.readFloatBlock(track.distanceInterpolations, upperBoundIndex, 4, [20, 107, 20, 107]);
        const distanceWeight = this.bezierInterpolate(
            distanceInterp[0] / 127,
            distanceInterp[1] / 127,
            distanceInterp[2] / 127,
            distanceInterp[3] / 127,
            gradient,
        );
        const fovInterp = this.readFloatBlock(track.fovInterpolations, upperBoundIndex, 4, [20, 107, 20, 107]);
        const fovWeight = this.bezierInterpolate(
            fovInterp[0] / 127,
            fovInterp[1] / 127,
            fovInterp[2] / 127,
            fovInterp[3] / 127,
            gradient,
        );

        const target = new Vector3(
            positionA[0] + (positionB[0] - positionA[0]) * positionWeightX,
            positionA[1] + (positionB[1] - positionA[1]) * positionWeightY,
            positionA[2] + (positionB[2] - positionA[2]) * positionWeightZ,
        );
        const rotationDeg = {
            x: (rotationA[0] + (rotationB[0] - rotationA[0]) * rotationWeight) * (180 / Math.PI),
            y: (rotationA[1] + (rotationB[1] - rotationA[1]) * rotationWeight) * (180 / Math.PI),
            z: (rotationA[2] + (rotationB[2] - rotationA[2]) * rotationWeight) * (180 / Math.PI),
        };
        const trackDistance = distanceA[0] + (distanceB[0] - distanceA[0]) * distanceWeight;
        const viewportPosition = this.computeViewportCameraPositionFromTrackPose(target, rotationDeg, trackDistance);
        return {
            position: { x: viewportPosition.x, y: viewportPosition.y, z: viewportPosition.z },
            rotation: rotationDeg,
            target: { x: target.x, y: target.y, z: target.z },
            distance: Math.abs(trackDistance),
            fov: fovA[0] + (fovB[0] - fovA[0]) * fovWeight,
        };
    }

    private sampleMovableBonePoseFromTrack(track: RuntimeMovableBoneTrackLike, frame: number): SelectedBonePoseSnapshot | null {
        const frameNumbers = track.frameNumbers;
        if (!frameNumbers || frameNumbers.length === 0) return null;

        const clampedFrame = this.clampFrameToTrackRange(frame, frameNumbers);
        const upperBoundIndex = this.findUpperBoundFrameIndex(frameNumbers, clampedFrame);
        const lowerIndex = Math.max(0, upperBoundIndex - 1);
        const lowerFrame = frameNumbers[lowerIndex] ?? frameNumbers[0] ?? clampedFrame;
        const upperFrame = frameNumbers[upperBoundIndex];

        if (upperFrame === undefined || lowerFrame + 1 === upperFrame) {
            const position = this.readFloatBlock(track.positions, lowerIndex, 3, [0, 0, 0]);
            const rotationQuaternion = Quaternion.FromArray(this.readFloatBlock(track.rotations, lowerIndex, 4, [0, 0, 0, 1]));
            const rotationEuler = rotationQuaternion.toEulerAngles();
            return {
                position: { x: position[0], y: position[1], z: position[2] },
                rotation: {
                    x: rotationEuler.x * (180 / Math.PI),
                    y: rotationEuler.y * (180 / Math.PI),
                    z: rotationEuler.z * (180 / Math.PI),
                },
            };
        }

        const gradient = (clampedFrame - lowerFrame) / (upperFrame - lowerFrame);
        const positionA = this.readFloatBlock(track.positions, lowerIndex, 3, [0, 0, 0]);
        const positionB = this.readFloatBlock(track.positions, upperBoundIndex, 3, positionA);
        const rotationA = Quaternion.FromArray(this.readFloatBlock(track.rotations, lowerIndex, 4, [0, 0, 0, 1]));
        const rotationB = Quaternion.FromArray(this.readFloatBlock(track.rotations, upperBoundIndex, 4, [0, 0, 0, 1]));
        const positionInterpolation = this.readFloatBlock(track.positionInterpolations, upperBoundIndex, 12, [20, 107, 20, 107, 20, 107, 20, 107, 20, 107, 20, 107]);
        const rotationInterpolation = this.readFloatBlock(track.rotationInterpolations, upperBoundIndex, 4, [20, 107, 20, 107]);

        const positionWeightX = this.bezierInterpolate(positionInterpolation[0] / 127, positionInterpolation[1] / 127, positionInterpolation[2] / 127, positionInterpolation[3] / 127, gradient);
        const positionWeightY = this.bezierInterpolate(positionInterpolation[4] / 127, positionInterpolation[5] / 127, positionInterpolation[6] / 127, positionInterpolation[7] / 127, gradient);
        const positionWeightZ = this.bezierInterpolate(positionInterpolation[8] / 127, positionInterpolation[9] / 127, positionInterpolation[10] / 127, positionInterpolation[11] / 127, gradient);
        const rotationWeight = this.bezierInterpolate(rotationInterpolation[0] / 127, rotationInterpolation[1] / 127, rotationInterpolation[2] / 127, rotationInterpolation[3] / 127, gradient);

        Quaternion.SlerpToRef(rotationA, rotationB, rotationWeight, rotationA);
        const rotation = rotationA.toEulerAngles();
        return {
            position: {
                x: positionA[0] + (positionB[0] - positionA[0]) * positionWeightX,
                y: positionA[1] + (positionB[1] - positionA[1]) * positionWeightY,
                z: positionA[2] + (positionB[2] - positionA[2]) * positionWeightZ,
            },
            rotation: {
                x: rotation.x * (180 / Math.PI),
                y: rotation.y * (180 / Math.PI),
                z: rotation.z * (180 / Math.PI),
            },
        };
    }

    private sampleBonePoseFromTrack(track: RuntimeBoneTrackLike, frame: number): SelectedBonePoseSnapshot | null {
        const frameNumbers = track.frameNumbers;
        if (!frameNumbers || frameNumbers.length === 0) return null;

        const clampedFrame = this.clampFrameToTrackRange(frame, frameNumbers);
        const upperBoundIndex = this.findUpperBoundFrameIndex(frameNumbers, clampedFrame);
        const lowerIndex = Math.max(0, upperBoundIndex - 1);
        const lowerFrame = frameNumbers[lowerIndex] ?? frameNumbers[0] ?? clampedFrame;
        const upperFrame = frameNumbers[upperBoundIndex];

        if (upperFrame === undefined || lowerFrame + 1 === upperFrame) {
            const rotationQuaternion = Quaternion.FromArray(this.readFloatBlock(track.rotations, lowerIndex, 4, [0, 0, 0, 1]));
            const rotationEuler = rotationQuaternion.toEulerAngles();
            return {
                position: { x: 0, y: 0, z: 0 },
                rotation: {
                    x: rotationEuler.x * (180 / Math.PI),
                    y: rotationEuler.y * (180 / Math.PI),
                    z: rotationEuler.z * (180 / Math.PI),
                },
            };
        }

        const rotationA = Quaternion.FromArray(this.readFloatBlock(track.rotations, lowerIndex, 4, [0, 0, 0, 1]));
        const rotationB = Quaternion.FromArray(this.readFloatBlock(track.rotations, upperBoundIndex, 4, [0, 0, 0, 1]));
        const rotationInterpolation = this.readFloatBlock(track.rotationInterpolations, upperBoundIndex, 4, [20, 107, 20, 107]);
        const rotationWeight = this.bezierInterpolate(rotationInterpolation[0] / 127, rotationInterpolation[1] / 127, rotationInterpolation[2] / 127, rotationInterpolation[3] / 127, (clampedFrame - lowerFrame) / (upperFrame - lowerFrame));
        Quaternion.SlerpToRef(rotationA, rotationB, rotationWeight, rotationA);
        const rotation = rotationA.toEulerAngles();
        return {
            position: { x: 0, y: 0, z: 0 },
            rotation: {
                x: rotation.x * (180 / Math.PI),
                y: rotation.y * (180 / Math.PI),
                z: rotation.z * (180 / Math.PI),
            },
        };
    }

    private clampFrameToTrackRange(frame: number, frames: NumericArrayLike): number {
        const normalizedFrame = Math.max(0, Math.floor(frame));
        if (!frames || frames.length === 0) return normalizedFrame;
        const first = frames[0] ?? normalizedFrame;
        const last = frames[frames.length - 1] ?? first;
        return Math.max(first, Math.min(last, normalizedFrame));
    }

    private findUpperBoundFrameIndex(frames: NumericArrayLike, frame: number): number {
        if (!frames || frames.length === 0) return 0;
        let lo = 0;
        let hi = frames.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (frames[mid] <= frame) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }

    private bezierInterpolate(x1: number, x2: number, y1: number, y2: number, x: number): number {
        let c = 0.5;
        let t = c;
        let s = 1.0 - t;
        const loop = 15;
        const eps = 1e-5;
        let sst3 = 0;
        let stt3 = 0;
        let ttt = 0;
        for (let i = 0; i < loop; ++i) {
            sst3 = 3.0 * s * s * t;
            stt3 = 3.0 * s * t * t;
            ttt = t * t * t;
            const ft = (sst3 * x1) + (stt3 * x2) + ttt - x;
            if (Math.abs(ft) < eps) break;
            c *= 0.5;
            t += ft < 0 ? c : -c;
            s = 1.0 - t;
        }
        return (sst3 * y1) + (stt3 * y2) + ttt;
    }

    private hasAccessoryTransformKeyframe(accessoryIndex: number, frame: number): boolean {
        const manager = this.mmdManager as unknown as {
            hasAccessoryTransformKeyframe?: (index: number, frame: number) => boolean;
        };
        return manager.hasAccessoryTransformKeyframe?.(accessoryIndex, frame) ?? false;
    }

    private addAccessoryTransformKeyframe(accessoryIndex: number, frame: number): boolean {
        const manager = this.mmdManager as unknown as {
            addAccessoryTransformKeyframe?: (index: number, frame: number) => boolean;
        };
        return manager.addAccessoryTransformKeyframe?.(accessoryIndex, frame) ?? false;
    }

    private getInfoKeyframeButtonState(): SectionKeyframeButtonState {
        const contextKey = this.getInfoKeyframeContextKey();
        if (!contextKey) return "none";
        if (this.sectionKeyframeDirtyKeys.info.has(contextKey)) return "dirty";
        return this.mmdManager.hasInfoKeyframe(this.mmdManager.currentFrame) ? "registered" : "none";
    }

    private getInterpolationKeyframeButtonState(): SectionKeyframeButtonState {
        const track = this.getSelectedTimelineTrack();
        const contextKey = this.getInterpolationKeyframeContextKey(track);
        if (!track || !contextKey) return "none";
        if (this.sectionKeyframeDirtyKeys.interpolation.has(contextKey)) return "dirty";
        if (this.mmdManager.hasTimelineKeyframe(track, this.mmdManager.currentFrame)) return "registered";
        return "none";
    }

    private getBoneKeyframeButtonState(): SectionKeyframeButtonState {
        const boneName = this.bottomPanel.getSelectedBone();
        const contextKey = this.getBoneKeyframeContextKey(boneName);
        if (!boneName || !contextKey) return "none";

        if (this.sectionKeyframeDirtyKeys.bone.has(contextKey)) return "dirty";

        if (boneName === "Camera") {
            return this.mmdManager.hasTimelineKeyframe({ name: boneName, category: "camera" }, this.mmdManager.currentFrame)
                ? "registered"
                : "none";
        }

        const track = this.getSelectedTimelineTrack();
        if (track && this.isBoneTrackForEditor(track) && track.name === boneName) {
            if (this.mmdManager.hasTimelineKeyframe(track, this.mmdManager.currentFrame)) return "registered";
            return "none";
        }

        if (this.selectedBoneTrackCategory) {
            const fallbackTrack = { name: boneName, category: this.selectedBoneTrackCategory };
            if (this.mmdManager.hasTimelineKeyframe(fallbackTrack, this.mmdManager.currentFrame)) return "registered";
        }
        return "none";
    }

    private getMorphKeyframeButtonState(): SectionKeyframeButtonState {
        const frameIndex = this.bottomPanel.getSelectedMorphFrameIndex();
        const contextKey = this.getMorphKeyframeContextKey(frameIndex);
        if (frameIndex === null || !contextKey) return "none";

        if (this.sectionKeyframeDirtyKeys.morph.has(contextKey)) return "dirty";

        const snapshot = this.bottomPanel.getSelectedMorphFrameSnapshot();
        if (!snapshot) return "none";
        if (snapshot.morphs.length === 0) return "none";
        const hasRegisteredMorphKeyframes = snapshot.morphs.every((morph) =>
            this.mmdManager.hasTimelineKeyframe({ name: morph.name, category: "morph" }, this.mmdManager.currentFrame)
        );
        return hasRegisteredMorphKeyframes ? "registered" : "none";
    }

    private getAccessoryKeyframeButtonState(): SectionKeyframeButtonState {
        const accessoryIndex = this.accessoryPanelController?.getSelectedAccessoryIndex() ?? null;
        const contextKey = this.getAccessoryKeyframeContextKey(accessoryIndex);
        if (accessoryIndex === null || !contextKey) return "none";

        if (this.sectionKeyframeDirtyKeys.accessory.has(contextKey)) return "dirty";
        if (this.hasAccessoryTransformKeyframe(accessoryIndex, this.mmdManager.currentFrame)) return "registered";
        return "none";
    }

    private updateInterpolationPreview(track: KeyframeTrack, frame: number): void {
        const preview = this.buildInterpolationPreviewFromRuntime(track, frame);
        this.currentInterpolationPreview = preview;
        this.syncInterpolationTypeSelect(preview);

        if (preview.source === "morph") {
            this.interpolationStatusLabel.textContent = "Morph curves are not editable";
        } else if (!preview.hasKeyframe) {
            this.interpolationStatusLabel.textContent = "No keyframe at this frame";
        } else if (preview.hasCurveData) {
            this.interpolationStatusLabel.textContent = "Interpolation curve shown";
        } else {
            this.interpolationStatusLabel.textContent = "Curve data is not available for this track";
        }

        this.renderInterpolationCurves(preview);
        this.updateInterpolationActionButtons();
    }

    private buildInterpolationPreviewFromRuntime(track: KeyframeTrack, frame: number): TimelineInterpolationPreview {
        this.interpolationChannelBindings.clear();
        const normalizedFrame = Math.max(0, Math.floor(frame));
        const managerInternal = this.mmdManager as unknown as Partial<MmdManagerInternalView>;
        const linear = this.createLinearCurve();
        const cameraFrames = managerInternal.cameraSourceAnimation?.cameraTrack?.frameNumbers;
        const previewSourceFrames =
            track.category === "camera" && cameraFrames && cameraFrames.length > 0
                ? cameraFrames
                : track.frames;
        const previewFrame = this.resolveInterpolationReferenceFrame(
            previewSourceFrames,
            normalizedFrame,
            track.category === "camera",
            false,
        );
        const hasKeyframe = previewFrame !== null;

        if (previewFrame === null) {
            return {
                source: "none",
                frame: normalizedFrame,
                hasKeyframe: false,
                hasCurveData: false,
                channels: [],
            };
        }

        if (track.category === "camera") {
            const cameraTrack = managerInternal.cameraSourceAnimation?.cameraTrack;
            const keyIndex = this.findFrameIndex(cameraTrack?.frameNumbers, previewFrame);
            const hasCurveData = keyIndex >= 0;
            this.bindInterpolationChannel("cam-x", cameraTrack?.positionInterpolations, keyIndex, 12, 0);
            this.bindInterpolationChannel("cam-y", cameraTrack?.positionInterpolations, keyIndex, 12, 4);
            this.bindInterpolationChannel("cam-z", cameraTrack?.positionInterpolations, keyIndex, 12, 8);
            this.bindInterpolationChannel("cam-rot", cameraTrack?.rotationInterpolations, keyIndex, 4, 0);
            this.bindInterpolationChannel("cam-dist", cameraTrack?.distanceInterpolations, keyIndex, 4, 0);
            this.bindInterpolationChannel("cam-fov", cameraTrack?.fovInterpolations, keyIndex, 4, 0);
            return {
                source: "camera",
                frame: previewFrame,
                hasKeyframe,
                hasCurveData,
                channels: [
                    this.createCurveChannel("cam-x", "Pos X", this.readCurve(cameraTrack?.positionInterpolations, keyIndex, 12, 0, linear), hasCurveData),
                    this.createCurveChannel("cam-y", "Pos Y", this.readCurve(cameraTrack?.positionInterpolations, keyIndex, 12, 4, linear), hasCurveData),
                    this.createCurveChannel("cam-z", "Pos Z", this.readCurve(cameraTrack?.positionInterpolations, keyIndex, 12, 8, linear), hasCurveData),
                    this.createCurveChannel("cam-rot", "Rot", this.readCurve(cameraTrack?.rotationInterpolations, keyIndex, 4, 0, linear), hasCurveData),
                    this.createCurveChannel("cam-dist", "Dist", this.readCurve(cameraTrack?.distanceInterpolations, keyIndex, 4, 0, linear), hasCurveData),
                    this.createCurveChannel("cam-fov", "FoV", this.readCurve(cameraTrack?.fovInterpolations, keyIndex, 4, 0, linear), hasCurveData),
                ],
            };
        }

        if (track.category === "morph") {
            return {
                source: "morph",
                frame: previewFrame,
                hasKeyframe,
                hasCurveData: false,
                channels: [
                    this.createCurveChannel("morph", "Weight", linear, true),
                ],
            };
        }

        const currentModel = managerInternal.currentModel ?? null;
        const modelAnimation = currentModel
            ? managerInternal.modelSourceAnimationsByModel?.get(currentModel) ?? null
            : null;

        const movableTrack = modelAnimation?.movableBoneTracks?.find((candidate) => candidate.name === track.name) ?? null;
        if (movableTrack) {
            const keyIndex = this.findFrameIndex(movableTrack.frameNumbers, previewFrame);
            const hasCurveData = keyIndex >= 0;
            this.bindInterpolationChannel("bone-x", movableTrack.positionInterpolations, keyIndex, 12, 0);
            this.bindInterpolationChannel("bone-y", movableTrack.positionInterpolations, keyIndex, 12, 4);
            this.bindInterpolationChannel("bone-z", movableTrack.positionInterpolations, keyIndex, 12, 8);
            this.bindInterpolationChannel("bone-rot", movableTrack.rotationInterpolations, keyIndex, 4, 0);
            return {
                source: "bone-movable",
                frame: previewFrame,
                hasKeyframe,
                hasCurveData,
                channels: [
                    this.createCurveChannel("bone-x", "Pos X", this.readCurve(movableTrack.positionInterpolations, keyIndex, 12, 0, linear), hasCurveData),
                    this.createCurveChannel("bone-y", "Pos Y", this.readCurve(movableTrack.positionInterpolations, keyIndex, 12, 4, linear), hasCurveData),
                    this.createCurveChannel("bone-z", "Pos Z", this.readCurve(movableTrack.positionInterpolations, keyIndex, 12, 8, linear), hasCurveData),
                    this.createCurveChannel("bone-rot", "Rot", this.readCurve(movableTrack.rotationInterpolations, keyIndex, 4, 0, linear), hasCurveData),
                ],
            };
        }

        const boneTrack = modelAnimation?.boneTracks?.find((candidate) => candidate.name === track.name) ?? null;
        if (boneTrack) {
            const keyIndex = this.findFrameIndex(boneTrack.frameNumbers, previewFrame);
            const hasCurveData = keyIndex >= 0;
            this.bindInterpolationChannel("bone-rot", boneTrack.rotationInterpolations, keyIndex, 4, 0);
            return {
                source: "bone-rotation-only",
                frame: previewFrame,
                hasKeyframe,
                hasCurveData,
                channels: [
                    this.createCurveChannel("bone-x", "Pos X", linear, false),
                    this.createCurveChannel("bone-y", "Pos Y", linear, false),
                    this.createCurveChannel("bone-z", "Pos Z", linear, false),
                    this.createCurveChannel("bone-rot", "Rot", this.readCurve(boneTrack.rotationInterpolations, keyIndex, 4, 0, linear), hasCurveData),
                ],
            };
        }

        return {
            source: "none",
            frame: previewFrame,
            hasKeyframe,
            hasCurveData: false,
            channels: [
                this.createCurveChannel("bone-x", "Pos X", linear, false),
                this.createCurveChannel("bone-y", "Pos Y", linear, false),
                this.createCurveChannel("bone-z", "Pos Z", linear, false),
                this.createCurveChannel("bone-rot", "Rot", linear, false),
            ],
        };
    }

    private resolveInterpolationReferenceFrame(
        frames: NumericArrayLike,
        frame: number,
        allowLeadingFallback = false,
        allowTrailingFallback = false,
    ): number | null {
        if (!frames || frames.length === 0) return null;
        let lo = 0;
        let hi = frames.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (frames[mid] < frame) lo = mid + 1;
            else hi = mid;
        }
        if (lo < frames.length && frames[lo] === frame) {
            return frames[lo];
        }
        if (lo === 0) {
            return allowLeadingFallback ? frames[0] : null;
        }
        if (lo < frames.length) {
            // MMD interpolation for segment A->B uses keyframe B's curve.
            return frames[lo];
        }
        return allowTrailingFallback ? frames[frames.length - 1] : null;
    }

    private createLinearCurve(): InterpolationCurve {
        return { x1: 20, x2: 107, y1: 20, y2: 107 };
    }

    private createCurveChannel(
        id: string,
        label: string,
        curve: InterpolationCurve,
        available: boolean,
    ): InterpolationChannelPreview {
        return { id, label, curve, available };
    }

    private bindInterpolationChannel(
        channelId: string,
        values: NumericArrayLike,
        frameIndex: number,
        stride: number,
        baseOffset: number,
    ): void {
        if (!values || frameIndex < 0) return;
        const writable = values as unknown as NumericWritableArray;
        const offset = frameIndex * stride + baseOffset;
        if (offset + 3 >= writable.length) return;
        this.interpolationChannelBindings.set(channelId, { values: writable, offset });
    }

    private isInterpolationChannelEditable(channelId: string): boolean {
        return this.interpolationChannelBindings.has(channelId);
    }

    private startInterpolationCurveDrag(event: PointerEvent, channelId: string, pointIndex: 1 | 2): void {
        if (!this.isInterpolationChannelEditable(channelId)) return;
        if (!(event.currentTarget instanceof SVGElement)) return;
        const svg = event.currentTarget.ownerSVGElement;
        if (!svg) return;

        event.preventDefault();
        event.stopPropagation();

        this.interpolationDragState = { channelId, pointIndex, changed: false, dirtyMarked: false };
        const onMove = (moveEvent: PointerEvent) => this.handleInterpolationCurveDragMove(moveEvent, svg);
        const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            const changed = this.interpolationDragState?.changed ?? false;
            this.interpolationDragState = null;
            if (changed) {
                this.refreshRuntimeAnimationFromInterpolationEdit();
                this.updateTimelineEditState();
            }
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        this.handleInterpolationCurveDragMove(event, svg);
    }

    private handleInterpolationCurveDragMove(event: PointerEvent, svg: SVGSVGElement): void {
        const dragState = this.interpolationDragState;
        if (!dragState) return;

        const rect = svg.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        // Matches createInterpolationCurveSvg() viewBox geometry.
        const { width, height, left, bottom, innerWidth, innerHeight } =
            this.getInterpolationCurveGeometry();

        const viewX = ((event.clientX - rect.left) / rect.width) * width;
        const viewY = ((event.clientY - rect.top) / rect.height) * height;
        const x = this.clampInterpolationValue(((viewX - left) / innerWidth) * 127, 0);
        const y = this.clampInterpolationValue(((bottom - viewY) / innerHeight) * 127, 0);

        const binding = this.interpolationChannelBindings.get(dragState.channelId);
        if (!binding) return;

        const oldX = dragState.pointIndex === 1 ? binding.values[binding.offset + 0] : binding.values[binding.offset + 1];
        const oldY = dragState.pointIndex === 1 ? binding.values[binding.offset + 2] : binding.values[binding.offset + 3];
        if (oldX === x && oldY === y) return;

        if (dragState.pointIndex === 1) {
            binding.values[binding.offset + 0] = x;
            binding.values[binding.offset + 2] = y;
        } else {
            binding.values[binding.offset + 1] = x;
            binding.values[binding.offset + 3] = y;
        }

        dragState.changed = true;
        if (!dragState.dirtyMarked) {
            dragState.dirtyMarked = true;
            this.markSectionKeyframeDirty("interpolation", this.getInterpolationKeyframeContextKey());
            this.updateSectionKeyframeButtons();
        }
        this.updateInterpolationCurveDragVisuals(svg, dragState.channelId);
    }

    private updateInterpolationCurveDragVisuals(svg: SVGSVGElement, channelId: string): void {
        const binding = this.interpolationChannelBindings.get(channelId);
        if (!binding) return;

        const x1 = binding.values[binding.offset + 0];
        const x2 = binding.values[binding.offset + 1];
        const y1 = binding.values[binding.offset + 2];
        const y2 = binding.values[binding.offset + 3];

        const { left, right, top, bottom, innerWidth, innerHeight } =
            this.getInterpolationCurveGeometry();

        const px1 = left + (x1 / 127) * innerWidth;
        const px2 = left + (x2 / 127) * innerWidth;
        const py1 = bottom - (y1 / 127) * innerHeight;
        const py2 = bottom - (y2 / 127) * innerHeight;

        const svgElements = Array.from(svg.querySelectorAll<SVGElement>("[data-channel-id]"));
        for (const element of svgElements) {
            if (element.dataset.channelId !== channelId) continue;
            switch (element.dataset.role) {
                case "handle-line-start":
                    element.setAttribute("x2", String(px1));
                    element.setAttribute("y2", String(py1));
                    break;
                case "handle-line-end":
                    element.setAttribute("x1", String(px2));
                    element.setAttribute("y1", String(py2));
                    break;
                case "curve-path":
                    element.setAttribute("d", `M ${left} ${bottom} C ${px1} ${py1}, ${px2} ${py2}, ${right} ${top}`);
                    break;
                case "point":
                case "hit-area":
                    if (element.dataset.pointIndex === "1") {
                        element.setAttribute("cx", String(px1));
                        element.setAttribute("cy", String(py1));
                    } else if (element.dataset.pointIndex === "2") {
                        element.setAttribute("cx", String(px2));
                        element.setAttribute("cy", String(py2));
                    }
                    break;
            }
        }

        const valueLabels = Array.from(this.interpolationCurveList.querySelectorAll<HTMLElement>(".interp-curve-value"));
        const valueLabel = valueLabels.find((element) => element.dataset.channelId === channelId);
        if (valueLabel) {
            valueLabel.textContent = `${x1},${x2},${y1},${y2}`;
        }
    }

    private refreshRuntimeAnimationFromInterpolationEdit(): void {
        const track = this.getSelectedTimelineTrack();
        if (!track || track.category === "morph") return;

        const managerInternal = this.mmdManager as unknown as Partial<MmdManagerInternalView>;
        if (track.category === "camera") {
            const animation = managerInternal.cameraSourceAnimation;
            const mmdCamera = managerInternal.mmdCamera;
            if (!animation || !mmdCamera) return;

            if (managerInternal.cameraAnimationHandle !== null && managerInternal.cameraAnimationHandle !== undefined) {
                mmdCamera.destroyRuntimeAnimation(managerInternal.cameraAnimationHandle);
            }
            const handle = mmdCamera.createRuntimeAnimation(animation as unknown);
            mmdCamera.setRuntimeAnimation(handle);
            managerInternal.cameraAnimationHandle = handle;
            this.mmdManager.seekToBoundary(this.mmdManager.currentFrame);
            return;
        }

        const currentModel = managerInternal.currentModel;
        const animation = currentModel ? managerInternal.modelSourceAnimationsByModel?.get(currentModel) : null;
        if (!currentModel || !animation) return;
        const handle = currentModel.createRuntimeAnimation(animation);
        currentModel.setRuntimeAnimation(handle);
        this.mmdManager.seekToBoundary(this.mmdManager.currentFrame);
    }

    private clampInterpolationValue(value: number, fallback: number): number {
        if (!Number.isFinite(value)) return fallback;
        return Math.max(0, Math.min(127, Math.round(value)));
    }

    private readCurve(
        values: NumericArrayLike,
        frameIndex: number,
        stride: number,
        baseOffset: number,
        fallback: InterpolationCurve,
    ): InterpolationCurve {
        if (!values || frameIndex < 0) {
            return { ...fallback };
        }
        const offset = frameIndex * stride + baseOffset;
        if (offset + 3 >= values.length) {
            return { ...fallback };
        }
        return {
            x1: this.clampInterpolationValue(values[offset + 0], fallback.x1),
            x2: this.clampInterpolationValue(values[offset + 1], fallback.x2),
            y1: this.clampInterpolationValue(values[offset + 2], fallback.y1),
            y2: this.clampInterpolationValue(values[offset + 3], fallback.y2),
        };
    }

    private findFrameIndex(frames: NumericArrayLike, frame: number): number {
        if (!frames || frames.length === 0) return -1;
        let lo = 0;
        let hi = frames.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (frames[mid] < frame) lo = mid + 1;
            else hi = mid;
        }
        return lo < frames.length && frames[lo] === frame ? lo : -1;
    }

    private renderInterpolationCurves(preview: TimelineInterpolationPreview | null): void {
        this.interpolationCurveList.textContent = "";

        if (!preview || preview.channels.length === 0) {
            const empty = document.createElement("div");
            empty.className = "interp-curve-empty";
            empty.textContent = "No keyframes with interpolation data";
            this.interpolationCurveList.appendChild(empty);
            return;
        }

        const renderChannels = this.getInterpolationChannelsForRender(preview);
        if (renderChannels.length === 0) {
            const empty = document.createElement("div");
            empty.className = "interp-curve-empty";
            empty.textContent = "No channels available for the selected type";
            this.interpolationCurveList.appendChild(empty);
            return;
        }

        this.interpolationCurveList.appendChild(this.createInterpolationCurveCard(renderChannels));
    }

    private updateInterpolationActionButtons(): void {
        const targetChannels = this.getActiveEditableInterpolationChannels();
        const hasTargetChannels = targetChannels.length > 0 && !this.mmdManager.isPlaying;
        if (this.btnInterpolationCopy) {
            this.btnInterpolationCopy.disabled = !hasTargetChannels;
        }
        if (this.btnInterpolationLinear) {
            this.btnInterpolationLinear.disabled = !hasTargetChannels;
        }
        if (this.btnInterpolationPaste) {
            this.btnInterpolationPaste.disabled = !hasTargetChannels || !this.interpolationCurveClipboard;
        }
    }

    private getActiveEditableInterpolationChannels(): InterpolationChannelPreview[] {
        const preview = this.currentInterpolationPreview;
        if (!preview) return [];
        return this.getInterpolationChannelsForRender(preview)
            .filter((channel) => channel.available && this.isInterpolationChannelEditable(channel.id));
    }

    private readCurrentInterpolationCurve(channel: InterpolationChannelPreview): InterpolationCurve {
        const binding = this.interpolationChannelBindings.get(channel.id);
        if (!binding) {
            return { ...channel.curve };
        }
        return {
            x1: binding.values[binding.offset + 0],
            x2: binding.values[binding.offset + 1],
            y1: binding.values[binding.offset + 2],
            y2: binding.values[binding.offset + 3],
        };
    }

    private writeInterpolationCurve(channelId: string, curve: InterpolationCurve): boolean {
        const binding = this.interpolationChannelBindings.get(channelId);
        if (!binding) return false;
        binding.values[binding.offset + 0] = this.clampInterpolationValue(curve.x1, 0);
        binding.values[binding.offset + 1] = this.clampInterpolationValue(curve.x2, 0);
        binding.values[binding.offset + 2] = this.clampInterpolationValue(curve.y1, 0);
        binding.values[binding.offset + 3] = this.clampInterpolationValue(curve.y2, 0);
        return true;
    }

    private copyInterpolationCurves(): void {
        const targetChannels = this.getActiveEditableInterpolationChannels();
        if (targetChannels.length === 0) {
            this.showToast("No interpolation curves available to copy", "info");
            return;
        }

        this.interpolationCurveClipboard = {
            curves: targetChannels.map((channel) => this.readCurrentInterpolationCurve(channel)),
            sourceChannelCount: targetChannels.length,
        };
        this.updateInterpolationActionButtons();

        const label = targetChannels.length === 1
            ? `${targetChannels[0]?.label ?? "curve"}`
            : `${targetChannels.length} curves`;
        this.showToast(`Copied ${label}`, "success");
    }

    private pasteInterpolationCurves(): void {
        const clipboard = this.interpolationCurveClipboard;
        if (!clipboard || clipboard.curves.length === 0) {
            this.showToast("No copied interpolation curves", "info");
            return;
        }

        const targetChannels = this.getActiveEditableInterpolationChannels();
        if (targetChannels.length === 0) {
            this.showToast("No interpolation curves available to paste", "info");
            return;
        }

        let changed = false;
        if (clipboard.curves.length === 1) {
            const sourceCurve = clipboard.curves[0];
            for (const channel of targetChannels) {
                changed = this.writeInterpolationCurve(channel.id, sourceCurve) || changed;
            }
        } else {
            const count = Math.min(targetChannels.length, clipboard.curves.length);
            for (let i = 0; i < count; i += 1) {
                const channel = targetChannels[i];
                const curve = clipboard.curves[i];
                changed = this.writeInterpolationCurve(channel.id, curve) || changed;
            }
        }

        if (!changed) {
            this.showToast("Interpolation paste target is not editable", "info");
            return;
        }

        this.finalizeInterpolationCurveEdit(
            clipboard.curves.length === 1 && targetChannels.length > 1
                ? `Pasted to ${targetChannels.length} curves`
                : "Interpolation curves pasted",
        );
    }

    private resetInterpolationCurvesToLinear(): void {
        const targetChannels = this.getActiveEditableInterpolationChannels();
        if (targetChannels.length === 0) {
            this.showToast("No interpolation curves available to reset", "info");
            return;
        }

        const linear = this.createLinearCurve();
        let changed = false;
        for (const channel of targetChannels) {
            changed = this.writeInterpolationCurve(channel.id, linear) || changed;
        }
        if (!changed) {
            this.showToast("Interpolation reset target is not editable", "info");
            return;
        }

        this.finalizeInterpolationCurveEdit(
            targetChannels.length === 1 ? "Interpolation reset to linear" : `${targetChannels.length} curves reset to linear`,
        );
    }

    private finalizeInterpolationCurveEdit(message: string): void {
        this.markSectionKeyframeDirty("interpolation", this.getInterpolationKeyframeContextKey());
        this.refreshRuntimeAnimationFromInterpolationEdit();
        this.refreshSelectedTrackRotationOverlay();
        this.updateTimelineEditState();
        this.updateSectionKeyframeButtons();
        this.showToast(message, "success");
    }

    private resetInterpolationTypeSelect(): void {
        this.interpolationTypeSelect.textContent = "";
        const option = document.createElement("option");
        option.value = "__all__";
        option.textContent = "All";
        this.interpolationTypeSelect.appendChild(option);
        this.interpolationTypeSelect.value = "__all__";
        this.interpolationTypeSelect.disabled = true;
    }

    private syncInterpolationTypeSelect(preview: TimelineInterpolationPreview): void {
        const previous = this.interpolationTypeSelect.value;
        const selectableChannels = this.getSelectableInterpolationChannels(preview.channels);

        this.interpolationTypeSelect.textContent = "";

        const allOption = document.createElement("option");
        allOption.value = "__all__";
        allOption.textContent = `All (${selectableChannels.length}ch)`;
        this.interpolationTypeSelect.appendChild(allOption);

        for (const channel of selectableChannels) {
            const option = document.createElement("option");
            option.value = channel.id;
            option.textContent = channel.label;
            this.interpolationTypeSelect.appendChild(option);
        }

        this.interpolationTypeSelect.disabled = selectableChannels.length === 0;
        const hasPrevious = Array.from(this.interpolationTypeSelect.options).some((option) => option.value === previous);
        this.interpolationTypeSelect.value = hasPrevious ? previous : "__all__";
    }

    private getSelectableInterpolationChannels(channels: InterpolationChannelPreview[]): InterpolationChannelPreview[] {
        const visibleChannels = channels.filter((channel) => channel.available);
        return (visibleChannels.length > 0 ? visibleChannels : channels)
            .slice()
            .sort((a, b) => this.getCurveChannelOrder(a) - this.getCurveChannelOrder(b));
    }

    private getInterpolationChannelsForRender(preview: TimelineInterpolationPreview): InterpolationChannelPreview[] {
        const selectableChannels = this.getSelectableInterpolationChannels(preview.channels);
        const filter = this.interpolationTypeSelect.value;
        if (filter === "__all__") {
            return selectableChannels;
        }
        return selectableChannels.filter((channel) => channel.id === filter);
    }

    private createInterpolationCurveCard(channels: InterpolationChannelPreview[]): HTMLElement {
        const visibleChannels = channels.filter((channel) => channel.available);
        const targetChannels = (visibleChannels.length > 0 ? visibleChannels : channels)
            .slice()
            .sort((a, b) => this.getCurveChannelOrder(a) - this.getCurveChannelOrder(b));

        const card = document.createElement("div");
        card.className = "interp-curve-card";

        const legend = document.createElement("div");
        legend.className = "interp-curve-legend";

        for (const channel of targetChannels) {
            const item = document.createElement("div");
            item.className = "interp-curve-legend-item";
            if (!channel.available) {
                item.classList.add("interp-curve-legend-item--muted");
            }
            const color = this.getCurveChannelColor(channel);

            const name = document.createElement("span");
            name.className = "interp-curve-name";
            name.textContent = channel.label;
            name.style.color = color;

            const value = document.createElement("span");
            value.className = "interp-curve-value";
            value.dataset.channelId = channel.id;
            value.textContent = `${channel.curve.x1},${channel.curve.x2},${channel.curve.y1},${channel.curve.y2}`;

            item.appendChild(name);
            item.appendChild(value);
            legend.appendChild(item);
        }

        card.appendChild(this.createInterpolationCurveSvg(targetChannels));
        card.appendChild(legend);

        return card;
    }

    private getCurveChannelOrder(channel: InterpolationChannelPreview): number {
        const id = channel.id.toLowerCase();
        if (id.includes("-x")) return 0;
        if (id.includes("-y")) return 1;
        if (id.includes("-z")) return 2;
        if (id.includes("rot")) return 3;
        if (id.includes("dist")) return 4;
        if (id.includes("fov")) return 5;
        return 9;
    }

    private getCurveChannelColor(channel: InterpolationChannelPreview): string {
        const id = channel.id.toLowerCase();
        if (id.includes("-x")) return "var(--axis-x-color)";
        if (id.includes("-y")) return "var(--axis-y-color)";
        if (id.includes("-z")) return "var(--axis-z-color)";
        if (id.includes("rot")) return "var(--accent-amber)";
        if (id.includes("dist")) return "var(--accent-cyan)";
        if (id.includes("fov")) return "var(--accent-pink)";
        return "var(--text-accent)";
    }

    private createInterpolationCurveSvg(channels: InterpolationChannelPreview[]): SVGSVGElement {
        const { width, height, left, right, top, bottom, innerWidth, innerHeight } =
            this.getInterpolationCurveGeometry();

        const svgNs = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNs, "svg");
        svg.classList.add("interp-curve-svg");
        svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

        const guide = document.createElementNS(svgNs, "line");
        guide.classList.add("interp-curve-guide");
        guide.setAttribute("x1", String(left));
        guide.setAttribute("y1", String(bottom));
        guide.setAttribute("x2", String(right));
        guide.setAttribute("y2", String(top));

        svg.appendChild(guide);
        for (const channel of channels) {
            const curve = channel.curve;
            const channelPx1 = left + (curve.x1 / 127) * innerWidth;
            const channelPx2 = left + (curve.x2 / 127) * innerWidth;
            const channelPy1 = bottom - (curve.y1 / 127) * innerHeight;
            const channelPy2 = bottom - (curve.y2 / 127) * innerHeight;
            const color = this.getCurveChannelColor(channel);
            const editable = channel.available && this.isInterpolationChannelEditable(channel.id);

            const handleLine1 = document.createElementNS(svgNs, "line");
            handleLine1.classList.add("interp-curve-handle-line");
            handleLine1.dataset.channelId = channel.id;
            handleLine1.dataset.role = "handle-line-start";
            handleLine1.setAttribute("x1", String(left));
            handleLine1.setAttribute("y1", String(bottom));
            handleLine1.setAttribute("x2", String(channelPx1));
            handleLine1.setAttribute("y2", String(channelPy1));
            handleLine1.style.stroke = color;

            const handleLine2 = document.createElementNS(svgNs, "line");
            handleLine2.classList.add("interp-curve-handle-line");
            handleLine2.dataset.channelId = channel.id;
            handleLine2.dataset.role = "handle-line-end";
            handleLine2.setAttribute("x1", String(channelPx2));
            handleLine2.setAttribute("y1", String(channelPy2));
            handleLine2.setAttribute("x2", String(right));
            handleLine2.setAttribute("y2", String(top));
            handleLine2.style.stroke = color;
            if (!channel.available) {
                handleLine1.classList.add("interp-curve-handle-line--muted");
                handleLine2.classList.add("interp-curve-handle-line--muted");
            }

            const path = document.createElementNS(svgNs, "path");
            path.classList.add("interp-curve-path");
            path.dataset.channelId = channel.id;
            path.dataset.role = "curve-path";
            path.setAttribute("d", `M ${left} ${bottom} C ${channelPx1} ${channelPy1}, ${channelPx2} ${channelPy2}, ${right} ${top}`);
            path.setAttribute("stroke", color);
            if (!channel.available) {
                path.setAttribute("stroke-dasharray", "3 2");
                path.setAttribute("opacity", "0.45");
            }

            const p1 = document.createElementNS(svgNs, "circle");
            p1.classList.add("interp-curve-point");
            p1.dataset.channelId = channel.id;
            p1.dataset.role = "point";
            p1.dataset.pointIndex = "1";
            p1.setAttribute("cx", String(channelPx1));
            p1.setAttribute("cy", String(channelPy1));
            p1.setAttribute("r", editable ? "3.3" : "2.7");
            if (!channel.available) {
                p1.setAttribute("opacity", "0.5");
            } else if (editable) {
                p1.classList.add("interp-curve-point--editable");
                p1.style.fill = color;
            }

            const p2 = document.createElementNS(svgNs, "circle");
            p2.classList.add("interp-curve-point");
            p2.dataset.channelId = channel.id;
            p2.dataset.role = "point";
            p2.dataset.pointIndex = "2";
            p2.setAttribute("cx", String(channelPx2));
            p2.setAttribute("cy", String(channelPy2));
            p2.setAttribute("r", editable ? "3.3" : "2.7");
            if (!channel.available) {
                p2.setAttribute("opacity", "0.5");
            } else if (editable) {
                p2.classList.add("interp-curve-point--editable");
                p2.style.fill = color;
            }

            const p1Hit = document.createElementNS(svgNs, "circle");
            p1Hit.classList.add("interp-curve-hit-area");
            p1Hit.dataset.channelId = channel.id;
            p1Hit.dataset.role = "hit-area";
            p1Hit.dataset.pointIndex = "1";
            p1Hit.setAttribute("cx", String(channelPx1));
            p1Hit.setAttribute("cy", String(channelPy1));
            p1Hit.setAttribute("r", editable ? "8" : "6");

            const p2Hit = document.createElementNS(svgNs, "circle");
            p2Hit.classList.add("interp-curve-hit-area");
            p2Hit.dataset.channelId = channel.id;
            p2Hit.dataset.role = "hit-area";
            p2Hit.dataset.pointIndex = "2";
            p2Hit.setAttribute("cx", String(channelPx2));
            p2Hit.setAttribute("cy", String(channelPy2));
            p2Hit.setAttribute("r", editable ? "8" : "6");

            if (editable) {
                p1.style.cursor = "grab";
                p2.style.cursor = "grab";
                p1Hit.style.cursor = "grab";
                p2Hit.style.cursor = "grab";
                p1Hit.addEventListener("pointerdown", (event) =>
                    this.startInterpolationCurveDrag(event, channel.id, 1)
                );
                p2Hit.addEventListener("pointerdown", (event) =>
                    this.startInterpolationCurveDrag(event, channel.id, 2)
                );
            }

            svg.appendChild(handleLine1);
            svg.appendChild(handleLine2);
            svg.appendChild(path);
            svg.appendChild(p1);
            svg.appendChild(p2);
            svg.appendChild(p1Hit);
            svg.appendChild(p2Hit);
        }

        const startAnchor = document.createElementNS(svgNs, "circle");
        startAnchor.classList.add("interp-curve-anchor");
        startAnchor.setAttribute("cx", String(left));
        startAnchor.setAttribute("cy", String(bottom));
        startAnchor.setAttribute("r", "1.8");

        const endAnchor = document.createElementNS(svgNs, "circle");
        endAnchor.classList.add("interp-curve-anchor");
        endAnchor.setAttribute("cx", String(right));
        endAnchor.setAttribute("cy", String(top));
        endAnchor.setAttribute("r", "1.8");

        svg.appendChild(startAnchor);
        svg.appendChild(endAnchor);
        return svg;
    }

    private getInterpolationCurveGeometry(): {
        width: number;
        height: number;
        left: number;
        right: number;
        top: number;
        bottom: number;
        innerWidth: number;
        innerHeight: number;
    } {
        const padding = 8;
        const width = UIController.INTERP_CURVE_VIEWBOX_WIDTH;
        const height = UIController.INTERP_CURVE_VIEWBOX_HEIGHT;
        const left = padding;
        const right = width - padding;
        const top = padding;
        const bottom = height - padding;

        return {
            width,
            height,
            left,
            right,
            top,
            bottom,
            innerWidth: right - left,
            innerHeight: bottom - top,
        };
    }

    private addKeyframeAtCurrentFrame(poseSnapshotOverride: SelectedBonePoseSnapshot | null = null): void {
        const track = this.getSelectedTimelineTrack();
        if (!track) {
            this.showToast("Please select a track", "error");
            return;
        }

        if (track.category === "camera" && !this.mmdManager.ensureCameraAnimationForEditing()) {
            this.showToast("Failed to prepare camera keyframe track", "error");
            return;
        }
        if (track.category !== "camera" && !this.mmdManager.ensureModelAnimationForEditing(track)) {
            this.showToast("Failed to prepare model keyframe track", "error");
            return;
        }

        const frame = this.mmdManager.currentFrame;
        const poseSnapshot = poseSnapshotOverride
            ?? (track.category === "camera" || this.isBoneTrackForEditor(track)
                ? this.captureCurrentBonePoseSnapshot(track.name)
                : null);
        const shouldRefreshRuntimePreview =
            this.mmdManager.isPlaying
            || !this.isBoneTrackForEditor(track)
            || poseSnapshot === null;
        this.debugKeyframeFlow("add keyframe request", {
            frame,
            track,
            poseSnapshotOverride,
            poseSnapshot,
            shouldRefreshRuntimePreview,
        });
        const interpolationSnapshot = this.captureInterpolationCurveSnapshot(track, frame);
        const created = this.mmdManager.addTimelineKeyframe(track, frame);
        if (!created) {
            const overwritten = this.persistInterpolationForNewKeyframe(track, frame, interpolationSnapshot, poseSnapshot);
            if (overwritten) {
                if (shouldRefreshRuntimePreview) {
                    this.refreshRuntimeAnimationFromInterpolationEdit();
                }
                this.timeline.setSelectedFrame(null);
                this.clearSectionKeyframeDirty("interpolation", this.getInterpolationKeyframeContextKey(track));
                if (this.isBoneTrackForEditor(track) && this.bottomPanel.getSelectedBone() === track.name) {
                    this.clearSectionKeyframeDirty("bone", this.getBoneKeyframeContextKey(track.name));
                }
                this.refreshSelectedTrackRotationOverlay();
                this.updateTimelineEditState();
                this.updateSectionKeyframeButtons();
                this.showToast(`Frame ${frame} keyframe updated`, "success");
                return;
            }
            this.showToast(`Frame ${frame} already has a keyframe`, "info");
            return;
        }

        const persistedInterpolation = this.persistInterpolationForNewKeyframe(track, frame, interpolationSnapshot, poseSnapshot);
        if (persistedInterpolation && shouldRefreshRuntimePreview) {
            this.refreshRuntimeAnimationFromInterpolationEdit();
        }

        this.timeline.setSelectedFrame(null);
        this.clearSectionKeyframeDirty("interpolation", this.getInterpolationKeyframeContextKey(track));
        if (this.isBoneTrackForEditor(track) && this.bottomPanel.getSelectedBone() === track.name) {
            this.clearSectionKeyframeDirty("bone", this.getBoneKeyframeContextKey(track.name));
        }
        this.refreshSelectedTrackRotationOverlay();
        this.updateTimelineEditState();
        this.updateSectionKeyframeButtons();
        this.showToast(`Frame ${frame}: keyframe added`, "success");
    }

    private registerInfoKeyframe(): void {
        const contextKey = this.getInfoKeyframeContextKey();
        if (!contextKey) return;
        if (!this.mmdManager.addInfoKeyframe(this.mmdManager.currentFrame)) {
            this.showToast("Please select a model", "error");
            return;
        }
        this.clearSectionKeyframeDirty("info", contextKey);
        this.updateSectionKeyframeButtons();
        this.updateTimelineEditState();
        this.showToast(`Frame ${this.mmdManager.currentFrame}: info keyframe saved`, "success");
    }

    private registerBoneKeyframeAtCurrentFrame(): void {
        const boneName = this.bottomPanel.getSelectedBone();
        if (!boneName) {
            this.showToast("Please select a bone", "error");
            return;
        }

        const poseSnapshot = this.captureCurrentBonePoseSnapshot(boneName);

        const preferredCategories: TrackCategory[] = boneName === "Camera"
            ? ["camera", "bone", "semi-standard", "root"]
            : this.selectedBoneTrackCategory
                ? [
                    this.selectedBoneTrackCategory,
                    ...(["bone", "semi-standard", "root"] as TrackCategory[]).filter(
                        (category) => category !== this.selectedBoneTrackCategory,
                    ),
                ]
                : ["bone", "semi-standard", "root"];

        if (!this.timeline.selectTrackByNameAndCategory(boneName, preferredCategories)) {
            this.showToast(`No timeline track available for ${boneName}`, "error");
            return;
        }

        this.syncBoneVisualizerSelection(this.timeline.getSelectedTrack());
        this.addKeyframeAtCurrentFrame(poseSnapshot);
    }

    private registerMorphKeyframesAtCurrentFrame(): void {
        const snapshot = this.bottomPanel.getSelectedMorphFrameSnapshot();
        if (!snapshot) {
            this.showToast("Please select a morph frame", "error");
            return;
        }

        const frame = this.mmdManager.currentFrame;
        let touched = false;
        for (const morph of snapshot.morphs) {
            touched = this.mmdManager.addTimelineKeyframe({ name: morph.name, category: "morph" }, frame) || touched;
        }

        if (snapshot.morphs.length > 0) {
            this.clearSectionKeyframeDirty("morph", this.getMorphKeyframeContextKey(snapshot.frameIndex));
            this.updateSectionKeyframeButtons();
            this.timeline.setSelectedFrame(null);
            this.updateTimelineEditState();
            this.showToast(
                touched ? `Frame ${frame}: morph keyframes added` : `Frame ${frame}: morph keyframes already registered`,
                "success",
            );
            return;
        }

        this.showToast("No morphs in the selected frame", "error");
    }

    private registerAccessoryTransformKeyframe(): void {
        const accessoryIndex = this.accessoryPanelController?.getSelectedAccessoryIndex() ?? null;
        if (accessoryIndex === null) {
            this.showToast("Please select an accessory", "error");
            return;
        }

        const frame = this.mmdManager.currentFrame;
        const created = this.addAccessoryTransformKeyframe(accessoryIndex, frame);
        this.clearSectionKeyframeDirty("accessory", this.getAccessoryKeyframeContextKey(accessoryIndex));
        this.updateSectionKeyframeButtons();
        this.showToast(
            created ? `Frame ${frame}: accessory keyframe added` : `Frame ${frame}: accessory keyframe already registered`,
            "success",
        );
    }

    private captureInterpolationCurveSnapshot(track: KeyframeTrack, frame: number): Map<string, InterpolationCurve> {
        const preview = this.buildInterpolationPreviewFromRuntime(track, frame);
        const snapshot = new Map<string, InterpolationCurve>();
        for (const channel of preview.channels) {
            snapshot.set(channel.id, { ...channel.curve });
        }
        return snapshot;
    }

    private persistInterpolationForNewKeyframe(
        track: KeyframeTrack,
        frame: number,
        curves: ReadonlyMap<string, InterpolationCurve>,
        poseSnapshot: SelectedBonePoseSnapshot | null = null,
    ): boolean {
        if (track.category === "morph") return false;

        const normalizedFrame = Math.max(0, Math.floor(frame));
        const managerInternal = this.mmdManager as unknown as Partial<MmdManagerInternalView>;

        if (track.category === "camera") {
            const cameraTrackLike = managerInternal.cameraSourceAnimation?.cameraTrack;
            if (!cameraTrackLike) return false;
            return this.persistCameraKeyframeInterpolation(
                cameraTrackLike as RuntimeCameraTrackLike & RuntimeCameraTrackMutable,
                normalizedFrame,
                curves,
                poseSnapshot,
            );
        }

        const currentModel = managerInternal.currentModel;
        if (!currentModel) return false;
        const modelAnimation = managerInternal.modelSourceAnimationsByModel?.get(currentModel);
        if (!modelAnimation) return false;

        const movableTrackLike = modelAnimation.movableBoneTracks.find((candidate) => candidate.name === track.name);
        if (movableTrackLike) {
            return this.persistMovableBoneKeyframeInterpolation(
                track.name,
                movableTrackLike as RuntimeMovableBoneTrackLike & RuntimeMovableBoneTrackMutable,
                normalizedFrame,
                curves,
                poseSnapshot,
            );
        }

        const boneTrackLike = modelAnimation.boneTracks.find((candidate) => candidate.name === track.name);
        if (boneTrackLike) {
            return this.persistBoneKeyframeInterpolation(
                track.name,
                boneTrackLike as RuntimeBoneTrackLike & RuntimeBoneTrackMutable,
                normalizedFrame,
                curves,
                poseSnapshot,
            );
        }

        return false;
    }

    private persistCameraKeyframeInterpolation(
        track: RuntimeCameraTrackMutable,
        frame: number,
        curves: ReadonlyMap<string, InterpolationCurve>,
        poseSnapshot: SelectedBonePoseSnapshot | null = null,
    ): boolean {
        const frameEdit = this.upsertFrameNumber(track.frameNumbers, frame);
        track.frameNumbers = frameEdit.frames;

        const cameraPosition = poseSnapshot?.position ?? this.mmdManager.getCameraPosition();
        const cameraRotationDeg = poseSnapshot?.rotation ?? this.mmdManager.getCameraRotation();
        const cameraDistance = Math.max(0.0001, poseSnapshot?.distance ?? this.mmdManager.getCameraDistance());
        const cameraFovDeg = poseSnapshot?.fov ?? this.mmdManager.getCameraFov();
        const cameraTarget = poseSnapshot?.target ?? this.mmdManager.getCameraTarget();
        const degToRad = Math.PI / 180;
        this.debugKeyframeFlow("persist camera keyframe", {
            frame,
            poseSnapshot,
            cameraPosition,
            cameraTarget,
            cameraRotationDeg,
            cameraDistance,
            cameraFovDeg,
        });

        track.positions = this.upsertFloatValues(track.positions, 3, frameEdit.index, frameEdit.exists, [
            cameraTarget.x,
            cameraTarget.y,
            cameraTarget.z,
        ]);
        track.rotations = this.upsertFloatValues(track.rotations, 3, frameEdit.index, frameEdit.exists, [
            cameraRotationDeg.x * degToRad,
            cameraRotationDeg.y * degToRad,
            cameraRotationDeg.z * degToRad,
        ]);
        track.distances = this.upsertFloatValues(track.distances, 1, frameEdit.index, frameEdit.exists, [-cameraDistance]);
        track.fovs = this.upsertFloatValues(track.fovs, 1, frameEdit.index, frameEdit.exists, [cameraFovDeg]);
        track.positionInterpolations = this.upsertUint8Values(
            track.positionInterpolations,
            12,
            frameEdit.index,
            frameEdit.exists,
            this.composePositionInterpolationBlock(curves, "cam-x", "cam-y", "cam-z"),
        );
        track.rotationInterpolations = this.upsertUint8Values(
            track.rotationInterpolations,
            4,
            frameEdit.index,
            frameEdit.exists,
            this.curveToBlock(this.getCurveFromSnapshot(curves, "cam-rot")),
        );
        track.distanceInterpolations = this.upsertUint8Values(
            track.distanceInterpolations,
            4,
            frameEdit.index,
            frameEdit.exists,
            this.curveToBlock(this.getCurveFromSnapshot(curves, "cam-dist")),
        );
        track.fovInterpolations = this.upsertUint8Values(
            track.fovInterpolations,
            4,
            frameEdit.index,
            frameEdit.exists,
            this.curveToBlock(this.getCurveFromSnapshot(curves, "cam-fov")),
        );
        return true;
    }

    private persistMovableBoneKeyframeInterpolation(
        boneName: string,
        track: RuntimeMovableBoneTrackMutable,
        frame: number,
        curves: ReadonlyMap<string, InterpolationCurve>,
        poseSnapshot: SelectedBonePoseSnapshot | null = null,
    ): boolean {
        const frameEdit = this.upsertFrameNumber(track.frameNumbers, frame);
        const referenceIndex = this.resolveInsertReferenceIndex(track.frameNumbers, frame);
        track.frameNumbers = frameEdit.frames;

        const transform = poseSnapshot ?? this.getPendingBonePoseSnapshot(boneName, frame) ?? this.mmdManager.getBoneTransform(boneName);
        const fallbackPosition = this.readFloatBlock(track.positions, referenceIndex, 3, [0, 0, 0]);
        const fallbackRotation = this.readFloatBlock(track.rotations, referenceIndex, 4, [0, 0, 0, 1]);
        const fallbackPhysicsToggle = this.readUint8Block(track.physicsToggles, referenceIndex, 1, [0]);
        const positionBlock = transform
            ? [transform.position.x, transform.position.y, transform.position.z]
            : fallbackPosition;
        const rotationBlock = transform
            ? this.rotationDegreesToQuaternionBlock(transform.rotation.x, transform.rotation.y, transform.rotation.z)
            : fallbackRotation;
        this.debugKeyframeFlow("persist movable bone keyframe", {
            boneName,
            frame,
            poseSnapshot,
            poseSnapshotText: this.formatPoseSnapshotText(poseSnapshot),
            resolvedTransform: transform,
            resolvedTransformText: this.formatPoseSnapshotText(transform),
            position: transform ? this.formatBonePoseSnapshotForLog(transform).position : null,
            rotation: transform ? this.formatBonePoseSnapshotForLog(transform).rotation : null,
            positionBlock: positionBlock.map((value) => Math.round(value * 1000) / 1000),
            rotationBlock: rotationBlock.map((value) => Math.round(value * 1000) / 1000),
            positionBlockText: this.formatNumberBlockForLog(positionBlock),
            rotationBlockText: this.formatNumberBlockForLog(rotationBlock),
            fallbackPosition,
            fallbackRotation,
            fallbackPositionText: this.formatNumberBlockForLog(fallbackPosition),
            fallbackRotationText: this.formatNumberBlockForLog(fallbackRotation),
            fallbackPhysicsToggle,
        });

        track.positions = this.upsertFloatValues(track.positions, 3, frameEdit.index, frameEdit.exists, positionBlock);
        track.rotations = this.upsertFloatValues(track.rotations, 4, frameEdit.index, frameEdit.exists, rotationBlock);
        track.physicsToggles = this.upsertUint8Values(
            track.physicsToggles,
            1,
            frameEdit.index,
            frameEdit.exists,
            fallbackPhysicsToggle,
        );
        track.positionInterpolations = this.upsertUint8Values(
            track.positionInterpolations,
            12,
            frameEdit.index,
            frameEdit.exists,
            this.composePositionInterpolationBlock(curves, "bone-x", "bone-y", "bone-z"),
        );
        track.rotationInterpolations = this.upsertUint8Values(
            track.rotationInterpolations,
            4,
            frameEdit.index,
            frameEdit.exists,
            this.curveToBlock(this.getCurveFromSnapshot(curves, "bone-rot")),
        );
        return true;
    }

    private persistBoneKeyframeInterpolation(
        boneName: string,
        track: RuntimeBoneTrackMutable,
        frame: number,
        curves: ReadonlyMap<string, InterpolationCurve>,
        poseSnapshot: SelectedBonePoseSnapshot | null = null,
    ): boolean {
        const frameEdit = this.upsertFrameNumber(track.frameNumbers, frame);
        const referenceIndex = this.resolveInsertReferenceIndex(track.frameNumbers, frame);
        track.frameNumbers = frameEdit.frames;

        const transform = poseSnapshot ?? this.getPendingBonePoseSnapshot(boneName, frame) ?? this.mmdManager.getBoneTransform(boneName);
        const fallbackRotation = this.readFloatBlock(track.rotations, referenceIndex, 4, [0, 0, 0, 1]);
        const fallbackPhysicsToggle = this.readUint8Block(track.physicsToggles, referenceIndex, 1, [0]);
        const rotationBlock = transform
            ? this.rotationDegreesToQuaternionBlock(transform.rotation.x, transform.rotation.y, transform.rotation.z)
            : fallbackRotation;
        this.debugKeyframeFlow("persist bone keyframe", {
            boneName,
            frame,
            poseSnapshot,
            poseSnapshotText: this.formatPoseSnapshotText(poseSnapshot),
            resolvedTransform: transform,
            resolvedTransformText: this.formatPoseSnapshotText(transform),
            rotation: transform ? this.formatBonePoseSnapshotForLog(transform).rotation : null,
            rotationBlock: rotationBlock.map((value) => Math.round(value * 1000) / 1000),
            rotationBlockText: this.formatNumberBlockForLog(rotationBlock),
            fallbackRotation,
            fallbackRotationText: this.formatNumberBlockForLog(fallbackRotation),
            fallbackPhysicsToggle,
        });

        track.rotations = this.upsertFloatValues(track.rotations, 4, frameEdit.index, frameEdit.exists, rotationBlock);
        track.physicsToggles = this.upsertUint8Values(
            track.physicsToggles,
            1,
            frameEdit.index,
            frameEdit.exists,
            fallbackPhysicsToggle,
        );
        track.rotationInterpolations = this.upsertUint8Values(
            track.rotationInterpolations,
            4,
            frameEdit.index,
            frameEdit.exists,
            this.curveToBlock(this.getCurveFromSnapshot(curves, "bone-rot")),
        );
        return true;
    }

    private rotationDegreesToQuaternionBlock(xDeg: number, yDeg: number, zDeg: number): number[] {
        const degToRad = Math.PI / 180;
        const rotation = Quaternion.RotationYawPitchRoll(yDeg * degToRad, xDeg * degToRad, zDeg * degToRad);
        return [rotation.x, rotation.y, rotation.z, rotation.w];
    }

    private composePositionInterpolationBlock(
        curves: ReadonlyMap<string, InterpolationCurve>,
        xChannelId: string,
        yChannelId: string,
        zChannelId: string,
    ): number[] {
        const x = this.curveToBlock(this.getCurveFromSnapshot(curves, xChannelId));
        const y = this.curveToBlock(this.getCurveFromSnapshot(curves, yChannelId));
        const z = this.curveToBlock(this.getCurveFromSnapshot(curves, zChannelId));
        return [...x, ...y, ...z];
    }

    private getCurveFromSnapshot(curves: ReadonlyMap<string, InterpolationCurve>, channelId: string): InterpolationCurve {
        const curve = curves.get(channelId);
        if (curve) return curve;
        return this.createLinearCurve();
    }

    private curveToBlock(curve: InterpolationCurve): number[] {
        return [
            this.clampInterpolationValue(curve.x1, 20),
            this.clampInterpolationValue(curve.x2, 107),
            this.clampInterpolationValue(curve.y1, 20),
            this.clampInterpolationValue(curve.y2, 107),
        ];
    }

    private resolveInsertReferenceIndex(frames: NumericArrayLike, frame: number): number {
        const normalizedFrame = Math.max(0, Math.floor(frame));
        const exactIndex = this.findFrameIndex(frames, normalizedFrame);
        if (exactIndex >= 0) return exactIndex;
        const referenceFrame = this.resolveInterpolationReferenceFrame(frames, normalizedFrame, true, true);
        if (referenceFrame === null) return -1;
        return this.findFrameIndex(frames, referenceFrame);
    }

    private upsertFrameNumber(
        frames: ArrayLike<number>,
        frame: number,
    ): { frames: Uint32Array; index: number; exists: boolean } {
        const normalizedFrame = Math.max(0, Math.floor(frame));
        const sourceLength = frames?.length ?? 0;

        let lo = 0;
        let hi = sourceLength;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if ((frames[mid] ?? 0) < normalizedFrame) lo = mid + 1;
            else hi = mid;
        }

        const exists = lo < sourceLength && (frames[lo] ?? 0) === normalizedFrame;
        if (exists) {
            const nextFrames = new Uint32Array(sourceLength);
            for (let i = 0; i < sourceLength; i += 1) nextFrames[i] = Math.max(0, Math.floor(frames[i] ?? 0));
            return { frames: nextFrames, index: lo, exists: true };
        }

        const nextFrames = new Uint32Array(sourceLength + 1);
        for (let i = 0; i < lo; i += 1) nextFrames[i] = Math.max(0, Math.floor(frames[i] ?? 0));
        nextFrames[lo] = normalizedFrame;
        for (let i = lo; i < sourceLength; i += 1) nextFrames[i + 1] = Math.max(0, Math.floor(frames[i] ?? 0));
        return { frames: nextFrames, index: lo, exists: false };
    }

    private upsertFloatValues(
        values: ArrayLike<number>,
        stride: number,
        frameIndex: number,
        exists: boolean,
        block: readonly number[],
    ): Float32Array {
        const sourceFrameCount = Math.floor((values?.length ?? 0) / stride);
        const targetFrameCount = sourceFrameCount + (exists ? 0 : 1);
        const target = new Float32Array(targetFrameCount * stride);

        for (let sourceFrameIndex = 0; sourceFrameIndex < sourceFrameCount; sourceFrameIndex += 1) {
            const targetFrameIndex = !exists && sourceFrameIndex >= frameIndex
                ? sourceFrameIndex + 1
                : sourceFrameIndex;
            const sourceOffset = sourceFrameIndex * stride;
            const targetOffset = targetFrameIndex * stride;
            for (let i = 0; i < stride; i += 1) {
                const value = values[sourceOffset + i];
                target[targetOffset + i] = Number.isFinite(value) ? value : 0;
            }
        }

        const writeOffset = frameIndex * stride;
        for (let i = 0; i < stride; i += 1) {
            const value = block[i] ?? 0;
            target[writeOffset + i] = Number.isFinite(value) ? value : 0;
        }

        return target;
    }

    private upsertUint8Values(
        values: ArrayLike<number>,
        stride: number,
        frameIndex: number,
        exists: boolean,
        block: readonly number[],
    ): Uint8Array {
        const sourceFrameCount = Math.floor((values?.length ?? 0) / stride);
        const targetFrameCount = sourceFrameCount + (exists ? 0 : 1);
        const target = new Uint8Array(targetFrameCount * stride);

        for (let sourceFrameIndex = 0; sourceFrameIndex < sourceFrameCount; sourceFrameIndex += 1) {
            const targetFrameIndex = !exists && sourceFrameIndex >= frameIndex
                ? sourceFrameIndex + 1
                : sourceFrameIndex;
            const sourceOffset = sourceFrameIndex * stride;
            const targetOffset = targetFrameIndex * stride;
            for (let i = 0; i < stride; i += 1) {
                const value = values[sourceOffset + i];
                const normalized = Number.isFinite(value) ? Math.round(value) : 0;
                target[targetOffset + i] = Math.max(0, Math.min(255, normalized));
            }
        }

        const writeOffset = frameIndex * stride;
        for (let i = 0; i < stride; i += 1) {
            const value = block[i] ?? 0;
            const normalized = Number.isFinite(value) ? Math.round(value) : 0;
            target[writeOffset + i] = Math.max(0, Math.min(255, normalized));
        }

        return target;
    }

    private readFloatBlock(
        values: ArrayLike<number>,
        frameIndex: number,
        stride: number,
        fallback: readonly number[],
    ): number[] {
        const block = new Array<number>(stride);
        for (let i = 0; i < stride; i += 1) block[i] = Number.isFinite(fallback[i]) ? fallback[i] : 0;
        if (frameIndex < 0) return block;

        const offset = frameIndex * stride;
        for (let i = 0; i < stride; i += 1) {
            const value = values[offset + i];
            if (Number.isFinite(value)) block[i] = value;
        }
        return block;
    }

    private readUint8Block(
        values: ArrayLike<number>,
        frameIndex: number,
        stride: number,
        fallback: readonly number[],
    ): number[] {
        const block = new Array<number>(stride);
        for (let i = 0; i < stride; i += 1) {
            const value = Number.isFinite(fallback[i]) ? Math.round(fallback[i]) : 0;
            block[i] = Math.max(0, Math.min(255, value));
        }
        if (frameIndex < 0) return block;

        const offset = frameIndex * stride;
        for (let i = 0; i < stride; i += 1) {
            const raw = values[offset + i];
            if (!Number.isFinite(raw)) continue;
            const normalized = Math.round(raw);
            block[i] = Math.max(0, Math.min(255, normalized));
        }
        return block;
    }

    private deleteSelectedKeyframe(): void {
        const track = this.getSelectedTimelineTrack();
        if (!track) {
            this.showToast("Please select a track", "error");
            return;
        }

        const frame = this.timeline.getSelectedFrame() ?? this.mmdManager.currentFrame;
        const removed = this.mmdManager.removeTimelineKeyframe(track, frame);
        if (!removed) {
            this.showToast(`Frame ${frame}: no keyframe`, "info");
            return;
        }

        if (this.timeline.getSelectedFrame() === frame) {
            this.timeline.setSelectedFrame(null);
        }
        this.updateTimelineEditState();
        this.showToast(`Frame ${frame}: keyframe deleted`, "success");
    }

    private nudgeSelectedKeyframe(deltaFrame: number): void {
        const seekByDelta = (): void => {
            const toFrame = Math.max(0, this.mmdManager.currentFrame + deltaFrame);
            this.mmdManager.seekToBoundary(toFrame);
            this.updateTimelineEditState();
        };

        const track = this.getSelectedTimelineTrack();
        const fromFrame = this.timeline.getSelectedFrame();
        if (!track || fromFrame === null) {
            seekByDelta();
            return;
        }

        const toFrame = Math.max(0, fromFrame + deltaFrame);
        const moved = this.mmdManager.moveTimelineKeyframe(track, fromFrame, toFrame);
        if (!moved) {
            seekByDelta();
            return;
        }

        this.timeline.setSelectedFrame(toFrame);
        this.mmdManager.seekToBoundary(toFrame);
        this.updateTimelineEditState();
        this.showToast(`Key moved: ${fromFrame} -> ${toFrame}`, "success");
    }

    private getPlaybackFrameRange(): { startFrame: number; endFrame: number } {
        return this.exportUiController?.getPlaybackFrameRange() ?? {
            startFrame: 0,
            endFrame: Math.max(0, Math.floor(this.mmdManager.totalFrames)),
        };
    }

    private isPlaybackFrameStartEnabled(): boolean {
        return this.exportUiController?.isPlaybackFrameStartEnabled() ?? false;
    }

    private isPlaybackFrameStopEnabled(): boolean {
        return this.exportUiController?.isPlaybackFrameStopEnabled() ?? false;
    }

    private play(updateStatus = true): void {
        const { startFrame } = this.getPlaybackFrameRange();
        if (this.isPlaybackFrameStartEnabled()) {
            this.mmdManager.pause();
            this.mmdManager.seekTo(startFrame);
        }
        this.mmdManager.play();
        this.btnPlay.style.display = "none";
        this.btnPause.style.display = "flex";
        if (updateStatus) this.setStatus("Playing", false);
    }

    private pause(updateStatus = true): void {
        this.mmdManager.pause();
        this.btnPlay.style.display = "flex";
        this.btnPause.style.display = "none";
        if (updateStatus) this.setStatus("Paused", false);
    }

    private stop(): void {
        this.mmdManager.pause();
        if (!this.isPlaybackFrameStopEnabled()) {
            this.mmdManager.seekToBoundary(this.getPlaybackFrameRange().startFrame);
        }
        this.btnPlay.style.display = "flex";
        this.btnPause.style.display = "none";
        this.setStatus("Stopped", false);
    }

    private stopAtPlaybackEnd(endFrame: number): void {
        this.mmdManager.pause();
        this.mmdManager.seekToBoundary(endFrame);
        this.btnPlay.style.display = "flex";
        this.btnPause.style.display = "none";
        this.setStatus("Stopped", false);
    }

    private setStatus(text: string, loading: boolean): void {
        this.statusText.textContent = text;
        if (loading) {
            this.statusDot.classList.add("loading");
        } else {
            this.statusDot.classList.remove("loading");
        }
    }

    private showToast(message: string, type: "success" | "error" | "info" = "info"): void {
        const toast = document.createElement("div");
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = "slideOut 0.3s ease forwards";
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}
