"""姿勢ブリッジのバイナリ wire 形式を解釈する。

レイアウトは src/shared/pose-bridge-protocol.ts と対になっている。
"""

from __future__ import annotations

import struct

import numpy as np

MAGIC = b"MMDP"
VERSION = 1
STRIDE = 7
HEADER_BYTES = 24

# offset 4 以降のヘッダ本体（< = little-endian）。
_HEADER = struct.Struct("<HHiIHHHH")


def parse_pose(body: bytes) -> dict:
    """バイナリ応答を {frame, count, stride, rows, timings} に変換する。"""
    if len(body) < HEADER_BYTES or body[:4] != MAGIC:
        raise ValueError("pose bridge: 不正なバイナリヘッダ")

    version, count, frame, stride, step_ms, read_ms, ipc_ms, _reserved = _HEADER.unpack_from(body, 4)
    if version != VERSION:
        raise ValueError(f"pose bridge: 未対応のバージョン {version}")

    expected_bytes = HEADER_BYTES + count * stride * 4
    if len(body) < expected_bytes:
        raise ValueError("pose bridge: データが不足しています")

    rows = np.frombuffer(body, dtype="<f4", count=count * stride, offset=HEADER_BYTES).reshape(count, stride)
    return {
        "frame": frame,
        "count": count,
        "stride": stride,
        "rows": rows,
        "timings": {"stepMs": step_ms, "readMs": read_ms, "ipcMs": ipc_ms},
    }
