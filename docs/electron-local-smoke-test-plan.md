# Electron ローカル起動スモークテスト方針

更新日: 2026-04-16

## 目的

`npm start` を手動で実行して、起動を目視確認して、手で閉じる作業を軽くする。

MMD_modoki は Electron / Babylon.js / WebGPU / ファイル読み込みが絡むため、単体テストや lint が通っても「アプリが起動直後に落ちる」回帰は別に起こりうる。  
まずはローカル実機とコーディングエージェントが実行しやすい、軽量な起動スモークテストを用意する。

## 結論

最初は Playwright E2E よりも、**アプリ側の smoke mode + Node 製のローカル起動スクリプト**を優先する。

2026-04-16 時点で、`MMD_MODOKI_SMOKE=1` による smoke mode と `scripts/smoke-launch.mjs` は実装済み。Windows ローカルで `npm.cmd run smoke:launch` が成功し、`engine=WebGPU` が報告されることを確認済み。

このアプリは WebGPU モードでの利用を前提にしているため、ローカル smoke test では **renderer runtime 初期化後の engine が `WebGPU` であること** も成功条件に含める。

目標コマンド:

```powershell
npm.cmd run smoke:launch
```

確認範囲:

- Electron main process が起動する。
- main window が作成される。
- renderer の読み込みが致命的に失敗しない。
- `MmdManager` が初期化される。
- engine が `WebGPU` として報告される。
- 一定時間内に renderer runtime 初期化が完了する。
- smoke mode では自動終了する。

確認しないもの:

- PMX / VMD の実読み込み。
- Babylon.js の描画結果。
- WebGPU / WebGL2 の見た目差分。
- 物理シミュレーションの正しさ。
- UI 操作の手触り。

## なぜ Playwright から始めないか

Playwright Electron は有効だが、最初の一歩としては重い。

- `@playwright/test` の追加が必要。
- CI / agent 環境では Xvfb や GPU なし環境の調整が必要。
- Babylon.js 初期化に依存すると false negative が出やすい。
- 最初に欲しいのは「起動直後に落ちない」の確認であり、DOM 操作までは必須ではない。

そのため、まずは依存追加なしで回せる smoke script を作る。  
Playwright は、この smoke script が安定してから次段階で導入する。

## 全体構成案

### 1. アプリ側 smoke mode

環境変数で smoke mode を有効化する。

```powershell
$env:MMD_MODOKI_SMOKE = "1"
npm.cmd start
```

smoke mode 時の動作:

- main window 作成後、`did-finish-load` だけでは成功にしない。
- renderer から `MmdManager` 初期化完了と engine 種別が通知されるまで待つ。
- engine が `WebGPU` であることを成功条件にする。
- `render-process-gone` / `did-fail-load` / `unresponsive` を失敗条件にする。
- 成功条件到達後、短い猶予を置いて `app.exit(0)` する。
- 一定時間内に成功条件へ到達しなければ `app.exit(1)` する。

イメージ:

```ts
const isSmokeMode = process.env.MMD_MODOKI_SMOKE === "1";

if (isSmokeMode) {
    const timeout = setTimeout(() => {
        app.exit(1);
    }, 15000);

    const finishOk = (): void => {
        clearTimeout(timeout);
        setTimeout(() => app.exit(0), 1000);
    };

    ipcMain.once("smoke:rendererReady", (_event, payload) => {
        if (payload.engine !== "WebGPU") {
            app.exit(1);
            return;
        }
        finishOk();
    });
    mainWindow.webContents.once("did-fail-load", () => app.exit(1));
    mainWindow.webContents.once("render-process-gone", () => app.exit(1));
}
```

注意:

- smoke mode は通常起動に影響しないよう、環境変数があるときだけ動かす。
- 成功条件は「WebGPU runtime 初期化完了」までにする。
- Canvas の見た目や PMX/VMD 読み込みまでは必須にしない。
- 一時的に WebGL fallback でも起動確認したい場合は、`MMD_MODOKI_SMOKE_REQUIRE_WEBGPU=0` を指定して smoke を実行する。

### 2. Node 製 smoke-launch script

Windows / macOS / Linux で環境変数指定を揃えるため、npm script に直接 `MMD_MODOKI_SMOKE=1` を書かず、Node script 側で Vite dev server、main/preload build、Electron 起動をまとめて扱う。

当初は `electron-forge start` を spawn する案だったが、コーディングエージェント環境では `ELECTRON_RUN_AS_NODE` の影響で Electron が Node 実行に寄ることがあった。smoke test は WebGPU 実機起動の確認が目的なので、`scripts/smoke-launch.mjs` では `electron.exe` を直接起動し、`ELECTRON_RUN_AS_NODE` を明示的に除去する。

追加候補:

```text
scripts/smoke-launch.mjs
```

責務:

- Vite dev server を起動する。
- main / preload bundle を development mode でビルドする。
- Electron 実行ファイルを直接起動する。
- `MMD_MODOKI_SMOKE=1` を付与する。
- `MMD_MODOKI_SMOKE_REQUIRE_WEBGPU=1` を既定にする。
- main process が書き出す smoke result JSON を待つ。
- stdout / stderr を親プロセスへ流す。
- result JSON の `success` が `true` なら成功。
- result JSON の `success` が `false` なら失敗。
- 親側 timeout に到達したら子プロセスを kill して失敗。

`package.json` 追加候補:

```json
{
  "scripts": {
    "smoke:launch": "node scripts/smoke-launch.mjs"
  }
}
```

## smoke-launch script の擬似コード

```js
const env = {
  ...process.env,
  MMD_MODOKI_SMOKE: "1",
  MMD_MODOKI_SMOKE_REQUIRE_WEBGPU: "1",
  MMD_MODOKI_SMOKE_RESULT_PATH: resultPath,
};
delete env.ELECTRON_RUN_AS_NODE;

await startViteDevServer();
await buildMainAndPreload();

const child = spawn(electronExecutable, ["."], { env, stdio: "inherit" });
await waitForResultJsonOrTimeout(resultPath);
```

実装時の注意:

- `npm start` ではなく Electron 実行ファイルを直接起動する。
- `ELECTRON_RUN_AS_NODE` が残っていると `require("electron").app` が undefined になり、正しい Electron 起動確認にならない。
- 成功判定は Electron の終了コードだけでなく、main process が書いた result JSON を見る。
- 子プロセス kill は Windows で残プロセスが出ないか確認する。

## コーディングエージェントでの使い方

エージェントがコード変更後に確認する場合:

```powershell
npm.cmd run smoke:launch
```

期待:

- `engine=WebGPU` を含む pass 出力が出て `0` で終了すれば、最低限の WebGPU 起動は成功。
- 非 `0` 終了なら、main / renderer のログを確認する。
- timeout なら、起動が詰まっているか、smoke mode の終了条件が機能していない。

この確認は `npm.cmd run lint` の代替ではなく、追加確認として扱う。

## 導入ステップ

### Step 1: smoke mode の実装（完了）

- `src/main.ts` に `MMD_MODOKI_SMOKE` 判定を追加する。
- main window の初期化後に成功 / 失敗イベントを監視する。
- smoke mode のときだけ自動終了する。

### Step 2: smoke-launch script の追加（完了）

- `scripts/smoke-launch.mjs` を追加する。
- `package.json` に `smoke:launch` を追加する。
- Windows ローカルで `npm.cmd run smoke:launch` を確認する。

### Step 3: AGENTS.md / docs への反映

- 確認コマンドは基本 `npm.cmd run lint` のままにする。
- 起動に関わる変更では `npm.cmd run smoke:launch` も推奨する、と追記する。

### Step 4: Playwright へ拡張

smoke script が安定してから、必要に応じて Playwright Electron を追加する。

Playwright で追加確認したいもの:

- window title。
- `#render-canvas` の存在。
- console error / pageerror の収集。
- 初期画面の主要ボタンの存在。

## 失敗時に見るログ

- terminal の stdout / stderr。
- Electron main process のログ。
- `electron-log` の保存先ログ。
- renderer console error。

将来的には smoke mode 失敗時にログファイルパスを stdout へ出すと、エージェントが原因を追いやすい。

## 関連ドキュメント

- [Electron 起動確認の自動化調査](electron-launch-test-investigation.md)
- [テスト手法導入検討メモ 2026-04-13](testing-strategy-note-2026-04-13.md)
- [テスト導入提案](testing-strategy-proposal.md)
