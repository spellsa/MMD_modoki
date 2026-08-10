import type { MmdManager } from "../mmd-manager";
import type { EditorAction } from "../actions/types";
import { t } from "../i18n";

export type CameraViewPreset = "left" | "front" | "right" | "top" | "back" | "bottom";

type CameraPanelElements = {
    leftButton: HTMLButtonElement | null;
    frontButton: HTMLButtonElement | null;
    rightButton: HTMLButtonElement | null;
    topButton: HTMLButtonElement | null;
    backButton: HTMLButtonElement | null;
    bottomButton: HTMLButtonElement | null;
    externalParentContainer: HTMLElement | null;
    externalParentSelect: HTMLSelectElement | null;
    parentBoneSelect: HTMLSelectElement | null;
    externalParentRegisterButton: HTMLButtonElement | null;
};

export type CameraPanelControllerDeps = {
    mmdManager: MmdManager;
    onCameraEdited: () => void;
    showToast: (message: string, type: "success" | "error" | "info") => void;
    dispatchAction?: (action: EditorAction) => boolean;
};

const CAMERA_EXTERNAL_PARENT_DEFAULT_BONE_CANDIDATES = ["頭", "head", "Head", "センター", "center", "Center"];

function normalizeBoneNameForDefault(name: string): string {
    return name.trim().replace(/\s+/g, "").toLowerCase();
}

function findDefaultCameraExternalParentBoneName(boneNames: readonly string[]): string | null {
    const normalizedToActual = new Map<string, string>();
    for (const boneName of boneNames) {
        if (!normalizedToActual.has(normalizeBoneNameForDefault(boneName))) {
            normalizedToActual.set(normalizeBoneNameForDefault(boneName), boneName);
        }
    }

    for (const candidate of CAMERA_EXTERNAL_PARENT_DEFAULT_BONE_CANDIDATES) {
        const actual = normalizedToActual.get(normalizeBoneNameForDefault(candidate));
        if (actual) return actual;
    }
    return null;
}

function resolveCameraPanelElements(): CameraPanelElements {
    return {
        leftButton: document.getElementById("btn-cam-left") as HTMLButtonElement | null,
        frontButton: document.getElementById("btn-cam-front") as HTMLButtonElement | null,
        rightButton: document.getElementById("btn-cam-right") as HTMLButtonElement | null,
        topButton: document.getElementById("btn-cam-top") as HTMLButtonElement | null,
        backButton: document.getElementById("btn-cam-back") as HTMLButtonElement | null,
        bottomButton: document.getElementById("btn-cam-bottom") as HTMLButtonElement | null,
        externalParentContainer: document.querySelector(".camera-parent-controls") as HTMLElement | null,
        externalParentSelect: document.getElementById("camera-external-parent-select") as HTMLSelectElement | null,
        parentBoneSelect: document.getElementById("camera-parent-bone-select") as HTMLSelectElement | null,
        externalParentRegisterButton: document.getElementById("btn-camera-external-parent-register") as HTMLButtonElement | null,
    };
}

export class CameraPanelController {
    private readonly elements: CameraPanelElements;
    private readonly mmdManager: MmdManager;
    private readonly onCameraEdited: () => void;
    private readonly showToast: CameraPanelControllerDeps["showToast"];
    private readonly dispatchAction: ((action: EditorAction) => boolean) | null;
    private isSyncingExternalParentUi = false;
    private hasPendingExternalParentSelection = false;

    constructor(deps: CameraPanelControllerDeps) {
        this.elements = resolveCameraPanelElements();
        this.mmdManager = deps.mmdManager;
        this.onCameraEdited = deps.onCameraEdited;
        this.showToast = deps.showToast;
        this.dispatchAction = deps.dispatchAction ?? null;

        this.setupControls();
    }

    public refresh(force = false, displayDistance?: number): void {
        void displayDistance;
        // Camera transform controls still live in the pseudo Camera bone section for this slice.
        this.refreshExternalParentControls(force);
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
        this.elements.externalParentSelect?.addEventListener("change", () => {
            if (this.isSyncingExternalParentUi) return;
            this.hasPendingExternalParentSelection = true;
            const modelIndex = this.parseExternalParentModelIndex();
            this.refreshParentBoneOptions(modelIndex, null);
            if (this.elements.externalParentRegisterButton) {
                this.elements.externalParentRegisterButton.disabled = modelIndex !== null
                    && !this.elements.parentBoneSelect?.value;
            }
        });
        this.elements.parentBoneSelect?.addEventListener("change", () => {
            if (this.isSyncingExternalParentUi) return;
            this.hasPendingExternalParentSelection = true;
        });
        this.elements.externalParentRegisterButton?.addEventListener("click", () => {
            if (this.dispatchAction?.({ type: "camera.setExternalParent", source: "button" })) return;
            this.setExternalParentFromPanel();
        });

        this.updateViewButtons("front");
        this.refreshExternalParentControls(true);
    }

    public setExternalParentFromPanel(notifyCameraEdited = true): boolean {
        if (this.isSyncingExternalParentUi) return false;
        const modelIndex = this.parseExternalParentModelIndex();
        const boneName = modelIndex === null ? null : this.elements.parentBoneSelect?.value || null;
        if (modelIndex !== null && !boneName) {
            this.showToast("親ボーンを選択してください", "info");
            return false;
        }
        if (!this.mmdManager.setCameraExternalParent(modelIndex, boneName)) {
            this.showToast("カメラ外部親を設定できませんでした", "error");
            return false;
        }
        this.hasPendingExternalParentSelection = false;
        this.refreshExternalParentControls(true);
        if (notifyCameraEdited) {
            this.onCameraEdited();
        }
        return true;
    }

    private refreshExternalParentControls(force = false): void {
        const container = this.elements.externalParentContainer;
        const parentSelect = this.elements.externalParentSelect;
        const boneSelect = this.elements.parentBoneSelect;
        const registerButton = this.elements.externalParentRegisterButton;
        if (!container || !parentSelect || !boneSelect || !registerButton) return;

        const visible = this.mmdManager.getTimelineTarget() === "camera";
        container.hidden = !visible;
        if (!visible) return;

        const models = this.mmdManager.getLoadedModels();
        if (this.hasPendingExternalParentSelection && !force) {
            const modelIndex = this.parseExternalParentModelIndex();
            parentSelect.disabled = models.length === 0;
            registerButton.disabled = models.length === 0
                || (modelIndex !== null && boneSelect.value === "");
            return;
        }

        const parentState = this.mmdManager.getCameraExternalParent();
        const modelIndex = parentState?.modelIndex ?? null;
        const boneName = parentState?.boneName ?? null;
        this.hasPendingExternalParentSelection = false;

        this.isSyncingExternalParentUi = true;
        try {
            this.refreshExternalParentModelOptions(modelIndex);
            this.refreshParentBoneOptions(modelIndex, boneName);
            parentSelect.disabled = models.length === 0;
            registerButton.disabled = models.length === 0
                || (modelIndex !== null && boneSelect.value === "");
        } finally {
            this.isSyncingExternalParentUi = false;
        }
    }

    private parseExternalParentModelIndex(): number | null {
        const select = this.elements.externalParentSelect;
        if (!select) return null;
        if (select.value === "") return null;
        const parsed = Number.parseInt(select.value, 10);
        return Number.isInteger(parsed) ? parsed : null;
    }

    private refreshExternalParentModelOptions(selectedModelIndex: number | null): void {
        const select = this.elements.externalParentSelect;
        if (!select) return;

        select.innerHTML = "";
        const noneOption = document.createElement("option");
        noneOption.value = "";
        noneOption.textContent = t("option.none");
        select.appendChild(noneOption);

        for (const model of this.mmdManager.getLoadedModels()) {
            const option = document.createElement("option");
            option.value = String(model.index);
            option.textContent = `${model.index + 1}: ${model.name}`;
            option.title = model.path;
            select.appendChild(option);
        }

        const targetValue = selectedModelIndex === null ? "" : String(selectedModelIndex);
        const hasTarget = Array.from(select.options).some((option) => option.value === targetValue);
        select.value = hasTarget ? targetValue : "";
    }

    private refreshParentBoneOptions(modelIndex: number | null, selectedBoneName: string | null): void {
        const select = this.elements.parentBoneSelect;
        if (!select) return;

        select.innerHTML = "";
        if (modelIndex === null) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "-";
            select.appendChild(option);
            select.disabled = true;
            return;
        }

        const boneNames = this.mmdManager.getModelBoneNames(modelIndex);
        for (const boneName of boneNames) {
            const option = document.createElement("option");
            option.value = boneName;
            option.textContent = boneName;
            select.appendChild(option);
        }

        const targetValue = selectedBoneName
            ?? findDefaultCameraExternalParentBoneName(boneNames)
            ?? boneNames[0]
            ?? "";
        const hasTarget = Array.from(select.options).some((option) => option.value === targetValue);
        select.value = hasTarget ? targetValue : "";
        select.disabled = false;
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
