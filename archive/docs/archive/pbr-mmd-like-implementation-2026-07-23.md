# PBR MMD Like 実装メモ

更新日: 2026-07-23

## 位置づけ

`PBR MMD Like`はモデル全体のPBRモードではなく、PBR Standardで読み込んだ
PMX / PMDモデルの材質へ個別に割り当てるプリセットである。

今回の再実装では、以前試した画面空間Scattering、alpha補正、emissive補正は
使用しない。PBR Standardの表面設定を基準にし、Babylon.js標準のTranslucencyと、
PBRの拡散成分へだけ作用する小さなMaterial Pluginを組み合わせる。

TranslucencyにはPMX固有のtoon色を渡し、Material Pluginでは下パネルの影色を
遮蔽影と法線由来の暗部へ乗算する。鏡面反射、alpha、発光はこの乗算の対象外とする。

## 現在の設定

| 設定 | 値 | 目的 |
|---|---:|---|
| 材質の`environmentIntensity` | `0.8` | PBR Skinと揃え、PBR / IBLの影響を少し抑える |
| `isTranslucencyEnabled` | `true` | Babylon.js標準の拡散透過を有効にする |
| `translucencyIntensity` | `0.02` | PBR Skinと同じ強度でPMX影色を弱めの拡散透過色として加える |
| `useAlbedoToTintTranslucency` | `true` | 元の材質色・テクスチャ色を維持する |
| `isScatteringEnabled` | `false` | PrePassと過去に発生した影ぶれを避ける |
| `isRefractionEnabled` | `false` | 背景を透かさず不透明面を維持する |
| `legacyTranslucency` | `false` | Babylon.jsの現行Translucency計算を使う |
| thickness | `0.0`〜`0.3` | PBR Skinと同じ暫定範囲 |
| roughness下限 | `0.72` | 床や衣装を含め、反射を広げてマット寄りにする |

`alpha`、`transparencyMode`、specularIntensity、emissiveは変更しない。
roughnessは元の値を尊重しつつ、`0.72`未満の場合だけ下限まで引き上げる。

## PMX影色の取得

PMX材質にtoonテクスチャがある場合は、そのテクスチャの左下1pxの中心色を使う。
元テクスチャを直接変更するとMMD側の利用経路へ影響するため、次の手順で扱う。

1. babylon-mmdのPBR material builderからtoonテクスチャを受け取る。
2. 材質プリセット側でtoonテクスチャを複製する。
3. 複製のUV scaleを`0`にし、offsetを左下texel中心へ固定する。
4. 固定色テクスチャを`translucencyColorTexture`へ設定する。
5. `useAlbedoToTintTranslucency`で元のalbedoも掛け合わせる。

テクスチャを取得できない場合は白を使う。ambient色は参照しない。
これにより、toonテクスチャを持たない材質へPMX ambientと下パネルの影色が
二重に作用することを避ける。

## 下パネルの影色

PBR MMD Like、PBR Skin、PBR Skin Faceでは、下パネルの影色をPBR拡散成分へ
乗算する。影判定は次の大きい方を使う。

- Babylon.jsの集約済みshadow visibilityから得る遮蔽影
- PBRのdirect diffuse輝度から得る法線方向の暗部

この影色は`finalDiffuse`とIBLの`finalIrradiance`へ掛け、specularには掛けない。
物理的に厳密なPBRではなく、光色と影色を別々に演出するためのMMD向け処理である。

既存UIとの対応を保つため、PBR時の「Toon影響度」は乗算強度と逆向きに扱う。

| Toon影響度 | PBR影色の乗算 |
|---:|---|
| `0` | 最大 |
| `100` | なし |

遮蔽影を受けないPMX材質では法線由来の暗部だけが残る。モデル側の
receive/cast shadow設定と、シェーダー内の暗部着色は別経路である。

## 復元と切替

PBR Standard / PBR MMD Like / PBR Skinを切り替える前に、材質読込時に保存した
SubSurface、透明度、roughness、specular、材質ローカルIBLなどの基準値へ戻す。
その後、選択プリセットの差分だけを適用する。これにより、Skinの固定肌色や
MMD Likeのtoon色テクスチャが別プリセットへ残らないようにする。

## 確認項目

- Toon画像の左下1pxが意図したMMD影色になっているか
- IBL ON / OFF、内蔵HDRI / 外部HDRIで赤みや明るさが過剰にならないか
- 顔、髪、薄布の別材質で`0.02`が共通値として妥当か
- 透明材質の毛先やまつ毛を欠落・半透明化させないか
- 投影影に二重化や画面空間ブラーが再発しないか

現時点の値は実験用の初期値であり、実モデル比較後に微調整する。

## 関連プリセット

### PBR Skin Face

PBR Skinの設定に加え、頂点法線をモデル正面かつ少し上向きの法線へ`30%`寄せる。
顔の左右で極端に暗くなる法線陰影を穏やかにするための演出用プリセットである。

- ジオメトリは変更しない
- モデル・ボーンの変換には追従する
- shadow mapの受影や投影形状は変更しない
- 遮蔽影を消す機能ではない

### PBR No Shadow

白目など、遮蔽影だけを受けたくない材質向けのプリセットである。
unlitにはせず、direct light、IBL、法線、照度、AO、露出の影響は残す。
このプリセットは材質の受影経路を無効にするもので、メッシュをshadow casterから
外す機能ではない。

初期実装ではfragment shader内の`#undef SHADOWn`を試したが、WGSLでは
有効な方法ではなかった。次に`SHADOWn`だけをdefine準備時に消したところ、
`SHADOWCSMn`などの派生defineが残り、vertex/fragment間のvaryingが不一致になった。
実機では`vPositionFromCamera1`が見つからないWGSLエラーとなり、画面全体が黒くなった。

現在はBabylon.js 9.2の`PrepareDefinesForLight`が初期化するshadow define群に合わせ、
各ライトの次の系統をまとめて無効化する。

- SHADOW / CSM
- PCF / PCSS / Poisson
- ESM / Close ESM
- Cube shadow
- quality・cascade関連define
- グローバルの`SHADOWS` / `SHADOWFLOAT`

`LIGHTn`や`REFLECTION`は残す。2026-07-23にElectron/WebGPU実機で再適用し、
黒画面が解消することを確認した。
