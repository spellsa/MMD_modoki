# Babylon.js Material Plugin 詳細調査

調査日: 2026-07-28
対象: Babylon.js 9.2.0 / WebGPU / WGSL-first の `MMD_modoki`

## 結論

`MaterialPluginBase` は、既存の `PBRMaterial` が持つライト、IBL、影、alpha、skinning、morph、各種 PBR 機能を維持したまま、材質単位で shader 処理を追加するための有力な拡張点である。

`MMD_modoki` ではすでに次の用途に使っており、技術的な導入確認は済んでいる。

- PBR MMD Like の影色乗算
- PBR No Shadow
- PBR Skin Face の法線補正
- WGSL / GLSL 両対応

今後の独自 SSS については、次の二段階に分けるのがよい。

1. Material Plugin 単体で、拡散暗部を暖色へ寄せる `PBR Skin Diffusion Lite` を作る
2. 本当に隣接 pixel へぼかす必要がある場合だけ、skin mask と Frame Graph の bilateral blur を追加する

Material Plugin 単体では、隣の pixel を参照する本来の画面空間 SSS blur は作れない。一方、現在問題になっている Babylon 標準 SubSurface の pre-pass 白飛び、赤黒化、影ぶれを避けつつ、PBR Standard の上へ肌らしい近似を加える用途には適している。

## Material Plugin とは

Material Plugin は独立した材質ではない。既存材質が生成する shader へ、決められた挿入点を通して機能を合成する仕組みである。

```text
PBRMaterial
  ├─ 標準 PBR
  ├─ 直接光 / IBL / shadow
  ├─ alpha / texture / skinning / morph
  ├─ Babylon 標準 plugin
  │    ├─ Clear Coat
  │    ├─ Sheen
  │    ├─ Iridescence
  │    └─ SubSurface
  └─ MMD_modoki plugin
       ├─ MMD Like shadow tint
       ├─ face normal
       └─ skin diffusion approximation
```

Babylon.js 自身も `MaterialPluginBase` を基盤として、次のような PBR 機能を実装している。

- `PBRSubSurfaceConfiguration`
- `PBRClearCoatConfiguration`
- `PBRSheenConfiguration`
- `PBRIridescenceConfiguration`
- `PBRAnisotropicConfiguration`
- `PBRBRDFConfiguration`
- `DetailMapConfiguration`

したがって、Material Plugin は外部向けの簡易 hack ではなく、Babylon.js 標準材質の機能分割にも使われる正式な仕組みである。

## 内部の流れ

概略は次のとおり。

```text
plugin を material へ登録
  ↓
MaterialPluginManager が plugin を priority 順に保持
  ↓
define / uniform / sampler / attribute を収集
  ↓
shader 生成時に getCustomCode() の断片を挿入
  ↓
shader variant を compile
  ↓
描画時に bindForSubMesh() で値を更新
```

Babylon.js 9.2.0 の実装では、material に最初の plugin が追加された時点で `MaterialPluginManager` が作られる。

plugin を後から追加することもできるが、material の uniform buffer layout がすでに構築済みの場合は、draw cache と uniform buffer が再構築される。モデル表示中に頻繁に plugin 自体を増減するより、材質生成時またはプリセット初回適用時に一度登録し、その後は define / uniform で状態を変える方がよい。

## コンストラクタと基本属性

`MaterialPluginBase` のコンストラクタは次の情報を受け取る。

```ts
new MaterialPluginBase(
    material,
    name,
    priority,
    defines,
    addToPluginList,
    enable,
    resolveIncludes,
);
```

| 値 | 役割 |
|---|---|
| `material` | plugin を装着する材質 |
| `name` | 同じ material 内での一意名 |
| `priority` | 複数 plugin の実行順。小さい値が先 |
| `defines` | plugin が使う shader define と初期値 |
| `addToPluginList` | material の manager へ即時登録するか |
| `enable` | コンストラクタ直後に active にするか |
| `resolveIncludes` | plugin 内の `#include` を Babylon に展開させるか |

同じ material に同名 plugin を追加すると、後から来た plugin は登録されない。例外にはならず `_addPlugin()` が `false` を返すだけなので、名前衝突は見落としやすい。

`getClassName()` も Babylon が plugin class ごとの内部 define を割り当てるために使われる。独自 plugin は、一意で安定した class name を返す方がよい。

## 主な lifecycle hook

| hook | 用途 |
|---|---|
| `isCompatible()` | material の shader language をサポートするか |
| `prepareDefinesBeforeAttributes()` | attribute 判定より前に define を設定 |
| `prepareDefines()` | 通常の shader define を設定 |
| `isReadyForSubMesh()` | texture など描画準備を判定 |
| `getCustomCode()` | vertex / fragment shader へコードを追加 |
| `getUniforms()` | UBO、vertex / fragment 宣言、外部 uniform を追加 |
| `getSamplers()` | texture sampler 名を登録 |
| `getAttributes()` | vertex attribute を登録 |
| `bindForSubMesh()` | 通常の bind 時に uniform / texture を更新 |
| `hardBindForSubMesh()` | 通常 bind が省略される場合も毎回更新 |
| `getActiveTextures()` | Inspector、dispose、animation 向けに texture を通知 |
| `hasTexture()` | material が texture を使っているか返す |
| `addFallbacks()` | shader compile fallback を追加 |
| `dispose()` | plugin 所有リソースを解放 |
| `serialize()` / `parse()` / `copyTo()` | 保存、復元、複製 |

`hardBindForSubMesh()` や render target texture の hook を使う場合は、`registerForExtraEvents = true` が必要になる。

## active / disabled の注意

Babylon.js 9.2.0 の `_enable(false)` は active plugin list から plugin を除去しない。`_enable(true)` は一度だけ active list へ追加するが、`false` 側は何もしない。

したがって、一度有効化した plugin の実用的な停止方法は次のいずれかになる。

- `prepareDefines()` で機能 define を `false` にする
- uniform の強度を `0` にする
- shader 内で define または uniform を見て処理を素通しする

これは現在の `MMD_modoki` 実装とも一致する。`_enable(false)` の呼び出しだけに依存せず、必ず plugin 独自 define を無効にする必要がある。

また、uniform buffer layout の準備では active plugin だけでなく、material へ登録済みの全 plugin から uniform / sampler 宣言を収集する。無効時も宣言自体は残るため、plugin 間で uniform 名や sampler 名を衝突させてはいけない。

## define と uniform の使い分け

### define に向くもの

- feature の完全な有効 / 無効
- texture の有無
- 別の shader 分岐が必要な構造変更
- vertex attribute の有無

define が変わると shader variant の再 compile が起きる。

### uniform に向くもの

- 強度
- 色
- roughness 補正量
- threshold
- wrap diffuse の幅
- UI slider から連続操作する値

uniform は同じ shader variant のまま更新できる。スライダー値を define の数値へ直接埋め込む設計は、操作中の再 compile と shader variant 増加につながるため避ける。

## 複数 plugin と priority

複数 plugin は `priority` の昇順で実行される。小さい数字が先である。

同じ挿入点へ複数 plugin がコードを出した場合も、active plugin の priority 順にコードが連結される。そのため、乗算や上書きを行う plugin は順序で結果が変わる。

現在の例:

| plugin | priority | 主な挿入点 |
|---|---:|---|
| PBR Skin Face Normal | 205 | `CUSTOM_VERTEX_UPDATE_NORMAL` |
| PBR MMD Like Shadow Tint | 210 | `CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION` |

命名と順序は、今後次のように帯域を決めると衝突しにくい。

| priority の例 | 用途 |
|---:|---|
| 100-199 | geometry / vertex deformation |
| 200-299 | normal / diffuse lighting |
| 300-399 | skin / toon color composition |
| 400-499 | final color adjustment |

これは Babylon の規則ではなく、`MMD_modoki` 内の運用案である。既存値を変える場合は描画比較が必要になる。

## shader code の挿入

`getCustomCode(shaderType, shaderLanguage)` は、挿入点名と code の対応を返す。

```ts
return {
    CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: "...",
};
```

Babylon は通常、標準 shader にある同名の `#define` marker の直前へ code を挿入する。

挿入点名を `!` で始めると正規表現置換もできる。ただし、標準 shader の具体的なソース断片へ強く依存し、Babylon.js 更新で壊れやすい。既存 marker だけでは届かない処理を調査する一時手段として扱い、恒常機能では極力使わない方がよい。

### PBR 9.2.0 で確認した共通挿入点

vertex:

- `CUSTOM_VERTEX_BEGIN`
- `CUSTOM_VERTEX_DEFINITIONS`
- `CUSTOM_VERTEX_MAIN_BEGIN`
- `CUSTOM_VERTEX_UPDATE_POSITION`
- `CUSTOM_VERTEX_UPDATE_NORMAL`
- `CUSTOM_VERTEX_UPDATE_WORLDPOS`
- `CUSTOM_VERTEX_MAIN_END`

fragment:

- `CUSTOM_FRAGMENT_BEGIN`
- `CUSTOM_FRAGMENT_DEFINITIONS`
- `CUSTOM_FRAGMENT_MAIN_BEGIN`
- `CUSTOM_FRAGMENT_UPDATE_ALPHA`
- `CUSTOM_FRAGMENT_BEFORE_LIGHTS`
- `CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION`
- `CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR`
- `CUSTOM_FRAGMENT_MAIN_END`
- `CUSTOM_REFLECTION`

GLSL 版には extension 宣言用の marker もある。WGSL と GLSL で marker の集合が完全に同一とは限らない。

これらは Babylon.js 9.2.0 の配布 shader source から確認した値であり、公開 API の型として固定されているわけではない。Babylon 更新時の回帰確認対象にする。

### 挿入位置の選び方

| 目的 | 候補 |
|---|---|
| 顔法線を平坦化 | `CUSTOM_VERTEX_UPDATE_NORMAL` |
| alpha test 前の alpha 補正 | `CUSTOM_FRAGMENT_UPDATE_ALPHA` |
| lighting 前の入力補正 | `CUSTOM_FRAGMENT_BEFORE_LIGHTS` |
| PBR の diffuse / irradiance を調整 | `CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION` |
| tone mapping 前の最終色補正 | `CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR` |

可能な限り最終色全体を上書きせず、変更したい成分だけを触る。

例えば PBR MMD Like は `finalDiffuse` と `finalIrradiance` のみを乗算し、specular、alpha、translucency は Babylon 標準経路へ残している。この局所性が Material Plugin を使う利点である。

## WGSL / GLSL 対応

`MaterialPluginBase.isCompatible()` の既定実装は GLSL のみ対応である。WebGPU の native WGSL PBR へ追加するには override が必要になる。

```ts
public isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL
        || shaderLanguage === ShaderLanguage.WGSL;
}
```

`getCustomCode()` では shader language ごとに code を返す。

主な差:

| 項目 | GLSL | WGSL |
|---|---|---|
| scalar | `float` | `f32` |
| vector | `vec3` | `vec3f` |
| UBO 内の値 | `myUniform` | `uniforms.myUniform` |
| sampler / texture | 結合 sampler が中心 | texture と sampler が分離 |
| mutable local | 通常の宣言 | `var` が必要 |

Babylon の公式 WGSL ガイドでは、`PBRCustomMaterial` / `CustomMaterial` は互換性維持のため、WebGPU 上でも custom code を GLSL で注入する特殊経路とされている。WGSL-first かつ WebGL fallback も持つ `MMD_modoki` では、Material Plugin で WGSL / GLSL を明示的に書き分ける方が挙動を把握しやすい。

WebGPU は未使用 sampler の未 bind にも厳しい。sampler を shader へ宣言した場合、機能分岐で読まない場合でも正しい texture を bind する設計にしておく。

## 保存、複製、破棄

基底 class の `serialize()` は、decorator 登録済みの値を保存する。基底で保存対象なのは主に次の値である。

- name
- priority
- resolveIncludes
- registerForExtraEvents

独自の色、強度、texture などは、decorator、serialize override、またはアプリ側の別保存が必要になる。

現在の `MMD_modoki` plugin は `doNotSerialize = true` とし、材質プリセットとプロジェクト状態をアプリ側で保存する。この方針でよい。理由は、PMX 材質への割り当て、backend 切替、モデル再読込、base PBR へ戻す操作を Babylon material 単体の serialize だけでは管理できないためである。

plugin が texture や render target を所有する場合は、次も実装する。

- `getActiveTextures()`
- `hasTexture()`
- `getAnimatables()`
- `dispose()`

## Material Plugin でできること

PBR 標準経路を維持したまま、次の拡張ができる。

- albedo 入力の補正
- PMX toon 色による暗部 tint
- wrap diffuse
- half-Lambert 風の法線項補正
- rim / backscatter の追加
- shadow map と法線暗部を組み合わせた MMD 風影
- roughness / metallic / specular の材質別補正
- 顔法線の正面寄せ
- thickness texture または定数 thickness の参照
- 独自 texture sampler の追加
- skin mask 用の値を材質単位で管理

この経路なら、skinning、morph、影受け、IBL、alpha、MMD loader 由来の texture を最初から作り直さずに済む。

## Material Plugin 単体では難しいこと

fragment shader の一回の実行は、通常その pixel の材質情報しか見ない。隣接 pixel の情報が必要な処理は、Material Plugin 単体では完結しない。

難しいもの:

- 画面空間で皮膚色を周囲へ拡散する SSS blur
- bilateral blur
- Bloom、SSAO のような full-screen effect
- シーン全体の pre-pass 構成変更
- shadow generator 自体の変更
- 透明 object の根本的な sort 解決

`registerForExtraEvents` と render target hook はあるが、これだけで full-screen pipeline が自動構築されるわけではない。

## Babylon 標準 SSS との関係

Babylon の `PBRSubSurfaceConfiguration` 自体も `MaterialPluginBase` を継承している。ただし Scattering は material plugin だけで完結せず、scene の `SubSurfaceConfiguration`、pre-pass texture、screen-space blur / composite と組み合わさる。

```text
PBRSubSurfaceConfiguration
  ├─ material shader 側の define / profile / mask
  └─ scene SubSurfaceConfiguration
       ├─ pre-pass
       ├─ diffusion profile
       ├─ screen-space blur
       └─ composite
```

今回経験した画面全体の白飛びは、この scene 側処理へ非 SSS material が誤って入ったり、mask / image processing の経路が二重化したりしたために起こり得る。Material Plugin を使えば自動的に回避できる問題ではない。

一方、独自 Material Plugin で標準の `isScatteringEnabled` を使わず、一回の PBR shader 内だけで暖色拡散を近似する場合は、SubSurface pre-pass 自体を起動せずに済む。この方法なら全画面白飛びの再発面積は小さくなる。

## 独自 SSS の三つの実装段階

### A. Skin Diffusion Lite

Material Plugin の一回の fragment 計算だけで近似する。

候補:

- albedo は base texture を優先し、PMX diffuse RGB の暗さを散乱色へ流用しない
- 直接光の暗部へ弱い暖色を加える
- shadow map の完全遮蔽は保持する
- `N dot L` の境界付近だけ彩度を少し上げる
- view rim と back light を弱く加える
- IBL diffuse は別係数で抑える
- specular、alpha、refraction は変更しない

長所:

- pre-pass 不要
- 画面全体の白飛びを起こしにくい
- 材質単位で即時割り当て可能
- 現在の PBR Standard と比較しやすい

短所:

- 本当の blur ではない
- silhouette や耳の薄さを geometry thickness として正確には扱えない

まずはこちらを推奨する。

### B. Masked screen-space diffusion

Material Plugin で skin 対象を識別し、Frame Graph の別 pass で skin diffuse のみを blur / composite する。

必要なもの:

- skin mask または material ID
- skin diffuse / lighting buffer
- depth / normal
- depth と normal を守る bilateral blur
- blur 前後の composite
- editor overlay / gizmo と Frame Graph の描画順確認

これは本来の画面空間 SSS に近いが、material shader だけの変更では済まない。現在の Frame Graph custom WGSL 基盤は再利用候補になる。

### C. 完全な独自 Material / ShaderMaterial

PBR lighting を含めて独自 shader へ置き換える方法。

自由度は最大だが、次を自前で維持する必要がある。

- skinning
- morph
- shadow
- IBL
- alpha
- fog
- clipping
- WebGPU / WebGL
- Babylon.js 更新追従

現状では採用しない。

## `MMD_modoki` 向け推奨設計

### 第一段階

実験プリセットとして `PBR Skin Diffusion Lite` を追加する。

内部 plugin の仮称:

```text
PbrSkinDiffusionPlugin
```

最低限の parameter:

| parameter | 意味 |
|---|---|
| `enabled` | 機能の有効 / 無効 |
| `color` | 薄い暖色の散乱色 |
| `strength` | 全体強度 |
| `wrap` | 法線暗部へ回り込む幅 |
| `backscatter` | 逆光側の補助 |
| `iblInfluence` | IBL diffuse への影響 |
| `shadowPreservation` | shadow map 遮蔽をどれだけ残すか |

texture path は第一段階では不要とし、必要になった時だけ thickness / mask texture を追加する。

### shader 内の方針

- `surfaceAlbedo` や base texture の見た目を基準にする
- PMX diffuse RGB を散乱色そのものに使わない
- `finalDiffuse` / `finalIrradiance` の既存値を全面置換しない
- 加算量は luminance と shadow visibility で上限を設ける
- shadow map で完全遮蔽された部分を無条件に発光させない
- emissive は使わない
- alpha、refraction、translucency は触らない

現在の赤黒化は、Babylon 標準 Scattering が albedo と diffusion profile を使ってエネルギーを再配分する経路、PMX 材質値、IBL、pre-pass composite が重なっている。独自 Lite plugin では、元 albedo の暗化を行わず、暖色成分を小さく追加するところから始める。

### 第二段階へ進む条件

次が明確に不足した場合だけ screen-space diffusion へ進む。

- 鼻や頬の影境界を本当に blur したい
- 耳や指先の薄さを表現したい
- 単一 pass の rim / wrap では輪郭が shader 的に見えすぎる

## 実装時の確認項目

### 自動確認

- strength `0` が PBR Standard と同値
- WGSL / GLSL の両 code path が存在する
- define off で custom code が実質 no-op
- plugin 名、uniform 名、define 名が重複しない
- clamp により NaN / 過大値を shader へ渡さない
- project save / load で preset と値が復元される
- base PBR へ戻した時に define が off になる

### smoke

- Electron 起動
- `engine=WebGPU` 到達
- shader compile warning なし
- plugin 割り当て / 解除で画面全体が白飛びしない
- WebGPU validation warning なし

### 手動比較

- PBR Standard と同じ camera / light / IBL で比較
- IBL off / on
- 明るい HDRI / 暗い HDRI
- 顔正面 / 逆光 / 横光
- shadow map 内 / 外
- alpha 材質、髪先、白目へ副作用がない
- 複数モデルで PMX diffuse RGB の違いに引きずられない

## 既存コードから得た知見

`MMD_modoki` の既存 Material Plugin は、次の基本形をすでに満たしている。

- material ごとの `WeakMap` 管理
- `doNotSerialize = true`
- WGSL / GLSL 両対応
- define で構造を切替
- uniform で色と強度を更新
- `markAllDefinesAsDirty()` と material dirty flag
- PBR の一部分だけを変更

したがって、新しい独自 SSS の主な未知要素は Material Plugin の導入方法ではなく、肌向けの式と、単一 pass 近似で満足できる範囲である。

## 参照

- [Babylon.js: Material Plugins](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/materialPlugins/)
- [Babylon.js Typedoc: MaterialPluginBase](https://doc.babylonjs.com/typedoc/classes/BABYLON.MaterialPluginBase)
- [Babylon.js: WebGPU WGSL](https://doc.babylonjs.com/setup/support/webGPU/webGPUWGSL/)
- [Babylon.js Typedoc: PBRBaseMaterial](https://doc.babylonjs.com/typedoc/classes/BABYLON.PBRBaseMaterial)
- [Babylon.js forum: Material Plugin Basic Texture Sampler Example (WGSL)](https://forum.babylonjs.com/t/material-plugin-basic-texture-sampler-example-wgsl/57386)
- [Babylon.js source: MaterialPluginManager](https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/Materials/materialPluginManager.ts)
- [Babylon.js source: PBRBaseMaterial](https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/Materials/PBR/pbrBaseMaterial.ts)

バージョン固有の挿入点と manager 挙動は、リポジトリにインストールされている `@babylonjs/core@9.2.0` の次の配布ソースでも確認した。

- `node_modules/@babylonjs/core/Materials/materialPluginBase.js`
- `node_modules/@babylonjs/core/Materials/materialPluginManager.js`
- `node_modules/@babylonjs/core/Materials/PBR/pbrSubSurfaceConfiguration.js`
- `node_modules/@babylonjs/core/ShadersWGSL/pbr.vertex.js`
- `node_modules/@babylonjs/core/ShadersWGSL/pbr.fragment.js`
