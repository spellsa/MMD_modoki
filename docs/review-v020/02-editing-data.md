# v0.2.0 リリース前レビュー: キー編集とプロジェクト保存のデータ整合

- レビュー日: 2026-07-03
- 対象テーマ: Command/HistoryManager / 複数キーbatch操作 / Autoキー登録 / プロジェクト保存・読み込み
- 深刻度タグ: [Blocker] = リリース前必須 / [Later] = v0.2.x 送り可
- 注: 依頼文の `src/scene/timeline.ts` は現行ツリーでは `src/timeline.ts`(1663行)。同一物としてレビューする。

---

## 1. src/actions/command-types.ts (115行, 全読)

### 概要

Command/diff の型定義。単一キー系(`keyframe.add/delete/move/paste`)、batch系
(`keyframe.batchDelete/batchMove/batchPaste`)、transform系(`edit.boneTransform/cameraTransform`)。

### 指摘

- **[要追跡→ファイル3・4で確定] 単一 `keyframe.delete` / `keyframe.move` に payload がない(観点1・2)**
  batch系 diff は設計メモどおり payload(`before` / `overwritten`)を持つが(L49-77)、
  単一系の `keyframe.delete`(L26-32)と `keyframe.move`(L33-40)は **frame 番号リストのみ**。
  - 単一 delete の undo: frame の再追加はできても、削除されたキーの**ポーズ/補間 payload を
    復元できない**構造。executor が「現在ポーズで再登録」するなら、undo で別データになる。
  - 単一 move の衝突: docs は「toFrame に既存キーがある場合は衝突 merge」と明記しているが、
    この diff には `overwritten` がなく、**merge で消えたキーは undo でも戻せない**。
  ただし、現在の UI 導線が単一キー操作も batch 系 diff に流しているなら実害は限定される。
  builder(ファイル3)・executor(ファイル4)・UI 接続(未承認のファイル9)で確定する。

- **[Later] `keyframe.add` の redo が「その時点のポーズ」で再登録になりうる(観点2)**
  add diff も frame リストのみで payload を持たないため、undo → 別編集 → redo の順に操作すると、
  redo で追加されるキーの中身が初回実行時と異なる可能性がある(executor の実装次第。ファイル4で確認)。

### 問題なしと確認した点

- `batchMove.overwritten`(L64)、`batchDelete.before`(L53)、`batchPaste.before/after`(L74-75)は
  設計メモの必須条件(上書きキーも undo で復元)を型レベルで満たしている。
- `batchMove.deltaFrames` が `-1 | 1` に制限されており、多フレーム一括移動は型で禁止
  (衝突ルールが単純化される。設計メモと一致)。
- transform 系 diff は before/after の絶対値 snapshot 方式で、undo/redo の反復に対して安定
  (相対 delta 方式でないため累積誤差・二重適用の心配がない)。

---

## 2. src/actions/history-manager.ts (65行, 全読)

### 概要

純粋な undo/redo スタック管理。実行副作用なし(設計メモどおり)。maxEntries 既定 100。

### 指摘

- **[要追跡→ファイル9(未承認)] undo/redo の pop がコマンド実行の成否と無関係(観点2)**
  `undo()` / `redo()` は呼ばれた時点で stack を移動させる(L24-36)。呼び出し側で
  `executeCommand()` が **false(部分失敗)を返した場合に stack を戻す処理がなければ**、
  履歴と実データがずれる: 失敗した undo のコマンドが future に积まれ、次の redo で
  「revert されていない状態に再 apply」となり、キー重複や上書きが起きうる。
  executor の失敗条件(ファイル4)と、呼び出し側の失敗時ハンドリング(ui-controller、
  今回未承認)の両方を見て確定する必要がある。

- **[情報] merge は未実装(観点2の「merge境界」)**
  `mergeKey` は型にあるが HistoryManager に merge ロジックはない(`push` は常に新規 entry)。
  設計メモの「最初の実装では merge を入れなくてもよい」に沿った状態で、
  **merge 起因のキー消失リスクは現状存在しない**。連続 nudge は 1 nudge = 1 entry になり
  maxEntries=100 を消費しやすいが、データ整合の問題ではない。

### 問題なしと確認した点

- `push` で redo stack をクリア(L21)— 分岐履歴による不整合はない。
- maxEntries 超過時は最古から捨てる(L18-20)。捨てられた履歴は undo 不能になるだけで
  データは壊れない。
- `clear(reason)` で両 stack 全消去。プロジェクト読み込み時等に呼ばれていれば、
  古いプロジェクトの diff を新プロジェクトに apply する事故は防げる(呼び出し箇所は
  ui-controller 側で要確認)。

---

## 3. src/actions/keyframe-command-builder.ts (198行, 全読)

### 概要

単一キー系 Command(`addCurrent` / `deleteSelected` / `nudgeSelected`)の pure builder。
**batch 系 diff(batchDelete/batchMove/batchPaste)はここでは作られない**
(構築箇所は ui-controller 側と推定。今回の承認範囲外のため未確認)。

### 指摘

- **[Blocker 候補(発火条件は ui-controller 依存)] 単一 nudge の衝突 merge が undo 不能(観点1・2)**
  `moveFrameNumber`(L193-198)は toFrame に既存キーがある場合、fromFrame を消して
  toFrame に「merge」した frame リストを返し、コマンドは成立する(L108-109 で null にならない)。
  しかし diff は frame リストのみで `overwritten` payload を持たないため、
  **executor の revert(to→from の逆移動)では、merge で消された元 toFrame キーの
  payload が復元されない**(ファイル4で挙動確定)。
  設計メモが batch 側で必須条件にした「上書きキーも undo で戻る」が、単一系では満たされない。
  実際に事故になるかは、UI がどの操作でこの単一 move 経路を通すか次第:
  実装反映メモではキー点クリックは selectedKeys に入り batch 経路に乗るため、
  この経路が生きているのは「selectedKeys が空で selectedFrame だけがある」ケースに限られる可能性が高い。
  → ui-controller(未承認)の確認事項として持ち越し。**経路が生きていれば Blocker**。

- **[同上] 単一 delete も payload なし(観点1)**
  `buildDeleteSelectedCommand`(L62-88)の diff も frame リストのみ。
  undo での復元は executor が「frame を再追加」する方式になるはずで、
  削除されたキーのポーズ・補間は戻らない(=undo してもデータが変わる)。
  同じく発火条件を ui-controller で確定させる。
  なお selectedFrame が null の場合 currentFrame に fallback する(L69)ため、
  「何も選んでいないつもりで Delete → 現在フレームのキーが消える → undo でポーズが戻らない」
  という導線が成立しうる点は要注意。

### 問題なしと確認した点

- track key の区切りに U+001F(単位区切り制御文字)を使用(L4)— トラック名との衝突は実質不可能。
  設計メモの「trackName に区切り文字が入る可能性」への対処として妥当。
- `normalizeFrameList` は重複除去+ソート+非負整数化(L173-181)で、snapshot 側の乱れに頑健。
- add は既存 frame への追加を no-op(null)にする(L46)— 設計メモの PoC 方針どおりで、
  既存キーの上書き(ポーズ更新)は履歴化対象外として builder 段階で正しく弾いている。
- nudge の `toFrame < 0` は null(L105)— 負 frame 移動は builder 段階で拒否。

---

## 4. src/actions/command-executor.ts (278行, 全読)

### 概要

diff を CommandExecutionContext(ui-controller が実装する薄い API)へ反映する executor。
batch 系は `applyTimelineKeyframePayload`(payload 単位の書き込み/null=削除)を使い、
begin/endTimelineEditBatch で括る。単一系は add/remove/moveTimelineKeyframe を使う。

### 指摘

- **[確定(セクション3の続き)] 単一 delete/move の undo はデータを復元しない(観点1・2)**
  - `executeKeyframeDelete` の revert は `addTimelineKeyframe(track, frame)`(L255)。
    frame の存在は戻るが、中身は add API 側の実装(=通常「その時点のポーズで登録」)になる。
    **削除前の payload には戻らない。**
  - `executeKeyframeMove` の revert は to→from の逆移動のみ(L269-271)。
    apply 時に toFrame の既存キーを merge で消していた場合、そのキーは**永久に失われる**。
  残る確認は「この単一経路が現 UI のどの操作で発火するか」のみ(ui-controller、未承認)。
  発火経路が生きていれば [Blocker]、batch 経路に完全移行済みで死んでいるなら
  [Later](死んだ経路の削除または payload 化)。

- **[Later] batch 実行の途中失敗で半適用状態が残る(観点2)**
  batchMove apply は「全 fromFrame を削除 → 全 toFrame に書き込み」の2パス構成(L130-136)で、
  2パス目の途中で `applyTimelineKeyframePayload` が false を返すと **削除だけ済んだ
  中間状態のまま return false** する(rollback なし)。batchDelete / batchPaste も同様。
  失敗条件は「対象 track が存在しない」等に限られるはずで通常操作では起きにくいが、
  undo 実行時に失敗した場合はセクション2の指摘(HistoryManager は pop 済み)と重なって
  復旧不能になる。v0.2.x で「batch 失敗時に diff から状態を再構築する」か
  「失敗を検知したら履歴 clear + 警告」のどちらかに寄せることを推奨。

- **[情報] batchMove の undo 順序は正しい(観点1)**
  revert は「全 toFrame 削除(逆順)→ overwritten を toFrame へ復元 → before を fromFrame へ復元」
  (L142-152)。選択キー同士の入れ替わり(swap)でも、overwritten 復元と before 復元が
  同一 frame に重なった場合は同内容の二重書き込みになるだけで、データは正しく戻る。
  ※ ただし「選択キー同士の衝突で overwritten に何を入れるか」は diff 構築側
  (ui-controller、未承認)の正規化に依存する。ここは持ち越し。

### 問題なしと確認した点

- batchPaste の revert は `before`(null なら削除)を逆順適用(L174-178)—
  「空きフレームへの paste → undo で消える」「上書き paste → undo で元 payload」の両方が正しい。
- 単一 `keyframe.paste` は before/after payload を持ち、undo で正しく復元される(L196-210)。
  単一系で payload-safe なのは paste のみ。
- batchDelete apply は track 単位の bulk 削除 API を優先し、revert は payload 復元(L77-87)。
- batch 系は begin/endTimelineEditBatch で括られ、endTimelineEditBatch は finally で保証(L88-90 等)。
- transform 系(bone/camera)は絶対値 snapshot の適用のみで、undo/redo 反復に対して冪等。

---

## 5. src/shared/timeline-helpers.ts (110行, 全読)

### 概要

Uint32Array ベースの frame リスト操作(merge/has/add/remove/move)、track key の生成/解析、
ボーン名からの TrackCategory 分類ヒューリスティック。

### 指摘

- **[情報] `moveFrameNumber` の衝突 merge 挙動はここでも同じ(L91-96)**
  toFrame に既存 frame がある場合、fromFrame が消えて要素数が減る(merge)。
  builder 側(セクション3)と同一セマンティクスで一貫しているが、
  「単一 move の undo で merge が戻らない」問題の根はこの共通挙動にある。

### 問題なしと確認した点

- `mergeFrameNumbers` はソート済み前提のマージ+重複除去として正しい(番兵に Infinity、
  末尾は subarray で切り詰め)。
- `addFrameNumber` はソート順を維持した挿入、`removeFrameNumber` は不在時に同一参照を
  返す(変更検出に使える)。二分探索 `hasFrameNumber` もソート前提で正しい。
- `parseTrackKey` は U+001F 区切りで、名前に区切りが含まれない限り安全
  (builder 側と同じ定数値。別ファイルで重複定義されている点だけ留意)。
- `classifyBone` は表示分類用のヒューリスティックで、キー実データの同一性には関与しない。

---

## 6. src/timeline.ts (1663行, 全読)

### 概要

タイムライン描画+選択状態(単一 active、複数キー `selectedKeySet`、複数ボーン
`selectedBoneTrackSet`、anchor、矩形選択)の管理。**キー実データの変更は一切行わない**
(データ整合の観点では「選択集合が正しいキー集合を指すか」だけが問題になる)。

### 指摘

- **[Later / 要手動確認] 選択 ref に `target`(model/camera)がなく、track 入れ替え後も選択が生き残る(観点2・4)**
  設計メモの `TimelineKeySelectionRef` は `target: "model" | "camera"` を含む案だったが、
  実装(L21-25)は `trackCategory + trackName + frame` のみ。
  `setKeyframeTracks` → `reconcileSelection`(L1206-1247)は新しい tracks に
  **名前+カテゴリ+frame が一致する限り選択を維持**する。
  したがって、複数モデル間でアクティブモデルを切り替えた場合、旧モデルで選択していた
  「センター @ frame 10」等が新モデルの同名トラックの同 frame キーに**引き継がれる**可能性がある。
  その状態で Delete を押すと、意図しないモデルのキーを batch 削除する事故になりうる
  (undo は可能、選択ハイライトも見えるため Later 判定)。
  モデル切替・timeline target 切替時に ui-controller 側で `clearSelectedKeys()` を
  呼んでいるかが決め手(未承認範囲のため未確認)。呼んでいなければ v0.2.x での修正推奨。

- **[要追跡] executor の batchMove だけ選択復元がバッチ内で実行される(観点2、セクション4への補足)**
  timeline 側の `setSelectedKeys` は **現在の tracks に存在する frame だけへ正規化**する
  (L363-374, L1532-1544)。command-executor の batchMove は `setSelectedKeys` を
  `endTimelineEditBatch` **より前**(try 内 L137-140 / L153-156)に呼ぶのに対し、
  batchDelete / batchPaste はバッチ終了後に呼ぶ。
  もし tracks の更新(setKeyframeTracks)が endTimelineEditBatch まで遅延される実装なら、
  batchMove の移動先キーはまだ tracks に存在せず、**正規化で選択が全部落ちる**
  (データは壊れないが、nudge 連打時に選択が外れて以降の nudge が空振りする UX 事故)。
  実際の更新タイミングは ui-controller / timeline-edit-service(未承認)で確定する。

### 問題なしと確認した点

- 選択の正規化が徹底している: `createNormalizedSelectionSet` は現在の tracks に
  実在するキーだけを残し(L1532-1544)、`getSelectedKeys()` も tracks 走査で
  実在キーのみ返す(L1546-1555)。**存在しないキーを batch 操作に渡す経路はこのクラスにはない**。
- `setKeyframeTracks` 時の `reconcileSelection` は、トラック消失時に選択・anchor を
  クリアし、active frame もキー実在チェック付きで維持(L1236-1244)。
  undo/redo でキーが増減した直後の選択状態も、次の tracks 更新で必ず実在集合へ収束する。
- キー選択とボーン選択の相互排他(キー選択操作で `selectedBoneTrackSet.clear()`、
  ボーン選択操作でキー選択クリア)は実装反映メモの仕様どおり(L363-374, L989-1002 等)。
- 矩形選択は additive 時に base selection を Set コピーで保持し(L891)、
  ドラッグ中の再計算でも二重追加・取りこぼしがない。
- Shift 範囲選択は anchor と同一トラックのみ・実在キーのみ(L1481-1499)。設計どおり。

---

## 中間まとめ(ファイル1〜6時点)

観点1(overwritten 復元)・観点2(undo/redo 反復)のコア機構は以下の状態:

- **batch 系(batchDelete/batchMove/batchPaste)は payload 完備で、executor の
  apply/revert も対称・正順逆順も正しい。設計メモの必須条件を満たしている。**
- **単一系(keyframe.delete / keyframe.move)は frame リストのみで、undo が
  データを復元しない(delete)/衝突 merge で消えたキーが戻らない(move)。**
  この経路が現 UI から到達可能かが最大の未確定点 → ui-controller(ファイル9、未承認)。
- HistoryManager は健全だが、executor 失敗時に stack を戻す責務が呼び出し側にある点、
  batch 途中失敗の半適用が rollback されない点は要注意([Later] 2件)。
- 観点3(round-trip)・観点4(Autoキー)はファイル7以降(未承認分)で扱う。
