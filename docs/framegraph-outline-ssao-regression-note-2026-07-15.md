# FrameGraph / MMDエッジ / SSAO 回帰メモ 2026-07-15

## 背景

v0.2.1 前の確認で、MMD エッジ表示と FrameGraph 系 PostFX を併用したときに黒画面化する問題が出た。
調査中は FrameGraph 全体の問題に見えたが、少なくとも「エッジ ON だけで黒く落ちる」経路は別原因だった。

## 確認できた症状

- MMD エッジ ON だけで黒画面になるケースがあった。
- ログに `Error while parsing WGSL: <!doctype html>` が出ていた。
- 続けて WebGPU の `Invalid RenderPipeline` / `Invalid CommandBuffer` 系 warning が大量に出ることがあった。
- ユーザー確認では、修正後に MMD エッジ単体は OK になった。

## 原因

`mmdOutline` shader module が babylon-mmd 側の動的解決に任され、Vite / Electron 環境で WGSL の代わりに HTML が返っていた。
そのため WebGPU が `<!doctype html>` を WGSL として parse し、pipeline 作成に失敗していた。

これは FrameGraph の描画順や SSAO 以前の問題で、MMD エッジ shader の解決失敗が直接の黒画面原因だった。

## 入れた修正

`src/mmd-manager.ts` で MMD outline shader を静的 import するようにした。

```ts
import "babylon-mmd/esm/Loader/ShadersWGSL/mmdOutline.vertex";
import "babylon-mmd/esm/Loader/ShadersWGSL/mmdOutline.fragment";
import "babylon-mmd/esm/Loader/Shaders/mmdOutline.vertex";
import "babylon-mmd/esm/Loader/Shaders/mmdOutline.fragment";
```

これにより、Vite の bundle 対象に shader module が入り、実行時に HTML を shader として読みに行く経路を避ける。

一方で、`MmdOutlineRenderer` の prototype patch や render pass を直接差し替える案は黒画面化を悪化させたため採用しない。
再調査時もこの方向を安易に戻さないこと。

## FrameGraph GeometryRenderer 側の整理

別件として、FrameGraph 側の GeometryRenderer task が必要以上の MRT target を要求していた。
WebGPU validation で `Color target has no corresponding fragment stage output but writeMask ... is not zero` 系の warning が出ていたため、要求リソースに応じて textureDescriptions を絞るようにした。

現在の意図は以下。

- offset shadow / offset highlight: `viewDepth`
- SSAO: `viewDepth` + `viewNormal`
- SSR: `viewDepth` + `viewNormal` + `reflectivity`

`src/render/frame-graph-post-effects-controller.ts` では `FrameGraphResourcePlan.requirementKeys` を見て、必要な prepass texture だけを `FrameGraphGeometryRendererTask.textureDescriptions` に追加する。

## まだ疑わしいところ

ユーザー確認では「エッジ OK。FrameGraph 全体というより SSAO の問題かも」という状態。
そのため、MMD エッジ単体の修正と SSAO / GeometryRenderer の問題は分けて考える。

次に見るなら以下。

- FrameGraph + SSAO のみ
- FrameGraph + offset shadow のみ
- FrameGraph + SSR のみ
- SSAO2 task が要求する normal / depth texture の format と順序
- WebGPU backend で GeometryRenderer task が生成する fragment output と color target の対応

## 確認済み

- `npm.cmd run lint`
- `npm.cmd run typecheck:critical`
- 実機確認: MMD エッジ ON の黒画面は解消

