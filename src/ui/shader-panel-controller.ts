import { t } from "../i18n";
import type { MmdManager, WgslMaterialShaderPresetId } from "../mmd-manager";

type ToastType = "success" | "error" | "info";

type ShaderPanelElements = {
    modelSelect: HTMLSelectElement | null;
    presetSelect: HTMLSelectElement | null;
    applySelectedButton: HTMLButtonElement | null;
    applyAllButton: HTMLButtonElement | null;
    resetButton: HTMLButtonElement | null;
    note: HTMLElement | null;
    materialList: HTMLElement | null;
};

type InfoModelSelectState = {
    innerHTML: string;
    value: string;
    disabled: boolean;
};

export type ShaderPanelControllerDeps = {
    mmdManager: MmdManager;
    getInfoModelSelectState: () => InfoModelSelectState;
    onModelTargetSelected: (value: string, showToast: boolean) => void;
    renderCameraPostEffectsPanel: () => void;
    restoreCameraDofControlsToCameraPanel: () => void;
    getBaseNameForRenderer: (filePath: string) => string;
    showToast: (message: string, type?: ToastType) => void;
    onExternalWgslToonChanged: (path: string | null, text: string | null) => void;
};

const CAMERA_SELECT_VALUE = "__camera__";
const EXTERNAL_WGSL_PRESET_PREFIX = "external-wgsl::";
const HIDDEN_SHADER_PRESET_IDS = new Set<WgslMaterialShaderPresetId>([
    "wgsl-specular",
    "wgsl-cel-sharp",
    "wgsl-rim-lift",
    "wgsl-mono-flat",
    "wgsl-full-light-add",
    "wgsl-full-alpha-test-hard",
    "wgsl-alpha-mask",
    "wgsl-accessory-toon",
    "wgsl-white-key-cutout",
    "wgsl-black-key-cutout",
]);

function resolveShaderPanelElements(): ShaderPanelElements {
    return {
        modelSelect: document.getElementById("shader-model-select") as HTMLSelectElement | null,
        presetSelect: document.getElementById("shader-preset-select") as HTMLSelectElement | null,
        applySelectedButton: document.getElementById("btn-shader-apply-selected") as HTMLButtonElement | null,
        applyAllButton: document.getElementById("btn-shader-apply-all") as HTMLButtonElement | null,
        resetButton: document.getElementById("btn-shader-reset") as HTMLButtonElement | null,
        note: document.getElementById("shader-panel-note"),
        materialList: document.getElementById("shader-material-list"),
    };
}

export class ShaderPanelController {
    private readonly elements: ShaderPanelElements;
    private readonly mmdManager: MmdManager;
    private readonly getInfoModelSelectState: () => InfoModelSelectState;
    private readonly onModelTargetSelected: (value: string, showToast: boolean) => void;
    private readonly renderCameraPostEffectsPanel: () => void;
    private readonly restoreCameraDofControlsToCameraPanel: () => void;
    private readonly getBaseNameForRenderer: (filePath: string) => string;
    private readonly showToast: (message: string, type?: ToastType) => void;
    private readonly onExternalWgslToonChanged: (path: string | null, text: string | null) => void;
    private readonly selectedMaterialKeys = new Map<number, string>();
    private bundledWgslShaderFiles: { name: string; path: string }[] = [];
    private bundledWgslScanInFlight = false;
    private postFxWgslToonPath: string | null = null;
    private postFxWgslToonText: string | null = null;

    constructor(deps: ShaderPanelControllerDeps) {
        this.elements = resolveShaderPanelElements();
        this.mmdManager = deps.mmdManager;
        this.getInfoModelSelectState = deps.getInfoModelSelectState;
        this.onModelTargetSelected = deps.onModelTargetSelected;
        this.renderCameraPostEffectsPanel = deps.renderCameraPostEffectsPanel;
        this.restoreCameraDofControlsToCameraPanel = deps.restoreCameraDofControlsToCameraPanel;
        this.getBaseNameForRenderer = deps.getBaseNameForRenderer;
        this.showToast = deps.showToast;
        this.onExternalWgslToonChanged = deps.onExternalWgslToonChanged;

        this.setupEventListeners();
    }

    public refresh(): void {
        const elements = this.elements;
        if (
            !elements.modelSelect ||
            !elements.presetSelect ||
            !elements.applySelectedButton ||
            !elements.applyAllButton ||
            !elements.resetButton ||
            !elements.note ||
            !elements.materialList
        ) {
            return;
        }

        this.syncModelSelectorFromInfo();

        if (this.mmdManager.getTimelineTarget() === "camera") {
            this.renderCameraPostEffectsPanel();
            return;
        }
        this.restoreCameraDofControlsToCameraPanel();

        if (!this.bundledWgslScanInFlight) {
            void this.reloadBundledWgslShaderFiles(false);
        }

        const isAvailable = this.mmdManager.isWgslMaterialShaderAssignmentAvailable();
        const previousSelectedShaderValue = elements.presetSelect.value;
        const presets = this.mmdManager.getWgslMaterialShaderPresets()
            .filter((preset) => !HIDDEN_SHADER_PRESET_IDS.has(preset.id));
        const models = this.mmdManager.getWgslModelShaderStates();

        elements.presetSelect.innerHTML = "";
        for (const preset of presets) {
            const option = document.createElement("option");
            option.value = preset.id;
            option.textContent = preset.label;
            elements.presetSelect.appendChild(option);
        }

        if (!isAvailable) {
            elements.modelSelect.innerHTML = '<option value="">-</option>';
            elements.modelSelect.disabled = true;
            elements.presetSelect.disabled = true;
            elements.applySelectedButton.disabled = true;
            elements.applyAllButton.disabled = true;
            elements.resetButton.disabled = true;
            elements.note.textContent = t("shader.note.wgslUnavailable");
            elements.materialList.innerHTML = `<div class="panel-empty-state">${t("shader.note.wgslUnavailable")}</div>`;
            return;
        }

        if (models.length === 0) {
            elements.modelSelect.innerHTML = '<option value="">-</option>';
            elements.modelSelect.disabled = true;
            elements.presetSelect.disabled = true;
            elements.applySelectedButton.disabled = true;
            elements.applyAllButton.disabled = true;
            elements.resetButton.disabled = true;
            elements.note.textContent = t("shader.note.loadModel");
            elements.materialList.innerHTML = `<div class="panel-empty-state">${t("empty.noModel")}</div>`;
            return;
        }

        const infoModelState = this.getInfoModelSelectState();
        const timelineTarget = this.mmdManager.getTimelineTarget();
        let selectedModelIndex = Number.parseInt(infoModelState.value, 10);
        if (
            timelineTarget !== "model" ||
            Number.isNaN(selectedModelIndex) ||
            !models.some((model) => model.modelIndex === selectedModelIndex)
        ) {
            selectedModelIndex = models.find((model) => model.active)?.modelIndex ?? models[0].modelIndex;
        }

        const selectedModel = models.find((model) => model.modelIndex === selectedModelIndex) ?? models[0];
        elements.modelSelect.value = String(selectedModel.modelIndex);
        elements.modelSelect.disabled = false;

        if (selectedModel.materials.length === 0) {
            elements.presetSelect.disabled = true;
            elements.applySelectedButton.disabled = true;
            elements.applyAllButton.disabled = true;
            elements.resetButton.disabled = true;
            elements.note.textContent = t("shader.note.noMaterial");
            elements.materialList.innerHTML = `<div class="panel-empty-state">${t("shader.note.noMaterial")}</div>`;
            return;
        }

        const rememberedMaterialKey = this.selectedMaterialKeys.get(selectedModel.modelIndex);
        const selectedMaterial = rememberedMaterialKey
            ? selectedModel.materials.find((material) => material.key === rememberedMaterialKey) ?? null
            : null;
        if (rememberedMaterialKey && !selectedMaterial) {
            this.selectedMaterialKeys.delete(selectedModel.modelIndex);
        }

        let selectedPresetId = presets[0]?.id ?? "wgsl-mmd-standard";
        let mixedPresets = false;
        if (selectedMaterial) {
            selectedPresetId = selectedMaterial.presetId;
        } else {
            const allPresetIds = Array.from(new Set(selectedModel.materials.map((material) => material.presetId)));
            if (allPresetIds.length === 1) {
                selectedPresetId = allPresetIds[0];
            } else {
                mixedPresets = true;
            }
        }
        if (!presets.some((preset) => preset.id === selectedPresetId)) {
            selectedPresetId = presets[0]?.id ?? "wgsl-mmd-standard";
        }

        const selectedExternalWgslPath = selectedMaterial
            ? selectedMaterial.externalWgslPath
            : (() => {
                const paths = new Set(
                    selectedModel.materials
                        .map((material) => material.externalWgslPath)
                        .filter((value): value is string => typeof value === "string" && value.length > 0),
                );
                return paths.size === 1 ? Array.from(paths)[0] : null;
            })();

        let selectedShaderValue = previousSelectedShaderValue;
        if (!selectedShaderValue || !Array.from(elements.presetSelect.options).some((option) => option.value === selectedShaderValue)) {
            selectedShaderValue = selectedPresetId;
        }
        if (!Array.from(elements.presetSelect.options).some((option) => option.value === selectedShaderValue)) {
            selectedShaderValue = presets[0]?.id ?? "wgsl-mmd-standard";
        }
        elements.presetSelect.value = selectedShaderValue;

        const presetLabelById = new Map(presets.map((preset) => [preset.id, preset.label]));
        elements.materialList.innerHTML = "";

        for (const material of selectedModel.materials) {
            const item = document.createElement("div");
            item.className = "shader-material-item";
            if (selectedMaterial?.key === material.key) {
                item.classList.add("active");
            }
            if (!material.visible) {
                item.classList.add("shader-material-item--hidden");
            }
            item.title = material.key;
            item.addEventListener("click", () => {
                const current = this.selectedMaterialKeys.get(selectedModel.modelIndex);
                if (current === material.key) {
                    this.selectedMaterialKeys.delete(selectedModel.modelIndex);
                } else {
                    this.selectedMaterialKeys.set(selectedModel.modelIndex, material.key);
                }
                this.refresh();
            });

            const visibilityToggle = document.createElement("input");
            visibilityToggle.className = "shader-material-toggle";
            visibilityToggle.type = "checkbox";
            visibilityToggle.checked = material.visible;
            visibilityToggle.title = material.visible ? t("button.hide") : t("button.show");
            visibilityToggle.setAttribute("aria-label", `${material.name} ${material.visible ? t("button.hide") : t("button.show")}`);
            visibilityToggle.addEventListener("click", (event) => {
                event.stopPropagation();
            });
            visibilityToggle.addEventListener("change", (event) => {
                event.stopPropagation();
                const visible = this.mmdManager.setModelMaterialVisibility(
                    selectedModel.modelIndex,
                    material.key,
                    visibilityToggle.checked,
                );
                if (!visible) {
                    visibilityToggle.checked = !visibilityToggle.checked;
                    this.showToast("Material visibility update failed", "error");
                    return;
                }
                this.refresh();
            });
            item.appendChild(visibilityToggle);

            const nameEl = document.createElement("span");
            nameEl.className = "shader-material-name";
            nameEl.textContent = material.name;
            item.appendChild(nameEl);

            const presetEl = document.createElement("span");
            presetEl.className = "shader-material-preset";
            presetEl.textContent = material.externalWgslPath
                ? `WGSL: ${this.getBaseNameForRenderer(material.externalWgslPath)}`
                : (presetLabelById.get(material.presetId) ?? material.presetId);
            item.appendChild(presetEl);

            elements.materialList.appendChild(item);
        }

        elements.applySelectedButton.textContent = t("shader.apply.selected");
        elements.applyAllButton.textContent = t("shader.apply.all");
        elements.resetButton.textContent = selectedMaterial
            ? t("shader.reset.selected")
            : t("shader.reset.all");

        if (selectedExternalWgslPath) {
            elements.note.textContent = t("shader.note.externalWgslActive", {
                name: this.getBaseNameForRenderer(selectedExternalWgslPath),
            });
        } else if (selectedMaterial) {
            elements.note.textContent = t("shader.note.selectedMaterial", {
                name: selectedMaterial.name,
            });
        } else if (mixedPresets) {
            elements.note.textContent = t("shader.note.mixedPresets");
        } else {
            const selectedPreset = presets.find((preset) => preset.id === selectedPresetId);
            elements.note.textContent = selectedPreset?.description ?? t("shader.note.applyAll");
        }

        const hasSelectableOption = Array.from(elements.presetSelect.options).some((option) => !option.disabled && option.value.length > 0);
        elements.presetSelect.disabled = !hasSelectableOption;
        elements.applySelectedButton.disabled = !hasSelectableOption || !selectedMaterial;
        elements.applyAllButton.disabled = !hasSelectableOption;
        elements.resetButton.disabled = false;
    }

    public syncModelSelectorFromInfo(): void {
        if (!this.elements.modelSelect) return;
        const state = this.getInfoModelSelectState();
        this.elements.modelSelect.innerHTML = state.innerHTML;
        this.elements.modelSelect.value = state.value;
        this.elements.modelSelect.disabled = state.disabled;
    }

    public getExternalWgslToonAsset(): { path: string | null; text: string | null } {
        return {
            path: this.postFxWgslToonPath,
            text: this.postFxWgslToonText,
        };
    }

    public setExternalWgslToonAsset(path: string | null, text: string | null): void {
        this.postFxWgslToonPath = path;
        this.postFxWgslToonText = text;
        this.onExternalWgslToonChanged(path, text);
    }

    public validateExternalWgslToonSnippet(source: string): string | null {
        const text = source.trim();
        if (text.length === 0) {
            return "WGSL shader file is empty";
        }
        if (/\bfragmentOutputs\b/.test(text)) {
            return "WGSL snippet must not include fragmentOutputs";
        }
        if (/\breturn\b/.test(text)) {
            return "WGSL snippet must not contain return statements";
        }
        if (/@fragment\b|@vertex\b/.test(text) || /\bfn\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(text)) {
            return "Use a toon snippet, not a full WGSL module";
        }
        if (!/diffuseBase\s*\+=/.test(text)) {
            return "WGSL snippet must write to diffuseBase";
        }
        return null;
    }

    public async reloadBundledWgslShaderFiles(triggerRefresh = true): Promise<void> {
        if (this.bundledWgslScanInFlight) {
            return;
        }
        this.bundledWgslScanInFlight = true;
        try {
            this.bundledWgslShaderFiles = await window.electronAPI.listBundledWgslFiles();
        } catch {
            this.bundledWgslShaderFiles = [];
        } finally {
            this.bundledWgslScanInFlight = false;
        }
        if (triggerRefresh) {
            this.refresh();
        }
    }

    private setupEventListeners(): void {
        this.elements.modelSelect?.addEventListener("change", () => {
            this.onModelTargetSelected(this.elements.modelSelect?.value ?? "", true);
        });
        this.elements.applySelectedButton?.addEventListener("click", () => {
            void this.applyShaderPresetFromPanel(false, "selected");
        });
        this.elements.applyAllButton?.addEventListener("click", () => {
            void this.applyShaderPresetFromPanel(false, "all");
        });
        this.elements.resetButton?.addEventListener("click", () => {
            void this.applyShaderPresetFromPanel(true, "auto");
        });
    }

    private parseExternalWgslPresetPath(value: string): string | null {
        if (!value.startsWith(EXTERNAL_WGSL_PRESET_PREFIX)) {
            return null;
        }
        const path = value.slice(EXTERNAL_WGSL_PRESET_PREFIX.length).trim();
        return path.length > 0 ? path : null;
    }

    private async applyShaderPresetFromPanel(resetToDefault: boolean, target: "auto" | "selected" | "all"): Promise<void> {
        if (!this.elements.presetSelect) {
            return;
        }
        if (!this.mmdManager.isWgslMaterialShaderAssignmentAvailable()) {
            this.showToast("WGSL effect assignment is unavailable", "error");
            return;
        }
        if (this.getInfoModelSelectState().value === CAMERA_SELECT_VALUE) {
            this.showToast("Select a model in the info panel first", "error");
            return;
        }

        const models = this.mmdManager.getWgslModelShaderStates();
        let modelIndex = Number.parseInt(this.getInfoModelSelectState().value, 10);
        if (Number.isNaN(modelIndex) || !models.some((model) => model.modelIndex === modelIndex)) {
            modelIndex = models.find((model) => model.active)?.modelIndex ?? -1;
        }
        if (modelIndex < 0) {
            this.showToast("Model is not selected", "error");
            return;
        }

        const selectedMaterialKey = this.selectedMaterialKeys.get(modelIndex) ?? null;
        if (target === "selected" && selectedMaterialKey === null) {
            this.showToast("No material selected", "error");
            return;
        }
        const materialKey = target === "all" ? null : selectedMaterialKey;
        const selectedValue = resetToDefault ? "wgsl-mmd-standard" : this.elements.presetSelect.value;
        if (!selectedValue) {
            this.showToast("Effect preset is not selected", "error");
            return;
        }

        if (resetToDefault || !this.parseExternalWgslPresetPath(selectedValue)) {
            this.setExternalWgslToonAsset(null, null);
            this.mmdManager.setExternalWgslToonShaderForModel(modelIndex, materialKey, null, null);
        }

        const externalWgslPath = this.parseExternalWgslPresetPath(selectedValue);
        if (externalWgslPath) {
            const shaderText = await window.electronAPI.readTextFile(externalWgslPath);
            if (!shaderText) {
                this.showToast(`WGSL shader load failed: ${this.getBaseNameForRenderer(externalWgslPath)}`, "error");
                return;
            }
            const validationError = this.validateExternalWgslToonSnippet(shaderText);
            if (validationError) {
                this.showToast(`WGSL invalid: ${validationError}`, "error");
                return;
            }

            const ok = this.mmdManager.setExternalWgslToonShaderForModel(modelIndex, materialKey, externalWgslPath, shaderText);
            if (!ok) {
                this.showToast("WGSL shader assignment failed", "error");
                return;
            }

            this.setExternalWgslToonAsset(externalWgslPath, shaderText);
            this.refresh();
            this.showToast(`WGSL shader selected: ${this.getBaseNameForRenderer(externalWgslPath)}`, "success");
            return;
        }

        const ok = this.mmdManager.setWgslMaterialShaderPreset(
            modelIndex,
            materialKey,
            selectedValue as WgslMaterialShaderPresetId,
        );
        if (!ok) {
            this.showToast("Effect assignment failed", "error");
            return;
        }

        this.refresh();
        const targetLabel = materialKey === null ? "all materials" : "selected material";
        this.showToast(`Effect assigned (${targetLabel})`, "success");
    }
}
