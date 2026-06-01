import { t } from "../i18n";

export type ViewportBottomBarMode = "model" | "camera";
type ViewportAxisSpaceMode = "local" | "global" | "accessory";
type ViewportHandleKind = "move" | "rotate";
type ViewportHandleAxis = "x" | "y" | "z";

type Vector3Like = {
    x: number;
    y: number;
    z: number;
};

export type ViewportBottomBarBoneEditValue = {
    position: Vector3Like;
    rotation: Vector3Like;
};

export type ViewportBottomBarCameraEditValue = {
    target: Vector3Like;
    rotation: Vector3Like;
    distance: number;
    fov: number;
};

type ViewportBottomBarOptions = {
    onSwitchToModel: () => void;
    onSwitchToCamera: () => void;
    onPreviewBoneTransform?: (value: ViewportBottomBarBoneEditValue) => boolean;
    onPreviewCameraTransform?: (value: ViewportBottomBarCameraEditValue) => boolean;
    onCommitBoneTransform: (value: ViewportBottomBarBoneEditValue, before?: ViewportBottomBarBoneEditValue) => boolean;
    onCommitCameraTransform: (value: ViewportBottomBarCameraEditValue, before?: ViewportBottomBarCameraEditValue) => boolean;
};

export class ViewportBottomBarController {
    private readonly root: HTMLElement | null;
    private readonly modeButton: HTMLButtonElement | null;
    private readonly axisSpaceButton: HTMLButtonElement | null;
    private readonly modelGroup: HTMLElement | null;
    private readonly cameraGroup: HTMLElement | null;
    private readonly modelPositionInputs: Record<"x" | "y" | "z", HTMLInputElement | null>;
    private readonly modelRotationInputs: Record<"x" | "y" | "z", HTMLInputElement | null>;
    private readonly cameraTargetInputs: Record<"x" | "y" | "z", HTMLInputElement | null>;
    private readonly cameraRotationInputs: Record<"x" | "y" | "z", HTMLInputElement | null>;
    private readonly cameraDistanceInput: HTMLInputElement | null;
    private readonly cameraFovInput: HTMLInputElement | null;
    private readonly onPreviewBoneTransform: (value: ViewportBottomBarBoneEditValue) => boolean;
    private readonly onPreviewCameraTransform: (value: ViewportBottomBarCameraEditValue) => boolean;
    private readonly onCommitBoneTransform: (value: ViewportBottomBarBoneEditValue, before?: ViewportBottomBarBoneEditValue) => boolean;
    private readonly onCommitCameraTransform: (value: ViewportBottomBarCameraEditValue, before?: ViewportBottomBarCameraEditValue) => boolean;
    private mode: ViewportBottomBarMode = "camera";
    private axisSpaceMode: ViewportAxisSpaceMode = "local";
    private isEditingValue = false;
    private lastModelTransform: ViewportBottomBarBoneEditValue | null = null;
    private lastCameraTransform: ViewportBottomBarCameraEditValue | null = null;
    private handleDrag:
        | {
            pointerId: number;
            element: HTMLElement;
            mode: ViewportBottomBarMode;
            kind: ViewportHandleKind;
            axis: ViewportHandleAxis;
            startClientY: number;
            startValue: number;
            startEditValue: ViewportBottomBarBoneEditValue | ViewportBottomBarCameraEditValue;
            input: HTMLInputElement;
            min: number;
            max: number;
            digits: number;
            scale: number;
        }
        | null = null;

    constructor(options: ViewportBottomBarOptions) {
        this.onPreviewBoneTransform = options.onPreviewBoneTransform ?? (() => false);
        this.onPreviewCameraTransform = options.onPreviewCameraTransform ?? (() => false);
        this.onCommitBoneTransform = options.onCommitBoneTransform;
        this.onCommitCameraTransform = options.onCommitCameraTransform;
        this.root = document.getElementById("viewport-bottom-bar");
        this.modeButton = document.getElementById("viewport-bottom-mode-toggle") as HTMLButtonElement | null;
        this.axisSpaceButton = document.getElementById("viewport-axis-space-toggle") as HTMLButtonElement | null;
        this.modelGroup = document.getElementById("viewport-bottom-model-values");
        this.cameraGroup = document.getElementById("viewport-bottom-camera-values");
        this.modelPositionInputs = this.collectVectorInputs("viewport-bottom-model-pos");
        this.modelRotationInputs = this.collectVectorInputs("viewport-bottom-model-rot");
        this.cameraTargetInputs = this.collectVectorInputs("viewport-bottom-camera-target");
        this.cameraRotationInputs = this.collectVectorInputs("viewport-bottom-camera-rot");
        this.cameraDistanceInput = document.getElementById("viewport-bottom-camera-distance") as HTMLInputElement | null;
        this.cameraFovInput = document.getElementById("viewport-bottom-camera-fov") as HTMLInputElement | null;

        this.modeButton?.addEventListener("click", () => {
            if (this.modeButton?.disabled) return;
            if (this.mode === "model") {
                options.onSwitchToCamera();
                return;
            }
            options.onSwitchToModel();
        });
        this.axisSpaceButton?.addEventListener("click", () => this.cycleAxisSpaceMode());
        this.installValueInputHandlers();
        this.installHandleDragHandlers();

        this.refreshLocale();
    }

    public applyMode(mode: ViewportBottomBarMode, canSwitchToModel: boolean): void {
        this.mode = mode;
        this.root?.setAttribute("data-mode", mode);
        if (this.modeButton) {
            this.modeButton.classList.toggle("is-active", true);
            this.modeButton.setAttribute("aria-pressed", "true");
            this.modeButton.disabled = mode === "camera" && !canSwitchToModel;
        }
        if (this.modelGroup) {
            this.modelGroup.hidden = mode !== "model";
        }
        if (this.cameraGroup) {
            this.cameraGroup.hidden = mode !== "camera";
        }
        this.refreshLocale();
    }

    public updateModelTransform(transform: { position: Vector3Like; rotation: Vector3Like } | null): void {
        this.lastModelTransform = transform
            ? { position: { ...transform.position }, rotation: { ...transform.rotation } }
            : null;
        this.setInputsDisabled(this.modelPositionInputs, transform === null);
        this.setInputsDisabled(this.modelRotationInputs, transform === null);
        if (this.isEditingValue && this.mode === "model") return;

        if (!transform) {
            this.setVectorInputs(this.modelPositionInputs, null);
            this.setVectorInputs(this.modelRotationInputs, null);
            return;
        }
        this.setVectorInputs(this.modelPositionInputs, transform.position, 2);
        this.setVectorInputs(this.modelRotationInputs, transform.rotation, 1);
    }

    public updateCameraTransform(transform: { target: Vector3Like; rotation: Vector3Like; distance: number; fov: number }): void {
        this.lastCameraTransform = {
            target: { ...transform.target },
            rotation: { ...transform.rotation },
            distance: transform.distance,
            fov: transform.fov,
        };
        if (this.isEditingValue && this.mode === "camera") return;

        this.setVectorInputs(this.cameraTargetInputs, transform.target, 2);
        this.setVectorInputs(this.cameraRotationInputs, transform.rotation, 1);
        if (this.cameraDistanceInput) {
            this.cameraDistanceInput.value = this.formatNumber(transform.distance, 2);
        }
        if (this.cameraFovInput) {
            this.cameraFovInput.value = this.formatNumber(transform.fov, 1);
        }
    }

    public refreshLocale(): void {
        if (!this.modeButton) return;
        const label = this.mode === "model"
            ? t("viewportBottomBar.modelEdit")
            : t("viewportBottomBar.cameraEdit");
        this.modeButton.textContent = label;
        this.modeButton.setAttribute("aria-label", label);
        this.refreshAxisSpaceButton();
    }

    public getMode(): ViewportBottomBarMode {
        return this.mode;
    }

    private collectVectorInputs(prefix: string): Record<"x" | "y" | "z", HTMLInputElement | null> {
        return {
            x: document.getElementById(`${prefix}-x`) as HTMLInputElement | null,
            y: document.getElementById(`${prefix}-y`) as HTMLInputElement | null,
            z: document.getElementById(`${prefix}-z`) as HTMLInputElement | null,
        };
    }

    private installValueInputHandlers(): void {
        for (const input of this.getAllValueInputs()) {
            input.addEventListener("focus", () => {
                if (input.disabled) return;
                this.isEditingValue = true;
                input.select();
            });
            input.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    this.commitActiveEdit();
                    input.blur();
                    return;
                }
                if (event.key === "Escape") {
                    event.preventDefault();
                    this.cancelActiveEdit();
                    input.blur();
                }
            });
            input.addEventListener("blur", () => {
                if (!this.isEditingValue) return;
                this.commitActiveEdit();
            });
        }
    }

    private getAllValueInputs(): HTMLInputElement[] {
        return [
            ...Object.values(this.modelPositionInputs),
            ...Object.values(this.modelRotationInputs),
            ...Object.values(this.cameraTargetInputs),
            ...Object.values(this.cameraRotationInputs),
            this.cameraDistanceInput,
            this.cameraFovInput,
        ].filter((input): input is HTMLInputElement => input !== null);
    }

    private installHandleDragHandlers(): void {
        for (const element of document.querySelectorAll<HTMLElement>(".viewport-axis-handle-tool")) {
            element.addEventListener("pointerdown", (event) => this.beginHandleDrag(event, element));
        }
        window.addEventListener("pointermove", (event) => this.updateHandleDrag(event));
        window.addEventListener("pointerup", (event) => this.finishHandleDrag(event, true));
        window.addEventListener("pointercancel", (event) => this.finishHandleDrag(event, false));
    }

    private beginHandleDrag(event: PointerEvent, element: HTMLElement): void {
        if (event.button !== 0 || this.handleDrag) return;
        const kind = this.parseHandleKind(element.dataset.handleKind);
        const axis = this.parseHandleAxis(element.dataset.handleAxis);
        if (!kind || !axis) return;
        const target = this.resolveHandleInput(kind, axis);
        if (!target || target.input.disabled) return;
        const startValue = Number(target.input.value.trim());
        if (!Number.isFinite(startValue)) return;
        const startEditValue = this.mode === "model"
            ? this.readModelEdit()
            : this.readCameraEdit();
        if (!startEditValue) return;

        event.preventDefault();
        element.setPointerCapture(event.pointerId);
        element.classList.add("is-dragging");
        this.isEditingValue = true;
        this.handleDrag = {
            pointerId: event.pointerId,
            element,
            mode: this.mode,
            kind,
            axis,
            startClientY: event.clientY,
            startValue,
            startEditValue,
            input: target.input,
            min: target.min,
            max: target.max,
            digits: target.digits,
            scale: target.scale,
        };
    }

    private updateHandleDrag(event: PointerEvent): void {
        const drag = this.handleDrag;
        if (!drag || drag.pointerId !== event.pointerId) return;
        event.preventDefault();
        const delta = drag.startClientY - event.clientY;
        const value = Math.max(drag.min, Math.min(drag.max, drag.startValue + delta * drag.scale));
        drag.input.value = this.formatNumber(value, drag.digits);
        this.previewCurrentHandleDragValue(drag);
    }

    private finishHandleDrag(event: PointerEvent, shouldCommit: boolean): void {
        const drag = this.handleDrag;
        if (!drag || drag.pointerId !== event.pointerId) return;
        event.preventDefault();
        this.handleDrag = null;
        drag.element.classList.remove("is-dragging");
        if (drag.element.hasPointerCapture(event.pointerId)) {
            drag.element.releasePointerCapture(event.pointerId);
        }
        if (!shouldCommit) {
            this.previewEditValue(drag.mode, drag.startEditValue);
            this.cancelActiveEdit();
            return;
        }
        this.commitActiveEdit(drag.startEditValue);
    }

    private previewCurrentHandleDragValue(drag: NonNullable<typeof this.handleDrag>): void {
        const value = drag.mode === "model"
            ? this.readModelEdit()
            : this.readCameraEdit();
        if (!value) return;
        this.previewEditValue(drag.mode, value);
    }

    private previewEditValue(
        mode: ViewportBottomBarMode,
        value: ViewportBottomBarBoneEditValue | ViewportBottomBarCameraEditValue,
    ): boolean {
        if (mode === "model") {
            return this.onPreviewBoneTransform(value as ViewportBottomBarBoneEditValue);
        }
        return this.onPreviewCameraTransform(value as ViewportBottomBarCameraEditValue);
    }

    private resolveHandleInput(
        kind: ViewportHandleKind,
        axis: ViewportHandleAxis,
    ): { input: HTMLInputElement; min: number; max: number; digits: number; scale: number } | null {
        const inputs = this.mode === "model"
            ? kind === "move"
                ? this.modelPositionInputs
                : this.modelRotationInputs
            : kind === "move"
                ? this.cameraTargetInputs
                : this.cameraRotationInputs;
        const input = inputs[axis];
        if (!input) return null;
        return kind === "move"
            ? { input, min: -30, max: 30, digits: 2, scale: 0.01 }
            : { input, min: -180, max: 180, digits: 1, scale: 0.1 };
    }

    private parseHandleKind(value: string | undefined): ViewportHandleKind | null {
        return value === "move" || value === "rotate" ? value : null;
    }

    private parseHandleAxis(value: string | undefined): ViewportHandleAxis | null {
        return value === "x" || value === "y" || value === "z" ? value : null;
    }

    private commitActiveEdit(before?: ViewportBottomBarBoneEditValue | ViewportBottomBarCameraEditValue): void {
        if (!this.isEditingValue) return;
        this.isEditingValue = false;

        const committed = this.mode === "model"
            ? this.commitModelEdit(before && "position" in before ? before : undefined)
            : this.commitCameraEdit(before && "target" in before ? before : undefined);
        if (!committed) {
            this.restoreCurrentModeInputs();
        }
    }

    private commitModelEdit(before?: ViewportBottomBarBoneEditValue): boolean {
        const value = this.readModelEdit();
        if (!value) return false;
        return this.onCommitBoneTransform(value, before);
    }

    private commitCameraEdit(before?: ViewportBottomBarCameraEditValue): boolean {
        const value = this.readCameraEdit();
        if (!value) return false;
        return this.onCommitCameraTransform(value, before);
    }

    private readModelEdit(): ViewportBottomBarBoneEditValue | null {
        if (!this.lastModelTransform) return null;
        const position = this.readVectorInputs(this.modelPositionInputs, -30, 30);
        const rotation = this.readVectorInputs(this.modelRotationInputs, -180, 180);
        if (!position || !rotation) return null;
        return { position, rotation };
    }

    private readCameraEdit(): ViewportBottomBarCameraEditValue | null {
        if (!this.lastCameraTransform) return null;
        const target = this.readVectorInputs(this.cameraTargetInputs, -30, 30);
        const rotation = this.readVectorInputs(this.cameraRotationInputs, -180, 180);
        const distance = this.readNumberInput(this.cameraDistanceInput, 0.1, 400);
        const fov = this.readNumberInput(this.cameraFovInput, 10, 120);
        if (!target || !rotation || distance === null || fov === null) return null;
        return { target, rotation, distance, fov };
    }

    private cancelActiveEdit(): void {
        this.isEditingValue = false;
        this.restoreCurrentModeInputs();
    }

    private restoreCurrentModeInputs(): void {
        if (this.mode === "model") {
            this.setVectorInputs(this.modelPositionInputs, this.lastModelTransform?.position ?? null, 2);
            this.setVectorInputs(this.modelRotationInputs, this.lastModelTransform?.rotation ?? null, 1);
            return;
        }

        const transform = this.lastCameraTransform;
        if (!transform) return;
        this.setVectorInputs(this.cameraTargetInputs, transform.target, 2);
        this.setVectorInputs(this.cameraRotationInputs, transform.rotation, 1);
        if (this.cameraDistanceInput) {
            this.cameraDistanceInput.value = this.formatNumber(transform.distance, 2);
        }
        if (this.cameraFovInput) {
            this.cameraFovInput.value = this.formatNumber(transform.fov, 1);
        }
    }

    private readVectorInputs(
        inputs: Record<"x" | "y" | "z", HTMLInputElement | null>,
        min: number,
        max: number,
    ): Vector3Like | null {
        const x = this.readNumberInput(inputs.x, min, max);
        const y = this.readNumberInput(inputs.y, min, max);
        const z = this.readNumberInput(inputs.z, min, max);
        if (x === null || y === null || z === null) return null;
        return { x, y, z };
    }

    private readNumberInput(input: HTMLInputElement | null, min: number, max: number): number | null {
        if (!input || input.disabled) return null;
        const value = Number(input.value.trim());
        if (!Number.isFinite(value)) return null;
        return Math.max(min, Math.min(max, value));
    }

    private cycleAxisSpaceMode(): void {
        this.axisSpaceMode = this.axisSpaceMode === "local"
            ? "global"
            : this.axisSpaceMode === "global"
                ? "accessory"
                : "local";
        this.refreshAxisSpaceButton();
    }

    private refreshAxisSpaceButton(): void {
        if (!this.axisSpaceButton) return;
        const key = this.axisSpaceMode === "local"
            ? "viewportBottomBar.local"
            : this.axisSpaceMode === "global"
                ? "viewportBottomBar.global"
                : "viewportBottomBar.accessory";
        const label = t(key);
        this.axisSpaceButton.textContent = label;
        this.axisSpaceButton.setAttribute("aria-label", label);
        this.axisSpaceButton.setAttribute("data-axis-space-mode", this.axisSpaceMode);
    }

    private setVectorInputs(inputs: Record<"x" | "y" | "z", HTMLInputElement | null>, value: Vector3Like | null, digits = 2): void {
        if (inputs.x) inputs.x.value = value ? this.formatNumber(value.x, digits) : "";
        if (inputs.y) inputs.y.value = value ? this.formatNumber(value.y, digits) : "";
        if (inputs.z) inputs.z.value = value ? this.formatNumber(value.z, digits) : "";
    }

    private setInputsDisabled(inputs: Record<"x" | "y" | "z", HTMLInputElement | null>, disabled: boolean): void {
        if (inputs.x) inputs.x.disabled = disabled;
        if (inputs.y) inputs.y.disabled = disabled;
        if (inputs.z) inputs.z.disabled = disabled;
    }

    private formatNumber(value: number, digits: number): string {
        if (!Number.isFinite(value)) return "";
        const rounded = Number(value.toFixed(digits));
        return Object.is(rounded, -0) ? "0" : String(rounded);
    }
}
