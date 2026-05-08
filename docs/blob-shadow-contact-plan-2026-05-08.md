# Blob Shadow 接地影検討メモ 2026-05-08

## 目的

MMD キャラクターの足下に、真下方向へ落ちるぼんやりした接地影を追加する。

ここで扱う影は、物理的に正しいライト影ではなく、接地感を補うための軽量な擬似影です。

## IBL Shadows との違い

IBL Shadows は環境光由来の voxel based shadow であり、静的または準静的なシーン向けです。

Blob shadow は以下を目的にする。

- キャラクターの足下が床から浮いて見える問題を軽く抑える
- ライト方向や shadow map 品質に依存しない
- PMX skinned mesh の毎フレーム変形に直接追従しすぎない
- WebGPU voxelization や IBL CDF に依存しない

IBL Shadows の代替ではなく、MMD 編集体験向けの別系統の補助表現として扱う。

関連:

- [IBL Shadows 検討メモ](./ibl-shadows-investigation-2026-05-07.md)
- [影仕様メモ](./shadow-spec.md)

## 基本方針

- 投影方向はワールドの真下方向、つまり `Y-` 方向に固定する
- ライト方向は使わない
- 影は床面上の半透明メッシュまたは projected decal として描く
- ぼかし済みの radial gradient テクスチャを使う
- 対象点と床面の距離で濃度とサイズを変える

距離による基本式のイメージ:

```ts
const t = clamp(1 - distanceToFloor / maxDistance, 0, 1);
opacity = baseOpacity * t * t;
scale = baseScale * (1 + distanceToFloor * spread);
```

距離が近いほど濃く、小さくする。離れるほど薄く、大きくする。

## 影の構成案

最初の PoC では、1 キャラクターにつき複数の blob を使う。

- 左足 blob
- 右足 blob
- 体中心下の薄い補助 blob

足 blob:

- 足 IK、足首、つま先のいずれか安定して取れる点を中心にする
- 小さめの楕円
- 距離による opacity 変化を強めにする

体中心 blob:

- モデル bounds の中心または下半身ボーン近辺を使う
- 大きめで薄い楕円
- 足 blob ほど濃くしない
- 足ボーンが取れないモデルの fallback にも使う

## 床面判定

初期実装では床面を `Y = 0` とみなす。

理由:

- 現在の MMD_modoki では標準床が `Y = 0` にある
- 真下投影の軽量表現として十分に始められる
- ステージ mesh への正確な raycast は負荷と実装リスクが上がる

将来候補:

- ステージ床 mesh への下向き raycast
- raycast 結果の normal に合わせて shadow plane を傾ける
- 複雑な床では fallback として `Y = 0` を使う

## UI 案

既存の `キャラ接地影` UI を拡張する。

現行:

- `キャラ接地影`
- `接地影濃度`
- `接地影サイズ`

追加候補:

- `接地影方式`: bounds / blob
- `接地距離`: opacity が 0 になる最大距離
- `足影`: ON/OFF
- `体影`: ON/OFF

ただし最初から UI を増やしすぎない。まずは内部実装を blob 方式に寄せ、必要な調整値だけ既存スライダーへ割り当てる。

## 実装候補

### 1. 透明 ground mesh 方式

各 blob を `CreateGround` の小さな plane として作る。

利点:

- 既存の `キャラ接地影` 実装に近い
- 実装が軽い
- DynamicTexture / alpha texture で制御しやすい

制約:

- 床面以外へ正確に貼るには弱い
- depth sorting / z-fighting に注意が必要

### 2. Projected decal 方式

足元から床面へ decal を貼る。

利点:

- ステージ面に沿わせやすい可能性がある
- 真下投影という用途に合う

制約:

- 複雑な PMX/アクセサリ mesh への decal は重くなりやすい
- 毎フレーム更新する場合、生成/破棄コストに注意が必要

初期実装は 1 の透明 ground mesh 方式を優先する。

## 確認観点

- 足が床に近いときだけ濃く出るか
- ジャンプや浮遊ポーズで自然に薄くなるか
- 足を開いたポーズで左右の影が分離して見えるか
- bounds ベースの大きな楕円より接地感が改善するか
- CSM 影、半透明影、SSAO、post effects と併用して破綻しないか
- FPS 低下が無視できる範囲か

## 非目標

- ライト方向に応じた正確な影
- ステージ形状へ完全に沿う影
- 半透明材質の shadow map 問題の解決
- IBL Shadows の置き換え

