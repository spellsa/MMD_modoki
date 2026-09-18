"""MMD modoki の最終ボーン姿勢を Blender の mmd_tools Armature へ適用する。

MMD_modoki 側が返すのは VPD と同じ表現（rest 相対ローカル位置 + ローカル回転クォータニオン）。
mmd_tools の VPD インポーターが使う BoneConverter と同じ式で Blender の matrix_basis に変換する。
mmd_tools 本体のモジュールパスに依存しないよう、変換式はここに内蔵している。
"""
from __future__ import annotations

from mathutils import Matrix, Quaternion, Vector


class BoneConverter:
    """mmd_tools.core.vmd.importer.BoneConverter と同等の最小実装。"""

    def __init__(self, pose_bone, scale: float):
        mat = pose_bone.bone.matrix_local.to_3x3()
        mat[1], mat[2] = mat[2].copy(), mat[1].copy()
        self._mat = mat.transposed()
        self._scale = scale

    def convert_location(self, location) -> Vector:
        return (self._mat @ Vector(location)) * self._scale

    def convert_rotation(self, rotation_xyzw) -> Quaternion:
        x, y, z, w = rotation_xyzw
        rot = Quaternion((w, x, y, z))
        q = self._mat.to_quaternion()
        return (q @ rot @ q.conjugated()).normalized()


def bone_match_name(pose_bone) -> str:
    """PMX 由来のボーン名。mmd_tools の日本語名を優先する。"""
    mmd_bone = getattr(pose_bone, "mmd_bone", None)
    if mmd_bone is not None:
        name_j = getattr(mmd_bone, "name_j", "")
        if name_j:
            return name_j
    return pose_bone.name


def prepare_armature_for_sync(armature) -> int:
    """対象 Armature を「表示専用」にする（姿勢制約をミュートし Action を外す）。

    Blender 側で MMD モデルを動かさない前提なので、mmd_tools の IK / 付与 /
    制限 / 追従を止めて、MMD_modoki が計算した最終姿勢をそのまま使う。
    ミュートした制約数を返す。
    """
    muted = 0
    for pose_bone in armature.pose.bones:
        for constraint in pose_bone.constraints:
            if not constraint.mute:
                constraint.mute = True
                muted += 1
    if armature.animation_data is not None:
        armature.animation_data.action = None
    return muted


def apply_pose(armature, bones, scale: float) -> int:
    """bones: [{"name","position":[x,y,z],"rotation":[x,y,z,w]}, ...]

    適用したボーン数を返す。Armature 以外には触れない。
    """
    pose_by_name = {}
    for item in bones:
        name = item.get("name")
        if name:
            pose_by_name[name] = item

    applied = 0
    for pose_bone in armature.pose.bones:
        data = pose_by_name.get(bone_match_name(pose_bone))
        if data is None:
            continue
        converter = BoneConverter(pose_bone, scale)
        location = converter.convert_location(data.get("position", (0.0, 0.0, 0.0)))
        rotation = converter.convert_rotation(data.get("rotation", (0.0, 0.0, 0.0, 1.0)))
        pose_bone.matrix_basis = Matrix.Translation(location) @ rotation.to_matrix().to_4x4()
        applied += 1
    return applied
