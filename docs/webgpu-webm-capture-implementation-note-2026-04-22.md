# WebGPU WebM Capture 実装メモ 2026-04-22

## 目的

WebM 出力の `capture` 工程では、従来の `RenderTargetTexture.readPixels()` が大きなボトルネックになっていた。

2026-04-22 の計測では、おおむね以下の傾向が出ていた。

- `update`: ほぼ無視できる
- `draw`: 10ms 前後
- `capture`: 14ms 前後
- `encode`: 1ms 未満

このため、`GPU -> CPU` への readback 経路を見直す候補として `WebGPU copy` モードを追加した。

## 位置づけ

この経路は現時点では `experimental` 扱いである。

- 既定値は `readPixels (stable)`
- `canvas / VideoFrame` と `WebGPU copy` は比較・検証用
- ただし、2026-04-22 時点では重いデータでも `WebGPU copy` が実際に動作し、速度改善が見えた

## 追加した UI / 設定

出力欄に `キャプチャ` セレクトを追加した。

- `readPixels (stable)`
- `canvas / VideoFrame`
- `WebGPU copy (experimental)`

保存先:

- `ProjectOutputState.webmCaptureMode`
- `WebmExportRequest.captureMode`

既定値:

- `readpixels`

## 実装の全体像

`src/webm-exporter.ts` では capture 処理を `FrameCapture` として抽象化し、モードごとに差し替える構成にした。

```ts
type FrameCapture = {
  modeLabel: WebmCaptureMode;
  captureFrameAsync: (timestamp: number, duration: number) => Promise<VideoSample | null>;
  dispose: () => void;
};
```

モードごとの役割は次の通り。

### 1. `readpixels`

- `RenderTargetTexture.render(true)`
- `RenderTargetTexture.readPixels(...)`
- CPU 側で `RGBA` を受け取る
- `flipRgbaRowsInPlace(...)`
- `new VideoSample(rgba, { format: "RGBA", ... })`

安定経路だが、もっとも遅い候補。

### 2. `canvas`

- `new VideoSample(canvas, { timestamp, duration })`

最短経路だが、過去に黒画面問題があったため比較用扱い。

### 3. `webgpu-copy`

- `RenderTargetTexture.render(true)`
- `engine.flushFramebuffer()`
- `GPUTexture` を取得
- `GPUCommandEncoder.copyTextureToBuffer(...)`
- `device.queue.submit(...)`
- `GPUBuffer.mapAsync(...)`
- CPU 側へ `RGBA` を詰め直す
- `flipRgbaRowsInPlace(...)`
- `new VideoSample(rgba, { format: "RGBA", ... })`

現時点で最速候補。

## 実装の要点

### 1. Babylon の `engine.copyTextureToBuffer(...)` は使わなかった

最初は `WebGPUEngine.copyTextureToBuffer(...)` を直接呼んでいたが、重いデータで `copyTextureToBuffer` の段階で停止した。

進捗文言を細かく出した結果、

- `render` は通る
- `GPUTexture` 取得も通る
- `copyTextureToBuffer` の呼び出しから戻らない

という状態だった。

そのため、Babylon の `readPixels` 実装に寄せて、以下の形へ変更した。

```ts
const commandEncoder = device.createCommandEncoder({});
commandEncoder.copyTextureToBuffer(...);
device.queue.submit([commandEncoder.finish()]);
```

この変更後、`WebGPU copy` 経路は重いデータでも動作するようになった。

### 2. `flushFramebuffer()` が必要だった

`renderTarget.render(true)` の直後に readback すると、出力動画が静止画のようになった。

これは、描画命令が GPU 側でまだ確定していない状態で readback を始めていた可能性が高い。

Babylon の `readPixels` 実装でも `flushFramebuffer()` を呼んでいるため、それに合わせて `WebGPU copy` 側にも追加した。

```ts
renderTarget.render(true);
engine.flushFramebuffer();
```

この修正後、出力動画が静止画化せず、フレームが進むようになった。

### 3. 上下反転は CPU 側で補正した

`WebGPU copy` で取得したバッファは、そのままだと上下が反転していた。

`readPixels` 経路と同じく、CPU 側で `flipRgbaRowsInPlace(...)` をかけることで補正した。

```ts
flipRgbaRowsInPlace(rgbaData, width, height);
```

### 4. 行ピッチの 256 byte align に対応した

`copyTextureToBuffer` では `bytesPerRow` に 256 byte align 制約がある。

そのため、以下のように padded row を作っている。

```ts
const rowBytes = width * 4;
const paddedBytesPerRow = Math.ceil(rowBytes / 256) * 256;
```

`mapAsync` 後は、各行の実データだけを `rgbaData` へ詰め直している。

## 進捗文言の細分化

`webgpu-copy` がどこで止まるか分かるように、capture 工程の途中段階を busy overlay に出すようにした。

例:

- `Capture WebGPU copy | render`
- `Capture WebGPU copy | flushFramebuffer`
- `Capture WebGPU copy | encode copy command`
- `Capture WebGPU copy | queue submit`
- `Capture WebGPU copy | mapAsync`
- `Capture WebGPU copy | mapped`
- `Capture WebGPU copy | packed`

これにより、停止箇所の切り分けがしやすくなった。

## タイムアウト

`readPixels` と `WebGPU copy` の両方に capture timeout を入れている。

- `CAPTURE_TIMEOUT_MS = 8000`

目的:

- 無限待ちで UI が止まったように見える状態を避ける
- `stalled or failed` を明示エラーとして出す

## 現時点の実用判断

2026-04-22 時点の判断は次の通り。

- `readPixels`
  - stable
  - 既定値として維持
- `canvas / VideoFrame`
  - 比較用
  - 環境差の再確認が必要
- `WebGPU copy`
  - 有望
  - 実際に速度改善が見えた
  - ただし Babylon / WebGPU 実装差やドライバ差がありうるため、まだ experimental 扱いを維持する

## 今後の確認項目

- 長尺・重いデータで継続的に安定するか
- `readPixels` / `canvas` / `WebGPU copy` の `avg cap` 実測比較
- WebGL fallback 環境で `webgpu-copy` が正しく拒否されるか
- 出力映像の色味差がないか
- `canvas / VideoFrame` が黒画面にならない環境条件の整理

## 関連ファイル

- `src/webm-exporter.ts`
- `src/ui/export-ui-controller.ts`
- `src/ui-controller.ts`
- `src/main.ts`
- `src/types.ts`
- `index.html`

## 関連メモ

- [WebM 出力 現行仕様 / 実装](./webm-export-current-spec-2026-03-13.md)
- [WebM 動画書き出し速度調査レポート](./webm-export-performance-analysis-2026-04-21.md)
- [動画書き出し最適化案メモ](./video-export-optimization-options-2026-04-21.md)
## 2026-04-22 追記: readback リング化

`WebGPU copy` では、`mapAsync` を毎フレームその場で待たないように readback を 3 本リング化した。

- 現フレームは `render -> flushFramebuffer -> copyTextureToBuffer -> queue.submit` まで先に進める
- `GPUBuffer.mapAsync()` と CPU 側の `RGBA` pack は 1〜2 フレーム前の slot を後で回収する
- `captureFrameAsync()` は直前に完了した slot を返し、ループ末尾では `flushPendingAsync()` で未回収分を drain する

目的は、従来の

- `render -> copy -> submit -> mapAsync待ち -> CPU pack -> encode`

という直列経路を少しでも崩して、GPU 側 copy と CPU 側 readback / pack を重ねることにある。
