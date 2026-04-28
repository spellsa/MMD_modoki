import { FrameGraph } from "@babylonjs/core/FrameGraph/frameGraph";
import { FrameGraphTask } from "@babylonjs/core/FrameGraph/frameGraphTask";
import type { Scene } from "@babylonjs/core/scene";

export type FrameGraphPostEffectsWarning = {
    message: string;
    reason: "not-connected" | "build-failed";
};

export type FrameGraphPostEffectsInfo = {
    message: string;
    event: "activated" | "ready";
};

class FrameGraphPostEffectsNoopTask extends FrameGraphTask {
    constructor(
        name: string,
        frameGraph: FrameGraph,
        private readonly onExecute: () => void,
    ) {
        super(name, frameGraph);
    }

    override getClassName(): string {
        return "FrameGraphPostEffectsNoopTask";
    }

    override record(): void {
        const pass = this._frameGraph.addPass(`${this.name}:noop`);
        pass.setExecuteFunc(() => {
            this.onExecute();
        });
    }
}

export class FrameGraphPostEffectsController {
    private activationWarningEmitted = false;
    private frameGraph: FrameGraph | null = null;
    private ready = false;
    private active = false;
    private executedFrameCount = 0;

    constructor(
        private readonly onWarning: (warning: FrameGraphPostEffectsWarning) => void,
        private readonly onInfo?: (info: FrameGraphPostEffectsInfo) => void,
    ) {}

    activate(scene?: Scene): boolean {
        if (this.active) {
            return true;
        }
        if (!scene) {
            this.emitWarningOnce({
                message: "Frame Graph post effects are not connected yet. Using classic post effects.",
                reason: "not-connected",
            });
            return false;
        }

        this.frameGraph = new FrameGraph(scene, false);
        this.frameGraph.name = "MMD modoki post effects";
        this.frameGraph.addTask(new FrameGraphPostEffectsNoopTask(
            "frameGraphPostEffectsBootstrap",
            this.frameGraph,
            () => {
                this.executedFrameCount += 1;
            },
        ));
        this.active = true;
        this.onInfo?.({
            message: "Frame Graph post effects backend active (noop PoC).",
            event: "activated",
        });
        void this.frameGraph.buildAsync().then(() => {
            this.ready = true;
            this.onInfo?.({
                message: "Frame Graph post effects backend ready.",
                event: "ready",
            });
        }).catch((err: unknown) => {
            this.ready = false;
            this.active = false;
            const message = err instanceof Error ? err.message : String(err);
            this.emitWarningOnce({
                message: `Frame Graph post effects failed to build. Using classic post effects. Reason: ${message}`,
                reason: "build-failed",
            });
        });
        return true;
    }

    execute(): void {
        if (!this.active || !this.ready || !this.frameGraph?.isReady()) {
            return;
        }
        this.frameGraph.execute();
    }

    getExecutedFrameCount(): number {
        return this.executedFrameCount;
    }

    private emitWarningOnce(warning: FrameGraphPostEffectsWarning): void {
        if (!this.activationWarningEmitted) {
            this.activationWarningEmitted = true;
            this.onWarning(warning);
        }
    }

    dispose(): void {
        this.frameGraph?.dispose();
        this.frameGraph = null;
        this.ready = false;
        this.active = false;
        this.executedFrameCount = 0;
        this.activationWarningEmitted = false;
    }
}
