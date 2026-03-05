# 光・影実装メモ（Toon分離 + フラット光）

このドキュメントは、現行の「光面/影面の分離」と「光色・影色制御」の実装をまとめたものです。  
対象コードは主に以下です。

- `src/mmd-manager.ts`
- `src/ui-controller.ts`
- `index.html`
- `src/index.css`

## 1. 全体構成

実装の流れは次の3段です。

1. UIフェーダー (`index.html` + `ui-controller.ts`)
2. ランタイム値保持 (`MmdManager` の getter/setter)
3. MMDマテリアルの toon 色 + シェーダーパッチ (`mmd-manager.ts`)

`MmdManager.patchMmdToonLightSeparationShader()` で、babylon-mmd の fragment コードを差し替えて、  
「影側の乗算」と「光側の加算」を分離しています（GLSL/WGSL 両方）。

## 2. UIパラメータと意味

### 光モードで使う項目

- `light-azimuth`, `light-elevation`
  - ディレクショナルライト方向
- `light-color-r/g/b`（0..255）
  - `ui-controller.ts` で `0..2` に正規化（`/127.5`）
  - `setLightColor(r,g,b)` に渡す

### 影モードで使う項目

- `light-intensity`（ラベルは「影の強さ」だが実体は dirLight intensity）
  - `0..200` -> `0..2`
- `light-shadow`
  - `shadowDarkness`（0..1）
- `light-shadow-color-r/g/b`
  - 0..255 -> 0..1 にして `setShadowColor`
- `light-toon-shadow-influence`
  - Toon影響度（0..1）

### 非表示だが値は有効な項目

- `light-flat-strength`（0..10% / 実値 0..0.1）
- `light-flat-color-influence`（0..1）
- `light-self-shadow-softness`
- `light-occlusion-shadow-softness`

これらは `light-row--always-hidden` を付与して常時非表示です。

## 3. toon色への割り当て

`applyToonShadowInfluenceToMeshes()` で材質へ反映しています。

- `toonTextureMultiplicativeColor = (lightR, lightG, lightB, lightFlatStrength)`
- `toonTextureAdditiveColor = (shadowR, shadowG, shadowB, toonShadowInfluence)`

実際のクランプ:

- 光色スケール: `0..2` (`clampLightColorScale`)
- 影色・Toon影響: `0..1` (`clampColor01`)
- 光面強度: setter側で `0..0.1`

## 4. シェーダー側の分離ロジック

`patchMmdToonLightSeparationShader()` で以下を注入しています（概念式）。

1. マスク生成
   - `selfMask = smoothstep(..., info.ndl)`
   - `occlusionMask = smoothstep(..., shadow)`
   - `litMask = smoothstep(..., selfMask * occlusionMask)`
   - `shadowMask = 1 - litMask`

2. 影面（乗算）
   - `toonShadowBand = mix(shadowTint, toonRaw, toonInfluence)`
   - `shadowTerm = info.diffuse * mix(1, toonShadowBand, shadowMask)`
   - `diffuseBase += shadowTerm`

3. 光面（加算）
   - `lightBoost = max(lightTint - 1, 0)`
   - `toonFlatLightMask = litMask * f(flatStrength, lightBoostEnergy)`
   - `toonFlatLightColor = lightBoost * g(flatStrength, lightFlatColorInfluence)`
   - `CUSTOM_FRAGMENT_BEFORE_FOG` で `color += toonFlatLightColor * toonFlatLightMask`

ポイント:

- 影は「ベース色に対する乗算」。
- 光は「別レイヤーの加算」。
- そのため、影面と光面を独立に扱えます。

## 5. 保存/復元される lighting 項目

プロジェクト保存 (`serializeProject`) には以下が入ります。

- `azimuth`, `elevation`
- `intensity`, `ambientIntensity`, `temperatureKelvin`
- `lightColor`
- `lightFlatStrength`, `lightFlatColorInfluence`
- `shadowColor`, `toonShadowInfluence`
- `shadowEnabled`, `shadowDarkness`
- `shadowEdgeSoftness`（旧互換）
- `selfShadowEdgeSoftness`, `occlusionShadowEdgeSoftness`

復元時 (`restoreProject`) は旧 `shadowEdgeSoftness` からのフォールバックにも対応しています。

## 6. UI表示制御の注意

`ui-controller.ts` の `applyLightMode()` は `.light-row--light` / `.light-row--shadow` に対して  
`light-row--hidden` を付け外しします。  
このため `hidden` 属性だけでは再表示されるケースがあり、常時隠したい項目は  
`.light-row--always-hidden { display:none !important; }` を使っています。

## 7. シェーダー修正時の注意（WGSL）

過去に頻発したエラー:

- `return FragmentOutputs` と関数戻り型不一致
- `let` 変数への再代入（WGSLは `let` 不変）
- 同名変数の再宣言
- 未定義変数参照（`toonFlatLightMask`, `emissiveColor` など）

安全に触る手順:

1. GLSL/WGSL 両方に同じ意味の変更を入れる
2. `CUSTOM_FRAGMENT_MAIN_BEGIN` の変数宣言追加漏れを防ぐ
3. `CUSTOM_FRAGMENT_BEFORE_FOG` 側の参照先変数を必ず一致させる
4. 変更後は WebGPU でモデル読込まで通して確認する

