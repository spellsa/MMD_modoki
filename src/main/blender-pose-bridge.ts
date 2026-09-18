// Blender アドオン向けの最小 localhost HTTP ブリッジ（Mainプロセス）。
//
// 環境変数 MMD_MODOKI_POSE_BRIDGE=1 のときだけ起動する（既定は無効）。
// Blender Python から urllib でそのまま叩ける。
//
//   GET  /health -> JSON: 起動状態と現在フレーム
//   GET  /bones  -> JSON: ボーン名テーブル（接続時に一度だけ）
//   POST /pose   -> バイナリ: 指定フレームの最終ボーン姿勢（物理込み）
//
// 役割は transport に限定する。wire形式は pose-bridge-protocol.ts が定義する。

import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ipcMain, type BrowserWindow } from "electron";
import type { PoseBridgeCommand, PoseBridgeReply, PoseBridgeRequest } from "../shared/pose-bridge-contract";
import {
    POSE_BRIDGE_HEADER_BYTES,
    POSE_BRIDGE_STRIDE,
    writePoseBridgeHeader,
} from "../shared/pose-bridge-protocol";

const DEFAULT_PORT = 46080;
const MAX_BODY_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

type PendingRequest = {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
};

export type PoseBridgeLogger = (message: string, data?: Record<string, unknown>) => void;

export type BlenderPoseBridge = {
    /** ウィンドウを対象として登録する。複数ウィンドウ時は先頭の生きているものを使う。 */
    register(window: BrowserWindow): void;
    stop(): void;
    readonly endpoint: string;
};

function parsePort(raw: string | undefined): number {
    if (!raw) return DEFAULT_PORT;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1 || value > 65535) return DEFAULT_PORT;
    return value;
}

function sendJson(response: ServerResponse, status: number, body: unknown): number {
    const text = JSON.stringify(body);
    const byteLength = Buffer.byteLength(text);
    response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": byteLength,
        "Cache-Control": "no-store",
    });
    response.end(text);
    return byteLength;
}

function sendBinary(response: ServerResponse, body: Buffer): number {
    response.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": body.byteLength,
        "Cache-Control": "no-store",
    });
    response.end(body);
    return body.byteLength;
}

function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks: Buffer[] = [];
        request.on("data", chunk => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                reject(new Error("リクエストボディが大きすぎます"));
                request.destroy();
                return;
            }
            chunks.push(chunk);
        });
        request.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf-8").trim();
            if (text.length === 0) {
                resolve({});
                return;
            }
            try {
                const parsed: unknown = JSON.parse(text);
                if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                    reject(new Error("JSONオブジェクトを指定してください"));
                    return;
                }
                resolve(parsed as Record<string, unknown>);
            } catch {
                reject(new Error("JSONの解析に失敗しました"));
            }
        });
        request.on("error", reject);
    });
}

type PoseResultLike = {
    frame?: unknown;
    data?: unknown;
    timings?: { stepMs?: number; readMs?: number };
};

function encodePoseResponse(result: unknown, ipcMs: number): Buffer {
    const pose = (result ?? {}) as PoseResultLike;
    const data = pose.data;
    if (!(data instanceof Float32Array)) {
        throw new Error("pose データがありません");
    }
    const boneCount = Math.floor(data.length / POSE_BRIDGE_STRIDE);

    const header = new Uint8Array(POSE_BRIDGE_HEADER_BYTES);
    writePoseBridgeHeader(new DataView(header.buffer), {
        boneCount,
        frame: Number(pose.frame ?? 0),
        stepMs: pose.timings?.stepMs,
        readMs: pose.timings?.readMs,
        ipcMs,
    });

    const dataBytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    return Buffer.concat([Buffer.from(header.buffer), dataBytes]);
}

export function installBlenderPoseBridge(log: PoseBridgeLogger): BlenderPoseBridge | null {
    if (process.env.MMD_MODOKI_POSE_BRIDGE !== "1") return null;

    const port = parsePort(process.env.MMD_MODOKI_POSE_BRIDGE_PORT);
    const pending = new Map<string, PendingRequest>();
    const targets = new Set<BrowserWindow>();

    ipcMain.on("pose-bridge:reply", (event, reply: PoseBridgeReply) => {
        if (!reply || typeof reply.requestId !== "string") return;
        if (![...targets].some(window => window.webContents.id === event.sender.id)) return;
        const entry = pending.get(reply.requestId);
        if (!entry) return;
        pending.delete(reply.requestId);
        clearTimeout(entry.timer);
        if (typeof reply.error === "string" && reply.error.length > 0) {
            entry.reject(new Error(reply.error));
        } else {
            entry.resolve(reply.result);
        }
    });

    const dispatch = (command: PoseBridgeCommand, payload: Record<string, unknown>): Promise<unknown> => {
        const window = [...targets].find(candidate => !candidate.isDestroyed());
        if (!window) {
            return Promise.reject(new Error("MMD_modoki のウィンドウがありません"));
        }
        const requestId = randomUUID();
        return new Promise<unknown>((resolve, reject) => {
            const timer = setTimeout(() => {
                pending.delete(requestId);
                reject(new Error(`応答がタイムアウトしました: ${command}`));
            }, REQUEST_TIMEOUT_MS);
            timer.unref?.();
            pending.set(requestId, { resolve, reject, timer });
            const request: PoseBridgeRequest = { requestId, command, payload };
            window.webContents.send("pose-bridge:request", request);
        });
    };

    const server = createServer((request, response) => {
        void (async () => {
            try {
                const hostName = (request.headers.host ?? "").replace(/:\d+$/, "");
                if (hostName !== "127.0.0.1" && hostName !== "localhost") {
                    sendJson(response, 403, { error: "localhost からのみ利用できます" });
                    return;
                }
                if (request.headers.origin) {
                    sendJson(response, 403, { error: "ブラウザからのアクセスは許可されていません" });
                    return;
                }

                const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
                if (request.method === "GET" && path === "/health") {
                    sendJson(response, 200, { result: await dispatch("health", {}) });
                    return;
                }
                if (request.method === "GET" && path === "/bones") {
                    sendJson(response, 200, { result: await dispatch("bones", {}) });
                    return;
                }
                if (request.method === "POST" && path === "/pose") {
                    const body = await readJsonBody(request);
                    const started = performance.now();
                    const result = await dispatch("pose", body);
                    const ipcMs = Math.round(performance.now() - started);
                    const bytes = sendBinary(response, encodePoseResponse(result, ipcMs));
                    log("pose timing", { ipcMs, bytes });
                    return;
                }
                sendJson(response, 404, { error: "not found" });
            } catch (error) {
                sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
            }
        })();
    });

    server.on("error", error => {
        log("pose bridge server error", { message: error instanceof Error ? error.message : String(error) });
    });

    const endpoint = `http://127.0.0.1:${port}`;
    server.listen(port, "127.0.0.1", () => {
        log("pose bridge listening", { endpoint });
    });

    return {
        endpoint,
        register(window) {
            targets.add(window);
            window.on("closed", () => {
                targets.delete(window);
            });
        },
        stop() {
            for (const entry of pending.values()) {
                clearTimeout(entry.timer);
                entry.reject(new Error("bridge stopped"));
            }
            pending.clear();
            server.close();
        },
    };
}
