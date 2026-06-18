import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";
import type { EditorAction } from "../actions/types";
import { BackgroundSettingsDialogController } from "./background-settings-dialog-controller";
import { ContactShadowSettingsDialogController } from "./contact-shadow-settings-dialog-controller";
import { EdgeSettingsDialogController } from "./edge-settings-dialog-controller";
import { GravitySettingsDialogController } from "./gravity-settings-dialog-controller";
import { IblShadowSettingsDialogController } from "./ibl-shadow-settings-dialog-controller";
import { LightingShadowSettingsDialogController } from "./lighting-shadow-settings-dialog-controller";
import { MirrorFloorSettingsDialogController } from "./mirror-floor-settings-dialog-controller";
import { PopupDialogController } from "./popup-dialog-controller";
import type { WebmExportSettingsAdapter } from "./export-ui-controller";
import { WebmExportDialogController } from "./webm-export-dialog-controller";

type ToastType = "success" | "error" | "info";

type AppMenuControllerDeps = {
    mmdManager: MmdManager;
    dispatchAction: (action: EditorAction) => boolean;
    setStatus: (text: string, loading?: boolean) => void;
    showToast: (message: string, type?: ToastType) => void;
    refreshEnvironmentUi: () => void;
    refreshCameraUi: () => void;
    refreshRuntimeUi: () => void;
    refreshModelEdgeUi: () => void;
    refreshLightingUi: () => void;
    createWebmExportSettingsAdapter: () => WebmExportSettingsAdapter;
};

type DialogKind = "about" | "shortcuts" | "preferences" | "hdriSettings";

type AppMenuElements = {
    root: HTMLElement | null;
    groups: HTMLElement[];
    triggers: HTMLButtonElement[];
    checkItems: HTMLButtonElement[];
};

function resolveElements(): AppMenuElements {
    const root = document.getElementById("app-menu-bar");
    return {
        root,
        groups: root ? Array.from(root.querySelectorAll<HTMLElement>(".app-menu-group")) : [],
        triggers: root ? Array.from(root.querySelectorAll<HTMLButtonElement>(".app-menu-trigger")) : [],
        checkItems: root ? Array.from(root.querySelectorAll<HTMLButtonElement>(".app-menu-item--check[data-menu-command]")) : [],
    };
}

export class AppMenuController {
    private readonly elements: AppMenuElements;
    private readonly mmdManager: MmdManager;
    private readonly dispatchAction: (action: EditorAction) => boolean;
    private readonly setStatus: (text: string, loading?: boolean) => void;
    private readonly showToast: (message: string, type?: ToastType) => void;
    private readonly refreshEnvironmentUi: () => void;
    private readonly refreshCameraUi: () => void;
    private readonly refreshRuntimeUi: () => void;
    private readonly refreshModelEdgeUi: () => void;
    private readonly refreshLightingUi: () => void;
    private readonly createWebmExportSettingsAdapter: () => WebmExportSettingsAdapter;
    private readonly popupDialogController: PopupDialogController;
    private openGroup: HTMLElement | null = null;

    constructor(deps: AppMenuControllerDeps) {
        this.elements = resolveElements();
        this.mmdManager = deps.mmdManager;
        this.dispatchAction = deps.dispatchAction;
        this.setStatus = deps.setStatus;
        this.showToast = deps.showToast;
        this.refreshEnvironmentUi = deps.refreshEnvironmentUi;
        this.refreshCameraUi = deps.refreshCameraUi;
        this.refreshRuntimeUi = deps.refreshRuntimeUi;
        this.refreshModelEdgeUi = deps.refreshModelEdgeUi;
        this.refreshLightingUi = deps.refreshLightingUi;
        this.createWebmExportSettingsAdapter = deps.createWebmExportSettingsAdapter;
        this.popupDialogController = new PopupDialogController();
        this.setupMenuEvents();
    }

    public closeAll(): void {
        this.setOpenGroup(null);
        this.popupDialogController.close();
    }

    private setupMenuEvents(): void {
        if (!this.elements.root) return;

        this.elements.triggers.forEach((trigger, index) => {
            trigger.addEventListener("click", () => {
                const group = this.elements.groups[index] ?? null;
                this.setOpenGroup(this.openGroup === group ? null : group);
            });
            trigger.addEventListener("mouseenter", () => {
                if (!this.openGroup) return;
                this.setOpenGroup(this.elements.groups[index] ?? null);
            });
        });

        this.elements.root.addEventListener("click", (event) => {
            const item = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-menu-command]");
            if (!item || item.disabled) return;
            const command = item.dataset.menuCommand;
            if (!command) return;
            this.executeCommand(command, item);
            this.refreshCheckItems();
            this.setOpenGroup(null);
        });

        document.addEventListener("pointerdown", (event) => {
            if (!this.openGroup) return;
            if (this.elements.root?.contains(event.target as Node)) return;
            this.setOpenGroup(null);
        });

        document.addEventListener("keydown", (event) => this.handleKeyDown(event));
    }

    private handleKeyDown(event: KeyboardEvent): void {
        if (event.key === "Escape") {
            if (this.openGroup) {
                event.preventDefault();
                this.setOpenGroup(null);
            }
            return;
        }

        if (!this.elements.root) return;
        const activeElement = document.activeElement as HTMLElement | null;
        const isInsideMenu = activeElement ? this.elements.root.contains(activeElement) : false;
        if (!isInsideMenu && !this.openGroup) return;

        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            const activeGroup = this.openGroup ?? activeElement?.closest<HTMLElement>(".app-menu-group") ?? null;
            const currentIndex = Math.max(0, this.elements.groups.indexOf(activeGroup as HTMLElement));
            const direction = event.key === "ArrowRight" ? 1 : -1;
            const nextIndex = (currentIndex + direction + this.elements.groups.length) % this.elements.groups.length;
            const nextGroup = this.elements.groups[nextIndex] ?? null;
            this.setOpenGroup(nextGroup);
            this.elements.triggers[nextIndex]?.focus();
            return;
        }

        if (event.key === "ArrowDown") {
            event.preventDefault();
            const group = this.openGroup ?? activeElement?.closest<HTMLElement>(".app-menu-group") ?? null;
            this.setOpenGroup(group);
            this.focusMenuItem(group, 0);
            return;
        }

        if (event.key === "ArrowUp") {
            event.preventDefault();
            const group = this.openGroup ?? activeElement?.closest<HTMLElement>(".app-menu-group") ?? null;
            this.setOpenGroup(group);
            this.focusMenuItem(group, -1);
        }
    }

    private focusMenuItem(group: HTMLElement | null, index: number): void {
        const items = group
            ? Array.from(group.querySelectorAll<HTMLButtonElement>(".app-menu-item:not(:disabled)"))
            : [];
        if (items.length === 0) return;
        const targetIndex = index < 0 ? items.length - 1 : Math.min(index, items.length - 1);
        items[targetIndex]?.focus();
    }

    private setOpenGroup(group: HTMLElement | null): void {
        if (group) {
            this.refreshCheckItems();
        }
        this.elements.groups.forEach((item) => {
            item.classList.toggle("menu-open", item === group);
        });
        this.openGroup = group;
    }

    private refreshCheckItems(): void {
        this.elements.checkItems.forEach((item) => {
            const command = item.dataset.menuCommand ?? "";
            const state = this.resolveCheckState(command);
            if (!state) return;
            item.setAttribute("aria-checked", state.checked ? "true" : "false");
            item.disabled = state.disabled;
        });
    }

    private resolveCheckState(command: string): { checked: boolean; disabled: boolean } | null {
        switch (command) {
            case "view.toggleGround":
                return { checked: this.mmdManager.isGroundVisible(), disabled: false };
            case "view.toggleEdge":
                return { checked: this.mmdManager.modelEdgeWidth > 0.001, disabled: false };
            case "view.toggleSkydome":
                return { checked: this.mmdManager.isSkydomeVisible(), disabled: false };
            case "view.toggleAntialias":
                return { checked: this.mmdManager.antialiasEnabled, disabled: false };
            case "view.toggleShadow":
                return { checked: this.mmdManager.getShadowEnabled(), disabled: false };
            case "view.toggleCharacterContactShadow":
                return { checked: this.mmdManager.characterContactShadowEnabled, disabled: false };
            case "view.toggleMirrorFloor":
                return { checked: this.mmdManager.mirroringFloorEnabled, disabled: false };
            case "view.toggleGi":
                return { checked: this.mmdManager.isGlobalIlluminationEnabled(), disabled: this.mmdManager.isGlobalIlluminationPending() };
            case "view.toggleFxPanel":
                return { checked: this.isShaderPanelVisible(), disabled: false };
            case "view.toggleActiveModel":
                return { checked: this.isActiveModelVisible(), disabled: !this.hasActiveModel() };
            case "background.toggleMedia":
                return { checked: this.mmdManager.isBackgroundMediaVisible(), disabled: !this.mmdManager.hasBackgroundMedia() };
            case "background.toggleBlack":
                return { checked: this.mmdManager.isBackgroundBlack(), disabled: false };
            case "background.toggleHdriBackground":
                return { checked: false, disabled: true };
            case "physics.togglePhysics":
                return { checked: this.mmdManager.getPhysicsEnabled(), disabled: !this.mmdManager.isPhysicsAvailable() };
            case "physics.toggleRigidBodies":
                return {
                    checked: this.mmdManager.isRigidBodyVisualizerAvailable() && this.mmdManager.isRigidBodyVisualizerEnabled(),
                    disabled: !this.mmdManager.isRigidBodyVisualizerAvailable(),
                };
            default:
                return null;
        }
    }

    private executeCommand(command: string, invoker?: HTMLElement | null): void {
        switch (command) {
            case "file.openFile":
                this.dispatchAction({ type: "project.openFile", source: "menu" });
                return;
            case "file.openModel":
                this.dispatchAction({ type: "project.openModel", source: "menu" });
                return;
            case "file.openMotion":
                this.dispatchAction({ type: "project.openMotion", source: "menu" });
                return;
            case "file.openCameraMotion":
                this.dispatchAction({ type: "project.openCameraMotion", source: "menu" });
                return;
            case "file.openAudio":
                this.dispatchAction({ type: "project.openAudio", source: "menu" });
                return;
            case "file.loadProject":
                this.dispatchAction({ type: "project.load", source: "menu" });
                return;
            case "file.saveProject":
                this.dispatchAction({ type: "project.save", source: "menu", forceChoosePath: true });
                return;
            case "file.exportPng":
                this.dispatchAction({ type: "project.exportPng", source: "menu" });
                return;
            case "file.exportPngSequence":
                this.dispatchAction({ type: "project.exportPngSequence", source: "menu" });
                return;
            case "file.exportWebm":
                this.dispatchAction({ type: "project.exportWebm", source: "menu" });
                return;
            case "file.webmExportSettings":
                this.openWebmExportDialog(invoker ?? null);
                return;
            case "edit.undo":
                this.dispatchAction({ type: "history.undo", source: "menu" });
                return;
            case "edit.redo":
                this.dispatchAction({ type: "history.redo", source: "menu" });
                return;
            case "edit.addKeyframe":
                this.dispatchAction({ type: "keyframe.addCurrent", source: "menu" });
                return;
            case "edit.deleteKeyframe":
                this.dispatchAction({ type: "keyframe.deleteSelected", source: "menu" });
                return;
            case "edit.prevKeyframe":
                this.dispatchAction({ type: "playback.seekAdjacentKeyframe", source: "menu", direction: -1 });
                return;
            case "edit.nextKeyframe":
                this.dispatchAction({ type: "playback.seekAdjacentKeyframe", source: "menu", direction: 1 });
                return;
            case "edit.deleteActiveModel":
                this.dispatchAction({ type: "model.deleteActive", source: "menu" });
                return;
            case "view.toggleGround":
                this.dispatchAction({ type: "viewport.toggleGround", source: "menu" });
                return;
            case "view.toggleEdge":
                this.dispatchAction({ type: "viewport.toggleEdge", source: "menu" });
                return;
            case "view.edgeSettings":
                this.openEdgeSettingsDialog(invoker ?? null);
                return;
            case "view.toggleSkydome":
                this.dispatchAction({ type: "viewport.toggleSkydome", source: "menu" });
                return;
            case "view.toggleAntialias":
                this.dispatchAction({ type: "runtime.toggleAntialias", source: "menu" });
                return;
            case "view.toggleShadow":
                this.dispatchAction({ type: "runtime.toggleShadow", source: "menu" });
                return;
            case "view.toggleCharacterContactShadow":
                this.dispatchAction({
                    type: "effect.setCharacterContactShadow",
                    source: "menu",
                    enabled: !this.mmdManager.characterContactShadowEnabled,
                });
                this.refreshLightingUi();
                return;
            case "view.toggleMirrorFloor":
                this.dispatchAction({
                    type: "camera.setMirroringFloorEnabled",
                    source: "menu",
                    enabled: !this.isMirroringFloorEnabled(),
                });
                return;
            case "view.mirrorFloorSettings":
                this.openMirrorFloorSettingsDialog(invoker ?? null);
                return;
            case "view.toggleGi":
                this.dispatchAction({ type: "runtime.toggleGlobalIllumination", source: "menu" });
                return;
            case "view.lightShadowSettings":
                this.openLightingShadowSettingsDialog(invoker ?? null);
                return;
            case "view.iblShadowSettings":
                this.openIblShadowSettingsDialog(invoker ?? null);
                return;
            case "view.toggleFxPanel":
                this.dispatchAction({ type: "layout.shaderPanel.toggle", source: "menu" });
                return;
            case "view.contactShadowSettings":
                this.openContactShadowSettingsDialog(invoker ?? null);
                return;
            case "view.camera.front":
                this.dispatchAction({ type: "camera.setViewPreset", source: "menu", view: "front" });
                return;
            case "view.camera.back":
                this.dispatchAction({ type: "camera.setViewPreset", source: "menu", view: "back" });
                return;
            case "view.camera.left":
                this.dispatchAction({ type: "camera.setViewPreset", source: "menu", view: "left" });
                return;
            case "view.camera.right":
                this.dispatchAction({ type: "camera.setViewPreset", source: "menu", view: "right" });
                return;
            case "view.camera.top":
                this.dispatchAction({ type: "camera.setViewPreset", source: "menu", view: "top" });
                return;
            case "view.camera.bottom":
                this.dispatchAction({ type: "camera.setViewPreset", source: "menu", view: "bottom" });
                return;
            case "view.toggleActiveModel":
                this.dispatchAction({ type: "model.toggleActiveVisibility", source: "menu" });
                return;
            case "view.toggleFullscreenUi":
                this.dispatchAction({ type: "layout.fullscreen.toggle", source: "menu" });
                return;
            case "background.toggleMedia":
                this.dispatchAction({ type: "viewport.toggleBackgroundMedia", source: "menu" });
                return;
            case "background.toggleBlack":
                this.dispatchAction({ type: "viewport.toggleBackgroundBlack", source: "menu" });
                return;
            case "background.toggleHdriBackground":
                this.showToast(t("menu.toast.hdriNotReady"), "info");
                return;
            case "expression.addKeyframe":
                this.dispatchAction({ type: "keyframe.addCurrent", source: "menu" });
                return;
            case "expression.registerMorph":
                this.dispatchAction({ type: "keyframe.registerMorph", source: "menu" });
                return;
            case "physics.togglePhysics":
                this.dispatchAction({ type: "runtime.togglePhysics", source: "menu" });
                return;
            case "physics.toggleRigidBodies":
                this.dispatchAction({ type: "runtime.toggleRigidBodies", source: "menu" });
                return;
            case "dialog.preferences":
                this.openDialog("preferences", invoker ?? null);
                return;
            case "background.settings":
                this.openBackgroundSettingsDialog(invoker ?? null);
                return;
            case "background.hdriSettings":
                this.openDialog("hdriSettings", invoker ?? null);
                return;
            case "physics.gravitySettings":
                this.openGravitySettingsDialog(invoker ?? null);
                return;
            case "dialog.shortcuts":
                this.openDialog("shortcuts", invoker ?? null);
                return;
            case "dialog.about":
                this.openDialog("about", invoker ?? null);
                return;
            case "runtime.classic":
                this.setRuntimeMode("classic");
                return;
            case "runtime.wasm":
                this.setRuntimeMode("wasm");
                return;
            case "help.openLogFolder":
                void this.openLogFolder();
                return;
            default:
                this.showToast(t("menu.toast.unhandled"), "info");
        }
    }

    private openDialog(kind: DialogKind, invoker: HTMLElement | null): void {
        const content = this.createDialogContent(kind);
        this.popupDialogController.open({
            id: kind,
            surface: "modal",
            title: content.title,
            size: kind === "shortcuts" ? "lg" : "md",
            restoreFocusTo: invoker,
            content: (container) => {
                container.innerHTML = content.body;
            },
        });
    }

    private createDialogContent(kind: DialogKind): { title: string; body: string } {
        switch (kind) {
            case "about":
                return {
                    title: t("dialog.about.title"),
                    body: `<p>${t("dialog.about.body")}</p>`,
                };
            case "shortcuts":
                return {
                    title: t("dialog.shortcuts.title"),
                    body: `
                        <dl>
                            <dt>Space / P</dt><dd>${t("dialog.shortcuts.playback")}</dd>
                            <dt>Ctrl+Z</dt><dd>${t("dialog.shortcuts.undo")}</dd>
                            <dt>Ctrl+Y</dt><dd>${t("dialog.shortcuts.redo")}</dd>
                            <dt>Home / End</dt><dd>${t("dialog.shortcuts.range")}</dd>
                            <dt>Esc</dt><dd>${t("dialog.shortcuts.escape")}</dd>
                        </dl>
                    `,
                };
            case "preferences":
                return {
                    title: t("dialog.preferences.title"),
                    body: `<p>${t("dialog.preferences.body")}</p>`,
                };
            case "hdriSettings":
                return {
                    title: t("dialog.hdri.title"),
                    body: `
                        <div class="popup-form">
                            <div class="popup-form-grid">
                                <label class="popup-form-field">
                                    <span class="popup-form-label">${t("dialog.hdri.current")}</span>
                                    <span class="popup-form-value">${t("option.none")}</span>
                                </label>
                                <label class="popup-form-field">
                                    <span class="popup-form-label">${t("dialog.hdri.backgroundVisible")}</span>
                                    <input class="popup-form-checkbox" type="checkbox" disabled>
                                </label>
                                <label class="popup-form-field">
                                    <span class="popup-form-label">${t("dialog.hdri.lightingEnabled")}</span>
                                    <input class="popup-form-checkbox" type="checkbox" disabled>
                                </label>
                                <label class="popup-form-field">
                                    <span class="popup-form-label">${t("dialog.hdri.intensity")}</span>
                                    <div class="popup-form-range-row">
                                        <input class="popup-form-control popup-form-range" type="range" min="0" max="200" value="100" disabled>
                                        <span class="popup-form-value">100%</span>
                                    </div>
                                </label>
                                <label class="popup-form-field">
                                    <span class="popup-form-label">${t("dialog.hdri.rotation")}</span>
                                    <div class="popup-form-range-row">
                                        <input class="popup-form-control popup-form-range" type="range" min="0" max="360" value="0" disabled>
                                        <span class="popup-form-value">0°</span>
                                    </div>
                                </label>
                                <div class="popup-form-button-row">
                                    <button class="popup-form-button popup-form-button-secondary" type="button" disabled>${t("dialog.hdri.load")}</button>
                                    <button class="popup-form-button popup-form-button-secondary" type="button" disabled>${t("dialog.hdri.clear")}</button>
                                </div>
                                <p class="popup-form-note">${t("dialog.hdri.placeholder")}</p>
                            </div>
                        </div>
                    `,
                };
        }
    }

    private openBackgroundSettingsDialog(invoker: HTMLElement | null): void {
        this.popupDialogController.open({
            id: "background-settings",
            surface: "modal",
            title: t("dialog.background.title"),
            size: "md",
            restoreFocusTo: invoker,
            content: new BackgroundSettingsDialogController({
                mmdManager: this.mmdManager,
                dispatchAction: (action) => this.dispatchAction(action),
                setStatus: this.setStatus,
                showToast: this.showToast,
                refreshUi: () => {
                    this.refreshEnvironmentUi();
                    this.refreshCameraUi();
                },
            }),
        });
    }

    private openEdgeSettingsDialog(invoker: HTMLElement | null): void {
        this.popupDialogController.open({
            id: "edge-settings",
            surface: "modal",
            title: t("dialog.edge.title"),
            size: "sm",
            restoreFocusTo: invoker,
            content: new EdgeSettingsDialogController({
                mmdManager: this.mmdManager,
                dispatchAction: (action) => this.dispatchAction(action),
                refreshUi: () => this.refreshModelEdgeUi(),
            }),
        });
    }

    private openGravitySettingsDialog(invoker: HTMLElement | null): void {
        this.popupDialogController.open({
            id: "gravity-settings",
            surface: "modal",
            title: t("dialog.gravity.title"),
            size: "sm",
            restoreFocusTo: invoker,
            content: new GravitySettingsDialogController({
                mmdManager: this.mmdManager,
                dispatchAction: (action) => this.dispatchAction(action),
                refreshUi: () => this.refreshRuntimeUi(),
            }),
        });
    }

    private openLightingShadowSettingsDialog(invoker: HTMLElement | null): void {
        this.popupDialogController.open({
            id: "lighting-shadow-settings",
            surface: "modal",
            title: t("dialog.lightShadow.title"),
            size: "md",
            restoreFocusTo: invoker,
            content: new LightingShadowSettingsDialogController({
                mmdManager: this.mmdManager,
                dispatchAction: (action) => this.dispatchAction(action),
                refreshUi: () => this.refreshLightingUi(),
            }),
        });
    }

    private openIblShadowSettingsDialog(invoker: HTMLElement | null): void {
        this.popupDialogController.open({
            id: "ibl-shadow-settings",
            surface: "modal",
            title: t("dialog.iblShadow.title"),
            size: "sm",
            restoreFocusTo: invoker,
            content: new IblShadowSettingsDialogController({
                mmdManager: this.mmdManager,
                dispatchAction: (action) => this.dispatchAction(action),
                refreshUi: () => this.refreshLightingUi(),
            }),
        });
    }

    private openContactShadowSettingsDialog(invoker: HTMLElement | null): void {
        this.popupDialogController.open({
            id: "contact-shadow-settings",
            surface: "modal",
            title: t("dialog.contactShadow.title"),
            size: "sm",
            restoreFocusTo: invoker,
            content: new ContactShadowSettingsDialogController({
                mmdManager: this.mmdManager,
                dispatchAction: (action) => this.dispatchAction(action),
                refreshUi: () => this.refreshLightingUi(),
            }),
        });
    }

    private openMirrorFloorSettingsDialog(invoker: HTMLElement | null): void {
        this.popupDialogController.open({
            id: "mirror-floor-settings",
            surface: "modal",
            title: t("dialog.mirrorFloor.title"),
            size: "sm",
            restoreFocusTo: invoker,
            content: new MirrorFloorSettingsDialogController({
                mmdManager: this.mmdManager,
                dispatchAction: (action) => this.dispatchAction(action),
                refreshUi: () => this.refreshCameraUi(),
            }),
        });
    }

    private openWebmExportDialog(invoker: HTMLElement | null): void {
        this.popupDialogController.open({
            id: "webm-export",
            surface: "modal",
            title: t("dialog.webmExport.title"),
            size: "sm",
            restoreFocusTo: invoker,
            content: new WebmExportDialogController({
                dispatchAction: (action) => this.dispatchAction(action),
                output: this.createWebmExportSettingsAdapter(),
                close: () => {
                    this.popupDialogController.close();
                },
            }),
        });
    }

    private async openLogFolder(): Promise<void> {
        const opened = await window.electronAPI.openLogFolder();
        this.showToast(opened ? t("menu.toast.logFolderOpened") : t("menu.toast.logFolderFailed"), opened ? "success" : "error");
    }

    private setRuntimeMode(mode: "classic" | "wasm"): void {
        const select = document.getElementById("toolbar-runtime-mode-select") as HTMLSelectElement | null;
        if (!select) return;
        if (select.value === mode) {
            this.showToast(t("menu.toast.runtimeAlreadySelected"), "info");
            return;
        }
        select.value = mode;
        select.dispatchEvent(new Event("change", { bubbles: true }));
    }

    private isMirroringFloorEnabled(): boolean {
        return this.mmdManager.mirroringFloorEnabled;
    }

    private hasActiveModel(): boolean {
        return this.mmdManager.getActiveModelInfo() !== null;
    }

    private isActiveModelVisible(): boolean {
        return this.hasActiveModel() && this.mmdManager.getActiveModelVisibility();
    }

    private isShaderPanelVisible(): boolean {
        return !document.getElementById("main-content")?.classList.contains("shader-panel-collapsed");
    }
}
