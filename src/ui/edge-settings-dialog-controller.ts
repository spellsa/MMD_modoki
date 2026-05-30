import type { MmdManager } from "../mmd-manager";
import { t } from "../i18n";
import type { EditorAction } from "../actions/types";
import type { PopupContentController } from "./popup-dialog-controller";
import {
    createPopupFormField,
    createPopupFormRange,
    createPopupFormValueText,
} from "./popup-form-helpers";

export type EdgeSettingsDialogControllerDeps = {
    mmdManager: MmdManager;
    dispatchAction: (action: EditorAction) => boolean;
    refreshUi: () => void;
};

export class EdgeSettingsDialogController implements PopupContentController {
    private readonly mmdManager: MmdManager;
    private readonly dispatchAction: (action: EditorAction) => boolean;
    private readonly refreshUi: () => void;

    constructor(deps: EdgeSettingsDialogControllerDeps) {
        this.mmdManager = deps.mmdManager;
        this.dispatchAction = deps.dispatchAction;
        this.refreshUi = deps.refreshUi;
    }

    public mount(container: HTMLElement): void {
        const form = document.createElement("div");
        form.className = "popup-form";
        const grid = document.createElement("div");
        grid.className = "popup-form-grid";
        form.appendChild(grid);

        const enabled = document.createElement("input");
        enabled.type = "checkbox";
        enabled.className = "popup-form-checkbox";
        enabled.checked = this.mmdManager.modelEdgeWidth > 0.001;
        enabled.addEventListener("change", () => {
            this.dispatchAction({ type: "viewport.toggleEdge", source: "menu" });
            enabled.checked = this.mmdManager.modelEdgeWidth > 0.001;
            width.value = String(Math.round(this.mmdManager.modelEdgeWidth * 100));
            widthValue.textContent = `${Math.round(this.mmdManager.modelEdgeWidth * 100)}%`;
            this.refreshUi();
        });
        grid.appendChild(createPopupFormField(t("dialog.edge.enabled"), enabled));

        const width = document.createElement("input");
        width.type = "range";
        width.className = "popup-form-control popup-form-range";
        width.min = "0";
        width.max = "200";
        width.step = "1";
        width.value = String(Math.round(this.mmdManager.modelEdgeWidth * 100));

        const widthValue = createPopupFormValueText(`${Math.round(this.mmdManager.modelEdgeWidth * 100)}%`);
        width.addEventListener("input", () => {
            const percent = Number(width.value);
            this.dispatchAction({ type: "effect.setModelEdgeWidth", source: "menu", percent });
            widthValue.textContent = `${Math.round(this.mmdManager.modelEdgeWidth * 100)}%`;
            enabled.checked = this.mmdManager.modelEdgeWidth > 0.001;
            this.refreshUi();
        });
        grid.appendChild(createPopupFormField(t("dialog.edge.width"), createPopupFormRange(width, widthValue), "div"));

        container.appendChild(form);
    }
}
