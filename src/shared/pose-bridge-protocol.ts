// 姿勢ブリッジの「wire形式」（プロセス間HTTP）を定義する。
//
// IPC契約（pose-bridge-contract.ts）とは別物。こちらはバイト配置だけを扱う。
// 毎フレーム送るのは数値ブロックだけにし、ボーン名は接続時に別途取得する。
//
// レイアウト（すべて little-endian）:
//   offset  size  type   内容
//   0       4     char   magic "MMDP"
//   4       2     u16    version
//   6       2     u16    boneCount
//   8       4     i32    frame
//   12      4     u32    stride（1ボーンあたりのfloat数）
//   16      2     u16    stepMs（MMD_modoki側の計測。デバッグ用）
//   18      2     u16    readMs（同上）
//   20      2     u16    ipcMs（main側の計測。デバッグ用）
//   22      2     u16    reserved
//   24      N*stride*4     float32（各ボーン: px,py,pz, qx,qy,qz,qw）

export const POSE_BRIDGE_MAGIC_BYTES = [0x4d, 0x4d, 0x44, 0x50] as const; // "MMDP"
export const POSE_BRIDGE_VERSION = 1;
export const POSE_BRIDGE_STRIDE = 7;
export const POSE_BRIDGE_HEADER_BYTES = 24;

export type PoseBridgeHeader = {
    boneCount: number;
    frame: number;
    stride?: number;
    stepMs?: number;
    readMs?: number;
    ipcMs?: number;
};

function clampUint16(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(65535, Math.round(value)));
}

/** 16進のマジックを含む固定長ヘッダを DataView へ書き込む。 */
export function writePoseBridgeHeader(view: DataView, header: PoseBridgeHeader): void {
    POSE_BRIDGE_MAGIC_BYTES.forEach((byte, index) => view.setUint8(index, byte));
    view.setUint16(4, POSE_BRIDGE_VERSION, true);
    view.setUint16(6, clampUint16(header.boneCount), true);
    view.setInt32(8, Math.trunc(header.frame), true);
    view.setUint32(12, header.stride ?? POSE_BRIDGE_STRIDE, true);
    view.setUint16(16, clampUint16(header.stepMs ?? 0), true);
    view.setUint16(18, clampUint16(header.readMs ?? 0), true);
    view.setUint16(20, clampUint16(header.ipcMs ?? 0), true);
    view.setUint16(22, 0, true);
}
