# Effect Panel UI 実装計画メモ

## 概要

このメモは、MMD_modoki の右側 Effect 欄を `Post / Materials / Particles / Lighting` の 4 タブ構成へ整理するための実装計画と、2026-06-12 時点の実装状況をまとめる。

方針は「UI の箱を先に作り、既存機能を壊さず収容し、その後で各タブの中身を段階的に実装する」である。

## 現在の実装状態

2026-06-12 時点で、Effect 欄の Shell 実装は入っている。

実装済み:

- 右パネルに 4 タブを追加
  - `Post`
  - `Materials`
  - `Particles`
  - `Lighting`
- `Materials` タブに既存の shader / material UI を収容
- `Post` タブに compact stack / details UI を追加
- 既存 Camera PostFX UI は画面表示から外し、互換用 hidden host に退避
- `Post` タブの `+` から FrameGraph 追加候補パレットを開ける
- FrameGraph 追加候補パレットは 3 列表示
- FrameGraph backend が Classic の場合は、追加前に FrameGraph へ切り替える導線を出す
- FrameGraph backend が有効な場合、候補を選ぶと既存の runtime 設定を ON にする
- 追加済みまたは有効な FrameGraph / PostFX 項目を compact stack として表示する
- stack 行の先頭に checkbox を置き、ON / OFF を切り替えられる
- checkbox を OFF にしても行は消さず、off 状態で残す
- stack 行の effect name 領域から詳細を展開できる
- 展開詳細内で主要パラメータを slider / select で直接編集できる
- 効果タブの stack / add palette は無彩色の dark gray ベースに寄せる
- `Particles` タブに placeholder を追加
- `Lighting` タブに placeholder を追加
- 起動時の初期タブは `Post`
- タブ切り替え用 controller を追加
- 右パネル幅向けの compact UI CSS を追加

追加 / 更新ファイル:

- `index.html`
- `src/index.css`
- `src/ui-controller.ts`
- `src/ui/effect-panel-shell-controller.ts`

確認済み:

```powershell
npm.cmd run lint
npm.cmd run smoke:launch
```

`smoke:launch` では `engine=WebGPU`、`physics=Bullet MPR` まで到達した。

## 現在の UI 構造

```text
Effect

[効果] [材質] [粒子] [光源]

効果
  FrameGraph / Post
  + button
  FrameGraph add palette
  Active stack list with checkbox
  Legacy Camera PostFX controls

材質
  Target
  Shader preset
  Apply buttons
  Material list

粒子
  Particle Layers
  Sparkle Preset     planned
  Node Particle      lab
  + button disabled

光源
  Lighting Effects
  MMD Standard Light current
  Emissive Assist    planned
  + button disabled
```

`Post / Particles / Lighting` は、将来的にイラストソフトのレイヤーに近い縦積み UI として育てる。

`Materials` は、現時点では既存の model / material inspector 型 UI を維持する。

## 実装方針

### Shell first

最初に Effect panel の外枠を作る。

この段階では、すべての effect runtime を移植しない。既存 UI を一度 Shell の中へ入れ、見た目と導線を整理する。

現在この段階は実装済み。

### Existing UI bridge

既存 UI を消さず、新しい Shell の中に差し込む。

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

現在この段階は実装済み。

### Progressive replacement

次の段階では、`Post` タブから順に既存 PostFX UI を compact list + details へ分解する。

最初の候補:

- Backend
- Bloom
- LUT
- DoF
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

## 実装済み詳細

### `src/ui/effect-panel-shell-controller.ts`

タブ状態だけを持つ小さな controller。

責務:

- `data-effect-tab` の click を受ける
- active tab の CSS class / `aria-selected` を同期する
- `data-effect-tab-view` の `hidden` を切り替える

この controller は Babylon object、MMD model 実体、project state を持たない。

### `index.html`

既存の `#shader-panel` を維持したまま、内部を 4 タブ構成へ変更した。

既存 shader UI が依存する DOM id は維持している。

維持した id:

```text
shader-model-select
shader-preset-select
btn-shader-apply-all
btn-shader-apply-selected
btn-shader-reset
shader-panel-note
shader-material-list
```

新規追加:

```text
effect-post-host
effect-post-stack-list
effect-post-add-panel
data-effect-tab
data-effect-tab-view
```

### `src/ui-controller.ts`

`EffectPanelShellController` を初期化し、起動時は `Post` タブを開く。

```text
initial -> Post
```

また、`renderShaderCameraPostEffectsPanel()` の描画先を `shader-material-list` から `effect-post-host` へ移した。

その後、stack details 側で主要パラメータを直接編集できるようになったため、`effect-post-host` は hidden な互換ホストとして扱う。
これにより、Camera PostFX UI が Materials の material list を上書きせず、Post タブ内も旧UIで狭くならない構成になった。

`FRAME_GRAPH_POST_ADD_EFFECTS` に、追加候補、ON / OFF 判定、既定の ON / OFF 切り替えを集約している。

compact stack の詳細表示には、各 effect の主要パラメータを直接操作する slider / select を表示する。
入力中は stack 詳細内の値表示だけを更新し、change 時に stack details を再描画して同期する。

`+` で追加したとき、または checkbox で OFF から ON に戻したときは、効果が分かる程度の初期値を入れる。
旧UIでは 0 に近い値が初期値になりがちだったが、新UIでは ON にしたのに見た目が変わらない状態を避けるため、概ね 50% 前後の値をデフォルトにする。

現時点で詳細内から直接編集できる項目:

- Bloom: weight / threshold / kernel
- DoF: target model / target bone / focus / focus offset / f-stop / lens size / focal length
- LUT: source / file load / preset / intensity
- SSAO: strength / radius / fade end
- SSR: strength / step
- Vignette: weight
- Grain: intensity
- Sharpen: edge
- Chroma: offset
- EdgeBlur: strength
- Distort: influence

### `src/index.css`

右パネル向けの compact UI を追加した。

主な class:

```text
effect-panel-tabs
effect-panel-tab
effect-panel-tab--active
effect-panel-view
effect-panel-section-head
effect-panel-host
effect-layer-list
effect-layer-placeholder
effect-status-badge
```

既存 `.effect-row` は PostFX 内部で使われているため、削除していない。

## まだ実装していないこと

### Add 画面

`Post` タブの `+` ボタンは実装済み。

現在追加できる候補:

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

FrameGraph backend が Classic の場合は、追加ボタンを disabled にし、FrameGraph へ切り替えるボタンを表示する。

Particles / Lighting の `+` ボタンはまだ disabled。

後続で分類ごとの追加画面を作る。

分類案:

```text
Recommended
Creative
Technical
Experimental
```

### Post compact list

現時点の `Post` タブは、既存 Camera PostFX UI を表示せず、compact stack / details を主UIとしている。

次は、Bloom / LUT などから compact item 化する。

### FrameGraph Stack

FrameGraph / PostFX の有効状態を stack として見せる UI は実装済み。

現在は固定の FrameGraph 順をもとに、下が先にかかり、上が後から重なる見た目で表示する。

```text
later / upper
  Distort
  EdgeBlur
  Vignette
  Chroma
  Grain
  Sharpen
  LUT
  Bloom
  DoF
  SSAO
  SSR
earlier / lower
```

実際の順序入れ替えは未実装。

理由:

- 現在の `FrameGraphPostEffectsController` は固定順で task chain を組んでいる
- UI だけ順序変更できると、見た目と実行順がずれる
- 順序入れ替えを入れる場合は、保存値、task chain 再構築、出力確認をセットで扱う必要がある

### Particles runtime

`Particles` タブは placeholder のみ。

実 runtime、project 保存、Node Particle 読み込みは未実装。

### Lighting runtime

`Lighting` タブは placeholder のみ。

追加 point light、Emissive Light Assist、clustered lighting は未実装。

### Materials の再整理

`Materials` タブは既存 UI を維持している。

今後の候補:

- model / accessory の対象統合
- PBR / OpenPBR override
- AutoLuminous 関連表示の整理
- 外部 WGSL の UI 整理

## 今後の推奨ステップ

### Step 1: Post compact list PoC

既存 PostFX UI のうち、壊しにくいものから compact item 化する。

候補:

- Bloom
- LUT

理由:

- ON/OFF と主要 slider が分かりやすい
- 既存 controller が比較的独立している
- 映像上の変化を確認しやすい

### Step 2: FrameGraph backend 表示整理

FrameGraph backend が有効なときの stack / resource 状態を表示する。

まずは表示だけでよい。

### Step 3: Add 画面 PoC

`Post` の `+` から、既存 effect の追加候補を表示する。

初期は実際の追加処理なしでもよい。

### Step 4: Particles / Lighting placeholder の詳細化

実装予定項目を placeholder から compact row 表示へ寄せる。

### Step 5: project save / load

Particles / Lighting / custom effect を実装する段階で、project state の保存形式を追加する。

## 触らない方針

現時点では以下を触らない。

- project save format
- runtime effect behavior
- FrameGraph task chain の順序
- particle runtime
- additional light runtime
- external WGSL の仕様
- PBR / OpenPBR の実装
- Classic PostProcess の削除

## リスク

### 既存 DOM id 依存

既存 controller は `document.getElementById()` と `querySelector()` に依存している。

初回実装では id を維持した。今後 id を変える場合は、controller 側の依存整理を先に行う。

### `renderShaderCameraPostEffectsPanel()` の巨大 HTML

PostFX UI の多くは、まだ `UIController.renderShaderCameraPostEffectsPanel()` の大きな HTML 文字列で生成されている。

次の整理対象はここ。

### Model / Camera target と tab selection

現在は起動時に `Post` タブを開く。

```text
initial -> Post
```

手動で別タブを開くことはできる。

モデル編集中でも自動で `Materials` へ飛ばさない。
今後、target に応じた案内が必要になった場合は、タブ自動切り替えではなく軽い通知やバッジで扱う。

### 右パネル幅

右パネルは狭いため、横 2 カラムの詳細 UI は避ける。

1 行要約、選択項目だけ展開、詳細は drawer / popup に逃がす方針を守る。

## 一言まとめ

Effect 欄は、4 タブ Shell と legacy UI bridge まで実装済み。

次は `Post` タブ内の既存 PostFX UI を、Bloom / LUT などから compact list + details へ段階的に置き換える。
