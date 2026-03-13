# WebM 出力 現行仕様 / 実装

更新日: 2026-03-13

## 1. 概要

- `出力 > WebM動画` から `.webm` を保存する。
- 出力 fps は `24 / 30 / 60` を選べる。
- `音声あり` を ON にすると、読み込み済み音声を動画へ mux する。
- 動画 codec は `Auto / VP8 / VP9` を選べる。
- 既定値は `VP9`。
- 出力中は main UI を lock し、右上オーバーレイに簡略進捗を表示する。

## 2. UI 仕様

対象ファイル:

- `index.html`
- `src/ui-controller.ts`
- `src/index.css`

出力欄の項目:

- 比率
- 解像度プリセット
- 幅 / 高さ
- FPS
- codec (`Auto / VP8 / VP9`)
- `音声あり` チェック
- `PNG画像`
- `WebM動画`

補足:

- `PNG Seq` は UI から外している。
- `固定 / 比率を維持` チェックは UI から外している。
- 新規状態の codec 既定値は `VP9`。

## 3. 時間軸仕様

MMD タイムラインは 30fps 基準で扱う。

- `timelineFrameCount = endFrame - startFrame + 1`
- `totalOutputFrames = round((timelineFrameCount / 30) * outputFps)`

これにより:

- 30fps 出力では timeline 1 frame = video 1 frame
- 60fps 出力では動画フレーム数だけ増やし、再生時間は維持
- 音声付き出力でも video / audio の長さを揃える

## 4. 全体構成

### Main UI renderer

対象:

- `src/ui-controller.ts`

役割:

- 出力 UI の値を `ProjectOutputState` に保存
- `WebmExportRequest` を組み立てて main process へ渡す
- 音声付き出力時は、scene 側の再生音声は exporter へ持ち込まず、元音声ファイルの path だけ request に載せる
- background export lock と進捗オーバーレイを管理する

### Main process

対象:

- `src/main.ts`
- `src/preload.ts`
- `src/types.ts`

役割:

- WebM export job の生成 / 受け渡し
- request の sanitize
- hidden exporter window の起動
- export 中 state / progress の owner window への転送
- streamed save 用 IPC
- 完了時の exporter window close と UI lock 解放

### Exporter renderer

対象:

- `src/renderer.ts`
- `src/webm-exporter.ts`

役割:

- `takeWebmExportJob(jobId)` で job を 1 回だけ受け取る
- hidden window 上に fresh な `MmdManager` を作る
- project state を isolated scene に import する
- frame capture / encode / save を行う
- 終了時に `finishWebmExportJob(jobId)` で main process へ返す

## 5. 出力処理

対象:

- `src/webm-exporter.ts`

流れ:

1. hidden exporter window で `MmdManager.create(canvas)`
2. `importProjectState(project, { forExport: true })`
3. `setTimelineTarget("camera")`
4. 1 frame 待機
5. `pause()`, `setAutoRenderEnabled(false)`, `seekTo(startFrame)`
6. codec と bitrate を決定
7. 必要なら音声を decode / slice
8. `Output + WebMOutputFormat + StreamTarget` を開始
9. フレームごとに render / capture / encode
10. `close -> finalize -> finishWebmExportJob`

### capture 経路

現状は安定性優先で、以下を使う。

- reusable `RenderTargetTexture`
- `readPixels()`
- `VideoSample(RGBA)`

補足:

- `canvas -> VideoSample`
- `ImageBitmap -> 2D canvas -> VideoSample`

はこの環境で黒画化したため、現状は採用しない。

### フレーム進行

- 最初の 1 frame は `renderOnce(0)`
- 2 frame 目以降は
  - `mmdRuntime.playAnimation()`
  - `renderOnce(1000 / outputFps)`
  - `mmdRuntime.pauseAnimation()`

毎フレーム `seekTo(frame)` はしない。
理由は、物理が毎回テレポート扱いになって固まるため。

## 6. 音声トラック

対象:

- `src/webm-exporter.ts`

仕様:

- `音声あり` が ON かつ音声読込済みのときだけ mux する
- exporter scene 内では `StreamAudioPlayer` を使わない
- 元の音声ファイルを別経路で読み直して mux する

流れ:

1. `audioFilePath` を Electron API で binary read
2. renderer 側 `AudioContext.decodeAudioData()` で decode
3. export 範囲に合わせて `AudioBuffer` を slice
4. `AudioBufferSource` を作る
5. `output.addAudioTrack(audioSource)`
6. `audioSource.add(audioSegment)`

音声 codec:

- 優先: `opus`
- fallback: `vorbis`

音声 bitrate:

- mono: `128 kbps`
- stereo 以上: `192 kbps`

## 7. codec / bitrate

対象:

- `src/webm-exporter.ts`

動画 codec:

- UI 既定値: `VP9`
- `Auto`: `VP9 -> VP8` の順で試す
- 固定選択時はその codec だけを試す

hardware acceleration:

- まず `prefer-hardware`
- 非対応時は `no-preference`

動画 bitrate 既定値:

- 1080p30: `8 Mbps`
- 1080p60: `12 Mbps`
- 1440p30: `16 Mbps`
- 1440p60: `24 Mbps`
- 4K30: `35 Mbps`
- 4K60: `53 Mbps`

補足:

- `keyFrameInterval` は現状 `5`
- この値はまだ調整途中で、現状維持

## 8. 保存方式

対象:

- `src/webm-exporter.ts`
- `src/main.ts`

保存は streamed save を使う。

流れ:

1. exporter が `beginWebmStreamSave(filePath)` を呼ぶ
2. `StreamTarget` から chunk が出る
3. `writeWebmStreamChunk(saveId, bytes, position)` で main process へ渡す
4. close 時に `finishWebmStreamSave(saveId)`
5. エラー時は `cancelWebmStreamSave(saveId)`

完成した WebM 全体を最後に一括 IPC 転送しない。
これにより、終了時の stall を避ける。

## 9. 進捗表示

対象:

- `src/renderer.ts`
- `src/ui-controller.ts`

進捗 phase:

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

UI 表示:

- 右上オーバーレイに phase と `encoded / total` を表示
- frame 番号は表示する
- 詳細メッセージ、captured 数、計測値はユーザー表示から外した

更新頻度:

- phase 変化時は即時
- 通常の数値更新は約 1 秒ごと

## 10. 初動最適化

現状入っている軽量化:

- `waitForAnimationFrames(3)` を `1` へ削減
- export 用 import では active model 切替など UI 向け処理を一部省略

採用していない案:

- exporter window 常駐

理由:

- 普段の GPU / メモリ負荷が増える
- scene / texture / model が二重に乗る

## 11. 既知の制約

- capture は `readPixels()` ベースなので、GPU -> CPU readback が残る
- そのため encode より capture が支配的になる場面がある
- preroll は未実装なので、途中フレーム開始時の物理は厳密再現ではない
- HDR 出力は未対応
- alpha / transparency 出力 UI は未実装
- bitrate 詳細 UI は未実装

## 12. 関連ファイル

- `src/ui-controller.ts`
- `src/renderer.ts`
- `src/webm-exporter.ts`
- `src/main.ts`
- `src/preload.ts`
- `src/types.ts`
- `docs/webcodecs-mediabunny-webm-research.md`
