# FrameGraph / PostFX 危険メモ 2026-07-01

FrameGraph / PostFX は、v0.2 時点ではまだ実験寄りの描画 backend である。動いている状態でも、触り方を間違えると黒画面、WebGPU validation warning、二重適用、保存値破壊が起きやすい。

実装や修正の前に、このメモと [FrameGraph Post Stack 現行仕様メモ](./framegraph-post-stack-current-spec-2026-07-01.md) を確認する。

## 触る前に守ること

- Classic / FrameGraph / Experimental の実行経路を混ぜない。
- FrameGraph backend 中に Classic PostProcess を残して二重適用しない。
- UI 表示の ON/OFF と、効果パラメーターの保存値を同じものとして扱わない。
- stack order / enabled 変更時に、WebGPU FrameGraph task の texture 接続を `execute()` 中に差し替えない。
- FrameGraph の order / enabled / resource 変更は backend rebuild に寄せる。
- `offsetHighlight` は internal id、UI 表示は `Offset Rim` として扱う。

## 黒画面・警告につながりやすいこと

- 同じ texture を同一 sync scope 内で `TextureBinding` と `RenderAttachment` の両方にする。
- build 済み task の `sourceTexture` / `outputTexture` を実行中に live reconnect する。
- resource plan と実際に作る task がずれる。
- depth / normal / reflectivity が必要な効果を有効化したのに GeometryRenderer 側の resource がない。
- resize / backend switch / project load 後に古い render target や texture handle を使う。
- FrameGraph backend で Classic DoF / Bloom / SSAO などの旧 post process が残る。

## 保存値を壊しやすいこと

- checkbox OFF 時に効果パラメーターの `enabled` や強度を直接 0 にする。
- stack から row を消す操作と、単なる OFF を混同する。
- `frameGraphPostStack` を保存せず、各効果の enabled だけから順序を復元する。
- unknown id / duplicate id を normalize せず project import へ流す。

現行方針では、stack entry は `{ id, enabled }` を持ち、色、強度、offset、threshold などは各効果のパラメーターとして別に保持する。

## 見た目の既知制約

- `Offset Shadow` / `Offset Rim` は post effect なので、厳密な model mask ではない。
- depth 差分で作るため、床、背景、手前の強い段差に反応することがある。
- `Offset Shadow` の遠方抑制は receiver depth guard による緩い対策であり、背景を完全に除外するものではない。
- `Offset Rim` は thickness を大きくすると、複数サンプルの線がぶれたように見えることがある。
- `Luminous` は本家 AutoLuminous 完全互換ではない。材質 / luminous mask ベースの発光として扱う。
- Bloom は stack のその時点の入力画像にかかる。`Offset Rim -> Bloom` のように順序で結果が変わる。

## 変更後に最低限見ること

- `npm.cmd run lint`
- pure helper / project save-load / stack normalize に触った場合は `npm.cmd run test:unit`
- runtime 初期化、backend switch、FrameGraph rebuild に触った場合は `npm.cmd run smoke:launch`
- 警告調査は `npm.cmd run log:errors`

手動確認では、少なくとも次を見る。

- FrameGraph backend が黒画面にならない。
- `Offset Rim -> Bloom` でリムに Bloom がかかる。
- 効果を OFF / ON してもパラメーター値が戻る。
- stack 並べ替え後に順序が見た目へ反映される。
- project save/load 後に stack order と enabled が残る。
