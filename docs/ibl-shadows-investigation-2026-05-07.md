# IBL Shadows 検討メモ 2026-05-07

## 目的

Babylon.js 9 系で追加された `IblShadowsRenderPipeline` を、MMD_modoki の接地感補助として使えるか検討するためのメモです。

このメモでは、`CascadedShadowGenerator` による通常影や、半透明 shadow の dithering 問題とは分けて、IBL Shadows 単体の前提、現状実装、確認済みの問題、次の検証順を整理します。

## 参照

- Babylon.js 9 紹介記事  
  https://blogs.windows.com/windowsdeveloper/2026/04/02/part-3-babylon-js-9-0-openpbr-and-additional-engine-updates/
- Babylon.js IBL Shadows 公式ドキュメント  
  https://aka.ms/babylon9IBLSDoc
- ローカル実装  
  `node_modules/@babylonjs/core/Rendering/IBLShadows/`

## 公式機能としての前提

`IblShadowsRenderPipeline` は、IBL 向けの voxel based shadow rendering pipeline です。

主な構成:

- `GeometryBufferRenderer`
- IBL CDF generator
- voxel grid
- voxel tracing pass
- spatial blur pass
- accumulation pass
- material plugin による shadow texture の合成

重要な API:

- `addShadowCastingMesh(mesh)`
- `clearShadowCastingMeshes()`
- `addShadowReceivingMaterial(material?)`
- `clearShadowReceivingMaterials()`
- `updateSceneBounds()`
- `updateVoxelization()`
- `toggleShadow(enabled)`
- `shadowOpacity`
- `voxelShadowOpacity`
- `ssShadowOpacity`
- `ssShadowDistanceScale`
- `ssShadowThicknessScale`
- `resolutionExp`
- `sampleDirections`
- `allowDebugPasses`
- `gbufferDebugEnabled`
- `voxelDebugEnabled`
- `voxelTracingDebugEnabled`
- `spatialBlurPassDebugEnabled`
- `accumulationPassDebugEnabled`

## 現在の実装

対象ファイル:

- `src/mmd-manager.ts`
- `src/mmd-manager-x-extension.ts`
- `src/assets/model-asset-service.ts`
- `src/ui-controller.ts`
- `index.html`
- `src/project/project-serializer.ts`
- `src/project/project-importer.ts`
- `src/types.ts`

検証用アセット:

- `src/assets/ibl-shadows/white.hdr`
  - Radiance HDR
  - `1024 x 512`
  - 単色ベース + 弱いグラデーション

現在の方針:

- 既存の `PCF + CascadedShadowGenerator` は維持する
- `IBL接地影` UI が ON のときだけ `IblShadowsRenderPipeline` を生成する
- `IBL影濃度` は `shadowOpacity` に対応する
- `IBL影範囲` は `ssShadowDistanceScale` に対応する
- モデル/アクセサリ読み込み、削除、表示切替、transform 更新時に `syncIblShadowsScene()` を呼ぶ
- PMX の skinned mesh は IBL shadow caster から除外する
- 起動時に `white.hdr` を `HDRCubeTexture` として `scene.environmentTexture` に設定する
- `scene.environmentTexture` がそれでも未設定の場合は、仮のニュートラルな `RawCubeTexture` を fallback として入れる

現在の初期値:

- `resolutionExp = 5`
- `sampleDirections = 2`
- `shadowOpacity = 0.25`
- `shadowRenderSizeFactor = 0.5`
- `shadowRemanence = 0.85`
- `ssShadowsEnabled = true`
- `ssShadowSampleCount = 8`
- `ssShadowStride = 8`
- `ssShadowDistanceScale = 4`
- `triPlanarVoxelization = true`
- `voxelShadowOpacity = 1`

## 現状実装で怪しい点

### 1. 実環境マップがない

当初の MMD_modoki には、実 HDR/ENV/DDS を `scene.environmentTexture` に読み込む導線がありませんでした。

2026-05-07 に、検証用の `white.hdr` を `HDRCubeTexture` で読み込み、`scene.environmentTexture` に設定する暫定実装を追加しました。`smoke:launch` では `IBL test environment texture loaded` まで確認済みです。

ただし `white.hdr` は単色ベースの検証用アセットです。pipeline の読み込み確認には使えますが、IBL Shadows の方向性や接地影の見え方を判断するには弱いです。

IBL Shadows は IBL の重要度サンプリングを前提にしているため、まず実環境マップを読み込んだ状態で確認する必要があります。

検討事項:

- `.env` / `.hdr` / `.dds` のどれを最初の対象にするか
- ステージや背景画像とは別に、照明用 environment texture を持つか
- UI 上は `空` / `背景` / `IBL` のどこに置くか
- project 保存で environment map path を持つか

### 2. PMX skinned mesh を shadow caster にするのが危険

WebGPU + PMX skinned mesh を IBL shadow caster にした場合、voxelization shader で `matricesWeights` に関する `Invalid ShaderModule` が出るケースを確認しました。

推定:

- IBL Shadows voxelizer は独自 `ShaderMaterial` を使う
- babylon-mmd の PMX skinned mesh / SDEF / WebGPU vertex input と相性が悪い可能性がある
- 通常 shadow map と同じ感覚で PMX を caster に入れると壊れやすい

現状対策:

- `mesh.skeleton` を持つ mesh は IBL shadow caster から除外している

検討事項:

- まず静的ステージ/アクセサリだけで IBL Shadows の成立を確認する
- PMX 本体を caster にするのは後回しにする
- どうしてもキャラ由来の IBL shadow が欲しい場合、低解像度 proxy mesh や capsule/foot proxy を検討する

### 3. WebGPU の r32float mipmap validation error

PMX skinned mesh を除外しても、WebGPU 側で以下のような validation error が出るケースを確認しました。

```text
None of the supported sample types (UnfilterableFloat) ... r32float ... match the expected sample types (Float).
```

Babylon.js 9.2.0 の `iblShadowsVoxelRenderer` を見ると、WebGPU 経路では voxel grid / mipmap 生成に float texture を使っています。

可能性:

- 使用 GPU / Chrome WebGPU 実装の texture filtering 制約
- Babylon.js 9.2.0 側の WebGPU IBL Shadows 実装の制約または不具合
- 現在の pipeline option が WebGPU で未成熟な経路を踏んでいる
- `resolutionExp` や mipmap 関連で回避可能な設定がある

検討事項:

- WebGPU と WebGL の比較
- `resolutionExp` を 3..6 で比較
- `shadowRenderSizeFactor = 1.0` で比較
- `ssShadowsEnabled` の ON/OFF 比較
- debug pass で voxel grid まで生成できているか確認

### 4. debug pass を使っていない

`IblShadowsRenderPipeline` には debug pass が用意されています。

見るべきもの:

- `gbufferDebugEnabled`
- `voxelDebugEnabled`
- `voxelTracingDebugEnabled`
- `spatialBlurPassDebugEnabled`
- `accumulationPassDebugEnabled`
- `cdfDebugEnabled`

現状は見た目と console error だけで判断しているため、どの段階で破綻しているかが分かりません。

検討事項:

- 一時的な debug UI を追加する
- もしくは開発用 hotkey / localStorage flag で debug pass を切り替える
- debug pass は通常 UI には出さず、調査用に隔離する

## 検証順案

### 実装前の整理手順

IBL Shadows は複数 pass と環境マップに依存するため、見た目だけで一気に調整しない。
まず次の順に分けて検証する。

1. 現状差分の整理

   - `キャラ接地影` は IBL Shadows とは別実験として扱う
   - IBL Shadows 本体、HDR 環境マップ、debug 導線を分ける
   - このメモを IBL Shadows 作業の中心ドキュメントにする

2. 環境マップ読み込みの安定化

   - まず `src/assets/ibl-shadows/white.hdr` を固定 bundled asset として使う
   - 次に任意 HDR/ENV を選べる導線を検討する
   - `scene.environmentTexture` と skybox 表示は分離する
   - project 保存対象にするかは後で判断する

3. 静的 caster だけで成立確認

   - PMX skinned mesh はまだ caster にしない
   - 床、ステージ、`.x` / GLB アクセサリなど静的 mesh だけで確認する
   - `updateSceneBounds()` と `updateVoxelization()` の呼び出しタイミングを整理する
   - `voxelGridSize` をログに出す

4. debug pass 導線の追加

   - `allowDebugPasses`
   - `gbufferDebugEnabled`
   - `voxelDebugEnabled`
   - `voxelTracingDebugEnabled`
   - `spatialBlurPassDebugEnabled`
   - `accumulationPassDebugEnabled`
   - 通常 UI ではなく、開発用 hidden UI または localStorage flag で切り替える

5. WebGPU error の切り分け

   - `resolutionExp = 3..6`
   - `shadowRenderSizeFactor = 1.0 / 0.5`
   - `ssShadowsEnabled` ON/OFF
   - 可能なら WebGPU と WebGL を比較する
   - `r32float` mipmap validation error が環境依存か設定依存か確認する

6. 見た目パラメータ調整

   - `shadowOpacity`
   - `voxelShadowOpacity`
   - `ssShadowOpacity`
   - `ssShadowDistanceScale`
   - `ssShadowThicknessScale`
   - `sampleDirections`
   - `shadowRemanence`
   - 既存の CSM 影と喧嘩しないよう、まず薄く自然な値から探る

7. PMX キャラ影は最後に扱う

   - PMX skinned mesh 直接 caster は後回し
   - 先に proxy mesh / foot proxy / capsule 方式を検討する
   - 直接 PMX caster が動くかどうかは別検証にする

8. UI と保存を固める

   - 安定するまでは `IBL接地影` は実験扱い
   - debug UI は通常ユーザー向けに出さない
   - project 保存は、最低限 `enabled`, `opacity`, `range`, `environmentMapPath` あたりを候補にする

### caster 対象の優先度

IBL Shadows の caster は、MMD_modoki での使用頻度と実装リスクを分けて考える。

優先度:

1. `.x` アクセサリ

   - GLB は現状読み込み導線が閉じているため、まず `.x` から見る
   - `.x` は既に読み込み、表示、transform、既存 shadow caster 登録の経路がある
   - PMX 本体より skinned / morph / SDEF の問題が少ない
   - MMD 用途ではステージ小物や背景アクセサリとして使用頻度が高い
   - ただし `.x` loader は独自実装なので、mesh 構造や material が Babylon 標準前提とずれる可能性はある

2. PMX ステージの skeleton なし mesh

   - MMD 用途として重要度が高い
   - 静的 mesh なら一度 voxelize して使い回せる可能性がある
   - PMX キャラより IBL Shadows と相性がよい可能性がある

3. PMX ステージの skeleton あり静的 mesh

   - PMX ステージでも skeleton を持つケースがあり得る
   - 実質静的なら caster にできる余地がある
   - `mesh.skeleton` だけで除外すると、ステージまで除外しすぎる可能性がある
   - ただし WebGPU の voxelization shader error を再発させる可能性があるため、debug pass ありで確認する

4. PMX キャラ proxy

   - PMX 本体を直接 caster にする前の逃げ道
   - 足元、胴体、髪などを低解像度 proxy / capsule / box で近似する
   - 接地感目的なら foot proxy だけでも効果がある可能性がある

5. PMX キャラ本体

   - 理想には近いが、現時点では最もリスクが高い
   - skinned mesh、morph、SDEF、物理変形、半透明材質、毎フレーム voxelization 更新が絡む
   - WebGPU + babylon-mmd の `matricesWeights` 系 shader validation error を再確認する必要がある

`.x` アクセサリ検証で見ること:

- voxel grid に `.x` mesh が入っているか
- 半透明材質や両面材質が不自然な影を作らないか
- transform 更新時に `updateSceneBounds()` / `updateVoxelization()` を呼ぶ頻度が妥当か
- 非表示、削除、親ボーン追従時に IBL caster が同期されるか
- 既存 CSM shadow caster と IBL caster の除外条件を混ぜすぎていないか

### Phase 1: 実環境マップなしの現状確認

- IBL Shadows ON/OFF
- PMX caster 除外状態
- 静的アクセサリ caster のみ
- console error の有無
- `voxelGridSize` のログ確認

目的:

- 現状の最小構成で、pipeline 自体が安定しているか確認する

### Phase 2: 実環境マップ導入

- まず固定の検証用 `.env` または `.hdr` を読み込む
- `scene.environmentTexture` に設定する
- skybox 表示とは切り離し、IBL Shadows 用の照明環境として扱う
- `envRotation` / environment texture rotation と影方向の関係を見る

目的:

- ダミー cube ではなく、IBL Shadows 本来の入力で確認する

### Phase 3: debug pass 追加

- `allowDebugPasses = true`
- GBuffer
- voxel
- voxel tracing
- spatial blur
- accumulation

目的:

- 影が出ない/局所的/汚い場合に、どの pass が原因か切り分ける

### Phase 4: caster 戦略

優先順:

1. 静的ステージ/アクセサリのみ
2. PMX 由来の簡易 proxy
3. PMX skinned mesh 本体

PMX 本体を直接 caster にするのは、WebGPU + babylon-mmd との相性確認が済むまで避ける。

### Phase 5: UI と保存

安定するまでは通常 UI に強く出しすぎない。

候補:

- 実験機能として `IBL接地影` を残す
- debug pass は hidden / dev-only
- environment map path は project 保存対象にするか検討

## 代替案との関係

`キャラ接地影` のような blob shadow / projected decal は、IBL Shadows の代替ではなく、別系統の逃げ道です。

IBL Shadows の調査目的:

- 室内ステージや静的アクセサリの環境影
- IBL と接地感の統合
- Babylon.js 9 公式機能の活用

blob shadow の目的:

- キャラクター足下の最低限の接地感
- WebGPU voxelization や環境マップに依存しない軽量表現

今後は、IBL Shadows の検証中に勝手に blob shadow 側へ方針転換しないよう、別タスクとして扱う。

## 現時点の判断

IBL Shadows は「使えない」と判断する段階ではありません。

ただし、現在の実装は次の点で不十分です。

- 実 environment texture を使っていない
- PMX skinned mesh を caster にする前提が強すぎた
- debug pass による切り分けがない
- WebGPU validation error の原因が未確定

次に進めるなら、まず environment map 導入方針と debug pass の調査導線を決めるのが妥当です。

## 2026-05-08 実装メモ: `.x` アクセサリ優先の IBL caster

IBL Shadows の caster 対象を、当面は `.x` アクセサリを優先して検証する方針に寄せた。

- `src/mmd-manager-x-extension.ts` に `getIblShadowAccessoryMeshes()` を追加した
- 返す対象は `.x` アクセサリのみ
- 非表示、無効、破棄済み、頂点数 0 の mesh は除外する
- GLB アクセサリは現時点では IBL caster から外す
- `src/mmd-manager.ts` の `collectIblShadowCastingMeshes()` は、通常の PMX/PMD 側の非 skinned mesh に加えて `getIblShadowAccessoryMeshes()` を使う

理由:

- GLB は現在 UI 導線が閉じているため、最初の検証対象にしない
- PMX skinned mesh は WebGPU + voxelization shader で validation error が出ているため、直接 caster 化は後回し
- `.x` アクセサリは MMD 用途で使用頻度があり、かつ skinned mesh 問題を避けやすい

確認したいこと:

- `.x` アクセサリを読み込んだときに `IBL Shadows scene bounds updated` / `IBL Shadows voxelization complete` が出るか
- `casterCount` が `.x` mesh 数を含んで増えるか
- `voxelGridSize` が極端に小さすぎないか、または大きすぎないか
- transform、表示切替、削除時に voxelization が同期されるか

## 2026-05-08 実装メモ: debug pass の隠し導線

通常 UI には出さず、localStorage で IBL Shadows の debug pass を切り替える導線を追加した。

キー:

```text
mmd_modoki.iblShadowDebugPasses
```

指定例:

```javascript
localStorage.setItem("mmd_modoki.iblShadowDebugPasses", "voxel");
localStorage.setItem("mmd_modoki.iblShadowDebugPasses", "gbuffer,voxel,tracing");
localStorage.setItem("mmd_modoki.iblShadowDebugPasses", "all");
localStorage.removeItem("mmd_modoki.iblShadowDebugPasses");
```

対応値:

- `gbuffer`
- `cdf`
- `voxel`
- `trace` / `tracing` / `voxel-tracing`
- `blur` / `spatial-blur`
- `accum` / `accumulation`
- `all`

目的:

- 影が出ない場合に、GBuffer、CDF、voxel、voxel tracing、blur、accumulation のどこで止まっているかを切り分ける
- 通常ユーザー向け UI を増やさず、調査中だけ有効化できるようにする

## 2026-05-08 実装メモ: WebGPU CDF fallback

`.x` アクセサリで IBL Shadows が出ることは確認できたが、WebGPU で以下の warning / validation error が大量に出た。

```text
None of the supported sample types (UnfilterableFloat) ... r32float ... match the expected sample types (Float).
create mipmaps for ... wmips_r32float ...
Invalid CommandBuffer from CommandEncoder
```

原因候補:

- Babylon.js 9.2.0 の `IblCdfGenerator` は `iblScaledLuminance` を `r32float + generateMipMaps` で生成する
- WebGPU では `r32float` が `UnfilterableFloat` 扱いになる環境があり、mipmap 生成時の bind group validation に落ちる
- 結果として `Queue.Submit` まで invalid になり、warning では済まない

暫定対応:

- WebGPU では IBL Shadows pipeline 生成前に `scene.environmentTexture` を 1x1 の白い `RawTexture` に一時差し替える
- その状態で `IblShadowsRenderPipeline` を生成し、`IblCdfGenerator` が `white.hdr` から `r32float + mipmap` を作り始める前に逃がす
- `scene.environmentTexture` を `white.hdr` のまま残して後から CDF だけ差し替える方式では、pipeline constructor 内で CDF 生成が先に走るため間に合わなかった
- これにより、環境マップ由来の重要度サンプリング精度は落ちるが、`r32float` mipmap validation error を避ける

検証用 escape hatch:

```javascript
localStorage.setItem("mmd_modoki.iblShadowUseEnvironmentCdf", "1");
localStorage.removeItem("mmd_modoki.iblShadowUseEnvironmentCdf");
```

`mmd_modoki.iblShadowUseEnvironmentCdf = 1` の場合は、元の environment texture を CDF 入力に使う。Babylon.js / Chromium / GPU driver 側の改善を試すときだけ使う想定。

## 2026-05-08 実装メモ: soft 寄りの IBL Shadows 設定

Babylon.js 公式サンプルのような柔らかい IBL shadow と比べると、MMD_modoki 側は硬い接触影に見えた。

原因候補:

- `ssShadowsEnabled = true` だと screen-space shadow が近距離で強く出る
- screen-space shadow は細部の接触を補うための成分なので、ふわっとした IBL shadow より硬く見えやすい
- WebGPU CDF fallback により、環境マップ由来の方向性や光量分布が失われている
- `.x` アクセサリ / PMX ステージは公式サンプルの PBR 単体オブジェクトよりスケールや材質がばらつく

soft 寄りに変更した初期値:

- `sampleDirections = 8`
- `shadowRenderSizeFactor = 0.35`
- `shadowRemanence = 0.9`
- `ssShadowsEnabled = false`
- `ssShadowStride = 12`
- `ssShadowDistanceScale = min(UI値, 2)`
- `voxelShadowOpacity = 1.0`

狙い:

- screen-space の硬い接触影を抑える
- voxel tracing + spatial blur + accumulation の柔らかい成分を前面に出す
- 公式サンプルのような影に近づくか確認する

## 2026-05-08 実装メモ: soft 設定後の薄さ調整

`ssShadowsEnabled = false` にすると硬い接触影は減るが、初期濃度 `iblShadowOpacityValue = 0.25` のままだと実用上ほぼ見えない。

そのため、soft 寄りの方針は維持しつつ、以下を変更した。

- `iblShadowOpacityValue = 0.6`
- `voxelShadowOpacity = 1.0`

意図:

- screen-space contact shadow の硬さは戻さない
- IBL shadow / voxel shadow 側の濃度だけ上げる
- 影が濃すぎる場合は UI の IBL 影濃度で下げる

## 2026-05-08 調査メモ: dynamic object との相性

Babylon.js 公式ドキュメント上でも、IBL Shadows は dynamic object には向きにくい旨が示されている。

MMD_modoki での確認結果とも整合する。

- `.x` アクセサリのような静的 mesh では影が出る
- ただし見た目は薄い、または接触影を足すと硬くなりやすい
- PMX キャラのような skinned mesh は voxelization と相性が悪く、WebGPU shader validation error も確認済み
- キャラはモーション、物理、SDEF、モーフで毎フレーム形状が変わるため、IBL Shadows の voxel 更新コストが重くなりやすい

現時点の判断:

- IBL Shadows は「静的ステージ / 静的アクセサリに環境由来の柔らかい影を足す」用途として調査を継続する
- PMX キャラの足下影を IBL Shadows で解くのは優先度を下げる
- キャラ接地影は、通常 shadow、contact shadow、blob shadow / projected decal など別系統の軽量表現も候補に戻す
- IBL Shadows の UI は実験機能として扱い、MMD 本体ワークフローの必須機能にはしない

## 2026-05-08 判断: IBL Shadows は凍結

ここまでの検証結果から、MMD_modoki では IBL Shadows を採用しない方針にする。

理由:

- MMD キャラの足下影という主目的に対して、dynamic object / skinned mesh との相性が悪い
- WebGPU では CDF / voxelization 周りで環境依存の validation error を踏みやすい
- `.x` アクセサリでは影が出るが、期待していた柔らかい接地影としては見え方が弱い
- 硬く見える screen-space shadow を足すと、IBL Shadows を使う意義が薄れる
- 実装と UI の複雑さに対して、MMD 編集体験への寄与が小さい

対応:

- `IBL_SHADOWS_EXPERIMENT_ENABLED = false` として、実行時には IBL Shadows pipeline を生成しない
- IBL Shadows 用の UI 行は非表示・無効化する
- 検証用 HDR environment map は自動ロードしない
- 調査メモと検証アセットは残し、Babylon.js 側の速度・WebGPU 対応改善が進んだ場合に再検討する

今後の接地影候補:

- 既存 CSM / 通常 shadow の調整
- キャラ足元用の軽量 contact shadow
- blob shadow / projected decal
- 足 IK / 足ボーン由来の proxy shadow
