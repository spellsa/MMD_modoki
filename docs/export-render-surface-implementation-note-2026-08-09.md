# 共通 RGBA Surface 出力 実装メモ 2026-08-09

## 目的と現在地

単発 PNG、連番 PNG、WebM が形式ごとに別の描画・readback経路を持っていた状態から、
PostFX適用済みの最終フレームを1つの `rgba8unorm` surfaceへ描画し、共通のRGBA契約で
consumerへ渡す構成へ移行した。

現在、次の出力は共通経路を利用する。

- 単発 PNG
- 連番 PNG
- WebMの通常mode `rgba-surface`

背景透過は未実装。WebMの旧 `webgpu-copy` / `readpixels` / `canvas` は比較・診断用として
一時的に残している。

## 全体構成

```text
project / camera / motion / physics
                |
                v
        MmdManager capture render
                |
        +-------+-------+
        |               |
        v               v
      Classic       FrameGraph PostFX
        |               |
        |        CopyToTextureTask
        +-------+-------+
                |
                v
    ExportRenderSurface (rgba8unorm)
                |
        readPixels + row normalize
                |
                v
       RenderedExportFrame (RGBA)
        /             |             \
       v              v              v
  single PNG      PNG sequence      WebM
```

共通化しているのはencoderより前の「最終フレームを描画し、CPUへ取り出すところ」まで。
PNG encoderとWebM encoderは引き続き別責務とする。

## CPU側のフレーム契約

`src/render/export-render-surface.ts` の `RenderedExportFrame` を境界にする。

| 項目 | 現在の契約 |
| --- | --- |
| pixel format | `RGBA` |
| channel depth | 8bit unsigned |
| row order | top-to-bottom |
| color space metadata | `srgb` |
| alpha mode | 現在は `opaque`。将来 `straight` を追加 |
| ownership | consumerへ渡すフレームごとの `Uint8Array` |

Babylon RTTのreadbackはbottom-to-topとして扱い、`normalizeExportRgbaRows()` が
行単位で上下を反転した新しい配列を作る。RGBAのchannel並べ替えは行わない。

通常のPNG出力はrenderer Web WorkerがRGBA8を直接PNG化する。比較用の旧main-thread
fallbackだけが`nativeImage.createFromBitmap()`のplatform bitmap境界でRGBAからBGRAへ変換する。
この変換はrenderer coreの標準契約ではない。

## `ExportRenderSurface`

実装: `src/render/export-render-surface.ts`

ジョブの間だけ保持する `RenderTargetTexture` を所有する。主な設定は次のとおり。

- `TEXTURETYPE_UNSIGNED_BYTE`
- `TEXTUREFORMAT_RGBA`
- 1 sample
- mipmapなし
- depth / stencilあり
- `useSRGBBuffer: false`
- `gammaSpace: true`
- particle / spriteを描画対象に含む

surfaceはフレームごとには作り直さない。出力解像度が変わった場合にのみ再生成する。
readbackには8秒timeoutを設け、surface破棄後のreadbackを明示的に拒否する。

診断値として幅、高さ、`rgba8unorm`、sample数、readback回数を公開する。

## `MmdManager` のライフサイクル

実装: `src/mmd-manager.ts`

### `prepareExportRenderSurface(width, height)`

1. 出力サイズを正規化する。
2. 同じサイズのsurfaceがあれば再利用する。
3. サイズが変わった場合は旧surfaceを破棄する。
4. FrameGraphが存在する場合は、最終出力先を差し替えるためcontrollerを再構築する。
5. Classic / FrameGraphに応じて最終出力先を同期する。

### `readExportRenderFrameAsync()`

準備済みsurfaceからreadbackし、共通契約の `RenderedExportFrame` を返す。

### `releaseExportRenderSurface()`

単発 PNG の終了時にsurfaceを切り離して破棄し、FrameGraphを通常backbuffer出力へ戻す。
単発capture後もeditor viewportを継続利用できるようにするための明示的な復帰処理である。

連番 PNG / WebM は専用hidden window内のジョブなので、ジョブ完了後はwindow teardownで
renderer resourceを回収する。PNG exporterでは同期的なBabylon / physics disposeが
保存完了後に停止する場合があり、現在は明示disposeを行っていない。

## backendごとの接続

### FrameGraph

実装: `src/render/frame-graph-post-effects-controller.ts`

通常viewportでは最後のtaskに `FrameGraphCopyToBackbufferColorTask` を使う。
export surfaceが指定された場合は次へ切り替える。

1. `frameGraph.textureManager.importTexture()` でsurfaceの `InternalTexture` を登録する。
2. `FrameGraphCopyToTextureTask` の `targetTexture` に設定する。
3. effect order最後のtextureを同taskのsourceへ接続する。

scene color入力をreadbackするのではなく、PostFX stackの最終結果をsurfaceへ書くことが重要。
これによりPNGとWebMでPostFXの適用順を別々に再現する必要がなくなる。

### Classic

Classicでは `camera.outputRenderTarget` を `ExportRenderSurface.renderTarget` へ向ける。
FrameGraphがsurfaceへ書く場合は二重出力を避けるため `camera.outputRenderTarget` をnullにする。
この切替はcapture render直前にも同期する。

## consumerごとの接続

### 単発 PNG

実装: `src/ui/export-ui-controller.ts`、`src/mmd-manager.ts`

```text
editor overlay抑止
  -> 2 animation frames待機
  -> prepare surface
  -> PostFX ready待機
  -> renderOnceForCapture(0)
  -> RGBA readback
  -> release surface
  -> 1 Web Workerでfilter None + deflate
  -> file:savePngBytes
```

旧backbuffer `engine.readPixels()`、WebGPU BGRA swizzle、Canvas 2D拡縮、ScreenshotTools、
`webContents.capturePage()` の単発PNG経路は削除した。

### 連番 PNG

実装: `src/png-sequence-exporter.ts`

hidden exporterのcanvasを出力サイズに合わせ、project import後にsurfaceを1枚だけ準備する。
各フレームは次だけを繰り返す。

```text
seek -> renderOnceForCapture -> surface readback -> 2 Web Workers -> save queue
```

旧経路の `CreateScreenshotUsingRenderTargetAsync()` は、フレームごとにscreenshot用RTTを
生成・再描画・readback・破棄していた。新経路ではRTT lifecycleをジョブ単位へ移し、
後続実装でPNG encoderを2 Web Workersへ移し、raw RGBA IPCと4 consumerの旧保存queueも整理した。
旧main-thread経路は性能比較flag指定時だけ残している。

### WebM

実装: `src/webm-exporter.ts`

通常modeを `rgba-surface` とし、`RenderedExportFrame.pixels` をRGBA `VideoSample` へ渡す。
旧 `webgpu-copy` に存在するBGRAからRGBAへのCPU channel swizzleは通らない。

比較用 `webgpu-copy` ではsurfaceを準備してはいけない。FrameGraphの最終出力をsurfaceへ
移した状態でbackbufferを読むと、旧経路が空または不完全なフレームを取得するためである。
性能評価の初回試行でこの問題を検出し、capture modeが `rgba-surface` の場合だけsurfaceを
準備する条件へ修正した。

## なぜPNG captureが約70倍になったか

### 実測で確定していること

空シーン・1920×1080・100フレームのcapture合計は次のとおり。

| 経路 | capture合計 | 1フレーム平均 |
| --- | ---: | ---: |
| 旧 screenshot RTT | 100375.8 ms | 1003.8 ms |
| 新 persistent RGBA surface | 1434.7 ms | 14.35 ms |

比率は約 `70.0倍`、時間は `98.6%` 短縮した。新経路の3回測定は
1431.0 / 1434.7 / 1449.3 msで、再現性も高かった。

### コード差から説明できる主要因

旧連番PNGは各フレームでBabylonのscreenshot helperを呼び、screenshot専用RTTの生成、
cameraを使った再描画、readback、RTT破棄までを1回のcaptureとしていた。

新経路では次の差がある。

- RTTを100回作成・破棄せず、ジョブ全体で1枚だけ保持する。
- screenshot helperの一時的なengine / camera state変更を通さない。
- 通常のexport renderで得たPostFX最終出力を直接surfaceへ書く。
- 1出力フレームにつきscene renderを1回にする。
- capture loopは実質的にrender、readback、row copyだけになる。

70倍の全量を個々の内部処理へ配賦できる細粒度timerは旧ScreenshotTools内部には入れていない。
したがって「RTT生成が何ms、再描画が何ms」とは断定しない。ただし、旧経路でcaptureが
約1004 ms/frameを占め、新経路でRTT lifecycleを除いた後に約14 ms/frameまで下がったため、
フレーム単位のscreenshot lifecycleが支配要因だったという判断は実測とコード差に整合する。

### なぜ全体では3.81倍なのか

captureが70倍でも、PNG encodeとfile saveは残る。新経路の100フレームwall-clockは
約27.07秒で、旧約103.16秒から約3.81倍になった。

さらに新PNGの合計サイズは約53.0MBで、旧計測の約10.9MBより約4.87倍大きい。
画像内容と圧縮率が同一ではないためencoder部分は完全なA/Bではないが、より大きい出力を
保存しながらwall-clockが73.8%短縮した。この評価時点の次のボトルネックだった
main processの`nativeImage.toPNG()`は後続実装でrenderer Web Workerへ移し、さらに約2.06倍改善した。

## WebMの改善が約18%に留まる理由

旧 `webgpu-copy` はbackbuffer readback自体が比較的速い。新surfaceではBabylon RTTのreadbackと
top-to-bottomへのrow copyが必要で、100フレームのreadbackは旧より約235 ms長かった。

一方、旧経路にあったCPU BGRA to RGBA transform約830 msが消えたため、capture全体は
約602 ms短縮し、wall-clock中央値は3160.4 msから2583.8 msになった。

`pixel transform = 0` はCPU処理が完全にゼロという意味ではない。channel swizzleは消えたが、
row order正規化は `readback` 区間に含まれる。

## 計測と回帰確認

再現用コマンド:

```powershell
npm.cmd run benchmark:export-rgba -- 3
```

豆腐＋皿＋SSGI＋DoFの代表シーン:

```powershell
npm.cmd run benchmark:export-rgba -- 5 tofu-plate-ssgi-dof
```

実装: `scripts/benchmark-export-rgba.mjs`

- hidden PNG / WebM exporterを実際に起動する。
- 1920×1080、100フレーム、VP8、音声なしで測る。
- PNG diagnosticsを完了progressから取得する。
- WebM diagnosticsも完了progressへ載せ、新旧modeを同一ビルド内でA/Bする。
- WebMの実ファイルサイズを確認し、空フレームを速度改善として誤採用しない。
- runごとに新旧WebMの実行順を交替する。

自動確認:

- row order正規化のunit test
- FrameGraph最終出力の実WebGPU readback E2E
- 単発PNG、連番PNG、WebMの実ファイル生成E2E
- 単発PNG後のsurface解放E2E

## 既知制約

- 背景透過とstraight alphaは未実装。
- 単発PNGでsurfaceだけをviewportより大きくしても、上流のscene color / depth / PostFX
  intermediateが同じ解像度とは限らない。高解像度品質は別途確認が必要。
- MirroringFloorを含む実モデルでの新単発PNG経路は手動確認が必要。
- Classic / WebGL2を含む全backendの見た目比較は未完了。
- 豆腐＋皿＋SSGI＋DoFの代表シーンは測定済み。モーション、物理、テクスチャ付きMMDモデルを
  含む性能再測定は未実施。
- PNG hidden exporterの明示dispose停止問題はwindow teardown依存のまま残る。
- WebM legacy modeは比較終了後に削除予定。

## 関連

- [共通 RGBA Surface 統合計画](./export-render-surface-unification-plan-2026-08-09.md)
- [共通 RGBA Surface 性能評価](./export-rgba-performance-evaluation-2026-08-09.md)
- [共通 RGBA Surface 代表シーン性能評価](./export-rgba-representative-scene-evaluation-2026-08-09.md)
- [連番 PNG 出力仕様](./png-sequence-export-spec.md)
- [WebM 出力 現行仕様](./webm-export-current-spec-2026-03-13.md)
