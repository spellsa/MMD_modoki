import type { AppLogData, AppLogScope } from "./types";

export function toLogErrorData(err: unknown): AppLogData {
    if (err instanceof Error) {
        return {
            error: {
                name: err.name,
                message: err.message,
                stack: err.stack,
            },
        };
    }
    return {
        error: {
            message: String(err),
        },
    };
}

function writeRendererLog(
    level: "debug" | "info" | "warn" | "error",
    scope: AppLogScope,
    message: string,
    data?: AppLogData,
): void {
    try {
        const api = window.electronAPI;
        if (level === "debug") api.logDebug(scope, message, data);
        else if (level === "info") api.logInfo(scope, message, data);
        else if (level === "warn") api.logWarn(scope, message, data);
        else api.logError(scope, message, data);
    } catch {
        // Logging must not affect editor behavior.
    }
}

export function logDebug(scope: AppLogScope, message: string, data?: AppLogData): void {
    writeRendererLog("debug", scope, message, data);
}

export function logInfo(scope: AppLogScope, message: string, data?: AppLogData): void {
    writeRendererLog("info", scope, message, data);
}

export function logWarn(scope: AppLogScope, message: string, data?: AppLogData): void {
    writeRendererLog("warn", scope, message, data);
}

export function logError(scope: AppLogScope, message: string, data?: AppLogData): void {
    writeRendererLog("error", scope, message, data);
}
