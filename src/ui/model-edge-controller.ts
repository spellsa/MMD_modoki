import type { MmdManager } from "../mmd-manager";
import type { EditorAction } from "../actions/types";

type ModelEdgeElements = {
    staticInput: HTMLInputElement | null;
    staticValue: HTMLElement | null;
};

export type ModelEdgeControllerDeps = {
    mmdManager: MmdManager;
    syncRangeNumberInput: (slider: HTMLInputElement) => void;
    dispatchAction?: (action: EditorAction) => boolean;
};

function resolveModelEdgeElements(): ModelEdgeElements {
    return {
        staticInput: document.getElementById("effect-edge-width") as HTMLInputElement | null,
        staticValue: document.getElementById("effect-edge-width-val"),
    };
}

function queryPanelElements(root: ParentNode): {
    input: HTMLInputElement | null;
    value: HTMLElement | null;
} {
    return {
        input: root.querySelector<HTMLInputElement>('input[data-postfx="edge-width"]'),
        value: root.querySelector<HTMLElement>('span[data-postfx-val="edge-width"]'),
    };
}

export class ModelEdgeController {
    private readonly elements: ModelEdgeElements;
    private readonly mmdManager: MmdManager;
    private readonly syncRangeNumberInput: (slider: HTMLInputElement) => void;
    private readonly dispatchAction: ((action: EditorAction) => boolean) | null;

    constructor(deps: ModelEdgeControllerDeps) {
        this.elements = resolveModelEdgeElements();
        this.mmdManager = deps.mmdManager;
        this.syncRangeNumberInput = deps.syncRangeNumberInput;
        this.dispatchAction = deps.dispatchAction ?? null;

        this.setupStaticControls();
    }

    public connect(root: ParentNode): boolean {
        const elements = queryPanelElements(root);
        if (!elements.input || !elements.value) {
            return false;
        }

        const applyEdgeWidth = (): void => {
            const percent = Number(elements.input.value);
            if (!this.dispatchAction?.({ type: "effect.setModelEdgeWidth", source: "panel", percent })) {
                this.setModelEdgeWidthPercent(percent);
            }
            this.refreshPanelValue(elements.input, elements.value);
            this.refreshStaticControls();
        };

        this.refreshPanelValue(elements.input, elements.value);
        elements.input.addEventListener("input", applyEdgeWidth);
        return true;
    }

    public refresh(): void {
        this.refreshStaticControls();

        const panelElements = queryPanelElements(document);
        if (panelElements.input && panelElements.value) {
            this.refreshPanelValue(panelElements.input, panelElements.value);
        }
    }

    private setupStaticControls(): void {
        const input = this.elements.staticInput;
        const value = this.elements.staticValue;
        if (!input || !value) {
            return;
        }

        input.addEventListener("input", () => {
            const percent = Number(input.value);
            if (!this.dispatchAction?.({ type: "effect.setModelEdgeWidth", source: "panel", percent })) {
                this.setModelEdgeWidthPercent(percent);
            }
            this.refreshStaticControls();

            const panelElements = queryPanelElements(document);
            if (panelElements.input && panelElements.value) {
                this.refreshPanelValue(panelElements.input, panelElements.value);
            }
        });
        this.refreshStaticControls();
    }

    public setModelEdgeWidthPercent(percent: number): void {
        const normalized = Number.isFinite(percent) ? percent : 100;
        this.mmdManager.modelEdgeWidth = normalized / 100;
    }

    private refreshStaticControls(): void {
        if (!this.elements.staticInput || !this.elements.staticValue) {
            return;
        }
        this.refreshPanelValue(this.elements.staticInput, this.elements.staticValue);
    }

    private refreshPanelValue(input: HTMLInputElement, value: HTMLElement): void {
        const edgePercent = Math.round(this.mmdManager.modelEdgeWidth * 100);
        input.value = String(edgePercent);
        value.textContent = `${edgePercent}%`;
        this.syncRangeNumberInput(input);
    }
}
