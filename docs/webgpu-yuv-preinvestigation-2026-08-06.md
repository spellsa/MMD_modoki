# WebGPU 動画書き出し Phase 0 / Phase 1 事前調査メモ

調査日: 2026-08-06
対象: [WebGPU 動画書き出し Phase 0 計測・Phase 1 RGBA→YUV GPU 前処理作業指示](./webgpu-yuv-phase1-work-order-2026-08-04.md)

## 結論

Phase 0 の計測は実施する価値がある。ただし、現在の性能ログだけでは WebM 書き出しの描画・GPU readback・CPU 変換・エンコード待ちを分離できないため、書き出し専用の opt-in 計測を小さく追加するか、同等の外部計測手段を用意する必要がある。

Phase 1 の RGBA→I420 は、現在の MediaBunny の raw VideoSample 経路を使えば、mux や VP8/VP9 の内部を変更せずに試せる可能性が高い。MediaBunny のローカル実装には I420 VideoSample の生成と VideoFrame 化があり、既存の VideoSampleSource に接続できる。ただし、Node 上で raw sample の構造を生成できたことは確認済みであり、Electron/Chromium の実際の VideoEncoder が I420 入力を受けて書き出せることまでは未確認である。

Phase 1 の最大の不確定要素は、色変換式そのものよりも、現行のレンダーターゲットを compute shader の入力テクスチャとして安全に使えるか、GPU→CPU の I420 バッファを正しい plane layout で取り出せるか、そして変換・readback の追加コストを含めて本当に速くなるかである。

なお、事前調査の後に、空シーンの 100 フレーム書き出しを WebM と連番 PNG で実施した。代表モデル・モーション・ポストエフェクト ON のケース、および I420 入力の確認はまだ実施していない。

今回の計測からは、Phase 1 は「効果なし」ではなく「効果を検証する価値あり」と判断する。webgpu-copy では CPU pixel transform が約 10 ms/frame を占め、GPU で変換すればこの部分を削減できる可能性がある。さらに、1920×1080 の tight-packed buffer では RGBA 8,294,400 byte に対して I420 は 3,110,400 byte なので、I420 のまま readback できれば転送量も理論上 62.5% 減る。ただし、GPU compute、staging copy、map、VideoSample のコピーが追加されるため、実際の改善幅は未確定であり、GPU readback 約 10 ms/frame は別のボトルネックとして残る。したがって、Phase 1 は WebM の webgpu-copy 経路に限定して進め、readback を含むジョブ全体で判断する。

## 現在の書き出し経路

現行の主な実装は src/webm-exporter.ts にある。webgpu-copy はアプリ側で独自の GPU readback command encoder を組む経路ではなく、Babylon の engine.readPixels を呼び出している。Babylon 側では、内部的に GPU texture から staging buffer へ copyTextureToBuffer を行い、queue submit、mapAsync、256 byte 行アラインメントの除去まで実施する。

現行の webgpu-copy の概略は次のとおり。

1. export 用 scene を更新して renderOnce または renderOnceForCapture を実行する。
2. engine.flushFramebuffer を呼び出す。
3. engine.readPixels で GPU texture を CPU へ readback する。
4. readback の BGRA 相当データを CPU で RGBA に変換する。
5. RGBA の Uint8Array から MediaBunny の VideoSample を作る。
6. VideoSampleSource.add から VideoFrame を作り、VideoEncoder に渡す。
7. MediaBunny の Output が encode chunk を mux し、最後に finalize する。

readpixels は別の readPixels 実装を使い、CPU 側で RGBA 行反転も行う。canvas は canvas から直接 VideoSample を作る。したがって、Phase 0 の主比較対象は webgpu-copy とし、readpixels は向きや色の比較用に残すのがよい。

現行実装には producer と consumer のキューがあり、最大 16 フレームを保持して capture と encode を重ねる。各フレームの処理時間を足し合わせるだけでは総書き出し時間にならないため、計測値は「各ステージの待ち時間」と「ジョブ全体の wall-clock」を分けて記録する必要がある。

## 棚卸しで確認できた現在値

| 項目 | 現在の状態 |
| --- | --- |
| 主な書き出し | MediaBunny の VideoSampleSource + WebCodecs |
| RGBA 入力 | VideoSample の format RGBA |
| I420 入力 | アプリ側にはまだ実装なし。MediaBunny の raw VideoSample API には対応あり |
| GPU readback | Babylon WebGPU engine.readPixels の内部で copy、submit、mapAsync、row padding 除去 |
| CPU 後処理 | webgpu-copy では BGRA 相当から RGBA へ変換。readpixels では行反転も実施 |
| VideoSample のバッファ | raw buffer は VideoSample 生成時にコピーされる |
| 出力サイズ | 幅 320〜8192、高さ 180〜8192 に clamp。偶数や 16 の倍数には現状正規化していない |
| key frame 間隔 | 現在の exporter は 10 フレーム |
| hardware acceleration | 現在の exporter は no-preference |
| 既存性能ログ | scene/render/physics などのフレーム区間が中心で、exporter の readback・CPU 変換・encode 待ちは分離していない |

過去の WebM 性能メモには、現在の src/webm-exporter.ts には存在しない performanceStats の記述、key frame 間隔 5、hardware acceleration 優先などが残っている。過去の readback 時間や約 90 ms という値も、現在の GPU、Electron、解像度、実装に対するベースラインとはみなさない。

## Phase 0 の計測設計

### 固定する条件

最初の比較では、条件を固定して capture 経路の差だけを見えるようにする。

| 条件 | 推奨 |
| --- | --- |
| capture mode | webgpu-copy を主経路、readpixels を比較経路 |
| 解像度 | まず 1920×1080。次に 1280×720 などを追加 |
| フレーム数 | warm-up 後に 100 フレーム以上 |
| codec | VP8 または VP9 のどちらか一方に固定。両方を比較する場合は別ケース |
| bitrate / key frame | 固定 |
| hardware acceleration | 固定。no-preference と明示的 hardware の比較は別ケース |
| post effects | 全 OFF の基準ケース。別途、実際の代表設定でも測る |
| audio | GPU/encode 単体の基準では OFF。mux を含む確認は別ケース |
| physics | 固定。空シーンだけでなく、代表的なモデルとモーションでも確認 |
| Electron / Chromium / GPU | バージョン、GPU、ドライバ、backend を記録 |

空シーンは GPU 描画の下限を知るために必要だが、空シーンだけではモデル、物理、材質、モーフのコストを代表しない。空シーンの後に、現在よく使うモデルとモーションを一つ固定した代表ケースを追加する。

### 分けて測る区間

| 区間 | 含めるもの | 主な確認箇所 |
| --- | --- | --- |
| render/update | モーション適用、物理、scene render、renderOnce | MmdManager の既存フレームログと照合 |
| GPU readback | flush、copyTextureToBuffer、submit、mapAsync、row padding 除去 | webgpu-copy の engine.readPixels 呼び出し |
| CPU pixel transform | BGRA→RGBA、必要な行反転、バッファ再利用 | exporter の変換関数 |
| sample creation | VideoSample 生成と raw buffer のコピー | createRawRgbaVideoSample |
| encode/backpressure | VideoSampleSource.add の呼び出し時間、キュー待ち、encoder の drain 待ち | consumeQueue |
| mux/finalize | Output の最終 flush、ファイル書き込み、finalize | runWebmExportJob の終了処理 |
| job wall-clock | export 開始からファイル完成まで | ジョブ全体 |

VideoSampleSource.add の計測値は「エンコーダーが実際に GPU/CPU で圧縮を完了した時間」ではなく、少なくともアプリから見える add と backpressure の待ち時間である。実エンコードの完了は非同期なので、encoder 出力の観測や Chromium tracing がない状態では、項目名を encode latency と断定しない。

既存の frame performance log は render/update の補助には使えるが、exporter の readback 以降の区間を代用できない。実装するなら、exporter にだけ有効な診断フラグを置き、performance.now() の開始・終了を各区間に追加し、通常の書き出し UI やファイル形式へ影響させない範囲に留めるのが妥当である。

### 集計方法

- 最初の数フレームは warm-up として捨てる。
- 各区間について平均、中央値、p95、最大値を記録する。
- ジョブ全体は wall-clock として別に記録する。
- producer と consumer の並行実行があるため、各区間の合計を total と表示しない。
- フレーム数、実 FPS、出力ファイルサイズ、キュー最大長、失敗・timeout 数も記録する。
- 可能なら同じ条件を複数回実行し、初回だけ遅いケースと毎フレーム遅いケースを分ける。

Phase 0 の判断は、「readback が遅いか」だけでなく、readback を GPU 色変換に置き換えたときに、GPU→CPU の転送量、map 待ち、CPU buffer copy、encode backpressure を含むジョブ全体が改善する見込みがあるかで行う。

## Phase 1 の技術的な成立条件

### I420 の plane layout

WebCodecs の I420 は Y、U、V の 3 plane を持つ 4:2:0 フォーマットである。奇数サイズを一般化する場合は、クロマ幅と高さを次のように計算する。

    chromaWidth = ceil(width / 2)
    chromaHeight = ceil(height / 2)
    yBytes = width * height
    chromaBytes = chromaWidth * chromaHeight
    totalBytes = yBytes + chromaBytes * 2

    Y offset = 0
    U offset = yBytes
    V offset = yBytes + chromaBytes

偶数サイズでは totalBytes が width × height × 3 / 2 になるが、これは任意のサイズにそのまま適用できる式ではない。WebCodecs の仕様は U/V について ceil(width/2) と ceil(height/2) を使うため、Phase 1 の CPU reference と GPU output の両方で同じ式を使用する。

1920×1080 の場合、tight-packed な RGBA は 8,294,400 byte、I420 は 3,110,400 byte になる。理論上は pixel data の readback 量を 62.5% 減らせるが、compute、storage buffer、staging copy、map、VideoSample の CPU copy が増えるため、この差だけで高速化を判断してはいけない。

初期実装のベンチマークは偶数サイズに限定し、必要なら 16 の倍数を条件にして shader の端処理を単純化する。ただし、16 の倍数はこの処理全体の一般的な入力条件とは分けて扱う。WebCodecs の I420 layout の要件と、VP8/VP9 や compute shader の実装上の都合を混同しない。

### MediaBunny との接続

現在のアプリは MediaBunny の VideoSampleSource を使っているため、Phase 1 では直接 VideoFrame を手作りして経路を二重化するより、次の形を第一候補にする。

1. CPU または GPU で I420 の tight-packed Uint8Array を作る。
2. format I420、codedWidth、codedHeight、timestamp、duration、必要な layout と colorSpace を指定して VideoSample を作る。
3. 既存の VideoSampleSource.add に渡す。

MediaBunny の現行ローカル実装では、raw VideoSample を内部で VideoFrame に変換してから VideoEncoder に渡す。VideoSample の raw buffer は生成時にコピーされるため、GPU readback 用 buffer の再利用タイミングを早める最適化は、VideoSample 生成後すぐに buffer を解放できるという意味では成立しない。buffer pool を作る場合は、MediaBunny のコピー完了を前提にするのではなく、実装契約を確認してから行う。

作業指示にある VideoFrame の init に transfer を追加する例は、現在のプロジェクトの DOM 型定義と MediaBunny の raw VideoSample 経路では、そのままの最適化手段として扱わない。まず VideoSample 経路で動作を確認し、ゼロコピーや ownership transfer は別の実験項目に分ける。

### WebGPU compute 入力と出力

compute shader で RGBA→I420 を行うには、現在のレンダーターゲットをそのまま読み込めるとは限らない。入力テクスチャが texture binding に対応しているか、format が shader の読み取り対象か、作成時 usage に必要な権限が含まれているかを確認する必要がある。

確認できないまま Babylon の内部 GPUTexture に依存すると、backend やレンダーターゲットの生成条件が変わったときに壊れやすい。初期案としては、export 専用の compute-compatible texture を用意するか、現行レンダー結果をその texture へコピーする adapter を設ける。

出力側は、単一の storage buffer に Y/U/V の領域を持たせる案でよい。ただし storage buffer はそのまま CPU map 用 staging buffer と同じものにはできない場合があるため、次のような二段構成を前提にする。

1. compute shader が storage buffer に Y/U/V を書く。
2. GPU command で storage buffer から MAP_READ 用の staging buffer へ copy する。
3. staging buffer を map し、I420 の tight-packed layout として CPU へ渡す。

WGSL の storage buffer へ 8 bit を個別に書く設計は、アラインメントや書き込み効率の検討が必要になる。最初から理想的な 8×2 thread layout を固定せず、u32 単位の書き込み、plane ごとの stride、奇数端のマスクを含む最小 shader で correctness を先に確認する。

### 色空間と範囲

現行の RGBA VideoSample 作成では、アプリ側で colorSpace を明示していない。RGBA→I420 では、RGB の値を YUV に変換する式だけでなく、BT.709 系か sRGB 系か、limited range か full range かを固定しないと、エンコード後に明るさや彩度が変わる。

WebCodecs 仕様には RGB と REC709 の color space 定義があり、I420 のような YUV 入力では RGB と異なる既定の扱いが関係する。Phase 1 では、次を一つの baseline として明示し、現行 RGBA 出力と比較する。

- primaries
- transfer
- matrix
- fullRange

最初に赤、緑、青、白、黒、50% グレー、肌色に近い色を含む既知の RGBA pattern を作る。CPU reference と GPU shader の I420 を比較し、さらに VideoEncoder→再生結果まで比較する。数値誤差の許容値だけでなく、limited/full range の取り違えのような大きな差を別問題として検出する。

### alpha

Phase 1 の出力形式は I420 なので、まず opaque video のみを対象にする。現在の VideoSampleSource の設定では alpha を保存する経路を有効化していないため、透明 WebM を同時に成立させる設計ではない。I420A や alpha plane は別の調査・仕様化に分ける。

## 実装前に確認するスモーク

次の順序で確認すれば、GPU shader の作り込み前に API や encoder の不成立を検出できる。

1. 現行 Electron で VideoEncoder.isConfigSupported、または MediaBunny の canEncodeVideo を同じ codec、解像度、hardwareAcceleration 条件で実行する。
2. 既知の小さな I420 VideoSample を作り、既存 VideoSampleSource に数フレームだけ追加する。
3. WebM を finalize し、ファイルが生成されること、再生できること、色と上下方向が正しいことを確認する。
4. CPU reference の I420 を使った場合と、現行 RGBA 経路の出力を同じ条件で比較する。
5. 実際の capture render target について、texture format と compute に必要な usage を診断出力する。
6. その後に最小の compute shader を追加する。

Node で I420 VideoSample の allocation size と plane metadata を確認できたことは、MediaBunny の raw sample API の成立確認にはなる。しかし、Node の probe だけでは Chromium の VideoEncoder、WebGPU device、動画再生の成立確認にはならない。

## Phase 1 の進行判断

### 進めてよい条件

- Phase 0 で readback または CPU pixel transform が、ジョブ全体に対して再現性のある割合を占める。
- I420 VideoSample を現行 Electron の VideoEncoder 経路で encode できる。
- CPU reference と GPU shader の plane layout、色、上下方向が一致する。
- 入力 texture の usage/format と出力 staging buffer の設計を明示できる。
- GPU conversion、staging copy、map、MediaBunny の sample copy を含む総時間が RGBA baseline を下回る。

### いったん止めてよい条件

- ボトルネックが GPU render、scene update、physics、encode backpressure で、RGBA→YUV では改善しない。
- I420 入力が現在の codec / Chromium / hardware 条件で使えない。
- GPU path が current render target の private internals に強く依存する。
- 色変換の基準や range を決められず、現行出力との互換性を検証できない。
- staging copy と buffer map の追加で、readback の短縮分が相殺される。

この場合は Phase 1 を実装しないことが失敗ではない。Phase 0 の結果を残し、encoder 設定、WebCodecs、Babylon の render target API、または別の出力方式を再検討するほうが安全である。

## 2026-08-06 実測結果

### 共通条件

- Windows x64、Electron 40.4.1、Chromium 144.0.7559.173、Node.js 24.13.0
- WebGPU、物理 backend は Bullet MPR
- 空シーン、モデルなし、音声なし、ポストエフェクトの active list は空
- 1920×1080、100 フレーム（0–99）、30 fps、VP8、hardware acceleration は no-preference
- 連番 PNG は同じ条件で、export window の IPC を E2E から直接起動した
- WebM の stage timer は src/webm-exporter.ts、PNG の stage timer は src/png-sequence-exporter.ts と main process の PNG 保存 IPC に追加した

### WebM

| capture mode | exporter wall-clock | render | capture | GPU readback | CPU pixel transform | sample creation | encode wait | finalize |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| webgpu-copy | 4118.7 ms | 193.4 ms | 2140.2 ms | 1013.4 ms | 996.3 ms | 129.4 ms | 86.2 ms | 16.2 ms |
| readpixels | 19431.3 ms | 195.0 ms | 17516.0 ms | 16411.2 ms | 983.0 ms | 120.6 ms | 85.3 ms | 18.3 ms |

100 フレームあたりの平均では、webgpu-copy の exporter wall-clock は 41.2 ms/frame、readpixels は 194.3 ms/frame だった。webgpu-copy は readpixels より約 4.7 倍速く、差の中心は GPU readback にある。CPU pixel transform は両経路とも約 9.8–10.0 ms/frame で、エンコード待ちは 1 ms/frame 未満だった。両経路の WebM 出力は 1,799,445 bytes で、今回の空シーンでは出力内容のサイズ差はなかった。

### 連番 PNG

100 フレームの出力に成功し、出力ファイルの合計は 10,898,651 bytes だった。

| stage | 合計 | 100 フレーム平均 |
| --- | ---: | ---: |
| exporter wall-clock | 103156.0 ms | 1031.6 ms/frame |
| seek | 2.0 ms | 0.02 ms/frame |
| capture | 100375.8 ms | 1003.8 ms/frame |
| save IPC（4 worker の待ち時間合計） | 8779.8 ms | 87.8 ms/frame |
| PNG encode | 6551.3 ms | 65.5 ms/frame |
| file save | 185.3 ms | 1.85 ms/frame |

PNG の capture は Babylon の CreateScreenshotUsingRenderTargetAsync と RenderTargetTexture の readPixels 経路であり、WebM の webgpu-copy ではない。したがって、今回の PNG の約 1 秒/frame という値は PNG 形式そのものではなく、現在の連番 PNG capture adapter のボトルネックとして読む。PNG 側では初回 320×180 の 1 フレーム確認も行い、ファイル生成と stage timer の保存を確認した。

### 判定と次の優先順位

1. Phase 0 の判定は「中間」ではなく、WebM の webgpu-copy では GPU readback と CPU pixel transform の両方が見えている。readpixels 比較では readback の差が特に大きい。
2. Phase 1 の RGBA→I420 は、CPU pixel transform の約 10 ms/frame を対象にできるため、実装価値はある。単純にこの CPU 処理だけを除けるなら、webgpu-copy の 41.2 ms/frame から約 31 ms/frame まで下がる差分が机上の目安になる。ただしこれは実測ではなく、GPU compute、staging copy、map、VideoSample のコピーが相殺する可能性がある。I420 の readback で転送量が減る効果も期待できるが、GPU readback 約 10 ms/frame は残るため、I420 化だけで今回の主ボトルネック全体が解消するわけではない。
3. PNG は WebM と capture 経路が別で、1003.8 ms/frame の capture が支配的だった。連番 PNG の高速化では、まず WebGPU copy 相当の capture adapter または render target の再利用を検討する。
4. I420 VideoSample の Electron encode smoke、compute → staging → CPU map の prototype、代表モデル・モーションでの再計測は未実施のまま残す。

30fps・1920×1080 の 3 分動画は 5400 フレームになる。現行の CPU pixel transform 約 10 ms/frame を完全に除去できる GPU swizzle だけなら、短縮幅は理論上約 54 秒である。さらに I420 の tight-packed readback が RGBA のデータ量に比例して短くなると仮定すると、readback から追加で約 34 秒、合計で理論最大約 88 秒の短縮になる。compute、staging copy、map、VideoSample のコピーを考慮した試作前の期待値は 45〜80 秒程度と置く。この見積もりは readback の実測がデータ量に比例することを前提にしておらず、実装の採否は 100 フレームの A/B 計測で決める。

計測中、WebGPU の Destroyed texture ... used in a submit validation warning が出た。出力自体は完了したが、export window の終了・render target dispose 付近の順序問題の可能性があるため、計測値を製品版の絶対値とみなす前に cleanup race を確認する。

## 実装タスク候補

- [x] capture mode、codec、解像度、FPS、フレーム数、GPU、Electron/Chromium を記録する Phase 0 ケースを定義する
- [x] exporter 専用の stage timer を追加する
- [x] webgpu-copy の baseline を warm-up + 100 フレーム以上で取得する
- [x] readpixels との色、上下方向、速度を比較する
- [ ] MediaBunny I420 VideoSample の Electron encode smoke を追加する
- [ ] I420 の CPU reference と既知色 pattern の比較を追加する
- [ ] capture texture の format / usage を調査する
- [ ] compute → storage buffer → staging buffer → CPU map の最小 prototype を作る
- [ ] RGBA baseline と I420 prototype の wall-clock、p95、出力品質、メモリ使用量を比較する
- [ ] 改善が確認できた場合だけ experimental flag 付きの exporter adapter に進む

## 参照

プロジェクト内:

- [Phase 0 / Phase 1 作業指示](./webgpu-yuv-phase1-work-order-2026-08-04.md)
- [出力改善計画](./output-improvement-plan-2026-08-04.md)
- [WebGPU WebM Capture 実装メモ](./webgpu-webm-capture-implementation-note-2026-04-22.md)
- [WebM 出力性能分析](./webm-export-performance-analysis-2026-04-21.md)
- [性能ログ運用ガイド](./performance-logging-guide-2026-06-15.md)
- [現行 exporter](../src/webm-exporter.ts)
- [連番 PNG exporter](../src/png-sequence-exporter.ts)
- [PNG 保存 IPC](../src/main.ts)

外部一次情報:

- [W3C WebCodecs](https://www.w3.org/TR/webcodecs/)
- [GPU for the Web WGSL Editor's Draft](https://gpuweb.github.io/gpuweb/wgsl/)
- [Mediabunny: Writing media files](https://mediabunny.dev/guide/writing-media-files)
