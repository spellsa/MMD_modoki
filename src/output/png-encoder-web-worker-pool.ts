import type {
    PngEncodeRequest,
    PngEncodeResponse,
    PngEncodeSuccess,
} from "./png-encoder-protocol";

export interface PngEncoderWorkerLike {
    onmessage: ((event: { data: PngEncodeResponse }) => void) | null;
    onerror: ((event: { message?: string; preventDefault?: () => void }) => void) | null;
    onmessageerror: ((event: unknown) => void) | null;
    postMessage: (message: PngEncodeRequest, transfer?: ArrayBuffer[]) => void;
    terminate: () => void;
}

export interface PngEncoderPoolResult extends Omit<PngEncodeSuccess, "type" | "pngBuffer"> {
    pngBuffer: Uint8Array;
    dispatchWaitMs: number;
}

export interface PngEncoderPoolDiagnostics {
    poolSize: number;
    queuedTasks: number;
    activeTasks: number;
    queuedRawBytes: number;
    activeRawBytes: number;
    queuedRawBytesPeak: number;
    activeRawBytesPeak: number;
    workerRecreateCount: number;
}

interface PngEncoderPoolOptions {
    size?: number;
    timeoutMs?: number;
    workerFactory?: () => PngEncoderWorkerLike;
}

interface PendingTask {
    request: PngEncodeRequest;
    rawByteLength: number;
    enqueuedAt: number;
    resolve: (result: PngEncoderPoolResult) => void;
    reject: (error: Error) => void;
}

interface WorkerSlot {
    worker: PngEncoderWorkerLike | null;
    activeTask: PendingTask | null;
    timeoutId: ReturnType<typeof setTimeout> | null;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_POOL_SIZE = 4;

export const getDefaultPngEncoderWorkerCount = (): number => {
    const hardwareConcurrency = Math.max(1, Math.floor(globalThis.navigator?.hardwareConcurrency ?? 2));
    return Math.max(1, Math.min(2, hardwareConcurrency - 1));
};

const createBrowserWorker = (): PngEncoderWorkerLike => (
    new Worker(new URL("./png-encoder-web-worker.ts", import.meta.url), { type: "module" })
) as unknown as PngEncoderWorkerLike;

const validateEncodeInput = (rgba: Uint8Array, width: number, height: number): void => {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
        throw new Error(`Invalid PNG dimensions: ${width}x${height}`);
    }
    const expectedByteLength = width * height * 4;
    if (!Number.isSafeInteger(expectedByteLength) || rgba.byteLength !== expectedByteLength) {
        throw new Error(
            `RGBA byte length mismatch: expected ${expectedByteLength}, received ${rgba.byteLength}`,
        );
    }
};

const takeOwnedArrayBuffer = (rgba: Uint8Array): ArrayBuffer => {
    if (
        rgba.buffer instanceof ArrayBuffer
        && rgba.byteOffset === 0
        && rgba.byteLength === rgba.buffer.byteLength
    ) {
        return rgba.buffer;
    }
    return rgba.slice().buffer;
};

export class PngEncoderWebWorkerPool {
    readonly size: number;
    private readonly timeoutMs: number;
    private readonly workerFactory: () => PngEncoderWorkerLike;
    private readonly slots: WorkerSlot[];
    private readonly queue: PendingTask[] = [];
    private nextTaskId = 1;
    private terminated = false;
    private queuedRawBytes = 0;
    private activeRawBytes = 0;
    private queuedRawBytesPeak = 0;
    private activeRawBytesPeak = 0;
    private workerRecreateCount = 0;

    constructor(options: PngEncoderPoolOptions = {}) {
        const requestedSize = options.size ?? getDefaultPngEncoderWorkerCount();
        this.size = Math.max(1, Math.min(MAX_POOL_SIZE, Math.floor(requestedSize)));
        this.timeoutMs = Math.max(1_000, Math.floor(options.timeoutMs ?? DEFAULT_TIMEOUT_MS));
        this.workerFactory = options.workerFactory ?? createBrowserWorker;
        this.slots = Array.from({ length: this.size }, () => ({
            worker: null,
            activeTask: null,
            timeoutId: null,
        }));
    }

    encode(rgba: Uint8Array, width: number, height: number): Promise<PngEncoderPoolResult> {
        if (this.terminated) {
            return Promise.reject(new Error("PNG encoder worker pool is terminated"));
        }
        validateEncodeInput(rgba, width, height);
        const rgbaBuffer = takeOwnedArrayBuffer(rgba);
        const request: PngEncodeRequest = {
            taskId: `png-${this.nextTaskId}`,
            width,
            height,
            rgbaBuffer,
            filterStrategy: "none",
        };
        this.nextTaskId += 1;

        return new Promise<PngEncoderPoolResult>((resolve, reject) => {
            const task: PendingTask = {
                request,
                rawByteLength: rgbaBuffer.byteLength,
                enqueuedAt: performance.now(),
                resolve,
                reject,
            };
            this.queue.push(task);
            this.queuedRawBytes += task.rawByteLength;
            this.queuedRawBytesPeak = Math.max(this.queuedRawBytesPeak, this.queuedRawBytes);
            this.pump();
        });
    }

    getDiagnostics(): PngEncoderPoolDiagnostics {
        return {
            poolSize: this.size,
            queuedTasks: this.queue.length,
            activeTasks: this.slots.filter((slot) => slot.activeTask !== null).length,
            queuedRawBytes: this.queuedRawBytes,
            activeRawBytes: this.activeRawBytes,
            queuedRawBytesPeak: this.queuedRawBytesPeak,
            activeRawBytesPeak: this.activeRawBytesPeak,
            workerRecreateCount: this.workerRecreateCount,
        };
    }

    terminate(): void {
        if (this.terminated) return;
        this.terminated = true;
        const error = new Error("PNG encoder worker pool was terminated");
        while (this.queue.length > 0) {
            const task = this.queue.shift();
            if (!task) break;
            this.queuedRawBytes -= task.rawByteLength;
            task.reject(error);
        }
        for (const slot of this.slots) {
            this.clearSlotTimeout(slot);
            if (slot.activeTask) {
                this.activeRawBytes -= slot.activeTask.rawByteLength;
                slot.activeTask.reject(error);
                slot.activeTask = null;
            }
            slot.worker?.terminate();
            slot.worker = null;
        }
    }

    private pump(): void {
        if (this.terminated) return;
        for (const slot of this.slots) {
            if (slot.activeTask || this.queue.length === 0) continue;
            const task = this.queue.shift();
            if (!task) break;
            this.queuedRawBytes -= task.rawByteLength;
            this.activeRawBytes += task.rawByteLength;
            this.activeRawBytesPeak = Math.max(this.activeRawBytesPeak, this.activeRawBytes);
            slot.activeTask = task;
            const worker = this.ensureWorker(slot);
            slot.timeoutId = setTimeout(() => {
                this.failSlot(slot, new Error(`PNG encoder worker timed out: ${task.request.taskId}`), true);
            }, this.timeoutMs);
            try {
                worker.postMessage(task.request, [task.request.rgbaBuffer]);
            } catch (error: unknown) {
                this.failSlot(
                    slot,
                    error instanceof Error ? error : new Error(String(error)),
                    true,
                );
            }
        }
    }

    private ensureWorker(slot: WorkerSlot): PngEncoderWorkerLike {
        if (slot.worker) return slot.worker;
        const worker = this.workerFactory();
        worker.onmessage = (event) => {
            if (slot.worker !== worker) return;
            this.handleWorkerMessage(slot, event.data);
        };
        worker.onerror = (event) => {
            if (slot.worker !== worker) return;
            event.preventDefault?.();
            this.failSlot(slot, new Error(event.message || "PNG encoder worker failed"), true);
        };
        worker.onmessageerror = () => {
            if (slot.worker !== worker) return;
            this.failSlot(slot, new Error("PNG encoder worker message could not be decoded"), true);
        };
        slot.worker = worker;
        return worker;
    }

    private handleWorkerMessage(slot: WorkerSlot, response: PngEncodeResponse): void {
        const task = slot.activeTask;
        if (!task) return;
        if (response.taskId !== task.request.taskId) {
            this.failSlot(slot, new Error(
                `PNG encoder task mismatch: expected ${task.request.taskId}, received ${response.taskId}`,
            ), true);
            return;
        }

        this.clearSlotTimeout(slot);
        slot.activeTask = null;
        this.activeRawBytes -= task.rawByteLength;
        if (response.type === "failure") {
            task.reject(new Error(response.message));
        } else if (response.byteLength !== response.pngBuffer.byteLength) {
            task.reject(new Error(`PNG encoder byte length mismatch: ${response.taskId}`));
        } else {
            task.resolve({
                ...response,
                pngBuffer: new Uint8Array(response.pngBuffer),
                dispatchWaitMs: Math.max(0, performance.now() - task.enqueuedAt - response.encodeMs),
            });
        }
        this.pump();
    }

    private failSlot(slot: WorkerSlot, error: Error, recreate: boolean): void {
        this.clearSlotTimeout(slot);
        const task = slot.activeTask;
        slot.activeTask = null;
        if (task) {
            this.activeRawBytes -= task.rawByteLength;
            task.reject(error);
        }
        if (recreate && slot.worker) {
            slot.worker.terminate();
            slot.worker = null;
            this.workerRecreateCount += 1;
        }
        this.pump();
    }

    private clearSlotTimeout(slot: WorkerSlot): void {
        if (slot.timeoutId === null) return;
        clearTimeout(slot.timeoutId);
        slot.timeoutId = null;
    }
}
