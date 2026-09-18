# Panel / Effect Actions

更新日: 2026-05-18

model / shader / accessory / camera / output / effect panelのAction仕様。単純なUI設定Actionが多いため、詳細なCommand化は必要になったものから個別化する。

## Panel Action Groups

### `model.*`

- 意図:
  - model info panelのtarget選択、visibility、shadow、deleteをAction経由にする。
- 入力:
  - `source`: `panel`
  - `payload`: model id、表示状態、削除対象など。
- 出力:
  - model一覧、timeline対象、scene表示が更新される。
- 副作用:
  - model visibilityやshadow caster状態が変わる。
- canExecute:
  - 対象modelが存在する。
- undo:
  - deleteは候補。visibilityやshadowは設定変更として扱うか要検討。
- テスト観点:
  - 対象なしで実行されない。
  - scene表示とpanel表示が同期する。

### `shader.*`

- 意図:
  - shader panelのtarget選択、選択材質への適用、全適用、resetをAction経由にする。
- 入力:
  - `source`: `panel`
  - `payload`: model id、material id、preset idなど。
- 出力:
  - shader / material設定が更新される。
- 副作用:
  - Babylon materialやMMD material関連状態が更新される。
- canExecute:
  - 対象modelまたはmaterialが存在する。
- undo:
  - 候補。shader変更前後のmaterial設定snapshotが必要。
- テスト観点:
  - 選択材質と全材質の適用範囲が既存仕様通り。
  - reset後に保存対象とUIが同期する。

### `accessory.*`

- 意図:
  - accessory panelのselect、parent、visibility、deleteをAction経由にする。
- 入力:
  - `source`: `panel`
  - `payload`: accessory id、parent設定、表示状態など。
- 出力:
  - accessory runtime、scene表示、panel表示が更新される。
- 副作用:
  - accessory meshや親子付け状態が更新される。
- canExecute:
  - 対象accessoryが存在する。
- undo:
  - transform / parent / deleteは候補。
- テスト観点:
  - parent変更後にscene上の位置関係が崩れない。
  - delete後に選択状態が破綻しない。

### `camera.*`

- 意図:
  - camera panelのview presetやmirroring floor設定をAction経由にする。
- 入力:
  - `source`: `panel`
  - `payload`: preset id、mirroring floor設定など。
- 出力:
  - camera状態、mirroring floor設定、panel表示が更新される。
- 副作用:
  - scene cameraやreflection関連状態が更新される。
- canExecute:
  - 常に実行可能。対象依存の設定は個別にguardする。
- undo:
  - camera view presetは候補。
- テスト観点:
  - preset適用後にcamera panel表示が同期する。
  - mirroring floor設定が保存対象と一致する。

### `output.*`

- 意図:
  - output settingsのpreset、dimensions、aspect lock、frame rangeをAction経由にする。
- 入力:
  - `source`: `panel`
  - `payload`: preset id、width、height、frame rangeなど。
- 出力:
  - output settingsが更新される。
- 副作用:
  - export時の設定に反映される。
- canExecute:
  - 値が有限で、既存のsanitize条件を満たす。
- undo:
  - 対象外。出力設定として扱う。
- テスト観点:
  - aspect lock時のwidth / height更新が既存仕様通り。
  - frame range sanitizeが効く。

### `layout.*`

- 意図:
  - fullscreenやshader panel表示など、UI layoutをAction経由にする。
- 入力:
  - `source`: `button` / `shortcut`
  - `payload`: layout target、表示状態など。
- 出力:
  - UI layout状態が更新される。
- 副作用:
  - DOM classやpanel visibilityが変わる。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。
- テスト観点:
  - buttonとshortcutで同じ状態になる。

### `runtime.*`

- 意図:
  - AA、physics、shadow、rigid bodies、GIなどruntime設定をAction経由にする。
- 入力:
  - `source`: `button` / `panel` / `shortcut`
  - `payload`: 設定名と値。
- 出力:
  - runtime feature状態とUI表示が更新される。
- 副作用:
  - Babylon scene、physics runtime、rendering設定が更新される。
- canExecute:
  - runtime初期化済み。未初期化時は既存処理に合わせて無視またはguard。
- undo:
  - 対象外。runtime表示 / 実験設定として扱う。
- テスト観点:
  - UI表示とruntime状態が同期する。
  - backend切替後に古い状態が残らない。

## Effect Actions

### `effect.*`

- 意図:
  - effect panel上の各種post effect、Frame Graph effect、light / shadow / fog / LUT設定をAction経由にする。
- 入力:
  - `source`: `panel`
  - `payload`: effect種別、対象model、設定値など。
- 出力:
  - effect state、UI表示、保存対象設定が更新される。
- 副作用:
  - Classic / Frame Graph backendのpost processやtask設定が更新される。
- canExecute:
  - 対象effectが現在のbackendで利用可能。
  - 数値payloadが有限で既存の範囲制約を満たす。
- undo:
  - 一部候補。slider系は `input` ごとではなく commit単位でまとめる。
- テスト観点:
  - Classic / Frame Graph の二重適用が起きない。
  - UI値、保存値、runtime値が一致する。
  - backend切替後に古いPostProcessが残らない。

対象領域:

- model edge
- color post effects
- bloom / tone mapping / glow
- DoF
- experimental post effects
- Frame Graph SSAO / SSR / DoF
- light / shadow
- fog
- lens / chromatic aberration
- LUT

## 方針

- effect sliderは現状Actionを直接dispatchしてruntime値を更新する。
- undo対象にする場合は、sliderの `input` 全件ではなく `pointerdown/change/commit` 単位でmergeする。
- `effect.*` は数が多いため、全Actionを個別ページ化せず、Command化が必要になったものから詳細化する。
- 保存 / 読み込みに関わる設定は project serializer 側の仕様と合わせて確認する。
