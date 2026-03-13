# WebM出力 現行仕様 / 実装メモ

更新日: 2026-03-13

## 概要

- `出力` パネルに `WebM` ボタンを配置している。
- 現状の WebM 出力は silent export のみ。音声 mux は未実装。
- 出力範囲は `currentFrame -> totalFrames` 固定。
- 出力 fps は `出力` パネルの `FPS` ドロップダウン (`24 / 30 / 60`) を使う。
- コーデック選択は自動で、`vp8` を優先し、非対応時は `vp9` にフォールバックする。

## ユーザーフロー

1. ユーザーが `出力 > WebM` を押す。
2. main process 経由で `.webm` の保存先を選ぶ。
3. renderer が現在の project state をシリアライズする。
4. exporter 側では音声なし動画として扱うため、`project.assets.audioPath` は `null` にして渡す。
5. main process が `mode=webm-exporter` の hidden exporter window を起動する。
6. exporter window が fresh な `MmdManager` を作って project を読み込み、フレーム capture と encode を行い、保存完了後に main へ終了通知を送る。
7. main process が exporter window を閉じ、メイン UI の lock を解除する。

## 構成

### 1. Main UI renderer

対象ファイル: `src/ui-controller.ts`

役割:

- `WebmExportRequest` の組み立て
- 出力設定の収集
  - `outputWidth`
  - `outputHeight`
  - `fps`
  - `startFrame`
  - `endFrame`
- `window.electronAPI.startWebmExportWindow(...)` による exporter 起動
- background export lock の制御
- busy overlay による進捗表示
  - phase
  - encoded / total
  - captured / total
  - 最終更新からの経過時間
  - 補助メッセージ

### 2. Main process

対象ファイル: `src/main.ts`

役割:

- WebM export job の保持
- owner window ごとの active count 管理
- hidden exporter window の作成
- progress forwarding
- completion cleanup
- streamed save 用の file write IPC 提供

### 3. Exporter renderer

対象ファイル:

- `src/renderer.ts`
- `src/webm-exporter.ts`

役割:

- `takeWebmExportJob(jobId)` で 1 回だけ job を受け取る
- fresh な Babylon / MMD runtime を `MmdManager.create(canvas)` で作る
- project state を isolated scene に import する
- frame capture -> encode -> file write を行う
- phase 付き progress を main UI に返す
- 完了時に `finishWebmExportJob(jobId)` を呼び、main に window close を任せる

## 出力パイプライン

### 1. Runtime 初期化

- `MmdManager.create(canvas)`
- `importProjectState(request.project)`
- `setTimelineTarget("camera")`
- `pause()`
- `setAutoRenderEnabled(false)`

export は専用 window 内の isolated scene で行う。メイン UI 側の scene は直接使わない。

### 2. フレーム進行

現在は、物理が止まりにくいように「毎フレーム hard seek」ではなく、連続時間で進める方式にしている。

- 最初のフレーム:
  - `seekTo(startFrame)`
  - `renderOnce(0)`
- 2 フレーム目以降:
  - `mmdRuntime.playAnimation()`
  - `renderOnce(1000 / fps)`
  - `mmdRuntime.pauseAnimation()`

`renderOnce()` は auto render を切った状態でも固定 delta で 1 回 Babylon render を進められるようにしてあり、以下の更新を 1 フレーム分進める前提になっている。

- 物理
- カメラアニメーション
- post effect 状態
- render target 更新

### 3. フレーム capture

- Babylon の reusable `RenderTargetTexture` を 1 枚使い回す
- 旧実装の `CreateScreenshotUsingRenderTargetAsync()` は使用しない
- 各フレームで以下を行う
  - `resetRefreshCounter()`
  - render target へ描画
  - `readPixels(...)`
  - RGBA `Uint8Array` 化
  - 上下反転を in-place で実施

これにより、screenshot helper を毎フレーム生成していた頃より capture コストを下げている。

### 4. MediaBunny 入力

- `VideoSampleSource` を使用
- capture した RGBA を 1 フレームごとに `VideoSample` 化して追加
- `frameRate` を track metadata に渡す
- `maximumPacketCount` に総フレーム数を渡す

### 5. MediaBunny 出力

- `Output + WebMOutputFormat + StreamTarget` を使用
- `.webm` 全体を最後に 1 回で IPC 転送する方式は廃止
- 現在は chunk 単位で main process へ流して保存する

## 保存経路

現在の保存は streamed save で行う。

1. exporter が `beginWebmStreamSave(filePath)` を呼ぶ
2. `StreamTarget` から chunk が出る
3. 各 chunk を `writeWebmStreamChunk(saveId, bytes, position)` で main process へ渡す
4. writer close 時に `finishWebmStreamSave(saveId)` を呼ぶ
5. 失敗時は `cancelWebmStreamSave(saveId)` を呼んで途中ファイルを破棄する

この構成にした理由は、完成済み WebM バッファ全体を最後に IPC で渡すと、出力終了直後に大きな stall が起きやすかったため。

## IPC 一覧

### UI / job 制御

- `dialog:saveWebm`
- `export:startWebmWindow`
- `export:takeWebmJob`
- `export:finishWebmJob`
- `export:webmProgress`

### streamed save

- `file:beginWebmStreamSave`
- `file:writeWebmStreamChunk`
- `file:finishWebmStreamSave`
- `file:cancelWebmStreamSave`

## 進捗 phase

`WebmExportProgress.phase` は現在以下を使う。

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

main UI の busy overlay はこの phase を使って現在位置を表示する。

## finalize / cleanup の注意点

`finalize()` の診断をしやすくするため、内部的には以下の段階を分けて扱っている。

1. track source flush
2. muxer finalize
3. writer flush
4. writer close

運用上の重要点:

- `MediaBunny` 側の finalize が終わっていても、その後の Babylon / physics teardown で exporter renderer が止まることがある
- このため、成功時の exporter 側では重い同期 `mmdManager.dispose()` を待たない
- 実リソース解放は dedicated exporter window の close に任せる

## 現状の制約

- 音声 mux 未実装
- export range UI 未実装
- codec 選択 UI 未実装
- bitrate UI 未実装
- alpha / transparency UI 未実装
- capture はまだ `readPixels()` ベースなので、GPU -> CPU readback が重い
- 連続時間で進めるようにはしたが、途中フレーム開始時の物理再現を厳密に合わせる preroll は未実装

## 既知のボトルネック / リスク

- `output.finalize()` は依然として重い処理
- `window.isSecureContext` 前提
- `vp8` / `vp9` の encode 速度は環境差が大きい
- main renderer 内で直接 export すると UI / GPU / encode の競合が増えるので、現状は hidden exporter window 分離を前提とする

## 関連ファイル

- `src/ui-controller.ts`
- `src/renderer.ts`
- `src/webm-exporter.ts`
- `src/main.ts`
- `src/preload.ts`
- `src/types.ts`
- `docs/webcodecs-mediabunny-webm-research.md`
