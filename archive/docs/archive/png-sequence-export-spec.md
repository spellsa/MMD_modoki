# 連番PNG出力 仕様・実装メモ

更新日: 2026-08-09

## 目的

- MMD_modoki の現在シーンを、フレーム単位で PNG 連番として保存する。
- 編集UIと書き出し処理を分離し、出力中の誤操作を防ぐ。

## 現行仕様（ユーザー視点）

1. 再生欄の `PNG Seq` ボタンで開始する。
2. 出力先フォルダを選択すると、即時に連番出力が始まる（追加確認なし）。
3. 出力対象フレーム:
   - 開始: 現在フレーム
   - 終了: 現在の totalFrames
   - ステップ: 1
4. 出力解像度は固定 `1920x1080`（16:9）。
5. 出力FPSパラメータは `30` で送る（後述の通り、現実装では時間進行に未使用）。
6. 選択フォルダ直下に連番用サブフォルダを自動作成する。
   - 例: `mmd_seq_20260224_153000_0-6543_s1`
7. ファイル名:
   - `mmd_seq_0000.png` 形式（桁数は終了フレームに応じて最低4桁）。

## UI挙動

- 出力中、メインウィンドウには `ui-export-lock` が付き、編集UIは操作不能になる。
- 進捗オーバーレイに `saved/total/frame` を表示する。
- 出力中は以下を抑止:
  - キーボード操作
  - ドラッグ&ドロップ読込
  - ウィンドウクローズ（警告を出して閉じさせない）

## 実装アーキテクチャ

### 1. Main UI (renderer)

- `UIController.exportPNGSequence()` でジョブ要求を作る。
- `mmdManager.exportProjectState()` の結果を送る。
- 出力用リクエスト値:
  - `startFrame`, `endFrame`, `step`, `prefix`
  - `fps`, `precision`
  - `outputWidth`, `outputHeight`
- 出力中状態は IPC イベントで受け取り、`ui-export-lock` と進捗表示を更新。

### 2. Main process

- `export:startPngSequenceWindow` でジョブを受け取る。
- 入力値をサニタイズ後、`jobId` を発行してジョブを Map に保持。
- `mode=exporter&jobId=...` でエクスポート専用レンダラーを起動する。
- オーナーウィンドウごとに activeCount を持ち、状態/進捗を通知する。
- 単発PNGは `file:savePngBytes`、連番PNGは `file:savePngBytesToPath` で保存する。
  - renderer Web Workerが生成した圧縮済みPNGだけを受け取る。
  - mainはPNG signature、filename、pathを検証し、保存ダイアログと非同期file writeだけを行う。
- 比較用旧経路として `file:savePngRgbaToPath` と `nativeImage.toPNG()` を一時的に残す。
  - `MMD_MODOKI_PNG_ENCODER=main`指定時だけ使用する。

### 3. Exporter renderer

- 起動時に `mode=exporter` を検出して通常UI初期化をスキップ。
- `takePngSequenceJob(jobId)` でジョブを1回取得。
- `runPngSequenceExportJob()` を実行。
  - 新規 `MmdManager` を作成
  - project state を export 用として import
  - ジョブ寿命の `ExportRenderSurface` (`rgba8unorm`) を1枚作成
  - FrameGraph / Classic の最終出力を同じ surface へ接続
  - フレームごと `seekTo(frame)` -> render -> surface readback -> Web Worker queue投入
- 2本のWeb WorkerでRGBA8を直接PNG化する。
  - color type 6 / 8bit / filter None / non-interlace
  - `CompressionStream("deflate")`
  - PNG signature / IHDR / IDAT / IEND / CRC32をrenderer側で構築
- raw RGBAはWeb Workerへ`ArrayBuffer` transferし、main IPCへは送らない。
- 進捗は一定間隔で main UI に report する。

単発PNGも同じencoderを使用するが、1枚だけなのでpool sizeは1固定とする。連番PNGはdefault 2 workers。

`CreateScreenshotUsingRenderTargetAsync()` による毎フレームの RTT 作成・再描画・破棄は
2026-08-09 に撤去した。readback 後の renderer 内契約は top-to-bottom / RGBA / 8bit / sRGB。
共通surfaceのclass責務と約70倍になったcapture改善の説明は
[共通 RGBA Surface 出力 実装メモ](./export-render-surface-implementation-note-2026-08-09.md)を参照。

## 保存処理（Web Worker / 速度優先）

- キャプチャ生産者 + Web Worker encoder pool + 保存消費者のキュー方式。
- 現在の固定値:
  - default worker数: 2
  - capture queue: `poolSize * 2`
  - queued + active raw byte budget: 256MiB
  - worker timeout: 120秒
- Web Workerから返ったPNG bytesを `savePngBytesFileToPath()` で保存する。
- filter Noneは無圧縮ではなく、その後にdeflate可逆圧縮を行う。
- worker error / message error / timeout時はtaskを失敗させ、workerを再生成する。
- hidden exporter終了時はpending taskをrejectしてworkerを`terminate()`する。

## データ型

- `PngSequenceExportRequest`
  - `project`, `outputDirectoryPath`, `startFrame`, `endFrame`, `step`
  - `prefix`, `fps`, `precision`, `outputWidth`, `outputHeight`
- `PngSequenceExportState`
  - `active`, `activeCount`
- `PngSequenceExportProgress`
  - `jobId`, `saved`, `captured`, `total`, `frame`
- `PngSequenceExportDiagnostics`
  - capture / encode / filter / deflate / assemble / save IPC / write時間
  - worker pool数、raw bytes peak、worker再生成回数、encoded bytes

## 現状の制限

1. `fps` / `precision` はリクエストにはあるが、時間進行制御に未使用。
2. エクスポート用ウィンドウは内部実行向け設定（`show: false`）で、基本は非表示運用。
3. 高負荷シーンではGPUキャプチャ側が律速になり、IO/GPU使用率が低く見えても速度が伸びにくい場合がある。
4. 背景透過 mode と straight alpha の合成確認は未実装。
5. hidden exporter の終了時 resource cleanup は window teardown に依存している。
6. 500〜1000frame、4K / 8K、slow diskのhardeningは未完。

## 今後の改善候補

1. `fps` を実際の時間進行・物理更新ステップに反映する。
2. `precision` パラメータの意味を明確化して有効化する。
3. 出力プリセット（1080p/1440p/4K、開始/終了範囲）をUIから選択可能にする。
4. main event-loop delayを追加計測し、500〜1000frameと4K / 8Kでmemoryを確認する。
5. opaque / transparent mode、clear alpha、非対応 PostFX の警告を追加する。
6. 単発8K PNG向けにscanlineを分割して`CompressionStream`へ投入し、filter済み全量バッファをなくす。
7. 長尺・高解像度確認後に旧main-thread比較fallbackを削除する。

Web Worker実装と1920×1080・100frame性能結果は
[連番 PNG Web Worker 実装・性能評価](./png-sequence-web-worker-implementation-evaluation-2026-08-09.md)を参照。
