"""MMD modoki Sync — MMD_modoki の最終ボーン姿勢を mmd_tools の Armature へ同期する。

方針:
- 姿勢の正解は常に MMD_modoki。Blender 側の MMD モデルは「表示・レンダリング専用」。
- そのため接続時に、対象 Armature を mmd_tools の IK / 付与 / 制限 / 追従を使わない
  「制約をミュートし Action を外した状態」にしてから、MMD_modoki の最終値を流し込む。
- 自動同期は frame_change_post で行い、「接続中」のときだけ動かす。
  このハンドラはファイル読み込みで外れるため、@persistent 化し load_post でも再登録する。
"""

import os
import tempfile
import time

import bpy
from bpy.app.handlers import persistent
from bpy.props import BoolProperty, FloatProperty, PointerProperty, StringProperty
from bpy.types import Operator, Panel, PropertyGroup

from . import apply as apply_mod
from . import client

LOG_PATH = os.path.join(tempfile.gettempdir(), "mmd_modoki_sync.log")
_debug_log_enabled = True


def _log(message: str) -> None:
    """デバッグログが有効なときだけ、時刻付きで 1 行追記する。"""
    if not _debug_log_enabled:
        return
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as handle:
            handle.write(f"{time.strftime('%H:%M:%S')} {message}\n")
    except OSError:
        # ログ出力の失敗で同期自体を止めない。
        pass


def _target_armature(settings):
    """同期対象として有効な Armature を返す。未指定・型違いは None。"""
    armature = settings.target_armature
    if armature is None or armature.type != "ARMATURE":
        return None
    return armature


def _prepare_armature(settings) -> None:
    """同期対象を「表示専用」に整える（制約ミュート + Action 解除）。"""
    armature = _target_armature(settings)
    if armature is None:
        return
    muted = apply_mod.prepare_armature_for_sync(armature)
    settings.status = f"同期の準備完了: 制約ミュート {muted}"


def _apply_frame(settings, frame: int) -> int:
    """指定フレームの姿勢を取得して Armature へ適用し、適用ボーン数を返す。"""
    armature = _target_armature(settings)
    if armature is None:
        raise RuntimeError("対象の Armature を指定してください")
    # mmd_tools が制約を戻していても効かないよう、適用前に毎回ミュートする。
    apply_mod.prepare_armature_for_sync(armature)
    data = client.pose(settings.server_url, frame)
    bones = (data or {}).get("bones") or []
    return apply_mod.apply_pose(armature, bones, settings.scale)


def _on_target_armature_changed(settings, context):
    if settings.connected:
        _prepare_armature(settings)


def _on_debug_log_changed(settings, context):
    global _debug_log_enabled
    _debug_log_enabled = settings.debug_log


class MMD_MODOKI_SYNC_Settings(PropertyGroup):
    server_url: StringProperty(
        name="Server URL",
        description="MMD_modoki の姿勢ブリッジ URL",
        default=client.DEFAULT_SERVER_URL,
    )
    target_armature: PointerProperty(
        name="Armature",
        description="同期対象の mmd_tools Armature",
        type=bpy.types.Object,
        poll=lambda self, obj: obj.type == "ARMATURE",
        update=_on_target_armature_changed,
    )
    connected: BoolProperty(
        name="Connected",
        description="MMD_modoki へ接続中かどうか（内部状態）",
        default=False,
    )
    scale: FloatProperty(
        name="Scale",
        description="MMD 単位→Blender のスケール（mmd_tools の読み込み倍率に合わせる）",
        default=0.08,
        min=0.0001,
        soft_max=1.0,
    )
    debug_log: BoolProperty(
        name="Debug Log",
        description="調査用ログをファイルへ出力する",
        default=True,
        update=_on_debug_log_changed,
    )
    status: StringProperty(name="Status", default="未接続")


class MMD_MODOKI_OT_connect(Operator):
    bl_idname = "mmd_modoki_sync.connect"
    bl_label = "接続"
    bl_description = "MMD_modoki へ接続し、同期を開始する"

    def execute(self, context):
        settings = context.scene.mmd_modoki_sync
        try:
            info = client.health(settings.server_url) or {}
        except Exception as exc:  # noqa: BLE001 - UI に表示するため広く捕捉
            settings.connected = False
            settings.status = f"接続失敗: {exc}"
            self.report({"ERROR"}, settings.status)
            return {"CANCELLED"}

        settings.connected = True
        _prepare_armature(settings)
        model_count = len(info.get("models") or [])
        settings.status = f"接続OK: モデル{model_count}件 / frame={info.get('frame')}"
        _log("connected")
        return {"FINISHED"}


class MMD_MODOKI_OT_disconnect(Operator):
    bl_idname = "mmd_modoki_sync.disconnect"
    bl_label = "切断"
    bl_description = "MMD_modoki との接続を切り、同期を停止する"

    def execute(self, context):
        settings = context.scene.mmd_modoki_sync
        settings.connected = False
        settings.status = "切断しました"
        _log("disconnected")
        return {"FINISHED"}


class MMD_MODOKI_OT_clear_log(Operator):
    bl_idname = "mmd_modoki_sync.clear_log"
    bl_label = "ログをクリア"
    bl_description = "調査用ログを空にする"

    def execute(self, context):
        try:
            with open(LOG_PATH, "w", encoding="utf-8"):
                pass
        except OSError as exc:
            self.report({"ERROR"}, str(exc))
            return {"CANCELLED"}
        self.report({"INFO"}, f"ログをクリア: {LOG_PATH}")
        return {"FINISHED"}


class MMD_MODOKI_PT_panel(Panel):
    bl_label = "MMD modoki Sync"
    bl_idname = "MMD_MODOKI_PT_panel"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "MMD modoki"

    def draw(self, context):
        layout = self.layout
        settings = context.scene.mmd_modoki_sync

        layout.prop(settings, "server_url")
        layout.prop(settings, "target_armature")
        layout.prop(settings, "scale")

        connection_row = layout.row(align=True)
        connection_row.operator("mmd_modoki_sync.connect")
        connection_row.operator("mmd_modoki_sync.disconnect")

        state_text = "接続中" if settings.connected else "未接続"
        layout.label(text=f"状態: {state_text}")

        layout.separator()
        layout.prop(settings, "debug_log")
        if settings.debug_log:
            layout.operator("mmd_modoki_sync.clear_log")
            layout.label(text=f"log: {LOG_PATH}")

        layout.label(text=settings.status)


_classes = (
    MMD_MODOKI_SYNC_Settings,
    MMD_MODOKI_OT_connect,
    MMD_MODOKI_OT_disconnect,
    MMD_MODOKI_OT_clear_log,
    MMD_MODOKI_PT_panel,
)


@persistent
def _on_frame_change(scene=None, depsgraph=None, *args):
    """フレーム変更ごとに、その時点の MMD_modoki 姿勢を Armature へ反映する。"""
    # 再生中は bpy.context.scene が信頼できないため、渡された scene を使う。
    target_scene = scene if scene is not None else bpy.context.scene
    settings = getattr(target_scene, "mmd_modoki_sync", None)
    if settings is None or not settings.connected:
        return
    if _target_armature(settings) is None:
        return

    started = time.perf_counter()
    try:
        applied = _apply_frame(settings, target_scene.frame_current)
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        _log(f"applied frame={target_scene.frame_current} bones={applied} ms={elapsed_ms}")
    except Exception as exc:  # noqa: BLE001 - ハンドラから例外を漏らさない
        settings.status = f"同期失敗: {exc}"
        _log(f"error frame={target_scene.frame_current} {exc!r}")


@persistent
def _on_load_post(*args):
    """ファイル読み込みで外れた frame_change_post を再登録する。"""
    if _on_frame_change not in bpy.app.handlers.frame_change_post:
        bpy.app.handlers.frame_change_post.append(_on_frame_change)
    _log("load_post: frame handler re-registered")


def register():
    global _debug_log_enabled
    _debug_log_enabled = True
    for cls in _classes:
        bpy.utils.register_class(cls)
    bpy.types.Scene.mmd_modoki_sync = PointerProperty(type=MMD_MODOKI_SYNC_Settings)
    if _on_frame_change not in bpy.app.handlers.frame_change_post:
        bpy.app.handlers.frame_change_post.append(_on_frame_change)
    if _on_load_post not in bpy.app.handlers.load_post:
        bpy.app.handlers.load_post.append(_on_load_post)


def unregister():
    for handler in (_on_frame_change, _on_load_post):
        if handler in bpy.app.handlers.frame_change_post:
            bpy.app.handlers.frame_change_post.remove(handler)
        if handler in bpy.app.handlers.load_post:
            bpy.app.handlers.load_post.remove(handler)
    del bpy.types.Scene.mmd_modoki_sync
    for cls in reversed(_classes):
        bpy.utils.unregister_class(cls)


if __name__ == "__main__":
    register()
