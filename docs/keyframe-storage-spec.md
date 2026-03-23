# キーフレーム保存仕様

更新日: 2026-03-23

## この文書の役割
この文書は、`MMD_modoki` 内で保持するキーフレーム情報の意味を整理する。

- 何を保存するか
- その値が何を意味するか
- editor の表示値と runtime の値がどこで違うか

調査経緯は `docs/keyframe-registration-display-research.md` を参照。

## 基本方針

### 1. track は frame 配列を持つ
各 track は少なくとも以下を持つ。

- `name`
- `category`
- `frames`

`frames` は昇順で重複なしを前提とする。

### 2. source animation は editor の保存元
キーフレームの追加・削除・補間編集は、runtime の一時状態ではなく source animation に対して行う。

### 3. UI 表示値と保存値は一致しない場合がある
特に camera は一致しない。

## track category
主な category:

- `root`
- `semi-standard`
- `bone`
- `morph`
- `camera`
- `property`
- `light`
- `accessory`

## ボーントラック

### 保存する値
- frame
- position
- rotation
- interpolation

### position
- bone local の移動量
- editor では runtime-world から復元した値を使う方が安定

### rotation
- radians
- editor 側では Euler で扱うが、runtime 側では Quaternion へ変換される

### 補足
- 保存値
- sampled source
- viewport 見た目

は別物として扱う。

## モーフトラック

### 保存する値
- frame
- weight
- interpolation

### weight
- `0.0 .. 1.0`

## カメラトラック

camera は最も意味ずれを起こしやすいので、保存値の意味を明示する。

### 保存する値
- frame
- target
- rotation
- signed distance
- fov
- interpolation(6ch)

### `track.positions`
意味:
- viewport camera の実位置ではない
- camera target を表す

単位:
- world position

### `track.rotations`
意味:
- MMD camera rotation

単位:
- radians

備考:
- editor 側の回転推定は `MmdCamera` 規約と一致させる必要がある

### `track.distances`
意味:
- target から camera までの距離

単位:
- world distance

符号:
- 負値で保存する

理由:
- `babylon-mmd` の MMD camera runtime の期待値に合わせるため

### `track.fovs`
意味:
- field of view

単位:
- degree

理由:
- `babylon-mmd` runtime が再生時に degree -> rad 変換するため

### editor 側 UI 値との違い
UI では以下を表示する。

- viewport camera position
- viewport camera rotation
- positive distance
- fov

つまり camera では、UI 値をそのまま track へ保存してはいけない。

## 補間の保存

### 基本
- 1区間ごとに Bezier 制御点を持つ
- 値域は `0..127`

### ボーン
- 4ch
  - X
  - Y
  - Z
  - Rot

### カメラ
- 6ch
  - X
  - Y
  - Z
  - Rot
  - Dist
  - FoV

## editor 保存経路の原則

1. 現在の UI / runtime 状態から snapshot を作る
2. snapshot を track の意味へ正規化する
3. source animation に書く
4. 必要なときだけ runtime を再評価する

## 再生・停止中の扱い

### 停止中
- frame move 時は必要な pose を 1 回だけ反映する
- 同一フレーム上で毎フレーム再適用しない

### 再生中
- runtime から viewport への毎フレーム同期を許可する
- camera play 開始時は current frame を再 seek してから進める

## 今後の改善余地
- `CameraTrackAdapter` の導入
- property / light / accessory の保存仕様整理
- clipboard 保存形式の明文化
