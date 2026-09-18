# 連番 PNG Web Worker 実装・性能評価 2026-08-09

実装日: 2026-08-09
状態: 連番・単発 PNG production 接続完了 / 長尺・高解像度hardeningは未完

## 結論

連番 PNG のエンコードを Electron main process の同期 `nativeImage.toPNG()` から、hidden exporter
renderer 内の Web Worker poolへ移した。Web WorkerではRGBA8を直接受け取り、filter None固定の
scanlineを作成し、`CompressionStream("deflate")`でzlib圧縮してPNGを組み立てる。

1920×1080・100frameのwall-clock中央値は次のように改善した。

| scene | 旧main-thread | Web Worker | 短縮率 | speedup |
| --- | ---: | ---: | ---: | ---: |
| 空シーン | 27069.4 ms | 13148.8 ms | 51.4% | 2.06倍 |
| 豆腐＋皿＋SSGI＋DoF | 10656.4 ms | 5058.3 ms | 52.5% | 2.11倍 |

初期adoption gateの空シーン16秒以下、代表シーン7秒以下、旧経路比30%以上短縮を満たした。
worker再生成は全runで0だった。

## 単発PNG統合

単発PNGも連番と同じ`PngEncoderWebWorkerPool`へ接続した。単発は同時に1枚しか処理しないため
pool sizeを1に固定し、共通RGBA SurfaceからreadbackしたRGBA8をworkerへtransferする。
mainへraw RGBAを渡す`file:savePngRgba`は削除し、圧縮済みPNGだけを`file:savePngBytes`へ渡す。
mainの責務はPNG signatureとfilenameの検証、保存ダイアログ、非同期file writeである。

メニューバーの詳細PNGは、連番用hidden exporterを`exportKind: "single"`で再利用する。保存先を
先に確定し、現在フレーム1枚だけを指定解像度のcanvas / scene color / depth / PostFXで描くため、
viewport由来の中間画像を4K / 8Kへ拡大する経路を避けられる。シークバーの即時スクリーンショットは
操作レスポンスを優先して従来のeditor viewport経路を維持する。

E2Eでは単発PNGについてもPNG signature、RGBA8 IHDR、全scanline filter None、IDAT zlib decode、
保存後のsurface解放を確認した。

8K UHD（7680×4320）のraw RGBAは1枚約126.6MiBになる。現在のencoderは同程度の
filter済みscanline全量バッファも作るため、単発8Kの実機評価前にscanlineを分割して
`CompressionStream`へ投入する方式を検討する。単発ではworker数を増やしても1 taskしかなく、
高速化にはならない。

## 実装構成

```text
ExportRenderSurface (rgba8unorm / top-to-bottom RGBA8)
  -> renderer Web WorkerへArrayBuffer transfer
  -> 各scanlineへfilter byte 0を付加
  -> CompressionStream("deflate")
  -> PNG signature + IHDR + IDAT + IEND + CRC32
  -> rendererへPNG ArrayBuffer transfer
  -> preload IPCで圧縮済みPNGだけをmainへ送信
  -> mainがpath検証とfs.promises.writeFile
```

mainは新規`file:savePngBytesToPath`でPNG signature、拡張子、basenameを検証して保存する。
raw RGBAはrendererからmainへ送られず、mainでRGBA→BGRA変換やPNG encodeを行わない。

比較用旧経路は一時的に残している。

```text
MMD_MODOKI_PNG_ENCODER=main
```

未指定時は`renderer-worker`を使う。旧経路とflagは長尺・高解像度確認後に削除する。

## PNG初期仕様

- PNG color type: 6（RGBA）
- bit depth: 8
- compression method: 0
- filter method: 0
- scanline filter type: 0（None固定）
- interlace: 0（なし）
- IDAT: `CompressionStream("deflate")`が返すRFC 1950 zlib datastream
- alphaを含むdecode後RGBA8は入力とpixel一致

filter Noneは無圧縮ではない。PNG filter選択を省略したうえでdeflateによる可逆圧縮を行う。

## poolとbackpressure

- default: 2 Web Workers
- 実装上限: 4
- 1workerあたりactive taskは1件
- capture queue上限: `poolSize * 2`
- queued + active raw RGBA byte budget: 256MiB
- transfer後もtask完了まではactive raw bytesとしてbudgetへ算入
- worker task timeout: 120秒
- error / message error / timeout時はactive taskをrejectし、workerを再生成
- hidden exporter終了時にpending taskをrejectして全workerを`terminate()`

1920×1080の実測peakは次の範囲だった。

- queued raw bytes peak: 16.6〜33.2MB
- active raw bytes peak: 16.6MB
- worker pool size: 2

## 診断値

`PngSequenceExportDiagnostics`へ次を追加した。

- `encoderMode`, `filterStrategy`
- `filterMs`, `deflateMs`, `assembleMs`
- `workerDispatchWaitMs`
- `encodedPngBytes`
- `workerPoolSize`
- `queuedRawBytesPeak`, `activeRawBytesPeak`
- `workerRecreateCount`

encode系の値は2worker間の合計なのでwall-clockへ単純加算しない。

## 性能測定

条件:

- Electron 40.4.1 / Chromium 144
- WebGPU
- 1920×1080
- frame 0〜99、100frame
- 2 Web Workers
- filter None
- 各scene 3run

### 空シーン

| 項目 | run 1 | run 2 | run 3 | 中央値 |
| --- | ---: | ---: | ---: | ---: |
| wall-clock | 13074.9 ms | 13299.6 ms | 13148.8 ms | 13148.8 ms |
| encode合計 | 19924.4 ms | 20051.6 ms | 19730.6 ms | 19924.4 ms |
| save IPC合計 | 257.5 ms | 252.8 ms | 261.5 ms | 257.5 ms |
| PNG合計サイズ | 40,813,000 bytes | 40,813,000 bytes | 40,813,000 bytes | 40,813,000 bytes |

旧main-thread出力の53,021,300 bytesより23.0%小さかった。None固定でも、このsceneでは
ファイルサイズ回帰は起きなかった。

### 豆腐＋皿＋SSGI＋DoF

| 項目 | run 1 | run 2 | run 3 | 中央値 |
| --- | ---: | ---: | ---: | ---: |
| wall-clock | 5784.9 ms | 5058.3 ms | 5054.8 ms | 5058.3 ms |
| encode合計 | 2575.8 ms | 2557.2 ms | 2549.8 ms | 2557.2 ms |
| save IPC合計 | 211.0 ms | 234.8 ms | 221.6 ms | 221.6 ms |
| PNG合計サイズ | 5,225,500 bytes | 5,225,500 bytes | 5,225,500 bytes | 5,225,500 bytes |

旧main-thread出力の4,533,100 bytesより15.3%大きいが、wall-clockは52.5%短縮した。
初期方針どおり、連番PNGは容量より速度と単純性を優先してNone固定を採用できる。

## 確認結果

- `npm.cmd run test:unit`: 43 files / 297 tests pass
- `npm.cmd run lint`: warning / errorなし
- `npm.cmd run typecheck:critical`: critical TS2304 / TS2552なし
- `npm.cmd run smoke:launch`: WebGPU / Bullet MPRまで到達して安定性確認pass
- `npm.cmd run test:e2e -- export-render-surface.spec.mjs`: 3 tests pass
- E2EでPNG signature、RGBA8 IHDR、全scanline filter None、IDAT zlib decodeを確認
- `MMD_MODOKI_PNG_ENCODER=main`のfallback E2E: pass
- `npm.cmd run package`: Windows x64 package成功
- package内`app.asar`にrenderer Web Worker chunkが含まれることを確認

typecheck全体には既知のnon-critical baseline errorが残る。

## 未完了

- 500〜1000frameの長尺連続出力
- 4K / 8K memoryとbyte budget実機確認
- disk full / permission / slow disk
- forced worker error / timeoutのproduction E2E
- macOS / Linux package確認
- main event-loop delay p95 / maxの追加計測
- 単発8K向けscanline分割投入とpeak memory削減
- 旧main-thread encoderとfeature flagの削除
- 背景透過modeとstraight alpha確認

## 関連

- [連番 PNG Web Worker エンコード実装計画](./png-sequence-worker-encoding-plan-2026-08-09.md)
- [連番 PNG 出力仕様](./png-sequence-export-spec.md)
- [共通 RGBA Surface 出力 性能評価](./export-rgba-performance-evaluation-2026-08-09.md)
- [共通 RGBA Surface 代表シーン性能評価](./export-rgba-representative-scene-evaluation-2026-08-09.md)
