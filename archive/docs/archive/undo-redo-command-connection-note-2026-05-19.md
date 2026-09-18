# Undo / Redo Command 接続メモ 2026-05-19

## 目的

`CommandBuilder` / `CommandExecutor` / `HistoryManager` の最小 PoC が入った後、`Ctrl+Z` / `Ctrl+Y` などの undo / redo 操作をどう接続するか整理する。

このメモは undo / redo 接続専用の設計メモとする。Command の型や diff 方針は次を参照する。

- [Command 設計メモ 2026-05-19](./command-design-note-2026-05-19.md)
- [Command 実装進捗メモ 2026-05-19](./command-implementation-progress-note-2026-05-19.md)
- [Undo / Redo 検討メモ](./undo-redo-investigation.md)
- [Action 仕様 Index](./actions/action-spec-index.md)

## 現状

- `Action -> CommandDiff` は `keyframe.addCurrent` / `keyframe.deleteSelected` / `keyframe.nudgeSelected` の最小範囲で実装済み。
- `HistoryManager` は stack 管理だけを行う。
- `CommandExecutor` は `BuiltCommand` を `apply` / `revert` できる。
- `UIController` では `keyframe.nudgeSelected` の成功時に `HistoryManager.push(command)` している。
- undo / redo Action と shortcut は未実装。

## 先に決めること

undo / redo では、Command 化とは別に次の判断が必要。

- `history.undo` / `history.redo` を Action 型へ追加するか。
- undo / redo 実行前に再生を止めるか。
- selected frame をどう戻すか。
- executor 失敗時に History stack をどう戻すか。

決定済み:

- shortcut は `Ctrl+Z` / `Ctrl+Y` のみ。`Ctrl+Shift+Z` は redo として扱わない。
- undo / redo 後は現 frame のままにし、CommandExecutor 側から seek しない。
- project / model / motion load 後も履歴は clear しない。アプリ起動中は履歴を保持する。
- `canUndo` / `canRedo` は UI に表示する。上パネルに undo / redo UI を追加する想定だが、実装は後回しでよい。

## 採用する対象範囲

MMD 本家の挙動調査では、undo / redo は全操作履歴ではなく、ボーン・ボーンフレーム操作寄りの限定機能として扱われている可能性が高い。
`MMD_modoki` でも、汎用 editor 的な全操作 undo より、MMD の主要編集体験に効く履歴を優先する。

優先度:

1. ボーン移動回転操作
   - 最優先。
   - slider / gizmo の連続更新をそのまま積まず、begin / change / commit で 1 操作 1 command にする。
   - 2026-05-20: `edit.boneTransform` command として最小実装済み。slider / gizmo drag の commit 時に履歴へ積む。
2. キーフレーム登録 / 削除 / 移動
   - ボーン操作の次に重要。
   - 2026-05-20 時点で `keyframe.addCurrent` / `deleteSelected` / `nudgeSelected` は最小接続済み。
3. モーフ / カメラ
   - transform や値変更の逐次 undo ではなく、まずキーフレーム単位の undo / redo に寄せる。
   - 本家で弱い領域なので、MMD_modoki では「キーフレーム編集として戻せる」程度を目標にする。

対象外:

- モデル削除
- project / model / motion / audio load
- runtime backend 切替
- 表示設定や PostFX の一時的な調整

理由:

- モデル削除や load 系を undo 対象にすると、asset lifetime、Babylon object、runtime animation handle、UI selection をまとめて戻す必要があり、Command 基盤の範囲を大きく超える。
- MMD の主操作は「ボーンを動かす」「キーを打つ」「キーを消す」なので、ここに履歴品質を集中する方が実用的。
- load 後も履歴は保持するが、対象 track / model が存在しない command は executor 失敗として扱い、履歴 stack を戻す。

## 初期 PoC の対象

最初は `keyframe.nudgeSelected` で積まれた command だけを undo / redo できればよい。

2026-05-20 時点では、対象を `keyframe.addCurrent` / `keyframe.deleteSelected` にも広げた。

対象:

- `keyframe.add` command
- `keyframe.delete` command
- `keyframe.move` command
- `HistoryManager.undo()`
- `HistoryManager.redo()`
- `executeCommand(command, "revert" | "apply", context)`

現時点では対象外:

- 補間差分
- pose snapshot 差分
- 既存 frame 上書き
- project load / model load の undo 化
- UI 上の undo / redo ボタン
- command merge

## Action 型案

`src/actions/types.ts` に `HistoryAction` を追加する。

```ts
export type HistoryAction =
    | { type: "history.undo"; source: ActionSource }
    | { type: "history.redo"; source: ActionSource };

export type EditorAction =
    | PlaybackAction
    | KeyframeAction
    | ...
    | HistoryAction;
```

`canExecuteEditorAction()` には次を追加する。

```ts
export type EditorActionAvailabilitySnapshot = {
    ...
    canUndo?: boolean;
    canRedo?: boolean;
};
```

```ts
case "history.undo":
    return snapshot.canUndo ?? true;
case "history.redo":
    return snapshot.canRedo ?? true;
```

初期は button enabled へ接続しないため、`canExecute` は test だけでもよい。

## shortcut 方針

採用方針:

- Undo: `Ctrl+Z`
- Redo: `Ctrl+Y`

理由:

- Windows ユーザー向けには `Ctrl+Y` が自然。
- shortcut の入口を増やすと、テキスト入力中の guard や既存 shortcut との衝突確認が増える。
- 初期 PoC では Command 経路の検証を優先する。

衝突注意:

- 既存 shortcut の `Ctrl+Z` / `Ctrl+Y` 使用有無を確認してから追加する。
- テキスト入力中は既存 keyboard guard に従い、入力欄の undo を奪わない。

## 実行順案

undo / redo では、`HistoryManager` が command を stack から動かし、`CommandExecutor` が実 state へ反映する。

単純案:

```text
history.undo()
  -> command を past から future へ移す
  -> executeCommand(command, "revert")
```

問題:

- `executeCommand()` が失敗した場合、履歴上は undo 済みなのに実 state は戻っていない。

そのため、初期実装では `HistoryManager` に peek / commit 型 API を入れるより、`undo()` / `redo()` の失敗時に逆操作で stack を戻す helper を `UIController` 側に置く。

Undo helper:

```ts
private undoLastCommand(): void {
    const command = this.commandHistory.undo();
    if (!command) {
        this.showToast("Nothing to undo", "info");
        return;
    }

    const reverted = executeCommand(command, "revert", this.createCommandExecutionContext());
    if (!reverted) {
        this.commandHistory.redo();
        this.showToast("Undo failed", "error");
        return;
    }

    this.showToast(`Undo: ${command.label}`, "success");
}
```

Redo helper:

```ts
private redoLastCommand(): void {
    const command = this.commandHistory.redo();
    if (!command) {
        this.showToast("Nothing to redo", "info");
        return;
    }

    const applied = executeCommand(command, "apply", this.createCommandExecutionContext());
    if (!applied) {
        this.commandHistory.undo();
        this.showToast("Redo failed", "error");
        return;
    }

    this.showToast(`Redo: ${command.label}`, "success");
}
```

この方式の利点:

- `HistoryManager` の責務を stack 管理に保てる。
- 失敗時の履歴ずれを最小限に戻せる。
- PoC として小さい。

制約:

- `redo()` 失敗時の `undo()` rollback は「直前に redo した command」を戻す前提。
- 将来 async command や複数 command transaction を扱うなら、peek / commit API へ見直す。

## 失敗時の stack 整合性

初期 PoC では次のルールにする。

| 操作 | Executor 成功 | Executor 失敗 |
| --- | --- | --- |
| undo | command は redo stack に残す | `redo()` を呼んで undo stack へ戻す |
| redo | command は undo stack に残す | `undo()` を呼んで redo stack へ戻す |

注意:

- rollback の `redo()` / `undo()` では executor を呼ばない。
- stack だけを戻す。
- 失敗時は toast / log でわかるようにする。

## 再生中の扱い

初期 PoC では、undo / redo 前に再生中なら pause する。

理由:

- 再生中に keyframe frame list を戻すと、runtime seek / timeline selection / physics の同期確認が難しい。
- 現在の目的は undo/redo の粒度検証であり、再生中編集の UX ではない。

案:

```ts
private pauseBeforeHistoryMutation(): void {
    if (!this.mmdManager.isPlaying) return;
    this.pause();
}
```

ただし `pause()` が UI toast や状態更新を多く持つ場合、最初は `this.mmdManager.pauseAnimation()` 相当の既存 API を確認してから使う。

## seek / selected frame 方針

`CommandExecutor` は現在、成功時に次を行う。

- `setSelectedFrame(...)`
- `seekToBoundary(...)`
- `refreshAfterKeyframeEdit()`

採用方針:

- undo / redo 後は現 frame のままにし、seek しない。
- selected frame は、undo / redo 対象になった keyframe を指すように戻してよい。
- timeline 表示更新と runtime 側の keyframe 反映は行う。

理由:

- undo / redo のたびに再生位置が飛ぶと、編集位置の文脈を失いやすい。
- keyframe nudge の取り消しでは、現在見ている frame と編集対象 frame が一致しないケースがありうる。
- 「履歴の反映」と「現在 frame の移動」は分けておいた方が、後で UI からの明示 seek と整理しやすい。

実装上は `CommandExecutor` に seek 抑制オプションを足すか、undo / redo 用 context では `seekToBoundary` を no-op にする。

`keyframe.move`:

- apply: `toFrame` を選択し、seek はしない
- revert: `fromFrame` を選択し、seek はしない

`keyframe.add`:

- apply: 追加 frame を選択し、seek はしない
- revert: selected frame を clear し、seek はしない

`keyframe.delete`:

- apply: selected frame を clear し、seek はしない
- revert: 復元 frame を選択し、seek はしない

## History clear 方針

採用方針:

- project / model / motion load 後も履歴を clear しない。
- アプリ起動中は履歴を保持する。
- clear は明示的な「履歴クリア」操作や、将来の危険な非互換 command が必要になった場合に再検討する。

理由:

- 履歴を安易に消すと、ユーザーから見た undo の一貫性が弱くなる。
- Command diff が対象 track / frame を持つため、実行不能な場合は executor 失敗として扱える。
- load 系のたびに clear するより、失敗時 rollback と no-op handling を強くした方が Command 基盤の検証になる。

注意:

- load 後に対象 track が存在しない command を undo / redo した場合は executor が失敗し、履歴 stack を戻す。
- 将来、project load 自体を command 化する場合は別設計に分ける。

## canUndo / canRedo

採用方針:

- `canUndo` / `canRedo` は UI に表示する。
- 表示位置は上パネルを想定する。
- ただし初期実装では shortcut 接続を優先し、ボタン UI の実装は後回しでよい。

ただし `HistoryManager.canUndo()` / `canRedo()` は次の用途に使えるようにする。

- `canExecuteEditorAction({ type: "history.undo" })`
- `canExecuteEditorAction({ type: "history.redo" })`
- 上パネルの toolbar button enabled
- Zustand / UI state への反映

初期は `UIController` 内で action handler が直接 `HistoryManager` を見てもよい。

## 実装順

### Step 1: Action 型追加

状態: 完了

対象:

- `src/actions/types.ts`
- `src/actions/action-availability.ts`
- `test/actions/action-availability.test.ts`

完了条件:

- `history.undo`
- `history.redo`
- `canUndo` / `canRedo`

### Step 2: UIController helper

状態: 完了

対象:

- `UIController.undoLastCommand()`
- `UIController.redoLastCommand()`
- `UIController.pauseBeforeHistoryMutation()` は必要に応じて追加

完了条件:

- executor 成功時に toast が出る。
- executor 失敗時に stack rollback する。
- command がない場合は no-op または info toast。

### Step 3: shortcut 接続

状態: 完了

対象:

- `Ctrl+Z -> history.undo`
- `Ctrl+Y -> history.redo`

完了条件:

- テキスト入力中は既存 guard で奪わない。
- `keyframe.nudgeSelected` の command を undo / redo できる。

### Step 4: 確認

状態: 完了

確認コマンド:

```powershell
npm.cmd run test:unit
npm.cmd run lint
npm.cmd run smoke:launch
```

確認結果:

- 2026-05-19: `npm.cmd run test:unit`
  - 15 files / 92 tests passed
- 2026-05-19: `npm.cmd run lint`
  - 0 errors / 467 warnings
  - warnings は既存の `any` / non-null assertion など
- 2026-05-19: `npm.cmd run smoke:launch`
  - pass
  - `engine=WebGPU`
  - `physics=Bullet MPR`
  - `crossOriginIsolated=true`

手動確認:

1. model / motion なしの起動で shortcut が破綻しない。
2. keyframe を選択して nudge する。
3. `Ctrl+Z` で元 frame に戻る。
4. `Ctrl+Y` で移動後 frame に戻る。
5. undo / redo 後に current frame は維持される。
6. undo / redo できない時にエラーで落ちない。

## 後続検討

- `HistoryManager` に `peekUndo()` / `commitUndo()` / `cancelUndo()` を追加するか。
- command merge を入れるか。
- `keyframe.addCurrent` / `deleteSelected` を undo / redo 対象に広げるか。
- 上パネルに undo / redo button を出す。
- `canUndo` / `canRedo` を Zustand store へ流すか。
- load 後に対象が存在しない command の失敗表示をどう見せるか。

## 採用判断

初期 undo / redo 接続は、`HistoryManager` を stack 管理に限定したまま `UIController` 側で executor と rollback を扱う。

理由:

- 既存設計を大きく変えずに `keyframe.nudgeSelected` の undo / redo を確認できる。
- 失敗時の stack ずれを小さい helper で戻せる。
- 将来必要になったら HistoryManager を transaction 型 API に拡張できる。
