# WebM 出力の物理状態引き継ぎ仕様

更新日: 2026-07-06

## 目的

WebM 動画出力開始時に、出力用 renderer の物理状態を初期状態から始めるのではなく、メインビューポートで現在表示されている剛体状態から開始する。

MMD 寄せの挙動として、ユーザーが再生停止中または任意フレームで物理を馴染ませたあと、その状態を起点に動画出力できることを優先する。

## 現行仕様

- WebM 出力は専用 renderer/window で project を読み直して実行する。
- project state には、再生中に馴染んだ rigid body の world transform / velocity は保存しない。
- その代わり、WebM 出力開始リクエストに一時的な `WebmInitialPhysicsState` snapshot を載せる。
- snapshot は project 保存形式ではなく、WebM 起動 IPC のためだけの transient data として扱う。
- snapshot には model ごとの `rigidBodyStates`、rigid body ごとの `transformMatrix`、`linearVelocity`、`angularVelocity` を含める。
- exporter 側は project import と `seekTo(startFrame)` の後、`setExternalPlaybackSimulationEnabled(true)` を先に実行してから snapshot を復元する。
- 復元直前に babylon-mmd runtime の pending physics initialization queue を clear する。
- 復元後は `syncBones()` により、剛体状態をモデルの表示姿勢へ同期してから capture へ進む。

## 実装箇所

- capture: `MmdManager.captureWebmInitialPhysicsState()`
- request: `WebmExportRequest.initialPhysicsState`
- IPC sanitize: `sanitizeWebmInitialPhysicsState()`
- restore: `MmdManager.applyWebmInitialPhysicsState()`
- backend adapter: `PhysicsModelController.captureWebmPhysicsModelSnapshot()` / `applyWebmPhysicsModelSnapshot()`
- pending initialization clear: `PhysicsModelController.clearPendingPhysicsInitializations()`

## 重要な順序

WebM exporter 側では、以下の順序を守る。

1. project を import する。
2. `pause()` する。
3. `setAutoRenderEnabled(false)` にする。
4. `seekTo(startFrame)` する。
5. `setExternalPlaybackSimulationEnabled(true)` する。
6. pending physics initialization queue を clear する。
7. `WebmInitialPhysicsState` を復元する。
8. capture を開始する。

`setExternalPlaybackSimulationEnabled(true)` より前に snapshot を復元すると、内部の `applyPhysicsStateToAllModels()` / physics initialization 経路で復元状態が上書きされる可能性がある。

また、project import 直後のモデルは babylon-mmd runtime 側の初期化キューに残ることがある。この queue を残したまま初回 physics tick に進むと、復元した剛体状態が初期状態へ戻るため、snapshot 復元直前に clear する。

## 確認済み

- WebM 出力開始時、ビューポート側で馴染ませた剛体状態が動画出力側へ反映される。
- `npm.cmd run lint`: 成功。
- `npm.cmd run test:unit`: 成功。
- `npm.cmd run typecheck:critical`: 成功。既存の非 critical typecheck error は残る。

## 制約

- snapshot は出力開始時の初期状態だけを渡す。出力中の物理は exporter 側 runtime が通常どおり進める。
- project save / load の互換データには含めない。
- `capturedFrame` と出力 `startFrame` が大きくずれている場合の見た目の妥当性は未検証。
- 基本用途は、現在のビューポート状態からそのまま動画出力を始めるケースとする。

## 関連メモ

- `docs/webm-export-physics-state-handoff-2026-07-06.md`
