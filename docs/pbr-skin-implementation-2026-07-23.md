# PBR Skin 実装メモ

調査・更新日: 2026-07-23

## 目的

`PBR Skin` は、モデル全体の描画モードではなく、`PBR Standard` で読み込んだ
個別材質へ割り当てる肌向けプリセットである。

この文書では、次をまとめる。

- 現在採用している Babylon.js 標準 `Translucency` の設定
- `Scattering` を再試行して無効に戻した理由
- HDRI / IBL と SubSurface の相互作用
- プリセットを外したときに元へ戻す仕組み
- 今後再調整するときの順序と確認項目

過去の試行経過全体は
[PBR 材質モード実験メモ](./pbr-material-mode-experiment-2026-07-20.md)、
IBL と外部 HDRI の仕様は
[IBL / 外部 HDRI 現行仕様・調査記録](./external-hdri-environment-lighting-2026-07-21.md)
を参照する。

## 現在の結論

2026-07-23 時点の `PBR Skin` は、画面空間`Scattering`を使わず、
低強度の`Translucency`だけを使う。

- 表面は不透明のまま
- `Refraction` は使わない
- `alpha` / `transparencyMode` は変更しない
- emissive や独自の拡散光加算で明るさを補正しない
- roughness / specular は変更しない
- 肌材質だけIBLの影響をStandardの80%に抑える

実機で IBL の ON / OFF を比較した結果、極端な暗化と赤被りが収まり、
現状では暫定基準として使える見た目になった。

これは物理測定値を再現した完成版の肌シェーダーではない。
MMD キャラクターへ適用しやすく、壊れにくい出発点を優先した実験設定である。

## Babylon.js の三つの SubSurface 経路

Babylon.js の `PBRSubSurfaceConfiguration` には、役割の異なる三つの経路がある。

| 経路 | 主な用途 | 現在の PBR Skin |
|---|---|---|
| Refraction | ガラスや液体のように、背後を屈折して見せる | 無効 |
| Translucency | 不透明に近い材質で、裏側から入った光を拡散透過させる | 有効 |
| Scattering | PrePass の情報を画面空間でぼかし、皮下散乱を近似する | 無効 |

`Translucency` は `alpha blend` による透明化ではない。表面を不透明に保ちながら、
反対側の光や環境 irradiance を拡散透過成分として加える経路である。

`Scattering` は材質内の色計算だけでは完結しない。PrePass へ irradiance と
diffusion profile index を出力し、後段の SubSurface Scattering post-process で
深度を考慮した画面空間ブラーを行う。

したがって、両者は併用可能だが同じ機能ではない。`Scattering` の diffusion profile は
単純な「SSS の色」や「強度」ではなく、RGB ごとの散乱距離・広がり方を表す設定である。

公式資料:

- [Mastering PBR Materials - Sub Surface](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/masterPBR/)
- [PBRSubSurfaceConfiguration API](https://doc.babylonjs.com/typedoc/classes/BABYLON.PBRSubSurfaceConfiguration)
- [PrePassRenderer API](https://doc.babylonjs.com/typedoc/classes/BABYLON.PrePassRenderer)

## 現在の設定値

実装は `src/render/pbr-mmd-like-toon-settings.ts` にある。

| 設定 | 値 | 意図 |
|---|---:|---|
| `isRefractionEnabled` | `false` | 背景や内部メッシュを透かさない |
| `refractionIntensity` | `0` | 屈折寄与を完全に切る |
| `linkRefractionWithTransparency` | `false` | 元の alpha と屈折を連動させない |
| `isTranslucencyEnabled` | `true` | Babylon.js 標準の拡散透過を使う |
| `translucencyIntensity` | `0.02` | `0.01`では安定、`0.03`では明るすぎたため採用した中間値 |
| `translucencyColor` | `(1.0, 0.68, 0.58)` | 真っ赤ではなく、暖色の肌寄り散乱色 |
| `useAlbedoToTintTranslucency` | `true` | 元テクスチャの色を維持して透過光を着色する |
| `minimumThickness` | `0.0` | 一様 thickness の下限 |
| `maximumThickness` | `0.3` | 一様 thickness の上限 |
| `legacyTranslucency` | `false` | Babylon.js の現行モデルを使う |
| `isScatteringEnabled` | `false` | PrePassと画面空間SSSを生成しない |
| 材質 `environmentIntensity` | `0.80` | Standardと同値で白飛びしたため、Skinだけ20%抑える |

現在は thickness texture を持たず、全画素で同じ範囲を使う。
顔の頬、耳、鼻、腕などで厚みを変える表現はまだ行っていない。

## 適用と復元の流れ

`PBR Skin` は既存の `PBRMaterial` を別材質へ交換せず、そのインスタンスへ即時適用する。

```text
PBR Standard の基準状態を保存
  -> 材質ごとのプリセットを選択
  -> いったん基準状態へ復元
  -> PBR Skin の SubSurface 設定だけを適用
  -> material dirty を要求
```

Standard、MMD Like、Skin を何度切り替えても前回の設定が累積しないよう、
次の値を初回登録時に保存している。

- Refraction / Translucency / Scattering の有効状態と強度
- thickness、tint、translucency color / texture
- scattering diffusion profile
- alpha、transparency mode、depth write、alpha cutoff
- roughness、specular intensity
- material-local environment intensity
- reflection color

プリセットを外すと保存済みの値へ戻す。`PBR Skin` 自身は透明度、発光色、粗さ、
スペキュラを変更しない。

なお、現在の `PBR Standard` は babylon-mmd が PMX specular color を入れた
`reflectionColor` を中立白へ正規化する。この処理は IBL の diffuse まで PMX の
specular 色で暗くならないようにするための Standard 側の基準処理で、
Skin 固有の明るさ補正ではない。

## HDRI / IBL と Translucency

PBR の環境テクスチャには、おおまかに次の二つの寄与がある。

- radiance: 粗さに応じた鏡面反射
- irradiance: 拡散環境光

Babylon.js 9.2.0 の現行 shader では、Translucency の環境光は通常の表面側 irradiance
だけでなく、法線の反対側から取得した environment irradiance も使う。
そのため、高輝度の HDRI では `translucencyIntensity` と色が小さくても、肌が明るく、
または赤く見えやすい。

現在は次の三つを別の値として扱う。

| 値 | 対象 | 現在の扱い |
|---|---|---|
| HDRI 背景の明るさ | 背景として見える画像 | IBL 強度と分離 |
| scene の環境光強度 | PBR 材質全体の IBL | 背景メニューの設定 |
| material の環境光強度 | 対象材質だけの IBL | PBR Skin は `0.80` |

背景が適正露出でも環境光が強すぎる場合や、その逆があるため、背景輝度と IBL 強度を
同じ値へまとめない。

2026-07-23の比較では、Skin固有の `environmentIntensity = 0.20` をいったん廃止して
PBR Standardと同じ値で比較した。しかし内蔵HDRIでは肌が白飛びしたため、
材質ローカル係数を `0.80` に調整した。IBL全体の強弱は背景メニューの
scene IBL強度、SkinとStandardの相対差はこの材質ローカル係数で管理する。

新規環境のscene IBLはONを既定とし、外部HDRIがなければ内蔵の2K TrueHDRIを使う。
内蔵IBLは通常のデフォルト空に加えて、背景メニューからHDRI背景としても表示できる。
背景表示の初期値はOFFのままとし、外部HDRIを読み込まなくても
SkinのTranslucencyとIBLを同じ画像条件で比較できるようにする。

### 内蔵HDRの選定と縮小

旧 `white.hdr` はほぼ一様な白で、赤道付近の反対方向どうしの平均輝度差は約 `3.4%`
しかなかった。全周が明るくても方向差がないため、Translucency が参照する法線反対側の
irradiance を、正面側と異なる光として確認しにくかった。

比較に使った雪原HDRは全周が明るい一方、同じ指標が約 `60.4%` あり、高輝度領域にも
大きな方向差があった。素材がCC0で同梱可能なことも確認できたため、2026-07-23に
Bandai Namco Studios TrueHDRI `YamagataField_20181231_1137`を既定IBLへ採用した。

元の16K Radiance HDRを線形値のまま2Kへ縮小した派生版では、同じ指標が約 `63.0%` と
なり、主要な方向差を維持できた。ファイルサイズは約332MBから約5.7MBへ削減した。
色変換、トーンマッピング、露出変更は行っていない。

目的は肌だけを明るくする補正ではなく、外部HDRなしでも diffuse / specular IBL と
Translucency の方向応答を確認できる既定環境を用意することである。実際の見た目は
scene IBL強度、材質 `environmentIntensity`、Translucency強度の積で引き続き調整する。

元素材の名義、CC0、配布元、縮小条件は `src/assets/ibl-shadows/README.md`、
`THIRD_PARTY_NOTICES.md`、HDRヘッダーに記録する。比較用の手続き生成 `white.hdr` も
残すが、既定IBLには使用しない。

## Scattering 試行で起きたこと

### 1. IBL なしで暗く見えた

画面空間 Scattering を有効にした試行では、IBL なしの肌が Standard より暗く見えた。
「散乱を足したので必ず明るくなる」とは限らない。Scattering は元の光へ発光を足す処理ではなく、
材質から irradiance を取り出して PrePass と post-process 経由で再合成するためである。

インストール中の Babylon.js 9.2.0 の WGSL shader には、PrePass irradiance を
`0..1` に clamp して出力する legacy 経路も残っている。本アプリの高い照度や HDRI と
組み合わさったとき、暗化に寄与し得る。ただし、どの shader define が実機で有効だったかは
まだ切り分けていないため、これを単独原因とは断定しない。

### 2. HDRI ありで赤が強くなった

Scattering と赤系 Translucency を併用した試行では、HDRI を有効にすると赤が過剰になった。
画面空間散乱と裏側 environment irradiance の両方が有効な状態で、散乱色、透過色、IBL 強度を
同時に動かしていたため、原因と強度を分離しづらかった。

Translucencyの値を固定し、以前より大幅に狭い`(0.08, 0.025, 0.012)`の
diffusion profileでも再試行したが、画面全体の白化とSkin材質の黒化が同時に発生した。
拡散幅の調整では解消しない描画経路の問題と判断し、Scatteringを再度無効にした。

### 3. 影の「ぶれ」と Scattering は別問題の可能性が高い

SubSurface Scattering なら影境界が柔らかく拡散することはあり得るが、同じ輪郭の影が
くっきり二重にずれる挙動は通常の散乱表現ではない。

過去に見えた二重輪郭は、次を別々に疑う必要がある。

- shadow map 自体の二重描画
- PrePass と本描画のスキニング・深度差
- Frame Graph と従来 post-process の二重経路
- editor overlay / utility layer との合成順
- Scattering post-process の深度・法線参照不整合

Scattering を再導入するときは、肌色の調整より先に単純な不透明球と一枚の影で
画面空間パスだけを検証する。

## Babylon.js 9.2.0 の実装上の落とし穴

### `scatteringDiffusionProfile = null` でも PrePass が作られる

`PBRSubSurfaceConfiguration.scatteringDiffusionProfile` の setter は、値が `null` でも先に
`scene.enableSubSurfaceForPrePass()` を呼ぶ。

このため、Scattering を無効にする目的で単純に次を実行すると、不要な PrePassRenderer と
SubSurfaceConfiguration が生成される可能性がある。

```ts
material.subSurface.scatteringDiffusionProfile = null;
```

現在の復元処理は、保存していた profile が実在するときだけ setter へ戻す。
基準値が `null` の場合は代入を省略し、`isScatteringEnabled = false` のままにする。

### Scattering は scene / camera 側の機能でもある

`isScatteringEnabled` は材質プロパティだが、描画処理は scene の PrePass と
SubSurface Scattering post-process を必要とする。

したがって、プリセット一個の変更でも次へ影響し得る。

- PrePassRenderer の生成と解放
- camera の post-process chain
- Frame Graph の最終合成
- WebGPU render pipeline の形式
- editor overlay の描画順
- GPU メモリとフレーム時間

このため、材質設定だけを見て正常と判断しない。

## 現在の確認範囲

現在の自動確認では次を検証している。

- PBR Skin が Translucency を有効にする
- Refraction とScatteringを無効にする
- 適用時にscene PrePassを要求しない
- alpha / transparency / roughness / specular を変更しない
- material-local environment intensity を `0.80` にする
- Standard へ戻したときに保存済みの値を復元する
- 実`PBRMaterial`と`NullEngine`でも不要なPrePassが生成されない

2026-07-23 の実機比較では、同じ材質に対して IBL を ON / OFF しても、以前のような
極端な暗化と赤被りは発生せず、Translucency-only 設定を暫定採用できると判断した。

実機比較に使用したモデル、HDRI、スクリーンショットはローカル参照であり、
権利上の理由から Git 管理対象へ追加しない。

## 既知の制約

- thickness texture がなく、顔の部位ごとの厚みを表現できない
- 散乱色と強度は全 Skin 材質で共通
- PMX 材質名や部位から Skin を自動判定しない
- 肌、耳、唇、爪などを別パラメータに分けていない
- HDRI ごとの推奨値や露出補正を持たない
- Scatteringを使わないため、頬や耳の画面空間ブラーはない
- 材質ローカル `environmentIntensity` は diffuse と specular の IBL をまとめて弱める

現状は「肌に見える安全な初期値」であり、汎用の物理スキンモデルではない。

## 再調整するときの推奨順序

複数の要素を同時に動かすと、暗化、赤被り、白飛びの原因を特定できなくなる。
次の順序で一つずつ比較する。

1. `PBR Standard` で方向ライト、照度、HDRI 背景輝度、scene IBL 強度を固定する。
2. Skinのmaterial-local `environmentIntensity`を `0.80` に固定する。
3. Translucencyを `0.01` まで下げたところ白飛びが収まった。
4. `0.03`では明るすぎたため、中間の `0.02`を基準値とする。
5. neutral gray と現在の暖色を比較し、色と強度を分離して決める。
6. 必要なら thickness texture を追加し、色を強くする前に部位差を作る。
7. ここまで安定してから、Scattering を独立した実験フラグで再導入する。

Scattering の再試行では、最低限次を記録する。

- WebGPU / WebGL の別
- Classic / Frame Graph の別
- `metersPerUnit`
- diffusion profile
- HDRI 名、scene IBL 強度、material environment intensity
- exposure / tone mapping
- PrePass の有無と render pipeline warning
- IBL ON / OFF の同一条件画像

Scattering の評価用 UI を作る場合も、最初から本番プリセットへ値を増やさず、
`Scatteringを使用`、profile、距離、強度を実験用ポップアップへ隔離するのが安全である。

## 関連コードと文書

- `src/render/pbr-mmd-like-toon-settings.ts`
- `src/render/pbr-mmd-like-toon-settings.test.ts`
- `scripts/generate-bundled-studio-hdr.mjs`
- `scripts/resize-radiance-hdr.mjs`
- `scripts/verify-radiance-hdr.mjs`
- `src/assets/ibl-shadows/README.md`
- [Babylon.js PBR 材質で使える属性・表現](./babylon-pbr-material-capabilities-2026-07-21.md)
- [PBR 材質モード実験メモ](./pbr-material-mode-experiment-2026-07-20.md)
- [IBL / 外部 HDRI 現行仕様・調査記録](./external-hdri-environment-lighting-2026-07-21.md)
