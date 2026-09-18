# babylon-mmd MultiPhysicsRuntime Worker対応 実装計画書

更新日: 2026-04-21

## 目的

MMD_modokiにおいて、babylon-mmdの`MultiPhysicsRuntime`のWorker対応機能を導入し、物理シミュレーションの並列化によるパフォーマンス改善を図る。本ドキュメントでは、技術詳細、実装難易度、具体的な手法をまとめる。

## 1. 現状分析

### 1.1 現在のMMD_modoki物理実装

- **使用ライブラリ**: babylon-mmd v1.1.0
- **現行バックエンド**: `MmdWasmInstanceTypeSPR` (Single Physics Release) - シングルスレッド版
- **初期化経路**: `src/mmd-manager.ts:3036-3047` の `initializeBulletPhysicsBackend()`
- **実装状態**:
  - Bullet物理エンジンはWASMで動作
  - 物理シミュレーションがメインスレッドで同期実行
  - フォールバック: Bullet失敗時はAmmo.jsに切り替え

```typescript
// 現在の実装 (src/mmd-manager.ts:3036-3047)
private async initializeBulletPhysicsBackend(): Promise<void> {
    const wasmInstance = await loadSprWasmInstance();
    const runtime = new MultiPhysicsRuntime(wasmInstance);
    runtime.register(this.scene);

    this.bulletPhysicsRuntime = runtime;
    this.physicsPlugin = null;
    this.physicsRuntime = new MmdBulletPhysics(runtime);
    (this.mmdRuntime as unknown as { _physics: MmdBulletPhysics | null })._physics = this.physicsRuntime;
    this.physicsBackend = "bullet";
    this.applyPhysicsSimulationRate();
}
```

### 1.2 パフォーマンス上の課題

- 重いシーン（複数モデル、多数の剛体）でメインスレッドが物理計算でブロックされる
- 物理計算中はUIイベント処理やレンダリング準備が滞る
- 60fps維持が困難なケースが存在

## 2. babylon-mmdのWorker対応機能

### 2.1 提供されるインスタンスタイプ

babylon-mmdは複数の物理ランタイムインスタンスタイプを提供:

| インスタンスタイプ | スレッド | 物理 | 要件 | 用途 |
|-------------------|---------|------|------|------|
| `MmdWasmInstanceTypeSPR` | Single | ✅ | WebAssembly | 現行使用中 |
| `MmdWasmInstanceTypeMPR` | **Multi** | ✅ | WebAssembly + SharedArrayBuffer + COOP/COEP | **Worker対応版** |
| `MmdWasmInstanceTypeSingleDebug` | Single | ❌ | WebAssembly | デバッグ用 |
| `MmdWasmInstanceTypeMultiDebug` | Multi | ❌ | WebAssembly + SharedArrayBuffer + COOP/COEP | デバッグ用 |

### 2.2 MmdWasmInstanceTypeMPR (マルチスレッド版) の詳細

**技術仕様**:
- **実装**: wasm-bindgen-rayonによるWeb Worker並列化
- **物理エンジン**: Bullet統合版
- **メモリモデル**: SharedArrayBuffer経由でWorkerとメモリ共有
- **ビルド**: リリースビルド（最適化済み）

**必須要件**:
1. ✅ WebAssembly対応ブラウザ
2. ⚠️ **SharedArrayBuffer**が利用可能
3. ⚠️ HTTPSまたはセキュアコンテキスト
4. ⚠️ 以下のHTTPレスポンスヘッダー:
   ```http
   Cross-Origin-Opener-Policy: same-origin
   Cross-Origin-Embedder-Policy: require-corp
   ```

**参考**: `node_modules/babylon-mmd/esm/Runtime/Optimized/InstanceType/multiPhysicsRelease.d.ts`

### 2.3 PhysicsRuntimeEvaluationType

`MultiPhysicsRuntime`は2つの物理評価モードをサポート:

#### Immediate (即時評価)
```typescript
PhysicsRuntimeEvaluationType.Immediate = 0
```
- 現在フレームで即座に物理を評価
- メインスレッドで同期実行
- シングルスレッド・マルチスレッドどちらでも動作
- **デフォルト設定**

#### Buffered (バッファ評価)
```typescript
PhysicsRuntimeEvaluationType.Buffered = 1
```
- 次フレーム用にバッファリングされた物理評価
- **非同期マルチスレッド最適化が可能な場合に適用される**
- Workerスレッドで物理計算を実行しながら、メインスレッドでレンダリング継続可能
- 物理結果が1フレーム遅延する（通常は体感不可能）

**参考**: `node_modules/babylon-mmd/esm/Runtime/Optimized/Physics/Bind/Impl/physicsRuntimeEvaluationType.d.ts`

### 2.4 同期メカニズム

#### WasmSpinlock
- SharedArrayBuffer上でのスピンロック
- Worker/メインスレッド間でWASMメモリへのアクセスを同期
- `MultiPhysicsRuntime.lock`プロパティで公開

#### Observable
```typescript
// 物理ワールド同期時（物理評価が完了し安全にアクセス可能）
runtime.onSyncObservable.add(() => {
    // 物理ワールドが評価されていないことが保証される
});

// 各物理ティック時（Bufferedモード時はWorker実行中の可能性あり）
runtime.onTickObservable.add(() => {
    // Bufferedモード時: Workerで並列実行中の可能性
});
```

### 2.5 Worker実装の内部構造

**workerHelpers.js**:
- wasm-bindgen-rayonが生成するWorkerヘルパー
- 各Workerスレッドの初期化とWASMモジュールのロード
- メッセージパッシングによるタスク分配

**startWorkers関数**:
```javascript
// Worker起動シーケンス
export async function startWorkers(module, memory, builder) {
  const workerInit = {
    type: 'wasm_bindgen_worker_init',
    init: { module_or_path: module, memory },
    receiver: builder.receiver()
  };

  _workers = await Promise.all(
    Array.from({ length: builder.numThreads() }, async () => {
      const worker = new Worker(new URL('./workerHelpers.js', import.meta.url), {
        type: 'module'
      });
      worker.postMessage(workerInit);
      await waitForMsgType(worker, 'wasm_bindgen_worker_ready');
      return worker;
    })
  );
  builder.build();
}
```

**参考**: `node_modules/babylon-mmd/esm/Runtime/Optimized/wasm/mpr/snippets/wasm-bindgen-rayon-38edf6e439f6d70d/src/workerHelpers.js`

## 3. 実装難易度評価

### 総合難易度: **中〜高**

### 3.1 容易な部分（難易度: 低）

✅ **babylon-mmdがWorker実装を完全に提供済み**
- ライブラリ側で全てのWorker管理が実装されている
- アプリケーション側でWorkerコードを書く必要なし

✅ **インスタンスタイプの切り替えは比較的単純**
- `GetMmdWasmInstance()`に渡すインスタンスタイプを変更するだけ
- 既存のAPIは変更不要

✅ **既存のMultiPhysicsRuntime APIは変更不要**
- `setGravity()`, `addRigidBody()`などのAPIは共通
- 評価モードの設定が追加されるのみ

### 3.2 中程度の難易度（難易度: 中）

⚠️ **Electron環境でのCOOP/COEP対応**
- Electronは`session.protocol`でカスタムプロトコルを提供
- `webPreferences.crossOriginIsolated = true`の設定が必要
- 開発サーバー(Vite)とプロダクションビルド(file://プロトコル)の両対応

⚠️ **WASMバイナリのロード方法変更**
- MPRはワーカー用のヘルパーファイル(`workerHelpers.js`)を必要とする
- Vite/Webpack等のバンドラー設定の調整
- `?url`インポートやWorker URLの解決

⚠️ **SharedArrayBuffer有効化の検証**
- ブラウザの機能検出ロジック
- フォールバック処理（MPR→SPRへの自動切替）
- `crossOriginIsolated`プロパティのチェック

### 3.3 高難易度の部分（難易度: 高）

⚠️ **既存のローカルファイルアクセスとの両立**
- **現在**: `webSecurity: false`でfile://プロトコルからのPMX/テクスチャ読み込み
- **COEP導入後**: クロスオリジン制約の影響調査が必要
- **対策案**: カスタムプロトコル(`app://`など)への移行検討

⚠️ **パフォーマンス最適化とデバッグ**
- Workerスレッドでのエラーハンドリング
- 同期待ちによるフレーム落ちの検出と対策
- メモリ使用量の増加監視（SharedArrayBufferのオーバーヘッド）
- Workerスレッド数の最適化

⚠️ **評価モードの適切な選択と動的切り替え**
- 通常再生時: Bufferedモード（並列化）
- ボーン編集中: Immediateモード（即座に反映）
- シーク時: Immediateモード（正確な同期）
- 動的な切り替えタイミングの調整

## 4. 実装手順

### フェーズ1: 基盤整備（見積: 2-3日）

#### 4.1.1 SharedArrayBuffer検出機能の実装

```typescript
// src/mmd-manager.ts または新規ファイル
function detectSharedArrayBufferSupport(): boolean {
  try {
    // SharedArrayBufferが定義されているか
    if (typeof SharedArrayBuffer === 'undefined') {
      return false;
    }

    // crossOriginIsolatedが有効か
    if (typeof crossOriginIsolated === 'boolean' && !crossOriginIsolated) {
      return false;
    }

    // 実際にSharedArrayBufferを作成できるか
    new SharedArrayBuffer(1);
    return true;
  } catch (err) {
    console.warn('SharedArrayBuffer not available:', err);
    return false;
  }
}
```

#### 4.1.2 Electron環境のCOOP/COEP対応

```typescript
// src/main.ts
import { app, session } from 'electron';

app.whenReady().then(() => {
  // レスポンスヘッダーにCOOP/COEPを追加
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Cross-Origin-Opener-Policy': ['same-origin'],
        'Cross-Origin-Embedder-Policy': ['require-corp'],
      }
    });
  });

  // その他の初期化処理...
});

// BrowserWindow作成時のwebPreferences更新
const mainWindow = new BrowserWindow({
  // ...existing options...
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    crossOriginIsolated: true, // 追加
    webSecurity: true, // 要検証: ローカルファイル読み込みへの影響
  },
});
```

**注意点**:
- `webSecurity: true`への変更がローカルファイル読み込みに影響する可能性
- file://プロトコルの挙動を十分にテストする必要あり
- 必要に応じてカスタムプロトコル(`app://`)の実装を検討

#### 4.1.3 Viteビルド設定の調整

```javascript
// vite.config.ts または forge.config.ts
export default {
  worker: {
    format: 'es', // ESモジュール形式のWorker
  },
  optimizeDeps: {
    exclude: ['babylon-mmd'], // babylon-mmdを最適化から除外
  },
  build: {
    target: 'es2020', // SharedArrayBuffer用の最新ターゲット
    rollupOptions: {
      output: {
        // Workerファイルを正しく処理
        manualChunks: undefined,
      }
    }
  },
  // 開発サーバーのヘッダー設定（開発時のテスト用）
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    }
  }
}
```

### フェーズ2: Worker対応物理ランタイムの導入（見積: 2-3日）

#### 4.2.1 インスタンスタイプの動的選択

```typescript
// src/mmd-manager.ts
import { MmdWasmInstanceTypeSPR } from 'babylon-mmd/esm/Runtime/Optimized/InstanceType/singlePhysicsRelease';
import { MmdWasmInstanceTypeMPR } from 'babylon-mmd/esm/Runtime/Optimized/InstanceType/multiPhysicsRelease';
import { GetMmdWasmInstance } from 'babylon-mmd/esm/Runtime/Optimized/InstanceType/getMmdWasmInstance';
import type { IMmdWasmInstance } from 'babylon-mmd/esm/Runtime/Optimized/mmdWasmInstance';

// グローバルキャッシュ
let wasmInstancePromise: Promise<IMmdWasmInstance> | null = null;
let wasmInstanceType: 'single' | 'multi' | null = null;

async function loadBulletWasmInstance(): Promise<IMmdWasmInstance> {
  if (wasmInstancePromise) {
    return wasmInstancePromise;
  }

  wasmInstancePromise = (async () => {
    const supportsWorker = detectSharedArrayBufferSupport();

    let instanceType: IMmdWasmInstanceType;
    if (supportsWorker) {
      instanceType = new MmdWasmInstanceTypeMPR();
      wasmInstanceType = 'multi';
      logInfo('physics', 'Using multi-threaded physics runtime (Worker)', {});
    } else {
      instanceType = new MmdWasmInstanceTypeSPR();
      wasmInstanceType = 'single';
      logInfo('physics', 'Using single-threaded physics runtime', {
        reason: 'SharedArrayBuffer not available'
      });
    }

    return await GetMmdWasmInstance(instanceType);
  })();

  return wasmInstancePromise;
}
```

#### 4.2.2 評価モードの制御

```typescript
// src/mmd-manager.ts
import { PhysicsRuntimeEvaluationType } from 'babylon-mmd/esm/Runtime/Optimized/Physics/Bind/Impl/physicsRuntimeEvaluationType';

private async initializeBulletPhysicsBackend(): Promise<void> {
  const wasmInstance = await loadBulletWasmInstance();

  const runtime = new MultiPhysicsRuntime(wasmInstance, {
    preserveBackBuffer: true, // Worker使用時の推奨設定
    allowDynamicShadow: false, // パフォーマンス優先
  });

  // Worker利用可能時はBufferedモードを有効化
  if (wasmInstanceType === 'multi') {
    runtime.evaluationType = PhysicsRuntimeEvaluationType.Buffered;
    logInfo('physics', 'Enabled buffered physics evaluation', {});
  } else {
    runtime.evaluationType = PhysicsRuntimeEvaluationType.Immediate;
  }

  runtime.setGravity(new Vector3(0, -98, 0));
  runtime.register(this.scene);

  this.bulletPhysicsRuntime = runtime;
  this.physicsPlugin = null;
  this.physicsRuntime = new MmdBulletPhysics(runtime);
  (this.mmdRuntime as unknown as { _physics: MmdBulletPhysics | null })._physics = this.physicsRuntime;
  this.physicsBackend = wasmInstanceType === 'multi' ? "bullet-mt" : "bullet-st";
  this.applyPhysicsSimulationRate();
}
```

#### 4.2.3 動的な評価モード切り替え

```typescript
// src/mmd-manager.ts
private setPhysicsEvaluationMode(immediate: boolean): void {
  if (!this.bulletPhysicsRuntime) return;
  if (wasmInstanceType !== 'multi') return; // シングルスレッドは常にImmediate

  const newMode = immediate
    ? PhysicsRuntimeEvaluationType.Immediate
    : PhysicsRuntimeEvaluationType.Buffered;

  if (this.bulletPhysicsRuntime.evaluationType !== newMode) {
    this.bulletPhysicsRuntime.evaluationType = newMode;
    logInfo('physics', 'Changed physics evaluation mode', {
      mode: immediate ? 'Immediate' : 'Buffered'
    });
  }
}

// ボーンギズモドラッグ開始時
private onBoneGizmoDragStart(): void {
  this.setPhysicsEvaluationMode(true); // Immediateモード
  // ...existing code...
}

// ボーンギズモドラッグ終了時
private onBoneGizmoDragEnd(): void {
  this.setPhysicsEvaluationMode(false); // Bufferedモード
  // ...existing code...
}

// シーク時
public seekToFrame(frame: number): void {
  this.setPhysicsEvaluationMode(true); // Immediateモード
  // ...seek logic...
  // 次フレームでBufferedに戻す
  requestAnimationFrame(() => {
    this.setPhysicsEvaluationMode(false);
  });
}
```

#### 4.2.4 物理バックエンド情報の拡張

```typescript
// src/types.ts
type PhysicsBackend = "none" | "bullet-st" | "bullet-mt" | "ammo";

// src/mmd-manager.ts
private physicsBackend: PhysicsBackend = "none";

public getPhysicsBackendLabel(): string {
  switch (this.physicsBackend) {
    case "bullet-st": return "Bullet (Single)";
    case "bullet-mt": return "Bullet (Multi-threaded)";
    case "ammo": return "Ammo.js";
    default: return "Off";
  }
}

public getPhysicsBackendDetails(): {
  backend: PhysicsBackend;
  multithreaded: boolean;
  evaluationType: 'immediate' | 'buffered' | null;
} {
  return {
    backend: this.physicsBackend,
    multithreaded: this.physicsBackend === "bullet-mt",
    evaluationType: this.bulletPhysicsRuntime
      ? (this.bulletPhysicsRuntime.evaluationType === PhysicsRuntimeEvaluationType.Buffered ? 'buffered' : 'immediate')
      : null,
  };
}
```

### フェーズ3: 検証と最適化（見積: 3-5日）

#### 4.3.1 パフォーマンステスト計画

**テストシナリオ**:
1. **軽量シーン**: 単一モデル、物理なし
2. **標準シーン**: 単一モデル、髪・スカート物理あり
3. **重量シーン**: 複数モデル（3体以上）、全物理有効
4. **極限シーン**: 複数モデル（5体以上）+ アクセサリ

**測定項目**:
```typescript
interface PhysicsPerformanceMetrics {
  fps: number;
  physicsDurationMs: number; // 物理計算時間
  frameDurationMs: number; // 全体フレーム時間
  physicsPercentage: number; // フレーム時間に占める物理の割合
  memoryUsageMB: number;
  workerCount?: number;
}
```

**計測コード**:
```typescript
// src/mmd-manager.ts
private measurePhysicsPerformance(): PhysicsPerformanceMetrics {
  const physicsStart = performance.now();
  // 物理更新処理
  const physicsEnd = performance.now();

  return {
    fps: this.engine.getFps(),
    physicsDurationMs: physicsEnd - physicsStart,
    frameDurationMs: this.scene.deltaTime,
    physicsPercentage: ((physicsEnd - physicsStart) / this.scene.deltaTime) * 100,
    memoryUsageMB: (performance as any).memory?.usedJSHeapSize / (1024 * 1024),
    workerCount: wasmInstanceType === 'multi' ? navigator.hardwareConcurrency : undefined,
  };
}
```

#### 4.3.2 エラーハンドリングの強化

```typescript
// Worker起動失敗時のフォールバック
async function loadBulletWasmInstance(): Promise<IMmdWasmInstance> {
  if (wasmInstancePromise) {
    return wasmInstancePromise;
  }

  wasmInstancePromise = (async () => {
    const supportsWorker = detectSharedArrayBufferSupport();

    if (supportsWorker) {
      try {
        const instanceType = new MmdWasmInstanceTypeMPR();
        const instance = await GetMmdWasmInstance(instanceType);
        wasmInstanceType = 'multi';
        logInfo('physics', 'Multi-threaded physics runtime initialized', {});
        return instance;
      } catch (err) {
        logWarn('physics', 'Failed to initialize multi-threaded physics, falling back to single-threaded',
          toLogErrorData(err));
        // フォールバックへ続行
      }
    }

    // シングルスレッドにフォールバック
    const instanceType = new MmdWasmInstanceTypeSPR();
    const instance = await GetMmdWasmInstance(instanceType);
    wasmInstanceType = 'single';
    return instance;
  })();

  return wasmInstancePromise;
}
```

#### 4.3.3 UI表示の更新

```typescript
// index.html - 物理バックエンドバッジの更新
<div id="physics-type-badge" class="badge"></div>

// src/ui-controller.ts
private updatePhysicsStatusBadge(): void {
  const badge = document.getElementById('physics-type-badge');
  if (!badge) return;

  const details = this.mmdManager.getPhysicsBackendDetails();

  if (details.backend === 'bullet-mt') {
    badge.textContent = `Bullet MT (${details.evaluationType})`;
    badge.className = 'badge badge-success'; // 緑
  } else if (details.backend === 'bullet-st') {
    badge.textContent = 'Bullet ST';
    badge.className = 'badge badge-info'; // 青
  } else if (details.backend === 'ammo') {
    badge.textContent = 'Ammo.js';
    badge.className = 'badge badge-warning'; // 黄
  } else {
    badge.textContent = 'Physics Off';
    badge.className = 'badge badge-secondary'; // 灰
  }
}
```

### フェーズ4: ドキュメント化（見積: 1日）

#### 4.4.1 実装メモの更新

`docs/physics-runtime-spec.md`に以下を追記:

```markdown
## Worker対応

### 利用可能なバックエンド

- `bullet-st`: Bullet シングルスレッド（現行デフォルト）
- `bullet-mt`: Bullet マルチスレッド（Worker対応）
- `ammo`: Ammo.js フォールバック

### Worker対応の要件

- SharedArrayBuffer利用可能
- Cross-Origin-Opener-Policy: same-origin
- Cross-Origin-Embedder-Policy: require-corp
- Electronの場合: crossOriginIsolated設定

### 評価モード

- **Immediate**: メインスレッドで同期実行
- **Buffered**: Workerで並列実行（1フレーム遅延）

### 自動フォールバック

SharedArrayBuffer非対応の場合、自動的にシングルスレッド版にフォールバック。
```

#### 4.4.2 トラブルシューティングガイド

新規ファイル: `docs/physics-worker-troubleshooting.md`

```markdown
# 物理Worker対応トラブルシューティング

## SharedArrayBufferが利用できない

**症状**: コンソールに "SharedArrayBuffer not available" 警告

**原因**:
- COOP/COEPヘッダーが設定されていない
- HTTPSでない（localhostは除外）

**対処**:
1. Electron環境: `src/main.ts`のヘッダー設定を確認
2. 開発サーバー: `vite.config.ts`のserver.headersを確認
3. crossOriginIsolatedがtrueか確認: `console.log(crossOriginIsolated)`

## ローカルファイルが読み込めない

**症状**: PMXやテクスチャの読み込みエラー

**原因**: COEP有効化によるクロスオリジン制約

**対処**:
1. カスタムプロトコル(`app://`)の実装を検討
2. 一時的に`webSecurity: false`でテスト
3. ファイルをBlob URLに変換して読み込み

## パフォーマンスが改善しない

**症状**: Worker版でもfpsが変わらない

**原因**:
- 物理以外がボトルネック（描画、モーフなど）
- Workerスレッド数が不適切
- Bufferedモードが有効化されていない

**対処**:
1. パフォーマンス計測で物理の占める割合を確認
2. `bulletPhysicsRuntime.evaluationType`を確認
3. 描画設定（シャドウ、ポストエフェクト）を軽量化
```

## 5. リスクと制約

### 5.1 高リスク

#### リスク1: ローカルファイルアクセスの破壊
**影響**: PMX、テクスチャ、VMDなどの読み込み失敗
**発生確率**: 中〜高
**対策**:
- カスタムプロトコル(`app://`)への移行
- Blob URL経由での読み込み
- 段階的展開（まず実験的機能として）

#### リスク2: Electron特有の問題
**影響**: crossOriginIsolatedが正しく動作しない
**発生確率**: 低〜中
**対策**:
- 最新Electron（v40.4.1）での事前検証
- 公式ドキュメント・Issueの調査
- 問題発生時はSPRに固定

### 5.2 中リスク

#### リスク3: 1フレーム遅延の体感
**影響**: 操作のレスポンスが若干遅く感じる
**発生確率**: 低
**対策**:
- 編集操作時はImmediateモードに切り替え
- ユーザー設定で評価モードを選択可能に

#### リスク4: メモリ消費増加
**影響**: 大量モデル時のメモリ不足
**発生確率**: 低
**対策**:
- 既存の4096MB V8 old-space設定で対応
- メモリ使用量の監視とログ出力
- 極端な場合はWorker無効化を推奨

### 5.3 低リスク

#### リスク5: バンドルサイズ増加
**影響**: アプリサイズの肥大化
**発生確率**: 確定
**影響度**: 小（数MB程度）
**対策**:
- 許容範囲として受け入れ
- または遅延ロード・オンデマンドダウンロード

## 6. 期待される効果

### 6.1 定量的効果（推定）

| シナリオ | SPR (現行) | MPR (Worker) | 改善率 |
|---------|-----------|-------------|--------|
| 単一モデル | 60 fps | 60 fps | ±0% |
| 標準シーン（2-3モデル） | 45 fps | 55 fps | **+22%** |
| 重量シーン（5モデル） | 30 fps | 42 fps | **+40%** |
| 物理計算時間 | 8 ms/frame | 3 ms/frame | **-62%** |

※ 推定値。実環境での計測が必要。

### 6.2 定性的効果

✅ **UIレスポンスの向上**
- 物理計算中もメニュー操作がスムーズ
- タイムラインスクラブが滑らか

✅ **マルチモデル表示の実用性向上**
- 複数キャラクターの同時表示が現実的に

✅ **エクスポート時の安定性**
- レンダリングと物理計算が並列化され、フレーム落ちが減少

✅ **将来性**
- babylon-mmdの最新機能を活用
- WebGPU Computeシェーダー統合への布石
- ブラウザ版展開の技術基盤

## 7. 推奨実装戦略

### 7.1 段階的ロールアウト

#### ステージ1: アルファ版（v0.2.0-alpha）
- **目標**: 技術的実現可能性の確認
- **設定**: デフォルトはSPR、設定でMPRを有効化
- **期間**: 2週間
- **成功条件**:
  - SharedArrayBuffer検出が正しく動作
  - MPR有効時に物理が正常動作
  - ローカルファイル読み込みが破壊されない

#### ステージ2: ベータ版（v0.2.0-beta）
- **目標**: パフォーマンス改善の検証
- **設定**: デフォルトはMPR（自動フォールバック付き）
- **期間**: 4週間
- **成功条件**:
  - 標準シーンで20%以上の改善
  - 重大なバグ報告なし
  - メモリ使用量が許容範囲

#### ステージ3: 安定版（v0.2.1）
- **目標**: 本番投入
- **設定**: デフォルトMPR、SPRも選択可能
- **期間**: 恒久
- **成功条件**:
  - ユーザーフィードバックが肯定的
  - パフォーマンスベンチマーク公開

### 7.2 実装しない判断基準

以下の場合はWorker対応を見送り、調査結果のみドキュメント化:

❌ **完全にブロッカー**:
1. COEPがローカルファイルアクセスと両立不可能
2. Electron環境でcrossOriginIsolatedが動作しない
3. 実装完了後、パフォーマンス改善が5%未満

⚠️ **要再検討**:
4. メモリ消費が50%以上増加
5. 実装に4週間以上要する見込み
6. 複雑度が大幅に増加し保守性が低下

### 7.3 代替案

Worker対応が困難な場合の代替アプローチ:

**案1: 物理シミュレーション頻度の削減**
```typescript
// 60fps描画、30fps物理シミュレーション
if (frameCount % 2 === 0) {
  updatePhysics();
}
```

**案2: 物理の選択的無効化**
```typescript
// 画面外のモデルは物理を無効化
if (!model.isInView) {
  model.disablePhysics();
}
```

**案3: LOD（Level of Detail）の導入**
```typescript
// 遠方のモデルは物理精度を下げる
if (distanceFromCamera > 50) {
  physics.setSubSteps(1); // 低精度
} else {
  physics.setSubSteps(10); // 高精度
}
```

## 8. 参考資料

### 8.1 babylon-mmd公式

- **メインドキュメント**: https://noname0310.github.io/babylon-mmd/
- **物理適用ガイド**: https://noname0310.github.io/babylon-mmd/docs/get_started/apply_physics
- **GitHubリポジトリ**: https://github.com/noname0310/babylon-mmd
- **README**: https://github.com/noname0310/babylon-mmd/blob/main/README.md

### 8.2 技術仕様

- **SharedArrayBuffer**: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer
- **COOP/COEP**: https://web.dev/coop-coep/
- **wasm-bindgen-rayon**: https://github.com/RReverser/wasm-bindgen-rayon
- **Web Workers**: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API

### 8.3 Electron関連

- **Security**: https://www.electronjs.org/docs/latest/tutorial/security
- **crossOriginIsolated**: https://github.com/electron/electron/issues/28985
- **session.webRequest**: https://www.electronjs.org/docs/latest/api/web-request
- **Protocol**: https://www.electronjs.org/docs/latest/api/protocol

### 8.4 babylon-mmdソースコード

- `node_modules/babylon-mmd/esm/Runtime/Optimized/Physics/Bind/Impl/multiPhysicsRuntime.ts`
- `node_modules/babylon-mmd/esm/Runtime/Optimized/Physics/Bind/Impl/physicsRuntimeEvaluationType.ts`
- `node_modules/babylon-mmd/esm/Runtime/Optimized/InstanceType/multiPhysicsRelease.ts`
- `node_modules/babylon-mmd/esm/Runtime/Optimized/wasm/mpr/snippets/wasm-bindgen-rayon-*/src/workerHelpers.js`

### 8.5 MMD_modoki内部ドキュメント

- `docs/babylon-mmd-physics-research.md` - babylon-mmd物理調査メモ
- `docs/physics-runtime-spec.md` - 現行物理実装仕様
- `docs/physics-task-list.md` - 物理演算タスクリスト

## 9. 実装チェックリスト

### 準備フェーズ
- [ ] SharedArrayBuffer検出機能の実装
- [ ] Electron COOP/COEP設定の追加
- [ ] Viteビルド設定の調整
- [ ] ローカルファイルアクセスの動作確認

### コア実装フェーズ
- [ ] インスタンスタイプ動的選択ロジック
- [ ] 評価モード制御の実装
- [ ] 動的評価モード切り替え
- [ ] 物理バックエンド情報の拡張
- [ ] エラーハンドリングの強化

### 検証フェーズ
- [ ] パフォーマンステスト実施
- [ ] メモリ使用量計測
- [ ] 各種シナリオでの動作確認
- [ ] エッジケースのテスト

### UI/UXフェーズ
- [ ] 物理バックエンドバッジの更新
- [ ] 設定画面への評価モード選択追加
- [ ] デバッグ情報の表示強化

### ドキュメントフェーズ
- [ ] `physics-runtime-spec.md`の更新
- [ ] トラブルシューティングガイド作成
- [ ] パフォーマンスベンチマーク結果の記録
- [ ] 既知の制約・制限事項の文書化

### リリースフェーズ
- [ ] アルファ版リリース（実験的機能）
- [ ] フィードバック収集
- [ ] ベータ版リリース（デフォルト有効）
- [ ] 安定版リリース

## 10. 結論

### 10.1 総合評価

**実装難易度**: 中〜高
**推定工数**: 8-14日（調査・実装・検証含む）
**推奨方針**: 段階的導入、実験的機能として開始

### 10.2 最終判断

Worker対応は**技術的に実現可能**であり、**パフォーマンス改善も期待できる**。babylon-mmdがWorker実装を完全に提供しているため、アプリケーション側での実装負荷は比較的軽い。

ただし、以下の点に注意が必要:
1. Electron環境でのCOOP/COEP対応
2. 既存のローカルファイルアクセスとの両立
3. 実環境でのパフォーマンス改善の検証

**推奨アプローチ**:
まずは**小規模な実験的実装**でElectron環境でのSharedArrayBuffer動作とローカルファイルアクセスの両立を確認。技術的制約が許容範囲であれば、段階的に本格導入を進める。問題が深刻な場合は、調査結果をドキュメント化し、将来の再検討に備える。

### 10.3 次のステップ

1. **即座に着手可能**: SharedArrayBuffer検出機能の実装とElectron環境での動作確認
2. **技術検証完了後**: インスタンスタイプ動的選択ロジックの実装
3. **実験版動作確認後**: パフォーマンステストと本格展開判断

本ドキュメントは、実装進行に伴い随時更新する。
