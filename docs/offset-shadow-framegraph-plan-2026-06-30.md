# Offset Shadow FrameGraph 検討メモ

作成日: 2026-06-30

## 目的

MMD モデル向けに、ライト方向ではなくカメラから見て安定する擬似影を追加する。主な用途は、顎下、前髪、スカート、袖などに出るセル調の落ち影補助。

これは通常の ShadowGenerator / CascadedShadowGenerator の置き換えではなく、FrameGraph backend 専用の表現強化として扱う。

## 参照している表現

MME 系の `OffsetShadow/Depth` と `OffsetShadow/Merge` に近い考え方。

- `OffsetShadow/Depth`: 影を落とす対象を、画面上で少しずらした深度またはシルエットとして描く
- `OffsetShadow/Merge`: 通常の深度と offset depth を比較し、影になる場所へ暗色を合成する

理想形では、画面端でも途切れにくい offset depth を別 render target として作り、最終的には MMD 材質の `NdotL` / toon shadow band に近い場所へ混ぜたい。

## 現状の制約

- 現在の FrameGraph post effects は `previous color -> next color` の直列 stack が中心。
- SSAO / SSR 用に `FrameGraphGeometryRendererTask` から `viewDepth` / `viewNormal` / `reflectivity` を共有できる。
- ただし、任意のモデルを画面方向へずらして深度だけ再描画する専用 producer はまだない。
- Babylon の FrameGraph post process task だけでは新しい offset depth は作れない。専用の render task、material override、または別 render target layer が必要になる。

## 段階案

### Phase 1: Screen-space 近似

まず `viewDepth` と `viewNormal` を使う 1 pass の custom post effect として作る。

入力:

- previous scene color
- geometry renderer の `viewDepth`
- geometry renderer の `viewNormal`

処理イメージ:

```text
current = sample(viewDepth, uv)
offset = sample(viewDepth, uv + shadowOffset)

if offset が current より手前にあり、深度差が bias/thickness 内なら影
  scene color を shadowColor 方向へ darken
```

利点:

- FrameGraph の既存 shared resource だけで始められる。
- 顎下やスカート下の「カメラから見た少し下方向の影」は早く試せる。
- stack UI / project save/load / diagnostics の形を先に固められる。

弱点:

- 画面外や隠れている形状の情報は取れない。
- offset depth を本当に描いているわけではないため、画面端で途切れる。
- 半透明髪、スカート裏、outline、アクセサリで見え方の差が出やすい。

### Phase 2: True offset depth producer

専用 render target に、対象 MMD mesh を画面方向へ offset して深度だけ描く。

必要になるもの:

- `offsetShadowDepth` shared resource
- offset depth 用 render task
- スキニング済み MMD mesh を depth-only で描ける material / shader 経路
- 画面端で途切れにくくするための RT margin または projection offset
- 対象モデル / 対象材質のフィルタ

これが入ると、参照画像の `OffsetShadow/Depth` に近くなる。

### Phase 3: Toon shadow band への統合

Phase 1 / 2 は post darken で始めるが、本命は MMD 材質の toon shadow band へ混ぜること。

候補:

- post process で最終色を暗くする簡易版
- geometry / material path に offset shadow mask を渡して `NdotL` 側へ合成する版
- debug view で offset shadow mask だけを表示する版

MMD らしい見た目は後者が強いが、既存材質 shader への影響が大きい。

## 初期パラメータ案

- `enabled`: 既定 false
- `strength`: 0.35
- `offsetX`: 0 px
- `offsetY`: 6 px
- `depthBias`: 0.01
- `thickness`: 0.25
- `softness`: 1.5 px
- `normalInfluence`: 0.4
- `shadowColor`: `#4a352a`
- `debugView`: false

`offsetY` は画面下方向を正として扱い、顎影 / スカート影を作りやすくする。

## FrameGraph resource plan

Phase 1 で追加する effect id:

```text
offsetShadow
```

必要 resource:

```text
sceneColor  -> import
viewDepth   -> geometryRenderer
viewNormal  -> geometryRenderer
```

Phase 2 で追加する resource:

```text
offsetShadowDepth -> offsetShadowDepthRenderer
```

`offsetShadow` が有効なときだけ geometry renderer を有効化する。SSR / SSAO と同時に有効な場合は既存の `viewDepth` / `viewNormal` を共有する。

## 実装チェックリスト

- `FrameGraphPostEffectId` に `offsetShadow` を追加する
- activation helper に `offsetShadowEnabled && offsetShadowStrength > 0.0001` を追加する
- resource plan で `viewDepth` / `viewNormal` を要求する
- FrameGraph controller に custom post process task を追加する
- UI stack に `Offset Shadow` と詳細パラメータを追加する
- project save/load に設定を追加する
- debug view を最低 1 つ用意する
- `npm.cmd run test:unit` と `npm.cmd run lint` を通す
- runtime 初期化に触るため `npm.cmd run smoke:launch` で WebGPU 起動を確認する

## 注意点

- 顔や髪のような薄いパーツでは深度差の閾値が強すぎると黒い縁取りになる。
- 透過材質が geometry renderer depth/normal にどう入るかを実機で見る必要がある。
- `viewDepth` の距離スケールに依存するため、近景と遠景で bias / thickness の効きが変わる可能性がある。
- post darken 版は肌色を直接暗くするため、Bloom / Luminous / LUT の前後順で見た目が変わる。
- True offset depth 版は render target と draw pass が増えるため、4K や複数 PMX で負荷確認が必要。

## 現時点の判断

まず Phase 1 の screen-space 近似で、ユーザーが欲しい「カメラから見ていい感じの顎影 / スカート影」に近づくか確認する。その見た目が有効なら、Phase 2 の true offset depth producer を別実装として検討する。

## 実装メモ 2026-06-30

Phase 1 の screen-space 近似を実装した。

- FrameGraph stack に `offsetShadow` を追加
- `viewDepth` / `viewNormal` を `FrameGraphGeometryRendererTask` から共有
- `FrameGraphPostEffectsOffsetShadowTask` で `uv - offsetPixels * texelSize` 側の深度を参照
- offset 側の深度が現在ピクセルより手前にある場合、`shadowColor` 方向へ final color を暗くする
- UI から strength / offset X / offset Y / bias / thickness / softness / normal influence / color を調整可能
- project save/load で設定と stack entry を保持

未実装:

- true `offsetShadowDepth` render target
- 対象モデル / 材質のフィルタ
- material toon shadow band / `NdotL` への直接合成
- debug view の UI トグル
