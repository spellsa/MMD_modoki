# MMD_modoki プロジェクトオーバービュー



## 1. これは何か

- MMD にインスパイアされたローカル向けの MMD 編集ツール（デスクトップアプリ）。
- 正規版プロダクトというより **技術的試作 / 実験機**。完成品化より「知見の蓄積・機能検証・操作体験の試作」を重視する。
- 最優先は **MMD 本体機能**（Property / IK を含むタイムライン編集、ボーン・カメラのキーフレーム、物理の比較と安定化、保存/復元/出力の完成度）。
- 汎用 3D フォーマット（glTF/GLB、OBJ、STL、PLY など）は低優先〜保留。既存の `.x` アクセサリ対応は維持。
- 実験機能（PBR、SSS、海、外部 WGSL、MCP など）は「設定 → 実験設定」などで隔離し、通常の MMD 編集体験を壊さない方針。

公開 build の主な機能:

- PMX/PMD モデル、`.x` / OBJ アクセサリ、VMD モーション、カメラ VMD、音声の読み込み
- ボーン、モーフ、カメラ、照明、ポストエフェクト、アクセサリ変形のタイムライン編集
- 内蔵 / 外部 LUT（`.3dl`, `.cube`）の読み込み
- モデル/カメラ VMD（β）、VPD ポーズ、静止画、PNG 連番、WebM 動画の出力
- UI 言語切替（英語・日本語・繁体字中国語・簡体字中国語・韓国語）
- 配布後の通常実行は offline-first（shader、WASM、既定 texture、環境 lighting を同梱）

---

## 2. 技術スタック

| 技術                        | 用途                                                                 |
| ------------------------- | ------------------------------------------------------------------ |
| Electron 40               | デスクトップ実行基盤。ウィンドウ、OS メニュー、ダイアログ、ファイル IO、IPC                         |
| TypeScript 5.9            | Main / Preload / Renderer の主要実装言語                                  |
| Electron Forge + Vite     | 開発起動、ビルド、配布パッケージ                                                   |
| Babylon.js 9.2            | scene、camera、mesh、material、texture、shadow、post effect、WebGPU/WebGL |
| babylon-mmd 1.2           | PMX/PMD/VMD 読み込み、MMD animation runtime、ボーン/モーフ評価、MMD 物理            |
| WebGPU / WGSL             | 優先描画 backend と shader 言語。compute、Frame Graph、出力 readback           |
| HTML/CSS + Tailwind CSS 4 | UI。React/Vue は使わず、TypeScript controller が直接 DOM を操作                |
| i18next                   | 多言語 UI                                                             |
| MediaBunny                | WebM の encode / container 出力                                       |
| electron-log              | Main / Renderer のログ                                                |
| Vitest / Playwright       | pure logic 単体テスト / 実 Electron E2E                                  |
| zod 4                     | 外部 WGSL 契約や MCP スキーマの検証                                            |
| @modelcontextprotocol/*   | MCP サーバ連携（AI からのアプリ操作）                                             |

描画は **WebGPU-first**。通常起動 `auto` は WebGPU を先に初期化し、失敗時のみ WebGL2 へ fallback。
環境変数 `MMD_MODOKI_RENDERER=webgpu|webgl2` で固定できる。WebGL2 は互換・調査用。

---

## 3. リポジトリ構成（トップレベル）

```
MMD_modoki/
├─ src/           アプリ本体（TypeScript）
├─ test/          Vitest 単体テストと Playwright E2E
├─ language/      UI 翻訳辞書 (en/ja/ko/zh-Hans/zh-Hant.json)
├─ lut/           内蔵 LUT (.3dl) と README
├─ wgsl/          外部 WGSL 材質のサンプルと作者向けドキュメント
├─ playgrounds/   Babylon.js 単体検証用の独立 playground
├─ scripts/       開発・検証・生成用 Node スクリプト
├─ docs/          設計・調査・仕様・作業記録（本ファイル以外は整理対象）
├─ insights/      再利用知見カード層（本ファイルへ集約済み、整理対象）
├─ .github/workflows/  CI (typecheck.yml, build-zips.yml)
├─ .agents/skills/ mmd-insight-curation / mmd-release / mmd-rendering-triage / mmd-test
├─ index.html     Renderer の HTML エントリ
├─ forge.config.ts, vite.*.config.ts  Electron Forge / Vite 設定
└─ README*.md, THIRD_PARTY_NOTICES.md, LICENSE
```

---

## 4. `src/` コードマップ

エントリ:

- `src/main.ts` … Electron Main Process。ウィンドウ、メニュー、ファイル IO、ダイアログ、ログ、IPC handler。
- `src/preload.ts` … `window.electronAPI` として許可 API だけ公開。
- `src/renderer.ts` … Renderer 初期化の配線（i18n、runtime、UI、timeline、MmdManager 群を生成）。
- `src/index.css` … グローバル CSS。

中心:

- `src/mmd-manager.ts` … Babylon scene、babylon-mmd runtime、モデル、カメラ、再生、物理、材質、描画設定の中核。`WGSL_MATERIAL_SHADER_PRESETS` の定義元。依然大きく、周辺へ分離中。
- `src/mmd-manager-x-extension.ts` … `.x` アクセサリの親モデル/親ボーン、表示、transform。
- `src/ui-controller.ts` … DOM イベントと操作の大きな接続点。`src/ui/` の controller へ分離中。
- `src/timeline.ts` / `src/timeline-display.test.ts` … タイムライン描画、ルーラー、キー表示・選択、矩形選択、行/列/ALL 選択。
- `src/bottom-panel.ts` … 下パネル（モデル情報、ボーン値、モーフ、補間）。
- `src/x-file-loader.ts` … Babylon SceneLoader plugin として `.x` text format を解釈。
- `src/types.ts`, `src/i18n.ts`, `src/app-logger.ts` … 共通型、i18n、ロガー。
- `src/lut-file.ts`, `src/png-sequence-exporter.ts`, `src/webm-exporter.ts` … 出力系トップ。

### `src/actions/` — Action / Command / 履歴

`action-dispatcher.ts`、`action-availability.ts`、`command-executor.ts`、`history-manager.ts`、`command-types.ts`、
`bone-transform-command-builder.ts`、`camera-transform-command-builder.ts`、`keyframe-command-builder.ts`、`keyframe-transaction.ts`。
UI/ショートカット/タイムラインの同じ編集意図を同じ経路へ寄せる。undo/redo は CommandDiff として扱う。

### `src/editor/` — 編集ロジック

`timeline-edit-service.ts`（キー登録・削除・コピー・貼り付け・反転ペースト・物理キー）、
`keyframe-value-correction.ts`、`scene-keyframe-track.ts`、`effect-scene-track-store.ts`、`effect-keyframe-definitions.ts`、
`accessory-transform-keyframe-track.ts`、`mmd-animation-builder.ts`、`runtime-animation-binder.ts`、`motion-document.ts`、
`model-motion-state.ts`、`model-body-motion-correction.ts`、`bone-pose-batch.ts`、`morph-weight-batch.ts`、
`morph-preview-capacity.ts`、`bone-gizmo-controller.ts`、`bone-visualizer-controller.ts`、`rigid-body-visualizer-controller.ts`、
`physics-bone-visibility.ts`、`timeline-key-selection.ts`、`mirror-paste-service.ts`、`scene-playback-control-lock.ts`。

### `src/ui/` — 用途別 controller（64 ファイル）

- レイアウト: `layout-ui-controller.ts`、`bottom-panel-layout-controller.ts`、`panel-control-helpers.ts`、`popup-form-helpers.ts`、`popup-dialog-controller.ts`
- メニュー/バー: `app-menu-controller.ts`、`viewport-top-bar-controller.ts`、`viewport-bottom-bar-controller.ts`、`viewport-runtime-status-controller.ts`、`viewport-axis-handle-controller.ts`
- パネル: `effect-panel-shell-controller.ts`、`shader-panel-controller.ts`、`camera-panel-controller.ts`、`dof-panel-controller.ts`、`lut-panel-controller.ts`、`fog-panel-controller.ts`、`accessory-panel-controller.ts`、`export-ui-controller.ts`、`model-info-panel-controller.ts` ほか
- ダイアログ: 背景、重力、照明/影、床(mirror)、エッジ、接触影、HDRI、IBL 影、物理、Water、PBR/実験設定、VMD retarget、PNG/WebM 出力 ほか

方針: 新 UI は用途別 controller に閉じ込め、`UIController` を直接巨大化させない。表示・初期値・保存/読込・backend 同期までを一組で実装する。

### `src/assets/`, `src/project/` — モデル・モーション・プロジェクト

- `assets/model-asset-service.ts` … PMX/PMD 読み込みの入口（ファイル解決、関連 texture、loader options、メタ情報）。
- `assets/motion-asset-service.ts` … VMD/VPD 読み込みの入口。
- `assets/model-material-switch.ts`, `model-bone-metadata.ts`, `adaptive-pbr-material-builder.ts`。
- `project/project-serializer.ts` / `project-importer.ts` / `project-codec.ts` … project 保存形式の encode/decode と復元。
- `project/material-mode-state.ts`, `runtime-reload-project-state.ts`。
- 同梱アセット: `assets/textures/toon/`, `assets/textures/water/`, `assets/fonts/`, `assets/blob-shadows/`, `assets/ibl-shadows/`。

### `src/render/` — 描画・ポストエフェクト（86 ファイル）

- 経路選択: `effects-pipeline-controller.ts`、`post-effect-backend.ts`、`post-process-controller.ts`（Classic）。
- FrameGraph: `frame-graph-post-effects-controller.ts`、`frame-graph-resource-plan.ts`、`frame-graph-backend-rebuild-state.ts`、
  各 task/shader（aerial perspective、directional light shafts、ocean、ssgi、ssao）。
- 材質/PBR: `pbr-material-presets系`（`pbr-surface-presets.ts`、`pbr-mmd-like-toon-settings.ts`、`pbr-mmd-like-material-plugin.ts`、`pbr-no-shadow-material-plugin.ts`、`pbr-skin-face-normal-plugin.ts`、`pbr-thin-translucency-plugin.ts`）。
- SSS: `owned-sss.ts` と関連（project 所有の WGSL 経路）。
- その他: `lut-atlas-texture.ts`、`keyframed-bloom-blur.ts`、`luminous-blur-settings.ts`、`export-render-surface.ts`、`mmd-outline-tuning.ts`、`environment-lighting.ts`、`object-motion-blur-bone-velocity.ts`。

方針: Classic / FrameGraph / Experimental を混在させない。UI 表示状態と実際の backend 適用状態をズラさない。

### `src/scene/` — scene と材質

`material-shader-service.ts`（MMD 材質・toon・sphere・WGSL 適用）、`material-visibility-controller.ts`、
`light-shadow-controller.ts`、`water-surface-controller.ts`、`ring-particle-controller.ts`、`mesh-render-stability.ts`、
`dds-texture-compat.ts` / `bmp-texture-compat.ts`（WebGPU/MMD 互換 decode）、`accessory-coplanar-depth-bias.ts`、
`viewport-depth-range.ts`、`shadow-caster-runtime-state.ts`。
`scene/shaders/builtin-toon/` に内蔵 toon shader。

### `src/physics/` — 物理

`physics-runtime-controller.ts`（backend、MPR / SPR / Ammo fallback、性能計測）、`physics-model-controller.ts`、
`physics-backend-switch-policy.ts`、`physics-compatibility-correction.ts`、`model-external-parent-physics.ts`。
安定版は `MmdRuntime + MmdBulletPhysics(MultiPhysicsRuntime)`。`MmdWasmRuntime` は別 PoC。

### `src/export/`, `src/output/` — 出力

- `export/vmd-serializer.ts`, `vmd-export-adapter.ts`, `vmd-export-document.ts`, `vmd-export-validator.ts`
- `export/bvmd-exporter.ts`（多言語名を Unicode のまま保存）, `shift-jis-fixed-string.ts`
- `export/vpd-*.ts`（VPD ポーズ）, `webm-video-quality-policy.ts`, `seek-video-frame.ts`, `external-parent-warning.ts`
- `output/png-encoder.ts`, `png-encoder-web-worker-pool.ts`, `png-encoder-web-worker.ts`, `png-encoder-protocol.ts`
- `src/webm-exporter.ts`（MediaBunny）, `src/png-sequence-exporter.ts`

方針: 出力は正規化済み `RenderedExportFrame` を各形式で共有する。WebM は現在の viewport 物理状態を引き継いで開始。

### `src/external-wgsl/` — 外部 WGSL 材質（実験）

`contract.ts`, `author-declarations.ts`, `inputs.ts`, `input-registry.ts`, `single-file.ts`, `file-store.ts`,
`material-plugin.ts`, `project-format.ts`, `limits.ts`, `deadline.ts`, `recovery.ts`, `recovery-state.ts`, `service.ts`。
JSON を使わない v2 作者宣言形式へ一本化。多重防護のための bounded contract（サイズ・入力・GPU 診断・期限）。

### `src/automation/`, `src/main/automation/` — MCP / AI 操作

`contracts.ts`, `editor-bridge.ts`, `editor-options.ts`, `menu-actions.ts`, `menu-catalog.ts`, `ui-operations.ts` ほか
keyframe / object / material / morph / diagnostics / png / video / file-tools / viewport-snapshots の各操作。
`src/automation/help/` にヘルプ。Main 側 `src/main/automation/` にサーバ/トランスポート。zod schema で入力を検証。

### `src/runtime/`, `src/diagnostics/`, `src/shared/`, `src/tools/`

- `runtime/switchable-material-proxy.ts`, `pbr-material-proxy.ts`
- `diagnostics/performance-profiler.ts`
- `shared/` … 共有定義の正本: `frame-graph-post-effect-stack.ts`（エフェクト順序）, `mmd-material-pipeline.ts`（材質 pipeline）,
  `mmd-render-order.ts`, `mmd-model-header.ts`, `model-instance-id.ts`, `model-external-parent.ts`, `camera-external-parent.ts`,
  `camera-focus.ts`, `dof-person-autofocus.ts`, `environment-lighting-presets.ts`, `background-display-mode.ts`,
  `skydome-background-style.ts`, `x-face-deduplication.ts`, `x-material-render-policy.ts`, `obj-local-materials.ts`, `timeline-helpers.ts`, `ui-scale.ts`
- `tools/vmd-retarget-converter.ts`, `mmd-optimized-format-converter.ts`, `vmd-retarget-file-service.ts`

---

## 5. その他のディレクトリ

- `test/` … `test/e2e/`（Playwright spec、`electron-app.mjs`、`mcp-client.mjs`）と、単体テスト用の `actions/assets/automation/...`・`fixtures/`。
- `language/` … en / ja / ko / zh-Hans / zh-Hant.json。5 言語分のキーは揃っている。
- `lut/` … `anime-cool`, `anime-dramatic`, `anime-soft`, `monotone`, `sepia`, `teal-orange`（`.3dl`）。
- `wgsl/` … 外部材質サンプル（aurora-opal, black-opal, moonstone-schiller, prismatic-fire, white-opal, blend-modes, MME 系）と `AUTHORING.md` / `REFERENCE.md` / `template.wgsl`。
- `playgrounds/` … `pbr-skin-sss-webgpu`, `pbr-skin-sss-frame-graph-webgpu` と forum-report テンプレート。
- `scripts/` … `smoke-launch.mjs`, `check-critical-type-errors.mjs`, `benchmark-export-rgba.mjs`, `run-png-export-stress.mjs`, `show-app-log.mjs`, fixture/LUT/HDR 生成、`generate:*`。
- `.github/workflows/` … `typecheck.yml`（CI 型検査）, `build-zips.yml`（配布 ZIP ビルド）。
- `.agents/skills/` … 反復作業の Skill 群（insight curation / release / rendering triage / test）。

---

## 6. 開発コマンドと検証

| 目的                 | コマンド                                      |
| ------------------ | ----------------------------------------- |
| 開発起動               | `npm start`                               |
| Lint               | `npm run lint`                            |
| 単体テスト              | `npm run test:unit`                       |
| 起動 smoke           | `npm run smoke:launch`                    |
| E2E                | `npm run test:e2e`                        |
| 型検査（全体）            | `npm run typecheck`                       |
| 型検査（critical gate） | `npm run typecheck:critical`              |
| 配布ビルド              | `npm run package` / `npm run make`        |
| ログ確認               | `npm run log:tail` / `npm run log:errors` |

基本方針: コード変更後は `npm.cmd run lint`。pure helper や Action / Command / project state に触れたら `npm.cmd run test:unit`。
起動導線や WebGPU 初期化に触れたら `npm.cmd run smoke:launch`。**最も低く安定した層で検証する**。
通常 typecheck には非 critical の既知エラーが残るため、CI/リリース判定は未定義名参照（TS2304/TS2552）を検出する `typecheck:critical` を blocking gate にする。
