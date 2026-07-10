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

        const maxSubSteps = document.createElement("input");
        maxSubSteps.className = "popup-form-control";
        maxSubSteps.type = "number";
        maxSubSteps.min = "1";
        maxSubSteps.max = "8";
        maxSubSteps.step = "1";
        maxSubSteps.value = String(this.mmdManager.getPhysicsMaxSubSteps());
        maxSubSteps.disabled = !this.mmdManager.isPhysicsAvailable();
        maxSubSteps.addEventListener("change", () => {
            const next = this.mmdManager.setPhysicsMaxSubSteps(Number(maxSubSteps.value));
            maxSubSteps.value = String(next);
        });
        grid.appendChild(createPopupFormField(t("dialog.physics.maxSubSteps"), maxSubSteps));

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

        const bulletBackend = document.createElement("select");
        bulletBackend.className = "popup-form-control";
        [
            { value: "auto", label: t("dialog.physics.bulletBackendAuto") },
            { value: "bullet-mpr", label: t("dialog.physics.bulletBackendMpr") },
            { value: "bullet-spr", label: t("dialog.physics.bulletBackendSpr") },
        ].forEach((item) => {
            const option = document.createElement("option");
            option.value = item.value;
            option.textContent = item.label;
            bulletBackend.appendChild(option);
        });
        bulletBackend.value = this.mmdManager.getPreferredBulletPhysicsBackend();
        bulletBackend.addEventListener("change", () => {
            const next = PhysicsSettingsDialogController.normalizeBulletBackendValue(bulletBackend.value);
            bulletBackend.disabled = true;
            void this.mmdManager.setPreferredBulletPhysicsBackend(next).then((applied) => {
                bulletBackend.value = applied;
            }).finally(() => {
                bulletBackend.disabled = false;
            });
        });
        grid.appendChild(createPopupFormField(t("dialog.physics.bulletBackend"), bulletBackend));

        const buffered = document.createElement("select");
        buffered.className = "popup-form-control";
        [
            { value: "on", label: t("dialog.physics.bufferedOn") },
            { value: "off", label: t("dialog.physics.bufferedOff") },
        ].forEach((item) => {
            const option = document.createElement("option");
            option.value = item.value;
            option.textContent = item.label;
            buffered.appendChild(option);
        });
        buffered.value = this.mmdManager.getPhysicsBufferedEvaluationEnabled() ? "on" : "off";
        buffered.disabled = !this.mmdManager.isPhysicsAvailable();
        buffered.addEventListener("change", () => {
            const enabled = this.mmdManager.setPhysicsBufferedEvaluationEnabled(buffered.value === "on");
            buffered.value = enabled ? "on" : "off";
        });
        grid.appendChild(createPopupFormField(t("dialog.physics.bufferedEvaluation"), buffered));

        container.appendChild(form);
    }

    private static normalizeBulletBackendValue(value: string): "auto" | "bullet-mpr" | "bullet-spr" {
        if (value === "bullet-mpr" || value === "bullet-spr") {
            return value;
        }
        return "auto";
    }
}
