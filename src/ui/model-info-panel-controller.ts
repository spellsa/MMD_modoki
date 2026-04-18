import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";

type ToastType = "success" | "error" | "info";

export const MODEL_INFO_CAMERA_SELECT_VALUE = "__camera__";

export type ModelInfoSelectState = {
    innerHTML: string;
    value: string;
    disabled: boolean;
};

type ModelInfoPanelElements = {
    select: HTMLSelectElement | null;
    btnVisibility: HTMLButtonElement | null;
    btnDelete: HTMLButtonElement | null;
};

export type ModelInfoPanelControllerDeps = {
    mmdManager: MmdManager;
    showToast: (message: string, type?: ToastType) => void;
    onTargetSelected: (value: string, showToast: boolean) => void;
    onModelVisibilityChanged: (visible: boolean) => void;
    onModelDeleted: (hasRemainingModels: boolean) => void;
};

function resolveModelInfoPanelElements(): ModelInfoPanelElements {
    return {
        select: document.getElementById("info-model-select") as HTMLSelectElement | null,
        btnVisibility: document.getElementById("btn-model-visibility") as HTMLButtonElement | null,
        btnDelete: document.getElementById("btn-model-delete") as HTMLButtonElement | null,
    };
}

export class ModelInfoPanelController {
    private readonly elements: ModelInfoPanelElements;
    private readonly mmdManager: MmdManager;
    private readonly showToast: (message: string, type?: ToastType) => void;
    private readonly onTargetSelected: (value: string, showToast: boolean) => void;
    private readonly onModelVisibilityChanged: (visible: boolean) => void;
    private readonly onModelDeleted: (hasRemainingModels: boolean) => void;

    constructor(deps: ModelInfoPanelControllerDeps) {
        this.elements = resolveModelInfoPanelElements();
        this.mmdManager = deps.mmdManager;
        this.showToast = deps.showToast;
        this.onTargetSelected = deps.onTargetSelected;
        this.onModelVisibilityChanged = deps.onModelVisibilityChanged;
        this.onModelDeleted = deps.onModelDeleted;

        this.setupControls();
    }

    public refresh(): void {
        const select = this.elements.select;
        if (!select) return;

        const models = this.mmdManager.getLoadedModels();
        const timelineTarget = this.mmdManager.getTimelineTarget();
        select.innerHTML = "";

        const cameraOption = document.createElement("option");
        cameraOption.value = MODEL_INFO_CAMERA_SELECT_VALUE;
        cameraOption.textContent = "0: Camera";
        select.appendChild(cameraOption);

        let selected = false;
        if (timelineTarget === "camera") {
            cameraOption.selected = true;
            selected = true;
        }

        for (const model of models) {
            const option = document.createElement("option");
            option.value = String(model.index);
            option.textContent = `${model.index + 1}: ${model.name}`;
            option.title = model.path;
            if (!selected && timelineTarget === "model" && model.active) {
                option.selected = true;
                selected = true;
            }
            select.appendChild(option);
        }

        if (!selected) {
            cameraOption.selected = true;
        }

        select.disabled = models.length === 0;
        this.updateActionButtons();
    }

    public updateActionButtons(): void {
        const isModelTarget = this.mmdManager.getTimelineTarget() === "model";
        const hasModel = this.mmdManager.getLoadedModels().length > 0;
        const enabled = isModelTarget && hasModel;

        if (this.elements.btnVisibility) {
            this.elements.btnVisibility.disabled = !enabled;
            this.elements.btnVisibility.textContent = enabled && !this.mmdManager.getActiveModelVisibility()
                ? t("button.show")
                : t("button.hide");
        }

        if (this.elements.btnDelete) {
            this.elements.btnDelete.disabled = !enabled;
        }
    }

    public getSelectState(): ModelInfoSelectState {
        const select = this.elements.select;
        if (!select) {
            return {
                innerHTML: '<option value="">-</option>',
                value: "",
                disabled: true,
            };
        }
        return {
            innerHTML: select.innerHTML,
            value: select.value,
            disabled: select.disabled,
        };
    }

    private setupControls(): void {
        this.elements.select?.addEventListener("change", () => {
            this.onTargetSelected(this.elements.select?.value ?? "", true);
        });

        this.elements.btnVisibility?.addEventListener("click", () => {
            if (this.mmdManager.getTimelineTarget() !== "model") return;
            const visible = this.mmdManager.toggleActiveModelVisibility();
            this.updateActionButtons();
            this.onModelVisibilityChanged(visible);
            this.showToast(visible ? "Model visible" : "Model hidden", "info");
        });

        this.elements.btnDelete?.addEventListener("click", () => {
            if (this.mmdManager.getTimelineTarget() !== "model") return;
            const ok = window.confirm("Delete selected model?");
            if (!ok) return;

            const removed = this.mmdManager.removeActiveModel();
            if (!removed) {
                this.showToast("Failed to delete model", "error");
                return;
            }

            this.onModelDeleted(this.mmdManager.getLoadedModels().length > 0);
            this.showToast("Model deleted", "success");
        });

        this.updateActionButtons();
    }
}
