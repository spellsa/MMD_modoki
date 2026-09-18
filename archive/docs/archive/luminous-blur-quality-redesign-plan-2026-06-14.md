# Luminous ぼかし品質改善案 2026-06-14

## 背景

FrameGraph 版 `Luminous` は、AutoLuminous 対象材質から専用の luminous mask を作り、横方向 blur、縦方向 blur、scene color への合成を行う構成になっている。

ただし 2026-06-14 時点の実装では、広い `Radius` を少ないサンプル数で直接拾うため、ネオンの格子、細い発光ライン、ステージの反復模様で縞、モアレ、ぶれた線が目立つ。MMD 動画では 4K 出力や細かい発光ステージが普通に使われるため、この品質では採用しにくい。

問題は AutoLuminous 判定や合成色よりも、広いぼかしを作る blur 経路にある。

## 現行方式の問題

現行の `mmdFrameGraphLuminousBlur` は、固定 tap の自前 blur shader で、`Radius` が大きいほどサンプル間隔を広げる。

この方式は軽いが、次の弱点がある。

- 大半径時にサンプル密度が足りない
- 格子、縞、細線などの高周波パターンを飛び飛びに拾う
- 横 pass / 縦 pass の痕跡が見えやすい
- 発光源の近くの濃い芯と、遠くの薄い広がりを同時に作りにくい
- `Radius 128px` のような設定で破綻が目立つ

要するに、ガウス重み風ではあるが、実質は sparse blur になっている。

## Babylon.js 側で使える部品

ローカル依存の Babylon.js v9.2.0 には以下がある。

- `BlurPostProcess`
  - 通常の PostProcess 用 blur
  - X/Y の 2 pass で Gaussian blur 的に使える

- `ThinBlurPostProcess`
  - `EffectWrapper` ベースの薄い blur 実装
  - `kernel`、`direction`、`textureWidth`、`textureHeight` を持つ
  - FrameGraph の custom post process task に組み込みやすい候補

- `GlowLayer` / `ThinGlowLayer`
  - 発光レイヤー用の公式実装
  - 内部に複数の blur postprocess を持つ
  - emissive selector、include/exclude mesh、blur kernel、intensity を持つ

- `FrameGraphBloomTask`
  - FrameGraph 公式の Bloom task
  - `ThinBloomEffect` を使い、downscale、blurX、blurY、merge を内包する
  - bloom 用なので AutoLuminous mask の合成そのものにはそのままでは合わないが、品質と構成の参考になる

## 方式比較

### A. 現行自前 blur を改良する

現行 shader の tap 数、重み、サンプル間隔を調整する。

利点:

- 実装差分が小さい
- 現行 UI と保存形式をほぼ維持できる
- FrameGraph stack の構成を大きく変えない

欠点:

- 大半径 blur の本質的なサンプル不足が残る
- tap 数を増やすほど重くなる
- 動画品質まで上げるには限界がある
- 4K 出力や発光格子ステージでまた破綻しやすい

判断:

- 応急処置には使えるが、採用方針にはしない。

### B. `ThinBlurPostProcess` に置き換える

自前 blur shader をやめ、Babylon.js の `ThinBlurPostProcess` を `FrameGraphPostProcessTask` へ接続する。

利点:

- Babylon.js の Gaussian blur 実装に寄せられる
- WebGPU / WGSL 対応を Babylon 側に任せやすい
- 自前 shader の品質問題を減らせる
- 現行 FrameGraph 構成へ比較的入れやすい

欠点:

- 大半径を原寸 1 段で処理すると重い
- `kernel` 変更で shader variant 更新が発生しうる
- AutoLuminous 的な core / halo / wide の多段感は別途構成が必要

判断:

- Phase 1 の最有力。
- ただし単発 blur ではなく、downsample / multi-scale と組み合わせる。

### C. `GlowLayer` / `ThinGlowLayer` に戻す

Babylon.js の GlowLayer を使い、発光対象材質を selector / include list で制御する。

利点:

- 発光レイヤーとしての実績がある
- blur と合成の基本機能が揃っている
- include/exclude mesh や emissive selector が AutoLuminous 判定と相性がよい

欠点:

- FrameGraph post stack の一員として順序制御しづらい
- 既存の FrameGraph 効果群と二重適用になりやすい
- scene render 外の EffectLayer 経路が残り、v0.2 の整理方針とやや衝突する
- 現行でも GlowLayer 由来の透過や奥行きの違和感が課題だった

判断:

- 直接復帰は避ける。
- ただし `ThinGlowLayer` の blur 構成、二段 blur、合成設計は参考にする。

### D. `FrameGraphBloomTask` を luminous 専用に流用する

luminous mask を source にして `FrameGraphBloomTask` にかけ、出力を scene color に合成する。

利点:

- FrameGraph 公式 task を使える
- downscale + blur + merge の構成が既にある
- 大半径 bloom の品質が自前 sparse blur より期待できる

欠点:

- Bloom は bright pass 前提で、AutoLuminous mask と意味が少し違う
- merge が Bloom 用で、Luminous 独自の blend / tone map / bloom send を細かく制御しにくい
- luminous source と通常 Bloom の役割が混ざりやすい

判断:

- そのまま採用はしない。
- 内部構成を参考に、luminous 専用 multi-scale blur task を作るほうがよい。

### E. Luminous 専用 multi-scale blur を作る

luminous mask を低解像度に落とし、複数解像度で blur して合成する。

例:

```text
luminous mask full
  -> threshold / soft knee
  -> downsample 1/2
      -> core blur
  -> downsample 1/4
      -> halo blur
  -> downsample 1/8
      -> wide blur
  -> composite core + halo + wide into scene color
```

利点:

- 大半径でもサンプル密度不足が出にくい
- 近くは濃く狭く、遠くは薄く広い見た目を作りやすい
- MMD の発光ステージや 4K 出力に向く
- AutoLuminous 本家の多段拡散に近い構成へ発展しやすい

欠点:

- 実装量が増える
- RT 数と pass 数が増える
- UI パラメータを整理しないと複雑になる
- FrameGraph texture handle の管理が増える

判断:

- 最終的な本命。
- Phase 1 では `ThinBlurPostProcess` を使って core / halo の 2 段から始める。

## 推奨方針

採用方針は E、実装部品は B を優先する。

つまり、自前 blur shader をやめて `ThinBlurPostProcess` ベースの FrameGraph blur task に置き換え、luminous 専用の multi-scale blur を作る。

`GlowLayer` と `FrameGraphBloomTask` は直接使うより、内部構成の参考にする。

## 初期実装案

### Phase 1: 自前 blur を `ThinBlurPostProcess` へ置換

目的:

- 現行の 15 tap sparse blur をやめる
- まず現行 UI の `Radius` を維持して品質を上げる

構成:

```text
luminous mask
  -> ThinBlur X
  -> ThinBlur Y
  -> LuminousComposite
```

実装:

- `FrameGraphPostEffectsLuminousBlurTask` を廃止または差し替える
- `ThinBlurPostProcess` を使う `FrameGraphPostProcessTask` を作る
- kernel は `Radius` から直接作るが、上限を抑える
- `Radius` が大きい場合は後続 Phase の multi-scale に回す

リスク:

- 単発 blur のままだと 128px 付近ではまだ重いか、品質が足りない可能性がある

### Phase 2: core / halo の 2 段化

目的:

- 芯と広がりを分ける
- 小物発光の輪郭を残しつつ、ステージ発光を柔らかくする

構成:

```text
luminous mask
  -> core blur  small kernel
  -> halo blur  downsampled medium kernel
  -> composite
```

UI:

- `Intensity`
- `Threshold`
- `Radius`
- 追加候補として `Core` / `Halo`

初期値:

- `Intensity`: 0.5
- `Threshold`: 0.5
- `Radius`: 0.5 相当
- `Core`: 0.65
- `Halo`: 0.35

### Phase 3: wide blur の追加

目的:

- 大きいネオン、街灯、床発光ラインで広い空気感を作る
- `Radius 128px` でも縞が出にくくする

構成:

```text
luminous mask
  -> 1/2 core
  -> 1/4 halo
  -> 1/8 wide
  -> composite
```

注意:

- wide は薄くする
- 発光源の色を残しすぎない
- Bloom と役割が被るため、Bloom send を調整する

### Phase 4: glare / 光芒再挑戦

光芒は composite pass 内の軽量方向サンプリングでは品質不足だったため、専用 pass にする。

条件:

- 低解像度または中解像度 buffer 上で accumulation する
- 方向ごとに少数点を飛ばすだけにしない
- 事前 blur 済み buffer から伸ばす
- 動画出力と 4K でモアレを確認してから UI に戻す

保存済みの `glowGlareCount / glowGlareLength / glowGlareAngle / glowGlarePower` は互換用に残すが、描画には使わない。

## UI 方針

最初から項目を増やしすぎない。

当面:

- `Intensity`
- `Threshold`
- `Radius`

品質改善後に追加:

- `Core`
- `Halo`
- `Wide`
- `Blend`
- `Tone`

`Radius` は「1 pass のサンプル距離」ではなく、「multi-scale blur の広がり」として扱う。

## テスト / 確認項目

コード確認:

- `npm.cmd run lint`
- `npm.cmd run test:unit`
- `npm.cmd run smoke:launch`
- `npm.cmd run log:errors`

実機確認:

- Tda ミク髪飾りが太りすぎず光る
- Cyber Stage の格子ネオンで縞が出にくい
- 横方向だけ、縦方向だけの筋が見えない
- `Radius` 最大付近で破綻しない
- Luminous -> Bloom -> LUT の順で色が破綻しない
- FrameGraph stack の順序入れ替えで二重適用にならない
- WebGPU で `Light*` warning が出ない

## 結論

現行の自前 blur を調整し続けるより、Babylon.js の `ThinBlurPostProcess` を使った Luminous 専用 multi-scale blur に作り替えるのがよい。

v0.2 では、まず `ThinBlurPostProcess` への置換と core / halo の 2 段化までを目標にする。`GlowLayer` 復帰や光芒の再実装は、品質確認後の後続作業に回す。

## 2026-06-14 実装メモ

FrameGraph 版 `Luminous` の blur 経路を、現行の自前 sparse blur shader から `ThinBlurPostProcess` ベースへ置き換えた。

実装済み:

- luminous mask から発光源を整える `LuminousExtract` pass を追加
- `ThinBlurPostProcess` による `Core` 横 / 縦 blur を追加
- `ThinBlurPostProcess` による `Halo` 横 / 縦 blur を追加
- composite pass を core texture + halo texture の 2 入力に変更
- `Radius` は直接サンプル距離ではなく、core / halo の kernel 選択に使う
- kernel はスライダー操作で shader variant が細かく増えすぎないよう段階化する

現時点では downsample 付き multi-scale ではなく、同一解像度上の core / halo 2 段構成である。これで現行の sparse sampling による縞は減る見込みだが、巨大 radius や 4K 出力でまだ不足する場合は、次に 1/2、1/4、1/8 の downsample buffer を追加する。

確認済み:

- `npm.cmd run lint`
- `npm.cmd run test:unit`
- `npm.cmd run smoke:launch`
- `npm.cmd run log:errors`

残作業:

- Cyber Stage など細かいネオン格子での手動品質確認
- radius 最大付近での縞 / モアレ確認
- core / halo の重みと default intensity の調整
- 必要なら downsample 付き wide blur を追加
