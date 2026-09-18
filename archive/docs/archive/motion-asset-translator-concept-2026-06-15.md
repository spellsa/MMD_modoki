# Motion Asset / Motion Translator 構想メモ

作成日: 2026-06-15

## 概要

Motion Asset / Motion Translator は、MMD_modoki におけるモーション管理と変換の実験構想である。

目的は、VMD を単にモデルへ読み込ませるだけでなく、モーションを「資産」として管理し、複数モデルへ参照適用し、必要に応じて名前対応・体格補正・焼き込みを行えるようにすること。

本家 MMD を動かせるユーザーにも価値を示すには、MMD_modoki 単体の再生・編集だけでなく、本家 MMD の前処理にも使える機能が必要になる。

この構想では、次の 2 つを独自価値として扱う。

1. モーション翻訳 / 変換
2. モーション参照渡し

## 背景

MMD では、同じ VMD を複数モデルへ踊らせたい場合でも、基本的には各モデルへ個別にモーションを読み込ませる。

また、モデルによっては次の問題が起こる。

- 日本語ボーン名 VMD と英語ボーン名 PMX が合わない
- morph 名が日本語/英語で合わない
- グルーブ有無の違いでセンター移動が合わない
- 身長、腕長、脚長の違いで足滑りや手位置ズレが出る
- 同じダンスを複数モデルへ当てると project 内でモーションが重複しやすい

MMD_modoki は project state を独自に設計できるため、VMD をモデルごとに複製するのではなく、ひとつの Motion Asset を複数モデルが参照する構造を取れる可能性がある。

## 目的

- VMD を Motion Asset として一度だけ保持する
- 複数モデルが同じ Motion Asset を参照できるようにする
- モデルごとの frame offset や変換設定を Binding として持つ
- 日本語/英語ボーン名・モーフ名の翻訳を行う
- モデル体格差に応じた簡易補正を行う
- 必要に応じて target model 用の MmdAnimation として焼き込む
- 将来的には変換済み VMD 出力を検討する

## 基本用語

### Motion Asset

読み込んだ元モーション。

例:

```text
MotionAsset
  id
  name
  sourcePath
  sourceKind: "vmd" | "generated" | "project"
  animation: MmdAnimation
```

複数モデルが同じ `MmdAnimation` を参照できる。

ただし、runtime animation handle はモデルごとに必要になる可能性が高い。

### Motion Binding

モデルと Motion Asset の接続。

例:

```text
ModelMotionBinding
  modelId
  motionAssetId
  frameOffset
  enabled
  translatorPresetId?
  variantId?
  bakedAnimationId?
```

同じ Motion Asset を複数モデルへ接続できる。

### Motion Translator

Motion Asset を target model に合わせて変換する処理。

対象:

- bone track 名
- morph track 名
- movable bone / normal bone の振り分け
- センター / グルーブ / 足IK などの position track
- 必要に応じた体格比補正

### Motion Variant

Motion Asset から派生した変換設定。

例:

```text
MotionVariant
  id
  baseMotionAssetId
  name
  boneNameMapId
  morphNameMapId
  centerScale
  footIkOffset
  groovePolicy
```

「ミク用」「英語ボーン用」「小柄モデル用」のような派生を作れる。

### Baked Motion

変換結果を `MmdAnimation` として固定化したもの。

参照適用ではなく、target model 専用の animation として扱う。

## ユースケース

### 1. 日本語 VMD を英語ボーンモデルへ使う

```text
日本語 VMD
↓
bone / morph 名を英語モデル向けに map
↓
target PMX に存在しない track を警告
↓
変換済み MmdAnimation として適用
```

この段階では key 値は変更しない。

### 2. 同じダンスを複数モデルへ参照適用する

```text
MotionAsset: dance.vmd
  ├ Model A binding
  ├ Model B binding
  ├ Model C binding
  └ Model D binding
```

project 保存時に同じ VMD データをモデル数ぶん複製しない。

### 3. 複数モデルに frame offset を付ける

```text
Model A: motionAssetId=dance, offset=0
Model B: motionAssetId=dance, offset=10
Model C: motionAssetId=dance, offset=20
```

群舞や輪唱的な演出に使える。

### 4. 体格差を軽く補正する

```text
source model ratio
target model ratio
↓
センター / 足IK / グルーブ position track を補正
↓
target model 用に bake
```

初期段階では rotation 補正には踏み込まない。

### 5. 本家 MMD 用の前処理

将来的に VMD 出力ができれば、MMD_modoki で次を行える。

- ボーン名翻訳
- モーフ名翻訳
- 体格補正
- frame offset
- グルーブ有無調整

その後、本家 MMD へ変換済み VMD を持ち込む。

## データ構造案

### Project state

現状は model ごとに source animation を持つ。

将来案:

```text
project
  motionAssets[]
  motionVariants[]
  models[]
    motionBinding?
    bakedAnimation?
```

### Runtime

共有できるもの:

- 元 `MmdAnimation`
- serialized project motion asset
- name map
- variant 設定

モデルごとに必要なもの:

- runtime animation handle
- target model 用 bake animation
- frame offset
- physics state
- morph / material runtime state

### 保存方針

選択肢:

1. 変換済み animation を保存する
2. 元 Motion Asset と変換設定だけ保存し、読み込み時に再生成する
3. 両方保存する

初期実装では 1 が単純。

ただし project が重くなりやすい。将来的には 2 または 3 が望ましい。

## 実装段階案

### Phase 1: 名前対応 bake

目的:

- VMD / `MmdAnimation` の track 名を map で変換する
- target model に存在しない track を warning する
- 変換済み `MmdAnimation` を現在モデルへ適用する

対象:

- `boneTracks`
- `movableBoneTracks`
- `morphTracks`

やらないこと:

- 体格補正
- VMD 出力
- 複数モデル参照

### Phase 2: Motion Asset と Binding

目的:

- 読み込んだ VMD を Motion Asset として project 内に保持する
- model は Motion Asset を参照する
- 同じ Motion Asset を複数 model に割り当てられるようにする

最小構成:

```text
motionAssets[]
model.motionAssetId
model.motionFrameOffset
```

### Phase 3: 参照適用 UI

目的:

- 複数モデルへ同じ motion を割り当てる
- frame offset を設定する
- binding を解除する

UI案:

```text
Motion
  Asset
    dance.vmd
  Bindings
    [x] Miku        offset 0
    [x] Rin         offset 10
    [x] Luka        offset 20
```

### Phase 4: Motion Translator

目的:

- Motion Asset を target model 用に変換する
- 名前対応 preset を選ぶ
- 変換結果を preview / bake する

UI案:

```text
Motion Translator

Source Motion: dance.vmd
Target Model: Miku English

Name Map:
  Japanese -> English
  English -> Japanese
  Custom

[ ] missing bones を警告
[ ] missing morphs を警告
[ ] センター移動を補正
[ ] 足IK高さを補正

[Preview]
[Bake to Model]
```

### Phase 5: 体格補正

目的:

- target model のサイズ差を見て position track を調整する

候補:

- `センター` 移動量 scale
- `グルーブ` あり/なし変換
- 足IK Y offset
- 左右足IK X/Z offset
- 腕IK系がある場合の簡易補正

原則:

- rotation 補正は後回し
- IK / 捩り / 付与親は壊れやすいため明示的な experimental 扱い

### Phase 6: VMD export

目的:

- 変換済み animation を VMD として書き出す
- 本家 MMD の前処理ツールとして使えるようにする

これは外部価値が高いが、VMD writer が必要になる。

## 期待される独自価値

### 本家 MMD ユーザー向け

- VMD の日本語/英語名変換ができる
- モデルに合わせた下ごしらえができる
- 複数モデルへ同じ motion を一括適用できる
- 本家 MMD に持ち込む前の preview / bake ができる

### MMD_modoki 内部向け

- project 保存が軽くなる可能性がある
- 同一 motion の複製を避けられる
- 群舞や大量モデル実験がやりやすくなる
- Motion Asset / Variant の概念で UI を整理できる

## 注意点

- `MmdAnimation` は共有できても、runtime handle はモデルごとに作る必要がある可能性が高い
- 体格補正は見た目の破綻を完全に消すものではない
- rotation retarget まで踏み込むと難度が大きく上がる
- 本家 MMD 互換を考えるなら VMD export が最終的に必要
- Motion Asset 参照と baked animation が混在すると保存仕様が複雑になる
- 物理演算はモデルごとに独立なので、モーション共有による runtime 計算削減は限定的

## Babylon.js Retarget との関係

Babylon.js 9.2.0 の `AnimatorAvatar.retargetAnimationGroup` は、root position / ground reference / bone name map の考え方として参考になる。

ただし MMD_modoki の Motion Translator は、外部 `AnimationGroup` ではなく `MmdAnimation` / VMD track を対象にする方が自然。

Babylon 側の retarget は、将来的に preview bake や姿勢差補正の実験で使う可能性がある。

## 結論

Motion Asset / Motion Translator は、MMD_modoki の独自価値として有望。

最初に実装するなら、名前対応 bake が最も小さく、MMD の補間や既存編集導線を壊しにくい。

その後、Motion Asset 参照、複数モデル binding、体格補正、VMD export の順に進めるとよい。

特に「同じ VMD を複数モデルが参照し、必要なモデルだけ翻訳・補正して焼き込む」構造は、本家 MMD にはない MMD_modoki らしい機能になり得る。

