切り出し元: AGENTS.md / 切り出し日: 2026-08-04

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
