# 影仕様と実装

このドキュメントは、PMX の影関連仕様と `MMD_modoki` 側の実装方針をまとめたものです。

関連:
- [光・影実装メモ（Toon分離 + フラット光）](./light-shadow-implementation.md)
- [影品質向上の検討メモ](./shadow-quality-investigation.md)

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
- 品質: `QUALITY_HIGH`
- 補間: `Contact Hardening`（`useContactHardeningShadow = true`）
- 接地感調整
  - `bias = 0.00015`
  - `normalBias = 0.0006`
  - `frustumEdgeFalloff = 0.2`
- 透明材質対応
  - `transparencyShadow = true`
  - `enableSoftTransparentShadow = true`
  - `useOpacityTextureForTransparentShadow = true`

`CascadedShadowGenerator` 使用時の設定:

- `numCascades = 4`
- `stabilizeCascades = true`
- `lambda = 0.72`
- `cascadeBlendPercentage = 0.05`
- `autoCalcDepthBounds = true`
- `shadowFrustumSize = 960`
- `shadowMaxZ = 4800`
- 光源位置距離: `220`
- フィルタは `PCF + QUALITY_HIGH`
- `Contact Hardening` は有効
  - ただし CSM では弱めに使う
  - `contactHardeningLightSizeUVRatio = max(0.008, min(0.016, effectiveSoftness * 0.25))`

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

## UI との関係

影設定は、材質フラグとは別に照明 UI で制御します。

- `index.html`
  - `#light-shadow`（影の濃さ、現状は非表示）
  - `#light-shadow-frustum-size`（影範囲）
  - `#light-shadow-softness`（境界幅 / contact hardening）
- `src/ui-controller.ts`
  - 起動時に `setShadowEnabled(true)` を適用（UI上は常時ON）
  - `shadowFrustumSize` の更新
  - `shadowEdgeSoftness` の更新

現在は UI 上では常時 ON で運用し、主に影範囲と境界幅を調整します。
`shadowDarkness` は内部値としては保持しますが、既定値 `0.0` で UI からは隠しています。

照明欄の初期値:

- 方向X: `0.3`
- 方向Y: `-0.5`
- 方向Z: `0.5`
- 光の強さ: `0.8`
- 影の濃さ: `0.0`（UI非表示）
- 影範囲: `220`

照明欄の制約:

- `shadowFrustumSize` の UI 上限は `6000`
- 範囲を広げるほど影密度は下がるため、必要以上に大きくしない方が見た目は安定しやすい
- 光方向は角度ではなく `X / Y / Z` ベクトルとして扱います
- `setLightDirection(x, y, z)` ではベクトルを正規化して `DirectionalLight.direction` に適用します
- `影範囲` フェーダーは現行 CSM 設定には影響しません

半影と境界グラデの扱い:

- 地面に落ちるキャストシャドウには、弱めの半影を入れます
- モデル表面の遮蔽影には、toon 側の境界グラデを入れます
- 現在の既定値
  - `selfShadowEdgeSoftness = 0.045`
  - `occlusionShadowEdgeSoftness = 0.06`

このため、現行仕様では次の見た目は意図通りです。

- 地面影の縁が少し柔らかい
- 遮蔽影の境界にわずかなグラデーションが入る

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
