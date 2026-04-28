import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import Ammo from "babylon-mmd/esm/Runtime/Physics/External/ammo.wasm";
import { MmdAmmoJSPlugin } from "babylon-mmd/esm/Runtime/Physics/mmdAmmoJSPlugin";
import { MmdAmmoPhysics } from "babylon-mmd/esm/Runtime/Physics/mmdAmmoPhysics";
import { MmdBulletPhysics } from "babylon-mmd/esm/Runtime/Optimized/Physics/mmdBulletPhysics";
import { MultiPhysicsRuntime } from "babylon-mmd/esm/Runtime/Optimized/Physics/Bind/Impl/multiPhysicsRuntime";
import { PhysicsRuntimeEvaluationType } from "babylon-mmd/esm/Runtime/Optimized/Physics/Bind/Impl/physicsRuntimeEvaluationType";
import { MmdRuntime } from "babylon-mmd/esm/Runtime/mmdRuntime";
import { MmdWasmRuntime } from "babylon-mmd/esm/Runtime/Optimized/mmdWasmRuntime";
import type { IMmdWasmInstance } from "babylon-mmd/esm/Runtime/Optimized/mmdWasmInstance";
import { logError, logInfo, logWarn, toLogErrorData } from "../app-logger";

// eslint-disable-next-line import/no-unresolved
import ammoWasmBinaryUrl from "babylon-mmd/esm/Runtime/Physics/External/ammo.wasm.wasm?url";

export type PhysicsSimulationRateHz = 30 | 60 | 120;
export type PhysicsBackend = "none" | "bullet-mpr" | "bullet-spr" | "ammo" | "wasm-mpr";
type BulletPhysicsBackend = Extract<PhysicsBackend, "bullet-mpr" | "bullet-spr">;
export type PhysicsBackendLabel = "Bullet MPR" | "Bullet SPR" | "WASM MPR" | "Ammo" | "Off";
export type PhysicsEvaluationTypeLabel = "Immediate" | "Buffered" | "WasmImmediate";
type RuntimeMmdRuntime = MmdRuntime | MmdWasmRuntime;

type PhysicsStepTimingStats = {
    samples: number;
    totalMs: number;
    maxMs: number;
    lastMs: number | null;
};

export type PhysicsPerformanceSampleContext = {
    runtimeMode: "classic" | "wasm";
    engine: string;
    fps: number;
    modelCount: number;
    simulationActive: boolean;
};

export type PhysicsRuntimeControllerOptions = {
    scene: Scene;
    runtime: RuntimeMmdRuntime;
    getMprUnavailableReason: () => string | null;
    loadMprWasmInstance: () => Promise<IMmdWasmInstance>;
    loadSprWasmInstance: () => Promise<IMmdWasmInstance>;
    onStateChanged?: (enabled: boolean, available: boolean) => void;
    onError?: (message: string) => void;
};

export class PhysicsRuntimeController {
    private readonly scene: Scene;
    private runtime: RuntimeMmdRuntime;
    private readonly getMprUnavailableReason: () => string | null;
    private readonly loadMprWasmInstance: () => Promise<IMmdWasmInstance>;
    private readonly loadSprWasmInstance: () => Promise<IMmdWasmInstance>;
    private readonly onStateChanged?: (enabled: boolean, available: boolean) => void;
    private readonly onError?: (message: string) => void;
    private physicsPlugin: MmdAmmoJSPlugin | null = null;
    private bulletPhysicsRuntime: MultiPhysicsRuntime | null = null;
    private physicsRuntime: MmdAmmoPhysics | MmdBulletPhysics | null = null;
    private available = false;
    private backend: PhysicsBackend = "none";
    private enabled = true;
    private simulationRateHz: PhysicsSimulationRateHz = 60;
    private gravityAcceleration = 98;
    private gravityDirection = new Vector3(0, -100, 0);
    private bulletEvaluationType = PhysicsRuntimeEvaluationType.Immediate;
    private nextPerformanceLogMs = performance.now() + 10_000;
    private stepTimingStats: PhysicsStepTimingStats = {
        samples: 0,
        totalMs: 0,
        maxMs: 0,
        lastMs: null,
    };

    constructor(options: PhysicsRuntimeControllerOptions) {
        this.scene = options.scene;
        this.runtime = options.runtime;
        this.getMprUnavailableReason = options.getMprUnavailableReason;
        this.loadMprWasmInstance = options.loadMprWasmInstance;
        this.loadSprWasmInstance = options.loadSprWasmInstance;
        this.onStateChanged = options.onStateChanged;
        this.onError = options.onError;
    }

    public setRuntime(runtime: RuntimeMmdRuntime): void {
        this.runtime = runtime;
    }

    public async initializeClassic(): Promise<boolean> {
        try {
            await this.initializeBulletPhysicsBackend();
            this.available = true;
            logInfo("physics", "physics backend initialized", {
                backend: this.getBackendLabel(),
                fallback: false,
                simulationRateHz: this.simulationRateHz,
            });
        } catch (bulletErr: unknown) {
            const bulletMessage = bulletErr instanceof Error ? bulletErr.message : String(bulletErr);
            console.warn("Bullet physics initialization failed. Falling back to Ammo.js:", bulletMessage);
            logWarn("physics", "Bullet physics initialization failed; falling back to Ammo.js", toLogErrorData(bulletErr));

            try {
                await this.initializeAmmoPhysicsBackend();
                this.available = true;
                logInfo("physics", "physics backend initialized", {
                    backend: "Ammo",
                    fallback: true,
                    simulationRateHz: this.simulationRateHz,
                });
            } catch (ammoErr: unknown) {
                const ammoMessage = ammoErr instanceof Error ? ammoErr.message : String(ammoErr);
                console.warn("Physics initialization failed:", ammoMessage);
                logError("physics", "physics initialization failed", {
                    bullet: toLogErrorData(bulletErr).error,
                    ammo: toLogErrorData(ammoErr).error,
                });
                this.available = false;
                this.enabled = false;
                this.backend = "none";
                this.syncScenePhysicsSimulationState(false);
                this.onStateChanged?.(false, false);
                this.onError?.(`Physics init warning: Bullet=${bulletMessage}; Ammo=${ammoMessage}`);
                return false;
            }
        }

        this.available = true;
        this.applyGravity();
        this.onStateChanged?.(this.enabled, true);
        return true;
    }

    public useWasmRuntime(runtime: MmdWasmRuntime): void {
        this.disposeClassicResources();
        this.runtime = runtime;
        this.backend = "wasm-mpr";
        this.available = true;
        this.enabled = true;
        this.applySimulationRate();
        this.applyGravity();
        this.onStateChanged?.(this.enabled, true);
    }

    public dispose(): void {
        this.disposeClassicResources();
        this.available = false;
        this.enabled = false;
        this.backend = "none";
    }

    public isAvailable(): boolean {
        return this.available;
    }

    public getEnabled(): boolean {
        return this.available && this.enabled;
    }

    public setEnabled(enabled: boolean, simulationActive: boolean): boolean {
        if (!this.available) {
            this.enabled = false;
            this.syncScenePhysicsSimulationState(simulationActive);
            this.onStateChanged?.(false, false);
            return false;
        }

        this.enabled = enabled;
        this.syncBulletEvaluationTypeForPlayback();
        this.syncScenePhysicsSimulationState(simulationActive);
        this.onStateChanged?.(this.enabled, true);
        return this.enabled;
    }

    public getSimulationRateHz(): PhysicsSimulationRateHz {
        return this.simulationRateHz;
    }

    public setSimulationRateHz(value: number): PhysicsSimulationRateHz {
        const normalized = PhysicsRuntimeController.normalizeSimulationRate(value);
        this.simulationRateHz = normalized;
        this.applySimulationRate();
        return normalized;
    }

    public getGravityAcceleration(): number {
        return this.gravityAcceleration;
    }

    public setGravityAcceleration(value: number): void {
        this.gravityAcceleration = Math.max(0, Math.min(200, value));
        this.applyGravity();
    }

    public getGravityDirection(): { x: number; y: number; z: number } {
        return {
            x: this.gravityDirection.x,
            y: this.gravityDirection.y,
            z: this.gravityDirection.z,
        };
    }

    public setGravityDirection(x: number, y: number, z: number): void {
        this.gravityDirection.x = Math.max(-100, Math.min(100, x));
        this.gravityDirection.y = Math.max(-100, Math.min(100, y));
        this.gravityDirection.z = Math.max(-100, Math.min(100, z));
        this.applyGravity();
    }

    public syncScenePhysicsSimulationState(simulationActive: boolean): void {
        this.scene.physicsEnabled = this.getEnabled() && simulationActive;
    }

    public syncBulletEvaluationTypeForPlayback(): void {
        this.setBulletEvaluationType(PhysicsRuntimeEvaluationType.Immediate, "playback state");
    }

    public syncBulletEvaluationTypeForSeek(): void {
        this.setBulletEvaluationType(PhysicsRuntimeEvaluationType.Immediate, "seek");
    }

    public getBackendLabel(): PhysicsBackendLabel {
        if (!this.available) {
            return "Off";
        }
        return PhysicsRuntimeController.getBackendLabelForBackend(this.backend);
    }

    public getEvaluationTypeLabel(): PhysicsEvaluationTypeLabel {
        if (this.backend === "wasm-mpr" || this.runtime instanceof MmdWasmRuntime) {
            return "WasmImmediate";
        }
        return this.bulletEvaluationType === PhysicsRuntimeEvaluationType.Buffered ? "Buffered" : "Immediate";
    }

    public logPerformanceSample(nowMs: number, context: PhysicsPerformanceSampleContext): void {
        if (nowMs < this.nextPerformanceLogMs) {
            return;
        }
        this.nextPerformanceLogMs = nowMs + 10_000;
        const physicsStepTiming = this.consumeStepTimingStats();
        logInfo("physics", "physics performance sample", {
            backend: this.getBackendLabel(),
            runtimeMode: context.runtimeMode,
            engine: context.engine,
            fps: context.fps,
            modelCount: context.modelCount,
            physicsAvailable: this.available,
            physicsEnabled: this.getEnabled(),
            simulationActive: context.simulationActive,
            simulationRateHz: this.simulationRateHz,
            evaluationType: this.getEvaluationTypeLabel(),
            physicsStepSamples: physicsStepTiming.samples,
            physicsStepAvgMs: this.formatStepTimingValue(physicsStepTiming.avgMs),
            physicsStepMaxMs: this.formatStepTimingValue(physicsStepTiming.maxMs),
            physicsStepLastMs: this.formatStepTimingValue(physicsStepTiming.lastMs),
            crossOriginIsolated: globalThis.crossOriginIsolated,
            sharedArrayBufferAvailable: typeof SharedArrayBuffer !== "undefined",
        });
    }

    private async initializeBulletPhysicsBackend(): Promise<void> {
        const mprUnavailableReason = this.getMprUnavailableReason();
        if (mprUnavailableReason === null) {
            try {
                await this.initializeBulletMprPhysicsBackend();
                return;
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                console.warn("Bullet MPR physics initialization failed. Falling back to SPR:", message);
                logWarn("physics", "Bullet MPR physics initialization failed; falling back to SPR", toLogErrorData(err));
            }
        } else {
            logWarn("physics", "Bullet MPR physics skipped; falling back to SPR", {
                reason: mprUnavailableReason,
            });
        }

        await this.initializeBulletSprPhysicsBackend();
    }

    private initializeBulletPhysicsBackendWithWasmInstance(
        backend: BulletPhysicsBackend,
        wasmInstance: IMmdWasmInstance,
    ): void {
        const runtime = new MultiPhysicsRuntime(wasmInstance);
        this.installBulletStepTiming(runtime);
        runtime.register(this.scene);

        this.disposeClassicResources();
        this.bulletPhysicsRuntime = runtime;
        this.physicsPlugin = null;
        this.physicsRuntime = new MmdBulletPhysics(runtime);
        (this.runtime as unknown as { _physics: MmdBulletPhysics | null })._physics = this.physicsRuntime;
        this.backend = backend;
        this.bulletEvaluationType = PhysicsRuntimeEvaluationType.Immediate;
        runtime.evaluationType = this.bulletEvaluationType;
        this.applySimulationRate();
    }

    private async initializeBulletMprPhysicsBackend(): Promise<void> {
        this.initializeBulletPhysicsBackendWithWasmInstance("bullet-mpr", await this.loadMprWasmInstance());
    }

    private async initializeBulletSprPhysicsBackend(): Promise<void> {
        this.initializeBulletPhysicsBackendWithWasmInstance("bullet-spr", await this.loadSprWasmInstance());
    }

    private async initializeAmmoPhysicsBackend(): Promise<void> {
        const wasmResponse = await fetch(ammoWasmBinaryUrl);
        if (!wasmResponse.ok) {
            throw new Error(`Failed to fetch ammo wasm binary: ${wasmResponse.status} ${wasmResponse.statusText}`);
        }
        const wasmBinary = new Uint8Array(await wasmResponse.arrayBuffer());
        const ammoInstance = await Ammo({
            wasmBinary,
            printErr: (message: unknown) => {
                const text = String(message);
                if (
                    text.includes("wasm streaming compile failed") ||
                    text.includes("falling back to ArrayBuffer instantiation")
                ) {
                    return;
                }
                console.warn(text);
            },
        });
        const plugin = new MmdAmmoJSPlugin(true, ammoInstance);
        this.installAmmoStepTiming(plugin);
        this.disposeClassicResources();
        this.physicsPlugin = plugin;
        this.applySimulationRate();
        this.scene.enablePhysics(new Vector3(0, -this.gravityAcceleration, 0), plugin);

        this.bulletPhysicsRuntime = null;
        this.physicsRuntime = new MmdAmmoPhysics(this.scene);
        (this.runtime as unknown as { _physics: MmdAmmoPhysics | null })._physics = this.physicsRuntime;
        this.backend = "ammo";
    }

    private applySimulationRate(): void {
        const fixedTimeStep = 1 / this.simulationRateHz;
        const maxSubSteps = this.simulationRateHz;
        if (this.bulletPhysicsRuntime) {
            this.bulletPhysicsRuntime.fixedTimeStep = fixedTimeStep;
            this.bulletPhysicsRuntime.maxSubSteps = maxSubSteps;
        }
        if (this.runtime instanceof MmdWasmRuntime) {
            const wasmPhysics = this.runtime.physics;
            if (wasmPhysics) {
                wasmPhysics.fixedTimeStep = fixedTimeStep;
                wasmPhysics.maxSubSteps = maxSubSteps;
            }
        }
        if (this.physicsPlugin) {
            this.physicsPlugin.setMaxSteps(maxSubSteps);
            this.physicsPlugin.setFixedTimeStep(fixedTimeStep);
        }
    }

    private applyGravity(): void {
        const direction = this.gravityDirection.clone();
        if (direction.lengthSquared() < 1e-6) {
            direction.set(0, -1, 0);
        } else {
            direction.normalize();
        }
        const gravity = direction.scale(this.gravityAcceleration);
        if (this.bulletPhysicsRuntime) {
            this.bulletPhysicsRuntime.setGravity(gravity);
            return;
        }
        if (this.runtime instanceof MmdWasmRuntime) {
            this.runtime.physics?.setGravity(gravity);
            return;
        }

        const physicsEngine = this.scene.getPhysicsEngine();
        if (!physicsEngine) return;
        physicsEngine.setGravity(gravity);
    }

    private installBulletStepTiming(runtime: MultiPhysicsRuntime): void {
        const originalAfterAnimations = runtime.afterAnimations.bind(runtime);
        runtime.afterAnimations = (deltaTime: number): void => {
            const startMs = performance.now();
            try {
                originalAfterAnimations(deltaTime);
            } finally {
                this.recordStepDuration(performance.now() - startMs);
            }
        };
    }

    private installAmmoStepTiming(plugin: MmdAmmoJSPlugin): void {
        const pluginWithStep = plugin as unknown as {
            _stepSimulation?: (timeStep?: number, maxSteps?: number, fixedTimeStep?: number) => void;
        };
        if (typeof pluginWithStep._stepSimulation !== "function") return;

        const originalStepSimulation = pluginWithStep._stepSimulation.bind(plugin);
        pluginWithStep._stepSimulation = (timeStep = 1 / 60, maxSteps = 10, fixedTimeStep = 1 / 60): void => {
            const startMs = performance.now();
            try {
                originalStepSimulation(timeStep, maxSteps, fixedTimeStep);
            } finally {
                this.recordStepDuration(performance.now() - startMs);
            }
        };
    }

    private recordStepDuration(durationMs: number): void {
        if (!Number.isFinite(durationMs) || durationMs < 0) return;

        this.stepTimingStats.samples += 1;
        this.stepTimingStats.totalMs += durationMs;
        this.stepTimingStats.maxMs = Math.max(this.stepTimingStats.maxMs, durationMs);
        this.stepTimingStats.lastMs = durationMs;
    }

    private consumeStepTimingStats(): {
        samples: number;
        avgMs: number | null;
        maxMs: number | null;
        lastMs: number | null;
    } {
        const { samples, totalMs, maxMs, lastMs } = this.stepTimingStats;
        this.stepTimingStats = {
            samples: 0,
            totalMs: 0,
            maxMs: 0,
            lastMs,
        };
        return {
            samples,
            avgMs: samples > 0 ? totalMs / samples : null,
            maxMs: samples > 0 ? maxMs : null,
            lastMs,
        };
    }

    private formatStepTimingValue(valueMs: number | null): number | null {
        if (valueMs === null || !Number.isFinite(valueMs)) return null;
        return Math.round(valueMs * 1000) / 1000;
    }

    private setBulletEvaluationType(evaluationType: PhysicsRuntimeEvaluationType, reason: string): void {
        if (!this.bulletPhysicsRuntime) return;
        if (this.bulletEvaluationType === evaluationType && this.bulletPhysicsRuntime.evaluationType === evaluationType) {
            return;
        }

        try {
            this.bulletPhysicsRuntime.evaluationType = evaluationType;
            this.bulletEvaluationType = evaluationType;
            logInfo("physics", "Bullet physics evaluation type changed", {
                evaluationType: this.getEvaluationTypeLabel(),
                reason,
            });
        } catch (err: unknown) {
            logWarn("physics", "Failed to change Bullet physics evaluation type", {
                evaluationType: evaluationType === PhysicsRuntimeEvaluationType.Buffered ? "Buffered" : "Immediate",
                reason,
                ...toLogErrorData(err),
            });
        }
    }

    private disposeClassicResources(): void {
        if (this.bulletPhysicsRuntime) {
            this.bulletPhysicsRuntime.unregister();
            this.bulletPhysicsRuntime.dispose();
            this.bulletPhysicsRuntime = null;
        }
        if (this.scene.getPhysicsEngine()) {
            this.scene.disablePhysicsEngine();
        }
        if (!(this.runtime instanceof MmdWasmRuntime)) {
            (this.runtime as unknown as { _physics: MmdAmmoPhysics | MmdBulletPhysics | null })._physics = null;
        }
        this.physicsPlugin = null;
        this.physicsRuntime = null;
        if (this.backend !== "wasm-mpr") {
            this.backend = "none";
        }
    }

    public static normalizeSimulationRate(value: number): PhysicsSimulationRateHz {
        if (value === 30 || value === 120) {
            return value;
        }
        return 60;
    }

    public static getBackendLabelForBackend(backend: PhysicsBackend): PhysicsBackendLabel {
        if (backend === "bullet-mpr") {
            return "Bullet MPR";
        }
        if (backend === "bullet-spr") {
            return "Bullet SPR";
        }
        if (backend === "wasm-mpr") {
            return "WASM MPR";
        }
        if (backend === "ammo") {
            return "Ammo";
        }
        return "Off";
    }
}
