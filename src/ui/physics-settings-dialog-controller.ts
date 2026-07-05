import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";
import type { PopupContentController } from "./popup-dialog-controller";
import { createPopupFormField } from "./popup-form-helpers";

export type PhysicsSettingsDialogControllerDeps = {
    mmdManager: MmdManager;
    getRuntimeMode: () => "classic" | "wasm";
    setRuntimeMode: (mode: "classic" | "wasm") => void;
    refreshUi: () => void;
};

export class PhysicsSettingsDialogController implements PopupContentController {
    private readonly mmdManager: MmdManager;
    private readonly getRuntimeMode: () => "classic" | "wasm";
    private readonly setRuntimeMode: (mode: "classic" | "wasm") => void;
    private readonly refreshUi: () => void;

    constructor(deps: PhysicsSettingsDialogControllerDeps) {
        this.mmdManager = deps.mmdManager;
        this.getRuntimeMode = deps.getRuntimeMode;
        this.setRuntimeMode = deps.setRuntimeMode;
        this.refreshUi = deps.refreshUi;
    }

    public mount(container: HTMLElement): void {
        const form = document.createElement("div");
        form.className = "popup-form";
        const grid = document.createElement("div");
        grid.className = "popup-form-grid";
        form.appendChild(grid);

        const rate = document.createElement("select");
        rate.className = "popup-form-control";
        [30, 60, 120].forEach((value) => {
            const option = document.createElement("option");
            option.value = String(value);
            option.textContent = `${value}Hz`;
            rate.appendChild(option);
        });
        rate.value = String(this.mmdManager.getPhysicsSimulationRateHz());
        rate.disabled = !this.mmdManager.isPhysicsAvailable();
        rate.addEventListener("change", () => {
            const next = this.mmdManager.setPhysicsSimulationRateHz(Number(rate.value));
            rate.value = String(next);
            this.refreshUi();
        });
        grid.appendChild(createPopupFormField(t("dialog.physics.simulationRate"), rate));

        const runtime = document.createElement("select");
        runtime.className = "popup-form-control";
        [
            { value: "classic", label: t("dialog.physics.runtimeClassic") },
            { value: "wasm", label: t("dialog.physics.runtimeWasm") },
        ].forEach((item) => {
            const option = document.createElement("option");
            option.value = item.value;
            option.textContent = item.label;
            runtime.appendChild(option);
        });
        runtime.value = this.getRuntimeMode();
        runtime.addEventListener("change", () => {
            const next = runtime.value === "wasm" ? "wasm" : "classic";
            this.setRuntimeMode(next);
            runtime.value = this.getRuntimeMode();
        });
        grid.appendChild(createPopupFormField(t("dialog.physics.runtime"), runtime));

        container.appendChild(form);
    }
}
