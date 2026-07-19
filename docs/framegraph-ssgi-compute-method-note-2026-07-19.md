# FrameGraph SSGI Compute方式 実装解説 2026-07-19

## 目的

MMD_modoki の「GI（実験的）」として実装した、単フレーム・画面空間 gather 方式の
構成、見え方、制約を記録する。

この文書は実装済みの Phase 1 を説明するものであり、方式選定前の比較は
[FrameGraph SSGI 偵察・設計メモ](./ssgi-design-note-2026-07-19.md)を参照する。

## 要約

現行実装の方式名は `single-frame-screen-space-gather` である。

これは物理的な Global Illumination solver ではなく、現在フレームの `sceneColor` から
近傍surfaceの色を集め、`viewDepth` と `viewNormal` で妥当性を絞って元画像へ合成する
**軽量な screen-space color bleeding近似**である。

- gather: `FrameGraphComputeShaderTask`
- gather解像度: 入力の縦横をそれぞれ2分の1にした半解像度
- gather出力: `RGBA16F` storage texture
- denoiser: 半解像度の5x5 A-Trous computeを3 pass（step `1 / 2 / 4`）
- denoiser guide: `sceneColor + viewDepth + viewNormal + confidence`
- composite: `FrameGraphPostProcessTask`
- composite解像度: full-resolution
- composite mode: `Soft Light` 固定
- 入力: `sceneColor + viewDepth + viewNormal`
- 履歴buffer、前フレーム参照、時刻、フレーム番号: なし
- backend: WebGPU限定
- stack上の既定位置: `SSR -> SSGI -> SSAO -> ... -> Bloom`

設計調査時は、Phase 1 の実装コストを抑える案としてフラグメントgatherを推奨していた。
最終的には `FrameGraphComputeShaderTask` を実地検証する目的を含め、gatherをCompute、
既存PostFX stackへ戻す処理をフラグメントとする混成方式を採用した。

## 2026-07-19 初回実機所感

ユーザー実機スクリーンショット（未コミットの再現資料）では、赤と青の背景、
白い椅子や窓枠、中央の白い衣装を持つモデルを含むsceneで次の所感が得られた。

- 60 fps表示を維持しており、速度面は良好。
- 期待したほど強い赤・青の色移りは見えない。
- 白い高輝度部分の周辺に、細かな拡散または粒状の寄与が先に見える。

この傾向はパラメータUIの配線不良より、初期algorithmの性質と整合した。
特に、白を含むneutral colorにも最低 `0.22` の寄与を残していたこと、半解像度の固定
24 sample patternを使っていたこと、scene colorを直接光と間接光に分離せずsourceに
していたことが影響した。

また、実行logでは背景用skydomeが `disableDepthWrite: true` であることを確認した。
初期実装はsample側にも有効なdepth / normalを要求したため、画面に見えている赤・青が
背景またはskydome由来なら、その色をGI sourceとして利用できなかった。

## 2026-07-19 色移り強化調整

ユーザー要望を「stageからmodelへの色移りと環境光らしさ」と定義し直し、次を変更した。

- sample数を24から48へ増加。
- sample半径を `1..256px`、既定 `64px`へ拡張。
- `pow(color, 2.2)`近似をpiecewise sRGB transfer functionへ変更。
- linear RGBのluminanceとsaturationを分離し、高彩度sourceを最大1.8倍で優先。
- neutral sourceの最低weightを `0.22` から `0.035` へ低下。
- 高彩度sourceはchromaをluminanceから最大1.45倍へ広げる。
- depth差のhard cutoffを廃止し、高彩度surfaceは緩やかなdepth falloffに変更。
- screen-space線分上のdepthを2点調べるsoft occlusionを追加。
- depth / normalを持たない高彩度背景を、distant environment sampleとして採用。
- guided upsampleのnormal exponentを8から4へ緩和。
- nearest fallback confidenceを `0.35` から `0.50` へ変更。

受光側のcenter pixelには引き続き有効なview depth / normalを要求する。
したがって背景そのものへGIを描くのではなく、modelやfloorなどGeometry Rendererへ
参加するsurfaceだけが環境色を受け取る。

neutralなMRT非参加sampleのenvironment weightとcolor weightは、後述する再調整で
source luminanceに連動する下限へ変更した。一方、高彩度背景はenvironment weight最大
`0.45`、color weight最大 `1.8`のままとし、stage色を拾いやすい性格を維持している。

## 2026-07-19 Spatial denoiser強化

色移り強化後のユーザー実機確認では、stageからmodelへの赤・青の色移りは狙いに
近づいた一方、赤い床・壁とmodel周辺に固定sample由来の細粒が残った。
60 fpsに余裕があるという結果を受け、履歴を使わない空間denoiserを追加した。

採用したのは、半解像度GIに対する3 passのedge-aware A-Trous filterである。

| pass | step width | tap数 | 主な役割 |
| --- | ---: | ---: | --- |
| 1 | 1 | 25 | 1～2 pixel単位の細粒を均す |
| 2 | 2 | 25 | 残った中周波のむらを均す |
| 3 | 4 | 25 | 広い平坦面の低周波ノイズを抑える |

各passは5x5のbinomial kernel `[1, 4, 6, 4, 1]` を使う。単純blurではなく、
次のguideを掛け合わせる。

- view depth:
  - receiverから奥行きが離れたsampleを指数減衰させる。
  - stepが広いpassでは許容幅を少しだけ広げる。
- view normal:
  - normalの内積を8乗し、曲面内の回り込みを許容しながらmodel輪郭や床と壁の境界を保つ。
- scene color:
  - piecewise sRGBでlinear化する。
  - luminance差とchroma差を別々に比較し、赤青stage境界をまたぐblurを抑える。
- gather confidence:
  - confidenceが高いsampleを優先する。
  - confidence 0のcenterでも、同じsurfaceの近傍に根拠があればholeを空間的に補間する。
  - 出力alphaは有効近傍全体に対するconfidence加重平均とする。

3 passはそれぞれ別の半解像度 `RGBA16F` storage textureへ書き込む。これにより、
同じtextureを同一dispatchでread/writeするhazardを避ける。最終passの出力だけを
full-resolution compositeへ渡す。

filterの係数、step、pass数は固定で、time、frame counter、乱数、前フレームは使わない。
したがってseek決定論を維持する。SSGI entryを無効化した場合はgather、denoise 3 pass、
compositeをまとめて無効化し、entry削除時は中間textureも生成しない。

## Frame Graph上の構成

```text
現在位置までの sceneColor
  + Geometry Renderer viewDepth
  + Geometry Renderer viewNormal
          |
          v
FrameGraphPostEffectsSsgiGatherTask
  - FrameGraphComputeShaderTask
  - 8 x 8 workgroup
  - 48 samples / half-resolution pixel
          |
          v
RGBA16F half-resolution indirect radiance + confidence
          |
          v
FrameGraphPostEffectsSsgiDenoiseTask x 3
  - FrameGraphComputeShaderTask
  - 5 x 5 A-Trous, step 1 / 2 / 4
  - scene color / depth / normal / confidence guided
          |
          v
RGBA16F half-resolution denoised radiance + confidence
          |
          v
FrameGraphPostEffectsSsgiCompositeTask
  - FrameGraphPostProcessTask
  - depth / normal guided upsample
  - sceneColorへSoft Light合成
          |
          v
後続PostFX（既定ではSSAO、Bloomなど）
```

gatherとcompositeを分離した理由は次の通り。

- irregularな近傍sampleをCompute側へ隔離できる。
- 半解像度のstorage textureを明示的な中間結果にできる。
- 最終合成は既存のPostFX stackと同じfull-screen passとして接続できる。
- stackの並べ替え時は、その時点の `currentTexture` をgather、denoiser、
  compositeのscene color入力へ再接続できる。

## Resource planと入力契約

SSGI entryが有効な場合、resource planは次を要求する。

| key | producer | 用途 |
| --- | --- | --- |
| `sceneColor` | import / 直前のstack出力 | gatherする色と最終合成元 |
| `viewDepth` | Geometry Renderer | view位置復元、depth整合判定、upsample guide |
| `viewNormal` | Geometry Renderer | surface向き判定、edge判定、upsample guide |

`reflectivity` は要求しない。SSR、SSGI、SSAOを同時に使う場合、`viewDepth` と
`viewNormal` は同じGeometry Renderer MRTから共有する。

stack entryの存在と強度は分離している。`{ id: "ssgi", enabled: true }` であれば
強度が `0.00` でもresourceは確保される。強度 `0.00` は合成結果を完全なpass-through
にする値であり、entryの削除または無効化とは異なる。

## Gather Compute pass

### 出力

full-resolutionを `W x H` とすると、出力は次の大きさになる。

```text
ceil(W / 2) x ceil(H / 2)
```

formatは `RGBA16F`、mipmapなし、sample数1、storage用途である。

- RGB: 推定した間接色
- A: sampleの有効度から作ったconfidence

各half-resolution pixelは、対応するfull-resolution領域の
`outputPixel * 2 + 1` を中心pixelとして使う。

### View位置の復元

`viewDepth` とcameraの逆projection matrixからview-space位置を復元する。
screen-spaceの距離だけでなく、receiverからsourceへ向かうview-space方向を求め、
receiver normalとsource normalの向きをweightへ反映する。

### Sample pattern

1つのhalf-resolution pixelにつき次を実行する。

- 3方向のslice
- sliceごとに正負の2方向
- 各方向へ8 step
- 合計48 sample

step距離は線形ではなく、正規化stepを二乗してsample半径へ掛ける。
これにより中心付近へ多めにsampleを置きつつ、指定半径まで探索する。

各pixelのslice回転角は、pixel座標だけをseedにしたhashで固定する。

```text
rotation = hash(outputPixel)
```

時刻、frame count、乱数stateを使わないため、同じ入力から毎回同じsample patternが
得られる。一方で、この固定patternは時間的に平均化されないため、細かな粒状感が
静止したまま見えることがある。

### Sampleの有効性

中心pixelで次に該当する場合は出力を0にする。

- `viewNormal.a < 0.5`
- `abs(viewDepth) < 0.000001`

sample pixelが同条件に該当する場合、view位置とsurface normalを使う通常gatherには
参加させない。ただしscene colorに色または十分なluminanceがある場合は、depthを持たない
背景またはskydomeのdistant environment sampleとして利用する。

この分岐にはgeometryの向きや厳密な遮蔽情報がない。そのためneutral colorは
luminance連動の低いweightに制限し、有彩色の環境補助光を引き続き優先する。

### Sample weight

weightは概ね次の積である。

```text
weight =
  depthCompatibility
  * surfaceEvidence
  * receiverFacing
  * sourceFacing
  * distanceWeight
  * visibility
```

- `depthCompatibility`
  - 中心とsampleの相対depth差を指数減衰させる。
  - saturationが高いsourceほど減衰を緩める。
  - 固定thicknessは `0.01`。
- `surfaceEvidence`
  - depth差またはnormal差があるsampleを優先する。
  - saturationが高ければ最低evidenceを引き上げ、同一平面の色面も拾う。
- `receiverFacing`
  - receiver normalがsource方向を向くほど強くする。
- `sourceFacing`
  - source normalがreceiver方向を向くほど強くする。
- `distanceWeight`
  - 遠いstepほど弱くする。
- `visibility`
  - receiverとsourceのscreen-space線分を3分割し、途中2点のdepthを調べる。
  - perspective-correctに補間した期待depthより手前にgeometryがあれば `0.45` 倍する。
  - 2点とも遮られた場合は `0.2025` 倍になる。

`receiverFacing` と `sourceFacing` には最低値 `0.35` を設ける。
遮蔽時も0へ切らずsoft occlusionにしたのは、foreground modelが背景stageから受ける
環境色を完全には失わないためである。

### Source colorとchroma重み

scene colorはsRGB transfer functionでlinear化する。

```text
sourceLinear =
  c <= 0.04045
    ? c / 12.92
    : ((c + 0.055) / 1.055) ^ 2.4
```

これは現行scene colorがdisplay / sRGB-space寄りであることへの対応であり、
厳密なradiometric値ではない。direct lighting、albedo、emissive、既存PostFXの結果を
分離できない。

色付きsourceを優先するため、linear RGBの最大channelと最小channelの差から
saturationを作る。

```text
saturation = (maxChannel - minChannel) / max(maxChannel, 0.02)
chromaPreference = smoothstep(0.08, 0.75, saturation)
neutralLightEvidence = smoothstep(0.02, 0.45, sourceLuminance)
neutralContribution = mix(0.18, 0.45, neutralLightEvidence)
colorBleedWeight = mix(neutralContribution, 1.8, chromaPreference)
```

さらにlinear luminanceを中心にchromaを最大1.45倍へ広げる。強い赤や青を明確にする
上限は維持しつつ、白・灰色はlinear luminanceに応じて `0.18..0.45` のweightを持つ。
これにより暗いneutral textureの全面的な持ち上がりは抑え、明るい床・壁・衣装からの
soft-light ambienceを以前より拾いやすくする。

48 sampleの加重平均を `0..2` へclampし、weight合計から次のconfidenceを作る。

```text
confidence = clamp(weightSum / 3.0, 0, 1)
```

## Denoise後のCompositeと半解像度upsample

compositeはfull-resolutionで実行する。各pixelについて、近傍4点のhalf-resolution
GIを次のguideで補間する。

- bilinearな空間距離
- centerとのview depth類似度
- centerとのview normal類似度
- denoiserが伝播したconfidence

normal類似度は4乗しており、surface境界を保ちつつmodel上で途切れすぎないようにする。
有効な4点が得られない場合は最寄りのGIを使うが、confidenceを `0.50` 倍に落とす。

最後に元のscene colorへSoft Lightで合成する。

`Additive` は従来のlinear加算式をそのまま残す。

```text
combinedLinear =
  sourceLinear
  + indirect * strength * confidence
```

その後、inverse sRGB transfer functionでdisplay側へ戻す。変換時にchannelを `0..1`へ
clampするため、強いGIを白いsurfaceへ加算すると白飛びしやすい。

`Soft Light` と `Overlay` は画像編集softwareに近いsRGB-spaceのlayer blendとして扱う。
GIはlinear RGBの最大channelが1になるよう正規化してblend colorを作る。したがって、
GIの絶対energyを足すのではなく、主に色相とcontrastを移す。

```text
blendColor =
  linearToSrgb(indirect / max(indirect.r, indirect.g, indirect.b))

blendOpacity =
  strength
  * confidence
  * smoothstep(0.015, 0.35, indirectPeak)
```

Soft LightはW3C / 画像編集系のpiecewise式、Overlayはbase channelが0.5未満ならmultiply、
0.5以上ならscreen相当の式を使う。どちらもbaseが完全な白なら結果も白、完全な黒なら
結果も黒になる。このため加算のように白へさらにenergyを足してclipさせない。

実機比較後の製品経路はSoft Lightへ固定した。Additive / OverlayのWGSL分岐は比較結果の
記録と局所的なrollback用に残しているが、UIからは選択できず、projectの旧mode値も
Soft Lightとして読み込む。

最終結果は元画像とblend結果を `blendOpacity` でmixする。mode切替はcomposite uniform
だけを変更し、FrameGraph taskやtextureを再構築しない。

強度が `0.00001` 以下なら、元のRGBAをそのまま返す早期returnがある。

## パラメータの意味

### 強度

- 範囲: `0.00..1.00`
- 既定値: `0.30`
- 作用箇所: Soft Lightのblend opacity

強度を上げてもsample数、探索距離、surface判定、confidenceは変わらない。
現行gatherが色を拾えていないsceneでは、`1.00` にしても期待する色移りが急に
増えるとは限らない。

### 合成mode

- `Additive`
  - 初期比較方式。現在の製品経路では選択不可。
  - 色移りの光量感は最も強いが、高強度では白飛びしやすい。
- `Soft Light`
  - 現在の固定方式。
  - 白黒端点を保ち、中間toneへ比較的穏やかに色を移す。
- `Overlay`
  - Soft Lightよりcontrastを強くする初期比較用mode。現在の製品経路では選択不可。
  - toonの面分けを強調しすぎる可能性がある。

projectには互換用としてmode項目を残すが、保存時は常に `Soft Light` を書く。
mode項目を持たない旧projectやAdditive / Overlayを保存した比較中のprojectも
`Soft Light`として読む。GI detail panelのselectorは撤去した。

### 半径

- 範囲: `1..256 px`
- 既定値: `64 px`
- 単位: full-resolution pixel
- 作用箇所: gatherの最大screen-space探索距離

半径は光量ではない。大きくすると遠くのsurfaceへ届く一方、sample密度が相対的に
粗くなり、無関係な高輝度surface、silhouette、depth discontinuityを拾いやすくなる。
そのため最大値が必ず強く自然なGIになるわけではない。

## 初回問題に対する現在の対策

初回実装の問題に対し、現在は次の対応を入れている。

1. neutral weightをluminance連動の `0.18..0.45` とし、暗部を抑えつつ明るい環境光を戻す。
2. saturationによってcolor weight、chroma、depth許容、surface evidenceを増やす。
3. 48 sampleへ増やし、6方向へ探索してcoverageを改善する。
4. depth / normalを持たない高彩度背景をenvironment sampleとして採用する。
5. 途中depthを2点調べ、foregroundをまたぐ色漏れをsoft occlusionで抑える。
6. guided upsampleを緩和し、model surface内の寄与切れを減らす。
7. sRGB transfer functionで中間色の変換誤差を減らす。

ただしsourceは引き続き最終scene colorであり、物理的なalbedoや入射radianceではない。
現在の狙いは物理GIではなく、トゥーンsceneでstage色が分かる決定論的な環境補助光である。

## 決定論

次を使用していない。

- history texture
- previous frame
- temporal accumulation
- frame counter
- time uniform
- フレームごとに変化する乱数

sample回転はpixel座標だけから決まる。同じcamera、scene、stack入力であれば、
同一フレームへのseekでも同じ結果を作れる設計である。

初回実装時は、entryを削除して再追加した後のON画像が0 pixel差だった。
色移り強化後も同一状態で連続captureした2枚のPNGはSHA-256が一致した。
timeline seek往復を含む実モデルでのbit-exact比較は未確認である。

## WebGPU限定とfallback

gather出力にstorage textureを使うため、WebGPUとcompute shader supportが必要である。

- WebGPU + `supportComputeShaders`: gather / composite taskを生成する。
- WebGLなど未対応backend: stack entryは保持するがtaskを生成しない。
- 未対応時: session中に一度だけwarning logを出す。

`FrameGraphComputeShaderTask` の実行にはBabylon.jsの
`engine.computeShader` extensionのside-effect importが必要だった。これがない場合、
WebGPU engineにcompute context生成methodが登録されず、実行時エラーになった。

## 性能

色移り強化後・denoiser導入前の内蔵静的sceneでは、入力 `1103x620`、GI `552x310`、
各half-resolution pixel 48 sample、強度 `1.00`、半径 `192px`で次の値だった。

| 状態 | FPS | frame total | PostFX区間 |
| --- | ---: | ---: | ---: |
| SSGI ON | 60 | 2.035 ms | 0.401 ms |
| SSGI OFF | 60 | 1.449 ms | 0.009 ms |

差はframe totalで約 `+0.586ms`、PostFX区間で約 `+0.392ms`だった。
いずれも60 fps表示を維持した。ただし、これはMMD modelなしのCPU側instrumentationで、
GPU timestampによる厳密なbenchmarkではない。実モデル、高解像度、他の重いPostFXとの
併用時のcostは未確定である。

3 pass denoiser導入後、同じ入力解像度の内蔵静的sceneで得た
CPU側instrumentationは次の範囲だった。

| 状態 | FPS | frame total | PostFX区間 |
| --- | ---: | ---: | ---: |
| SSGI ON | 60 | 1.850 ms | 0.364 ms |
| SSGI OFF | 60 | 1.014 ms | 0.023 ms |
| SSGI再ON | 60 | 2.053 ms | 0.403 ms |

ON/OFF差はframe totalで約 `+0.8..1.0ms`、PostFX区間で約 `+0.34..0.38ms`の
観測範囲だった。GPU dispatch時間を直接測った値ではないため、denoiser単体のGPU costを
この差から分離することはできない。少なくとも検証sceneでは60 fpsを維持した。

## 現行方式の位置づけ

現時点では次の性格を持つ実験effectとして維持する。

- 長所:
  - 単フレームで決定論的。
  - 半解像度48 sampleと3 pass空間denoiseを併用しても60 fpsを維持した。
  - depthを書かない高彩度stage背景も環境色として拾える。
  - 材質を変更しない。
  - stackの `{ id, enabled }` として着脱・並べ替えできる。
  - WebMを含むFrame Graph PostFX経路へ接続できる。
- 短所:
  - 実モデルを使った色移り強度の最終調整が必要。
  - environment sampleには正確な位置・normal・遮蔽情報がない。
  - screen-space外のsourceを扱えない。
  - denoiserはsample不足そのものを解消しないため、低周波のむらは残り得る。
  - scene color guideにより、細かなtexture境界では平坦面よりdenoiseが弱くなる。
  - 物理的なenergy conservationやmulti-bounceはない。

速度、決定論、stack統合を維持したまま、stage色を優先する方向へ調整した。
実際の赤青stageと白modelで、強さとleakのバランスを目視確認する必要がある。

## 将来の改善候補

以下は今回実装しない。

### 履歴を使わずに改善できる候補

- GI textureとconfidenceのdebug表示を追加し、拾えていない段階を判別する。
- denoise前後のGI textureとconfidenceを比較できるdebug表示を追加する。
- environment sampleのscreen-space coverageと強度をscene別に再調整する。
- soft occlusionのprobe数とdepth biasを実モデルで調整する。

### 契約変更を伴う候補

- albedo相当のMRTを追加し、scene colorから照明成分を分離する。
- source radiance専用bufferを作る。
- 複数passのscreen-space Radiance Cascadesを試作する。
- temporal accumulationとreprojectionを追加する。

後者は材質・prepass互換性、MRT cost、seek決定論へ影響する。特にtemporal
accumulationは「前フレーム参照なし」というPhase 1制約と衝突するため、別Phaseとして
扱う必要がある。

PBR化とworld-space probeは引き続き対象外とする。

## 実装箇所

- gather / composite WGSL:
  - [`src/render/frame-graph-ssgi-shaders.ts`](../src/render/frame-graph-ssgi-shaders.ts)
- FrameGraph taskと中間texture:
  - [`src/render/frame-graph-ssgi-task.ts`](../src/render/frame-graph-ssgi-task.ts)
- task生成、接続、stack reorder、diagnostic:
  - [`src/render/frame-graph-post-effects-controller.ts`](../src/render/frame-graph-post-effects-controller.ts)
- requirement keys:
  - [`src/render/frame-graph-resource-plan.ts`](../src/render/frame-graph-resource-plan.ts)
- stack IDとactive判定:
  - [`src/shared/frame-graph-post-effect-stack.ts`](../src/shared/frame-graph-post-effect-stack.ts)
- UI:
  - [`src/ui-controller.ts`](../src/ui-controller.ts)
- 保存と復元:
  - [`src/project/project-serializer.ts`](../src/project/project-serializer.ts)
  - [`src/project/project-importer.ts`](../src/project/project-importer.ts)

## 結論

今回の方式は、`FrameGraphComputeShaderTask` を使った半解像度の単フレームgather、
3 pass A-Trous spatial denoiser、depth / normal guided upsample、Soft Light固定の
layer compositeを組み合わせた軽量SSGIである。

初回実機で見えた「速度は良いが色移りが弱く、白い部分の拡散がやや見える」という結果を
受け、高彩度優先、48 sample、soft occlusion、skydome環境色sampleを追加した。
Soft Light採用後は、明るいneutral sourceの寄与だけをluminance連動で緩和した。
さらに固定sample由来の細粒に対して、scene color / depth / normal /
confidence guidedの空間denoiserを追加した。白飛び対策の比較を経てSoft Lightへ固定し、
法線許容を一段緩めて曲面内の回り込みも増やした。実機compile、60 fps、連続captureの
決定論は確認済みである。

Phase 1の制約を維持しながら、方式の狙いを「近接surfaceの弱いにじみ」から
「トゥーン向けのstage color ambience」へ寄せた。次の判断材料は、実際の赤青stageと
白modelでの見え方であり、そこで強すぎるhaloまたは不足があればenvironment weightと
occlusion biasを調整する。
