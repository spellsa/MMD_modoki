import { t } from "../i18n";
import type { EditorAction } from "../actions/types";
import type { PopupContentController } from "./popup-dialog-controller";
import { createPopupFormButton, createPopupFormField, createPopupFormInline } from "./popup-form-helpers";

type WebmExportDialogDeps = {
    dispatchAction: (action: EditorAction) => boolean;
    close: () => void;
};

type OutputDomElements = {
    aspect: HTMLSelectElement | null;
    sizePreset: HTMLSelectElement | null;
    width: HTMLInputElement | null;
    height: HTMLInputElement | null;
    fps: HTMLSelectElement | null;
    includeAudio: HTMLInputElement | null;
    usePlaybackRange: HTMLInputElement | null;
    startFrame: HTMLInputElement | null;
    endFrame: HTMLInputElement | null;
    captureMode: HTMLSelectElement | null;
};

function resolveOutputDomElements(): OutputDomElements {
    return {
        aspect: document.getElementById("output-aspect") as HTMLSelectElement | null,
        sizePreset: document.getElementById("output-size-preset") as HTMLSelectElement | null,
        width: document.getElementById("output-width") as HTMLInputElement | null,
        height: document.getElementById("output-height") as HTMLInputElement | null,
        fps: document.getElementById("output-fps") as HTMLSelectElement | null,
        includeAudio: document.getElementById("output-include-audio") as HTMLInputElement | null,
        usePlaybackRange: document.getElementById("output-use-playback-range") as HTMLInputElement | null,
        startFrame: document.getElementById("output-start-frame") as HTMLInputElement | null,
        endFrame: document.getElementById("output-end-frame") as HTMLInputElement | null,
        captureMode: document.getElementById("output-webm-capture-mode") as HTMLSelectElement | null,
    };
}

function appendSelectOptions(target: HTMLSelectElement, source: HTMLSelectElement | null): void {
    if (!source) return;
    Array.from(source.options).forEach((sourceOption) => {
        const option = document.createElement("option");
        option.value = sourceOption.value;
        option.textContent = sourceOption.textContent;
        target.appendChild(option);
    });
}

function dispatchChange(element: HTMLElement | null): void {
    element?.dispatchEvent(new Event("change", { bubbles: true }));
}

function dispatchInput(element: HTMLElement | null): void {
    element?.dispatchEvent(new Event("input", { bubbles: true }));
}

export class WebmExportDialogController implements PopupContentController {
    private readonly dispatchAction: (action: EditorAction) => boolean;
    private readonly close: () => void;
    private readonly outputElements: OutputDomElements;
    private container: HTMLElement | null = null;
    private aspectSelect: HTMLSelectElement | null = null;
    private sizePresetSelect: HTMLSelectElement | null = null;
    private widthInput: HTMLInputElement | null = null;
    private heightInput: HTMLInputElement | null = null;
    private fpsSelect: HTMLSelectElement | null = null;
    private includeAudioInput: HTMLInputElement | null = null;
    private usePlaybackRangeInput: HTMLInputElement | null = null;
    private startFrameInput: HTMLInputElement | null = null;
    private endFrameInput: HTMLInputElement | null = null;
    private captureModeSelect: HTMLSelectElement | null = null;

    constructor(deps: WebmExportDialogDeps) {
        this.dispatchAction = deps.dispatchAction;
        this.close = deps.close;
        this.outputElements = resolveOutputDomElements();
    }

    public mount(container: HTMLElement): void {
        this.container = container;
        container.classList.add("popup-form");

        const form = document.createElement("div");
        form.className = "popup-form-grid";

        this.aspectSelect = this.createSelect("webm-output-aspect", this.outputElements.aspect);
        this.sizePresetSelect = this.createSelect("webm-output-size-preset", this.outputElements.sizePreset);
        this.widthInput = this.createNumberInput("webm-output-width", this.outputElements.width, 320, 8192);
        this.heightInput = this.createNumberInput("webm-output-height", this.outputElements.height, 180, 8192);
        this.fpsSelect = this.createSelect("webm-output-fps", this.outputElements.fps);
        this.includeAudioInput = this.createCheckbox("webm-output-include-audio", this.outputElements.includeAudio);
        this.usePlaybackRangeInput = this.createCheckbox("webm-output-use-playback-range", this.outputElements.usePlaybackRange);
        this.startFrameInput = this.createNumberInput("webm-output-start-frame", this.outputElements.startFrame, 0, 999999);
        this.endFrameInput = this.createNumberInput("webm-output-end-frame", this.outputElements.endFrame, 0, 999999);
        this.captureModeSelect = this.createCaptureModeSelect();

        form.appendChild(createPopupFormField(t("dialog.webmExport.aspect"), this.aspectSelect));
        form.appendChild(createPopupFormField(t("dialog.webmExport.longSide"), this.sizePresetSelect));
        form.appendChild(this.createSizeField());
        form.appendChild(createPopupFormField(t("dialog.webmExport.fps"), this.fpsSelect));
        form.appendChild(createPopupFormField(t("dialog.webmExport.includeAudio"), this.includeAudioInput));
        form.appendChild(createPopupFormField(t("dialog.webmExport.usePlaybackRange"), this.usePlaybackRangeInput));
        form.appendChild(this.createFrameRangeField());
        form.appendChild(createPopupFormField(t("dialog.webmExport.captureMode"), this.captureModeSelect));

        const actions = document.createElement("div");
        actions.className = "popup-form-actions";

        const cancelButton = createPopupFormButton(t("dialog.webmExport.cancel"), "secondary");
        cancelButton.addEventListener("click", () => this.close());

        const exportButton = createPopupFormButton(t("dialog.webmExport.export"), "primary");
        exportButton.addEventListener("click", () => {
            this.syncAllToOutputDom();
            this.dispatchAction({ type: "project.exportWebm", source: "menu" });
            this.close();
        });

        actions.append(cancelButton, exportButton);
        container.append(form, actions);
        this.setupEvents();
    }

    public unmount(): void {
        this.container?.classList.remove("popup-form");
        this.container = null;
    }

    private setupEvents(): void {
        this.aspectSelect?.addEventListener("change", () => {
            if (this.outputElements.aspect && this.aspectSelect) {
                this.outputElements.aspect.value = this.aspectSelect.value;
            }
            if (!this.dispatchAction({ type: "output.applyPreset", source: "menu" })) {
                dispatchChange(this.outputElements.aspect);
            }
            this.syncDimensionsFromOutputDom();
        });

        this.sizePresetSelect?.addEventListener("change", () => {
            if (this.outputElements.sizePreset && this.sizePresetSelect) {
                this.outputElements.sizePreset.value = this.sizePresetSelect.value;
            }
            if (!this.dispatchAction({ type: "output.applyPreset", source: "menu" })) {
                dispatchChange(this.outputElements.sizePreset);
            }
            this.syncDimensionsFromOutputDom();
        });

        this.widthInput?.addEventListener("input", () => {
            if (this.outputElements.width && this.widthInput) {
                this.outputElements.width.value = this.widthInput.value;
            }
            if (!this.dispatchAction({ type: "output.syncDimension", source: "menu", dimension: "width" })) {
                dispatchInput(this.outputElements.width);
            }
            this.syncDimensionsFromOutputDom();
        });

        this.heightInput?.addEventListener("input", () => {
            if (this.outputElements.height && this.heightInput) {
                this.outputElements.height.value = this.heightInput.value;
            }
            if (!this.dispatchAction({ type: "output.syncDimension", source: "menu", dimension: "height" })) {
                dispatchInput(this.outputElements.height);
            }
            this.syncDimensionsFromOutputDom();
        });

        this.fpsSelect?.addEventListener("change", () => {
            if (this.outputElements.fps && this.fpsSelect) {
                this.outputElements.fps.value = this.fpsSelect.value;
                dispatchChange(this.outputElements.fps);
            }
        });
        this.includeAudioInput?.addEventListener("change", () => {
            if (this.outputElements.includeAudio && this.includeAudioInput) {
                this.outputElements.includeAudio.checked = this.includeAudioInput.checked;
                dispatchChange(this.outputElements.includeAudio);
            }
        });
        this.usePlaybackRangeInput?.addEventListener("change", () => {
            if (this.outputElements.usePlaybackRange && this.usePlaybackRangeInput) {
                this.outputElements.usePlaybackRange.checked = this.usePlaybackRangeInput.checked;
                dispatchChange(this.outputElements.usePlaybackRange);
            }
            this.syncFrameRangeEnabledState();
        });
        this.startFrameInput?.addEventListener("input", () => {
            if (this.outputElements.startFrame && this.startFrameInput) {
                this.outputElements.startFrame.value = this.startFrameInput.value;
            }
            if (!this.dispatchAction({ type: "output.markFrameRangeCustomized", source: "menu" })) {
                dispatchInput(this.outputElements.startFrame);
            }
        });
        this.endFrameInput?.addEventListener("input", () => {
            if (this.outputElements.endFrame && this.endFrameInput) {
                this.outputElements.endFrame.value = this.endFrameInput.value;
            }
            if (!this.dispatchAction({ type: "output.markFrameRangeCustomized", source: "menu" })) {
                dispatchInput(this.outputElements.endFrame);
            }
        });
        this.startFrameInput?.addEventListener("change", () => {
            if (this.outputElements.startFrame && this.startFrameInput) {
                this.outputElements.startFrame.value = this.startFrameInput.value;
            }
            if (!this.dispatchAction({ type: "output.sanitizeFrameRange", source: "menu", boundary: "start" })) {
                dispatchChange(this.outputElements.startFrame);
            }
            this.syncFrameRangeFromOutputDom();
        });
        this.endFrameInput?.addEventListener("change", () => {
            if (this.outputElements.endFrame && this.endFrameInput) {
                this.outputElements.endFrame.value = this.endFrameInput.value;
            }
            if (!this.dispatchAction({ type: "output.sanitizeFrameRange", source: "menu", boundary: "end" })) {
                dispatchChange(this.outputElements.endFrame);
            }
            this.syncFrameRangeFromOutputDom();
        });
        this.captureModeSelect?.addEventListener("change", () => {
            if (this.outputElements.captureMode && this.captureModeSelect) {
                this.outputElements.captureMode.value = this.captureModeSelect.value;
                dispatchChange(this.outputElements.captureMode);
            }
        });
    }

    private createSizeField(): HTMLElement {
        return createPopupFormField(
            t("dialog.webmExport.size"),
            createPopupFormInline(this.widthInput, "x", this.heightInput),
            "div"
        );
    }

    private createFrameRangeField(): HTMLElement {
        this.syncFrameRangeEnabledState();
        return createPopupFormField(
            t("dialog.webmExport.frameRange"),
            createPopupFormInline(this.startFrameInput, "-", this.endFrameInput),
            "div"
        );
    }

    private createSelect(id: string, source: HTMLSelectElement | null): HTMLSelectElement {
        const select = document.createElement("select");
        select.id = id;
        select.className = "popup-form-control";
        appendSelectOptions(select, source);
        if (source) select.value = source.value;
        return select;
    }

    private createCaptureModeSelect(): HTMLSelectElement {
        const select = document.createElement("select");
        select.id = "webm-output-capture-mode";
        select.className = "popup-form-control";

        const stable = document.createElement("option");
        stable.value = "readpixels";
        stable.textContent = t("dialog.webmExport.captureModeStable");
        const speed = document.createElement("option");
        speed.value = "webgpu-copy";
        speed.textContent = t("dialog.webmExport.captureModeSpeed");
        select.append(stable, speed);
        if (this.outputElements.captureMode) select.value = this.outputElements.captureMode.value;
        return select;
    }

    private createNumberInput(id: string, source: HTMLInputElement | null, min: number, max: number): HTMLInputElement {
        const input = document.createElement("input");
        input.id = id;
        input.className = "popup-form-control popup-form-number";
        input.type = "number";
        input.min = String(min);
        input.max = String(max);
        input.step = "1";
        input.value = source?.value ?? "";
        return input;
    }

    private createCheckbox(id: string, source: HTMLInputElement | null): HTMLInputElement {
        const input = document.createElement("input");
        input.id = id;
        input.className = "popup-form-checkbox";
        input.type = "checkbox";
        input.checked = Boolean(source?.checked);
        return input;
    }

    private syncDimensionsFromOutputDom(): void {
        if (this.widthInput && this.outputElements.width) this.widthInput.value = this.outputElements.width.value;
        if (this.heightInput && this.outputElements.height) this.heightInput.value = this.outputElements.height.value;
    }

    private syncFrameRangeFromOutputDom(): void {
        if (this.startFrameInput && this.outputElements.startFrame) this.startFrameInput.value = this.outputElements.startFrame.value;
        if (this.endFrameInput && this.outputElements.endFrame) this.endFrameInput.value = this.outputElements.endFrame.value;
    }

    private syncFrameRangeEnabledState(): void {
        const enabled = this.usePlaybackRangeInput?.checked ?? false;
        if (this.startFrameInput) this.startFrameInput.disabled = !enabled;
        if (this.endFrameInput) this.endFrameInput.disabled = !enabled;
    }

    private syncAllToOutputDom(): void {
        if (this.outputElements.aspect && this.aspectSelect) this.outputElements.aspect.value = this.aspectSelect.value;
        if (this.outputElements.sizePreset && this.sizePresetSelect) this.outputElements.sizePreset.value = this.sizePresetSelect.value;
        if (this.outputElements.width && this.widthInput) this.outputElements.width.value = this.widthInput.value;
        if (this.outputElements.height && this.heightInput) this.outputElements.height.value = this.heightInput.value;
        if (this.outputElements.fps && this.fpsSelect) this.outputElements.fps.value = this.fpsSelect.value;
        if (this.outputElements.includeAudio && this.includeAudioInput) this.outputElements.includeAudio.checked = this.includeAudioInput.checked;
        if (this.outputElements.usePlaybackRange && this.usePlaybackRangeInput) {
            this.outputElements.usePlaybackRange.checked = this.usePlaybackRangeInput.checked;
        }
        if (this.outputElements.startFrame && this.startFrameInput) this.outputElements.startFrame.value = this.startFrameInput.value;
        if (this.outputElements.endFrame && this.endFrameInput) this.outputElements.endFrame.value = this.endFrameInput.value;
        if (this.outputElements.captureMode && this.captureModeSelect) this.outputElements.captureMode.value = this.captureModeSelect.value;
    }
}
