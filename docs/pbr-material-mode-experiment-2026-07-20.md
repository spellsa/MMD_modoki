# PBR 材質モード実験メモ 2026-07-20

## 目的

既定の `MMDモード` を置き換えず、モデル読込時に選べる `PBRモード` と
PBR専用プリセット枠を追加する。あわせて、背景表示とは独立して IBL ライティングを
ON / OFF し、同じ PMX / PMD を再読込して比較できる段階まで実装する。

## 2026-07-20 現状サマリー

この試行は、従来のMMD表示を置き換えるものではなく、PBR表現の成立条件と
MMD材質をPBRへ移したときの問題を調べる実験である。現時点では
`PBR Standard`、`PBR MMD Like`、材質別の`PBR Skin`を比較できるが、
IBL・影・SSS色には未解決問題があり、既定表示へ昇格できる状態ではない。

### 試したこと

| 領域 | 試した内容 | 現在の状態 |
| --- | --- | --- |
| PBR読込 | babylon-mmdの`PBRMaterialBuilder`を基礎に、従来MMDモードと分離したPBRモードを追加 | モード、モデル別プリセット、プロジェクト保存に対応 |
| PBR Standard | babylon-mmd標準に近い比較基準を用意 | 比較用ベースとして維持 |
| PBR MMD Like | toonテクスチャ左下1px、またはambient色を材質別に取得し、PBRの直接拡散光の暗部へ乗算 | toon色自体は取得できているが、SSS色としての効きは弱い |
| PBR Skin | 材質別プリセットとして赤系diffusion profileと暗部用の赤い拡散光源を追加 | 色味は比較的良好。EmissiveとTranslucencyは不使用 |
| SSS | Babylon.js標準PrePass SSSをMMD Like / Skinへ適用し、scene scale、散乱色、粗さを調整 | 動作するが、受け面の影ブレと色の弱さが残る |
| 透明材質 | 明示的半透明をSSS対象外にし、ほぼ不透明なalpha textureを低い閾値のalpha testへ変換 | 背面透過は抑えたが、毛先の濃淡との両立は引き続き要確認 |
| 即時切替 | 読込済みPBRMaterialを再生成せずStandard / MMD Like / Skin間で設定を切替 | 再起動・モデル再読込なしで反映 |
| IBL | 中立cube texture、同梱`white.hdr`、`HDRCubeTexture`、ON/OFF、強度0〜4を比較 | texture生成は成功するが、実画面で有意な差を確認できていない |
| HDRプリフィルタ | Electron / Viteで不足したHDR filtering shaderをGLSL / WGSLとも明示登録 | HTMLをWGSLとして読むvalidation errorは解消 |
| 方向ライト | 照度上限を4、光色RGBを最大200%相当まで拡張 | PBRの直接光は明るくできるが、暗部と影が目立ちやすくなった |
| 影ブレ対策 | 非SSS StandardMaterialのlegacy irradianceへ除外値を書き込む互換パッチを追加 | StandardMaterial誤判定は抑制したが、PBR受け面の影ブレは残る |

### 現在生じている問題

#### 1. IBLが実画面で効いているように見えない

観測できていること:

- 同梱HDRは`ready = true`になる。
- spherical polynomialは生成されている。
- `scene.environmentTexture`と`scene.iblIntensity`を操作する経路は存在する。
- `scene.iblIntensity`を`0.0`から`4.0`まで変えても、ユーザー確認では
  PBR MMD Likeの見た目に有意な差が出ていない。

したがって、HDRの読込成功だけではIBLが最終PBR出力へ寄与している証明になっていない。
現時点では次を未確認とする。

- 描画時点でも対象sceneへ正しいenvironment textureが接続されているか。
- 各PBRMaterial側のenvironment / reflection関連設定が寄与を抑えていないか。
- 同梱`white.hdr`が均一かつ弱く、方向ライトとトーンマッピングに差を隠されていないか。
- PBR MMD LikeのMaterial PluginやFrame Graph経路でIBL成分が失われていないか。

次の切り分けでは、高コントラストなHDR、方向ライト0、IBLのみの診断用PBR球を使い、
IBL diffuseとspecularを別々に確認する。外部HDRI読込はその後に接続する。

#### 2. PBR MMD Likeで投影影がぶれる

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

現状の`PBR MMD Like`は、明示的な半透明を除く全PBR材質へ
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

#### 3. SSSの色の効きが弱い

Babylon.jsの`scatteringDiffusionProfile`は、主に散乱距離とRGBごとの広がり方を
定義する値で、暗部へ新しい光を作る値ではない。入射光がほぼ0の場所では、
profileの彩度や強度だけを上げても色は出にくい。

`PBR Skin`では赤系の拡散光源を`finalDiffuse`へ加えてからPrePass SSSへ渡すため、
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

PBRモード全体のベースとして次の2プリセットを置く。

- `PBR Standard（babylon-mmd）`
- `PBR MMD Like（MMD_modoki）`

両プリセットは公式 `PBRMaterialBuilder` を継承した適応用 builder を使う。
`PBR Standard` は公式 builder と同じ状態へ戻し、`PBR MMD Like` は
材質別toon影色をPBR拡散光へ直接合成し、Babylon.jsの画面空間SSSで散乱させる。
選択値はモデルごとに保持し、ローカル設定とプロジェクトへ保存する。

`PBR Skin` はモデル全体のベースではなく、PBRモデルの材質ごとに割り当てる
追加シェーダープリセットとする。材質パネル下段の「種類」で
`ベースPBRを使用` / `PBR Skin`を選び、選択材質または全材質へ割り当てる。
上段のベースをStandard / MMD Like間で切り替えても、Skin指定材質は維持する。
Skin指定は材質キー単位でプロジェクトの`materialShaders`へ保存する。

### PBR MMD Like: 材質別toon影色と画面空間SSS

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

### PBR Skin: 材質別の強い赤色SSS

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

- 材質パネルに独立した `IBL 環境ライティング` チェックを置く。
- 初期値は OFF。
- OFF では `scene.environmentTexture` を退避して `null` にする。
- ON では退避済みの environment texture を復元する。
- 既定ソースは同梱の `src/assets/ibl-shadows/white.hdr` とする。
- 同梱 HDR は `HDRCubeTexture` で読み込み、PBR の粗さ別反射に必要なプリフィルタを
  読み込み時に生成する。
- 同梱 HDR の初期化または読み込みに失敗した場合だけ、中立グレー 1 x 1 cube texture
  へフォールバックする。
- 背景の `BackgroundMaterial`、空の表示、背景画像・動画の表示には影響させない。
- ON / OFF はローカル設定とプロジェクトの `lighting.environmentLightingEnabled`
  へ保存する。
- `環境光強度`スライダーを`0.0`〜`4.0`で設け、Babylon.jsの`scene.iblIntensity`
  へ即時反映する。既定値は`1.0`。
- 強度はローカル設定とプロジェクトの`lighting.environmentLightingIntensity`へ保存し、
  旧プロジェクトでは`1.0`へフォールバックする。

外部 HDRI 読込は未実装である。追加するときは、読み込んだ texture を同じ退避・復元経路へ
接続し、同梱 HDR より優先する。

### メイン方向ライトの光量

Babylon.jsのDirectionalLightは、PBRかつ既定の`INTENSITYMODE_AUTOMATIC`では
照度（illuminance）として扱われ、`intensity`は線形に拡散光へ反映される。
従来の上限`2.0`はBabylon.js側の制約ではなくアプリ独自のクランプだったため、
照度スライダーとランタイム上限を`4.0`へ拡張する。既定値は`1.0`のまま維持し、
既存プロジェクトの見た目は変えない。

方向ライトの`specular`は現状0のため、この照度は主に直接拡散光を増やす。
PBR MMD Likeをマット寄りに保ちつつ、キーライトの明るさだけを増やす意図である。

光色RGBスライダーは内部的に`128 = 100%`、`255 = 200%`として保存されていたが、
従来はDirectionalLightへ反映する直前に各成分を100%へ丸めていた。RGBによるHDR光量
調整を有効にするため、この最終クランプを200%へ揃える。したがって照度`4.0`かつ
光色`255 / 255 / 255`では、直接拡散光へ最大で基準の約8倍が入力される。
トーンマッピング後の画面上の明るさは線形8倍とは限らず、白飛びには注意する。

## UI 上の制約

既存の WGSL プリセットは `MmdStandardMaterial` のシェーダー断片を差し替える機構で、
`PBRMaterial` への切替機構ではない。PBRで読み込んだモデルを選択した場合は同じ材質別UIを
PBR用へ切り替え、WGSLプリセットを隠して`ベースPBRを使用`と`PBR Skin`だけを表示する。
選択材質 / 全材質への割当ボタンはPBRでも有効で、WebGPU固有の可否判定には依存しない。
材質の表示 / 非表示も引き続き使える。

## 確認項目

- [x] `MMDモード` が既定値のまま
- [x] 不正な材質モードを `MMDモード` へフォールバック
- [x] PBRベースプリセットの選択値をモデルとプロジェクトへ保存
- [x] 上段のPBRベースをStandard / MMD Likeの2種類へ整理
- [x] PBR Skinを材質別割り当てへ分離
- [x] PBR Skinの材質別プロジェクト保存 / 読込
- [x] `PBR MMD Like` を専用 builder へ分離
- [x] toon影色を材質別PBRシェーダーで処理
- [x] PBR MMD Like / Skinで`isScatteringEnabled`による画面空間SSSを適用
- [ ] MMD Like / Skinのscene scaleとSSS適用範囲を整理し、PBR受け面の影ブレを解消
- [x] Skinの赤い拡散光源をPBRシェーダーからPrePass SSSへ入力
- [x] StandardMaterialの未初期化legacy irradianceを補正し、非SSS受け面の誤判定を抑制
- [x] 不透明Skin材質のtexture alphaをalpha blendからalpha testへ変換
- [x] 明示的な透明材質をSSS対象外にする
- [x] 読込済みPBRモデルのプリセットを再読込なしで即時切替
- [x] PBR 材質モーフ proxy の色、透明度、roughness、reset
- [x] 材質方式と IBL ON / OFF のプロジェクト保存 / 読込
- [x] unit test
- [x] lint
- [x] critical typecheck に未定義名エラーなし
- [x] Electron smoke 起動（WebGPU / Bullet MPR）
- [x] 同梱 HDR が ready かつ spherical polynomial 生成済みになることをモデルなしsmokeで確認
- [x] PBRモデルのMMD Like → Standard → MMD Like即時切替smoke
- [x] WebGPU + WGSL + PrePass SSS + Frame Graphでvalidation errorなし
- [ ] alpha test化後の実画面確認（ユーザー操作で確認）
- [ ] PMX / PMD を MMD Standard と PBR Standard で実読込して比較
- [ ] 表情・材質モーフを含む VMD の PBR 表示確認
- [ ] 透過材質、DDS / BMP / PNG テクスチャの PBR 表示確認
- [ ] IBL ON / OFF の WebGPU 実画面比較
- [ ] IBLのみの診断用PBR球と高コントラストHDRでdiffuse / specular寄与を確認
- [ ] PBR MMD LikeのSSSをキャラクターまたは材質別指定へ限定
- [ ] toon左下1px色由来の暗部散乱光源をPBR MMD Likeへ追加して強度を比較
- [ ] 外部 HDRI 読込

## 2026-07-20 同梱 HDR への切替

中立グレーの `RawCubeTexture` とCPU生成 spherical polynomialでは、実画面上で
`scene.iblIntensity = 0.0` と `4.0` の差が確認できなかった。そのため通常の環境ライトを
同梱 `white.hdr` へ切り替えた。

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

実モデルでの明暗差と質感はユーザー操作で引き続き確認する。

## 現時点の判断

PBRモードは MMD 再現の代替ではなく、ライティングや質感を試すための実験領域として
隔離する。MMD の toon / sphere / edge を維持した PBR 寄り表現は
`PBR MMD Like`の独自builderとMaterial Pluginへ局所化する。toon影色は材質シェーダー、
内部散乱はBabylon.js標準の画面空間SSSへ役割を分離した。現時点ではtoonの連続ランプ、
sphere texture、edgeは未対応。散乱距離は全材質で共通なので、将来の詳細設定では
材質別のSSS強度・対象外指定・厚み分類を追加候補とする。
