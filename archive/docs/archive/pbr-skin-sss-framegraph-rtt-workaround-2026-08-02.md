# PBR Skin SSS / FrameGraph中間RTT回避策（2026-08-02）

## 結論

PBR Scatteringを有効にした材質がFrameGraphの中間`RenderTargetTexture`で暗くなる問題は、
FrameGraphのimport/copyではなく、Babylon.jsのRTT固有PrePass targetの有効化漏れが原因だった。

Babylon.jsフォーラムで案内された暫定回避策に従い、FrameGraphのscene-color RTTへ
pass-through `PassPostProcess`を追加し、その`setPrePassRenderer()`が`true`を返すようにした。
これによりRTT固有のPrePassが有効になり、SSS合成後のscene colorがFrameGraphへ渡る。

## 公式回答で確認できたこと

- PBR材質は散乱成分をirradiance attachmentへ書き出す。
- SSS composition passがirradianceを最終色へ再合成する。
- ユーザーRTTにもPrePass targetは作成されるが、PrePassを材質だけが要求した場合は無効のままになる。
- FrameGraphは未合成のRTTを正しくコピーしていたため、FrameGraph copy自体は原因ではない。
- `FrameGraphObjectRendererTask`への置き換えでは、従来RTTのPrePass hookを通らないため回避できない。

参照:

- [Babylon.jsフォーラム回答](https://forum.babylonjs.com/t/pbr-subsurface-scattering-becomes-black-with-an-intermediate-rendertargettexture-and-frame-graph/63870/4)
- [修正版Playground](https://playground.babylonjs.com/#0137DJ#0)

## MMD_modokiへの取り込み方針

`src/mmd-manager.ts`で、次の条件を両方満たす間だけactivation passをscene-color RTTへ付ける。

- FrameGraph backendがscene-color RTTを実際に使用している。
- `isScatteringEnabled`のPBR材質がscene内に存在する。

SSSを使わない通常のFrameGraph経路ではactivation passを外す。passを常時付けると、SSSがなくても
RTT固有PrePass/MRTと全画面passが有効になり得るためである。RTT破棄時はRTT自身が付属PostProcessを
破棄する。

追加・削除時には`PrePassRenderer.markAsDirty()`を呼び、次の描画前にRTTごとのPrePass要否を
再評価させる。

## 色空間の扱い

修正版Playgroundには、passの`getClassName()`を`ImageProcessingPostProcess`として扱い、
LinearなRTTへFrameGraph側でImage Processingを一度だけ適用する経路もある。

今回はこの経路を採用しない。現在のMMD_modokiはFrameGraphへ渡すscene-colorを表示色空間として
扱い、FrameGraphのImage Processing taskも`fromLinearSpace = false`としている。activation passは
通常の`PassPostProcess`のままとし、既存のLUT、tone mapping、exposureの色空間前提を変更しない。

Linear経路へ移行する場合は、FrameGraph側のImage Processingを必ず一度実行する構成に揃え、
Classic、LUT、tone mapping、exposure、画面キャプチャをまとめて再確認する。

## 追記: RTT修正後に残ったSSS材質だけの暗化

RTT回避策の取り込み後、FrameGraphのscene-color targetが非アクティブな直接描画でも、
`PBR Skin SSS`を指定した肌だけが暗くなることを実機ログとスクリーンショットで確認した。

Babylon.js 9.2.0の`pbrBlockImageProcessing`は`SS_SCATTERING`材質について、材質シェーダー内の
Image Processingを明示的にスキップする。通常はSSS合成後の全画面Image Processingが最終色変換を
担当するが、本アプリは画面全体の白飛び防止のため`needsImageProcessing = false`としている。
この組み合わせでは、SSS対象ピクセルだけLinearの合成結果が最終画面へ残り、暗く見える。

全画面Image Processingは戻さず、SSS合成シェーダーへ条件付きの局所gamma変換を追加する。

- FrameGraphは現在どおり表示色空間のscene colorを受け取るため、SSS合成内で変換する。
- ClassicでImage Processing post-processが無い場合も、SSS合成内で変換する。
- Classicで最終Image Processingが有効な場合は局所変換せず、後段へLinearのまま渡す。
- SSS対象外ピクセルは従来どおり`inputColor`をそのまま返し、背景や服を再変換しない。

## 2026-08-02 実機確認結果

Electron / WebGPUの実PMX表示で、`body01`と`face01`へ`PBR Skin SSS`を適用して確認した。
ポストスタックなしの直接出力では、以前の赤黒い暗化が解消し、元の明るい肌色を保ちながら
顔と首に穏やかなSSSの柔らかさが出る状態になった。背景、髪、服が一緒に持ち上がる
画面全体の白飛びも再発していない。

成功時の診断値は次のとおり。

- `prePassEnabled: true`
- `compiledSssCenterBlendPresent: true`
- `configurationNeedsImageProcessing: false`
- `compositionUsesLocalGamma: true`
- `frameGraphSceneColorTargetActive: false`
- `frameGraphSceneColorPrePassActivationPassAttached: false`

この結果から、今回確認した直接出力経路では、SSS合成内の局所gamma変換が暗化対策として
有効だったと判断する。確認に使用したモデルとスクリーンショットはローカル検証用であり、
権利上リポジトリへ追加しない。

### 最終比較による評価訂正

上記の「穏やかなSSSの柔らかさ」は当時の暫定評価である。その後、同条件でStandardと切り替え、
等距離profile、純赤profile、散乱合成率25% / 100%を比較した。等距離profileはStandardとの
目視差がほぼなく、純赤profileはSSS経路の寄与を確認できる一方で肌全体へ色が被った。
したがって、RTT・色空間の不具合対策は有効だが、この見た目を実用的な肌SSSとは判定しない。
PBR Skin SSSは実験状態のまま調査終了とする。

FrameGraphのscene-color RTTが実際にアクティブな経路、Classicとの見た目比較、LUTや
tone mappingを組み合わせた経路は未確認のまま残る。ただし、SSSプリセットを実用不採用としたため、
現時点では追加検証を進めず、将来この経路を再利用するときの確認項目として保存する。

## 終了時の確認項目

- [x] WebGPUの直接出力 + PBR Skin SSSで材質が赤黒くならない。
- 未確認: WebGPU + FrameGraphのscene-color RTT + PBR Skin SSSで材質が黒くならないこと
- 未確認: ClassicとFrameGraphでSSSの明度・色味が大きく乖離しないこと
- 未確認: SSS解除後にactivation passが外れ、通常のFrameGraph経路で不要なPrePassが残らないこと
- 未確認: LUT、tone mapping、exposureの適用回数と色味が変わらないこと
- 未確認: backend切替やリサイズ後もactivation passが重複しないこと
