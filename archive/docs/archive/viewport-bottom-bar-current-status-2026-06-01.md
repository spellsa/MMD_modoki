# ビューポート下バー 現状メモ 2026-06-01

## 目的

v0.2.0 の MMD 本家寄せ UI として、ビューポート下に現在値編集バーを追加した。
本家 MMD の「モデル編 / カメラ編」切替と、選択対象の位置・角度・カメラ値をまとめて扱う場所にする。

このメモは、実装後の現状を整理するもの。

## 現在の実装

- `ViewportBottomBarController` を追加した。
- 上部ツールバーの Model / Camera 切替は外し、下バー左端の単一ボタンで `モデル編` / `カメラ編` を切り替える。
- Model mode では、選択中ボーンの位置 `X/Y/Z` と角度 `X/Y/Z` を表示・編集する。
- Camera mode では、カメラ中心 `X/Y/Z`、角度 `X/Y/Z`、距離、視野角を表示・編集する。
- ボーン未選択時、または Camera 疑似 bone の場合は、Model mode 側の数値欄を空欄扱いにする。
- 数値欄は `type="number"` で、スピナー操作は整数刻み、キーボード入力では小数を保持する。
- Enter / blur で確定し、Escape で現在 runtime 値へ戻す。
- 確定した編集は Undo / Redo 対象にする。

## レイアウト方針

下バーは canvas に重ねる overlay ではなく、`#viewport-container` の通常レイアウトに入れる。

現在の構成:

```text
#viewport-container
  #render-canvas
  #viewport-bottom-bar
```

`#viewport-container` は縦 flex とし、canvas が残り領域、下バーが固定高さの下段を担当する。
これにより、PNG 保存で使う `getRenderingCanvasClientRect()` が下バーを含まない canvas 矩形を取得しやすくなる。

## PNG 保存との関係

PNG 保存は Electron の `webContents.capturePage(canvasRect)` 経路を使うため、canvas 上に HTML UI が重なっていると画像に映り込む。

現在の対策:

- 下バーは canvas の外側に出したため、PNG 保存範囲に含まれない。
- 保存時は `body.png-capture-mode` を付け、canvas 上の HTML overlay だけを非表示にする。
- `#viewport-bottom-bar` は PNG 保存時に非表示にしない。非表示にすると保存直前に canvas 高さが変わるため。
- Babylon 側の編集 overlay は従来どおり `MmdManager.setCaptureEditorOverlaysSuppressed(true)` で抑制する。

## 右下ハンドル

右下ハンドルは、MMD 本家に近い `local / global / accessory` と移動・回転軸の UI として追加した。

- `local / global / accessory` は単一ボタンで循環表示する。
- 現時点では表示 state のみで、実際の gizmo coordinate mode や accessory transform には未接続。
- 移動 `X/Y/Z` と回転 `X/Y/Z` の 6 つのハンドルを持つ。
- ハンドルは下バー内ではなく、ビューポート右下の黒帯付近に透過 overlay として置く。
- PNG 保存時は `png-capture-mode` で非表示にする。

## ハンドル操作

ハンドルは上下ドラッグで数値を変更する。

- ドラッグ中に下バー数値と runtime へ即時反映する。
- Model mode では、移動ハンドルが選択ボーン位置、回転ハンドルが選択ボーン角度を動かす。
- Camera mode では、移動ハンドルがカメラ中心、回転ハンドルがカメラ角度を動かす。
- pointerup 時に、ドラッグ開始時の値を `before`、終了時の値を `after` として Undo / Redo 履歴へ 1 件だけ積む。
- pointercancel 時は、ドラッグ開始時の値へ戻す。

## Action / Command

追加・利用している主な経路:

- `edit.setBoneTransformFromBottomBar`
- `edit.setCameraTransformFromBottomBar`
- `edit.boneTransform`
- `edit.cameraTransform`
- `buildBoneTransformCommand`
- `buildCameraTransformCommand`

下バー編集は keyframe 登録ではなく、現在値編集として扱う。
キー登録は既存の登録ボタン経路を使う。

## 確認済み

- `npm.cmd run test:unit`
  - 17 files / 100 tests passed
- `npm.cmd run lint`
  - error 0
  - 既存 warning 466 件

## 未完了 / 後続候補

- 実機で PNG 保存時に下バー・ハンドルが映り込まないことを再確認する。
- `smoke:launch` と実画面で、通常レイアウト化後の canvas 高さ・リサイズ挙動を確認する。
- `local / global / accessory` を実際の gizmo coordinate mode / accessory 操作へ接続する。
- ハンドルのドラッグ感度を実機操作で調整する。
- 右下ハンドルのクリック操作、または hover tooltip を検討する。
- MMM / 動画投稿サイト風のシークバー要望は、別タスクとして扱う。
