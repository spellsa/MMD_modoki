# 重量級モデル読み込みメモ

更新日: 2026-03-15

## 概要

ボーン数が極端に多い PMX/PMD モデルでは、物理演算そのものより先に、GPU スキニング用の bone matrix texture が GPU 上限を超えて描画エラーになることがある。

`MMD_modoki` では、この種のモデルをそのまま使えるようにするため、境界値付近を含めて自動で CPU スキニングへ fallback する安全判定を入れている。

## 症状

- モデル読み込み時に `WebGPU uncaptured error` が出る
- コンソールに `Texture size exceeded maximum texture size` が出る
- 骨表示は見えるが、メッシュ描画が壊れることがある
- 重量物理モデルで起きやすいが、原因は「物理」ではなく「骨数過多」であることが多い

代表例:

```text
Texture2D_17100x1x1_rgba32float
max texture size 8192
```

## 原因

Babylon.js の skeleton は、GPU スキニング時にボーン行列を texture に詰める。
このときの幅は概ね次式で決まる。

```text
(bones + 1) * 4
```

たとえば `4274` ボーンの skeleton では:

```text
(4274 + 1) * 4 = 17100
```

となり、`maxTextureSize = 8192` の GPU では上限超過になる。

## 境界値

GPU の `maxTextureSize` を `N` とすると、GPU スキニングで扱える理論上の最大骨数は次式になる。

```text
floor(N / 4) - 1
```

`N = 8192` の場合:

- hard limit: `2047`
- `2048` 本以上は bone texture 幅超過で失敗する

## 現在の実装方針

重量モデルをモデルデータ改変なしで読み込めることを優先し、以下の方針を採っている。

1. 通常モデルは GPU スキニングを使う
2. 骨数が上限近傍のモデルは自動で CPU スキニングへ切り替える
3. そのままでは落ちるモデルでも、まずは「壊れずに開ける」ことを優先する

### 安全判定

`MMD_modoki` では hard limit ちょうどまで待たず、少し手前で CPU スキニングへ切り替える。

```text
hard limit = floor(maxTextureSize / 4) - 1
safety margin = max(32, floor(hard limit * 0.03))
safe threshold = hard limit - safety margin
```

`maxTextureSize = 8192` の場合:

- hard limit: `2047`
- safety margin: `61`
- safe threshold: `1986`

つまり、現在は `1986` ボーン以上の skeleton を持つモデルを CPU スキニング fallback の対象にしている。

## 読み込み時の挙動

読み込み時は以下の順で処理する。

1. `PMX` import 中は scene render を一時停止する
2. `ImportMeshAsync` 完了直後に skeleton 一覧を集める
3. `safe threshold` 以上、または bone texture 幅超過見込みの skeleton を検出する
4. 対象 skeleton で `useTextureToStoreBoneMatrices = false` を適用する
5. 対象 mesh で `computeBonesUsingShaders = false` を適用する
6. その後 render を再開する

これにより、境界値付近のモデルでも、GPU bone texture 作成に入る前に CPU スキニングへ逃がせる。

## 利点

- モデルデータを加工せず、そのまま読み込める
- 極端に骨数が多いモデルでも表示不能になりにくい
- 通常モデルは従来どおり GPU スキニングのまま使える

## 欠点

- CPU スキニングは重い
- 重量モデルでは FPS が下がりやすい
- 読み込み自体は成功しても、再生中のパフォーマンスは別途問題になりうる

## いまの結論

短期対処としては CPU スキニング fallback が最も現実的である。

理由:

- モデル互換性を崩しにくい
- 実装コストが比較的低い
- 「開けない」より「重いが開ける」を優先できる

## 中長期の検討事項

- 読み込み時に「重量モデルのため CPU スキニングへ切り替えた」ことを UI 上でも明示する
- GPU 上限と骨数を読み込み結果に表示する
- 描画に不要な補助骨を除外できるなら、描画用 skeleton のみを再構成する
- asset 前処理で軽量版モデルを生成するワークフローを検討する
- WebGPU / WebGL ごとの差異があるかを継続確認する

## 確認ポイント

重量モデル読み込み時に、以下が出ていれば意図した fallback が動いている。

- コンソールに `CPU skinning fallback enabled`
- runtime diagnostic に `CPU skinning fallback: ...`

逆に、`Texture size exceeded maximum texture size` が先に出る場合は、fallback 適用タイミングが遅い可能性がある。
