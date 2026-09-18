# Timeline Actions

更新日: 2026-05-18

タイムライン由来のAction仕様。低レベルのDOM event wiringは `Timeline` 内に残し、`UIController` にはActionとして通知する。

## Actions

### `timeline.seekFrame`

- 意図:
  - タイムラインキャンバス上の操作で再生位置を移動する。
- 入力:
  - `source`: `timeline`
  - `payload`: `frame`, `phase`
- 出力:
  - current frame、timeline表示、runtime再生位置が更新される。
- 副作用:
  - `mmdManager.seekToBoundary(frame)` が呼ばれる。
- canExecute:
  - `frame >= 0`
- undo:
  - 対象外。高頻度入力だが編集履歴には積まない。
- テスト観点:
  - `dragStart` / `dragMove` / `dragEnd` で同じseek経路を通る。
  - 無効なframeを弾ける。

### `timeline.selectionChanged`

- 意図:
  - タイムライン上の選択変更をUI同期イベントとして通知する。
- 入力:
  - `source`: `timeline`
  - `payload`: `track`, `frame`
- 出力:
  - bone visualizer、bottom panel、edit stateが同期される。
- 副作用:
  - 選択中ボーンや編集対象表示が更新される。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。永続化や履歴化するActionではなくUI内部通知として扱う。
- テスト観点:
  - bone track選択時に関連UIが同期する。
  - frame選択時に編集対象が崩れない。

## `timeline.seekFrame.phase`

### `jump`

- 意味:
  - 単発seek。
- 現状:
  - ほぼ未使用。

### `dragStart`

- 意味:
  - timeline canvas pointer down。
- 現状:
  - drag lifecycleの開始通知。

### `dragMove`

- 意味:
  - timeline drag中。
- 現状:
  - 高頻度seek通知。

### `dragEnd`

- 意味:
  - timeline drag終了。
- 現状:
  - drag lifecycleの終了通知。

## 備考

- `timeline.selectionChanged` は `KeyframeTrack` 参照を含むため、永続化や履歴化用ActionではなくUI内部通知として扱う。
- timeline seekは高頻度入力だが、編集履歴には積まない。
- 低レベルpointer lifecycleは `Timeline` 内に残してよい。
