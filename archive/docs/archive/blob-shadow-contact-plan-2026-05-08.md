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

## 2026-05-08 初期実装メモ

`src/assets/blob-shadows/BlobShadow.png` を使う透明 ground mesh 方式へ寄せた。

初期実装内容:

- 従来の DynamicTexture 生成ではなく、用意した透過 PNG を `Texture` として読み込む
- PNG は黒 RGB + alpha の画像なので、`opacityTexture` には入れず、`diffuseTexture` の alpha を `useAlphaFromDiffuseTexture` で使う
- shadow plane は床面と z-fighting しないよう `Y = floorY + 0.018` に少し浮かせる
- 足ボーンが取れる場合は、左右足に小さい blob を出す
- 足ボーン候補は `左足IK` / `左足首` / `左足` / `左つま先` 系と、右足の同等名
- 足ボーンが取れないモデルでも、従来どおり体中心下の補助 blob を出す
- 床からの距離が `8m` に近づくほど opacity を 0 に近づける
- 離れるほどわずかに scale を広げる

初期式:

```ts
const t = clamp(1 - distance / 8, 0, 1);
opacity = baseOpacity * opacityScale * t * t;
scale = baseScale * (1 + min(distance, 8) * 0.08);
```

注意:

- まだ床面は `Y = ground.position.y` 前提
- ステージ mesh への raycast は未実装
- 足ボーン名の揺れには候補名で対応しているが、全モデル対応ではない
- 体中心 blob は補助用なので、足 blob が取れる場合は薄めにしている
- `0.65m` フェードでは少し浮いたポーズで完全に消えたため、MMD の浮遊・ジャンプポーズでも薄く確認できる距離へ広げた

## 2026-05-08 進捗メモ: 表示不可時点の切り分け

表示不可時点の実装:

- `キャラ接地影` UI は `mmdManager.characterContactShadowEnabled` に接続済み
- `接地影濃度` UI は `mmdManager.characterContactShadowOpacity` に接続済み
- `接地影サイズ` UI は `mmdManager.characterContactShadowScale` に接続済み
- `src/assets/blob-shadows/BlobShadow.png` を `Texture` として読み込む
- `StandardMaterial.diffuseTexture` に blob shadow PNG を設定する
- `useAlphaFromDiffuseTexture = true`
- PNG は黒 RGB + alpha のため、`opacityTexture` には入れない
- shadow plane は `CreateGround` で作り、`Y = floorY + 0.018` に少し浮かせる
- 既存の body blob 用 `entry.contactShadowMesh` は残しつつ、足 blob 用 mesh は `WeakMap<SceneModelEntry, ContactShadowBlobMeshes>` に保持する

足判定:

左足候補:

```ts
["左足ＩＫ", "左足IK", "左足首", "左足", "左つま先ＩＫ", "左つま先IK", "左つま先"]
```

右足候補:

```ts
["右足ＩＫ", "右足IK", "右足首", "右足", "右つま先ＩＫ", "右つま先IK", "右つま先"]
```

該当ボーンが見つかった場合は `runtimeBone.getWorldMatrixToRef()` でワールド位置を取り、その `x/z` を `Y = floorY + 0.018` へ真下投影する。

足ボーンが見つからなくても、モデル bounds 由来の body blob は出す設計。

当時の問題:

- UI を ON にしても blob shadow が見えない
- スライダー接続は確認済みなので、UI 未接続ではない可能性が高い
- 既存の通常 shadow は出ているため、影全体の UI とは別問題
- 2026-05-09 時点で、床 material が `useLogarithmicDepth = true` なのに対し、blob shadow material 側が通常 depth のままだったため、床との depth 条件差で隠れている可能性を疑って調整した

当時の疑い箇所:

- PNG texture / alpha blend material の設定がまだ Babylon.js の描画条件に合っていない
- `CreateGround` の plane が床面や通常 shadow と重なり、視認できない
- mesh は有効化されているが、透明描画順または depth write / alpha sorting で消えている
- runtime bone 取得に失敗している。ただし body blob も出ていないため、これだけでは説明しきれない
- `mesh.visibility` が距離フェードで 0 近くになっている
- `updateCharacterContactShadows()` が期待タイミングで呼ばれていない

当時の切り分け:

1. `updateCharacterContactShadows()` 内に一時ログを入れる
   - enabled
   - model count
   - target count
   - bone hit
   - target position
   - opacity
   - mesh enabled
2. 一時的に opacity を固定 `1.0`、scale を大きめ固定にする
3. 一時的に texture を外し、赤や黒の不透明 material で plane 自体が出るか確認する
4. plane が出るなら、alpha texture / transparency 設定の問題に絞る
5. plane が出ないなら、生成位置、enabled、rendering group、depth 周りを確認する

2026-05-09 に入れた depth / overlay 調整:

- `characterContactShadowMaterial.useLogarithmicDepth = true`
  - ground material と depth 前提をそろえる
- `characterContactShadowMaterial.disableDepthWrite = true`
  - blob shadow 自体が後続の透明描画や床近傍の depth に悪影響を与えにくくする
- `characterContactShadowMaterial.zOffset = -1`
- `characterContactShadowMaterial.zOffsetUnits = -4`
  - 床面よりわずかに手前へ寄せ、床と重なって消える状況を避ける狙い
- `mesh.alphaIndex = 10`
  - 透明描画の並び順で通常の透明材質より後段に寄せる狙い

この調整後、実機確認で blob shadow が表示されるようになった。

## 2026-05-09 調整メモ: 足元 blob 優先

表示確認後、体中心 blob は接地感よりも余計な影として見えやすいため、いったん出さない方針に変更した。

調整内容:

- body blob は生成対象から外す
- 左右足 blob のみを表示する
- 足ボーン候補は IK より足首・足・つま先を優先する
  - IK はポーズや操作状態によって足裏から離れることがあるため fallback 扱い
- 足 blob の基本サイズを大きめにする
  - width: `1.1m` から `3.6m`
  - depth: `0.9m` から `3.0m`
  - 初回表示確認時の足影が小さめだったため、2 倍から 3 倍程度の広さへ寄せた
- 床からの距離で濃淡をつける
  - `maxDistance = 5.0`
  - `opacity = baseOpacity * pow(t, 1.25)`
  - `t * t` では減衰が急に見えたため、浮いたときも少し残る方向へ緩めた
- 距離による scale 拡大は行わない
  - 浮いたときに半径が大きくなるより、薄くなるだけの方が見た目が自然だったため
- 左右足 blob が重なったときは、個々の opacity を最大 45% 下げる
  - alpha blend で別 mesh を重ねると合成後に濃くなるため
  - 完全な max 合成ではないが、足を閉じたポーズで影が二重に濃くなるのを抑える

この状態で見るべき点:

- 足首優先で影位置が足元からずれすぎないか
- 足を大きく開いたポーズで左右 blob が自然に分離するか
- 浮遊ポーズで薄くなりすぎる、または残りすぎるか
- 通常 shadow と重なったときに濃すぎないか

## 2026-05-11 現状サマリ

現時点の方針:

- BlobShadow は通常 shadow / 半透明 shadow とは別の補助表現として扱う
- ライト方向の影ではなく、足元へ真下投影する接地感用の影に限定する
- 体中心 blob は出さない
- 左右足 blob のみを表示する
- 足元の代表位置は runtime bone の world matrix から取る
- 床面はまだ `ground.position.y` を基準にしており、ステージ mesh への raycast は未実装

現在の表示条件:

- `キャラ接地影` UI が ON
- モデルが 1 体以上ロード済み
- モデルが表示状態
- 左右いずれかの足ボーン候補が見つかる
- foot target の床からの距離に応じた opacity が `0.001` より大きい

現在の足ボーン候補:

```ts
left:  ["左足首", "左足", "左つま先", "左足ＩＫ", "左足IK", "左つま先ＩＫ", "左つま先IK"]
right: ["右足首", "右足", "右つま先", "右足ＩＫ", "右足IK", "右つま先ＩＫ", "右つま先IK"]
```

現在の寸法と濃度:

```ts
width  = clamp(modelWidth  * 0.72 * uiScale, 1.1, 3.6);
depth  = clamp(modelDepth  * 0.62 * uiScale, 0.9, 3.0);
t      = clamp(1 - distanceFromGround / 5.0, 0, 1);
alpha  = uiOpacity * pow(t, 1.25) * overlapScale;
scale  = fixed(width, depth);
```

距離による scale 拡大は行わない。浮いたときは半径を広げず、薄くするだけにしている。

重なり対策:

- 左右足 blob が近いとき、個々の opacity を最大 45% 下げる
- 別 mesh の alpha blend なので完全な max 合成ではない
- 足を閉じたポーズで二重に濃くなる問題を軽減する目的

描画上の要点:

- blob PNG は `diffuseTexture` として使い、`useAlphaFromDiffuseTexture = true`
- 黒 RGB + alpha の PNG なので `opacityTexture` には入れない
- ground material と depth 条件をそろえるため `useLogarithmicDepth = true`
- 床近傍で隠れないよう `disableDepthWrite = true` / `zOffset = -1` / `zOffsetUnits = -4`
- 透明描画順のため `mesh.alphaIndex = 10`

残課題:

- `ground.position.y` 以外の床面、PMX ステージ床、`.x` アクセサリ床には未対応
- 足首ボーン基準のため、モデルやポーズによって足裏中心からずれる可能性がある
- 左右 blob の重なり抑制は近似であり、厳密な最大濃度合成ではない
- 通常 shadow と併用したときの最適な opacity 初期値はまだ実機調整が必要

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
