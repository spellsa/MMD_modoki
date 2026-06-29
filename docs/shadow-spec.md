# 影仕様と実装

このドキュメントは、PMX の影関連仕様と `MMD_modoki` 側の実装方針をまとめたものです。

関連:
- [光・影実装メモ（Toon分離 + フラット光）](./light-shadow-implementation.md)
- [影品質向上の検討メモ](./shadow-quality-investigation.md)
- [セルフ影の横縞メモ](./self-shadow-horizontal-banding-note.md)
- [IBL Shadows 検討メモ](./ibl-shadows-investigation-2026-05-07.md)
- [Blob Shadow 接地影検討メモ](./blob-shadow-contact-plan-2026-05-08.md)

## PMX 材質フラグ（影関連）

PMX の材質フラグには、影に関するビットがあります。

- `0x02`: Ground Shadow（地面影）
- `0x04`: Draw Shadow（自己影用シャドウマップへ投影）
- `0x08`: Receive Shadow（自己影を受ける）

補足:
- PMX には「他モデルだけに影を落とす / 自己モデルだけに影を落とす」を分ける専用フラグはありません。
- そのため実運用では、レンダラ側の設計（シャドウマップの作り方）で挙動が決まります。

## 実装方針

`src/mmd-manager.ts` の `loadPMX` で、以下の流れで影設定を決定します。

1. 各モデルメッシュを一律で `shadow caster` に登録  
2. 各モデルメッシュを一律で `receiveShadows = true` に設定  
3. 地面も `receiveShadows = true` にして、モデル間/床への影を常時有効化

補足:
- 現在のディレクショナルライト影は、PMX 材質フラグで制限しません。
- 目的は「他モデル間」「床板ポリ」への影を確実に出すことです。
- `preserveSerializationData: true` は loader 側に残していますが、現行の影判定には使っていません。

## 実装ポイント

- モデル読込時に全メッシュへ
  - `shadowGenerator.addShadowCaster(...)`
  - `mesh.receiveShadows = true`
- 地面へ
  - `ground.receiveShadows = true`

## 影色（トゥーン色）

- モデル材質の `toonTexture` は PMX ローダーが設定した値をそのまま使用します。
- 以前のような共通グレースケール ramp への上書きは行いません。
- 読込後は `toonTexture` のサンプリングだけを `BILINEAR` にして、境界のジャギーを軽減します。
- `toonTexture` を持たない材質は、babylon-mmd の既定挙動（`ignoreDiffuseWhenToonTextureIsNull`）に従います。

## シャドウ生成設定

現在の実装は、ディレクショナルライト + `CascadedShadowGenerator` を優先し、
非対応環境では `ShadowGenerator` へフォールバックする方針です。

共通設定:

- マップ解像度: `min(8192, GPU上限)`
- フィルタ既定: `PCF`
- 品質: `QUALITY_MEDIUM`
- `Contact Hardening` / `Blur ESM` は既定では無効
- 接地感調整
  - `bias = 0.0005`
  - `normalBias = 0.01`
  - `frustumEdgeFalloff = 0.26`
- 透明材質対応
  - `transparentShadowEnabled = true`
  - `softTransparentShadowEnabled = true`
  - ON 時は `transparencyShadow = true` / `enableSoftTransparentShadow = true` / `useOpacityTextureForTransparentShadow = true`

補足:

- Babylon.js の soft transparent shadow は、fragment alpha を元に shadow map へ dithering pattern を生成する方式です。
- 公式 Shadows ドキュメントでも、PCF などの filtering を使っていても拡大時や対象によって pattern が見える場合があり、filtering method の比較が必要とされています。
- 現行の `CascadedShadowGenerator` は Babylon.js 実装上 `PCF / PCSS / None` 系の filter に制限されるため、Blur Exponential 系は通常の `ShadowGenerator` 時の実験項目として扱います。
- 2026-06 時点では、照明/影品質設定に `影ぼかし` / `半影` / `半影サイズ` / `透過影` を実験用に追加しています。
- `PCSS` は CSM を維持したまま `useContactHardeningShadow = true` を使う比較を行いましたが、半透明影の pattern は改善しませんでした。
- `Blur Exponential` は `useBlurExponentialShadowMap = true` を使う比較を行いましたが、CSM ではなくなるため、遠景や広いステージの影安定性が PCF より落ちました。

影フィルタ実験 UI:

- `半影` ON:
  - `filter = ShadowGenerator.FILTER_PCSS`
  - `半影サイズ` を `contactHardeningLightSizeUVRatio` に反映する
- `半影` OFF かつ `影ぼかし > 0`:
  - `filter = ShadowGenerator.FILTER_BLUREXPONENTIALSHADOWMAP`
  - `useKernelBlur = true`
  - `blurScale = 2`
  - `blurKernel = 影ぼかし`
- `半影` OFF かつ `影ぼかし = 0`:
  - `filter = ShadowGenerator.FILTER_PCF`
- `透過影` OFF:
  - `transparencyShadow = false`
  - `enableSoftTransparentShadow = false`
  - `useOpacityTextureForTransparentShadow = false`

`CascadedShadowGenerator` 使用時の設定:

- `numCascades = 2`
- `stabilizeCascades = true`
- `lambda = 0.82`
- `cascadeBlendPercentage = 0.05`
- `autoCalcDepthBounds = true`
- `shadowFrustumSize = 960`（固定）
- `shadowMaxZ = 1000`（既定値、UI で調整可能）
- 光源位置距離: `220`
- フィルタは `PCF + QUALITY_MEDIUM`

投影範囲の考え方:

- 通常 `ShadowGenerator`:
  - `dirLight.shadowFrustumSize = shadowMaxZ`
  - `dirLight.shadowMinZ = 1`
  - `dirLight.shadowMaxZ = shadowMaxZ`
- `CascadedShadowGenerator`:
  - `dirLight.shadowFrustumSize = 960`
  - `dirLight.shadowMinZ = 1`
  - `dirLight.shadowMaxZ = 1000`
- `dirLight.shadowMinZ = 1`

補足:

- 近景キャラと遠景背景で必要な影密度が異なるため、現行実装では `CascadedShadowGenerator` を優先します。
- 通常 `ShadowGenerator` では、UI の `影描画距離` が描画距離と投影範囲の両方を広げます。
- ただし `CascadedShadowGenerator` 使用時は、現行仕様では `影範囲` フェーダーを無視します。
- `shadowFrustumSize` は旧 project 互換の内部値として残していますが、標準 UI では直接操作しません。
- `shadowMaxZ` を遠くしすぎると、近景の自己影や床影に使える精度が薄まります。
- 描画限界まで影を出すより、「演出上ほしい距離まで」に絞る方が見た目は安定しやすいです。

## 2026-05 半透明影の調整メモ

### 問題

Babylon.js の `enableSoftTransparentShadow` は、半透明 fragment の alpha を shadow map 上の dithering pattern に変換する方式です。

そのため、透明な板・ガラス・フェンス状のアクセサリを床へ投影すると、影の面内に規則的な点/波模様が見えることがあります。今回の確認では、駅ステージ系アクセサリの透明面が床に落とす影で特に目立ちました。

### 試した設定

一時的に `影方式` UI を追加し、以下を比較しました。この UI は 2026-05 の確認後に撤去し、現在は `0 = PCF` 相当で固定しています。

- `0 = PCF`
  - `CascadedShadowGenerator` を維持
  - `usePercentageCloserFiltering = true`
  - 結果: 模様は残るが、影範囲・濃さ・ステージ全体の安定性は最もまし
- `1 = PCSS`
  - `CascadedShadowGenerator` を維持
  - `useContactHardeningShadow = true`
  - 結果: 半影風にはなるが、半透明 dithering pattern はむしろ荒れて見えるケースがあった
- `2 = Blur`
  - 通常 `ShadowGenerator` へ切り替え
  - `useBlurExponentialShadowMap = true`
  - `useKernelBlur` / `blurKernel` / `blurScale` / `blurBoxOffset` を調整
  - 結果: 模様は薄くなる方向だが、CSM を捨てるため広いステージで影範囲・濃さ・安定性が悪化しやすい

### 現時点の結論

広い背景ステージを扱う MMD 用途では、標準の影方式は `PCF + CascadedShadowGenerator` を維持するのが現実的です。

`PCSS` は比較用として残す価値はありますが、半透明影の dithering pattern を消す本命ではありません。`Blur Exponential` は Babylon 公式ドキュメント上も半透明 shadow の pattern を抑える候補ですが、このプロジェクトの主要用途では CSM を失う副作用が大きいです。

根本的に見た目を改善するなら、以下のような別方針を検討します。

- 半透明アクセサリを通常 shadow caster から外す
- 必要なアクセサリだけ、床向けの簡易ぼかし影を別パスで合成する
- 透明材質の影だけを弱める、または無効化する UI を追加する

現時点では、Babylon 標準 shadow filter の切替だけで「CSM を維持しつつ半透明 dithering を完全に消す」ことは難しいと判断します。

## 2026-05 IBL Shadows 試行

Babylon.js 9.2.0 には `IblShadowsRenderPipeline` が入っているため、接地感補助用の実験機能として `IBL接地影` UI を追加しました。

位置づけ:

- 既存の `PCF + CascadedShadowGenerator` は維持する
- IBL Shadows は、ディレクショナルライト影の置き換えではなく、室内ステージなどの接地感を補う別軸の影として扱う
- 既定は OFF
- ON 時のみ pipeline を生成する
- 環境テクスチャ未設定でも確認できるよう、暫定の低輝度 cube environment を作る
- `IBL影濃度` で `shadowOpacity` を調整する
- `IBL影範囲` で screen-space shadow の `ssShadowDistanceScale` を調整する

初期設定:

- `resolutionExp = 5`
- `sampleDirections = 2`
- `shadowRenderSizeFactor = 0.5`
- `shadowRemanence = 0.85`
- `ssShadowsEnabled = true`
- `ssShadowSampleCount = 8`
- `ssShadowStride = 8`
- `ssShadowDistanceScale = 4`
- `triPlanarVoxelization = true`
- `shadowOpacity = 0.25`

制約:

- `GeometryBufferRenderer` を使うため、通常の shadow map より描画負荷が高い可能性がある
- shadow caster を voxel grid に書く方式なので、動く PMX モデルの影を毎フレーム正確に追従させる用途には向かない
- 現行実装では、モデル/アクセサリ読み込み時や UI 操作時に voxelization を更新する。毎フレーム更新は行わない
- WebGPU + PMX スキニングメッシュでは、voxelization 用 shader が `matricesWeights` 入力を期待して `Invalid ShaderModule` になるケースを確認した
- そのため現行実装では、スケルトン付き mesh を IBL shadow caster から除外する
- 半透明 shadow の dithering pattern を消す機能ではない

2026-05-07 の追加判断:

- IBL Shadows は、MMD キャラクターの足元接地影を作る本命にはしにくい
- 使うなら、静的な室内ステージ/アクセサリの環境影確認に限定する
- キャラクター足元の接地感が目的なら、別途 blob shadow / projected decal / screen-space contact shadow のような軽い専用表現を検討する
- 現状の MMD_modoki には実 HDR/ENV の環境マップ読み込み導線はなく、IBL Shadows 有効時に確認用のニュートラル cube environment を生成しているだけです
- スキニング付き PMX を除外しても、WebGPU 側で `r32float` texture の mipmap 生成に関する validation error が残るケースを確認しました

## 2026-05 キャラクター接地影 PoC

IBL Shadows は足下影の本命にしにくいため、別軸の軽量 PoC として `キャラ接地影` UI を追加しました。

方式:

- 各 PMX モデルごとに、床面上へ半透明の radial gradient メッシュを置く
- モデルの hierarchy bounds から X/Z 中心とサイズを毎フレーム更新する
- 通常 shadow map、CSM、IBL Shadows、WebGPU voxelization には依存しない
- 影ではなく「接地感の補助表現」として扱う

UI:

- `キャラ接地影`: ON/OFF
- `接地影濃度`: 透明度
- `接地影サイズ`: bounds から計算する楕円サイズの倍率

制約:

- 本物の足ボーン投影ではなく、モデル全体 bounds ベースの簡易楕円です
- 浮遊ポーズではモデル下端と床の距離に応じて薄くします
- 階段や傾斜床、複数床面には未対応です
- 床以外のステージ面へ正確に投影する用途には向きません

確認観点:

- 室内ステージで接地感が増えるか
- FPS 低下が許容範囲か
- MMD Standard 材質やアクセサリ材質へ影受け plugin が問題なく入るか
- CSM 影、SSAO、Frame Graph post effects と併用して破綻しないか

2026-05-08 の追加判断:

- 欲しかった表現は、IBL Shadows より MME の `BlobShadow` 系に近い可能性が高い
- 目的は物理的に正しい環境影ではなく、真下方向へ落ちる薄くぼけた接地影
- 現行の `キャラ接地影` は radial gradient mesh だが、モデル全体 bounds ベースなので足元に追従する blob shadow とはまだ違う
- 次に改善するなら、足 IK / 足ボーン / モデル下端サンプルを使い、足元中心の複数楕円 shadow に寄せる
- 床面が明確な場合は projected decal / transparent ground mesh、複雑なステージ床では簡易表現として割り切る

## 2026-03 時点の実調整メモ

### セルフ影の横縞とシャドウアクネ

一部モデルでは、髪や衣装の曲面にセルフ影の細かい横縞が出ることがありました。
見え方としては `shadow acne` にかなり近く、まず `bias` / `normalBias` を疑うのが自然です。

今回の確認で有効だった判断基準:

- `bias` / `normalBias` を少し上げて縞が減るなら、`shadow acne` 系の可能性が高い
- ただし `bias` を上げすぎると、影が面から浮いたり、布の面がポリゴンっぽく見えやすくなる
- `normalBias` は `0.01` 付近までは実害が少なく、実運用値として扱いやすかった

今回の実運用上の落としどころ:

- `bias = 0.0005`
- `normalBias = 0.01`

補足:

- `bias = 0.002` 付近では、布面にポリゴン感や押し出し感が出やすかった
- `normalBias = 0.02` まで上げても、今回の残留縞には大差が出ないケースがあった
- つまり、残る縞のすべてが `bias` 系だけで解決するわけではない

### 遮蔽影・床影の縁のにじみ

床に落ちる影の縁がにじんで見える件では、`PCF` / `Contact Hardening` / `frustumEdgeFalloff` の影響を先に疑ったが、
実際には **CSM の depth 範囲精度** の影響が大きかった。

今回有効だったのは:

- `autoCalcDepthBounds = true`

これにより、足元の落ち影の縁はかなりくっきりした。

逆に、今回のケースで効きが薄かった項目:

- `useContactHardeningShadow`
- `frustumEdgeFalloff`
- `enableSoftTransparentShadow`

つまり、今回の「落ち影の縁のにじみ」は半影設定そのものより、`CascadedShadowGenerator` の深度範囲の取り方の問題だった。

### `shadowMaxZ` の考え方

`shadowMaxZ` は「どこまで影を計算するか」の距離であり、遠くするほど良いわけではありません。

- 値を大きくすると、遠景まで影は届く
- その代わり、近景の自己影や床影に割ける精度は落ちる
- そのため、描画限界よりも「演出上必要な距離」を基準に調整するのが自然

既定値は `1000` とし、影欄の `影描画距離` で調整できるようにしています。

## UI との関係

影設定は、材質フラグとは別に照明 UI で制御します。

- `index.html`
  - `#light-shadow`（影の濃さ、現状は非表示）
  - `#light-shadow-frustum-size`（影範囲）
  - `#light-shadow-max-z`（影描画距離）
  - `#light-shadow-bias`（現状は非表示）
  - `#light-shadow-normal-bias`（現状は非表示）
- `src/ui-controller.ts`
  - 起動時に `setShadowEnabled(true)` を適用（UI上は常時ON）
  - `shadowFrustumSize` の更新
  - `shadowMaxZ` の更新
  - `shadowBias` / `shadowNormalBias` は内部値として保持
- 情報欄
  - 選択中モデルごとに `影` チェックを持つ
  - チェック OFF のモデルは shadow caster から外す
  - 既定値は ON
  - プロジェクト保存 / 読み込みで `castsShadow` として復元する

現在は UI 上では常時 ON で運用し、主に影範囲と境界幅を調整します。
`shadowDarkness` は内部値としては保持しますが、既定値 `0.0` で UI からは隠しています。

照明欄の初期値:

- 方向X: `0.3`
- 方向Y: `-0.5`
- 方向Z: `0.5`
- 光の強さ: `0.8`
- 影の濃さ: `0.0`（UI非表示）
- 影範囲: `220`
- 影描画距離: `1000`
- 影ぼかし: `0`
- 半影: `OFF`
- 半影サイズ: `0.035`
- 透過影: `ON`
- Shadow Bias: `0.0005`（UI非表示）
- Normal Bias: `0.01`（UI非表示）

照明欄の制約:

- `shadowMaxZ` の UI 範囲は `500..100000`
- 範囲を広げるほど影密度は下がるため、必要以上に大きくしない方が見た目は安定しやすい
- 光方向は角度ではなく `X / Y / Z` ベクトルとして扱います
- `setLightDirection(x, y, z)` ではベクトルを正規化して `DirectionalLight.direction` に適用します
- `影範囲` フェーダーは現行 CSM 設定には影響しません

半影と境界グラデの扱い:

- 地面に落ちるキャストシャドウには、`PCF` による軽い柔らかさは残ります
- モデル表面の遮蔽影には、toon 側の境界グラデを入れます
- 現在の既定値
  - `selfShadowEdgeSoftness = 0.05`
  - `occlusionShadowEdgeSoftness = 0.05`

このため、現行仕様では次の見た目は意図通りです。

- 地面影の縁が少し柔らかい
- 遮蔽影とセルフ影の境界は同程度に柔らかい

逆に次のような出方は不具合候補です。

- 影の内部に帯状の段差が見える
- カスケード切替境界が見える
- カメラ距離で影の濃さが不自然に跳ぶ

## 既知の制限

- 現在は「全メッシュが影を落とす/受ける」方針です。  
  PMX 材質フラグによる細かな ON/OFF は使っていません。
- 「自己モデルにだけ影」「他モデルにだけ影」は PMX 材質フラグだけでは表現できません。
- Babylon.js の shadow caster 登録はメッシュ単位です。  
  そのため同一メッシュ内で材質ごとに完全分離された caster 制御はできません。
- ただし `babylon-mmd` 既定の `optimizeSubmeshes=true` では材質ごとにメッシュ分割されるため、
  実用上は材質単位に近い挙動になります。
- 影範囲を広げるほど、同じ解像度でも 1 ピクセルあたりの密度は下がります。  
  必要に応じて `shadowFrustumSize` と解像度のトレードオフ調整が必要です。
- `CascadedShadowGenerator` は近景と遠景で影品質を分けられますが、GPU コストは単一シャドウマップより重くなります。
- 現在の CSM 設定は近景品質と遠景カバーのバランスを優先した固定値です。
- ステージごとに最適値は異なるため、将来的には CSM 専用パラメータを UI へ分離する余地があります。
- 旧 project 読込時は、保存されている `shadowBias` / `shadowNormalBias` / `shadowMaxZ` に引っ張られることがあります。
