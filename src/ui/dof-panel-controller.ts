import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";

type DofPanelElements = {
    cameraControls: HTMLElement | null;
    cameraDofControls: HTMLElement | null;
    enabledInput: HTMLInputElement | null;
    enabledValue: HTMLElement | null;
    qualitySelect: HTMLSelectElement | null;
    qualityValue: HTMLElement | null;
    focusSlider: HTMLInputElement | null;
    focusValue: HTMLElement | null;
    targetModelSelect: HTMLSelectElement | null;
    targetBoneSelect: HTMLSelectElement | null;
    focusOffsetSlider: HTMLInputElement | null;
    focusOffsetValue: HTMLElement | null;
    fStopSlider: HTMLInputElement | null;
    fStopValue: HTMLElement | null;
    nearSuppressionSlider: HTMLInputElement | null;
    nearSuppressionValue: HTMLElement | null;
    focalInvertInput: HTMLInputElement | null;
    focalInvertValue: HTMLElement | null;
    lensBlurSlider: HTMLInputElement | null;
    lensBlurValue: HTMLElement | null;
    lensSizeSlider: HTMLInputElement | null;
    lensSizeValue: HTMLElement | null;
    focalLengthSlider: HTMLInputElement | null;
    focalLengthValue: HTMLElement | null;
};

export type DofPanelControllerDeps = {
    mmdManager: MmdManager;
    syncRangeNumberInput: (slider: HTMLInputElement) => void;
    isRangeInputEditing: (slider: HTMLInputElement) => boolean;
};

function resolveDofPanelElements(): DofPanelElements {
    return {
        cameraControls: document.getElementById("camera-controls"),
        cameraDofControls: document.getElementById("camera-dof-controls"),
        enabledInput: document.getElementById("effect-dof-enabled") as HTMLInputElement | null,
        enabledValue: document.getElementById("effect-dof-enabled-val"),
        qualitySelect: document.getElementById("effect-dof-quality") as HTMLSelectElement | null,
        qualityValue: document.getElementById("effect-dof-quality-val"),
        focusSlider: document.getElementById("effect-dof-focus") as HTMLInputElement | null,
        focusValue: document.getElementById("effect-dof-focus-val"),
        targetModelSelect: document.getElementById("effect-dof-target-model") as HTMLSelectElement | null,
        targetBoneSelect: document.getElementById("effect-dof-target-bone") as HTMLSelectElement | null,
        focusOffsetSlider: document.getElementById("effect-dof-focus-offset") as HTMLInputElement | null,
        focusOffsetValue: document.getElementById("effect-dof-focus-offset-val"),
        fStopSlider: document.getElementById("effect-dof-fstop") as HTMLInputElement | null,
        fStopValue: document.getElementById("effect-dof-fstop-val"),
        nearSuppressionSlider: document.getElementById("effect-dof-near-suppression") as HTMLInputElement | null,
        nearSuppressionValue: document.getElementById("effect-dof-near-suppression-val"),
        focalInvertInput: document.getElementById("effect-dof-focal-invert") as HTMLInputElement | null,
        focalInvertValue: document.getElementById("effect-dof-focal-invert-val"),
        lensBlurSlider: document.getElementById("effect-dof-lens-blur") as HTMLInputElement | null,
        lensBlurValue: document.getElementById("effect-dof-lens-blur-val"),
        lensSizeSlider: document.getElementById("effect-dof-lens-size") as HTMLInputElement | null,
        lensSizeValue: document.getElementById("effect-dof-lens-size-val"),
        focalLengthSlider: document.getElementById("effect-dof-focal-length") as HTMLInputElement | null,
        focalLengthValue: document.getElementById("effect-dof-focal-length-val"),
    };
}

export class DofPanelController {
    private readonly elements: DofPanelElements;
    private readonly mmdManager: MmdManager;
    private readonly syncRangeNumberInput: (slider: HTMLInputElement) => void;
    private readonly isRangeInputEditing: (slider: HTMLInputElement) => boolean;

    constructor(deps: DofPanelControllerDeps) {
        this.elements = resolveDofPanelElements();
        this.mmdManager = deps.mmdManager;
        this.syncRangeNumberInput = deps.syncRangeNumberInput;
        this.isRangeInputEditing = deps.isRangeInputEditing;

        this.setupControls();
    }

    public attachControlsToShaderPanel(host: HTMLElement): void {
        if (!this.elements.cameraDofControls) {
            return;
        }
        this.elements.cameraDofControls.classList.add("shader-postfx-dof-controls");
        if (this.elements.cameraDofControls.parentElement !== host) {
            host.appendChild(this.elements.cameraDofControls);
        }
    }

    public restoreControlsToCameraPanel(): void {
        if (!this.elements.cameraDofControls) {
            return;
        }
        this.elements.cameraDofControls.classList.remove("shader-postfx-dof-controls");
        if (
            this.elements.cameraControls &&
            this.elements.cameraDofControls.parentElement !== this.elements.cameraControls
        ) {
            this.elements.cameraControls.appendChild(this.elements.cameraDofControls);
        }
    }

    public refreshFocusTargetControls(): void {
        if (!this.elements.targetModelSelect || !this.elements.targetBoneSelect) {
            return;
        }

        const modelSelect = this.elements.targetModelSelect;
        const boneSelect = this.elements.targetBoneSelect;
        const loadedModels = this.mmdManager.getLoadedModels();
        const targetModelPath = this.mmdManager.getDofFocusTargetModelPath();
        const targetBoneName = this.mmdManager.getDofFocusTargetBoneName();
        const resolvedModel = targetModelPath
            ? loadedModels.find((model) => model.path === targetModelPath) ?? null
            : null;

        modelSelect.innerHTML = "";
        const cameraOption = document.createElement("option");
        cameraOption.value = "";
        cameraOption.textContent = t("option.cameraTarget");
        modelSelect.appendChild(cameraOption);

        for (const model of loadedModels) {
            const option = document.createElement("option");
            option.value = String(model.index);
            option.textContent = model.name;
            modelSelect.appendChild(option);
        }

        if (targetModelPath && !resolvedModel) {
            this.mmdManager.setDofFocusTargetByIndex(null, null);
            return;
        }

        modelSelect.value = resolvedModel ? String(resolvedModel.index) : "";
        modelSelect.disabled = loadedModels.length === 0;

        boneSelect.innerHTML = "";
        if (!resolvedModel) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = t("option.none");
            boneSelect.appendChild(option);
            boneSelect.value = "";
            boneSelect.disabled = true;
            return;
        }

        const boneNames = this.mmdManager.getModelBoneNames(resolvedModel.index);
        for (const boneName of boneNames) {
            const option = document.createElement("option");
            option.value = boneName;
            option.textContent = boneName;
            boneSelect.appendChild(option);
        }

        const fallbackBoneName =
            targetBoneName && boneNames.includes(targetBoneName)
                ? targetBoneName
                : this.mmdManager.getPreferredDofFocusBoneName(resolvedModel.index);

        boneSelect.value = fallbackBoneName && boneNames.includes(fallbackBoneName) ? fallbackBoneName : (boneNames[0] ?? "");
        boneSelect.disabled = boneNames.length === 0;
    }

    public refreshAutoFocusReadout(): void {
        if (!this.mmdManager.dofAutoFocusEnabled) return;

        if (
            this.elements.focusSlider &&
            this.elements.focusValue &&
            !this.isRangeInputEditing(this.elements.focusSlider)
        ) {
            const focusMm = this.mmdManager.dofFocusDistanceMm;
            const sliderMin = Number(this.elements.focusSlider.min);
            const sliderMax = Number(this.elements.focusSlider.max);
            const clamped = Math.max(sliderMin, Math.min(sliderMax, focusMm));
            this.elements.focusSlider.value = String(Math.round(clamped));
            this.elements.focusValue.textContent = `${(focusMm / 1000).toFixed(1)}m (auto)`;
            const targetModelPath = this.mmdManager.getDofFocusTargetModelPath();
            const targetBoneName = this.mmdManager.getDofFocusTargetBoneName();
            this.elements.focusSlider.title = targetModelPath
                ? `Auto focus (${targetBoneName ?? "target"}, ${this.mmdManager.dofAutoFocusRangeMeters.toFixed(1)}m radius in focus)`
                : `Auto focus (camera target, ${this.mmdManager.dofAutoFocusRangeMeters.toFixed(1)}m radius in focus)`;
            this.syncRangeNumberInput(this.elements.focusSlider);
        }

        if (this.elements.fStopValue) {
            const baseFStop = this.mmdManager.dofFStop;
            const effectiveFStop = this.mmdManager.dofEffectiveFStop;
            const hasCompensation = effectiveFStop > baseFStop + 0.01;
            this.elements.fStopValue.textContent = hasCompensation
                ? `${baseFStop.toFixed(2)} -> ${effectiveFStop.toFixed(2)}`
                : effectiveFStop.toFixed(2);
        }

        if (
            this.mmdManager.dofFocalLengthLinkedToCameraFov &&
            this.elements.focalLengthSlider &&
            this.elements.focalLengthValue &&
            !this.isRangeInputEditing(this.elements.focalLengthSlider)
        ) {
            const focalLength = this.mmdManager.dofFocalLength;
            const sliderMin = Number(this.elements.focalLengthSlider.min);
            const sliderMax = Number(this.elements.focalLengthSlider.max);
            const clamped = Math.max(sliderMin, Math.min(sliderMax, focalLength));
            this.elements.focalLengthSlider.value = String(Math.round(clamped));
            this.elements.focalLengthValue.textContent = this.mmdManager.dofFocalLengthDistanceInverted
                ? `${Math.round(focalLength)} (auto, inv)`
                : `${Math.round(focalLength)} (auto)`;
            this.syncRangeNumberInput(this.elements.focalLengthSlider);
        }
    }

    private setupControls(): void {
        const elements = this.elements;
        if (
            !elements.enabledInput ||
            !elements.enabledValue ||
            !elements.qualitySelect ||
            !elements.qualityValue ||
            !elements.focusSlider ||
            !elements.focusValue ||
            !elements.focusOffsetSlider ||
            !elements.focusOffsetValue ||
            !elements.fStopSlider ||
            !elements.fStopValue ||
            !elements.nearSuppressionSlider ||
            !elements.nearSuppressionValue ||
            !elements.focalInvertInput ||
            !elements.focalInvertValue ||
            !elements.lensSizeSlider ||
            !elements.lensSizeValue ||
            !elements.focalLengthSlider ||
            !elements.focalLengthValue
        ) {
            return;
        }

        const blurLabels = [t("option.low"), t("option.medium"), t("option.high")];
        const autoFocusEnabled = this.mmdManager.dofAutoFocusEnabled;
        const focalLengthLinkedToFov = this.mmdManager.dofFocalLengthLinkedToCameraFov;
        const enabledInput = elements.enabledInput;
        const enabledValue = elements.enabledValue;
        const qualitySelect = elements.qualitySelect;
        const qualityValue = elements.qualityValue;
        const focusSlider = elements.focusSlider;
        const focusValue = elements.focusValue;
        const focusOffsetSlider = elements.focusOffsetSlider;
        const focusOffsetValue = elements.focusOffsetValue;
        const fStopSlider = elements.fStopSlider;
        const fStopValue = elements.fStopValue;
        const nearSuppressionSlider = elements.nearSuppressionSlider;
        const nearSuppressionValue = elements.nearSuppressionValue;
        const focalInvertInput = elements.focalInvertInput;
        const focalInvertValue = elements.focalInvertValue;
        const lensBlurSlider = elements.lensBlurSlider;
        const lensBlurValue = elements.lensBlurValue;
        const lensSizeSlider = elements.lensSizeSlider;
        const lensSizeValue = elements.lensSizeValue;
        const focalLengthSlider = elements.focalLengthSlider;
        const focalLengthValue = elements.focalLengthValue;

        const applyDofEnabled = (): void => {
            enabledInput.checked = this.mmdManager.dofEnabled = enabledInput.checked;
            enabledValue.textContent = this.mmdManager.dofEnabled ? t("status.on") : t("status.off");
        };
        const applyDofQuality = (): void => {
            const level = Number(qualitySelect.value);
            this.mmdManager.dofBlurLevel = level;
            qualityValue.textContent = blurLabels[this.mmdManager.dofBlurLevel] ?? t("option.high");
        };
        const applyDofFocus = (): void => {
            if (autoFocusEnabled) {
                this.refreshAutoFocusReadout();
                return;
            }
            const mm = Number(focusSlider.value);
            this.mmdManager.dofFocusDistanceMm = mm;
            focusValue.textContent = `${(this.mmdManager.dofFocusDistanceMm / 1000).toFixed(1)}m`;
        };
        const applyDofFocusOffset = (): void => {
            const mm = Number(focusOffsetSlider.value);
            this.mmdManager.dofAutoFocusNearOffsetMm = mm;
            focusOffsetValue.textContent = `${(this.mmdManager.dofAutoFocusNearOffsetMm / 1000).toFixed(1)}m`;
            if (autoFocusEnabled) {
                this.refreshAutoFocusReadout();
            }
        };
        const applyDofFStop = (): void => {
            const fStop = Number(fStopSlider.value) / 100;
            this.mmdManager.dofFStop = fStop;
            if (autoFocusEnabled) {
                this.refreshAutoFocusReadout();
                return;
            }
            fStopValue.textContent = this.mmdManager.dofFStop.toFixed(2);
        };
        const applyDofNearSuppression = (): void => {
            const scale = Number(nearSuppressionSlider.value) / 100;
            this.mmdManager.dofNearSuppressionScale = scale;
            nearSuppressionValue.textContent = `${Math.round(this.mmdManager.dofNearSuppressionScale * 100)}%`;
            if (autoFocusEnabled) {
                this.refreshAutoFocusReadout();
            }
        };
        const applyDofFocalInvert = (): void => {
            this.mmdManager.dofFocalLengthDistanceInverted = focalInvertInput.checked;
            focalInvertValue.textContent = this.mmdManager.dofFocalLengthDistanceInverted ? t("status.on") : t("status.off");
            if (focalLengthLinkedToFov) {
                focalLengthSlider.title = this.mmdManager.dofFocalLengthDistanceInverted
                    ? "Auto focal length (linked to camera FoV, inverted)"
                    : "Auto focal length (linked to camera FoV)";
                this.refreshAutoFocusReadout();
            }
        };
        const applyDofLensBlur = (): void => {
            if (!lensBlurSlider || !lensBlurValue) {
                return;
            }
            const strength = Number(lensBlurSlider.value) / 100;
            this.mmdManager.dofLensBlurStrength = strength;
            lensBlurValue.textContent = `${Math.round(this.mmdManager.dofLensBlurStrength * 100)}%`;
            this.syncRangeNumberInput(lensBlurSlider);
        };
        const applyDofLensSize = (): void => {
            const lensSize = Number(lensSizeSlider.value);
            this.mmdManager.dofLensSize = lensSize;
            lensSizeValue.textContent = `${Math.round(this.mmdManager.dofLensSize)}`;
            if (autoFocusEnabled) {
                this.refreshAutoFocusReadout();
            }
        };
        const applyDofFocalLength = (): void => {
            if (focalLengthLinkedToFov) {
                this.refreshAutoFocusReadout();
                return;
            }
            const focalLength = Number(focalLengthSlider.value);
            this.mmdManager.dofFocalLength = focalLength;
            focalLengthValue.textContent = `${Math.round(this.mmdManager.dofFocalLength)}`;
            if (autoFocusEnabled) {
                this.refreshAutoFocusReadout();
            }
        };
        const applyDofTargetModel = (): void => {
            if (!elements.targetModelSelect) return;
            const modelIndex = Number.parseInt(elements.targetModelSelect.value, 10);
            if (Number.isNaN(modelIndex)) {
                this.mmdManager.setDofFocusTargetByIndex(null, null);
                this.refreshFocusTargetControls();
                this.refreshAutoFocusReadout();
                return;
            }
            const preferredBoneName = this.mmdManager.getPreferredDofFocusBoneName(modelIndex);
            this.mmdManager.setDofFocusTargetByIndex(modelIndex, preferredBoneName);
            this.refreshFocusTargetControls();
            this.refreshAutoFocusReadout();
        };
        const applyDofTargetBone = (): void => {
            if (!elements.targetModelSelect || !elements.targetBoneSelect) return;
            const modelIndex = Number.parseInt(elements.targetModelSelect.value, 10);
            if (Number.isNaN(modelIndex)) {
                this.mmdManager.setDofFocusTargetByIndex(null, null);
                this.refreshFocusTargetControls();
                this.refreshAutoFocusReadout();
                return;
            }
            const boneName = elements.targetBoneSelect.value || null;
            this.mmdManager.setDofFocusTargetByIndex(modelIndex, boneName);
            this.refreshFocusTargetControls();
            this.refreshAutoFocusReadout();
        };

        enabledInput.checked = this.mmdManager.dofEnabled;
        qualitySelect.value = String(this.mmdManager.dofBlurLevel);
        focusSlider.value = String(Math.round(this.mmdManager.dofFocusDistanceMm));
        focusOffsetSlider.value = String(Math.round(this.mmdManager.dofAutoFocusNearOffsetMm));
        fStopSlider.value = String(Math.round(this.mmdManager.dofFStop * 100));
        nearSuppressionSlider.value = String(Math.round(this.mmdManager.dofNearSuppressionScale * 100));
        focalInvertInput.checked = this.mmdManager.dofFocalLengthDistanceInverted;
        if (lensBlurSlider && lensBlurValue) {
            lensBlurSlider.value = String(Math.round(this.mmdManager.dofLensBlurStrength * 100));
            lensBlurSlider.disabled = false;
            lensBlurSlider.title = "";
            lensBlurValue.textContent = `${Math.round(this.mmdManager.dofLensBlurStrength * 100)}%`;
            lensBlurValue.title = "";
        }
        lensSizeSlider.value = String(Math.round(this.mmdManager.dofLensSize));
        focalLengthSlider.value = String(Math.round(this.mmdManager.dofFocalLength));
        if (autoFocusEnabled) {
            focusSlider.disabled = true;
            focusSlider.title = "Auto focus";
        }
        if (focalLengthLinkedToFov) {
            focalLengthSlider.disabled = true;
            focalLengthSlider.title = "Auto focal length (linked to camera FoV)";
        }

        applyDofEnabled();
        applyDofQuality();
        applyDofFocus();
        applyDofFocusOffset();
        applyDofFStop();
        applyDofNearSuppression();
        applyDofFocalInvert();
        applyDofLensBlur();
        applyDofLensSize();
        applyDofFocalLength();
        this.refreshFocusTargetControls();
        this.refreshAutoFocusReadout();

        enabledInput.addEventListener("change", applyDofEnabled);
        qualitySelect.addEventListener("change", applyDofQuality);
        if (!autoFocusEnabled) {
            focusSlider.addEventListener("input", applyDofFocus);
        }
        elements.targetModelSelect?.addEventListener("change", applyDofTargetModel);
        elements.targetBoneSelect?.addEventListener("change", applyDofTargetBone);
        focusOffsetSlider.addEventListener("input", applyDofFocusOffset);
        fStopSlider.addEventListener("input", applyDofFStop);
        nearSuppressionSlider.addEventListener("input", applyDofNearSuppression);
        focalInvertInput.addEventListener("change", applyDofFocalInvert);
        if (lensBlurSlider) {
            lensBlurSlider.addEventListener("input", applyDofLensBlur);
        }
        lensSizeSlider.addEventListener("input", applyDofLensSize);
        if (!focalLengthLinkedToFov) {
            focalLengthSlider.addEventListener("input", applyDofFocalLength);
        }
    }
}
