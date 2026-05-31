export type BottomPanelMode = "model" | "camera";

type BottomPanelSectionId =
    | "info"
    | "interpolation"
    | "boneOperation"
    | "bone"
    | "morph"
    | "camera"
    | "lighting"
    | "shadow"
    | "accessory";

const MODE_SECTIONS: Record<BottomPanelMode, BottomPanelSectionId[]> = {
    model: ["info", "interpolation", "boneOperation", "bone", "morph", "camera"],
    camera: ["info", "interpolation", "bone", "lighting", "shadow", "accessory", "camera"],
};

const MODE_GRID_TEMPLATES: Record<BottomPanelMode, string> = {
    model: [
        "minmax(0, 1.05fr)",
        "minmax(0, 1fr)",
        "minmax(0, 1.12fr)",
        "minmax(0, 1.28fr)",
        "minmax(0, 2fr)",
        "minmax(0, 0.92fr)",
    ].join(" "),
    camera: [
        "minmax(0, 0.9fr)",
        "minmax(0, 0.9fr)",
        "minmax(0, 1.3fr)",
        "minmax(0, 1.2fr)",
        "minmax(0, 1.2fr)",
        "minmax(0, 1.25fr)",
        "minmax(0, 0.78fr)",
    ].join(" "),
};

export class BottomPanelLayoutController {
    private readonly root: HTMLElement | null;
    private readonly sections: Record<BottomPanelSectionId, HTMLElement | null>;
    private mode: BottomPanelMode = "camera";

    constructor() {
        this.root = document.querySelector<HTMLElement>(".bottom-panel-inner");
        this.sections = {
            info: document.getElementById("info-section"),
            interpolation: document.getElementById("interpolation-section"),
            boneOperation: document.getElementById("bone-operation-section"),
            bone: document.getElementById("bone-section"),
            morph: document.getElementById("morph-section"),
            camera: document.getElementById("camera-section"),
            lighting: document.getElementById("lighting-section"),
            shadow: document.getElementById("shadow-section"),
            accessory: document.getElementById("accessory-section"),
        };
    }

    public applyMode(mode: BottomPanelMode): void {
        this.mode = mode;
        const visibleSections = MODE_SECTIONS[mode];
        const visibleSet = new Set<BottomPanelSectionId>(visibleSections);

        this.root?.setAttribute("data-bottom-panel-mode", mode);
        this.root?.style.setProperty("--bottom-panel-section-count", String(visibleSections.length));
        this.root?.style.setProperty("--bottom-panel-grid-template", MODE_GRID_TEMPLATES[mode]);

        Object.entries(this.sections).forEach(([sectionId, section]) => {
            if (!section) return;
            const id = sectionId as BottomPanelSectionId;
            const visible = visibleSet.has(id);
            section.hidden = !visible;
            if (visible) {
                section.style.order = String(visibleSections.indexOf(id) + 1);
            } else {
                section.style.removeProperty("order");
            }
        });
    }

    public getMode(): BottomPanelMode {
        return this.mode;
    }
}
