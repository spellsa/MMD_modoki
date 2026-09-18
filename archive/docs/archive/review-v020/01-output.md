# v0.2.0 リリース前レビュー: 動画・画像出力系

- レビュー日: 2026-07-03
- 対象テーマ: PNG出力 / WebM出力 / WebGPU readback / FrameGraph post stack の出力反映
- 深刻度タグ: [Blocker] = リリース前必須 / [Later] = v0.2.x 送り可

---

## 1. src/png-sequence-exporter.ts (264行, 全読)

### 概要

PNG連番出力のジョブ本体。専用 canvas 上に新規 `MmdManager` を作ってプロジェクトを import し、
`CreateScreenshotUsingRenderTargetAsync`(Babylon の RTT 再レンダリング方式)でフレームごとに RGBA を取得、
producer(キャプチャ)/ consumer(ファイル保存 ×4 並列)のキュー構成で `savePngRgbaFileToPath`(Electron IPC)へ渡す。

### 指摘

- **[Blocker] FrameGraph post stack が PNG 連番出力に反映されない疑い(観点1)**
  `captureFrameRgbaAsync()` は無条件に `CreateScreenshotUsingRenderTargetAsync` を使う(L70)。
  この方式はシーンを別 RenderTargetTexture に再レンダリングするため、メイン出力に対して適用される
  FrameGraph post stack(Bloom / Offset Rim / LUT 等)がかからない。
  さらに `mmd-manager.ts` L8102 付近には「Babylon の screenshot ヘルパーは MirrorTexture + FrameGraph と
  衝突するため、FrameGraph 有効時は webgpu-copy キャプチャに切り替える」という主旨のコメントと分岐が
  存在する(単発 PNG キャプチャ側)。つまり単発 PNG は FrameGraph 対応済みだが、連番出力は未対応のまま。
  → 画面表示と連番 PNG の見た目が不一致になる。v0.2 branch summary の残項目
  「PNG / WebM 出力で FrameGraph post stack が反映されるか確認する」に直結。
  ※ mmd-manager.ts 読解時に単発キャプチャ側の実装を確認して確定させる
  (→ セクション5で確定。ただし当初想定と異なり、`capturePngRgbaData`(フレームバッファ直読み)へ
  切り替えるだけでは不十分。renderOnce 駆動の export では post stack 自体が実行されないため、
  根本原因はセクション5の Blocker を参照)。

- **[Later] キャンセル(中断)手段がない(観点3)**
  `runPngSequenceExportJob` には abort signal / cancel フラグが一切ない。エクスポート開始後は
  全フレーム完了か fatalError まで止められない。ウィンドウを閉じた場合の挙動は呼び出し側
  (export-ui-controller / export window)次第。長尺連番では実運用上つらいが、
  「中断できない」だけならデータ破損はしないので Later。
  ※ 呼び出し側でウィンドウ close 時に dispose だけ走るなら、実行中ジョブが dispose 済み
  manager を触ってエラー終了する可能性がある。呼び出し側読解時に確認。

- **[Later] `precision`(qualityScale)が出力解像度そのものを変える(観点3周辺)**
  capture サイズ = `outputWidth/Height × qualityScale` で、保存される PNG は capture サイズのまま
  (ダウンスケールなし、L119-120 / L241-242)。「precision」という名前から期待される
  スーパーサンプリング(高解像度で撮って指定解像度へ縮小)ではなく、ファイル解像度自体が
  指定値の 0.25〜4 倍になる。仕様どおりなら OK だが、UI 表記と実挙動の一致を要確認。

- **[Later] consumer の保存エラーが fatalError 経由と例外経由の二重系統**
  `savePngRgbaFileToPath` が `null` を返すと fatalError(L197-199)、reject すると
  `consumeQueue` 自体が reject して `Promise.all` 経由で伝播(L249)。どちらも最終的に throw され
  finally で dispose されるので事故にはならないが、reject 時は他 consumer がバックグラウンドで
  キューを消化し続ける(producerDone 後に自然終了するので実害は小)。

### 問題なしと確認した点

- 終了処理: `finally` で `setAutoRenderEnabled(true)` → `dispose()`(L260-263)。エラー時も
  export 用 manager は破棄される(観点2・3)。
- RTT は Babylon 側が capture ごとに生成・破棄するため、蓄積型の GPU リークはない。
- `flipRgbaRowsInPlace` の上下反転ロジックは正しい(swap buffer 方式、奇数高さの中央行も正しく無変更)。
- producer / consumer の fatalError 連携で、保存失敗時にキャプチャ側も停止する。

---

## 2. src/webm-exporter.ts (888行, 全読)

### 概要

WebM出力ジョブ本体。mediabunny(WebCodecs)で VP9/VP8 + Opus/Vorbis をエンコードし、
Electron IPC のストリーム保存(`beginWebmStreamSave` / `writeWebmStreamChunk` / `finishWebmStreamSave`)へ書き出す。
キャプチャは3モード: `webgpu-copy`(既定 / `engine.readPixels` でメインフレームバッファ読み出し)、
`readpixels`(安定 / RTT 再レンダリング + `renderTarget.readPixels`)、`canvas`(canvas から VideoSample 直生成)。
producer(フレーム進行+キャプチャ)/ consumer(エンコード)のキュー構成(maxQueueLength=16)。

### 指摘

- **[Blocker] consumer(エンコード側)失敗時に producer がデッドロックする(観点2・3)**
  `consumeQueue()` 内の `videoSource.add(item.videoSample)`(L735)が throw / reject すると
  `consumeQueue` 自体が reject するが、**`fatalError` には何も設定されない**。
  producer 側のバックプレッシャー待ち `while (queue.length >= maxQueueLength && !fatalError) await sleepMs(1)`(L777)
  は queue が消化されない+fatalError が立たないため**無限ループ**になる。
  `await consumerPromise`(L824)は producer ループを抜けた後の finally にあるので到達しない。
  → WebCodecs エンコーダエラー(HWエンコーダの途中失敗等)が起きると、UI は「WebM出力中」のまま永久に固まり、
  ファイルハンドル(saveSession)も開きっぱなしになる。
  修正は `consumeQueue` 内を try/catch で包み `fatalError` に設定するだけで済む。
  発生条件は「エンコーダエラー + キュー満杯(16フレーム以上残っている)」で、長尺出力では容易に成立する。

- **[Blocker] `readpixels`(安定)モードでは FrameGraph post stack が出力に乗らない(観点1)**
  `createReadPixelsFrameCapture` は専用 RTT にシーンを再レンダリングして読み出す(L193-215)。
  RTT 再レンダリングには FrameGraph post stack(Bloom / Offset Rim / LUT 等)がかからないため、
  post effect 有効時は**画面と出力が別物になる**(PNG 連番と同型の問題)。
  さらに問題なのは、既定の webgpu-copy が失敗した際のエラーメッセージが
  「Try readPixels (stable) or canvas / VideoFrame.」(L310)と、効果が落ちるモードへ**無警告で誘導**していること。
  最小修正案: 安定モード選択時/誘導メッセージに「post effect 非対応」の明示を入れる
  (完全対応は v0.2.x 送りでも、無警告の見た目乖離はリリース前に塞ぎたい)。
  なお mmd-manager 側コメント(L8102 付近)によれば screenshot 系 RTT パスは
  MirrorTexture + FrameGraph と衝突する既知問題もあり、安定モードが FrameGraph 有効時に
  validation エラーを出す可能性もある(mmd-manager 読解時に再確認)。

- **[Later] `withTimeout` がタイムアウト後の元 promise を放置 → unhandled rejection(観点2)**
  `Promise.race`(L116)でタイムアウト側が先に reject した場合、負けた readPixels promise が
  その後 reject すると unhandled promise rejection になる(コンソールエラー、Electron では
  グローバルハンドラ次第でダイアログ)。また in-flight readback の staging buffer は
  resolve まで解放されないが、タイムアウト時は export 自体が中断されるので蓄積はしない。
  `promise.catch(() => {})` を race の後に付けるだけで消せる。

- **[Later] WebM exporter は `mmdManager.dispose()` を意図的に呼ばない(観点3)**
  外側 finally(L883-887)は `setExternalPlaybackSimulationEnabled(false)` のみで、
  dispose はコメント付きで意図的に省略(専用非表示ウィンドウの teardown に委ねる)。
  `setAutoRenderEnabled(false)` も戻していない。**同一ウィンドウで連続出力する設計になっていた場合**、
  同じ canvas に MmdManager が二重生成され GPU リソースリークになる。
  → export-ui-controller 読解時にウィンドウのライフサイクル(1出力=1ウィンドウか)を要確認。

- **[Later] `finalizeWebmOutputWithDiagnostics` が mediabunny の private 内部に依存**
  `_finalizePromise` / `_tracks` / `_muxer` / `_writer` / `_mutex` / `state` を直接操作(L483-522)。
  mediabunny のバージョンアップで黙って壊れる。診断ログ目的なのは理解できるが、
  v0.2.x で公式 `output.finalize()` + 進捗イベントに寄せる検討を推奨。

- **[Later] `copyBgraToRgba` が webgpu-copy の出力を無条件 BGRA と仮定(L300)**
  Electron デスクトップの WebGPU canvas は事実上 bgra8unorm なので現状は正しいが、
  `navigator.gpu.getPreferredCanvasFormat()` が rgba8unorm を返す環境では R/B が入れ替わる。
  フォーマット確認を入れるなら1行で済む。

### 問題なしと確認した点

- クリーンアップは網羅的(L847-882): output.cancel(5秒タイムアウト付き)、saveSession の cancel、
  キュー内 VideoSample の close、frameCapture.dispose(RTT破棄 / バッファプール解放)。
  WebCodecs の VideoFrame リークは finally で塞がれている(観点2)。
- キャプチャに 8 秒、finalize に 15 秒のタイムアウトがあり、GPU 側ストール時も
  (上記デッドロックを除き)ハングしない設計。
- webgpu-copy の RGBA バッファはプール再利用(acquire/release)で、フレームごとの
  大量アロケーションを回避しつつ videoSample.close 後にのみ返却しており正しい。
- 音声: AudioContext は decode 後 close、スライス範囲計算(startFrame/30秒起点)も正しい。
- 出力ストリーム: close で `finishWebmStreamSave`、abort/エラー時は `cancelWebmStreamSave` と
  saveSessionId の null 化が対になっており、二重 finish/cancel はない。

---

## 3. src/ui/webm-export-dialog-controller.ts (285行, 全読)

### 概要

WebM出力設定ダイアログ。アスペクト/サイズプリセット/解像度/fps/音声/フレーム範囲/キャプチャモードを
`WebmExportSettingsAdapter` 経由で export-ui-controller 側の状態へ書き込み、
Export ボタンで `project.exportWebm` アクションを dispatch して閉じるだけの薄いフォーム。

### 指摘

- **[Later] Export ボタンに二度押しガードがない(観点3)**
  Export クリックで `syncAllToOutputState()` → `dispatchAction({type:"project.exportWebm"})` → `close()`(L90-94)。
  ボタン自体の disable がないため、close 前の連打で exportWebm が複数回 dispatch されうる。
  実害の有無は受け側(export-ui-controller)の実行中ガード次第 → 次セクションで確認
  (→ セクション4で確認: **受け側に実行中ガードは存在しない**。`exportWebm()` は
  `hasBackgroundExportActive()` を見ずに起動する。連打で保存ダイアログの多重表示や
  ジョブ並走が起こりうる。多重ジョブは activeCount 表示があり設計上許容らしいが、
  連打由来の意図しない多重起動は防ぐ価値がある。Later のまま、詳細はセクション4)。

- **[Later] キャプチャモード選択肢に post effect 対応状況の注記がない(観点1関連)**
  セクション2の指摘のとおり `readpixels`(安定)は FrameGraph post stack が乗らないが、
  このダイアログのモード選択 UI にその注記がない。文言追加はここ(`WEBM_CAPTURE_MODE_OPTIONS`
  の labelKey)か i18n 側で対応可能。

### 問題なしと確認した点

- 数値入力は Enter コミット + revert 方式(`installEnterCommitNumberInput`)で、
  parse 失敗時は fallback 値に落ちる。範囲サニタイズは `output.sanitizeFrameRange` アクションに委譲。
- ダイアログはあくまで設定書き込みのみで、出力実行状態は持たない。中断・復帰の状態管理は
  export-ui-controller 側に集約されている構造(観点3の主戦場は次ファイル)。

---

## 4. src/ui/export-ui-controller.ts (1039行, 全読)

### 概要

出力系 UI の中枢。出力解像度/アスペクト/フレーム範囲の状態管理、単発 PNG(`exportPNG`)、
PNG 連番(`exportPNGSequence`)、WebM(`exportWebm`)の起動、およびバックグラウンド出力の
状態ブリッジ(IPC イベント購読 + busy オーバーレイ + `ui-export-lock`)を持つ。
連番/WebM は `startPngSequenceExportWindow` / `startWebmExportWindow` IPC で
**別の非表示ウィンドウ**にジョブを投げる構造(1ジョブ=1ウィンドウと推定)。

### 指摘

- **[Later] 出力起動に実行中ガードがない(観点3)**
  `exportWebm()` / `exportPNGSequence()` は `hasBackgroundExportActive()` を確認せずに起動する。
  activeCount(複数ジョブ並走)表示が用意されているので多重ジョブは設計上許容と見えるが、
  並走ジョブはそれぞれ非表示ウィンドウ+WebGPU エンジン+プロジェクト全ロードを持つため
  VRAM/CPU 負荷が大きい。ダイアログ連打による「意図しない」多重起動だけでも防ぐ価値がある。

- **[Later] PNG 連番の出力フォルダ名が秒精度タイムスタンプ(観点3)**
  `buildPngSequenceFolderName` は秒までのタイムスタンプ(L596-601)。同一秒内に2ジョブ起動すると
  同一フォルダに書き込み、同名ファイルが相互上書きされる。上のガード無しと組み合わさると現実に起こりうる。

- **[Later] バックグラウンド出力の失敗がメインウィンドウでトーストされない可能性(観点3)**
  出力終了は `onWebmExportState` の active=false で受け、オーバーレイを隠して
  busyText(非表示要素)を書き換えるだけ(L952-963)。失敗時の phase="failed" progress が
  state=inactive より先に来る保証もない。失敗通知の主体が main process 側にあるなら問題ないが、
  このファイルの範囲では「失敗しても静かに overlay が消えるだけ」に見える。
  main.ts は今回対象外のため未確認 — リリース前に手動確認1回を推奨
  (WebM 出力を意図的に失敗させ、メインウィンドウに何が出るか)。

- **[情報] 単発 PNG(`exportPNG`)は第3のキャプチャ経路**
  `saveCanvasSnapshotPngFile(canvasClientRect, ...)`(L399-404)で、メインプロセス側の
  ウィンドウ合成結果スナップショット(capturePage 系)と推定。表示そのものを撮るので
  **FrameGraph post stack は必然的に反映される**(観点1はOK)。ただし実効解像度は
  ウィンドウの canvas 表示サイズ×devicePixelRatio が上限で、指定解像度へは拡縮になるはず。
  「単発 PNG だけ画質が甘い」というフィードバックが来たらここが原因。
  なお mmd-manager 側の `capturePngDataUrl` / `capturePngRgbaData` とは別経路であり、
  どちらが実際の UI 導線から呼ばれるかは mmd-manager / 呼び出し元の確認事項(次セクション)。

### 問題なしと確認した点

- `exportPNG` はオーバーレイ抑制(`setCaptureEditorOverlaysSuppressed(true)`)と
  `png-capture-mode` クラスを **finally で必ず復帰**しており、失敗・キャンセル時の
  状態復帰漏れはない(観点3)。2×rAF の paint 待ちも入っている。
- 出力中は `refreshBackgroundExportLock` が再生を強制 pause し、UI を `ui-export-lock` で
  ロックする。終了時にロック解除も対で行われる。
- `dispose()` で IPC 購読解除と監視 interval 解除が揃っている。
- フレーム範囲のサニタイズ(clamp、start<=end 強制)は入力経路・project 復元経路の双方にある。
- WebM 起動時に音声ファイルが無い場合は includeAudio を落としてトースト通知する(黙って無音になる事故はない)。
- project へは `audioPath: null` を入れて export ウィンドウ側での二重音声ロードを避けている。

---

## 5. src/mmd-manager.ts (11046行, 部分読)

読んだ範囲: capture 系メソッド(L7979-8130)、overlay 抑制(L3259)、
`setExternalPlaybackSimulationEnabled`(L4037)、`setAutoRenderEnabled` / `renderOnce`(L10757-10786)、
自動レンダーループ(L4457-4550)、FrameGraph stack setter / rebuild / backend 初期化(L7248-7307, L7617-7925)。
加えて `forExport` の実体確認のため src/project/project-importer.ts の該当ブロック
(L297-360, L1001-1018)を対象追加して部分読した(effects/frameGraphPostStack 復元が
export 用 import でも実行されることの確認のみ。当初計画から の追加分)。

### 出力パイプラインの実際の構造(確定事項)

- FrameGraph post stack は Babylon の `scene.frameGraph` 統合では**なく**、
  `FrameGraphPostEffectsController` を **自動レンダーループが明示的に実行**する方式:
  `runRenderLoop` 内で `scene.render()` → `executePostEffectBackend()`(L4500-4511)。
  シーン本体は camera.customRenderTargets 上の sceneColorTarget へ描かれ、
  controller がそれを入力に post chain を実行して画面へ合成する。
- `renderOnce()`(L10764-10786)は `scene.render()` のみで
  **`executePostEffectBackend()` を呼ばない**。`syncFrameGraphRenderTargetState()` も呼ばない。
- export 用 MmdManager でも backend は構築時+stack 復元時の rebuild で初期化される
  (`initializePostEffectBackend` L7248、`refreshFrameGraphPostEffectsBackendForOrderChange` L7903)。
  project-importer は `forExport: true` でも effects と `frameGraphPostStack` を省略せず復元する。

### 指摘

- **[Blocker] WebM 出力は全キャプチャモードで FrameGraph post stack が反映されない(観点1・最重要)**
  webm-exporter は `setAutoRenderEnabled(false)` + `renderOnce()` でフレームを進める。
  自動レンダーループは `autoRenderEnabled=false` で即 return するため(L4465-4469)、
  post stack を実行する唯一の経路 `executePostEffectBackend()` が **export 中は一度も走らない**。
  したがって:
  - `webgpu-copy`(既定): フレームバッファには post 合成前の素のシーンしかなく、それを読み出す
  - `readpixels`(安定): RTT 再レンダリング(そもそも post 経路外)
  - `canvas`: 同じく post 未合成の canvas を撮る
  → **post effect を使ったプロジェクトでは、画面と WebM 出力が必ず不一致**。
  セクション2の readpixels 指摘は本問題の部分集合だった(erratum: 「既定モードなら一致」
  という前提で書いたが誤り。既定モードも不一致)。
  修正方向: `renderOnce()` に `syncFrameGraphRenderTargetState()` + `executePostEffectBackend()` を
  組み込む(自動ループと同じ順序)か、export 専用の `renderOnceForCapture()` を追加して
  webm-exporter から使う。PNG 連番(セクション1)もこの上に載せ替えれば同時に解決する。
  ※ 単発 PNG(export-ui-controller の compositor snapshot 方式)だけは自動ループ描画を
  撮るため一致する — 現状唯一 post stack が正しく乗る出力。

- **[Later] `capturePngDataUrl` の MirrorTexture+FrameGraph 回避分岐が死んでいる(観点1)**
  L8101 の条件 `this.mirroringFloorEnabledValue && this.scene.frameGraph` のうち
  `scene.frameGraph` は **コードベース中どこにも代入されていない**(常に falsy)。
  つまり「screenshot ヘルパーと MirrorTexture+FrameGraph の衝突を避けて直読みに切り替える」
  分岐は一度も発動しない。正しくは `this.postEffectBackend === "frameGraph"`(または
  controller の有無)を見るべき。なお `capturePngDataUrl` / `capturePngRgbaData` は
  現在 src 内に呼び出し元がないため実害は顕在化していないが、
  生きている API として残すなら条件を直すこと。呼ぶ予定がないなら削除候補。

- **[Later] `captureCurrentFramebufferPngRgbaData` にタイムアウトがない(観点2)**
  webm-exporter 側の readback は 8 秒タイムアウト付きだが、こちらの
  `engine.readPixels`(L8012)は裸 await。GPU ストール時は永久待ちになる。
  現状呼び出し元がないため Later。使う際は webm-exporter の `withTimeout` 相当を移植すること。

- **[Later] リサイズ拡縮が 2D canvas `drawImage` 頼み(L8030-8036)**
  補間品質は既定(smoothing あり)で、縮小時の品質は用途次第。実害は小さいが、
  精密キャプチャ用途なら `imageSmoothingQuality = "high"` 指定を検討。

### 問題なしと確認した点

- `setCaptureEditorOverlaysSuppressed` は単純なフラグ+ visualizer 同期のみで、
  例外を投げる要素がなく、export-ui-controller の finally 復帰と合わせて復帰漏れはない(観点3)。
- BGRA→RGBA 変換は WebGPU エンジン時のみ適用で正しい(WebGL は RGBA のまま)。
- stack setter(`setFrameGraphPostEffectStackEntries` L7792)は ID 正規化・enabled 差分検出付きで、
  変更がない場合は rebuild を呼ばない(無駄 rebuild なし)。
- rebuild は「dispose → initialize」の全再構築方式で、docs の方針
  (live reconnect 禁止、rebuild に寄せる)と実装が一致している。
- backend 初期化失敗時は classic へフォールバックし、sceneColorTarget / luminousMask を
  破棄してから切り替えるためリークしない(L7295-7299)。
- レンダーループには FrameGraph render target 失敗の自動リカバリがあり
  (`tryRecoverFrameGraphRenderTargetFailure` L7698)、失敗時は classic へ落として継続する。

---

## 6. src/render/post-effect-backend.ts (26行, 全読)

### 概要

backend 種別(`"classic" | "frameGraph"`)の型と、localStorage
(`mmd_modoki.postEffectBackend`)からの読み出し・正規化のみ。

### 指摘

- **[Later] export ウィンドウの backend 選択は localStorage 共有前提(観点1関連)**
  `MmdManager` は構築時に `readPostEffectBackendLocalStorage()`(fallback "classic")で backend を
  決める(mmd-manager.ts L1411)。export 用非表示ウィンドウが main ウィンドウと同じ
  origin / session partition を共有していれば同じ backend になるが、これは main process の
  ウィンドウ生成設定(今回対象外)に依存する暗黙の前提。もし partition が分かれていると
  export 側だけ classic に落ち、画面と出力の効果差の一因になる。手動確認またはコメント明文化を推奨。

### 問題なしと確認した点

- 正規化は大小文字・区切り揺れを吸収し、未知値は fallback。localStorage 例外も握って fallback。
  既定が "classic"(FrameGraph はオプトイン)であることも docs の「実験寄り」方針と一致。

---

## 7. src/render/effects-pipeline-controller.ts (469行, 全読)

### 概要

post effect パラメーターの get/set ヘルパー集(host = MmdManager への薄い委譲)。
LUT 外部ファイル、fog / motion blur / SSR / VLS、DoF 一式。出力パイプライン自体は持たない。

### 指摘

- **[Later] `postEffectBackend` の型がここだけ `"classic" | "frameGraph" | "experimental"`(L37)**
  post-effect-backend.ts の正式型は 2 値。構造的型付けなので実害はないが、
  "experimental" 分岐はどこにも存在せず、読み手を迷わせる。型を共通 import に寄せるとよい。

### 問題なしと確認した点

- `setPostEffectExternalLut` は変更検出付きで、旧 blob URL を `revokeObjectURL` してから
  差し替えており、外部 LUT の連続差し替えでもリークしない(観点2)。
- `setDofEnabled` の frameGraph 分岐は、状態変化時のみ
  `refreshFrameGraphPostEffectsBackendForResourcePlanChange()` で rebuild を要求し、
  classic pipeline の DoF を必ず無効化して**二重適用を防いでいる**(docs の
  「Classic / FrameGraph の二重適用を避ける」方針と一致)。
- 各 setter は clamp 付きで、fog start/end の整合(end >= start + 0.01)も守られる。

---

## 8. src/render/frame-graph-post-effects-controller.ts (3211行, 部分読)

読んだ範囲: `isActive`/`isReady`/診断(L1995-2078)、`activate` の入口と出口(L2080-2144, L2680-2724)、
`execute`(L2726-2843)、`connectPostEffectOrder`(L2849-2971)、`dispose`(L2980-3057)、
LUT テクスチャ管理(L3078-3117)。効果ごとの task 構築部(L2144-2680)は接続関係の把握に必要な範囲のみ。

### 出力反映の構造(確定事項)

- 最終出力は `FrameGraphCopyToBackbufferColorTask`(L2690)で **backbuffer(canvas)へコピー**する。
  つまり post 適用済みの絵は execute() が走ったときだけ canvas に載る。
  セクション5の Blocker(renderOnce が execute を呼ばない → export 中は素の絵)の裏付け。
- `activate()` は同期で task 群を構築後、`buildAsync()` を **fire-and-forget** で開始し(L2706)、
  完了時に `ready = true`。`execute()` は `!ready` の間は何もしない(L2727)。

### 指摘

- **[Blocker 補足] export 側で post stack を実行する修正を入れる場合、`ready` 待ちが必須(観点1)**
  セクション5の修正(renderOnce に executePostEffectBackend を組み込む等)を入れても、
  export 用 MmdManager では importProjectState 直後に backend rebuild が走り、
  `buildAsync` 完了までは execute() が no-op のため**冒頭数フレームだけ素の絵になる**。
  webm-exporter / png-sequence-exporter 側でキャプチャ開始前に
  `isReady()`(または executedFrameCount>0)を待つ処理を併せて入れること。
  現状 webm-exporter の `waitForAnimationFrames(1)` では保証にならない。

- **[Later] activity threshold をまたぐパラメーター変更で効果がチェーンに入らない(既知問題の機構確認)**
  `connectPostEffectOrder` は **build 時点で disabled の task をチェーンから除外**する
  (例: L2932 `if (this.sharpenTask && !this.sharpenTask.disabled)`)。
  `execute()` は毎フレーム disabled を更新するが(L2809-2829)、接続は build 後固定なので、
  build 時に無効だった効果(例: sharpenEdge=0 で build → 後から >0 に変更)は
  rebuild が走るまで **enabled にしても出力チェーンに乗らない**。
  逆(接続済み task を disabled にする)は FrameGraph の passthrough で正しく機能する。
  docs の「active threshold をまたぐパラメーター変更時の resource rebuild 条件整理」が
  まさにこれ。画面と出力は同じ絵になる(=観点1の不一致ではない)ため Later だが、
  v0.2.x でパラメーター setter 側の rebuild 条件を詰めること。

- **[Later] `emitWarningOnce` は最初の1回しか警告を出さない(L2973-2978)**
  build 失敗 → classic fallback 後、ユーザーが stack を操作して再 rebuild →
  再失敗しても 2 回目以降の失敗理由は表示されない(インスタンスが作り直されれば
  リセットされるので実害は限定的。挙動として把握しておく)。

### 問題なしと確認した点

- `dispose()` は effect wrapper / task / LUT texture / FrameGraph 本体を漏れなく破棄し、
  状態フラグも全リセット。rebuild(dispose→activate)を繰り返しても蓄積リークしない(観点2)。
- `execute()` 中の例外は catch して active=false に落とし、mmd-manager 側が
  `shutdownPostEffectBackend()` で classic へフォールバックする二段構え(観点2・3)。
- LUT テクスチャはキー変更時に旧テクスチャを dispose してから生成、失敗時は null で継続(観点2)。
- `buildAsync` 失敗時も warning 経由で classic fallback し、宙ぶらりんにならない。

---

## 総括(v0.2.0 リリース判断向け)

### [Blocker] 一覧(リリース前必須)

1. **WebM 出力に FrameGraph post stack が一切反映されない**(セクション5)
   根本原因: `renderOnce()` が `executePostEffectBackend()` を呼ばない。全キャプチャモードで発生。
   修正: renderOnce(または export 専用 render 関数)に `syncFrameGraphRenderTargetState()` +
   `executePostEffectBackend()` を自動ループと同順で組み込み、
   さらに export 開始前に backend の `isReady()` を待つ(セクション8)。
2. **PNG 連番出力に FrameGraph post stack が反映されない**(セクション1)
   `CreateScreenshotUsingRenderTargetAsync` は post 経路外。修正1と同じ枠組み
   (renderOnce + ready 待ち + フレームバッファ読み出し)に載せ替えるのが本筋。
3. **WebM 出力でエンコーダエラー時にデッドロック**(セクション2)
   consumer 失敗が fatalError に伝わらず、producer がバックプレッシャー待ちで永久停止。
   try/catch 1箇所の修正で解消。UI 復帰不能+ファイルハンドル保持のため必須。
4. **`readpixels`(安定)モードの扱い**(セクション2)
   修正1を入れても readpixels モードは RTT 再レンダリングのため post stack が乗らないまま。
   最低限「post effect 非対応」の UI 注記+エラーメッセージの誘導文修正を v0.2.0 に入れる
   (モード自体の post 対応は v0.2.x 送り可)。

※ 1・2 の全面修正が日程的に厳しい場合の代替案: v0.2.0 では「PNG/WebM 出力は post effect
非対応(単発 PNG のみ対応)」と明記する選択肢もある。ただし docs の統合後作業候補に
「PNG / WebM 出力で FrameGraph post stack が反映されるか確認する」とある以上、
無警告のままの出荷だけは避けること。

### [Later] 一覧(v0.2.x 送り可)

- PNG 連番のキャンセル手段なし / precision の意味が実質「解像度倍率」(セクション1)
- withTimeout の unhandled rejection / mediabunny private API 依存 / BGRA 固定変換(セクション2)
- WebM exporter が dispose を window teardown に委ねる設計の明文化(セクション2・4)
- 出力起動の実行中ガードなし+PNG 連番フォルダ名の秒精度衝突(セクション3・4)
- バックグラウンド出力失敗時のメインウィンドウ通知の確認(セクション4、main.ts 未読のため要手動確認)
- export ウィンドウの localStorage(backend 選択)共有前提の確認(セクション6)
- `capturePngDataUrl` の死んだ分岐(`scene.frameGraph` 永久 falsy)と未使用 API の整理(セクション5)
- threshold またぎパラメーター変更の rebuild 条件(セクション8、docs 既知)
- effects-pipeline-controller の backend 型に幻の "experimental"(セクション7)

### 手動確認の推奨(コードレビューでは確定できなかった点)

1. post effect(Bloom 等)有効プロジェクトで WebM / PNG 連番を出力し、画面との一致を確認
   (Blocker 1・2 の実機確認。現状は不一致になるはず)。
2. WebM 出力を意図的に失敗させ(出力先を書き込み不可にする等)、メインウィンドウの
   通知と UI ロック解除を確認(セクション4)。
3. export 用非表示ウィンドウで localStorage の backend 設定が読めているか
   (export ログの "frame graph post effect backend" イベント有無で判定可能)。
