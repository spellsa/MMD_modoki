# キーフレーム登録と表示の調査メモ

更新日: 2026-03-23

対象:
- `src/ui-controller.ts`
- `src/mmd-manager.ts`
- `src/editor/timeline-edit-service.ts`
- `src/timeline.ts`
- `src/shared/timeline-helpers.ts`
- `src/editor/bone-gizmo-controller.ts`

## 目的
MMD モデルのボーンキーフレーム登録で、以下の症状が繰り返し発生したため、切り分け内容と対処内容を残す。

- 1個目のキーは正常に登録される
- 2個目以降のキーが、そのフレームの見た目ではなく最初のポーズになる
- タイムライン表示、保存値、再生結果が一致しないことがある

同じ調査を繰り返さないため、このメモは「何が問題だったか」だけでなく、「何を誤診しやすいか」も含めて整理する。

## まず結論
今回の不具合は単一原因ではなかった。少なくとも次の問題が重なっていた。

1. 選択トラックの参照ずれ
2. pending snapshot の stale 問題
3. DevTools ログの省略表示で値が読みにくい問題
4. 実は同一フレームを再登録していた問題
5. タイムライン総フレーム数が `1/1` に縮んでいた問題
6. 2個目以降のキーフレーム保存時に、その場で見えている姿勢ではなく、別基準の transform を読んでいた問題

つまり「キーフレーム登録ができていない」のではなく、

- 登録先フレーム
- 保存時の姿勢取得
- 再生用アニメーション更新
- UI 表示用の参照値

のいずれかがズレると、結果として「最初のポーズに戻る」に見えていた。

## 症状の整理
### 症状A: 最初のキーは入るが、次のキーが入らないように見える
- 1個目のキー追加直後にタイムラインが `1/1` になっていた。
- その状態では、2個目を打ったつもりでも実際には frame 1 を再登録しているだけだった。

### 症状B: 2個目以降も別フレームに登録されているのに、最初のポーズになる
- `timeline storage add keyframe` は frame 2, 3, 5 など別フレームで増えていた。
- しかし `persist movable bone keyframe` の保存値が、その場で見えているしゃがみ姿勢と一致しないことがあった。
- これが「操作がなかったことになる」直接原因だった。

### 症状C: UI 下部パネルの値と実際のボーン姿勢が一致しない
- ギズモ操作後に panel 値の古い snapshot を pending として保持し続けることがあった。
- その結果、保存時に初期値や前回値を優先してしまうことがあった。

## 確認できた事実
### 登録自体は通っているケースがあった
以下のログが出るとき、少なくとも「キーフレーム追加要求」は成立している。

- `register bone keyframe request`
- `timeline storage add keyframe`
- `addTimelineKeyframe`
- `persist movable bone keyframe`

このとき疑うべきは「登録失敗」ではなく「保存値が違う」か「再生側が違う値を見る」かのどちらか。

### 2個目以降が最初のポーズになるときも、frameCount は増えていた
`frameCount: 2`, `frameCount: 3` が出ているなら、配列への追加は起きている。
この段階で見るべきは以下。

- `poseSnapshotText`
- `resolvedTransformText`
- `positionBlockText`
- `rotationBlockText`
- `sampledText`

## 誤診しやすかった点
### 1. DevTools がオブジェクトを省略表示する
`{...}` 表示だけでは、値が同じなのか違うのか判断できない。
このため、数値をフラットな文字列にしたログが必要だった。

追加したログ項目:
- `poseSnapshotText`
- `resolvedTransformText`
- `positionBlockText`
- `rotationBlockText`
- `trackFrameNumbersText`
- `sampledText`

### 2. 「2個目が入らない」と「2個目は入るが値が違う」は別問題
初期段階ではこの2つが混ざって見えていた。

- タイムラインが `1/1` に縮んでいるときは前者
- `frameCount` が増えているのに見た目が変わらないときは後者

ここを混同すると調査が迷走する。

## 実施した対処
### 1. タイムライン選択の参照ずれ修正
対象:
- `src/timeline.ts`

内容:
- `reconcileSelection(previousTrack)` を修正し、削除や更新後も stale な row index を持たないようにした。

意図:
- 別トラック選択扱いになって UI と内部状態がズレるのを防ぐ。

### 2. 編集用 model animation の明示生成
対象:
- `src/editor/timeline-edit-service.ts`
- `src/mmd-manager.ts`

内容:
- `createModelAnimationForEditing()` を追加
- `ensureModelAnimationForEditing(host, track)` を追加
- `mmdManager.ensureModelAnimationForEditing(track)` を追加

意図:
- キー追加前に編集対象 animation が確実に存在するようにする。

### 3. ボーン分類の見直し
対象:
- `src/shared/timeline-helpers.ts`

内容:
- `classifyBone()` を修正し、`センター` と `全ての親` を `root` として扱うようにした。

意図:
- movable bone と root bone の扱いがズレて別トラック化するのを防ぐ。

### 4. pending snapshot の stale 問題修正
対象:
- `src/ui-controller.ts`

内容:
- 下部パネル編集時は panel の snapshot を使う。
- ギズモ編集時は `mmdManager.getBoneTransform(boneName)` を使う。
- `rememberEditedBonePoseSnapshot()` に `snapshotOverride` を持たせた。

意図:
- ギズモ操作後に古い panel 値を pending に固定しないようにする。

### 5. タイムライン総フレーム数の縮小防止
対象:
- `src/editor/timeline-edit-service.ts`

内容:
- `DEFAULT_EDIT_TIMELINE_FRAMES = 300` を追加。
- `refreshTotalFramesFromContent()` が no-audio 編集中に `1` フレームまで縮まないようにした。

意図:
- 1個目のキー追加直後に `1/1` になり、2個目以降が同一フレーム再登録になるのを防ぐ。

### 6. 保存時 transform 読取基準の見直し
対象:
- `src/mmd-manager.ts`

内容:
- `getBoneTransform()` が `linkedBone.position` / `linkedBone.rotationQuaternion` の生値を直接返すのをやめた。
- `runtimeBone.getWorldMatrixToRef()` で runtime 側の world 行列を取得する。
- 親ボーンの world 行列を逆変換して local 行列を復元する。
- rest position を引いて position offset を計算する。
- 回転は local 行列から Euler に変換する。
- ログ上の source を `runtime-world` に変更した。

意図:
- 2個目以降のキーフレーム保存時にも、「その場で実際に表示されている姿勢」に近い transform を保存側に渡す。

## なぜ `getBoneTransform()` が怪しかったか
症状発生時のログでは、同じ frame 追加でも以下のような差が出ていた。

- `fallbackPositionText` は前の大きい姿勢を示す
- `poseSnapshotText` / `resolvedTransformText` はごく小さい差分になる

これは「画面で見えている最終姿勢」と「保存時に読んでいる姿勢」が別基準だった可能性を示す。
特に、最初のキーが入ったあとに runtime animation が有効になると、`linkedBone` の生値だけでは見た目の最終姿勢を正しく表現できない疑いがあった。

## 再発防止のための確認順序
次に同種の不具合が出たら、以下の順で見る。

### 1. まず frame が本当に進んでいるか
見るログ:
- `frame update`
- タイムライン UI の `FRAME x / y`

確認ポイント:
- `1/1` に縮んでいないか
- 2個目のキー追加時に本当に別フレームへ移動できているか

### 2. 追加自体は通っているか
見るログ:
- `register bone keyframe request`
- `timeline storage add keyframe`
- `addTimelineKeyframe`

確認ポイント:
- `frameCount` が増えているか
- 同一フレーム上書きではないか

### 3. 保存値が見た目と一致しているか
見るログ:
- `persist movable bone keyframe`

確認項目:
- `poseSnapshotText`
- `resolvedTransformText`
- `positionBlockText`
- `rotationBlockText`

確認ポイント:
- ここが見た目と違うなら保存前の姿勢取得が原因。

### 4. 再生側のサンプルが正しいか
見るログ:
- `source pose sampled from movable track`

確認項目:
- `trackFrameNumbersText`
- `sampledText`

確認ポイント:
- 保存値は正しいのに `sampledText` が同じなら、再生側または runtime animation handle 更新が原因。

### 5. ボーン読取基準が正しいか
見るログ:
- `[BoneTransformRead]`

確認ポイント:
- `source: "runtime-world"` になっているか
- `snapshot` がその場の見た目と一致しているか

## 残課題
このメモ時点で、以下は重点監視対象。

- `runtime-world` 基準にしたあと、2個目以降のキー保存値が安定するか
- 保存値が正しいのに見た目が戻る場合、`refreshActiveRuntimeAnimationHandles()` 周りで handle 作り直し後に古い animation を参照していないか
- ギズモ操作中と seek 後で、runtime bone の local/world の意味が変わらないか

## 参考メモ
- Babylon.js Editor は MMD 向けキーフレーム editor そのものではない。
- `babylon-mmd` は loader / runtime として有用だが、editor 完成品ではない。
- そのため、この問題は Babylon.js 標準 editor の挙動ではなく、このプロジェクト側の保存経路と表示経路の整合性として見る必要がある。

## 実務上の運用メモ
スクリーンショットだけでは値の比較が足りないことが多い。次回ユーザーに依頼するログは最小限でよい。

- `[BoneTransformRead]` の `snapshot`
- `persist movable bone keyframe` の `poseSnapshotText`
- `source pose sampled from movable track` の `sampledText`

この3点だけで、
- 読取
- 保存
- 再生

のどこがズレているかをかなり早く絞れる。

## 2026-03-23 追加メモ: 登録ボタン前後でポーズが変わる件

### 症状
- ダイヤボタンを押す前は、ユーザーが作ったしゃがみ姿勢になっている。
- しかし登録ボタンを押した直後に、その場の見た目が変わってしまう。
- これにより「保存されたかどうか」以前に、編集中のポーズ確認が破綻していた。

### 前回の失敗要因
- 直前までの調査では、主に「保存値が違う」「2個目以降のキーが最初のポーズになる」問題に注目していた。
- そのため、登録直後の表示ジャンプを「保存失敗の見え方の一部」として見てしまい、独立した不具合として切り出せていなかった。
- 実際には、保存処理とは別に、登録直後の preview 更新処理がその場のポーズを書き換えていた。
- 特に `addKeyframeAtCurrentFrame()` 内で `persistInterpolationForNewKeyframe()` の直後に `refreshRuntimeAnimationFromInterpolationEdit()` を呼ぶ流れが、停止中のボーン編集中にも走っていた。
- この再評価で runtime animation の handle を作り直し、さらに current frame へ seek し直すため、ユーザーが見ていた編集中ポーズがその場で別姿勢へ置き換わっていた。

### 問題の整理
- この問題は「登録内容」ではなく「登録直後の見た目の維持」の問題。
- 保存値が正しくても、登録ボタンを押した瞬間に見た目が飛ぶと操作感として破綻する。
- 停止中にボーン姿勢を直接作ってからキーを打つワークフローでは、登録後もその場のポーズが維持される必要がある。

### 今回の対応
対象:
- `src/ui-controller.ts`

内容:
- `addKeyframeAtCurrentFrame()` に `shouldRefreshRuntimePreview` を追加した。
- 条件は以下。
- 再評価する: 再生中、またはボーントラック以外、または `poseSnapshot` が取れていない場合
- 再評価しない: 停止中のボーン/カメラ編集で、保存用 `poseSnapshot` を持っている場合
- これにより、停止中にボーンキーを登録した直後は `refreshRuntimeAnimationFromInterpolationEdit()` を呼ばないようにした。

### 対応の意図
- 登録直後に runtime animation を張り直すのは、再生中や補間編集では必要な場合がある。
- ただし停止中のボーンキー登録では、副作用の方が大きい。
- その場の見た目を維持したままキーだけ保存し、必要な再評価はフレーム移動や再生開始時に任せる方が操作感として正しい。

### この修正で期待する挙動
- 停止中にポーズを作る
- ダイヤで登録する
- 登録直後も見た目が変わらない
- 別フレームへ移動して戻ると、保存された姿勢が再現される

### 次にまだ見るべき点
- もし登録直後にもまだ飛ぶなら、原因は `refreshRuntimeAnimationFromInterpolationEdit()` 以外にもある。
- その場合は `onFrameUpdate` 側の slider 同期や `seekToBoundary()` の副作用を次の候補として見る。
- 特に、`frameChanged: false` のときにも display pose の同期が走るため、その経路で pending / source pose が上書きされていないか確認する。

## 2026-03-23 追加メモ: フレーム移動後に2個目以降のキーが見た目に反映されない件

### 症状
- 2個目のキーフレーム自体は登録できるようになった。
- コンソール上でも `persist movable bone keyframe` に 2個目の `positionBlockText` / `poseSnapshotText` が出ており、保存値は入っている。
- しかし矢印キーなどで別フレームへ移動して戻ると、見た目が 2個目の姿勢ではなく 1個目の姿勢に戻る。
- ボトムパネル上の値や sampled source は取れていそうなのに、3D 表示だけが古い pose のままになるケースがあった。

### 前回の失敗要因
- 直前までの調査では、主に「登録前後で pose が飛ぶ」問題に注目していた。
- そのため、フレーム移動後の問題も同じ原因の延長だと見てしまい、`refreshRuntimeAnimationFromInterpolationEdit()` 側だけを止めれば十分だと判断していた。
- しかし実際には、保存後の frame seek 時にも別の経路で表示と sampled pose の不整合が残っていた。
- `onFrameUpdate()` では `getDisplayBonePoseSnapshot(frame)` を使って表示用 source pose は取得していたが、その値を 3D 側の runtime bone へ明示的に戻していなかった。
- その結果、UI の読み出し結果と viewport 上の見た目が分離し、frame move 後に viewport だけ古い runtime pose を維持することがあった。

### 問題の整理
- この問題は「保存失敗」ではなく「フレーム移動後の再表示失敗」。
- 保存値の source は取れているが、frame move 後の viewport 再構築で selected bone の姿勢が sampled source に揃っていなかった。
- 特に停止中の編集ワークフローでは、frame seek 後に viewport が sampled source と一致することが最低条件になる。

### 今回の対応
対象:
- `src/ui-controller.ts`
- `src/mmd-manager.ts`

内容:
- `onFrameUpdate()` 内で `getDisplayBonePoseSnapshot(frame)` の結果を受け取った直後、停止中に限り selected bone の sampled pose を runtime bone へ再適用する処理を追加した。
- 新しく `applySelectedBonePoseSnapshotToRuntime()` を追加し、`snapshot.position` と `snapshot.rotation` をそのまま runtime 側へ流し込むようにした。
- その際、通常の編集イベントを再発火させると pending state が汚れるため、`setBoneTranslation()` / `setBoneRotation()` に `notifyEdited` 引数を追加し、frame move 経路では `false` を渡すようにした。
- あわせてログ `apply sampled pose to runtime` を追加し、frame seek 後に sampled source を viewport へ再適用したか確認できるようにした。

### 対応の意図
- frame move 時に sampled source が正しく取れているなら、その値を viewport に反映しない理由はない。
- runtime animation handle 側だけに再現を任せると、内部状態の揺れや seek 後の古い pose が残る可能性がある。
- 停止中の selected bone については、`onFrameUpdate()` で sampled source を最終表示値として明示的に当て直す方が挙動が安定する。
- 一方で、これを通常の編集通知付きで行うと「ユーザーが編集した」と誤認されるため、silent 適用に切り分けた。

### この修正で期待する挙動
- 2個目のキーフレームを保存する
- 別フレームへ移動する
- 元のフレームへ戻る
- sampled source と同じ姿勢が viewport に出る
- その際、pending edit 状態は勝手に復活しない

### 次にまだ見るべき点
- もし `apply sampled pose to runtime` が出ているのに見た目が戻るなら、selected bone 以外の runtime animation か physics 側が上書きしている可能性がある。
- その場合は `seekToBoundary()` 後の `stabilizePhysicsAfterHardSeek()` と `refreshActiveRuntimeAnimationHandles()` の順序を次の候補として見る。
- また、selected bone だけでなく「他ボーンも同時にキーフレーム化された姿勢」を扱う必要が出るなら、将来的には bone 単位の silent apply ではなく model animation 全体の deterministic 再評価へ寄せる必要がある。

## 2026-03-23 追加メモ: sampled pose は正しいのに見た目だけ最初のキーへ戻る件

### 症状
- frame 1 と frame 2 の両方で `source pose sampled from movable track` は正しい値を返していた。
- `apply sampled pose to runtime` もフレームごとに正しい `snapshotText` を出していた。
- ボトムパネル上の値も 2個目のキーに対応した値へ更新されていた。
- それでも viewport 上の 3D 表示だけは、フレームを行き来すると最初のキーの姿勢に見え続けた。

### 前回の失敗要因
- 直前の時点では、「sampled source を runtime bone に再適用すれば viewport も一致する」と見ていた。
- その前提で `onFrameUpdate()` から `setBoneTranslation()` / `setBoneRotation()` を silent に呼ぶ実装を入れた。
- しかし実際には、`linkedBone` の local 値を書き換えるだけでは babylon-mmd 側の最終描画行列が確定しなかった。
- そのため、ログ上では
- source は正しい
- runtime への再適用も走っている
- UI 値も正しい
- なのに見た目だけ古い
- という、いかにも「もう合っているように見える」状態にハマった。
- ここで「保存も読取も合っているなら setter の書き方の問題だろう」と早めに寄りすぎたのが、今回のつまずきだった。

### 途中で試した対処
対象:
- `src/mmd-manager.ts`

内容:
- `setBoneTranslation()` を `linkedBone.position.set(...)` ではなく `linkedBone.position = new Vector3(...)` に変更した。
- `setBoneRotation()` を `rotationQuaternion.copyFrom(...)` ではなく `linkedBone.setRotationQuaternion(rotation, Space.LOCAL)` に変更した。

狙い:
- babylon-mmd 本体の runtime animation 実装が同系統の書き方を使っていたため、bone setter 側の副作用をこちらも踏みに行く意図だった。

結果:
- この変更自体は方向として不自然ではなかったが、症状は解消しなかった。
- つまり setter の呼び方だけでは足りず、その後段の runtime 再計算まで必要だった。

### 問題の整理
- この段階で、保存・サンプリング・UI 読み出しは正しいと見てよい状態だった。
- それでも viewport だけが古いということは、問題は「値」ではなく「最終描画行列の更新」だった。
- babylon-mmd の `MmdModel` 実装上、最終 matrix は `afterPhysics()` 段階を通って初めて保証される。
- したがって、停止中の frame move で bone 値を直接当て直す場合も、MMD runtime の更新段階を省略してはいけなかった。

### 今回の対応
対象:
- `src/mmd-manager.ts`

内容:
- `recomputeCurrentModelPoseAfterManualEdit()` を追加した。
- この helper で `currentModel.beforePhysics(null)` と `currentModel.afterPhysics()` を呼ぶようにした。
- さらに `invalidateBoneVisualizerPose()` 内で
- `linkedBone.markAsDirty()`
- `recomputeCurrentModelPoseAfterManualEdit()`
- skeleton の `computeAbsoluteMatrices(true)`
- `updateBoneGizmoTarget()`
- 必要なら `onBoneTransformEdited`
- の順で処理するようにした。

### 対応の意図
- 停止中の sampled pose 再適用は「local 値の書換え」だけでは完結しない。
- babylon-mmd は独自の runtime bone 更新と `worldTransformMatrices` を持っており、最終表示は `afterPhysics()` 後の状態を見る。
- そのため、manual apply のたびに MMD runtime の更新フェーズを明示的に踏む必要がある。
- これで「sampled pose は正しいのに見た目だけ古い」という状態を、保存や読取ではなく描画再計算の問題として処理できる。

### 今回の学び
- `sampledText` が正しいことと、viewport が正しいことは別問題。
- Babylon.js の `Bone` / `TransformNode` の dirty 更新だけで足りると思い込むと、babylon-mmd の独自 runtime を見落とす。
- MMD editor の不具合では
- 保存値
- sampled source
- runtime bone の local 値
- 最終描画行列
- を別レイヤとして分けて考えないと、途中で「もう合っているように見える」罠に入る。

### 次にまだ見るべき点
- もしこの対応後も frame move で最初のキーへ見た目が戻るなら、selected bone だけの manual apply ではなく、seek 後に model animation 全体を deterministic に再評価する必要がある。
- 特に `refreshActiveRuntimeAnimationHandles()` と `mmdRuntime.seekAnimation()` の順序や、seek 後に他ボーンが selected bone を再上書きしていないかを確認対象にする。
- その場合は、selected bone 単位の局所対処を続けるより、frame move 時の model runtime 再構築手順自体を見直す方が正しい。

## 2026-03-23 成功例: フレーム移動と登録が安定したケース

### 最終的に確認できたこと
- キーフレーム登録時に、登録前後で pose が不意に飛ばない状態になった。
- 2個目以降のキーフレームも登録できるようになった。
- 矢印で frame を前後したときに、少なくとも今回の確認では 1個目のキーへ戻らず、各 frame の姿勢が追従するところまで改善した。

### 効いた対処
今回効いた可能性が高いのは、単独の修正ではなく次の組み合わせ。

1. 停止中の登録直後に `refreshRuntimeAnimationFromInterpolationEdit()` を無条件で走らせないようにした
- 登録ボタン直後の pose ジャンプを抑えるため

2. `getBoneTransform()` を `runtime-world` 基準で読むようにした
- ギズモ操作後の保存値が古い panel 値に戻らないようにするため

3. `onFrameUpdate()` で sampled pose を停止中の runtime bone へ再適用するようにした
- source の読み出し結果と viewport 表示を揃えるため

4. `invalidateBoneVisualizerPose()` 内で `currentModel.beforePhysics(null)` / `afterPhysics()` を通すようにした
- babylon-mmd の最終描画行列まで更新を届かせるため

5. `seekTo()` / `seekToBoundary()` ごとに `refreshActiveRuntimeAnimationHandles()` を呼ぶのをやめた
- 単純な frame move のたびに runtime animation handle を作り直し、結果として pose reset を誘発する経路を切った

### 今回の成功からわかること
- この問題は「保存」だけの問題ではなく、
- 保存値
- sampled source
- runtime bone の local 値
- babylon-mmd の最終描画行列
- frame move 時の runtime handle 管理
- が全部絡んでいた。

- 特に、frame move のたびに runtime animation handle を張り直す設計は、編集用途では副作用が大きかった。
- 再生開始時や明示的な補間 refresh と、単純な seek は分けて扱う方が安全。

### 成功例として残す運用メモ
- 停止中の bone key 登録と frame move を安定させたい場合、`seekAnimation(frame, true)` だけで足りる場面では handle 再生成を混ぜない方がよい。
- babylon-mmd では `linkedBone` へ値を書いただけでは十分でないことがあるため、必要に応じて `beforePhysics(null)` / `afterPhysics()` を通して最終描画行列まで更新する。
- 骨ギズモ更新経路は再帰しやすいので、pose invalidation から `updateBoneGizmoTarget()` を直接呼び返さないように注意する。

### 今後の再発防止
- frame move 用処理と、補間編集後 preview 更新処理を混ぜない。
- 保存不具合と表示不具合を同じ問題として扱わず、必ず
- 保存値
- sampled source
- runtime-world 読取
- viewport 見た目
- を分離して確認する。
- ギズモ、runtime、timeline の3者が相互にイベントを投げる箇所では、再入や再帰を最初に疑う。
