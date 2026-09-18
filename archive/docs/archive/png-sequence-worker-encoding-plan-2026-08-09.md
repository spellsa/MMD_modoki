# 連番 PNG Web Worker エンコード実装計画 2026-08-09

作成日: 2026-08-09
状態: Phase 0〜3完了 / Phase 4〜5未着手

実装・性能評価結果は
[連番 PNG Web Worker 実装・性能評価 2026-08-09](./png-sequence-web-worker-implementation-evaluation-2026-08-09.md)を参照。

## 結論

連番 PNG の次の性能改善として、PNG エンコードを Electron main process の event loop から
hidden exporter renderer の Web Worker pool へ移す。Web Worker では
`CompressionStream("deflate")` と最小限の PNG chunk assembly を使い、RGBA8 を直接 PNG にする。

初期仕様は color type 6（RGBA）、8bit、filter type 0（None）固定、非インターレースとする。
PNG filter は画質を変えない可逆前処理であり、None でも decode 後の RGBA8 は完全一致する。
ここではファイルサイズより、filter 選択処理を持たない単純さと連番出力の速度を優先する。

`node:worker_threads` は第一候補にせず、Web Worker 版が性能・安定性・package 条件を満たさない場合の
比較候補として残す。現在の `nativeImage.toPNG()` を worker へ移植する方式は採らない。

初期導入は連番 PNG だけを対象とし、次の順序で進める。

1. Web Worker + `CompressionStream("deflate")` の spike と pixel parity 確認
2. 2 worker を標準候補とする renderer 内固定 pool の実装
3. 連番 PNG を Web Worker へ接続し、圧縮済み PNG だけを main へ送る
4. 1 / 2 / 4 worker を実測して採用値を決定
5. 安定後に単発 PNG も同じ encoder service へ寄せる
6. 比較用の旧 main-thread encoder を削除する

目的は永久に二つの PNG 経路を維持することではない。移行中だけ feature flag で比較し、
合格後は Web Worker encoder へ一本化する。

## なぜ今やるか

共通 `rgba8unorm` surface への移行で、連番 PNG のcaptureは主要ボトルネックではなくなった。
現在は `src/main.ts` の `encodeRgbaToPngBytes()` が次を同期実行している。

1. RGBA `Uint8Array` 全体を `Buffer` へコピー
2. 全pixelをRGBAからBGRAへchannel swap
3. `nativeImage.createFromBitmap()`
4. `nativeImage.toPNG()`

renderer側には4本のconsumerがあるが、IPC handlerは同じmain threadで実行されるため、
同期encodeは実質的に直列である。encode中は他のIPC、window制御、進捗通知も遅延しうる。

既存の1920×1080・100フレーム計測は次の状態である。

| scene | wall-clock中央値 | capture中央値 | PNG encode合計 | PNG合計サイズ |
| --- | ---: | ---: | ---: | ---: |
| 空シーン | 27069.4 ms | 1434.7 ms | 22816.4 ms | 53,021,300 bytes |
| 豆腐＋皿＋SSGI＋DoF | 10656.4 ms | 2111.4 ms | 約6162.8 ms | 4,533,100 bytes |

encode / saveの計測値はconsumer間の合計なのでwall-clockへ単純加算できない。それでも、
main threadで直列実行されるencode時間がjob全体に占める割合は大きく、次の改善対象として妥当である。

## 公式仕様から来る制約

- PNG の IDAT は、filter 済み scanline 全体を1本の zlib datastream として格納する。
- `CompressionStream("deflate")` の出力は RFC 1950 の zlib 形式であり、PNG IDAT に利用できる。
- `deflate-raw` は zlib header / Adler-32 を含まないため、この用途では使わない。
- `CompressionStream` は Web Worker でも利用できる。現在の Electron 40.4.1 は Chromium 144 を含む。
- Web Worker との `postMessage` では `ArrayBuffer` を transfer し、raw RGBA のcopyを避ける。
- transfer後のbufferは送信側でdetachedされる。pool管理では所有権を明示する必要がある。
- workerをframeごとに生成せず、hidden exporter windowの生存中は固定poolとして再利用する。
- `CompressionStream` は圧縮レベルを指定できない。初期版では圧縮設定UIを設けない。

参照:

- [Compression Standard](https://compression.spec.whatwg.org/)
- [Portable Network Graphics (PNG) Specification (Third Edition)](https://www.w3.org/TR/png-3/)
- [Electron v40.4.1](https://releases.electronjs.org/release/v40.4.1)
- [Electron Performance](https://www.electronjs.org/docs/latest/tutorial/performance)

## 対象範囲

### 対象

- 連番 PNG のRGBA8エンコード
- hidden exporter rendererのWeb Worker pool管理
- rendererからWeb Workerへのraw RGBA transfer
- Web Workerからrendererへのencoded PNG transfer
- rendererからmainへのencoded PNG IPC
- worker queue / byte budget / backpressure
- encode / dispatch wait / writeの診断値
- worker crash、timeout、hidden window終了時のcleanup
- package / make後のworker entry解決
- 安定後の単発 PNG encoder統合

### 初期対象外

- 背景透過modeとstraight alpha変換
- 16bit PNG
- WebM encoder変更
- GPU上のPNG圧縮
- Node `worker_threads` poolのproduction実装
- 圧縮設定UIの初回同時実装
- adaptive PNG filter、固定Sub / Up / Paeth
- 物理・モーション入り代表シーンの新規作成

背景透過は後続で同じworker encoderへ載せるが、worker化と同時にalpha仕様を変更しない。
速度回帰とalpha回帰を分離して判断する。

## 目標構成

```text
hidden PNG exporter
  -> readExportRenderFrameAsync(): RGBA8 / top-to-bottom
  -> renderer Web Worker pool: raw RGBAをtransfer
  -> filter None + CompressionStream("deflate")
  -> PNG signature / IHDR / IDAT / IEND + CRC32
  -> renderer: encoded PNGをtransfer back
  -> preload IPC: encoded PNG bytesのみ
  -> main: path validation + fs.promises.writeFile
  -> renderer: progress / diagnostics
```

### mainに残す責務

- dialog表示
- directory / filenameの検証
- safe pathの確定
- `fs.promises.writeFile()`
- hidden exporterのowner / progress中継
- user-facing errorの分類とログ

非同期file I/OはNode側で既にmain event loopをblockしないため、最初はworkerへ移さない。
main は raw RGBA、PNG filter、deflate、CRC32 を扱わない。rendererから受け取るPNG bytesは
Electron IPCではcopyされうるが、raw RGBAではなく圧縮後のbytesだけに限定する。

### Web Workerへ移す責務

- width / height / RGBA byte lengthの再検証
- 各scanlineへfilter type 0を付加
- `CompressionStream("deflate")`によるzlib datastream生成
- PNG signature / IHDR / IDAT / IENDの構築
- chunk CRC32の計算
- filter / deflate / assemble時間とencoded byte lengthの返却

workerはElectron API、preload API、dialog、app path、Babylon、project stateを参照しない。

### rendererに残す責務

- frame描画とRGBA readback
- capture queueのbyte budget管理
- frame番号とfilenameの決定
- Web Worker poolとbuffer ownershipの管理
- 圧縮済みPNGのsave IPC呼び出し
- progress表示
- producer / consumer backpressure

## PNG encoder初期仕様

外部 PNG encoder library は初期導入せず、PNGの最小構造だけを小さなpure helperとして実装する。
deflate本体はChromiumの`CompressionStream`へ任せる。

### 必須条件

- color type 6 / bit depth 8でRGBA8を直接格納する
- 各scanlineのfilter byteは0（None）固定
- compression method 0、filter method 0、interlace method 0
- alphaを含む入力byteを完全に保持する
- Windows / macOS / Linuxのpackageで同じ経路を使える
- renderer用ESM worker entryから読み込める
- 1920×1080と4Kで極端なmemory増加がない
- PNG signatureとchunk順序が仕様に準拠する
- chunk lengthはbig-endian、CRC32はchunk typeとchunk dataを対象にする

filter Noneは「無圧縮」ではない。filter選択を行わないだけで、その後に
`CompressionStream("deflate")`による可逆圧縮を行う。None / Sub / Paethのどれを選んでも
decode後の画質は同一であり、差が出るのはCPU時間とファイルサイズだけである。

### 比較データ

- 単色
- gradient
- checker / orientation pattern
- alpha 0 / 1 / 128 / 255
- 高entropy noise
- 豆腐＋皿の実出力
- 空シーンの実出力

### 比較項目

- 1枚と100枚のencode wall-clock
- Web Worker 1 / 2 / 4でのthroughput
- output bytes
- peak memory
- decoded RGBAのpixel一致
- worker startup時間
- package後の読み込み可否

PNG bytesそのものの一致は求めない。decode後のwidth、height、RGBA pixel、alphaを合否条件にする。

## renderer / Web Worker protocol

初期protocolは小さく固定する。

```ts
type PngEncodeRequest = {
    taskId: string;
    width: number;
    height: number;
    rgbaBuffer: ArrayBuffer;
    filterStrategy: "none";
};

type PngEncodeResult = {
    taskId: string;
    pngBuffer: ArrayBuffer;
    encodeMs: number;
    filterMs: number;
    deflateMs: number;
    assembleMs: number;
    byteLength: number;
};
```

- `rgbaBuffer`はrendererからworkerへtransferし、rendererでは再利用しない。
- `pngBuffer`もworkerからrendererへtransferする。
- `Uint8Array.byteOffset === 0`かつ`byteLength === buffer.byteLength`を確認する。
- buffer全体を所有していないviewは、transfer前に専用`ArrayBuffer`へ正規化する。
- task完了順はframe順でなくてよい。filenameがframe番号を保持する。
- 同じ`taskId`の二重完了は無視せずprotocol errorとして記録する。

## pool設計

### 初期値

- lazy start
- 標準候補: 2 workers
- 比較対象: 1 / 2 / 4 workers
- 上限: `navigator.hardwareConcurrency - 1`を超えず、最大4
- 1 workerあたりactive taskは1件
- worker生成はframe単位ではなくhidden exporter window lifetimeで再利用

4workerを最初から標準にしない。PNG encode、WebGPU driver、Electron renderer、file I/OがCPUと
memory bandwidthを共有するため、worker数を増やすほど速いとは限らない。

### backpressure

現行の`maxQueueLength = 24`は1920×1080 RGBAで約199MB、8Kでは約3.2GB相当になる。
高解像度実用化を考えるとframe数だけでなくraw bytesで制限する。

- queued + active raw RGBAにbyte budgetを設定
- 初期目安: 256MB
- queued frame上限: `poolSize * 2`
- byte budgetを超える場合は次frameのcapture前に待つ
- workerへtransferした後もactive raw bytesとして完了までbyte budgetへ算入する
- encoded PNG queueもbyte数を記録する

8Kでは1frameが約132.7MBになるため、少なくとも1frameは通しつつ、複数frameの同時保持を
自動的に抑える。

## 段階別実装

### Phase 0: encoder spikeとbaseline固定

実装:

- deterministic RGBA fixtureを追加
- filter Noneのscanline生成、PNG chunk、CRC32をpure helperとして試作
- Web Workerで`CompressionStream("deflate")`を使うencoderを試作
- current `nativeImage.toPNG()` baselineと比較
- decode後pixel parity testを作成
- 1080p / 4Kの単体benchmarkを追加

この段階ではproduction IPCを変更しない。

完了条件:

- Web WorkerでPNGを生成できる
- alphaを含むdecoded pixelが入力と一致する
- 2worker時の100枚encodeがcurrent main-thread encodeより明確に短い
- output sizeとmemoryの差を説明できる

Web Worker版がここで性能条件を満たさない場合だけ、Node `worker_threads` + Node zlibを比較する。

### Phase 1: renderer Web Worker entryとpool

候補ファイル:

- `src/output/png-encoder-protocol.ts`
- `src/output/png-encoder-web-worker.ts`
- `src/output/png-encoder-web-worker-pool.ts`
- `src/output/png-encoder.ts`

変更箇所:

- renderer Vite buildからmodule workerを解決する
- E2E / smoke helperでも同じworker entryをbuildする
- worker artifactのdevelopment / package両方の解決方法を固定する

poolに必要な処理:

- dispatch queue
- task Promise管理
- worker error
- 1回のworker再生成
- task timeout
- hidden exporter終了時の`terminate()`
- structured diagnostics

完了条件:

- pool単体testで並列完了、順不同完了、error、timeout、terminateが通る
- `npm.cmd run package`相当のartifactでworkerが起動する
- hidden exporter終了後にworkerが残らない

### Phase 2: 連番 PNGへの限定接続

`src/png-sequence-exporter.ts`のcapture queueをWeb Worker poolへ接続する。

- raw RGBAをrendererからWeb Workerへtransfer
- encoded PNGをWeb Workerからrendererへtransfer back
- 圧縮済みPNGだけを新しいsave IPCでmainへ送る
- mainでpathを検証して非同期write
- filter / deflate / assemble / IPC / writeを別計測
- worker失敗時のuser-facing errorと詳細ログを分離

移行用feature flag:

```text
MMD_MODOKI_PNG_ENCODER=main|renderer-worker
```

初期defaultは`main`、E2Eと手動検証後に`renderer-worker`へ切り替える。比較完了後はflagと旧経路を削除する。

単発 PNG はこのPhaseでは現行のまま残す。連番の長時間・高並列経路を先に安定させる。

### Phase 3: concurrency / file size評価

既存の `benchmark:export-rgba` を拡張し、次のmatrixを計測する。

- scene: empty / tofu-plate-ssgi-dof
- pool: 1 / 2 / 4
- filter: None固定
- 1920×1080、100フレーム、各3〜5回
- warm run / processを分けたcold run

記録項目:

- job wall-clock
- capture
- renderer->worker dispatch wait
- worker encode
- worker queue peak
- active / queued raw bytes peak
- worker->renderer result transfer
- encoded PNG IPC
- file write
- main event-loop delay
- output total bytes
- worker再生成回数

採用時にpool数を固定する。CPU core数だけで自動的に最大worker数を使わない。
初期採用ではファイルサイズにhard gateを設けず、sceneごとの1枚平均・合計・raw RGBA比を記録する。

### Phase 4: production hardening

- 長尺500〜1000フレーム連続出力
- 出力先が遅い場合のbackpressure
- disk full / permission error
- worker crash / task timeout
- app終了中のactive encode
- hidden exporter windowの異常終了
- 同時に2件のexport開始を拒否できること
- 4K / 8Kのmemory budget
- 進捗が長時間止まって見えない場合のstatus表示

partial filesは原則として正常なPNGだけを残す。書き込み途中のfileは一時名へ保存してrenameする方式を
検討し、crash後に完成品と未完成品を区別できるようにする。

### Phase 5: 単発 PNG統合とlegacy削除

連番で安定したencoder serviceを単発 PNGにも使用する。

- save dialogはencode前に表示し、cancel時に不要なencodeをしない
- 単発と連番で同じRGBA encoder contractを使う
- smoke screenshot用の`nativeImage.toPNG()`は出力機能とは別用途として残してよい
- `encodeRgbaToPngBytes()`とmain-thread比較flagを削除
- docsの現行仕様をworker encoderへ更新

## 性能合格基準

1920×1080・100フレームで次を初期adoption gateとする。

### 必須

- 空シーンwall-clock: `16秒以下`
- 豆腐＋皿＋SSGI＋DoFのwall-clock中央値: `7秒以下`
- current main-thread経路よりwall-clockが30%以上短い
- main event-loop delay p95: `50ms以下`
- main event-loop delay max: `150ms以下`を目標とし、超過時は原因を記録
- decoded RGBA / alpha: pixel一致
- frame数、filename、orientation、色に回帰なし
- worker crashなし、unhandled rejectionなし、orphan processなし

空シーン16秒は、3分 / 30fps / 5400フレームを単純換算した場合に約14.4分となる。
最終的な実用目標は12分前後だが、初期adoptionでは現行約24.4分から明確に半減へ近づくことを優先する。

### ファイルサイズ

- filter Noneでも`CompressionStream("deflate")`による可逆圧縮は行う
- 1080p RGBA8の非圧縮量は約7.9MiB / frame、100frameで約791MiB
- 初期採用ではcurrent `nativeImage`とのsize比を合否条件にせず、実測値を文書化する
- 容量を優先する通常動画はWebM、編集用の可逆中間・透過用途は連番PNGと整理する
- disk writeがwall-clockの主要因になった場合だけ、固定Sub等を別spikeで比較する

adaptive filterや圧縮設定UIは、初期版の完了条件へ含めない。

### memory

- 1080pの追加raw RGBA滞留: 128MB以内を目標
- 4K / 8Kはbyte budgetでframe同時数を自動制限
- 長尺でheap / external memoryがframe数に比例して増えない

## テスト

### unit

- width / height / byte length validation
- RGBA / alpha / orientation patternのencode-decode parity
- filter type 0のscanline構造
- IHDR / IDAT / IENDの順序、big-endian length、CRC32
- zlib datastreamのdecode確認
- buffer ownershipとtransfer前条件
- pool dispatch / queue / out-of-order completion
- worker error / message error / timeout /再生成
- terminate時のpending task reject
- byte budget計算

### E2E

- 連番PNGの実ファイル生成
- 先頭 / 中間 / 最終frameのdecode確認
- FrameGraph PostFX入り
- output countと連番filename
- worker diagnosticsが取得できる
- forced worker failure時にjobがfailedになる
- worker終了後にElectron test processが残らない

### 手動 / package

- Windows package
- macOS package
- Linux package
- 4K / 8K memory
- export中のmain window操作
- export cancel / app quit
- 遅いdisk / 容量不足

## リスクと対策

### filter Noneでファイルサイズが増える

画質は変わらないが、sceneによってはcurrent `nativeImage`より大きくなる。speedとsizeを同時に記録する。
初期版は容量増加を許容し、disk writeが支配的になった場合だけ固定Sub等を比較する。

### transferでbufferを早くdetachedする

producerが以後使わない専用bufferだけを渡す。ownership helperとunit testを置き、暗黙の共有を許さない。

### worker数を増やしてGPU描画が遅くなる

1 / 2 / 4を実シーンで比較し、wall-clock全体で決める。encoder単体のthroughputだけで採用しない。

### CompressionStreamの固定設定が速度条件を満たさない

`CompressionStream`には圧縮レベル指定がない。filter Noneでもdeflate時間が支配的になる場合は、
Node `worker_threads` + Node zlib、または別のWeb Worker用encoderを比較する。production経路を二重化したままにはしない。

### worker artifactがpackageで見つからない

renderer Viteのmodule workerとしてbuildし、developmentだけでなくpackage smokeをadoption gateにする。

### fallbackが恒久的な二経路になる

feature flagに削除条件を付ける。Web Worker default化、3環境package確認、長尺確認が揃った時点で
main-thread encoderとflagを削除する。

## 実装順序とコミット境界

1. filter None PNG helper + CompressionStream spike + parity / benchmark
2. renderer / Web Worker protocol + pool + unit test
3. renderer Vite worker build + package smoke
4. 圧縮済みPNG save IPC接続 + diagnostics
5. E2E + 1 / 2 / 4 worker性能測定
6. Web Worker default化
7. 長尺・異常系・memory hardening
8. 単発PNG統合
9. main-thread encoder / feature flag削除

各コミットで動く経路を維持し、encoder選定、pool、production接続、legacy削除を一度に混ぜない。

## 確認コマンド

```powershell
npm.cmd run test:unit
npm.cmd run lint
npm.cmd run typecheck:critical
npm.cmd run test:e2e
npm.cmd run smoke:launch
npm.cmd run package
npm.cmd run benchmark:export-rgba -- 3
npm.cmd run benchmark:export-rgba -- 5 tofu-plate-ssgi-dof
```

## 完了条件

- 連番PNGのencodeがmain event loopで実行されない
- Web WorkerはElectron / preload APIを参照しない
- RGBAからPNGへ直接encodeし、RGBA→BGRA変換が削除される
- filter None固定でdecode後のRGBA8 / alphaが入力と一致する
- rendererからmainへraw RGBAを送らず、圧縮済みPNGだけを送る
- pool数、queue、byte budgetが実測で決定されている
- main responsivenessとjob wall-clockの両方が合格基準を満たす
- alpha、色、orientation、frame countに回帰がない
- worker error / timeout / terminateがsilent failureにならない
- dev / packageの両方でworker entryが解決する
- 単発PNGと連番PNGが最終的に同じencoder serviceを使う
- 移行用main-thread encoderとfeature flagが削除される
- 実測値と採用理由がdocsへ追記される

## 関連

- [出力改善計画](./output-improvement-plan-2026-08-04.md)
- [共通 RGBA Surface 出力 性能評価](./export-rgba-performance-evaluation-2026-08-09.md)
- [共通 RGBA Surface 代表シーン性能評価](./export-rgba-representative-scene-evaluation-2026-08-09.md)
- [共通 RGBA Surface 出力 実装メモ](./export-render-surface-implementation-note-2026-08-09.md)
- [連番 PNG 出力仕様](./png-sequence-export-spec.md)
