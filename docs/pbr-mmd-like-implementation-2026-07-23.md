# PBR MMD Like 実装メモ

更新日: 2026-07-23

## 位置づけ

`PBR MMD Like`はモデル全体のPBRモードではなく、PBR Standardで読み込んだ
PMX / PMDモデルの材質へ個別に割り当てるプリセットである。

今回の再実装では、以前試した独自のtoon影乗算、画面空間Scattering、alpha補正、
emissive補正は使用しない。PBR Standardの表面設定を基準にし、Babylon.js標準の
TranslucencyへPMX固有の影色を渡す。

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

`alpha`、`transparencyMode`、roughness、specularIntensity、emissiveは変更しない。

## PMX影色の取得

PMX材質にtoonテクスチャがある場合は、そのテクスチャの左下1pxの中心色を使う。
元テクスチャを直接変更するとMMD側の利用経路へ影響するため、次の手順で扱う。

1. babylon-mmdのPBR material builderからtoonテクスチャを受け取る。
2. 材質プリセット側でtoonテクスチャを複製する。
3. 複製のUV scaleを`0`にし、offsetを左下texel中心へ固定する。
4. 固定色テクスチャを`translucencyColorTexture`へ設定する。
5. `useAlbedoToTintTranslucency`で元のalbedoも掛け合わせる。

テクスチャを取得できない場合は、PMX材質のambient色を影色フォールバックとして使う。

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
