# 影仕様と実装

このドキュメントは、PMX の影関連仕様と `MMD_modoki` 側の実装方針をまとめたものです。

関連:
- [光・影実装メモ（Toon分離 + フラット光）](./light-shadow-implementation.md)
- [影品質向上の検討メモ](./shadow-quality-investigation.md)
- [セルフ影の横縞メモ](./self-shadow-horizontal-banding-note.md)

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
- フィルタ: `PCF`（`usePercentageCloserFiltering = true`）
- 品質: `QUALITY_MEDIUM`
- `Contact Hardening` は既定では無効（`useContactHardeningShadow = false`）
- 接地感調整
  - `bias = 0.0005`
  - `normalBias = 0.01`
  - `frustumEdgeFalloff = 0.26`
- 透明材質対応
  - `transparencyShadow = true`
  - `enableSoftTransparentShadow = true`
  - `useOpacityTextureForTransparentShadow = true`

`CascadedShadowGenerator` 使用時の設定:

- `numCascades = 2`
- `stabilizeCascades = true`
- `lambda = 0.82`
- `cascadeBlendPercentage = 0.05`
- `autoCalcDepthBounds = true`
- `shadowFrustumSize = 960`（固定）
- `shadowMaxZ = 4800`（既定値、UI で調整可能）
- 光源位置距離: `220`
- フィルタは `PCF + QUALITY_MEDIUM`

投影範囲の考え方:

- 通常 `ShadowGenerator`:
  - `dirLight.shadowFrustumSize = shadowFrustumSize`
  - `dirLight.shadowMinZ = 1`
  - `dirLight.shadowMaxZ = max(500, shadowFrustumSize * 6)`
- `CascadedShadowGenerator`:
  - `dirLight.shadowFrustumSize = 960`
  - `dirLight.shadowMinZ = 1`
  - `dirLight.shadowMaxZ = 4800`
- `dirLight.shadowMinZ = 1`

補足:

- 近景キャラと遠景背景で必要な影密度が異なるため、現行実装では `CascadedShadowGenerator` を優先します。
- UI の `影範囲` は従来 UI 互換のため残しています。
- ただし `CascadedShadowGenerator` 使用時は、現行仕様では `影範囲` フェーダーを無視します。
- `影範囲` フェーダーが有効なのは、非対応環境で `ShadowGenerator` にフォールバックした場合のみです。
- `shadowMaxZ` を遠くしすぎると、近景の自己影や床影に使える精度が薄まります。
- 描画限界まで影を出すより、「演出上ほしい距離まで」に絞る方が見た目は安定しやすいです。

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

既定値は `4800` とし、影欄の `影描画距離` で調整できるようにしています。

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

現在は UI 上では常時 ON で運用し、主に影範囲と境界幅を調整します。
`shadowDarkness` は内部値としては保持しますが、既定値 `0.0` で UI からは隠しています。

照明欄の初期値:

- 方向X: `0.3`
- 方向Y: `-0.5`
- 方向Z: `0.5`
- 光の強さ: `0.8`
- 影の濃さ: `0.0`（UI非表示）
- 影範囲: `220`
- 影描画距離: `4800`
- Shadow Bias: `0.0005`（UI非表示）
- Normal Bias: `0.01`（UI非表示）

照明欄の制約:

- `shadowFrustumSize` の UI 上限は `6000`
- `shadowMaxZ` の UI 範囲は `500..12000`
- 範囲を広げるほど影密度は下がるため、必要以上に大きくしない方が見た目は安定しやすい
- 光方向は角度ではなく `X / Y / Z` ベクトルとして扱います
- `setLightDirection(x, y, z)` ではベクトルを正規化して `DirectionalLight.direction` に適用します
- `影範囲` フェーダーは現行 CSM 設定には影響しません

半影と境界グラデの扱い:

- 地面に落ちるキャストシャドウには、`PCF` による軽い柔らかさは残ります
- モデル表面の遮蔽影には、toon 側の境界グラデを入れます
- 現在の既定値
  - `selfShadowEdgeSoftness = 0.05`
  - `occlusionShadowEdgeSoftness = 0.01`

このため、現行仕様では次の見た目は意図通りです。

- 地面影の縁が少し柔らかい
- 遮蔽影は比較的くっきり寄り
- セルフ影の境界は遮蔽影より少し柔らかい

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
