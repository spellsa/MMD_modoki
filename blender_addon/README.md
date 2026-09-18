# MMD_modoki → Blender 姿勢同期（PoC）

MMD_modoki が計算した MMD モデルの最終姿勢（VMD + IK + Bullet 物理）を Blender の `mmd_tools` Armature へリアルタイムに反映する最小構成です。

- モーション・IK・髪/服などの MMD 物理は **MMD_modoki 側**で計算します。
- Blender 側は同じ PMX を `mmd_tools` で読み込み、Armature の姿勢だけを外部から受け取ります。
- 背景・カメラ・ライト・小物などは通常の Blender アニメーションのまま使えます。
- Blender 側の MMD 物理は構築しません。

## 1. MMD_modoki 側の起動

姿勢ブリッジ（localhost HTTP）は既定で無効です。環境変数を付けて起動します。

```powershell
$env:MMD_MODOKI_POSE_BRIDGE = "1"
$env:MMD_MODOKI_POSE_BRIDGE_PORT = "46080"   # 省略時 46080
npm start
```

起動後、MMD_modoki で対象の PMX と VMD を読み込み、対象モデルを選択しておきます。

HTTP（Blender から urllib で叩ける JSON）:

| Method | Path | 内容 |
| --- | --- | --- |
| GET | `/health` | 起動状態・現在フレーム・読み込みモデル一覧 |
| POST | `/pose` | `{"frame": 30}` → そのフレームの最終ボーン姿勢（物理込み） |

`/pose` は既存の WebM 出力と同じ前方向シミュレーションで物理を積算します。フレームを昇順に要求するのが最も正確です。

## 2. Blender アドオンの導入

**`blender_addon/mmd_modoki_sync.zip`** を Blender の「Install from Disk」で指定します（`blender_manifest.toml` が zip 直下にあります）。

- Blender 4.2 以降を対象にしています。
- `mmd_tools` が有効になっている必要があります（Armature は `mmd_tools` で読み込んだものを使うため）。
- `mmd_modoki_sync/` フォルダの内容を変更した場合は、同フォルダのファイルを zip 直下に固め直してください。

## 3. PMX / VMD をどちらへ読み込むか

両方に同じアセットを読み込みます。

- **Blender**: `mmd_tools` で PMX をインポート（物理は構築しなくてよい）。VMD は読み込まなくても同期できます。
- **MMD_modoki**: 同じ PMX を読み込み、同じ VMD をモーションとして読み込む。

## 4. Blender での同期手順

1. `mmd_tools` で PMX を読み込み、Armature を選択。
2. 3D View のサイドバー（N キー）→「MMD modoki」タブ。
3. `Server URL` を MMD_modoki のブリッジ URL に合わせる（既定 `http://127.0.0.1:46080`）。
4. `Armature` に対象の Armature を指定。
5. `接続` を押して「接続OK」を確認。
6. `Sync` を ON にする。
7. Blender のタイムラインを再生・フレーム送りすると、Armature が MMD_modoki の姿勢に追従します。
   - 単発で確認したいときは `現在フレームを同期` を押します。

### テスト実装: IK / 付与の無効化

Blender 側で MMD モデルを編集しない前提のテストとして、同期時に**対象 Armature の姿勢制約（IK / 付与 / 制限 / 追従）をミュートし、Action を外します**（これが無いと mmd_tools が脚の IK を再ソルブして MMD_modoki の結果とズレます）。

- `Sync` を ON にした時に自動で 1 回ミュートします。
- `テスト: IK/付与を無効化` ボタンでも手動実行できます。
- 制約はミュート（`mute=True`）するだけで削除はしません。mmd_tools のマテリアル用シャドウボーン等も止まるため、材質の見た目に影響する可能性があります（テスト用の割り切り）。
- 自動同期は `frame_change_post` で行います。このハンドラは `@persistent` 化し、さらに `load_post` で再登録するため、**ファイルを読み込んでも外れません**（外れると「手動同期は動くが再生で同期しない」症状になります）。
- 調査用ログを `%TEMP%\mmd_modoki_sync.log` に出力します。パネルの `ログをクリア` で空にできます。パネル下部にログのパスを表示します。

## 5. 実装の要点

- MMD_modoki の姿勢は、既存のボーン編集表示と同じく `getWorldMatrixToRef` から親の逆行列でローカルを再構成して取得します（物理結果を含む）。
- 物理は WebM 出力と同じ外部プレイバック経路で前方向に積算します。物理は明示的に有効化し、自動レンダーを止めて手動ステップします。
- Blender 側は `mmd_tools` の VPD 変換と同じ式で `matrix_basis` を設定します（座標系を自前導出しない）。

## 6. 現時点の制限

- `/pose` は前方向再生を優先します。大きく戻る／大きく飛ぶシークは既存の `seekTo` にフォールバックし、物理は再初期化されます。
- 同期中は MMD_modoki 側の物理を有効化し、自動レンダーを止めて手動ステップします（`/pose` のたびに描画）。同期後も物理ONのままです。
- Blender のタイムライン fps は MMD の 30fps と 1:1 を前提にしています。
- 表情（モーフ）、材質、カメラ、ライト、エフェクトは同期しません。ボーン姿勢のみです。
- 対象は 1 モデル（アクティブまたは先頭）です。複数モデル同時同期は対象外です。
- Blender 側は `matrix_basis` を直接設定するため、対象 Armature に Action がある場合はその評価後に上書きされます（キーは作成しません）。
- 認証はありません。`127.0.0.1` のみで待ち受け、既定では環境変数を付けたときだけ起動します。
- localhost 通信と JSON のため、巨大モデルでは毎フレームの転送量が大きくなります（最適化は未実施）。
