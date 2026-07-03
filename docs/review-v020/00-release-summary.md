# v0.2.0 リリース前レビュー 統合サマリ

作成日: 2026-07-03

## 目的

6テーマのリリース前レビュー(01〜06)の指摘を統合し、リリース判定に使える形に圧縮する。

入力:

- [01: 動画・画像出力系](./01-output.md)
- [02: キー編集とプロジェクト保存のデータ整合](./02-editing-data.md)
- [03: モデル・アクセサリ・テクスチャ読み込みの寛容性](./03-loading.md)
- [04: 編集状態機械・再生/シーク・物理fallback](./04-state-physics.md)
- [05: 起動シーケンス・環境差・packaged build](./05-launch-env.md)
- [06: 横断掃除(機械スイープ)](./06-sweep.md)

---

## リリース判定サマリ

- **Blocker: 11件**(コード修正 8件 + リリース作業 3件)
- **Later: 38件**(テーマ別内訳は後述。データ破壊・クラッシュ級はゼロ)

### リスクが集中している領域

1. **WebM / PNG 連番出力パイプライン(Blocker 5件が連鎖)**
   post stack 不適用(全モード)、エンコーダエラーでデッドロック、失敗時の
   ReferenceError で UI 永久ロック — 「出力が失敗する」と「失敗すると復帰不能」が
   重なっており、v0.2 の目玉である FrameGraph post stack が出力に乗らない。
2. **キー編集の「単一選択」経路(Blocker 3件、ユーザーデータ喪失)**
   batch 経路(複数選択)は payload 完備で健全な一方、1キー選択の Delete/nudge、
   Autoキー登録、プロジェクト跨ぎ undo にデータ喪失・巻き戻りの穴が集中。
3. **検査体制の欠落(横断)**
   `tsc --noEmit` が lint/CI に存在せず、esbuild は型検査をしないため、
   Blocker 8(スコープ外変数参照)のようなコンパイルエラー級の欠陥が素通りする。
   同類が他に潜在していないかは未検証(未検証リスト参照)。

一方、**読み込みの寛容性(03)と状態機械・物理fallback(04)は Blocker ゼロ**で、
壊れたファイル・環境差への防御は堅牢。リポジトリ衛生(06)も TODO残骸・デッドコード・
リンク切れ全てゼロと良好。

### リリース前の推奨アクション上位5

1. **renderer.ts の `request` スコープ修正(B8)を最初に行う** — これを直さない限り、
   WebM の他の Blocker を直して「失敗が正しく throw される」ようになるたびに
   UI 永久ロックが発生する。修正順序の前提条件。
2. **webm-exporter の consumer try/catch(B3)+ readpixels モードの注記(B4)** —
   各数行。ハング撲滅と無警告の見た目乖離の解消。
3. **`renderOnce()` への post stack 実行組み込み+ready 待ち(B1・B2)** —
   出力系の本丸。日程が厳しい場合の代替は「v0.2.0 では PNG連番/WebM は
   post effect 非対応(単発 PNG のみ対応)」の明記(無警告出荷だけは避ける)。
4. **キー編集系: B6(履歴 clear、1行)を即時、B5(単一選択の batch 一本化)と
   B7(Autoキー登録の履歴化)を計画修正** — いずれも既存の batch/カメラ登録実装が
   手本としてコード内にあり、設計不要。
5. **リリース作業パッケージ(B9〜B11)+ `tsc --noEmit` の CI 追加** —
   GLBデバッグフラグ OFF・version 0.2.0 バンプ・notices に electron-log 追記(計数行)。
   tsc 追加は B8 クラスの再発防止。

---

## [Blocker] 一覧(11件)

### 出力系(01)

| # | 指摘 | 影響範囲 | 再現条件 | 修正の当たり |
|---|---|---|---|---|
| B1 | WebM 出力に FrameGraph post stack が全キャプチャモードで反映されない(01-§5) | post effect 使用プロジェクトの WebM 出力すべて(画面と出力が別物) | post stack 有効のプロジェクトで WebM 出力するだけ | `renderOnce()` に `syncFrameGraphRenderTargetState()`+`executePostEffectBackend()` を組み込み、export 開始前に backend の `isReady()` を待つ(01-§8) |
| B2 | PNG 連番出力に post stack が反映されない(01-§1) | 同上(PNG 連番) | 同上(PNG 連番出力) | B1 と同じ枠組み(renderOnce+ready待ち+フレームバッファ読み)へ載せ替え |
| B3 | WebM エンコーダエラー時に producer がデッドロック(01-§2) | WebM 出力中の UI が「出力中」のまま永久停止、ファイルハンドル残留 | エンコーダエラー(HW エンコーダ途中失敗等)+キュー満杯(16フレーム以上残) | `consumeQueue` を try/catch で包み `fatalError` に設定(1箇所) |
| B4 | `readpixels`(安定)モードが post 非対応のまま無警告で誘導される(01-§2) | 安定モード選択時/webgpu-copy 失敗時の出力(B1 修正後も残る) | 安定モードで post effect 有効プロジェクトを出力 | モード選択 UI とエラーメッセージに「post effect 非対応」を明記(モード自体の対応は v0.2.x 可) |

### キー編集・保存(02)

| # | 指摘 | 影響範囲 | 再現条件 | 修正の当たり |
|---|---|---|---|---|
| B5 | 単一キー選択の Delete / nudge / add が「表示のみ」編集(frame map only)(02-§7・9) | 1キー選択で Delete/Alt+Arrow という最頻出操作。モーション不変のままタイムライン表示だけ変化、undo でも payload 不復元、保存→再読込で編集が巻き戻る | キーを1つクリック選択して Delete または Alt+Arrow | 単一選択も batch 系 diff(payload 付き)へ一本化(`selectedKeys.length >= 1` で batch 経路へ) |
| B6 | `commandHistory.clear()` がどこからも呼ばれない(02-§9) | プロジェクト読み込み後の Ctrl+Z で旧プロジェクトの diff が新プロジェクトの同名トラックへ適用される | プロジェクト A で編集 → B を読み込み → Ctrl+Z | プロジェクト import 時に `clear("project-load")` を呼ぶ(1行) |
| B7 | Autoキー・単一ボーン/モーフ登録が履歴化されず、既存キー上書きが不可逆(02-§9) | Autoキー ON のギズモ/数値編集、単一ボーン/モーフの登録ボタン。既存キーの payload が永久喪失 | Autoキー ON で既存キーのあるフレームを編集 → Ctrl+Z(キーが戻らない) | カメラ登録(`keyframe.paste` diff、before 読み)と同型に履歴化 |

### 起動・packaged(05)

| # | 指摘 | 影響範囲 | 再現条件 | 修正の当たり |
|---|---|---|---|---|
| B8 | WebM exporter の catch がスコープ外 `request` を参照し失敗時 ReferenceError(renderer.ts L494-495)(05-§3) | WebM 出力が失敗するたびに exporter ウィンドウ残留 → メインウィンドウの export ロック永久化+close 不能(強制終了しか手がない) | WebM 出力を何らかの理由で失敗させる(コーデック不対応、出力先書き込み不可等) | `request` 宣言を try の外へ出し catch では null ガード付き参照(数行)。再発防止に `tsc --noEmit` を CI へ |

### リリース作業(06)

| # | 指摘 | 影響範囲 | 再現条件 | 修正の当たり |
|---|---|---|---|---|
| B9 | GLB デバッグフラグ常時 ON(mmd-manager-x-extension.ts:111-112)(06/03-§4) | リリースビルドでも GLB アクセサリが全てネオン緑+バウンディングボックス表示 | GLB を読み込むだけ | 2定数を false へ(GLB を実験扱いで隠すなら Later 可) |
| B10 | package.json version が 0.1.8 のまま(06/05-§5) | 配布物・ログのバージョン表記 | — | 0.2.0 へバンプ |
| B11 | THIRD_PARTY_NOTICES.md に `electron-log` 漏れ(06) | 配布物のクレジット表記(notices の自己宣言とも不整合) | — | Runtime dependencies 表に1行追加(MIT / megahertz/electron-log) |

---

## [Later] 要約(テーマ別 38件)

| テーマ | 件数 | 代表例 |
|---|---|---|
| 01 出力系 | 9 | PNG連番のキャンセル手段なし / withTimeout の unhandled rejection / mediabunny private API 依存 / 出力起動の実行中ガードなし+連番フォルダ名の秒精度衝突 |
| 02 キー編集・保存 | 9 | batch 途中失敗の半適用(rollback なし)/ batch nudge 後の選択消失疑い(要手動確認)/ 同一 path モデル複数体で読み込み時にモーションが後勝ちで潰れる / timeline 選択 ref に model 識別なし |
| 03 読み込み寛容性 | 7 | DDS ヘッダの寸法・切断検証欠如+buffer 経路の catch なし(破損 DDS 1枚でモデル全体が読み込み失敗。アプリは落ちない)/ 読み込み後半失敗時のゾンビモデル / バイナリ .x の文言 |
| 04 状態機械・物理 | 6 | 末尾到達時の Idle 遷移がフレーム停止トグル有効時のみ(要手動確認)/ 再生中のモデル削除で状態遷移表外の状態 / timeline.seekFrame の drag phase 無視 / 一時停止中の rigidBodyStates 一括 fill と物理OFFキーの競合(要手動確認) |
| 05 起動・packaged | 5 | `tsc --noEmit` の CI 追加(B8 の再発防止・最優先 Later)/ WebM 保存セッションの FileHandle がクラッシュ時リーク / dev と packaged のセッション挙動差の docs 化 |
| 06 スイープ | 2 | docs/action-dispatcher-progress-note-2026-05-18.md:102 の文字化け1行 / About ダイアログ(バージョン表示)の追加検討 |

詳細は各テーマのノート末尾「[Later] 一覧」を参照。

---

## 未検証リスト(各セッションで「読めなかった/確認できなかった」と記録した箇所)

コードレビューで確定できず、追加レビューまたは実機確認が必要なもの:

1. **project-codec.ts(serialize/deserialize の実体)** — 承認範囲外で未読(02-§11)。
   補間・physicsToggle・propertyTrack(表示/IK キー)の round-trip 完全性が未検証。
   追加レビュー推奨(既存 unit test のカバレッジ確認と合わせて)。
2. **型チェックの全体実行** — レビュー環境に node_modules がなく `tsc --noEmit` を
   完走できなかった(05-§3)。B8 は目視で確定したが、**同類の型エラー級欠陥が
   他に潜在していないかは未確認**。CI に tsc を足した際の初回実行結果を要確認。
3. **babylon-mmd 側の物理オンオフキー適用タイミング** — ライブラリ内部は対象外のため、
   一時停止中の `rigidBodyStates.fill(1)` が物理OFFキーを一瞬上書きするかは
   実機確認待ち(04-§2)。
4. **音声あり再生の末尾到達挙動** — audio player / runtime 側が未読範囲のため、
   フレーム停止トグル無効時に UI が Paused へ戻るかは実機確認待ち(04-§4)。
5. **欠落 .tga 等(ブラウザで寸法確認できない形式)のモデルロード継続性** —
   babylon-mmd 側のエラー処理に委ねられており未確認(03-§6)。
6. **batch nudge 連打時の選択維持** — 選択復元のタイミング問題2系統を静的に特定したが、
   実際に選択が失われるかは実機確認待ち(02-§6・7・9)。
7. **同一 PMX 複数体の運用可否** — 読み込みで片方のモーションが潰れる問題の
   深刻度判定が運用方針(複数体を許容するか)に依存(02-§12)。
8. **バックグラウンド出力失敗時のメインウィンドウ通知** — B8 により現状は
   failed progress 自体が届かないため、B8 修正後に「失敗トーストが出るか」を
   実機で再確認(01-§4 + 05-§3)。
9. **部分読ファイルの未読領域** — mmd-manager.ts(11046行)と ui-controller.ts
   (9515行)は各テーマの関連セクションのみ部分読。テーマ外の未読領域
   (材質互換・パネル群・カメラ操作等)は本レビューの対象外のまま。
10. **scripts/ 配下(smoke-launch.mjs 等)と各 .test.ts** — 全テーマで対象外。

各テーマのノート末尾には実機での「手動確認の推奨シナリオ」も列挙している
(01: 3件、02: 5件、03: 4件、04: 5件、05: 4件)。リリース前 QA のチェックリストとして
そのまま使える。
