# v0.2 ライブラリ追加調査メモ 2026-05-17

## 目的

v0.2 に向けて、次のライブラリを追加・拡張する価値とリスクを整理する。

- UI: Tailwind CSS
- テスト: Vitest
- 状態管理: Zustand
- 入力管理: Action / Command pattern

MMD_modoki は Electron + Babylon.js + WebGPU の実験的 MMD エディタ / ビューアであり、v0.2 では MMD 本体機能、描画パイプライン、物理、出力の安定化を優先する。汎用 UI 基盤の再設計や大規模な状態管理移行は、MMD 編集導線を壊しにくい範囲に限定する。

## 現状

- `vitest` はすでに `devDependencies` に入っている。
- `package.json` には `test:unit: vitest run --environment node` がある。
- 既存テストは colocated test 方式で `src/**/*.test.ts` に置かれている。
- Tailwind CSS と Zustand は未導入。
- UI は React などの component framework ではなく、`index.html` + `src/index.css` + TypeScript DOM controller の構成。
- `src/index.css` は約 3600 行、`index.html` は約 1000 行あり、既存 CSS/DOM 構造の一括置換はリスクが高い。
- `src/ui-controller.ts` は分割が進んでいるが、まだ composition root / facade として重要な接続を持つ。

2026-05-17 時点の npm 最新確認:

| package | current in repo | latest | メモ |
| --- | ---: | ---: | --- |
| `tailwindcss` | 未導入 | `4.3.0` | v4 は Vite plugin 経由が公式推奨 |
| `@tailwindcss/vite` | 未導入 | `4.3.0` | renderer Vite 設定に追加する候補 |
| `vitest` | `^2.1.9` | `4.1.6` | v4 は Vite 6+ / Node 20+ が前提 |
| `zustand` | 未導入 | `5.0.13` | React hook だけでなく vanilla store も公式 API |

## ライセンス / 環境要件

2026-05-17 時点の npm metadata と公式ドキュメント確認。

| package | 採用候補 version | license | Node / peer 要件 | この repo での判断 |
| --- | ---: | --- | --- | --- |
| `tailwindcss` | `4.3.0` | MIT | package metadata 上の明示 `engines` なし | 導入可 |
| `@tailwindcss/vite` | `4.3.0` | MIT | peer `vite: ^5.2.0 || ^6 || ^7 || ^8` | 現行 `vite@5.4.21` で導入可 |
| `vitest` | `2.1.9` | MIT | `node: ^18.0.0 || >=20.0.0`, dependency `vite: ^5.0.0` | 現行維持が安全 |
| `vitest` | `4.1.6` | MIT | `node: ^20.0.0 || ^22.0.0 || >=24.0.0`, peer/dependency `vite: ^6.0.0 || ^7.0.0 || ^8.0.0` | Vite major update と同時に検証 |
| `zustand` | `5.0.13` | MIT | `node: >=12.20.0`; React / Immer などは peer optional 的に使う機能依存 | `zustand/vanilla` なら React なしで導入可 |

現行環境:

- local Node: `v24.13.1`
- npm: `11.8.0`
- Vite: `5.4.21`
- Vitest: `2.1.9` 導入済み
- Tailwind CSS / `@tailwindcss/vite`: 未導入
- Zustand: 未導入

### ライセンス面

3候補とも MIT license。MMD_modoki 本体も MIT なので、ライセンス互換上の大きな懸念はない。

注意点:

- 追加時は `package-lock.json` に入る transitive dependencies も確認する。
- 配布物に同梱する場合は、既存の `THIRD_PARTY_NOTICES.md` 更新対象に含めるか確認する。
- `@tailwindcss/vite` は `@tailwindcss/oxide` などの native / platform package を引くため、package / make の確認が必要。

### Tailwind CSS の環境要件

公式 docs では Vite plugin 経由の導入が案内されている。

導入候補:

```powershell
npm.cmd install -D tailwindcss @tailwindcss/vite
```

`vite.renderer.config.ts` に plugin を追加する想定。

```ts
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss()],
});
```

CSS 側は Tailwind v4 の方式に合わせて `@import "tailwindcss";` を使う。

懸念:

- 既存 `src/index.css` に直接入れる場合、preflight / base style の影響範囲を確認する。
- `@tailwindcss/oxide` が platform binary を含むため、Electron Forge package で問題が出ないか確認する。
- 現行 `vite.renderer.config.ts` の `optimizeDeps.exclude` を維持したまま plugin を追加する。

確認コマンド:

```powershell
npm.cmd run lint
npm.cmd run test:unit
npm.cmd run smoke:launch
npm.cmd run package
```

### Vitest の環境要件

現行の `vitest@2.1.9` は `vite@5.4.21` と合っている。v0.2.0 の Action 単位テスト拡充では、まず現行版を維持する。

`vitest@4.1.6` は Node 20+ かつ Vite 6+ が必要。local Node 24 は満たすが、repo の Vite が 5.4.21 なので、Vitest だけ先に v4 へ上げない。

### なぜ現状 Vite 6+ ではないか

現状が Vite 5.4.21 なのは、Node 要件の問題ではない。local Node は `v24.13.1` なので、Vite 6 / Vite 8 の Node 要件自体は満たしている。

主な理由は、既存ライブラリと実行基盤の検証を切り分けるため。

- Electron Forge の Vite plugin 経由で main / preload / renderer をビルドしている。
- babylon-mmd の WASM / worker / shader import は Vite dev と package build の両方で確認が必要。
- 既に `vite.renderer.config.ts` で babylon-mmd の wasm-bindgen module を `optimizeDeps.exclude` に入れている。
- v0.2 では Babylon.js 9.2.0 / babylon-mmd 1.2.0 / WebGPU / Frame Graph 周辺の検証が大きい。
- Vite major update を同時に入れると、描画不具合、WASM 解決、Electron package 不具合、Vitest 更新不具合の切り分けが難しくなる。
- `vitest@4.x` は Vite 6+ が必要なので、Vite 更新と Vitest 更新は同じ作業単位にしたほうがよい。

したがって、Vite 6+ へ上げない積極的な理由は「互換性がないと判明している」ではなく、「v0.2 の描画・物理・Action 整理と混ぜるにはリスクが高い」こと。

ただし、Babylon.js / babylon-mmd の v0.2 向け更新をこのブランチで済ませ、WebGPU / MMD runtime / physics 周辺がそこそこ安定してきたなら、Vite / Vitest 更新を検証するタイミングとしては悪くない。Vite 5 固定は前バージョン検証中の名残である可能性が高く、今後も固定し続ける必然性は薄い。

2026-05-17 時点の `npm.cmd outdated` では次が残っている。

| package | current | latest | メモ |
| --- | ---: | ---: | --- |
| `vite` | `5.4.21` | `8.0.13` | major update。Vitest 4 と同時検証 |
| `vitest` | `2.1.9` | `4.1.6` | Vite 6+ が必要 |
| `@electron-forge/plugin-vite` | `7.11.1` | `7.11.1` | 現時点では最新。npm metadata 上は Vite peer constraint が見えない |

Vite を上げるなら、いきなり最新 `8.x` へ飛ぶ案と、まず `6.x` で Vitest 4 の要件を満たす案がある。

- `vite@6.x`: 変更幅を抑えつつ `vitest@4.x` へ進める候補。
- `vite@8.x`: latest へ寄せられるが、Node 要件や breaking change の確認範囲が広い。

この repo では Electron Forge / babylon-mmd / WebGPU の切り分けを重視するため、まずは `vite@6.x + vitest@4.x` の検証ブランチを作り、通るなら `vite@8.x` へ進むか判断するのが安全。

Vite 更新を行うなら、別ブランチ / 別コミットで次をまとめて確認する。

```powershell
npm.cmd run lint
npm.cmd run test:unit
npm.cmd run package
npm.cmd run smoke:launch
```

追加で見るべき項目:

- Electron Forge start / package が通るか。
- main / preload / renderer の Vite build が通るか。
- babylon-mmd MPR / SPR wasm の URL 解決が dev / package の両方で壊れないか。
- `optimizeDeps.exclude` の指定が Vite 6+ でも効くか。
- WebGPU 起動と `engine=WebGPU` 到達が維持されるか。
- Vitest 4 へ上げる場合、既存 unit test がそのまま通るか。

方針:

- Action / Command test 拡充は `vitest@2.1.9` のまま進める。
- Vite major update を扱う別作業で `vitest@4.x` を検証する。
- DOM testing library / jsdom は今は入れない。まず Node environment の pure helper test を増やす。

### Zustand の環境要件

`zustand@5.0.13` は MIT license で、Node `>=12.20.0`。現行 Node 24 では問題ない。

React peer はあるが、MMD_modoki では React hook API ではなく `zustand/vanilla` を使う想定なので、React を追加しない。

導入候補:

```powershell
npm.cmd install zustand
```

使う API:

```ts
import { createStore } from "zustand/vanilla";
```

公式 docs 上、`createStore` は `setState` / `getState` / `getInitialState` / `subscribe` を公開する vanilla store を作る。既存 DOM controller と接続するにはこの API が合う。

懸念:

- store に runtime object や大きな animation data を入れない。
- project save/load と transient UI state を混ぜない。
- Action / Command / HistoryManager を Zustand に依存させすぎない。

確認コマンド:

```powershell
npm.cmd run lint
npm.cmd run test:unit
```

Action / UI state 接続に触った場合は追加で:

```powershell
npm.cmd run smoke:launch
```

### 導入優先順位

1. `zustand`
   - Action / UI/editor state 整理の中核候補。
   - runtime 実体を持たず、lightweight snapshot に限定する。
2. `tailwindcss` + `@tailwindcss/vite`
   - UI のガワ整理を始めるタイミングで導入。
   - まず Action 化済み panel か設定画面から。
3. `vitest`
   - 追加ではなく現行版を活用。
   - v4 への更新は Vite major update と同時。

### 追加時の package 区分

- `zustand`: runtime で使うため `dependencies`
- `tailwindcss`: build tooling なので `devDependencies`
- `@tailwindcss/vite`: build tooling なので `devDependencies`
- `vitest`: 既存どおり `devDependencies`

## 公式情報の要点

### Tailwind CSS

公式ドキュメントでは Vite plugin としての導入が案内されている。

- `tailwindcss` と `@tailwindcss/vite` をインストールする。
- Vite config の `plugins` に `tailwindcss()` を追加する。
- CSS に `@import "tailwindcss";` を追加する。
- Tailwind は HTML / JS / template の class 名を scan し、対応する static CSS を生成する。

参照:

- https://tailwindcss.com/docs/installation/using-vite

### Vitest

公式ドキュメント上の現行は v4.1.6。v4 migration guide では、Vitest 4 は Vite 6.0.0 以上、Node.js 20.0.0 以上が前提とされている。

このリポジトリは現状 `vite@5.4.21` + `vitest@2.1.9` なので、Vitest だけを v4 に上げるのは避け、Vite 更新検証と同じブランチで扱うのが妥当。

参照:

- https://vitest.dev/guide/migration

### Zustand

Zustand は React 向けの hook API が有名だが、公式に `zustand/vanilla` の `createStore` が用意されている。

`createStore` は vanilla store を作り、`setState` / `getState` / `getInitialState` / `subscribe` を公開する。React を使っていない MMD_modoki でも、状態の購読と更新経路を明示する用途には使える。

参照:

- https://zustand.docs.pmnd.rs/reference/apis/create-store
- https://zustand.docs.pmnd.rs/learn/guides/testing

## 評価: Tailwind CSS

### 期待できる効果

- 新規 UI の CSS 記述量を減らせる。
- spacing / color / typography のばらつきを抑えやすい。
- 設定画面や小さな実験 UI のような、新規・隔離済み領域では導入効果が出やすい。
- 既存 CSS を壊さず、限定された DOM subtree だけに utility class を使う運用が可能。
- 現状の素書き HTML / CSS にある、相対値と絶対値の混在、似た panel / button / field の重複、局所 class の増殖を整理するきっかけにできる。
- Action 化済みの UI から見た目を差し替える場合、実行経路を維持したまま class / spacing / layout を整理しやすい。

### リスク

- 既存の `index.css` と設計思想が混ざる。特に既存 UI は長い class 名と専用 CSS で構成されており、Tailwind を途中導入すると見た目の責務が分散する。
- `@import "tailwindcss";` を既存 `src/index.css` に直接入れると、base style / preflight の影響範囲確認が必要になる。
- `index.html` が大きく、utility class を直接増やすと HTML の可読性がさらに落ちる可能性がある。
- Tailwind は UI 構築を速くするが、MMD 本体機能、描画、物理、出力の安定化には直接効かない。
- Tailwind を入れても component 境界は自動では生まれない。似た UI をまとめるには、HTML builder / controller / Action 経路の整理が別途必要。

### MMD_modoki での採用判断

v0.2.0 の開発期間を長めに取り、UI のガワ整理もテーマに含めるなら、Tailwind CSS の導入検討は妥当。

ただし、既存 UI の全面移行から始めるのではなく、次の条件を満たす段階導入にする。

- 対象を Action 化済みの panel、設定画面、実験機能、または新規の独立 panel に限定する。
- 既存 `index.css` の全面移行はしない。
- 既存 UI と同じ DOM subtree に utility class と既存専用 class を無秩序に混ぜない。
- preflight の影響を避ける必要がある場合は、導入方式を別途検証する。
- `index.html` に長い utility class を直書きしすぎず、繰り返し UI は小さな render helper / template helper に寄せる。
- spacing / sizing / color token を Tailwind 側に寄せる対象と、既存 CSS に残す対象を分ける。

推奨順位は以前より上げてよい。Action 整理、テスト整備、UI のガワ整理を v0.2.0 のまとまったテーマにするなら、Tailwind は「見た目の全面刷新」ではなく「CSS の記法とレイアウト基準を揃えるための道具」として採用候補になる。

## 評価: Vitest

### 期待できる効果

- すでに導入済みで、追加コストが低い。
- project save/load、LUT、post effect backend、Frame Graph helper など、純ロジックの回帰防止に効いている。
- v0.2 で触る領域は project state / render state / timeline state の境界が多いため、単体テストの追加価値が高い。
- Electron / WebGPU / Babylon 実レンダリングを起動しないテストなら安定して速い。

### リスク

- 現行 `vitest@2.1.9` から v4 へ上げるには Vite 更新が絡む。
- DOM / Babylon / Electron を無理に unit test 化すると mock が重くなり、保守コストが上がる。
- 描画品質や WebGPU の実挙動は Vitest だけでは検証できない。

### MMD_modoki での採用判断

採用済み。v0.2 では「増やす」方向が妥当。

ただし、現状は `vitest` を導入済みでも、開発全体の進め方として十分には使えていない。多くの確認がまだ手動テストや smoke test に寄っており、UI 操作の回帰をコード上で押さえる力は弱い。

v0.2.0 では、Action 整理と Vitest 拡充を同時に進めるのがよい。入力を Action として正規化し、Action ごとの判定・差分生成・command 生成を pure helper に切り出せば、現在の「触って確認する」比率を下げられる。

短期方針:

- `vitest@2.1.9` は Vite 5 系のまま維持する。
- v4 への更新は Vite major update 検証と同じ作業単位にする。
- `node` environment の pure logic test を増やす。
- DOM が必要なテストは、まず DOM 依存を小さな helper に分離してから検討する。
- coverage 導入は急がない。テスト対象が増えてから判断する。
- Action catalog に載せた操作から、Action 単位のテストを追加する。

優先して増やす対象:

- Action から Command を作る helper
- Command 実行前後の最小差分 builder
- `canExecute` / disabled 判定
- selected keyframe の add / delete / nudge 判定
- interpolation preset apply / reset の変更対象判定
- `src/project/*` の project state roundtrip / 旧形式互換
- `src/shared/timeline-helpers.ts`
- `src/editor/timeline-edit-service.ts`
- `src/ui/*-state.ts` のような DOM 非依存 state helper
- Frame Graph / PostFX の backend selection と保存値変換

避ける対象:

- WebGPU 実描画
- Electron IPC の end-to-end
- Babylon scene の複雑な integration
- 巨大 controller の DOM event をそのまま mock するテスト

### Action 単位テストの狙い

Action 単位のテストは、button click や keydown を直接再現するテストではない。DOM 入力を Action に変換した後の、編集意図と編集結果を確認する。

例:

```ts
it("builds a nudge command for selected keyframes", () => {
  const action = { type: "keyframe.nudgeSelected", deltaFrames: 1, source: "shortcut" } as const;
  const command = buildEditorCommand(action, state);

  expect(command?.label).toBe("Move keyframe");
  expect(command?.diff).toEqual({
    beforeFrame: 12,
    afterFrame: 13,
  });
});
```

テスト対象にしたいこと:

- Action が現在 state で実行可能か。
- 実行できない場合の理由が安定しているか。
- Command が持つ差分が最小か。
- undo / redo に必要な情報が揃っているか。
- Action source が button / shortcut / timeline のどれでも同じ command になるか。
- 連続操作を merge できる `mergeKey` が安定しているか。

このテストが増えると、UI のガワを Tailwind などで整理しても、入力の意味と編集差分が壊れていないことを確認しやすくなる。現在の手動テスト中心の雑さを減らすには、E2E を急に増やすより、まず Action / Command の単体テストを増やすほうが費用対効果が高い。

## 評価: Zustand

### 期待できる効果

- `MmdManager` / `UIController` / panel controllers の間に散らばる UI state bridge を明示しやすい。
- `getState()` / `setState()` / `subscribe()` により、DOM controller 構成でも状態の購読経路を作れる。
- React を導入せず、`zustand/vanilla` だけで始められる。
- 状態変更と描画・DOM反映を直接結びつけず、`timeline.ts` 的な「状態変更 -> 局所的な更新要求」へ寄せやすい。
- 小さな store なら unit test しやすい。

### リスク

- Zustand を入れても、状態の責務分離が設計されていなければ複雑さは減らない。
- 既存 controller の private state を一気に store へ移すと、保存/読み込み、backend 切替、UI 同期の回帰が起きやすい。
- `MmdManager` は runtime side effects を多く持つため、store から直接 Babylon runtime を触る設計にすると依存方向が悪化する。
- project state と transient UI state と runtime state を混ぜると、undo/redo や保存互換性が難しくなる。

### MMD_modoki での採用判断

v0.2 での全面導入は見送り。小さな vanilla store PoC は有効。

導入するなら React hook API ではなく、まず `zustand/vanilla` を使う。

最初の候補:

1. export busy / progress state
2. runtime feature availability state
3. selected target / panel visibility のような保存対象ではない UI state
4. PostFX backend selection の表示用 snapshot

避ける候補:

- bone / camera / morph keyframe の本体データ
- project 保存形式そのもの
- Babylon scene object の実体
- physics runtime の実行制御本体
- undo/redo の command history 本体

store 設計の原則:

- store は plain data と action 名に限定する。
- Babylon / Electron / file dialog への副作用は controller / service に残す。
- project 保存対象、transient UI state、runtime capability state を分ける。
- store から DOM を直接触らない。
- subscribe 側で `refresh()` や `schedule...()` を呼ぶ。
- 1 store で全 UI を持たず、狭い store から始める。

## 評価: Action / Command pattern

### 何を指すか

ここでは、DOM input / shortcut / pointer 操作をその場で直接 `MmdManager` や各 controller に流すのではなく、一度「ユーザーが意図した操作」に正規化してから実行する方式を指す。

用語は次のように分けて扱うと混乱しにくい。

| 用語 | 役割 | 例 |
| --- | --- | --- |
| input event | 生の入力 | `keydown`, `pointermove`, slider `input`, button `click` |
| action | UI 入力を正規化した軽い意図 | `TogglePlayback`, `SeekFrame`, `SelectBone`, `NudgeKeyframe` |
| command | 実行・履歴対象になる編集操作 | `AddBoneKeyframe`, `DeleteKeyframe`, `MoveKeyframe` |
| history entry | undo / redo 用の差分 | `undo`, `redo`, `label`, `mergeKey` |

すべての入力を command にする必要はない。再生、表示切替、panel 開閉、selection 変更のような transient 操作は action で止め、タイムライン編集や keyframe 変更のような保存対象の編集だけを command / history に載せる。

### 現状との関係

既存の `undo-redo-investigation.md` では、`HistoryManager + 軽い command + 最小差分` が候補になっている。

現状の入力処理は、主に次のような形で分散している。

- `src/ui-controller.ts` の toolbar / shortcut / keyframe button
- `src/timeline.ts` の canvas mouse 操作
- `src/bottom-panel.ts` の bone / morph slider 操作
- `src/mmd-manager.ts` の viewport pointer 操作
- `src/ui/*-controller.ts` の各 panel slider / toggle

この構造では、同じ意図の操作が button / shortcut / timeline / drag で別経路になりやすい。Action / Command 化の主な価値は、入力経路を増やすことではなく、同じ意図を同じ実行経路に集めることにある。

将来的に gamepad や MIDI controller を追加したい場合、この分離はさらに重要になる。mouse / keyboard / gamepad / MIDI は生入力の形が大きく違うが、エディタ側が受け取りたい意図は同じでよい。

keyboard shortcut のカスタムも同じ問題に含まれる。キー入力を処理本体へ直接結びつけるのではなく、`physical input -> binding -> Action` に分けると、既定ショートカット、ユーザー変更、gamepad mapping、MIDI mapping を同じ考え方で扱える。

例:

| device input | normalized Action |
| --- | --- |
| keyboard `Space` | `playback.toggle` |
| toolbar play button | `playback.toggle` |
| gamepad button A | `playback.toggle` |
| MIDI transport play | `playback.toggle` |
| keyboard `ArrowRight` | `timeline.stepFrame` |
| gamepad D-pad right | `timeline.stepFrame` |
| MIDI encoder rotate | `timeline.scrub` または `value.adjustSelected` |
| mouse drag keyframe | `keyframe.nudgeSelected` または `keyframe.moveSelected` |

Action 層がないまま gamepad / MIDI を足すと、入力デバイスごとに直接 `UIController` や `MmdManager` を呼ぶ経路が増え、同じ操作の挙動差やテスト漏れが増えやすい。先に Action で管理しておけば、新しい入力デバイスは「device event を Action に変換する adapter」として追加できる。

ショートカットカスタムを考える場合も、保存すべきなのは「キーが呼ぶ関数」ではなく「キーと Action の binding」になる。

```ts
type InputBinding = {
  id: string;
  device: "keyboard" | "mouse" | "gamepad" | "midi";
  input: string;
  action: EditorAction["type"];
  scope?: "global" | "timeline" | "viewport" | "panel";
};
```

この形なら、将来の設定画面では binding を編集するだけでよく、Action 実行側は変えずに済む。

### 期待できる効果

- shortcut、button、timeline 操作を同じ action に寄せられる。
- undo/redo の最小単位を決めやすくなる。
- 入力ログや SQLite WASM PoC の `input_event` / `command_event` と接続しやすい。
- slider drag のような連続入力を `begin` / `update` / `commit` に分け、履歴 1 件に merge しやすい。
- MMD 本体の編集操作、表示切替、実験機能を分けて扱いやすい。
- Vitest で action reducer / command builder の pure logic をテストしやすい。

### リスク

- 抽象化を広げすぎると、単なる間接層が増える。
- pointer move や camera orbit のような高頻度入力まで action bus に流すと遅延やログ肥大化の原因になる。
- Babylon runtime 副作用を command 内に閉じ込めすぎると、project state / timeline 表示 / source animation の同期責務が見えにくくなる。
- command を先に汎用化しすぎると、MMD 固有の編集粒度が曖昧になる。
- `Zustand` store、SQLite、HistoryManager、ActionDispatcher を同時に入れると責務が重なる。

### MMD_modoki での採用判断

採用検討価値は高い。ただし、v0.2 でやるなら「入力全体の再設計」ではなく、タイムライン編集限定の Action / Command PoC が妥当。

gamepad / MIDI controller 対応を将来入れる前提なら、Action 化は後回しにしすぎないほうがよい。デバイス対応を先に増やすと、入力ごとの分岐が既存 controller に広がるため、後から Action に戻すコストが上がる。

最初の対象は次に限定する。

1. keyframe add
2. keyframe delete
3. selected keyframe の 1f nudge
4. interpolation preset apply / reset

理由:

- MMD 編集の本筋に近い。
- undo/redo の価値が高い。
- 操作粒度が比較的明確。
- project state / timeline state / runtime state の同期を小さい範囲で検証できる。
- 既存 `undo-redo-investigation.md` の Phase 1 と整合する。

避ける対象:

- camera orbit / pan / zoom の pointer move
- playback tick
- physics simulation step
- viewport hover / selection preview
- PostFX slider の連続 `input`
- file load / project load / export

これらは action 化しても価値が低い、または副作用が広い。必要なら後で `command_event` として観測ログに残すだけにする。

### 推奨する最小設計

`Action` は plain object にする。

```ts
type EditorAction =
  | { type: "keyframe.addAtCurrentFrame"; source: "button" | "shortcut" | "timeline" }
  | { type: "keyframe.deleteSelected"; source: "button" | "shortcut" | "timeline" }
  | { type: "keyframe.nudgeSelected"; deltaFrames: -1 | 1; source: "button" | "shortcut" | "timeline" };
```

`Command` は undo / redo に必要な差分を持つ。

```ts
type EditorCommand = {
  label: string;
  mergeKey?: string;
  execute: () => void;
  undo: () => void;
  redo: () => void;
};
```

ただし、最初から関数を SQLite に保存しようとしない。永続化や観測ログに残すのは `command_event` と差分 payload であり、実行時の `execute / undo / redo` は in-memory の HistoryManager が持つ。

### Zustand との関係

Zustand は Action / Command pattern の必須条件ではない。

推奨する責務分担:

- ActionDispatcher: 入力を action に正規化する。
- CommandBuilder: action から command を作る。作れない action はその場で実行する。
- HistoryManager: command の undo / redo stack を持つ。
- Zustand vanilla store: 必要なら UI snapshot / selection / transient state を購読可能にする。
- SQLite WASM: 必要なら `input_event` / `command_event` の観測ログや PoC 用の永続化に使う。

最初の PoC では Zustand なしでもよい。Action / Command の価値を確認してから、store が必要な箇所だけ追加する。

### SQLite WASM との関係

SQLite に先に履歴を入れるより、まず in-memory HistoryManager で command 粒度を決めるほうが安全。

SQLite WASM と Zustand は置き換え関係ではない。SQLite WASM は永続化、検索、観測ログ、クラッシュ後の復元に向く。一方 Zustand は renderer 内の短命な UI / editor state を整理し、購読しやすくするための軽い状態管理に向く。

今回の目的が「入力を Action として整理し、keyframe 編集や UI state を見通しよくする」ことであれば、SQLite WASM は過剰になりやすい。DB を入れても、undo/redo の本質である操作粒度、逆操作、副作用同期は解決されないため、最初の PoC では Zustand または素の in-memory store + HistoryManager を優先する。

SQLite を使う場合の候補:

- `input_event`: 生入力ではなく、間引いた high-level action を記録する。
- `command_event`: undo/redo 対象になった command と差分 payload を記録する。
- `error_event`: command 実行失敗や undo/redo 失敗を記録する。

高頻度の pointer move や slider input をそのまま保存しない。

### Zustand を優先する場合の位置づけ

SQLite WASM を見送って Zustand を検討する方針は妥当。

ただし、Zustand に command history 本体を全部押し込むのではなく、次のように薄く使うほうが扱いやすい。

- Zustand store: 現在の選択、編集モード、dirty flag、history の可否、panel 表示用 snapshot を持つ。
- ActionDispatcher: shortcut / button / timeline 操作を action に変換する。
- CommandBuilder: action から編集 command を作る。
- HistoryManager: undo / redo stack と差分を持つ。
- Controller / service: Babylon runtime、project state、DOM refresh への副作用を実行する。

Zustand に持たせてよい候補:

- active timeline target
- selected keyframe ids / selected bone name の UI snapshot
- current editing tool / mode
- `canUndo` / `canRedo`
- command 実行中かどうか
- panel visibility や transient UI state

Zustand に持たせないほうがよい候補:

- PMX / VMD / Babylon object の実体
- 大きな animation buffer
- undo / redo の巨大 diff payload
- project 保存形式そのもの
- physics runtime state
- 毎フレーム変わる camera / bone / morph 値

この分け方なら、Zustand は「軽い UI/editor state の購読基盤」として使え、SQLite WASM のような永続 DB を入れる重さを避けられる。

### Zustand と SQLite WASM の判断軸

Zustand と SQLite WASM はどちらも状態や履歴に関係するが、定番の状態管理として見るなら Zustand のほうが自然。

v0.2.0 での主目的が次なら Zustand を優先する。

- UI / editor state の置き場所を整理したい。
- controller 間の state bridge を減らしたい。
- selection / editing mode / dirty flag / canUndo / canRedo を購読したい。
- Action の実行結果を UI に反映する経路を見通しよくしたい。
- React なしの現構成を維持したい。
- テスト可能な小さい store から始めたい。

一方、主目的が次なら SQLite WASM を検討する。

- 大量の操作ログを検索・比較したい。
- クラッシュ後にも入力履歴や command_event を復元したい。
- セッションをまたいで編集履歴を調査したい。
- structured query で timeline / command / error event を分析したい。
- in-memory store では重くなるほど履歴や観測データを扱いたい。

現時点の MMD_modoki では、v0.2.0 の中心課題は「入力を Action として整理し、UI / editor state を見通しよくし、テスト可能にする」ことなので、Zustand のほうが目的に近い。

SQLite WASM は面白いが、今入れると次の問題を増やしやすい。

- DB schema 設計が先に必要になる。
- renderer 内 state と DB state の同期責務が増える。
- undo/redo の本質である command 粒度や逆操作の設計を DB で隠してしまう。
- 高頻度入力を記録したくなり、容量や性能の検証が必要になる。
- v0.2.0 の UI / Action 整理よりも実験基盤づくりに寄りやすい。

したがって、現時点の推奨は次の通り。

1. Zustand vanilla を UI / editor state の標準 store 候補として検討する。
2. undo/redo 本体は in-memory HistoryManager + command diff で始める。
3. SQLite WASM は v0.2.0 では中核にしない。
4. SQLite WASM を使う場合は、後で `input_event` / `command_event` / `error_event` の観測ログ PoC に限定する。

この判断は「SQLite WASM が不要」という意味ではない。状態管理の定番として UI / editor state を整理する用途では Zustand が先で、SQLite WASM は永続ログや分析の必要が見えた段階で評価する、という順序にする。

### Action / undo・redo に効きそうな OSS 候補

2026-05-17 時点で確認した候補。

| package | version | 役割 | MMD_modoki での見立て |
| --- | ---: | --- | --- |
| `zustand` | `5.0.13` | 軽量 state store | UI / editor state の第一候補。React なしなら `zustand/vanilla` |
| `zundo` | `2.3.0` | Zustand 向け undo/redo middleware | 小さい UI state の undo/redo 検証候補。MMD keyframe 本体には慎重 |
| `immer` | `11.1.8` | immutable update / patches | command diff や inverse patch 生成の候補。局所導入しやすい |
| `@reduxjs/toolkit` | `2.12.0` | action / reducer / store の定番 | Action 管理の定番だが、この repo には重め。全面採用は不要 |
| `redux-undo` | `1.1.0` | Redux reducer 用 undo/redo | Redux 採用が前提。現構成では優先度低い |
| `xstate` | `5.31.1` | state machine / actor | playback / drag / modal flow の状態遷移には有効。全 editor state には重い |
| `robot3` | `1.2.0` | 小型 state machine | XState より軽いが、採用例や tooling は少なめ |
| `jotai` | `2.20.0` | atom 型 state | React 前提色が強く、現構成とは合いにくい |
| `valtio` | `2.3.2` | proxy state | mutable に見える state 管理。明示的 Action / Command とは方向が違う |
| `effector` | `23.4.4` | event / store / effect | Action 的な event 管理に強いが、学習・設計コストが高い |

#### Redux Toolkit

Redux Toolkit は、Action / reducer / store を標準化する定番候補。`createSlice` は reducer と action creator をまとめて生成し、内部で Immer を使う。

利点:

- Action 名と reducer が明確になる。
- DevTools や middleware 文化が成熟している。
- reducer を pure function としてテストしやすい。
- Immer 統合により immutable update を書きやすい。

懸念:

- React なし Electron / DOM controller 構成に入れるには設計変更が大きい。
- MMD_modoki の runtime side effects は reducer に入れられないため、結局 command / service 層が必要。
- Redux store に project / runtime / UI state を全部集めると、今回避けたい大規模再設計になりやすい。

判断:

Action 設計の参考にはなるが、v0.2.0 で Redux Toolkit を中核採用する必要は低い。

#### Immer

Immer は immutable update を書きやすくするライブラリで、patches / inversePatches を取得できる。公式 docs でも patches は undo/redo や変更 replay の基盤になり得ると説明されている。

利点:

- Zustand や自前 HistoryManager と組み合わせやすい。
- keyframe track の小さな plain object / array diff 生成に使える可能性がある。
- inverse patch を undo に使える可能性がある。

懸念:

- Babylon object や class instance を含む状態には向かない。
- 大きな animation buffer に patch をかけるとコストが読みにくい。
- patch をそのまま project 互換や長期保存に使うと、内部構造変更に弱い。

判断:

局所導入候補。Action / Command PoC で「plain data の keyframe state」に限定して試す価値がある。

#### zundo

zundo は Zustand store に temporal undo/redo を追加する middleware。

利点:

- Zustand を使う場合、短い実装で undo/redo を試せる。
- UI state や小さい editor snapshot の time travel に向く。
- Zustand v5 に対応している。

懸念:

- snapshot 型 undo/redo になりやすい。
- MMD keyframe 編集では、project state / timeline 表示 / Babylon runtime への副作用同期が別途必要。
- command 単位、mergeKey、slider drag commit のような編集粒度を細かく制御したい場合、自前 HistoryManager のほうが明示的。

判断:

Zustand store 内の小さい UI state の undo/redo PoC には候補。ただし MMD 編集本体の undo/redo は `HistoryManager + command diff` を優先する。

#### XState / robot3

State machine 系は、状態遷移が明確な UI flow に効く。

向く候補:

- playback state: idle / playing / seeking
- bone gizmo drag: idle / dragging / commit / cancel
- file import modal flow
- export flow
- physics backend switching flow

向かない候補:

- keyframe 配列そのものの編集履歴
- project state 全体
- Babylon runtime object の管理
- 細かい UI field state 全部

判断:

`edit-state-machine.md` にあるような playback / seeking / dragging の整理には合う。ただし Action / undo/redo の中心に置くと重い。v0.2.0 では必要になった flow に限定し、最初から XState を中核にしない。

#### Effector / Jotai / Valtio

いずれも良い OSS だが、今回の目的には優先度が低い。

- Effector: event / store / effect の分離は強いが、設計流儀が大きく変わる。
- Jotai: atom model は React UI と相性がよいが、現構成は React ではない。
- Valtio: proxy state は書きやすいが、Action / Command を明示したい今回の方向とは少しずれる。

### OSS 候補を踏まえた推奨

現時点の推奨構成:

1. `zustand`: UI / editor state の軽い store。
2. 自前 `ActionDispatcher`: input を Action に正規化。
3. 自前 `HistoryManager`: MMD 編集 command の undo/redo。
4. `immer`: 必要なら keyframe plain data の diff / inverse diff PoC。
5. `zundo`: Zustand store の小さい UI state undo/redo PoC に限定して検討。

見送る候補:

- Redux Toolkit: Action 設計の参考に留める。
- redux-undo: Redux 採用が前提なので不要。
- XState / robot3: playback / drag flow に限定して必要時に検討。
- SQLite WASM: 永続ログ / 分析が必要になったら再検討。

この順にすると、状態管理の定番として Zustand を使いつつ、MMD 編集の本質である command 粒度と runtime 副作用同期は自前で制御できる。

### Zustand か自前 store か

ここまでの検討を踏まえると、v0.2.0 の現実的な選択肢は次の 2 つに絞られる。

1. `zustand/vanilla` + 自前 ActionDispatcher + 自前 HistoryManager
2. 完全自前 store + 自前 ActionDispatcher + 自前 HistoryManager

Redux Toolkit、XState、SQLite WASM を中核にする案は、今の目的に対して重い。zundo や Immer は補助候補として残す。

#### 案 A: Zustand + 自前 Action / HistoryManager

推奨案。

Zustand は UI / editor state の軽い store として使う。

持たせるもの:

- selected target / selected keyframe の UI snapshot
- editing mode
- dirty flag
- `canUndo` / `canRedo`
- panel visibility
- command 実行中かどうか
- Action 実行後に UI が購読したい lightweight state

持たせないもの:

- MMD model / Babylon object の実体
- 大きな keyframe buffer / animation buffer
- undo / redo の巨大 diff payload
- project save format
- physics runtime state
- 毎フレーム更新される runtime value

Action / Command / undo 本体は自前で持つ。

```text
DOM input / shortcut
  -> ActionDispatcher
  -> CommandBuilder
  -> HistoryManager
  -> MmdManager / Timeline / Project state へ反映
  -> Zustand store に UI snapshot を反映
  -> UI refresh
```

利点:

- Zustand の `subscribe` で既存 DOM controller と接続しやすい。
- store 実装の細部を自前で抱えなくてよい。
- React を導入せずに使える。
- Action / Command / undo 粒度という MMD 固有の難所に集中できる。
- 状態表示と実編集処理を分けやすい。

懸念:

- store に何でも入れたくなる。
- `MmdManager` runtime state と重複した state を持つと同期問題が出る。
- Zustand を入れても、Action / Command 設計は別途必要。

対策:

- Zustand store は「UI が購読したい lightweight snapshot」に限定する。
- project 保存対象や runtime 実体を store に入れない。
- ActionDispatcher / CommandBuilder / HistoryManager は Zustand から独立させる。

#### 案 B: 完全自前 store

依存を増やさない案。

利点:

- 依存が増えない。
- store の仕様を MMD_modoki 専用にできる。
- 余計な抽象を避けられる。

懸念:

- `subscribe`、selector、partial update、unsubscribe、debug helper などを自前で持つ必要がある。
- 実装が増える割に、MMD 固有の価値は低い。
- 後で store の仕様を変えたくなったときに自前 API が負債になりやすい。

判断:

小さな PoC だけなら完全自前でもよい。ただし v0.2.0 で UI / editor state の整理を広げるなら、Zustand を薄く入れたほうが実装コストと保守コストのバランスがよい。

### 方針

v0.2.0 では `zustand/vanilla + 自前 ActionDispatcher + 自前 HistoryManager` を第一候補にする。

ただし導入順は次の通り。

1. Action catalog を作る。
2. keyframe / timeline 周辺だけ ActionDispatcher を薄く入れる。
3. CommandBuilder / HistoryManager を自前で作る。
4. `canUndo` / `canRedo`、selection snapshot、editing mode など、購読したい state が見えた段階で Zustand を入れる。
5. Zustand store に入れる値を小さく保つ。
6. zundo / Immer は必要になったら局所 PoC として検討する。

この順序にすると、Zustand 導入が目的化しない。まず Action と command 粒度を決め、そのうえで store が必要な範囲だけを Zustand に任せる。

### PoC の完了条件

- button と shortcut の両方から同じ action が dispatch される。
- keyframe add / delete / nudge の 3 操作が同じ command 経路で実行される。
- `Ctrl+Z` / `Ctrl+Y` または仮の API で undo / redo できる。
- 同一フレーム内の連続 nudge など、merge すべき操作を 1 履歴にまとめる方針が決まる。
- project state / timeline 表示 / runtime animation が undo / redo 後に揃う。
- command builder または差分 helper に Vitest を付ける。

### 結論

Action / Command pattern は、Tailwind や Zustand よりも v0.2 の MMD 編集体験に直接効く可能性が高い。

ただし、入力全部を一気に action bus 化するのは避ける。最初は timeline / keyframe 編集に限定し、`HistoryManager + command + 最小差分` の形で undo/redo と同時に検証するのがよい。

この方式が有効なら、次に照明、アクセサリ、modoki-owned tracks の編集操作へ広げる。表示切替や playback のような非編集操作は、必要になるまで history 対象にしない。

## 推奨ロードマップ

### Phase 1: Vitest 拡充

v0.2 で最も優先する。

- `test:unit` は現行維持。
- project / timeline / post effect / LUT 周辺の pure helper test を増やす。
- 新規 state helper を作る場合は、DOM と分離して colocated test を付ける。

### Phase 2: Zustand vanilla PoC

Vitest で守れる小さな範囲に限定する。

- `zustand` を追加する前に、対象 state の責務メモを作る。
- 最初は保存対象ではない UI state を選ぶ。
- PoC store 自体に unit test を付ける。
- store 導入によって project 保存/読み込みの同期が増える領域は避ける。

### Phase 3: Action / Command PoC

Zustand より先に、または Zustand なしで試してよい。

- 対象を timeline / keyframe 編集に限定する。
- button / shortcut / timeline 操作を同じ action に寄せる。
- command は in-memory HistoryManager に積む。
- SQLite WASM は最初は観測ログまたは後続 PoC に回す。
- command builder / diff helper に Vitest を付ける。

### Phase 4: Tailwind CSS PoC

UI のガワ整理を v0.2.0 のテーマに含めるなら、Tailwind CSS は段階導入の候補にする。

- まず Action 化済みの panel、設定画面、または experimental panel に限定する。
- 既存 `index.css` の全面移行はしない。
- 似た button / field / panel の class 構成を共通化する。
- 相対値 / 絶対値の混在を、Tailwind spacing / sizing scale に寄せられる範囲から減らす。
- Tailwind 導入前後で renderer 起動、既存 UI の見た目、panel layout を確認する。

## 結論

v0.2.0 に向けて増やす価値が最も高いのは、Action ごとのテストと pure helper のテストである。

Action / Command pattern は追加ライブラリではないが、MMD 編集体験には直接効く。採用するなら入力全体ではなく、まず keyframe 編集限定で undo/redo と一緒に検証する。

Zustand は、React 導入なしで `zustand/vanilla` を使う小さな PoC なら検討価値がある。ただし、状態管理ライブラリ導入そのものは設計負債を消さないため、対象 state を狭く切ることが前提。

Tailwind CSS は、MMD 本体機能そのものには直接効かないが、現状の素書き HTML / CSS を整理する道具としては採用候補になる。全面移行ではなく、Action 化済みの UI 領域から段階的に入れる。

現時点の推奨:

1. Vitest: 採用済み。v0.2 で増やす。
2. Action / Command: keyframe 編集限定の PoC は有効。undo/redo と一緒に扱う。
3. Zustand: `zustand/vanilla` の小規模 PoC は可。全面導入はしない。
4. Tailwind CSS: 段階導入を検討。Action 化済み UI または隔離 UI から始める。

## v0.2.0 で整理したい開発方向

v0.2.0 の開発期間を長めに取るなら、単なる依存追加ではなく、次の方向をひとまとまりの整理テーマとして扱うのがよい。

1. 既存入力を Action として整理する。
2. Action ごとのテストを追加する。
3. 機能性は維持したまま、UI の外側と配線を整理する。

この方向は、MMD 編集の本筋を壊さずに内部構造を整える作業として意味がある。特に keyframe / timeline / selection / shortcut は今後の編集機能追加の土台になるため、v0.2.0 の長めの開発期間で整理しておく価値が高い。

### 目標

- button / shortcut / timeline / panel 操作を、同じユーザー意図なら同じ Action に寄せる。
- Action から実行処理への変換を小さな関数や service に分け、Vitest で確認できるようにする。
- UI の見た目や DOM 構造を整理しても、既存機能の実行経路が変わりすぎないようにする。
- undo/redo、入力ログ、Zustand store は Action 整理の後に接続する。
- v0.2.0 では「UI を新しく見せる」より、「同じ機能を壊さず整理できる構造」を優先する。

### 推奨する作業順

#### Step 1: Action catalog を作る

まず実装より先に、既存入力を Action 名に棚卸しする。

候補:

- playback: play / pause / stop / seek / frame step
- timeline: select target / select keyframe / seek frame
- keyframe: add / delete / nudge / copy interpolation / paste interpolation / reset interpolation
- selection: active model / active bone / active morph / camera target
- viewport: toggle ground / background / edge / physics / rigid body visualizer
- project: save / load / export
- device: keyboard / mouse / gamepad / MIDI から同じ Action へ割り当てる入力 mapping
- binding: keyboard shortcut custom / gamepad mapping / MIDI mapping

最初の実装対象は `keyframe` と `timeline` に限定する。

gamepad / MIDI と shortcut custom は v0.2.0 で完全実装しなくてもよい。ただし Action catalog には、将来 device mapping / shortcut binding を足せるように `source`、`device`、`scope` の考え方を入れておく。

#### Step 2: ActionDispatcher を薄く入れる

既存の button / shortcut handler から、直接 `this.addKeyframeAtCurrentFrame()` のようなメソッドを呼ぶ代わりに、まず Action を作る。

例:

```ts
dispatchEditorAction({ type: "keyframe.addAtCurrentFrame", source: "button" });
dispatchEditorAction({ type: "keyframe.addAtCurrentFrame", source: "shortcut" });
```

この段階では、内部で既存メソッドを呼んでよい。目的は動作変更ではなく、入力の入口を揃えること。

将来の拡張例:

```ts
dispatchEditorAction({ type: "playback.toggle", source: "keyboard", device: "keyboard" });
dispatchEditorAction({ type: "playback.toggle", source: "gamepad", device: "gamepad" });
dispatchEditorAction({ type: "playback.toggle", source: "midi", device: "midi" });
```

この形にしておくと、gamepad / MIDI は editor 本体ではなく input adapter 側の責務にできる。

#### Step 3: Action ごとの pure helper を切り出す

Action のうち、判定や差分生成だけを pure helper に分ける。

例:

- 選択中 keyframe を 1f 移動できるか
- 現在 frame に keyframe を追加した場合の差分
- interpolation preset を適用した場合の変更対象
- undo/redo 用に保持すべき最小差分

この層に Vitest を付ける。

#### Step 4: Command / HistoryManager を接続する

Action のうち、保存対象の編集操作だけを Command に変換する。

最初の対象:

- keyframe add
- keyframe delete
- selected keyframe nudge
- interpolation preset apply / reset

この段階でも SQLite WASM は使わない。まず in-memory HistoryManager で、操作粒度と副作用同期を確認する。

#### Step 5: Zustand vanilla を必要な範囲だけ入れる

Zustand は Action / Command の必須条件ではない。導入するなら、Action 整理後に「購読したい短命 state」が見えた範囲だけに使う。

候補:

- active timeline target
- current editing mode
- selected keyframe UI snapshot
- `canUndo` / `canRedo`
- dirty state
- panel visibility

Zustand に大きな animation buffer や Babylon object は入れない。

#### Step 6: UI のガワを整理する

UI 整理は、Action が揃った領域から行う。

方針:

- 既存機能の behavior を維持する。
- DOM の見た目変更と実行経路変更を同じ差分に詰め込みすぎない。
- Tailwind CSS を使う場合は、まず Action 化済みの panel か新規設定画面に限定する。
- 似た UI を個別 CSS のまま増やさず、button / input / field row / panel section の繰り返しを helper 化する。
- `px` 固定、`%`、`rem`、viewport 依存値が混ざっている箇所は、触る範囲から Tailwind の spacing / sizing scale に寄せる。
- 見た目の整理後も、同じ Action test が通ることを確認する。

### v0.2.0 の完了条件案

- keyframe / timeline 周辺の主要入力が Action catalog に載っている。
- button と shortcut が同じ Action 経路を通る操作がある。
- keyframe add / delete / nudge の Action helper または Command helper に Vitest がある。
- undo/redo の最小 PoC が in-memory HistoryManager で動く。
- Zustand を入れる場合は、短命 UI/editor state に限定されている。
- SQLite WASM は v0.2.0 では中核にしない。必要なら観測ログ PoC として別扱いにする。
- UI の見た目整理は、Action 化済みの領域から段階的に行う。

### 判断

この整理は v0.2.0 の長めの開発期間で扱う価値がある。

理由:

- MMD 編集機能を増やす前に、入力経路と編集操作の粒度を決められる。
- Action ごとにテストを作れるため、UI の外側を整理しても機能回帰を検出しやすい。
- undo/redo、Zustand、SQLite WASM、UI refresh の責務を分けて考えられる。
- タイムライン / keyframe 編集という優先度の高い領域に直接効く。

ただし、UI フレームワーク移行や Tailwind 全面移行のような大きい見た目変更から始めるのは避ける。まずは既存 UI のまま Action 経路を作り、テスト可能な単位を増やす。その後、Tailwind を使って相対値 / 絶対値の混在や似た component の散らばりを、Action 化済みの領域から整理する。

## v0.2.0 推奨作業順

今までの検討を実作業に落とすなら、次の順序を推奨する。

### 1. Vite / Vitest 更新検証を別ブランチで切る

目的:

- 依存更新の足場を先に確認する。
- Action 単位テストを増やす前に、Vitest の世代をどうするか決める。

方針:

- まず `vite@6.x + vitest@4.x` を検証する。
- 通ったら `vite@8.x` まで進めるか別途判断する。
- Babylon / babylon-mmd / WebGPU / Electron Forge package の切り分けを優先する。

確認:

```powershell
npm.cmd run lint
npm.cmd run test:unit
npm.cmd run package
npm.cmd run smoke:launch
```

追加確認:

- Electron Forge start / package が通る。
- babylon-mmd MPR / SPR wasm の URL 解決が dev / package の両方で壊れない。
- `optimizeDeps.exclude` が Vite 6+ でも効く。
- WebGPU 起動と `engine=WebGPU` 到達が維持される。

### 2. Action catalog を作る

目的:

- 既存入力を「どの UI から来たか」ではなく「何をしたいか」で整理する。
- keyboard shortcut custom / gamepad / MIDI controller の将来対応に備える。

対象:

- `playback.*`
- `timeline.*`
- `keyframe.*`
- `selection.*`
- `viewport.*`
- `project.*`
- `effect.*`

Action には、将来の入力拡張を見越して `source` / `device` / `scope` の考え方を入れる。

### 3. keyframe / timeline 周辺に ActionDispatcher を薄く入れる

目的:

- button / shortcut / timeline 操作の入口を揃える。
- まだ大きく挙動変更しない。

方針:

- 最初は dispatch 後に既存メソッドを呼んでよい。
- keyframe add / delete / nudge から始める。
- button と shortcut が同じ Action を dispatch する状態を作る。

例:

```ts
dispatchEditorAction({ type: "keyframe.addAtCurrentFrame", source: "button", device: "mouse", scope: "timeline" });
dispatchEditorAction({ type: "keyframe.addAtCurrentFrame", source: "shortcut", device: "keyboard", scope: "timeline" });
```

### 4. Action 単位の Vitest を増やす

目的:

- 手動テスト中心の確認から、Action / Command の単体テストへ寄せる。
- UI のガワ整理後も、入力意図と編集差分が壊れていないことを確認できるようにする。

テスト対象:

- `Action -> canExecute`
- `Action -> Command`
- `Action -> diff`
- undo / redo に必要な最小差分
- `mergeKey`
- button / shortcut / timeline 由来でも同じ Command になること

最初の対象:

- keyframe add
- keyframe delete
- selected keyframe nudge
- interpolation preset apply / reset

### 5. 自前 HistoryManager / CommandBuilder を入れる

目的:

- undo/redo の最小 PoC を作る。
- SQLite WASM や zundo に寄せる前に、MMD 編集操作の粒度を決める。

方針:

- in-memory HistoryManager から始める。
- keyframe add / delete / nudge に限定する。
- `execute` / `undo` / `redo` と最小差分を明示する。
- slider drag や連続 nudge は commit / merge の方針を決める。

### 6. Zustand vanilla を必要な範囲だけ導入する

目的:

- UI / editor state の購読基盤を作る。
- controller 間の state bridge を減らす。

入れてよい state:

- selection snapshot
- editing mode
- dirty flag
- `canUndo` / `canRedo`
- panel visibility
- command 実行中 state

入れない state:

- Babylon object
- MMD model 実体
- 大きな animation buffer
- project save format
- physics runtime state
- 毎フレーム更新される値

方針:

- Action / Command / HistoryManager は Zustand に依存させすぎない。
- Zustand は UI が購読したい lightweight snapshot に限定する。

### 7. Tailwind CSS を段階導入する

目的:

- 素書き HTML / CSS の相対値・絶対値混在を減らす。
- 似た button / field / panel の重複を整理する。
- UI のガワを整理しても、Action test で機能性を守る。

方針:

- Action 化済みの panel か設定画面から始める。
- 既存 `index.css` の全面移行はしない。
- Tailwind class の直書きだけで済ませず、繰り返し UI は render helper / template helper に寄せる。
- 導入後は `smoke:launch` と package 確認を行う。

### 8. shortcut custom / gamepad / MIDI は後続で足す

目的:

- 入力デバイス拡張を Action mapping として扱う。

方針:

- v0.2.0 で全部実装しなくてよい。
- `physical input -> binding -> Action` の形だけ先に設計しておく。
- 追加時は editor 本体ではなく input adapter を足す。

例:

```text
keyboard Space
toolbar button
gamepad A
MIDI transport play
  -> playback.toggle
```

### まとめ

推奨順:

```text
依存更新の足場確認
-> Action 設計
-> Action 単位テスト
-> undo/redo 最小実装
-> Zustand で UI state 整理
-> Tailwind で UI のガワ整理
-> 入力デバイス拡張
```

この順にすると、見た目や入力手段を増やす前に「何の操作なのか」を固定できる。v0.2.0 を長めに取るなら、この順で整理するのが最も切り分けしやすい。
