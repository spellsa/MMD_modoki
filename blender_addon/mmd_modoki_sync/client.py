"""MMD_modoki 姿勢ブリッジへの最小 HTTP クライアント。"""

from __future__ import annotations

import json
import urllib.error
import urllib.request

from . import protocol

DEFAULT_SERVER_URL = "http://127.0.0.1:46080"


class BridgeError(RuntimeError):
    pass


def _open(url: str, *, method: str = "GET", payload=None, timeout: float = 30.0) -> bytes:
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise BridgeError(f"HTTP {exc.code}: {detail}") from exc
    except OSError as exc:
        raise BridgeError(f"接続できません: {exc}") from exc


def _request_json(url: str) -> dict:
    body = _open(url)
    parsed = json.loads(body.decode("utf-8")) if body else {}
    if isinstance(parsed, dict) and "error" in parsed:
        raise BridgeError(str(parsed["error"]))
    return parsed.get("result") if isinstance(parsed, dict) else parsed


def _post_json(url: str, payload: dict) -> dict:
    body = _open(url, method="POST", payload=payload)
    parsed = json.loads(body.decode("utf-8")) if body else {}
    if isinstance(parsed, dict) and "error" in parsed:
        raise BridgeError(str(parsed["error"]))
    return parsed.get("result") if isinstance(parsed, dict) else parsed


def health(server_url: str = DEFAULT_SERVER_URL) -> dict:
    return _request_json(server_url.rstrip("/") + "/health")


def bones(server_url: str = DEFAULT_SERVER_URL) -> dict:
    return _request_json(server_url.rstrip("/") + "/bones")


def playback(
    server_url: str = DEFAULT_SERVER_URL,
    playing: bool = True,
    frame: int | None = None,
    frame_start: int | None = None,
    frame_end: int | None = None,
) -> dict:
    payload = {"playing": bool(playing)}
    if frame is not None:
        payload["frame"] = int(frame)
    if frame_start is not None:
        payload["frameStart"] = int(frame_start)
    if frame_end is not None:
        payload["frameEnd"] = int(frame_end)
    return _post_json(server_url.rstrip("/") + "/playback", payload)


def pose(server_url: str, frame: int, *, timeout: float = 30.0) -> dict:
    body = _open(server_url.rstrip("/") + "/pose", method="POST", payload={"frame": int(frame)}, timeout=timeout)
    return protocol.parse_pose(body)
