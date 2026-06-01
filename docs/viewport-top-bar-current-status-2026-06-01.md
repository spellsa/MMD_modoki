# ビューポート上バー 現状メモ 2026-06-01

## 目的

v0.2.0 の MMD 本家寄せ UI として、トップバーに置いていた状態表示やビューポート操作を `viewport` 直上のバーへ移した。

上バーは、アプリ全体のメニューバーを軽くしつつ、ビューポート操作に近い機能をビューポート近くへ集約するための UI として扱う。

## 現在の構成

実装ファイル:

- `src/ui/viewport-top-bar-controller.ts`
- `src/ui-controller.ts`
- `src/mmd-manager.ts`
- `index.html`
- `src/index.css`
- `language/*.json`

DOM 上は `#viewport-top-bar` に配置している。

現在の主な要素:

- 左端: `モデル編` / `カメラ編` 切替ボタン
- 左寄せステータス: FPS、WebGPU / WGSL / Bullet MPR、runtime status
- 右側ツール:
  - 視野角
  - 距離
  - 移動
  - パース ON/OFF
  - 視点切り替え ViewCube

Effect ボタンと言語セレクトは、現時点ではメニューバー列の右側に残している。

## Model / Camera 切替

上バー左端の `モデル編` / `カメラ編` は単一ボタンで、押すたびに mode を切り替える。

以前のように `モデル` と `カメラ` の 2 ボタンを並べず、現在 mode の表示そのものを切り替える方式にした。

モデル未読み込み時など、Model mode へ戻れない状態では disabled にする。

## カメラ操作アイコン

視野角、距離、移動は、ボタンを上下または 2D ドラッグすることでカメラを操作する。

- 視野角: 上ドラッグで狭く、下ドラッグで広くする
- 距離: 上ドラッグで近く、下ドラッグで遠くする
- 移動: 2D ドラッグで camera target を pan する

ドラッグ中は runtime に即時 preview 反映し、pointerup 時点で `edit.setCameraTransformFromBottomBar` と同じ camera transform command 経路へ流す。

これにより、上バー操作も Undo / Redo 対象になる。

## パース ON/OFF

パース ON/OFF は runtime 状態として切り替える。

- 初期値は perspective enabled
- project 保存項目にはまだ含めない
- VMD camera keyframe にはまだ含めない

正射影へ切り替えるときは、現在の `distance`、`fov`、viewport aspect から orthographic bounds を計算し、見た目の拡大率が大きく変わらないようにしている。

resize 時も正射影中であれば bounds を更新する。

## ViewCube

ViewCube ボタンから、6 面プリセットを選ぶ小さな popover を開く。

現在の配置:

```text
   上面
左面 正面 右面
   下面 裏面
```

本格的な 3D cube picking ではなく、初回は 6 面プリセットのメニューとして実装している。

各項目は既存の `camera.setViewPreset` Action へ dispatch する。

ViewCube アイコンは、正面から見た立方体のような図形を基本にし、選択される面を青く塗る。文字ラベルが別にあるため、アイコン内には `F` / `B` などのアルファベットを重ねない。

Esc、外側クリック、項目選択で閉じる。閉じたあとは ViewCube ボタンへ focus を戻す。

## アイコンの整理

視点切り替えとパース ON/OFF は、最終的に次の見た目へ寄せた。

- パース ON/OFF: シンプルな立方体アイコン
- ViewCube: 正面立方体風の奥行きアイコン

小さいボタンサイズでは、正面立方体風のアイコンの方が「視点切り替え」らしく見えるため、この組み合わせにしている。

視野角アイコンは扇型に近い形へ寄せた。距離は虫眼鏡、移動は十字矢印系のまま。

## PNG / Export との関係

上バーは HTML UI なので、PNG 保存や exporter / presentation mode では映り込まないように扱う必要がある。

現在は既存の UI 非表示・capture mode の対象に含める方針で、下バーや右下ハンドルと同様に「編集 UI」として扱う。

## 今回やらないこと

- パース ON/OFF の project 保存
- パース ON/OFF の VMD camera keyframe 化
- ViewCube の 3D cube 化
- ViewCube の辺 / 角クリック
- ViewCube のドラッグ回転
- カメラ移動アイコンの MMD 本家完全互換
- local / global / accessory と上バー ViewCube の連携

## 確認済み

- `npm.cmd run lint`
  - error 0
  - 既存 warning のみ
- `npm.cmd run test:unit`
  - 17 files / 100 tests passed
- `npm.cmd run smoke:launch`
  - WebGPU / Bullet MPR 初期化まで到達

ViewCube の見た目調整後は `npm.cmd run lint` のみ再確認した。

## 後続候補

- 上バー操作の実機感度調整
- ViewCube の配置と裏面の置き場所の再検討
- ViewCube を本格的な 3D cube UI にするかどうかの検討
- パース ON/OFF を project state / camera keyframe に含めるかの検討
- 上バーと下バーを含めた `viewport chrome` 全体の controller 境界整理
