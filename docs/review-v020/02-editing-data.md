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

---

## 7. src/editor/timeline-edit-service.ts (1709行, 全読)

### 概要

キー実データ層。2層構造になっている:
- **表示用 frame map**(`modelKeyframeTracksByModel: Map<trackKey, Uint32Array>` /
  `cameraKeyframeFrames`): タイムラインに出す frame リスト。
- **source animation**(`MmdAnimation`): 実際のポーズ・補間・物理toggle等の payload。
batch 系 API(`applyTimelineKeyframePayload` / `removeTimelineKeyframePayloads`)は
**両方を更新**し、`syncModelFrameMapFromTrack` で frame map を追従させる。
`beginTimelineEditBatch` / `endTimelineEditBatch` は emit(onKeyframesLoaded)の遅延のみ。

### 指摘

- **[Blocker 候補・重大(発火経路は ui-controller で確定)] 単一系 add/remove/move は
  frame map しか変更せず、実データと表示が乖離する(観点1・2・3)**
  `addTimelineKeyframe`(L669-690)/ `removeTimelineKeyframe`(L883-903)/
  `moveTimelineKeyframe`(L905-931)は **表示用 frame map(または cameraKeyframeFrames)
  だけを書き換え、source animation の payload には一切触らない**。
  つまり単一 Command 経路(keyframe.add/delete/move)が発火した場合:
  - 単一 delete: タイムラインからキー表示は消えるが、**モーションは変わらない**
    (source animation にキーが残るため再生結果は同じ)。
  - 単一 move: 表示上キーが動くが、実データは元 frame のまま。
  - さらに保存→再読み込みで frame map は source animation から再構築される
    (project-importer L367-370 で `buildModelTrackFrameMapFromAnimation`)ため、
    **「削除したはずのキーが復活する」「移動したはずのキーが元に戻る」**(観点3の実害)。
  前セクションまでの「undo で payload が戻らない」問題より深刻で、
  そもそも apply 自体がデータを編集していない。
  発火経路(この API を呼ぶ UI 操作が残っているか)を ui-controller で最終確定する。

- **[Later] 異種 payload の適用でトラックが二重化しうる(観点1)**
  `applyBoneKeyframePayload`(L1190-1219)は対象ボーンが movable 優先
  (`shouldUseMovableBoneTrack`)かを確認せず boneTrack を作成して書き込む。
  movable ボーンに kind:"bone" payload を paste すると、同名の movableBoneTrack と
  boneTrack が並存し、undo(before は movableBone として読まれる)では
  boneTrack 側の書き込みが残る。通常の copy/paste・mirror paste では同種 kind に
  閉じるため発火しにくいが、クロス kind の貼り付け経路ができた時に事故る。
  逆方向(`applyMovableBoneKeyframePayload` L1164-1171)は bone への降格変換があり、
  positions が黙って捨てられる(非 movable ボーンへの paste では正しい挙動)。

- **[Later] `mergePropertyTrack` で IK 状態が 0(OFF)に落ちる境界がある(観点3周辺)**
  overlay にのみ存在する frame で、IK ボーン名が base 側にしかない場合、
  `getIkState` の初期値 0 のまま残る(L1510-1522)= その frame で IK が意図せず OFF になる。
  VMD 追加読み込み(merge)で IK 切替キーを持つモーション同士を重ねた場合に
  発生しうる。頻度は低いが、モーション merge の品質問題として記録。

- **[情報] batchMove 中の選択消失(セクション6の要追跡)はサービス層で確定**
  `emitMergedKeyframeTracks` は batch 中は pendingEmit に積むだけ(L618-622)なので、
  batch 内で timeline の tracks は更新されない。command-executor の batchMove は
  batch 内で `setSelectedKeys`(移動先 frame)を呼ぶため、timeline 側の正規化が
  「まだ存在しない frame」として選択を落とす可能性が高い。
  ui-controller が emit 後に選択を再設定していれば回避される — 次ファイルで確定。

### 問題なしと確認した点

- batch 系削除 `removeTimelineKeyframePayloads` は「要求 frame が1つでも見つからなければ
  そのトラックは何も変更せず false」(L357-377)— トラック内はアトミック。
  値配列の除去も index ベースで frame リストと同期しており、ズレはない。
- payload の upsert(`upsertFrameNumberForPayload` + `upsertFloatValuesForPayload` /
  `upsertUint8Values`)は挿入位置・既存上書きの両対応で正しく、frame リストと
  値配列の整合が保たれる(L1304-1360)。
- `readTimelineKeyframePayload` は Number.isFinite ガード付きで NaN を 0 に正規化して
  読み出す(diff に NaN が入り込まない)。
- `refreshAnimationFrameRange` が編集のたびに startFrame/endFrame を再計算し、
  runtime の再生範囲と実データがずれない(L158-176)。
- `createOffsetModelAnimation` / `mergeModelAnimations` / `merge*Track` は
  「overlay 優先、frame 単位コピー」で index マップを使っており、キー消失・重複はない
  (上記 IK 境界を除く)。
- `buildModelTrackFrameMapFromAnimation` は bone/movable/morph の全トラックを
  classifyBone で分類して frame map を作る。importer からの復元経路と、
  getActiveModelTimelineTracks の表示経路でキーの出所が一致する。

---

## 8. src/editor/mirror-paste-service.ts (130行, 全読)

### 概要

反転ペーストの pure helper。左右名の解決(左/右、Ｌ/Ｒ、L/R、Left/Right)、
payload の反転(position X 反転、quaternion Y/Z 反転)、batchPaste 用 items の構築。

### 指摘

- **[情報] 対応ボーンが無い場合は同一トラックへ貼るため、同一 target への重複 item が生じうる**
  例: クリップボードに 左腕+右腕 があり、モデルに 右腕 が存在しない場合、
  「左腕→左腕(自分)」「右腕→左腕」の2 item が同じ track+frame を書く。
  executor は順次適用(後勝ち)で、undo は両 item の before が同一の適用前値になるため
  **データは正しく戻る**(結果の曖昧さは順序で決定的)。事故にはならないが挙動として記録。
- **[情報] 非 movable な反転先への movableBone payload はサービス層の降格変換で
  positions が落ちる**(セクション7の指摘と同じ経路。反転ペーストとしては妥当な挙動)。

### 問題なしと確認した点

- 反転計算: position は X 成分のみ符号反転、quaternion は Y/Z 成分反転 —
  X 軸ミラーとして正しい。interpolation / physicsToggle はコピー元維持(実装反映メモどおり)。
- morph / camera payload は null を返して除外(L75-77)— 設計どおり bone 限定。
- `targetFrame < 0` の item は除外(L115)。NaN は normalizeFiniteNumber で 0 に落ちる。
- 名前解決は候補列挙+実在チェック方式で、見つからなければ同名に貼る(メモどおり)。

---

## 9. src/ui-controller.ts (9515行, 部分読)

読んだ範囲: Command/History 接続(L5745-5898, L6032-6104, L7975-8435, L8894-9430)、
Autoキー(L5778-5802)、選択クリア箇所(L1455-1470, L1819-1823, L6416-6418)、
`commandHistory` の全使用箇所(grep で全件確認)、mmd-manager の keyframe API 委譲部
(mmd-manager.ts L3439-3493 — 事前承認済みの最小部分読。全て timeline-edit-service へ素通し)。

### 指摘

- **[Blocker] 単一キー選択時の Delete / nudge が「表示のみ」経路に落ちる(観点1・2・3、確定)**
  `deleteSelectedKeyframe`(L9205)と `nudgeSelectedKeyframe`(L9314)は
  **`selectedKeys.length > 1` のときだけ** batch 経路(payload 完備)を使い、
  **ちょうど1キー選択(=キーをクリックして Delete/Alt+Arrow する最も普通の操作)では
  単一 Command 経路**に落ちる。単一経路はセクション7で確定したとおり
  frame map(表示)しか変更しない。結果:
  - 単一キー削除: タイムラインから消えるが**モーションは変わらない**。
    runtime 更新(`refreshRuntimeAnimationForTrack`)も呼ばれない(payload 経路のみが呼ぶ、L6082-6088)。
    保存→再読み込みで**キーが復活**する(frame map は source animation から再構築)。
  - 単一キー nudge: 表示上だけ移動し、実データは元のまま。衝突時は表示上 merge され
    undo でも戻らない。
  - `keyframe.addCurrent` フォールバック(L7995、morph 等)も frame map 追加+
    `persistInterpolationForNewKeyframe` の payload 書き込みが Command 外で行われ、
    undo は表示だけ消して payload が残る。
  **修正方向: 単一選択でも batch 系 diff(payload 付き)へ一本化する
  (`selectedKeys.length >= 1` で batch へ、または単一系 diff を payload 化)。**
  セクション3・4・7の「Blocker 候補」はこれで確定 Blocker。

- **[Blocker] `commandHistory.clear()` がどこからも呼ばれない(観点2・3)**
  grep で全 `commandHistory` 使用箇所を確認したが、`clear()` の呼び出しは **0 件**。
  プロジェクト読み込み・新規作成・モデル差し替えを跨いで undo スタックが生き残る。
  MMD モデルはボーン名が標準化されているため track ref(カテゴリ+名前)が新プロジェクトでも
  一致しやすく、**プロジェクト A の編集を undo するつもりで Ctrl+Z を押すと、
  プロジェクト B の同名トラックへ A の payload が書き込まれる/キーが消える**。
  修正は project import / clearProjectForImport 相当のタイミングで `clear("project-load")` を
  呼ぶ1行。リリース前必須。

- **[Blocker] Autoキー・単一ボーン/モーフのキー登録が履歴化されず、既存キー上書きが不可逆(観点4)**
  - 単一ボーン登録: `tryRegisterEditorBoneKeyframe` → `mmdManager.registerEditorBoneKeyframe`
    直呼び(L8301)。**Command を作らず history にも積まない**(result.created=false は
    「既存キー上書き」を意味するが、上書き前 payload はどこにも保存されない)。
  - モーフ登録: `registerMorphKeyframesAtCurrentFrame` / `registerSingleMorphKeyframeAtCurrentFrame`
    が `applyTimelineKeyframePayload` を直呼び(L8338, L8364)。同じく履歴外。
  - Autoキーはこの2経路を使う(`registerAutoKeyForEditedBone` L5778 → 単一ボーン登録、
    `registerAutoKeyForEditedMorph` L5783 → 単一モーフ登録)。
  つまり **Autoキー ON でギズモ/数値編集すると、transform は undo できるのに
  キー登録は undo できない**。既存キーの上にAutoキーが乗った場合、元のキー payload は
  永久喪失(観点4の競合事故そのもの)。
  一方で複数ボーン登録(L8124、batchPaste)とカメラ登録(L8185、paste)は履歴化済みで、
  同じ「登録」操作の中で undo できる/できないが混在している。
  修正方向: 単一ボーン/モーフ登録も before を読んで `keyframe.paste` diff にする
  (カメラ登録 L8185-8218 と同型にするだけ)。

- **[Later] batch nudge 後に選択が失われる可能性(観点2、セクション6・7の続き・機構は2つ)**
  1. executor の batchMove は選択復元(`setSelectedKeys`)をバッチ内で呼ぶため、
     timeline の stale tracks に対する正規化で移動先キーが落ちる(セクション7で確認)。
  2. さらに ui-controller は **frame 変更のたびに `clearSelectedKeys` を呼ぶ**
     (onFrameUpdate 内 L1464-1468)。batchMove は最後に `seekToBoundary(移動先)` を
     呼ぶため、選択を復元してもその直後の seek で消される可能性が高い。
  → 「複数キー選択 → Alt+Arrow 連打でまとめて移動し続ける」という設計メモの UX が
  実際に機能しているか**手動確認を推奨**。壊れていれば、batchMove の選択復元を
  バッチ終了後(batchDelete/batchPaste と同じ位置)へ移し、frame 変更クリアの例外を設ける。

- **[Later] 情報(表示/IK)キー・アクセサリキーも履歴外(L8040, L8389)**
  スコープ境界だが、`registerInfoKeyframe` / `registerAccessoryTransformKeyframe` も
  直接書き込みで undo 不可。v0.2.x で Command 化対象に含めることを推奨。

### 問題なしと確認した点

- **undo/redo 失敗時に stack を戻す処理がある**(L9284-9288 / L9305-9309):
  revert 失敗→`redo()` で戻す、apply 失敗→`undo()` で戻す。セクション2の懸念
  (成否と無関係な pop)は呼び出し側で手当されていた。
  ※ executor の「途中失敗で半適用」だけは残る(セクション4の Later)。
- batch nudge の diff 構築は設計メモの衝突ルールに忠実:
  選択内衝突は `overwritten: null`(swap 許可、L9374-9376)、`toFrame < 0` は全体失敗
  (L9386-9389)、同一 target 重複は全体失敗(L9391-9394)、適用順は delta 方向でソート(L9396-9400)。
- copy は payload を clone して clipboard に保持(以後の編集に影響されない)。
  単一 paste / batch paste / mirror paste はすべて適用直前に `before` を読み、
  batchPaste diff として履歴化 — undo で上書き前に正しく戻る(L8978-8996, L9016-9049, L9077-9101)。
- batch paste は clipboard の `sourceTarget`(model/camera)と現在 target の一致を確認(L9011)。
- 複数ボーン一括登録(L8124-8183)は before 読み+batchPaste で履歴化されており、
  こちらは観点4を満たす実装になっている。

---

## 10. src/actions/bone-transform-command-builder.ts (69行) / camera-transform-command-builder.ts (80行, 全読)

### 概要

gizmo / 数値入力による transform 編集の Command builder。before/after の絶対値 snapshot、
epsilon(1e-4)での no-op 検出、clone 保存。

### 指摘

- **[Later] bone 側だけ有限値チェックがない**
  camera builder は `isSnapshotFinite` で NaN/Infinity を弾く(L18)が、bone builder には
  相当するチェックがない。NaN が入った snapshot がそのまま diff になり、undo/redo で
  NaN ポーズを書き戻す余地がある。camera と同じガードを足すのが安全。

- **[情報] diff の `frame` は記録のみで、undo 時に seek しない**
  transform の undo はスナップショットを「現在の」ポーズへ適用する(executor L228-246)。
  do と undo の間にフレームを移動していた場合、別フレームの表示ポーズに適用されるが、
  キー登録を伴わない一時ポーズであり保存データは壊れない(Autoキー併用時の問題は
  セクション9の Blocker 3 に含まれる)。

### 問題なしと確認した点

- before/after 不在・同値(epsilon 内)は null で Command 不成立 — 空 undo エントリが積まれない。
- snapshot は clone して保持しており、参照共有による履歴汚染はない。

---

## 11. src/project/project-serializer.ts (445行, 全読)

### 概要

プロジェクト保存(v1 フォーマット)。キー実体は
`keyframes.modelAnimations[] = serializeModelAnimation(source animation)`(モデルごと)と
`keyframes.cameraAnimation = serializeCameraTrack(cameraSourceAnimation.cameraTrack)`。
その他 scene / assets / camera / lighting / viewport / physics / effects(frameGraphPostStack 含む)/
accessories(transform + キーフレーム)を書き出す。

### 指摘

- **[確定情報(Blocker 1 の裏付け)] 保存されるのは source animation のみ(観点3)**
  表示用 frame map は保存対象外(L230-236)。セクション7・9で確定した
  「frame map しか変更しない単一系編集」は**保存に一切反映されず**、
  再読み込みで削除前・移動前の状態に戻る。round-trip 不整合の根拠がここで閉じた。

- **[情報] serialize の実体(project-codec.ts)は今回の承認範囲外で未読**
  補間・physicsToggle・propertyTrack(表示/IK キー)がコーデックで漏れなく
  serialize/deserialize されるかは未検証。round-trip の完全性を確定するには
  project-codec.ts(+ 既存の project-serializer.test.ts / project-importer.test.ts の
  カバレッジ確認)を追加レビューするのが望ましい。

### 問題なしと確認した点

- モデルは path / visible / castsShadow / motionImports(clone)/ materialShaders を
  インスタンスごとに保存。同一 PMX を複数体ロードしていても**保存側は**各インスタンス分の
  アニメーションを配列で保持する(復元側の問題はセクション12参照)。
- アクセサリは transform・親(モデル path + ボーン名)・キーフレームトラックを保存。
  親参照が index でなく path 基準なのは復元耐性が高い。
- カメラは埋め込みアニメーション+静的ポーズ(position/target/rotation/fov/distance)の
  両方を保存し、復元側のフォールバックチェーンと対応している。

---

## 12. src/project/project-importer.ts (1018行, 全読 — 前回レビューの部分読を含む)

### 概要

プロジェクト読み込み。`clearProjectForImport` → モデルを順次 loadPMX →
埋め込みアニメーション(`keyframes.modelAnimations`)を path で引いて復元
(`createRuntimeAnimation` + frame map 再構築 + `emitMergedKeyframeTracks`)、
なければ motionImports(VMD/VPD)を再生順に再適用。カメラは
埋め込み → cameraVmdPath → 静的ポーズのフォールバックチェーン。
最後に effects / frameGraphPostStack / currentFrame / playbackSpeed / timelineTarget を復元。

### 指摘

- **[Later / 要手動確認] 同一 path のモデルを複数体ロードした場合、全インスタンスに
  最後のアニメーションが適用される(観点3)**
  埋め込みアニメーションは `embeddedModelAnimationsByPath`(**path キーの Map**、L314-324)に
  積まれるため、同じ PMX を2体ロードしたプロジェクトでは後勝ちで1つに潰れ、
  復元時に両方のインスタンスへ**同じアニメーション**が入る(L357-359)。
  保存側は2体分を別々に持っている(セクション11)ので、**読み込みで片方のモーションが
  静かに失われる**。同一モデル複数体の運用を v0.2.0 で許容しているなら修正必須級、
  そうでなければ Later。対応するなら「path + 出現順」でマッチさせる。

- **[情報] importer 自体は undo 履歴に関与しない(Blocker 2 の再確認)**
  `clearProjectForImport()` は host(mmd-manager)側の scene クリアであり、
  ui-controller の `commandHistory` はここでは触れない。履歴クリアの欠落
  (セクション9 Blocker 2)は importer 側では救えない。

- **[情報] VPD フォールバック復元は「記録フレームへ seek してポーズ適用」方式(L390-397)**
  埋め込みアニメーションがない旧プロジェクトのみの経路。seek の副作用を含むが、
  順次 await で適用順は保たれており、埋め込みがある通常経路には影響しない。

### 問題なしと確認した点

- 埋め込みアニメーション復元後に `buildModelTrackFrameMapFromAnimation` で frame map を
  再構築し、`emitMergedKeyframeTracks` で表示へ同期(L363-371)— source animation を
  正とする一貫した復元。
- モデル読み込み失敗時は warning + continue で、後続モデル・アクセサリの復元は
  path 基準の解決(activeModelPath / accessory parentModelPath)なので巻き添えにならない。
- カメラ埋め込みが空トラックの場合は warning を出して VMD path → 静的ポーズへ
  フォールバック(L402-468)— キー消失を黙って握り潰さない。
- 数値フィールドは全域で `Number.isFinite` ガード+既定値付き読み出し(壊れた
  プロジェクトファイルで NaN が state に入らない)。
- 復元順序は「モデル/キー → カメラ → 音声 → アクセサリ → 環境 → effects → 
  currentFrame/playbackSpeed/timelineTarget → 最終 render state」で、
  `refreshTotalFramesFromContent` と seek が最後に走るため、totalFrames と
  currentFrame の整合が取れる(L1010-1015)。

---

## 総括(v0.2.0 リリース判断向け・全12ファイル)

### [Blocker] 一覧(リリース前必須)

1. **単一キー選択の Delete / nudge / add が「表示のみ」編集になっている**(セクション3・4・7・9)
   - 発火経路: `selectedKeys.length > 1` のときだけ batch(payload)経路。
     **1キーだけ選択して Delete / Alt+Arrow という最頻出操作が該当**。
   - 実害: モーションが変わらないのにタイムラインからキーが消える/動く。
     undo でも payload は復元されず、保存→再読み込みで編集が巻き戻る(観点1・2・3すべてに抵触)。
   - 修正方向: 単一選択も batch 系 diff に一本化(`length >= 1`)。単一系 Command
     (keyframe.add/delete/move)と frame-map-only API は経路ごと廃止または payload 化。
2. **`commandHistory.clear()` が一度も呼ばれない**(セクション9)
   - プロジェクト読み込み後に Ctrl+Z すると、旧プロジェクトの diff が新プロジェクトの
     同名トラックに適用される。修正はプロジェクト import / クリア時に clear を呼ぶ1行。
3. **Autoキー・単一ボーン/モーフ登録が履歴化されず、既存キー上書きが不可逆**(セクション9、観点4)
   - `registerEditorBoneKeyframe` 直呼び+モーフ直 apply。Autoキー ON での編集は
     transform だけ undo できてキー登録が undo できない。既存キーの payload は上書きで永久喪失。
   - 修正方向: カメラ登録(keyframe.paste diff)と同型に before を読んで履歴化。

### [Later] 一覧(v0.2.x 送り可)

- batch 実行の途中失敗が半適用のまま残る(rollback なし)(セクション4)
- batch nudge 後の選択消失疑い(選択復元がバッチ内+frame 変更で selection クリア)
  → 「複数キー選択で Alt+Arrow 連打」の手動確認を推奨(セクション6・7・9)
- timeline 選択 ref に target/model 識別がなく、モデル切替で選択が同名トラックへ持ち越される(セクション6)
- 同一 path モデル複数体のプロジェクトで読み込み時にモーションが後勝ちで潰れる(セクション12、要手動確認)
- 異種 payload 適用でボーントラックが二重化しうる(セクション7)
- `mergePropertyTrack` の IK 状態が境界で 0(OFF)に落ちる(セクション7)
- info / accessory キー登録も履歴外(セクション9)
- bone transform builder に有限値ガードがない(セクション10)
- HistoryManager の merge は未実装(merge 境界のリスクは現状なし)(セクション2)

### 追加レビュー推奨

- **project-codec.ts**(serialize/deserialize の実体)— 補間・physicsToggle・propertyTrack の
  round-trip 完全性は今回未検証。既存 unit test のカバレッジ確認と合わせて。

### 手動確認の推奨シナリオ

1. キーを1つクリック選択 → Delete → 再生(モーションが変わるか)→ 保存 → 再読み込み(キーが消えたままか)。
2. プロジェクト A で編集 → プロジェクト B を読み込み → Ctrl+Z(B が壊れないか)。
3. Autoキー ON で既存キーのあるフレームにギズモ編集 → Ctrl+Z ×2(元のキー payload が戻るか)。
4. 複数キー選択 → Alt+Arrow を2回連続(2回目も移動するか、選択が残るか)。
5. 同一 PMX を2体ロードして別モーションを付け、保存 → 再読み込み(両方のモーションが残るか)。
