import type { MmdManager } from "../mmd-manager";
import { t } from "../i18n";
import type { EditorAction } from "../actions/types";
import type { PopupContentController } from "./popup-dialog-controller";
import {
    createPopupFormField,
    createPopupFormRange,
    createPopupFormValueText,
} from "./popup-form-helpers";

export type LightingShadowSettingsDialogControllerDeps = {
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

export class LightingShadowSettingsDialogController implements PopupContentController {
    private readonly mmdManager: MmdManager;
    private readonly dispatchAction: (action: EditorAction) => boolean;
    private readonly refreshUi: () => void;

    constructor(deps: LightingShadowSettingsDialogControllerDeps) {
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

        const quality = document.createElement("select");
        quality.className = "popup-form-control";
        [
            { value: 0, label: t("dialog.lightShadow.qualityHigh") },
            { value: 1, label: t("dialog.lightShadow.qualityMedium") },
            { value: 2, label: t("dialog.lightShadow.qualityLow") },
        ].forEach((entry) => {
            const option = document.createElement("option");
            option.value = String(entry.value);
            option.textContent = entry.label;
            quality.appendChild(option);
        });
        quality.value = String(this.mmdManager.shadowFilteringQuality);
        quality.addEventListener("change", () => {
            this.dispatchAction({ type: "effect.setShadowFilteringQuality", source: "menu", value: Number(quality.value) });
            quality.value = String(this.mmdManager.shadowFilteringQuality);
            this.refreshUi();
        });
        grid.appendChild(createPopupFormField(t("label.shadowQuality"), quality));

        this.appendRange(grid, t("label.shadowMaxZ"), 500, 12000, 50, this.mmdManager.shadowMaxZ, (value) => String(Math.round(value)), (value) => {
            this.dispatchAction({ type: "effect.setShadowMaxZ", source: "menu", value });
            this.refreshUi();
            return String(Math.round(this.mmdManager.shadowMaxZ));
        });
        this.appendRange(grid, t("label.shadowFrustumSize"), 120, 6000, 20, this.mmdManager.shadowFrustumSize, (value) => String(Math.round(value)), (value) => {
            this.dispatchAction({ type: "effect.setShadowFrustumSize", source: "menu", value });
            this.refreshUi();
            return String(Math.round(this.mmdManager.shadowFrustumSize));
        });
        this.appendRange(grid, t("label.shadowDarkness"), 0, 100, 1, this.mmdManager.shadowDarkness * 100, (value) => (value / 100).toFixed(2), (value) => {
            this.dispatchAction({ type: "effect.setShadowDarkness", source: "menu", value: value / 100 });
            this.refreshUi();
            return this.mmdManager.shadowDarkness.toFixed(2);
        });
        this.appendRange(grid, t("label.shadowBias"), 0, 10000, 1, this.mmdManager.shadowBias * 1_000_000, (value) => (value / 1_000_000).toFixed(5), (value) => {
            this.dispatchAction({ type: "effect.setShadowBias", source: "menu", value: value / 1_000_000 });
            this.refreshUi();
            return this.mmdManager.shadowBias.toFixed(5);
        });
        this.appendRange(grid, t("label.shadowNormalBias"), 0, 10000, 1, this.mmdManager.shadowNormalBias * 100_000, (value) => (value / 100_000).toFixed(5), (value) => {
            this.dispatchAction({ type: "effect.setShadowNormalBias", source: "menu", value: value / 100_000 });
            this.refreshUi();
            return this.mmdManager.shadowNormalBias.toFixed(5);
        });

        const softTransparentShadow = createCheckbox(this.mmdManager.softTransparentShadowEnabled);
        softTransparentShadow.addEventListener("change", () => {
            this.dispatchAction({
                type: "effect.setSoftTransparentShadow",
                source: "menu",
                enabled: softTransparentShadow.checked,
            });
            softTransparentShadow.checked = this.mmdManager.softTransparentShadowEnabled;
            this.refreshUi();
        });
        grid.appendChild(createPopupFormField(t("label.softTransparentShadow"), softTransparentShadow));

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
