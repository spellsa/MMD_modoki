# Tailwind CSS による v0.2 UI 共通化計画 2026-06-07

## 目的

v0.2 UI は MMD 本家寄せの画面構成へ進めているが、下パネル、ポップアップ、ビューポート上バー / 下バーの UI 部品が個別 CSS と個別 DOM 生成に散り始めている。

このメモでは、導入済みの Tailwind CSS を v0.2 UI の共通スタイル管理に使う方針を整理する。

## 現状

Tailwind CSS は導入済み。

- `tailwindcss`
- `@tailwindcss/vite`
- `vite.renderer.config.ts` の Tailwind plugin
- `src/index.css` の Tailwind import

ただし、現行 UI の多くはまだ既存の独自 class で管理している。

例:

- `.app-menu-*`
- `.popup-form-*`
- `.bottom-section`
- `.bone-number-*`
- `.morph-category-*`
- `.viewport-*`

つまり現状は、Tailwind CSS は使えるが、v0.2 UI の主要部品にはまだ十分使われていない。

## 基本方針

React / Vue のような component tree へ移行するのではなく、vanilla TypeScript のまま進める。

構成は以下を基本にする。

```text
index.html
  静的な外枠 DOM
  data-menu-command
  data-i18n

Controller
  状態同期
  Action dispatch
  Undo / Redo 接続
  runtime refresh

UI helper
  DOM 生成
  Tailwind class 付与
  最小限の入力イベント通知

CSS
  canvas / timeline / 複雑な描画領域
  CSS custom property
  状態 class
  Tailwind で表しにくい特殊 UI
```

Tailwind utility は controller に長く直接書かず、共通 helper 側に閉じ込める。controller は「何を表示するか」と「どの Action へつなぐか」に集中させる。

## 共通化対象

優先して Tailwind 管理へ寄せる対象:

- 下パネルの number input
- 下パネルの slider + value row
- 下パネルの empty / disabled state
- 下パネルの morph category card
- popup form の field / control / action button
- viewport 上バー / 下バーの icon button

当面 Tailwind 化を急がない対象:

- canvas / viewport の sizing
- timeline canvas / DOM overlay
- waveform / keyframe track 描画
- app shell 全体の grid / resize
- Babylon / WebGPU overlay まわり
- Effect panel の複雑な既存 controller

## 追加した helper

最初のスライスとして以下を追加した。

```text
src/ui/panel-control-helpers.ts
```

現在の責務:

- `createPanelNumberGrid()`
- `createPanelNumberField()`
- `setPanelEmptyState()`
- `createPanelMorphCategory()`
- `createPanelCategoryEmpty()`
- `createPanelSliderValueRow()`
- `applyPanelMorphCategoryGridClasses()`
- `enhanceBottomPanelControls()`

helper は DOM と見た目だけを担当する。runtime、ActionDispatcher、undo / redo は持たせない。

## 初回実装結果

2026-06-07 の初回スライスでは、以下を共通 helper に寄せた。

- `bone-section` のボーン位置 / 角度数値入力
- `accessory-section` の `X / Y / Z / Rx / Ry / Rz / Si / Tr` 数値入力
- `morph-section` の 4 分類カード、empty 表示、slider row
- `BottomPanel` 内の一部 empty state 表示

既存の下パネル layout や Action / Command 経路は変更していない。

## 追加実装結果 2026-06-07

次段階として、既存の静的 DOM を壊さずに見た目を寄せるため、下パネル用 enhancer を追加した。

```ts
enhanceBottomPanelControls(document)
```

対象:

- `info-action-btn`
- `info-mini-btn`
- `operation-mode-btn`
- `playback-export-btn`
- `camera-view-btn`
- 下パネル内 select
- 下パネル内 checkbox
- 下パネル内 label
- 静的 `panel-empty-state`
- 照明 / 影の slider row と value

この方式は、既存 HTML をすぐに全置換せず、共通 Tailwind class を段階的に重ねるための移行策として扱う。

注意点:

- active 状態の class は既存 controller / CSS に任せる。
- enhancer で runtime や Action を触らない。
- 静的 DOM の大規模置換は、次のスライス以降で必要な箇所だけ行う。
- 既存 CSS が Tailwind utility より後に定義されているため、移行期間は既存 CSS が一部優先される。これは段階移行として許容する。

## 今後の移行順

### Slice 1: NumberGrid helper

実施済み。ボーン欄とアクセサリ欄の数値入力を helper 化した。

### Slice 2: EmptyState / Section helper

次に、下パネル section 内の empty / disabled state をさらに整理する。

対象:

- モデル未読み込み
- ボーン未選択
- モーフなし
- 補間データなし
- アクセサリ未選択

### Slice 3: SliderRow helper

モーフ欄、照明欄、影欄の slider row を共通化する。

ただし slider の見た目はブラウザ差分が出やすいため、range input の thumb / track は既存 CSS と併用してよい。

### Slice 4: Popup form helper の Tailwind 化

既存 `popup-form-helpers.ts` を Tailwind class ベースへ寄せる。

ポップアップは現状安定しているため、下パネルより後でよい。

### Slice 5: Viewport chrome の Tailwind 化

ビューポート上バー、下バー、右下ハンドルの button / input を Tailwind 管理へ寄せる。

現状の見た目が固まり始めているため、下パネル整理後に扱う。

## 実装時の注意

- 共通 helper に runtime 参照を持たせない。
- 共通 helper に ActionDispatcher を持たせない。
- 共通 helper に undo / redo 判断を持たせない。
- helper は DOM とイベント通知だけにする。
- controller が state と Action を持つ。
- 既存の `BottomPanelLayoutController` は section 表示 / 順序だけを担当し続ける。
- 既存 CSS class と Tailwind class が混ざる期間を許容する。
- 一度に全下パネルを置き換えない。

## 確認

実装スライスごとに確認する。

```powershell
npm.cmd run lint
```

pure helper を作る場合:

```powershell
npm.cmd run test:unit
```

DOM 構造や起動初期化に触る場合:

```powershell
npm.cmd run smoke:launch
```

手動確認:

- Model mode / Camera mode の下パネル表示が崩れない
- 1080p 付近で文字や入力欄が潰れすぎない
- 日本語 / 英語で label が破綻しない
- number input の手入力小数が丸められない
- stepper 操作が使いやすい刻みになる
- Undo / Redo 経路が変わらない
- project save / load の保存値に影響しない

## 後続候補

- `popup-form-helpers.ts` と `panel-control-helpers.ts` の共通 token 化
- Tailwind class token の `ui-classnames.ts` への分離
- section header の keyframe diamond 共通化
- 下パネル controller の `BonePanelController` / `MorphPanelController` 分離
- Effect panel の Tailwind 化候補整理
