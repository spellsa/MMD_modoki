# SSR / Frame Graph 実装検討メモ

作成日: 2026-05-12

## 目的

Babylon.js の Screen Space Reflections (SSR) を、MMD_modoki の Frame Graph backend で ON / OFF できる実験機能として検討する。

MirroringFloor は平面反射用の専用板ポリゴンであり、WorkingFloor 的な反射に向く。一方 SSR は画面内の情報を使う材質反射であり、ステージ床、壁、金属面、濡れた床、ガラス風の小物などに向く可能性がある。

## 公式機能の確認

Babylon.js 9.2.0 の package 内に以下の Frame Graph SSR task がある。

- `FrameGraphSSRRenderingPipelineTask`
  - `node_modules/@babylonjs/core/FrameGraph/Tasks/PostProcesses/ssrRenderingPipelineTask.d.ts`
  - `ThinSSRRenderingPipeline` を内包する統合 task
  - 実装候補の主経路
- `FrameGraphSSRTask`
  - `node_modules/@babylonjs/core/FrameGraph/Tasks/PostProcesses/ssrTask.d.ts`
  - 単体 SSR post process task
  - `@internal` 扱い
- `FrameGraphSSRBlurTask`
  - `node_modules/@babylonjs/core/FrameGraph/Tasks/PostProcesses/ssrBlurTask.d.ts`
  - SSR blur 用
  - `@internal` 扱い

`FrameGraphSSRRenderingPipelineTask` が必要とする主な入力:

- `sourceTexture`
- `normalTexture`
- `depthTexture`
- `reflectivityTexture`
- `camera`
- 任意で `backDepthTexture`

`ThinSSRRenderingPipeline` 側にある主な調整項目:

- `strength`
- `reflectivityThreshold`
- `maxDistance`
- `maxSteps`
- `step`
- `thickness`
- `roughnessFactor`
- `blurDispersionStrength`
- `ssrDownsample`
- `blurDownsample`
- `enableSmoothReflections`
- `useFresnel`
- `debug`

## MirroringFloor との違い

MirroringFloor:

- 明確な平面反射に向く
- 画面外や背面側のオブジェクトも反射できる
- 反射面ごとに `MirrorTexture` / `mirrorPlane` が必要
- 反射対象を別パスで描くため負荷が増える

SSR:

- 材質反射として扱いやすい
- 床、壁、小物など複数面に自然に適用しやすい
- 画面外にあるものは反射できない
- normal / depth / reflectivity buffer が必要
- 画面端や隠れている部分で欠けが出やすい

現時点では置き換えではなく併用候補とする。

## MMD_modoki での方針案

SSR は全体にかける post effect だが、反射対象は `reflectivityTexture` で絞る。MMD Standard material の `specularColor` や既存 reflectivity をそのまま使うと、意図しない PMX 材質まで反射する可能性が高い。

そのため、最初は「SSR 用プリセットシェーダー / 材質プリセット」を割り当てた材質だけ反射させる案を優先する。

候補:

- `MMD Toon + SSR`
- `Stage Mirror SSR`
- `Wet Floor SSR`
- `SSR Reflective Toon`

材質プリセット側で持ちたい値:

- SSR 強度
- SSR reflectivity 色または係数
- roughness / blur 寄せ係数
- SSR 対象 ON / OFF

Frame Graph 側で持ちたい値:

- SSR backend ON / OFF
- 全体強度
- reflectivity threshold
- blur strength
- max distance
- quality / downsample
- debug view

## UI 配置方針

SSR は scene object ではなく、Frame Graph 後段で合成する post effect として扱う。そのため UI は暫定的にエフェクト欄へ置く。

方針:

- PostFX / エフェクト欄の Frame Graph backend UI に SSR 設定を追加する
- Classic backend では SSR UI を disabled または非表示にする
- SSR の全体 ON / OFF はエフェクト欄で扱う
- SSR の対象材質指定は Shader / 材質パネルの SSR 用プリセットで扱う
- SSR 全体が ON でも、SSR 用プリセット材質がなければ反射は出ない設計にする

最小 UI:

- `SSR`: ON / OFF
- `SSR Strength`
- `SSR Threshold`
- `SSR Blur`

後続候補:

- `SSR Quality`
- `SSR Max Distance`
- `SSR Debug`

この分担により、エフェクト欄は「SSR 処理を走らせるか」、材質欄は「どこを反射対象にするか」を担当する。

## 実装ステップ案

### Step 1: 調査 PoC

- Frame Graph backend の task chain に `FrameGraphSSRRenderingPipelineTask` を追加できるか確認する
- 既存 scene color RT から `sourceTexture` を渡す
- normal / depth / reflectivity をどの task で生成するか確認する
- `FrameGraphGeometryRendererTask` の `reflectivity` output が使えるか調べる
- まずは固定値の reflectivity で 1 面だけ反射するか確認する

### Step 2: UI 最小化

PostFX / Frame Graph backend 側に SSR の最小 UI を追加する。

- `SSR`: ON / OFF
- `SSR Strength`
- `SSR Threshold`
- `SSR Blur`
- `SSR Quality`
- `SSR Debug`

Classic backend とは混ぜず、Frame Graph backend 専用 UI として扱う。

### Step 3: 材質プリセット連携

- Shader / 材質パネルに SSR 用プリセットを追加する
- プリセットを付けた材質だけ reflectivity buffer へ反射値を出す
- 通常の MMD toon / outline / sphere / texture 表示をできるだけ維持する
- PMX キャラ材質ではなく、まずステージ床・壁・アクセサリ材質を主対象にする

### Step 4: 出力確認

- PNG 保存
- WebM 出力
- Frame Graph backend での出力
- MirroringFloor と併用した場合の見た目
- DoF / Bloom / FXAA との順序

## 注意点

- SSR は画面内情報しか反射できないため、WorkingFloor の完全な代替ではない。
- MMD 材質の specular をそのまま SSR 入力に使うと、髪、服、肌など意図しない材質が反射する可能性がある。
- normal / depth / reflectivity の生成が MMD Standard material / outline / 透過と噛み合うか確認が必要。
- 透過材質、髪、スカート、半透明アクセサリでは欠けやちらつきが出やすい可能性がある。
- SSR を DoF / Bloom の前後どちらに置くかで見た目が変わる。
- `enableAutomaticThicknessComputation` は back depth texture を追加で必要とし、負荷が増えるため初期 PoC では OFF 候補。
- `blurDispersionStrength` や downsample は見た目と負荷の両方に効くため、低めから始める。

## 初期プリセット案

### Stage Mirror SSR

- 用途: 鏡面寄りの床、壁、ステージ板
- SSR 強度: 高め
- blur: 低め
- roughness: 低め
- 画面内欠けが目立つ可能性があるため MirroringFloor との比較対象にする

### Wet Floor SSR

- 用途: 濡れた床、薄い照り返し
- SSR 強度: 中程度
- blur: 中程度
- roughness: 中程度
- MMD ステージに自然に馴染む可能性がある

### Soft Reflective Stage

- 用途: 強い鏡面ではなく、床面の弱い反射
- SSR 強度: 低め
- blur: 高め
- roughness: 高め
- 最初に実用寄りで試す候補

## 確認観点

- Frame Graph backend で SSR task を ON / OFF できるか
- SSR OFF 時に既存 Frame Graph backend の見た目へ戻るか
- SSR 対象材質だけが反射するか
- PMX キャラ材質が意図せず反射しないか
- MirroringFloor と併用して過剰な反射にならないか
- DoF / Bloom / FXAA / Lens Distortion / Vignette との順序で破綻しないか
- WebGPU validation warning が出ないか
- PNG / WebM 出力で反射が入るか

## 実装メモ 2026-05-13

初期 PoC として Frame Graph backend に `FrameGraphSSRRenderingPipelineTask` を追加する方針で着手した。

- SSR は `ImageProcessing` の後、`SSAO` の前に配置する
- 既存の SSAO 用 `FrameGraphGeometryRendererTask` に `normal` / `view depth` / `reflectivity` を出させる
- GeometryRenderer は `SSAO` または `SSR` のどちらかが有効なときだけ動かす
- 旧 `SSRRenderingPipeline` は Classic backend 用として残すが、Frame Graph backend では起動しない
- UI はエフェクト欄の Frame Graph panel に `SSR` / `SSR Strength` のみ追加する
- 材質側はまず `SSR Reflective` プリセット 1 種に絞る

初期 PoC の値は以下。

- `strength`: UI 0.80
- `step`: 1
- `reflectivityThreshold`: 0.85
- `blurDispersionStrength`: 0.03
- `roughnessFactor`: 0.12
- `ssrDownsample` / `blurDownsample`: 1

`reflectivityThreshold` は、通常の MMD 材質が不用意に反射対象になりにくいよう高めにした。反射させたいステージ床・壁材質には `SSR Reflective` プリセットを割り当てる。

未確認事項:

- `FrameGraphGeometryRendererTask` の reflectivity 出力が MMD material / babylon-mmd material で期待通りになるか
- `SSR Reflective` プリセットを付けた材質だけが実質的な反射対象になるか
- 透過材質、outline、MirroringFloor 併用時の描画順
- PNG / WebM 出力で SSR が入るか
- WebGPU validation warning の有無

## 公式実装から見た品質調整メモ 2026-05-13

Babylon.js の `ThinSSRRenderingPipeline` / `SSRRenderingPipeline` / `FrameGraphSSRRenderingPipelineTask` を確認したところ、SSR の品質改善と破綻隠しに効く主な項目は以下。

参照:

- <https://doc.babylonjs.com/typedoc/classes/BABYLON.SSRRenderingPipeline>
- <https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/PostProcesses/RenderPipeline/Pipelines/thinSSRRenderingPipeline.ts>
- <https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/FrameGraph/Tasks/PostProcesses/ssrRenderingPipelineTask.ts>

### 品質に効く項目

- `step`
  - レイマーチのピクセル単位ステップ。
  - 小さいほど高品質で、`1` が品質優先。
  - 大きくすると速くなるが、反射の欠けや段差が目立ちやすい。
- `maxSteps`
  - レイマーチの最大ステップ数。
  - 大きくすると遠くまで拾いやすくなるが、負荷も増える。
  - 現 PoC の `96` は軽め。品質確認では `128` / `192` / `256` あたりを試す。
- `thickness`
  - 深度交差判定の厚み。
  - 小さすぎると反射が欠け、大きすぎると拾いすぎやにじみが出る。
  - まず `0.18` から `0.35` 程度で調整する。
- `reflectivityThreshold`
  - reflectivity texture の値がどの程度以上なら SSR 対象にするかの閾値。
  - 現 PoC では通常の MMD 材質を巻き込みにくくするため `0.85` と高め。
  - `SSR Reflective` プリセット対象だけを反射させる方針なら高めのままでよい。

### ぼかしとごまかしに効く項目

- `blurDispersionStrength`
  - SSR のぼかし量。
  - `0` でぼかしなし。値を上げると roughness と距離に応じて反射がぼける。
  - 現 PoC の `0.03` は弱め。見た目確認では `0.06` から `0.12` 程度を試す。
- `roughnessFactor`
  - `blurDispersionStrength > 0` のときに効く全体 roughness。
  - 鏡面ではなく濡れ床・磨いた床寄りにするなら `0.2` から `0.35` 程度を試す。
- `ssrDownsample`
  - SSR 本体のダウンサンプル率。
  - `0` がフル解像度、`1` が半解像度。
  - 品質優先では `0`、軽量優先では `1`。
- `blurDownsample`
  - blur 用 texture のダウンサンプル率。
  - ぼかしで破綻を隠す場合でも、品質優先では `0` を試す価値がある。
- `enableSmoothReflections`
  - `step > 1` のときの補間用。
  - `step = 1` の品質優先設定では実質的に効果がない。

### いったん試す品質寄り候補

現在の PoC は軽めなので、品質を上げつつぼかしで破綻を隠す試行では以下を候補にする。

```ts
ssr.step = 1;
ssr.maxSteps = 192;
ssr.thickness = 0.22;
ssr.blurDispersionStrength = 0.08;
ssr.roughnessFactor = 0.28;
ssr.ssrDownsample = 0;
ssr.blurDownsample = 0;
```

負荷が高い場合は `maxSteps` を `128` に下げるか、`blurDownsample` を `1` に戻す。`ssrDownsample` を `1` に戻すと反射自体の解像感が落ちやすいため、まずは `blurDownsample` 側から落とす。

### 注意点

SSR は screen-space の情報からしか反射を作れないため、画面外・背面・深度上見えていないものは反射できない。これは `maxSteps` や blur では完全には解決できない。

平面反射として正確さが必要な場合は MirroringFloor のほうが適している。SSR は材質単位の反射や濡れ床風の質感追加として使い、欠けや不連続は blur / roughness / attenuation で目立ちにくくする位置づけがよい。

## 鈍い反射への試行 2026-05-13

MirroringFloor はつるつるした平面反射を担当できるため、SSR は鏡面反射ではなく、ステージ材質に薄く乗る鈍い反射として調整する方針に寄せる。

今回の試行値:

```ts
ssr.strength = 0.30;
ssr.step = 4;
ssr.maxSteps = 192;
ssr.thickness = 0.22;
ssr.reflectivityThreshold = 0.85;
ssr.blurDispersionStrength = 0.08;
ssr.roughnessFactor = 0.28;
ssr.ssrDownsample = 0;
ssr.blurDownsample = 0;
```

狙い:

- `maxSteps` を増やして反射の欠けを少し抑える。
- `step = 4` に固定し、実機で見た目が良かった粗さに寄せる。
- `ssrDownsample` / `blurDownsample` を `0` にして、ぼかし前の解像感を落としすぎない。
- `blurDispersionStrength` と `roughnessFactor` を上げて、SSR 特有の途切れや不安定さを鈍い反射として見せる。
- `strength = 0.30` として、鏡面ではなく床材に薄く乗る反射にする。
- `reflectivityThreshold` は高めのままにし、`SSR Reflective` プリセットを付けた材質だけを主対象にする。

負荷が厳しい場合は、まず `blurDownsample = 1`、次に `maxSteps = 128` を試す。`ssrDownsample = 1` は反射そのものが荒れやすいため、最後に落とす候補とする。

### UI 簡略化

実機確認では `SSR Strength = 0.30` / `SSR Step = 4` 周辺の見た目が良かった。`step` は品質・負荷・粗さの関係が分かりにくく、通常操作で頻繁に触る項目でもないため、UI からは外して `4` 固定にする。

エフェクト欄で露出する SSR 操作は以下に絞る。

- `SSR`: ON / OFF
- `SSR Strength`: 反射の強度

## 現実装まとめ 2026-05-13

現時点の SSR は、Frame Graph backend 専用の実験機能として実装している。Classic backend の旧 `SSRRenderingPipeline` とは混ぜず、Frame Graph の task chain 内で完結させる。

### 実行経路

- `FrameGraphSSRRenderingPipelineTask` を `ImageProcessing` の後、`SSAO` の前に配置する。
- `FrameGraphGeometryRendererTask` から SSR 用に `normal` / `view depth` / `reflectivity` を出力する。
- `SSAO` と `SSR` のどちらかが有効な場合のみ GeometryRenderer を動かす。
- SSR の出力を SSAO の入力に渡すため、SSR と SSAO を併用できる。
- Frame Graph backend 有効時は Classic backend 側の旧 SSR pipeline は起動しない。

### UI

エフェクト欄の Frame Graph panel に以下だけを出す。

- `SSR`: ON / OFF
- `SSR Strength`: 0.00 から 2.00

`SSR Step` は UI から外し、内部固定値 `4` とする。品質・負荷・粗さの意味が UI 操作として分かりにくく、実機確認でも `4` が見た目の基準として扱いやすかったため。

### 現在の固定パラメータ

```ts
ssr.step = 4;
ssr.maxDistance = 1000;
ssr.maxSteps = 192;
ssr.thickness = 0.22;
ssr.reflectivityThreshold = 0.85;
ssr.roughnessFactor = 0.28;
ssr.blurDispersionStrength = 0.08;
ssr.ssrDownsample = 0;
ssr.blurDownsample = 0;
ssr.enableSmoothReflections = true;
```

`SSR Strength` の既定値は `0.30`。つるつるした鏡面反射は MirroringFloor に任せ、SSR は床・壁・ステージ材質に薄く乗る鈍い反射として使う。

### 材質プリセット

`SSR Reflective` プリセットを追加している。反射対象にしたいステージ床・壁などの材質に割り当てる想定。

現段階では、PMX キャラ材質全般を SSR 対象にするのではなく、反射させたい材質だけを明示的に選ぶ方針。通常の MMD 材質を不用意に巻き込まないため、`reflectivityThreshold` は高めの `0.85` にしている。

### 保存/読み込み

プロジェクト保存では以下を保持する。

- `ssrEnabled`
- `ssrStrength`
- `ssrStep`

`ssrStep` は互換用に保存項目として残しているが、Frame Graph SSR の現実行では `4` 固定で扱う。将来、品質プリセットを追加する場合に再利用する可能性がある。

### 確認済み

- `SSR Reflective` を割り当てた床材質で、鈍い反射として視認できる。
- `SSR Strength = 0.30` / `step = 4` / blur 強めの設定で、MirroringFloor より控えめな反射として見た目がまとまりやすい。
- `npm.cmd run test:unit -- src/project/project-serializer.test.ts src/project/project-importer.test.ts` 成功。
- `npm.cmd run lint` 成功。ただし既存 warning は残る。

### 未確認/今後の課題

- PNG / WebM 出力で SSR が期待通り入るか。
- MirroringFloor と同時使用したときの見た目と描画順。
- 透過材質、outline、髪などの複雑な MMD 材質との相性。
- ステージによっては screen-space SSR の欠けが目立つため、必要なら品質プリセットや blur/downsample の軽量設定を追加する。

## 関連メモ

- [frame-graph-post-effects-plan-2026-04-28.md](./frame-graph-post-effects-plan-2026-04-28.md)
- [frame-graph-post-effects-progress-2026-04-28.md](./frame-graph-post-effects-progress-2026-04-28.md)
- [mirroring-floor-plan-2026-05-11.md](./mirroring-floor-plan-2026-05-11.md)
- [v0.2-task-memo.md](./v0.2-task-memo.md)
