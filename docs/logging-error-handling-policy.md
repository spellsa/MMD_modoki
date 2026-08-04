切り出し元: AGENTS.md / 切り出し日: 2026-08-04

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
