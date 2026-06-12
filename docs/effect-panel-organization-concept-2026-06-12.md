# Effect Panel 整理構想メモ

## 概要

このメモは、MMD_modoki の Effect 欄に入る描画機能を整理するための総合メモである。

FrameGraph、PostFX、材質シェーダー、外部 WGSL、PBR / OpenPBR、AutoLuminous、Emissive Light Assist、パーティクル、追加ライトなどの検討メモが増えてきたため、Effect 欄の大枠と優先度をここに集約する。

## 基本分類

Effect 欄は、まず次の 4 分類で考える。

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

```text
Effects

Post
  FrameGraph Stack
  [ + Add Post Effect ]

Particles
  Particle Emitters
  [ + Add Particle ]

Materials
  Material / Shader Effects
  [ + Add Material Effect ]

Lighting
  Additional Lights
  [ + Add Light ]
```

最初からすべてを同じ密度で表示しない。各分類には `+` ボタンを置き、追加画面から選ばせる。

右パネルは横幅が限られるため、横方向に情報を広げる UI は避ける。

基本は以下の構成にする。

```text
Effects
[Post] [Particles] [Materials] [Lighting]

Post
  Bloom              on  >
  Depth of Field     on  >
  LUT                on  >
  + Add
```

- 4 分類はタブで切り替える
- タブ内は縦長のリストにする
- 各行は 1 行要約を基本にする
- 詳細は行の展開、popover、drawer、または別画面で開く
- 右パネル内に横 2 カラムの詳細 UI を詰め込まない
- 常時表示する値は、名前、ON/OFF、状態、軽い警告に絞る
- スライダーや詳細項目は、選択中の項目だけ展開する

Post / Particles / Lighting は、イラストソフトのレイヤーに近い縦積み UI として扱う。

Materials / Shaders は、レイヤーというより対象モデル / アクセサリ / 材質の inspector として扱う。

```text
Post
  stack / order based

Particles
  emitter layer list

Lighting
  additional light list

Materials
  target + material inspector
```

## 追加画面の考え方

`+` ボタンで開く追加画面では、表示順とカテゴリでおすすめ度を表す。

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

項目には、軽さ、必要リソース、想定用途、危険度を短く表示する。

```text
Bloom
  Ready / light / MMD video friendly

SSR
  Needs normal + depth + reflectivity / heavy / stage

External WGSL
  Experimental / developer feature
```

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

### UI 案

```text
Post

FrameGraph Stack
  Bloom             on  >
  Depth of Field    on  >
  LUT               on  >
  SSAO              off >
  [ + ]
```

1 行に詰める情報:

- effect name
- enabled state
- ready / missing resource / warning
- drag handle or menu

詳細設定は選択中の 1 項目だけ開く。

```text
Bloom             on  v
  intensity
  threshold
  radius
```

追加画面:

```text
Recommended
  Bloom
  Depth of Field
  LUT

Creative
  Grain
  Chromatic Aberration
  Vignette
  Lens Distortion

Technical
  SSAO
  SSR
  Geometry Buffer Debug

Experimental
  Official FrameGraph Task
  Custom PostProcess
```

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

### UI 案

```text
Particles

Particle Emitters
  Sparkle 01        on  >
  Dust Background   on  >
  [ + ]
```

追加画面:

```text
Recommended
  Sparkle
  Dust

Creative
  Snow
  Petal
  Smoke Light
  Magic Glow

Experimental
  Node Particle Asset
```

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

### UI 案

```text
Materials

Selected Model Materials
  material list
  shader preset
  AutoLuminous
  PBR / OpenPBR override
  External WGSL
```

Materials は右パネル内で横に広げず、対象選択と inspector を縦に積む。

```text
Materials

Target
  Model: Miku

Material
  hair
  ribbon
  face

Selected
  Shader Preset
  AutoLuminous
  PBR / OpenPBR
  External WGSL
```

追加画面:

```text
Recommended
  MMD Standard
  AutoLuminous
  Toon Preset

Creative
  PBR Floor
  Gloss Highlight
  Rim Light

Technical
  OpenPBR Material
  External WGSL Snippet

Experimental
  Custom Shader Package
  Glass / Refraction Research
```

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

### UI 案

```text
Lighting

MMD Standard Light
  direction
  color
  intensity

Additional Lights
  Point Light 01    on   >
  Emissive Assist   auto >
  [ + ]
```

追加画面:

```text
Recommended
  Point Light
  Soft Point Light

Creative
  Spot Light
  Window Glow Assist
  Neon Strip Assist

Technical
  Emissive Light Assist
  Clustered Lighting

Experimental
  Area Light Approximation
  Textured Area Light Research
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

- [FrameGraph Resource Registry 検討メモ](./frame-graph-resource-registry-note-2026-05-30.md)
- [Frame Graph Post Effects Plan](./frame-graph-post-effects-plan-2026-04-28.md)
- [Frame Graph Post Effects Progress](./frame-graph-post-effects-progress-2026-04-28.md)
- [SSR / Frame Graph 実装検討メモ](./ssr-frame-graph-plan-2026-05-12.md)
- [LUT Frame Graph Plan](./lut-frame-graph-plan-2026-05-13.md)
- [External WGSL Shader Loading 構想メモ](./external-wgsl-shader-loading-concept-2026-06-12.md)
- [Emissive Light Assist 構想メモ](./emissive-light-assist-concept-2026-06-12.md)
- [Node Particle Effects 構想メモ](./node-particle-effects-concept-2026-06-12.md)
- [Lighting Effects 構想メモ](./lighting-effects-concept-2026-06-12.md)
- [AutoLuminous GlowLayer 実装メモ](./autoluminous-glowlayer-implementation-note-2026-04-23.md)
- [MMD AutoLuminous 調査メモ](./mmd-autoluminous-research.md)
- [Material Shader Customization Guide](./material-shader-customization-guide.md)
- [PBR / IBL Shadows Investigation](./ibl-shadows-investigation-2026-05-07.md)
- [Post Effects Backlog](./post-effects-backlog.md)
- [v0.2 UI Layout Sketch](./v0.2-ui-layout-sketch-2026-05-30.md)

## 一言まとめ

Effect 欄は、`Post / Particles / Materials / Lighting` の 4 分類で整理する。

v0.2 では Post / FrameGraph の整理を優先し、その上に particle、shader、lighting を段階的に載せる。追加画面では Recommended / Creative / Technical / Experimental の順に並べ、実用機能と実験機能を混ぜすぎないようにする。
