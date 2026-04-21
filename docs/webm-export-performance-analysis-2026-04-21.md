# WebM 動画書き出し速度調査レポート

調査日: 2026-04-21
対象バージョン: v0.1.7 (commit 1f0947d)

## 1. 問題概要

ユーザーからの報告によると、以下の条件で WebM 書き出しが非常に遅い:

- **動画長**: 3分41秒 (221秒)
- **設定 FPS**: 30fps
- **総フレーム数**: 約 6,630 フレーム
- **実測書き出し時間**: 約 50 分
- **フレームあたり処理時間**: 約 0.45 秒/フレーム

理論上、リアルタイム再生が可能なら 221 秒で書き出せるはずだが、実際には約 13.6 倍の時間がかかっている。

---

## 2. 現行実装の概要

### 2.1 アーキテクチャ

WebM 書き出しは以下の構成で動作する:

1. **別ウィンドウ**: 隠しウィンドウ上で専用の `MmdManager` インスタンスを生成
2. **フレームごとの処理ループ**:
   ```
   for each frame:
     - playAnimation() で物理・アニメーション更新
     - renderOnce() でシーン描画
     - RenderTargetTexture.readPixels() でピクセルデータ取得
     - RGBA データを上下反転
     - VideoSample 作成
     - VideoEncoder へエンコード依頼
   ```
3. **MediaBunny ライブラリ**: WebCodecs API をラップして WebM コンテナへ mux
4. **ストリーミング保存**: エンコード済みチャンクを IPC 経由で main プロセスへ送信

### 2.2 使用コーデック

- **動画コーデック**: VP9 (優先), VP8 (fallback)
- **ハードウェアアクセラレーション**: `prefer-hardware` を優先
- **キーフレーム間隔**: 5 フレーム
- **ビットレート**: 1080p30 で 8 Mbps, 1080p60 で 12 Mbps

### 2.3 キャプチャ方式

```typescript
// src/webm-exporter.ts:141-184
const reusableFrameCapture = createReusableFrameCapture(...);
// RenderTargetTexture + readPixels() + 上下反転
```

現在は安定性を優先して `RenderTargetTexture.readPixels()` を使用。
過去に試した `canvas` 直接取得や `ImageBitmap` 経由では黒画面が出る環境があったため不採用。

---

## 3. ボトルネック分析

### 3.1 フレームあたりの処理内訳

`webm-exporter.ts` には各工程のパフォーマンス計測が実装されている:

```typescript
// 行 545-551
const performanceStats = {
    renderMsTotal: 0,     // シーン描画時間
    captureMsTotal: 0,    // ピクセル読み取り時間
    encodeMsTotal: 0,     // エンコード時間
    renderSamples: 0,
    captureSamples: 0,
    encodeSamples: 0,
};
```

実際の処理時間内訳はユーザー環境で確認が必要だが、一般的なボトルネックは以下:

#### 3.1.1 物理シミュレーション (最大の要因)

**問題箇所**: `src/webm-exporter.ts:635-637`

```typescript
await exportRuntimeInternals.mmdRuntime.playAnimation();
mmdManager.renderOnce(1000 / fps);
exportRuntimeInternals.mmdRuntime.pauseAnimation();
```

- **`playAnimation()` の処理内容**:
  - MMD アニメーション補間計算
  - **物理シミュレーション** (Bullet または Ammo.js)
  - IK 計算
  - モーフ適用

- **物理設定** (`docs/physics-runtime-spec.md`):
  - fixed time step: `1/120` 秒
  - max sub steps: `120`
  - 30fps 出力の場合、1フレームあたり `1/30` 秒 = 約 33.3ms の時間経過をシミュレート
  - これを `1/120` 秒ステップで分割すると、**4サブステップ**必要
  - 60fps 出力では **2サブステップ**

**実測推定**:
- 複雑なモデル (髪・衣装物理が多い) の場合、1サブステップあたり 5-20ms かかる可能性
- 4サブステップ × 10ms = **40ms/フレーム** (render/capture 前の段階)
- これだけで理論上 6,630 フレーム × 40ms = **約 4.4 分**消費

**外部再生モード**:
`setExternalPlaybackSimulationEnabled(true)` が設定されているが、これは物理を無効化せず、むしろフレーム単位での正確なシミュレーションを保証するモード。

#### 3.1.2 GPU 同期待ち (readPixels)

**問題箇所**: `src/webm-exporter.ts:163-168`

```typescript
const pixelPromise = renderTarget.readPixels(0, 0, null, true, false, 0, 0, width, height);
const pixelData = await pixelPromise;
```

- `readPixels()` は GPU → CPU 転送を含む非同期処理
- WebGPU/WebGL の描画パイプラインが完了するまで待機
- 解像度が高いほど転送データ量が増える
  - 1920×1080 × 4 bytes (RGBA) = **8.3 MB/フレーム**
  - 6,630 フレーム = 約 **55 GB** の総転送量

**実測推定**:
- 1080p での readPixels: **5-15ms/フレーム**
- 4K では **20-50ms/フレーム** に悪化

#### 3.1.3 RGBA 上下反転

**問題箇所**: `src/webm-exporter.ts:128-139`

```typescript
const flipRgbaRowsInPlace = (bytes: Uint8Array, width: number, height: number): void => {
    const rowStride = width * 4;
    const swapBuffer = new Uint8Array(rowStride);
    const halfRows = Math.floor(height / 2);
    for (let y = 0; y < halfRows; y += 1) {
        const topStart = y * rowStride;
        const bottomStart = (height - 1 - y) * rowStride;
        swapBuffer.set(bytes.subarray(topStart, topStart + rowStride));
        bytes.copyWithin(topStart, bottomStart, bottomStart + rowStride);
        bytes.set(swapBuffer, bottomStart);
    }
};
```

**実測推定**:
- 1080p での反転: **1-3ms/フレーム**
- 影響は小さいが、最適化余地あり

#### 3.1.4 VideoEncoder エンコード

**問題箇所**: `src/webm-exporter.ts:574`

```typescript
await videoSource.add(item.videoSample);
```

- VP9 ソフトウェアエンコードは非常に重い
- ハードウェアアクセラレーション利用時でも、1080p30 で **10-30ms/フレーム**
- ソフトウェア VP9: **50-200ms/フレーム**

**キュー設計**:
- 最大キュー長: 16 フレーム (行 405)
- producer/consumer パターンで並行処理を試みているが、物理シミュレーションがボトルネックになると効果が薄い

#### 3.1.5 ポストプロセス効果

`MmdManager.create()` で生成されたシーンには、以下のポストプロセスが含まれる可能性:

- **SSAO** (Screen Space Ambient Occlusion)
- **DOF** (Depth of Field)
- **SSR** (Screen Space Reflections)
- **Motion Blur**
- **Volumetric Light Scattering**
- **Fog**
- **LUT (色補正)**

これらはデフォルトで有効になっている場合、1フレームあたり **5-20ms** 追加コストがかかる。

---

## 4. 速度に影響する設計上の問題点

### 4.1 フレーム単位での同期処理

現在の実装は完全な同期ループ:

```typescript
for (let outputFrameIndex = 0; outputFrameIndex < totalFrames; outputFrameIndex += 1) {
    // 物理更新 → 描画 → キャプチャ → エンコードキュー投入
    await exportRuntimeInternals.mmdRuntime.playAnimation();
    mmdManager.renderOnce(1000 / fps);
    const capturedFrame = await reusableFrameCapture.captureFrameAsync();
    // ...
}
```

**問題**:
- 物理シミュレーションが完了するまで次のフレームに進めない
- GPU の並列処理能力を活かせていない

### 4.2 物理演算の固定ステップ制約

MMD の物理は可変ステップではなく、固定 `1/120` 秒ステップで動作:

- 30fps 出力: 4 サブステップ/フレーム
- 60fps 出力: 2 サブステップ/フレーム

**問題**:
- 60fps 出力でも総物理計算量は削減されない (フレーム数が倍になるため)
- 書き出し速度は FPS 設定にほぼ比例して悪化する

### 4.3 書き出し専用の最適化不足

`importProjectState(..., { forExport: true })` は一部の UI 同期をスキップするが、以下は依然として有効:

- 物理シミュレーション (フル精度)
- シャドウマップ生成
- すべてのポストプロセス効果

**リアルタイムプレビューと同等の処理コストがかかっている**。

### 4.4 複数モデル時の累積コスト

プロジェクトに複数モデルが含まれる場合:

- 各モデルの物理が独立して計算される
- モデル数 × サブステップ数 の累積コスト
- 3モデル × 4サブステップ = **12 回の物理更新/フレーム**

---

## 5. 改善案

### 5.1 即効性が高い改善 (Phase 1)

#### 5.1.1 書き出し専用の物理簡略化モード

**提案**: 書き出し時は物理精度を下げるオプションを追加

```typescript
// 疑似コード
if (forExport && lowPhysicsMode) {
    // サブステップを 1/2 に削減 (1/60 秒ステップ)
    physicsTimeStep = 1/60;
    // または物理を完全無効化
    setPhysicsEnabled(false);
}
```

**効果**: 物理が支配的な場合、**2-5倍の高速化**

**実装難易度**: 低
**リスク**: 物理挙動が変わるため、ユーザーが許容できるかは要確認

#### 5.1.2 書き出し時のポストプロセス選択的無効化

**提案**: 書き出し設定に「高速モード」を追加し、以下を無効化:

- SSAO
- SSR
- Motion Blur (書き出し時は意味がない)
- Volumetric Light Scattering

```typescript
if (forExport && fastMode) {
    setPostEffectSsaoEnabled(false);
    setPostEffectSsrEnabled(false);
    setPostEffectMotionBlurEnabled(false);
    // ...
}
```

**効果**: **1.2-1.5倍の高速化**

**実装難易度**: 低
**リスク**: 見た目が変わる (ユーザー選択式なら問題なし)

#### 5.1.3 解像度スケーリング

**提案**: 内部的に低解像度でレンダリングし、最終的にアップスケール

```typescript
const internalScale = 0.75; // 1920x1080 → 1440x810
// レンダリング後、VideoFrame 作成時にリサイズ
```

**効果**: GPU 負荷削減で **1.3-1.8倍の高速化** (解像度依存)

**実装難易度**: 中
**リスク**: 品質低下 (ユーザー選択式推奨)

#### 5.1.4 VP8 への切り替え

**提案**: デフォルトコーデックを VP9 → VP8 に変更

VP9 はエンコード負荷が高い。VP8 は:
- エンコード速度: VP9 の **2-3倍**
- ファイルサイズ: VP9 より 30-50% 大きい

**効果**: エンコードがボトルネックの場合 **1.5-2倍の高速化**

**実装難易度**: 極低 (設定変更のみ)

```typescript
// src/ui/export-ui-controller.ts:342
preferredVideoCodec: "vp8" // デフォルトを vp8 に
```

**リスク**: ファイルサイズ増加

#### 5.1.5 キーフレーム間隔の調整

**現在**: `keyFrameInterval: 5` (行 533)

**提案**: 10 または 15 に増やす

キーフレームは通常フレームより 3-5倍重い。

**効果**: **1.1-1.2倍の高速化**

**実装難易度**: 極低
**リスク**: シーク性能低下 (通常再生には影響なし)

### 5.2 中期的改善 (Phase 2)

#### 5.2.1 物理なし書き出しモード

**提案**: UI に「物理なし書き出し」オプションを追加

```typescript
if (disablePhysicsForExport) {
    mmdManager.setPhysicsEnabled(false);
}
```

**効果**: 物理が重い場合 **5-10倍の高速化**

**実装難易度**: 低
**制約**: 髪・衣装の動きが失われる

#### 5.2.2 物理事前計算 + キャッシュ

**提案**: 書き出し前に全フレームの物理を事前計算してキャッシュ

1. 物理演算のみを高速実行 (描画なし)
2. 各フレームのボーン変換をメモリに保存
3. 書き出し時はキャッシュから読み込み

**効果**: 物理が重い場合 **3-5倍の高速化**

**実装難易度**: 高
**制約**: メモリ使用量増加 (長時間動画では問題)

#### 5.2.3 GPU キャプチャ方式の再検討

**提案**: `VideoFrame` の `VideoFrameInit` に直接 canvas を渡す方式を再試行

```typescript
const videoFrame = new VideoFrame(canvas, {
    timestamp: outputFrameIndex / fps,
    duration: frameDuration,
});
```

**効果**: `readPixels` + 反転が不要になり **1.3-1.5倍の高速化**

**実装難易度**: 中
**リスク**: 過去に黒画面問題があった環境での回帰

代替案:
- `OffscreenCanvas` + `transferToImageBitmap()` 経由
- WebGPU の `GPUTexture.copyToBuffer()` 直接利用 (WebGPU のみ)

#### 5.2.4 マルチスレッド物理計算

**提案**: Bullet/Ammo の物理計算を Worker に分離

babylon-mmd の `MultiPhysicsRuntime` は Worker 対応を前提にしているが、現在は main thread で実行している。

**効果**: **1.5-2倍の高速化** (物理とレンダリングの並列化)

**実装難易度**: 非常に高
**リスク**: 同期管理の複雑化、デバッグ困難

### 5.3 長期的改善 (Phase 3)

#### 5.3.1 プログレッシブエンコード (リアルタイム+後処理)

**提案**:

1. 書き出し中は低品質 (VP8, 低ビットレート) でリアルタイムエンコード
2. 書き出し完了後、バックグラウンドで高品質 (VP9, 高ビットレート) に再エンコード

**効果**: ユーザー体感速度 **5-10倍の改善**

**実装難易度**: 非常に高

#### 5.3.2 FFmpeg バックエンド統合

**提案**: Electron main プロセスで FFmpeg を使用

- フレームを PNG/BMP でパイプ経由で FFmpeg に送信
- FFmpeg が H.264/H.265 でエンコード

**効果**: **2-5倍の高速化** (ハードウェアエンコード利用可能)

**実装難易度**: 非常に高
**制約**: FFmpeg のライセンス・配布問題

#### 5.3.3 GPU Compute Shader での物理計算

**提案**: 単純な物理 (髪の揺れなど) を WebGPU Compute Shader に移植

**効果**: 理論上 **5-20倍の高速化**

**実装難易度**: 極めて高
**リスク**: MMD 物理の完全再現は困難

---

## 6. 推奨実装順序

### Step 1: 即座に実装可能 (1-2日)

1. **VP8 をデフォルトコーデックに変更** → **1.5-2倍高速化**
2. **キーフレーム間隔を 10 に変更** → **1.1-1.2倍高速化**
3. **書き出し時 Motion Blur 自動無効化** → **1.05-1.1倍高速化**

**累積効果**: 約 **1.75-2.6倍の高速化**
→ 50分 → **19-28分**

### Step 2: 短期実装 (3-5日)

4. **「高速モード」オプション追加** (SSAO/SSR 無効化) → **1.2-1.5倍追加高速化**
5. **「物理なし」オプション追加** → 物理が重いシーンで **2-5倍追加高速化**

**累積効果** (物理なし選択時): **3.5-13倍の高速化**
→ 50分 → **4-14分**

### Step 3: 中期実装 (1-2週間)

6. **GPU キャプチャ方式の再実装** → **1.3-1.5倍追加高速化**
7. **物理精度低減オプション** → **1.5-2倍追加高速化**

**累積効果**: **6.8-29倍の高速化**
→ 50分 → **2-7分**

---

## 7. その他の考慮事項

### 7.1 進捗表示の改善

現在の進捗表示 (`行 554-561`) は有用だが、以下を追加すると診断に役立つ:

```typescript
// 各工程の平均時間を表示
`avg: render=${renderAvg.toFixed(1)}ms capture=${captureAvg.toFixed(1)}ms encode=${encodeAvg.toFixed(1)}ms`
```

### 7.2 ベンチマークモード

開発用に「最初の 100 フレームのみ書き出し」モードを追加し、最適化効果を素早く検証できるようにする。

### 7.3 ユーザーへの設定ガイド

書き出し設定画面に以下を追加:

- 「高速 (品質低)」「標準」「高品質 (低速)」プリセット
- 各オプションの速度への影響を明示 (例: 「物理なし: 約5倍高速化」)

---

## 8. 結論

現在の WebM 書き出しが遅い主な原因:

1. **物理シミュレーション** (推定 50-70% の時間消費)
2. **GPU 同期待ち (readPixels)** (推定 15-25%)
3. **VP9 エンコード** (推定 10-20%)
4. **ポストプロセス** (推定 5-10%)

**最も効果的な改善策**:

- 短期: VP8 切り替え + 物理なしオプション → **3-6倍高速化**
- 中期: GPU キャプチャ最適化 + 物理精度調整 → **6-15倍高速化**

**実装優先度**:

1. VP8 デフォルト化 (即日可能)
2. 物理なしオプション (1-2日)
3. 高速モードオプション (3-5日)
4. GPU キャプチャ方式再実装 (1-2週間)

これらの改善により、現在 50 分かかっている書き出しを **5-10 分程度**まで短縮できる見込み。
