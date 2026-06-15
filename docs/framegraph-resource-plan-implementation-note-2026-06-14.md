# FrameGraph ResourcePlan 実装メモ 2026-06-14

## 概要

FrameGraph post effects の効率化第一段階として、効果スタックから共有リソース要求を集計する `FrameGraphResourcePlan` を追加した。

今回の変更は、描画品質や効果の見た目を変えることではなく、次の効率化判断をコードとログの両方で扱えるようにする足場である。

## 実装したこと

- `src/render/frame-graph-resource-plan.ts` を追加
- `buildFrameGraphResourcePlan(settings, effectOrder)` を追加
- ResourcePlan の単体テストを追加
- `FrameGraphPostEffectsController` の GeometryRenderer 作成判定を ResourcePlan 経由へ変更
- 再生中の設定変更時も ResourcePlan を更新するようにした
- performance snapshot / postfx debug log に ResourcePlan summary を含めるようにした
- FrameGraph backend 初期化時、`needsDepthRenderer` を見て DoF 用 depth texture を渡すようにした
- FrameGraph backend 初期化時、`needsLuminousMask` が false の場合は Luminous mask RT を作らないようにした
- `needsLuminousMask` が false の場合は Luminous extract / blur / composite task も作らないようにした
- DoF / Luminous の ON/OFF で必要リソース構成が変わる場合は FrameGraph backend を再構築するようにした
- FrameGraph backend 時は Classic 側 FarDoF PostProcess を作らないようにした

## 現時点の Resource key

| key | producer | consumer |
|---|---|---|
| `sceneColor` | imported scene color RT | active post effects |
| `depthScene` | existing depth renderer | DoF |
| `viewDepth` | GeometryRenderer | SSAO / SSR |
| `viewNormal` | GeometryRenderer | SSAO / SSR |
| `reflectivity` | GeometryRenderer | SSR |
| `luminousMask` | Luminous mask RT | Luminous |

## 判定方針

- Luminous / Bloom / LUT / Sharpen / Grain / Chromatic / Vignette / EdgeBlur / Distortion は `sceneColor` を要求する
- Luminous は追加で `luminousMask` を要求する
- DoF は `depthScene` を要求する
- SSAO は `viewDepth` と `viewNormal` を要求する
- SSR は `viewDepth`、`viewNormal`、`reflectivity` を要求する
- `viewDepth` / `viewNormal` / `reflectivity` のいずれかが必要なときだけ GeometryRenderer を必要扱いにする

## 期待する効果

現時点では大きな速度改善を狙う段階ではなく、以下を明確にすることが主目的。

- Luminous 単体では GeometryRenderer を作らない
- SSAO と SSR は GeometryRenderer の出力を共有する
- DoF 用 depth と SSAO / SSR 用 view depth を混同しない
- ログ上で、実際に作られているリソースと計画上必要なリソースを比較できる
- Luminous 無効時は Luminous mask RT と Luminous task 群を持たない
- DoF 無効時は FrameGraph DoF 用 depth texture を渡さない

## 注意したこと

DepthRenderer の削減は、Classic 側 DoF / FarDoF PostProcess の残存と衝突しやすい。

途中実装では、FrameGraph backend で DepthRenderer を作らない一方、Classic 側 FarDoF PostProcess が残り、WebGPU で `depthSampler` / `depthSamplerSampler` が未 bind になる警告が出た。

対策として、FrameGraph backend では Classic 側 FarDoF PostProcess を作らず、Classic DefaultRenderingPipeline 向けの DoF depth renderer 生成も走らないようにした。

この境界は今後も重要で、FrameGraph backend では「UI 状態は共有しても、Classic PostProcess 実行経路は残さない」方針に寄せる。

## 次の候補

- `needsDepthRenderer` を MmdManager 側の depth renderer lifetime 判定に接続する
- `needsLuminousMask` を Luminous mask RT lifetime 判定に接続する
- ResourcePlan と実リソースの差分を warning ではなく diagnostics として出す
- 品質プリセットごとに ResourcePlan を見て高コスト効果の注意表示を出す

## 確認

- `npm.cmd run test:unit`
  - 19 files / 116 tests passed
- `npm.cmd run lint`
  - passed
- `npm.cmd run smoke:launch`
  - WebGPU / Bullet MPR 初期化まで passed
- `npm.cmd run log:errors`
  - latest session に warn/error なし
