import type { MmdManager } from "../mmd-manager";
import { t } from "../i18n";
import type { EditorAction } from "../actions/types";
import type { PopupContentController } from "./popup-dialog-controller";
import {
    createPopupFormField,
    createPopupFormRange,
    createPopupFormValueText,
} from "./popup-form-helpers";

export type IblShadowSettingsDialogControllerDeps = {
    mmdManager: MmdManager;
    dispatchAction: (action: EditorAction) => boolean;
    refreshUi: () => void;
};

function createCheckbox(checked: boolean): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "popup-form-checkbox";
    input.checked = checked;
    return input;
}

function createRange(min: number, max: number, step: number, value: number): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "range";
    input.className = "popup-form-control popup-form-range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(Math.round(value));
    return input;
}

export class IblShadowSettingsDialogController implements PopupContentController {
    private readonly mmdManager: MmdManager;
    private readonly dispatchAction: (action: EditorAction) => boolean;
    private readonly refreshUi: () => void;

    constructor(deps: IblShadowSettingsDialogControllerDeps) {
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

        const enabled = createCheckbox(this.mmdManager.iblShadowsEnabled);
        enabled.addEventListener("change", () => {
            this.dispatchAction({ type: "effect.setIblShadows", source: "menu", enabled: enabled.checked });
            enabled.checked = this.mmdManager.iblShadowsEnabled;
            this.refreshUi();
        });
        grid.appendChild(createPopupFormField(t("label.iblShadows"), enabled));

        this.appendRange(grid, t("label.iblShadowOpacity"), 0, 100, 1, this.mmdManager.iblShadowOpacity * 100, (value) => `${Math.round(value)}%`, (value) => {
            this.dispatchAction({ type: "effect.setIblShadowOpacity", source: "menu", value: value / 100 });
            this.refreshUi();
            return `${Math.round(this.mmdManager.iblShadowOpacity * 100)}%`;
        });
        this.appendRange(grid, t("label.iblShadowRange"), 50, 1200, 10, this.mmdManager.iblShadowDistanceScale * 100, (value) => (value / 100).toFixed(1), (value) => {
            this.dispatchAction({ type: "effect.setIblShadowDistanceScale", source: "menu", value: value / 100 });
            this.refreshUi();
            return this.mmdManager.iblShadowDistanceScale.toFixed(1);
        });

        container.appendChild(form);
    }

    private appendRange(
        grid: HTMLElement,
        label: string,
        min: number,
        max: number,
        step: number,
        initialValue: number,
        formatValue: (value: number) => string,
        applyValue: (value: number) => string,
    ): void {
        const input = createRange(min, max, step, initialValue);
        const value = createPopupFormValueText(formatValue(Number(input.value)));
        input.addEventListener("input", () => {
            value.textContent = applyValue(Number(input.value));
        });
        grid.appendChild(createPopupFormField(label, createPopupFormRange(input, value), "div"));
    }
}
