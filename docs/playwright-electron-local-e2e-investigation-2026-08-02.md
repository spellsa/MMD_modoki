# Playwright Electron ローカル E2E 導入検討

調査日: 2026-08-02

## 結論

Playwright はローカルの Electron アプリも操作できる。MMD_modoki では、既存の
`smoke:launch` を置き換えるのではなく、次のように役割を分けて追加するのがよい。

| 層 | 主な確認対象 | 使用手段 |
| --- | --- | --- |
| 純ロジック | 外部親の行列計算、保存値変換、Action / Command | Vitest |
| runtime smoke | Electron 起動、WebGPU 初期化、GPU validation error、PMX 実読み込み | 既存 `smoke:launch` |
| UI E2E | メニュー、popup、mode 切替、登録操作、保存/読込の画面遷移 | Playwright Electron |
| 見た目・手触り | 描画品質、物理、ボーン操作感 | 当面は手動確認 |

最初の導入対象は Windows ローカルの headed 実行とする。CI、パッケージ済みアプリ、
ピクセル完全一致の画像比較は最初の段階に含めない。

Playwright の Electron 対応は公式 API だが、現在も `_electron` という
**experimental support** である。Electron 40 は公式ページの対応範囲
`v14+` には入るものの、Electron / Playwright 更新時には最小起動テストを再確認する。

この文書は導入判断と実装案をまとめたものである。2026-08-02 に
`@playwright/test 1.62.1` を開発依存へ追加したが、Electron fixture、設定、テストコードは
まだ追加していない。Playwright 管理ブラウザも未ダウンロードである。

## 「ローカルの Playwright」でできること

Playwright Test も Electron も npm の開発依存としてプロジェクト内に置ける。
グローバルインストールやクラウドサービスは不要で、リポジトリの Electron 実行ファイルを
Playwright から起動して操作できる。

Electron 用 API では主に次が使える。

- `electron.launch()` で開発版 Electron を起動する。
- `electronApplication.firstWindow()` で最初の `BrowserWindow` を取得する。
- 通常の Playwright locator で renderer の DOM をクリック・入力・検証する。
- `electronApplication.evaluate()` で main process の Electron API を操作する。
- `page.evaluate()` で renderer process の状態を読み取る。
- screenshot、HTML report、Trace Viewer を失敗調査に使う。

したがって、MMD_modoki のメニューバーや詳細 popup、Model Mode / Camera Mode、
外部親登録の UI 導線は自動化対象にできる。一方、WebGPU の描画が人間の目で良いか、
物理の揺れが自然か、といった評価は別問題である。

## 推奨する導入方法

### 0. 前提環境

Playwright 公式の現行要件は Node.js 22.x / 24.x / 26.x と Windows 11 以降である。
このリポジトリの開発環境は Node.js 24 系、Electron 40.4.1 なので、バージョン条件上は
最小 spike を開始できる。実際の互換は `_electron` の起動テストで確定させる。

### 1. 依存関係

既存プロジェクトへはテストランナー込みの `@playwright/test` だけを追加する。

```powershell
npm.cmd install --save-dev @playwright/test
```

2026-08-02 に `1.62.1` を開発依存として追加済み。

`@playwright/test` は Playwright API とテストランナー、assertion、reporter を含む。
`playwright` を別に重複追加しない。Electron API は次のように同じパッケージから読む。

```ts
import { _electron as electron, expect, test } from "@playwright/test";
```

Electron 専用テストだけなら、Playwright 管理の Chromium / Firefox / WebKit は使わず、
プロジェクトに既にある `electron` パッケージの実行ファイルを起動する。そのため最初の
Electron-only spike ではブラウザバイナリの追加ダウンロードを必須にしない。

後から通常の Chromium ページもテストする場合は、使用するブラウザだけを明示的に入れる。

```powershell
npx.cmd playwright install chromium
```

Playwright 1.38 以降は npm package のインストールだけではブラウザを自動取得しない。
CI で通常ブラウザも使用する場合は `playwright install --with-deps` を別工程に置く。

### 2. 推奨ファイル構成

```text
playwright.config.ts
e2e/
  fixtures/
    electron-app.ts
  launch.spec.ts
  menu-and-popup.spec.ts
  external-parent.spec.ts
scripts/
  electron-test-runtime.mjs
artifacts/
  e2e/
```

`scripts/smoke-launch.mjs` は既に Vite renderer、main、preload の準備と Electron の
直接起動を行っている。この準備処理を `electron-test-runtime.mjs` のような小さい helper に
切り出し、smoke と Playwright fixture から共有するのがよい。

`electron-forge start` を別プロセスで起動して後から接続する方式より、Playwright 自身が
Electron process の生成と終了を所有する方式のほうが、テストごとの隔離と後始末が明確になる。

### 3. 設定例

Electron / WebGPU / test fixture は同時起動でリソースを競合しやすいため、最初は常に
1 worker で直列実行する。

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "artifacts/e2e/report" }],
  ],
  outputDir: "artifacts/e2e/test-results",
  use: {
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
});
```

自動 retry は一時的な不安定さを隠すことがあるため、ローカル導入直後は `0` にする。
CI 導入後に retry を使う場合も、最初の失敗と retry 成功を flaky として追える状態にする。

### 4. 起動 fixture の概略

次の例は、共通 runtime helper が `.vite` build と renderer dev server の準備を済ませ、
renderer URL を環境変数に設定できる状態を前提とした概略である。

```ts
import { _electron as electron, expect, test } from "@playwright/test";
import electronPath from "electron";

test("Electron と主要 UI が起動する", async () => {
  const env = {
    ...process.env,
    MMD_MODOKI_E2E: "1",
    MMD_MODOKI_E2E_USER_DATA_PATH: "<test-specific temp directory>",
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const app = await electron.launch({
    executablePath: electronPath,
    args: ["."],
    cwd: process.cwd(),
    env,
  });

  try {
    const page = await app.firstWindow();
    await expect(page).toHaveTitle(/MMD modoki/i);
    await expect(page.locator("#render-canvas")).toBeVisible();
    await expect(page.getByRole("button", { name: /Effect|エフェクト/ })).toBeVisible();
  } finally {
    await app.close();
  }
});
```

実装時には各 test に起動処理を複製せず、`test.extend()` で `electronApp`、`page`、一時
`userData` を fixture 化する。`finally` 相当の teardown で、成功・失敗に関係なく
Electron process と Vite server を終了する。

## MMD_modoki で必要なテスト用境界

### ready 判定

`did-finish-load` や DOM の `body` 表示だけでは、`MmdManager` と WebGPU runtime の
初期化完了を意味しない。既存 smoke の renderer-ready 判定を共有するか、E2E 時だけ
次のような小さい ready marker を DOM に出す。

```html
<body data-app-ready="true" data-render-engine="WebGPU">
```

テストは固定時間の `waitForTimeout()` ではなく、この marker や目的の UI 状態を
retrying assertion で待つ。アニメーション完了を待つ場合も、可能なら状態変化を観測する。

### selector

優先順は次の通りとする。

1. `getByRole()` と表示名: ユーザーが実際に操作する意味を確認できる。
2. `getByLabel()` / `getByText()`: form や短い文言に使う。
3. `getByTestId()`: canvas、独自 widget、翻訳で表示名が変わる箇所の安定契約に使う。

CSS の階層や `nth-child()` に依存した selector は、レイアウト変更で壊れやすいので避ける。
日本語・英語の両 locale を 1 本の test に詰め込まず、locale ごとの期待値を明示する。

### test-only hook

Babylon runtime の内部状態が必要な場合でも、`MmdManager` 全体を常時 `window` に公開しない。
`MMD_MODOKI_E2E=1` のときだけ、次のような読み取り中心の狭い API を preload 経由で出す。

```ts
type MmdModokiE2EApi = {
  waitForReady(): Promise<{ engine: "WebGPU" | "WebGL" }>;
  getActiveModelSummary(): Promise<{ modelCount: number; activeModelName: string | null }>;
  getExternalParentSummary(): Promise<{ childBone: string; parentModel: string; parentBone: string } | null>;
};
```

production build では hook 自体を作らない。テスト都合で `contextIsolation` や sandbox を
弱めない。

## OS ファイルダイアログ

Playwright は Electron main process から直接 OS へ出る `dialog.showOpenDialog()`、
`showSaveDialog()`、`showMessageBox()` を自動捕捉しない。ファイル選択ダイアログを
マウスで操作しようとせず、テスト開始直後に main process 側を stub する。

```ts
await app.evaluate(({ dialog }, filePaths: string[]) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths });
}, [tofuPath, platePath]);
```

cancel 経路は `{ canceled: true, filePaths: [] }` を返して別 test にする。保存ダイアログも
同様に固定の一時パスへ向ける。fixture はユーザーの Downloads や実プロジェクトを使わず、
リポジトリ管理の test fixture と test ごとの temp directory だけを使う。

この方式なら、今回作成した以下のモデルを外部親 UI テストへ使用できる。

- `test/fixtures/external-parent/tofu.pmx`
- `test/fixtures/external-parent/plate.pmx`

## 外部親登録に当てはめた最初のシナリオ

最初の実用 E2E は、1 本で多くを詰め込まず次の 2 層に分ける。

### UI 導線

```text
アプリ起動
  -> tofu.pmx と plate.pmx の open dialog を stub
  -> UI から 2 モデルを読み込む
  -> 子モデル / センターボーンを選択
  -> 外部親の親モデル / 親ボーンを選択
  -> 登録
  -> UI 表示と project state の要約を検証
```

### runtime の正しさ

UI screenshot の見た目だけで成功にしない。親の移動後に子の world matrix または外部親用の
変換結果が期待値へ変わることを、pure helper の unit test と runtime smoke scenario の
数値で確認する。Playwright は「ユーザー操作が正しい Action / state へ届いたか」の確認に
集中させる。

## 重要な注意点

### Electron Fuse と packaged app

Playwright 公式 Electron API は、起動 timeout が起きる場合に
`FuseV1Options.EnableNodeCliInspectArguments` (`nodeCliInspect`) が `false` でないことを
確認するよう明記している。

MMD_modoki の `forge.config.ts` は本番 packaging でこの fuse を `false` にしている。
したがって次の方針とする。

- 最初は `node_modules/electron` から未パッケージの開発版を起動する。
- Playwright のために本番 fuse を緩めない。
- packaged artifact の E2E が必要になった場合だけ、fuse を有効にした test 専用 package
  profile を別に作る。
- Playwright / Electron 更新時は、まず `launch.spec.ts` だけを実行して transport の互換を
  確認する。

開発版でも起動が timeout する場合は、最初に fuse、`ELECTRON_RUN_AS_NODE`、Vite URL、
main bundle の生成状況を確認する。

### WebGPU と CI

Playwright が window と DOM を操作できても、CI の GPU backend がローカル実機と同じとは
限らない。WebGPU validation error と renderer 安定性の基準は既存 `smoke:launch` に残す。

- Windows ローカル headed を最初の基準環境にする。
- CI へ上げるまでは、Playwright test を release blocking にしない。
- Linux CI で Electron を動かす場合は Xvfb などの仮想 display が必要になる。
- screenshot は失敗時の証拠として保存し、初期段階では pixel diff を合否判定に使わない。
- GPU / 物理 / animation を同時に複数 worker で走らせない。

### 状態の隔離

- test ごとに一意の `userData` directory を使う。
- locale、preferences、最後に開いた path をユーザー環境から引き継がない。
- test は順序に依存させず、必要なモデルと project state を毎回準備する。
- Electron の console、`render-process-gone`、`unresponsive`、アプリログを失敗 artifact に
  含める。
- teardown 失敗時に Electron / Vite の子 process が残らないよう確認する。

### trace と screenshot

標準の `use.trace` は通常 browser fixture を中心に設計されているため、custom Electron
fixture で期待通り自動収集されるかは spike で確認する。必要なら
`electronApp.context().tracing.start()` / `stop()` を fixture の setup / teardown に置く。

失敗 artifact は次の優先順で見る。

1. Playwright assertion と step。
2. renderer / main process の console とアプリログ。
3. screenshot。
4. trace。
5. 既存 smoke result JSON と WebGPU diagnostic。

## 想定コマンド

導入後の npm script 候補:

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:external-parent": "playwright test e2e/external-parent.spec.ts"
  }
}
```

ローカル実行:

```powershell
npm.cmd run test:e2e
npm.cmd run test:e2e:headed
npm.cmd run test:e2e:ui
npx.cmd playwright show-report artifacts/e2e/report
```

`--ui` は test の絞り込み、step の確認、再実行に便利だが、通常の自動確認コマンドは
非対話の `test:e2e` とする。

## 段階的な導入順

### Phase 0: 今回

- 調査結果と方針を文書化する。
- `@playwright/test 1.62.1` を開発依存へ追加する。（完了）
- `THIRD_PARTY_NOTICES.md` に Apache-2.0 として記録する。（完了）
- production code の test hook はまだ追加しない。

### Phase 1: 最小 spike

- `@playwright/test` を追加する。
- `playwright.config.ts` と Electron fixture を追加する。
- 起動、title、canvas、主要 UI 1 箇所、正常終了だけを確認する。
- 開発版 Electron 40 と `_electron` の接続、trace 収集可否を実機確認する。

### Phase 2: 安定した UI 導線

- Effect panel、mode switch、popup の open / close を追加する。
- role / label が使えない独自 widget だけ `data-testid` を追加する。
- 日本語と英語 locale の小さい smoke を分ける。

### Phase 3: 外部親登録

- native open dialog stub を fixture 化する。
- tofu / plate の読み込み、センターボーン選択、外部親登録を UI test にする。
- world matrix / project serialization は unit test と runtime smoke で別に検証する。

### Phase 4: CI は必要になってから

- Windows runner または self-hosted GPU runner で再現性を計測する。
- まず 1 worker、artifact upload、非 blocking で開始する。
- Linux を使うなら Xvfb と GPU backend の差を明示する。
- 十分安定してから blocking check 化を判断する。

## 採用判断

現状は **Phase 1 の最小 spike を行う価値がある**。

理由:

- 既存 smoke では確認できないメニュー、popup、mode switch の自動確認需要が既にある。
- 外部親登録は複数モデル読み込みと UI state の接続を持ち、Playwright と相性がよい。
- tofu / plate の小さいリポジトリ管理 fixture が用意でき、第三者モデルへ依存しない。
- production fuse を変更せず、未パッケージ開発版だけで小さく試せる。

一方、最初から「PMX 描画品質まで完全自動化」「CI で全 OS」「スクリーンショット完全一致」
まで広げるのは避ける。そこまでを Playwright の責務にすると、WebGPU と物理の環境差が
UI 回帰検出を埋もれさせる。

## 公式資料

- [Playwright: Electron API](https://playwright.dev/docs/api/class-electron)
- [Playwright: ElectronApplication API](https://playwright.dev/docs/api/class-electronapplication)
- [Playwright: Installation](https://playwright.dev/docs/intro)
- [Playwright: Locators](https://playwright.dev/docs/locators)
- [Playwright: Auto-waiting / actionability](https://playwright.dev/docs/actionability)
- [Playwright: Continuous Integration](https://playwright.dev/docs/ci)
- [Playwright: Debugging tests / Trace Viewer](https://playwright.dev/docs/debug)
- [Playwright release notes: browser download policy since 1.38](https://playwright.dev/docs/release-notes)
- [Microsoft Playwright repository: `_electron` package export guidance](https://github.com/microsoft/playwright/issues/17234)
- [Electron: Testing on Headless CI Systems](https://www.electronjs.org/docs/latest/tutorial/testing-on-headless-ci)
- [Electron: webContents API](https://www.electronjs.org/docs/latest/api/web-contents/)

## 関連資料

- [Electron ローカル起動スモークテスト方針](./electron-local-smoke-test-plan.md)
- [Electron 起動確認自動化 調査メモ](./electron-launch-test-investigation.md)
- [テスト導入提案](./testing-strategy-proposal.md)
