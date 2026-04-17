import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";

type AccessoryTransformSliderKey = "px" | "py" | "pz" | "rx" | "ry" | "rz" | "s";
type ToastType = "success" | "error" | "info";

type AccessoryPanelElements = {
    select: HTMLSelectElement | null;
    parentModelSelect: HTMLSelectElement | null;
    parentBoneSelect: HTMLSelectElement | null;
    btnVisibility: HTMLButtonElement | null;
    btnDelete: HTMLButtonElement | null;
    emptyState: HTMLElement | null;
};

export type AccessoryPanelControllerDeps = {
    mmdManager: MmdManager;
    showToast: (message: string, type?: ToastType) => void;
    syncRangeNumberInput: (slider: HTMLInputElement) => void;
    onAccessoryTransformChanged: (accessoryIndex: number) => void;
    onSelectionChanged: () => void;
};

function resolveAccessoryPanelElements(): AccessoryPanelElements {
    return {
        select: document.getElementById("accessory-select") as HTMLSelectElement | null,
        parentModelSelect: document.getElementById("accessory-parent-model") as HTMLSelectElement | null,
        parentBoneSelect: document.getElementById("accessory-parent-bone") as HTMLSelectElement | null,
        btnVisibility: document.getElementById("btn-accessory-visibility") as HTMLButtonElement | null,
        btnDelete: document.getElementById("btn-accessory-delete") as HTMLButtonElement | null,
        emptyState: document.getElementById("accessory-empty-state"),
    };
}

export class AccessoryPanelController {
    private readonly elements: AccessoryPanelElements;
    private readonly mmdManager: MmdManager;
    private readonly showToast: (message: string, type?: ToastType) => void;
    private readonly syncRangeNumberInput: (slider: HTMLInputElement) => void;
    private readonly onAccessoryTransformChanged: (accessoryIndex: number) => void;
    private readonly onSelectionChanged: () => void;
    private readonly transformSliders = new Map<AccessoryTransformSliderKey, HTMLInputElement>();
    private readonly transformValueEls = new Map<AccessoryTransformSliderKey, HTMLElement>();
    private isSyncingTransformUi = false;
    private isSyncingParentUi = false;

    constructor(deps: AccessoryPanelControllerDeps) {
        this.elements = resolveAccessoryPanelElements();
        this.mmdManager = deps.mmdManager;
        this.showToast = deps.showToast;
        this.syncRangeNumberInput = deps.syncRangeNumberInput;
        this.onAccessoryTransformChanged = deps.onAccessoryTransformChanged;
        this.onSelectionChanged = deps.onSelectionChanged;

        this.setupControls();
    }

    public refresh(): void {
        const select = this.elements.select;
        if (!select) return;

        const accessories = this.mmdManager.getLoadedAccessories();
        const previousValue = select.value;
        select.innerHTML = "";

        for (const accessory of accessories) {
            const option = document.createElement("option");
            option.value = String(accessory.index);
            const kindLabel = accessory.kind === "glb" ? " [GLB]" : "";
            option.textContent = `${accessory.index + 1}: ${accessory.name}${kindLabel}`;
            option.title = accessory.path;
            select.appendChild(option);
        }

        if (accessories.length === 0) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "-";
            select.appendChild(option);
        } else {
            const restore = accessories.find((item) => String(item.index) === previousValue);
            select.value = restore ? String(restore.index) : "0";
        }

        select.disabled = accessories.length === 0;
        this.elements.emptyState?.classList.toggle("hidden", accessories.length > 0);
        this.setTransformControlsEnabled(accessories.length > 0);
        this.refreshParentModelOptions();
        this.syncParentControlsFromSelection();
        this.syncTransformSlidersFromSelection();
        this.updateActionButtons();
        this.onSelectionChanged();
    }

    public getSelectedAccessoryIndex(): number | null {
        const select = this.elements.select;
        if (!select || select.disabled) return null;
        const parsed = Number.parseInt(select.value, 10);
        if (Number.isNaN(parsed)) return null;
        return parsed;
    }

    private setupControls(): void {
        const select = this.elements.select;
        const parentModelSelect = this.elements.parentModelSelect;
        const parentBoneSelect = this.elements.parentBoneSelect;
        const btnVisibility = this.elements.btnVisibility;
        const btnDelete = this.elements.btnDelete;

        this.registerSlider("px", "accessory-pos-x", "accessory-pos-x-val");
        this.registerSlider("py", "accessory-pos-y", "accessory-pos-y-val");
        this.registerSlider("pz", "accessory-pos-z", "accessory-pos-z-val");
        this.registerSlider("rx", "accessory-rot-x", "accessory-rot-x-val");
        this.registerSlider("ry", "accessory-rot-y", "accessory-rot-y-val");
        this.registerSlider("rz", "accessory-rot-z", "accessory-rot-z-val");
        this.registerSlider("s", "accessory-scale", "accessory-scale-val");

        select?.addEventListener("change", () => {
            this.syncTransformSlidersFromSelection();
            this.syncParentControlsFromSelection();
            this.updateActionButtons();
            this.onSelectionChanged();
        });

        parentModelSelect?.addEventListener("change", () => {
            if (this.isSyncingParentUi) return;
            const selectedIndex = this.getSelectedAccessoryIndex();
            if (selectedIndex === null) return;

            const modelIndex = this.parseParentModelIndex();
            this.refreshParentBoneOptions(modelIndex, null);
            this.mmdManager.setAccessoryParent(selectedIndex, modelIndex, null);
        });

        parentBoneSelect?.addEventListener("change", () => {
            if (this.isSyncingParentUi) return;
            const selectedIndex = this.getSelectedAccessoryIndex();
            if (selectedIndex === null) return;

            const modelIndex = this.parseParentModelIndex();
            if (modelIndex === null) {
                this.mmdManager.setAccessoryParent(selectedIndex, null, null);
                return;
            }

            const boneName = parentBoneSelect.value || null;
            this.mmdManager.setAccessoryParent(selectedIndex, modelIndex, boneName);
        });

        btnVisibility?.addEventListener("click", () => {
            const selectedIndex = this.getSelectedAccessoryIndex();
            if (selectedIndex === null) return;
            const visible = this.mmdManager.toggleAccessoryVisibility(selectedIndex);
            this.updateActionButtons();
            this.showToast(visible ? "Accessory visible" : "Accessory hidden", "info");
        });

        btnDelete?.addEventListener("click", () => {
            const selectedIndex = this.getSelectedAccessoryIndex();
            if (selectedIndex === null) return;

            const accessories = this.mmdManager.getLoadedAccessories();
            const current = accessories.find((item) => item.index === selectedIndex);
            const targetName = current?.name ?? "Accessory";

            const ok = window.confirm(`Delete accessory '${targetName}'?`);
            if (!ok) return;

            const removed = this.mmdManager.removeAccessory(selectedIndex);
            if (!removed) {
                this.showToast("Failed to delete accessory", "error");
                return;
            }

            this.refresh();
            this.showToast(`Accessory deleted: ${targetName}`, "success");
        });

        this.updateValueLabelsFromSliders();
        this.setTransformControlsEnabled(false);
        this.setParentControlsEnabled(false);
        this.updateActionButtons();
        this.onSelectionChanged();
    }

    private registerSlider(
        key: AccessoryTransformSliderKey,
        sliderId: string,
        valueId: string,
    ): void {
        const slider = document.getElementById(sliderId) as HTMLInputElement | null;
        const valueEl = document.getElementById(valueId);
        if (!slider || !valueEl) return;
        this.transformSliders.set(key, slider);
        this.transformValueEls.set(key, valueEl);

        slider.addEventListener("input", () => {
            this.updateValueLabelsFromSliders();
            if (this.isSyncingTransformUi) return;

            const selectedIndex = this.getSelectedAccessoryIndex();
            if (selectedIndex === null) return;

            const position = {
                x: Number(this.transformSliders.get("px")?.value ?? 0),
                y: Number(this.transformSliders.get("py")?.value ?? 0),
                z: Number(this.transformSliders.get("pz")?.value ?? 0),
            };
            const rotationDeg = {
                x: Number(this.transformSliders.get("rx")?.value ?? 0),
                y: Number(this.transformSliders.get("ry")?.value ?? 0),
                z: Number(this.transformSliders.get("rz")?.value ?? 0),
            };
            const scalePercent = Number(this.transformSliders.get("s")?.value ?? 100);

            this.mmdManager.setAccessoryTransform(selectedIndex, {
                position,
                rotationDeg,
                scale: scalePercent / 100,
            });
            this.onAccessoryTransformChanged(selectedIndex);
        });
    }

    private setTransformControlsEnabled(enabled: boolean): void {
        for (const slider of this.transformSliders.values()) {
            slider.disabled = !enabled;
            this.syncRangeNumberInput(slider);
        }
    }

    private setParentControlsEnabled(enabled: boolean): void {
        if (this.elements.parentModelSelect) {
            this.elements.parentModelSelect.disabled = !enabled;
        }
        if (this.elements.parentBoneSelect) {
            this.elements.parentBoneSelect.disabled = !enabled;
        }
    }

    private parseParentModelIndex(): number | null {
        const select = this.elements.parentModelSelect;
        if (!select) return null;
        const value = select.value;
        if (value === "") return null;
        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed)) return null;
        return parsed;
    }

    private refreshParentModelOptions(): void {
        const select = this.elements.parentModelSelect;
        if (!select) return;

        const previousValue = select.value;
        const models = this.mmdManager.getLoadedModels();
        select.innerHTML = "";

        const worldOption = document.createElement("option");
        worldOption.value = "";
        worldOption.textContent = "World";
        select.appendChild(worldOption);

        for (const model of models) {
            const option = document.createElement("option");
            option.value = String(model.index);
            option.textContent = `${model.index + 1}: ${model.name}`;
            option.title = model.path;
            select.appendChild(option);
        }

        const hasPrevious = Array.from(select.options).some((option) => option.value === previousValue);
        select.value = hasPrevious ? previousValue : "";
    }

    private refreshParentBoneOptions(modelIndex: number | null, selectedBoneName: string | null): void {
        const select = this.elements.parentBoneSelect;
        if (!select) return;

        select.innerHTML = "";

        if (modelIndex === null) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "-";
            select.appendChild(option);
            select.value = "";
            select.disabled = true;
            return;
        }

        const modelOption = document.createElement("option");
        modelOption.value = "";
        modelOption.textContent = "(Model center)";
        select.appendChild(modelOption);

        const boneNames = this.mmdManager.getModelBoneNames(modelIndex);
        for (const boneName of boneNames) {
            const option = document.createElement("option");
            option.value = boneName;
            option.textContent = boneName;
            select.appendChild(option);
        }

        const target = selectedBoneName ?? "";
        const hasTarget = Array.from(select.options).some((option) => option.value === target);
        select.value = hasTarget ? target : "";
        select.disabled = false;
    }

    private syncParentControlsFromSelection(): void {
        const selectedIndex = this.getSelectedAccessoryIndex();
        if (selectedIndex === null) {
            this.isSyncingParentUi = true;
            try {
                if (this.elements.parentModelSelect) this.elements.parentModelSelect.value = "";
                this.refreshParentBoneOptions(null, null);
                this.setParentControlsEnabled(false);
            } finally {
                this.isSyncingParentUi = false;
            }
            return;
        }

        const parentState = this.mmdManager.getAccessoryParent(selectedIndex);
        const modelIndex = parentState?.modelIndex ?? null;
        const boneName = parentState?.boneName ?? null;

        this.isSyncingParentUi = true;
        try {
            this.setParentControlsEnabled(true);
            if (this.elements.parentModelSelect) {
                const modelValue = modelIndex === null ? "" : String(modelIndex);
                const hasValue = Array.from(this.elements.parentModelSelect.options)
                    .some((option) => option.value === modelValue);
                this.elements.parentModelSelect.value = hasValue ? modelValue : "";
            }
            this.refreshParentBoneOptions(modelIndex, boneName);
        } finally {
            this.isSyncingParentUi = false;
        }
    }

    private syncTransformSlidersFromSelection(): void {
        const selectedIndex = this.getSelectedAccessoryIndex();
        if (selectedIndex === null) {
            this.resetTransformSliders();
            return;
        }

        const transform = this.mmdManager.getAccessoryTransform(selectedIndex);
        if (!transform) {
            this.resetTransformSliders();
            return;
        }

        this.isSyncingTransformUi = true;
        try {
            this.setSliderValueClamped("px", transform.position.x);
            this.setSliderValueClamped("py", transform.position.y);
            this.setSliderValueClamped("pz", transform.position.z);
            this.setSliderValueClamped("rx", transform.rotationDeg.x);
            this.setSliderValueClamped("ry", transform.rotationDeg.y);
            this.setSliderValueClamped("rz", transform.rotationDeg.z);
            this.setSliderValueClamped("s", transform.scale * 100);
            this.updateValueLabelsFromSliders();
        } finally {
            this.isSyncingTransformUi = false;
        }
    }

    private resetTransformSliders(): void {
        this.isSyncingTransformUi = true;
        try {
            this.setSliderValueClamped("px", 0);
            this.setSliderValueClamped("py", 0);
            this.setSliderValueClamped("pz", 0);
            this.setSliderValueClamped("rx", 0);
            this.setSliderValueClamped("ry", 0);
            this.setSliderValueClamped("rz", 0);
            this.setSliderValueClamped("s", 100);
            this.updateValueLabelsFromSliders();
        } finally {
            this.isSyncingTransformUi = false;
        }
    }

    private setSliderValueClamped(key: AccessoryTransformSliderKey, value: number): void {
        const slider = this.transformSliders.get(key);
        if (!slider || !Number.isFinite(value)) return;
        const min = Number(slider.min);
        const max = Number(slider.max);
        const clamped = Math.max(min, Math.min(max, value));
        slider.value = String(clamped);
        this.syncRangeNumberInput(slider);
    }

    private updateValueLabelsFromSliders(): void {
        const getValue = (key: AccessoryTransformSliderKey): number =>
            Number(this.transformSliders.get(key)?.value ?? 0);

        const px = getValue("px");
        const py = getValue("py");
        const pz = getValue("pz");
        const rx = getValue("rx");
        const ry = getValue("ry");
        const rz = getValue("rz");
        const s = getValue("s");

        const setText = (key: AccessoryTransformSliderKey, text: string): void => {
            const valueEl = this.transformValueEls.get(key);
            if (valueEl) valueEl.textContent = text;
        };

        setText("px", px.toFixed(2));
        setText("py", py.toFixed(2));
        setText("pz", pz.toFixed(2));
        setText("rx", `${rx.toFixed(1)}°`);
        setText("ry", `${ry.toFixed(1)}°`);
        setText("rz", `${rz.toFixed(1)}°`);
        setText("s", `${Math.round(s)}%`);
    }

    private updateActionButtons(): void {
        const btnVisibility = this.elements.btnVisibility;
        const btnDelete = this.elements.btnDelete;
        if (!btnVisibility || !btnDelete) return;

        const selectedIndex = this.getSelectedAccessoryIndex();
        const enabled = selectedIndex !== null;
        btnVisibility.disabled = !enabled;
        btnDelete.disabled = !enabled;

        if (!enabled) {
            btnVisibility.textContent = t("button.hide");
            return;
        }

        const accessories = this.mmdManager.getLoadedAccessories();
        const current = accessories.find((item) => item.index === selectedIndex);
        const visible = current?.visible ?? true;
        btnVisibility.textContent = visible ? t("button.hide") : t("button.show");
    }
}
