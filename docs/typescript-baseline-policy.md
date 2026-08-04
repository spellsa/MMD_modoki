切り出し元: AGENTS.md / 切り出し日: 2026-08-04

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
