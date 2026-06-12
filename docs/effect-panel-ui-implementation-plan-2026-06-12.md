# Effect Panel UI 実装計画メモ

## 概要

このメモは、MMD_modoki の右側 Effect 欄を、v0.2 世代の UI 方針に合わせて整理し直すための実装計画である。

まず UI の箱と操作導線を先に作り、各 effect の中身は後から段階的に移植する。

## 前提

- Tailwind CSS は導入済み
- 右パネルは横幅が限られる
- 既存の shader / post effect / FrameGraph UI は動いている部分があるため、一度に壊さない
- `index.html` の右パネルは現在 `shader-panel` として作られている
- Camera target 時の PostFX UI は `UIController.renderShaderCameraPostEffectsPanel()` が大きな HTML 文字列を生成している
- shader / material 側は `src/ui/shader-panel-controller.ts` が既に持っている
- DoF / LUT / Bloom / Color / Lens / Fog などは個別 controller へ一部切り出されている

## 目的

- Effect 欄を `Post / Particles / Materials / Lighting` の 4 タブに整理する
- Post / Particles / Lighting は縦積みレイヤー型 UI にする
- Materials は既存の model / accessory / material inspector 型を維持する
- まず見た目と構造を作り、runtime 実装は後追いできるようにする
- 既存 PostFX / Shader の操作経路を壊さず、段階的に置き換える
- 将来の FrameGraph stack、Particle layer、Additional light list を同じ UI 文法で扱えるようにする

## 完成イメージ

```text
Effect

[Post] [Particles] [Materials] [Lighting]

Post
  FrameGraph Stack
  Bloom              on   >
  Depth of Field     on   >
  LUT                on   >
  SSAO               off  !
  + Add

Particles
  Sparkle 01         on   >
  Dust Background    off  >
  + Add

Materials
  Target
  Material List
  Selected Material Settings

Lighting
  MMD Standard Light on   >
  Point Light 01     off  >
  Emissive Assist    auto >
  + Add
```

## 実装方針

### 1. Shell first

最初に Effect panel の外枠を作る。

この段階では、すべての実機能を移植しない。

作るもの:

- 4 タブ
- タブ切り替え状態
- 縦リスト UI
- compact item
- selected / expanded item
- `+ Add` button
- empty / coming soon state
- Materials タブ内に既存 shader UI を置く領域
- Post タブ内に既存 PostFX UI を置く領域

### 2. Existing UI bridge

既存 UI を一度に消さず、新しい Shell の中に差し込む。

```text
EffectPanelShell
  Post tab
    LegacyPostFxHost

  Materials tab
    LegacyShaderMaterialHost

  Particles tab
    Placeholder

  Lighting tab
    Placeholder
```

これにより、見た目の整理と機能移植を分離する。

### 3. Progressive replacement

Post タブから順に、既存の大きな HTML 文字列を compact list + details へ分解する。

最初の対象:

- Backend
- Bloom
- DoF
- LUT
- SSAO
- SSR

後回し:

- Grain
- Sharpen
- Chromatic Aberration
- Vignette
- Edge Blur
- Lens Distortion
- Fog
- hidden / experimental rows

## コンポーネント案

React は使わず、既存の DOM controller 方針に合わせる。

ただし、UI 生成単位は小さく分ける。

```text
src/ui/effect-panel-shell-controller.ts
src/ui/effect-panel-ui.ts
src/ui/effect-panel-types.ts
```

### `effect-panel-types.ts`

```ts
export type EffectPanelTabId = "post" | "particles" | "materials" | "lighting";

export type EffectItemStatus = "ready" | "warning" | "missing" | "experimental" | "disabled";

export type EffectCompactItem = {
    id: string;
    label: string;
    enabled?: boolean;
    status?: EffectItemStatus;
    summary?: string;
    expanded?: boolean;
};
```

この型は UI 表示用に限定する。Babylon object や MMD model 実体は入れない。

### `effect-panel-ui.ts`

DOM 生成 helper を置く。

候補:

- `createEffectTabs()`
- `createEffectCompactItem()`
- `createEffectListSection()`
- `createEffectEmptyState()`
- `createEffectAddButton()`
- `setEffectTabActive()`

### `effect-panel-shell-controller.ts`

タブ状態、host の差し替え、placeholder 表示を担当する。

責務:

- 初期化
- タブ切り替え
- active tab の保存候補
- legacy host の配置
- placeholder の表示
- later: add dialog を開く

## HTML 方針

`index.html` の右パネルは、まず shell 用の host を置く。

```html
<aside id="shader-panel">
  <div class="panel-header">...</div>
  <div id="effect-panel-root" class="effect-panel-root">
    ...
  </div>
</aside>
```

既存の `shader-model-select` などは、最初は削除せず、Materials tab の legacy host に移す。

最初の安全策として、既存 DOM id は維持する。

```text
shader-model-select
shader-preset-select
btn-shader-apply-all
btn-shader-apply-selected
btn-shader-reset
shader-panel-note
shader-material-list
```

既存 controller が `document.getElementById()` で取っているため、id を変える場合は controller 側の修正が必要になる。初回は id 維持を優先する。

## CSS / Tailwind 方針

Tailwind utilities を使いつつ、既存 CSS と衝突しないよう、最初は `effect-panel-*` の薄いクラスを作る。

方針:

- 右パネル内は compact density
- row height は小さめ
- タブは横スクロールしない範囲に収める
- 1 行要約を基本にする
- details は選択項目だけ表示する
- card の入れ子にしない
- 見た目の主張を強くしすぎない

候補 class:

```text
effect-panel-root
effect-panel-tabs
effect-panel-tab
effect-panel-tab--active
effect-panel-view
effect-layer-list
effect-layer-item
effect-layer-item--expanded
effect-layer-summary
effect-layer-details
effect-add-row
effect-status-badge
```

既存 `.effect-row` は PostFX 内部で使われているため、急に消さない。

## タブごとの初期状態

### Post

最初は既存 PostFX UI を入れる。

Phase 2 以降で FrameGraph Stack 表示へ置き換える。

初期表示:

```text
Post
  Backend
  Legacy PostFX controls
```

将来:

```text
FrameGraph Stack
  Bloom
  DoF
  LUT
  SSAO
  SSR
```

### Particles

最初は空の placeholder。

```text
Particle Effects
  Coming later
  + Add Particle
```

`+ Add Particle` は disabled または Experimental badge 表示にする。

### Materials

既存 shader / material UI をここに置く。

大きく作り直さない。

初期表示:

```text
Target
Shader preset
Apply buttons
Material list
```

後で model / accessory 統合 selector を検討する。

### Lighting

最初は空の placeholder と MMD Standard Light への導線だけ置く。

```text
Lighting
  MMD Standard Light
  Additional Lights
  + Add Light
```

`+ Add Light` は disabled または Experimental badge 表示にする。

## Add 画面

初回実装では Add 画面は作らない。

まず `+ Add` ボタンの位置と disabled / coming soon 表示だけ作る。

後続で、分類ごとに追加画面を作る。

```text
Recommended
Creative
Technical
Experimental
```

## 実装ステップ

### Step 0: 現状固定

- `index.html` の Effect panel DOM を確認
- `UIController.renderShaderCameraPostEffectsPanel()` の出力範囲を確認
- `ShaderPanelController` が依存する DOM id を確認
- 既存の `effect-row` / `shader-panel-*` CSS を触る範囲を決める

### Step 1: docs / design lock

- [Effect Panel 整理構想メモ](./effect-panel-organization-concept-2026-06-12.md) を実装方針の基準にする
- このメモを作業計画として扱う

### Step 2: Shell controller 追加

- `src/ui/effect-panel-types.ts`
- `src/ui/effect-panel-ui.ts`
- `src/ui/effect-panel-shell-controller.ts`

この段階では runtime setter に触らない。

### Step 3: HTML host 追加

- `index.html` の右パネルに tab shell 用 root を追加
- 既存 shader DOM id は維持する
- Materials tab に既存 shader UI を置く

### Step 4: CSS 追加

- compact tab
- compact list
- item row
- details area
- empty state

Tailwind utilities と既存 CSS の混在で作る。

### Step 5: UIController へ接続

- `EffectPanelShellController` を初期化
- `ShaderPanelController` が参照する DOM が引き続き存在することを確認
- Camera target / model target 切り替え時に tab が不自然に消えないようにする

### Step 6: Post tab に legacy host を表示

- camera target 時の PostFX UI を Post tab に表示する
- model target 時でも Post tab を開けるようにするかは別途判断
- 既存の `renderShaderCameraPostEffectsPanel()` は初回では大きく分解しない

### Step 7: Materials tab に existing shader UI を表示

- model target 時の既存 shader UI を Materials tab に表示
- camera target 時でも Materials tab の空表示を出す

### Step 8: Placeholder tab

- Particles tab
- Lighting tab

coming soon / experimental placeholder を表示する。

### Step 9: Post compact list PoC

既存 PostFX UI のうち、壊しにくいものから compact item 化する。

最初の候補:

- Bloom
- LUT

理由:

- 既存 controller が比較的独立している
- ON/OFF と主要 slider が分かりやすい
- 映像上の効果が確認しやすい

### Step 10: FrameGraph Stack 表示

FrameGraph backend 用に stack 表示を作る。

初期は順序変更なしでよい。

```text
FrameGraph Stack
  Image
  SSR
  SSAO
  DoF
  Bloom
  LUT
  Color
  FXAA
```

後続で ON/OFF、順序変更、official task palette を検討する。

## 触らないもの

初回では以下を触らない。

- project save format
- runtime effect behavior
- FrameGraph task chain の順序
- particle runtime
- additional light runtime
- external WGSL の仕様
- PBR / OpenPBR の実装
- Classic PostProcess の削除

## 確認項目

UI shell 実装時:

- Effect panel を開閉できる
- panel width resize が壊れていない
- Post / Particles / Materials / Lighting タブを切り替えられる
- Materials tab で既存 shader model selector が動く
- Post tab で既存 PostFX controls が動く
- model target / camera target 切り替えで表示が破綻しない
- locale 切り替えで既存文言が崩れない
- 右パネル幅 244px 付近でもテキストがはみ出さない

可能なら実行:

```powershell
npm.cmd run lint
npm.cmd run smoke:launch
```

DOM に依存しない helper を作った場合:

```powershell
npm.cmd run test:unit
```

## リスク

### 既存 DOM id 依存

既存 controller は `document.getElementById()` と `querySelector()` に強く依存している。id を変更すると一気に壊れる。

初回は id を維持する。

### `renderShaderCameraPostEffectsPanel()` の巨大 HTML

この関数は PostFX UI の多くを一括生成している。最初から分割しようとすると、イベント接続と refresh が壊れやすい。

まず legacy host として包む。

### Model / Camera target の混線

現在の Effect 欄は target によって shader UI / camera postfx UI が切り替わる。

新 UI では target 切り替えと tab 切り替えが別軸になるため、どちらが表示を支配するかを明確にする必要がある。

初期方針:

- tab selection が表示カテゴリを決める
- target selection は Materials の対象や DoF focus target など、各 tab 内の入力として扱う

### 右パネル幅

横に広い UI を入れるとすぐ破綻する。

1 行要約、選択項目だけ展開、詳細は drawer / popup に逃がす方針を守る。

## 一言まとめ

Effect 欄の整理は、まず UI shell と 4 タブを作り、既存 PostFX / Shader UI をその中に一時収容する。

その後、Post から compact list / FrameGraph stack へ段階移植し、Particles と Lighting は placeholder から始める。
