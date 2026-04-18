# WebGPU 重量モデル顔モーフ既知制限メモ

作成日: 2026-04-18

## 概要

重量級 PMX モデルを WebGPU で読み込み、表情モーフを操作したときに、顔まわりの材質や形状が大きくずれる現象を確認した。

現時点では修正完了に至っておらず、**WebGPU の既知制限として扱う** 方針にする。

このメモは、再現条件、試した対処、得られたログ、暫定運用を残すためのもの。

## 症状

- 表情モーフ、特に口系モーフを動かしたときに、顔まわりの表示が大きく崩れる
- 顔材質や口内まわりが原点側へ飛んだように見える
- 重い剛体モデルで再現しやすいが、過去には物理が極端に重くないモデルでも類似現象があった

見た目としては、単純な shading 崩れではなく、**モーフ後の頂点変形と skinning の整合が壊れている** ように見える。

## 確認したモデル条件

- WebGPU renderer
- Babylon.js `v8.45.3`
- `WGSL-first`
- 対象 PMX:
  - ボーン数 `4274`
  - vertex count `85190`
- ログ上の骨テクスチャ幅:
  - `17100`
- 実行環境の `maxTextureSize`:
  - `8192`

上記から、このモデルは WebGPU の骨テクスチャ制約に対して明確に oversized。

## ログで確認できたこと

調査中のログ名:

- `localhost-1776502972018.log`
- `localhost-1776503486236.log`
- `localhost-1776503805911.log`
- `localhost-1776504194593.log`
- `localhost-1776504731362.log`
- `localhost-1776506499655.log`

途中で確認できた事実:

- 当初は `Texture size exceeded maximum texture size` が出ていた
- その後、import 前 preflight を入れて early CPU skinning fallback を有効化した結果、このエラー自体は消えた
- しかし症状は残った
- `position morph` を持つ mesh としてログに出ていたのは `口-舌` のみ

重要な示唆:

1. import 初期化時の骨テクスチャ超過は問題だった
2. しかしそれを潰しても症状は消えなかった
3. したがって、主因は import 失敗だけではない

## 試した対処

### 1. モーフ編集直後の pose 再計算

`setMorphWeight()` / `setMorphWeightByIndex()` 後に、現在モデルの pose / world matrix / skeleton matrix を明示更新した。

結果:

- 改善なし

### 2. position morph mesh のログ追加

`WebGPU SDEF fallback` 対象 mesh のうち、`position morph` を持つ mesh 名と材質名をログ出力した。

結果:

- `口-舌` mesh が該当

### 3. position morph mesh を GPU 保持

過去の軽量モデルでは、`position morph` を持つ mesh を CPU fallback に落とすと崩れる事例があったため、GPU 側に残す方針を再確認した。

結果:

- 今回の重量モデルでは改善なし

### 4. position morph mesh も CPU fallback に強制

`口-舌` も含め、WebGPU SDEF fallback 対象を CPU skinning に寄せた。

結果:

- 改善なし

### 5. import 前の early CPU skinning fallback

PMX/PMD を事前 parse して骨数を調べ、危険域のモデルは `ImportMeshAsync` 前に

- `skeleton.useTextureToStoreBoneMatrices = false`
- `mesh.computeBonesUsingShaders = false`

を当てるようにした。

結果:

- `Texture size exceeded maximum texture size` は消えた
- 症状は改善なし

### 6. CPU skinning 用 source buffer の morph 同期

CPU skinning mesh に対して、morph 適用後の position / normal を `_sourcePositions` / `_sourceNormals` へ反映し、評価順も `afterPhysics` 側へ寄せた。

結果:

- 改善なし

## 現時点の見立て

現時点では、次の組み合わせが不安定だと見ている。

- WebGPU
- oversized skeleton
- CPU skinning fallback
- `position morph` を持つ mesh
- MMD runtime の morph / bone / physics 評価

つまり、単一のローカルバグというより、

**`babylon-mmd + Babylon CPU skinning + position morph + oversized skeleton` の組み合わせ制約**

として出ている可能性が高い。

## 過去事例との関係

過去には、軽量モデル寄りのケースで

- `position morph mesh を CPU fallback に落とすと壊れる`

という整理をしていた。

今回の重量モデルでは、

- GPU 保持でも壊れる
- CPU 強制でも壊れる
- early fallback しても壊れる

という結果になったため、前回と同じ一点原因ではなく、より深い制約に当たっている。

## 暫定方針

現時点では、この症状は **WebGPU の既知制限** として扱う。

短期運用:

- 重量級 PMX で顔モーフ崩れが出る場合は、WebGPU では完全対応を期待しない
- 必要なら WebGL2 での比較確認を行う
- リリースノートや既知制限に残す

## 将来の再調査候補

優先度は高くないが、再調査するなら次の順が現実的。

1. 同じモデルを WebGL2 で比較し、WebGPU 固有か CPU skinning 共通かを切り分ける
2. `口-舌` 以外の顔レイヤー mesh / material 構成を洗い、実際に崩れている対象を mesh 単位で固定する
3. `babylon-mmd` 側の morph update と Babylon CPU skinning の統合挙動を upstream レベルで追う
4. oversized skeleton かつ position morph 持ちモデルだけ WebGL2 fallback させる運用を検討する

## 関連メモ

- [重いモデルの読み込みメモ](./heavy-model-loading.md)
- [PMX 顔描画崩れの原因仮説メモ](./face-render-corruption-investigation.md)
- [WebGPU が効かない / 平坦に見える件の調査メモ](./webgpu-not-working-investigation.md)
