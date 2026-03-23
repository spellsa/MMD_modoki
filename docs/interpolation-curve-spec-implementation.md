# 補間カーブ仕様と実装メモ

更新日: 2026-03-23

## この文書の役割
この文書は、キーフレーム補間の editor 上の扱いを整理する。

- 何ch持つか
- 制御点の値域
- どのタイミングで preview / runtime refresh するか

## 基本仕様

### MMD 補間の前提
- 各区間は Bezier 補間
- 始点は `(0, 0)`
- 終点は `(127, 127)`
- 可変なのは中間の2点
  - `(x1, y1)`
  - `(x2, y2)`

### 値域
- `0..127`
- editor では clamp + round して扱う

## チャンネル数

### ボーン
4ch

- X
- Y
- Z
- Rot

### カメラ
6ch

- X
- Y
- Z
- Rot
- Dist
- FoV

## UI 表示ルール

### 補間欄
- 選択中トラックに対応する補間だけ表示する
- channel が無効な場合は非表示または unavailable 表示

### プレビュー
- 現在フレームの前後キーから preview を生成する
- 中間フレームでは「次キーの補間」を表示する
- 最終キーの後ろは preview 不可

## 実装上の注意

### 1. 補間編集と key 登録を混ぜない
register 直後に preview refresh を強くかけると、

- pose が飛ぶ
- camera view が飛ぶ
- runtime handle が不要に再生成される

ことがある。

### 2. seek と refresh を分ける
区別する操作:

1. frame move
2. 補間変更後の preview refresh
3. register 直後
4. play 開始時

この4つは同じ処理に寄せすぎない方が安全。

### 3. カメラは FoV 単位に注意
camera の `FoV` は runtime 再生時に degree 前提で扱われる。

そのため:
- editor preview
- 保存値
- play 時の runtime 解釈

の単位を一致させる必要がある。

## 保存時の扱い

### 追加時
1. 現在フレームにキーを追加
2. 現在の補間 UI 値を track へ保存
3. source animation を更新
4. 必要な場合のみ runtime refresh

### 既存キー更新時
- 対象区間の interpolation を更新する
- UI だけでなく source animation に書き戻す

## 今後の整理候補
- channel binding を型として切り出す
- camera 6ch と bone 4ch を adapter 側へ寄せる
- interpolation preview 生成の責務を UIController から分離する
