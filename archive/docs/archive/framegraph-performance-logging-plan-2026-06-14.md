# FrameGraph 性能測定ログ実装案 2026-06-14

## 目的

FrameGraph / PostFX の効率化を始める前に、現行のまま測定できるログを整える。

このメモでは、既存の app log / performance log / debug flag の運用に合わせて、FrameGraph 用の測定ログをどこに、どの粒度で追加するかを整理する。

関連メモ:

- [logging-introduction-note.md](./logging-introduction-note.md)
- [logging-redesign-inventory-2026-06-08.md](./logging-redesign-inventory-2026-06-08.md)
- [v0.2-render-performance-measurement-2026-04-28.md](./v0.2-render-performance-measurement-2026-04-28.md)
- [framegraph-current-resource-inventory-2026-06-14.md](./framegraph-current-resource-inventory-2026-06-14.md)
- [framegraph-resource-efficiency-plan-2026-06-14.md](./framegraph-resource-efficiency-plan-2026-06-14.md)

## 既存ログの前提

### app log

renderer からは `src/app-logger.ts` の helper 経由で main process へ送る。

```ts
logDebug(scope, message, data)
logInfo(scope, message, data)
logWarn(scope, message, data)
logError(scope, message, data)
logDebugIfEnabled(key, scope, message, data)
```

`AppLogScope` には現在 `performance` / `render` / `shader` などがある。`postfx` は scope ではなく debug flag key。

### debug flag

`src/app-logger.ts` の `isDebugLogEnabled()` は localStorage を見る。

```text
mmd_modoki.debug.performance
mmd_modoki.debug.postfx
```

FrameGraph の詳細構成ログは `mmd_modoki.debug.postfx`、時間集計は既存の `framePerfLog` に寄せる。

### frame performance log

`MmdManager.FRAME_PERFORMANCE_LOG_STORAGE_KEY` は次の localStorage key。

```text
mmd_modoki.framePerfLog
```

有効時のみ `SceneInstrumentation` を作り、10 秒ごとに `performance` scope へ `frame performance sample` を出す。

既存 sample には次が含まれる。

- `frameTotal`
- `sceneRender`
- `manualPlayback`
- `motionBlur`
- `backgroundVideo`
- `cameraMotionToViewport`
- `viewportCameraInput`
- `boneGizmo`
- `boneVisualizer`
- `rigidBodyVisualizer`
- `editorDof`
- `frameStateUpdate`
- `sceneInstrumentation.renderTargetsRenderTime`
- `sceneInstrumentation.renderTime`
- `sceneInstrumentation.cameraRenderTime`
- `sceneInstrumentation.drawCalls`

## 現状の不足

既存の `frame performance sample` だけでも「render target 全体が重い」「sceneRender が重い」は見える。

ただし、FrameGraph / PostFX 最適化には次が足りない。

- FrameGraph backend が有効か
- FrameGraph task が ready か
- UI stack order
- active effect 一覧
- resource requirement 一覧
- geometry renderer が作られた理由
- DepthRenderer depth と geometry depth の両方があるか
- Luminous mask RT があるか
- Luminous mask が何 submesh 描いたか
- Luminous blur kernel
- scene color / luminous mask RT のサイズ
- FrameGraph controller の実行回数
- effect order 変更などで backend rebuild が発生した回数

これらは per-frame に出すとログが壊れるため、10 秒ごとの performance sample に summary として載せる。

## ログ設計

### 1. 通常 performance sample に FrameGraph summary を追加

`logFramePerformanceSample()` の payload に `frameGraphPostEffects` を追加する。

```ts
frameGraphPostEffects: {
    backend: "classic" | "frameGraph";
    active: boolean;
    ready: boolean;
    executedFrameCount: number;
    stack: string[];
    activeEffects: string[];
    resources: {
        sceneColor: boolean;
        depthScene: boolean;
        viewDepth: boolean;
        viewNormal: boolean;
        reflectivity: boolean;
        luminousMask: boolean;
    };
    renderTargets: {
        sceneColor?: { width: number; height: number };
        luminousMask?: { width: number; height: number };
    };
    luminousMaskRenderedSubMeshes: number;
}
```

この summary は `mmd_modoki.framePerfLog=true` のときだけ出るため、通常操作のログノイズは増えない。

### 2. FrameGraph 構築時に postfx debug summary を出す

`mmd_modoki.debug.postfx=true` のときだけ、backend activate / ready / rebuild 時に構成ログを出す。

scope は `render` のままにする。

```text
logDebugIfEnabled("postfx", "render", "frame graph post effect resource plan", {
  stack,
  activeEffects,
  requirements,
  needsGeometryRenderer,
  needsDepthRenderer,
  needsLuminousMask,
  renderTargetSize,
})
```

目的:

- performance sample より詳細に見る
- ただし per-frame には出さない
- リソース plan 実装前でも、現行の settings / effectOrder から作れる範囲で出す

### 3. rebuild reason を数える

FrameGraph backend の dispose / initialize が走る理由を最小限で記録する。

候補:

```ts
type FrameGraphRebuildReason =
    | "backend-enable"
    | "effect-order-change"
    | "resize"
    | "backend-refresh"
    | "unknown";
```

ただし最初から全経路を大きく変えない。

まずは既存の再初期化ポイントに軽く reason を渡すか、内部カウンタを増やすだけにする。

重要な再初期化経路:

- `initializePostEffectBackend()`
- `refreshFrameGraphPostEffectsBackendAfterResize()`
- `refreshFrameGraphPostEffectsBackendForOrderChange()`
- `disposeFrameGraphPostEffectsController()`

## 実装案

### Phase 1: 現行構造のまま summary を出す

挙動変更なしで、`MmdManager` 側に snapshot helper を追加する。

```ts
private getFrameGraphPostEffectsPerformanceSnapshot(): Record<string, unknown> {
    return {
        backend: this.postEffectBackend,
        active: this.postEffectBackend === "frameGraph" && this.frameGraphPostEffectsController !== null,
        ready: this.frameGraphPostEffectsController?.isReady() ?? false,
        executedFrameCount: this.getFrameGraphPostEffectsExecutedFrameCount(),
        stack: [...this.getFrameGraphPostEffectRuntimeOrder()],
        activeEffects: this.getActiveFrameGraphPostEffectIds(),
        renderTargets: ...
        luminousMaskRenderedSubMeshes: this.getFrameGraphPostEffectsLuminousMaskRenderedSubMeshCount(),
    };
}
```

必要になる小変更:

- `FrameGraphPostEffectsController` に `isReady()` / `isActive()` か `getDiagnosticsSnapshot()` を追加
- `MmdManager` 側で sceneColor / luminousMask RT のサイズを読む
- `logFramePerformanceSample()` に snapshot を追加

この段階では resource plan はまだ不要。

### Phase 2: ResourcePlan helper を追加

`framegraph-resource-efficiency-plan-2026-06-14.md` の通り、pure helper を追加して unit test する。

```text
settings + effectOrder
  -> active effects
  -> resource requirements
  -> needsGeometryRenderer / needsDepthRenderer / needsLuminousMask
```

`FrameGraphPostEffectsController.activate()` と `MmdManager.getFrameGraphPostEffectsPerformanceSnapshot()` の両方で同じ helper を使えるようにする。

### Phase 3: postfx debug に構築時 summary を追加

`mmd_modoki.debug.postfx=true` のときだけ、FrameGraph activate 時に resource plan を出す。

通常の `performance` sample には summary、`postfx` debug には構築詳細、という役割分担にする。

### Phase 4: rebuild counter を追加

FrameGraph rebuild が FPS 低下や一瞬の固まりに効いている可能性があるため、10 秒 sample に次を追加する。

```ts
rebuild: {
    countSinceLastSample: number;
    totalCount: number;
    lastReason: string | null;
}
```

最初は `resize` / `effect-order-change` / `backend-enable` くらいで十分。

## 取得したい比較軸

ログを取るときは、最低限この条件を揃える。

```text
Backend:
  classic
  frameGraph

Effects:
  none
  luminous only
  luminous + bloom
  luminous + bloom + LUT
  SSAO
  SSR
  DoF
  all common stack

Scene:
  model only
  model + stage
  model + AutoLuminous stage

Resolution:
  1080p
  4K export / preview equivalent
```

重要なのは絶対値より差分。

## ログ確認コマンド

既存 script を使う。

```powershell
npm.cmd run log:errors
node scripts/show-app-log.mjs --latest-session --scope performance --lines 120
node scripts/show-app-log.mjs --latest-session --scope render --lines 120
```

有効化:

```js
localStorage.setItem("mmd_modoki.framePerfLog", "true");
localStorage.setItem("mmd_modoki.debug.postfx", "true");
```

無効化:

```js
localStorage.setItem("mmd_modoki.framePerfLog", "false");
localStorage.setItem("mmd_modoki.debug.postfx", "false");
```

## 注意点

- per-frame にログを出さない。
- mesh / material / submesh の詳細一覧を通常ログへ出さない。
- Luminous mask の submesh 数は count だけにする。
- frame performance sample は 10 秒ごとを維持する。
- `performance` scope は測定値、`render` scope + `postfx` debug は構成詳細に分ける。
- warning / error ではない性能ログを `logWarn` にしない。
- WebGPU timestamp query など GPU 実時間計測は v1 では入れない。まず CPU 側と Babylon `SceneInstrumentation` の範囲で見る。

## 最初の実装単位

最小実装は次。

```text
1. FrameGraphPostEffectsController に readonly snapshot getter を追加
2. MmdManager に frameGraphPostEffects performance snapshot を追加
3. frame performance sample payload に snapshot を追加
4. postfx debug ON 時だけ activate summary を出す
5. docs にログ確認手順を追記
```

この単位なら、描画経路や task 構成を変えずに現行性能を測れる。

## まとめ

FrameGraph 効率化の前段として、まず既存 `mmd_modoki.framePerfLog` に FrameGraph summary を足す。

詳細な構成は `mmd_modoki.debug.postfx` で `render` scope に出し、通常の performance sample は 10 秒ごとの軽量集計に留める。

これで、Luminous / SSAO / SSR / DoF / effect order / rebuild のどれが重いかを、実装変更前後で比較しやすくなる。

## 2026-06-14 実装メモ

最小実装として、現行描画経路を変えずに次を追加した。

- `FrameGraphPostEffectsController.getDiagnosticsSnapshot()`
- `FrameGraphPostEffectsController.isActive()`
- `FrameGraphPostEffectsController.isReady()`
- `frame performance sample` への `frameGraphPostEffects` summary 追加
- `mmd_modoki.debug.postfx=true` 時の FrameGraph activate snapshot debug log

`frameGraphPostEffects` summary には次を含める。

- backend / requestedBackend
- active / ready
- executedFrameCount
- stack / activeEffects
- sceneColor / depthScene / luminousMask / viewDepth / viewNormal / reflectivity の有無
- sceneColor / luminousMask render target size
- luminousMaskRenderedSubMeshes
- controller 内 task / resource / luminous blur kernel snapshot

まだ入れていないもの:

- rebuild count / reason
- ResourcePlan helper
- GPU timestamp query
- task 単位の GPU 実時間
