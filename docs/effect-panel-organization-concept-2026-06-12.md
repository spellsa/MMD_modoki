# Effect Panel 整理構想メモ

## 概要

このメモは、MMD_modoki の Effect 欄に入る描画機能を整理するための総合メモである。

FrameGraph、PostFX、材質シェーダー、外部 WGSL、PBR / OpenPBR、AutoLuminous、Emissive Light Assist、パーティクル、追加ライトなどの検討メモが増えてきたため、Effect 欄の大枠と優先度をここに集約する。

## 現在の実装状態

2026-06-12 時点で、Effect 欄は次の 4 タブ Shell まで実装済み。

```text
Effect

[効果] [材質] [粒子] [光源]
```

現在の中身:

- `Post`
  - compact stack / details UI を主UIとして表示
  - 既存 Camera PostFX UI は画面表示から外し、互換用 hidden host に退避
  - `+` から FrameGraph 追加候補パレットを開ける
  - FrameGraph 追加候補パレットは 3 列表示
  - FrameGraph backend 有効時、候補選択で既存 PostFX / FrameGraph 設定を ON にする
  - 追加済みまたは有効な項目を compact stack として表示する
  - compact stack の先頭 checkbox で ON / OFF できる
  - checkbox を OFF にしても行は消さず、off 状態で残す
  - compact stack の effect name 領域で詳細を展開できる
  - 展開詳細内で主要パラメータを slider / select で直接編集できる
  - stack / add palette は無彩色 dark gray ベース
  - 既存 PostFX UI を完全に compact details 化する作業は未完了
- `Materials`
  - 既存 shader / material UI を維持
  - model / material selector、shader preset、material list は既存経路のまま
- `Particles`
  - placeholder のみ
  - runtime 未実装
- `Lighting`
  - placeholder のみ
  - additional light runtime 未実装

関連する実装メモ:

- [Effect Panel UI 実装計画メモ](./effect-panel-ui-implementation-plan-2026-06-12.md)

## 基本分類

Effect 欄は、次の 4 分類で考える。

```text
Post
  画面全体を最後に加工する

Particles
  シーン内に粒子演出を追加する

Materials / Shaders
  材質やモデルの見た目を変える

Lighting
  シーンの光を増やす、補助する、影を調整する
```

この分類は、MMD 互換の基本編集機能とは別に、MMD_modoki 独自の映像表現を置くための箱として扱う。

## 目標

- MMD 動画制作で使いやすい Effect 欄にする
- 実験機能を増やしても UI が散らからないようにする
- FrameGraph / shader / particle / lighting の責務を分ける
- デフォルトでは安全な項目だけを見せる
- 上級者向け機能は Experimental / Lab として隔離する
- project 保存 / 読み込み、出力、backend 切替時の挙動を意識する

## UI の大枠

現在の実装では、4 分類をタブとして表示する。

```text
Effects
[効果] [材質] [粒子] [光源]
```

各タブの方針:

```text
Post
  FrameGraph / PostFX stack
  縦積みリスト + 詳細展開

Particles
  Particle emitter / layer list
  縦積みリスト + 詳細展開

Materials
  Target + material inspector
  既存 shader / material UI を維持

Lighting
  Additional light list
  縦積みリスト + 詳細展開
```

右パネルは横幅が限られるため、横方向に情報を広げる UI は避ける。

基本は以下の構成にする。

```text
Effects
[効果] [材質] [粒子] [光源]

効果
  Bloom              on  >
  Depth of Field     on  >
  LUT                on  >
  + Add
```

- タブ内は縦長のリストにする
- 各行は 1 行要約を基本にする
- 詳細は行の展開、popover、drawer、または別画面で開く
- 右パネル内に横 2 カラムの詳細 UI を詰め込まない
- 常時表示する値は、名前、ON/OFF、状態、軽い警告に絞る
- スライダーや詳細項目は、選択中の項目だけ展開する

## Post

Post は、最終的な画面全体にかける効果を扱う。

主軸は FrameGraph backend とする。

対象:

- Bloom
- DoF
- LUT
- SSAO
- SSR
- FXAA
- Sharpen
- Grain
- Chromatic Aberration
- Lens Distortion
- Vignette / Edge Blur
- custom post effect

### 方針

- v0.2 では FrameGraph 整理を最優先にする
- Classic PostProcess は fallback / legacy として扱う
- 新規 UI は FrameGraph 前提で設計する
- scene color / depth / normal / reflectivity の共有方針を先に整理する
- Babylon.js 公式 FrameGraph task は、まず Lab / Experimental として追加候補にする

### 現在

現在は compact stack / details を `Post` タブの主UIとしている。
既存 Camera PostFX UI は表示せず、互換用 hidden host に退避している。

また、`+` から FrameGraph 追加候補を選べる。

現在の候補:

- Bloom
- DoF
- LUT
- SSAO
- SSR
- Vignette
- Grain
- Sharpen
- Chroma
- EdgeBlur
- Distort

compact stack では、先頭 checkbox で ON / OFF を切り替える。
OFF にした項目も stack からは消さず、off バッジ付きで残す。

各行の effect name 領域を開くと、主要パラメータの slider / select / button を表示する。
LUT の source / file load、DoF の target model / bone / focus offset、SSAO fade end なども、いったん詳細内へ移している。
表示順は、下の項目が先にかかり、上の項目が後から重なるレイヤー型の見え方に寄せる。

ただし、現時点の順序は固定であり、ユーザーによる入れ替えは未実装。

次の整理対象:

- 詳細内に詰め込んだ項目から、使用頻度の低いものを整理・削減する
- 既存 PostFX UI を最終的に折りたたむ / Lab 側へ逃がすか検討する
- 順序入れ替えを task chain / 保存値込みで設計する

## Particles

Particles は、シーン内に粒子演出を追加する。

対象:

- sparkle
- dust
- snow
- petal
- smoke
- magic glow
- foreground / background bokeh particles
- Babylon.js Node Particle asset

### 方針

- FrameGraph のノードではなく、シーン内エフェクトとして扱う
- 初期段階では main scene color に描画する
- Bloom / DoF と組み合わせて映像映えを狙う
- 外部 Node Particle 読み込みより、組み込みプリセットを先に作る
- depth / normal / reflectivity への参加は初期目標にしない

### 現在

`Particles` タブは placeholder のみ。

runtime、保存形式、Node Particle 読み込みは未実装。

## Materials / Shaders

Materials / Shaders は、モデル、アクセサリ、ステージ、床などの材質表現を扱う。

対象:

- MMD material preset
- toon shader preset
- AutoLuminous
- external WGSL material snippet
- PBR material override
- OpenPBR material
- glass / refraction material
- floor-only PBR
- stage material override

### 方針

- PMX キャラクターの MMD Standard は既定で維持する
- PBR / OpenPBR はまず床、ステージ、GLB、アクセサリ向けに扱う
- 外部 WGSL は Babylon.js の扱いに準じ、MMD_modoki 独自仕様を増やしすぎない
- Shader / Material と PostFX を混ぜない
- 材質ごとの適用状態を project に保存する

### 現在

`Materials` タブに既存 shader / material UI を収容している。

現時点では大きく作り直さず、既存の model / material inspector 型 UI を維持する。

今後の候補:

- model / accessory 対象統合
- PBR / OpenPBR override UI
- AutoLuminous 関連表示の整理
- 外部 WGSL UI の整理

## Lighting

Lighting は、シーンの光を増やす、補助する、影を調整する機能を扱う。

対象:

- MMD standard light
- manual point light
- spot light
- soft point light
- area light approximation
- Emissive Light Assist
- Clustered Lighting / Forward+
- shadow control
- volumetric light

### 方針

- MMD standard light は互換用の基本ライトとして維持する
- 追加ライトは MMD_modoki 独自の project state として保存する
- 最初は shadow なしの point light から始める
- Emissive Light Assist は Lighting に属するが、入力として Materials / AutoLuminous の情報を使う
- 面光源は最初から正確な物理 area light を狙わず、演出プリセットとして近似する
- clustered lighting は多数ライトが必要になってから検証する

### 現在

`Lighting` タブは placeholder のみ。

MMD standard light の詳細 UI は、既存の lighting / shadow UI 側に残っている。

manual point light、Emissive Light Assist、Clustered Lighting は未実装。

## 追加画面

`+` ボタンで開く追加画面では、表示順とカテゴリでおすすめ度を表す。

現時点では `+` ボタンは disabled。

将来の分類:

```text
Recommended
  通常のMMD動画で使いやすい

Creative
  映像映えするが調整前提

Technical
  depth / normal / reflectivity / shader などの前提がある

Experimental
  壊れる可能性がある、公式機能ほぼ素のまま、研究用
```

## 優先順位

v0.2 前後では、次の順で扱う。

1. FrameGraph / Post 整理
2. FrameGraph shared resource 整理
3. Bloom / DoF / LUT / SSAO / SSR の順序と保存値整理
4. Materials / Shaders の既存 UI 整理
5. PBR / OpenPBR の床・ステージ向け検討
6. Lighting の手動 point light 検討
7. Emissive Light Assist 検討
8. Particle sparkle preset 検討
9. 外部 WGSL / Node Particle / Raw FrameGraph task の Lab 化

ただし、映像映えの確認目的で `sparkle preset` や `manual point light` の小さい PoC を先に挟むことはあり得る。

## 保存 / 読み込み方針

Effect 欄の状態は、project save / load と強く結びつく。

最低限保存したいもの:

- 有効 / 無効
- 種類
- 表示名
- 適用対象
- 順序
- 主要パラメータ
- 外部 asset path
- backend / experimental flag

MMD / VMD 互換ではない機能は、MMD_modoki 独自 project state として保存する。

## 出力との関係

Effect 欄に入れた機能は、viewport だけでなく PNG / WebM 出力に反映される必要がある。

確認対象:

- FrameGraph backend の出力反映
- LUT / Bloom / DoF の PNG / WebM 反映
- particle の固定 seed / 再現性
- 追加ライトの project 復元
- external shader の読み込み失敗時 fallback

## Diagnostics

Effect 欄が育つほど、状態確認 UI が必要になる。

候補:

- FrameGraph stack viewer
- shared resource viewer
- active post effect list
- particle count
- additional light count
- shader compile status
- missing resource warning
- heavy feature warning

Diagnostics は通常の編集 UI に常時混ぜず、drawer または Lab 画面として扱う。

## 関連メモ

- [Effect Panel UI 実装計画メモ](./effect-panel-ui-implementation-plan-2026-06-12.md)
- [FrameGraph Resource Registry 検討メモ](./frame-graph-resource-registry-note-2026-05-30.md)
- [Frame Graph Post Effects Plan](./frame-graph-post-effects-plan-2026-04-28.md)
- [Frame Graph Post Effects Progress](./frame-graph-post-effects-progress-2026-04-28.md)
- [SSR / Frame Graph 実装検討メモ](./ssr-frame-graph-plan-2026-05-12.md)
- [LUT Frame Graph Plan](./lut-frame-graph-plan-2026-05-13.md)
- [External WGSL Shader Loading 構想メモ](./external-wgsl-shader-loading-concept-2026-06-12.md)
- [Emissive Light Assist 構想メモ](./emissive-light-assist-concept-2026-06-12.md)
- [Node Particle Effects 構想メモ](./node-particle-effects-concept-2026-06-12.md)
- [Lighting Effects 構想メモ](./lighting-effects-concept-2026-06-12.md)
- [Luminous / AutoLuminous 代替 FrameGraph 再設計メモ](./luminous-frame-graph-redesign-plan-2026-06-13.md)
- [AutoLuminous GlowLayer 実装メモ](./autoluminous-glowlayer-implementation-note-2026-04-23.md)
- [MMD AutoLuminous 調査メモ](./mmd-autoluminous-research.md)
- [Material Shader Customization Guide](./material-shader-customization-guide.md)
- [PBR / IBL Shadows Investigation](./ibl-shadows-investigation-2026-05-07.md)
- [Post Effects Backlog](./post-effects-backlog.md)
- [v0.2 UI Layout Sketch](./v0.2-ui-layout-sketch-2026-05-30.md)

## 一言まとめ

Effect 欄は、`Post / Materials / Particles / Lighting` の 4 タブ Shell まで実装済み。

次は `Post` タブ内の既存 PostFX UI を、Bloom / LUT などから compact list + details へ段階的に置き換える。

## 2026-07-01 現行補足

Effect panel の FrameGraph / Post 領域は、当初の placeholder / disabled `+` から進み、現在は実際に post effect を追加・並べ替え・個別 ON/OFF できる。

現行の大きな差分:

- `+` から FrameGraph post effect を追加できる。
- stack row には checkbox があり、OFF にしても row とパラメーターは残る。
- 上下移動とドラッグで順序を変えられる。
- 順序は runtime の post effect order に反映される。
- `Offset Rim -> Bloom` のような順序で、前段効果へ後段 Bloom をかけられる。
- stack entry の `enabled` と、各効果の色 / 強度 / threshold などのパラメーターは別管理。
- project save/load で `frameGraphPostStack` を復元する。

今後 UI 側で注意すること:

- row の ON/OFF を効果パラメーターの enabled だけで代用しない。
- stack order / enabled 変更時は FrameGraph backend rebuild が必要。
- internal id `offsetHighlight` は UI では `Offset Rim` として表示する。
- 未実装 Lab 的な効果と、既に stack に入った実用効果を同じ見た目で混ぜすぎない。
