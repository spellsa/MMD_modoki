# Lighting Effects 構想メモ

## 概要

Lighting Effects は、MMD_modoki における追加ライト、補助ライト、発光材質由来ライト、影品質、将来的な Clustered Lighting を扱うための実験機能群である。

MMD 標準の照明は、基本的に 1 つの平行光源とセルフシャドウを中心にしている。一方で、現代的な映像表現やステージ演出では、点光源、スポットライト、面光源、発光材質からの補助光などを使いたくなる場面がある。

MMD_modoki では、MMD 標準の見た目と VMD 由来のライト操作を壊さない範囲で、追加ライトを実験的な Effect / Lighting 機能として扱う。

## 位置づけ

Lighting Effects は、Post Effects、Particles、Materials / Shaders と並ぶ Effect 分類の 1 つとして扱う。

```text
Post Effects
= 画面全体の仕上げ

Particles
= シーン内に足す粒子演出

Materials / Shaders
= 材質やモデルの見た目を変える

Lighting Effects
= シーンの光を増やす、補助する、影を調整する
```

## MMD 標準ライトとの関係

MMD 標準のライトは、互換性と基本編集体験のために独立して維持する。

```text
MMD standard light
= VMD / camera mode / light keyframe 向けの基本平行光源

Lighting Effects
= MMD_modoki 独自の追加ライト、補助ライト、演出ライト
```

追加ライトは、MMD 標準ライトの代替ではなく、上乗せ表現として扱う。

## 対象機能

### Manual Lights

ユーザーが手動で配置するライト。

- point light
- spot light
- directional light add-on
- hemispheric / ambient 補助
- area light 風の疑似ライト

最初は point light を優先する。

### Emissive Light Assist

AutoLuminous 対象材質や emissive 材質から代表点を推定し、補助ライトを自動生成する機能。

詳細は [Emissive Light Assist 構想メモ](./emissive-light-assist-concept-2026-06-12.md) を参照する。

### Clustered Lighting / Forward+

多数の小ライトを扱うための描画基盤候補。

Emissive Light Assist やステージライトを増やす場合、通常の forward lighting では負荷が高くなる可能性がある。そのため、Babylon.js 側の Clustered Lighting / Forward+ 相当機能を利用できるか調査する。

### Area Light / Textured Area Light

床、窓、スクリーン、ネオン看板、ライブステージ照明など、面として光って見えるものを扱うための候補。

ただし初期実装では、物理的な面光源を正確に扱うより、点光源や複数の代表点ライトで近似する。

### Shadow Control

既存の light / shadow 設定は MMD 標準ライト寄りの常用 UI として残す。

追加ライトの影は重くなりやすいため、初期段階では shadow casting を OFF にするか、ライトごとの明示設定にする。

## 基本方針

- MMD 標準ライトは既存互換の基本光源として維持する
- 追加ライトは Experimental / 上級者向けとして扱う
- デフォルトは OFF
- 最初は point light の手動配置から始める
- 影あり追加ライトは後段に回す
- project 保存 / 読み込みに対応する
- 低スペック環境で重くならないよう、ライト数に上限を設ける
- Emissive Light Assist は自動生成ライトとして Lighting Effects に属する

## 初期実装案

### Phase 1: Manual Point Light

- point light を追加できる
- 位置、色、強度、距離を設定できる
- ON / OFF できる
- project 保存 / 読み込みに対応する
- shadow casting は OFF

```text
Light
  type: point
  position: x / y / z
  color: r / g / b
  intensity
  radius
  enabled
```

### Phase 2: Light List UI

複数ライトを一覧管理する。

```text
Lighting Effects
[ + Add Light ]

Point Light 01    on
Point Light 02    off
Emissive Assist   auto
```

各ライトでできること:

- ON / OFF
- rename
- duplicate
- delete
- position edit
- color / intensity edit
- radius edit

### Phase 3: Gizmo / Attachment

- viewport gizmo で位置を動かす
- stage 固定
- accessory 固定
- model bone 追従
- camera 追従

最初は world fixed / stage fixed を優先する。

### Phase 4: Emissive Light Assist

- AutoLuminous 対象材質から代表点ライトを生成する
- ステージの固定発光部を優先する
- モデル小物やアクセサリは後段に回す
- 生成ライト数を制限する

### Phase 5: Clustered Lighting 検証

- 8 / 16 / 32 / 64 lights の負荷を測る
- FrameGraph backend との相性を見る
- MMD 材質 / PBR 材質 / OpenPBR 材質で差が出るか確認する
- 追加ライトを使わないプロジェクトでは負荷を増やさない

### Phase 6: Area Light 風プリセット

正確な面光源ではなく、演出用途の疑似プリセットとして扱う。

- window glow
- neon strip
- soft panel
- stage bar light

内部的には point light 複数、spot light、emissive material、Bloom の組み合わせで近似する。

## UI 案

```text
Effects
  Post
  Particles
  Materials
  Lighting
```

Lighting の中:

```text
Lighting Effects

MMD Standard Light
  direction
  color
  intensity

Additional Lights
  [ + Add Light ]

Emissive Light Assist
  [ ] enabled

Clustered Lighting
  off / auto / forced
```

追加画面:

```text
Recommended
  Point Light
  Soft Point Light

Creative
  Spot Light
  Neon Strip Assist
  Window Glow Assist

Technical
  Emissive Light Assist
  Clustered Light Stress Test

Experimental
  Area Light Approximation
  Textured Area Light Research
```

## 優先度

v0.2 では FrameGraph / PostFX / 出力安定性を優先する。

Lighting Effects は、以下の順で進めるのがよい。

1. Manual Point Light
2. Light List UI
3. project 保存 / 読み込み
4. Emissive Light Assist
5. Clustered Lighting 検証
6. spot light / area light 風プリセット
7. shadow casting 対応

## 注意点

### MMD 材質との相性

MMD 材質は toon / sphere / outline / AutoLuminous / shadow flag など独自の見た目を持つ。追加ライトを入れると、MMD らしい陰影が崩れる可能性がある。

最初は PBR ステージ、床、アクセサリ、補助表現から試すのが安全である。

### 影の負荷

点光源やスポットライトに影を持たせると、ライト数に応じて shadow map コストが増える。

初期段階では追加ライトの shadow casting は OFF にし、必要になったらライトごとに明示的に ON にする。

### project 互換性

追加ライトは MMD / VMD 互換ではなく、MMD_modoki 独自の project state として保存する。

VMD 書き出し対象には含めない。

### AutoLuminous との関係

AutoLuminous は「材質が光って見える」表現であり、Lighting Effects は「周囲を照らす」表現である。

Emissive Light Assist は両者をつなぐ補助機能として扱う。

## 一言まとめ

Lighting Effects は、MMD 標準ライトを壊さずに、手動点光源、発光材質由来ライト、将来的な clustered / area light 風表現を追加するための実験カテゴリである。

最初は shadow なしの手動 point light から始め、Emissive Light Assist と Clustered Lighting はその上に乗せる。
