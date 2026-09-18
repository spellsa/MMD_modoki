"""同期対象の Armature を「表示専用」にし、MMD_modoki の姿勢を適用する。

- prepare(): mmd_tools の IK / 付与 / 制限 / 追従を止め、Action を外す。
- set_bone_names(): 接続時に一度だけ BoneConverter を作り、名前の並びでキャッシュする。
- apply(): 受信した平坦な姿勢データを matrix_basis へ流し込む。

MMD_modoki が返すのは、rest 相対ローカル位置 + ローカル回転クォータニオン。
変換式は mmd_tools の VPD インポーター（BoneConverter）と同じものを使う。
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


class SyncTarget:
    """1つの Armature への同期。converter は set_bone_names で一度だけ作る。"""

    def __init__(self, armature, scale: float):
        self.armature = armature
        self.scale = scale
        self._targets = []  # bone_names と同じ並び: (pose_bone, BoneConverter) または None

    def prepare(self) -> int:
        """姿勢制約をミュートし Action を外す。ミュートした制約数を返す。"""
        muted = 0
        for pose_bone in self.armature.pose.bones:
            for constraint in pose_bone.constraints:
                if not constraint.mute:
                    constraint.mute = True
                    muted += 1
        if self.armature.animation_data is not None:
            self.armature.animation_data.action = None
        return muted

    def set_bone_names(self, names) -> int:
        """ボーン名テーブル（/bones の並び）どおりに converter を構築し、一致数を返す。"""
        pose_bone_by_name = {}
        for pose_bone in self.armature.pose.bones:
            pose_bone_by_name.setdefault(bone_match_name(pose_bone), pose_bone)

        targets = []
        matched = 0
        for name in names:
            pose_bone = pose_bone_by_name.get(name)
            if pose_bone is None:
                targets.append(None)
                continue
            targets.append((pose_bone, BoneConverter(pose_bone, self.scale)))
            matched += 1
        self._targets = targets
        return matched

    def apply(self, rows) -> int:
        """protocol.parse_pose の rows（index が bone_names と同順）を適用する。"""
        applied = 0
        for index in range(len(rows)):
            target = self._targets[index] if index < len(self._targets) else None
            if target is None:
                continue
            pose_bone, converter = target
            row = rows[index].tolist()
            location = converter.convert_location(row[0:3])
            rotation = converter.convert_rotation(row[3:7])
            pose_bone.matrix_basis = Matrix.Translation(location) @ rotation.to_matrix().to_4x4()
            applied += 1
        return applied
