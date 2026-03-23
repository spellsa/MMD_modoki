# MMDキーフレーム設計メモ

更新日: 2026-03-23

## この文書の役割
この文書は、`MMD_modoki` におけるキーフレーム編集機能の設計整理を目的とする。

- `docs/keyframe-registration-display-research.md`
  - 不具合調査の時系列メモ
- `docs/keyframe-storage-spec.md`
  - 保存形式と値の意味
- この文書
  - editor / runtime / UI の責務分離

## 全体像
本プロジェクトのキーフレーム編集は、次の3層で考えると整理しやすい。

1. Runtime Layer
2. Editor Model Layer
3. Editor UI Layer

### 1. Runtime Layer
対象:
- `babylon-mmd`
- Babylon.js scene
- `src/mmd-manager.ts`

責務:
- MMD model / camera の再生
- animation seek
- physics 前後更新
- runtime bone / camera への最終反映

注意点:
- editor の都合で runtime の内部表現を直接 UI に露出しない
- `linkedBone` の local 値と最終描画結果は一致しないことがある
- camera は viewport camera と MMD camera runtime の2系統を持つ

### 2. Editor Model Layer
対象:
- track 選択状態
- キーフレーム追加・削除・移動
- 補間編集
- コピー / ペースト
- 保存 / 読み戻し用の source animation

現在は完全分離されていないが、設計上は以下の責務をここに寄せるのが望ましい。

- Track の意味解釈
- 保存値の正規化
- runtime への反映指示
- UI と runtime の変換

### 3. Editor UI Layer
対象:
- `src/ui-controller.ts`
- `src/bottom-panel.ts`
- `src/timeline.ts`
- `index.html`
- `src/index.css`

責務:
- 選択中トラック / フレームの表示
- スライダー / ボタン / タイムライン操作
- editor model への入力
- runtime から読んだ値の表示

注意点:
- UI が runtime の値変換まで抱えすぎると不具合調査が難しくなる
- camera は特に、UI 表示値と runtime 保存値の意味が違う

## 現在の主要コンポーネント

### `MmdManager`
責務:
- runtime の状態管理
- timeline source animation の保持
- seek / play / pause
- bone / camera 値の読取と適用

ここに寄りがちな責務:
- editor 用の値変換
- camera track 意味変換

課題:
- editor 専用変換まで `MmdManager` に寄ると責務が太くなる

### `UIController`
責務:
- ボタン操作
- frame update 時の UI 同期
- bottom panel と timeline の接着

課題:
- camera / bone の保存用 snapshot 変換まで入っており、責務が重い

### `TimelineEditService`
責務:
- 編集中タイムラインの長さ
- interpolation 編集補助
- 編集用 animation 確保

### `BottomPanel`
責務:
- UI 表示
- slider 状態保持
- current target 表示

## ボーン編集の設計メモ

### 保存時に必要なもの
- 対象 bone 名
- frame
- position
- rotation
- interpolation

### 問題になりやすい点
- ギズモ操作後の panel 値が stale になる
- `linkedBone` の値と runtime-world の見た目がズレる
- 保存値と表示値と再生値が別レイヤでズレる

### 現時点の整理
- 保存用読取は `runtime-world` 基準が安定
- 停止中 frame move では sampled pose を viewport 側へ戻す必要がある
- ただし runtime handle の再生成は単純 seek と分離する方が安全

## カメラ編集の設計メモ

### 最重要ポイント
camera は bone と違い、UI の見た目と runtime 保存形式の意味が異なる。

editor が見ているもの:
- viewport camera の position
- viewport camera の rotation
- positive distance
- FOV

runtime / track が持つもの:
- target
- rotation
- signed distance
- FOV(degree)

### camera key の現在仕様
- `track.positions`
  - camera target
- `track.rotations`
  - radians
- `track.distances`
  - 負値 distance
- `track.fovs`
  - degree

### camera で起きた典型的不具合
- register 直後の white out / close-up
- frame move 時の左右反転
- frame move 後の viewport 操作ロック
- play 開始時だけ close-up

### 根本原因の整理
1. position と target の意味違い
2. distance の符号違い
3. `MmdCamera` と editor の回転符号系不一致
4. 停止中にも `mmdCamera -> viewport` を毎フレーム同期していた
5. `track.fovs` を rad で持っていた

## 今後の改善方針

### 1. TrackAdapter 層を導入する
候補:
- `BoneTrackAdapter`
- `MorphTrackAdapter`
- `CameraTrackAdapter`
- `PropertyTrackAdapter`
- `AccessoryTrackAdapter`

狙い:
- track の意味変換を UI から外す
- 保存形式を adapter に閉じ込める
- runtime と UI の往復変換を一箇所に寄せる

### 2. camera 変換を専用化する
最低限切り出したい変換:
- viewport camera -> editor snapshot
- editor snapshot -> camera track value
- camera track value -> viewport camera
- camera track value -> MMD runtime camera

### 3. seek と refresh を分離する
区別すべき操作:
- 単純 frame move
- interpolation 編集後の preview refresh
- play 開始前の handle refresh
- register 直後の表示維持

この4つを混同すると、保存済み姿勢の上書きや register 直後の視点ジャンプが起こりやすい。

## 現時点の実務ルール

### ボーン
- 保存値確認
- sampled source 確認
- runtime-world 読取確認
- viewport 見た目確認

この4点を分けて診断する。

### カメラ
- target
- rotation
- signed distance
- fov(degree)

この4つの意味を崩さない。

### UI
- 停止中の register 直後に不要な preview refresh をしない
- 再生中だけ毎フレーム同期する経路を明確に分ける

## 関連文書
- `docs/keyframe-registration-display-research.md`
- `docs/keyframe-storage-spec.md`
- `docs/interpolation-curve-spec-implementation.md`
