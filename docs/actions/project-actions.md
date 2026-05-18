# Project Actions

更新日: 2026-05-18

ファイル読み込み、保存、書き出しのAction仕様。

## Actions

### `project.openFile`

- 意図:
  - ファイル選択ダイアログから任意ファイルを読み込む。
- 入力:
  - `source`: `button`
  - `payload`: なし
- 出力:
  - 読み込んだファイル種別に応じてproject / runtime状態が更新される。
- 副作用:
  - ファイルIOとruntime初期化が発生する。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。読み込みは履歴ではなくproject状態の変更として扱う。
- テスト観点:
  - handlerが `loadFileFromDialog()` に到達する。

### `project.dropFiles`

- 意図:
  - viewportなどへdropされたファイル群を読み込む。
- 入力:
  - `source`: `drop`
  - `payload`: `filePaths`
- 出力:
  - ファイル種別に応じてmodel / motion / audio / backgroundなどが読み込まれる。
- 副作用:
  - 複数ファイルの順序付き読み込みが発生する。
- canExecute:
  - `filePaths` が空ではない。
- undo:
  - 対象外。
- テスト観点:
  - 空配列では実行されない。
  - drop由来の読み込みsourceが維持される。

### `project.openModel`

- 意図:
  - PMX/PMDモデルを読み込む。
- 入力:
  - `source`: `shortcut`
  - `payload`: なし
- 出力:
  - model runtime、timeline対象、関連UIが更新される。
- 副作用:
  - ファイルIOとモデル初期化が発生する。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。
- テスト観点:
  - handlerが `loadPMX()` に到達する。

### `project.openMotion`

- 意図:
  - VMD motionを読み込む。
- 入力:
  - `source`: `shortcut`
  - `payload`: なし
- 出力:
  - animation、timeline、runtime状態が更新される。
- 副作用:
  - ファイルIOとanimation適用が発生する。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。
- テスト観点:
  - handlerが `loadVMD()` に到達する。

### `project.openCameraMotion`

- 意図:
  - camera VMDを読み込む。
- 入力:
  - `source`: `shortcut`
  - `payload`: なし
- 出力:
  - camera animation、timeline、runtime状態が更新される。
- 副作用:
  - ファイルIOとcamera animation適用が発生する。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。
- テスト観点:
  - handlerが `loadCameraVMD()` に到達する。

### `project.openAudio`

- 意図:
  - 音声ファイルを読み込む。
- 入力:
  - `source`: `shortcut`
  - `payload`: なし
- 出力:
  - audio runtimeと関連UIが更新される。
- 副作用:
  - ファイルIOとaudio初期化が発生する。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。
- テスト観点:
  - handlerが `loadMP3()` に到達する。

### `project.save`

- 意図:
  - 現在のprojectを保存する。
- 入力:
  - `source`: `button` / `shortcut`
  - `payload`: `forceChoosePath?`
- 出力:
  - project fileが保存され、dirty stateが更新される。
- 副作用:
  - ファイルIOが発生する。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。
- テスト観点:
  - 通常保存と名前を付けて保存の分岐が既存仕様通り。

### `project.load`

- 意図:
  - project fileを読み込む。
- 入力:
  - `source`: `button` / `shortcut`
  - `payload`: なし
- 出力:
  - project全体、runtime、UI状態が復元される。
- 副作用:
  - ファイルIOとruntime再構築が発生する。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。
- テスト観点:
  - handlerが `loadProject()` に到達する。

### `project.exportPng`

- 意図:
  - 現在フレームをPNGとして書き出す。
- 入力:
  - `source`: `button` / `shortcut`
  - `payload`: なし
- 出力:
  - PNG fileが生成される。
- 副作用:
  - captureとファイルIOが発生する。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。
- テスト観点:
  - handlerがPNG exportへ到達する。

### `project.exportPngSequence`

- 意図:
  - 指定範囲をPNG sequenceとして書き出す。
- 入力:
  - `source`: `button`
  - `payload`: なし
- 出力:
  - 複数PNG fileが生成される。
- 副作用:
  - frame range seek、capture、ファイルIOが発生する。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。
- テスト観点:
  - frame range設定が反映される。

### `project.exportWebm`

- 意図:
  - 指定範囲をWebMとして書き出す。
- 入力:
  - `source`: `button`
  - `payload`: なし
- 出力:
  - WebM fileが生成される。
- 副作用:
  - frame range seek、capture、encoding、ファイルIOが発生する。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。
- テスト観点:
  - export設定が反映される。

## 備考

- `project.dropFiles` はdropされたファイルを拡張子priorityで並べてから読み込む。
- project load / file loadはundo履歴外として扱う。
- background export中は読み込みを拒否する既存挙動を維持する。
