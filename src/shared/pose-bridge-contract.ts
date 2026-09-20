// 姿勢ブリッジの IPC 契約（Main ⇄ Renderer）。
//
// プロセス間HTTPの形式は pose-bridge-protocol.ts 側。ここは
// preload で公開する API と、Main/Renderer 間でやり取りする型だけを扱う。

export type PoseBridgeModelSummary = {
    index: number;
    instanceId: string;
    name: string;
    active: boolean;
};

export type PoseBridgeCommand = "health" | "bones" | "playback" | "pose";

export type PoseBridgeRequest = {
    requestId: string;
    command: PoseBridgeCommand;
    payload: Record<string, unknown>;
};

export type PoseBridgeReply = {
    requestId: string;
    result?: unknown;
    error?: string;
};

/** preload で contextBridge に公開する API。 */
export type PoseBridgeApi = {
    onRequest: (callback: (request: PoseBridgeRequest) => void) => () => void;
    reply: (reply: PoseBridgeReply) => void;
};
