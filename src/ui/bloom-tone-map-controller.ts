import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";

const LUMINOUS_GLOW_DEFAULT_KERNEL = 20;
const LUMINOUS_GLOW_SLIDER_MAX = 100;

type BloomToneMapElements = {
    toneMappingTypeSelect: HTMLSelectElement;
    toneMappingValue: HTMLElement;
    bloomEnabledInput: HTMLInputElement;
    bloomWeightInput: HTMLInputElement;
    bloomWeightValue: HTMLElement;
    bloomThresholdInput: HTMLInputElement;
    bloomThresholdValue: HTMLElement;
    bloomKernelInput: HTMLInputElement;
    bloomKernelValue: HTMLElement;
    glowIntensityInput: HTMLInputElement;
    glowIntensityValue: HTMLElement;
};

export type BloomToneMapControllerDeps = {
    mmdManager: MmdManager;
};

function queryPanelElements(root: ParentNode): BloomToneMapElements | null {
    const toneMappingTypeSelect = root.querySelector<HTMLSelectElement>('select[data-postfx-select="tone-mapping-type"]');
    const toneMappingValue = root.querySelector<HTMLElement>('span[data-postfx-val="tone-mapping"]');
    const bloomEnabledInput = root.querySelector<HTMLInputElement>('input[data-postfx-check="bloom"]');
    const bloomWeightInput = root.querySelector<HTMLInputElement>('input[data-postfx="bloom-weight"]');
    const bloomWeightValue = root.querySelector<HTMLElement>('span[data-postfx-val="bloom-weight"]');
    const bloomThresholdInput = root.querySelector<HTMLInputElement>('input[data-postfx="bloom-threshold"]');
    const bloomThresholdValue = root.querySelector<HTMLElement>('span[data-postfx-val="bloom-threshold"]');
    const bloomKernelInput = root.querySelector<HTMLInputElement>('input[data-postfx="bloom-kernel"]');
    const bloomKernelValue = root.querySelector<HTMLElement>('span[data-postfx-val="bloom-kernel"]');
    const glowIntensityInput = root.querySelector<HTMLInputElement>('input[data-postfx="glow-intensity"]');
    const glowIntensityValue = root.querySelector<HTMLElement>('span[data-postfx-val="glow-intensity"]');

    if (
        !toneMappingTypeSelect ||
        !toneMappingValue ||
        !bloomEnabledInput ||
        !bloomWeightInput ||
        !bloomWeightValue ||
        !bloomThresholdInput ||
        !bloomThresholdValue ||
        !bloomKernelInput ||
        !bloomKernelValue ||
        !glowIntensityInput ||
        !glowIntensityValue
    ) {
        return null;
    }

    return {
        toneMappingTypeSelect,
        toneMappingValue,
        bloomEnabledInput,
        bloomWeightInput,
        bloomWeightValue,
        bloomThresholdInput,
        bloomThresholdValue,
        bloomKernelInput,
        bloomKernelValue,
        glowIntensityInput,
        glowIntensityValue,
    };
}

function toneMapTypeToLabel(value: number): string {
    switch (value) {
        case 1:
            return t("shader.option.aces");
        case 2:
            return t("shader.option.neutral");
        default:
            return t("shader.option.standard");
    }
}

export class BloomToneMapController {
    private readonly mmdManager: MmdManager;

    constructor(deps: BloomToneMapControllerDeps) {
        this.mmdManager = deps.mmdManager;
    }

    public connect(root: ParentNode): boolean {
        const elements = queryPanelElements(root);
        if (!elements) {
            return false;
        }

        const applyToneMapping = (): void => {
            const selected = Number(elements.toneMappingTypeSelect.value);
            const enabled = selected >= 0;
            this.mmdManager.postEffectToneMappingEnabled = enabled;
            if (enabled) {
                this.mmdManager.postEffectToneMappingType = selected;
            }
            elements.toneMappingValue.textContent = this.mmdManager.postEffectToneMappingEnabled
                ? toneMapTypeToLabel(this.mmdManager.postEffectToneMappingType)
                : t("option.none");
        };

        const applyBloom = (): void => {
            this.mmdManager.postEffectBloomEnabled = elements.bloomEnabledInput.checked;
            this.mmdManager.postEffectBloomWeight = Number(elements.bloomWeightInput.value) / 100;
            // Invert threshold control: move right -> wider glow range (lower threshold).
            this.mmdManager.postEffectBloomThreshold = 2 - (Number(elements.bloomThresholdInput.value) / 100);
            this.mmdManager.postEffectBloomKernel = Number(elements.bloomKernelInput.value);

            elements.bloomWeightInput.disabled = !this.mmdManager.postEffectBloomEnabled;
            elements.bloomThresholdInput.disabled = !this.mmdManager.postEffectBloomEnabled;
            elements.bloomKernelInput.disabled = !this.mmdManager.postEffectBloomEnabled;

            elements.bloomWeightValue.textContent = this.mmdManager.postEffectBloomEnabled
                ? `${Math.round(this.mmdManager.postEffectBloomWeight * 100)}%`
                : t("status.off");
            elements.bloomThresholdValue.textContent = this.mmdManager.postEffectBloomThreshold.toFixed(2);
            elements.bloomKernelValue.textContent = String(Math.round(this.mmdManager.postEffectBloomKernel));
        };

        const applyGlow = (): void => {
            this.mmdManager.postEffectGlowIntensity = Math.max(
                0,
                Math.min(1, Number(elements.glowIntensityInput.value) / 100),
            );
            this.mmdManager.postEffectGlowKernel = LUMINOUS_GLOW_DEFAULT_KERNEL;
            this.mmdManager.postEffectGlowEnabled = this.mmdManager.postEffectGlowIntensity > 0.000001;

            elements.glowIntensityValue.textContent = this.mmdManager.postEffectGlowEnabled
                ? this.mmdManager.postEffectGlowIntensity.toFixed(2)
                : t("status.off");
        };

        elements.toneMappingTypeSelect.value = this.mmdManager.postEffectToneMappingEnabled
            ? String(this.mmdManager.postEffectToneMappingType)
            : "-1";
        elements.bloomEnabledInput.checked = this.mmdManager.postEffectBloomEnabled;
        elements.bloomWeightInput.value = String(
            Math.max(0, Math.min(200, Math.round(this.mmdManager.postEffectBloomWeight * 100))),
        );
        elements.bloomThresholdInput.value = String(
            Math.max(0, Math.min(200, Math.round((2 - this.mmdManager.postEffectBloomThreshold) * 100))),
        );
        elements.bloomKernelInput.value = String(
            Math.max(1, Math.min(256, Math.round(this.mmdManager.postEffectBloomKernel))),
        );
        elements.glowIntensityInput.value = String(
            Math.max(
                0,
                Math.min(
                    LUMINOUS_GLOW_SLIDER_MAX,
                    Math.round((this.mmdManager.postEffectGlowEnabled ? this.mmdManager.postEffectGlowIntensity : 0) * 100),
                ),
            ),
        );

        applyToneMapping();
        applyBloom();
        applyGlow();

        elements.toneMappingTypeSelect.addEventListener("change", applyToneMapping);
        elements.bloomEnabledInput.addEventListener("input", applyBloom);
        elements.bloomWeightInput.addEventListener("input", applyBloom);
        elements.bloomThresholdInput.addEventListener("input", applyBloom);
        elements.bloomKernelInput.addEventListener("input", applyBloom);
        elements.glowIntensityInput.addEventListener("input", applyGlow);
        return true;
    }
}
