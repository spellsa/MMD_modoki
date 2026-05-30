import type { MmdManager } from "../mmd-manager";
import { t } from "../i18n";
import type { EditorAction } from "../actions/types";
import type { PopupContentController } from "./popup-dialog-controller";
import {
    createPopupFormButton,
    createPopupFormButtonRow,
    createPopupFormField,
    createPopupFormRange,
    createPopupFormValueText,
} from "./popup-form-helpers";

type ToastType = "success" | "error" | "info";

export type BackgroundSettingsDialogControllerDeps = {
    mmdManager: MmdManager;
    dispatchAction: (action: EditorAction) => boolean;
    setStatus: (text: string, loading?: boolean) => void;
    showToast: (message: string, type?: ToastType) => void;
    refreshUi: () => void;
};

function getBaseNameForRenderer(filePath: string | null): string {
    if (!filePath) return "-";
    const normalized = filePath.replace(/[\\/]+$/, "");
    const index = Math.max(normalized.lastIndexOf("\\"), normalized.lastIndexOf("/"));
    return index < 0 ? normalized : normalized.slice(index + 1);
}

function createCheckbox(checked: boolean): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "popup-form-checkbox";
    input.checked = checked;
    return input;
}

function createRange(min: number, max: number, step: number): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "range";
    input.className = "popup-form-control popup-form-range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    return input;
}

export class BackgroundSettingsDialogController implements PopupContentController {
    private readonly mmdManager: MmdManager;
    private readonly dispatchAction: (action: EditorAction) => boolean;
    private readonly setStatus: (text: string, loading?: boolean) => void;
    private readonly showToast: (message: string, type?: ToastType) => void;
    private readonly refreshUi: () => void;

    private imagePathValue: HTMLElement | null = null;
    private videoPathValue: HTMLElement | null = null;

    constructor(deps: BackgroundSettingsDialogControllerDeps) {
        this.mmdManager = deps.mmdManager;
        this.dispatchAction = deps.dispatchAction;
        this.setStatus = deps.setStatus;
        this.showToast = deps.showToast;
        this.refreshUi = deps.refreshUi;
    }

    public mount(container: HTMLElement): void {
        const form = document.createElement("div");
        form.className = "popup-form";

        const grid = document.createElement("div");
        grid.className = "popup-form-grid";
        form.appendChild(grid);

        const mediaVisible = createCheckbox(this.mmdManager.isBackgroundMediaVisible());
        mediaVisible.disabled = !this.mmdManager.hasBackgroundMedia();
        mediaVisible.addEventListener("change", () => {
            this.dispatchAction({ type: "viewport.toggleBackgroundMedia", source: "menu" });
            this.refreshUi();
            this.refreshPaths();
            mediaVisible.checked = this.mmdManager.isBackgroundMediaVisible();
            mediaVisible.disabled = !this.mmdManager.hasBackgroundMedia();
        });
        grid.appendChild(createPopupFormField(t("dialog.background.mediaVisible"), mediaVisible));

        const blackBackground = createCheckbox(this.mmdManager.isBackgroundBlack());
        blackBackground.addEventListener("change", () => {
            this.dispatchAction({ type: "viewport.toggleBackgroundBlack", source: "menu" });
            blackBackground.checked = this.mmdManager.isBackgroundBlack();
        });
        grid.appendChild(createPopupFormField(t("dialog.background.black"), blackBackground));

        this.imagePathValue = createPopupFormValueText(getBaseNameForRenderer(this.mmdManager.getBackgroundImagePath()));
        grid.appendChild(createPopupFormField(t("dialog.background.currentImage"), this.imagePathValue, "div"));

        const loadImage = createPopupFormButton(t("dialog.background.loadImage"), "secondary");
        loadImage.addEventListener("click", () => void this.loadBackgroundImage(mediaVisible));
        grid.appendChild(createPopupFormField("", loadImage, "div"));

        this.videoPathValue = createPopupFormValueText(getBaseNameForRenderer(this.mmdManager.getBackgroundVideoPath()));
        grid.appendChild(createPopupFormField(t("dialog.background.currentVideo"), this.videoPathValue, "div"));

        const loadVideo = createPopupFormButton(t("dialog.background.loadVideo"), "secondary");
        const clearMedia = createPopupFormButton(t("dialog.background.clearMedia"), "secondary");
        loadVideo.addEventListener("click", () => void this.loadBackgroundVideo(mediaVisible));
        clearMedia.addEventListener("click", () => {
            this.mmdManager.clearBackgroundMedia();
            this.refreshUi();
            this.refreshPaths();
            mediaVisible.checked = this.mmdManager.isBackgroundMediaVisible();
            mediaVisible.disabled = !this.mmdManager.hasBackgroundMedia();
            this.showToast(t("dialog.background.mediaCleared"), "info");
        });
        grid.appendChild(createPopupFormField("", createPopupFormButtonRow([loadVideo, clearMedia]), "div"));

        const mirrorEnabled = createCheckbox(this.mmdManager.mirroringFloorEnabled);
        mirrorEnabled.addEventListener("change", () => {
            this.dispatchAction({
                type: "camera.setMirroringFloorEnabled",
                source: "menu",
                enabled: mirrorEnabled.checked,
            });
            this.refreshUi();
        });
        grid.appendChild(createPopupFormField(t("dialog.background.mirrorFloor"), mirrorEnabled));

        this.appendMirrorRange(grid, t("dialog.background.mirrorReflectance"), 0, 100, 1, () => this.mmdManager.mirroringFloorReflectance * 100, (value) => `${Math.round(value)}%`, (value) => {
            this.mmdManager.mirroringFloorReflectance = value / 100;
            this.refreshUi();
            return `${Math.round(this.mmdManager.mirroringFloorReflectance * 100)}%`;
        });
        this.appendMirrorRange(grid, t("dialog.background.mirrorSize"), 1, 200, 1, () => this.mmdManager.mirroringFloorSize, (value) => `${Math.round(value)}m`, (value) => {
            this.mmdManager.mirroringFloorSize = value;
            this.refreshUi();
            return `${Math.round(this.mmdManager.mirroringFloorSize)}m`;
        });
        this.appendMirrorRange(grid, t("dialog.background.mirrorHeight"), -2000, 2000, 1, () => this.mmdManager.mirroringFloorHeight * 100, (value) => `${(value / 100).toFixed(2)}m`, (value) => {
            this.mmdManager.mirroringFloorHeight = value / 100;
            this.refreshUi();
            return `${this.mmdManager.mirroringFloorHeight.toFixed(2)}m`;
        });

        const resolution = document.createElement("select");
        resolution.className = "popup-form-control";
        [256, 512, 1024, 2048].forEach((value) => {
            const option = document.createElement("option");
            option.value = String(value);
            option.textContent = String(value);
            resolution.appendChild(option);
        });
        resolution.value = String(this.mmdManager.mirroringFloorResolution);
        resolution.addEventListener("change", () => {
            this.dispatchAction({
                type: "camera.setMirroringFloorResolution",
                source: "menu",
                resolution: Number(resolution.value),
            });
            resolution.value = String(this.mmdManager.mirroringFloorResolution);
            this.refreshUi();
        });
        grid.appendChild(createPopupFormField(t("dialog.background.mirrorResolution"), resolution));

        container.appendChild(form);
    }

    private appendMirrorRange(
        grid: HTMLElement,
        label: string,
        min: number,
        max: number,
        step: number,
        readValue: () => number,
        formatValue: (value: number) => string,
        applyValue: (value: number) => string,
    ): void {
        const input = createRange(min, max, step);
        const value = createPopupFormValueText();
        const sync = (): void => {
            const nextValue = readValue();
            input.value = String(Math.round(nextValue));
            value.textContent = formatValue(nextValue);
        };
        input.addEventListener("input", () => {
            value.textContent = applyValue(Number(input.value));
        });
        sync();
        grid.appendChild(createPopupFormField(label, createPopupFormRange(input, value), "div"));
    }

    private refreshPaths(): void {
        if (this.imagePathValue) {
            this.imagePathValue.textContent = getBaseNameForRenderer(this.mmdManager.getBackgroundImagePath());
        }
        if (this.videoPathValue) {
            this.videoPathValue.textContent = getBaseNameForRenderer(this.mmdManager.getBackgroundVideoPath());
        }
    }

    private async loadBackgroundImage(mediaVisible: HTMLInputElement): Promise<void> {
        const filePath = await window.electronAPI.openFileDialog([
            { name: "Image", extensions: ["png", "jpg", "jpeg", "bmp", "webp"] },
            { name: "All files", extensions: ["*"] },
        ]);
        if (!filePath) return;
        this.setStatus("Loading background image...", true);
        try {
            await this.mmdManager.setBackgroundImageFromPath(filePath);
            this.setStatus("Background image loaded", false);
            this.showToast(`${t("toast.backgroundImage.loaded")}: ${getBaseNameForRenderer(filePath)}`, "success");
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            this.setStatus("Background image load failed", false);
            this.showToast(`${t("toast.backgroundImage.failed")}: ${message}`, "error");
        }
        this.refreshUi();
        this.refreshPaths();
        mediaVisible.checked = this.mmdManager.isBackgroundMediaVisible();
        mediaVisible.disabled = !this.mmdManager.hasBackgroundMedia();
    }

    private async loadBackgroundVideo(mediaVisible: HTMLInputElement): Promise<void> {
        const filePath = await window.electronAPI.openFileDialog([
            { name: "Video", extensions: ["webm", "mp4", "avi"] },
            { name: "All files", extensions: ["*"] },
        ]);
        if (!filePath) return;
        this.setStatus("Loading background video...", true);
        try {
            await this.mmdManager.setBackgroundVideoFromPath(filePath);
            this.setStatus("Background video loaded", false);
            this.showToast(`${t("toast.backgroundVideo.loaded")}: ${getBaseNameForRenderer(filePath)}`, "success");
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            this.setStatus("Background video load failed", false);
            this.showToast(`${t("toast.backgroundVideo.failed")}: ${message}`, "error");
        }
        this.refreshUi();
        this.refreshPaths();
        mediaVisible.checked = this.mmdManager.isBackgroundMediaVisible();
        mediaVisible.disabled = !this.mmdManager.hasBackgroundMedia();
    }
}
