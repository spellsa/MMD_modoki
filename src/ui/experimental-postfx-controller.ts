import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";

type ExperimentalPostFxElements = {
    motionBlurStrengthInput: HTMLInputElement;
    motionBlurStrengthValue: HTMLElement;
    ssrStrengthInput: HTMLInputElement;
    ssrStrengthValue: HTMLElement;
    vlsExposureInput: HTMLInputElement;
    vlsExposureValue: HTMLElement;
};

export type ExperimentalPostFxControllerDeps = {
    mmdManager: MmdManager;
};

function queryPanelElements(root: ParentNode): ExperimentalPostFxElements | null {
    const motionBlurStrengthInput = root.querySelector<HTMLInputElement>('input[data-postfx="motion-blur-strength"]');
    const motionBlurStrengthValue = root.querySelector<HTMLElement>('span[data-postfx-val="motion-blur-strength"]');
    const ssrStrengthInput = root.querySelector<HTMLInputElement>('input[data-postfx="ssr-strength"]');
    const ssrStrengthValue = root.querySelector<HTMLElement>('span[data-postfx-val="ssr-strength"]');
    const vlsExposureInput = root.querySelector<HTMLInputElement>('input[data-postfx="vls-exposure"]');
    const vlsExposureValue = root.querySelector<HTMLElement>('span[data-postfx-val="vls-exposure"]');

    if (
        !motionBlurStrengthInput ||
        !motionBlurStrengthValue ||
        !ssrStrengthInput ||
        !ssrStrengthValue ||
        !vlsExposureInput ||
        !vlsExposureValue
    ) {
        return null;
    }

    return {
        motionBlurStrengthInput,
        motionBlurStrengthValue,
        ssrStrengthInput,
        ssrStrengthValue,
        vlsExposureInput,
        vlsExposureValue,
    };
}

export class ExperimentalPostFxController {
    private readonly mmdManager: MmdManager;

    constructor(deps: ExperimentalPostFxControllerDeps) {
        this.mmdManager = deps.mmdManager;
    }

    public connect(root: ParentNode): boolean {
        const elements = queryPanelElements(root);
        if (!elements) {
            return false;
        }

        const applyMotionBlur = (): void => {
            this.mmdManager.postEffectMotionBlurStrength = Number(elements.motionBlurStrengthInput.value) / 100;
            this.mmdManager.postEffectMotionBlurSamples = 32;
            this.mmdManager.postEffectMotionBlurEnabled = this.mmdManager.postEffectMotionBlurStrength > 0.000001;

            elements.motionBlurStrengthValue.textContent = this.mmdManager.postEffectMotionBlurEnabled
                ? this.mmdManager.postEffectMotionBlurStrength.toFixed(2)
                : t("status.off");
        };

        const applySsr = (): void => {
            this.mmdManager.postEffectSsrStrength = 0;
            this.mmdManager.postEffectSsrStep = 1;
            this.mmdManager.postEffectSsrEnabled = false;
            elements.ssrStrengthValue.textContent = t("status.off");
        };

        const applyVls = (): void => {
            this.mmdManager.postEffectVlsExposure = Number(elements.vlsExposureInput.value) / 100;
            this.mmdManager.postEffectVlsDecay = 0.95;
            this.mmdManager.postEffectVlsWeight = 0.4;
            this.mmdManager.postEffectVlsDensity = 0.9;
            this.mmdManager.postEffectVlsEnabled = this.mmdManager.postEffectVlsExposure > 0.000001;

            elements.vlsExposureValue.textContent = this.mmdManager.postEffectVlsEnabled
                ? this.mmdManager.postEffectVlsExposure.toFixed(2)
                : t("status.off");
        };

        this.disableSsao();

        elements.motionBlurStrengthInput.value = String(
            Math.max(
                0,
                Math.min(
                    200,
                    Math.round((this.mmdManager.postEffectMotionBlurEnabled ? this.mmdManager.postEffectMotionBlurStrength : 0) * 100),
                ),
            ),
        );
        elements.ssrStrengthInput.value = String(
            Math.max(0, Math.min(200, Math.round((this.mmdManager.postEffectSsrEnabled ? this.mmdManager.postEffectSsrStrength : 0) * 100))),
        );
        elements.vlsExposureInput.value = String(
            Math.max(0, Math.min(200, Math.round((this.mmdManager.postEffectVlsEnabled ? this.mmdManager.postEffectVlsExposure : 0) * 100))),
        );

        applyMotionBlur();
        applySsr();
        applyVls();

        elements.motionBlurStrengthInput.addEventListener("input", applyMotionBlur);
        elements.ssrStrengthInput.addEventListener("input", applySsr);
        elements.vlsExposureInput.addEventListener("input", applyVls);
        return true;
    }

    private disableSsao(): void {
        this.mmdManager.postEffectSsaoStrength = 0;
        this.mmdManager.postEffectSsaoRadius = 2;
        this.mmdManager.postEffectSsaoFadeEnd = 200;
        this.mmdManager.postEffectSsaoEnabled = false;
    }
}
