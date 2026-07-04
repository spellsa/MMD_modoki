# v0.2.0 release blocker 対応順管理

作成日: 2026-07-04

## 目的

`docs/review-v020/00-release-summary.md` の Blocker を、実装順、人間検品、リリース作業まで含めて管理する。

方針:

- 小さく安全な修正でウォームアップしてから、本丸の出力系へ進む。
- キー編集系は同じ Command / batch 経路への合流なので、同一セッションでまとめて進める。
- 出力系はキー編集の検品が通ってから着手する。
- 人間検品バッチは省略せず、対応済み判断の材料にする。

## 対応順

| 順 | Status | 対象 | 内容 | メモ |
|---:|---|---|---|---|
| 1 | Done | B6 | 履歴クリア漏れ | Project load 成功後に `commandHistory.clear("project-load")` を呼ぶ。検品バッチ1で別プロジェクト読込後の undo を確認する。 |
| 2 | Code Done | B3 | WebM 失敗時の UI 永久ロック | `consumeQueue()` の例外を `fatalError` に格納する形で対応。検品バッチ2で失敗復帰を確認する。 |
| 3 | Todo | B7 | Auto キーの履歴化 | Auto キー登録を Command 発行に載せ替える。 |
| 4 | Todo | B5 | 単一キー編集を batch 経路へ一本化 | B7 と同じ Command 経路への合流。B7/B5 は同一セッション推奨。 |
| 5 | Human QA | 検品バッチ1 | キー編集系 | 1回の起動で、キー打つ -> Auto キー発動 -> undo/redo 数回 -> 保存 -> 再読込 -> 別プロジェクトを開いて undo(B6確認) -> もう一度保存・再読込。 |
| 6 | Todo | B1/B2 | 出力への post stack 適用 | 本丸、半日級。検品バッチ1 が通ってから着手する。 |
| 7 | Todo | B4 | 注記系の小修正 | B1/B2 と同じ出力系セッションで対応する。 |
| 8 | Human QA | 検品バッチ2 | 出力系 | 1回の起動で、エフェクト盛る -> PNG 出力 -> WebM 出力 -> 画面と見比べ -> わざと失敗させて復帰確認(B3確認) -> 連続出力。 |
| 9 | Todo | B9/B10/B11 | 小修正組 | ネオン緑消灯、バージョン表記、notices。数行 x 3。忘れないよう検品バッチ2 後に固定。 |
| 10 | Human QA | 最終 QA | クリーン環境で zip 展開 -> 起動 -> コア動線 | 削らない。リリース2日前までには終える。 |
| 11 | Todo | Release notes | リリースノート作成 | review-v020 の対応済み欄を素材にし、既知の問題節に積み残しを明記する。 |

## 対応済み・別管理

| 対象 | Status | メモ |
|---|---|---|
| B8 | Done | WebM exporter catch の `request` スコープ問題は対応済み。`typecheck:critical` で `TS2304` / `TS2552` を blocking 化済み。 |
| TS2540 | Done | `src/editor/timeline-edit-service.ts` の readonly mutation 42 件は対応済み。詳細は `08-typecheck-ts2540-followup.md`。 |

## 運用メモ

- 実装が終わった項目は `Status` を `Done` に変える。
- 実装済みでも人間検品が未完了なら、対応項目は `Code Done`、検品バッチは `Human QA` のままにする。
- 検品で NG が出た場合は、該当 Blocker の行へ短い原因メモを追記する。
- リリースノート作成時は、このドキュメントの `Done` 行と各 review-v020 詳細メモを材料にする。
