import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";

type ColorPostFxElements = {
    contrastInput: HTMLInputElement;
    contrastValue: HTMLElement;
    gammaInput: HTMLInputElement;
    gammaValue: HTMLElement;
    exposureInput: HTMLInputElement;
    exposureValue: HTMLElement;
    ditheringInput: HTMLInputElement;
    ditheringValue: HTMLElement;
    vignetteInput: HTMLInputElement;
    vignetteValue: HTMLElement;
    grainInput: HTMLInputElement;
    grainValue: HTMLElement;
    sharpenInput: HTMLInputElement;
    sharpenValue: HTMLElement;
    colorCurvesInput: HTMLInputElement;
    colorCurvesValue: HTMLElement;
};

export type ColorPostFxControllerDeps = {
    mmdManager: MmdManager;
};

function queryRequired<T extends Element>(root: ParentNode, selector: string): T | null {
    return root.querySelector<T>(selector);
}

function resolveColorPostFxElements(root: ParentNode): ColorPostFxElements | null {
    const contrastInput = queryRequired<HTMLInputElement>(root, 'input[data-postfx="contrast"]');
    const contrastValue = queryRequired<HTMLElement>(root, 'span[data-postfx-val="contrast"]');
    const gammaInput = queryRequired<HTMLInputElement>(root, 'input[data-postfx="gamma"]');
    const gammaValue = queryRequired<HTMLElement>(root, 'span[data-postfx-val="gamma"]');
    const exposureInput = queryRequired<HTMLInputElement>(root, 'input[data-postfx="exposure"]');
    const exposureValue = queryRequired<HTMLElement>(root, 'span[data-postfx-val="exposure"]');
    const ditheringInput = queryRequired<HTMLInputElement>(root, 'input[data-postfx="dithering-intensity"]');
    const ditheringValue = queryRequired<HTMLElement>(root, 'span[data-postfx-val="dithering"]');
    const vignetteInput = queryRequired<HTMLInputElement>(root, 'input[data-postfx="vignette-weight"]');
    const vignetteValue = queryRequired<HTMLElement>(root, 'span[data-postfx-val="vignette"]');
    const grainInput = queryRequired<HTMLInputElement>(root, 'input[data-postfx="grain-intensity"]');
    const grainValue = queryRequired<HTMLElement>(root, 'span[data-postfx-val="grain-intensity"]');
    const sharpenInput = queryRequired<HTMLInputElement>(root, 'input[data-postfx="sharpen-edge"]');
    const sharpenValue = queryRequired<HTMLElement>(root, 'span[data-postfx-val="sharpen-edge"]');
    const colorCurvesInput = queryRequired<HTMLInputElement>(root, 'input[data-postfx="color-curves-saturation"]');
    const colorCurvesValue = queryRequired<HTMLElement>(root, 'span[data-postfx-val="color-curves-saturation"]');

    if (
        !contrastInput ||
        !contrastValue ||
        !gammaInput ||
        !gammaValue ||
        !exposureInput ||
        !exposureValue ||
        !ditheringInput ||
        !ditheringValue ||
        !vignetteInput ||
        !vignetteValue ||
        !grainInput ||
        !grainValue ||
        !sharpenInput ||
        !sharpenValue ||
        !colorCurvesInput ||
        !colorCurvesValue
    ) {
        return null;
    }

    return {
        contrastInput,
        contrastValue,
        gammaInput,
        gammaValue,
        exposureInput,
        exposureValue,
        ditheringInput,
        ditheringValue,
        vignetteInput,
        vignetteValue,
        grainInput,
        grainValue,
        sharpenInput,
        sharpenValue,
        colorCurvesInput,
        colorCurvesValue,
    };
}

export class ColorPostFxController {
    private readonly mmdManager: MmdManager;

    constructor(deps: ColorPostFxControllerDeps) {
        this.mmdManager = deps.mmdManager;
    }

    public connect(root: ParentNode): boolean {
        const elements = resolveColorPostFxElements(root);
        if (!elements) {
            return false;
        }

        const applyContrast = (): void => {
            const offsetPercent = Number(elements.contrastInput.value);
            this.mmdManager.postEffectContrast = 1 + offsetPercent / 100;
            const roundedOffset = Math.round((this.mmdManager.postEffectContrast - 1) * 100);
            elements.contrastValue.textContent = `${roundedOffset}%`;
        };

        const applyGamma = (): void => {
            const offsetPercent = Number(elements.gammaInput.value);
            const gammaPower = Math.pow(2, -offsetPercent / 100);
            this.mmdManager.postEffectGamma = gammaPower;
            const roundedOffset = Math.round(-Math.log2(this.mmdManager.postEffectGamma) * 100);
            elements.gammaValue.textContent = `${roundedOffset}%`;
        };

        const applyExposure = (): void => {
            this.mmdManager.postEffectExposure = Number(elements.exposureInput.value);
            elements.exposureValue.textContent = `x${this.mmdManager.postEffectExposure.toFixed(2)}`;
        };

        const applyDithering = (): void => {
            this.mmdManager.postEffectDitheringIntensity = Number(elements.ditheringInput.value);
            this.mmdManager.postEffectDitheringEnabled = this.mmdManager.postEffectDitheringIntensity > 0.000001;
            const effectivePercent = this.mmdManager.postEffectDitheringIntensity * 100;
            elements.ditheringValue.textContent = this.mmdManager.postEffectDitheringEnabled
                ? `${effectivePercent.toFixed(2)}%`
                : t("status.off");
        };

        const applyVignette = (): void => {
            this.mmdManager.postEffectVignetteWeight = Number(elements.vignetteInput.value);
            this.mmdManager.postEffectVignetteEnabled = this.mmdManager.postEffectVignetteWeight > 0.000001;
            elements.vignetteValue.textContent = this.mmdManager.postEffectVignetteEnabled
                ? this.mmdManager.postEffectVignetteWeight.toFixed(2)
                : t("status.off");
        };

        const applyGrainIntensity = (): void => {
            this.mmdManager.postEffectGrainIntensity = Number(elements.grainInput.value);
            elements.grainValue.textContent = this.mmdManager.postEffectGrainIntensity > 0.000001
                ? this.mmdManager.postEffectGrainIntensity.toFixed(1)
                : t("status.off");
        };

        const applySharpenEdge = (): void => {
            this.mmdManager.postEffectSharpenEdge = Number(elements.sharpenInput.value) / 100;
            elements.sharpenValue.textContent = this.mmdManager.postEffectSharpenEdge > 0.000001
                ? this.mmdManager.postEffectSharpenEdge.toFixed(2)
                : t("status.off");
        };

        const applyColorCurves = (): void => {
            this.mmdManager.postEffectColorCurvesHue = 30;
            this.mmdManager.postEffectColorCurvesDensity = 0;
            this.mmdManager.postEffectColorCurvesSaturation = Number(elements.colorCurvesInput.value);
            this.mmdManager.postEffectColorCurvesExposure = 0;
            this.mmdManager.postEffectColorCurvesEnabled = Math.abs(this.mmdManager.postEffectColorCurvesSaturation) > 0.000001;

            elements.colorCurvesValue.textContent = this.mmdManager.postEffectColorCurvesEnabled
                ? `${Math.round(this.mmdManager.postEffectColorCurvesSaturation)}`
                : t("status.off");
        };

        elements.contrastInput.value = String(Math.round((this.mmdManager.postEffectContrast - 1) * 100));
        elements.gammaInput.value = String(Math.round(-Math.log2(this.mmdManager.postEffectGamma) * 100));
        elements.exposureInput.value = String(Math.max(0, Math.min(8, this.mmdManager.postEffectExposure)).toFixed(2));
        elements.ditheringInput.value = String(
            Math.max(0, Math.min(1, this.mmdManager.postEffectDitheringEnabled ? this.mmdManager.postEffectDitheringIntensity : 0)).toFixed(4),
        );
        elements.vignetteInput.value = String(
            Math.max(0, Math.min(4, this.mmdManager.postEffectVignetteEnabled ? this.mmdManager.postEffectVignetteWeight : 0)).toFixed(2),
        );
        elements.grainInput.value = String(
            Math.max(0, Math.min(100, Math.round(this.mmdManager.postEffectGrainIntensity))),
        );
        elements.sharpenInput.value = String(
            Math.max(0, Math.min(400, Math.round(this.mmdManager.postEffectSharpenEdge * 100))),
        );
        elements.colorCurvesInput.value = String(
            Math.max(
                -100,
                Math.min(100, Math.round(this.mmdManager.postEffectColorCurvesEnabled ? this.mmdManager.postEffectColorCurvesSaturation : 0)),
            ),
        );

        applyContrast();
        applyGamma();
        applyExposure();
        applyDithering();
        applyVignette();
        applyGrainIntensity();
        applySharpenEdge();
        applyColorCurves();

        elements.contrastInput.addEventListener("input", applyContrast);
        elements.gammaInput.addEventListener("input", applyGamma);
        elements.exposureInput.addEventListener("input", applyExposure);
        elements.ditheringInput.addEventListener("input", applyDithering);
        elements.vignetteInput.addEventListener("input", applyVignette);
        elements.grainInput.addEventListener("input", applyGrainIntensity);
        elements.sharpenInput.addEventListener("input", applySharpenEdge);
        elements.colorCurvesInput.addEventListener("input", applyColorCurves);

        return true;
    }
}
