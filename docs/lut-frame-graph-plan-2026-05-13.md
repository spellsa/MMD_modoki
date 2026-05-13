# LUT / Frame Graph 実装計画メモ

作成日: 2026-05-13

## 目的

既存の LUT 機能を Frame Graph backend でも使えるようにする。

ここで扱う LUT は Babylon.js の標準 `ColorCorrectionTask` へそのまま寄せるのではなく、MMD_modoki 既存の `.3dl` / `.cube` 読み込み、built-in preset、外部 LUT、強度 UI を活かす独自 Frame Graph task として検討する。

将来的には、MMD_modoki 固有の UI や project 保存処理から切り離し、Babylon.js 向けの小さな OSS 部品として切り出せる形を意識する。

## 背景

Classic backend では Babylon.js の `ColorGradingTexture` と `scene.imageProcessingConfiguration.colorGradingTexture` を使って LUT を適用している。

既存の LUT 入力経路:

- built-in `.3dl` preset
- 外部 `.3dl`
- 外部 `.cube`
- project-relative LUT

`.cube` は `src/lut-file.ts` で一度 runtime 用 `.3dl` text に正規化される。つまり Frame Graph 側では、まず既存 runtime `.3dl` text を受け取れるようにすればよい。

過去の Frame Graph 試行では、`FrameGraphImageProcessingTask` 経由で `ColorGradingTexture` を使おうとしたが、imported render target、color space、shader define、texture ready 状態が絡んで不安定だった。

結論として、LUT は `scene.imageProcessingConfiguration` に依存させず、LUT texture / sampler / intensity を明示 bind する独自 task にするのがよい。

関連メモ:

- [frame-graph-post-effects-progress-2026-04-28.md](./frame-graph-post-effects-progress-2026-04-28.md)
- [lut-cube-implementation-note.md](./lut-cube-implementation-note.md)
- [lut-wgsl-file-handling.md](./lut-wgsl-file-handling.md)
- [v0.2-task-memo.md](./v0.2-task-memo.md)

## 公式・一次情報メモ

参照対象:

- Babylon.js `FrameGraphPostProcessTask`
  - <https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/FrameGraph/Tasks/PostProcesses/postProcessTask.ts>
- Babylon.js `FrameGraphCustomPostProcessTask`
  - <https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/FrameGraph/Tasks/PostProcesses/customPostProcessTask.ts>
- Babylon.js `FrameGraphColorCorrectionTask`
  - <https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/FrameGraph/Tasks/PostProcesses/colorCorrectionTask.ts>
- Babylon.js `ColorGradingTexture`
  - <https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/Materials/Textures/colorGradingTexture.ts>

確認したい点:

- `FrameGraphColorCorrectionTask` は URL で指定する color table texture 前提の task で、既存 `.3dl` / `.cube` runtime text と直接つながる設計ではない。
- `FrameGraphCustomPostProcessTask` または `FrameGraphPostProcessTask` 派生で custom shader を載せるのが自然。
- 既存の Frame Graph custom task 群と同じく、uniform / texture binding は `record()` の `additionalBindings` で明示するのが安全。

## 方針

`FrameGraphImageProcessingTask` 経由の LUT は採用しない。

ただし、既存 LUT 実装を捨てて作り直すわけではない。既存の入力・正規化・UI・保存経路は動作実績があるため、できるだけ流用する。

流用するもの:

- built-in LUT preset の一覧と raw `.3dl` text
- 外部 `.3dl` / `.cube` 読み込み
- `.cube -> runtime .3dl` 正規化
- LUT source mode
- project-relative LUT 保存 / 読み込み
- LUT preset / intensity の UI 状態

差し替えるもの:

- Classic backend: `ColorGradingTexture` と `scene.imageProcessingConfiguration` へ渡す
- Frame Graph backend: 同じ runtime `.3dl` text を atlas texture 化し、custom Frame Graph task へ渡す

つまり実装の主眼は「LUT 機能の再実装」ではなく、「既存 LUT 解決結果を Frame Graph の post process に差せる adapter を作る」ことに置く。

Frame Graph 側は以下の構成にする。

1. runtime `.3dl` text をパースして LUT データを作る
2. LUT データを 2D atlas texture に変換する
3. custom Frame Graph post process task で source color に LUT を適用する
4. intensity で元画像と LUT 結果を blend する

初期実装では、Classic backend の LUT 見た目に近づけることを優先する。OpenColorIO 相当の厳密な色管理や、複数補間方式の UI 化は後回しにする。

## LUT texture 形式案

3D texture より 2D atlas を優先する。

理由:

- WebGPU / WebGL2 fallback の両方で扱いやすい
- Babylon.js の通常 texture/sampler binding に載せやすい
- OSS 部品として切り出す場合も依存が少ない
- 既存 `.3dl` text から生成しやすい

初期案:

```text
LUT size = N
atlas width  = N * N
atlas height = N

x = r + b * N
y = g
```

shader では入力 RGB を `0..N-1` の LUT 座標に変換し、周辺 8 点を 2D atlas から読む。初期実装は trilinear 補間にする。

`.cube -> .3dl` の正規化段階では tetrahedral 補間を使っているが、Frame Graph shader 側は runtime `.3dl` の格子を読むだけなので、まず trilinear で十分とみる。必要なら後で tetrahedral sampling を shader 側にも入れる。

## shader の処理案

入力:

- `textureSampler`: 前段 post effect 出力
- `lutSampler`: 2D atlas LUT
- `lutSize`: LUT 格子サイズ
- `lutIntensity`: 0.0 - 1.0

処理:

```text
base = source.rgb
graded = sample3dLutFromAtlas(base)
rgb = mix(base, graded, lutIntensity)
alpha = source.a
```

注意点:

- half texel offset を入れて隣接セルのにじみを避ける
- texture wrap は clamp
- LUT texture は linear sampling に任せず、shader 内で明示補間する
- LUT texture の値域は 0..1 に正規化して保持する
- alpha は変更しない

## Frame Graph chain 内の位置

初期配置は以下を候補にする。

```text
scene color RT
-> ImageProcessingTask disabled/copy
-> SSR
-> SSAO
-> DoF
-> Bloom
-> LUT
-> Gamma/Contrast
-> Sharpen
-> Grain
-> Chromatic Aberration
-> Vignette/EdgeBlur
-> Lens Distortion
-> FXAA
-> output
```

LUT は最終的な色作りに近いので Bloom の後に置く。Gamma / Contrast より前に置くか後に置くかは見た目差が出る可能性があるが、初期実装では「LUT で絵作り、その後に簡易調整」として Bloom 後、Gamma / Contrast 前に置く。

比較対象:

- LUT -> Gamma/Contrast
- Gamma/Contrast -> LUT

Classic backend と大きく差が出る場合は順序を再検討する。

## UI 方針

既存 LUT UI をできるだけ流用する。

Frame Graph backend で表示したい最小項目:

- `LUT`: ON / OFF
- `LUT preset`: built-in / loaded LUT
- `LUT intensity`
- `LUT source`
- `LUT file`

Classic backend と Frame Graph backend で UI は共有してもよいが、実行経路は混ぜない。

共有する場合でも、UI controller は「現在の backend がどちらか」を見て別経路へ適用する。Classic の `applyLutSettings()` は従来通り `ColorGradingTexture` を作り、Frame Graph は別の atlas texture cache を使う。UI から見える値は同じでも、内部 texture と binding は backend ごとに分ける。

確認対象:

- backend 切替時に Classic の `ColorGradingTexture` が残らない
- Frame Graph backend で LUT を ON にしても Classic pipeline 側に二重適用されない
- LUT file / source mode / project-relative 保存値は既存形式を維持する
- 外部 LUT 読み込み後に Frame Graph 側 texture が更新される

## 実装ステップ案

### Step 1: runtime LUT parser の分離

`src/lut-file.ts` は外部 `.cube` / `.3dl` 入力の正規化を担当している。

ここは既存のまま温存する。Frame Graph 用には、その後段として runtime `.3dl` text を描画用データへ変換する処理だけを分離する。

候補:

- `src/render/lut-runtime-texture.ts`
- `src/render/lut-atlas.ts`

責務:

- `.3dl` text を読む
- 格子サイズを推定する
- RGB 値を 0..1 に正規化する
- atlas 用 `Uint8Array` または `Float32Array` を作る

`src/lut-file.ts` の `.cube` parser / tetrahedral resampling / project 入力処理には触らない。ここに手を入れると Classic backend の動作実績まで巻き込むため、Frame Graph 化の初期 PoC では避ける。

### Step 2: texture cache

LUT source ごとに atlas texture を cache する。

cache key 候補:

```text
builtin:<presetId>
external:<sourceMode>:<path>:<format>:<revision>
```

既存 `postEffectLutTextureKey` に近いが、Classic 用 `ColorGradingTexture` と混ぜない。Frame Graph 用に別 key / texture を持つ。

Classic 用 cache と Frame Graph 用 cache を分ける理由:

- texture class / format が異なる
- dispose タイミングが異なる
- backend 切替時に二重適用や stale texture を避ける
- 将来 OSS 部品化するとき、Frame Graph 側 adapter を独立させやすい

### Step 3: custom Frame Graph LUT task

`src/render/frame-graph-post-effects-controller.ts` に LUT task を追加する。

初期候補:

- `FrameGraphLutTask`
- `FrameGraphPostEffectsLutTask`

既存 custom task と同じく、WGSL / GLSL shader を用意する。

必要になりそうな値:

- `lutTexture`
- `lutSize`
- `lutIntensity`
- `enabled`

### Step 4: UI 露出

現在 Frame Graph backend で隠している LUT UI を段階的に戻す。

最初は built-in preset のみでよい。外部 LUT まで同時に戻すと、ファイル読み込み、project 保存、texture cache の切り分けが難しくなる。

推奨順:

1. built-in preset + intensity
2. 外部 `.3dl`
3. 外部 `.cube`
4. project-relative 保存 / 読み込み

### Step 5: 比較確認

確認項目:

- built-in `anime-soft` で Classic backend と大きく違わない
- intensity 0 で完全に元画像
- intensity 100 で LUT が明確に効く
- preset 切替で texture が更新される
- Frame Graph backend で白浮きしない
- PNG / WebM 出力に反映される
- backend 切替で二重適用されない

## テスト方針

自動テスト:

- `.3dl` parser の格子サイズ推定
- identity LUT の atlas 生成
- 既存 `.cube -> runtime .3dl` の unit test が壊れないこと

確認コマンド:

```powershell
npm.cmd run lint
npm.cmd run test:unit
npm.cmd run smoke:launch
```

実機確認:

- WebGPU backend
- Frame Graph backend ON
- built-in LUT
- 外部 `.3dl`
- 外部 `.cube`
- PNG 保存
- WebM 出力

## リスク

- Classic backend の `ColorGradingTexture` と独自 shader で色空間が一致しない可能性がある
- LUT の table order を間違えると、赤/緑/青の転び方が大きく変わる
- 2D atlas の half texel offset が甘いと、LUT 境界でにじみや段差が出る
- 8 tap sampling のため、低スペック環境では重くなる可能性がある
- WebGL2 fallback を残す場合、texture format と shader 記法の差分を確認する必要がある
- Frame Graph rebuild と texture 更新のタイミングを間違えると、preset 切替が反映されない

## OSS 部品化を意識した分離案

切り出し候補は MMD_modoki の project state や UI に依存させない。

小さな単位:

- `.3dl` runtime text parser
- LUT atlas builder
- WGSL / GLSL sampling function
- Babylon.js texture 作成 helper
- Frame Graph custom task wrapper

MMD_modoki 固有として残すもの:

- built-in preset 一覧
- project-relative 保存
- UI controller
- backend 切替制御
- Classic backend との互換処理

将来的な公開単位:

```text
@mmd-modoki/babylon-lut-frame-graph
```

またはもう少し一般化して:

```text
@babylon-lab/frame-graph-lut
```

## 初期実装の判断

最初から完璧な color management を目指さない。

まずは built-in `.3dl` preset を Frame Graph backend 上で明示 texture bind し、`intensity 0 / 100` と preset 切替が確実に効くところまでを最小ゴールにする。

外部 `.cube` / project-relative LUT は既存入力経路を活かせるはずだが、最初の PoC では範囲を広げすぎない。
