import type { MmdManager } from "../mmd-manager";
import { t } from "../i18n";
import type { PopupContentController } from "./popup-dialog-controller";
import { colorToHex, hexToColor } from "../shared/skydome-background-style";
import {
    createPopupFormButton,
    createPopupFormField,
    createPopupFormRange,
    createPopupFormValueText,
} from "./popup-form-helpers";

type ToastType = "success" | "error" | "info";

export type BackgroundSettingsDialogControllerDeps = {
    mmdManager: MmdManager;
    showToast: (message: string, type?: ToastType) => void;
};

export class BackgroundSettingsDialogController implements PopupContentController {
    private readonly mmdManager: MmdManager;
    private readonly showToast: (message: string, type?: ToastType) => void;

    constructor(deps: BackgroundSettingsDialogControllerDeps) {
        this.mmdManager = deps.mmdManager;
        this.showToast = deps.showToast;
    }

    public mount(container: HTMLElement): void {
        const form = document.createElement("div");
        form.className = "popup-form";

        const grid = document.createElement("div");
        grid.className = "popup-form-grid";
        form.appendChild(grid);

        const backgroundStyle = this.mmdManager.getSkydomeBackgroundStyle();
        const styleMode = document.createElement("select");
        styleMode.className = "popup-form-control";
        for (const [value, label] of [
            ["gradient", t("dialog.background.style.gradient")],
            ["solid", t("dialog.background.style.solid")],
        ] as const) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = label;
            styleMode.appendChild(option);
        }
        styleMode.value = backgroundStyle.mode;
        grid.appendChild(createPopupFormField(t("dialog.background.style"), styleMode));

        const topColor = document.createElement("input");
        topColor.type = "color";
        topColor.className = "popup-form-control popup-form-color";
        topColor.value = colorToHex(backgroundStyle.topColor);
        grid.appendChild(createPopupFormField(t("dialog.background.topColor"), topColor));

        const bottomColor = document.createElement("input");
        bottomColor.type = "color";
        bottomColor.className = "popup-form-control popup-form-color";
        bottomColor.value = colorToHex(backgroundStyle.bottomColor);
        grid.appendChild(createPopupFormField(t("dialog.background.bottomColor"), bottomColor));

        const brightness = document.createElement("input");
        brightness.type = "range";
        brightness.className = "popup-form-control popup-form-range";
        brightness.min = "25";
        brightness.max = "200";
        brightness.step = "5";
        brightness.value = String(Math.round(backgroundStyle.brightness * 100));
        const brightnessValue = createPopupFormValueText(`${brightness.value}%`);
        grid.appendChild(createPopupFormField(
            t("dialog.background.brightness"),
            createPopupFormRange(brightness, brightnessValue),
        ));

        const applyStyle = (): void => {
            const previous = this.mmdManager.getSkydomeBackgroundStyle();
            this.mmdManager.setSkydomeBackgroundStyle({
                mode: styleMode.value === "solid" ? "solid" : "gradient",
                topColor: hexToColor(topColor.value) ?? previous.topColor,
                bottomColor: hexToColor(bottomColor.value) ?? previous.bottomColor,
                brightness: Number(brightness.value) / 100,
            });
            bottomColor.disabled = styleMode.value === "solid";
            brightnessValue.textContent = `${brightness.value}%`;
        };
        styleMode.addEventListener("change", applyStyle);
        topColor.addEventListener("input", applyStyle);
        bottomColor.addEventListener("input", applyStyle);
        brightness.addEventListener("input", applyStyle);
        bottomColor.disabled = styleMode.value === "solid";

        const resetStyle = createPopupFormButton(t("dialog.background.resetStyle"), "secondary");
        resetStyle.addEventListener("click", () => {
            this.mmdManager.resetSkydomeBackgroundStyle();
            const restored = this.mmdManager.getSkydomeBackgroundStyle();
            styleMode.value = restored.mode;
            topColor.value = colorToHex(restored.topColor);
            bottomColor.value = colorToHex(restored.bottomColor);
            brightness.value = String(Math.round(restored.brightness * 100));
            bottomColor.disabled = restored.mode === "solid";
            brightnessValue.textContent = `${brightness.value}%`;
            this.showToast(t("dialog.background.styleReset"), "info");
        });
        grid.appendChild(createPopupFormField("", resetStyle, "div"));

        container.appendChild(form);
    }
}
