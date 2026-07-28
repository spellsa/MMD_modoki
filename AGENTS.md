# AGENTS.md

## 目的

このリポジトリは、`Electron`、`Babylon.js`、`WebGPU` を使った実験的な MMD エディタ / ビューア `MMD_modoki` です。

このプロジェクトは、現時点では `完成された製品` ではなく、`技術的試作 / 実験機` として扱ってください。

このリポジトリでの作業目的は主に以下です。

- アイデアの検証
- MMD の基本編集体験の改善
- 調査結果や知見の記録
- 実験的機能の保存

すべての要望を無理に実装完了まで押し切るのではなく、現在の構造や優先度に照らして、`実装より設計メモや調査記録を残すほうがよい` と判断できる場合はその方針を取ってよいです。

## 現在の優先度

汎用 3D アプリ化より、MMD 本体機能を優先してください。

優先度が高い領域:

- タイムラインとキーフレーム編集
- ボーン / カメラ編集体験
- プロジェクト保存 / 読み込み
- 物理の安定化と比較検証
- 出力の安定性
- MMD 材質向けのシェーダープリセット改善

優先度が低い、または実験寄りの領域:

- 汎用オブジェクト読み込み
- コントローラー連携
- `SQLite WASM` 実験

コアな MMD ワークフローと実験機能が競合する場合は、コア側を優先してください。

## このプロジェクトの位置づけ

- このリポジトリには実験的機能が入っていてよい
- 面白い技術実験は歓迎だが、MMD 編集の本筋を壊しにくい形で扱う
- 実験機能は、できれば設定画面、機能フラグ、明確に分離された導線のいずれかで隔離する
- 将来もし「正規版」を作るなら、現構成を延命するより再設計のほうが妥当な可能性が高い

関連メモ:

- [docs/README.md](./docs/README.md)
- [docs/docs-index.md](./docs/docs-index.md)
- [docs/architecture.md](./docs/architecture.md)
- [docs/mmd-project-positioning-note.md](./docs/mmd-project-positioning-note.md)
- [docs/mmd-basic-task-checklist.md](./docs/mmd-basic-task-checklist.md)

## このリポジトリ固有のルール

- 手動のファイル編集は `apply_patch` を使う
- ユーザーが行った無関係な差分は戻さない
- 明示的な依頼がない限り、大規模リファクタより小さく局所的な修正を優先する
- 挙動変更や重要な知見が出たら、必要に応じて `docs/` にメモを残す
- タスク管理は `docs/mmd-basic-task-checklist.md` に集約する
- 方針メモや位置づけメモはチェックリストと分離して管理する
- 文字化けしたコメント行を見つけた場合は、意味を復元できない限り削除してよい。ただしコードの挙動に影響しないことを確認し、可能な範囲で lint や関連する確認コマンドを実行する
- UI に機能を追加するときは、表示だけでなく初期値、保存/読み込み、backend 切替時の同期まで確認対象にする
- Classic / Frame Graph / Experimental など複数経路がある機能では、UI と実行経路を混在させず、二重適用や古い PostProcess の残存を確認する
- 実機確認で OK / NG が分かった項目は、必要に応じて `docs/` の進捗メモに確認結果として残す

## 外部公式情報の確認

Babylon.js / babylon-mmd / Electron / WebGPU など、外部ライブラリや実行基盤に関わる作業では、記憶や推測だけで進めず、必要に応じて検索して公式ドキュメントや一次情報を確認してください。

特に Babylon.js と babylon-mmd は公式ドキュメント・API リファレンス・サンプルが充実しているため、以下のような作業では積極的に参照してください。Babylon.js については、公式フォーラムにも実装者やメンテナーによる不具合調査、制約、回避策、Playground 例が多いため、調査対象に含めてよいです。

- Frame Graph、Rendering Pipeline、Post Process、Material、Shader、WebGPU まわりの実装や調査
- babylon-mmd の runtime、loader、physics、MMD material、outline、animation に関わる変更
- Babylon.js / babylon-mmd のバージョン差による API 変更や非推奨 API の確認
- 公式 task / helper / recommended path が存在するかどうかの確認
- 独自実装を入れる前に、既存の公式機能で置き換えられるか判断する場面

フォーラムの情報は、回答時点の Babylon.js バージョン、回答者、再現用 Playground、後続の修正状況を確認してください。フォーラム投稿だけで現行仕様と断定せず、可能な範囲で公式ドキュメント、API、ソースコード、リリースノート、現在使用中のバージョンの実挙動と照合してください。

調査で得た重要な知見や、公式ドキュメントと実装上の差分・制約が見つかった場合は、必要に応じて `docs/` に短い調査メモを残してください。

## 確認コマンド

基本の確認コマンド:

```powershell
npm.cmd run lint
```

コード変更後は、可能な範囲でこれを実行してください。

確認できなかった場合は、その旨を明確に伝えてください。

型検査:

```powershell
npm.cmd run typecheck
```

現時点では `typecheck` は既知の既存エラーがあるため失敗する。初回ベースラインは
[docs/review-v020/07-typecheck-baseline.md](./docs/review-v020/07-typecheck-baseline.md)
を参照する。

ただし、`TS2304` / `TS2552` のような未定義名参照は実バグ候補として優先確認する。
特に WebM exporter の `request` スコープ問題のような catch 経路の破損は、lint では拾えず
`typecheck` で初めて見えるため、関係するファイルを触った場合は可能な範囲で確認する。

追加の確認ルール:

- 純ロジック変更では、可能なら `npm.cmd run test:unit` も実行する
- 起動導線、`src/main.ts`、`src/preload.ts`、`src/renderer.ts`、初期化処理、WebGPU 起動条件に関わる変更では、可能なら `npm.cmd run smoke:launch` も実行する
- `smoke:launch` は lint の代替ではなく追加確認として扱う
- `smoke:launch` の成功条件は、Electron が起動し、renderer runtime が初期化され、`engine=WebGPU` まで到達することとする
- `smoke:launch` は UI 操作、描画品質、PMX/VMD 実読み込みの確認までは含まない

## 単体テスト方針

v0.2 では Action / Command / UI state / project state の整理を進めるため、単体テストを積極的に増やしてください。

特に優先してテストする対象:

- `Action -> canExecute`
- `Action -> Command`
- `Action -> diff`
- undo / redo に必要な最小差分
- `mergeKey`
- project save / load の変換・互換
- UI state helper
- FrameGraph / PostFX の backend selection や保存値変換
- DOM や Babylon runtime に依存しない pure helper

テストしにくい場合は、巨大 controller や runtime へ直接 mock を当てるより、まず判定・変換・差分生成を小さな helper / service に切り出すことを優先してください。

Action 単位のテストでは、button click や keydown そのものより、DOM 入力を Action に変換した後の「編集意図」と「編集結果」を確認してください。

例:

```text
button / shortcut / timeline
  -> same Action
  -> same CommandDiff
  -> same undo / redo behavior
```

## Lint warning 再発防止メモ

今回の warning 解消で多かった原因は、service / controller 切り出し時の `host: any`、Babylon / MMD runtime まわりの `any`、DOM / canvas の non-null assertion、コメントアウト済み debug 関数の未使用化だった。

今後の方針:

- 新規または切り出し service / controller では、`host: any` を原則使わず、同じファイル先頭に最低限の `XxxHost` 型を置く。
- Babylon / babylon-mmd の実体を完全に型付けしづらい場合は、広い `any` ではなく、小さい `Like` 型、`unknown`、`Record<string, unknown>`、または局所的な internal 型に隔離する。
- `effect: any`、`material: any`、`model: any`、`mesh: any` が出たら、必要なプロパティだけを持つ局所型へ寄せる。
- `!` による non-null assertion は増やさず、必要なら `getRequiredElement()` や canvas context helper のような小さい取得関数に寄せる。
- 調査用 debug 関数は、残すなら feature flag や明示的な呼び出し導線を置く。コメントアウト呼び出しだけになった debug 関数は削除候補にする。
- debug log / debug flag は、残す場合でも設定、feature flag、明示的な debug mode に寄せる。常時 `true` の調査フラグや大量の `console.log` / `console.table` は、削除または隔離候補として扱う。
- コメントは処理の逐語説明より、制約、外部ライブラリ都合、描画順、副作用、過去に壊れた理由を書く。
- 文字化けはコメントだけでなく UI 文言、docs、ログ文言も確認対象にする。意味を復元できないものは、挙動影響を確認して削除または置換する。
- Frame Graph / PostFX と editor overlay / gizmo / utility layer を触る場合は、最終出力後に overlay が上書きされないか、描画順と実機表示を確認する。
- lint warning は 20 件程度を超えたら小掃除回を入れ、数百件まで溜めない。
- warning 対応後は `npm.cmd run lint` を必ず実行し、pure helper / project state / action まわりに触った場合は `npm.cmd run test:unit` も実行する。

## TypeScript 型検査 再発防止メモ

`tsc --noEmit` の初回ベースラインでは 479 件の既存エラーが出ているため、現時点で
全体の型検査を blocking CI にするのは現実的ではない。

当面の方針:

- `npm.cmd run typecheck` は非ブロッキングのベースライン確認として扱う。
- `TS2304` / `TS2552` の未定義名参照は、既存の Babylon / host 型ズレとは別枠の実バグ候補として優先して直す。
- 新規コードや修正コードで `TS2304` / `TS2552` を増やさない。
- 型検査エラー総数は段階的に減らし、十分減ったら CI の `continue-on-error` を外す。
- `@ts-ignore` は原則使わず、必要なら理由付きの `@ts-expect-error` にする。

型エラーを減らすときの優先順:

1. 未定義名参照など、実行時クラッシュに直結しやすいもの。
2. 少数ファイルに出ている実装ミス候補。
3. `tsconfig` / module resolution 由来の設定問題。
4. `timeline-edit-service.ts` の readonly mutation など、データ整合に近いもの。
5. host 型 / Babylon private 型 / test mock 型の大きな整理。

特に守る短いルール:

```text
新規/切り出し service では any host 禁止。
最低限の XxxHost 型を同じファイル先頭に置く。
未定義名参照(TS2304/TS2552)は新規に増やさない。
```

## ログ / エラーハンドリング運用

- 新しい `console.*` や `catch` を追加するときは、ユーザー通知、app log、runtime diagnostic、debug trace、silent ignore のどれに分類するか決める。
- ユーザーに見せる失敗は短い通知にし、原因調査に必要な file path / backend / stack などは `app-logger` / `writeAppLog` の structured data に残す。
- recoverable fallback や機能 disable は、原則 `logWarn` と runtime diagnostic に残し、即時 toast は作業を止めるものに限定する。
- `console.log` / `console.table` / per-frame trace は一時調査または debug flag ON の用途に限定し、通常操作で常時出るログを増やさない。
- `catch {}` の silent ignore は cleanup や browser API の benign failure に限定し、理由コメントを残す。
- IPC / file IO では、cancel / invalid input / not found / actual failure をできるだけ区別する。新規 IPC では typed result も検討する。
- 不具合調査では、まず `npm.cmd run log:errors` で warning/error を確認し、流れを見る必要があれば `npm.cmd run log:tail` を使う。
- scope を絞る場合は `node scripts/show-app-log.mjs --scope asset --lines 200` のように直接実行してよい。
- Windows の開発ターミナルでは electron-log の console transport が日本語 file name を文字化けさせることがあるため、通常は console transport を使わず log file を読む。必要な場合だけ `MMD_MODOKI_CONSOLE_LOG=1` で有効化する。

TDD 的に進められる範囲では、t-wada 氏の TDD の考え方を参考にしてよいです。ただし、実験機能や描画調査では無理に完全な Red-Green-Refactor を押し切らず、次のように軽量に適用してください。

- まずテストリストを短く書く。
- pure helper や command builder では、失敗する小さいテストから始める。
- 1 つの振る舞いを通してから、必要最小限の実装にする。
- 通った後に重複や責務境界を整理する。
- UI / Babylon / WebGPU 実描画に近い領域では、単体テストに固執せず smoke や設計メモで補う。

テスト追加後は、可能な範囲で次を実行してください。

```powershell
npm.cmd run test:unit
npm.cmd run lint
```

起動導線や runtime 初期化に触った場合は、追加で `npm.cmd run smoke:launch` も確認してください。

## E2E / UI 動作確認方針

UI を実際に動かさないと確認しづらい変更では、現行の `smoke:launch` と必要に応じた手動確認で補ってください。

現行で使える確認:

- 既存の `smoke:launch`
- 必要に応じた手動確認チェックリスト

確認したい対象:

- HTML / CSS メニューバーの表示
- popup / dialog / drawer の表示
- Model Mode / Camera Mode の切替
- 下パネルや Effect panel の表示切替
- Help / Keyboard Shortcuts / Preferences / Export Settings の表示
- 初期 disabled 状態や `canUndo` / `canRedo` 表示
- locale 切替後のメニュー / dialog 文言
- アプリだけで完結する UI 導線

無理に自動確認しない対象:

- 実 PMX / PMD / VMD 読み込みの品質
- ボーン操作やカメラ操作の手触り
- WebGPU 描画品質
- 物理挙動の品質
- OS のファイルダイアログそのもの

方針:

- UI 動作確認は `lint` / `test:unit` / `smoke:launch` の代替ではなく追加確認として扱う。
- 自動化できない UI 導線は、手動確認結果を `docs/` に残すだけでもよい。
- file dialog は直接自動操作の対象にしない。
- 詳細な E2E 導入検討は [docs/electron-local-smoke-test-plan.md](./docs/electron-local-smoke-test-plan.md) を参照する。

## コードベースの主要箇所

- `src/mmd-manager.ts`
  - 中核のランタイム制御
- `src/ui-controller.ts`
  - UI イベントとファイル読み込み導線
- `src/mmd-manager-x-extension.ts`
  - アクセサリ / `.x` 拡張経路
- `src/scene/`
  - 描画、ライト、材質関連
- `docs/`
  - 設計メモ、調査メモ、仕様、タスクリスト

## 影響範囲が広い注意領域

- `WebGPU / WGSL` 周りは副作用が広い
- Babylon の材質 / シェーダー変更は別の描画挙動も壊しやすい
- `.x` アクセサリ処理は PMX/PMD と前提が異なる拡張経路
- 一部の `docs` は文字コードや保守状態に癖があるため、必要以上の大規模書き換えは避ける

## ドキュメント運用

大きめの変更を始める前に、まず `docs/` に既存の設計メモや調査メモがないか確認してください。

新しいドキュメントを作るときの方針:

- 特別な理由がなければ、プロジェクト内メモは日本語で書く
- できるだけ 1 ドキュメント 1 トピックにする
- チェックリストを肥大化させるより、必要に応じて別メモを追加する

参照開始点:

- [docs/README.md](./docs/README.md)
- [docs/docs-index.md](./docs/docs-index.md)
- [docs/architecture.md](./docs/architecture.md)
- [docs/mmd-basic-task-checklist.md](./docs/mmd-basic-task-checklist.md)
- [docs/mmd-project-positioning-note.md](./docs/mmd-project-positioning-note.md)
- [docs/timeline-spec.md](./docs/timeline-spec.md)
- [docs/physics-runtime-spec.md](./docs/physics-runtime-spec.md)
- [docs/troubleshooting.md](./docs/troubleshooting.md)

## エージェント向け実務ガイド

- レビュー依頼では、要約より先にバグ、回帰、リスク、欠けているテストを重視する
- 探索的な機能では、無理に fragile な実装を入れるより、設計メモや調査メモを残して止める判断をしてよい
- アーキテクチャ上の摩擦が見えたら、隠さずドキュメントに残す
- 楽観的な言い回しより、制約とトレードオフを明示する
- `src/timeline.ts` は今後の実装の手本として扱う。特に、更新頻度の違う表示をレイヤーごとに分離する、状態変更と描画実行を直結させず更新要求を局所的にスケジュールする、可視範囲だけを描画・計算する、座標計算・選択判定・描画を小さな関数に分ける、という方針を優先する
- タイムライン系や編集系 UI に機能を足すときは、既存ロジックにベタ書きで混ぜず、`timeline.ts` のように追加機能を局所化できるデータ構造・描画関数・更新経路を先に設計する
