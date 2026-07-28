# PBR Skin SSS 赤黒化調査・途中経過

## 目的

`PBR Skin SSS`をPMXの肌材質へ割り当てたときに、元のテクスチャより肌が赤黒く見える問題について、
2026-07-28時点の切り分け結果と次の検証候補を記録する。

白飛び対策の詳細は
[PBR Skin SSS 白飛び対策・再発防止メモ](./pbr-skin-sss-whiteout-countermeasures-2026-07-28.md)
を参照する。

## 現在の結論

- 画面全体の白飛びは解消済み
- モデル読込時に大量発生していたPBR / WGSL警告も解消済み
- 肌の赤黒化は未解決
- 警告が出ない状態でも赤黒化が再現するため、シェーダー登録失敗と肌色の問題は別件
- PMX材質の`diffuse RGB`だけが原因ではない
- diffusion profileを白寄りの薄いピンクへ変更しても、赤黒さはほぼ変化しなかった

現状は実験プリセットとして保持し、`PBR Skin`や`PBR Standard`の既定挙動へは昇格させない。

## 解消済みの問題

### 画面全体の白飛び

SubSurface Configurationの`needsImageProcessing`を`false`に固定し、
SSSの後段でシーン全体へ画像処理が二重適用される経路を避けた。

### モデル読込時の大量警告

PBR材質のSSS対象マスク互換処理が、未登録のPBRシェーダーを参照した結果、
シェーダーURLからHTMLを取得してコンパイルしようとしていた。

GLSL / WGSLそれぞれのPBR vertex / fragment shaderを明示的に登録してから
互換処理を適用するように変更し、Electron / WebGPUで警告が出なくなったことを確認した。

この修正後も肌は赤黒いままなので、現在の見た目はコンパイル失敗時の代替描画ではない。

## 現在の実装条件

`PBR Skin SSS`では、原因を分離するためTranslucencyとRefractionを使っていない。

| 項目 | 現在値・方針 |
| --- | --- |
| Scattering | 有効 |
| Translucency | 無効、強度`0` |
| Refraction | 無効 |
| 材質のIBL影響度 | `1.0` |
| `metersPerUnit` | `0.08` |
| diffusion profile | `(0.0016, 0.00152, 0.00148)` |
| roughness | 最低`0.68` |
| `needsImageProcessing` | `false` |
| テクスチャあり材質の`albedoColor` | 白へ正規化 |

PMXモデルでは、MMDの`diffuse + ambient`合成を前提として`diffuse RGB`が暗く設定されている場合がある。
その影響を避けるため、アルベドテクスチャがある材質では`albedoColor`を白へ正規化している。
プリセットを外したときは元の値へ戻す。

それでも赤黒化が残るため、PMXの`diffuse RGB`は一因になり得るものの、今回の主因とは断定できない。

## 実機で確認できたこと

- SSS対象の顔・肌が、`PBR Standard`より赤く暗くなる
- 正面だけでなく、耳や顔の側面も一様に赤茶色へ寄りやすい
- IBL強度を上げると全体の明るさや反射感が先に変わり、肌の赤黒さだけを自然に解消できない
- diffusion profileを薄い暖色へ寄せても、テクスチャ本来の色より散乱色の印象が強く残る
- Translucencyを外すと赤みの発光感は減るが、暗化はむしろ目立つ場合がある
- 画面全体の白飛びとシェーダー警告を解消しても、肌の赤黒化は残る

### 白寄りの薄いピンクへの変更結果

2026-07-28の実機比較では、diffusion profileを
`(0.0016, 0.00156, 0.00152)`から`(0.0016, 0.00152, 0.00148)`へ変更した。

最大散乱距離を`0.0016`のまま維持し、赤、緑、青の順に散乱距離を少しずつ短くすることで、
強い赤色ではなく白を多く含む薄いピンク傾向を狙った。対象テストとlintは成功した。

しかし実機では、顔と肌の赤黒さに目立つ改善はなかった。この結果から、少なくとも現在の範囲では
RGB間の小さな散乱距離差が赤黒化の主因とは考えにくい。Babylon.jsのdiffusion profileは
表示へ加算する色指定ではないため、さらにピンク方向へ調整するより、完全な無彩色profileとの比較、
PrePassへ渡るirradiance、SSS合成前後の色空間とエネルギー配分を優先して確認する。

## 現時点の仮説

優先度順ではなく、未検証事項を列挙する。

1. `metersPerUnit`とモデル実寸の対応が合っておらず、散乱距離が肌の厚みに対して過大になっている
2. Babylon.jsの画面空間Scatteringがベースの拡散反射を置き換える割合が、期待する「薄い加算」より大きい
3. diffusion profileの値を色指定として扱いすぎており、実際にはチャンネル別の散乱距離として不適切
4. アルベドテクスチャのgamma / linear扱いとPrePass側の合成空間が一致していない
5. PMXからPBRMaterialへ変換した際のアルベド以外の値が、SSS有効時だけエネルギー配分へ強く影響している
6. モデル固有の法線、スケール、厚み表現が画面空間SSSと相性の悪いケースがある

## 次に行う比較

複数の値を同時に変更せず、同じカメラ、ライト、IBL、材質で一項目ずつ比較する。

1. 同じ材質を`PBR Standard`と`PBR Skin SSS`で切り替え、最終的なPBRパラメータとテクスチャのgamma設定をログで比較する
2. PMXから独立した、不透明な白または肌色のテスト球へ同じSSS設定を適用する
3. diffusion profileを完全な無彩色にして、赤みと暗化のどちらが残るか確認する
4. `metersPerUnit`だけを段階的に変更し、暗化と散乱幅の関係を見る
5. PrePassのirradiance / diffuse出力と、SSS合成後の出力を個別に可視化する
6. alpha、透明度、depth writeが関与していないことを再確認する

テスト球でも赤黒くなる場合はBabylon.js側のSSS設定または合成経路を優先して調べる。
PMX材質だけで起きる場合は、PMXからPBRMaterialへの変換値を重点的に比較する。

## 完了条件

- 画面全体の白飛びやシェーダー警告を再発させない
- 正面光では`PBR Standard`に近いベースの肌色を保つ
- 影側や輪郭付近にだけ、控えめな暖色の散乱が見える
- IBLのオン・オフや強度変更で急激に赤黒化しない
- SSSを外したときに元材質の値へ確実に戻る

## 関連実装

- `src/render/pbr-mmd-like-toon-settings.ts`
- `src/render/pbr-material-sss-prepass-mask-fix.ts`
- `src/mmd-manager.ts`

## 関連文書

- [PBR Skin 実装メモ](./pbr-skin-implementation-2026-07-23.md)
- [PBR Skin SSS 白飛び対策・再発防止メモ](./pbr-skin-sss-whiteout-countermeasures-2026-07-28.md)
- [PBR材質モード試行メモ](./pbr-material-mode-experiment-2026-07-20.md)
