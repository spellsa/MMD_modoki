# Command 設計メモ 2026-05-19

## 目的

Action 化が進んだ状態から、次に `Command` / `CommandDiff` / `HistoryManager` をどう入れるか整理する。

このメモでは、まず `keyframe.*` の最小 PoC を対象にする。補間、ボーン / カメラ drag、effect slider は重要だが、連続入力の commit 単位が必要なので後続に回す。

関連:

- [Action / Command / 入力管理 調査メモ](./action-command-input-management-note-2026-05-17.md)
- [Action Dispatcher 進捗メモ](./action-dispatcher-progress-note-2026-05-18.md)
- [Keyframe Actions](./actions/keyframe-actions.md)
- [Interpolation Actions](./actions/interpolation-actions.md)
- [Undo / Redo 検討メモ](./undo-redo-investigation.md)

## 現状

- `src/actions/types.ts` に `EditorAction` 型がある。
- `src/actions/action-dispatcher.ts` に `ActionDispatcher` がある。
- `src/actions/action-availability.ts` に `canExecuteEditorAction()` がある。
- `UIController.setupActionHandlers()` は `keyframe.*` / `playback.*` / `timeline.*` などを既存処理へ dispatch している。
- `CommandBuilder`、`CommandExecutor`、`HistoryManager` は未実装。
- v0.2 チェックリストでは `Action -> Command`、`Action -> diff`、undo / redo 用の最小差分、`mergeKey` が未完了。

既存の keyframe 操作は概ね次の経路を通る。

```text
EditorAction
  -> UIController private method
  -> MmdManager.add/remove/moveTimelineKeyframe()
  -> timeline-edit-service
  -> source animation / track frame map / timeline 表示更新
```

Command PoC では、この既存処理を一気に置き換えず、まず「実行前に差分を作る」「差分を executor で既存 API へ反映する」形に寄せる。

## Command の責務

`Action` はユーザー意図、`Command` は undo / redo 可能な編集単位とする。

Command が持つもの:

- id
- label
- scope
- diff
- mergeKey
- createdAtMs

Command が直接持たないもの:

- DOM event
- Babylon object
- File object
- UI element
- toast 文言
- runtime object 参照

初期 PoC では、Command に `execute()` / `undo()` / `redo()` 関数を直接持たせるより、`diff` を保持し、`CommandExecutor` が apply / revert する形を優先する。

理由:

- Vitest で `Action -> diff` を確認しやすい。
- diff を将来 `command_event` として記録しやすい。
- UIController の private method と runtime 副作用を CommandBuilder から切り離せる。

## 最小型案

```ts
export type CommandScope =
  | "keyframe"
  | "interpolation"
  | "edit"
  | "effect"
  | "project";

export type CommandDirection = "apply" | "revert";

export type CommandTrackRef = {
  category: TrackCategory;
  name: string;
};

export type KeyframeCommandDiff =
  | {
      type: "keyframe.add";
      track: CommandTrackRef;
      frame: number;
      beforeFrames: number[];
      afterFrames: number[];
    }
  | {
      type: "keyframe.delete";
      track: CommandTrackRef;
      frame: number;
      beforeFrames: number[];
      afterFrames: number[];
    }
  | {
      type: "keyframe.move";
      track: CommandTrackRef;
      fromFrame: number;
      toFrame: number;
      beforeFrames: number[];
      afterFrames: number[];
    };

export type CommandDiff = KeyframeCommandDiff;

export type BuiltCommand = {
  id: string;
  label: string;
  scope: CommandScope;
  diff: CommandDiff;
  mergeKey?: string;
  createdAtMs: number;
};
```

`beforeFrames` / `afterFrames` は最初は `Uint32Array` ではなく `number[]` にする。

理由:

- test expectation が書きやすい。
- JSON 化しやすい。
- 後で executor で `Uint32Array` に戻せる。
- `CommandDiff` に runtime buffer を直接持ち込まないで済む。

## 最初に扱う Action

### `keyframe.addCurrent`

Command 化条件:

- 選択中 track がある。
- current frame が 0 以上の整数に正規化できる。
- 既に同 frame に keyframe がある場合は、初期 PoC では no-op とする。

diff:

- `type: "keyframe.add"`
- `track`
- `frame`
- `beforeFrames`
- `afterFrames`

注意:

- 現行 `addKeyframeAtCurrentFrame()` は、既存 frame がある場合でも補間や pose snapshot の上書き経路がある。
- 最初の PoC でこの上書きまで Command 化すると diff が大きくなる。
- まずは「新規 frame 追加だけ」を履歴化し、既存 frame 更新は後続で `keyframe.upsert` / `interpolation.update` として分ける。

### `keyframe.deleteSelected`

Command 化条件:

- 選択中 track がある。
- selected frame がある。
- 対象 frame に keyframe がある。

diff:

- `type: "keyframe.delete"`
- `track`
- `frame`
- `beforeFrames`
- `afterFrames`

注意:

- 現行処理は selected frame がなければ current frame を削除対象にする。
- Command PoC では selected frame 優先に寄せる。current frame fallback を残すかは、既存 UX と undo 単位を見て決める。
- 削除後の selected frame clear は executor 後の UI sync で扱う。

### `keyframe.nudgeSelected`

Command 化条件:

- 選択中 track がある。
- selected frame がある。
- `deltaFrames` が `-1 | 1`。
- `toFrame = max(0, selectedFrame + deltaFrames)` が `selectedFrame` と異なる。
- 対象 frame に keyframe がある。

diff:

- `type: "keyframe.move"`
- `track`
- `fromFrame`
- `toFrame`
- `beforeFrames`
- `afterFrames`

注意:

- 現行 `nudgeSelectedKeyframe()` は、track / selected frame がない場合や move できない場合に seek fallback する。
- Command 化では、この fallback は `keyframe.nudgeSelected` の Command ではなく、非履歴の `playback.stepFrame` / `playback.seekFrame` として扱う方がよい。
- 既に `toFrame` に keyframe がある場合、現行 `moveFrameNumber()` は `fromFrame` を消して `toFrame` に merge する。これは「移動」ではなく「衝突 merge」なので、PoC では明示的なテスト対象にする。

## CommandBuilder 案

`CommandBuilder` は runtime を直接変更しない。Action と snapshot から `BuiltCommand | null` を返す。

```ts
export type KeyframeCommandSnapshot = {
  selectedTrack: CommandTrackRef | null;
  selectedFrame: number | null;
  currentFrame: number;
  framesByTrackKey: Record<string, number[]>;
};

export function buildKeyframeCommand(
  action: KeyframeAction,
  snapshot: KeyframeCommandSnapshot,
  nowMs = Date.now(),
): BuiltCommand | null;
```

Snapshot に含めるもの:

- selected track
- selected frame
- current frame
- 対象 track の frame 配列

Snapshot に含めないもの:

- `MmdManager`
- `Timeline`
- `UIController`
- Babylon runtime
- toast

`framesByTrackKey` は PoC では対象 track だけでもよい。将来の複数 track Command に備え、構造は track key map にしておく。

## CommandExecutor 案

`CommandExecutor` は `BuiltCommand.diff` を実 state / runtime へ反映する薄い層にする。

```ts
export type CommandExecutionContext = {
  addTimelineKeyframe(track: CommandTrackRef, frame: number): boolean;
  removeTimelineKeyframe(track: CommandTrackRef, frame: number): boolean;
  moveTimelineKeyframe(track: CommandTrackRef, fromFrame: number, toFrame: number): boolean;
  setSelectedFrame(frame: number | null): void;
  seekToBoundary(frame: number): void;
  refreshAfterKeyframeEdit(): void;
};

export function executeCommand(
  command: BuiltCommand,
  direction: CommandDirection,
  context: CommandExecutionContext,
): boolean;
```

`apply` と `revert` の対応:

| diff | apply | revert |
| --- | --- | --- |
| `keyframe.add` | add frame | remove frame |
| `keyframe.delete` | remove frame | add frame |
| `keyframe.move` | move from -> to | move to -> from |

Executor の責務:

- `MmdManager.add/remove/moveTimelineKeyframe()` を呼ぶ。
- selected frame を更新する。
- nudge / undo / redo 後に seek する。
- timeline edit state 更新を要求する。

Executor の責務外:

- Command を作る判断。
- toast 文言の生成。
- History stack の管理。
- input source の解釈。

## HistoryManager 案

```ts
export type HistoryManagerOptions = {
  maxEntries?: number;
  mergeWindowMs?: number;
};

export class HistoryManager {
  push(command: BuiltCommand): void;
  undo(): BuiltCommand | null;
  redo(): BuiltCommand | null;
  clear(reason: string): void;
  canUndo(): boolean;
  canRedo(): boolean;
}
```

`HistoryManager` は command を実行しない。stack の移動だけを担当する。実行は呼び出し側が `executeCommand(command, "revert" | "apply", context)` で行う。

理由:

- HistoryManager を pure に保ちやすい。
- executor の副作用を test で mock しやすい。
- 将来 `canUndo` / `canRedo` を Zustand へ流すときに責務が明確。

### mergeKey

初期 PoC の merge 対象は `keyframe.nudgeSelected` の連続操作だけにする。

例:

```text
keyframe.move:bone:センター
keyframe.move:morph:まばたき
keyframe.move:camera:Camera
```

merge 条件:

- 同じ `mergeKey`
- 同じ `diff.type`
- `previous.toFrame === next.fromFrame`
- `createdAtMs` が `mergeWindowMs` 以内

merge 結果:

- `fromFrame` は最初の command を維持
- `toFrame` は最新 command に更新
- `beforeFrames` は最初の command を維持
- `afterFrames` は最新 command に更新

ただし、最初の実装では merge を入れず、`mergeKey` 生成と test だけ先でもよい。

## UIController への接続案

初期接続は既存 private method を丸ごと置き換えない。次の薄い adapter を作る。

```text
UIController keyframe handler
  -> collectKeyframeCommandSnapshot()
  -> buildKeyframeCommand(action, snapshot)
  -> executeCommand(command, "apply", context)
  -> history.push(command)
  -> update canUndo / canRedo
```

実装対象:

- `keyframe.addCurrent`
- `keyframe.deleteSelected`
- `keyframe.nudgeSelected`

既存 method からすぐ外さない処理:

- `persistInterpolationForNewKeyframe()`
- pose snapshot 保存
- section dirty clear
- rotation overlay refresh
- section button refresh
- toast

PoC の第 1 段では、Command 化対象を frame list 変更だけに限定する。補間や pose snapshot の保持が絡む上書き登録は、Command の対象外として既存経路に残す。

## テスト計画

### `buildKeyframeCommand`

確認すること:

- track 未選択なら `null`
- add で存在しない frame が `afterFrames` に入る
- add で既存 frame は `null`
- delete で存在する frame が消える
- delete で存在しない frame は `null`
- nudge で `fromFrame` / `toFrame` が入る
- nudge で 0 未満に行く操作は `null`
- nudge の frame 衝突時、既存 `moveFrameNumber()` 相当の merge 結果になる
- button / shortcut の `source` が違っても diff は同じ
- `mergeKey` が安定する

### `HistoryManager`

確認すること:

- `push` 後に `canUndo` が true
- `push` 後に redo stack が clear される
- `undo` は latest command を返し、redo stack に移す
- `redo` は latest undone command を返し、undo stack に戻す
- `clear` で両 stack が空になる
- `maxEntries` を超えたら古い履歴を捨てる
- merge を入れる場合、連続 nudge が 1 entry になる

### `executeCommand`

確認すること:

- apply add が context の add を呼ぶ
- revert add が remove を呼ぶ
- apply delete が remove を呼ぶ
- revert delete が add を呼ぶ
- apply move が from -> to を呼ぶ
- revert move が to -> from を呼ぶ
- move 後に selected frame と seek が更新される

## 実装順

初回は既存 UI / runtime へ接続しない。まず `Action -> CommandDiff` を pure helper と Vitest で固める。

### Step 1: 型と pure helper

対象:

- `src/actions/command-types.ts`
   - `CommandScope`
   - `CommandTrackRef`
   - `KeyframeCommandDiff`
   - `BuiltCommand`
- `src/actions/keyframe-command-builder.ts`
   - `buildKeyframeCommand()`
   - track key helper
   - frame diff helper
- `test/actions/keyframe-command-builder.test.ts`
   - `Action -> diff`
   - `mergeKey`

ゴール:

- `keyframe.addCurrent` / `deleteSelected` / `nudgeSelected` から `BuiltCommand | null` を作れる。
- button / shortcut など `source` が違っても同じ diff になることを確認できる。
- 既存 UI / runtime の挙動はまだ変えない。

確認:

```powershell
npm.cmd run test:unit
npm.cmd run lint
```

この段階でやらないこと:

- `UIController` への接続
- `Ctrl+Z` / `Ctrl+Y`
- `addCurrent` の補間 / pose snapshot 上書きの履歴化
- interpolation drag の履歴化
- Zustand 連携
- SQLite WASM 連携

### Step 2: HistoryManager

対象:

- `src/actions/history-manager.ts`
   - stack 管理のみ
- `test/actions/history-manager.test.ts`
   - push / undo / redo / clear

ゴール:

- `push` / `undo` / `redo` / `clear` / `canUndo` / `canRedo` が Vitest で確認できる。
- `HistoryManager` は実行副作用を持たず、command stack の移動だけを担当する。

### Step 3: CommandExecutor

対象:

- `src/actions/command-executor.ts`
   - diff を既存 `MmdManager` API へ反映

ゴール:

- mock context に対して add / remove / move が正しく呼ばれる。
- `apply` / `revert` の対応が test で確認できる。
- まだ `UIController` へは接続しない。

### Step 4: UIController への最小接続

対象:

- `UIController` の `keyframe.*` handler に最小接続
   - まず `nudgeSelected` が候補
   - その後 add / delete

ゴール:

- 最初は `keyframe.nudgeSelected` だけを Command 経由にする。
- `HistoryManager.push()` まで行う。
- undo / redo UI はまだ仮 API でもよい。

`nudgeSelected` から始める理由:

- add は補間 / pose snapshot / 既存 frame 上書きが絡む。
- delete は selected frame clear と UI sync の確認が必要。
- nudge は frame list の move と selected frame / seek 更新に集中できる。

### Step 5: undo / redo Action

対象:

- `Ctrl+Z` / `Ctrl+Y` の Action を追加するか判断
   - `history.undo`
   - `history.redo`

ゴール:

- 仮 API または shortcut で undo / redo できる。
- undo / redo 後に source animation / timeline 表示 / Babylon runtime 状態が揃うか確認する。

### Step 6: 対象拡張

候補:

- `keyframe.addCurrent`
- `keyframe.deleteSelected`
- `interpolation.applyLinear`
- `interpolation.paste`
- interpolation handle drag の commit
- bone / camera gizmo drag の commit

この段階で、補間や pose snapshot の差分型を増やす。

## 先に決めないこと

- SQLite WASM への保存。
- Zustand への History 本体格納。
- interpolation drag の Command 化。
- bone / camera gizmo drag の Command 化。
- project load / model load の undo 化。
- VMD 読み込みの undo 化。

これらは Command 粒度が固まってから扱う。

## 採用判断

v0.2 の最初の Command PoC は、完全自前の `CommandBuilder + CommandExecutor + HistoryManager` で進める。

採用する方針:

- Command は Action と runtime の間に置く。
- Command 本体は diff 中心にする。
- HistoryManager は実行しない。stack 管理だけ行う。
- Executor は既存 `MmdManager` の keyframe API を使う。
- 最初の diff は frame list の追加 / 削除 / 移動に限定する。
- 補間や pose snapshot の上書きは後続で separate diff として扱う。

この形なら、既存 UI と runtime を大きく壊さず、`Action -> diff -> undo/redo` の最小テストを増やせる。
