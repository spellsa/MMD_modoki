import type { MmdManager } from "../mmd-manager";
import { t } from "../i18n";
import type { PopupContentController } from "./popup-dialog-controller";
import {
    createPopupFormField,
    createPopupFormRange,
    createPopupFormValueText,
} from "./popup-form-helpers";

export type GravitySettingsDialogControllerDeps = {
    mmdManager: MmdManager;
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

export class GravitySettingsDialogController implements PopupContentController {
    private readonly mmdManager: MmdManager;
    private readonly refreshUi: () => void;

    constructor(deps: GravitySettingsDialogControllerDeps) {
        this.mmdManager = deps.mmdManager;
        this.refreshUi = deps.refreshUi;
    }

    public mount(container: HTMLElement): void {
        const form = document.createElement("div");
        form.className = "popup-form";
        const grid = document.createElement("div");
        grid.className = "popup-form-grid";
        form.appendChild(grid);

        this.appendRange(grid, t("label.gravity"), 0, 200, 1, this.mmdManager.getPhysicsGravityAcceleration(), (value) => String(Math.round(value)), (value) => {
            this.mmdManager.setPhysicsGravityAcceleration(value);
            this.refreshUi();
            return String(Math.round(value));
        });

        const direction = this.mmdManager.getPhysicsGravityDirection();
        this.appendDirectionRange(grid, t("label.gravityX"), "x", direction.x);
        this.appendDirectionRange(grid, t("label.gravityY"), "y", direction.y);
        this.appendDirectionRange(grid, t("label.gravityZ"), "z", direction.z);

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

    private appendDirectionRange(grid: HTMLElement, label: string, axis: "x" | "y" | "z", initialValue: number): void {
        this.appendRange(grid, label, -100, 100, 1, initialValue, (value) => String(Math.round(value)), (value) => {
            const direction = this.mmdManager.getPhysicsGravityDirection();
            const x = axis === "x" ? value : direction.x;
            const y = axis === "y" ? value : direction.y;
            const z = axis === "z" ? value : direction.z;
            this.mmdManager.setPhysicsGravityDirection(x, y, z);
            this.refreshUi();
            return String(Math.round(value));
        });
    }
}
