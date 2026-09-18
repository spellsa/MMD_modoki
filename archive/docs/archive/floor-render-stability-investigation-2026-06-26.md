# 床・巨大平面の欠け調査メモ 2026-06-26

## 背景

v0.2 作業中に、PMX ステージの床・背景・巨大な低ポリ平面が、カメラ角度や距離によって不自然に欠ける問題を再調査した。

症状:

- カメラを近づけた状態や浅い角度で、床・背景板・ステージの一部が消える
- カメラを引くと同じ面が表示される
- 数か月前から継続していた問題で、当初は frustum culling / bounding / near-far clip を疑っていた

## 結論

今回確認できた直接原因は、PMX/MMD 材質に対して `useLogarithmicDepth = true` をグローバルに強制していたこと。

`useLogarithmicDepth` は近接モデルや広い `minZ / maxZ` での depth 精度補助として入れていたが、WebGPU 経路では巨大な低ポリ平面・ステージ床・背景板と相性が悪く、カメラ距離や浅い角度で広いポリゴンが欠ける症状につながっていた。

最終的に、PMX/MMD 材質への一律 `useLogarithmicDepth = true` をやめ、`false` にしたところ床欠けが解消した。

## 実装上の修正

### 1. PMX/MMD 材質の logarithmic depth 強制を解除

対象:

- `src/mmd-manager.ts`
- `applyMmdMaterialCompatibilityFixes()`

変更:

- 以前: PMX/MMD 材質に `material.useLogarithmicDepth = true` を強制
- 現在: PMX/MMD 材質では `material.useLogarithmicDepth = false`

意図:

- モデル本体・ステージ・背景板を含む PMX/MMD 材質で、WebGPU の logarithmic depth 経路による巨大平面欠けを避ける
- 個別の近接 depth 精度問題より、ステージ床・背景の安定表示を優先する

注意:

- アプリ生成の ground / mirroring floor / contact shadow / skydome には、既存の `useLogarithmicDepth` 設定が残っている
- 今回問題になったのは、PMX/MMD ローダー由来の材質へ一律適用していた点

### 2. 補助的に残した描画安定化

今回の最終原因ではなかったが、以下は副作用が小さく、床・背景・巨大平面の安定化として残す。

- app 生成の平面メッシュに対する `computeWorldMatrix(true)` + `refreshBoundingInfo()`
- app 生成の床/接地影/鏡面床での `alwaysSelectAsActiveMesh`
- アクセサリ/GLB 再構築メッシュ読み込み後の bounding 更新
- 巨大薄板判定 helper
- `mmd_modoki.debug.renderStability` による描画診断ログ

これらは今回の直接原因ではなかったが、別系統の culling / bounding 問題の切り分けに有用。

## 外れた仮説

### mesh frustum culling

最初に `mesh.alwaysSelectAsActiveMesh` を疑った。

結果:

- アクセサリ側や app 生成床には適用したが、問題のステージには効果なし
- 診断ログ上、問題のステージは `accessoryMeshes` として出ていなかった

判断:

- 少なくとも今回の床欠けの主因ではなかった

### mesh bounding 更新不足

`computeWorldMatrix(true)` + `refreshBoundingInfo()` の不足を疑った。

結果:

- app 生成床、鏡面床、接地影、アクセサリメッシュに適用
- 症状は変化なし

判断:

- app 生成メッシュの安定化としては残す価値があるが、今回の PMX ステージ欠けの主因ではなかった

### subMesh bounding / material 単位 culling

PMX ステージが 1 mesh 内の材質分割 `subMesh` として欠けている可能性を疑った。

試したこと:

- `alwaysSetSubMeshesBoundingInfo: false`
- 読み込み後に `subMesh.setBoundingInfo(mesh.getBoundingInfo())`

結果:

- 症状は変化なし

判断:

- 今回の直接原因ではなかった
- ただし、巨大ステージや背景板で material 単位 culling が疑われる別件には有効な可能性がある

## 診断ログ

追加した debug key:

```js
localStorage.setItem("mmd_modoki.debug.renderStability", "1")
```

有効時、1 秒に 1 回程度で以下を app log に出す。

- camera position / target / radius / minZ / maxZ / fov
- scene mesh count / active mesh count
- ground / mirroring floor / skydome の状態
- scene mesh / accessory mesh の bounding、active、depth 関連 material flag

ログ確認:

```powershell
npm.cmd run log:tail
```

今回の切り分けでは、`accessoryMeshCount: 0` であること、scene mesh の上位候補に問題ステージが出てこないことから、アクセサリ mesh culling ではないと判断した。

## 今後の注意

- PMX/MMD 材質へ `useLogarithmicDepth = true` を一律適用しない
- 近接 depth 精度問題が再発した場合も、モデル本体全体ではなく、対象を app 生成メッシュや明示的な debug/実験設定に限定する
- WebGPU で巨大平面、低ポリ床、背景板が欠ける場合は、culling より先に material depth 経路を疑う
- `zOffset` は app 生成の接地影・鏡面床など同一面ちらつきが明確な場所に限定し、PMX モデル全材質へ一律適用しない
- visual regression でこの症状を自動検出するなら、浅い角度・近距離・広い PMX ステージ床の固定シーンを用意する

## 確認結果

2026-06-26:

- `useLogarithmicDepth` 強制解除後、ユーザー実機で床欠けが解消した
- `npm.cmd run test:unit` 通過
- `npm.cmd run lint` 通過
- `npm.cmd run smoke:launch` 通過
