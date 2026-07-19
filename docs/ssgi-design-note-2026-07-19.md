# FrameGraph SSGI 偵察・設計メモ 2026-07-19

## 目的

MMD_modoki の Frame Graph PostFX に、画面空間の間接光を追加するための事前調査と
Phase 1 設計をまとめる。

今回は調査と設計のみで、実装は行わない。

> 実装後に確定したCompute gather、合成方法、実機での見え方は
> [FrameGraph SSGI Compute方式 実装解説](./framegraph-ssgi-compute-method-note-2026-07-19.md)
> に分離して記録した。

## 結論

Phase 1 は次を推奨する。

- 方式は **(A) 単フレーム SSGI**
- 実行方式は **フラグメント（CustomPostProcess 系）**
- `sceneColor + viewDepth + viewNormal` だけを入力にする
- gather は半解像度、合成はフル解像度
- 履歴・前フレーム参照・フレーム番号由来の乱数は使わない
- デフォルト順序は **SSGI を Bloom より前**に置く
- 強度は `0.00..1.00`、初期値は暫定 `0.25`
- SSGI の存在条件はスタックの `{ id: "ssgi", enabled }` とし、強度 `0` と分離する

`FrameGraphComputeShaderTask` は利用可能だが、Phase 1 の「各ピクセルが近傍を gather
して一枚の画像を出す」処理では、storage texture、手動 dependency、WebGPU 限定という
追加コストに対する利点が小さい。

Radiance Cascades は決定論的でノイズを避けやすい可能性がある一方、公開されている
分かりやすい実装の多くは 2D / flatland 向けである。透視投影された 3D の depth /
normal だけから安定した可視性と cascade merge を作る部分は未確立で、Phase 1 としては
リスクが高い。調査候補として保留する。

## 調査した現行構成

### Frame Graph の入口

`src/mmd-manager.ts` は、既存のシーンを `RenderTargetTexture` にもう一度描画し、その
scene color を `FrameGraphPostEffectsController` に import している。

Frame Graph 側の大まかな流れは次の通り。

```text
imported scene color
  -> ImageProcessingTask
  -> ordered post-effect stack
  -> FXAA
  -> backbuffer
```

`ImageProcessingTask` はスタックより先に固定されている。import された scene color は
現行コメント上「display / gamma-space」として扱われ、`fromLinearSpace = false` が
設定されている。

このため Phase 1 の SSGI は、物理的に正しい HDR lighting pass ではない。
SSGI 内部だけで scene color を近似的に linear 化して gather / 加算し、既存スタックへ
戻す前に display-space へ戻す。将来 scene color 全体を linear HDR 化する場合は、
ImageProcessing / tone mapping の位置を含む別設計が必要になる。

### 現行 GeometryRenderer MRT

`FrameGraphResourcePlan.requirementKeys` に応じて、GeometryRenderer の
`textureDescriptions` は次のように最小化されている。

| 消費側 | MRT |
| --- | --- |
| Offset Shadow / Offset Highlight | `viewDepth` |
| SSAO | `viewDepth` + `viewNormal` |
| SSR | `viewDepth` + `viewNormal` + `reflectivity` |

GeometryRenderer は必要な場合だけ一つ作られ、複数エフェクトで共有される。

過去に不要な MRT を要求した結果、WebGPU で fragment output と color target の不一致が
発生している。SSGI でも「使うかもしれない」MRTを追加してはいけない。

また、GeometryRenderer はシーンをもう一度描画する。MMD outline と SSAO の併用には
既知の干渉があるため、SSGI でも同じ実機確認が必要になる。

## SSGI の requirementKeys

Phase 1 では `FrameGraphSharedResourceKey` に新しいキーを追加しない。

SSGI が必要とするのは既存の次の三つだけである。

- `sceneColor`
- `viewDepth`
- `viewNormal`

`sceneColor` は現行 resource plan が active effect 全てに自動追加している。
`buildFrameGraphResourcePlan()` には次の consumer 追加だけを行う。

```ts
if (activeEffects.includes("ssgi")) {
    addConsumer(consumersByKey, "viewDepth", "ssgi");
    addConsumer(consumersByKey, "viewNormal", "ssgi");
}
```

これにより、次が維持される。

- SSGI 単独: `sceneColor + viewDepth + viewNormal`
- SSGI + SSAO: 一つの GeometryRenderer で depth / normal を共有
- SSGI + SSR: reflectivity は SSR だけが要求
- SSGI 無効: SSGI 由来の MRT 要求はゼロ

半解像度の GI 出力は SSGI タスク内部の transient texture であり、
shared resource plan のキーにはしない。

### albedo MRT を追加しない理由

Phase 1 は材質に一切触らない。

GeometryRenderer には `geometryAlbedoTexture` も存在するが、MMD material が prepass
albedo を期待どおり出すか、toon / sphere texture / emissive のどこまでを含むかを別途
検証する必要がある。MRTも増える。

Phase 1 は scene color を「画面に見えている放射輝度の代理」として直接 gather する。
したがって結果は厳密な diffuse irradiance ではなく、画面空間 color bleeding を含む
疑似間接光である。この制約を受け入れて材質経路を分離する。

## 差し込み位置

Phase 1 のデフォルト順序は次を推奨する。

```text
SSR
  -> SSGI gather / composite
  -> SSAO
  -> Offset Shadow / Offset Highlight
  -> DoF
  -> Luminous
  -> Bloom
  -> LUT / color correction ...
```

SSGI はライティング寄りの処理なので、DoF、Bloom、LUTより前に置く。
SSAO を後段にすることで、既存のAO合成が間接光にも作用する構成とする。

スタックの一員として着脱可能にするが、Phase 1 の品質保証位置は canonical order の
「Bloom より前」に限定する。Bloom 後へ移動した場合もクラッシュや黒画面は許容しないが、
物理的・視覚的な意味は保証しない。

現行コントローラーはタスク生成順が固定で、stack order の変更時に graph 全体を
再構築して source handle を接続し直している。SSGI の gather / composite は必ず連続した
task group として扱い、片方だけが別位置へ移動しないようにする。

## (A) 単フレーム SSGI

### Phase 1 アルゴリズム案

半解像度の各ピクセルについて次を行う。

1. `viewDepth` から view position を復元する
2. `viewNormal` を取得する
3. ピクセル座標だけをseedにした固定方向を作る
4. 画面上の複数方向へ、距離を広げながら depth / normal / scene color をsampleする
5. depth差、厚み、法線方向、距離減衰から可視寄与を計算する
6. scene colorを近似linear化し、間接色として加算する
7. RGBに間接色、Aにhit/confidenceを出力する

初期固定値の目安は次。

- 2 slice
- sliceの両側
- 片側6 step
- 合計24 sample / half-resolution pixel
- pixel座標由来の固定回転のみ
- フレーム番号、time、前フレームtextureは不使用

これは Three.js の単フレーム向け low preset
（2 slice × 6 step × 2 sides）と同程度の開始点である。

乱数系列を毎フレーム変えないため、動画中のランダムノイズは発生しない。
ただし半解像度由来の固定パターン、バンディング、画面外情報欠落、depth edgeのlight leak
は残る。

### アップサンプル

合成taskはフル解像度で実行する。

単純なbilinear拡大ではなく、半解像度GIの周辺4 sampleについて、フル解像度
`viewDepth / viewNormal` をguideにした重みを付ける。

```text
weight =
  spatialWeight
  * depthSimilarity
  * normalSimilarity
  * confidence
```

新しい downsampled depth / normal texture は作らず、候補sampleのUVで既存の
full-resolution depth / normalを参照する。

### 規模見積もり

| 項目 | 見積もり |
| --- | --- |
| Frame Graph task | gather + composite の2 task |
| WGSL | gather 220〜360行、upsample/composite 80〜140行 |
| WGSL合計 | 約300〜500行 |
| TypeScript / state / UI / project変換 | 約350〜600行 |
| GLSL fallback | WGSLと同程度を別途記述 |
| PoC | 5〜8人日 |
| MMD向け調整・実機回帰 | 追加3〜6人日 |
| リスク | 中 |

行数はコメント、shader登録、debug viewを除く概算である。

### 主なリスク

- 画面外・背面の光は拾えない
- scene colorに直射光や既存AOが含まれ、エネルギー保存しない
- 透明髪、半透明材質、エッジ付近でleakしやすい
- 静止ノイズと低周波バンディングが残る
- tone mapping済みの色から失われたHDR情報は復元できない
- GeometryRenderer追加描画とMMD outlineの併用を実機確認する必要がある

## (B) スクリーンスペース Radiance Cascades

### 想定構成

画面上にprobeを配置し、近距離cascadeは高い空間解像度・低い角度解像度、遠距離cascadeは
低い空間解像度・高い角度解像度でradiance intervalを持つ。

想定taskは少なくとも次になる。

1. depth / normal / scene colorから各cascadeをtrace
2. far cascadeからnear cascadeへradiance intervalをmerge
3. cascade 0を画面空間radianceへresolve
4. full-resolution composite

4段程度でも、cascadeごとにprobe/ray packing、texture dimension、interval範囲、
bilinear / directional mergeを管理する必要がある。

### 「ノイズなし」について

Monte Carlo samplingを使わない構成なら、時間的なランダムノイズを避けられる。
ただし透視投影3Dのscreen-space depthへ適用した場合、次は残る。

- cascade境界のringing
- probe補間のleak
- depth不連続でのvisibility誤判定
- 遮蔽物の背後や画面外情報の欠落
- 角度方向のpacking / merge由来のstructured artifact

したがって「ノイズなし」は「artifactなし」を意味しない。

2D Radiance Cascadesはtoon表現と相性がよい可能性があるが、MMD_modokiの透視投影3Dで
同じ安定性が得られる根拠はまだない。公開資料でも2D実装が中心で、3D screen-space版は
参照実装が少なく、temporal accumulationやworld-space acceleration structureを使う例が
混在している。

### 規模見積もり

| 項目 | 見積もり |
| --- | --- |
| Frame Graph task | cascade生成、merge、resolve、compositeの4〜8 task相当 |
| WGSL | 約700〜1,400行 |
| TypeScript / resource管理 / state | 約600〜1,000行 |
| PoC | 20〜35人日 |
| MMD向け調整・実機回帰 | 追加10人日以上 |
| リスク | 高〜非常に高い |

履歴禁止のため、全cascadeを毎フレーム更新する必要がある。半解像度でも複数textureへの
書き込みとmergeによるbandwidthが大きい。

### 判定

Phase 1 では採用しない。

単フレームSSGIで次を確認した後に再評価する。

- scene color / depth / normalだけで有用なcolor bleedingが得られるか
- MMD outline、透明髪、toon影との相性
- half-resolution gatherに使えるGPU予算
- 決定論を維持したまま、静止artifactが許容範囲に収まるか

## Compute と Fragment の比較

### FrameGraphComputeShaderTask

Babylon.js 9.2.0 の `FrameGraphComputeShaderTask` はWebGPU専用で、次を提供する。

- direct / indirect dispatch
- `execute` callback
- uniform bufferの自動update / dispose
- texture、storage texture、storage bufferのbinding

一方、GI用の `sourceTexture` / `outputTexture` は持たない。texture handleを自分で作り、
allocation後に実textureをbindingする必要がある。

compute版SSGIでは最低限次が必要になる。

- 半解像度textureを `TEXTURE_CREATIONFLAG_STORAGE`、`samples: 1` で作成
- workgroup sizeをたとえば `8x8`
- dispatchを `ceil(width/8) x ceil(height/8) x 1`
- WGSL側で画面端をbounds check
- 入力・出力handleを `task.dependencies` に明示
- `onTexturesAllocatedObservable` または `execute` でbinding
- compute出力をfull-resolutionで合成するfragment task

Compute Task はcompute非対応engine上で内部的にno-op passを記録するが、GI出力textureが
有効な内容になるわけではない。フォールバックをこのno-op挙動へ任せてはいけない。

### Fragment / CustomPostProcess 系

各output pixelが近傍textureを読む単フレームSSGIは、fragment shaderと自然に対応する。

利点:

- `sourceTexture / targetTexture / outputTexture` のFrame Graph配線を利用できる
- full-screen drawなのでdispatch・storage texture管理が不要
- WGSLとGLSLを用意すればWebGPU / WebGLで同じ構成を使える
- 半解像度targetとフル解像度compositeを通常のrender targetとして扱える

欠点:

- WGSLとGLSLを二重に保守する
- workgroup shared memoryや複数storage出力を使えない
- Radiance Cascadesのようなmulti-pass / packed buffer処理にはComputeの方が向く

公式 `FrameGraphCustomPostProcessTask` の `onApplyObservable` はuniform設定には便利だが、
FrameGraph texture handleのdepth / normalを追加bindingし、pass dependencyも登録する
用途には薄すぎる。

Phase 1 は、現行のOffset ShadowやSSAO toon compositeと同様に、
`FrameGraphPostProcessTask` を継承した小さいproject-local taskを別ファイルに置く。
これはCustomPostProcessと同じfragment方式だが、`record()` 内で次を明示できる。

- `context.bindTextureHandle()`
- `pass.addDependencies()`
- depth / normal / GI half textureのbinding

### WebGLフォールバック

推奨するfragment版では、WGSLとGLSLの両方を用意してWebGLでも動かす。

Compute版を試す場合は次の扱いにする。

1. `engine.isWebGPU && engine.getCaps().supportComputeShaders` を先に判定
2. 非対応時はCompute Taskを生成しない
3. stack entryの `{ id: "ssgi", enabled: true }` と強度は保存したままにする
4. runtime orderではSSGIをsource textureのpass-throughとして扱う
5. resource planからSSGI consumerを除き、不要なGeometryRendererを作らない
6. UIには「WebGPUのみ / 現在無効」を表示できる余地を残す

`FrameGraphComputeShaderTask` 自体のno-opに任せ、未初期化のGI textureをcompositeする構成は
禁止する。

## Phase 1 タスク構成

### 1. SSGI gather task

仮称:

```text
FrameGraphPostEffectsSsgiGatherTask
```

入力:

- stack上のcurrent scene color
- `geometryViewDepthTexture`
- `geometryViewNormalTexture`
- camera projection / inverse projection

出力:

- 半解像度 `RGBA16F` を第一候補
- RGB: linear indirect color
- A: confidence / visible sample ratio

WebGLでhalf-float render targetが利用できない場合は `RGBA8` へfallbackする。

### 2. SSGI composite task

仮称:

```text
FrameGraphPostEffectsSsgiCompositeTask
```

入力:

- gather前のfull-resolution scene color
- half-resolution GI
- full-resolution view depth
- full-resolution view normal
- `ssgiStrength`

処理:

- depth / normal aware upsample
- current scene colorを近似linear化
- `linearScene + indirect * strength`
- display-spaceへ戻して出力

### 3. stack接続

`connectPostEffectOrder()` の `"ssgi"` 分岐で、gatherとcompositeを一つの論理エフェクトとして
接続する。

```text
currentTexture
  -> gather(currentTexture, depth, normal)
  -> composite(currentTexture, gather.output, depth, normal)
  -> next currentTexture
```

診断情報ではtaskを `ssgiGather` / `ssgiComposite`、connected orderを `"ssgi"` として
分けて表示する。

## 強度とstack state

### 設定値

- manager内部値: `postEffectSsgiStrengthValue`
- 公開getter/setter: `postEffectSsgiStrength`
- clamp: `0.00..1.00`
- 暫定default: `0.25`
- UI: integer `0..100` を `0.00..1.00` に変換

### enabledとの分離

SSGIは次を別状態として扱う。

- `{ id: "ssgi", enabled }`: graph上にtaskとresourceを持つか
- `ssgiStrength`: 合成量

`isFrameGraphPostEffectActiveInSettings(settings, "ssgi")` はstrengthを見ず、
`settings.ssgiEnabled` だけを見る。

理由は、enabledのままstrengthを0にして保存したプロジェクトを開いた場合でも、
スライダーを上げればgraph再構築なしに表示を戻せるようにするためである。

strengthが0のフレームではgather / compositeをdisabledまたはpass-throughにしてよいが、
stack entryがenabledの間はdepth / normal MRT要求を維持する。

SSGIにはclassic backend用の独立した`ssgiEnabled`保存値を作らない。
有効状態は `frameGraphPostStack` のentryをsource of truthとし、
project effect stateにはstrengthだけを保存する。

## Bloomとの合成順

### 推奨: Bloomより前

```text
scene + indirect
  -> Bloom
```

利点:

- 強い間接光やcolor bleedingもBloomへ寄与する
- GIがシーン照明の一部として見える
- 後段に貼り付けた発光色のようになりにくい

欠点:

- SSGIのhot pixelやleakもBloomで拡大される

Phase 1ではGIをclampし、confidenceの低いsampleを抑えてからBloomへ渡す。

### Bloomより後

```text
Bloomed scene
  -> + indirect
```

ノイズはBloomで拡大されにくいが、間接光だけがBloomに参加せず、シーンから浮きやすい。
debug用途以外のdefaultにはしない。

## Phase 1 で触るファイル

### 新規

- `src/render/frame-graph-ssgi-task.ts`
  - gather / composite task
  - texture handle dependency
  - half-resolution target管理
- `src/render/frame-graph-ssgi-shaders.ts`
  - gather WGSL / GLSL
  - composite WGSL / GLSL

大きなshader文字列を既存controllerへ追加せず、SSGIを局所化する。

### 既存

- `src/shared/frame-graph-post-effect-stack.ts`
  - `"ssgi"` ID、canonical order、activation settings
- `src/shared/frame-graph-post-effect-stack.test.ts`
  - normalize、add、enabled、strength 0の振る舞い
- `src/render/frame-graph-resource-plan.ts`
  - SSGIから既存`viewDepth / viewNormal`へのconsumer追加
- `src/render/frame-graph-resource-plan.test.ts`
  - SSGI単独、SSGI+SSAO、SSGI+SSR、disabledのresource plan
- `src/render/frame-graph-post-effects-controller.ts`
  - settings、task生成、connect、execute、dispose、diagnostics
- `src/mmd-manager.ts`
  - strength、settings伝達、stack active判定
- `src/types.ts`
  - `ProjectEffectState.ssgiStrength?: number`
- `src/project/project-serializer.ts`
  - strength保存
- `src/project/project-importer.ts`
  - strength読込、`0..1` clamp
- `src/project/project-serializer.test.ts`
- `src/project/project-importer.test.ts`
- `src/ui-controller.ts`
  - add effect、default、detail slider、値反映
- `index.html`
  - SSGI追加ボタン
- `language/en.json`
- `language/ja.json`
- `language/ko.json`
- `language/zh-Hans.json`
- `language/zh-Hant.json`

### 追加しない

- MMD material / shader plugin関連ファイル
- `mmd-manager`内のmaterial差し替え経路
- motion vector / velocity MRT
- history texture管理

## テスト計画

### 単体テスト

- `"ssgi"` がstack entryとしてnormalize / add / move / saveされる
- disabled entryが位置を失わない
- strength `0`でもenabledならresource planがdepth / normalを要求する
- entry disabledならSSGI由来のdepth / normal要求が消える
- SSGI + SSAOが一つのGeometryRendererを共有する
- SSGI + SSRでreflectivity consumerがSSRだけである
- project save / loadでstrengthと`{ id, enabled }`が保持される
- importしたstrengthを`0..1`へclampする
- pixel座標から固定sample rotationを作るpure helperを置く場合、同じ入力で同じ値になる

### コマンド

```powershell
npm.cmd run test:unit
npm.cmd run lint
npm.cmd run typecheck:critical
npm.cmd run smoke:launch
```

### 実機確認

- WebGPU: SSGI単独
- WebGPU: SSGI + SSAO
- WebGPU: SSGI + SSR
- WebGPU: SSGI + Bloom
- WebGPU: MMD outline ONとの併用
- WebGL: fragment fallback
- モデルなし / 背景のみ
- 透明髪・半透明材質
- カメラ移動中の固定pattern
- 同じframeへseekし直したときに同じ結果になる
- stack entry OFF / ON
- strength `0 -> 1 -> 0`
- project save / load
- resize、backend切替、graph再構築

MMD outlineとGeometryRendererの併用で破綻する場合も、材質stateを一時変更して回避しない。
SSGIを無効化して診断を残し、別の互換性課題として扱う。

## 制約

Phase 1 は以下を厳守する。

- 材質には一切触らない
- Frame Graph stackの `{ id, enabled }` の一員として着脱可能にする
- 履歴bufferを使わない
- 前フレームを参照しない
- frame counter / timeをsample patternへ入れない
- seek時の決定論を維持する
- 半解像度でgatherする
- 合成時にフル解像度へdepth / normal aware upsampleする
- 強度sliderは `0.00..1.00`
- 既存GeometryRendererを共有し、別のgeometry passを追加しない
- WebGLで利用不能な経路は未初期化textureを合成せずpass-throughする

## やらないこと

- PBR化
- MMD material pluginの変更
- albedo / irradiance material出力の追加
- 時間的蓄積
- temporal denoise
- reprojection
- motion vector
- world-space probe
- DDGI
- voxelization
- SDF
- world-space Radiance Cascades
- 複数bounceの物理GI

時間的蓄積はPhase 2以降の候補だが、導入する場合もtimeline seek、camera cut、project load、
resize時のhistory invalidationを先に設計する。

## 参考資料

### Babylon.js

- [Frame Graph Task List](https://doc.babylonjs.com/features/featuresDeepDive/frameGraph/frameGraphClassFramework/frameGraphTaskList)
- [Create a custom post-process](https://doc.babylonjs.com/features/featuresDeepDive/frameGraph/frameGraphExamples/frameGraphExampleCustomPostProcess)
- [Frame Graph FAQ / Best Practices](https://doc.babylonjs.com/features/featuresDeepDive/frameGraph/frameGraphFAQ/)
- [FrameGraphComputeShaderTask source](https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/FrameGraph/Tasks/Misc/computeShaderTask.ts)
- [FrameGraphCustomPostProcessTask source](https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/FrameGraph/Tasks/PostProcesses/customPostProcessTask.ts)
- [Compute Shader Task Playground](https://playground.babylonjs.com/?webgpu#KOBPUW#18)

### SSGI

- [Three.js SSGINode source](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/tsl/display/SSGINode.js)
- [SSILVB / SSGI integration discussion](https://github.com/mrdoob/three.js/issues/29668)

Three.jsの実装はbeauty / depth / normalから単フレームGIを計算し、temporalなし向けの
sample presetも持つ。Babylon.jsへそのまま移植するのではなく、sample数、thickness、
view position復元、固定noise設計の比較材料とする。

### Radiance Cascades

- [Radiance Cascades paper](https://academic.oup.com/rasti/article/doi/10.1093/rasti/rzae062/7929002)
- [Radiance Cascades article / screen-space radiance field](https://mini.gmshaders.com/p/radiance-cascades)
- [Radiance Cascades article part 2](https://mini.gmshaders.com/p/radiance-cascades2)
- [Radiance Cascades resources](https://radiance-cascades.com/)

Radiance Cascadesの理論と2D実装は参考になるが、MMD_modokiで必要な
「透視投影3D、screen-space depth / normalのみ、履歴なし」の直接的な参照実装ではない。

## 実装結果

実装日: 2026-07-19

### 採用した構成

方式は設計どおり **(A) 単フレーム SSGI** とした。
ただし、実行方式は実装依頼で指定された WebGPU 限定条件と
`FrameGraphComputeShaderTask` を使う目的を優先し、設計時の fragment gather 推奨から
次の構成へ変更した。

```text
full-resolution scene color + viewDepth + viewNormal
  -> FrameGraphComputeShaderTask
     - half-resolution RGBA16F
     - 3 slices x 2 sides x 8 steps = 48 samples / pixel
     - pixel座標だけに依存する固定回転
  -> FrameGraphComputeShaderTask x 3
     - half-resolution 5x5 A-Trous denoise
     - step width 1 / 2 / 4
     - scene color / depth / normal / confidence guided
  -> FrameGraphPostProcessTask
     - depth / normal aware upsample
     - full-resolution scene colorへ加算
  -> 後続PostFX
```

- 方式名: `single-frame-screen-space-gather`
- canonical order: `SSR -> SSGI -> SSAO -> ... -> Bloom`
- 入力 requirementKeys: `sceneColor`、`viewDepth`、`viewNormal`
- gather / denoiser出力: 半解像度 `RGBA16F` storage texture
- RGB: 近似linear間接色
- A: gather confidence
- 履歴texture、前フレーム参照、frame counter、time uniformは不使用
- 強度: `0.00..1.00`、既定 `0.30`
- sample radius: `1..256px`、既定 `64px`
- `strength = 0` はentryの無効化と分離し、compositeを完全なsource pass-throughにする
- WebGLではentryと設定値を保持するが、resource planからSSGIを除外し、
  gather / denoiser / composite taskを生成しない

WebGPU compute拡張はtree-shaking任せにせず、
`@babylonjs/core/Engines/WebGPU/Extensions/engine.computeShader` を
SSGI task側で明示的に副作用importした。これがない場合は
`supportComputeShaders = true` でも `engine.createComputeContext` が未登録になることを
実機確認で検出した。

### 差分の要約

- FrameGraph stack IDに `"ssgi"` を追加した。
- SSGI entryの有効状態だけでresource planを決め、強度 `0` でも
  `viewDepth + viewNormal` requirementを維持するようにした。
- GeometryRendererの既存 `viewDepth / viewNormal` MRTを共有した。
  reflectivityやalbedoなど、新しいMRTは追加していない。
- compute gather task、半解像度texture、fragment composite taskを追加した。
- controllerへ生成、接続、disabled切替、dispose、diagnosticsを追加した。
- SSGI有効化完了時に、方式名、出力解像度、3入力の解像度と解決結果を
  `render` scopeのinfoログへ記録するようにした。
- WebGL / compute非対応時はSSGI taskを生成せず、同一manager lifetimeで警告を
  一度だけ記録するようにした。
- エフェクト図鑑へ「GI（実験的）」を追加した。
- 既存スタックと同じcheck、展開、drag reorder経路へ参加させた。
- detail panelへ強度、sample radius、スタックからの削除を追加した。
  削除は既存エフェクトの数値パラメータを変更せず、stack IDだけを除く。
- 物理、MMD材質、既存エフェクトの数値パラメータは変更していない。
- project save / loadへstrength、sample radius、`{ id, enabled }`を追加し、
  import時に範囲をclampするようにした。
- stackが明示設定済みかをmanager内で区別した。これにより、明示削除したentryが
  legacy parameter migrationによって直後に再追加されることを防ぎつつ、
  stackを持たない旧projectのmigrationは維持した。
- 英語、日本語、韓国語、簡体字、繁体字の表示を追加した。

変更対象は「Phase 1 で触るファイル」に列挙した範囲内だけとした。

### 自動テスト・静的確認

- `npm.cmd run test:unit`
  - 28 files、194 testsすべて成功
  - stack normalize / insert / enabled
  - SSGI単独、SSAO共有、SSR共有、disabled時のresource plan
  - project save / loadと範囲clamp
- `npm.cmd run lint`
  - 成功
- `npm.cmd run typecheck:critical`
  - 成功
  - 既知のnon-critical typecheck errorは残るが、
    `TS2304 / TS2552` のcritical errorは0件
- `npm.cmd run smoke:launch`
  - 通常デスクトップ権限で成功
  - `engine=WebGPU`
  - `physics=Bullet MPR`
  - renderer runtime初期化まで到達

最初のsandbox内smokeはElectronのユーザーデータとGPU cacheへ書き込めず失敗した。
同じコマンドを通常デスクトップ権限で再実行した結果は成功しており、
コード起因の失敗ではない。

### WebGPU実機確認

一時Electron profileへDevTools Protocolで接続し、UIの
`GI（実験的）`ボタンからentryを追加した。

- Compute WGSLとcomposite WGSLの実コンパイル成功
- page error: 0
- console error / warning: 0
- entry: `{ id: "ssgi", enabled: true }`
- UI初期値:
  - strength `0.30`
  - sample radius `64px`
- 実体ログ:

```text
method: single-frame-screen-space-gather
resolution: 406x229
sceneColor: 812x457
viewDepth: 812x457
viewNormal: 812x457
inputsResolved: true
```

内蔵の静的ground / sky sceneを24 frameずつ安定させてcanvasを比較した結果:

| 比較 | 変更pixel | 結果 |
| --- | ---: | --- |
| SSGI ON vs OFF | 5,229 / 472,140（1.1075%） | 絵が変化 |
| OFF vs stackから削除 | 0 | OFFは完全に元へ戻る |
| 1回目のON vs 再追加後のON | 0 | 同一入力でbit-exact |

ON / OFF差の最大channel差は2/255だった。既定sceneでは意図どおり弱い寄与だが、
色床と白モデルを使ったcolor bleeding品質の確認は別途必要である。

### WebGLフォールバック確認

検証pageの初期化前に `navigator.gpu` を無効化し、`engine=WebGL2` の
fallback経路を実機確認した。

- stack entryとchecked状態は保持
- controllerのSSGI task数: 0
- resource planのSSGI active effect: 0
- `viewDepth / viewNormal` requirement: 0
- page / console error: 0
- warning:

```text
frame graph SSGI disabled on unsupported renderer
engine: WebGL2
requested: true
supportComputeShaders: false
```

OFF / ONを再実行した後も同一sessionの警告は1件だけだった。

### fps測定

DevTools接続中の内蔵静的scene、scene color `812x457`、
GI `406x229`で、各状態を60 frame warm-upした後に120 frameを測定した。
開発server / CDP由来の周期的な大停止が混ざったため、
中央値の2倍以内のframeだけをsteady sampleとして集計した。

| 状態 | steady FPS | steady average |
| --- | ---: | ---: |
| SSGI ON | 60.01 fps | 16.664ms |
| SSGI OFF | 59.92 fps | 16.688ms |

この条件では低下量は計測ノイズ内で **0.00 fps相当**だった
（生の差はONが0.09fps高い）。
これはMMD modelなしの軽いsceneであり、実モデルを使ったGPU負荷評価ではない。
CDP / Vite環境ではGIと無関係な300～650ms級の外れ値も観測されたため、
製品相当buildでのGPU timestampまたは安定した実モデルbenchmarkを未解決点とする。

### 確認手順ごとの結果

- 有効/無効の切替:
  - 確認済み。ON / OFFで差があり、OFFとentry削除後は0 pixel差。
- 色の付いた床 + 白いモデル:
  - 未確認。repository内にPMX / PMD fixtureがなく、モデルや材質を変更しない制約を優先した。
- 同一フレームへのseek:
  - timeline seekそのものは未確認。
  - 静的同一入力でentryを削除・再追加した2回のON出力は0 pixel差。
  - shaderはpixel座標以外の乱数seed、time、frame counter、historyを持たない。
- WebM出力:
  - 未確認。export可能なproject / model fixtureがない。
  - 保存値とexporter側managerが共通のFrameGraph post stack経路を使うことはコード上確認した。
- 60fps級sceneのfps低下:
  - 内蔵静的sceneのsteady sampleでは0.00fps相当。
  - MMD実モデルでの再測定が必要。

### 未解決点

- 色床 + 白モデルで、モデル下部へ期待する色が乗るかの目視調整。
- MMD outline、半透明材質、toon境界、髪エッジでのleak確認。
- SSGI + SSAO、SSGI + SSR、SSGI + Bloomの実モデル目視確認。
- timeline seekを往復した画像のbit-exact比較。
- WebM exporterの実ファイル出力比較。
- resize、backend切替、任意reorder後の描画確認。
- 強度 `0.30`、半径 `64px`、固定thickness `0.01`のscene scale別チューニング。
- 現行scene colorはdisplay / sRGB-space寄りであり、piecewise sRGB変換後も
  物理的なradianceではない。
- 実モデルを使ったGPU時間とfps低下量の測定。

### 制約の遵守

- 材質には触れていない。
- 物理には触れていない。
- 既存エフェクトの数値パラメータには触れていない。
- stackの `{ id, enabled }` の一員として追加、無効化、削除、並べ替えができる。
- 履歴bufferと前フレーム参照はない。
- gatherは半解像度、合成はfull-resolution。
- 強度sliderは `0.00..1.00`、既定 `0.30`。
- PBR化、temporal accumulation、world-space probeは実装していない。

### 2026-07-19 色移り強化調整

初回実機確認で「60 fpsは維持するが、stageからmodelへの色移りが弱く、白い高輝度部の
拡散が先に見える」という結果が得られたため、Phase 1の制約内でgatherを調整した。

- 24 sampleから48 sampleへ増加。
- 半径を `1..256px`、既定 `64px`へ変更。
- piecewise sRGB変換へ変更。
- neutral weightを `0.22` から `0.035`へ低下。
- saturationに応じてcolor weightを最大 `1.8`、chromaを最大 `1.45`へ増幅。
- depth hard cutoffをsaturation-awareな指数減衰へ変更。
- screen-space線分上の2点depth probeによるsoft occlusionを追加。
- depth / normalを持たない高彩度背景をdistant environment sampleとして採用。
- guided upsampleのnormal exponentとfallback confidenceを緩和。

背景skydomeが `disableDepthWrite: true` であることを実行logで確認した。
受光側には引き続き有効なview depth / normalを要求し、MRT非参加sampleは高彩度の
環境色sourceとしてのみ扱う。材質、物理、既存effect parameterは変更していない。

内蔵静的scene、入力 `1103x620`、GI `552x310`、強度 `1.00`、半径 `192px`の
実機確認結果:

| 状態 | FPS | frame total | PostFX区間 |
| --- | ---: | ---: | ---: |
| SSGI ON | 60 | 2.035 ms | 0.401 ms |
| SSGI OFF | 60 | 1.449 ms | 0.009 ms |

連続した同一状態のON画像2枚はSHA-256が一致した。WGSL / page errorは0件だった。
実モデルfixtureがrepositoryにないため、赤青stage + 白modelでの最終的な色移り、
outline / 半透明材質周辺のleak、実モデルGPU costは未確認である。

### 2026-07-19 空間denoiser強化

色移り強化後のユーザー実機確認で、色移りは良好になった一方、赤い床・壁とmodel周辺に
固定sample由来の細粒が残ることを確認した。性能には余裕があるという判断を受け、
Phase 1の制約内で履歴なしの空間denoiserを追加した。

```text
half-resolution gather RGBA16F
  -> A-Trous pass 1 (5x5, step 1)
  -> A-Trous pass 2 (5x5, step 2)
  -> A-Trous pass 3 (5x5, step 4)
  -> depth / normal guided full-resolution composite
```

- 各passは25 tap、合計75 tap / half-resolution pixel。
- 空間kernelは5x5のseparable binomial `[1, 4, 6, 4, 1]`。
- view depth差を指数減衰し、奥行き境界を保護。
- view normalの内積を8乗し、曲面内の回り込みを許容しつつmodel silhouetteと床・壁境界を保護。
- scene colorをpiecewise sRGBでlinear化し、luminance差とchroma差で赤青境界を保護。
- gather confidenceが高いsampleを優先しつつ、同一surface内の低confidence holeを補間。
- 3 passは別々の半解像度 `RGBA16F` storage textureへ書き、read/write hazardを回避。
- pass数とstepは固定。履歴、time、frame counter、前フレーム参照は追加していない。
- SSGIのenabled状態、stack reorder、disposeに3 passをまとめて連動。
- 診断情報に `ssgiDenoise` task、denoised half-resolution resource、pass数とguideを追加。

自動・静的確認:

- `npm.cmd run test:unit`: 28 files / 194 tests成功。
- `npm.cmd run lint`: 成功。
- `npm.cmd run typecheck:critical`: critical error 0件。
- `npm.cmd run smoke:launch`: 実機権限で `engine=WebGPU` まで成功。

WebGPU実機確認は入力 `1103x620`、GI `552x310` の内蔵静的sceneで行った。

- gather、denoise 3 pass、compositeのWGSL compile成功。
- page / WGSL / WebGPU validation error: 0件。
- diagnosticsで `ssgiGather -> ssgiDenoise -> ssgiComposite` と
  denoised half-resolution resourceを確認。
- 120ms離した同一静止frameのcanvas captureは同一hash。
- ON、OFF、再ONのすべてで60 fps表示を維持。
- CPU側instrumentation:
  - ON: frame total `1.850ms`、PostFX `0.364ms`
  - OFF: frame total `1.014ms`、PostFX `0.023ms`
  - 再ON: frame total `2.053ms`、PostFX `0.403ms`

ON/OFFのframe total差は観測範囲で約 `+0.8..1.0ms`だった。ただしGPU timestampではなく、
MMD modelなしのCPU側区間計測である。実モデルでの粒状感低減、細い髪・outlineの
輪郭保持、赤青境界をまたぐhalo、denoiser単体のGPU時間は引き続き目視・実測対象とする。

空間denoiser追加の時点では、材質、物理、既存effect parameter、MRT requirementKeys、
UI parameter、保存schemaは変更していない。

### 2026-07-19 合成mode比較

デノイズ後のユーザー実機確認では粒状感は改善したが、強度 `0.75`、半径 `256px`の
赤青stage + 白modelで白飛びが目立った。compositeが次のlinear加算だったことが主因と
判断し、比較可能な合成modeを追加した。

```text
Additive:
  sourceLinear + indirect * strength * confidence

Soft Light / Overlay:
  blendColor = linearToSrgb(indirect / indirectPeak)
  opacity = strength * confidence * radianceEvidence
  output = mix(sourceSrgb, layerBlend(sourceSrgb, blendColor), opacity)
```

- `Additive`: 従来式を完全に保持。
- `Soft Light`: 新規状態の既定値。白黒端点を保ち、中間toneへ穏やかに色を移す。
- `Overlay`: contrastが強い比較用mode。
- selectorはGI detail panel内に置き、runtime uniformを直接変更する。
- mode変更ではFrameGraphをbuildし直さない。
- project保存schemaへ `ssgiBlendMode` を追加。
- modeを持たない旧projectは互換性のため `Additive`として読む。
- 材質、物理、既存effect parameter、MRT、denoiser、gatherは変更していない。

Soft Light / OverlayではGIを物理energyではなくartistic color layerとして扱う。
完全な白は白、完全な黒は黒のままなので、Additiveのようなhighlight clipは増やさない。
一方で補色channelを暗くすることがあり、純粋な間接照明としては非物理的である。

確認結果:

- `npm.cmd run test:unit`: 28 files / 195 tests成功。
- `npm.cmd run lint`: 成功。
- `npm.cmd run typecheck:critical`: critical error 0件。
- `npm.cmd run smoke:launch`: `engine=WebGPU` まで成功。
- Additive / Soft Light / Overlayの3分岐でWGSL / validation error 0件。
- mode変更中もFrameGraph executed frame countが連続し、再buildなしを確認。
- 3 modeとも60 fps。
- CPU側PostFX区間:
  - Additive `0.397ms`
  - Soft Light `0.419ms`
  - Overlay `0.422ms`
- AdditiveとSoft Lightのcanvas captureは異なるhash。
- Soft Lightの120ms間隔の連続captureは同一hash。

内蔵静的sceneは原色・白黒に近く、Soft LightとOverlayのcaptureは同一になった。
両式は中間toneで差が出るため、赤青stage上の実MMD modelで最終比較する。

### 2026-07-19 neutral source寄与の再調整

Soft Lightは白飛び対策として良好だったが、白・灰色を含む明るいsourceを拾いにくい
というユーザー実機結果を受け、gatherの低彩度側だけを再調整した。

- neutral color weightの固定下限 `0.035` を廃止。
- linear luminanceから `neutralLightEvidence` を作り、neutral color weightを
  `0.18..0.45` とする。
- neutral surface evidenceを `0.16..0.30` とする。
- neutral environment evidenceを `0.05..0.18` とする。
- neutral depth falloffを `2.8` から `2.2` へ緩和。
- 高彩度側のcolor weight `1.8`、surface evidence `0.55`、environment evidence
  `0.45` は変更しない。

暗いgrayより明るいwhiteを強く通すことで、全面的なgray washを避けつつ、白い床・壁や
明るいstageからmodelへ入る無彩色の環境光を増やす狙いである。Soft Light composite、
denoiser、sample数、履歴なしの決定論、材質・物理・既存effect parameterは変更していない。

確認結果:

- `npm.cmd run lint`: 成功。
- `npm.cmd run typecheck:critical`: critical error 0件。
- `npm.cmd run smoke:launch`: `engine=WebGPU` まで成功。
- smoke sessionのapp logにwarning / errorなし。

### 2026-07-19 Soft Light固定と法線許容の緩和

neutral source再調整後のユーザー実機確認で見え方が良好となったため、比較用の合成mode
selectorをGI detail panelから撤去し、製品経路をSoft Lightへ固定した。

- 新規・既存projectともSoft Lightとして実行。
- project保存時の `ssgiBlendMode` は常に `softLight`。
- 旧projectの `additive` / `overlay` は読込時に無視。
- Additive / OverlayのWGSL分岐は比較記録と局所rollback用に残すが、UIからは選択不可。
- 強度・半径のUIと保存、stackの `{ id, enabled }` は従来どおり。

同時に、曲面への間接光の回り込みを増やすため法線許容を控えめに緩和した。

- gather receiver / source facingの最低weightを `0.35` から `0.40` へ変更。
- facingのsmoothstep範囲を少し広げ、斜め向きsampleを通しやすくした。
- A-Trous denoiserのnormal exponentを `12` から `8` へ変更。
- full-resolution guided upsampleのnormal exponentを `4` から `3` へ変更。
- depth similarity、scene color guide、soft occlusionは変更しない。

法線差が小さいmodel曲面ではGIが連続しやすくなり、床・壁から側面へ回る柔らかい
環境光を増やす。一方、normal dotが0に近い直交面は引き続きほぼ通らず、depth guideも
維持される。法線許容をさらに緩めると顔・髪・outline境界を越えるhaloや平坦化が
起こり得るため、今回はこの値で実モデルの立体感を比較する。

確認結果:

- `npm.cmd run test:unit`: 28 files / 195 tests成功。
- 各変更単位の `npm.cmd run lint`: 成功。
- 各変更単位の `npm.cmd run typecheck:critical`: critical error 0件。
- `npm.cmd run smoke:launch`: `engine=WebGPU` まで成功。
- smoke sessionのapp logにwarning / errorなし。
