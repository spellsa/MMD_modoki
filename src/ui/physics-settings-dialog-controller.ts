import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";
import type { PopupContentController } from "./popup-dialog-controller";
import { createPopupFormField } from "./popup-form-helpers";

export type PhysicsSettingsDialogControllerDeps = {
    mmdManager: MmdManager;
    getRuntimeMode: () => "classic" | "wasm";
    setRuntimeMode: (mode: "classic" | "wasm") => void;
};

export class PhysicsSettingsDialogController implements PopupContentController {
    private readonly mmdManager: MmdManager;
    private readonly getRuntimeMode: () => "classic" | "wasm";
    private readonly setRuntimeMode: (mode: "classic" | "wasm") => void;

    constructor(deps: PhysicsSettingsDialogControllerDeps) {
        this.mmdManager = deps.mmdManager;
        this.getRuntimeMode = deps.getRuntimeMode;
        this.setRuntimeMode = deps.setRuntimeMode;
    }

    public mount(container: HTMLElement): void {
        const form = document.createElement("div");
        form.className = "popup-form";
        const grid = document.createElement("div");
        grid.className = "popup-form-grid";
        form.appendChild(grid);

        const rate = document.createElement("input");
        rate.className = "popup-form-control";
        rate.type = "text";
        rate.value = `${this.mmdManager.getPhysicsSimulationRateHz()}Hz`;
        rate.readOnly = true;
        rate.disabled = !this.mmdManager.isPhysicsAvailable();
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
