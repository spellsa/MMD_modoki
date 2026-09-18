# v0.2.0 リリース前レビュー追加メモ: TypeScript 型検査初回ベースライン

作成日: 2026-07-04

## 目的

レビュー 05 で指摘された「`tsc --noEmit` が lint / CI に存在しない」問題に対し、現状の型検査エラーを一度取得し、後で重要度順に整理できるベースラインとして記録する。

このメモはエラーを修正済みとみなすものではない。初回実行時点の分布と、すぐに重大指摘と結びつくものを残す。

## 実行内容

ローカル Windows 環境で次を実行した。

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run typecheck
```

`package.json` には次の script を追加した。

```json
"typecheck": "tsc --noEmit --pretty false"
```

GitHub Actions には `Type Check Baseline` workflow を追加した。ただし初回ベースラインでは大量の既存エラーがあるため、`continue-on-error: true` として非ブロッキング運用にしている。型エラーを整理してから blocking check へ切り替える。

## 結果概要

- 総エラー数: 479
- `npm.cmd run typecheck` は失敗する。
- ローカルの全量ログは `artifacts/tsc-noemit-2026-07-04.log` に保存した。ただし `*.log` で git ignore されるため、コミット対象にはしない。

### エラーコード別

| Code | Count | 主な意味 |
|---|---:|---|
| TS2345 | 275 | 引数型不一致。host 型、Babylon 型、mock 型の不一致が多い |
| TS2339 | 76 | property 不存在。`unknown` / `object` / Babylon private 周りが多い |
| TS2540 | 42 | readonly property への代入。timeline edit service に集中 |
| TS2341 | 40 | private property access。Babylon `GlowLayer` / `MmdManager` private など |
| TS2322 | 17 | 代入型不一致 |
| TS2352 | 10 | 型変換の重なり不足 |
| TS2740 | 8 | 構造型の不足 |
| TS2552 | 2 | 未定義名の参照に近いエラー |
| TS2307 | 2 | module / type resolution 失敗 |
| その他 | 7 | TS2353, TS2349, TS2554, TS4113, TS2551, TS1343, TS2416 |

### ファイル別上位

| File | Count | メモ |
|---|---:|---|
| `src/mmd-manager.ts` | 226 | service host 型、private/internal API、Babylon / babylon-mmd 型の不一致が集中 |
| `src/scene/material-shader-service.ts` | 77 | GlowLayer private access、material Like 型、unknown narrowing が集中 |
| `src/editor/timeline-edit-service.ts` | 42 | readonly track 配列への代入が集中 |
| `src/project/project-importer.test.ts` | 36 | test mock と実型のズレ |
| `src/scene/material-shader-service.test.ts` | 32 | test mock と MaterialShaderHost のズレ |
| `src/render/post-process-controller.ts` | 16 | post process 周りの型不一致 |
| `src/scene/light-shadow-controller.test.ts` | 15 | test mock と実型のズレ |
| `src/assets/model-asset-service.ts` | 10 | MmdStandardMaterial / material Like 型の不一致 |

## すぐ重大指摘と結びつくもの

### WebM exporter の `request` スコープ問題

レビュー 05 の Blocker B8 は型検査で検出できた。

```text
src/renderer.ts(494,19): error TS2552: Cannot find name 'request'. Did you mean 'Request'?
src/renderer.ts(495,17): error TS2552: Cannot find name 'request'. Did you mean 'Request'?
```

これは WebM 出力失敗時に catch 内で `request` を参照して ReferenceError になり、export window の終了通知や lock 解除が飛ぶ問題。最優先で修正する。

### 単発の実バグ候補

以下は件数は少ないが、実装ミスの可能性があるため後で優先確認する。

```text
src/bottom-panel.ts(175,17): error TS2353: Object literal may only specify known properties, and 'target' does not exist ...
src/scene/mesh-render-stability.ts(92,10): error TS2554: Expected 1-2 arguments, but got 0.
src/ui-controller.ts(8482,43): error TS2341: Property 'activeModelInfo' is private and only accessible within class 'MmdManager'.
```

### 設定由来の可能性が高いもの

```text
vite.renderer.config.ts(3,25): error TS2307: Cannot find module '@tailwindcss/vite' ...
```

`@tailwindcss/vite` の型は `dist/index.d.mts` に存在するが、現行 `tsconfig.json` の `moduleResolution: "node"` では解決できないという指摘。`bundler` / `node16` / tsconfig 分割など、CI 化前に方針を決める。

## 大きな分類

1. **Babylon.js / babylon-mmd の private / internal API 依存**
   `GlowLayer` private property、`MmdStandardMaterial` private member、babylon-mmd wasm typed array など。実装上の意図的な踏み込みも多いため、単純に「型を合わせる」だけではなく、依存境界を `Like` 型や adapter に隔離する必要がある。

2. **service / controller 切り出し後の host 型ズレ**
   `MaterialShaderHost`、`EffectsPipelineHost`、`ModelAssetHost` などの要求が実体より広い、または private member を含む class と構造型が噛み合っていない。AGENTS.md の「any host 禁止」と両立する形で、小さい host 型へ再設計する必要がある。

3. **timeline edit service の readonly mutation**
   `src/editor/timeline-edit-service.ts` に `TS2540` が集中。runtime animation track を直接 mutation する前提と、型上 readonly になっている配列のズレ。データ整合の Blocker と近い領域なので、修正時は挙動確認を厚めにする。

4. **test mock の型劣化**
   `*.test.ts` に host mock / material mock の不足が多い。実装の型を直した後で mock helper を整備する方が効率がよい。

5. **tsconfig / module resolution**
   Vite / Tailwind plugin の `.d.mts` 解決で `moduleResolution` の古さが表面化している。Electron main/preload/renderer で要求が違うため、tsconfig 分割も候補。

## 当面の扱い

- CI には非ブロッキングで追加済み。現時点では red gate にしない。
- まず B8 のような実害確定の小さい修正を優先する。
- 次に「少数・実バグ候補」と「設定だけで消えるもの」を先に仕分ける。
- 大量発生している host 型 / Babylon private 型 / readonly mutation は別作業として段階的に減らす。
- エラー数が十分減った段階で `continue-on-error: true` を外し、release build 前の必須 check にする。

## 再発予防策

型検査エラーが 479 件ある状態で `tsc --noEmit` をそのまま blocking CI にすると、すべての PR / release build が常時失敗する。そのため、再発予防は段階化する。

### 1. 即時の blocking 対象

B8 のような「未定義名参照」は、既存の Babylon / host 型ズレとは性質が違い、ほぼ実バグとして扱える。

まず B8 修正後に、次の系統だけを blocking check にすることを検討する。

- `TS2304`: Cannot find name
- `TS2552`: Cannot find name ... Did you mean ...
- `TS2551`: Property ... does not exist ... Did you mean ...

ただし `TS2551` は Babylon / DOM 型の都合で false positive が出る可能性があるため、初回はログを見てから採用する。B8 を再発させない最小セットは `TS2304` / `TS2552`。

### 2. ベースライン方式

全体の `tsc --noEmit` は非ブロッキングで回し続け、件数を記録する。

- 現在値: 479 errors
- 目標: 修正作業ごとに件数を減らす
- 運用: 件数が増えたら、増分が意図した型厳格化なのか、新規エラーなのか確認する

将来的には「現在のベースラインより増えたら失敗」にする ratchet 方式へ移行する。最終的にはベースラインを 0 にして `continue-on-error: true` を外す。

### 3. PR / release の使い分け

- PR: まずは非ブロッキング typecheck + 重大コードの blocking check
- release tag build: v0.2.0 前に少なくとも `TS2304` / `TS2552` は 0 件を必須にする
- 通常 lint: `npm.cmd run lint` は従来どおり維持し、型検査の代替にしない

### 4. 修正順序

1. B8 (`renderer.ts` の `request`) を修正し、`TS2552` を 0 にする。
2. 単発の実バグ候補を確認する。
3. `tsconfig` / module resolution 由来の `TS2307` を消す。
4. `timeline-edit-service.ts` の readonly mutation を、キー編集 Blocker と合わせて整理する。
5. host 型 / Babylon private 型は、領域ごとに `Like` 型や adapter へ隔離して減らす。

### 5. 新規コードのルール

- 新規 / 切り出し service では `host: any` を使わず、最小の `XxxHost` 型を同じファイル先頭に置く。
- Babylon / babylon-mmd の private / internal API に触る場合は、広い `any` ではなく、その呼び出し箇所だけの `Like` 型か adapter に閉じ込める。
- 型検査を通せない理由がある場合は、コメントで「外部ライブラリ private API」「型定義と runtime 実装の差」などの理由を書く。
- `@ts-ignore` は原則使わず、必要なら `@ts-expect-error` にして理由を添える。
