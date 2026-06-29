import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";
import type { EditorAction } from "../actions/types";

type ToastType = "success" | "error" | "info";

export const MODEL_INFO_CAMERA_SELECT_VALUE = "__camera__";

export type ModelInfoSelectState = {
    innerHTML: string;
    value: string;
    disabled: boolean;
};

type ModelInfoPanelElements = {
    select: HTMLSelectElement | null;
    chkVisibility: HTMLInputElement | null;
    chkShadow: HTMLInputElement | null;
    btnLoad: HTMLButtonElement | null;
    btnDelete: HTMLButtonElement | null;
};

export type ModelInfoPanelControllerDeps = {
    mmdManager: MmdManager;
    showToast: (message: string, type?: ToastType) => void;
    onTargetSelected: (value: string, showToast: boolean) => void;
    onModelVisibilityChanged: (visible: boolean) => void;
    onModelDeleted: (hasRemainingModels: boolean) => void;
    dispatchAction?: (action: EditorAction) => boolean;
};

function resolveModelInfoPanelElements(): ModelInfoPanelElements {
    return {
        select: document.getElementById("info-model-select") as HTMLSelectElement | null,
        chkVisibility: document.getElementById("chk-model-visibility") as HTMLInputElement | null,
        chkShadow: document.getElementById("chk-model-shadow") as HTMLInputElement | null,
        btnLoad: document.getElementById("btn-model-load") as HTMLButtonElement | null,
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
    private readonly dispatchAction: ((action: EditorAction) => boolean) | null;

    constructor(deps: ModelInfoPanelControllerDeps) {
        this.elements = resolveModelInfoPanelElements();
        this.mmdManager = deps.mmdManager;
        this.showToast = deps.showToast;
        this.onTargetSelected = deps.onTargetSelected;
        this.onModelVisibilityChanged = deps.onModelVisibilityChanged;
        this.onModelDeleted = deps.onModelDeleted;
        this.dispatchAction = deps.dispatchAction ?? null;

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

        if (this.elements.chkVisibility) {
            this.elements.chkVisibility.disabled = !enabled;
            this.elements.chkVisibility.checked = enabled ? this.mmdManager.getActiveModelVisibility() : false;
        }

        if (this.elements.chkShadow) {
            this.elements.chkShadow.disabled = !enabled;
            this.elements.chkShadow.checked = enabled ? this.mmdManager.getActiveModelCastsShadow() : false;
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

    public selectTimelineTarget(value: string, showToast: boolean): void {
        this.onTargetSelected(value, showToast);
    }

    public toggleActiveModelVisibility(): void {
        if (this.mmdManager.getTimelineTarget() !== "model") return;
        const visible = this.mmdManager.toggleActiveModelVisibility();
        this.updateActionButtons();
        this.onModelVisibilityChanged(visible);
        this.showToast(visible ? "Model visible" : "Model hidden", "info");
    }

    public setActiveModelCastsShadow(castShadow: boolean): void {
        if (this.mmdManager.getTimelineTarget() !== "model") return;
        const ok = this.mmdManager.setActiveModelCastsShadow(castShadow);
        this.updateActionButtons();
        if (!ok) {
            this.showToast("Failed to update model shadow", "error");
            return;
        }
        this.showToast(castShadow ? t("toast.modelShadow.on") : t("toast.modelShadow.off"), "info");
    }

    public deleteActiveModel(): void {
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
    }

    private setupControls(): void {
        this.elements.select?.addEventListener("change", () => {
            const value = this.elements.select?.value ?? "";
            if (this.dispatchAction?.({
                type: "model.selectTimelineTarget",
                source: "panel",
                value,
                showToast: true,
            })) return;
            this.selectTimelineTarget(value, true);
        });

        this.elements.chkVisibility?.addEventListener("change", () => {
            if (this.dispatchAction?.({ type: "model.toggleActiveVisibility", source: "button" })) return;
            this.toggleActiveModelVisibility();
        });

        this.elements.chkShadow?.addEventListener("change", () => {
            const castShadow = this.elements.chkShadow?.checked ?? true;
            if (this.dispatchAction?.({ type: "model.setActiveShadow", source: "button", castShadow })) return;
            this.setActiveModelCastsShadow(castShadow);
        });

        this.elements.btnLoad?.addEventListener("click", () => {
            this.dispatchAction?.({ type: "project.openModel", source: "panel" });
        });

        this.elements.btnDelete?.addEventListener("click", () => {
            if (this.dispatchAction?.({ type: "model.deleteActive", source: "button" })) return;
            this.deleteActiveModel();
        });

        this.updateActionButtons();
    }
}
