# コードレビュー: work/v0.2-dependency-upgrade

レビュー日: 2026-06-13
対象ブランチ: `work/v0.2-dependency-upgrade`
比較対象: `origin/main`(merge-base `ea7da88`)
レビュー範囲: `origin/main...work/v0.2-dependency-upgrade` の全差分(157 ファイル / 約 +43,000 / -4,400 行)

> このドキュメントはレビュー記録です。コードには一切変更を加えていません。
> 指摘には重要度(高 / 中 / 低)を付けています。確信が持てないものは「要確認」と明記しています。

---

## 0. 総評

依存関係の大型アップグレード(Babylon.js 8.45 → 9.2、babylon-mmd 1.1 → 1.2、Vite 5 → 7、Vitest 2 → 4、Tailwind CSS v4 新規導入)と、それに伴う UI 全面再設計・Action/Command 基盤・Frame Graph ポストエフェクト・物理コントローラ分離が一度に入った大規模ブランチです。

良い点:

- `npm run lint` は警告 0 で通過。
- `npm run test:unit` は 17 ファイル / 100 ケースすべて通過。Action/Command/履歴まわりに pure helper 単位のテストが新規追加されており、AGENTS.md の単体テスト方針に沿っている。
- 本番依存(`dependencies`)の `npm audit` 脆弱性は 0 件。
- プロジェクトファイルの後方互換(version 固定 + 未知バージョン拒否 + レガシーフィールド移行)が整理されている。
- Frame Graph コントローラの `dispose()` は各エフェクト/タスク/テクスチャを網羅的に解放しており丁寧。
- i18n キーは 5 言語(en/ja/ko/zh-Hans/zh-Hant)すべて 524 件で完全一致、欠落なし。
- ログのサニタイズ(パスは basename+拡張子へ縮約、文字列は 2000 字で切詰)は PII / パス露出の観点で良好。

最大の懸念:

- **型安全性の劣化(高)**: `tsc --noEmit` でエラー 370 件(main 相当は約 37 件)。ビルドは Vite/esbuild で型チェックを行わないため通るが、Host 構造型と `MmdManager` の不整合(private/public 不一致、欠落プロパティ)が広範に発生している。
- **mergeKey が未配線(中)**: コマンドの `mergeKey` は builder で設定されるが `HistoryManager` 側で一切参照されておらず、連続編集のマージが効かない。
- **巨大ファイルの肥大化継続(中)**: `mmd-manager.ts` 8,318 行、`ui-controller.ts` 7,993 行。controller 切り出しを進めても本体は増え続けている。

---

## 1. 検証コマンドの結果

| コマンド | 結果 |
| --- | --- |
| `npm run lint` | 通過(警告 0) |
| `npm run test:unit` | 100 / 100 通過(17 ファイル) |
| `npx tsc --noEmit` | **370 件のエラー**(下記参照) |
| `npm audit`(全体) | 45 件(low 4 / moderate 5 / high 36)— **すべて devDependencies** |
| `npm audit --omit=dev` | **0 件**(本番依存はクリーン) |

`package.json` の `scripts` に型チェック用コマンドが存在しないため、この 370 件は CI / 通常作業で検知されない状態です。

---

## 2. 依存アップグレード・ビルド基盤

### 2-1.(中)THIRD_PARTY_NOTICES.md に新規依存 `tailwindcss` / `@tailwindcss/vite` が未記載

`package.json` で `tailwindcss` と `@tailwindcss/vite`(ともに `^4.3.0`)が新規追加されているが、`THIRD_PARTY_NOTICES.md` の devDependencies 表には `vite` / `vitest` しか追記されておらず Tailwind が漏れている。MIT ライセンスの明記が必要。
- 参照: `package.json:37,45` / `THIRD_PARTY_NOTICES.md`(開発依存表)

### 2-2.(中)`@typescript-eslint` 5 系 + `eslint` 8 系だけが旧世代のまま

他は最新近くまで上がっている一方で、`eslint@^8.57.1`(8 系は EOL)と `@typescript-eslint/*@^5.62.0` が据え置き。TypeScript は 5.9 なので、parser/plugin 5 系では新しい構文・ルールに追従できない。依存アップグレードの趣旨からすると、ESLint 9 + typescript-eslint 8 系への更新を別タスクとして検討する価値がある。
- 参照: `package.json:40-43`

### 2-3.(低)`tsconfig.json` の `moduleResolution: "node"` が Tailwind v4 の package exports を解決できない

`vite.renderer.config.ts:2` で `// eslint-disable-next-line import/no-unresolved` を付けて `@tailwindcss/vite` の import を握りつぶしている。`tsc` でも `vite.renderer.config.ts(3,25): Cannot find module '@tailwindcss/vite'` が出る。`moduleResolution` を `"bundler"`(または `nodenext`)へ更新すれば disable コメントなしで解決でき、3-1 の型エラーの一部も解消する。
- 参照: `tsconfig.json:12` / `vite.renderer.config.ts:2-3`

### 2-4.(低・情報)`npm audit` の脆弱性 45 件はすべて開発ツールチェーン由来

`@inquirer/prompts` → `external-editor` → `tmp`(Path Traversal / symlink 書込)の連鎖で、`@electron-forge/cli` などビルド時専用。本番バンドルには含まれないため実害は低い。`npm audit fix --force` は electron-forge を壊す恐れがあるので安易に当てない方がよい。状態として記録するに留めるのが妥当。

### 2-5.(低)`docs/Frame Graph` という拡張子なしの迷子ファイル

中身は物理調査メモ(`v0.2 物理演算・高負荷モデル調査メモ`)。ファイル名が `Frame Graph`(拡張子なし・スペース入り)で内容と一致しておらず、おそらく保存ミス。`.md` 付きの適切な名前へ改名すべき。
- 参照: `docs/Frame Graph`

---

## 3. 型安全性(横断・高)

### 3-1.(高)`tsc --noEmit` でエラー 370 件

ビルドは esbuild ベースで型チェックしないため通るが、構造的な型崩れが広範に存在する。主な内訳:

- **Host インターフェースと `MmdManager` の不整合**(最多)。`EffectsPipelineHost` / `PostProcessHost` / `LightShadowHost` / `MaterialShaderHost` / `TimelineEditHost` / `BoneVisualizerHost` / `ProjectImportHost` など多数の `XxxHost` 型に対し、`MmdManager` 側で該当メンバが `private`(Host 側は public 想定)だったり、`Record<string, unknown>` のインデックスシグネチャが無いことでミスマッチ。
  - 例: `Property 'scene' is private in type 'MmdManager' but not in type 'PostProcessHost'`、`Property 'postEffectLutExternalPathValue' is private ...`、`'lightDirectionInputValue' is missing ... LightShadowHost`。
- **`src/scene/material-shader-service.ts`(約 77 件)**: `unknown` に対する `.set` / `.hasAlpha` / `.name` アクセス、`Effect` / `Scene` への不完全なオブジェクト渡し、`key: unknown` を `string` へ代入など。`unknown` 隔離が型情報を失ったまま使われている。
  - 参照: `src/scene/material-shader-service.ts:926-927, 973-986, 1098, 1150-1151, 1218, 1243, 1461-1491, 1884-1894`
- **`src/project/project-importer.test.ts`(約 29 件)** ほかテスト側でも、mock オブジェクトが Host 型を満たさず多数エラー。テストは Vitest(esbuild)で実行されるため通るが、型でガードできていない。

AGENTS.md は「新規/切り出し service では `host: any` 禁止、最小の `XxxHost` 型を置く」を掲げているが、`any` は避けられている一方で **Host 型と実体の構造的整合が取れていない**ため、結果的に型の保証が効いていない。`tsc --noEmit` を確認コマンド(または CI)に組み込み、段階的にエラーを減らす方針を推奨。少なくとも `MmdManager` の Host が要求するメンバの可視性(private → public もしくは Host 型側の見直し)を揃えるだけで大半が解消する見込み。

---

## 4. Action / Command / undo-redo

### 4-1.(中)`mergeKey` が builder で設定されるのに `HistoryManager` が参照していない(未配線)

- `bone-transform-command-builder.ts:37` → `mergeKey: edit.boneTransform:<bone>`
- `camera-transform-command-builder.ts:33` → `mergeKey: "edit.cameraTransform"`
- `keyframe-command-builder.ts:121` → `mergeKey: keyframe.move:<trackKey>`

これらが設定されているが、`HistoryManager.push()`(`src/actions/history-manager.ts:16-22`)は無条件に past へ積むだけで `mergeKey` を一切見ていない。コード全体を検索しても `mergeKey` を消費する merge ロジックは存在しない(`src/actions/` の builder と test 以外にヒットなし)。

影響: カメラ/ボーンの連続ドラッグ編集や連続 nudge が **1 マイクロ操作ごとに別々の undo エントリ**になる。`ui-controller.ts:5211, 5255` を見ると、ドラッグ確定のたびに `commandHistory.push(command)` しており、直前コマンドと同一 `mergeKey` かつ近接時刻なら統合する、という設計が効いていない。`docs/command-design-note-2026-05-19.md` のマージ意図と実装に乖離がないか要確認。
- 参照: `src/actions/history-manager.ts:16-22` / `src/ui-controller.ts:5174,5211,5255`

### 4-2.(低)`CommandScope` に未実装の scope がある

`command-types.ts:3-8` の `CommandScope` は `keyframe | interpolation | edit | effect | project` を定義しているが、builder / executor が存在するのは `keyframe` と `edit` のみ。`interpolation` / `effect` / `project` の undo/redo は未実装。WIP として想定内だが、`executeCommand`(`command-executor.ts:27-39`)の switch はこれらを扱わないため、将来追加時に分岐漏れに注意(switch に default が無いので網羅性は型で守られる点は良い)。

### 4-3.(低・良い点)keyframe builder の差分生成は健全

`keyframe-command-builder.ts` の `normalizeFrameList`(重複排除 + ソート)、`addFrameNumber` / `removeFrameNumber` / `moveFrameNumber` は参照同一性で「変化なし」を判定して `null` を返しており、no-op コマンドを履歴に積まない設計。nudge は `toFrame < 0` や `toFrame === fromFrame` を弾いており境界も妥当。executor の apply/revert 対称性(`command-executor.ts`)も add↔remove、move の from↔to が正しく反転している。

---

## 5. レンダリング / ポストエフェクト

### 5-1.(中・要確認)`PostEffectBackend` 型の定義不一致

- `src/render/post-effect-backend.ts:1` … `export type PostEffectBackend = "classic" | "frameGraph";`(2 値)
- `src/render/effects-pipeline-controller.ts:37` … `postEffectBackend: "classic" | "frameGraph" | "experimental";`(3 値)

正規化関数 `normalizePostEffectBackend`(`post-effect-backend.ts:5-18`)は `"classic"` / `"frameGraph"` 以外を fallback(既定 `"classic"`)へ落とすため、`"experimental"` を保存しても **localStorage 復元時に classic へ静かに降格**する可能性がある。AGENTS.md が警告する「Classic / Frame Graph / Experimental の経路混在」に直結するため、型の一本化と experimental の扱い(正規化に含めるか、別フラグにするか)を要確認。
- 参照: `src/render/post-effect-backend.ts:1,5-18` / `src/render/effects-pipeline-controller.ts:37`

### 5-2.(低・良い点)Frame Graph の dispose は網羅的

`frame-graph-post-effects-controller.ts:1384-1430` で各 effect / task を `?.dispose()` してから null 化し、`frameGraph` / `lutTexture` も解放、`ready` / `active` / カウンタ類もリセットしている。backend 切替時のリソース残存リスクは低い。

### 5-3.(中)`material-shader-service.ts` の `unknown` 多用(3-1 と重複)

材質シェーダーサービスは Babylon の実体を `unknown` に寄せた結果、`.hasAlpha` / `.set` / `.name` 等へ未ガードでアクセスしており tsc エラーの温床。小さい `Like` 型(必要プロパティのみ)へ寄せる AGENTS.md 方針に沿った整理余地がある。

---

## 6. コアランタイム / 物理 / プロジェクト

### 6-1.(中・要確認)パッケージビルドで Worker 物理(MPR)が無効

`mmd-manager.ts:4142-4156` の `getMprUnavailableReason()` は冒頭で `if (!import.meta.env.DEV) return "MPR packaged build integration is pending";` としており、**packaged build では多スレッド WASM 物理が常に無効**。これに整合して、COOP/COEP ヘッダ(`configureCrossOriginIsolationHeaders`)も dev でのみ適用される(`main.ts:770-772`、production では未適用)。

つまり本ブランチの依存アップグレード(babylon-mmd 1.2 の推奨する Worker 物理経路を狙う)は **dev では crossOriginIsolated 前提で動くが、packaged build では単スレッド物理に留まる**。これはバグというより現状の意図的な状態だが、AGENTS.md で物理安定化が高優先である以上、パッケージ版での物理経路が未到達である点を明示しておくべき。`docs/v0.2-physics-investigation-note.md` の記述と実装状態の突合を要確認。
- 参照: `src/mmd-manager.ts:4142-4156` / `src/main.ts:484-492,770-772`

### 6-2.(低・良い点)プロジェクト後方互換は妥当

`project-importer.ts:209-214` の `isProjectFileV1` が `format === "mmd_modoki_project" && version === 1` を厳格判定し、`importProjectState`(`:254-261`)は不一致を `Error("Invalid project file format or version")` で明確に拒否。さらに lighting 方向は `_x/_y/_z` レガシーフィールド移行(`:200-206`)を持つ。v0.2 で増えた設定は optional read + 既定値で読むため、旧 v1 プロジェクトも読める。format/version は据え置き(version 1 のまま)なので互換は崩れていない。

### 6-3.(中)`mmd-manager.ts` / `ui-controller.ts` の肥大化

controller / service 切り出しを多数行っているにもかかわらず、`mmd-manager.ts` は 8,318 行、`ui-controller.ts` は 7,993 行と、いずれも依然として巨大。AGENTS.md 自身がこの 2 ファイルを「中核」と位置づけ、`timeline.ts` を手本にした局所化を推奨している。今後の機能追加で `ui-controller` にコマンド実行(5-7 章で見た push 群)が集中し続けると、6-1 の Host 型不整合(3-1)とあわせて保守コストが上がる。コマンド実行・履歴連携を専用 facade へ寄せる余地がある。

---

## 7. Electron セキュリティ / IPC

### 7-1.(中)`webSecurity: false` + 広範なファイル IPC ハンドラ(設計上の受容リスクとして明記推奨)

`main.ts:717` で `webSecurity: false`(file:// ローカル読込のため意図的)。一方で IPC ハンドラ群は **レンダラから渡された任意パスを検証/allowlist なしで読み書き**する:

- 読込: `file:readBinary`(`:881`)、`file:readText`(`:1009`)
- 書込: `file:writeTextToPath`(`:1096`、任意パスへ書込)、`file:savePngToPath` / `file:savePngRgbaToPath`(`:1259,:1282`)、`file:saveWebmToPath`(`:1316`)

緩和要因は十分にある: `contextIsolation: true` / `nodeIntegration: false`(`:715-716`)、production では http/https/ws/wss を `onBeforeRequest` で全 cancel(`:503-505`)、`setWindowOpenHandler` で deny、`will-navigate` を allowlist 制限、permission ハンドラは全 deny。ローカル完結アプリとしてはリスクは低いが、**書込系ハンドラが任意パスを許す**点は、将来万一でも信頼できないコンテンツがレンダラに載ると危険なので、最低限「アプリ管理下/ユーザー選択ディレクトリ配下」へのパス制約を検討する価値がある。少なくとも受容リスクとして docs に明記すべき。

### 7-2.(中)packaged Linux で `--no-sandbox`

`main.ts:164-168` で packaged Linux のみ `no-sandbox` / `disable-setuid-sandbox` を付与(zip ビルドの chrome-sandbox 未整備への暫定対応とコメントあり)。Chromium サンドボックスが無効化されるため、配布形態が固まったら sandbox 有効化(setuid helper 同梱や AppImage 化)へ寄せたい。コメントで暫定と明示されている点は良い。

### 7-3.(低・良い点)IPC 入力検証とログ衛生

- `log:write`(`:778-785`)は level / scope / message の型を検証してから書込。
- WebM / PNG シーケンスのエクスポート要求は `sanitizeWebmExportRequest` / `sanitizePngSequenceExportRequest`(`:345-416`)で format/version と各数値域をクランプ。
- smoke IPC は `event.sender.id` を mainWindow と照合(`:657,:687`)。
- ログは `sanitizeLogValue`(`:64-90`)でキー名に `path` を含む文字列を `{fileName, extension}` へ縮約、文字列は 2000 字で切詰、深さ/件数も制限。PII / フルパス露出を抑えている。

---

## 8. UI / i18n

### 8-1.(低・良い点)i18n キー整合

en/ja/ko/zh-Hans/zh-Hant の 5 ファイルとも 524 キーで完全一致、欠落 0。UI 全面再設計でメニュー/ダイアログ文言が大量追加されたにもかかわらず翻訳の取りこぼしがない。

### 8-2.(低)言語 JSON に BOM が付与されている

`language/*.json` 先頭に UTF-8 BOM。i18next の読込は通常 BOM を許容するため実害は出ていないが、`JSON.parse` を直接使うスクリプト(本レビューの整合チェックでも BOM 除去が必要だった)では躓く。統一して除去するか、BOM 前提を明記しておくと安全。

> 注: UI controller 群(`src/ui/` の新規 dialog/panel controller、`viewport-*-controller.ts` のイベント登録解除・DOM null 安全・状態同期)は、担当のサブエージェントがセッション上限に達したため網羅レビュー未完了。`addEventListener` の解除経路、`getElementById` の ID と `index.html` の対応、初期値/保存/locale 切替同期は別途レビュー回を設けることを推奨。lint は通過しているため明白な未使用/未定義はないが、ライフサイクル(多重登録・dispose 漏れ)は静的解析だけでは拾い切れない。

---

## 9. 優先対応の提案(まとめ)

| 優先 | 項目 | 章 |
| --- | --- | --- |
| 高 | `tsc --noEmit` を確認コマンド化し、Host 型と `MmdManager` の可視性不整合(370 件の主因)を解消 | 3-1 |
| 中 | `mergeKey` を `HistoryManager` に配線(連続編集の undo マージ)、または設計意図を docs と突合 | 4-1 |
| 中 | `PostEffectBackend` 型の一本化と `experimental` の正規化/保存方針の確定 | 5-1 |
| 中 | パッケージ版での物理経路(MPR 無効 / COOP・COEP dev 限定)の現状を docs に明記 | 6-1 |
| 中 | `THIRD_PARTY_NOTICES.md` に Tailwind を追記 | 2-1 |
| 中 | ファイル書込 IPC のパス制約検討、または受容リスクの明文化 | 7-1 |
| 低 | `moduleResolution: "bundler"` へ更新(disable コメント除去) | 2-3 |
| 低 | `docs/Frame Graph` の改名、言語 JSON の BOM 統一 | 2-5 / 8-2 |
| 低 | ESLint 9 + typescript-eslint 8 系への更新検討 | 2-2 |
| — | `src/ui/` controller 群のライフサイクル/DOM 整合の追加レビュー | 8 |

---

## 付記: レビュー手法

- 領域別(Action/Command、レンダリング、UI、コアランタイム、基盤)にサブエージェントで探索を試みたが、いずれもセッション上限に達し最終レポートは未取得。本ドキュメントはメインエージェントによる直接確認(該当ファイルの読込・grep・lint/test/tsc/audit 実行・i18n 整合スクリプト)に基づいて作成した。
- コードは変更していない(読み取り専用レビュー)。
