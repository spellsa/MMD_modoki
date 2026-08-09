import { describe, expect, it } from "vitest";
import type {
    PngEncodeRequest,
    PngEncodeResponse,
    PngEncodeSuccess,
} from "./png-encoder-protocol";
import {
    PngEncoderWebWorkerPool,
    type PngEncoderWorkerLike,
} from "./png-encoder-web-worker-pool";

class FakePngEncoderWorker implements PngEncoderWorkerLike {
    onmessage: ((event: { data: PngEncodeResponse }) => void) | null = null;
    onerror: ((event: { message?: string; preventDefault?: () => void }) => void) | null = null;
    onmessageerror: ((event: unknown) => void) | null = null;
    readonly requests: PngEncodeRequest[] = [];
    terminated = false;

    postMessage(message: PngEncodeRequest): void {
        this.requests.push(message);
    }

    terminate(): void {
        this.terminated = true;
    }

    succeed(requestIndex = this.requests.length - 1): PngEncodeSuccess {
        const request = this.requests[requestIndex];
        const pngBuffer = new Uint8Array([request.width, request.height]).buffer;
        const response: PngEncodeSuccess = {
            type: "success",
            taskId: request.taskId,
            pngBuffer,
            byteLength: pngBuffer.byteLength,
            filterStrategy: "none",
            encodeMs: 4,
            filterMs: 1,
            deflateMs: 2,
            assembleMs: 1,
        };
        this.onmessage?.({ data: response });
        return response;
    }
}

const createPool = (size: number) => {
    const workers: FakePngEncoderWorker[] = [];
    const pool = new PngEncoderWebWorkerPool({
        size,
        timeoutMs: 5_000,
        workerFactory: () => {
            const worker = new FakePngEncoderWorker();
            workers.push(worker);
            return worker;
        },
    });
    return { pool, workers };
};

describe("PngEncoderWebWorkerPool", () => {
    it("runs two jobs concurrently and resolves out-of-order results", async () => {
        const { pool, workers } = createPool(2);
        const first = pool.encode(new Uint8Array([1, 2, 3, 4]), 1, 1);
        const second = pool.encode(new Uint8Array([5, 6, 7, 8]), 1, 1);

        expect(workers).toHaveLength(2);
        expect(workers[0].requests).toHaveLength(1);
        expect(workers[1].requests).toHaveLength(1);

        workers[1].succeed();
        expect([...(await second).pngBuffer]).toEqual([1, 1]);
        workers[0].succeed();
        expect([...(await first).pngBuffer]).toEqual([1, 1]);

        const diagnostics = pool.getDiagnostics();
        expect(diagnostics.activeRawBytes).toBe(0);
        expect(diagnostics.activeRawBytesPeak).toBe(8);
        pool.terminate();
    });

    it("dispatches a queued job after the active worker completes", async () => {
        const { pool, workers } = createPool(1);
        const first = pool.encode(new Uint8Array([1, 2, 3, 4]), 1, 1);
        const second = pool.encode(new Uint8Array([5, 6, 7, 8]), 1, 1);

        expect(workers[0].requests).toHaveLength(1);
        expect(pool.getDiagnostics().queuedRawBytesPeak).toBe(4);
        workers[0].succeed(0);
        await first;
        expect(workers[0].requests).toHaveLength(2);
        workers[0].succeed(1);
        await second;
        pool.terminate();
    });

    it("rejects active and queued jobs when terminated", async () => {
        const { pool, workers } = createPool(1);
        const first = pool.encode(new Uint8Array([1, 2, 3, 4]), 1, 1);
        const second = pool.encode(new Uint8Array([5, 6, 7, 8]), 1, 1);
        const firstExpectation = expect(first).rejects.toThrow("terminated");
        const secondExpectation = expect(second).rejects.toThrow("terminated");

        pool.terminate();

        await firstExpectation;
        await secondExpectation;
        expect(workers[0].terminated).toBe(true);
    });
});
