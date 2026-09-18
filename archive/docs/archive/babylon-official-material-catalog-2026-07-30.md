# Babylon.js 公式 Material カタログ

調査日: 2026-07-30

対象:

- `@babylonjs/core 9.2.0`
- 導入候補の `@babylonjs/materials 9.2.0`
- `MMD_modoki` の PMX / PMD、ステージ、アクセサリ、編集支援表示

## 目的

Babylon.js が公式に用意している Material を、次の 3 群に分けて一覧化する。

1. PBR シェーディングモデル
2. 非 PBR / 用途特化 Material
3. Material を作るための拡張・生成基盤

この分類でいう「PBR」は、単に反射や屈折があるという意味ではなく、物理ベースの
シェーディングモデルを採用した Material を指す。例えば `WaterMaterial` は反射・屈折を
行うが、`PBRMaterial` 系ではないため「非 PBR / 用途特化」に置く。

また、これは Babylon.js 公式機能の棚卸しであり、すべてを `MMD_modoki` に実装する計画ではない。

## 現在のプロジェクト条件

- `@babylonjs/core 9.2.0` は導入済み。
- `@babylonjs/materials` は未導入。
- PMX / PMD の通常経路は `babylon-mmd` の `MmdStandardMaterialBuilder` が中心。
- PBR モードでは `babylon-mmd` の `PBRMaterialBuilder` が `PBRMaterial` を生成する。
- `OpenPBRMaterial` は `PBRMaterial` とは独立した実験経路として扱う。
- `@babylonjs/materials` を試す場合は、最初は core と同じ `9.2.0` に固定する。

## 1. PBR シェーディングモデル

### `@babylonjs/core`

| Material | 概要 | MMD_modoki での位置づけ |
|---|---|---|
| `PBRMaterial` | Babylon.js の高機能 PBR。metallic / roughness と specular / glossiness、clear coat、sheen、anisotropy、iridescence、subsurface などを持つ | 現在の PBR モデル材質と材質プリセットの主経路 |
| `PBRMetallicRoughnessMaterial` | metallic / roughness に用途を絞った簡易 PBR API | GLB / glTF 的な小物には使えるが、既存 `PBRMaterial` 経路を置換する利点は小さい |
| `PBRSpecularGlossinessMaterial` | specular / glossiness に用途を絞った簡易 PBR API | 旧来の specular / glossiness アセット互換向け。新規プリセットの基準にはしない |
| `OpenPBRMaterial` | OpenPBR Surface のレイヤー構造を実装する独立 Material | 外部 GLB と将来の相互運用を試す実験枠。PMX / PMD を自動変換しない |

`PBRMaterial` 内の `clearCoat`、`sheen`、`anisotropy`、`iridescence`、`subSurface` は、
独立した Material ではなく、同じ `PBRMaterial` に追加する構成機能である。材質プリセットを
増やす場合は、まずこれらで表現できるかを確認する。

関連資料:

- [Babylon.js PBR 材質で使える属性・表現](./babylon-pbr-material-capabilities-2026-07-21.md)
- [PBR 材質モード実験メモ](./pbr-material-mode-experiment-2026-07-20.md)
- [Babylon.js OpenPBR と外部読込の調査](./babylon-openpbr-external-import-investigation-2026-07-21.md)
- [Babylon.js: Introduction to PBR](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/introToPBR/)
- [Babylon.js: OpenPBR material](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/OpenPBR/)

### PBR を基礎にする拡張

| 機能 | 基礎 | 用途 |
|---|---|---|
| `PBRCustomMaterial` | `PBRMaterial` | PBR shader の決められた箇所へコードを注入する |
| `MaterialPluginBase` を使う PBR plugin | 既存 `PBRMaterial` | PBR のライト、IBL、影、skinning、morph を保ちながら局所的に拡張する |
| `NodeMaterial` の PBR ブロック | node graph | PBR 構成をグラフで組む。既存 MMD 材質とは別 shader 経路になる |

`PBRCustomMaterial` と Material Plugin は完成済みの見た目を提供する Material ではなく、
独自材質を作るための基盤である。
なお、`PBRCustomMaterial` は core ではなく `@babylonjs/materials/custom` に含まれる。

## 2. 非 PBR / 用途特化 Material

### `@babylonjs/core`

| Material | 概要 | MMD_modoki での位置づけ |
|---|---|---|
| `StandardMaterial` | Babylon.js の標準的な非 PBR 材質 | GLB accessory の互換変換先などで使用 |
| `BackgroundMaterial` | skybox / ground 背景向け。環境反射、影受け、背景合成に特化 | HDRI 背景と床の候補。通常のモデル材質とは分ける |
| `GaussianSplattingMaterial` | Gaussian Splatting 描画専用 | 現在の MMD 本体用途からは外れる |
| `GreasedLineSimpleMaterial` | GreasedLine の軽量線描画専用 | ガイド、軌跡、編集 overlay の実験候補 |
| `OcclusionMaterial` | 高速な depth-only 描画用 | 通常の見た目用ではなく、内部レンダリング支援 |

`MultiMaterial` は submesh ごとに Material を束ねるコンテナで、独自のシェーディングモデルではない。
`PushMaterial` は各 Material 実装の基底クラスで、通常は直接割り当てない。

### `@babylonjs/materials` Material Library

Material Library は `@babylonjs/core` とは別パッケージである。

| Material | 主な用途 | 分類 | MMD_modoki での候補 |
|---|---|---|---|
| `WaterMaterial` | 波、風、バンプ、反射、屈折を持つ水面 | scene / stage | 水面アクセサリ。優先度は高めだが RTT 管理が必要 |
| `LavaMaterial` | 流動するノイズと発光風の溶岩 | effect / stage | 溶岩、魔法床、特殊ステージ |
| `FireMaterial` | diffuse、distortion、opacity texture を使う炎 | effect | 炎アクセサリ。粒子表現との比較が必要 |
| `SkyMaterial` | テクスチャ不要の動的な大気・空 | background | ステージ背景候補。既存 HDRI 背景とは排他的に扱う |
| `FurMaterial` | shell / layer を重ねる毛の表現 | model / prop | 負荷、skinning、輪郭、透明順を確認するまで低優先 |
| `CellMaterial` | 2 段階または多段階のセルシェーディング | model | MMD toon と比較できるが、PMX 材質の直接置換にはしない |
| `GradientMaterial` | 面上の色グラデーション | prop / effect | 背景、小物、演出用。比較的独立して試せる |
| `GridMaterial` | テクスチャ不要のグリッド | editor / stage | 編集床、スケール確認、デバッグ表示に有力 |
| `ShadowOnlyMaterial` | 受けた影だけを表示する透明材質 | stage / utility | MMD 床影、合成用の透明な影受けとして有力 |
| `NormalMaterial` | 法線方向を色として可視化 | diagnostic | PMX / accessory の法線診断用 |
| `SimpleMaterial` | 機能を絞った軽量な lit material | prop | 単純な編集 helper やステージ小物向け |
| `TerrainMaterial` | mix map で 3 組の地形 texture / bump を合成 | terrain | 大型ステージ専用。MMD 本体では低優先 |
| `MixMaterial` | mix map 2 枚で最大 8 枚の diffuse texture を合成 | terrain | 大型ステージ専用。bump 非対応などの制約あり |
| `TriPlanarMaterial` | UV を使わず X / Y / Z 軸から texture を投影 | terrain / prop | 岩、洞窟、地形向け。通常の PMX 材質には不要 |

`legacy` は互換 import 用の入口であり、独立した Material ではない。

公式資料:

- [Babylon.js Materials Library](https://doc.babylonjs.com/toolsAndResources/assetLibraries/materialsLibrary/)
- [npm: @babylonjs/materials](https://www.npmjs.com/package/@babylonjs/materials)
- [WaterMaterial API](https://doc.babylonjs.com/typedoc/classes/BABYLON.WaterMaterial)
- [Cell Material](https://doc.babylonjs.com/toolsAndResources/assetLibraries/materialsLibrary/cellShadingMat/)
- [Fur Material](https://doc.babylonjs.com/toolsAndResources/assetLibraries/materialsLibrary/furMat/)
- [Grid Material](https://doc.babylonjs.com/toolsAndResources/assetLibraries/materialsLibrary/gridMat/)
- [Mix Material](https://doc.babylonjs.com/toolsAndResources/assetLibraries/materialsLibrary/mixMat/)
- [Tri-Planar Material](https://doc.babylonjs.com/toolsAndResources/assetLibraries/materialsLibrary/triPlanarMat/)

## 3. Material を作るための拡張・生成基盤

| 基盤 | PBR / 非 PBR | 特徴 | 現在の判断 |
|---|---|---|---|
| `ShaderMaterial` | どちらも自作可能 | vertex / fragment shader を直接管理する | 自由度は高いが、skinning、morph、影なども明示的に扱う必要がある |
| `NodeMaterial` | どちらも構成可能 | Node Material Editor と node graph を使う | 独立した実験材質向け。MMD main path の置換にはしない |
| `CustomMaterial` | Standard 系 | `StandardMaterial` shader へコードを注入する | 非 PBR の小規模実験向け |
| `PBRCustomMaterial` | PBR 系 | `PBRMaterial` shader へコードを注入する | PBR 拡張候補だが WebGPU と version 差を要確認 |
| `MaterialPluginBase` | 対象 Material に依存 | 既存 Material の機能を維持して拡張しやすい | 現在の PBR toon / SSS 周辺で最有力の拡張点 |

`CustomMaterial` と `PBRCustomMaterial` は `@babylonjs/materials/custom`、それ以外は
`@babylonjs/core` 側の機能である。

関連資料:

- [Material shader customization guide](./material-shader-customization-guide.md)
- [Babylon.js Material Plugin 詳細調査](./babylon-material-plugin-investigation-2026-07-28.md)
- [Babylon.js ShaderMaterial](https://doc.babylonjs.com/features/featuresDeepDive/materials/shaders/shaderMaterial/)
- [Babylon.js Node Material](https://doc.babylonjs.com/features/featuresDeepDive/materials/node_material/nodeMaterial/)

## WebGPU / Babylon.js 9.2.0 の注意

Babylon.js 9.5.0 の Materials release note には、Material Library 全体への native WGSL shader
追加が記録されている。したがって、それより前の `9.2.0` では、すべての
`@babylonjs/materials` が native WGSL 経路を持つとは仮定しない。

`MMD_modoki` で Material Library を採用する場合は、各候補について少なくとも次を確認する。

- WebGPU で shader compile が成功する
- GLSL fallback / compatibility 経路を暗黙に要求していない
- Classic / Frame Graph の両 backend で二重描画や残存 RTT がない
- overlay、gizmo、outline、shadow、PostFX の描画順を壊さない
- save / load、backend 切替、材質解除時に resource を破棄できる

参考:

- [Babylon.js 9.5.0 release](https://github.com/BabylonJS/Babylon.js/releases/tag/9.5.0)
- [Babylon.js WebGPU WGSL](https://doc.babylonjs.com/setup/support/webGPU/webGPUWGSL/)

## MMD_modoki で試す順序

### 実用寄り

1. `ShadowOnlyMaterial`
2. `GridMaterial`
3. `WaterMaterial`
4. `SkyMaterial`
5. `NormalMaterial`

`ShadowOnlyMaterial` と `GridMaterial` は編集・床表現へ局所的に導入しやすい。
`WaterMaterial` は視覚的な価値が高いが、反射・屈折 RTT と render list を持つため、
モデル材質プリセットではなくステージ / accessory 専用機能として隔離する。

### 見た目の実験寄り

1. `GradientMaterial`
2. `CellMaterial`
3. `FireMaterial`
4. `LavaMaterial`
5. `FurMaterial`

`CellMaterial` は MMD toon の置換ではなく比較対象にする。`FurMaterial` は高負荷になりやすく、
PMX skinning、alpha、輪郭線との組み合わせもあるため後回しにする。

### 大型ステージ寄り

1. `TriPlanarMaterial`
2. `TerrainMaterial`
3. `MixMaterial`

これらは面白いが、MMD のタイムライン、モデル編集、カメラ編集より優先しない。

## UI 分類案

将来 UI に出す場合、すべてを一つの「材質プリセット」一覧へ混在させない。

```text
Model Material
  MMD Standard
  PBR Standard
  PBR presets
  OpenPBR (Experimental)

Stage / Accessory Material
  Water
  Sky
  Shadow Only
  Gradient
  Fire / Lava
  Terrain / Mix / Tri-Planar

Editor Utility Material
  Grid
  Normal

Material Authoring
  Node Material
  Shader Material
  Material Plugin
```

この分離なら、PMX / PMD の材質 morph や toon / sphere / outline を維持する経路と、
ステージ専用 Material の lifecycle、RTT、保存値を混在させずに済む。
