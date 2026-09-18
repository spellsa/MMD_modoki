# エラーハンドリング / 例外処理 現状棚卸しメモ

作成日: 2026-06-08

## 目的

ログ再設計と合わせて、MMD_modoki のエラー通知、例外処理、fallback、runtime diagnostic の扱いを整理するための現状メモ。

このメモでは、現行コードの代表的な処理経路を棚卸しし、今後の設計方針をまとめる。実装変更はこのメモの範囲外。

## 現状の catch 分布

`src` 内の `catch` は、おおよそ次のファイルに集中している。

```text
31  src/mmd-manager.ts
29  src/main.ts
 9  src/ui-controller.ts
 8  src/webm-exporter.ts
 5  src/renderer.ts
 4  src/assets/motion-asset-service.ts
 4  src/physics/physics-runtime-controller.ts
 3  src/scene/material-shader-service.ts
 3  src/render/post-process-controller.ts
 2  src/render/frame-graph-post-effects-controller.ts
 2  src/mmd-manager-x-extension.ts
 2  src/ui/background-settings-dialog-controller.ts
 2  src/x-file-loader.ts
 2  src/ui/scene-environment-ui-controller.ts
 2  src/project/project-importer.ts
```

大きく見ると、次の領域が中心。

- main process の IPC / file IO / export window launch
- renderer runtime の初期化、描画、fallback
- PMX / VMD / VPD / camera VMD / audio / X / GLB load
- WebGPU / Frame Graph / PostFX / physics backend
- UI dialog / export / background media
- cleanup や browser API の benign failure

## 現在のエラー経路

### 1. ユーザー通知

主な入口:

```text
MmdManager.onError
UIController.showToast
UIController.setStatus
panel controller の showToast / setStatus
```

例:

- `PMX/PMD load error`
- `VMD load error`
- `Camera VMD load error`
- `Audio load error`
- `PNG export failed`
- `WebM export launch failed`
- `IBL Shadows initialization failed`

現状の特徴:

- asset load 系は `host.onError?.(...)` に寄っている
- UI 操作系は `showToast` / `setStatus` で直接通知している
- fallback 系の一部も `onError` を使っているが、すべてではない

### 2. 永続ログ

主な入口:

```text
logInfo / logWarn / logError
main.ts の writeAppLog
console.error / console.warn
```

現状の特徴:

- `app-logger` 経由と `console.*` が混在している
- main process では `writeAppLog` があるが、IPC file IO の多くは `console.error` 直書き
- camera VMD や physics は比較的 `app-logger` に寄っている

### 3. runtime diagnostic

主な入口:

```text
MmdManager.addRuntimeDiagnostic
MmdManager.consumeRuntimeDiagnosticSummary
```

用途:

- GPU bone texture
- CPU skinning fallback
- Frame Graph fallback
- DoF disabled
- SSAO fallback / disabled
- SSR / volumetric light disabled
- physics model normalization

現状の特徴:

- ユーザーに即時エラーとして出すより、互換性・fallback 状態の要約に向いている
- `Set<string>` で重複を抑える
- UI 側でまとめて消費する経路がある

### 4. fallback / disable

代表例:

- WebGPU initialization failed -> WebGL2
- Bullet MPR failed -> SPR / Ammo fallback
- Frame Graph failed -> Classic PostFX
- SSAO2 failed -> fallback post process
- DoF failed -> disabled
- SSR / Volumetric light failed -> disabled
- WebGPU SDEF CPU skinning fallback

現状の特徴:

- 一部は log + diagnostic + user notification が揃っている
- 一部は `console.warn` + diagnostic のみ
- fallback が「成功した状態」なのか「機能劣化」なのかの分類が明文化されていない

### 5. IPC / file IO result

主に `src/main.ts`。

現状:

- 成功時は値を返す
- cancel / invalid input / missing job は `null` / `false`
- failure も `null` / `false` で返すことが多い
- 一部は `writeAppLog`、多くは `console.error`

課題:

- cancel と failure が同じ `null` になる箇所がある
- renderer 側が「ユーザーがキャンセルした」のか「読み込み失敗した」のかを判別しづらい
- IPC result 型を `{ ok, value, error }` にするかは検討余地がある。ただし既存 UI への影響が広い

### 6. silent ignore / benign failure

代表例:

- pointer capture / release の失敗
- localStorage read failure
- cleanup / dispose / revoke / unlink の失敗
- nearby file search で読めない directory を skip
- logging 自体の失敗

現状の特徴:

- `catch {}` または `catch { // ignore }` がある
- 一部は理由コメントがある
- cleanup 系は silent ignore で妥当なものが多い

課題:

- silent ignore の理由がない箇所は、後から読むと「握りつぶし」か「意図的な無視」か分かりづらい

## エラー分類案

### A. User-visible fatal / blocking

ユーザーの操作が完了できないもの。

例:

- PMX / PMD が読めない
- VMD / VPD / audio が読めない
- project import が失敗
- export launch / save が失敗

原則:

```text
user notification: 必須
app log: 必須
runtime diagnostic: 原則不要
return: null / false / typed failure
```

### B. Recoverable fallback

機能は継続するが、品質や backend が変わるもの。

例:

- WebGPU -> WebGL2
- Frame Graph -> Classic
- Bullet MPR -> SPR / Ammo
- SSAO2 -> fallback
- DoF / SSR / VLS disabled

原則:

```text
user notification: 軽め、または runtime diagnostic summary
app log: 必須
runtime diagnostic: 必須
return: fallback 成功なら継続
```

### C. Compatibility normalization

読み込んだモデルや runtime 状態を補正するもの。

例:

- runtime bone transform stages normalization
- runtime bone evaluation order normalization
- GPU bone texture / CPU skinning fallback

原則:

```text
user notification: 通常は summary
app log: warn/info
runtime diagnostic: あり
return: 継続
```

### D. Developer debug / trace

調査に必要だが通常ユーザーには不要なもの。

例:

- BoneViz overlay target
- GLB import / replacement table
- shader request trace
- keyframe flow

原則:

```text
user notification: なし
app log: debug flag ON の場合のみ
runtime diagnostic: なし
return: 継続
```

### E. Benign cleanup / browser API failure

失敗しても UX やデータに影響が小さいもの。

例:

- `setPointerCapture` / `releasePointerCapture`
- localStorage read
- optional cleanup
- logging failure

原則:

```text
user notification: なし
app log: 原則なし
runtime diagnostic: なし
return: 継続
comment: silent ignore の理由を書く
```

## 現状で良いところ

- `app-logger.ts` に `toLogErrorData` があり、Error の name / message / stack を structured data にできる
- main process の `writeAppLog` は sessionId 付きで sanitize される
- renderer の uncaught error / unhandled rejection は `logError("renderer", ...)` される
- physics / camera-vmd / export UI は正規ログに寄り始めている
- runtime diagnostic は fallback / compatibility の要約に使える

## 現状の課題

- `console.error` と `logError` の二重化、または片方だけの箇所が混在している
- cancel / invalid input / failure が `null` / `false` に混ざる箇所がある
- asset load 系はユーザー通知はあるが、永続ログが `console.error` 直書きに偏る
- fallback 系の通知基準が揃っていない
- `catch {}` の理由が書かれていない箇所がある
- `onError` が「致命的なロード失敗」と「機能劣化 warning」の両方に使われている
- runtime diagnostic と toast / status の責務境界がまだ曖昧

## 方針案

### 1. catch したら分類を決める

新しい `catch` を追加するときは、少なくとも次を決める。

```text
silent ignore
user notification
app log
runtime diagnostic
fallback / disable
return failure
rethrow
```

### 2. エラー通知とログを分離する

- ユーザー通知は短く、次に何が起きたか分かる文言にする
- app log は原因調査用に file path / backend / feature / stack を残す
- runtime diagnostic は「今の実行状態で起きた互換 fallback の要約」に限定する

### 3. IPC は段階的に typed result 化を検討する

影響範囲が大きいため一気に変えない。

候補:

```ts
type IpcResult<T> =
    | { ok: true; value: T }
    | { ok: false; reason: "canceled" | "invalid-input" | "not-found" | "failed"; message?: string };
```

まずは新規 IPC / export 系から適用を検討する。

### 4. asset load 系を正規ログへ寄せる

優先候補:

- `loadPMX`
- `loadVMD`
- `loadVPD`
- `loadMP3`
- `loadX`
- `loadGLB`

load start / complete / failed は `app-logger` へ寄せ、詳細 dump は debug flag 化する。

### 5. fallback 系の標準形を作る

例:

```text
logWarn(scope, "... fallback activated", data)
addRuntimeDiagnostic("...")
fallback state update
```

ユーザーへの即時 toast は、作業を止めるものだけに限定する。

### 6. silent ignore には短い理由を書く

許容例:

```ts
try {
    canvas.releasePointerCapture(pointerId);
} catch {
    // Pointer capture may already be released by the browser.
}
```

避けたい例:

```ts
try {
    riskyOperation();
} catch {
}
```

## 優先作業案

1. asset load 系の `console.error` を `logError` + `onError` に整理する
2. main process の file IPC failure を `writeAppLog("error", "ipc", ...)` に寄せる
3. fallback 系の `console.warn` を `logWarn` + diagnostic に整理する
4. `catch {}` を棚卸しし、benign cleanup には理由コメントを追加する
5. 新規 IPC から typed result を試す
6. AGENTS.md に catch 分類ルールを追記する

## 目標設計案

### 基本方針

エラー処理は「ユーザー体験を止めるか」「処理は継続するが状態が劣化したか」「開発者向け調査情報か」で分ける。

新しい `catch` を書くときは、例外を捕まえること自体より、捕まえた後の出口を先に決める。

出口:

```text
user notification
app log
runtime diagnostic
fallback / disable
return failure
silent ignore
rethrow
```

### 判断表

| 分類 | 例 | ユーザー通知 | app log | runtime diagnostic | 戻り値 / 処理 |
| --- | --- | --- | --- | --- | --- |
| User-visible failure | PMX load failed, export failed | 必須 | error 必須 | 原則なし | `null` / `false` / typed failure |
| Recoverable fallback | WebGPU fallback, Frame Graph fallback | 原則 summary | warn 必須 | 必須 | fallback して継続 |
| Feature disabled | DoF disabled, SSR disabled | 必要なら summary | warn 必須 | 必須 | disabled state へ |
| Compatibility normalization | bone order normalization, CPU skinning fallback | summary 推奨 | info/warn | 推奨 | 継続 |
| User cancel | file dialog canceled | 不要 | info/debug 任意 | 不要 | canceled として返す |
| Invalid input | IPC invalid input, malformed project field | UI次第 | warn/debug | 不要 | invalid として返す |
| Not found | nearby file not found, optional texture missing | UI次第 | debug/warn | 原則不要 | fallback / null |
| Debug trace | GLB dump, BoneViz target | 不要 | debug flag ON のみ | 不要 | 継続 |
| Benign cleanup | pointer capture release, optional dispose | 不要 | 原則不要 | 不要 | 継続、理由コメント |
| Unexpected bug | invariant violation, impossible state | 状況次第 | error 必須 | 不要 | rethrow または failure |

### 標準形

#### Asset load failure

対象:

- PMX / PMD
- VMD / VPD
- camera VMD
- audio
- X / GLB
- texture / LUT

標準形:

```ts
try {
    logInfo("asset", "model load started", { filePath });
    // load...
    logInfo("asset", "model load completed", { filePath, modelName });
    return modelInfo;
} catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logError("asset", "model load failed", {
        filePath,
        ...toLogErrorData(err),
    });
    host.onError?.(`PMX/PMD load error: ${message}`);
    return null;
}
```

ポイント:

- ユーザー通知は短くする
- stack / filePath / backend などは app log に残す
- 詳細 dump は debug flag に分ける

#### Recoverable fallback

対象:

- WebGPU -> WebGL2
- Frame Graph -> Classic
- Bullet MPR -> SPR / Ammo
- SSAO fallback
- DoF / SSR / VLS disabled

標準形:

```ts
catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logWarn("render", "postfx backend fallback activated", {
        requestedBackend,
        fallback: "classic",
        ...toLogErrorData(err),
    });
    this.addRuntimeDiagnostic(`PostFX fallback: ${message}`);
    this.postEffectBackend = "classic";
}
```

ポイント:

- 即時 toast は基本出さない
- runtime diagnostic summary でユーザーが気づけるようにする
- fallback 後の状態を structured data に残す

#### IPC / file IO failure

現行は `null` / `false` が多い。段階的に typed result を検討する。

新規 IPC の候補:

```ts
type IpcResult<T> =
    | { ok: true; value: T }
    | { ok: false; reason: "canceled" | "invalid-input" | "not-found" | "failed"; message?: string };
```

標準形:

```ts
ipcMain.handle("file:readSomething", async (_event, filePath: string): Promise<IpcResult<Buffer>> => {
    if (!filePath || typeof filePath !== "string") {
        return { ok: false, reason: "invalid-input" };
    }
    try {
        return { ok: true, value: await fs.promises.readFile(filePath) };
    } catch (err: unknown) {
        writeAppLog("error", "ipc", "file read failed", {
            filePath,
            ...createLogErrorData(err),
        });
        return { ok: false, reason: "failed", message: err instanceof Error ? err.message : String(err) };
    }
});
```

既存 IPC は影響範囲が広いため、すぐに一括変更しない。まず新規・export 周辺から試す。

#### Silent ignore

silent ignore は許可するが、理由をコメントする。

許可しやすいもの:

- browser が状態により拒否する pointer capture
- optional cleanup
- localStorage read fallback
- logging failure

標準形:

```ts
try {
    canvas.releasePointerCapture(pointerId);
} catch {
    // Pointer capture may already be released by the browser.
}
```

避ける:

```ts
try {
    operationThatMayAffectState();
} catch {
}
```

### `onError` の役割

`onError` は「ユーザーの操作が完了しなかった」ことを伝えるために使う。

向いている:

- model / motion / audio load failed
- export failed
- project import failed
- background media load failed

向いていない、または慎重に使う:

- backend fallback
- optional feature disabled
- debug trace
- compatibility normalization

fallback / disabled は、原則として `runtime diagnostic + logWarn` を優先する。

### runtime diagnostic の役割

runtime diagnostic は「現在の実行環境で起きた互換性対応や機能劣化の要約」として扱う。

向いている:

- WebGPU SDEF CPU fallback
- SSAO fallback
- Frame Graph fallback
- DoF disabled
- physics normalization

向いていない:

- file read failed
- user canceled
- validation error
- debug dump

### log / notification / diagnostic の責務

```text
user notification
  ユーザーが次にどうすればよいか知るための短い文。

app log
  開発者が原因調査するための structured data。

runtime diagnostic
  このセッションで起きた fallback / compatibility adjustment の要約。
```

同じ message を三箇所へそのまま流用しない。用途ごとに情報量を変える。

### 移行ステップ

1. asset load 系を標準形へ寄せる
   - `loadPMX`
   - `loadVMD`
   - `loadVPD`
   - `loadMP3`
   - `loadX`
   - `loadGLB`
2. main process file IPC の failure を `writeAppLog("error", "ipc", ...)` に寄せる
3. fallback 系を `logWarn + runtime diagnostic + state update` に寄せる
4. `onError` を user-visible failure 中心に寄せる
5. silent `catch {}` に理由コメントを追加する
6. 新規 IPC から typed result を試す
7. 既存 IPC は UI 影響を見ながら段階的に移行する

### 完了条件

- asset load failure は user notification と app log の両方に残る
- recoverable fallback は runtime diagnostic に要約される
- `console.error` だけで終わる failure が減る
- `onError` が機能劣化 warning で乱用されない
- cancel / invalid input / actual failure の区別が新規コードでできる
- silent ignore の理由が読める

## AGENTS.md へ反映したいルール案

```text
- 新しい catch を追加するときは、silent ignore / user notification / app log / runtime diagnostic / fallback / rethrow のどれに分類するか決める。
- silent ignore は cleanup や browser API の benign failure に限定し、理由コメントを残す。
- ユーザー通知と永続ログを混同しない。ユーザー通知は短く、永続ログは調査に必要な structured data を残す。
- recoverable fallback は logWarn と runtime diagnostic を基本にし、即時 toast は作業を止めるものに限定する。
- IPC / file IO では、cancel / invalid input / failure をできるだけ区別する。
```
