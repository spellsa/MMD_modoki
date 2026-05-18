import type { MmdManager } from "../mmd-manager";
import type { EditorAction } from "../actions/types";

export type CameraViewPreset = "left" | "front" | "right" | "top" | "back" | "bottom";

type CameraPanelElements = {
    leftButton: HTMLButtonElement | null;
    frontButton: HTMLButtonElement | null;
    rightButton: HTMLButtonElement | null;
    topButton: HTMLButtonElement | null;
    backButton: HTMLButtonElement | null;
    bottomButton: HTMLButtonElement | null;
    distanceSlider: HTMLInputElement | null;
    distanceValue: HTMLElement | null;
    mirroringFloorEnabled: HTMLInputElement | null;
    mirroringFloorEnabledValue: HTMLElement | null;
    mirroringFloorReflectance: HTMLInputElement | null;
    mirroringFloorReflectanceValue: HTMLElement | null;
    mirroringFloorSize: HTMLInputElement | null;
    mirroringFloorSizeValue: HTMLElement | null;
    mirroringFloorHeight: HTMLInputElement | null;
    mirroringFloorHeightValue: HTMLElement | null;
    mirroringFloorResolution: HTMLSelectElement | null;
};

export type CameraPanelControllerDeps = {
    mmdManager: MmdManager;
    syncRangeNumberInput: (slider: HTMLInputElement) => void;
    normalizeRangeInputValue: (slider: HTMLInputElement, value: number) => number;
    formatRangeInputValue: (slider: HTMLInputElement, value: number) => string;
    isRangeInputEditing: (slider: HTMLInputElement) => boolean;
    onCameraEdited: () => void;
    dispatchAction?: (action: EditorAction) => boolean;
};

function resolveCameraPanelElements(): CameraPanelElements {
    return {
        leftButton: document.getElementById("btn-cam-left") as HTMLButtonElement | null,
        frontButton: document.getElementById("btn-cam-front") as HTMLButtonElement | null,
        rightButton: document.getElementById("btn-cam-right") as HTMLButtonElement | null,
        topButton: document.getElementById("btn-cam-top") as HTMLButtonElement | null,
        backButton: document.getElementById("btn-cam-back") as HTMLButtonElement | null,
        bottomButton: document.getElementById("btn-cam-bottom") as HTMLButtonElement | null,
        distanceSlider: document.getElementById("cam-distance") as HTMLInputElement | null,
        distanceValue: document.getElementById("cam-distance-value"),
        mirroringFloorEnabled: document.getElementById("mirroring-floor-enabled") as HTMLInputElement | null,
        mirroringFloorEnabledValue: document.getElementById("mirroring-floor-enabled-val"),
        mirroringFloorReflectance: document.getElementById("mirroring-floor-reflectance") as HTMLInputElement | null,
        mirroringFloorReflectanceValue: document.getElementById("mirroring-floor-reflectance-val"),
        mirroringFloorSize: document.getElementById("mirroring-floor-size") as HTMLInputElement | null,
        mirroringFloorSizeValue: document.getElementById("mirroring-floor-size-val"),
        mirroringFloorHeight: document.getElementById("mirroring-floor-height") as HTMLInputElement | null,
        mirroringFloorHeightValue: document.getElementById("mirroring-floor-height-val"),
        mirroringFloorResolution: document.getElementById("mirroring-floor-resolution") as HTMLSelectElement | null,
    };
}

export class CameraPanelController {
    private readonly elements: CameraPanelElements;
    private readonly mmdManager: MmdManager;
    private readonly syncRangeNumberInput: (slider: HTMLInputElement) => void;
    private readonly normalizeRangeInputValue: (slider: HTMLInputElement, value: number) => number;
    private readonly formatRangeInputValue: (slider: HTMLInputElement, value: number) => string;
    private readonly isRangeInputEditing: (slider: HTMLInputElement) => boolean;
    private readonly onCameraEdited: () => void;
    private readonly dispatchAction: ((action: EditorAction) => boolean) | null;

    constructor(deps: CameraPanelControllerDeps) {
        this.elements = resolveCameraPanelElements();
        this.mmdManager = deps.mmdManager;
        this.syncRangeNumberInput = deps.syncRangeNumberInput;
        this.normalizeRangeInputValue = deps.normalizeRangeInputValue;
        this.formatRangeInputValue = deps.formatRangeInputValue;
        this.isRangeInputEditing = deps.isRangeInputEditing;
        this.onCameraEdited = deps.onCameraEdited;
        this.dispatchAction = deps.dispatchAction ?? null;

        this.setupControls();
    }

    public refresh(force = false, displayDistance?: number): void {
        const slider = this.elements.distanceSlider;
        const valueEl = this.elements.distanceValue;
        if (!slider || !valueEl) return;
        if (!force && this.isRangeInputEditing(slider)) return;

        const distance = displayDistance ?? this.mmdManager.getCameraDistance();
        const clamped = this.normalizeRangeInputValue(slider, distance);
        slider.value = this.formatRangeInputValue(slider, clamped);
        valueEl.textContent = `${distance.toFixed(1)}m`;
        this.syncRangeNumberInput(slider);
        this.refreshMirroringFloorControls();
    }

    public setCameraViewPreset(view: CameraViewPreset): void {
        this.mmdManager.setCameraView(view);
        this.updateViewButtons(view);
        this.onCameraEdited();
    }

    public setMirroringFloorEnabled(enabled: boolean): void {
        this.mmdManager.mirroringFloorEnabled = enabled;
        this.refreshMirroringFloorControls();
    }

    public setMirroringFloorResolution(resolution: number): void {
        this.mmdManager.mirroringFloorResolution = resolution;
        this.refreshMirroringFloorControls();
    }

    private setupControls(): void {
        const switchCameraView = (view: CameraViewPreset): void => {
            if (this.dispatchAction?.({ type: "camera.setViewPreset", source: "button", view })) return;
            this.setCameraViewPreset(view);
        };

        this.elements.leftButton?.addEventListener("click", () => switchCameraView("left"));
        this.elements.frontButton?.addEventListener("click", () => switchCameraView("front"));
        this.elements.rightButton?.addEventListener("click", () => switchCameraView("right"));
        this.elements.topButton?.addEventListener("click", () => switchCameraView("top"));
        this.elements.backButton?.addEventListener("click", () => switchCameraView("back"));
        this.elements.bottomButton?.addEventListener("click", () => switchCameraView("bottom"));

        this.elements.distanceSlider?.addEventListener("input", () => {
            const slider = this.elements.distanceSlider;
            const valueEl = this.elements.distanceValue;
            if (!slider || !valueEl) return;

            this.mmdManager.setCameraDistance(Number(slider.value));
            valueEl.textContent = `${this.mmdManager.getCameraDistance().toFixed(1)}m`;
            this.onCameraEdited();
        });

        this.updateViewButtons("front");
        this.setupMirroringFloorControls();
        this.refresh(true);
    }

    private setupMirroringFloorControls(): void {
        this.elements.mirroringFloorEnabled?.addEventListener("change", () => {
            const enabled = this.elements.mirroringFloorEnabled?.checked ?? false;
            if (this.dispatchAction?.({ type: "camera.setMirroringFloorEnabled", source: "panel", enabled })) return;
            this.setMirroringFloorEnabled(enabled);
        });

        this.elements.mirroringFloorReflectance?.addEventListener("input", () => {
            const value = Number(this.elements.mirroringFloorReflectance?.value ?? 35) / 100;
            this.mmdManager.mirroringFloorReflectance = value;
            this.refreshMirroringFloorControls();
        });

        this.elements.mirroringFloorSize?.addEventListener("input", () => {
            const value = Number(this.elements.mirroringFloorSize?.value ?? 40);
            this.mmdManager.mirroringFloorSize = value;
            this.refreshMirroringFloorControls();
        });

        this.elements.mirroringFloorHeight?.addEventListener("input", () => {
            const value = Number(this.elements.mirroringFloorHeight?.value ?? 0) / 100;
            this.mmdManager.mirroringFloorHeight = value;
            this.refreshMirroringFloorControls();
        });

        this.elements.mirroringFloorResolution?.addEventListener("change", () => {
            const value = Number(this.elements.mirroringFloorResolution?.value ?? 512);
            if (this.dispatchAction?.({
                type: "camera.setMirroringFloorResolution",
                source: "panel",
                resolution: value,
            })) return;
            this.setMirroringFloorResolution(value);
        });

        this.refreshMirroringFloorControls();
    }

    private refreshMirroringFloorControls(): void {
        if (this.elements.mirroringFloorEnabled) {
            this.elements.mirroringFloorEnabled.checked = this.mmdManager.mirroringFloorEnabled;
        }
        if (this.elements.mirroringFloorEnabledValue) {
            this.elements.mirroringFloorEnabledValue.textContent = this.mmdManager.mirroringFloorEnabled ? "ON" : "OFF";
        }
        if (this.elements.mirroringFloorReflectance && this.elements.mirroringFloorReflectanceValue) {
            const value = Math.round(this.mmdManager.mirroringFloorReflectance * 100);
            this.elements.mirroringFloorReflectance.value = String(value);
            this.elements.mirroringFloorReflectanceValue.textContent = `${value}%`;
        }
        if (this.elements.mirroringFloorSize && this.elements.mirroringFloorSizeValue) {
            const value = Math.round(this.mmdManager.mirroringFloorSize);
            this.elements.mirroringFloorSize.value = String(value);
            this.elements.mirroringFloorSizeValue.textContent = `${value}m`;
        }
        if (this.elements.mirroringFloorHeight && this.elements.mirroringFloorHeightValue) {
            const value = Math.round(this.mmdManager.mirroringFloorHeight * 100);
            this.elements.mirroringFloorHeight.value = String(value);
            this.elements.mirroringFloorHeightValue.textContent = `${this.mmdManager.mirroringFloorHeight.toFixed(2)}m`;
        }
        if (this.elements.mirroringFloorResolution) {
            this.elements.mirroringFloorResolution.value = String(this.mmdManager.mirroringFloorResolution);
        }
    }

    private updateViewButtons(active: CameraViewPreset): void {
        this.updateViewButton(this.elements.leftButton, active === "left");
        this.updateViewButton(this.elements.frontButton, active === "front");
        this.updateViewButton(this.elements.rightButton, active === "right");
        this.updateViewButton(this.elements.topButton, active === "top");
        this.updateViewButton(this.elements.backButton, active === "back");
        this.updateViewButton(this.elements.bottomButton, active === "bottom");
    }

    private updateViewButton(button: HTMLButtonElement | null, active: boolean): void {
        button?.classList.toggle("camera-view-btn--active", active);
        button?.setAttribute("aria-pressed", active ? "true" : "false");
    }
}
