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

## 2026-07-29: backend比較とPrePass irradiance保持

WebGPU固有の不具合かどうかを切り分けるため、開発時だけ描画backendを固定できるようにした。
未指定時の挙動は従来どおりWebGPU優先、利用できない場合はWebGL2へフォールバックする。

PowerShellでは次のように指定する。

```powershell
$env:MMD_MODOKI_RENDERER = "webgl2"
npm.cmd start
```

WebGPUを必須にして、暗黙のWebGL2フォールバックを避ける場合は次のようにする。

```powershell
$env:MMD_MODOKI_RENDERER = "webgpu"
npm.cmd start
```

比較後は環境変数を削除する。

```powershell
Remove-Item Env:MMD_MODOKI_RENDERER -ErrorAction SilentlyContinue
```

この設定はエディタだけでなくPNG連番、WebMの別windowにも引き継ぐ。
WebGPUとWebGL2の両方でElectron起動スモークと内蔵環境光プローブが成功した。
実PMXの描画品質は自動スモークの対象外なので、同じモデル、カメラ、ライト、IBL強度での目視比較が必要である。

### Babylon.js 9.2のPrePassで確認したこと

現在使用中のBabylon.js 9.2のPBR PrePassでは、SSSへ渡すirradianceを
GLSL / WGSLのどちらでも`0.0～1.0`へクランプしている。
一方、SSS有効時のPBR本体ではクランプ前のirradianceを最終色から除去している。

HDRな方向ライトやIBLでirradianceが`1.0`を超えた場合、次の非対称が生じる可能性がある。

1. PBR本体からはクランプ前の光量を除去する
2. SSS PrePassには`1.0`までしか保存しない
3. Scattering合成時に失われた光量を復元できず、`PBR Standard`より暗くなる

このクランプ自体はGLSL / WGSL共通なので、赤黒化の仕組みをWebGPU固有とは断定できない。
ただし、PrePassのformat、WGSLコンパイル、backend固有の実装差によって症状の強さが変わる可能性は残る。

### 今回の実験対策

`SS_SCATTERING`有効材質だけ、PrePassへ保存するirradianceの上限を`1.0`から`30.0`へ広げた。
下限は`0.0`のまま、非SSS材質は従来どおり`0.0～1.0`とし、通常のPBR描画へ影響を広げない。

`30.0`は見た目を明るくする係数ではなく、HDR値をPrePassで失わないための安全上限である。
この変更で赤黒化が解消するか、明部の白飛びや色転びが増えないかは実PMXで確認する。
改善しない場合はパッチを恒久対策とせず、PrePass可視化とbackend比較の結果を優先する。

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
7. `MMD_MODOKI_RENDERER=webgpu`と`webgl2`で同一条件を比較し、backend差の有無を記録する
8. HDR irradiance保持パッチの有無で、肌の明度、彩度、白飛びを比較する

テスト球でも赤黒くなる場合はBabylon.js側のSSS設定または合成経路を優先して調べる。
PMX材質だけで起きる場合は、PMXからPBRMaterialへの変換値を重点的に比較する。

## 2026-07-29: 未ぼかし照度を残すSSS合成実験

実PMXでHDR irradiance保持パッチを試した結果、赤黒化に目立つ改善はなかった。
そのため、PrePassの`0.0～1.0`クランプは改善余地ではあるものの、今回の主因とは考えにくい。

Babylon.js 9.2の画面空間SSSは、PBR本体の最終色から対象材質の拡散照度を一度除去し、
SSS PostProcessで周辺画素を使ってぼかした照度を再構成する。
これは期待していた「通常のPBR結果へ散乱光を少し加える」処理ではなく、
拡散成分をぼかした結果で置き換える処理に近い。

再構成結果が元のPBR照明から大きく外れると、材質全体の暗化やdiffusion profile方向への色寄りが起き得る。
そこでGLSL / WGSL双方のSSS最終合成を次の比率へ変更した。

- 元画素の未ぼかし照度: `85%`
- Babylon.js公式の散乱済み照度: `15%`

アルベド、PBR直接光、IBLなどの元応答を大部分残し、SSSは輪郭や局所的な柔らかさとして弱く混ぜる。
この値は`PBR_MATERIAL_SSS_SCATTERING_BLEND_STRENGTH = 0.15`として固定し、
プリセット適用時の診断ログにも記録する。

Babylon.jsのScattering PostProcessはscene単位で動くため、この合成比率も材質単位ではなくscene全体に作用する。
現状は`PBR Skin SSS`だけがScatteringを利用する実験段階なので許容するが、
将来ほかのSSS材質を追加する場合はMaterial Pluginや独自passを含めて分離方法を再検討する。

この対策は自動テストでGLSL / WGSLへの注入と多重適用防止を確認できるが、
赤黒化、散乱の見え方、影ぶれの実描画品質は実PMXで目視確認する必要がある。

## 2026-07-29: PBRベース色保持の試行と撤回

未ぼかし照度85%と散乱済み照度15%の補間を実PMXで確認したが、見た目に変化がなかった。
原因は、PBR PrePassの段階で通常の拡散照度が最終色から既に除去されており、
SSS PostProcess内で未ぼかし照度へ寄せても、`PBR Standard`の完成色そのものには戻らないためと判断した。

そこで一度、SSS用PrePassへ渡す色を通常のPBR最終色のまま保持し、
SSS PostProcessでは散乱によって増えた明るい差分だけを加える構成を試した。

```text
base = PBR Standard相当の入力色
delta = max(filteredIrradiance - centerIrradiance, 0) * 0.15
result = base + albedo * delta
```

実PMXで確認した結果、肌は改善せず、従来よりさらに暗い茶黒色になった。
見た目は完成したPBR色というより、加算合成前または元テクスチャを戻す前の中間層に近かった。
この結果から、`PREPASS_COLOR`へ`finalColor`をそのまま保存すれば
`PBR Standard`相当の完成色を保持できる、という前提がBabylon.jsのSSS再構成契約と整合していなかったと判断した。

この試行は撤回し、次へ戻した。

- `PREPASS_COLOR`はBabylon.js標準どおり`finalColor.rgb - irradiance`
- SSSのフォールバックは`inputColor + albedo * centerIrradiance`
- 最終合成は未ぼかし照度85%、散乱済み照度15%

開発中に既にコンパイルされたSSS PostProcessが古いシェーダー文字列を保持する可能性を分離するため、
`PBR Skin SSS`適用時の明示的な再コンパイルは維持する。
診断ログは`compiledSssCenterBlendPresent`を記録し、
実際のコンパイル済みfragment sourceが85/15合成へ戻っているか確認できるようにした。

GLSL / WGSL双方について、失敗したベース色保持・差分加算が既に注入された状態から、
標準PrePass契約と85/15合成へ戻せること、多重適用されないことを単体テストで確認する。
赤黒化の主因は未解決であり、今後はPrePass各attachmentとSSS合成直前・直後を可視化して、
どの段階で元テクスチャまたは照度成分が失われているかを切り分ける必要がある。

## 2026-07-29: Babylon.js公式情報・フォーラム再調査

### 結論

今回の浅黒化は、diffusion profile、IBL強度、PMXの`diffuse RGB`だけで説明するより、
**SSS用に減算した照度をPostProcess側で正しく復元できていない**可能性を第一候補にする。

実画面で見えた「加算合成前の下地がそのまま出ている」「元テクスチャを戻す前の中間層に見える」
という特徴は、Babylon.js 9.2.0のSSS再構成手順と整合する。

Babylon.jsの画面空間Scatteringは材質単体で完結しない。概ね次の順序で処理する。

1. PBR材質のPrePass出力で、`finalColor`から拡散光とIBL由来の`irradiance`を減算する
2. 減算後の色をcolor attachmentへ、`irradiance`とdiffusion profile番号をirradiance attachmentへ保存する
3. SubSurface Scattering PostProcessでirradianceを画面空間にぼかす
4. ぼかしたirradianceへalbedoを掛け、減算後のcolorへ再加算する

Babylon.js 9.2.0の`pbrBlockPrePass`には、Scattering有効時に
`PREPASS_COLOR = finalColor.rgb - irradiance`とする処理がある。
したがって3～4の再合成が欠落、二重化、順序違い、または別RenderTargetへ適用された場合は、
減算後の暗い中間色だけが最終画面へ残り得る。

参照:

- [Babylon.js 9.2.0 WGSL PBR PrePass](https://github.com/BabylonJS/Babylon.js/blob/9.2.0/packages/dev/core/src/ShadersWGSL/ShadersInclude/pbrBlockPrePass.ts)
- [Babylon.js 9.2.0 WGSL SubSurface Scattering PostProcess](https://github.com/BabylonJS/Babylon.js/blob/9.2.0/packages/dev/core/src/ShadersWGSL/subSurfaceScattering.fragment.ts)
- [Babylon.js PBRSubSurfaceConfiguration API](https://doc.babylonjs.com/typedoc/classes/BABYLON.PBRSubSurfaceConfiguration)

### フォーラムで確認できた仕様と制約

2025年4月の公式フォーラムでは、Babylon.js開発者が画面空間SSSを既存の対応機能として案内し、
公式例のscene scaleを`scene.enableSubSurfaceForPrePass().metersPerUnit = 0.07`へ修正している。
このため、現行Babylon.jsでPBR Scattering自体が一律に肌を浅黒くする仕様とは考えにくい。
`metersPerUnit`は実寸との対応を取る重要な入力だが、今回の均一な暗化はscene scaleだけでは説明しにくい。

- [Support Screen Space Subsurface Scattering](https://forum.babylonjs.com/t/support-screen-space-subsurface-scattering/57744)

Babylon.js開発者は、PBRの「true SSS」にはPBRMaterialとPrePass Rendererが必要であり、
材質シェーダー内だけでは完結しないと説明している。

- [How can I make SSS effects in NodeMaterial?](https://forum.babylonjs.com/t/how-can-i-make-sss-effects-in-nodematerial/25151)

Scatteringはscene単位のPostProcessを利用するため、SSSを割り当てていないUtilityLayerへも
影響し得るという制約が報告されている。またOITとの非互換や、過去の回帰修正も確認できる。
これは、SSSが局所的な材質属性ではなく、PrePassと最終合成順序に強く依存することの裏付けになる。

- [PBR Material with isScatteringEnabled breaks UtilityLayer](https://forum.babylonjs.com/t/pbr-material-with-subsurface-isscatteringenabled-breaks-the-utilitylayer-from-the-3d-gui-even-when-not-assigned/30102)
- [OrderIndependentTransparency crashes scene](https://forum.babylonjs.com/t/orderindependenttransparency-crashes-scene/57242)

モデルのworld scaleはthickness計算にも影響する。`maximumThickness`を一定に保っても、
mesh scaleが変われば見た目を維持するための補正が必要になる。
これは散乱幅の検証項目として残すが、現在の浅黒化の第一原因とはしない。

- [Scattering with scaling Model](https://forum.babylonjs.com/t/scattering-with-scaling-model/58568)

SSSとalphaの併用にも既知の難しさがある。肌は不透明材質として検証し、
髪の毛先などalphaを持つ材質は同じ基準試験へ混ぜない。

- [About pbrMaterial of SSS](https://forum.babylonjs.com/t/about-pbrmaterial-of-sss/25385)

今回確認した範囲では、現行Babylon.jsについて
「WebGPUではPBR Scatteringが常に浅黒くなる」という一般的な既知不具合は見つからなかった。
WebGPU固有問題を否定はできないが、まずアプリ側のPrePass/PostProcess接続を切り分ける。

### 現在のアプリ実装との相違

現在の`MMD_modoki`は公式SSSの無改造経路ではない。

- `src/render/subsurface-frame-graph-policy.ts`
  - Frame Graph scene-color targetの`useCameraPostProcesses`を`false`にしている
  - SubSurface Configurationの`needsImageProcessing`も`false`にしている
- `src/render/pbr-material-sss-prepass-mask-fix.ts`
  - GLSL / WGSLのPBR PrePass出力をグローバルに置換している
  - SubSurface Scattering PostProcessの最終合成も85/15へ置換している
  - module import時に互換パッチを即時適用している

画面全体の白飛び対策として`needsImageProcessing = false`を維持する根拠はあるが、
Frame Graph側でcamera post-processを外したscene colorが、Babylon.jsのSSS再合成後なのか、
再合成前なのかをまだ可視化できていない。

そのため、次の二点を同時に変更しながら色調整を続けるべきではない。

- 材質入力: albedo、diffusion profile、IBL、scene scale
- 合成経路: PrePass、SSS PostProcess、Frame Graph scene color、独自シェーダーパッチ

### 次回の最小診断

権利物のモデルを使わず、Babylon.jsで生成した不透明な球だけを使う。
同一カメラ、同一ライト、同一IBL、同一PBRパラメータで次を比較する。

| 比較 | 目的 |
| --- | --- |
| WebGL2 + Classic + 公式SSS | 公式経路の基準画像 |
| WebGPU + Classic + 公式SSS | WebGPU固有差の確認 |
| WebGPU + Frame Graph + 公式SSS | Frame Graph接続差の確認 |
| WebGPU + Frame Graph + 現在の互換パッチ | 独自パッチの影響確認 |

判定基準:

- WebGPU Classicが正常でFrame Graphだけ暗い: Frame Graphのscene colorまたはPostProcess順序が原因
- WebGL2が正常でWebGPU Classicも暗い: Babylon.js 9.2.0のWebGPU経路またはWGSL差を優先調査
- 公式の球は正常でPMXだけ暗い: PMXからPBRMaterialへの変換値、scale、texture color spaceを優先調査
- 公式経路からすべて暗い: scene scale、ライト、IBL、image processingを公式Playgroundと値単位で比較

合わせて次の中間出力を一時的に可視化する。

1. PBR最終色
2. `PREPASS_COLOR`
3. `PREPASS_IRRADIANCE`
4. SSS PostProcess直後
5. Frame Graph最終合成後

この比較が終わるまでは、diffusion profileの色、IBL影響度、85/15比率を追加調整しない。
どの段階で色または照度が失われるかを確定してから、肌向けの微調整へ戻る。

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
