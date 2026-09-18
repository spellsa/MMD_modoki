"""MMD_modoki 姿勢ブリッジへの最小 HTTP クライアント。"""

from __future__ import annotations

import json
import urllib.error
import urllib.request

DEFAULT_SERVER_URL = "http://127.0.0.1:46080"


class BridgeError(RuntimeError):
    pass


def _request(url: str, method: str = "GET", payload=None, timeout: float = 30.0):
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:  # サーバが返したエラー本文を拾う
        detail = exc.read().decode("utf-8", errors="replace")
        raise BridgeError(f"HTTP {exc.code}: {detail}") from exc
    except OSError as exc:
        raise BridgeError(f"接続できません: {exc}") from exc
    parsed = json.loads(body) if body else {}
    if isinstance(parsed, dict) and "result" in parsed:
        return parsed["result"]
    return parsed


def health(server_url: str = DEFAULT_SERVER_URL):
    return _request(server_url.rstrip("/") + "/health")


def pose(server_url: str, frame: int, timeout: float = 30.0):
    return _request(server_url.rstrip("/") + "/pose", method="POST", payload={"frame": int(frame)}, timeout=timeout)
