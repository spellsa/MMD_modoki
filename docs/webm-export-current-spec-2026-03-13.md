# WebM 出力 現行仕様 / 実装
更新日: 2026-03-13

## 1. 概要
- `出力 > WebM動画` から `.webm` を保存する
- 出力 fps は `24 / 30 / 60`
- `音声あり` を ON にすると、読み込み済み音声を mux する
- codec 選択 UI は通常表示しない
- 内部既定 codec は `VP9`
- 出力中は main UI を lock し、busy overlay に簡略進捗を表示する

## 2. UI
対象ファイル:

- `index.html`
- `src/ui-controller.ts`
- `src/index.css`

出力欄の現行項目:

- 比率
- 長辺
- 幅 / 高さ
- FPS
- `音声あり`
- `PNG画像`
- `WebM動画`

補足:

- `PNG Seq` は UI から外している
- codec 選択 UI も外している
- 新規既定値では内部的に `VP9` を使う

## 3. タイムライン基準
MMD タイムラインは 30fps 基準で扱う。

- `timelineFrameCount = endFrame - startFrame + 1`
- `totalOutputFrames = round((timelineFrameCount / 30) * outputFps)`

これにより:

- 30fps 出力では timeline 1 frame = video 1 frame
- 60fps 出力ではフレーム数だけ増え、再生時間は維持する
- 音声付き出力でも video / audio の長さを揃える

## 4. 構成

### Main UI renderer
対象:

- `src/ui-controller.ts`

役割:

- 出力 UI の入力を `ProjectOutputState` に保存
- `WebmExportRequest` を組み立てて main process へ送る
- 背景出力 lock と busy overlay を管理する

### Main process
対象:

- `src/main.ts`
- `src/preload.ts`
- `src/types.ts`

役割:

- WebM export job の開始 / 受付
- hidden exporter window の生成
- progress / state の owner window への中継
- streamed save
- 完了時の exporter window close と UI lock 解放

### Exporter renderer
対象:

- `src/renderer.ts`
- `src/webm-exporter.ts`

役割:

- hidden window 上に fresh な `MmdManager` を作る
- project state を isolated scene へ import する
- frame capture / encode / save を実行する
- 完了時に `finishWebmExportJob(jobId)` を main へ返す

## 5. 出力手順
1. hidden exporter window で `MmdManager.create(canvas)`
2. `importProjectState(project, { forExport: true })`
3. `setTimelineTarget("camera")`
4. `pause()`, `setAutoRenderEnabled(false)`
5. `seekTo(startFrame)`
6. codec / bitrate を決定
7. 必要なら音声を decode / slice
8. `Output + WebMOutputFormat + StreamTarget` を生成
9. フレームごとに render / capture / encode
10. `close -> finalize -> finishWebmExportJob`

## 6. capture 経路
現行は安定性優先で以下を使う。

- reusable `RenderTargetTexture`
- `readPixels()`
- `VideoSample(RGBA)`

不採用:

- `canvas -> VideoSample`
- `ImageBitmap -> 2D canvas -> VideoSample`

これらは黒画が出る環境があったため、現状は使わない。

## 7. 音声トラック
対象:

- `src/webm-exporter.ts`

仕様:

- `音声あり` ON かつ音声読込済みのときだけ mux する
- exporter scene 側では音を鳴らさない
- 元音声ファイルを別途 decode して使う

音声 codec:

- 優先: `opus`
- fallback: `vorbis`

音声 bitrate:

- mono: `128 kbps`
- stereo 以上: `192 kbps`

## 8. codec / bitrate
対象:

- `src/webm-exporter.ts`

動画 codec:

- 内部既定値: `VP9`
- 実行時は `prefer-hardware` を優先
- 非対応時は `no-preference` へ fallback

既定 bitrate:

- 1080p30: `8 Mbps`
- 1080p60: `12 Mbps`
- 1440p30: `16 Mbps`
- 1440p60: `24 Mbps`
- 4K30: `35 Mbps`
- 4K60: `53 Mbps`

補足:

- `keyFrameInterval` は現状 `5`
- この値はまだ調整中

## 9. 保存方式
対象:

- `src/webm-exporter.ts`
- `src/main.ts`

保存は streamed save を使う。

1. exporter が `beginWebmStreamSave(filePath)` を呼ぶ
2. `StreamTarget` から chunk が出る
3. `writeWebmStreamChunk(saveId, bytes, position)` で main process へ渡す
4. close 後に `finishWebmStreamSave(saveId)`
5. エラー時は `cancelWebmStreamSave(saveId)`

完成した WebM 全体を最後に一括 IPC 転送しないため、完了時の stall を減らせる。

## 10. 進捗表示
対象:

- `src/renderer.ts`
- `src/ui-controller.ts`

phase:

- `initializing`
- `loading-project`
- `checking-codec`
- `opening-output`
- `encoding`
- `closing-track`
- `finalizing`
- `finishing-job`
- `completed`
- `failed`

UI では簡略表示のみ行う。

- phase
- `encoded / total`
- current frame

詳細な計測値や内部ログは通常 UI には出さない。

## 11. 初動最適化
- `importProjectState(..., { forExport: true })` を使う
- `waitForAnimationFrames(3)` は `1` に縮小
- export 用 import では active model 切替由来の不要な UI 同期を減らす

## 12. 既知の制約
- capture は `readPixels()` 依存なので、まだ高速化余地がある
- HDR 出力ではない
- codec UI は隠しているが、内部選択は `VP9` 前提
