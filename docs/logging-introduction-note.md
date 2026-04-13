# ログ管理導入検討メモ

更新日: 2026-04-13

`MMD_modoki` にアプリ内ログ管理を導入するかを検討するメモです。

表記は `MMD_modoki` に統一する。
ログ出力先やログファイル名でも、可能な範囲で `MMD_modoki` を使い、`MMD modoki` / `mmd-modoki` との表記ブレを減らす。

現時点では、`electron-log` のような Electron 向けの軽量ログライブラリを使い、まずは main / renderer の重要イベントと例外をテキストログとして保存する方針を第一候補にします。

## 背景

v0.1.7 時点では、調査に必要な情報の多くが DevTools の `console.log` やユーザー報告に依存している。

特に次のような報告では、ユーザー環境で何が起きているかをあとから追いにくい。

- カメラ VMD 読み込み時のズレ
- WebM 動画出力が始まらない
- macOS 版で FPS が安定しない
- 物理演算が本家 MMD と違って見える
- カメラが原点から離れたときの描画欠け
- shader / wasm / asset 読み込み失敗

このアプリはまだ実験機だが、フィードバックを取り込む段階では「再現できないがユーザー環境では起きている」問題が増える。
そのため、まずは調査用のログを残せる状態にする価値が高い。

## 目的

ログ導入の目的は、きれいな監査基盤を作ることではなく、ユーザー報告の切り分けを早くすること。

優先したいのは以下。

- 起動時の環境情報を残す
- 読み込み / 再生 / 出力 / 物理 / shader の失敗を残す
- main process と renderer process の例外をファイルに残す
- ユーザーがログフォルダを開ける、または最新ログをコピーできる導線を作る
- debug 用の詳細ログは通常時に出しすぎない

## 候補

### 1. `electron-log`

第一候補。

想定する利点:

- Electron アプリで main / renderer のログを扱いやすい
- ファイル出力、console 出力、ログレベル管理をまとめやすい
- 既存の `console.log` を段階的に置き換えやすい
- まずは小さく導入できる

懸念:

- renderer から直接ファイルログへ書く経路の扱いは preload / IPC 方針と合わせて確認が必要
- 高頻度ログを雑に出すと、描画や再生の調査時に逆にノイズになる
- 個人のファイルパスをログに含める場合は扱いに注意が必要

### 2. 自前のファイル logger

最小実装としては可能だが、優先度は低い。

理由:

- ローテーション、ログレベル、process 跨ぎ、例外捕捉を自前で揃えるほどの価値はまだ薄い
- Electron の配布環境差を考えると、実績のある既存ライブラリに寄せるほうが早い

### 3. SQLite WASM

別メモの通り、観測基盤や入力イベント基盤としては面白い。
ただし今回の「ユーザー報告を切り分けるためのログ」としては重い。

最初は `electron-log` などでテキストログを残し、SQLite WASM は将来の実験基盤として分けて扱う。

## 最初に残したいログ

Phase 1 では、頻度の低い重要イベントに絞る。

### 起動

- アプリ version
- Electron / Chromium / Node version
- OS / arch
- WebGPU 使用可否、実際の backend
- packaged / dev 実行の区別

### 読み込み

- PMX / PMD / VMD / VPD / カメラ VMD / 音声 / 背景画像 / 背景動画 / `.x` / `.glb` の読み込み開始と成功 / 失敗
- ファイルパスは原則フルパスをそのまま出しすぎない
- 失敗時は拡張子、ファイル名、例外名、message、stack を残す

### 再生 / タイムライン

- 再生開始 / 停止
- 最終フレーム到達
- カメラ VMD 読み込み時の duration / 最終キー frame
- 大きな seek、再生終了時の currentFrame

### 出力

- PNG 出力開始 / 成功 / 失敗
- WebM 出力開始 / MediaRecorder codec 判定 / canvas capture 成否 / 保存先決定 / 成功 / 失敗
- 出力中に例外が出た場合の stack

### 物理

- Bullet / Ammo backend の初期化成功 / 失敗
- fallback 発生
- 物理 ON/OFF
- 物理モードや関連フラグの値

### 描画 / shader

- WebGPU / WebGL2 fallback
- shader / WGSL / LUT 読み込み失敗
- 影やポストエフェクトの重大な初期化失敗

## 出しすぎないログ

次のようなログは、通常ログでは避ける。

- 毎フレームの camera / bone / morph 値
- pointer move や slider input の連続ログ
- すべての mesh / material 詳細
- 大量の配列や vertex 情報

必要な場合は debug mode を明示的に ON にして出す。

## UI 導線案

最初の UI は小さくてよい。

- `ログフォルダを開く`
- `最新ログをコピー`
- `デバッグログ ON/OFF`

設定画面がまだないため、当面は上部メニューか既存の情報 / 設定系パネルに仮置きする。
ただし UI が増えすぎるなら、最初は main process のメニューまたは hidden IPC だけでもよい。

## 推奨初期設定

最初の実装では、以下を標準設定として扱う。

### app / path

- 表記は `MMD_modoki` に統一する
- dev と packaged のログは分ける
- repo 配下にはログを書かない
- 実装時は `app.getPath("userData")` 配下に明示的な `logs` ディレクトリを作る

推奨パス:

```txt
{userData}/logs/main.log
{userData}/logs/dev/main-dev.log
```

補足:

- `userData` 自体のディレクトリ名が `MMD modoki` や `mmd-modoki` になる場合は、別途 app name 側の統一も検討する
- ただし既存ユーザーの保存先移動につながる可能性があるため、最初はログファイル名とログ本文の表記統一を優先する

### level

- packaged: `info` 以上
- dev: `debug` 以上
- `trace` 相当の毎フレームログは、通常の debug log には含めない
- `warn` / `error` は dev / packaged の両方で必ず残す

### rotation / retention

初期値は控えめにする。

- packaged: `5MB x 3世代`
- dev: `20MB x 5世代`

`electron-log` の標準設定だけで世代数をきれいに扱いにくい場合は、最初は `maxSize` のみ設定し、世代数制御は後続タスクに回す。
dev はログが増えやすいため、最低でも packaged とは別ファイルにする。

### scope

scope 名は検索しやすい固定文字列にする。

推奨 scope:

- `main`
- `ipc`
- `renderer`
- `asset`
- `camera-vmd`
- `timeline`
- `webm`
- `physics`
- `shader`
- `project`
- `ui`

ログ形式の例:

```txt
[camera-vmd] loaded file=sample.vmd duration=1234 lastCameraFrame=1200
[webm] start width=1920 height=1080 fps=30 codec=video/webm;codecs=vp9
[physics] backend initialized backend=Bullet fallback=false
```

### renderer 経路

恒久実装は `preload.ts` / IPC 経由を推奨する。

理由:

- この repo の Electron 境界設計に合う
- renderer からファイル出力の詳細を隠せる
- ファイルパスのマスクや payload 正規化を main 側に集約しやすい

`electron-log/renderer` の直 import は、早期検証用としては許容する。
ただし本採用時は `window.electronAPI.logInfo` などの薄い API に寄せる。

### payload

ログ payload は JSON 化できる軽量な値に限定する。

推奨:

- `scope`
- `event`
- `sessionId`
- `version`
- `platform`
- `backend`
- `fileName`
- `extension`
- `fileSize`
- `frame`
- `duration`
- `message`
- `error.name`
- `error.message`
- `error.stack`

避ける:

- フルパスの常時出力
- mesh / material / vertex の巨大配列
- 毎フレームの camera / bone / morph 値
- ユーザーの入力文字列をそのまま大量に残すこと

### sessionId

起動ごとに `sessionId` を作り、起動ログと renderer からの重要ログに含める。

形式は UUID でなくてもよい。

例:

```txt
20260413-153012-7f3a
```

ログ調査時に「どの起動セッションの報告か」を切り分けられることを優先する。

## 実装方針案

1. `electron-log` を依存に追加する
2. `src/main.ts` に main process 用 logger 初期化を置く
3. 起動時、window 作成、IPC 失敗、未捕捉例外をログへ流す
4. `preload.ts` に renderer からログを送る最小 API を追加する
5. renderer 側は直接ファイルへ書かず、まずは IPC 経由で main に送る
6. `console.log` の全面置換はしない
7. PMX / VMD / camera VMD / WebM / physics / shader の重要箇所から段階的に置き換える

想定 API:

```ts
window.electronAPI.logInfo(scope, message, data);
window.electronAPI.logWarn(scope, message, data);
window.electronAPI.logError(scope, message, data);
```

`data` は JSON 化できる軽量な値に限定する。
`Error` は `name / message / stack` へ正規化してから送る。

## 導入手順案

### Step 1: 依存追加だけ行う

まずは依存だけ追加し、既存コードの置き換えは急がない。

```bash
npm install electron-log
```

確認すること:

- `package.json` と `package-lock.json` に差分が出ること
- `npm run lint` が通ること
- dev 起動と packaged build の両方で import が壊れないこと

### Step 2: main process の最小ログを作る

最初は `src/main.ts` に限定して導入する。

記録候補:

- app start
- app version
- Electron / Chromium / Node version
- OS / arch
- packaged / dev
- BrowserWindow 作成
- uncaught exception
- unhandled rejection
- IPC handler 内の例外

この段階では renderer の既存 `console.log` は触らない。

ログ出力先は、dev と packaged で分ける。
dev では調査用ログが多くなりやすいため、配布版の通常ログと混ざらないようにする。

方針案:

- app / log 表記は `MMD_modoki` に寄せる
- packaged: `MMD_modoki/logs/main.log`
- dev: `MMD_modoki/logs/dev/main-dev.log` または `MMD_modoki-dev/logs/main.log`
- dev では `debug` まで出してよい
- packaged では通常 `info` 以上に抑える

実装時は `app.getName()` と `log.transports.file.getFile()` の実測値をログへ出し、想定と違う場合は `resolvePathFn` で明示的に揃える。

例:

```ts
log.transports.file.resolvePathFn = () => {
  const fileName = app.isPackaged ? "main.log" : "main-dev.log";
  return path.join(app.getPath("userData"), "logs", fileName);
};

log.transports.file.level = app.isPackaged ? "info" : "debug";
```

### Step 3: renderer からのログ経路を決める

renderer 側は次の 2 案がある。

#### 案 A: `electron-log/renderer` を使う

利点:

- 導入が早い
- `electron-log` の想定経路に乗れる
- 既存 `console.log` から段階的に置き換えやすい

懸念:

- この repo は Electron API を `preload.ts` 経由で出す構造なので、境界設計としては少し直接的になる
- packaged build で renderer IPC transport の挙動を確認する必要がある
- renderer 側から詳細ログを出しすぎると、描画負荷調査時にログ自体がノイズになりうる

#### 案 B: `preload.ts` の `window.electronAPI` 経由で main に送る

利点:

- 既存の IPC 方針に合う
- renderer 側からファイル書き込みの詳細を隠せる
- ログ payload の正規化、ファイルパスのマスク、debug log の ON/OFF を main 側で制御しやすい

懸念:

- 最初の実装量が少し増える
- IPC handler と型定義を追加する必要がある
- 高頻度ログを送ると IPC 負荷になりうるため、呼び出し箇所の制限が必要

現時点のおすすめ:

- 早く調査ログを持つなら案 A
- repo の境界設計に合わせるなら案 B
- 最初の恒久実装としては案 B を優先し、どうしても急ぐ場合だけ案 A で試す

### Step 4: v0.1.7 フィードバックに効く箇所から入れる

優先順:

1. WebM 出力
2. カメラ VMD 読み込み
3. 物理 backend 初期化と fallback
4. WebGPU / WebGL2 backend と shader 読み込み
5. macOS FPS 調査用の起動環境ログ

この段階でも、毎フレーム値や全 mesh / material の詳細は通常ログへ出さない。

### Step 5: ログを開く導線を足す

不具合報告に使うなら、ログファイルが存在するだけでは足りない。

最低限ほしい導線:

- ログフォルダを開く
- 最新ログをコピー
- 最新ログの保存場所を UI に表示する

ただし UI を先に大きく作る必要はない。
最初は main process 側に IPC を用意し、UI 追加は後続でもよい。

## 導入時の懸念

### 1. ログの出しすぎ

描画、物理、タイムラインは高頻度に動く。
毎フレームログを出すと、FPS 低下やログ肥大化の原因になる。

通常ログでは「開始 / 成功 / 失敗 / 状態変化」に絞り、詳細値は debug log に分ける。

### 2. 個人情報とファイルパス

ユーザーのローカルパスにはユーザー名やフォルダ構成が入る。
ログ共有を前提にするなら、通常ログではファイル名、拡張子、サイズ程度に抑える。

フルパスが必要な調査では debug log として明示的に扱う。

### 3. renderer と main の責務境界

renderer から直接 logger を使うと実装は早いが、将来の制御が散らばる可能性がある。

この repo の構造では、renderer は `preload.ts` の `window.electronAPI` 経由で Electron 機能を触る方針に寄せるのが自然。
そのため、長期的には main process 側にログ保存を集約するほうが扱いやすい。

### 4. packaged build でのパス差

dev 起動と packaged build ではログ出力先や権限、パスが変わる可能性がある。

導入時は少なくとも以下を確認する。

- dev 起動でログが出る
- packaged build でログが出る
- dev と packaged のログが混ざらない
- ログ上のアプリ表記が `MMD_modoki` に揃っている
- Windows でログフォルダを開ける
- macOS / Linux では出力先をドキュメント化する

### 5. 既存 `console.log` の扱い

既存の `console.log` は GLB / PMX / shader / debug 用途で点在している。
一度に全部置き換えると差分が大きくなり、今回の目的から外れる。

まずは新規の重要ログだけ `electron-log` に流し、既存の debug log は必要になった箇所から整理する。

## パスと個人情報

ログにはローカルファイルパスが入りやすい。
ユーザーが不具合報告としてログを共有する可能性を考えると、最初から扱いを決めておく。

- 通常ログではフルパスではなくファイル名と拡張子を優先する
- 調査に必要な場合だけ debug log でフルパスを出す
- 共有前にログを確認できる導線を作る
- 将来「ログをコピー」機能を作る場合は、パスの簡易マスクを検討する

## 現時点の結論

ログ管理は今入れる価値がある。

ただし、最初から大きな観測基盤にしない。
`electron-log` を第一候補として、`重要イベントと例外を main process 側でファイル保存する` ところから始める。

v0.1.7 フィードバック対応では、特に次の調査に効く。

- WebM 出力が開始しない原因の把握
- カメラ VMD の duration / 最終フレーム周辺の確認
- macOS 版の FPS 不安定時の backend / 設定差分確認
- 物理 backend と fallback 状態の確認
- shader / asset / wasm の読み込み失敗確認

## 2026-04-13 実装メモ

Phase 1 として以下を実装した。

- `electron-log` を依存に追加
- main process 側で `MMD_modoki` app name のログファイルを設定
- dev は `dev/main-dev.log`、packaged は `main.log` に分離
- dev は `debug` 以上、packaged は `info` 以上
- renderer からは `preload.ts` / IPC 経由で main にログを送る
- `sessionId` を起動ごとに生成してログ payload に含める
- `path` を含む payload key は通常ログで basename / extension に縮約
- `log:getFileInfo` と `log:openFolder` IPC を追加
- renderer の `error` / `unhandledrejection` をログ化
- WebM 出力、カメラ VMD 読み込み、WebGPU fallback、物理 backend 初期化を優先してログ化

### 実装ファイル

- `package.json`
  - `electron-log` を dependencies に追加
- `package-lock.json`
  - `electron-log@5.4.3` を lock
- `src/main.ts`
  - `electron-log/main` を初期化
  - log file 設定、payload sanitization、`sessionId` 付与、未捕捉例外ログを実装
  - renderer から受け取る `log:write` IPC を追加
  - `log:getFileInfo` / `log:openFolder` IPC を追加
  - WebM export window 起動まわりをログ化
- `src/preload.ts`
  - `window.electronAPI.logDebug/logInfo/logWarn/logError` を追加
  - `window.electronAPI.getLogFileInfo/openLogFolder` を追加
- `src/types.ts`
  - `AppLogLevel` / `AppLogScope` / `AppLogData` / `AppLogFileInfo` を追加
  - `ElectronAPI` にログ API を追加
- `src/app-logger.ts`
  - renderer 側の薄い logging helper を追加
  - logging 失敗が editor 挙動を壊さないよう catch する
- `src/renderer.ts`
  - renderer 初期化、未捕捉 error / rejection、WebM exporter のログを追加
- `src/assets/motion-asset-service.ts`
  - カメラ VMD 読み込み開始 / 成功 / 失敗 / 空 camera track をログ化
- `src/mmd-manager.ts`
  - WebGPU fallback と物理 backend 初期化 / fallback をログ化
- `src/ui-controller.ts`
  - WebM 出力開始前、保存先選択後、export window 起動結果をログ化

### 実際のログ出力先

実装では `app.getPath("userData")` を直接使わず、`electron-log` の `resolvePathFn` で `MMD_modoki` 配下へ明示的に固定している。

補足:

- 一度 `variables.libraryDefaultDir` に寄せた実装では、Windows dev 環境で `MMD modoki` 配下にログが出た
- 原因は Electron 側の `app.getPath("userData")` が `productName` 由来の `MMD modoki` を返すため
- 表記統一の方針に合わせるため、Windows / Linux では `variables.appData/MMD_modoki/logs`、macOS では `~/Library/Logs/MMD_modoki` を明示的に使うよう修正した

想定パス:

```txt
Windows packaged: %APPDATA%/MMD_modoki/logs/main.log
Windows dev:      %APPDATA%/MMD_modoki/logs/dev/main-dev.log

macOS packaged:   ~/Library/Logs/MMD_modoki/main.log
macOS dev:        ~/Library/Logs/MMD_modoki/dev/main-dev.log

Linux packaged:   ~/.config/MMD_modoki/logs/main.log
Linux dev:        ~/.config/MMD_modoki/logs/dev/main-dev.log
```

実際の出力先は `log:getFileInfo` IPC で取得できる。
起動時にも `app ready` ログで `logFilePath` を出す。

### 実際の設定値

- app log name: `MMD_modoki`
- dev file: `main-dev.log`
- packaged file: `main.log`
- dev level: `debug`
- packaged level: `info`
- dev max size: `20MB`
- packaged max size: `5MB`
- renderer transport: `preload.ts` / IPC 経由
- `electron-log/renderer` の直 import は未使用
- `electron-log` の `spyRendererConsole` は無効
- `electron-log` の preload injection は無効

注意:

- 「`5MB x 3世代` / `20MB x 5世代`」の世代数制御はまだ未実装
- 現状は `electron-log` の `maxSize` だけ設定している
- `electron-log` 標準の rotation では、基本的に `.old.log` へ退避する挙動になる

### payload sanitization の実情

main process 側で受け取った payload は `sanitizeLogData` を通す。

- key に `path` を含む string は `{ fileName, extension }` に変換する
- 長い文字列は 2000 文字で切る
- 配列は先頭 20 件まで
- object は深さ 3、最大 40 key 程度に抑える
- `Error` は `name / message / stack` に正規化する

これにより通常ログへフルパスを出しにくくしている。
ただし `message` 文字列そのものにユーザーパスを埋め込んだ場合は完全には防げないため、呼び出し側では path を `data` として渡す運用を続ける。

### 確認結果

- `npm.cmd run lint`
  - 成功
  - 既存 warning は多数残るが、error は 0
- `npm.cmd run package`
  - sandbox 内では `spawn EPERM` で失敗
  - 承認付きで再実行して成功
  - main / preload / renderer の production Vite bundle は通った
- `npx.cmd tsc --noEmit`
  - 失敗
  - 既存の型不整合が複数出ている
  - 今回追加したログ API 周辺の型エラーは確認されなかった
- `npm install electron-log`
  - 最初の `npm` は PowerShell の `npm.ps1` execution policy で失敗
  - `npm.cmd install electron-log` は sandbox 内の registry access / cache 書き込みで失敗
  - 承認付きで `npm.cmd install electron-log` を再実行して成功
  - npm audit は既存依存も含めて `43 vulnerabilities` を報告したが、今回は `npm audit fix` は実行していない

まだ未対応:

- ログフォルダを開く UI
- 最新ログをコピーする UI
- debug log の runtime ON/OFF
- 世代数を明示したローテーション制御
- 既存 `console.log` の段階的な整理

## 関連メモ

- [mmd-basic-task-checklist.md](/d:/DevTools/Projects/MMD_modoki/docs/mmd-basic-task-checklist.md)
- [v0.1.7-feedback.md](/d:/DevTools/Projects/MMD_modoki/docs/v0.1.7-feedback.md)
- [sqlite-wasm-experiment-note.md](/d:/DevTools/Projects/MMD_modoki/docs/sqlite-wasm-experiment-note.md)
- [troubleshooting.md](/d:/DevTools/Projects/MMD_modoki/docs/troubleshooting.md)
