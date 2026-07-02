import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";
import type { EditorAction } from "../actions/types";

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
    dispatchAction?: (action: EditorAction) => boolean;
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
    private readonly dispatchAction: ((action: EditorAction) => boolean) | null;

    constructor(deps: FogPanelControllerDeps) {
        this.elements = resolveFogPanelElements();
        this.mmdManager = deps.mmdManager;
        this.syncRangeNumberInput = deps.syncRangeNumberInput;
        this.normalizeRangeInputValue = deps.normalizeRangeInputValue;
        this.formatRangeInputValue = deps.formatRangeInputValue;
        this.dispatchAction = deps.dispatchAction ?? null;

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

    public setFogEnabled(enabled: boolean): void {
        this.mmdManager.postEffectFogEnabled = enabled;
        this.refreshEnabled();
    }

    public setFogStart(value: number): void {
        this.mmdManager.postEffectFogStart = value;
        this.refreshSlider(this.elements.startInput, this.elements.startValue, this.mmdManager.postEffectFogStart);
        if (this.elements.endInput && Number(this.elements.endInput.value) < this.mmdManager.postEffectFogStart) {
            this.elements.endInput.value = String(Math.round(this.mmdManager.postEffectFogStart));
            this.setFogEnd(Number(this.elements.endInput.value));
        }
    }

    public setFogEnd(value: number): void {
        this.mmdManager.postEffectFogEnd = value;
        this.refreshSlider(this.elements.endInput, this.elements.endValue, this.mmdManager.postEffectFogEnd);
    }

    public setFogDensity(value: number): void {
        this.mmdManager.postEffectFogDensity = value;
        this.refreshSlider(
            this.elements.densityInput,
            this.elements.densityValue,
            this.mmdManager.postEffectFogDensity,
            (rawValue) => `${Math.round(rawValue * 10000)}`,
        );
    }

    public setFogOpacity(value: number): void {
        this.mmdManager.postEffectFogOpacity = value;
        this.refreshSlider(
            this.elements.opacityInput,
            this.elements.opacityValue,
            this.mmdManager.postEffectFogOpacity,
            (rawValue) => `${Math.round(rawValue * 100)}`,
        );
    }

    public setFogColor(r: number, g: number, b: number): void {
        this.mmdManager.setPostEffectFogColor(r, g, b);
        const fogColor = this.mmdManager.getPostEffectFogColor();
        this.refreshSlider(this.elements.colorRInput, this.elements.colorRValue, fogColor.r * 255);
        this.refreshSlider(this.elements.colorGInput, this.elements.colorGValue, fogColor.g * 255);
        this.refreshSlider(this.elements.colorBInput, this.elements.colorBValue, fogColor.b * 255);
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
            const enabled = elements.enabledInput?.checked ?? false;
            if (this.dispatchAction?.({ type: "effect.setFogEnabled", source: "panel", enabled })) return;
            this.setFogEnabled(enabled);
        };

        const applyFogStart = (): void => {
            if (!elements.startInput) return;
            const value = Number(elements.startInput.value);
            if (this.dispatchAction?.({ type: "effect.setFogStart", source: "panel", value })) return;
            this.setFogStart(value);
        };

        const applyFogEnd = (): void => {
            if (!elements.endInput) return;
            const value = Number(elements.endInput.value);
            if (this.dispatchAction?.({ type: "effect.setFogEnd", source: "panel", value })) return;
            this.setFogEnd(value);
        };

        const applyFogDensity = (): void => {
            if (!elements.densityInput) return;
            const value = Number(elements.densityInput.value);
            if (this.dispatchAction?.({ type: "effect.setFogDensity", source: "panel", value })) return;
            this.setFogDensity(value);
        };

        const applyFogOpacity = (): void => {
            if (!elements.opacityInput) return;
            const value = Number(elements.opacityInput.value);
            if (this.dispatchAction?.({ type: "effect.setFogOpacity", source: "panel", value })) return;
            this.setFogOpacity(value);
        };

        const applyFogColor = (): void => {
            if (!elements.colorRInput || !elements.colorGInput || !elements.colorBInput) return;
            const r = Number(elements.colorRInput.value) / 255;
            const g = Number(elements.colorGInput.value) / 255;
            const b = Number(elements.colorBInput.value) / 255;
            if (this.dispatchAction?.({ type: "effect.setFogColor", source: "panel", r, g, b })) return;
            this.setFogColor(r, g, b);
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
