# PBR 材質モード実験メモ 2026-07-20

## 2026-08-02 公開UIからの撤去

PBR材質モードは技術試作として内部実装、プロジェクト互換、テストを残すが、次バージョンでは
通常UIへ公開しない。材質パネルから読込モード選択を撤去し、次回モデル読込は常にMMD Standardを
使う。過去のPBRプロジェクトは読み込み可能なまま維持するが、PBR材質プリセットの編集UIは無効化する。

これは機能削除ではなく、未公開実験へ戻す判断である。将来PBRを再開する場合は、現コードと調査文書を
出発点に、MMD表示の本筋と分離した明示的な実験導線を改めて設計する。

同じUI整理として、方向ライト照度の上限をPBR比較用の400%からMMD向けの200%へ戻した。
背景メニューの環境ライトON/OFF、環境ライト詳細、外部HDRI読込、HDRI背景表示も通常UIでは隠す。
IBL/HDRIの内部実装と旧プロジェクト値は削除せず、将来の実験再開に備えて維持する。

## 目的

既定の `MMDモード` を置き換えず、モデル読込時に選べる `PBRモード` と
PBR専用プリセット枠を追加する。あわせて、背景表示とは独立して IBL ライティングを
ON / OFF し、同じ PMX / PMD を再読込して比較できる段階まで実装する。

## 2026-07-23 現状サマリー

この試行は、従来のMMD表示を置き換えるものではなく、PBR表現の成立条件と
MMD材質をPBRへ移したときの問題を調べる実験である。現時点では
モデル全体は`PBR Standard`へ統一し、材質別の`PBR MMD Like`と`PBR Skin`を比較できる。
IBLのPBR出力経路はPBR Standardの実モデル比較で成立を確認した。`PBR MMD Like`は
PMXのtoon左下1px色を標準Translucencyへ渡す材質別プリセットとして再実装した。`PBR Skin`は旧実装を
使わず、Babylon.js標準のTranslucency単独構成で2026-07-23に再調整した。画面空間Scatteringは
狭い拡散幅でも画面全体の白化とSkin材質の黒化が再現したため、再度無効化している。実モデルでの色・影・
透明度の確認前であり、既定表示へ昇格できる状態ではない。

### 試したこと

| 領域 | 試した内容 | 現在の状態 |
| --- | --- | --- |
| PBR読込 | babylon-mmdの`PBRMaterialBuilder`を基礎に、従来MMDモードと分離したPBRモードを追加 | モデル全体のPBR基準はStandardへ統一 |
| PBR Standard | babylon-mmd標準に近い比較基準を用意 | 比較用ベースとして維持 |
| PBR MMD Like | PMX固有情報を使う材質別プリセットとして試行 | PBR影響0.8、Translucency 0.02、toon左下1px色（なければambient色）を使用 |
| PBR Skin | 肌向けの材質別プリセットとして試行 | Standard表面設定を維持し、Babylon.js標準Translucencyを単独適用 |
| SSS | PrePass ScatteringとDiffuse transmissionを比較 | 狭いprofileでも描画破綻したため、Translucency単独へ復帰 |
| 透明材質 | 明示的半透明をSSS対象外にし、ほぼ不透明なalpha textureを低い閾値のalpha testへ変換 | プリセット固有変換を停止し、Standardの透明設定を復元 |
| 即時切替 | 読込済みPBRMaterialを再生成せず材質別プリセットを切替 | 再起動・モデル再読込なしで反映 |
| IBL | 中立cube texture、同梱HDR、外部HDR、ON/OFF、強度0〜4を比較 | PBR Standardの実モデルで方向・色・強弱を確認。基盤は成立 |
| HDRプリフィルタ | Electron / Viteで不足したHDR filtering shaderをGLSL / WGSLとも明示登録 | HTMLをWGSLとして読むvalidation errorは解消 |
| 方向ライト | 照度上限を4、光色RGBを最大200%相当まで拡張 | PBRの直接光は明るくできるが、暗部と影が目立ちやすくなった |
| 影ブレ対策 | 非SSS StandardMaterialのlegacy irradianceへ除外値を書き込む互換パッチを追加 | StandardMaterial誤判定は抑制したが、PBR受け面の影ブレは残る |

### 現在生じている問題

#### 1. IBLの実寄与（PBR Standard実モデルで確認済み）

観測できていること:

- 同梱HDRは`ready = true`になる。
- spherical polynomialは生成されている。
- `scene.environmentTexture`と`scene.iblIntensity`を操作する経路は存在する。
- `scene.iblIntensity`を`0.0`から`4.0`まで変えても、ユーザー確認では
  PBR MMD Likeの見た目に有意な差が出ていない。

2026-07-21に次の修正と診断を追加した。

- UIの`環境光強度`は、テクスチャ係数の`scene.iblIntensity`ではなく、PBRの
  diffuse irradianceとspecular radianceの最終合成へ掛かる`scene.environmentIntensity`
  を制御する。
- UI値が二重に乗算されないよう`scene.iblIntensity`は`1.0`へ固定する。
- 強度変更時に既存PBRMaterialのバインドを更新する。freeze済み材質は強制再バインドする。
- モデルを使わず、方向ライト寄与を0にしてPBR MMD LikeのMaterial Pluginを付けた
  合成PBR球を64 x 64のRenderTargetへ描画するsmoke probeを追加した。
- WebGPU実機で強度0の輝度`0.000`、強度1の輝度`0.872`、差分`0.872`を確認した。

これにより、HDRからBabylon PBRの最終出力までIBLが届くことは数値で確認できた。
その後、高コントラストな外部HDRでも実モデルだけ差が出ない原因を追跡し、次を確認した。

- babylon-mmdのPBR builderはMMDのspecular色をBabylon PBRの`reflectionColor`へ割り当てる。
- Babylon PBRはspecular radianceだけでなくdiffuse irradianceにも`reflectionColor`を乗算する。
- MMD材質で一般的な黒または低いspecular色は、結果としてHDRの拡散IBLまでほぼ0にする。
- 合成球probeは既定の白い`reflectionColor`を使っていたため、この実モデル固有条件を再現していなかった。

PBR Standard / MMD Like / Skinでは`reflectionColor`を白へ正規化し、MMD Like / Skinの鏡面の強さは
既存の`specularIntensity`で抑えるよう修正した。これによりStandardも暗いMMD specular色にIBLを
遮断されない。
外部HDRの拡散経路はGPU生成irradiance textureではなくCPU生成spherical polynomialへ統一した。
HDRの露出差はspherical polynomialから求めた平均輝度を基にtexture levelを自動正規化する。
基準平均輝度は`0.25`とし、テスト用HDRではlevelが約`0.019`になる。
MMD照明欄の環境光はHemisphericLightであり、PBR IBLとは別系統なので、値が0でもIBLを無効化しない。

#### 2. PBR MMD Likeで投影影がぶれる

以下は画面空間Scatteringを使っていた過去試行の分析である。現在のPBR MMD Likeは
Standardと同じ描画状態へ戻し、PBR SkinもScatteringを無効化しているため、現行経路には
このSSS処理を適用していない。

正常な表面下散乱であれば、影境界の拡散光が局所的かつ連続的に柔らかくなる。
輪郭が別位置へ複製されたように見える二重影や、一定方向へ伸びる筋は
期待するSSS表現ではない。現在の症状はシャドウマップの単純な低解像度化より、
鋭い影と灰色の輪郭がずれて重なる見え方である。

Babylon.js標準SSSは材質単体の処理ではなく、PrePassのirradianceを画面空間で
サンプリングして元画像へ再合成する。Babylon.js 9.2.0のWGSL実装は
滑らかな全画素ブラーではなく、次の固定サンプル方式を使う。

- `SSS_PIXELS_PER_SAMPLE = 4`
- 最大サンプル数`_SssSampleBudget = 40`
- golden spiralによる疎なサンプル配置
- サンプル回転の`phase = 0`が全画素で共通

散乱半径が画面上で大きくなると、広い範囲を最大40点だけで評価する。
全画素で同じサンプル方向を使うため、滑らかなブラーではなく一定方向の筋や
ゴースト状の輪郭として見える可能性がある。このスパースサンプリング不足が、
現在の「ぶれた影」の直接原因候補である。

当時の`PBR MMD Like`は、明示的な半透明を除く全PBR材質へ
`isScatteringEnabled = true`を設定する。このため、キャラクターだけでなく
床・建物・ステージなどの影を受けるPBR材質までMMD Likeになっている場合、
床に描かれた影の拡散光成分まで、大きなSSSカーネルと固定40サンプルで処理される。
SSSを床へ適用すること自体が二重影の正常な理由になるわけではないが、
広い平面上でスパースサンプリングのアーティファクトを目立たせる条件になる。

StandardMaterialのlegacy irradiance未初期化を除外値で補う対策は実装済みだが、
SSSを明示的に有効化したPBR MMD Likeの受け面は除外されない。現在の第一仮説は、
「SSSの適用範囲が広すぎる」ことと「画面上の散乱半径に対して40サンプルでは
不足する」ことの組み合わせである。PrePassの色分解・再合成が二重適用されている
可能性も、まだ除外しない。

次の切り分けは以下の順で行う。

1. 同じ受け面でSSSだけを無効化し、通常の投影影が一重になるか確認する。
2. 一時的に`metersPerUnit`を上げて画面上の散乱半径を小さくし、筋が縮むか確認する。
3. SSS sample count / diffusion profile indexを可視化し、40サンプル上限へ張り付いているか確認する。
4. SSS post-processがFrame Graphを含めて1回だけ適用されているか確認する。
5. PrePass colorとirradianceを個別表示し、元の影が両方へ重複していないか確認する。

最終的な適用範囲は、toon処理を全PBR MMD Like材質へ残したまま、SSSだけを
skeletonを持つキャラクター材質、`PBR Skin`、将来の髪・薄布用プリセットなどへ
限定する案が有力である。ただし、適用範囲を狭めるだけで原因調査を終えず、
キャラクター表面でも滑らかな散乱になる半径と再合成経路を確認する。

#### 3. SSSの色の効きが弱い（過去試行）

Babylon.jsの`scatteringDiffusionProfile`は、主に散乱距離とRGBごとの広がり方を
定義する値で、暗部へ新しい光を作る値ではない。入射光がほぼ0の場所では、
profileの彩度や強度だけを上げても色は出にくい。

過去の`PBR Skin`では赤系の拡散光源を`finalDiffuse`へ加えてからPrePass SSSへ渡すため、
比較的はっきりした赤みが得られている。一方、現在の`PBR MMD Like`はtoon色を
暗部へ乗算しているだけで、toon色由来の散乱光源はまだ追加していない。
さらにdiffusion profileも中立グレー`Color3(0.5, 0.5, 0.5)`なので、
toon色がSSSの色として見える効果は弱い。

次の候補は、toon左下1pxの色相・彩度を使った弱い拡散光源を暗部だけへ加え、
`finalDiffuse`から標準PrePass SSSへ渡す方式である。初期強度は`0.15`〜`0.20`程度を
上限とし、Emissive、Translucency、alpha blendは使わない。Skinは固定赤、
MMD Likeは作者指定toon色という役割分担にする。

### 現時点の検証範囲

- unit test、lint、critical typecheck、モデルなしElectron / WebGPU smokeは通過。
- HDR filtering shaderのvalidation error解消はモデルなし起動で確認。
- PBRの見た目、IBLの有効性、投影影、SSS色はユーザー実画面確認を正とする。
- エージェント側では権利上の懸念があるユーザーモデルを自動読込・解析しない。

## 公式仕様の確認

- babylon-mmd は `MmdStandardMaterialBuilder`、`StandardMaterialBuilder`、
  `PBRMaterialBuilder` の 3 種類を提供している。
- `PBRMaterialBuilder` は Babylon.js の `PBRMaterial` を生成する。
- MMD の diffuse / specular / ambient / alpha / texture はそれぞれ
  `albedoColor` / `reflectionColor` / `ambientColor` / `alpha` /
  `albedoTexture` へ対応する。
- MMD の reflect 値は PBR の roughness へ変換されるため、1 対 1 ではなく
  見た目の歪みが起こり得る。
- `PBRMaterialBuilder` の sphere texture、toon texture、outline の読込メソッドは
  公式実装では空である。この 3 要素は今回の PBR プリセットでも非対応とする。
- babylon-mmd が提供する材質モーフ proxy は MMD Standard 用と StandardMaterial 用の
  2 種類で、PBR 用はない。任意材質向けに `IMmdMaterialProxy` を実装できる。

参照:

- [babylon-mmd Material Builder](https://noname0310.github.io/babylon-mmd/docs/reference/loader/mmd-model-loader/material-builder/)
- [babylon-mmd Enable Material Morphing](https://noname0310.github.io/babylon-mmd/docs/reference/runtime/enable-material-morphing/)

## 実装仕様

### 材質モード

材質パネルの上部に次のモード選択を置く。

- `MMDモード`
  - 既定値。
  - 従来どおり `MmdStandardMaterialBuilder` と材質別 WGSL プリセットを使う。
- `PBRモード`
  - 次に読み込む PMX / PMD に `PBRMaterialBuilder` を使う。
  - 既に読み込まれているモデルの材質は置換しない。
  - 比較する場合は同じモデルを再読込する。

モードの選択値はローカル設定へ保存する。モデルごとの実際の材質モードは
プロジェクトにも保存し、プロジェクト読込時に同じ builder でモデルを再読込する。
旧プロジェクトや不正値は `MMDモード` として扱う。

### PBR プリセット

2026-07-21にモデル全体の`PBR MMD Like`を廃止し、PBRモードの読込基準を
`PBR Standard`へ統一した。PBRモデルでは材質ごとに次の3種類を割り当てる。

- `PBR Standard`
- `PBR MMD Like`
- `PBR Skin`

`PBR MMD Like`はPMXのtoon / ambientを利用する材質別プリセット、
`PBR Skin`は肌向け調整を将来追加する材質別プリセットとして位置づける。
割り当ては材質キー単位でプロジェクトの`materialShaders`へ保存する。

`PBR MMD Like`はPBR Standardの表面設定を基準とし、材質ローカルの
`environmentIntensity = 0.8`と、toon左下1px色を使う標準Translucency 0.02を加える。
`PBR Skin`はStandardのalpha、transparencyMode、roughness、specularIntensityを維持したまま、
Babylon.js標準の低強度Translucencyを有効にする。両プリセットとも独自Material Plugin、
画面空間Scattering、Emissive、Refraction、alpha補正、暗部補正は使わない。

旧プロジェクトにモデル全体の`pbrMaterialPreset: "pbr-mmd-like"`が残っている場合は、
読込時に全材質へ材質別`PBR MMD Like`を割り当てる互換移行を行う。その後、旧来の
`materialShaders`に明示指定があれば、材質別指定を優先する。

### 過去の試行: PBR MMD Likeの材質別toon影色と画面空間SSS

以下は2026-07-20時点の試行記録であり、現在のプリセットでは無効化している。

babylon-mmdの`PBRMaterialBuilder`はPMX / PMD材質ごとに別の`PBRMaterial`を生成する。
`PBR MMD Like`は各材質へ共通のMaterial Pluginを追加し、材質ごとのtoonテクスチャまたは
PMX / PMDのambient色をuniformとして渡す。toonテクスチャがある場合は画像サイズから
左下1テクセルの中心`U=0.5/width, V=0.5/height`をシェーダー内で直接参照する。

材質シェーダーはPBRの直接拡散光`finalDiffuse`だけを対象とし、暗部ほどtoon影色を
強く乗算する。IBL拡散光とスペキュラーはこのtoon処理から分離する。

- `isTranslucencyEnabled = false`
- `translucencyIntensity = 0`
- `isScatteringEnabled = true`
- `scatteringDiffusionProfile = Color3(0.5, 0.5, 0.5)`
- `metersPerUnit = 0.08`
- `roughness`は元値を維持しつつ下限`0.82`
- `specularIntensity`は元値を維持しつつ上限`0.3`
- `PBR Standard`へ戻すと、元のSubSurface・alpha・transparencyMode・roughness・specularIntensityを復元する

PBR MMD Likeでは、丸め誤差やモデル側のほぼ不透明な設定を吸収するため、
材質alphaが`0.95`以上なら不透明面として扱う。テクスチャalphaが必要な場合も
`ALPHABLEND`ではなく`ALPHATEST`として扱う。これにより髪などの抜き部分は維持しつつ、
残った画素は不透明面として深度を書き、背後の背景をブレンド透過させない。
材質alphaが`0.95`未満の材質は明示的な半透明として元の設定を保持する。

材質builderの完了後には、DDS / BMP / PNG互換用の共通alpha補正が動く。この補正が
顔や髪の材質を再び`ALPHABLEND`へ戻す場合があるため、PBR MMD Likeではモデル材質の
最終収集後に不透明 / alpha test設定を再適用する。PBR Standardの透明判定には
このPBR MMD Like固有補正を適用しない。

alpha testのカットオフはPBR MMD Likeだけ`0.02`とする。Babylon.js PBRの一般的な
カットオフ値をそのまま使うと、髪テクスチャの低alphaな毛先まで破棄されやすいためである。
0.02未満だけを完全に抜き、残った画素は不透明面として描画する。これは半透明ブレンドを
復活させる設定ではないため、毛先の濃淡が完全には再現されない制約は残る。

Babylon.jsのSSSは材質内だけで完結せず、PrePassを使うscene全体のポストプロセスである。
旧設定ではMMD Likeのprofile最大値`0.8` / `metersPerUnit = 0.04`に加え、Skin指定時には
scene共通値が`0.025`まで下がっていた。これにより散乱半径が大きくなり、近接する顔・髪・服の
照明が相互に混ざって透過のように見え、受け面の影にもブレが出ていた。

MMD LikeからSSS自体は外さず、profileを中立`0.5`、scene scaleを`0.08`へ補正する。
Skinも同じscene scaleを使い、赤いprofileのチャンネル差によってMMD Likeより長く強い散乱を
作る。これによりscene共通の`metersPerUnit`がSkin追加時だけ急変しない。

影受け面のブレには、Babylon.jsの`StandardMaterial`用
WebGPU pre-pass shaderは`PREPASS_IRRADIANCE_LEGACY`を明示的に書かず、未初期化alphaが
0になる。SSS post-processはalphaが1未満の画素を散乱対象とするため、床やステージの
非SSS StandardMaterialまでdiffusion profile 0として処理され、投影影が二重にぼけていた。
アプリ起動時にStandardMaterial shaderへ除外値
`PREPASS_IRRADIANCE_LEGACY = vec4(0, 0, 0, 1)`を補い、PBR側のSSSを維持したまま
非SSS受け面をpost-processから除外する。GLSL経路にも同じ補正を入れる。ただし、
PBR MMD Like自体を割り当てた床やステージはSSS対象のままなので、実画面では影ブレが
残っている。現在はSSSの適用範囲をキャラクター・材質別指定へ狭める必要がある。

toon影色はシェーダー内で彩度を
`1.35`倍へ上げる一方、乗算強度を`0.72`から`0.62`へ下げ、黒く沈めるより色を伴って
見える状態を優先する。

PBRモデルの読込時は、どのプリセットでもtoonテクスチャと元のSubSurface状態を
材質インスタンスへ保持する。PBR種類のプルダウンを変更すると、読込済みの全PBRモデルへ
同じ `PBRMaterial` インスタンスのまま即時適用する。`PBR Standard`へ戻す
場合は保持していた元のSubSurface、roughness、specularIntensityを復元するため、
アプリ再起動やモデル再読込は不要。
材質方式の `MMDモード` / `PBRモード` 切替だけは材質クラスが異なるため、引き続き
次回モデル読込へ適用する。

### 2026-07-23再調整: PBR Skinの標準Translucency

前回のSkin用Material Plugin、赤い拡散光加算、roughness / specular補正、alpha変換は
再利用しない。画面空間Scattering併用時にIBLなしでは暗く、IBLありでは赤が過剰になることを
実モデルで確認したため、比較用にTranslucency単独へ切り替えて次だけを行う。

- `isTranslucencyEnabled = true`、`translucencyIntensity = 0.16`とする
- `translucencyColor = Color3(1.0, 0.68, 0.58)`、厚み範囲を`0.0`から`0.3`とする
- Skin材質は`environmentIntensity = 0.80`とし、透過光を元のalbedoでも色付けする
- `isRefractionEnabled = false`とし、alpha / transparencyModeは変更しない
- Babylon.js 8以降の現行計算を使い、`legacyTranslucency = false`とする
- `isScatteringEnabled = false`とし、PrePass Scatteringを使わない

SSSは元材質のalpha、alpha texture、transparencyMode、roughness、specularIntensityを変更しない。
したがって、元材質が半透明ならその透明度は残るが、Skinプリセット自身が新たな透過を作ることはない。
StandardまたはMMD Likeへ戻すと、保存していたSubSurface状態を復元する。

単体試験では実`PBRMaterial`と`Scene`に対してPrePassを生成しないこと、Translucency有効、
Refraction無効、元のalpha維持を確認する。実モデルの目視確認では次を重点的に見る。

- 暖色の拡散透過が照明のある領域から自然に出るか
- 逆光側の頬・耳・腕に赤い透過光が出るか
- 背景・目・髪がSkin材質越しに透けないか
- 床や顔の影が二重にぶれないか
- Frame Graph効果の有無でSSSが二重適用されないか

現行値、Scattering試行の失敗要因、HDRIとの相互作用は
[PBR Skin 実装メモ](./pbr-skin-implementation-2026-07-23.md)へ分離している。

### 過去の試行: PBR Skinの材質別の強い赤色SSS

以下は2026-07-20時点の試行記録であり、現在のプリセットでは無効化している。

`PBR Skin`はPBRモデルの選択材質だけへ即時適用する。不透明SSSとして扱い、
背景や背面を透過させない。

- `isTranslucencyEnabled = false`
- `isScatteringEnabled = true`
- `scatteringDiffusionProfile = Color3(1.0, 0.16, 0.08)`
- `metersPerUnit = 0.08`
- `roughness`は元値を維持しつつ下限`0.72`
- `specularIntensity`は元値を維持しつつ上限`0.38`
- 材質alphaが`0.95`未満の明示的な半透明材質はSSS対象外
- alpha textureを使う不透明材質はPBR MMD Likeと同じくalpha testで扱う

赤チャンネルを最大、緑・青を低くしたdiffusion profileにより、肌の影側へ
かなり強い赤系の散乱を入れる。ただしdiffusion profileは発光色や影の明るさではなく、
散乱距離とRGB特性を指定する値であり、入射光がほぼ0の完全な暗部を単独では持ち上げない。
そこでSkin用Material Pluginは暗部ほど強くなる赤系の拡散光源
`Color3(1.0, 0.35, 0.22) * 最大0.35`を`finalDiffuse`へ加える。これはPrePassの
irradianceへ書かれ、最終的にBabylon.js標準SSSで画面空間散乱される。Translucencyや
alpha blendによる擬似透過は使わない。
`ベースPBRを使用`へ戻すと、現在の上段ベースがStandardなら元設定、
MMD Likeならtoon影色＋中立SSSへ即時復元する。

Babylon.js標準SSSのdiffusion profileは最大5個だが、これは散乱距離とRGB波長特性の
プロファイル数であり、toon影色の数ではない。toon影色は材質シェーダー側で自由に扱う。
現状のSkinプリセットは全材質で同じ赤系プロファイルを共有するため、MMDモデルの材質数には
制限されない。

SSS使用中にFrame Graphを使う場合はscene-color RenderTargetでもカメラPostProcessを有効にし、
SSS適用後のscene colorをFrame Graphへ渡す。SSR / DoFの停止処理がPrePassRendererを
破棄しないよう、散乱材質が存在する間はPrePassを維持する。
GIのReflective Shadow Mapが内部生成する材質複製はカメラ用PrePassへ描画されないため、
画面空間SSSを無効化する。これにより、`PBR Standard`へ戻したときに内部材質だけが
散乱を維持してPrePassを残すことを防ぐ。

参照:

- [Babylon.js Mastering PBR Materials: Sub Surface](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/masterPBR/)
- [Babylon.js PBRSubSurfaceConfiguration API](https://doc.babylonjs.com/typedoc/classes/BABYLON.PBRSubSurfaceConfiguration)

### PBR 材質モーフ

`PbrMaterialProxy` を追加し、次のチャンネルを PBR 材質へ反映する。

- diffuse RGB / alpha → albedo RGB / alpha
- specular RGB → reflection RGB
- ambient RGB → ambient RGB
- shininess → roughness
- alpha 0 の材質 → 参照 mesh を非表示

sphere / toon / edge と各テクスチャの加算・乗算モーフは、公式 PBR builder の
非対応範囲に合わせて反映しない。

### IBL ライティング

- 背景メニューに独立した `環境ライトを使用` チェックを置く。
- ON / OFF と強度は `背景 > 環境ライト詳細...` からも操作できる。
- 新規環境の初期値は ON。保存済み設定と既存プロジェクトの明示値は維持する。
- OFF では `scene.environmentTexture` を退避して `null` にする。
- ON では退避済みの environment texture を復元する。
- 既定ソースは同梱の `src/assets/ibl-shadows/yamagata-field-20181231-1137-2k.hdr` とする。
- 同梱 HDR は `HDRCubeTexture` で読み込み、PBR の粗さ別反射に必要なプリフィルタを
  読み込み時に生成する。
- 同梱 HDR の初期化または読み込みに失敗した場合だけ、中立グレー 1 x 1 cube texture
  へフォールバックする。
- 背景の `BackgroundMaterial`、空の表示、背景画像・動画の表示には影響させない。
- ON / OFF はローカル設定とプロジェクトの `lighting.environmentLightingEnabled`
  へ保存する。
- `環境光強度`スライダーを`0.0`〜`4.0`で設け、メイン`照度`との積をBabylon.jsの
  `scene.environmentIntensity`へ即時反映する。既定値は`1.0`。
- `scene.iblIntensity`は`1.0`に固定し、UI値との二重乗算を避ける。
- 強度変更時は既存PBR材質のuniform再バインドを要求し、読込済みモデルにも即時反映する。
- 強度はローカル設定とプロジェクトの`lighting.environmentLightingIntensity`へ保存し、
  旧プロジェクトでは`1.0`へフォールバックする。

外部 HDRI は背景メニュー、通常ファイル読込、ドラッグ＆ドロップから読み込める。
読み込んだ texture は同じ退避・復元経路へ接続し、同梱 HDR より優先する。

### メイン方向ライトの光量

Babylon.jsのDirectionalLightは、PBRかつ既定の`INTENSITYMODE_AUTOMATIC`では
照度（illuminance）として扱われ、`intensity`は線形に拡散光へ反映される。
従来の上限`2.0`はBabylon.js側の制約ではなくアプリ独自のクランプだったため、
照度スライダーとランタイム上限を`4.0`へ拡張する。既定値は`1.0`のまま維持し、
既存プロジェクトの見た目は変えない。

方向ライトの`specular`は現状0のため、直接光側では主に拡散光を増やす。
PBRでは同じ照度をIBL強度にも乗算し、キーライトだけでなくHDRI由来の影部もまとめて
明るく・暗くする。HDRI背景の明るさはこの照度から独立させる。

光色RGBスライダーは内部的に`128 = 100%`、`255 = 200%`として保存されていたが、
従来はDirectionalLightへ反映する直前に各成分を100%へ丸めていた。RGBによるHDR光量
調整を有効にするため、この最終クランプを200%へ揃える。したがって照度`4.0`かつ
光色`255 / 255 / 255`では、直接拡散光へ最大で基準の約8倍が入力される。
トーンマッピング後の画面上の明るさは線形8倍とは限らず、白飛びには注意する。

## UI 上の制約

既存の WGSL プリセットは `MmdStandardMaterial` のシェーダー断片を差し替える機構で、
`PBRMaterial` への切替機構ではない。PBRで読み込んだモデルを選択した場合は同じ材質別UIを
PBR用へ切り替え、WGSLプリセットを隠して`PBR Standard`、`PBR MMD Like`、`PBR Skin`を表示する。
選択材質 / 全材質への割当ボタンはPBRでも有効で、WebGPU固有の可否判定には依存しない。
材質の表示 / 非表示も引き続き使える。

## 確認項目

- [x] `MMDモード` が既定値のまま
- [x] 不正な材質モードを `MMDモード` へフォールバック
- [x] モデル全体のPBR基準をPBR Standardへ統一
- [x] PBR MMD Like / PBR Skinを材質別割り当てへ分離
- [x] PBR MMD Like / PBR Skinの材質別プロジェクト保存 / 読込
- [x] 旧モデル全体PBR MMD Like指定を全材質指定へ互換移行
- [x] MMD LikeをPBR Standardと同一の描画状態へ戻す
- [x] PBR MMD Likeをtoon左下1px色と標準Translucencyで再実装
- [x] PBR SkinをBabylon.js標準PrePass Scatteringで試作（現在は失敗記録として無効化）
- [x] PBR Skinを低強度の標準Translucency単独へ変更し、Refraction / alpha変更なしで適用
- [x] toon影色を材質別PBRシェーダーで処理
- [x] PBR Skinの`isScatteringEnabled`を無効化し、不要なPrePassを生成しない
- [x] Scattering試作用の`metersPerUnit = 0.08`を実行経路から除外
- [x] 実描画でTranslucency-onlyのIBL ON / OFFを比較し、暫定基準として採用
- [x] 旧Skin用の赤い拡散光源・Material Pluginを実行経路から除外
- [x] StandardMaterialの未初期化legacy irradianceを補正し、非SSS受け面の誤判定を抑制
- [x] PBR Skin固有のalpha / transparencyMode変換を行わない
- [x] 読込済みPBRモデルのプリセットを再読込なしで即時切替
- [x] PBR 材質モーフ proxy の色、透明度、roughness、reset
- [x] 材質方式と IBL ON / OFF のプロジェクト保存 / 読込
- [x] unit test
- [x] lint
- [x] critical typecheck に未定義名エラーなし
- [x] Electron smoke 起動（WebGPU / Bullet MPR）
- [x] 同梱 HDR が ready かつ spherical polynomial 生成済みになることをモデルなしsmokeで確認
- [x] IBLのみのPBR MMD Like合成球で強度0 / 1の最終画素輝度差をWebGPU smokeで確認
- [x] PBRモデルのMMD Like → Standard → MMD Like即時切替smoke
- [x] WebGPU + WGSL + PrePass SSS + Frame Graphでvalidation errorなし
- [ ] alpha test化後の実画面確認（ユーザー操作で確認）
- [ ] PMX / PMD を MMD Standard と PBR Standard で実読込して比較
- [ ] 表情・材質モーフを含む VMD の PBR 表示確認
- [ ] 透過材質、DDS / BMP / PNG テクスチャの PBR 表示確認
- [x] reflectionColor補正後のPBR StandardでIBL強度差をWebGPU実画面比較
- [ ] 高コントラストHDRでIBL diffuse / specular寄与を個別確認
- [x] PBR MMD LikeのSubSurfaceを材質別指定へ限定
- [x] toon左下1px色由来のTranslucencyをPBR MMD Likeへ追加
- [x] 外部 HDRI 読込

## 2026-07-21 外部 HDRI 読込

`背景 > HDRI詳細...` から外部 `.hdr` を選択し、PBR の環境ライティングへ
即時適用できるようにした。選択パス、IBL ON / OFF、環境光強度はプロジェクトへ保存する。
外部 HDR の解除時は内蔵の2K TrueHDRIへ戻す。HDRI背景表示と背景輝度の独立調整に対応し、回転は未対応。

Git 管理外の `local-references/hdri` にある実 HDR を Electron / WebGPU smoke へ渡し、
実ロード、3 秒安定、validation error なし、合成 PBR 球の IBL 輝度差
`0.0` → `1.0` を確認した。詳細は
[IBL / 外部 HDRI 現行仕様・調査記録](./external-hdri-environment-lighting-2026-07-21.md)を参照。

## 2026-07-20 同梱 HDR への切替

中立グレーの `RawCubeTexture` とCPU生成 spherical polynomialでは、実画面上で
`scene.iblIntensity = 0.0` と `4.0` の差が確認できなかった。そのため通常の環境ライトを
同梱 `white.hdr` へ切り替えた。

2026-07-23に、既定IBLをCC0 TrueHDRI `YamagataField_20181231_1137`の2K派生版へ
更新した。`white.hdr` は方向性を制御した比較用の手続き生成アセットとして残す。

Babylon.js公式の `.hdr` 直接利用例に合わせ、`HDRCubeTexture` の
`generateHarmonics = true`、`gammaSpace = false`、`prefilterOnLoad = true` を使用する。
`.env` と比べると起動時の変換コストはあるが、まず既存アセットでIBLの有効性を確認する
実験段階として採用した。

モデルを読み込まないElectron/WebGPU smokeでは次を確認した。

- environment texture名: `mmdModokiBundledEnvironment`
- texture ready: `true`
- spherical polynomialあり
- WebGPU validation errorなし
- アプリログのwarning / errorなし
- 合成PBR球の強度0 / 1の画素輝度差あり（`0.000` → `0.872`）

実モデルでの明暗差と質感はユーザー操作で引き続き確認する。

## 現時点の判断

PBRモードは MMD 再現の代替ではなく、ライティングや質感を試すための実験領域として
隔離する。モデル全体の基準はPBR Standardへ一本化し、PMX固有情報を使う表現は
材質別`PBR MMD Like`、肌向け表現は材質別`PBR Skin`へ局所化する。
現在は両プリセットともStandardと同じ描画に戻しており、旧toon / SSS実装は実行経路から
外している。将来再開する場合は、材質単位の適用範囲、影ブレ、透明度、IBL応答を
個別に検証し、安定した機能だけを段階的に有効化する。
