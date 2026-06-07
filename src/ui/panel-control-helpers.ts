export type PanelNumberFieldOptions = {
    key: string;
    id?: string;
    label: string;
    min: number;
    max: number;
    step: number;
    value: string;
    disabled?: boolean;
    legacyRowClass?: string;
    legacyLabelClass?: string;
    legacyInputClass?: string;
};

export type PanelNumberField = {
    row: HTMLLabelElement;
    label: HTMLSpanElement;
    input: HTMLInputElement;
};

export type PanelNumberGrid = {
    element: HTMLDivElement;
    inputs: Map<string, HTMLInputElement>;
};

const panelClasses = {
    emptyState: [
        "flex",
        "min-h-16",
        "items-center",
        "justify-center",
        "rounded",
        "border",
        "border-dashed",
        "border-zinc-800",
        "bg-zinc-950/20",
        "px-2",
        "py-3",
        "text-center",
        "text-xs",
        "leading-snug",
        "text-zinc-500",
    ].join(" "),
    numberGrid: [
        "grid",
        "grid-cols-3",
        "content-start",
        "gap-x-2",
        "gap-y-1.5",
    ].join(" "),
    numberRow: [
        "grid",
        "grid-cols-[1.65rem_minmax(0,1fr)]",
        "items-center",
        "gap-1",
        "min-w-0",
    ].join(" "),
    numberLabel: [
        "truncate",
        "text-[11px]",
        "font-semibold",
        "leading-none",
        "text-zinc-400",
    ].join(" "),
    numberInput: [
        "h-6",
        "min-w-0",
        "rounded",
        "border",
        "border-zinc-700",
        "bg-zinc-950/80",
        "px-1",
        "text-right",
        "text-[11px]",
        "font-semibold",
        "tabular-nums",
        "text-zinc-100",
        "outline-none",
        "transition",
        "focus:border-sky-500",
        "focus:ring-1",
        "focus:ring-sky-500/50",
        "disabled:border-zinc-800",
        "disabled:bg-zinc-950/40",
        "disabled:text-zinc-600",
    ].join(" "),
    morphCategoryGrid: [
        "grid",
        "grid-cols-2",
        "gap-2",
        "min-h-0",
    ].join(" "),
    morphCategoryCard: [
        "min-h-0",
        "overflow-hidden",
        "rounded",
        "border",
        "border-zinc-800",
        "bg-zinc-950/25",
    ].join(" "),
    morphCategoryHeader: [
        "border-b",
        "border-zinc-800",
        "bg-zinc-900/80",
        "px-2",
        "py-1",
        "text-xs",
        "font-semibold",
        "text-zinc-300",
    ].join(" "),
    morphCategoryBody: [
        "flex",
        "max-h-28",
        "min-h-0",
        "flex-col",
        "gap-1",
        "overflow-y-auto",
        "p-1.5",
    ].join(" "),
    morphCategoryEmpty: [
        "px-1",
        "py-2",
        "text-center",
        "text-xs",
        "text-zinc-600",
    ].join(" "),
    sliderRow: [
        "grid",
        "grid-cols-[minmax(0,3.4rem)_minmax(0,1fr)_2.5rem]",
        "items-center",
        "gap-1.5",
        "min-w-0",
    ].join(" "),
    sliderLabel: [
        "truncate",
        "text-xs",
        "text-zinc-300",
    ].join(" "),
    sliderValue: [
        "text-right",
        "text-[11px]",
        "tabular-nums",
        "text-zinc-400",
    ].join(" "),
    actionButton: [
        "min-w-0",
        "rounded",
        "border",
        "border-zinc-800",
        "bg-zinc-950/50",
        "px-2",
        "py-1",
        "text-xs",
        "font-semibold",
        "leading-tight",
        "text-zinc-300",
        "transition",
        "hover:border-zinc-600",
        "hover:bg-zinc-900/80",
        "focus:outline-none",
        "focus:ring-1",
        "focus:ring-sky-500/50",
        "disabled:border-zinc-900",
        "disabled:bg-zinc-950/25",
        "disabled:text-zinc-600",
    ].join(" "),
    actionButtonDanger: [
        "text-red-200",
        "hover:border-red-700/70",
        "hover:bg-red-950/30",
        "disabled:text-zinc-600",
    ].join(" "),
    primaryButton: [
        "border-sky-700/70",
        "bg-sky-950/40",
        "text-sky-100",
        "hover:border-sky-500/80",
        "hover:bg-sky-900/45",
    ].join(" "),
    compactSelect: [
        "h-7",
        "min-w-0",
        "rounded",
        "border",
        "border-zinc-800",
        "bg-zinc-950/70",
        "px-2",
        "text-xs",
        "font-semibold",
        "text-zinc-200",
        "outline-none",
        "transition",
        "focus:border-sky-500",
        "focus:ring-1",
        "focus:ring-sky-500/50",
        "disabled:border-zinc-900",
        "disabled:bg-zinc-950/30",
        "disabled:text-zinc-600",
    ].join(" "),
    compactCheckbox: [
        "h-4",
        "w-4",
        "rounded",
        "border",
        "border-zinc-700",
        "accent-sky-500",
    ].join(" "),
    panelLabel: [
        "text-xs",
        "font-semibold",
        "text-zinc-400",
    ].join(" "),
};

function mergeClasses(...classes: Array<string | undefined>): string {
    return classes.filter(Boolean).join(" ");
}

function appendClasses(element: Element | null, classes: string): void {
    if (!element) return;
    for (const className of classes.split(/\s+/)) {
        if (className) element.classList.add(className);
    }
}

export function createPanelEmptyState(text: string): HTMLElement {
    const element = document.createElement("div");
    element.className = mergeClasses("panel-empty-state", panelClasses.emptyState);
    element.textContent = text;
    return element;
}

export function setPanelEmptyState(container: HTMLElement, text: string): void {
    container.replaceChildren(createPanelEmptyState(text));
}

export function createPanelNumberGrid(fields: readonly PanelNumberFieldOptions[], legacyClass = ""): PanelNumberGrid {
    const grid = document.createElement("div");
    grid.className = mergeClasses(legacyClass, panelClasses.numberGrid);
    const inputs = new Map<string, HTMLInputElement>();

    for (const field of fields) {
        const rendered = createPanelNumberField(field);
        grid.appendChild(rendered.row);
        inputs.set(field.key, rendered.input);
    }

    return { element: grid, inputs };
}

export function createPanelNumberField(options: PanelNumberFieldOptions): PanelNumberField {
    const row = document.createElement("label");
    row.className = mergeClasses(options.legacyRowClass, panelClasses.numberRow);

    const label = document.createElement("span");
    label.className = mergeClasses(options.legacyLabelClass, panelClasses.numberLabel);
    label.textContent = options.label;

    const input = document.createElement("input");
    if (options.id) input.id = options.id;
    input.type = "number";
    input.min = String(options.min);
    input.max = String(options.max);
    input.step = String(options.step);
    input.value = options.value;
    input.disabled = options.disabled ?? false;
    input.className = mergeClasses(options.legacyInputClass, panelClasses.numberInput);

    row.append(label, input);
    return { row, label, input };
}

export function createPanelMorphCategoryGrid(legacyClass = ""): HTMLDivElement {
    const grid = document.createElement("div");
    grid.className = mergeClasses(legacyClass, panelClasses.morphCategoryGrid);
    return grid;
}

export function applyPanelMorphCategoryGridClasses(element: HTMLElement, baseClass: string, legacyClass = ""): void {
    element.className = mergeClasses(baseClass, legacyClass, panelClasses.morphCategoryGrid);
}

export function createPanelMorphCategory(labelText: string, legacyClasses?: {
    card?: string;
    header?: string;
    body?: string;
}): { card: HTMLDivElement; body: HTMLDivElement } {
    const card = document.createElement("div");
    card.className = mergeClasses(legacyClasses?.card, panelClasses.morphCategoryCard);

    const header = document.createElement("div");
    header.className = mergeClasses(legacyClasses?.header, panelClasses.morphCategoryHeader);
    header.textContent = labelText;
    card.appendChild(header);

    const body = document.createElement("div");
    body.className = mergeClasses(legacyClasses?.body, panelClasses.morphCategoryBody);
    card.appendChild(body);

    return { card, body };
}

export function createPanelCategoryEmpty(text = "-"): HTMLElement {
    const empty = document.createElement("div");
    empty.className = mergeClasses("morph-category-empty", panelClasses.morphCategoryEmpty);
    empty.textContent = text;
    return empty;
}

export function createPanelSliderValueRow(options: {
    label: string;
    slider: HTMLInputElement;
    valueText: string;
    legacyRowClass?: string;
    legacySliderClass?: string;
    legacyValueClass?: string;
}): { row: HTMLDivElement; label: HTMLLabelElement; value: HTMLSpanElement } {
    const row = document.createElement("div");
    row.className = mergeClasses(options.legacyRowClass, panelClasses.sliderRow);

    const label = document.createElement("label");
    label.className = panelClasses.sliderLabel;
    label.textContent = options.label;
    label.title = options.label;

    options.slider.className = mergeClasses(options.legacySliderClass, options.slider.className);

    const value = document.createElement("span");
    value.className = mergeClasses(options.legacyValueClass, panelClasses.sliderValue);
    value.textContent = options.valueText;

    row.append(label, options.slider, value);
    return { row, label, value };
}

export function applyPanelActionButtonClasses(button: HTMLButtonElement): void {
    appendClasses(button, panelClasses.actionButton);
    if (button.classList.contains("info-action-btn--danger")) {
        appendClasses(button, panelClasses.actionButtonDanger);
    }
    if (button.classList.contains("playback-export-btn")) {
        appendClasses(button, panelClasses.primaryButton);
    }
}

export function applyPanelSelectClasses(select: HTMLSelectElement): void {
    appendClasses(select, panelClasses.compactSelect);
}

export function applyPanelCheckboxClasses(checkbox: HTMLInputElement): void {
    appendClasses(checkbox, panelClasses.compactCheckbox);
}

export function enhanceBottomPanelControls(root: ParentNode = document): void {
    const bottomPanel = root.querySelector<HTMLElement>("#bottom-panel");
    if (!bottomPanel) return;

    bottomPanel.querySelectorAll<HTMLButtonElement>(
        ".info-action-btn, .info-mini-btn, .operation-mode-btn, .playback-export-btn, .camera-view-btn",
    ).forEach(applyPanelActionButtonClasses);

    bottomPanel.querySelectorAll<HTMLSelectElement>(
        "select.info-model-select, select.info-mini-select, select.interp-type-select, select.panel-select",
    ).forEach(applyPanelSelectClasses);

    bottomPanel.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(applyPanelCheckboxClasses);

    bottomPanel.querySelectorAll<HTMLElement>(
        ".info-label, .info-mini-label, .panel-select-label, .interpolation-side-label, .light-label",
    ).forEach((label) => appendClasses(label, panelClasses.panelLabel));

    bottomPanel.querySelectorAll<HTMLElement>(".panel-empty-state").forEach((empty) => {
        appendClasses(empty, panelClasses.emptyState);
    });

    bottomPanel.querySelectorAll<HTMLElement>(".light-row").forEach((row) => {
        appendClasses(row, panelClasses.sliderRow);
    });
    bottomPanel.querySelectorAll<HTMLElement>(".light-value").forEach((value) => {
        appendClasses(value, panelClasses.sliderValue);
    });
}
