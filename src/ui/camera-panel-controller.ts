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
};

export type CameraPanelControllerDeps = {
    mmdManager: MmdManager;
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
    };
}

export class CameraPanelController {
    private readonly elements: CameraPanelElements;
    private readonly mmdManager: MmdManager;
    private readonly onCameraEdited: () => void;
    private readonly dispatchAction: ((action: EditorAction) => boolean) | null;

    constructor(deps: CameraPanelControllerDeps) {
        this.elements = resolveCameraPanelElements();
        this.mmdManager = deps.mmdManager;
        this.onCameraEdited = deps.onCameraEdited;
        this.dispatchAction = deps.dispatchAction ?? null;

        this.setupControls();
    }

    public refresh(force = false, displayDistance?: number): void {
        void force;
        void displayDistance;
        // Camera transform controls still live in the pseudo Camera bone section for this slice.
    }

    public setCameraViewPreset(view: CameraViewPreset): void {
        this.mmdManager.setCameraView(view);
        this.updateViewButtons(view);
        this.onCameraEdited();
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

        this.updateViewButtons("front");
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
