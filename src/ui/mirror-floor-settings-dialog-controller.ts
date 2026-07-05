import type { MmdManager } from "../mmd-manager";
import { t } from "../i18n";
import type { EditorAction } from "../actions/types";
import type { PopupContentController } from "./popup-dialog-controller";
import {
    createPopupFormField,
    createPopupFormRange,
    createPopupFormValueText,
} from "./popup-form-helpers";

export type MirrorFloorSettingsDialogControllerDeps = {
    mmdManager: MmdManager;
    dispatchAction: (action: EditorAction) => boolean;
    refreshUi: () => void;
};

function createRange(min: number, max: number, step: number): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "range";
    input.className = "popup-form-control popup-form-range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    return input;
}

export class MirrorFloorSettingsDialogController implements PopupContentController {
    private readonly mmdManager: MmdManager;
    private readonly dispatchAction: (action: EditorAction) => boolean;
    private readonly refreshUi: () => void;

    constructor(deps: MirrorFloorSettingsDialogControllerDeps) {
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

        const shape = document.createElement("select");
        shape.className = "popup-form-control";
        [
            { value: "square", label: t("dialog.mirrorFloor.shape.square") },
            { value: "circle", label: t("dialog.mirrorFloor.shape.circle") },
        ].forEach((item) => {
            const option = document.createElement("option");
            option.value = item.value;
            option.textContent = item.label;
            shape.appendChild(option);
        });
        shape.value = this.mmdManager.mirroringFloorShape;
        shape.addEventListener("change", () => {
            this.mmdManager.mirroringFloorShape = shape.value === "circle" ? "circle" : "square";
            shape.value = this.mmdManager.mirroringFloorShape;
            this.refreshUi();
        });
        grid.appendChild(createPopupFormField(t("dialog.mirrorFloor.shape"), shape));

        this.appendRange(grid, t("dialog.mirrorFloor.reflectance"), 0, 100, 1, () => this.mmdManager.mirroringFloorReflectance * 100, (value) => `${Math.round(value)}%`, (value) => {
            this.mmdManager.mirroringFloorReflectance = value / 100;
            this.refreshUi();
            return `${Math.round(this.mmdManager.mirroringFloorReflectance * 100)}%`;
        });
        this.appendRange(grid, t("dialog.mirrorFloor.size"), 1, 500, 1, () => this.mmdManager.mirroringFloorSize, (value) => `${Math.round(value)}m`, (value) => {
            this.mmdManager.mirroringFloorSize = value;
            this.refreshUi();
            return `${Math.round(this.mmdManager.mirroringFloorSize)}m`;
        });
        this.appendRange(grid, t("dialog.mirrorFloor.height"), -2000, 2000, 1, () => this.mmdManager.mirroringFloorHeight * 100, (value) => `${(value / 100).toFixed(2)}m`, (value) => {
            this.mmdManager.mirroringFloorHeight = value / 100;
            this.refreshUi();
            return `${this.mmdManager.mirroringFloorHeight.toFixed(2)}m`;
        });

        const resolution = document.createElement("select");
        resolution.className = "popup-form-control";
        [256, 512, 1024, 2048].forEach((value) => {
            const option = document.createElement("option");
            option.value = String(value);
            option.textContent = String(value);
            resolution.appendChild(option);
        });
        resolution.value = String(this.mmdManager.mirroringFloorResolution);
        resolution.addEventListener("change", () => {
            this.dispatchAction({
                type: "camera.setMirroringFloorResolution",
                source: "menu",
                resolution: Number(resolution.value),
            });
            resolution.value = String(this.mmdManager.mirroringFloorResolution);
            this.refreshUi();
        });
        grid.appendChild(createPopupFormField(t("dialog.mirrorFloor.resolution"), resolution));

        container.appendChild(form);
    }

    private appendRange(
        grid: HTMLElement,
        label: string,
        min: number,
        max: number,
        step: number,
        readValue: () => number,
        formatValue: (value: number) => string,
        applyValue: (value: number) => string,
    ): void {
        const input = createRange(min, max, step);
        const value = createPopupFormValueText();
        const sync = (): void => {
            const nextValue = readValue();
            input.value = String(Math.round(nextValue));
            value.textContent = formatValue(nextValue);
        };
        input.addEventListener("input", () => {
            value.textContent = applyValue(Number(input.value));
        });
        sync();
        grid.appendChild(createPopupFormField(label, createPopupFormRange(input, value), "div"));
    }
}
