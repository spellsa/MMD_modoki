# 影品質向上の検討メモ

更新日: 2026-03-15

## 目的

`MMD_modoki` の現在の影設定を踏まえて、次のような改善案を比較する。

- 単純に負荷を上げて影をきれいにする
- 近景高品質 + 遠景広範囲を両立する
- Babylon.js の標準機能でどこまで対応できるかを見る
- 手動の二段構成が必要かどうかを判断する

## 結論

先に結論を書くと、`MMD_modoki` の現在実装はすでに単一 `ShadowGenerator` としてはかなり高品質寄りで、単純な負荷増だけで得られる改善幅は大きくない。

- いまは `ShadowGenerator` 1 基で `PCF`、`QUALITY_HIGH`、`Contact Hardening`、`transparencyShadow` を有効にしている
- シャドウマップも `min(8192, GPU 上限)` なので、すでにかなり大きい
- そのため「近景は高密度、遠景も広くカバーしたい」という要求に対しては、Babylon.js 標準機能では `CascadedShadowGenerator` が最有力
- 手動の二段構成は技術的には検討可能だが、`MMD_modoki` 側の設計変更が大きく、`CascadedShadowGenerator` を試す前に採る理由は薄い

おすすめ順は次の通り。

1. 現行 `ShadowGenerator` の品質プリセット化と計測
2. `CascadedShadowGenerator` の試験導入
3. `CascadedShadowGenerator` で足りない場合だけ、手動二段構成を検討

## 現在の実装状況

`src/mmd-manager.ts` の現行影設定は、概ね次の内容。

- `DirectionalLight` 1 基
- `ShadowGenerator` 1 基
- 影マップサイズは `min(8192, maxTextureSize)`
- `usePercentageCloserFiltering = true`
- `filteringQuality = ShadowGenerator.QUALITY_HIGH`
- `useContactHardeningShadow = true`
- `bias = 0.00015`
- `normalBias = 0.0006`
- `frustumEdgeFalloff = 0.2`
- `transparencyShadow = true`
- `enableSoftTransparentShadow = true`
- `useOpacityTextureForTransparentShadow = true`

該当箇所:

- `src/mmd-manager.ts:3072-3101`
- `src/mmd-manager.ts:6341-6347`

影範囲については、現在はかなり広めの固定フラスタム運用になっている。

- `dirLight.shadowFrustumSize = shadowFrustumSize`
- `dirLight.shadowMinZ = 1`
- `dirLight.shadowMaxZ = max(500, shadowFrustumSize * 6)`

このため、ステージ全体や遠景は拾いやすい一方で、近景だけを見ると 1 ピクセルあたりの密度は下がりやすい。

## Babylon.js 側で使える主な手段

### 1. 現行 `ShadowGenerator` のまま負荷を上げる

もっとも単純な案。実装変更は少ないが、現在設定がすでに高めなので伸び幅は限定的。

候補:

- 影マップサイズ上限の見直し
- `QUALITY_HIGH` 固定ではなく品質プリセット化
- `shadowFrustumSize` を用途別に狭める
- `bias` / `normalBias` / `contactHardeningLightSizeUVRatio` の再調整

注意点:

- 現状でも `8192` まで使っているため、単純な解像度増だけで効く場面は限られる
- 影範囲を広く取り続ける限り、近景の密度不足は本質的には解消しにくい
- 高負荷化は GPU コストに対する見返りが読みづらい

補足:

- もし GPU が `16384` を持っていても、現行コードは `8192` で打ち止め
- ただし `8192 -> 16384` はメモリ・帯域コストが非常に重いので、常用設定には向かない可能性が高い

### 2. 単一 `ShadowGenerator` のままフラスタム制御を詰める

近景品質を上げるだけなら、まずここを詰める価値がある。

観点:

- 近景向けプリセットでは `shadowFrustumSize` を大幅に絞る
- カメラ距離やステージサイズに応じた自動切り替えを検討する
- 固定 `shadowFrustumSize` 前提をやめて、自動計算寄りに振る案もある

Babylon.js の `DirectionalLight` には次の機能がある。

- `shadowFrustumSize`
- `shadowOrthoScale`
- `autoUpdateExtends`
- `autoCalcShadowZBounds`

型定義コメント上、`shadowOrthoScale` は固定 `shadowFrustumSize` 運用では効かない。つまり、現在の「広い固定フラスタム」方針のままだと、近景密度改善の自由度はそこまで高くない。

この案の評価:

- 実装コストは低い
- 近景のみを見ると効く
- 遠景を広く残したまま近景だけ高密度にするのは苦手

### 3. `CascadedShadowGenerator` を導入する

Babylon.js が方向光の大規模シーン向けに用意している本命案。

`node_modules/@babylonjs/core/Lights/Shadows/cascadedShadowGenerator.d.ts` では、`CascadedShadowGenerator` は「大きなシーンに影を落とすための CSM 実装」と説明されている。発想としては、カメラ視錐台を複数の距離帯に分割し、それぞれに別のシャドウマップを割り当てる方式。

これにより、

- 近景カスケードには高密度な影を割り当てる
- 遠景カスケードには広範囲の影を割り当てる

という構成が自然に実現できる。今回の要望には最も素直に合う。

Babylon.js 側で調整できる主な項目:

- `numCascades`
- `lambda`
- `cascadeBlendPercentage`
- `stabilizeCascades`
- `shadowMaxZ`
- `autoCalcDepthBounds`
- `autoCalcDepthBoundsRefreshRate`

特に `autoCalcDepthBounds` は、型定義コメント上「GPU コストは増えるが影品質を大きく改善できる」とされており、品質優先モードでは有力。

この案の評価:

- 近景高品質 + 遠景広範囲の両立に向く
- Babylon.js 標準機能なので、手動二段構成より筋が良い
- 実装コストと GPU コストは上がる
- カスケード境界のチューニングが必要

### 4. 手動の二段構成にする

発想としては、たとえば次のような構成。

- 近景用: 小さめ範囲 + 高解像度 + 強い品質設定
- 遠景用: 広範囲 + 低め解像度

Babylon.js のローカル実装を見ると、light 側は内部的に複数の shadow generator を持てる構造になっている。`ShadowGenerator` のコンストラクタにも `camera` 引数があり、内部では light に対して shadow generator の map を保持している。

ただし、これは「技術的な余地がある」という確認であって、`MMD_modoki` へ素直に載ることを意味しない。現状の `MmdManager` は `this.shadowGenerator` 1 基前提で組まれているため、手動二段構成にすると次の影響が出る。

- 影設定 UI を 1 組では表現しきれない
- 保存形式に複数 generator の設定を持たせる必要がある
- toon 境界や透明影との整合を検証し直す必要がある
- どのメッシュをどの generator に入れるかの運用ルールが必要

結論として、これは `CascadedShadowGenerator` で要件を満たせなかったときの次案。

## 案ごとの比較

| 案 | 見た目の改善幅 | GPU コスト | 実装コスト | 主な弱点 | 推奨度 |
| --- | --- | --- | --- | --- | --- |
| 現行のまま解像度や品質を上げる | 小から中 | 中から高 | 低 | すでに高品質寄りで伸びしろが小さい | 中 |
| 単一 generator のフラスタム最適化 | 中 | 低から中 | 低 | 遠景を広く残しつつ近景だけ高密度にするのは苦手 | 高 |
| `CascadedShadowGenerator` | 中から大 | 中から高 | 中 | 調整項目が増える | 最有力 |
| 手動二段構成 | 中から大 | 高 | 高 | 設計負債が増えやすい | 低 |

## `MMD_modoki` でのおすすめ対応順

### 第1段階: いまの実装を測れる状態にする

まずは「改善できるか」ではなく「どこが足りないか」を見える化したほうがよい。

候補:

- 影品質プリセットを追加する
- 現在の実効 shadow map size を UI または debug log で確認できるようにする
- カメラ距離別の比較スクリーンショットを取る

最低限ほしいプリセット例:

- `Balanced`: 2048 または 4096、現状相当の範囲
- `Close-up`: フラスタム小さめ、近景優先
- `Stage-wide`: 現状相当の広範囲

### 第2段階: `CascadedShadowGenerator` の試験導入

本命。最初は UI まで作り込まず、固定プリセットで比較するのがよい。

試験設定の例:

- `numCascades = 4`
- 影マップサイズは `2048` または `4096`
- `lambda` は遠近バランス重視で調整
- `cascadeBlendPercentage` は低めから開始
- `stabilizeCascades = true` を比較

この段階で見るべき点:

- 顔まわり、髪、手指の自己影
- ステージ床の接地影
- カメラ移動時の shimmer
- 透明材質や半透明部での影の破綻

### 第3段階: `autoCalcDepthBounds` を品質優先モードで評価

CSM の見た目があと一歩足りない場合の追加案。

用途:

- スクリーンショット向け
- 近景重視の編集モード向け

注意:

- GPU コストが増える
- 常時 ON より、品質プリセット限定のほうが現実的

### 第4段階: それでも不足する場合のみ手動二段構成

この順にする理由は単純で、手動二段構成は Babylon.js 標準の設計から外れやすく、`MMD_modoki` 固有実装が増えるため。

採用判断の条件:

- `CascadedShadowGenerator` では MMD 的な近景自己影の密度が足りない
- カスケード境界の見え方が許容できない
- 編集系 UI と保存形式を拡張するコストを受け入れられる

## 実装時の検証項目

- 顔、前髪、袖口、指など細かい自己影が改善するか
- 床影が近景では濃密で、遠景では破綻しないか
- カメラをパンしたときに揺れや段差が目立たないか
- 透明テクスチャ材質の影が壊れないか
- `WebGL` / `WebGPU` の両経路で同じ傾向になるか
- 再生中 FPS と停止中見た目の両立が取れるか

## 実務上の判断

今回の要件に対しては、次の判断が妥当。

- 「単純に負荷を上げるだけ」で済ませるのは優先度が低い
- まずは単一 generator の範囲設計を詰める
- 本命は `CascadedShadowGenerator`
- 手動二段構成は最後の選択肢

言い換えると、「近景用高品質 + 遠景用範囲影」を Babylon.js 標準の範囲で素直にやるなら、まず `CascadedShadowGenerator` を試すべき。

## 参照元

現在実装:

- `src/mmd-manager.ts`
- `src/ui-controller.ts`
- `docs/shadow-spec.md`

Babylon.js 公式ドキュメント:

- https://doc.babylonjs.com/features/featuresDeepDive/lights/shadows
- https://doc.babylonjs.com/features/featuresDeepDive/lights/shadows/cascadedShadows
- https://www.babylonjs.com/specifications/

インストール済み Babylon.js 型定義:

- `node_modules/@babylonjs/core/Lights/Shadows/shadowGenerator.d.ts`
- `node_modules/@babylonjs/core/Lights/Shadows/cascadedShadowGenerator.d.ts`
- `node_modules/@babylonjs/core/Lights/directionalLight.d.ts`

