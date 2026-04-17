import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";

type FogPanelElements = {
    enabledInput: HTMLInputElement | null;
    enabledValue: HTMLElement | null;
    modeSelect: HTMLSelectElement | null;
    modeValue: HTMLElement | null;
    startInput: HTMLInputElement | null;
    startValue: HTMLElement | null;
    endInput: HTMLInputElement | null;
    endValue: HTMLElement | null;
    densityInput: HTMLInputElement | null;
    densityValue: HTMLElement | null;
    opacityInput: HTMLInputElement | null;
    opacityValue: HTMLElement | null;
    colorRInput: HTMLInputElement | null;
    colorRValue: HTMLElement | null;
    colorGInput: HTMLInputElement | null;
    colorGValue: HTMLElement | null;
    colorBInput: HTMLInputElement | null;
    colorBValue: HTMLElement | null;
};

export type FogPanelControllerDeps = {
    mmdManager: MmdManager;
    syncRangeNumberInput: (slider: HTMLInputElement) => void;
    normalizeRangeInputValue: (slider: HTMLInputElement, value: number) => number;
    formatRangeInputValue: (slider: HTMLInputElement, value: number) => string;
};

function resolveFogPanelElements(): FogPanelElements {
    return {
        enabledInput: document.getElementById("effect-fog-enabled") as HTMLInputElement | null,
        enabledValue: document.getElementById("effect-fog-enabled-val"),
        modeSelect: document.getElementById("effect-fog-mode") as HTMLSelectElement | null,
        modeValue: document.getElementById("effect-fog-mode-val"),
        startInput: document.getElementById("effect-fog-start") as HTMLInputElement | null,
        startValue: document.getElementById("effect-fog-start-val"),
        endInput: document.getElementById("effect-fog-end") as HTMLInputElement | null,
        endValue: document.getElementById("effect-fog-end-val"),
        densityInput: document.getElementById("effect-fog-density") as HTMLInputElement | null,
        densityValue: document.getElementById("effect-fog-density-val"),
        opacityInput: document.getElementById("effect-fog-opacity") as HTMLInputElement | null,
        opacityValue: document.getElementById("effect-fog-opacity-val"),
        colorRInput: document.getElementById("effect-fog-color-r") as HTMLInputElement | null,
        colorRValue: document.getElementById("effect-fog-color-r-val"),
        colorGInput: document.getElementById("effect-fog-color-g") as HTMLInputElement | null,
        colorGValue: document.getElementById("effect-fog-color-g-val"),
        colorBInput: document.getElementById("effect-fog-color-b") as HTMLInputElement | null,
        colorBValue: document.getElementById("effect-fog-color-b-val"),
    };
}

function fogModeToLabel(mode: number): string {
    if (mode === 1) {
        return t("option.fog.exp");
    }
    if (mode === 2) {
        return t("option.fog.exp2");
    }
    return t("option.fog.linear");
}

export class FogPanelController {
    private readonly elements: FogPanelElements;
    private readonly mmdManager: MmdManager;
    private readonly syncRangeNumberInput: (slider: HTMLInputElement) => void;
    private readonly normalizeRangeInputValue: (slider: HTMLInputElement, value: number) => number;
    private readonly formatRangeInputValue: (slider: HTMLInputElement, value: number) => string;

    constructor(deps: FogPanelControllerDeps) {
        this.elements = resolveFogPanelElements();
        this.mmdManager = deps.mmdManager;
        this.syncRangeNumberInput = deps.syncRangeNumberInput;
        this.normalizeRangeInputValue = deps.normalizeRangeInputValue;
        this.formatRangeInputValue = deps.formatRangeInputValue;

        this.setupControls();
    }

    public refresh(): void {
        this.refreshEnabled();
        this.refreshMode();
        this.refreshSlider(this.elements.startInput, this.elements.startValue, this.mmdManager.postEffectFogStart);
        this.refreshSlider(this.elements.endInput, this.elements.endValue, this.mmdManager.postEffectFogEnd);
        this.refreshSlider(
            this.elements.densityInput,
            this.elements.densityValue,
            this.mmdManager.postEffectFogDensity,
            (value) => `${Math.round(value * 10000)}`,
        );
        this.refreshSlider(
            this.elements.opacityInput,
            this.elements.opacityValue,
            this.mmdManager.postEffectFogOpacity,
            (value) => `${Math.round(value * 100)}`,
        );

        const fogColor = this.mmdManager.getPostEffectFogColor();
        this.refreshSlider(this.elements.colorRInput, this.elements.colorRValue, fogColor.r * 255);
        this.refreshSlider(this.elements.colorGInput, this.elements.colorGValue, fogColor.g * 255);
        this.refreshSlider(this.elements.colorBInput, this.elements.colorBValue, fogColor.b * 255);
        this.syncModeAvailability();
    }

    private setupControls(): void {
        const elements = this.elements;
        if (
            !elements.enabledInput ||
            !elements.enabledValue ||
            !elements.startInput ||
            !elements.startValue ||
            !elements.endInput ||
            !elements.endValue ||
            !elements.densityInput ||
            !elements.densityValue ||
            !elements.opacityInput ||
            !elements.opacityValue ||
            !elements.colorRInput ||
            !elements.colorRValue ||
            !elements.colorGInput ||
            !elements.colorGValue ||
            !elements.colorBInput ||
            !elements.colorBValue
        ) {
            return;
        }

        const applyFogEnabled = (): void => {
            this.mmdManager.postEffectFogEnabled = elements.enabledInput?.checked ?? false;
            this.refreshEnabled();
        };

        const applyFogStart = (): void => {
            if (!elements.startInput) return;
            this.mmdManager.postEffectFogStart = Number(elements.startInput.value);
            this.refreshSlider(elements.startInput, elements.startValue, this.mmdManager.postEffectFogStart);
            if (elements.endInput && Number(elements.endInput.value) < this.mmdManager.postEffectFogStart) {
                elements.endInput.value = String(Math.round(this.mmdManager.postEffectFogStart));
                applyFogEnd();
            }
        };

        const applyFogEnd = (): void => {
            if (!elements.endInput) return;
            this.mmdManager.postEffectFogEnd = Number(elements.endInput.value);
            this.refreshSlider(elements.endInput, elements.endValue, this.mmdManager.postEffectFogEnd);
        };

        const applyFogDensity = (): void => {
            if (!elements.densityInput) return;
            this.mmdManager.postEffectFogDensity = Number(elements.densityInput.value);
            this.refreshSlider(
                elements.densityInput,
                elements.densityValue,
                this.mmdManager.postEffectFogDensity,
                (value) => `${Math.round(value * 10000)}`,
            );
        };

        const applyFogOpacity = (): void => {
            if (!elements.opacityInput) return;
            this.mmdManager.postEffectFogOpacity = Number(elements.opacityInput.value);
            this.refreshSlider(
                elements.opacityInput,
                elements.opacityValue,
                this.mmdManager.postEffectFogOpacity,
                (value) => `${Math.round(value * 100)}`,
            );
        };

        const applyFogColor = (): void => {
            if (!elements.colorRInput || !elements.colorGInput || !elements.colorBInput) return;
            this.mmdManager.setPostEffectFogColor(
                Number(elements.colorRInput.value) / 255,
                Number(elements.colorGInput.value) / 255,
                Number(elements.colorBInput.value) / 255,
            );
            const fogColor = this.mmdManager.getPostEffectFogColor();
            this.refreshSlider(elements.colorRInput, elements.colorRValue, fogColor.r * 255);
            this.refreshSlider(elements.colorGInput, elements.colorGValue, fogColor.g * 255);
            this.refreshSlider(elements.colorBInput, elements.colorBValue, fogColor.b * 255);
        };

        this.mmdManager.postEffectFogMode = 2;
        this.refresh();

        elements.enabledInput.addEventListener("change", applyFogEnabled);
        elements.startInput.addEventListener("input", applyFogStart);
        elements.endInput.addEventListener("input", applyFogEnd);
        elements.densityInput.addEventListener("input", applyFogDensity);
        elements.opacityInput.addEventListener("input", applyFogOpacity);
        elements.colorRInput.addEventListener("input", applyFogColor);
        elements.colorGInput.addEventListener("input", applyFogColor);
        elements.colorBInput.addEventListener("input", applyFogColor);
    }

    private refreshEnabled(): void {
        if (!this.elements.enabledInput || !this.elements.enabledValue) return;
        this.elements.enabledInput.checked = this.mmdManager.postEffectFogEnabled;
        this.elements.enabledValue.textContent = this.mmdManager.postEffectFogEnabled ? t("status.on") : t("status.off");
    }

    private refreshMode(): void {
        if (this.elements.modeSelect) {
            this.elements.modeSelect.value = String(this.mmdManager.postEffectFogMode);
        }
        if (this.elements.modeValue) {
            this.elements.modeValue.textContent = fogModeToLabel(this.mmdManager.postEffectFogMode);
        }
    }

    private refreshSlider(
        input: HTMLInputElement | null,
        valueEl: HTMLElement | null,
        rawValue: number,
        formatter?: (value: number) => string,
    ): void {
        if (!input || !valueEl) return;

        const normalized = this.normalizeRangeInputValue(input, rawValue);
        input.value = this.formatRangeInputValue(input, normalized);
        valueEl.textContent = formatter ? formatter(rawValue) : `${Math.round(rawValue)}`;
        this.syncRangeNumberInput(input);
    }

    private syncModeAvailability(): void {
        const isLinearFog = this.mmdManager.postEffectFogMode === 0;
        if (this.elements.startInput) {
            this.elements.startInput.disabled = !isLinearFog;
        }
        if (this.elements.endInput) {
            this.elements.endInput.disabled = !isLinearFog;
        }
        if (this.elements.densityInput) {
            this.elements.densityInput.disabled = isLinearFog;
        }
        if (this.elements.opacityInput) {
            this.elements.opacityInput.disabled = false;
        }
    }
}
