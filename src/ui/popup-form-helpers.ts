export function createPopupFormField(labelText: string, control: HTMLElement | null, tagName: "label" | "div" = "label"): HTMLElement {
    const field = document.createElement(tagName);
    field.className = "popup-form-field";

    const label = document.createElement("span");
    label.className = "popup-form-label";
    label.textContent = labelText;
    field.appendChild(label);

    if (control) field.appendChild(control);
    return field;
}

export function createPopupFormInline(
    startControl: HTMLElement | null,
    separatorText: string,
    endControl: HTMLElement | null
): HTMLElement {
    const row = document.createElement("div");
    row.className = "popup-form-inline";

    if (startControl) row.appendChild(startControl);
    const separator = document.createElement("span");
    separator.className = "popup-form-separator";
    separator.textContent = separatorText;
    row.appendChild(separator);
    if (endControl) row.appendChild(endControl);

    return row;
}

export function createPopupFormButton(labelText: string, variant: "primary" | "secondary"): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `popup-form-button popup-form-button-${variant}`;
    button.textContent = labelText;
    return button;
}

export function createPopupFormValueText(text = ""): HTMLSpanElement {
    const value = document.createElement("span");
    value.className = "popup-form-value";
    value.textContent = text;
    return value;
}

export function createPopupFormRange(input: HTMLInputElement, value: HTMLElement): HTMLElement {
    const row = document.createElement("div");
    row.className = "popup-form-range-row";
    row.append(input, value);
    return row;
}

export function createPopupFormButtonRow(buttons: readonly HTMLButtonElement[]): HTMLElement {
    const row = document.createElement("div");
    row.className = "popup-form-button-row";
    buttons.forEach((button) => row.appendChild(button));
    return row;
}
