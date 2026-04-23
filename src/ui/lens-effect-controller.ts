import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";

type LensEffectElements = {
    distortionInput: HTMLInputElement | null;
    distortionValue: HTMLElement | null;
    influenceInput: HTMLInputElement | null;
    influenceValue: HTMLElement | null;
};

type LensEffectPanelElements = {
    chromaticInput: HTMLInputElement;
    chromaticValue: HTMLElement;
    influenceInput: HTMLInputElement;
    influenceValue: HTMLElement;
    edgeBlurInput: HTMLInputElement | null;
    edgeBlurValue: HTMLElement | null;
};

export type LensEffectControllerDeps = {
    mmdManager: MmdManager;
    syncRangeNumberInput: (slider: HTMLInputElement) => void;
    isRangeInputEditing: (slider: HTMLInputElement) => boolean;
};

function resolveLensEffectElements(): LensEffectElements {
    return {
        distortionInput: document.getElementById("effect-lens-distortion") as HTMLInputElement | null,
        distortionValue: document.getElementById("effect-lens-distortion-val"),
        influenceInput: document.getElementById("effect-lens-distortion-influence") as HTMLInputElement | null,
        influenceValue: document.getElementById("effect-lens-distortion-influence-val"),
    };
}

function queryPanelElements(root: ParentNode): LensEffectPanelElements | null {
    const chromaticInput = root.querySelector<HTMLInputElement>('input[data-postfx="chromatic-aberration"]');
    const chromaticValue = root.querySelector<HTMLElement>('span[data-postfx-val="chromatic-aberration"]');
    const influenceInput = root.querySelector<HTMLInputElement>('input[data-postfx="distortion-influence"]');
    const influenceValue = root.querySelector<HTMLElement>('span[data-postfx-val="distortion-influence"]');
    const edgeBlurInput = root.querySelector<HTMLInputElement>('input[data-postfx="lens-edge-blur"]');
    const edgeBlurValue = root.querySelector<HTMLElement>('span[data-postfx-val="lens-edge-blur"]');

    if (
        !chromaticInput ||
        !chromaticValue ||
        !influenceInput ||
        !influenceValue
    ) {
        return null;
    }

    return {
        chromaticInput,
        chromaticValue,
        influenceInput,
        influenceValue,
        edgeBlurInput,
        edgeBlurValue,
    };
}

export class LensEffectController {
    private readonly elements: LensEffectElements;
    private readonly mmdManager: MmdManager;
    private readonly syncRangeNumberInput: (slider: HTMLInputElement) => void;
    private readonly isRangeInputEditing: (slider: HTMLInputElement) => boolean;

    constructor(deps: LensEffectControllerDeps) {
        this.elements = resolveLensEffectElements();
        this.mmdManager = deps.mmdManager;
        this.syncRangeNumberInput = deps.syncRangeNumberInput;
        this.isRangeInputEditing = deps.isRangeInputEditing;

        this.setupStaticControls();
    }

    public connect(root: ParentNode): boolean {
        const elements = queryPanelElements(root);
        if (!elements) {
            return false;
        }

        const applyChromaticAberration = (): void => {
            this.mmdManager.postEffectChromaticAberration = Number(elements.chromaticInput.value);
            elements.chromaticValue.textContent = this.mmdManager.postEffectChromaticAberration > 0.000001
                ? this.mmdManager.postEffectChromaticAberration.toFixed(0)
                : t("status.off");
        };

        const applyDistortionInfluence = (): void => {
            this.applyDistortionInfluenceInput(elements.influenceInput);
            this.refreshDistortionInfluenceValue(elements.influenceInput, elements.influenceValue);
            this.refreshStaticDistortionControls();
        };

        const applyEdgeBlur = (): void => {
            if (!elements.edgeBlurInput || !elements.edgeBlurValue) {
                return;
            }
            this.mmdManager.dofLensEdgeBlur = Number(elements.edgeBlurInput.value) / 100;
            this.refreshEdgeBlurValue(elements.edgeBlurInput, elements.edgeBlurValue);
        };

        elements.chromaticInput.value = String(
            Math.max(0, Math.min(200, Math.round(this.mmdManager.postEffectChromaticAberration))),
        );
        this.refreshDistortionInfluenceValue(elements.influenceInput, elements.influenceValue);
        this.refreshEdgeBlurValue(elements.edgeBlurInput, elements.edgeBlurValue);

        applyChromaticAberration();
        applyDistortionInfluence();
        applyEdgeBlur();

        elements.chromaticInput.addEventListener("input", applyChromaticAberration);
        elements.influenceInput.addEventListener("input", applyDistortionInfluence);
        elements.edgeBlurInput?.addEventListener("input", applyEdgeBlur);
        return true;
    }

    public refresh(): void {
        this.refreshStaticControls();

        const panelElements = queryPanelElements(document);
        if (panelElements) {
            panelElements.chromaticInput.value = String(
                Math.max(0, Math.min(200, Math.round(this.mmdManager.postEffectChromaticAberration))),
            );
            panelElements.chromaticValue.textContent = this.mmdManager.postEffectChromaticAberration > 0.000001
                ? this.mmdManager.postEffectChromaticAberration.toFixed(0)
                : t("status.off");
            this.refreshDistortionInfluenceValue(panelElements.influenceInput, panelElements.influenceValue);
            this.refreshEdgeBlurValue(panelElements.edgeBlurInput, panelElements.edgeBlurValue);
        }
    }

    public refreshAutoReadout(): void {
        if (!this.mmdManager.dofLensDistortionLinkedToCameraFov) return;
        if (!this.elements.distortionInput || !this.elements.distortionValue) return;
        if (this.isRangeInputEditing(this.elements.distortionInput)) return;

        const distortionPercent = this.mmdManager.dofLensDistortion * 100;
        const sliderMin = Number(this.elements.distortionInput.min);
        const sliderMax = Number(this.elements.distortionInput.max);
        const clamped = Math.max(sliderMin, Math.min(sliderMax, distortionPercent));
        this.elements.distortionInput.value = String(Math.round(clamped));
        this.elements.distortionValue.textContent = `${Math.round(distortionPercent)}% (auto)`;
        this.syncRangeNumberInput(this.elements.distortionInput);
    }

    private setupStaticControls(): void {
        this.setupStaticDistortionControl();
        this.setupStaticInfluenceControl();
    }

    private setupStaticDistortionControl(): void {
        const input = this.elements.distortionInput;
        const value = this.elements.distortionValue;
        if (!input || !value) {
            return;
        }

        const applyLensDistortion = (): void => {
            if (this.mmdManager.dofLensDistortionLinkedToCameraFov) {
                this.refreshAutoReadout();
                return;
            }
            const scale = Number(input.value) / 100;
            this.mmdManager.dofLensDistortion = scale;
            value.textContent = `${Math.round(this.mmdManager.dofLensDistortion * 100)}%`;
        };

        input.value = String(Math.round(this.mmdManager.dofLensDistortion * 100));
        if (this.mmdManager.dofLensDistortionLinkedToCameraFov) {
            input.disabled = true;
            input.title = "Auto distortion (linked to camera FoV; 30deg = 0%)";
        } else {
            input.addEventListener("input", applyLensDistortion);
        }
        applyLensDistortion();
    }

    private setupStaticInfluenceControl(): void {
        const input = this.elements.influenceInput;
        const value = this.elements.influenceValue;
        if (!input || !value) {
            return;
        }

        const applyLensDistortionInfluence = (): void => {
            this.applyDistortionInfluenceInput(input);
            this.refreshDistortionInfluenceValue(input, value);
            this.refreshAutoReadout();

            const panelElements = queryPanelElements(document);
            if (panelElements) {
                this.refreshDistortionInfluenceValue(panelElements.influenceInput, panelElements.influenceValue);
            }
        };

        this.refreshDistortionInfluenceValue(input, value);
        applyLensDistortionInfluence();
        input.addEventListener("input", applyLensDistortionInfluence);
    }

    private applyDistortionInfluenceInput(input: HTMLInputElement): void {
        const scale = Number(input.value) / 100;
        this.mmdManager.dofLensDistortionInfluence = scale;
    }

    private refreshStaticControls(): void {
        this.refreshStaticDistortionControls();
        this.refreshStaticInfluenceControls();
    }

    private refreshStaticDistortionControls(): void {
        if (!this.elements.distortionInput || !this.elements.distortionValue) {
            return;
        }
        if (this.mmdManager.dofLensDistortionLinkedToCameraFov) {
            this.refreshAutoReadout();
            return;
        }
        this.elements.distortionInput.value = String(Math.round(this.mmdManager.dofLensDistortion * 100));
        this.elements.distortionValue.textContent = `${Math.round(this.mmdManager.dofLensDistortion * 100)}%`;
        this.syncRangeNumberInput(this.elements.distortionInput);
    }

    private refreshStaticInfluenceControls(): void {
        if (!this.elements.influenceInput || !this.elements.influenceValue) {
            return;
        }
        this.refreshDistortionInfluenceValue(this.elements.influenceInput, this.elements.influenceValue);
    }

    private refreshDistortionInfluenceValue(input: HTMLInputElement, value: HTMLElement): void {
        const percent = Math.round(this.mmdManager.dofLensDistortionInfluence * 100);
        input.value = String(percent);
        value.textContent = `${percent}%`;
        this.syncRangeNumberInput(input);
    }

    private refreshEdgeBlurValue(
        input: HTMLInputElement | null,
        value: HTMLElement | null,
    ): void {
        if (!input || !value) {
            return;
        }

        const percent = Math.round(this.mmdManager.dofLensEdgeBlur * 100);
        input.value = String(percent);
        input.title = "独自ポストエフェクト実装待ち";
        value.textContent = `${percent}%`;
        value.title = "独自ポストエフェクト実装待ち";
        this.syncRangeNumberInput(input);
    }
}
