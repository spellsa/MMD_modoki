# デフォルト空 / HDRI / BackgroundMaterial 調査メモ 2026-07-20

## 目的

MMD_modoki の未読込時・背景未設定時に表示する「デフォルト空」を見直す。

候補は主に次の 3 系統とする。

1. 現行の無彩色 skydome を維持する
2. Babylon.js の `BackgroundMaterial` を使う
3. HDRI を背景表示または IBL（Image Based Lighting）に使う

このメモは調査と設計判断だけを対象とする。2026-07-20 時点ではコード、UI、アセットを変更していない。

## 先に結論

- `BackgroundMaterial` と HDR/IBL は代替関係ではない。
  - `BackgroundMaterial` は空や床を描くための材質。
  - `scene.environmentTexture` は主に PBR 材質へ間接光と反射を与えるシーン状態。
  - 同じ HDRI を両方へ渡すことはできるが、表示と照明は別の責務である。
- 現行 PMX/PMD の主材質は `MmdStandardMaterial`、つまり `StandardMaterial` 系である。
  - `scene.environmentTexture` を設定するだけでは、PMX/PMD 全体が PBR のような IBL 照明になるわけではない。
  - 一方、GLB など PBR 材質を持つアセットは影響を受けうる。
  - そのため HDRI をデフォルト IBL として直結すると、MMD モデルと PBR アセットの見え方が非対称になる。
- 採用方向は、**背景描画を `BackgroundMaterial` ベースへ統一し、IBL 環境ライティングは既定 OFF にする**。
  - キャラクター編集向けの既定候補は、単色または低コントラストな studio gradient。
  - bundled HDRI は選択可能な background preset として用意する。
  - HDRI 表示は `reflectionTexture`、生成 gradient は `diffuseTexture` を使う。
  - `scene.environmentTexture` へは、ユーザーが環境ライティングを ON にしたときだけ接続する。
  - 既存の directional light、MMD toon、床、影は維持する。
  - neutral background は texture load failure、低性能環境、ユーザー選択用の fallback として残す。
- 同じ HDRI asset を背景と照明で共有しても、表示と IBL の ON/OFF は独立させる。
- 外部 `.hdr` / `.env`、可能なら `.exr` の読込導線を追加し、読込だけでは環境ライティングを自動 ON にしない。
- `scene.createDefaultEnvironment()` は既存の床、画像処理、PostFX 設定までまとめて変更するため、このリポジトリではそのまま採用しない。

## 用語の分離

### 背景表示

カメラの背後に何を描くかという表示上の状態。

例:

- neutral color
- black
- 画像
- 動画
- HDRI panorama / cubemap

### 環境照明

環境テクスチャから radiance / irradiance を取り、材質の反射や間接光へ使う状態。

Babylon.js では主に次に相当する。

```text
scene.environmentTexture
scene.environmentIntensity
scene.iblIntensity
```

Babylon.js の `Scene.environmentTexture` API も「すべての PBR material で使う reflection texture」と説明している。

### IBL Shadows

`IblShadowsRenderPipeline` による voxel / screen-space 系の影。通常の IBL 照明とは別機能である。

MMD_modoki では 2026-05-08 に凍結され、`IBL_SHADOWS_EXPERIMENT_ENABLED = false` になっている。今回 HDRI を背景または環境照明へ使う検討は、凍結中の IBL Shadows を再有効化する話ではない。

関連:

- [IBL Shadows 検討メモ](./ibl-shadows-investigation-2026-05-07.md)

## 現行実装

### デフォルト空

`src/mmd-manager.ts` では次の構成になっている。

- `scene.clearColor`
  - 既定は `(0.94, 0.94, 0.94, 1)`
  - 黒背景時は `(0, 0, 0, 1)`
- `skydome`
  - 直径 `1200`、segments `24` の sphere
  - `StandardMaterial`
  - diffuse / emissive ともに `(0.94, 0.94, 0.94)`
  - `disableLighting = true`
  - `backFaceCulling = false`
  - `disableDepthWrite = true`
  - `infiniteDistance = true`
  - pick 対象外

clear color と skydome を同じ無彩色にして、境目を見えにくくしている。

この方針は [Viewport 見た目調整メモ](./viewport-visual-polish-2026-03-13.md) に記録済みである。

### 既存背景状態

現在は次の状態が別々に存在する。

| 状態 | 実体 | project 保存 |
| --- | --- | --- |
| skydome 表示 | sphere mesh の enabled | あり |
| 黒背景 | `scene.clearColor` の切替 | なし |
| 背景画像 | fullscreen `Layer` | path のみあり |
| 背景動画 | fullscreen `Layer` | path のみあり |
| 背景メディア表示 | `Layer.isEnabled` | なし |
| HDRI 背景 | hidden / disabled UI のみ | なし |
| 環境照明 | 通常経路では未使用 | なし |

画像または動画を読み込むと skydome は自動で非表示になる。一方、黒背景は clear color だけを切り替えるため、skydome が表示中なら黒が手前へ出ない。

現在の状態は排他的な「背景モード」ではなく、複数の boolean と path の組み合わせである。HDRI を追加する前に優先順位を整理しないと、次のような競合が増える。

- skydome ON + black ON
- skydome ON + background media ON
- HDRI background ON + background media ON
- HDRI visible OFF + environment lighting ON
- project load 中に skydome を復元した後、画像読込が再び skydome を OFF にする

### 現行の照明

- directional light intensity: `1.0`
- hemispheric light intensity: `0.0`
- scene ambient color: `(0.5, 0.5, 0.5)`
- PMX/PMD: `MmdStandardMaterial`
- ground / skydome: `StandardMaterial`

`MmdStandardMaterial` は babylon-mmd の `StandardMaterial` 拡張である。Babylon.js の `scene.environmentTexture` は PBR 向けのシーン共通環境であり、StandardMaterial 系へ自動で同じ IBL を適用する仕組みではない。

つまり、HDRI を `scene.environmentTexture` へ設定しただけでは次のようになる可能性が高い。

| 対象 | 想定される影響 |
| --- | --- |
| PMX / PMD | 基本の MMD shading はほぼ現状のまま |
| `.x` / StandardMaterial 系 | 自動 IBL は基本なし |
| GLB / PBRMaterial 系 | 間接光・反射が変わる |
| BackgroundMaterial の空 | `reflectionTexture` を与えた場合に HDRI を表示 |

MMD 編集を主目的にする現在の優先度では、この非対称性をデフォルトへ持ち込むのは慎重に扱うべきである。

## Babylon.js 公式機能の確認

調査対象は、リポジトリで固定している `@babylonjs/core 9.2.0` のローカル型定義・実装と、2026-07-20 時点の公式ドキュメントである。

### BackgroundMaterial

公式 API は `BackgroundMaterial` を「scene の周囲に効率的な environment を作るための background material」としている。

主な機能:

- `primaryColor`
- `reflectionTexture`
- `reflectionBlur`
- `enableNoise`
- image processing 連携
- light / shadow 対応
- `enableGroundProjection`
- sky と ground の Fresnel / mirror 用設定

`reflectionBlur` は既存 HDR texture の別 LOD を使い、背景用のぼかしを作る用途を想定している。`enableNoise` は背景の banding 低減用である。

公式:

- [BackgroundMaterial API](https://doc.babylonjs.com/typedoc/classes/BABYLON.BackgroundMaterial)
- [Skyboxes / Ground Projection](https://doc.babylonjs.com/features/featuresDeepDive/environment/skybox)

判断:

- 現行 StandardMaterial skydome の置き換え先として自然。
- 単色を出すだけなら現行 StandardMaterial と見た目の差は小さい。
- HDRI、blur、banding 対策、将来の background preset へ広げる場合に価値が出る。
- `enableGroundProjection` は既存 grid ground と役割が競合するため、デフォルトでは使わない。

### scene.createDefaultSkybox()

Babylon.js 9.2.0 の helper は、渡した environment texture を使って box と StandardMaterial または PBRMaterial を作る。

注意:

- 既定では、渡した texture を `scene.environmentTexture` にも設定する。
- `setGlobalEnvTexture = false` で分離できる。
- `BackgroundMaterial` を使う helper ではない。
- MMD_modoki では背景表示と環境照明を明示的に分けたいので、暗黙の global 設定は避けたい。

判断:

- 小さいデモには便利だが、今回の state ownership には直接使わない方が分かりやすい。

### scene.createDefaultEnvironment() / EnvironmentHelper

`EnvironmentHelper` は次をまとめて作る。

- `BackgroundMaterial` の skybox
- `BackgroundMaterial` の ground
- ground shadow / optional mirror
- environment texture
- exposure
- contrast
- tone mapping

既定アセットは Babylon.js の asset URL を使う。

MMD_modoki にはすでに次がある。

- grid ground
- shadow generator
- mirroring floor
- Classic / FrameGraph の image processing / PostFX
- 独自の background image / video
- offline で動く Electron package

そのため helper を丸ごと採用すると、床の二重化、画像処理の上書き、外部 CDN 依存、dispose ownership の曖昧化が起きやすい。

公式:

- [EnvironmentHelper API](https://doc.babylonjs.com/typedoc/classes/BABYLON.EnvironmentHelper)
- [HDR Environment](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/HDREnvironment)

判断:

- helper の構成は参考にする。
- 実装時は既存 skydome mesh と既存 scene state に必要な要素だけを明示的に組み込む。

### HDR と ENV

Babylon.js 公式は、IBL 用には prefiltered mipmap を持つ `.env` または `.dds` を推奨している。

raw `.hdr` / `.exr` も `HDRCubeTexture` / `EXRCubeTexture` で読み込めるが、load 時に cubemap 化と prefilter を行うため遅延が発生する。公式も runtime 性能のため `.env` または `.dds` を優先している。

`.env` には主に次が含まれる。

- prefiltered cubemap の mip chain
- spherical polynomial / harmonic 情報
- RGBD ベースの HDR データ
- JSON manifest

公式の例では 512px cube が約 3MB とされ、未packの約32MBより小さい。実サイズは素材と圧縮結果による。

判断:

- bundled default は `.hdr` ではなく、オフライン変換済み `.env` を第一候補にする。
- raw `.hdr` はユーザー読込や比較検証用候補に留める。
- `src/assets/ibl-shadows/white.hdr` は手続き生成の診断用アセットとして残す。2026-07-23以降の既定IBLはCC0 TrueHDRIの2K派生版だが、どちらもデフォルト空の絵作りには使わない。

公式:

- [Using An HDR Environment For PBR](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/HDREnvironment)
- [Babylon.js Texture Library](https://doc.babylonjs.com/toolsAndResources/assetLibraries/availableTextures)

## 選択肢比較

| 案 | 見た目 | MMD 材質への影響 | 実装・運用 | 判断 |
| --- | --- | --- | --- | --- |
| A. 現行 neutral StandardMaterial | 作業用として安定、やや空虚 | なし | 最小 | baseline として残す |
| B. neutral BackgroundMaterial | A とほぼ同じ。noise 等を追加可能 | なし | 小 | 将来拡張の土台として有力 |
| C. HDRI を背景表示だけに使う | 空間感が出る | 直接の IBL なし。SSGI から間接的影響はありうる | 中 | 最初の visual PoC に向く |
| D. HDRI を背景 + `scene.environmentTexture` に使う | PBR では自然 | PMX/PMD と PBR で非対称 | 中〜大 | デフォルト採用はまだ早い |
| E. HDRI を照明だけに使い、背景は neutral | 作業背景は静か | PBR のみ変化しやすい | 中 | 特殊 preset 向け |
| F. `createDefaultEnvironment()` | Babylon 標準 demo 的 | lighting / PostFX / ground まで変わる | 導入は簡単だが競合大 | 不採用 |

## 推奨仕様案

### 1. 背景と環境照明を別 state にする

将来の project state は、少なくとも概念上は次のように分ける。

```text
background
  mode: neutral | black | media | hdri
  visible
  mediaPath
  hdriPath
  rotation
  blur
  intensity

environmentLighting
  enabled
  source: linkedHdri | builtinPreset | custom
  path
  rotation
  intensity
```

実際の型名や migration は実装時に詰める。

重要なのは、`black`、`neutral skydome`、`media`、`hdri` を同時 ON にできる boolean 群ではなく、背景表示を原則 1 つの mode として扱うこと。

### 2. visible background と lighting rotation は既定で連動する

同じ HDRI を表示と照明へ使う場合、太陽や窓の方向と反射・間接光の方向がずれると違和感が強い。

- 初期状態では同じ Y rotation を使う。
- 高度な用途で分離を許す場合も、UI 上は「背景と環境照明の回転を連動」を既定 ON にする。
- directional light も HDRI の主光源方向へ自動同期するかは別判断にする。PMX toon では light direction が編集結果へ強く影響するため、自動同期をデフォルトにはしない方がよい。

### 3. 近い PoC のデフォルト候補

キャラクター編集向け第一候補:

```text
background.mode = gradient
BackgroundMaterial.primaryColor = neutral tint
BackgroundMaterial.diffuseTexture = generated studio gradient
scene.environmentTexture = null
existing directional light = unchanged
existing ground = unchanged
```

HDRI 候補:

```text
background.mode = hdri
background asset = bundled neutral studio .env
BackgroundMaterial.reflectionTexture = env texture
BackgroundMaterial.reflectionBlur = low to medium
scene.environmentTexture = null
existing directional light = unchanged
existing ground = unchanged
```

背景表示用 texture は skybox 用の coordinates mode を明示する。将来同じ元アセットを環境照明にも使う場合は、背景用の clone / view と照明用 texture の ownership を分け、背景用設定で共有 texture の coordinates mode を書き換えない。

ただし次の条件を満たす素材を選ぶ。

- 低コントラスト
- 強い太陽、窓、色被りがない
- horizon が作業中に目立ちすぎない
- MMD モデルの toon light と矛盾しにくい
- blurred 表示でも banding や seam が目立たない
- 再配布可能なライセンス

fallback:

```text
background.mode = neutral
BackgroundMaterial.primaryColor = current neutral color
BackgroundMaterial.enableNoise = true
scene.environmentTexture = null
```

実機比較では、studio gradient と HDRI を同じキャラクターで比較する。HDRI は空間感が出る一方、光源や場所の情報が強く、MMD toon の見え方と競合することがある。studio gradient はキャラクターの輪郭と色を読みやすくしつつ、シーンの意味を限定しにくい。

neutral 単色は設定から選択できるようにし、texture load failure 時の最終 fallback にもする。

### 4. 環境照明は後続フェーズ

`scene.environmentTexture` を既定 ON にする前に、少なくとも次を決める。

- PMX/PMD を StandardMaterial のまま扱うか
- MMD toon に HDRI の diffuse / specular をどう混ぜるか
- GLB/PBR だけが IBL で明るくなる差を許容するか
- environment intensity と directional light intensity の役割
- toon shadow、self shadow、SSAO、SSGI との合成
- project save/load 互換

MMD 材質へ IBL を入れる場合も、PBRMaterial へ全面移行するより、MMD shading plugin 側へ制御された環境成分を足す方が MMD の見た目を保ちやすい可能性がある。これはデフォルト空の変更とは別タスクにする。

## FrameGraph / PostFX との注意

### Image Processing

`BackgroundMaterial` は scene の image processing configuration と連携する。HDRI の明部は exposure / tone mapping の影響を強く受ける。

MMD_modoki には Classic と FrameGraph の複数経路があるため、次を確認する。

- Classic と FrameGraph で背景の輝度・彩度が同程度か
- scene image processing と FrameGraph image processing が二重適用されないか
- tone mapping OFF の project で HDRI が白飛びしないか
- LUT / exposure / gamma の前後で背景とモデルの関係が破綻しないか
- PNG / WebM capture と viewport の結果が一致するか

### Depth / Geometry Buffer

現行 skydome は `disableDepthWrite = true` である。これは背景が scene depth を埋めず、SSAO / DoF / Offset 系へ巨大な遠方 geometry として入りにくくするためにも都合がよい。

`BackgroundMaterial` 化後も次を守る。

- 背景は depth receiver / occluder にしない
- picking 対象にしない
- mirror floor の render list に入れない
- shadow caster にしない
- Geometry Renderer / MRT の有効 depth として扱わない

### SSGI

現行の実験的 SSGI は、depth / normal を持たない skydome または背景色を distant environment sample として使う分岐を持つ。

そのため「HDRI を表示だけに使う」場合でも、SSGI ON では画面上の HDRI 色が PMX モデルへ間接的に色移りする可能性がある。特に高彩度・高輝度の HDRI は現行 neutral 背景より寄与が大きくなる。

確認項目:

- SSGI OFF では PMX shading が現状と一致する
- SSGI ON で HDRI の明部が白飛びや過剰な色移りを起こさない
- HDRI rotation と SSGI の screen-space sampling の見え方が不自然でない
- neutral / black / media / hdri の各 mode で SSGI fallback が安定する

関連:

- [FrameGraph SSGI Compute方式 実装解説](./framegraph-ssgi-compute-method-note-2026-07-19.md)
- [SSGI 設計メモ](./ssgi-design-note-2026-07-19.md)

## project 保存 / 読み込み

HDRI を実装する場合、最低限の保存候補:

- background mode
- background visible
- HDRI path または builtin preset id
- background rotation
- background blur
- background intensity
- environment lighting enabled
- environment lighting source
- environment rotation
- environment intensity
- background / lighting rotation link

互換方針案:

- 旧 project の `skydomeVisible = true` は `neutral` へ移行。
- 背景画像 / 動画 path がある旧 project は `media` を優先。
- `skydomeVisible = false` かつ media path なしは `background.visible = false` へ移行。
- 旧 project には黒背景保存値がないため、既定 neutral とする。
- builtin preset は absolute path ではなく stable id を保存する。
- custom HDRI は既存の画像 / 動画と同様に path 復元失敗を warning として扱い、neutral へ fallback する。

復元処理では、boolean を順番に適用するのではなく、asset load 完了後に canonical background state を一度適用する。

## アセット運用

- bundled default は CDN から runtime download しない。
- `.env` を package に含める。
- 元 HDRI の作者、入手元、ライセンス、変換条件を `src/assets/` 配下の README に残す。
- CC0 または再配布条件が明確な素材を優先する。
- 元 `.hdr` を package へ含める必要がなければ、変換済み `.env` だけを runtime asset にする。
- default asset の変更で package size、初回 texture upload、GPU memory がどれだけ増えるか計測する。
- texture load failure では app log に asset id / path / backend を残し、neutral background へ fallback する。

## 外部 HDRI 読込の最小仕様

### 対応形式

最初の対応候補:

| 拡張子 | Babylon.js 側 | 位置づけ |
| --- | --- | --- |
| `.hdr` | `HDRCubeTexture` | ユーザー素材として最優先 |
| `.env` | prefiltered `CubeTexture` | 高速な保存・配布用 |
| `.exr` | `EXRCubeTexture` | 対応可能だが、実機と decoder 負荷を確認してから公開 |

`.dds` は Babylon.js で利用できるが、圧縮形式、サイズ、生成条件のばらつきが大きいため、最初の UI filter には含めなくてよい。

raw `.hdr` / `.exr` は load 時に cubemap 化と prefilter が必要になる。大きいファイルでは UI を止めない非同期 load、進捗表示、atomic swap が必要。

### 読込時の挙動

```text
1. file dialog で HDRI を選ぶ
2. extension と file existence を検証
3. 新 texture を非同期で load / prefilter
4. 成功するまで現在の背景を維持
5. 成功後に background asset を atomic に差し替える
6. 古い custom texture は参照がなくなった時点で dispose
7. failure 時は現在の背景を維持し、toast + app log
```

外部 HDRI を読み込んでも、環境ライティングを自動 ON にしない。

- 初回既定: HDRI background ON / environment lighting OFF
- lighting OFF 中に読込: 新 HDRI を背景へ表示、lighting は OFF のまま
- lighting ON 中に読込: 新 HDRI へ差し替え、lighting は ON を維持
- custom HDRI を clear: bundled default HDRI へ戻す

### texture ownership

同じ source asset から、少なくとも概念上は次を分ける。

```text
environmentSourceTexture
  -> backgroundTextureView / clone
  -> lightingTexture
```

- 背景側だけ skybox coordinates mode、blur、表示 intensity を持つ。
- lighting 側は environment rotation、IBL intensity を持つ。
- 背景側の設定変更で lighting texture の coordinates mode や level を破壊しない。
- lighting OFF でも背景表示に必要な source texture は dispose しない。

### project 保存

- bundled default は stable preset id を保存する。
- custom HDRI は source path と format を保存する。
- `.hdr` / `.exr` を runtime prefilter した結果だけを一時保持しても、project には元 source path を保存する。
- custom path が見つからない場合は bundled default HDRI へ fallback し、warning を返す。
- 将来 project 内へ asset を同梱する場合は、absolute path 保存とは別の asset manifest が必要。

### platform 注意

Electron の local file URL と texture load は Windows / macOS / Linux で差が出る。既存の通常画像 texture と同様に path を直接組み立てず、共通の file URL 正規化経路を使う。

関連:

- [Mac / Linux file URL texture whiteout 調査](./mac-linux-file-url-texture-whiteout-2026-07-14.md)

### UI 案

既存の hidden HDRI dialog に近い構成を使える。

```text
背景設定...
  背景
    種類             HDRI | 単色 | 黒 | 画像/動画
    現在のHDRI       builtin-studio / filename.hdr
    HDRIを読み込む
    デフォルトへ戻す
    背景を表示       ON
    背景色           #ffffff
    背景の明るさ     1.00
    背景のぼかし     0.20
    背景の回転       0°

  環境ライティング
    有効             OFF
    環境光強度       1.00
    背景と回転を連動 ON
    環境光の回転     0°
```

「IBLな空」という内部の説明は分かりやすいが、UI 名は次のように分けた方が誤解が少ない。

- `HDRI背景`
- `環境ライティング`

環境ライティング OFF でも実験的 SSGI が背景色を拾う場合があるため、SSGI ON 時は「HDRI由来の色移りが完全にゼロ」とは表示しない。

## BackgroundMaterial のカスタム項目

`BackgroundMaterial` を採用する利点は、HDRI の表示だけでなく、単色 fallback と HDRI 背景の見え方を同じ設定画面で扱えることにある。

### ユーザーへ公開する項目

| UI | BackgroundMaterial / texture 側 | 用途 |
| --- | --- | --- |
| 背景色 | `primaryColor` | 単色空の色、HDRI の tint |
| 背景の明るさ | 背景用 texture の `level` または背景専用係数 | IBL 強度と独立した表示輝度 |
| 背景のぼかし | `reflectionBlur` | HDRI の情報量を抑え、作業背景へなじませる |
| 背景の回転 | 背景用 texture matrix / root rotation | horizon や明部の向き |
| 背景を表示 | skydome enabled | 背景だけを ON/OFF |
| デフォルトへ戻す | app 側 preset | 既定背景 preset と初期値へ戻す |

`primaryColor` は HDRI に対する乗算色としても使える。これにより、背景だけを青寄り、暖色寄り、低彩度などへ調整できる。

ただし UI の hex / RGB は人が見る sRGB 色として扱い、material へ渡すときの linear 変換方針を統一する。内部用の `_perceptualColor` は experimental API なので使わない。

### 背景と IBL を独立させる

次の 3 値は混ぜない。

```text
background tint
background brightness
environment lighting intensity
```

たとえば背景を夕方風に tint しても、IBL lighting の色を変えない設定を可能にする。背景色も照明へ連動させたい場合は、将来「背景の色補正を環境光にも適用」のような明示 toggle として追加する。

背景用 texture と lighting 用 texture が同じ instance だと、`level`、coordinates mode、rotation の変更が相互に漏れる。背景用 clone / view を使う設計は必須とする。

### 単色 / gradient mode

`BackgroundMaterial` には「上色 / 下色」の専用 property はない。gradient は小さい生成 texture を `diffuseTexture` として渡す構成が分かりやすい。

候補:

```text
solid
  primaryColor

gradient
  topColor
  horizonColor
  bottomColor
  horizonPosition
  softness
```

実装上は、これらの値から低解像度の縦 gradient texture を生成する。写真や HDRI より小さく、外部アセット、ライセンス、prefilter、texture load 待ちが不要である。

キャラクター向け preset 例:

- neutral gray
- cool studio
- warm studio
- light blue sky
- dark stage
- black

通常 UI は `上の色`、`下の色`、`境界の柔らかさ` 程度に抑え、3色目や horizon 位置は advanced または preset 内部値でもよい。

gradient は背景表示だけであり、IBL lighting を生成しない。SSGI が背景色を distant environment sample として拾う点は HDRI 背景と同じなので、SSGI ON 時の色移りは別途確認する。

### 詳細設定へ入れなくてよい項目

`BackgroundMaterial` にはほかにも多くの property があるが、MMD のデフォルト空では次を通常 UI に出さない。

- `reflectionFresnel`
- `reflectionReflectance0` / `reflectionReflectance90`
- `reflectionFalloffDistance`
- `opacityFresnel`
- `shadowLevel`
- `maxSimultaneousLights`
- `enableGroundProjection`
- `projectedGroundRadius` / `projectedGroundHeight`

これらは ground / mirror / shadow を含む背景構成向けの項目であり、既存 grid ground、mirror floor、shadow generator と責務が競合する。

`enableNoise` は banding 対策として app 側で既定 ON にしてもよいが、通常ユーザーが頻繁に調整する値ではない。実機で粒状感が見える場合だけ「背景ディザ」の advanced toggle として公開する。

### Popup の位置づけ

- 上部 toolbar は現在の背景表示 ON/OFF だけに留める。
- メニューバーの `背景設定...` から詳細 popup を開く。
- HDRI 読込、色、明るさ、blur、rotation、IBL は popup へ集約する。
- popup 内でも「背景」と「環境ライティング」を section 分離する。
- 色や slider は preview を即時反映し、cancel を設ける場合は open 前 state へ戻せるようにする。
- reset は「現在値を neutral にする」ではなく、「bundled default HDRI と既定 parameter へ戻す」と明記する。

## 実装する場合の段階案

### Phase 1: state と neutral background の整理

- 排他的な background mode を定義。
- 既存 skydome に `BackgroundMaterial` を試す。
- 現行 neutral 見た目を baseline として維持。
- black / media / skydome の優先順位を 1 箇所へ集約。
- project migration と pure helper test を追加。

### Phase 2: bundled HDRI を visual-only で比較

- 単色、生成 studio gradient、neutral studio `.env` を比較。
- gradient の top / bottom color、softness の最小 state を追加。
- HDRI は neutral studio `.env` を 1 つだけ用意。
- `BackgroundMaterial.reflectionTexture` に設定。
- blur / rotation / intensity の最小値を比較。
- `scene.environmentTexture` へは設定しない。
- neutral background と切り替えて PMX / PMD / `.x` / GLB を比較。

### Phase 3: 外部 HDRI 読込

- `.hdr` / `.env` の file dialog と loader を追加。
- `.exr` は実機負荷を確認して対応可否を決める。
- atomic swap、failure fallback、dispose ownership を確認。
- custom path の project round-trip を追加。
- 読込だけでは lighting を ON にしない。

### Phase 4: optional environment lighting

- background 表示とは別 toggle にする。
- PBR GLB への影響を先に確認。
- MMD material へ何も適用しない仕様なら UI に明記。
- MMD material へ環境成分を入れるなら、別の shader / material 調査として扱う。

### Phase 5: default tuning

次の比較で default を決める。

- neutral BackgroundMaterial
- blurred neutral studio HDRI
- HDRI + optional environment lighting

「綺麗に見える 1 モデル」だけで決めず、MMD 編集画面としての読みやすさを優先する。

## 手動確認マトリクス

| 項目 | neutral | black | image | video | HDRI visual | HDRI + lighting |
| --- | --- | --- | --- | --- | --- | --- |
| PMX model | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 |
| PMX stage / 巨大平面 | 必須 | - | 必須 | - | 必須 | 必須 |
| `.x` accessory | 必須 | - | - | - | 必須 | 必須 |
| GLB / PBR | 必須 | - | - | - | 必須 | 必須 |
| ground / shadow | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 |
| mirror floor | 必須 | - | - | - | 必須 | 必須 |
| Classic PostFX | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 |
| FrameGraph PostFX | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 |
| SSGI OFF / ON | 必須 | 必須 | 必須 | - | 必須 | 必須 |
| PNG / WebM export | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 |
| project round-trip | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 |

追加確認:

- 初回起動から `engine=WebGPU` まで到達する
- texture load 中に黒フレームや強い flash が出ない
- HDRI load failure で操作不能にならない
- background 切替後に古い texture / material / post-process が残らない
- background が depth、shadow、mirror、picking へ二重参加しない
- locale 切替後も mode 名と設定項目が同期する

## 判断保留点

- default を studio gradient にするか、blurred studio HDRI にするか
- studio gradient の色、horizon、softness
- bundled default HDRI の具体的な素材、blur、明るさ
- HDRI を常に bundled 1 種にするか、複数 preset にするか
- 背景 HDRI と directional light の向きを自動同期するか
- custom `.exr` を最初から公開対応にするか
- raw HDRI の prefilter cache を永続化するか
- MMDStandardMaterial に環境成分を足すか
- transparent background を正式 mode にするか

## 現時点の推奨

実装へ進む場合は、まず **Phase 1 の状態整理 + neutral fallback** を行い、その後 **Phase 2 で生成 studio gradient と bundled visual-only HDRI を比較**する。続けて **Phase 3 の外部 HDRI 読込**を追加する。

いきなり `scene.environmentTexture` をデフォルト設定する案は採らない。理由は、MMDStandardMaterial と PBRMaterial の非対称、既存 PostFX / SSGI への影響、背景と照明の state ownership が未整理だからである。

初期仕様案:

1. `BackgroundMaterial` ベースの単色 / studio gradient / HDRI mode
2. キャラクター編集時の default は studio gradient を第一候補
3. environment lighting は OFF
4. neutral `BackgroundMaterial` + noise は fallback / user preset
5. bundled HDRI と外部 `.hdr` / `.env` 読込を追加
6. HDRI 読込だけでは lighting を ON にしない

この仕様なら、キャラクター向けには軽い studio gradient、ステージや絵作り確認では HDRI を選べる。どちらも MMD toon lighting を勝手に変更せず、将来 IBL を有効化するときは HDRI source と rotation を再利用できる。

## 実装結果（2026-07-20）

第一段階として、デフォルト空を `StandardMaterial` から `BackgroundMaterial` へ変更した。初期表示はキャラクターを確認しやすいライトグレーの単色とし、studio gradient は設定から選択できる。

実装した範囲:

- デフォルト色はライトグレー `RGB(200, 200, 200)` / `#c8c8c8` の単色
- `BackgroundMaterial.enableNoise` を有効化して banding を軽減
- 背景設定 popup に `studio gradient / 単色`、上色、下色、明るさ、標準へ戻す操作を追加
- popup は「デフォルト空設定」に限定し、黒背景・背景画像・背景動画は既存のメニューバー操作へ分離
- `空を表示` / `床を表示` は混雑していた表示メニューから背景メニューへ移動
- gradient は小さい `DynamicTexture` を実行時生成し、外部画像を不要にした
- sphere の `V=0` が上端になるため、gradient texture は Y 反転せず upload して上色 / 下色を一致させる
- 背景 style を project の `viewport.skydomeBackground` に保存・復元
- 旧 project に項目がない場合はライトグレーの現行 default を適用
- 黒背景中は skydome を一時的に隠し、解除時にユーザー指定の skydome 表示状態へ戻す
- 既存の背景画像・背景動画の経路は維持

この段階では `scene.environmentTexture` を設定していないため、**IBL ライティングはデフォルト OFF のまま**である。`BackgroundMaterial` は見た目の背景だけを担当し、MMD material の照明は従来どおり directional / hemispheric light 側で扱う。

確認結果:

- pure helper / project round-trip を含む unit test: 29 files / 200 tests pass
- lint: pass
- critical typecheck: 新規 `TS2304` / `TS2552` なし（既存の非 critical error は残存）
- Electron smoke: `engine=WebGPU`, `physics=Bullet MPR` まで初期化 pass

次段では、この state ownership を維持したまま外部 `.hdr` / `.env` の visual background 読込を追加する。その後、背景表示とは別の明示 toggle として environment lighting を追加する。
