import { setLocale, t } from "../i18n";
import type { UiLocale } from "../types";
import type { EditorAction } from "../actions/types";

type ToastType = "success" | "error" | "info";

type AppMenuControllerDeps = {
    dispatchAction: (action: EditorAction) => boolean;
    showToast: (message: string, type?: ToastType) => void;
};

type DialogKind = "about" | "shortcuts" | "preferences" | "background" | "gravity";

type AppMenuElements = {
    root: HTMLElement | null;
    groups: HTMLElement[];
    triggers: HTMLButtonElement[];
};

function resolveElements(): AppMenuElements {
    const root = document.getElementById("app-menu-bar");
    return {
        root,
        groups: root ? Array.from(root.querySelectorAll<HTMLElement>(".app-menu-group")) : [],
        triggers: root ? Array.from(root.querySelectorAll<HTMLButtonElement>(".app-menu-trigger")) : [],
    };
}

export class AppMenuController {
    private readonly elements: AppMenuElements;
    private readonly dispatchAction: (action: EditorAction) => boolean;
    private readonly showToast: (message: string, type?: ToastType) => void;
    private dialogBackdrop: HTMLElement | null = null;
    private dialogTitle: HTMLElement | null = null;
    private dialogBody: HTMLElement | null = null;
    private dialogCloseButton: HTMLButtonElement | null = null;
    private openGroup: HTMLElement | null = null;

    constructor(deps: AppMenuControllerDeps) {
        this.elements = resolveElements();
        this.dispatchAction = deps.dispatchAction;
        this.showToast = deps.showToast;
        this.setupDialogHost();
        this.setupMenuEvents();
    }

    public closeAll(): void {
        this.setOpenGroup(null);
        this.closeDialog();
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
            this.executeCommand(command);
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
            if (this.dialogBackdrop && !this.dialogBackdrop.hidden) {
                event.preventDefault();
                this.closeDialog();
                return;
            }
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
        this.elements.groups.forEach((item) => {
            item.classList.toggle("menu-open", item === group);
        });
        this.openGroup = group;
    }

    private executeCommand(command: string): void {
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
            case "view.toggleGround":
                this.dispatchAction({ type: "viewport.toggleGround", source: "menu" });
                return;
            case "view.toggleEdge":
                this.dispatchAction({ type: "viewport.toggleEdge", source: "menu" });
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
            case "view.toggleGi":
                this.dispatchAction({ type: "runtime.toggleGlobalIllumination", source: "menu" });
                return;
            case "view.toggleRigidBodies":
                this.dispatchAction({ type: "runtime.toggleRigidBodies", source: "menu" });
                return;
            case "view.toggleFxPanel":
                this.dispatchAction({ type: "layout.shaderPanel.toggle", source: "menu" });
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
            case "view.deleteActiveModel":
                this.dispatchAction({ type: "model.deleteActive", source: "menu" });
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
            case "background.toggleMirrorFloor":
                this.dispatchAction({
                    type: "camera.setMirroringFloorEnabled",
                    source: "menu",
                    enabled: !this.isMirroringFloorEnabled(),
                });
                return;
            case "background.mirrorResolution512":
                this.dispatchAction({ type: "camera.setMirroringFloorResolution", source: "menu", resolution: 512 });
                return;
            case "background.mirrorResolution1024":
                this.dispatchAction({ type: "camera.setMirroringFloorResolution", source: "menu", resolution: 1024 });
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
                this.openDialog("preferences");
                return;
            case "background.settings":
                this.openDialog("background");
                return;
            case "physics.gravitySettings":
                this.openDialog("gravity");
                return;
            case "dialog.shortcuts":
                this.openDialog("shortcuts");
                return;
            case "dialog.about":
                this.openDialog("about");
                return;
            case "language.ja":
                this.setLanguage("ja");
                return;
            case "language.en":
                this.setLanguage("en");
                return;
            case "language.zh-Hant":
                this.setLanguage("zh-Hant");
                return;
            case "language.zh-Hans":
                this.setLanguage("zh-Hans");
                return;
            case "language.ko":
                this.setLanguage("ko");
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

    private setupDialogHost(): void {
        const backdrop = document.createElement("div");
        backdrop.className = "app-menu-dialog-backdrop";
        backdrop.hidden = true;
        backdrop.innerHTML = `
            <section class="app-menu-dialog" role="dialog" aria-modal="true" aria-labelledby="app-menu-dialog-title">
                <header class="app-menu-dialog-header">
                    <h2 id="app-menu-dialog-title" class="app-menu-dialog-title"></h2>
                    <button class="app-menu-dialog-close" type="button" aria-label="Close">&times;</button>
                </header>
                <div class="app-menu-dialog-body"></div>
            </section>
        `;
        document.body.appendChild(backdrop);
        this.dialogBackdrop = backdrop;
        this.dialogTitle = backdrop.querySelector("#app-menu-dialog-title");
        this.dialogBody = backdrop.querySelector(".app-menu-dialog-body");
        this.dialogCloseButton = backdrop.querySelector(".app-menu-dialog-close");

        backdrop.addEventListener("pointerdown", (event) => {
            if (event.target === backdrop) this.closeDialog();
        });
        this.dialogCloseButton?.addEventListener("click", () => this.closeDialog());
    }

    private openDialog(kind: DialogKind): void {
        if (!this.dialogBackdrop || !this.dialogTitle || !this.dialogBody) return;
        const content = this.createDialogContent(kind);
        this.dialogTitle.textContent = content.title;
        this.dialogBody.innerHTML = content.body;
        this.dialogBackdrop.hidden = false;
        this.dialogCloseButton?.focus();
    }

    private closeDialog(): void {
        if (!this.dialogBackdrop) return;
        this.dialogBackdrop.hidden = true;
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
            case "background":
                return {
                    title: t("dialog.background.title"),
                    body: `<p>${t("dialog.background.body")}</p>`,
                };
            case "gravity":
                return {
                    title: t("dialog.gravity.title"),
                    body: `<p>${t("dialog.gravity.body")}</p>`,
                };
        }
    }

    private async openLogFolder(): Promise<void> {
        const opened = await window.electronAPI.openLogFolder();
        this.showToast(opened ? t("menu.toast.logFolderOpened") : t("menu.toast.logFolderFailed"), opened ? "success" : "error");
    }

    private setLanguage(locale: UiLocale): void {
        setLocale(locale);
        this.showToast(t("menu.toast.languageChanged"), "success");
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
        const checkbox = document.getElementById("mirroring-floor-enabled") as HTMLInputElement | null;
        return checkbox?.checked ?? false;
    }
}
