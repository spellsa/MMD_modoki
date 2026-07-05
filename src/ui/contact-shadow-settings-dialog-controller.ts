import type { MmdManager } from "../mmd-manager";
import { t } from "../i18n";
import type { EditorAction } from "../actions/types";
import type { PopupContentController } from "./popup-dialog-controller";
import {
    createPopupFormField,
    createPopupFormRange,
    createPopupFormValueText,
} from "./popup-form-helpers";

export type ContactShadowSettingsDialogControllerDeps = {
    mmdManager: MmdManager;
    dispatchAction: (action: EditorAction) => boolean;
    refreshUi: () => void;
};

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

export class ContactShadowSettingsDialogController implements PopupContentController {
    private readonly mmdManager: MmdManager;
    private readonly dispatchAction: (action: EditorAction) => boolean;
    private readonly refreshUi: () => void;

    constructor(deps: ContactShadowSettingsDialogControllerDeps) {
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

        this.appendRange(grid, t("label.characterContactShadowOpacity"), 0, 100, 1, this.mmdManager.characterContactShadowOpacity * 100, (value) => `${Math.round(value)}%`, (value) => {
            this.dispatchAction({ type: "effect.setCharacterContactShadowOpacity", source: "menu", value: value / 100 });
            this.refreshUi();
            return `${Math.round(this.mmdManager.characterContactShadowOpacity * 100)}%`;
        });
        this.appendRange(grid, t("label.characterContactShadowScale"), 50, 300, 5, this.mmdManager.characterContactShadowScale * 100, (value) => (value / 100).toFixed(2), (value) => {
            const scale = value / 100;
            if (!this.dispatchAction({ type: "effect.setCharacterContactShadowScale", source: "menu", value: scale })) {
                this.mmdManager.characterContactShadowScale = scale;
            }
            this.refreshUi();
            return this.mmdManager.characterContactShadowScale.toFixed(2);
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
