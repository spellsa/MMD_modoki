# Frame Graph post effects 進捗メモ 2026-04-28

## 2026-05-01 追記 11: Frame Graph Vignette / EdgeBlur 移行

- Frame Graph backend に `Vignette + EdgeBlur` の独自 `FrameGraphPostProcessTask` を追加した。
- 公式 task には該当する軽量単体 task が見当たらないため、既存の standalone edge blur shader をベースにし、ビネット処理も同じ fullscreen pass にまとめた。
- task chain は `... -> ChromaticAberrationTask -> VignetteEdgeBlurTask -> FXAATask -> backbuffer copy`。
- EdgeBlur は Classic standalone 実装と同じく周辺ピクセルだけを 9 tap blur する。WebGPU / WGSL では非 uniform 分岐内の texture sampling 警告を避けるため、`textureSampleLevel(..., 0.0)` を使う。
- Vignette は Babylon の `ImageProcessingConfiguration.vignetteEnabled` には寄せず、Frame Graph 側の custom shader で黒ビネットを直接乗せる。
  - `FrameGraphImageProcessingTask` に scene image processing configuration をそのまま渡すと、LUT / color space / shader define の問題と混ざりやすいため。
  - Frame Graph 実行時は image processing task 側の vignette を無効化し、custom pass 側だけで扱う。
- UI は Frame Graph backend panel 内に専用の `frame-graph-vignette-weight` / `frame-graph-edge-blur` slider を追加した。
  - Classic backend の `vignette-weight` / `lens-edge-blur` DOM は共有しない。
  - 内部設定値は既存 project 保存項目をそのまま使い、backend ごとに実行経路だけを切り替える。

未確認:

- Classic vignette と完全に同じカーブではない。見た目の近さを優先した黒ビネットとして扱う。
- EdgeBlur は Classic 側と同じ正規化を使っているが、DoF / Chroma / FXAA との順序差で見え方は少し変わる可能性がある。

## 2026-05-02 追記 12: Frame Graph Lens Distortion 移行

- Frame Graph backend に lens distortion 用の独自 `FrameGraphPostProcessTask` を追加した。
- 既存 Classic の `finalLensDistortion` shader は fullscreen の UV 変形だけで、depth / normal / velocity を必要としないため、Frame Graph 化しやすい。
- task chain は `... -> ChromaticAberrationTask -> VignetteEdgeBlurTask -> LensDistortionTask -> FXAATask -> backbuffer copy`。
- Frame Graph backend では Classic の `finalLensDistortionPostProcess` を作らないようにし、二重適用を避ける。
- UI は Frame Graph backend panel 内に専用の `frame-graph-distortion-influence` slider を追加した。
  - Classic backend の `distortion-influence` DOM は共有しない。
  - 内部設定は既存の FoV 連動 `dofLensDistortionInfluence` / `dofLensDistortion` をそのまま使い、Frame Graph task は最終 distortion 値だけを読む。

未確認:

- Classic と同じ shader 式を使っているが、Frame Graph 側では `VignetteEdgeBlur -> Distortion -> FXAA` の順序になるため、最終的な見え方は Classic tail の順序差を確認する必要がある。

## 目的

v0.2 で、既存の Classic post process 経路を残したまま、カメラ用ポストエフェクトを段階的に Frame Graph backend へ移す。

現時点の基本方針:

- Classic backend は安定経路として残す。
- Frame Graph backend は実験経路として、PostFX 欄の backend ドロップダウンから選ぶ。
- Frame Graph 側では、移行済み / 検証中の項目だけを UI に出す。
- 一気に全エフェクトを移さず、1 pass ずつ白化・解像度・出力・UI 反映を確認する。

## 現在の実装状態

主な変更箇所:

- `src/mmd-manager.ts`
  - Frame Graph backend 用の独立 scene color RT を作成する。
  - RT は `camera.customRenderTargets` に登録する。
  - RT の描画対象は `getCustomRenderList = () => scene.meshes` で明示する。
  - RT サイズは `{ ratio: 1 }` ではなく、`engine.getRenderWidth()` / `engine.getRenderHeight()` の明示ピクセルサイズで作る。
  - canvas resize 時は Frame Graph backend を作り直す。
- `src/render/frame-graph-post-effects-controller.ts`
  - Frame Graph controller を分離。
  - 現在は `scene color RT -> ImageProcessingTask -> DepthOfFieldTask -> BloomTask -> Gamma/Contrast task -> backbuffer copy` の構成。
  - `FrameGraphImageProcessingTask` は常設し、LUT / exposure / tone mapping などの image processing 効果が無効なときは task を disabled にして copy pass として扱う。
- `src/render/post-process-controller.ts`
  - Frame Graph backend 時は Classic 側の pipeline image processing を無効化する。
- `src/ui-controller.ts`
  - PostFX 欄に backend 選択 UI を追加。
  - Frame Graph backend 側の pass 表示は現在 `Image / Color` 相当の検証表示。

## 試した経路と結果

### 1. `camera.outputRenderTarget` 直結

通常の `Scene.render()` 結果を `camera.outputRenderTarget` 経由で Frame Graph に渡そうとした。

結果:

- 実モデル読み込み後に画面が白化した。
- bone visualizer などの overlay は見えるが、モデルや床が見えない状態になった。
- 通常描画の backbuffer 出力を奪う形になり、Frame Graph 側で失敗すると画面全体が壊れやすい。

判断:

- `camera.outputRenderTarget` 直結は採用しない。

### 2. 独立 scene color RT + copy

`camera.outputRenderTarget` を使わず、Frame Graph 入力用に独立した `RenderTargetTexture` を作った。

調整したこと:

- 最初は `scene.customRenderTargets` に登録したが白化した。
- `camera.customRenderTargets` に移した。
- `getCustomRenderList = () => scene.meshes` を設定した。
- Frame Graph 側を `scene color RT -> backbuffer copy` だけに落として切り分けた。

結果:

- 実モデルと床が表示された。
- つまり scene color RT 入力経路自体は成立している。

### 3. Gamma/Contrast task 復帰

copy だけでは表示できたので、`ImageProcessingTask` は外したまま、独自 Gamma/Contrast task だけを戻した。

問題:

- 最初は白化した。
- `EffectWrapper.onApplyObservable` では Frame Graph 経路の uniform が期待通り設定されなかった可能性が高い。

対策:

- `FrameGraphPostProcessTask.record()` の bindings callback 内で `contrast` / `gammaPower` を直接 `effect.setFloat()` するようにした。

結果:

- 白化せず表示されるようになった。
- ただし、Gamma / Contrast スライダー操作が実際に見た目へ反映されるかは未確認。

### 4. 低解像度化 / ガビガビ対策

Gamma/Contrast task 復帰後、表示は出るがピクセル数が足りないような見た目になった。

原因候補:

- Frame Graph 入力 RT を `{ ratio: 1 }` で作っていたため、imported texture の寸法情報が期待より小さく扱われていた可能性。

対策:

- RT を `engine.getRenderWidth()` / `engine.getRenderHeight()` の明示サイズで作成。
- resize 時に Frame Graph backend を作り直す。

結果:

- ガビガビ感は改善した。
- まだ若干ピクセル数が足りないように見える可能性はあるが、白化はしていない。

## 確認済み

- Frame Graph backend が `activated` / `ready` まで到達する。
- 独立 scene color RT から backbuffer copy できる。
- 実モデルが表示される。
- 床が表示される。
- Gamma/Contrast task を挟んでも白化しない。
- `FrameGraphImageProcessingTask` を戻しても白化しない。
- RT 明示サイズ化で低解像度化が改善する。
- `npm.cmd run lint` 成功。既存 warning のみ。
- `npm.cmd run smoke:launch` 成功。

## 2026-04-30 追記

- `FrameGraphImageProcessingTask` を `FrameGraphPostEffectsController` に戻した。
- task chain は `scene color RT -> ImageProcessingTask -> Gamma/Contrast task -> backbuffer copy` に変更した。
- image processing 効果が無効な状態では `ImageProcessingTask.disabled = true` にし、Frame Graph の disabled pass で入力 texture を copy する。
- `execute()` 前に `imageProcessingEnabled` を毎回反映するため、LUT / exposure / tone mapping / vignette / curves / dithering の有効状態切り替えに追従できる想定。
- UI の Frame Graph backend 表示文言を `ImageProcessingTask plus Gamma/Contrast` に更新した。
- まだ実機表示での白化有無、LUT の見た目、Gamma / Contrast のスライダー反映は未確認。

## 2026-04-30 追記 2

- ユーザー実機確認で `FrameGraphImageProcessingTask` 復帰後も白化なし。
- Gamma / Contrast の UI 行を Classic backend 専用 panel の外へ移し、Frame Graph backend でも表示される共通 UI にした。
- 既存の `ColorPostFxController` が同じ `postEffectGamma` / `postEffectContrast` を更新するため、Frame Graph 側も `getSettings()` 経由で値を拾える。
- Frame Graph backend の説明文は、Gamma / Contrast が利用可能で、他の post effects は移行中という表現へ更新した。

## 2026-04-30 追記 3

- ユーザー実機確認で Frame Graph backend の Gamma / Contrast UI 反映は一応 OK。
- built-in LUT preset の `On / preset / intensity` 行を Classic backend 専用 panel の外へ移し、Frame Graph backend でも表示される共通 UI にした。
- 外部 LUT の `source / file` 行はまだ hidden のまま。まずは内部 preset LUT の Frame Graph 動作確認を優先する。
- Frame Graph 側は `FrameGraphImageProcessingTask` が `scene.imageProcessingConfiguration` を参照するため、既存 `applyLutSettings()` が作る `ColorGradingTexture` と intensity をそのまま使う想定。

## 2026-04-30 追記 4

- ユーザー実機確認で built-in LUT 有効時に画面が白っぽくなる。
- 対策として Frame Graph 用 `ThinImageProcessingPostProcess.fromLinearSpace` を `false` にした。
- 独立 scene color RT は既存 editor render path の結果を受け取るため、Frame Graph の ImageProcessingTask では display / gamma-space 寄りの入力として扱い、LUT 有効時の追加 gamma lift を避ける。
- この変更後に LUT の白浮き、LUT intensity 0 / 100、Gamma / Contrast の見た目を再確認する。

## 2026-04-30 追記 5

- ユーザー実機確認で白浮きは解消したが、LUT 効果が効いていない。
- LUT OFF 状態で Frame Graph を build したあと、LUT ON にしても `FrameGraphImageProcessingTask` 側の `COLORGRADING` define が更新されていない可能性がある。
- 対策として `imageProcessingEnabled` の ON/OFF が変わったタイミングで `ThinImageProcessingPostProcess._updateParameters()` を明示的に呼ぶようにした。
- preset / intensity の変更は `scene.imageProcessingConfiguration.bind()` と texture 更新で拾える想定だが、まだ実機確認が必要。

## 2026-04-30 追記 6: Frame Graph 公式ドキュメント確認

参照した公式ドキュメント:

- [Frame Graph class overview](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/frameGraph/frameGraphClassFramework/frameGraphClassOverview.md)
- [Frame Graph task list](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/frameGraph/frameGraphClassFramework/frameGraphTaskList.md)

確認できたこと:

- Frame Graph は `addTask()` で task を追加し、`buildAsync()` で pass を構築し、`execute()` で実行する構成。
- 各 task は `record()` 内で render pass を登録する。
- task を disabled にした場合は、通常の処理 pass ではなく入力を出力へ copy する disabled pass として扱える。
- `FrameGraphImageProcessingTask` は公式 task として存在し、image processing 系 post process を Frame Graph に載せるための入口になっている。
- ただし、ドキュメント上は object renderer task で描画した texture を渡す場合、object renderer 側の image processing を無効化する、または source texture が gamma-space の場合に `postProcess.fromLinearSpace = false` を設定する注意がある。

今回の実装との噛み合い:

- 現在の Frame Graph backend は、main scene render 全体を Frame Graph の object renderer task に移しているわけではない。
- 既存 editor render path を壊さないため、`camera.customRenderTargets` で独立 scene color RT を描画し、その RT を Frame Graph に import している。
- そのため、Frame Graph は「ポスト処理チェーンの実行基盤」としては使えているが、scene render から post process までを完全に Frame Graph 管理している状態ではない。
- LUT は `scene.imageProcessingConfiguration` と `ColorGradingTexture`、shader define、texture ready 状態に依存するため、この import texture 構成では `FrameGraphImageProcessingTask` にそのまま寄せると挙動が不安定になりやすい。
- `fromLinearSpace = false` で白浮きは避けられたが、built-in LUT の効果が反映されない問題が残った。

判断:

- Gamma / Contrast は独自 `FrameGraphPostProcessTask` と explicit uniform binding で動いているため、Frame Graph backend 側に残してよい。
- built-in LUT は、現時点で `FrameGraphImageProcessingTask` に無理に寄せない。
- LUT を Frame Graph に載せるなら、`scene.imageProcessingConfiguration` に依存せず、LUT texture / intensity / sampler を明示的に bind する独自 Frame Graph LUT task を作るほうが筋がよい。
- ただし、Frame Graph 移行の主目的は SSAO / DoF などの multi pass / depth 依存系であり、色調補正を全て Frame Graph に寄せる優先度は高くない。
- v0.2 では LUT は Classic backend の安定経路を残し、Frame Graph backend では Gamma / Contrast までを実用範囲として扱う判断でよい。

## 2026-04-30 追記 7: Frame Graph DoF 最小実装

- 公式 `FrameGraphDepthOfFieldTask` を使い、Frame Graph backend に DoF task を追加した。
- task chain は `scene color RT -> ImageProcessingTask -> DepthOfFieldTask -> Gamma/Contrast task -> backbuffer copy` に変更した。
- 公式 Task List に合わせ、DoF task には `sourceTexture` / `depthTexture` / `camera` を渡す。
- `depthTexture` は `DepthRenderer.getDepthMap()` を Frame Graph に import して使う。
- Frame Graph backend では DoF 用 depth renderer を camera-space Z として作る。
- Classic `DefaultRenderingPipeline.depthOfFieldEnabled` は Frame Graph backend では無効化し、DoF が二重にかからないようにした。
- DoF UI は Frame Graph backend でも表示するようにした。
- Frame Graph backend の DoF UI は、既存 DoF/Fog パネル全体ではなく、Frame Graph DoF に接続済みの項目だけを表示する。
  - 表示する項目: DoF ON/OFF、focus、target model/bone、focus offset、f-stop、lens size、focal length。
  - 前抑制と焦点距離反転は Classic 側の独自要素として扱い、Frame Graph backend では UI に出さない。
  - Frame Graph DoF の f-stop 入力には、前抑制補正後の effective f-stop ではなく、UI の素の f-stop 値を渡す。
  - 非表示にする項目: blur quality、lens blur、Fog 系。blur quality は task 作成時に pass 数が決まるため、現時点では UI 変更へ即時追従しない。
- LUT UI は Frame Graph backend では非表示に戻し、Classic backend の安定機能として扱う。
- focus distance / f-stop / lens size / focal length は Frame Graph task の `depthOfField` に毎 frame 反映する。
- blur quality は `FrameGraphDepthOfFieldTask` 作成時に pass 数が決まるため、現時点では backend 初期化時の値で固定。UI 変更へ完全追従させるなら task 再生成または backend rebuild が必要。
- lens blur / edge blur / lens distortion など、既存の独自レンズ系後段はまだ Frame Graph DoF には統合していない。
- `npm.cmd run lint` 成功。既存 warning のみ。
- `npm.cmd run smoke:launch` 成功。`engine=WebGPU` / `Frame Graph backend ready` まで到達。

## 2026-04-30 追記 8: Frame Graph Bloom 最小実装

- 公式 Task List にある `FrameGraphBloomTask` を使い、Frame Graph backend に Bloom task を追加した。
  - 参照: https://doc.babylonjs.com/features/featuresDeepDive/frameGraph/frameGraphClassFramework/frameGraphTaskList/
- task chain は `scene color RT -> ImageProcessingTask -> DepthOfFieldTask -> BloomTask -> Gamma/Contrast task -> backbuffer copy` に変更した。
- Bloom task には `sourceTexture` を渡し、`outputTexture` を後続の Gamma / Contrast task に接続する。
- 既存 UI の Bloom ON/OFF、weight、threshold、kernel をそのまま Frame Graph Bloom に反映する。
- Bloom UI は Classic backend 用と Frame Graph backend 用で DOM を分ける。
  - Classic 側は従来の `data-postfx="bloom-*"` を使う。
  - Frame Graph 側は `data-postfx="frame-graph-bloom-*"` を使い、UI 上で新旧の切り分けをしやすくする。
  - 現時点では内部設定値は同じ `postEffectBloom*` を使い、backend に応じて Classic / Frame Graph の実行経路だけを切り替える。
- Gamma / Contrast UI も Classic backend 用と Frame Graph backend 用で DOM を分ける。
  - Classic 側は従来の `data-postfx="contrast"` / `data-postfx="gamma"` を使う。
  - Frame Graph 側は `data-postfx="frame-graph-contrast"` / `data-postfx="frame-graph-gamma"` を使う。
- DoF UI も既存 `camera-dof-controls` の共有をやめ、Frame Graph backend panel 内に専用 `data-frame-graph-dof-*` UI を追加した。
  - Classic 側の既存 DoF UI は Classic backend 時だけ表示する。
  - Frame Graph 側は DoF ON/OFF、focus、target model/bone、focus offset、f-stop、lens size、focal length の専用 UI を表示する。
  - 現時点では内部設定値は既存 DoF 値を共有し、DOM とイベント導線だけを分けている。
- Frame Graph backend では Classic 側の standalone `BloomEffect` と `DefaultRenderingPipeline.bloomEnabled` を無効化し、二重 Bloom を避ける。
- Bloom scale / HDR は現時点では `FrameGraphBloomTask` のデフォルト寄りにし、Classic UI にはまだ出さない。

## 未確認

- exposure / scene image processing configuration が Classic と同等に扱えるか。
- LUT を独自 Frame Graph LUT task として実装する場合の texture layout / sampler binding。
- Frame Graph DoF の実機表示、白化有無、focus / f-stop / lens size / focal length の見た目反映。
- Frame Graph DoF の blur quality 変更時に backend rebuild するかどうか。
- Frame Graph DoF と MMD outline / 透過材質 / 髪 / スカートの順序・破綻確認。
- Frame Graph Bloom の実機表示、Classic Bloom との見た目差、DoF との順序差。
- Bloom scale / HDR を UI 化する価値があるか。
- 既存 lens blur / edge blur / lens distortion を Frame Graph 側へ寄せるか、Classic 専用に残すか。
- utility layer / bone visualizer / gizmo の上書き順が正しいか。
- PNG / WebM 出力が Frame Graph backend の最終結果を拾えるか。
- 二重描画による FPS 低下が許容範囲か。
- 若干残っている可能性がある解像感不足の原因。

## 次にやる順番

1. `FrameGraphImageProcessingTask` の表示を確認する。
   - exposure / tone mapping など、LUT 以外の image processing 項目を使う必要があるか判断する。
   - 必要が薄ければ、Frame Graph backend では `ImageProcessingTask` を積極利用しない。
   - 色調補正は Gamma / Contrast の独自 task を主経路にする。

2. Frame Graph DoF を実機確認する。
   - DoF ON/OFF で白化しないか見る。
   - focus distance / f-stop / lens size / focal length が見た目に反映されるか見る。
   - blur quality は変更時 rebuild が必要か判断する。
   - MMD outline / 透過材質 / 髪 / スカートの破綻を確認する。

3. Frame Graph Bloom を実機確認する。
   - Bloom ON/OFF / weight / threshold / kernel が見た目に反映されるか見る。
   - Classic Bloom と同じ値で強度差が大きすぎないか見る。
   - `DoF -> Bloom` の順序で問題がないか確認し、必要なら `Bloom -> DoF` との比較を追加する。

4. LUT の扱いを整理する。
   - v0.2 では Classic backend の安定機能として残す。
   - Frame Graph backend では、無理に `FrameGraphImageProcessingTask` 経由で有効化しない。
   - 後で必要になったら、独自 Frame Graph LUT task として texture / intensity を明示 bind する。

5. LUT / exposure を検証する。
   - exposure / tone mapping など、LUT 以外の image processing 項目を Frame Graph に載せる価値があるか判断する。
   - LUT は Classic backend の見た目を基準にし、Frame Graph backend では対象外でもよい。

6. 出力系を確認する。
   - PNG 出力。
   - WebM 出力。
   - Frame Graph backend の最終 backbuffer が拾えているかを見る。

7. UI 表示を整理する。
   - 現在の `Image / DoF / Bloom / Color` 表示は検証用。
   - Gamma/Contrast / DoF / Bloom が確認できたら、Frame Graph backend で使える項目として表示を正式化する。
   - 未移行の Fog / lens blur / edge blur / lens distortion は Frame Graph backend では扱いを分ける。

## 再開時の注意

- Classic backend は壊さない。
- Frame Graph backend はまだ実験扱い。
- `ImageProcessingTask` を戻す前に、Gamma/Contrast の UI 反映を確認する。
- 白化したら、まず copy-only 経路へ戻して RT 入力が壊れていないか見る。
- `camera.outputRenderTarget` 直結には戻さない。
- `.vscode/` は未追跡の無関係差分なので触らない。

## 白化・白浮き対策メモ

再発時の切り分け手順:

- まず `scene color RT -> backbuffer copy` だけの最小構成へ戻し、入力 RT が壊れているのか、後段 task が壊しているのかを分ける。
- copy-only が表示できるなら、`ImageProcessingTask` / Gamma/Contrast / LUT / DoF などを 1 task ずつ戻す。
- Classic backend は退避経路として残し、Frame Graph backend 側だけを切り分ける。

今回効いた、または避けるべき対策:

- `camera.outputRenderTarget` 直結は通常描画の backbuffer 出力を奪いやすく、失敗時に画面全体が白化しやすいため使わない。
- Frame Graph 入力用の scene color は独立 `RenderTargetTexture` とし、`camera.customRenderTargets` に登録する。
- 入力 RT は `{ ratio: 1 }` ではなく、`engine.getRenderWidth()` / `engine.getRenderHeight()` の明示ピクセルサイズで作る。
- canvas resize 後は Frame Graph backend を作り直し、古いサイズの RT / texture handle を引きずらない。
- post process task の uniform は `EffectWrapper.onApplyObservable` に任せず、`FrameGraphPostProcessTask.record()` の `additionalBindings` 内で `effect.setFloat()` などを明示的に行う。
- task を無効化する場合は `task.disabled = true` にして disabled pass の copy 経路を使い、UI の ON/OFF で pass chain 全体を破壊しない。

ImageProcessing / LUT 周りの注意:

- `FrameGraphImageProcessingTask` を使う場合、入力 RT が linear-space ではなく既存描画結果の display / gamma-space 寄りである可能性を確認する。
- 白浮きする場合は `ThinImageProcessingPostProcess.fromLinearSpace = false` を試す。
- LUT / tone mapping など shader define が変わる項目は、ON/OFF 切り替え時に thin post process の parameter 更新や task 再生成が必要になる可能性がある。
- built-in LUT は `FrameGraphImageProcessingTask` 経由では効果が反映されない問題が残ったため、現時点では Classic backend の安定経路を優先する。
- LUT を Frame Graph に載せる場合は、`scene.imageProcessingConfiguration` に依存せず、texture / sampler / intensity を明示 bind する独自 task として再検討する。

## 現時点の判断

Frame Graph 移行の最初の難所だった「通常描画の scene color を Frame Graph に渡す」部分は、独立 RT 方式で一応越えられている。

ただし、まだ本格移行完了ではない。次の山は SSAO / DoF のような depth や multi pass に価値がある post effects。LUT は Classic backend の安定経路を残し、Frame Graph backend では Gamma / Contrast までを実用範囲として扱ってよい。v0.2 では Classic を安定経路、Frame Graph を実験 backend として、小さな単位で移行する方針が妥当。

## 2026-05-01 追記: Frame Graph SSAO2 PoC

- Babylon.js 9.2.0 の公式 `FrameGraphSSAO2RenderingPipelineTask` を使う PoC を追加した。
- task chain は `scene color RT -> ImageProcessingTask -> SSAO2 -> DepthOfFieldTask -> BloomTask -> Gamma/Contrast task -> backbuffer copy`。
- `FrameGraphSSAO2RenderingPipelineTask` は `sourceTexture` だけでは動かず、camera view-space の `depthTexture` と `normalTexture` が必須。
- そのため `FrameGraphGeometryRendererTask` を同じ FrameGraph 内に追加し、`PREPASS_DEPTH_TEXTURE_TYPE` と `PREPASS_NORMAL_TEXTURE_TYPE` を生成して SSAO2 に渡す。
- geometry renderer の depth は当初 Babylon の Node Render Graph geometry renderer block 既定値に寄せて `TEXTUREFORMAT_RED` / `TEXTURETYPE_FLOAT` としたが、WebGPU で `RenderPipeline_r32float_nodepth_samples1_textureState1` が invalid になり警告が大量発生した。
- 対策として depth も `TEXTUREFORMAT_RGBA` / `TEXTURETYPE_HALF_FLOAT` に変更した。SSAO2 shader は depth sampler の `.r` を読むため、RGBA化しても先頭チャンネルの値を使える想定。
- SSAO2 の有効化時だけ geometry renderer と SSAO2 task を実行するようにし、無効時は disabled pass で入力色を後段へ流す。
- Frame Graph backend 時は Classic 側の `SSAO2RenderingPipeline`、独自 fullscreen SSAO fallback、SSAO 用 `DepthRenderer` を止める。新旧 SSAO が重なると見た目と性能の切り分けができないため。
- UI は Frame Graph backend panel 内に専用の `SSAO / Strength / Radius` を追加した。Classic 側の実験 SSAO UI とは共有しない。

注意点:

- `FrameGraphGeometryRendererTask` は MMD 材質、透過材質、outline、髪やスカートの描画順と相性確認が必要。公式 task を使えても、geometry texture の中身が MMD の見た目に十分合うとは限らない。
- 現行の Classic WebGPU fallback SSAO は MMD 向けに toon 寄せ合成や fade/debug を持っているが、Frame Graph SSAO2 はまず公式 task 準拠に寄せたため、fade/debug/tint は未移行。
- SSAO2 は geometry pass を追加するため重い。FPS 低下、PNG/WebM 出力、DoF/Bloom との順序差を実機で確認する。
- 白化や白浮きが出た場合は、まず `scene color RT -> backbuffer copy`、次に `ImageProcessingTask disabled`、次に `SSAO2 disabled` の順で切り分ける。SSAO2 自体は color space 変換ではなく depth/normal 依存の暗部合成なので、白化が出る場合は前段/後段の color task か imported RT の扱いを疑う。

## 2026-05-01 追記 2: Frame Graph SSAO2 は一旦無効化

- 実機ログで、`FrameGraphGeometryRendererTask` の render pass が WebGPU 警告を大量に出し、画面が黒くなる問題を確認した。
- 最初は depth texture description を `TEXTUREFORMAT_RED` / `TEXTURETYPE_FLOAT` にしていたため `RenderPipeline_r32float_nodepth_samples1_textureState1` が invalid になった。
- depth / normal を `TEXTUREFORMAT_RGBA` / `TEXTURETYPE_HALF_FLOAT` に変えても、次は `RenderPipeline_rgba16float_nodepth_samples1_textureState1` が invalid になった。
- そのため、主因は texture format ではなく、公式 `FrameGraphGeometryRendererTask` がこの経路で `nodepth` の geometry render pass を作っている点、または MMD 材質側の WebGPU pipeline state とその render pass の組み合わせにある可能性が高い。
- 黒画面を避けるため、Frame Graph backend から `FrameGraphGeometryRendererTask` / `FrameGraphSSAO2RenderingPipelineTask` の実行と SSAO UI 露出を一旦外した。
- 現在の Frame Graph backend は `scene color RT -> ImageProcessingTask -> DepthOfFieldTask -> BloomTask -> Gamma/Contrast task -> backbuffer copy` に戻す。
- Classic backend の SSAO は退避経路として残す。ただし Frame Graph backend では Classic SSAO も止め、UI 上も移行済み項目だけを出す方針を維持する。

今後 SSAO を再開する場合の候補:

- 公式 `FrameGraphGeometryRendererTask` に明示的な depth attachment を渡せるか、Babylon.js の公式サンプル / Playground で確認する。
- MMD 材質を geometry texture 生成用の簡易 material / override material に寄せ、通常材質 pipeline を geometry pass に通さない構成を検討する。
- 公式 SSAO2 task にこだわらず、既存 `DepthRenderer` の depth texture を import し、独自 `FrameGraphPostProcessTask` で MMD 向け SSAO fallback を Frame Graph 化する。
- いずれの場合も、再有効化前に `*_nodepth_*` pipeline 警告が出ないこと、Frame Graph backend 切替時に黒画面にならないことを先に確認する。

## 2026-05-01 追記 3: Frame Graph FXAA 移行

- 公式 `FrameGraphFXAATask` を使い、Frame Graph backend の最終段に FXAA を追加した。
- task chain は `scene color RT -> ImageProcessingTask -> DepthOfFieldTask -> BloomTask -> Gamma/Contrast task -> FXAATask -> backbuffer copy`。
- FXAA は depth / normal を要求しない単純な post process なので、SSAO2 のような geometry pass は追加しない。
- 既存の `antialiasEnabled` 設定値をそのまま使い、Frame Graph backend では `FrameGraphFXAATask.disabled` に反映する。
- Classic backend の `FxaaPostProcess` は Frame Graph backend では生成しない。二重 FXAA を避け、Frame Graph backend の pass 表示と実行経路を一致させるため。
- UI の Frame Graph pass 表示は `Image / DoF / Bloom / Color / FXAA` に更新した。アンチエイリアスの ON/OFF 操作自体は既存の Runtime 側 AA toggle を引き続き使う。

## 2026-05-01 追記 4: 公式 task で移せる軽量 post effects

- 公式 task があり、depth / normal / velocity を要求しない軽量 post effects として以下を Frame Graph backend に追加した。
  - `FrameGraphSharpenTask`
  - `FrameGraphGrainTask`
  - `FrameGraphChromaticAberrationTask`
- task chain は `scene color RT -> ImageProcessingTask -> DepthOfFieldTask -> BloomTask -> Gamma/Contrast task -> SharpenTask -> GrainTask -> ChromaticAberrationTask -> FXAATask -> backbuffer copy`。
- 既存設定値はそのまま共有する。
  - `postEffectSharpenEdge`
  - `postEffectGrainIntensity`
  - `postEffectChromaticAberration`
- UI は Frame Graph backend panel 内に専用 slider を追加し、Classic backend の UI DOM とは分けた。内部設定値は共有し、backend に応じて実行経路だけを切り替える。
- Frame Graph backend では Classic `DefaultRenderingPipeline` 側の sharpen / grain / chromatic aberration を無効化する。二重適用を避け、Frame Graph pass 表示と実行内容を一致させるため。
- lens distortion / edge blur / motion blur / SSR / SSAO は今回は対象外。独自 shader、depth/normal、velocity、geometry pass が絡むため、公式 task 寄せで安全に移せるものから外した。

## 2026-05-01 追記 5: Frame Graph SSAO2 再試行

- ユーザー提供の Babylon.js 公式サンプル `SSAO.js` を確認した。
- 公式サンプルでは `FrameGraphGeometryRendererTask` に、事前に `FrameGraphClearTextureTask` で clear した depth attachment を明示的に渡している。
  - `geomTask.depthTexture = clearTask.depthTexture`
  - geometry texture は normal: `PREPASS_NORMAL_TEXTURE_TYPE` / `RGBA` / `HALF_FLOAT`、depth: `PREPASS_DEPTH_TEXTURE_TYPE` / `RED` / `HALF_FLOAT`。
- 前回の失敗時に出ていた `*_nodepth_*` 系 WebGPU pipeline 警告は、geometry render pass が depth attachment なしで作られていたことが主因の可能性が高い。
- 再試行では、FrameGraph 内に SSAO 用 depth RT を作り、clear task の `depthTexture` を geometry renderer へ接続するようにした。
- task chain は `scene color RT -> ImageProcessingTask -> SSAO2 -> DepthOfFieldTask -> BloomTask -> Gamma/Contrast task -> SharpenTask -> GrainTask -> ChromaticAberrationTask -> FXAATask -> backbuffer copy`。
- Frame Graph backend panel に専用 SSAO UI を再追加した。
  - 表示項目: SSAO ON/OFF、Strength、Radius。
  - Classic backend の SSAO UI とは DOM を共有しない。
  - 内部設定値は既存 `postEffectSsao*` を共有し、backend ごとに実行経路だけを切り替える。
- Frame Graph backend では引き続き Classic `SSAO2RenderingPipeline`、独自 fullscreen SSAO fallback、SSAO 用 `DepthRenderer` は止める。

注意:

- 今回は公式 task 準拠の再試行であり、MMD 向け fallback SSAO の fade/debug/toon tint はまだ移していない。
- 実機で WebGPU 警告や黒画面が再発した場合は、まず SSAO OFF で FrameGraph 全体が生きているか確認し、次に geometry pass の depth attachment 接続と material compatibility を見る。
- SSAO は geometry pass を追加するため重い。DoF/Bloom との併用時の FPS、PNG/WebM 出力、透過材質や outline との見た目差は別途確認が必要。

## 2026-05-01 追記 6: Frame Graph SSAO2 実機動作確認

- ユーザー実機確認で Frame Graph backend の SSAO2 が動作した。
- 前回の `*_nodepth_*` 系 WebGPU pipeline 警告と黒画面は、`FrameGraphGeometryRendererTask` に depth attachment を明示接続していなかったことが主因だった可能性が高い。
- 今回の接続は公式サンプル寄りに、FrameGraph 内で SSAO 用 depth RT を作り、`FrameGraphClearTextureTask.depthTexture` を geometry renderer の `depthTexture` へ渡す構成にした。
- SSAO2 はひとまず「使える」段階まで到達。ただし、見た目と負荷の調整は未完了。

次に確認すること:

- SSAO Strength / Radius の初期値と UI レンジが MMD モデル向けに妥当か。
- 透過材質、髪、スカート、toon outline 付近で AO が汚く出ないか。
- DoF / Bloom / Sharpen / Grain / Chroma / FXAA との順序で破綻しないか。
- SSAO ON 時の FPS 低下が許容範囲か。特に geometry pass 追加分のコストを見る。
- PNG / WebM 出力に Frame Graph SSAO2 が正しく乗るか。
- Classic WebGPU fallback SSAO にあった fade / debug / toon tint を Frame Graph 側にも移す価値があるか。

## 2026-05-01 追記 7: Frame Graph SSAO2 の影色 / Toon 寄せ

- Frame Graph SSAO2 の後段に独自 `SSAOToonComposite` post process を追加した。
- Babylon 公式 `FrameGraphSSAO2RenderingPipelineTask` の combine は `sceneColor * ssaoColor` の黒乗算寄り合成なので、そのままだと MMD の影色や Toon 感とずれやすい。
- 追加 post process では、SSAO2 後の色と SSAO2 前の色を比較して AO 量を推定し、暗くなる部分だけを MMD 向けの影色へ寄せる。
- 影色は照明 UI の `shadowColor` / `toonShadowInfluence` を `FrameGraphPostEffectsSettings` 経由で渡す。
- Toon については、現時点では fullscreen 後段から各材質の `toonTexture` を直接サンプリングできない。
  - そのため、SSAO2 前の描画色に既に含まれている材質色 / Toon 階調の色相を近似として使う。
  - 厳密に材質ごとの Toon texture 色を使うには、material id / toon band / shadow color などを別の geometry buffer として出す必要がある。
- 今回の実装は、公式 SSAO2 を壊さずに「黒い AO」から「影色と描画済み Toon 色に寄せた AO」へ近づける最小変更。

未確認:

- 影色スライダーを青 / 赤 / 緑へ振った時に SSAO 暗部の色相が自然に追従するか。
- Toon 影が強いモデルで、SSAO 暗部がモデル固有の Toon 色と馴染むか。
- 白服 / 黒髪 / 低彩度材質で色転びや汚れが出ないか。
- 直接 toonTexture を読む専用 buffer が必要になるか。

## 2026-05-01 追記 8: SSAO 白目黒ずみ対策

- Frame Graph SSAO2 の影色 / Toon 寄せ composite に、明るい低彩度ピクセル向けの AO 抑制を追加した。
- 白目は高輝度・低彩度・小面積なので、通常の SSAO 黒乗算がかなり目立つ。
- 材質 ID や toonTexture 直読なしでまず効かせるため、SSAO 前の描画色から以下を判定する。
  - `baseMax` が高い。
  - `baseChroma` が低い。
- 条件に合うピクセルでは AO 量を約 24% まで抑え、SSAO2 後の黒い結果よりも元色寄りへ戻す。
- この処理は白目だけを厳密に識別するものではないため、白服や淡い低彩度材質にも少し効く。

未確認:

- 白目の黒ずみが自然に減るか。
- 白服の接地影 / 皺影まで弱くなりすぎないか。
- 必要なら将来、材質名 / material id / toon-color buffer ベースの保護へ進める。

## 2026-05-01 追記 9: SSAO 近傍色ベースの影色補正

- Frame Graph SSAO2 の `SSAOToonComposite` に、SSAO 前の `originalColor` 近傍ピクセルを使う補正を追加した。
- 目的は、SSAO の暗部を常に黒寄りで乗せるのではなく、周辺の明るさ / 色に寄せて乗せること。
  - 明るい周辺では AO の乗算色を明るめにする。
  - 暗い周辺では AO の乗算色を暗めにする。
- 実装は追加 buffer なしの軽量版。
  - composite shader 内で上下左右 4 点の `originalColor` を読む。
  - 中心色との差が大きいサンプルは weight を下げ、輪郭をまたいだ色移りを抑える。
  - 近傍平均色から hue / luminance を取り、既存の影色 / Toon 寄せ band に控えめに混ぜる。
- WGSL ではピクセルごとの分岐後に `textureSample` を呼ぶと `must only be called from uniform control flow` で shader module 作成に失敗する。
  - 近傍サンプルは `textureSampleLevel(..., 0.0)` を使い、非 uniform 分岐後でも derivative 不要の明示 LOD サンプルにする。
- 白目のような明るい低彩度領域は、既存の bright-neutral 保護で AO 量を抑えつつ、近傍色補正の影響も少し抑える。

注意:

- fullscreen 後段の近傍色補正なので、厳密な材質単位の toonTexture 参照ではない。
- 目や髪の細部では、色差 rejection の閾値次第で色移り / 効き不足のどちらも起こり得る。
- より安定させる場合は、低解像度の neighborhood color buffer、または material id / toon-color buffer を別 pass で出す案を再検討する。

## 2026-05-01 追記 10: Frame Graph SSAO UI レンジ調整

- Frame Graph backend 専用の SSAO Strength / Radius slider 上限を `200` から `100` に下げた。
- 実機確認では 1.0 を超える範囲より、0.0-1.0 の範囲を細かく触れるほうが調整しやすい。
- Frame Graph backend 選択時は、既存値が 1.0 を超えている場合に UI 初期化時点で 1.0 へ丸める。
- Classic backend の SSAO UI とは DOM を共有しない方針を維持する。

## 2026-07-01 現行補足

この進捗メモの 2026-04 / 2026-05 時点の記述には、現在から見ると古い判断が含まれる。最新の大きな差分は次の通り。

- FrameGraph backend は固定 task chain ではなく、UI の post stack order を runtime order として反映する。
- `frameGraphPostStack` により、順序と enabled 状態を project save/load で保持する。
- 個別 ON/OFF はパラメーター値を消さず、stack entry の `enabled` だけを切り替える。
- Luminous は FrameGraph stack の `luminous` として扱い、専用 luminous mask から blur / composite する経路に寄っている。旧 GlowLayer は主に classic / fallback 文脈。
- LUT は FrameGraph 側にも stack entry として存在する。外部 LUT や出力反映の完全確認は引き続き残課題。
- SSAO / SSR は depth / normal / reflectivity を必要とする重い resource を使うため、resource plan と stack enabled 状態の同期が重要。
- `Offset Shadow` と `Offset Rim` が custom FrameGraph post effect として追加された。
- WebGPU の validation warning を避けるため、stack 順序変更時に `execute()` 中で texture を live reconnect しない。backend rebuild を行う。

今後この文書を読む場合は、実装済みの現行仕様として [FrameGraph Post Stack 現行仕様メモ 2026-07-01](./framegraph-post-stack-current-spec-2026-07-01.md) を先に見ること。
