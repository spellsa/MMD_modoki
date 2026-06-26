# キー登録 v0.2 リリース前集中メモ 2026-06-25

## 目的

v0.2 リリース前は、汎用 3D アプリ化より MMD 編集の基本体験を優先する。
特にキー登録まわりは、現在値の登録、既存キーの編集、書き出し、物理関連キーが分散しやすいため、このメモで残タスクをリリース判断単位にまとめる。

関連:

- [キー登録再設計メモ 2026-06-16](./keyframe-registration-redesign-plan-2026-06-16.md)
- [キー登録 UI 配置メモ](./key-registration-ui-note-2026-04-18.md)
- [MMD 基本機能タスクチェックリスト](./mmd-basic-task-checklist.md)

## v0.2 前の残タスク

### P0: キー編集の土台

- [ ] 複数キー選択
  - タイムライン上の範囲選択 / 追加選択 / 選択解除の最小仕様を決める。
  - 選択状態は `track + frame + key type` を持つデータとして扱い、単一選択の拡張で済ませない。
  - delete / move / copy / paste / undo / redo の対象を複数キー選択へ広げる。
  - 詳細: [複数キー選択 設計メモ 2026-06-25](./multi-key-selection-design-2026-06-25.md)

- [ ] 反転ペースト
  - まずボーンキーを対象にする。
  - 左右ボーン名マッピング、移動量の符号反転、回転の反転規則を pure helper に分離する。
  - 通常 paste と同じ CommandDiff / undo 経路に乗せる。

### P0: MMD らしい登録対象

- [ ] 外部親登録
  - UI 上は情報表示ではなく、選択中ボーンに対する機能操作として扱う。
  - キー payload に、外部親の有効状態、親モデル参照、親ボーン名、解除状態を含める方針を決める。
  - project 保存 / 読み込み、VMD 書き出し時の扱いを同時に確認する。

- [x] 物理オンオフキー
  - 2026-06-26 実装: `物理` ボタンを即時登録ではなく入力モード切替として扱う。起動時は物理 ON、Auto キー登録は起動時 OFF。
  - 2026-06-26 実装: 通常ボーン登録時に入力モードから `physicsToggle` を決定し、ON は `×` marker、OFF は通常ダイヤとして表示する。
  - 2026-06-26 実装: `表示 > タイムラインに物理ボーンを表示`、物理ボーンの仮想 0f ON marker、明示 0f OFF 優先、0f 以外の物理 ON/OFF key の選択 / copy / delete に対応。
  - 2026-06-26 実装: 現在フレームで直近 key が物理 OFF の物理ボーンだけ、ビューポートの通常ボーン表示へ追加する。
  - 残確認: VMD 書き出し時の `PhysicsToggle` 出力と、OFF -> ON 復帰時の runtime 挙動の手動確認。

### P1: シーン系キー登録

- [ ] 照明キー登録
  - 対象候補: light color、direction、intensity 相当、ambient 相当。
  - 既存の照明 UI の現在値編集と、キー登録操作を分ける。

- [ ] 影キー登録
  - 対象候補: shadow on/off、shadow darkness、mode、quality。
  - Classic / Frame Graph / Experimental の経路差で二重適用しないことを確認する。

- [ ] 重力キー登録
  - 対象候補: gravity acceleration、direction、physics enabled との関係。
  - runtime physics 設定と keyframe 評価の責務を分ける。

- [ ] アクセサリのキー登録
  - 既存の accessory transform keyframe 経路を、プロジェクト保存 / 読み込み / timeline 表示 / 選択同期まで確認する。
  - transform だけでなく表示、親、影対象をキー化するかは v0.2 範囲を切る。

### P1: 書き出し

- [ ] VPD 書き出し（仮）
  - 現在フレームのボーン姿勢をスナップショットとして出す。
  - 最初は表情 / 外部親 / 物理状態を含めない暫定仕様でよい。

- [ ] VMD 書き出し（仮）
  - まず model bone / morph / camera の既存編集結果を出す。
  - 外部親、照明、影、重力、アクセサリ、物理オンオフキーは、対応できない場合に未対応として明示する。
  - 既存 VMD 読み込み結果を壊さない round-trip を最低限確認する。

## 実装順の提案

1. 複数キー選択のデータ構造と CommandDiff を先に固める。
2. delete / move / copy / paste を複数キー選択に対応させる。
3. 反転ペーストを通常 paste の派生として追加する。
4. 物理オンオフキーを、既存 `physicsToggles` の表示 / 編集 / 保存へつなぐ。初期編集導線は 2026-06-26 実装済み。
5. 外部親登録をボーンキー payload として扱うか、別 track として扱うか決める。
6. アクセサリ、照明、影、重力を scene/property 系 key track として整理する。
7. VPD / VMD 書き出し仮対応で、対応済みキーと未対応キーを明確にする。

## 確認観点

- `npm.cmd run test:unit`
- `npm.cmd run lint`
- 起動導線や runtime 初期化に触った場合は `npm.cmd run smoke:launch`
- 同じキー操作が button / shortcut / timeline から同じ Action / Command に入ること
- project 保存 / 読み込み後に keyframe 表示、runtime 評価、下パネルの現在値が一致すること
- VMD 読み込み済み motion の再生が壊れていないこと
- 物理 ON/OFF、外部親、アクセサリは seek 後の runtime 状態が表示と一致すること

## リリース判断

v0.2 で全部を完成させるより、次の線引きを優先する。

- 複数キー選択、copy / paste / delete / move、反転ペーストは、編集体験の核なのでなるべく v0.2 に入れる。
- 物理オンオフキーと外部親登録は MMD 互換性に関わるため、未完成でも仕様メモと未対応表示を残す。
- 照明、影、重力、アクセサリ、VPD / VMD 書き出しは、仮対応で入れる場合も「どのキー種別を書けるか」を明示する。
