# IBL / 外部 HDRI 現行仕様・調査記録 2026-07-21

## 結論

Radiance HDR (`.hdr`) をBabylon.jsの`HDRCubeTexture`として読み込み、次の2用途へ独立して利用できる。

1. PBR材質を照らすIBL（Image-Based Lighting）
2. ビューポートへ表示するHDRI背景

2026-07-21の実機比較で、`PBR Standard`は外部HDRの方向・色・強度を自然に反映することを確認した。
したがって、外部HDRの読込、拡散IBL、鏡面IBL、強度調整までの基本経路は成立している。

`PBR MMD Like`もIBL自体は受けているが、低強度では暗く、高強度では急激に白飛びする。
これはHDR読込やIBL経路の不具合ではなく、toon暗部補正、独自`finalDiffuse`処理、画面空間SSSを
組み合わせたシェーダー側の応答として、別課題に分離する。

## 用語とライトの区別

### HDRI背景

HDR画像を空として表示する機能。見た目だけに使用でき、PBR材質を照らすかどうかとは独立している。

### IBL環境ライト

HDRから全方向の拡散光と鏡面反射を計算し、PBR材質へ加える機能。

- diffuse irradiance: 周囲から回り込む拡散光
- specular radiance: 表面の粗さに応じた環境反射

### MMD照明欄の環境光

MMD照明欄の環境光は`HemisphericLight.intensity`であり、HDRI由来のPBR IBLとは別系統である。
MMD環境光が`0`でも、PBRのIBLは動作する。

## UI

`背景`メニューから次を操作できる。

- `環境ライトを使用`: IBLのON / OFF
- `環境ライト詳細...`: HDR読込と詳細設定
- `HDRIを環境ライトに読み込む...`: ファイル選択から直接読込
- `HDRI背景を表示`: HDRI背景だけをON / OFF

詳細ポップアップでは次を操作できる。

- 現在のHDRファイル名の確認
- `.hdr`ファイルの読込
- HDRI背景表示のON / OFF
- 背景の明るさ
- IBLのON / OFF
- 環境光強度`0.0`から`4.0`
- 外部HDRの解除と内蔵HDRへの復帰

通常の`ファイル > ファイル読込...`でも`.hdr`を選択できる。ウィンドウへドラッグ＆ドロップした
場合も同じ読込経路を使う。読込成功時はIBLとHDRI背景をONにして即時反映する。
読込失敗時は、それまで使用していた環境テクスチャを維持する。

## 推奨初期値

- HDRI背景の明るさ: `0.03`
- IBL環境光強度: `1.0`
- IBL OFF: 実効強度`0.0`

背景の明るさは、実機上では`0.02`から`0.03`付近が白飛びしにくい。
IBL強度`1.0`はHDRごとの自動正規化後の基準値であり、`4.0`は比較・演出用の強い上限とする。

## 処理経路

```text
外部 .hdr
  └─ HDRCubeTexture
      ├─ radiance prefilter ──> PBRの鏡面IBL
      ├─ spherical polynomial ──> PBRの拡散IBL
      └─ clone + SKYBOX_MODE ──> BackgroundMaterialの背景表示
```

背景用テクスチャはIBL用テクスチャをcloneして使用する。IBL側の座標モードを変更せず、
背景だけを`Texture.SKYBOX_MODE`にできる。

独立したskyboxメッシュを追加するとFrameGraph / WebGPU経路で前景を覆う回帰が起きたため、
背景表示には既存のデフォルト空メッシュと`BackgroundMaterial`を再利用している。

## Babylon.js設定

外部HDRは次の条件で生成する。

- cube face size: `1024 x 1024`
- `generateHarmonics = true`
- `gammaSpace = false`
- `prefilterOnLoad = true`
- `prefilterIrradianceOnLoad = false`
- spherical polynomial target size: `64`

`prefilterOnLoad`は粗さ別の鏡面反射に必要なので維持する。
拡散IBLにはCPUで算出したspherical polynomialを使用する。

Babylon PBRはirradiance textureが存在するとspherical polynomialより優先する。
WebGPUでGPU生成irradiance textureが黒くなった場合、HDRが正常でもIBL強度が無反応に見えるため、
外部HDRでは`prefilterIrradianceOnLoad`を無効化した。

## 背景輝度とIBL強度の分離

Babylon.js 9.2の`BackgroundMaterial`は、HDR背景表示にも
`reflectionTexture.level * scene.iblIntensity`を使用する。
そのため`scene.iblIntensity`をUI強度へ直接割り当てると、モデルと背景が同時に明るくなり、
背景が先に白飛びする。

現在は次のように分離している。

- `scene.iblIntensity = 1`: 共通係数を中立値へ固定
- `scene.environmentIntensity`: UIのIBL環境光強度
- IBL用`texture.level`: HDR露出の自動正規化
- 背景cloneの`texture.level`: HDRI背景の明るさ

PBR材質へ届くIBLの強さは、概ね次の積になる。

```text
IBL用texture.level
× scene.iblIntensity
× material.environmentIntensity
× scene.environmentIntensity
```

IBLをOFFにした場合も選択中のHDRは保持し、`scene.environmentIntensity`を`0`にする。
再度ONにすると同じHDRへ設定強度を適用する。

## HDR露出の自動正規化

HDRはファイルごとに線形輝度の桁が大きく異なる。生の`texture.level = 1`をそのまま使うと、
明るいHDRではIBL強度`1.0`でもモデルが白飛びする。

spherical polynomialの対角係数から平均線形RGBと輝度を求め、IBL用texture levelを自動調整する。

- 目標平均拡散輝度: `0.25`
- texture levelの下限: `0.01`
- texture levelの上限: `4.0`

今回の高輝度テストHDRは平均値が約`13`で、自動係数は約`0.019`になった。
これによりUI強度`1.0`では穏やかに、`4.0`でも生HDRを直接4倍するより扱いやすくなる。

背景cloneにはこの自動係数を使わず、ユーザー指定の背景輝度だけを適用する。

## MMD PBR材質との互換補正

babylon-mmdの`PBRMaterialBuilder`は、MMD材質のspecular色をBabylon PBRの
`reflectionColor`へ割り当てる。

Babylon PBRでは`reflectionColor`が鏡面radianceだけでなく拡散irradianceにも乗算される。
MMDで一般的な黒または低いspecular色をそのまま使うと、HDRの拡散IBLまでほぼ消える。

現在は`PBR Standard`、`PBR MMD Like`、`PBR Skin`で`reflectionColor`を白へ正規化する。
MMD Like / Skinの鏡面の強さは`specularIntensity`と粗さで抑える。

モデルなしの合成PBR球では既定の白い`reflectionColor`が使われていたため、当初のsmokeでは
この実モデル固有条件を検出できなかった。実モデルと診断球の差として得られた重要な知見である。

## ソース選択とライフサイクル

環境テクスチャは次の優先順位で選択する。

1. ユーザーが読み込んだ外部HDR
2. 内蔵`white.hdr`
3. 中立色のfallback cube texture

実装上の注意:

- 読込完了前にsceneの環境テクスチャを交換しない
- 連続読込時はgeneration番号で古い非同期結果を破棄する
- 解除時は外部テクスチャをdisposeして内蔵HDRへ戻す
- 背景cloneは外部HDRの交換・解除時に作り直して旧cloneをdisposeする
- PBR強度変更時は既存材質の再バインドを要求する
- freeze済みPBR材質も強制再バインドの対象にする

## 保存と移行

プロジェクトには次を保存する。

- `lighting.environmentLightingEnabled`
- `lighting.environmentLightingIntensity`
- `lighting.environmentLightingSourcePath`
- `lighting.environmentBackgroundVisible`
- `lighting.environmentBackgroundIntensity`

外部HDR本体はプロジェクトへ埋め込まない。パスは現状絶対パスなので、別環境へプロジェクトを
移す場合はHDRを同じパスへ配置するか、読み込み直す必要がある。ファイルが見つからない場合は
warningを記録し、内蔵HDRを維持する。

背景輝度が独立する前は、背景の白飛びを避けるためIBL強度を`0.03`付近まで下げていた。
新しい背景輝度が未保存で、旧IBL強度が`0.1`以下の場合は、その旧値を背景輝度へ移し、
IBL強度を標準`1.0`へ戻す。

## 確認結果

### 自動確認

- 外部HDRの実ロード成功
- `engine = WebGPU`
- HDR読込後にrendererが安定
- WebGPU validation errorなし
- spherical polynomial生成済み
- 合成PBR球のIBL強度`0` / `1`で画素輝度差あり
- HDRI背景texture ready
- 背景mesh enabled
- lint成功
- 環境ライト関連のunit test成功

### ユーザー実機確認 2026-07-21

- `PBR Standard`でIBLの方向、色、強弱が自然に反映された
- 高輝度HDRの自動正規化後、標準強度が実用的な明るさになった
- 背景輝度とIBL強度を独立して調整できた
- MMD照明欄の環境光が`0`でもIBLが動作した
- `PBR MMD Like`でもIBLによる変化は出るが、強度応答が極端

以上から、IBL / HDRI基盤は成立と判断する。PBR MMD Likeの見た目は材質シェーダー側で継続調整する。

## テストアセットの扱い

実HDRと比較用モデルは`local-references/`配下に置き、Gitへ追加しない。
権利上の理由から、エージェントはユーザーモデルを自動読込・解析しない。
モデルなし診断、ユーザーによる実機比較、権利上安全なローカル参照素材を使い分ける。

## 残課題

- PBR MMD Likeのtoon補正のみ / SSSのみ / 両方の分離比較
- PBR MMD LikeのIBL強度応答と白飛びの調整
- HDRIのY回転
- `.env`の外部読込
- 外部HDRパスの相対化またはプロジェクト同梱方針
- diffuse / specular IBLを個別表示する診断機能
