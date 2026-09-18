# ビューポート下バー実装メモ 2026-06-01

## 目的

v0.2 UI の MMD 本家寄せとして、ビューポート下端に現在値表示バーを追加した。

このバーは、下パネルに押し込まれていたボーン / カメラの現在値を、MMD 本家に近い位置へ移すための初回スライスである。

関連する調査メモ:

- [viewport-bottom-bar-investigation-2026-05-31.md](./viewport-bottom-bar-investigation-2026-05-31.md)
- [mmd-original-bottom-panel-reference-2026-05-31.md](./mmd-original-bottom-panel-reference-2026-05-31.md)

## 現在の実装

- `ViewportBottomBarController` を追加した。
- 下バーは `#viewport-container` 内の下端に配置する。
- 上部ツールバーの Model / Camera 切替は表示から外し、下バー左端の単一ボタンを正の切替導線にした。
- 切替ボタンは現在の mode に応じて `モデル編` / `カメラ編` の表記を切り替え、押すたびに Model mode / Camera mode を切り替える。
- 数値欄は input として編集できる。Enter / blur で確定し、Escape でキャンセルする。
- 数値編集は Action / Command 経路へ接続し、Undo / Redo 対象にした。
- UI 非表示 mode / exporter mode では下バーも非表示にする。
- locale 変更時は、mode 切替ボタンと軸 mode ボタンの表示文言を更新する。

## Model Mode

Model mode では、選択ボーンの現在値を表示する。

- ボーン位置 `X / Y / Z`
- 角度 `X / Y / Z`

ボーン未選択、または Camera 疑似 bone の場合は、数値欄を空欄にする。

現時点では、値の取得元は `BottomPanel.getSelectedBone()` と `MmdManager.getBoneTransform()` である。

編集確定時は、選択ボーンの現在値を before、下バー入力値を after とする `edit.boneTransform` command を作る。

入力範囲は既存下パネルに合わせ、位置は `-30..30`、角度は `-180..180` に clamp する。

## Camera Mode

Camera mode では、MMD camera の現在値を表示する。

- カメラ中心 `X / Y / Z`
- 角度 `X / Y / Z`
- 距離
- 視野角

値の取得元は `MmdManager.getCameraTarget()`、`getCameraRotation()`、`getCameraDistance()`、`getCameraFov()` である。

カメラ中心は初回では `camera.target` 相当として扱う。MMD 本家と厳密に一致するかは後続で詰める。

編集確定時は、現在のカメラ値を before、下バー入力値を after とする `edit.cameraTransform` command を作る。

入力範囲は既存下パネルに合わせ、中心は `-30..30`、角度は `-180..180`、距離は `0.1..400`、視野角は `10..120` に clamp する。数値ボックスの上下操作は `1` 刻みだが、手入力された小数値は確定時に丸めず保持する。

## 軸ハンドル表示

本家 MMD の viewport 右下にある local/global 軸ハンドル相当の表示は、viewport 上に浮かせず下バー内へ吸収した。

- `local / global / accessory` は単一ボタンで循環表示する。
- 現時点では表示 state のみで、実際の gizmo coordinate mode や accessory transform には接続しない。
- ボタン幅は固定し、`local / global / accessory` の切替で下バー全体が横に揺れないようにした。
- 移動 `X / Y / Z`、回転 `X / Y / Z` の 6 つを MMD 風の小さな handle 表示として横並びにした。
- 各 handle は placeholder であり、クリック / ドラッグ操作はまだ発火しない。

## 見た目の調整

- 無彩色ダークグレー基調にし、既存 UI と馴染ませた。
- グラデーション背景は使わない。
- 距離 / 視野角ラベルは他の下バーラベルと同じトーンへ寄せた。
- 位置 `X / Y / Z` と角度 `X / Y / Z` が近すぎて読みにくかったため、角度ラベルの左余白を広げた。
- 1080p 前後のウィンドウ幅でも収まるよう、数値欄と handle をコンパクト化した。
- 小幅時でも `local / global / accessory` ボタンは消さず、固定幅のまま残す。

## 現時点でやらないこと

- 下パネル側に残る Pos / Rot / Distance / 視野角系 UI の削除
- `local / global / accessory` の実際の gizmo / accessory state への接続
- handle のクリック / ドラッグ操作
- seek bar の追加

## 後続候補

- 下パネル側のボーン / カメラ数値 UI を削減し、操作欄へ責務を寄せる。
- `local / global / accessory` を実際の gizmo / accessory 操作 state に接続する。
- handle のクリック / ドラッグ操作を実装する。
- MMM / 動画投稿サイトのような seek bar 要望は、まず既存 timeline / waveform seek 強化として別タスクで検討する。
## 2026-06-01 handle drag update

- 右下ハンドルの移動 `X / Y / Z` と回転 `X / Y / Z` を上下ドラッグ操作に接続した。
- Model mode では移動がボーン位置、回転がボーン角度を編集する。
- Camera mode では移動がカメラ中心、回転がカメラ角度を編集する。
- ドラッグ中は下バーの数値欄だけを更新し、pointer up で既存の下バー commit 経路へ流す。
- Undo / Redo は 1 ドラッグにつき 1 件として扱う。
- `local / global / accessory` の座標変換や accessory 操作への接続は後続扱い。

## 2026-06-01 PNG capture note

- PNG 保存は `webContents.capturePage()` で canvas 矩形を撮るため、canvas 上に重なる HTML overlay が映り込む可能性がある。
- 下バーと右下ハンドルは編集 UI なので、PNG 保存中は `body.png-capture-mode` で非表示にする。
- Babylon 側のボーン / エディタ overlay は従来どおり `MmdManager.setCaptureEditorOverlaysSuppressed(true)` で抑制する。

## 2026-06-01 layout update

- 下バーは canvas に重ねる overlay ではなく、viewport 下段の通常 UI としてレイアウトに参加させる。
- `#viewport-container` は縦 flex とし、canvas が残り領域、下バーが固定高さの下段を担当する。
- これにより `getRenderingCanvasClientRect()` は下バーを含まない canvas 矩形になり、PNG 保存で下バーが映り込む事故を構造的に避けやすくする。
- 右下ハンドルは引き続き canvas 上の overlay だが、PNG 保存中は `png-capture-mode` で非表示にする。
