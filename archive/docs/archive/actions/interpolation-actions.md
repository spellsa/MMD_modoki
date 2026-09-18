# Interpolation Actions

更新日: 2026-05-18

補間曲線のcopy / paste / linear reset / handle dragのAction仕様。undo / redoではドラッグのmerge単位が重要になる。

## Actions

### `interpolation.copy`

- 意図:
  - 現在の編集対象チャンネルから補間曲線をclipboardへコピーする。
- 入力:
  - `source`: `button`
  - `payload`: なし
- 出力:
  - interpolation clipboardが更新される。
- 副作用:
  - なし。
- canExecute:
  - 編集可能なチャンネルがある。
- undo:
  - 対象外。編集対象ではなくclipboard更新として扱う。
- テスト観点:
  - 編集対象がない場合は実行されない。
  - コピー後にpaste可能状態になる。

### `interpolation.paste`

- 意図:
  - clipboardの補間曲線を現在の編集対象へ貼り付ける。
- 入力:
  - `source`: `button`
  - `payload`: なし
- 出力:
  - 対象チャンネルの補間曲線が更新される。
- 副作用:
  - runtime refreshとedit state refreshが発生する。
- canExecute:
  - 編集可能なチャンネルがある。
  - clipboardに有効な補間曲線がある。
- undo:
  - 対象。貼り付け前後の曲線snapshotが必要。
- テスト観点:
  - clipboardなしでは実行されない。
  - 複数チャンネル貼り付け時の対象範囲が既存仕様通り。

### `interpolation.applyLinear`

- 意図:
  - 現在の編集対象チャンネルをlinear補間へ戻す。
- 入力:
  - `source`: `button`
  - `payload`: なし
- 出力:
  - 対象チャンネルの補間曲線がlinearになる。
- 副作用:
  - runtime refreshとedit state refreshが発生する。
- canExecute:
  - 編集可能なチャンネルがある。
- undo:
  - 対象。変更前後の曲線snapshotが必要。
- テスト観点:
  - 編集対象なしでは実行されない。
  - linear値が既存仕様と一致する。

### `interpolation.updateHandle`

- 意図:
  - 補間曲線ハンドルの位置を更新する。
- 入力:
  - `source`: `panel`
  - `payload`: `channelId`, `pointIndex`, `x`, `y`
- 出力:
  - 対象チャンネルの指定ハンドル座標が更新される。
- 副作用:
  - preview用のruntime更新が発生する可能性がある。
- canExecute:
  - 編集可能なチャンネルがある。
  - `pointIndex`, `x`, `y` が有効。
- undo:
  - 対象候補。ただしmoveごとに履歴へ積まず、drag commitでまとめる。
- テスト観点:
  - 無効な座標を弾く。
  - チャンネルごとの座標制約が守られる。

### `interpolation.finishHandleDrag`

- 意図:
  - 補間曲線ハンドルdragの終了を通知する。
- 入力:
  - `source`: `panel`
  - `payload`: `changed`
- 出力:
  - runtime refreshとedit state refreshが確定する。
- 副作用:
  - 将来はCommand commit境界になる。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。ただし `changed=true` の場合はCommand commit境界として使う。
- テスト観点:
  - `changed=false` で不要な履歴を作らない。
  - `changed=true` で確定更新が走る。

## ドラッグ方針

- DOM pointer lifecycleはUI内部に残す。
- 値更新は `interpolation.updateHandle` に寄せる。
- runtime反映とedit state更新は `interpolation.finishHandleDrag` で行う。
- undo対象にする場合は、drag開始時の曲線snapshotとdrag終了時の曲線snapshotを1つのCommandにまとめる。

## Command化方針

- `paste` / `applyLinear` は単発Command化しやすい。
- `updateHandle` は毎moveを履歴に積まない。
- 履歴に積む単位は `finishHandleDrag(changed=true)` をcommit境界にするのが妥当。
