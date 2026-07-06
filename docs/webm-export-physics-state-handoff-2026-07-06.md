# WebM 出力の物理状態引き継ぎ調査メモ

更新日: 2026-07-06

## 目的

WebM 動画出力時に、出力用 renderer の物理演算を初期状態からではなく、メインビューポートで現在表示されている剛体状態から開始したい。

MMD 寄せの期待挙動としては、再生停止中や任意フレームで物理を馴染ませたあと、その状態を起点に動画出力できること。

## 現状の構造

- WebM 出力は別 renderer/window で実行される。
- `src/ui/export-ui-controller.ts` が `WebmExportRequest` を作り、`startWebmExportWindow()` に渡す。
- `src/webm-exporter.ts` 側では `MmdManager.create()` 後に `importProjectState(request.project, { forExport: true })` で project を読み直す。
- そのため、通常の project state にはビューポート上で馴染んだ剛体 transform / velocity は含まれない。
- 何もしない場合、出力 renderer は project import と `seekTo(startFrame)` 後の物理初期状態から始まる。

## 試した実装

### 1. WebM request に一時 snapshot を追加

`src/types.ts` に `WebmInitialPhysicsState` を追加した。

内容:

- `capturedFrame`
- `physicsEnabled`
- model ごとの `rigidBodyStates`
- rigid body ごとの `transformMatrix`
- `linearVelocity`
- `angularVelocity`

これは project 保存形式には入れず、WebM 起動時の IPC request だけに載せる方針。

### 2. ビューポート側で snapshot 採取

`MmdManager.captureWebmInitialPhysicsState()` を追加し、`src/ui/export-ui-controller.ts` から WebM 出力開始直前に呼ぶようにした。

`src/physics/physics-model-controller.ts` に backend 差分を隔離した helper を追加した。

Bullet MPR / WASM 系:

- model 内部の `_physicsModel._bundle`
- `_rigidBodyIndexMap`
- `getTransformMatrixToRef()`
- `getLinearVelocityToRef()`
- `getAngularVelocityToRef()`

Classic / Ammo 系:

- model 内部の `_physicsModel._nodes`
- `_physicsModel._bodies`
- Babylon `PhysicsBody` の velocity API

### 3. exporter 側で snapshot 復元

`src/webm-exporter.ts` で project import と `seekTo(startFrame)` の後に `MmdManager.applyWebmInitialPhysicsState()` を呼ぶようにした。

ログ上は次のように復元処理が走ることを確認した。

```text
initialPhysicsModels: 1
initialPhysicsFrame: 0
initial physics snapshot restored
restoredModels: 1
requestedModels: 1
```

## 発生した問題と対応

### 問題 1: Bullet MPR Immediate で `commitToWasm()` が落ちる

エラー:

```text
commit only avalible on buffered evaluation mode
```

原因:

- Bullet MPR の evaluation type が `Immediate` のとき、`commitToWasm()` は呼べない。
- 復元時に常に `commitToWasm()` を呼んでいた。

対応:

- `_bundle.needToCommit === true` のときだけ `commitToWasm()` を呼ぶように変更。

結果:

- WebM 出力開始時のクラッシュは解消。

### 問題 2: snapshot 復元後に物理初期化で上書きされる

原因:

- 当初の順序は `seekTo(startFrame)` → snapshot 復元 → `setExternalPlaybackSimulationEnabled(true)` だった。
- `setExternalPlaybackSimulationEnabled(true)` 内で `applyPhysicsStateToAllModels()` が呼ばれ、`initializeMmdModelPhysics()` 相当の初期化が走って snapshot が上書きされた。

対応:

- 順序を `seekTo(startFrame)` → `setExternalPlaybackSimulationEnabled(true)` → snapshot 復元へ変更。

結果:

- ログ上は復元後に明示的な初期化上書きは挟まらなくなった。
- ただし見た目はまだ初期状態から始まる。

### 問題 3: Bullet MPR の dynamic transform と表示同期 buffer の不一致を疑った

観察:

- Bullet MPR の `setDynamicTransformMatrix()` は dynamic body の world transform 側を更新する。
- 一方で `MmdBulletPhysicsModel.syncBones()` が読む `getTransformMatrixToRef()` は buffered motion state 側を参照している。

対応:

- 復元時に `setDynamicTransformMatrix()` だけでなく `setTransformMatrix()` も呼ぶようにした。
- さらに `updateBufferedMotionStates(true)` を呼んで、front buffer を読み直すようにした。

結果:

- lint / unit / critical typecheck は通る。
- ただし実機確認では、まだビューポートの馴染んだ剛体状態が動画出力開始状態へ反映されていない。

## 現時点の未解決点

ログ上は request に snapshot が載り、exporter 側でも復元処理は成功している。

それでも見た目が初期状態から始まるため、次のどれかが残っている可能性が高い。

1. 採取している transform が、実際に欲しい物理 body state ではない。
2. Bullet MPR の dynamic body transform を外部から復元するには、`setDynamicTransformMatrix()` / `setTransformMatrix()` 以外の runtime API または wasm API が必要。
3. `beforePhysics()` の `syncBodies()` が、復元した body state を即座にボーン姿勢由来の body transform で上書きしている。
4. 出力開始直後の `playAnimation()` / `scene.render()` により、初回フレームで animation pose から body が再同期されている。
5. snapshot の `capturedFrame` と WebM の `startFrame` がズレるケースでは、そもそも MMD 的に破綻しやすい。今回ログでは `capturedFrame: 0`, `startFrame: 0` のケースでも反映されなかった。

## 次に試す候補

### A. 復元直後の before/after physics を一時的に止めて初回 capture する

初回フレームだけ `beforePhysics()` の body sync を避けられるか調査する。

目的:

- snapshot が表示に反映できるのか
- それとも physics world 側に入っていないのか

### B. Bullet MPR の wasm API で body transform を直接確認する

復元直後に `_bundle.getTransformMatrixToRef()` と velocity をログし、snapshot と一致するか比較する。

見るポイント:

- set 直後の値は一致するか
- 初回 `renderOnceForCapture(0)` 後に値が戻っていないか
- `syncBodies()` の前後で戻っていないか

### C. body state ではなく bone pose snapshot として渡す

物理 body の完全な復元が難しい場合、MMD 寄せの代替として「馴染んだ後の骨姿勢」を snapshot して出力開始 pose に適用する案。

利点:

- 最初の見た目は一致させやすい。

欠点:

- velocity / constraint momentum は引き継げない。
- 物理的な連続性は弱い。

### D. 出力開始前に exporter 側で warm-up simulation する

snapshot 移送ではなく、exporter 側で `startFrame` まで物理を事前評価して馴染ませる案。

利点:

- runtime が想定する通常経路で物理状態を作れる。

欠点:

- 重い。
- ビューポートでユーザーが作った偶発的な状態とは一致しない。
- 出力範囲の前に何フレーム warm-up するかが難しい。

## 現時点の判断

「WebM exporter の別 renderer に project を読み直す」構造では、ビューポートの物理 world state は標準的には渡らない。

今回の snapshot 方式は方向性としては妥当だが、Bullet MPR 内部の body state / motion state / beforePhysics sync の関係をもう一段調べる必要がある。

次回はログを増やして、少なくとも以下を比較するのがよい。

- ビューポートで採取した body transform
- exporter で復元直後の body transform
- `setExternalPlaybackSimulationEnabled(true)` 後
- 初回 `renderOnceForCapture(0)` 前後
- 初回 `playAnimation()` / `renderOnceForCapture(1000 / fps)` 後

## 2026-07-06 追加試行: pending physics initialization の消去

追加で疑った点:

- babylon-mmd はモデル作成時に、次回 `beforePhysics()` で実行する物理初期化キューへモデルを積む。
- `MmdRuntime` では `_needToInitializePhysicsModels`、`MmdWasmRuntime` では `_needToInitializePhysicsModels` / `_needToInitializePhysicsModelsBuffer` / `_physicsRuntime.initializer` が関係する。
- WebM exporter 側では project import 後に新しい runtime / model を作るため、viewport から渡した snapshot を復元しても、初回 render / physics tick でこの初期化キューが走ると body state が初期状態へ戻る可能性が高い。

対応:

- `PhysicsModelController.clearPendingPhysicsInitializations()` を追加。
- `MmdManager.applyWebmInitialPhysicsState()` の先頭で pending initialization queue を clear してから snapshot を復元する。
- 復元ログに `clearedPendingInitializations` を追加し、実機ログからこの経路が効いたか確認できるようにした。

確認:

- `npm.cmd run lint`: 成功。
- `npm.cmd run test:unit`: 成功。
- `npm.cmd run typecheck:critical`: 成功。既存の非 critical typecheck error は残る。

まだ残る懸念:

- 初回 `renderOnceForCapture(0)` でも `beforePhysics(null)` が走るため、`syncBodies()` が復元済み body state をどこまで上書きするかは実機確認が必要。
- dynamic body は `syncBodies()` で基本的に直接 transform 上書きされないはずだが、disabled body / PhysicsWithBone / buffered evaluation の経路ではまだ上書き余地がある。
- これでも引き継がれない場合は、次は復元直後、初回 render 後、初回 play/render 後の同一 rigid body transform をログ比較する。
