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

## 関連メモ

- [frame-graph-post-effects-plan-2026-04-28.md](./frame-graph-post-effects-plan-2026-04-28.md)
- [frame-graph-post-effects-progress-2026-04-28.md](./frame-graph-post-effects-progress-2026-04-28.md)
- [mirroring-floor-plan-2026-05-11.md](./mirroring-floor-plan-2026-05-11.md)
- [v0.2-task-memo.md](./v0.2-task-memo.md)
