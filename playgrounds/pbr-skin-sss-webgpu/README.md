# PBR Skin SSS: WebGPU赤黒化の最小再現

## 調べる症状

Babylon.jsの`PBRMaterial`でscreen-space subsurface scatteringを有効にしたとき、
SSS対象だけが元のalbedoより赤黒く見える現象を調べます。

`MMD_modoki`ではPMX材質、Frame Graph、独自PrePassパッチが同時に関係するため、
この最小再現ではそれらをすべて外します。

## コード

[`playground.js`](./playground.js)をBabylon.js Playgroundへ貼り付けます。
現行Playgroundのモジュール形式に合わせ、先頭の`export const createScene = ...`も含めてください。

- 左: 通常のPBRMaterial
- 右: 同じ値へScatteringだけを追加したPBRMaterial
- `S`: 右側のScatteringを切り替える
- `I`: IBLを切り替える
- `L`: DirectionalLightを切り替える

## 比較条件

| Backend | SSS無効 | SSS有効 |
| --- | --- | --- |
| WebGL2 | 未確認 | 未確認 |
| WebGPU | 未確認 | 未確認 |

追加比較:

| 条件 | 結果 |
| --- | --- |
| IBLあり | 未確認 |
| IBLなし | 未確認 |
| DirectionalLightあり | 未確認 |
| DirectionalLightなし | 未確認 |

## 固定している値

- 外部モデルなし
- 外部albedo textureなし
- `metallic = 0`
- `roughness = 0.72`
- `environmentIntensity = 1`
- `metersPerUnit = 1`
- diffusion profile: `Color3(0.0016, 0.00152, 0.00148)`
- Translucencyなし
- Refractionなし
- 独自Material Pluginなし
- Frame Graphなし

## Playground URL

- 未作成

## 判定メモ

- WebGPUだけ右側が赤黒くなる:
  - Babylon.jsのWebGPU/WGSL経路の不具合候補
- 両backendで右側が同程度に暗くなる:
  - diffusion profile、シーンスケール、公式SSSの合成仕様を再確認する
- この最小再現では正常:
  - `MMD_modoki`のFrame Graph、PrePass接続、独自パッチ、PMX変換を順に戻して差分を探す

関連調査:

- [`docs/pbr-skin-sss-red-dark-progress-2026-07-28.md`](../../docs/pbr-skin-sss-red-dark-progress-2026-07-28.md)
- [`docs/pbr-skin-sss-whiteout-countermeasures-2026-07-28.md`](../../docs/pbr-skin-sss-whiteout-countermeasures-2026-07-28.md)
