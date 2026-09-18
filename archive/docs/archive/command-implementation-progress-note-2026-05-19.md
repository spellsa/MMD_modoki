# Command 実装進捗メモ

更新日: 2026-05-19

## 目的

`CommandBuilder` / `CommandExecutor` / `HistoryManager` の実装進捗と確認結果を記録する。

設計方針や型案は次を参照する。

- [Command 設計メモ 2026-05-19](./command-design-note-2026-05-19.md)
- [Action / Command / 入力管理 調査メモ](./action-command-input-management-note-2026-05-17.md)
- [Action Dispatcher 進捗メモ](./action-dispatcher-progress-note-2026-05-18.md)
- [Keyframe Actions](./actions/keyframe-actions.md)
- [Undo / Redo 検討メモ](./undo-redo-investigation.md)

## 現時点の方針

初回 PoC では既存 UI / runtime へ接続しない。

まず `Action -> CommandDiff` を pure helper と Vitest で固める。`UIController` への接続、`Ctrl+Z` / `Ctrl+Y`、Zustand 連携、SQLite WASM 連携は後段に回す。

最初に扱う Action:

- `keyframe.addCurrent`
- `keyframe.deleteSelected`
- `keyframe.nudgeSelected`

最初に履歴化する差分:

- frame list の追加
- frame list の削除
- frame list の移動

最初は対象外:

- 既存 frame 上書き時の補間保存
- pose snapshot 保存
- interpolation handle drag
- bone / camera gizmo drag
- project load / file load
- effect slider の連続変更

## 実装ステップ

### Step 1: 型と pure helper

状態: 完了

対象:

- `src/actions/command-types.ts`
- `src/actions/keyframe-command-builder.ts`
- `test/actions/keyframe-command-builder.test.ts`

完了条件:

- `keyframe.addCurrent` から `keyframe.add` diff を作れる。
- `keyframe.deleteSelected` から `keyframe.delete` diff を作れる。
- `keyframe.nudgeSelected` から `keyframe.move` diff を作れる。
- 実行不可の場合は `null` を返す。
- button / shortcut の `source` が違っても diff は同じ。
- `mergeKey` が安定する。

確認予定:

```powershell
npm.cmd run test:unit
npm.cmd run lint
```

確認結果:

- 2026-05-19: `npm.cmd run test:unit`
  - 13 files / 76 tests passed
- 2026-05-19: `npm.cmd run lint`
  - 0 errors / 467 warnings
  - warnings は既存の `any` / non-null assertion など

### Step 2: HistoryManager

状態: 完了

対象:

- `src/actions/history-manager.ts`
- `test/actions/history-manager.test.ts`

完了条件:

- `push`
- `undo`
- `redo`
- `clear`
- `canUndo`
- `canRedo`
- `maxEntries`

方針:

- `HistoryManager` は command を実行しない。
- stack の移動だけを担当する。

確認結果:

- 2026-05-19: `npm.cmd run test:unit`
  - 14 files / 84 tests passed
- 2026-05-19: `npm.cmd run lint`
  - 0 errors / 467 warnings
  - warnings は既存の `any` / non-null assertion など

### Step 3: CommandExecutor

状態: 完了

対象:

- `src/actions/command-executor.ts`
- `test/actions/command-executor.test.ts`

完了条件:

- `apply keyframe.add` で add が呼ばれる。
- `revert keyframe.add` で remove が呼ばれる。
- `apply keyframe.delete` で remove が呼ばれる。
- `revert keyframe.delete` で add が呼ばれる。
- `apply keyframe.move` で from -> to の move が呼ばれる。
- `revert keyframe.move` で to -> from の move が呼ばれる。

方針:

- test は mock context を使う。
- この段階では `UIController` へ接続しない。

確認結果:

- 2026-05-19: `npm.cmd run test:unit`
  - 15 files / 91 tests passed
- 2026-05-19: `npm.cmd run lint`
  - 0 errors / 467 warnings
  - warnings は既存の `any` / non-null assertion など

### Step 4: UIController への最小接続

状態: 完了

最初の候補:

- `keyframe.nudgeSelected`

完了条件:

- `keyframe.nudgeSelected` が Command 経由で実行される。
- 成功時に `HistoryManager.push()` される。
- 既存の seek / selected frame 更新 / timeline 更新が維持される。
- 失敗時の seek fallback が壊れない。

確認予定:

```powershell
npm.cmd run test:unit
npm.cmd run lint
```

必要なら追加:

```powershell
npm.cmd run smoke:launch
```

確認結果:

- 2026-05-19: `npm.cmd run test:unit`
  - 15 files / 91 tests passed
- 2026-05-19: `npm.cmd run lint`
  - 0 errors / 467 warnings
  - warnings は既存の `any` / non-null assertion など
- 2026-05-19: `npm.cmd run smoke:launch`
  - pass
  - `engine=WebGPU`
  - `physics=Bullet MPR`
  - `crossOriginIsolated=true`

### Step 5: undo / redo Action

状態: 完了

対象:

- `history.undo`
- `history.redo`

完了条件:

- 仮 API または shortcut で undo / redo できる。
- undo / redo 後に source animation / timeline 表示 / Babylon runtime 状態が揃う。
- undo / redo 後に current frame は維持される。

決定済み:

- shortcut は `Ctrl+Z` / `Ctrl+Y` のみ。`Ctrl+Shift+Z` は redo として扱わない。
- undo / redo 後は現 frame のままにし、seek しない。
- project / model / motion load 後も履歴は clear しない。アプリ起動中は履歴を保持する。
- `canUndo` / `canRedo` は上パネル UI へ表示する。ただし UI 実装は shortcut 接続より後でよい。
- undo / redo 対象の最優先はボーン移動回転操作。
- キーフレーム登録 / 削除 / 移動はボーン操作の次に重要な対象。
- モーフ / カメラは、まずキーフレーム単位の undo / redo に寄せる。
- モデル削除や project / model / motion / audio load は undo / redo 対象外。

未決:

- undo / redo 実行前に再生を止めるか。

## 追加した基盤

- `src/actions/command-types.ts`
  - `BuiltCommand`
  - `CommandDiff`
  - `KeyframeCommandDiff`
  - `EditCommandDiff`
  - `BoneTransformCommandSnapshot`
  - `CommandScope`
  - `CommandDirection`
  - `CommandTrackRef`
- `src/actions/keyframe-command-builder.ts`
  - `buildKeyframeCommand()`
  - `createCommandTrackKey()`
  - `KeyframeCommandSnapshot`
- `test/actions/keyframe-command-builder.test.ts`
  - `keyframe.addCurrent -> keyframe.add diff`
  - `keyframe.deleteSelected -> keyframe.delete diff`
  - `keyframe.nudgeSelected -> keyframe.move diff`
  - 実行不可時の `null`
  - `source` 差分に依存しない diff
  - nudge 衝突時の frame merge
  - track ごとの安定した `mergeKey`
- `src/actions/bone-transform-command-builder.ts`
  - `buildBoneTransformCommand()`
  - before / after snapshot から `edit.boneTransform` command を作成
  - 変化なし、boneName なし、無効 frame は `null`
- `test/actions/bone-transform-command-builder.test.ts`
  - `edit.boneTransform` command 作成
  - no-op 時の `null`
- `src/actions/history-manager.ts`
  - `HistoryManager`
  - `push`
  - `undo`
  - `redo`
  - `clear`
  - `canUndo`
  - `canRedo`
  - `maxEntries`
- `test/actions/history-manager.test.ts`
  - push / undo / redo / clear
  - redo stack clear
  - empty stack handling
  - max entry limit
- `src/actions/command-executor.ts`
  - `executeCommand()`
  - `CommandExecutionContext`
  - `keyframe.add` apply / revert
  - `keyframe.delete` apply / revert
  - `keyframe.move` apply / revert
  - `edit.boneTransform` apply / revert
- `test/actions/command-executor.test.ts`
  - mock context で add / remove / move 呼び出しを確認
  - selected frame / seek / refresh 呼び出しを確認
  - 操作失敗時に UI 同期系を呼ばないことを確認
  - bone transform の before / after 適用を確認
- `src/ui-controller.ts`
  - `HistoryManager` を保持
  - `collectKeyframeCommandSnapshot()`
  - `createCommandExecutionContext()`
  - `keyframe.nudgeSelected` を `buildKeyframeCommand()` / `executeCommand()` / `HistoryManager.push()` 経由に変更
  - Command を作れない場合や実行できない場合は既存の seek fallback を維持
  - `keyframe.addCurrent` / `keyframe.deleteSelected` を `buildKeyframeCommand()` / `executeCommand()` / `HistoryManager.push()` 経由に変更
  - `keyframe.registerBone` は track 選択後に `keyframe.addCurrent` と同じ Command 経路へ接続
  - `history.undo` / `history.redo` を `HistoryManager.undo()` / `redo()` と `executeCommand()` へ接続
  - undo / redo 用 context では `seekToBoundary` を no-op にし、current frame を維持
  - ボーン transform slider / gizmo drag の begin / commit から `edit.boneTransform` command を積む
  - bone transform undo / redo では `setBoneTranslation(..., false)` / `setBoneRotation(..., false)` で runtime に戻し、bottom panel / dirty state を同期
- `src/bottom-panel.ts`
  - `onBoneTransformEditStarted`
  - `onBoneTransformEditCommitted`
- `src/mmd-manager.ts`
  - `onBoneTransformEditStarted`
  - `onBoneTransformEditCommitted`
- `src/editor/bone-gizmo-controller.ts`
  - gizmo drag の開始 / 終了を callback へ通知
- `src/actions/types.ts`
  - `HistoryAction`
  - `history.undo`
  - `history.redo`
- `src/actions/action-availability.ts`
  - `canUndo`
  - `canRedo`
- `test/actions/action-availability.test.ts`
  - history availability の canExecute 判定
  - `keyframe.deleteSelected` が selected frame なしの場合に current frame を使う fallback を確認

## 確認結果

2026-05-19:

- npm.cmd run test:unit
  - 13 files / 76 tests passed
- npm.cmd run test:unit
  - 14 files / 84 tests passed
- npm.cmd run test:unit
  - 15 files / 91 tests passed
- npm.cmd run test:unit
  - 15 files / 92 tests passed
- 2026-05-20: `npm.cmd run test:unit`
  - 15 files / 93 tests passed
- 2026-05-20: `npm.cmd run test:unit`
  - 16 files / 96 tests passed
- npm.cmd run lint
  - 0 errors / 467 warnings
  - warnings は既存の `any` / non-null assertion など
- npm.cmd run smoke:launch
  - pass
  - `engine=WebGPU`
  - `physics=Bullet MPR`
  - `crossOriginIsolated=true`
- 2026-05-20: `npm.cmd run lint`
  - 0 errors / 467 warnings
  - warnings は既存の `any` / non-null assertion など
- 2026-05-20: `npm.cmd run smoke:launch`
  - pass
  - `engine=WebGPU`
  - `physics=Bullet MPR`
  - `crossOriginIsolated=true`
- npm.cmd run smoke:launch
  - pass
  - `engine=WebGPU`
  - `physics=Bullet MPR`
  - `crossOriginIsolated=true`
- 2026-05-20: 実機確認
  - bone slider / gizmo drag の undo / redo OK

## 現時点の制約

- Command は `keyframe.addCurrent` / `keyframe.deleteSelected` / `keyframe.nudgeSelected` / `edit.boneTransform` が runtime に接続済み。
- `HistoryManager` は stack 管理のみ実装済み。transaction / merge は未実装。
- `ActionDispatcher` は `keyframe.nudgeSelected` と `history.undo` / `history.redo` を通して Command 経路へ接続済み。
- `canUndo` / `canRedo` を上パネル UI state へ反映する経路は未実装。
- add keyframe の既存 frame 上書きは、初期 Command diff の対象外。現状は既存の更新経路を維持する。
- ボーン移動回転は slider / gizmo drag の commit 単位で Command 化済み。実モデルでの手動操作確認も OK。
- interpolation / pose snapshot の差分型は未設計。

## 次にやること

1. モーフ / カメラのキーフレーム単位 undo / redo を設計する。
2. 上パネルに undo / redo button を追加し、`canUndo` / `canRedo` を反映する。
3. undo / redo 実行前に再生を止めるか決める。
4. load 後に対象 track が存在しない command の失敗表示を手動確認する。
