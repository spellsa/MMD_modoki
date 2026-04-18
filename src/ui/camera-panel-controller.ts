import type { MmdManager } from "../mmd-manager";

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
};

export type CameraPanelControllerDeps = {
    mmdManager: MmdManager;
    syncRangeNumberInput: (slider: HTMLInputElement) => void;
    normalizeRangeInputValue: (slider: HTMLInputElement, value: number) => number;
    formatRangeInputValue: (slider: HTMLInputElement, value: number) => string;
    isRangeInputEditing: (slider: HTMLInputElement) => boolean;
    onCameraEdited: () => void;
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

    constructor(deps: CameraPanelControllerDeps) {
        this.elements = resolveCameraPanelElements();
        this.mmdManager = deps.mmdManager;
        this.syncRangeNumberInput = deps.syncRangeNumberInput;
        this.normalizeRangeInputValue = deps.normalizeRangeInputValue;
        this.formatRangeInputValue = deps.formatRangeInputValue;
        this.isRangeInputEditing = deps.isRangeInputEditing;
        this.onCameraEdited = deps.onCameraEdited;

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
    }

    private setupControls(): void {
        const switchCameraView = (view: CameraViewPreset): void => {
            this.mmdManager.setCameraView(view);
            this.updateViewButtons(view);
            this.onCameraEdited();
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
        this.refresh(true);
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
