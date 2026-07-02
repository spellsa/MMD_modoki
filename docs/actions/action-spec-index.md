# Action 仕様 Index

更新日: 2026-05-18

このディレクトリは、Action / Command / undo-redo 設計で参照する安定仕様を置く場所。
調査経緯や作業ログは既存の `docs/action-*.md` に残し、ここでは「現在のActionをどう扱うか」を短く整理する。

## 関連メモ

- [Action / Command / 入力管理 調査メモ](../action-command-input-management-note-2026-05-17.md)
- [Action Catalog Draft](../action-catalog-draft-2026-05-17.md)
- [Action Dispatcher 進捗メモ](../action-dispatcher-progress-note-2026-05-18.md)
- [Command 設計メモ](../command-design-note-2026-05-19.md)
- [Command 実装進捗メモ](../command-implementation-progress-note-2026-05-19.md)
- [Undo / Redo Command 接続メモ](../undo-redo-command-connection-note-2026-05-19.md)

## 共通方針

- `Action` は入力手段を正規化する単位。
- `source` は `button` / `shortcut` / `timeline` / `viewport` / `panel` / `drop` / `gamepad` / `midi` / `system` を想定する。
- 現段階では、多くのActionは既存処理への薄い橋渡しとして扱う。
- undo / redo 対象にするActionは、後続で `Command` と `diff` に変換する。
- 高頻度入力は `begin` / `change` / `commit` の単位を決めてからCommand化する。
- Action詳細は表にせず、エディタ上でそのまま読める見出しと箇条書きで書く。

## Action 詳細の記述テンプレート

### `domain.actionName`

- 意図:
  - このActionがユーザー操作として何を表すかを書く。
- 入力:
  - `source`: 想定する入力元を書く。
  - `payload`: 必要な値を書く。値がない場合は `なし` と書く。
- 出力:
  - 更新されるアプリ状態、UI状態、runtime状態を書く。
- 副作用:
  - Babylon scene、ファイルIO、保存、読み込み、描画更新などを書く。
- canExecute:
  - 実行可能条件を書く。
- undo:
  - `対象外` / `候補` / `対象` のいずれかをまず書く。
  - 対象にする場合は、Command化に必要な before / after snapshot を書く。
- テスト観点:
  - Action handler単位で確認したい条件を書く。

## Domain別仕様

### playback

- 仕様: [playback-actions.md](./playback-actions.md)
- 現状: Action化済み
- undo候補: 基本なし

### timeline

- 仕様: [timeline-actions.md](./timeline-actions.md)
- 現状: Action化済み
- undo候補: 基本なし。一部の選択履歴は将来検討。

### keyframe

- 仕様: [keyframe-actions.md](./keyframe-actions.md)
- 現状: Action化済み
- undo候補: 強い。Command / diff化の最初の候補。

### interpolation

- 仕様: [interpolation-actions.md](./interpolation-actions.md)
- 現状: Action化済み
- undo候補: 強い。ドラッグ操作のmerge単位が重要。

### edit / viewport

- 仕様: [viewport-actions.md](./viewport-actions.md)
- 現状: 表示、pick、編集通知はAction化済み。camera / gizmo dragは設計待ち。
- undo候補: 強い。連続編集の単位設計が必要。

### project

- 仕様: [project-actions.md](./project-actions.md)
- 現状: Action化済み
- undo候補: 保存、読み込み、exportは履歴外。

### UI panels / effects

- 仕様: [panel-effect-actions.md](./panel-effect-actions.md)
- 現状: 大半はAction化済み
- undo候補: 一部のみ。削除、shader適用、effect slider commitなど。

## 優先度

次に設計を詰める優先度:

1. `keyframe.*` の `CommandDiff`
2. `interpolation.*` のドラッグmerge単位
3. `edit.*` / viewport camera / bone gizmo の `begin/change/commit`
4. `HistoryManager`
5. shortcut customization / gamepad / MIDI 向け `InputBinding`

## 未解決

- `canExecuteEditorAction()` は実装済みだが、button enabled / shortcut guard への全面接続はまだ。
- `Action -> Command` は未実装。
- `HistoryManager` は未実装。
- viewport camera drag / bone gizmo drag は、Action通知より先に連続編集の単位設計が必要。
