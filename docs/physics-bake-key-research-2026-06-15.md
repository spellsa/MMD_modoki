# 物理演算焼き込みキー調査メモ 2026-06-15

## 目的

物理演算の結果をキーフレームとして扱えるか、また `babylon-mmd` がどこまで対応しているかを整理する。

ここで扱う「物理キー」は次の 2 種類を分けて考える。

1. VMD / MMD ランタイムに含まれる物理 ON/OFF トグル
2. 物理シミュレーション結果を通常のボーンキーへ焼き込む処理

前者は `babylon-mmd` と現行 MMD_modoki でかなり扱えている。後者は直接 API が見当たらず、MMD_modoki 側で実装する必要がある。

## 調査対象

- `babylon-mmd`: `^1.2.0`
- `@babylonjs/core`: `9.2.0`
- ローカル実装:
  - `node_modules/babylon-mmd/esm/Runtime/mmdModel.d.ts`
  - `node_modules/babylon-mmd/esm/Runtime/mmdRuntimeBone.d.ts`
  - `node_modules/babylon-mmd/esm/Loader/Animation/mmdAnimationTrack.d.ts`
  - `node_modules/babylon-mmd/esm/Runtime/Animation/mmdRuntimeModelAnimation.js`
  - `node_modules/babylon-mmd/esm/Runtime/Physics/IMmdPhysics.d.ts`
  - `src/physics/physics-model-controller.ts`
  - `docs/key-registration-ui-note-2026-04-18.md`
  - `docs/keyframe-storage-spec.md`
  - `docs/playback-seek-physics-policy.md`

## babylon-mmd の対応状況

### 物理トグル

`babylon-mmd` の `MmdBoneAnimationTrack` / `MmdMovableBoneAnimationTrack` には `physicsToggles: Uint8Array` がある。

`mmdAnimationTrack.d.ts` では、値が `1` の場合はボーンが物理に駆動され、`0` の場合はアニメーション側に寄るという趣旨のコメントがある。

実際の `mmdRuntimeModelAnimation.js` では、各ボーントラックを評価したあと、ボーンに紐づく剛体 index へ `physicsToggles` の値を書き込む。

```text
boneTrack.physicsToggles
  -> rigidBodyStates[rigidBodyIndex]
  -> physicsModel.commitBodyStates(rigidBodyStates)
```

`IMmdPhysicsModel.commitBodyStates()` のコメントでは、`rigidBodyStates[i]` が `0` なら kinematic、`1` かつ FollowBone 以外なら dynamic と説明されている。

つまり、VMD 由来の物理 ON/OFF キーを読み、ランタイム再生へ反映するための情報は `babylon-mmd` に存在する。

### 現行 MMD_modoki 側の保持状況

MMD_modoki 側でも `physicsToggles` はすでにいくつかの経路で保持されている。

- project 保存 / 読み込みで `physicsToggles` をパックしている
- VMD マージやタイムライン編集 helper で `physicsToggles` をコピーしている
- 手動キー登録時は近傍キーから `physicsToggles` を引き継いでいる

ただし、UI で明示的に物理トグルキーを編集する導線はまだ弱い。

### 物理結果の読み取り

`MmdModel` には最終ボーン行列を読むための情報がある。

- `worldTransformMatrices: Float32Array`
- `runtimeBones: readonly IMmdRuntimeBone[]`
- `MmdRuntimeBone.getWorldMatrixToRef(target)`
- `MmdRuntimeBone.getWorldTranslationToRef(target)`

`MmdModel` のコメントでは、最終行列は `MmdModel.afterPhysics()` 後に更新されるとされている。

そのため、物理演算を走らせた結果をフレームごとにサンプリングすること自体は可能に見える。

### 直接見当たらないもの

現時点の `babylon-mmd` には、次の直接 API は見当たらない。

- 物理結果を `MmdAnimation` のボーンキーへ焼く API
- `MmdAnimation` から VMD を書き出す `VmdWriter` 相当
- 焼き込み用のキーフレーム削減 API

`VmdLoader` と `VmdObject` はあるが、検索範囲では VMD 書き出し API は確認できなかった。

## 焼き込みとは何をする処理か

物理焼き込みは、ランタイムの最終姿勢を毎フレームサンプリングし、通常のボーンキーフレームへ変換する処理である。

想定する変換:

```text
元モーション + 物理 ON
  -> フレームごとに beforePhysics / physics / afterPhysics を進める
  -> afterPhysics 後の runtimeBones / worldTransformMatrices を読む
  -> 対象ボーンのローカル回転 / 位置へ戻す
  -> MmdBoneAnimationTrack / MmdMovableBoneAnimationTrack へ書く
  -> baked animation として保存、または project 内に別バリアントとして保持
```

焼き込み後は、物理を OFF にしても揺れ物やスカートの動きが再生できる状態を目指す。

## 実装上の難所

### 世界行列からローカルキーへの逆変換

`runtimeBones` から得られるのは最終的な世界変換に近い値である。

一方、VMD / `MmdAnimationTrack` に保存する値は、ボーンのローカル回転や、移動可能ボーンの rest position からの位置オフセットである。

そのため、単純に world matrix を保存するだけでは足りない。

必要になりそうな処理:

- 親ボーンの最終行列との差分を取る
- rest pose / linked bone の基準姿勢へ戻す
- MMD の append transform / IK / bone morph / after-physics bone の影響を二重適用しない
- 移動可能ボーンと回転のみボーンを分ける

ここは最初の実装で最も壊れやすい箇所になる。

### 焼き込み対象ボーンの選定

全ボーンを焼くと、データ量が大きくなり、IK や操作ボーンまで不要に固定してしまう。

最初は次の条件で絞るのがよさそう。

- `runtimeBone.rigidBodyIndices.length > 0`
- `runtimeBone.transformAfterPhysics === true`
- 髪、スカート、袖、小物など物理に由来するボーン
- ユーザーが選んだボーン範囲

ただし、親子関係の途中のボーンが必要になる場合があるため、「直接剛体あり」だけでは不足する可能性がある。

### 既存アニメーションとの二重適用

焼き込み結果を既存モーションに重ねると、元のボーンキー、IK、append、物理が二重に効く危険がある。

安全な初期案:

- 焼き込み結果は元モーションを書き換えず、別の `Baked Motion` として作る
- 対象ボーンだけ baked track で上書きする
- 再生時は対象剛体の `physicsToggles` を `0` にする、または物理を OFF にした比較モードを用意する
- 元モーションと baked motion を即座に切り替えられるようにする

### 補間とキー削減

最初の焼き込みでは、30fps の全フレームキーでよい。

ただし、長いモーションではデータ量が増えるため、後続でキー削減が必要になる。

段階案:

1. 全フレーム linear/標準補間で焼く
2. 誤差しきい値で近似できるキーを削る
3. 回転は quaternion 角度差、位置は距離差で判定する
4. 必要なら MMD 補間カーブへ近似する

### 物理の再現性

焼き込みは物理 backend に依存する。

記録しておきたい情報:

- physics backend: Bullet MPR / Bullet SPR / Ammo など
- babylon-mmd version
- gravity
- time step / substep
- 開始前に `initializePhysics()` したか
- 焼き込み開始フレーム前のウォームアップ有無

プロジェクト間・環境間で完全一致を保証するより、「この環境で見た結果を固定する」機能として扱うのが現実的。

## 実装案

### Phase 1: 物理トグルキーの可視化

まずは焼き込みではなく、既存 `physicsToggles` を扱いやすくする。

- 選択ボーンの `physicsToggles` を確認できる
- キー登録時の `physicsToggles` 引き継ぎを明示する
- project 保存 / 読み込みで値が維持されることをテストする

これは「MMD 本家の物理 ON/OFF キーに近い編集」として先に価値がある。

### Phase 2: 内部焼き込みプロトタイプ

VMD 書き出しは後回しにして、project 内の `Baked Motion` として保持する。

処理案:

```text
対象モデル、対象モーション、フレーム範囲、対象ボーンを決める
physics backend と runtime を固定する
開始フレームへ seek
initializePhysics()
必要なら数フレーム warm-up
for frame in range:
  runtime/model を frame へ進める
  beforePhysics / physics / afterPhysics 後の最終姿勢を読む
  対象ボーンの local transform へ戻す
  baked track に追加
```

この段階では全フレームキーでよい。

### Phase 3: タイムライン統合

焼き込み結果を既存タイムラインに混ぜる。

- 元モーション
- 物理 ON 再生
- baked motion

を切り替えられるようにする。

Undo/redo では大量のキー差分になるため、1 キーごとの command にせず、`Baked Motion Asset` の追加/削除として扱うほうがよい。

### Phase 4: VMD 書き出し

`babylon-mmd` に VMD writer が見当たらないため、VMD 出力までやるなら MMD_modoki 側で別途 writer が必要になる。

最初から VMD export を目標にすると実装が大きくなるため、内部 project 保存を先に通す。

## MMD_modoki での価値

物理焼き込みができると、次の用途が見込める。

- 動画出力時に物理のブレを固定できる
- 重い物理を bake して再生負荷を下げる
- 物理結果を手で少し修正できる
- 複数モデルやモーション変換時に、最終結果を固定して扱える
- 物理の調整前後を比較しやすい

MMD 本家が動く環境でも、「物理結果をプロジェクト内で比較・複製・再利用しやすい」方向に寄せると MMD_modoki 側の独自性になる。

## 現時点の結論

- `babylon-mmd` は VMD の物理トグルに相当する `physicsToggles` を読み、ランタイム再生に反映できる。
- MMD_modoki も `physicsToggles` を project 保存 / 読み込みやマージで保持している。
- 物理シミュレーション結果をボーンキーへ焼き込む直接 API は見当たらない。
- 焼き込み自体は `afterPhysics()` 後の `runtimeBones` / `worldTransformMatrices` をサンプリングすれば実装可能そう。
- ただし、世界行列を MMD のローカルキーへ戻す逆変換と、IK / append / morph / after-physics の二重適用対策が難所。
- 初期実装は VMD export ではなく、project 内 `Baked Motion` として持つのがよい。

