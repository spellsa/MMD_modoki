# MMDキーフレーム機能の設計メモ

## 目的

本メモは、`MMD_modoki` で本家MMDに近いキーフレーム編集機能を整備するにあたり、

- `babylon-mmd` に任せるべき範囲
- `MMD_modoki` が自前で持つべき editor 機能
- その境界をどう設計するか

を整理するための設計メモです。

前提:

- `babylon-mmd` は loader / runtime / animation 再生基盤として活用する
- `Babylon.js Editor` は直接の実装基盤ではなく参考対象とする
- 本家MMD風の timeline editor は `MMD_modoki` 側で持つ

## 結論

設計の基本方針は次の 3 点です。

1. `babylon-mmd` は `再生・評価・ファイル互換レイヤ` として使う
2. `MMD_modoki` は `編集・操作・可視化レイヤ` を持つ
3. 両者の間に `editor animation model` を置き、UI は runtime を直接触りすぎないようにする

短く言うと、`babylon-mmd` は `player/runtime`、`MMD_modoki` は `editor` です。

## 役割分担

### babylon-mmd に任せるもの

`babylon-mmd` に任せるべきもの:

- PMX / PMD / VMD / VPD の読み込み
- MMD model runtime の生成
- ボーン、morph、IK、physics の評価
- camera motion の再生
- audio sync
- animation blending の土台
- MMD 仕様に沿ったデータ構造と再生ロジック

理由:

- ここは MMD 互換性の中心であり、自前実装コストが高い
- 既に `MMD_modoki` でも活用できている
- ここを自前で置き換えるメリットが薄い

### MMD_modoki が持つもの

`MMD_modoki` が持つべきもの:

- timeline UI
- track の選択、範囲選択、複数選択
- キー追加 / 削除 / 移動
- コピー / ペースト / 別フレームペースト / 反転ペースト
- 補間グラフ UI
- 表示 / IK / 照明 / アクセサリなど editor 機能の統合
- project 保存 / 復元
- editor 向け一括コマンド

理由:

- これは player/runtime ではなく editor の責務
- 本家MMD風 UX は `babylon-mmd` の対象外
- `MMD_modoki` 独自の操作性を設計できる余地でもある

## 問題設定

現状の `MMD_modoki` は、runtime のデータと editor の操作がかなり密結合です。

具体的には:

- timeline 上でキーを追加した瞬間に runtime 側の配列を直接更新している
- interpolation UI も runtime の配列を直接編集している
- `MmdManager` が `player` と `editor` の両方を兼務している

この構造だと、次の問題が起きやすいです。

- track 種別を増やしづらい
- 複数選択や clipboard を足しにくい
- project import / export と UI 操作の責務境界が曖昧
- runtime 配列の制約が UI 設計に直結してしまう

## 推奨アーキテクチャ

### 3 層に分ける

`MMD_modoki` のキーフレーム機能は、次の 3 層に分けるのがよいです。

1. `Runtime Layer`
2. `Editor Model Layer`
3. `Editor UI Layer`

### 1. Runtime Layer

主な担当:

- `babylon-mmd`
- Babylon.js scene
- 再生、評価、seek

ここでは「現在フレームでどう見えるか」を責務にします。

持つもの:

- MMD model runtime
- MMD camera runtime
- VMD / VPD / property track / camera track の実データ
- 再生状態

持たせないもの:

- timeline selection
- clipboard
- UI 向け複数選択状態
- editor 操作履歴

### 2. Editor Model Layer

ここが今回の設計の中心です。

役割:

- runtime データを editor しやすい形に見せる
- editor 操作を runtime に反映する
- track category ごとの差分を吸収する

この層で持ちたいもの:

- `TrackRegistry`
- `SelectionModel`
- `ClipboardModel`
- `KeyframeCommandService`
- `InterpolationEditService`
- `TimelineTransformService`

つまり、UI はこの層を触り、runtime 配列を直接いじらない形に寄せます。

### 3. Editor UI Layer

役割:

- track 一覧表示
- keyframe の可視化
- 補間グラフ描画
- ポインタ操作
- ショートカット
- ボタンやメニューのイベント処理

この層は `状態を持つ` よりも、Editor Model を操作する入口として薄く保つ方がよいです。

## 中核になる editor model

### 1. TrackRegistry

責務:

- timeline 上に並ぶ track の一覧を返す
- category ごとの track adapter を束ねる

想定カテゴリ:

- `root`
- `semi-standard`
- `bone`
- `morph`
- `camera`
- `property-visibility`
- `property-ik`
- `light`
- `accessory`

重要なのは、track の種類ごとに runtime の持ち方が違っても、UI からは同じように見えることです。

### 2. TrackAdapter

各カテゴリに adapter を持つ形にします。

例:

- `BoneTrackAdapter`
- `MorphTrackAdapter`
- `CameraTrackAdapter`
- `PropertyTrackAdapter`
- `LightTrackAdapter`
- `AccessoryTrackAdapter`

共通的に欲しい API:

```ts
interface TrackAdapter {
  readonly category: string;
  listTracks(): EditorTrack[];
  hasKeyframe(trackId: string, frame: number): boolean;
  addKeyframe(trackId: string, frame: number): boolean;
  removeKeyframe(trackId: string, frame: number): boolean;
  moveKeyframe(trackId: string, from: number, to: number): boolean;
  readKeyframe(trackId: string, frame: number): EditorKeyframe | null;
  writeKeyframe(trackId: string, frame: number, value: EditorKeyframeValue): boolean;
  getInterpolation(trackId: string, frame: number): EditorInterpolationSet | null;
  setInterpolation(trackId: string, frame: number, value: EditorInterpolationSet): boolean;
}
```

これがあると、UI は track 種別を意識せずに編集できます。

### 3. SelectionModel

今後必要になる状態:

- 選択中の track
- 選択中の frame
- 複数 key の選択集合
- 範囲選択の anchor

最低限ほしい構造:

```ts
type KeySelection = {
  trackId: string;
  frame: number;
};
```

ポイント:

- 単一選択前提の `selectedFrame: number | null` から脱却する
- 将来の `範囲選択` や `縦選択` の土台にする

### 4. ClipboardModel

コピー / ペーストのために必要です。

保持したいもの:

- コピー元カテゴリ
- keyframe 値
- 補間
- relative frame offset
- 反転ペースト用メタ情報

最初は単一キー対応で十分ですが、最終的には複数キー集合を持てる構造にした方がよいです。

### 5. KeyframeCommandService

責務:

- add / remove / move / paste / mirror paste
- 複数選択時の一括適用

ここを通して操作すれば、UI イベントから runtime までの変更経路が一本化されます。

### 6. TimelineTransformService

責務:

- 空フレーム挿入
- 列フレーム削除
- 範囲の拡大縮小
- 不要フレーム削除

本家MMDとの差分を埋める上で重要ですが、通常のキー操作とは分けた方が整理しやすいです。

## データフロー

### キー追加

望ましい流れ:

1. UI が `KeyframeCommandService.add(trackId, frame)` を呼ぶ
2. service が対応する `TrackAdapter` を解決する
3. adapter が runtime へ反映する
4. `TrackRegistry` が最新 track を再構成する
5. timeline UI が再描画する

### 補間編集

望ましい流れ:

1. UI が interpolation curve を編集する
2. `InterpolationEditService` が `EditorInterpolationSet` に変換する
3. 対象 adapter に `setInterpolation()` を委譲する
4. runtime animation を refresh する

### コピー / ペースト

望ましい流れ:

1. 選択中キーを `ClipboardModel` に保存する
2. paste 時に target frame を決める
3. command service が adapter 経由で書き込む
4. 必要なら補間も同時に適用する

## どこまで runtime を直接触るか

基本方針:

- `UI -> Runtime` の直接アクセスは減らす
- `UI -> Editor Model -> Runtime` に寄せる

ただし、完全に遮断する必要はありません。

例外的に runtime 直アクセスでもよいもの:

- 再生 / 一時停止 / seek
- 現在フレームの camera / bone 値の参照
- screenshot や export 用の処理

一方で、次は editor model 経由に寄せた方がよいです。

- keyframe add / remove / move
- interpolation 編集
- clipboard 操作
- 範囲編集

## 本家MMD互換を意識した実装順

### Phase 1: 現状機能の整理

最初にやること:

- keyframe 操作 API を `TrackAdapter` 経由へ寄せる
- 単一選択を `SelectionModel` にまとめる
- interpolation 編集を service 化する

狙い:

- 既存挙動を壊さず editor 基盤を作る

### Phase 2: 本家MMDでよく使う機能を追加

次にやること:

- 単一キーの copy / paste
- 別フレーム paste
- 複数選択
- 複数キー移動 / 削除

狙い:

- 体感で本家MMDとの差が大きい部分を先に埋める

### Phase 3: property 系を timeline に載せる

次にやること:

- `表示` track
- `IK ON/OFF` track

狙い:

- 本家MMDの重要な非 transform 系キーフレームを押さえる

### Phase 4: 時間方向編集

次にやること:

- 空フレーム挿入
- 列フレーム削除
- 拡大縮小
- 不要フレーム削除

狙い:

- editor としての使い勝手を本家に近づける

### Phase 5: 追加カテゴリ

最後にやること:

- 照明
- アクセサリ
- セルフシャドウ

狙い:

- timeline 対象を増やす
- project 互換性を強める

## 既存コードへの当てはめ

今のコードで対応しやすい場所:

- `src/mmd-manager.ts`
  - runtime と editor の責務分離が必要
- `src/ui-controller.ts`
  - keyframe / interpolation / timeline 操作の UI が既にある
- `src/timeline.ts`
  - 単一選択前提なので、複数選択対応の改修ポイントになる
- `src/types.ts`
  - `TrackCategory` の拡張ポイントになる

最初に切るとよい単位:

1. `editor/track-adapters/`
2. `editor/selection-model.ts`
3. `editor/keyframe-command-service.ts`
4. `editor/interpolation-edit-service.ts`

## 判断メモ

### やらない方がよいこと

- `babylon-mmd` の runtime 配列を UI から直接書き換える経路を増やす
- track 種別ごとに UI 側で個別分岐を増やし続ける
- `MmdManager` にさらに editor 機能を積み増す

### やった方がよいこと

- adapter で track 種別差分を吸収する
- selection / clipboard / command を editor model として独立させる
- runtime の正確性は `babylon-mmd` に寄せ、editor UX は `MMD_modoki` 側で持つ

## 最終的な方針

最終的には次の分担が最も安定します。

- `babylon-mmd`
  - MMD 互換の runtime と animation データ基盤
- `MMD_modoki`
  - 本家MMD風 timeline editor と project editor

この方針なら、MMD 互換性の中心を外部基盤に寄せつつ、`MMD_modoki` 独自の editor 体験を育てられます。
