import { t } from "./i18n";
import type { MmdManager } from "./mmd-manager";
import type { BoneControlInfo, ModelInfo, MorphDisplayFrameInfo } from "./types";

type BoneSliderKey = "tx" | "ty" | "tz" | "rx" | "ry" | "rz" | "camDistance" | "camFov";
type BonePoseSnapshot = {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    target?: { x: number; y: number; z: number };
    distance?: number;
    fov?: number;
};

export class BottomPanel {
    private static readonly CAMERA_CONTROL_NAME = "Camera";
    private boneSelectionSummary: HTMLElement | null;
    private boneContainer: HTMLElement;
    private morphContainer: HTMLElement;
    private boneSliders: Map<BoneSliderKey, HTMLInputElement> = new Map();
    private boneSliderValues: Map<BoneSliderKey, HTMLElement> = new Map();
    private morphSliders: Map<string, HTMLInputElement> = new Map();
    private morphFrames: MorphDisplayFrameInfo[] = [];
    private boneControlMap: Map<string, BoneControlInfo> = new Map();
    private boneNames: Set<string> = new Set();
    private activeSliderInteractions: WeakSet<HTMLInputElement> = new WeakSet();
    private currentBoneName: string | null = null;
    private currentMorphFrameIndex: number | null = null;
    private mmdManager: MmdManager | null = null;
    public onBoneSelectionChanged: ((boneName: string | null) => void) | null = null;
    public onMorphFrameSelectionChanged: ((frameIndex: number | null) => void) | null = null;
    public onBoneTransformEditStarted: ((boneName: string | null) => void) | null = null;
    public onBoneTransformEdited: ((boneName: string | null) => void) | null = null;
    public onBoneTransformEditCommitted: ((boneName: string | null) => void) | null = null;
    public onMorphValueEdited: ((frameIndex: number | null) => void) | null = null;
    public onRangeInputsRendered: ((root: ParentNode) => void) | null = null;
    public onRangeSliderSynced: ((slider: HTMLInputElement) => void) | null = null;

    constructor() {
        this.boneSelectionSummary = document.getElementById("bone-selection-summary");
        this.boneContainer = document.getElementById("bone-controls") as HTMLElement;
        this.morphContainer = document.getElementById("morph-controls") as HTMLElement;
    }

    setMmdManager(manager: MmdManager): void {
        this.mmdManager = manager;
    }

    updateBoneControls(info: ModelInfo): void {
        const previousBoneName = this.currentBoneName;
        this.boneSliders.clear();
        this.boneSliderValues.clear();
        this.boneControlMap.clear();
        this.boneNames = new Set(info.boneNames);

        for (const boneControlInfo of info.boneControlInfos ?? []) {
            this.boneControlMap.set(boneControlInfo.name, boneControlInfo);
        }

        if (info.boneNames.length === 0) {
            this.currentBoneName = null;
            this.updateBoneSelectionSummary();
            this.boneContainer.innerHTML = `<div class="panel-empty-state">${t("empty.noBones")}</div>`;
            return;
        }

        const preferredBoneName = previousBoneName && info.boneNames.includes(previousBoneName)
            ? previousBoneName
            : info.boneNames[0];
        this.setSelectedBone(preferredBoneName, true);
    }

    updateMorphControls(info: ModelInfo): void {
        this.morphSliders.clear();
        this.morphFrames = info.morphDisplayFrames.length > 0
            ? info.morphDisplayFrames
            : info.morphNames.length > 0
                ? [{
                    name: t("option.all"),
                    morphs: info.morphNames.map((name, index) => ({ index, name })),
                }]
                : [];

        if (this.morphFrames.length === 0) {
            this.morphContainer.classList.remove("morph-category-grid");
            this.morphContainer.innerHTML = `<div class="panel-empty-state">${t("empty.noMorphs")}</div>`;
            return;
        }

        const firstNonEmptyIndex = this.morphFrames.findIndex((frame) => frame.morphs.length > 0);
        this.currentMorphFrameIndex = firstNonEmptyIndex >= 0 ? firstNonEmptyIndex : null;
        this.renderMorphGroups();
        this.onMorphFrameSelectionChanged?.(this.currentMorphFrameIndex);
    }

    updateModelInfo(info: ModelInfo): void {
        const nameEl = document.getElementById("info-model-name");
        const verticesEl = document.getElementById("info-vertices");
        const bonesEl = document.getElementById("info-bones");
        const morphsEl = document.getElementById("info-morphs");

        if (nameEl) nameEl.textContent = info.name;
        if (verticesEl) verticesEl.textContent = info.vertexCount.toLocaleString();
        if (bonesEl) bonesEl.textContent = info.boneCount.toLocaleString();
        if (morphsEl) morphsEl.textContent = info.morphCount.toLocaleString();
    }

    clearBoneControls(): void {
        this.currentBoneName = null;
        this.boneSliders.clear();
        this.boneSliderValues.clear();
        this.boneControlMap.clear();
        this.boneNames.clear();
        this.updateBoneSelectionSummary();
        this.boneContainer.innerHTML = `<div class="panel-empty-state">${t("empty.noModel")}</div>`;
    }

    clearMorphControls(): void {
        this.morphFrames = [];
        this.morphSliders.clear();
        this.currentMorphFrameIndex = null;
        this.morphContainer.classList.remove("morph-category-grid");
        this.morphContainer.innerHTML = `<div class="panel-empty-state">${t("empty.noModel")}</div>`;
    }

    getSelectedBone(): string | null {
        return this.currentBoneName;
    }

    getSelectedMorphFrameIndex(): number | null {
        return this.currentMorphFrameIndex;
    }

    getSelectedBoneTransformSnapshot(): {
        position: { x: number; y: number; z: number };
        rotation: { x: number; y: number; z: number };
    } | null {
        if (!this.currentBoneName || this.boneSliders.size === 0) return null;

        const isCameraControl = this.currentBoneName === BottomPanel.CAMERA_CONTROL_NAME;
        if (isCameraControl) {
            const target = this.mmdManager?.getCameraTarget() ?? { x: 0, y: 0, z: 0 };
            const rotation = this.mmdManager?.getCameraRotation() ?? { x: 0, y: 0, z: 0 };
            return {
                position: {
                    x: target.x,
                    y: target.y,
                    z: target.z,
                },
                rotation: {
                    x: rotation.x,
                    y: rotation.y,
                    z: rotation.z,
                },
                target: {
                    x: target.x,
                    y: target.y,
                    z: target.z,
                },
                distance: this.mmdManager?.getCameraDistance() ?? 45,
                fov: this.mmdManager?.getCameraFov() ?? 30,
            };
        }

        return {
            position: {
                x: this.getBoneSliderNumber("tx"),
                y: this.getBoneSliderNumber("ty"),
                z: this.getBoneSliderNumber("tz"),
            },
            rotation: {
                x: this.getBoneSliderNumber("rx"),
                y: this.getBoneSliderNumber("ry"),
                z: this.getBoneSliderNumber("rz"),
            },
        };
    }

    getSelectedMorphFrameSnapshot(): { frameIndex: number; morphs: Array<{ index: number; name: string; value: number }> } | null {
        if (this.currentMorphFrameIndex === null) return null;
        const frame = this.morphFrames[this.currentMorphFrameIndex];
        if (!frame) return null;

        return {
            frameIndex: this.currentMorphFrameIndex,
            morphs: frame.morphs.map((morph) => {
                const slider = this.morphSliders.get(`${morph.index}:${morph.name}`);
                const rawValue = slider ? Number.parseFloat(slider.value) : 0;
                return {
                    index: morph.index,
                    name: morph.name,
                    value: Number.isFinite(rawValue) ? rawValue : 0,
                };
            }),
        };
    }

    syncSelectedMorphFrameSlidersFromRuntime(force = false): void {
        if (!this.mmdManager) return;

        for (const frame of this.morphFrames) {
            for (const morphInfo of frame.morphs) {
                const slider = this.morphSliders.get(`${morphInfo.index}:${morphInfo.name}`);
                if (!slider) continue;
                if (!force && this.isSliderEditing(slider)) continue;

                const rawValue = morphInfo.index >= 0
                    ? this.mmdManager.getMorphWeightByIndex(morphInfo.index)
                    : this.mmdManager.getMorphWeight(morphInfo.name);
                const normalized = Number.isFinite(rawValue) ? rawValue : 0;
                const nextValue = normalized.toFixed(2);
                if (slider.value !== nextValue) {
                    slider.value = nextValue;
                }

                const valueDisplay = slider.parentElement?.querySelector(".morph-value") as HTMLElement | null;
                if (valueDisplay) {
                    valueDisplay.textContent = nextValue;
                }
            }
        }
    }

    clearSelectedBone(forceRender = false): boolean {
        const selectionChanged = this.currentBoneName !== null;
        this.currentBoneName = null;
        this.updateBoneSelectionSummary();
        if (forceRender || selectionChanged) {
            this.renderSelectedBone();
        }
        return selectionChanged;
    }

    setSelectedBone(boneName: string | null, forceRender = false): boolean {
        if (!boneName) {
            return this.clearSelectedBone(forceRender);
        }
        if (!this.boneNames.has(boneName)) return false;

        const selectionChanged = this.currentBoneName !== boneName;
        this.currentBoneName = boneName;
        this.updateBoneSelectionSummary();
        if (forceRender || selectionChanged) {
            this.renderSelectedBone();
        }
        return true;
    }

    private renderSelectedBone(): void {
        this.boneContainer.innerHTML = "";
        this.boneSliders.clear();
        this.boneSliderValues.clear();

        if (!this.currentBoneName) {
            this.boneContainer.innerHTML = `<div class="panel-empty-state">${t("empty.noBoneSelected")}</div>`;
            return;
        }

        const isCameraControl = this.currentBoneName === BottomPanel.CAMERA_CONTROL_NAME;
        const transform = isCameraControl
            ? {
                position: this.mmdManager?.getCameraTarget() ?? { x: 0, y: 0, z: 0 },
                rotation: this.mmdManager?.getCameraRotation() ?? { x: 0, y: 0, z: 0 },
            }
            : this.mmdManager?.getBoneTransform(this.currentBoneName) ?? {
                position: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
            };
        const boneControlInfo = isCameraControl
            ? {
                name: this.currentBoneName,
                movable: true,
                rotatable: true,
            }
            : this.boneControlMap.get(this.currentBoneName) ?? {
                name: this.currentBoneName,
                movable: true,
                rotatable: true,
            };

        const sliderDefs: {
            key: BoneSliderKey;
            label: string;
            min: number;
            max: number;
            step: number;
            value: number;
        }[] = [];

        if (boneControlInfo.movable) {
            sliderDefs.push(
                { key: "tx", label: t("slider.posX"), min: -30, max: 30, step: 0.01, value: transform.position.x },
                { key: "ty", label: t("slider.posY"), min: -30, max: 30, step: 0.01, value: transform.position.y },
                { key: "tz", label: t("slider.posZ"), min: -30, max: 30, step: 0.01, value: transform.position.z },
            );
        }
        if (boneControlInfo.rotatable) {
            sliderDefs.push(
                { key: "rx", label: t("slider.rotX"), min: -180, max: 180, step: 0.1, value: transform.rotation.x },
                { key: "ry", label: t("slider.rotY"), min: -180, max: 180, step: 0.1, value: transform.rotation.y },
                { key: "rz", label: t("slider.rotZ"), min: -180, max: 180, step: 0.1, value: transform.rotation.z },
            );
        }
        if (isCameraControl) {
            sliderDefs.push(
                { key: "camDistance", label: t("slider.distance"), min: 0.1, max: 400, step: 0.1, value: this.mmdManager?.getCameraDistance() ?? 45 },
                { key: "camFov", label: t("slider.fov"), min: 10, max: 120, step: 0.1, value: this.mmdManager?.getCameraFov() ?? 30 },
            );
        }

        if (sliderDefs.length === 0) {
            this.boneContainer.innerHTML = `<div class="panel-empty-state">${t("empty.noEditableChannels")}</div>`;
            return;
        }

        for (const def of sliderDefs) {
            const row = document.createElement("div");
            row.className = "bone-slider-row";

            const label = document.createElement("label");
            label.className = "bone-slider-label";
            label.textContent = def.label;

            const slider = document.createElement("input");
            slider.type = "range";
            slider.min = String(def.min);
            slider.max = String(def.max);
            slider.step = String(def.step);
            slider.value = this.clamp(def.value, def.min, def.max).toFixed(def.step < 1 ? 2 : 0);
            slider.className = "bone-slider";

            const beginSliderInteraction = (): void => {
                this.activeSliderInteractions.add(slider);
                this.onBoneTransformEditStarted?.(this.currentBoneName);
            };
            const endSliderInteraction = (): void => {
                this.activeSliderInteractions.delete(slider);
                this.onBoneTransformEditCommitted?.(this.currentBoneName);
            };
            slider.addEventListener("pointerdown", beginSliderInteraction);
            slider.addEventListener("pointerup", endSliderInteraction);
            slider.addEventListener("pointercancel", endSliderInteraction);
            slider.addEventListener("blur", endSliderInteraction);

            const valueDisplay = document.createElement("span");
            valueDisplay.className = "bone-slider-value";
            valueDisplay.textContent = this.formatSliderValue(Number(slider.value), def.step);

            slider.addEventListener("input", () => {
                const value = Number(slider.value);
                valueDisplay.textContent = this.formatSliderValue(value, def.step);
                this.applyBoneTransformFromSliders();
                if (this.currentBoneName) {
                    this.onBoneTransformEdited?.(this.currentBoneName);
                }
            });
            slider.addEventListener("change", endSliderInteraction);

            this.boneSliders.set(def.key, slider);
            this.boneSliderValues.set(def.key, valueDisplay);

            row.appendChild(label);
            row.appendChild(slider);
            row.appendChild(valueDisplay);
            this.boneContainer.appendChild(row);
        }

        this.onRangeInputsRendered?.(this.boneContainer);
    }

    private updateBoneSelectionSummary(): void {
        if (!this.boneSelectionSummary) return;
        this.boneSelectionSummary.textContent = this.currentBoneName ?? "-";
        this.boneSelectionSummary.title = this.currentBoneName ?? "";
    }

    syncSelectedBoneSlidersFromRuntime(force = false): void {
        if (!this.mmdManager || !this.currentBoneName) return;
        if (this.boneSliders.size === 0) return;

        if (this.currentBoneName === BottomPanel.CAMERA_CONTROL_NAME) {
            this.syncSelectedBoneSlidersFromSnapshot({
                position: this.mmdManager.getCameraTarget(),
                rotation: this.mmdManager.getCameraRotation(),
                target: this.mmdManager.getCameraTarget(),
                distance: this.mmdManager.getCameraDistance(),
                fov: this.mmdManager.getCameraFov(),
            }, force);
            return;
        }

        const transform = this.mmdManager.getAnimatedBoneTransform?.(this.currentBoneName)
            ?? this.mmdManager.getBoneTransform(this.currentBoneName);
        if (!transform) return;

        this.syncSelectedBoneSlidersFromSnapshot(transform, force);
    }

    syncSelectedBoneSlidersFromSnapshot(snapshot: BonePoseSnapshot | null, force = false): void {
        if (!this.mmdManager || !this.currentBoneName) return;
        if (this.boneSliders.size === 0) return;
        if (!snapshot) return;
        this.syncSelectedBoneSlidersFromSnapshotValues(snapshot, force);
    }

    private syncSelectedBoneSlidersFromSnapshotValues(snapshot: BonePoseSnapshot, force = false): void {
        const updateSlider = (key: BoneSliderKey, rawValue: number): void => {
            const slider = this.boneSliders.get(key);
            if (!slider) return;
            if (!force && this.isSliderEditing(slider)) return;

            const min = Number.parseFloat(slider.min);
            const max = Number.parseFloat(slider.max);
            const step = Number.parseFloat(slider.step || "1");
            const safeValue = this.clamp(
                rawValue,
                Number.isFinite(min) ? min : rawValue,
                Number.isFinite(max) ? max : rawValue,
            );
            const digits = step < 1 ? 2 : 0;
            const nextValue = safeValue.toFixed(digits);
            if (slider.value !== nextValue) {
                slider.value = nextValue;
            }

            const valueEl = this.boneSliderValues.get(key);
            if (valueEl) {
                valueEl.textContent = this.formatSliderValue(Number(nextValue), step);
            }
            this.onRangeSliderSynced?.(slider);
        };

        const cameraTranslation = this.currentBoneName === BottomPanel.CAMERA_CONTROL_NAME
            ? snapshot.target ?? snapshot.position
            : snapshot.position;
        updateSlider("tx", cameraTranslation.x);
        updateSlider("ty", cameraTranslation.y);
        updateSlider("tz", cameraTranslation.z);
        updateSlider("rx", snapshot.rotation.x);
        updateSlider("ry", snapshot.rotation.y);
        updateSlider("rz", snapshot.rotation.z);
        if (typeof snapshot.distance === "number") {
            updateSlider("camDistance", snapshot.distance);
        }
        if (typeof snapshot.fov === "number") {
            updateSlider("camFov", snapshot.fov);
        }
    }

    private applyBoneTransformFromSliders(): void {
        if (!this.mmdManager || !this.currentBoneName) return;
        if (this.currentBoneName === BottomPanel.CAMERA_CONTROL_NAME) {
            const tx = this.getBoneSliderNumber("tx");
            const ty = this.getBoneSliderNumber("ty");
            const tz = this.getBoneSliderNumber("tz");
            const rx = this.getBoneSliderNumber("rx");
            const ry = this.getBoneSliderNumber("ry");
            const rz = this.getBoneSliderNumber("rz");
            const distance = this.getBoneSliderNumber("camDistance");
            const fov = this.getBoneSliderNumber("camFov");
            this.mmdManager.setCameraTarget(tx, ty, tz);
            this.mmdManager.setCameraRotation(rx, ry, rz);
            this.mmdManager.setCameraDistance(distance);
            this.mmdManager.setCameraFov(fov);
            return;
        }

        const boneControlInfo = this.boneControlMap.get(this.currentBoneName) ?? {
            name: this.currentBoneName,
            movable: true,
            rotatable: true,
        };

        if (boneControlInfo.movable) {
            const tx = this.getBoneSliderNumber("tx");
            const ty = this.getBoneSliderNumber("ty");
            const tz = this.getBoneSliderNumber("tz");
            this.mmdManager.setBoneTranslation(this.currentBoneName, tx, ty, tz);
        }

        if (boneControlInfo.rotatable) {
            const rx = this.getBoneSliderNumber("rx");
            const ry = this.getBoneSliderNumber("ry");
            const rz = this.getBoneSliderNumber("rz");
            this.mmdManager.setBoneRotation(this.currentBoneName, rx, ry, rz);
        }
    }

    private getBoneSliderNumber(key: BoneSliderKey): number {
        const slider = this.boneSliders.get(key);
        if (!slider) return 0;
        const value = Number.parseFloat(slider.value);
        return Number.isFinite(value) ? value : 0;
    }

    private renderMorphGroups(): void {
        this.morphContainer.innerHTML = "";
        this.morphSliders.clear();
        this.morphContainer.classList.remove("morph-category-grid");

        const groups = this.buildMorphGroups();
        const hasMorphs = groups.some((group) => group.morphs.length > 0);
        if (!hasMorphs) {
            this.morphContainer.innerHTML = `<div class="panel-empty-state">${t("empty.noMorphs")}</div>`;
            return;
        }

        this.morphContainer.classList.add("morph-category-grid");
        for (const group of groups) {
            const card = document.createElement("div");
            card.className = "morph-category-card";

            const header = document.createElement("div");
            header.className = "morph-category-header";
            header.textContent = group.label;
            card.appendChild(header);

            const body = document.createElement("div");
            body.className = "morph-category-body";
            if (group.morphs.length === 0) {
                const empty = document.createElement("div");
                empty.className = "morph-category-empty";
                empty.textContent = "-";
                body.appendChild(empty);
            }

            for (const morphInfo of group.morphs) {
                body.appendChild(this.createMorphSliderRow(morphInfo));
            }

            card.appendChild(body);
            this.morphContainer.appendChild(card);
        }

        this.onRangeInputsRendered?.(this.morphContainer);
    }

    private buildMorphGroups(): Array<{
        key: "eye" | "lip" | "brow" | "other";
        label: string;
        morphs: Array<{ frameIndex: number; index: number; name: string }>;
    }> {
        const groups: Array<{
            key: "eye" | "lip" | "brow" | "other";
            label: string;
            morphs: Array<{ frameIndex: number; index: number; name: string }>;
        }> = [
            { key: "eye", label: t("morph.category.eye"), morphs: [] },
            { key: "lip", label: t("morph.category.lip"), morphs: [] },
            { key: "brow", label: t("morph.category.brow"), morphs: [] },
            { key: "other", label: t("morph.category.other"), morphs: [] },
        ];

        this.morphFrames.forEach((frame, frameIndex) => {
            for (const morph of frame.morphs) {
                const key = this.classifyMorphFrame(morph.name);
                const group = groups.find((candidate) => candidate.key === key) ?? groups[3];
                group.morphs.push({ frameIndex, index: morph.index, name: morph.name });
            }
        });
        return groups;
    }

    private classifyMorphFrame(name: string): "eye" | "lip" | "brow" | "other" {
        const normalized = name.toLowerCase();
        if (/[\u76ee\u773c\u77b3]|\u307e\u3070\u305f\u304d|\u30a6\u30a3\u30f3\u30af|\u7b11\u3044/.test(name)
            || normalized.includes("eye")
            || normalized.includes("wink")) {
            return "eye";
        }
        if (/[\u7709]|\u56f0\u308b|\u6012\u308a|\u306b\u3053\u308a/.test(name)
            || normalized.includes("brow")
            || normalized.includes("eyebrow")) {
            return "brow";
        }
        if (/[\u53e3\u5507]|\u30ea\u30c3\u30d7|^[\u3042\u3044\u3046\u3048\u304a]$/.test(name)
            || normalized.includes("lip")
            || normalized.includes("mouth")) {
            return "lip";
        }
        return "other";
    }

    private createMorphSliderRow(morphInfo: { frameIndex: number; index: number; name: string }): HTMLElement {
        const morphName = morphInfo.name;
        const morphIndex = morphInfo.index;
        const row = document.createElement("div");
        row.className = "morph-slider-row";

        const label = document.createElement("label");
        label.textContent = morphName;
        label.title = morphName;

        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = "0";
        slider.max = "1";
        slider.step = "0.01";
        slider.className = "morph-slider";
        slider.value = this.mmdManager
            ? (morphIndex >= 0
                ? this.mmdManager.getMorphWeightByIndex(morphIndex).toFixed(2)
                : this.mmdManager.getMorphWeight(morphName).toFixed(2))
            : "0";

        const valueDisplay = document.createElement("span");
        valueDisplay.className = "morph-value";
        valueDisplay.textContent = Number(slider.value).toFixed(2);

        slider.addEventListener("input", () => {
            const val = Number.parseFloat(slider.value);
            valueDisplay.textContent = val.toFixed(2);
            if (!this.mmdManager) return;
            if (morphIndex >= 0) {
                this.mmdManager.setMorphWeightByIndex(morphIndex, val);
            } else {
                this.mmdManager.setMorphWeight(morphName, val);
            }
            this.currentMorphFrameIndex = morphInfo.frameIndex;
            this.onMorphFrameSelectionChanged?.(this.currentMorphFrameIndex);
            this.onMorphValueEdited?.(this.currentMorphFrameIndex);
        });

        this.morphSliders.set(`${morphIndex}:${morphName}`, slider);

        row.appendChild(label);
        row.appendChild(slider);
        row.appendChild(valueDisplay);
        return row;
    }
    private isSliderEditing(slider: HTMLInputElement): boolean {
        const activeElement = document.activeElement;
        return this.activeSliderInteractions.has(slider)
            || activeElement === slider
            || activeElement === this.getAttachedNumberInput(slider);
    }

    private getAttachedNumberInput(slider: HTMLInputElement): HTMLInputElement | null {
        const candidate = slider.parentElement?.querySelector('input.range-number-input[type="number"]');
        return candidate instanceof HTMLInputElement ? candidate : null;
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }

    private formatSliderValue(value: number, step: number): string {
        if (step >= 1) return String(Math.round(value));
        if (step >= 0.1) return value.toFixed(1);
        return value.toFixed(2);
    }
}
