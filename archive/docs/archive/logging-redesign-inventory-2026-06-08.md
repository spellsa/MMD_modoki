# ログ再設計 現状棚卸しメモ

作成日: 2026-06-08

## 目的

不具合修正や描画調査のたびに追加された `console.*` / debug flag / app log を整理し、次の調査で使いやすいログ設計に寄せるための現状メモ。

今回のメモでは、まず現行コードにどんなログが入っているかを棚卸しする。実装変更はこのメモの範囲外。

## 既存の正規ログ経路

`src/app-logger.ts` に renderer から main process へログを書き込む経路がある。

- renderer 側: `logDebug` / `logInfo` / `logWarn` / `logError`
- preload 側: `window.electronAPI.log*`
- main 側: `ipcMain.on("log:write", ...)`
- 保存先: `electron-log`
- main 側では `sanitizeLogText` / `sanitizeLogData` で文字列長、配列長、object 深さを制限している
- `log.initialize({ preload: false, spyRendererConsole: false })` なので、renderer の `console.*` は自動では拾わない

現在の `AppLogScope`:

```text
main
ipc
renderer
asset
camera-vmd
timeline
webm
physics
render
shader
project
ui
```

## 現状のログ分布

`src` 内の `console.*` 直書きは、おおよそ次の分布だった。

```text
24  src/main.ts
18  src/mmd-manager-x-extension.ts
12  src/mmd-manager.ts
10  src/renderer.ts
 5  src/assets/model-asset-service.ts
 4  src/assets/motion-asset-service.ts
 4  src/physics/physics-runtime-controller.ts
 3  src/ui-controller.ts
 3  src/render/post-process-controller.ts
 2  src/x-file-loader.ts
 2  src/editor/bone-visualizer-controller.ts
 2  src/physics/physics-model-controller.ts
 1  src/render/ssao-controller.ts
 1  src/render/frame-graph-post-effects-controller.ts
 1  src/scene/material-shader-service.ts
```

`app-logger` 経由のログは、おおよそ次の分布だった。

```text
18  src/mmd-manager.ts
10  src/renderer.ts
 9  src/physics/physics-runtime-controller.ts
 8  src/ui/export-ui-controller.ts
 5  src/assets/motion-asset-service.ts
```

## ログの種類別メモ

### 起動 / IPC / export 系

主に `src/main.ts` と `src/renderer.ts`。

- main process の app lifecycle は `writeAppLog` で記録されている
- smoke test 用の `console.log("[smoke] ...")` がある
- IPC handler の失敗は `console.error` が多い
- renderer 初期化や WebM export は `app-logger` と `console.error` が混在している

整理方針:

- main process 内は renderer 用 `app-logger` ではなく `writeAppLog` が正規経路
- smoke test の標準出力は CI / script 向けなので、通常 app log とは別扱いでよい
- IPC failure は `scope: "ipc"` へ寄せる候補

### PMX / VMD / audio load 系

主に `src/assets/model-asset-service.ts` と `src/assets/motion-asset-service.ts`。

- PMX load は `console.log("[PMX] Loading...")`、`ImportMeshAsync result`、`MmdModel created`、`Model info` が常時出る
- PMX failure は `console.error` と `onError`
- motion / camera VMD は一部 `logInfo("camera-vmd", ...)` に寄っているが、VMD / pose / audio failure は `console.error` 直書きが残る

整理方針:

- model / motion load は `scope: "asset"` か、scope を増やして `model` / `motion` へ分ける
- load start / complete / failed は正規ログとして残す
- `ImportMeshAsync result` や detailed `Model info` は debug level または debug flag へ寄せる

### GLB / X accessory 系

主に `src/mmd-manager-x-extension.ts`。

現状の目立つ点:

- `GLB_DEBUG_FORCE_NEON_MATERIAL = true`
- `GLB_DEBUG_SHOW_BOUNDING_BOX = true`
- `GLB_DEBUG_DUMP_IMPORT = true`
- `console.groupCollapsed`
- `console.table`
- replacement / import row dump

整理方針:

- `.x` / GLB は PMX と前提が違う拡張経路なので、`scope: "asset"` だけでは粗い可能性がある
- `accessory` scope 追加を検討する
- 常時 `true` の debug flag は、localStorage / preferences / explicit debug mode へ移す
- table dump は通常ログへ流さず、debug flag ON のときだけ renderer console に出すか、サイズ制限された structured log に変換する

### Render / shader / Frame Graph / PostFX 系

主に `src/mmd-manager.ts`、`src/render/*`。

- WebGPU fallback / selected renderer は `console.info` と `logInfo("shader", ...)` が併用されている
- Frame Graph backend は `console.info` と `logInfo("render", ...)` が併用されている
- LUT / SSR / SSAO / volumetric light failure は `console.warn` と runtime diagnostic が中心
- Frame Graph / PostFX と editor overlay / gizmo の描画順は、今回の不具合原因になった

整理方針:

- renderer / shader / post effect backend selection は正規ログとして `shader` / `render` scope に寄せる
- `console.info` 併用は dev console で見たいものだけに限定する
- pipeline failure は `logWarn("render", ...)` + `addRuntimeDiagnostic` の形を基本にする
- overlay / gizmo / utility layer 関連は、PostFX 最終出力後の上書きリスクをログまたは確認項目として残す

### Physics 系

主に `src/physics/*` と `src/mmd-manager.ts`。

- physics backend initialization は `logInfo("physics", ...)`
- Bullet / Ammo fallback は `console.warn` と `logWarn("physics", ...)`
- performance sample は `logInfo("physics", ...)`
- PMX runtime bone normalization は `console.warn` と `addRuntimeDiagnostic`

整理方針:

- fallback / failure は正規ログ + diagnostic の併用でよい
- per-frame / performance sample は設定 ON のときだけ出す
- PMX bone normalization は `scope: "physics"` または `scope: "asset"` のどちらに置くか決める

### UI / timeline / keyframe 系

主に `src/ui-controller.ts`。

- `KeyframeFlow` が `console.info` 直書き
- waveform refresh failure は `console.warn`
- export UI は `app-logger` に寄っている

整理方針:

- keyframe / action / timeline の調査ログは `scope: "timeline"` に寄せる
- flow trace は default OFF の debug flag にする

### Editor overlay / bone visualizer / gizmo 系

主に `src/editor/bone-visualizer-controller.ts` と `src/mmd-manager.ts`。

- `BoneViz Overlay target` が `console.log` 直書きで出る
- bone gizmo の状態ログはほぼない
- 今回、Frame Graph PostFX 後に utility layer が上書きされ、リサイズ中だけギズモが見える症状が出た

整理方針:

- overlay target dump は debug level または explicit overlay debug flag へ移す
- gizmo attach / detach / selected bone missing などは、調査用に structured debug log があると便利
- PostFX と overlay の描画順は regression point として扱う

## 現状の課題

- `console.*` 直書きと `app-logger` が混在している
- 同じイベントが `console.info` と `logInfo` の両方へ出る箇所がある
- GLB / BoneViz / PMX load result など、調査用ログが常時出る
- `console.table` / large row dump は log file へ寄せにくい
- scope が一部粗い。特に `asset` は PMX / VMD / X / GLB を全部含むには広すぎる
- renderer console と log file の役割分担が明文化されていない
- 不具合修正後に追加ログを残す / flag 化する / 削除する判断基準がない

## 再設計案

### 1. ログ種別を分ける

```text
operational
  起動、backend selected、load start/complete/failed、export start/complete/failed

diagnostic
  fallback、runtime compatibility fix、PostFX backend fallback、physics normalization

debug trace
  keyframe flow、bone overlay target、GLB import/replacement dump、shader request trace

performance
  frame time、physics time、export timing
```

### 2. scope を少し増やす案

現行 scope に加えて、必要なら以下を検討する。

```text
model       PMX / PMD load, material compatibility, bone metadata
motion      VMD / VPD / audio load
accessory   X / GLB accessory load and placement
overlay     bone visualizer, gizmo, editor overlay
postfx      Frame Graph / classic post effects, LUT, SSAO, SSR, DoF
```

ただし scope を増やしすぎると検索しづらくなるため、最初は `asset` / `render` の中で message convention を整えるだけでもよい。

### 3. debug flag の入口を統一する

候補:

```text
localStorage:
  mmd_modoki.debug.modelLoad
  mmd_modoki.debug.accessoryLoad
  mmd_modoki.debug.overlay
  mmd_modoki.debug.keyframeFlow
  mmd_modoki.debug.shaderTrace
```

方針:

- default OFF
- dump / table / per-frame に近いものは必ず flag で守る
- debug flag の読み取り helper を 1 箇所に置く

### 4. `console.*` の扱い

- 一時調査中は `console.*` を使ってよい
- 残す場合は、作業完了時に以下のどれかへ分類する
  - `app-logger` へ移す
  - debug flag で守る
  - smoke / script 用 stdout として残す
  - 削除する

### 5. 実装の進め方

1. `src/app-logger.ts` に debug flag helper または `isDebugLogEnabled(scope)` を追加するか検討する
2. `src/assets/model-asset-service.ts` の PMX load logs を `app-logger` に寄せる
3. `src/editor/bone-visualizer-controller.ts` の `BoneViz` logs を debug flag 化する
4. `src/mmd-manager-x-extension.ts` の `GLB_DEBUG_*` を localStorage / preferences 化する
5. `renderer.ts` の shader trace と export failure logs を正規ログ / debug trace に整理する
6. `main.ts` の IPC failure logs を `scope: "ipc"` の `writeAppLog` へ寄せる

## AGENTS.md へ反映したいルール案

```text
- 新しい debug log を足す前に、既存の logger / scope / debug flag で表現できるか確認する。
- `console.log` 直書きは一時調査用途に限定し、残す場合は `app-logger` または明示的 debug flag に寄せる。
- 大量ログ、table dump、per-frame log は default OFF にする。
- 不具合修正後は、追加した調査ログを「残す / flag 化する / 削除する」で見直す。
- renderer console と log file の役割を分ける。ユーザー報告に必要なものは log file、開発中の一時観察は console に置く。
```

## 目標設計案

### 基本方針

ログは「あとで不具合を再現・切り分けるための記録」として扱う。開発中に一時的に見るための `console.*` と、ユーザー報告やログファイル確認に使う app log を分ける。

目標:

- 通常操作中の DevTools console を静かにする
- ユーザーからログファイルを受け取ったとき、ロード失敗 / backend fallback / export failure が追える
- 調査ログは default OFF だが、必要なときにカテゴリ単位で有効化できる
- 大量 dump は通常ログへ流さず、明示 debug mode の時だけ出す
- エラー処理の結果とログの level / scope が対応している

### ログ level の使い分け

```text
debug
  調査時だけ必要な詳細。dump、table、flow trace、overlay target、shader request。

info
  正常な状態遷移。app start、renderer initialized、backend selected、asset load completed、export completed。

warn
  継続可能な異常。fallback activated、feature disabled、missing optional asset、compatibility normalization。

error
  操作失敗または継続不能な異常。asset load failed、IPC failed、export failed、renderer init failed。
```

### scope 設計

最初から細かく増やしすぎず、以下の段階で進める。

第 1 段階では既存 scope を活かす。

```text
asset
  PMX / PMD / VMD / VPD / audio / X / GLB load

render
  Frame Graph / PostFX / SSAO / SSR / DoF / LUT / overlay描画順

shader
  WebGPU / WebGL / WGSL / shader request

physics
  backend init / fallback / runtime normalization / performance

timeline
  keyframe flow / action / command / track

ui
  dialog / panel / user operation failure

ipc
  main process file IO / dialog / export window launch
```

第 2 段階で必要なら scope を増やす。

```text
model
motion
accessory
overlay
postfx
```

ただし、scope を増やす前に message prefix と structured data で足りるか確認する。

### message 命名

ログ message は検索しやすい短い英語に寄せる。

例:

```text
model load started
model load completed
model load failed
motion load failed
accessory import debug dump
postfx backend fallback activated
overlay utility layer rendered after postfx
ipc file read failed
```

避けたいもの:

```text
Failed
debug
test
謎の一時メモ
```

### structured data の基本形

ログ本文に長い情報を埋め込まず、data に分ける。

共通候補:

```ts
{
    filePath?: string;
    fileName?: string;
    modelName?: string;
    feature?: string;
    backend?: string;
    fallback?: string;
    reason?: string;
    engine?: string;
    frame?: number;
    count?: number;
    error?: {
        name?: string;
        message: string;
        stack?: string;
    };
}
```

巨大配列、mesh row dump、material dump は通常 data に入れない。必要なら debug flag ON のときだけ、件数制限・深さ制限された形で出す。

### debug flag 設計

debug flag は localStorage を第一候補にする。Preferences UI への露出は後で検討する。

候補:

```text
mmd_modoki.debug.modelLoad
mmd_modoki.debug.motionLoad
mmd_modoki.debug.accessoryLoad
mmd_modoki.debug.overlay
mmd_modoki.debug.keyframeFlow
mmd_modoki.debug.shaderTrace
mmd_modoki.debug.postfx
```

helper 案:

```ts
export function isDebugLogEnabled(key: string): boolean {
    try {
        const raw = globalThis.localStorage?.getItem(`mmd_modoki.debug.${key}`) ?? "";
        return raw === "1" || raw.toLowerCase() === "true";
    } catch {
        return false;
    }
}
```

ログ helper 案:

```ts
export function logDebugIfEnabled(
    key: string,
    scope: AppLogScope,
    message: string,
    data?: AppLogData,
): void {
    if (!isDebugLogEnabled(key)) return;
    logDebug(scope, message, data);
}
```

### console と app log の役割分担

```text
app log
  ユーザー報告、再現調査、CI/smoke結果確認に必要なもの。

renderer console
  開発中の一時観察、table dump、視覚調査の補助。

main stdout
  smoke script や起動スクリプトが直接読むもの。
```

残してよい `console.*`:

- smoke test 用 stdout
- 一時調査中の仮ログ
- debug flag ON のときだけ出る `console.table`

残す前に見直す `console.*`:

- load completed の常時 `console.log`
- fallback の常時 `console.warn`
- error を `console.error` だけに出して app log に残さないもの

### 移行ステップ

1. `app-logger.ts` に debug flag helper を追加する
2. PMX / VMD / VPD / audio / X / GLB の load started / completed / failed を app log に寄せる
3. PMX `ImportMeshAsync result`、`Model info`、BoneViz target、GLB dump を debug flag 化する
4. main process の file IO failure を `writeAppLog("error", "ipc", ...)` に寄せる
5. shader trace / keyframe flow を debug flag 化する
6. fallback 系を `logWarn + runtime diagnostic` の標準形へ寄せる
7. console 直書きが必要なものだけを明示的に残す

### 完了条件

- 通常起動とモデル読み込みで DevTools console に調査 dump が常時出ない
- asset load failure は log file と UI 通知の両方で追える
- fallback は log file と runtime diagnostic に残る
- table dump / per-frame trace は default OFF
- 新規ログ追加時に scope / level / user notification の判断が迷いにくい
