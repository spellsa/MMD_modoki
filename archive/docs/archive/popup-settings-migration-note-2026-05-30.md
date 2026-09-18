# 設定系ポップアップ移行メモ 2026-05-30

## 目的

v0.2 UI 整理の一環として、常時表示する必要が薄い既存機能や詳細設定をメニューバー起点のポップアップへ移す。

今回の対象は以下:

- 背景設定
- エッジ設定
- 重力設定
- 照明/影品質設定

Effect 右パネルの Shader / Post Effect / FrameGraph 系は対象外とする。

## 実装方針

WebM 出力設定で追加した `PopupDialogController` / `PopupContentController` を再利用する。

下パネルの既存 UI は削除しない。ポップアップ側は既存の `MmdManager` 状態、既存 Action、既存 DOM refresh 経路に同期する入口として扱う。

新しい project 保存スキーマは追加しない。背景パス、Mirror床、重力、照明/影品質の多くは既存の serializer / importer で保存対象になっているため、その状態に乗せる。

## 追加ポップアップ

### 背景設定

対象:

- 背景画像/動画の表示切替
- 黒背景
- 背景画像読込
- 背景動画読込
- 背景メディアクリア
- 現在の背景画像/動画パス表示
- Mirror床 ON/OFF
- Mirror床の反射率、サイズ、高さ、解像度

背景画像/動画の読み込みは `window.electronAPI.openFileDialog` から既存の `MmdManager.setBackgroundImageFromPath` / `setBackgroundVideoFromPath` に渡す。

### エッジ設定

対象:

- エッジ表示 ON/OFF
- モデルエッジ幅

エッジ表示は既存の `viewport.toggleEdge`、幅は `effect.setModelEdgeWidth` を使う。
Effect パネル側の edge blur / post effect は対象外。

### 重力設定

対象:

- 物理演算 ON/OFF
- 剛体表示 ON/OFF
- 物理シミュレーション rate
- 重力加速度
- 重力方向 X/Y/Z

Undo / Redo 対象にはしない。

### 照明/影品質設定

下パネルのライト方向、光色、影色など常用/キーフレーム寄りの操作は移さない。

対象:

- 影品質
- 影描画距離
- 影範囲
- 影の濃さ
- Shadow Bias
- Normal Bias
- Soft Transparent Shadow
- IBL Shadow 系
- Character Contact Shadow 系

既存の `effect.setShadow*` / `effect.setIbl*` / `effect.setCharacterContactShadow*` Action を使う。

## 確認観点

- 各メニューからポップアップが開く
- Esc / close button / backdrop で閉じる
- focus restore がメニュー付近へ戻る
- 背景画像/動画の読込、表示切替、クリアが動く
- Mirror床、エッジ幅、重力、影品質系の値が既存下パネル/内部状態と同期する
- project 保存/読み込み後に既存保存対象の値が復元される
- 日本語/英語で表示崩れがない

