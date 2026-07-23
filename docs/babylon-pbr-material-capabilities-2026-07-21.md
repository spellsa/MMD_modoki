# Babylon.js PBR 材質で使える属性・表現

調査日: 2026-07-21

対象: `@babylonjs/core 9.2.0` / `babylon-mmd 1.2.0`

## 目的

Babylon.js の `PBRMaterial` で、標準機能だけで何を表現できるかを整理する。

特に `MMD_modoki` で今後追加する材質プリセットについて、次を判断するための基礎資料とする。

- `PBRMaterial` のプロパティ調整だけで実現できる表現
- シーン側の追加設定が必要な表現
- Material Plugin や独自シェーダーが必要な表現
- MMD 材質へ割り当てやすいプリセット候補

## 先に結論

Babylon.js の `PBRMaterial` は、一般的な metallic / roughness PBR に加えて、クリアコート、シーン、異方性、虹彩、屈折、半透過、画面空間 SSS まで持っている。キャラクター向けの「肌・髪・布・金属・ガラス」の土台は標準機能だけでもかなり揃っている。

一方、MMD の toon 段階、toon テクスチャを使った影色、sphere map 固有の合成、輪郭線は PBR の物理パラメータではない。これらを正確に再現するには `MaterialPluginBase`、カスタムシェーダー、または別パスが必要になる。

現在の方針としては、モデル全体を `PBR Standard` に統一し、材質ごとのプリセットで標準 PBR 機能を有効化していく構成が扱いやすい。

## PBR の基本ワークフロー

### Metallic / Roughness

現在の標準候補。主な値は次のとおり。

| 意味 | 主なプロパティ / テクスチャ | 備考 |
|---|---|---|
| ベース色 | `albedoColor`, `albedoTexture` | 非金属では拡散色、金属では反射色の基礎になる |
| 金属性 | `metallic`, `metallicTexture` | 0 が非金属、1 が金属。MMD キャラ材質は多くが 0 |
| 粗さ | `roughness`, `metallicTexture` | 0 が鏡面寄り、1 がマット |
| 金属反射色 | `metallicReflectanceColor`, `metallicReflectanceTexture` | F0 の細かい調整に使える |
| ベース寄与 | `baseWeight`, `baseWeightTexture` | Babylon.js 9.2.0 の `PBRMaterial` に存在 |
| 拡散粗さ | `baseDiffuseRoughness`, `baseDiffuseRoughnessTexture` | 粗い拡散面の調整 |

`metallicTexture` はチャンネルに複数の情報を詰める運用ができる。どのチャンネルを roughness / metallic に使うかは関連フラグで制御されるため、外部 PBR テクスチャを取り込む場合はチャンネル規約の確認が必要になる。

### Specular / Glossiness

Babylon.js の `PBRMaterial` は、従来型の specular / glossiness ワークフローも扱える。

| 意味 | 主なプロパティ / テクスチャ |
|---|---|
| 反射色 | `reflectivityColor`, `reflectivityTexture` |
| 光沢 | `microSurface`, `microSurfaceTexture` |
| 屈折率 | `indexOfRefraction` |

`microSurface` は roughness と向きが逆で、値が高いほど滑らかになる。metallic / roughness と specular / glossiness を同じプリセット内で曖昧に混ぜると調整意図が分かりにくくなるため、`MMD_modoki` では metallic / roughness を基本にした方がよい。

## 基本的な表面属性

| 表現 | 主なプロパティ | 用途と注意 |
|---|---|---|
| ベース色 | `albedoColor`, `albedoTexture` | 肌、髪、布など全般 |
| 法線 | `bumpTexture` | 法線マップ。`useObjectSpaceNormalMap` も選べる |
| 視差 | `useParallax`, `useParallaxOcclusion`, `parallaxScaleBias` | 凹凸の奥行き表現。ポリゴン輪郭は変化しない |
| AO | `ambientTexture`, `ambientTextureStrength` | 間接光の遮蔽。解析ライトへの影響も調整可能 |
| 発光 | `emissiveColor`, `emissiveTexture`, `emissiveIntensity` | LED、発光体。SSS の代用にはしない |
| ライトマップ | `lightmapTexture` | 焼き込み照明を持つ背景やアクセサリ向け |
| 両面照明 | `twoSidedLighting` | 薄い布や葉など。カリング設定とは別 |
| スペキュラ AA | `enableSpecularAntiAliasing` | 細かい法線の反射ちらつきを抑える |
| 水平線遮蔽 | `useHorizonOcclusion` | IBL 反射が形状の裏へ回り込むのを抑える |
| 放射遮蔽 | `useRadianceOcclusion` | AO を IBL の放射成分にも反映する |
| 非照明 | `unlit` | PBR の照明計算を使わない特殊用途 |

## 透明・切り抜き・屈折

PBR の透明処理と SSS は別機能である。

| 表現 | 主な設定 | 向いている対象 |
|---|---|---|
| 不透明 | `transparencyMode = 0` | 肌、一般的な服、通常の髪本体 |
| Alpha Test | `transparencyMode = 1`, `alphaCutOff` | 毛先、レース、葉など、境界を保ちたい材質 |
| Alpha Blend | `transparencyMode = 2` | 半透明ガラス、薄いエフェクト |
| Test + Blend | `transparencyMode = 3` | 切り抜きと半透明の両方が必要なテクスチャ |
| 不透明度テクスチャ | `opacityTexture` | アルファ専用マップ |
| 屈折 | `subSurface.isRefractionEnabled` | ガラス、液体、透明樹脂 |

毛先のようなテクスチャ境界は、単純な alpha blend より alpha test または test + blend の方が、深度・影・描画順を安定させやすい。肌に alpha blend を入れて SSS らしさを作る方法は不適切で、顔の奥や別メッシュが透ける原因になる。

## 高度な PBR レイヤー

### Clear Coat

塗装やワニスのように、ベース材質の上へ薄い鏡面層を追加する。

主な属性:

- `clearCoat.isEnabled`
- `clearCoat.intensity`
- `clearCoat.roughness`
- `clearCoat.indexOfRefraction`
- 強度・粗さテクスチャ
- 専用 bump texture
- tint color / thickness / tint texture

向いている対象は車体塗装、ニス、濡れた表面、目の表面など。肌全体へ強く使うとプラスチック感が出やすい。

### Sheen

布や微細繊維に見られる、斜め方向からの柔らかい反射層を追加する。

主な属性:

- `sheen.isEnabled`
- `sheen.intensity`
- `sheen.color`
- `sheen.roughness`
- `sheen.texture`, `sheen.textureRoughness`
- `linkSheenWithAlbedo`, `albedoScaling`

布、ベルベット、柔らかい髪の補助反射に向く。SSS より低リスクなキャラクター表現として先に試す価値がある。

### Anisotropy

反射ハイライトを方向に沿って伸ばす。髪、ブラシ金属、繊維に有効。

主な属性:

- `anisotropy.isEnabled`
- `anisotropy.intensity`
- `anisotropy.direction`
- `anisotropy.angle`
- `anisotropy.texture`

異方性は tangent space に依存する。モデルに適切な tangent がない、または髪の流れと tangent が一致していない場合は、期待した方向へハイライトが伸びない。

### Iridescence

見る角度や薄膜厚によって色が変わる干渉表現。

主な属性:

- `iridescence.isEnabled`
- `iridescence.intensity`
- `iridescence.indexOfRefraction`
- `minimumThickness`, `maximumThickness`
- 強度・膜厚テクスチャ

シャボン膜、真珠、ホログラム、昆虫の翅などに向く。

## Subsurface の4系統

Babylon.js では `material.subSurface` の中に複数の機能がまとまっているが、意味は同じではない。

| 機能 | スイッチ | 何が起きるか |
|---|---|---|
| Refraction | `isRefractionEnabled` | 背景や環境を屈折して透かす |
| Translucency | `isTranslucencyEnabled` | 薄い物体を光が通る寄与を計算する |
| Dispersion | `isDispersionEnabled` | 屈折光を波長方向に分離する |
| Scattering | `isScatteringEnabled` | pre-pass と画面空間ポスト処理で表面下散乱をぼかす |

重要なのは、`isTranslucencyEnabled` だけでは画面空間の SSS blur にならない点である。本来の散乱を使う場合は `isScatteringEnabled` とシーン側の SubSurface pre-pass が必要になる。

主な共通属性:

- `thicknessTexture`
- `minimumThickness`, `maximumThickness`
- `refractionIntensity`, `translucencyIntensity`
- `tintColor`, `tintColorAtDistance`
- `diffusionDistance`
- `indexOfRefraction`
- refraction / translucency intensity texture

### Scattering のシーン側条件

画面空間 SSS では材質設定だけでなく、概ね次が必要になる。

1. `scene.enableSubSurfaceForPrePass()` で SubSurface pre-pass を有効化する
2. シーンの `metersPerUnit` をモデルの実寸スケールに合わせる
3. diffusion profile をシーン設定へ登録する
4. 対象材質で `subSurface.isScatteringEnabled = true` にする

Babylon.js 9.2.0 のローカル実装では diffusion profile は最大 5 個である。また WebGPU 時には WGSL 版の SubSurface post process を選択する実装が入っている。

SSS は「透明度」ではなく、表面から入った光が周囲へ拡散して出る現象である。不透明な肌で後ろの目や髪が透ける場合は、SSS そのものではなく alpha mode、translucency/refraction、描画順、pre-pass の設定を疑うべきである。

画面空間 SSS は材質だけで完結せず、追加バッファとポスト処理を使う。画面外情報やメッシュ境界を完全には扱えず、モデルスケール、カメラ距離、pre-pass、透明材質との組み合わせでアーティファクトが出る可能性がある。

## ライティングと IBL

PBR では解析ライトと IBL が別経路で加算される。

| 項目 | 主な設定 | 役割 |
|---|---|---|
| 直接光 | `directIntensity` | Directional / Point / Spot などの拡散光 |
| 直接スペキュラ | `specularIntensity` | 解析ライトによるハイライト |
| 環境光 | `environmentIntensity` | IBL 全体の強度 |
| 発光 | `emissiveIntensity` | emissive の強度 |
| IBL | `scene.environmentTexture` または材質の `reflectionTexture` | 環境由来の反射・間接光 |

IBL には大きく二つの成分がある。

- radiance: 粗さに応じてぼける鏡面反射
- irradiance: 面全体を照らす拡散間接光

HDRI を背景に表示しただけでは IBL にならない。PBR 用に cube / prefiltered environment texture として設定され、材質側で反射が無効化されていないことが必要になる。

`forceIrradianceInFragment` を使うと irradiance を fragment 単位で計算でき、品質は上がるが負荷も増える。`environmentBRDFTexture`、`useHorizonOcclusion`、`useRadianceOcclusion` も IBL の見え方に関係する。

露出、トーンマッピング、コントラストは PBR 材質の強度とは別の image processing 層である。白飛びを直すときは、IBL 強度だけでなく exposure / tone mapping も分けて確認する必要がある。

## BRDF の調整項目

`material.brdf` では、標準 PBR の数式選択やエネルギー処理も調整できる。

- energy conservation
- Smith correlated visibility
- spherical harmonics
- specular / glossiness のエネルギー保存
- IBL radiance / irradiance の混合
- diffuse / specular モデルの選択

通常のプリセットではデフォルトを維持し、見た目の不具合を解決する目的で無闇に変更しない方がよい。これらは個別材質の質感というより、シーン全体の整合性に影響しやすい。

## babylon-mmd の PBR builder が現在行う変換

`babylon-mmd 1.2.0` の `PBRMaterialBuilder` を確認すると、主に次の変換を行っている。

- PMX diffuse RGB → `albedoColor`
- PMX specular RGB → `reflectionColor`
- PMX ambient RGB → `ambientColor`
- PMX alpha → `alpha`
- `metallic = 0`
- `roughness = shininess / 100`
- diffuse texture の読み込み

一方、同 builder の次の処理は空実装である。

- sphere texture
- toon texture
- outline properties

したがって、`babylon-mmd` の PBR builder を使っただけでは MMD Standard と同じ toon / sphere / outline 表現にはならない。また `shininess` から `roughness` への変換は MMD の値を物理的に厳密変換したものではなく、プリセット側で再調整する余地が大きい。

## プロパティだけでは難しい MMD 表現

次は標準 `PBRMaterial` のプロパティ調整だけでは正確に再現できない。

- toon テクスチャの段階的な明暗境界
- toon テクスチャ左下 1 px など、MMD 固有ルールによる影色取得
- 任意の shadow color を PBR の直接光へ合成する処理
- MMD sphere map の乗算 / 加算規則
- MMD 輪郭線
- PBR の拡散反射そのものを二値化・段階化する toon lighting

これらは SSS、emissive、ambient で近似すると副作用が出やすい。MMD 固有情報を保持したうえで、シェーダー計算の適切な位置へ差し込む方がよい。

## 標準機能を越える拡張方法

### Material Plugin

Material Plugin は、既存の `Material` に追加機能を装着するための Babylon.js 公式拡張機構である。新しい材質を一から作るものではなく、標準材質が組み立てる vertex / fragment shader の決められた挿入点へ処理を足す。

概念的には次の構造になる。

```text
PBRMaterial
  ├─ Babylon 標準の PBR / ライト / IBL / 影
  ├─ Clear Coat plugin
  ├─ Sheen plugin
  ├─ SubSurface plugin
  └─ MMD_modoki 独自 plugin
       └─ toon 色、段階影、追加テクスチャなど
```

実際に Babylon.js 9.2.0 の型定義を確認すると、標準の次の機能も `MaterialPluginBase` を継承して実装されている。

- `PBRClearCoatConfiguration`
- `PBRSheenConfiguration`
- `PBRAnisotropicConfiguration`
- `PBRIridescenceConfiguration`
- `PBRSubSurfaceConfiguration`

つまり Material Plugin は外部向けの簡易フックだけではなく、Babylon.js 自身が PBR の高度な機能を分割するためにも使っている仕組みである。

#### Plugin で追加できるもの

`MaterialPluginBase` の主なフックは次のとおり。

| フック | 追加・変更できるもの |
|---|---|
| `getCustomCode()` | vertex / fragment shader の挿入点へコードを追加する |
| `getUniforms()` | 色、強度、閾値などの uniform を追加する |
| `getSamplers()` | toon texture などの sampler を追加する |
| `getAttributes()` | 独自の vertex attribute を追加する |
| `prepareDefines()` | 機能の有無を shader define へ反映する |
| `bindForSubMesh()` | 描画時に uniform や texture を bind する |
| `isReadyForSubMesh()` | 必要なテクスチャ等が準備済みか判定する |
| `getActiveTextures()` / `hasTexture()` | 材質が所有・参照するテクスチャを Babylon 側へ知らせる |
| `serialize()` / `parse()` / `copyTo()` | plugin 設定の保存、復元、複製に対応する |

シェーダー構造を変えるオン・オフは define を更新して再コンパイルが必要になる。一方、色や強度のような uniform 値は、同じ shader variant のまま描画ごとに変更できる。この区別を守ると、UI スライダー操作のたびにシェーダーを作り直さずに済む。

#### 材質への付き方

通常は plugin のインスタンスを一つの材質へ付ける。材質ごとのプリセットに向く形である。Babylon.js には factory を登録し、登録後に生成される全材質へ plugin を付ける仕組みもあるが、`MMD_modoki` では対象外の床・背景・アクセサリまで影響させる危険があるため、個別割り当ての方が安全である。

複数 plugin を同じ材質へ付けることもできる。`priority` の小さい plugin から処理されるため、将来 `PBR Hair` と `MMD Toon` を併用する場合は、どの順序でコードが入るかを明示する必要がある。

#### MMD_modoki で有力な用途

材質を別クラスへ交換せず、現在の PBR の照明・IBL・影を維持したまま、次を追加できる可能性がある。

- PMX の toon texture を追加 sampler として渡す
- toon texture 左下の色を影色パラメータとして渡す
- `N dot L` に段階やカーブを加える
- PBR の拡散光の暗部だけを toon 色へ寄せる
- 影色の強度や彩度を uniform にして UI から調整する
- sphere texture の MMD 固有合成を追加する

この方法なら `PBR MMD Like` は独立したモデル全体モードではなく、「`PBR Standard` に MMD 固有 plugin と設定値を追加した材質プリセット」として整理できる。

#### できないこと・注意点

Material Plugin は何でも置き換えられる仕組みではない。

- 画面空間 SSS、Bloom、SSAO のような post process は plugin 単体では作れない
- シーン全体の pre-pass、環境テクスチャ、影生成器の設定は別途必要
- 透明描画の根本的なソート問題は shader 断片だけでは解決しない
- Babylon が用意した挿入点より外側の処理を変える場合は、正規表現置換または別 shader が必要になる
- 挿入点名や標準 shader 内部の変化は Babylon.js 更新時の回帰点になる

`getCustomCode()` は shader language を受け取る。WebGPU を使う本アプリでは、少なくとも WGSL を返す実装が必要で、WebGL fallback も維持するなら GLSL 版も用意する。`isCompatible()` で対応言語を明示し、未対応の backend へ誤って装着しないようにする。

plugin の追加や define 切替は shader variant を増やすため、モデルの全材質へ無条件に付けると初回コンパイル時間とメモリ使用量が増える。必要な材質だけを有効化し、強度 0 の表現は可能なら uniform で止める設計がよい。

#### 実装時に必要なアプリ側の管理

Material Plugin 自体に serialize / parse の仕組みはあるが、`MMD_modoki` では次を既存の材質プリセット状態と一緒に管理する必要がある。

- plugin 種別と有効状態
- toon 色、影強度、段階幅などのパラメータ
- 対象モデル・対象材質への割り当て
- プロジェクト保存 / 読み込み時の復元
- PBR Standard へ戻す際の無効化
- WebGPU / WebGL backend 切替時の shader 再構築
- 材質複製、モデル再読込、material morph との同期

実装を始める場合は、最初に「固定色を PBR の拡散暗部へ弱く加えるだけ」の小さい plugin で、IBL、直接光、影、alpha が壊れないことを確認する。その後、toon texture sampler と PMX 固有データを追加するのが安全である。

### PBRCustomMaterial

`PBRCustomMaterial` は PBR の既存計算へコードを差し込みやすいが、`@babylonjs/materials` の別パッケージである。公式資料では WebGPU 実行時も差し込みコードは GLSL とされており、WGSL-first の本アプリで長期運用する前に実機検証が必要になる。

### Node Material

Node Material Editor には PBR ブロックがあり、独自 BRDF や複雑な材質を視覚的に組める。WebGPU にも対応するが、既存 `PBRMaterial` のプロパティプリセットというより別の材質経路になる。

そのため、「読み込み済みの PBR 材質へプリセットを即時適用する」という現在の設計には Material Plugin の方が馴染みやすい。Node Material は将来、完全独立した実験材質を作る場合の候補とする。

## `MMD_modoki` 向けプリセット案

| プリセット候補 | 標準 PBR で先に試すもの | 追加条件 / リスク |
|---|---|---|
| PBR Standard | metallic 0、材質別 roughness、IBL | 現在の全体ベース |
| PBR MMD Like | まず Standard と同値 | toon 影色は Material Plugin を別工程で検証 |
| PBR Skin | Standard表面設定＋暖色Translucency | Translucency 0.12、材質IBL 0.35で比較中。画面空間Scatteringは暗化切り分けのため停止。Refraction / alpha変更なし |
| PBR Hair | roughness、sheen、anisotropy | tangent 品質の確認が必要 |
| PBR Cloth | 高 roughness、sheen | 薄布だけ translucency / SSS を限定適用 |
| PBR Metal | metallic、roughness、必要なら anisotropy | PMX 材質から自動判定しない方が安全 |
| PBR Eye | clear coat または低 roughness | 目本体とハイライト材質の分離に注意 |
| PBR Glass | alpha + refraction | 描画順、深度、背景テクスチャが必要 |
| PBR Pearl / Hologram | iridescence | 特殊用途として隔離する |

## 推奨する実装順

1. `PBR Standard` を復元可能な基準状態として固定する
2. roughness / metallic / sheen / clear coat など、材質だけで完結するプリセットを追加する
3. tangent を検査できるようにしてから Hair anisotropy を試す
4. alpha test / blend / refraction を材質種別ごとに分離する
5. SkinのTranslucency単独構成を実描画比較し、必要ならscene scaleとpre-passを診断しながらScatteringを再検討する
6. 最後に Material Plugin で MMD toon 色・段階影を実験する

SSS や MMD toon 合成を先に全材質へ入れると、透明度、pre-pass、影、IBL のどこが原因か切り分けにくくなる。まず標準 PBR 属性で作れるプリセットを小さく積み上げる方がよい。

## 参照した一次情報

- [Babylon.js: Mastering PBR Materials](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/masterPBR/)
- [Babylon.js: PBRMaterial API](https://doc.babylonjs.com/typedoc/classes/BABYLON.PBRMaterial)
- [Babylon.js: PBRSubSurfaceConfiguration API](https://doc.babylonjs.com/typedoc/classes/BABYLON.PBRSubSurfaceConfiguration)
- [Babylon.js: Material Plugins](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/materialPlugins/)
- [Babylon.js: MaterialPluginBase API](https://doc.babylonjs.com/typedoc/classes/BABYLON.MaterialPluginBase)
- [Babylon.js: PBR Custom Material](https://doc.babylonjs.com/toolsAndResources/assetLibraries/materialsLibrary/customMat)
- [Babylon.js: Node Material PBR](https://doc.babylonjs.com/features/featuresDeepDive/materials/node_material/NMEPBR)
- ローカル `node_modules/@babylonjs/core/Materials/PBR/*.d.ts`
- ローカル `node_modules/@babylonjs/core/Materials/materialPluginBase.d.ts`
- ローカル `node_modules/@babylonjs/core/Rendering/subSurfaceConfiguration.js`
- ローカル `node_modules/babylon-mmd/esm/Loader/pbrMaterialBuilder.js`

## 関連メモ

- [PBR 材質モード実験メモ](./pbr-material-mode-experiment-2026-07-20.md)
- [IBL / 外部 HDRI 現行仕様・調査記録](./external-hdri-environment-lighting-2026-07-21.md)
- [MMD Material / Shader カスタマイズ幅メモ](./material-shader-customization-guide.md)
