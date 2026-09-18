# キー登録 runtime track 不整合メモ 2026-06-16

## 概要

手打ちキー登録で、タイムライン上はキーが登録されているように見えるが、viewport / 再生時の姿勢評価が正しく反映されない問題があった。

具体的には、同じ通常ボーンにキー A / キー B を登録したとき、XYZ Graph ではキー B まで値が入っているように見える一方、viewport はキー A の姿勢へ戻る、またはキー A の姿勢のままキー B が再生されない状態になった。

VMD 読み込みでは同じモデル・同じボーンが正しく動くため、runtime や補間そのものではなく、手打ちキー登録時の保存先 track が疑わしいと判断した。

## 原因

この問題には、少なくとも 2 つの原因が重なっていた。

### 1. 通常ボーンを movable track に作っていた

手打ちキー用の model animation を作るとき、通常ボーンも `MmdMovableBoneAnimationTrack` に作成していた。

```text
手打ちキー登録
  通常ボーン 左肩
  -> movableBoneTracks に作成される

VMD 読み込み
  通常ボーン 左肩
  -> boneTracks に作成される
```

このため、内部状態が次のように分裂した。

- timeline / XYZ Graph は `movableBoneTracks` 側も読めるため、登録済みに見える
- babylon-mmd runtime の通常ボーン評価は VMD と同じ `boneTracks` 側を前提にする
- 結果として、UI 表示上のキーと viewport 上の姿勢評価が一致しない

つまり、問題の本質は「キーが登録されていない」ではなく、「登録された track 種別が runtime 評価経路と違う」ことだった。

### 2. 空の MmdAnimation の endFrame が更新されていなかった

さらに、手打ちキー用の `MmdAnimation` は最初に空の track 群で作られる。

`babylon-mmd` の `MmdAnimationBase` は constructor 時に `startFrame` / `endFrame` を計算するが、後から `track.frameNumbers` を差し替えても `animation.endFrame` は自動更新されない。

そのため、手打ちで 0f / 10f / 20f にキーを追加しても、`MmdAnimation.endFrame` が 0 のままになりうる。

```text
createModelAnimationForEditing()
  -> empty MmdAnimation
  -> animation.endFrame = 0

後から boneTrack.frameNumbers = [0, 10, 20]
  -> boneTrack.endFrame は 20
  -> animation.endFrame は 0 のまま
```

`MmdRuntime` は全体の animation duration で再生時刻を clamp するため、`animation.endFrame` が 0 のままだと、再生や seek の評価が実質 0f に丸められる。

この場合、タイムライン上は後続キーが見えていても、runtime では先頭キーだけ評価されるように見える。

VMD 読み込みでは、全 track が入った状態で `MmdAnimation` が作られるため `endFrame` が正しく、同じ問題が出なかった。

## 修正方針

PMX 由来の `ModelInfo.boneControlInfos` を使い、ボーンごとの `movable` を見て保存先を決める。

```text
BoneControlInfo.movable === true
  -> MmdMovableBoneAnimationTrack

BoneControlInfo.movable === false
  -> MmdBoneAnimationTrack
```

fallback として、メタ情報がない場合だけ `track.category === "root"` を movable 扱いにする。

## 実装修正

対象:

- `src/editor/timeline-edit-service.ts`
- `src/ui-controller.ts`
- `src/mmd-manager.ts`
- `test/editor/timeline-edit-service.test.ts`

主な変更:

- `ensureModelAnimationForEditing()` で通常ボーンは `boneTracks`、移動ボーンは `movableBoneTracks` に作る
- 過去の誤作成で通常ボーン名の `movableBoneTracks` が残っていた場合、rotation / interpolation / physics toggle を `boneTracks` へ移行する
- 移行後は同名の誤った movable track を削除する
- `readTimelineKeyframePayload()` は通常ボーンなら `boneTracks` を優先する
- movable payload が通常ボーンに適用された場合は、rotation-only の bone payload として扱う
- track の frameNumbers / 値配列を更新したら、`MmdAnimation.startFrame` / `MmdAnimation.endFrame` を再計算する
- キー登録後は runtime animation handle を作り直し、現在 frame を再評価する
- 登録直後の viewport は、登録前に capture した姿勢 snapshot を再適用して「登録ボタンを押した瞬間にキー A へ戻る」見え方を避ける

## 注意点

### Graph が正しいように見えても runtime が正しいとは限らない

XYZ Graph は MMD_modoki 側の表示ロジックであり、runtime 評価結果そのものではない。

今回のように Graph が `movableBoneTracks` を読めてしまうと、表示上は正しく見えるが、runtime が評価する track とずれて viewport が動かないことがある。

キー登録やコピー/ペーストを触る場合は、次を分けて確認する。

- timeline frame list にキーがあるか
- payload が正しい値を持つか
- `MmdAnimation` 内の保存先 track 種別が正しいか
- `MmdAnimation.endFrame` が最後のキーまで伸びているか
- runtime animation handle を再生成した後に viewport が同じ値を評価するか

### 通常ボーンと移動ボーンを category 名だけで判定しない

`KeyframeTrack.category` は UI 上の分類であり、babylon-mmd の track 種別とは完全には一致しない。

保存先判定では、できるだけ PMX metadata 由来の `BoneControlInfo.movable` を使う。

### 手打ちキーと VMD 読み込み結果を比較する

似た問題が出たら、同じボーンを含む VMD 読み込み結果と手打ちキー結果の `MmdAnimation` 構造を比較するのが早い。

見るべき項目:

- `boneTracks[].name`
- `movableBoneTracks[].name`
- `frameNumbers`
- `rotations`
- `positionInterpolations`
- `rotationInterpolations`
- `physicsToggles`

## 再発防止テスト

`test/editor/timeline-edit-service.test.ts` に以下を追加した。

- 通常 PMX ボーンは `boneTracks` に作られる
- 古い誤った `movableBoneTracks` は `boneTracks` に移行される
- 移動可能 PMX ボーンは `movableBoneTracks` に作られる
- 通常ボーンへ movable payload が来た場合は rotation-only bone payload として適用される
- 手打ちで後続キーを追加したら `MmdAnimation.endFrame` が後続キーまで伸びる

確認コマンド:

```powershell
npm.cmd run test:unit
npm.cmd run lint
npm.cmd run smoke:launch
```

2026-06-16 時点で、unit / lint / smoke は通過済み。

## 今後の課題

- 複数ボーン同時登録時も、各ボーンごとに `BoneControlInfo.movable` を見る
- project save / load 後に、誤った movable track が残らないか確認する
- 物理 ON/OFF キー登録も、通常ボーン / 移動ボーンの保存先差分を意識して実装する
- 将来的に VMD 書き出しを入れる場合も、通常ボーンを movable track として出さない
- Graph 表示は「どの runtime track を読んでいるか」を debug 表示できると調査しやすい

## 一言まとめ

手打ちキーは、タイムラインに点を置くだけでは足りない。

MMD / babylon-mmd の runtime が期待する `MmdBoneAnimationTrack` / `MmdMovableBoneAnimationTrack` の分離に合わせて保存しないと、Graph だけ正しく見えて viewport が動かない。
## 2026-06-16 追加: 手打ちキーの physicsToggles 既定値

手打ちキー登録で、近傍キーから `physicsToggles` を引き継げない新規トラックでは既定値を `1` にする。

理由:

- `babylon-mmd` の VMD loader は物理 ON を `1`、OFF を `0` として `physicsToggles` に入れる。
- legacy BVMD loader でも、physics toggle 情報がない場合は `Uint8Array(frameCount).fill(1)` にしている。
- runtime 側は track 評価後に `physicsToggles` を `rigidBodyStates` へ流す。
- `MmdBulletPhysics.commitBodyStates()` のコメントでは `0 = kinematic`、`1 = dynamic` とされる。
- VMD optimize でも `physicsToggle === 0` は空トラックではない扱いなので、`0` は明示的な物理 OFF と考えるのが自然。

そのため、MMD_modoki の手打ちキーだけ既定値 `[0]` にすると、VMD 読み込み時と違う状態になり、タイムラインや数値表示は正しくても runtime / physics 評価後の viewport pose が期待とずれる可能性がある。

修正:

- `persistBoneKeyframeInterpolation()` の fallback physics toggle を `[1]` に変更。
- `persistMovableBoneKeyframeInterpolation()` の fallback physics toggle を `[1]` に変更。
- 既存キーがある場合は従来どおり近傍キーの `physicsToggles` を引き継ぐ。
