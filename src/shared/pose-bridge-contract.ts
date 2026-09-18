// Blender 連携ブリッジの共有型。
// Main プロセスの簡易 HTTP サーバと Renderer の姿勢取得処理の間で使う。
// 姿勢は rest 相対ローカル位置 + ローカル回転クォータニオンで受け渡す。

export type PoseBridgeBonePose = {
    /** PMX ボーン名。Blender 側の Armature ボーン名と一致する。 */
    name: string;
    /** rest 相対のローカル位置。(x, y, z) */
    position: [number, number, number];
    /** ローカル回転クォータニオン。(x, y, z, w) */
    rotation: [number, number, number, number];
};

export type PoseBridgeModelSummary = {
    index: number;
    instanceId: string;
    name: string;
    active: boolean;
};

export type PoseBridgeCommand = "health" | "pose";

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
