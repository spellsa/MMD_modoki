# v0.2.0 typecheck follow-up: TS2540 readonly mutation 対応

作成日: 2026-07-04

## 目的

`docs/review-v020/07-typecheck-baseline.md` で P1 として残していた `src/editor/timeline-edit-service.ts` の `TS2540` 42 件を解消した。

## 対応内容

- babylon-mmd の animation track 型では readonly として見える配列プロパティを、編集サービス内の既存 mutable batch 型へ局所的に寄せた。
- `asMutableCameraTrack()` / `asMutableMorphTrack()` / `asMutableMovableBoneTrack()` / `asMutableBoneTrack()` を追加した。
- payload apply と単発 keyframe remove の差し替え代入を同じ方針に統一した。
- runtime の編集方針は変えず、型上の readonly と実装上の mutable batch 差し替えの境界だけを明示した。

## 確認結果

```powershell
npm.cmd run typecheck
npm.cmd run typecheck:critical
npm.cmd run lint
npm.cmd run test:unit
```

結果:

- `npm.cmd run typecheck`: 失敗継続。エラー総数は 471 から 429 へ減少。
- `TS2540`: 0 件。
- `src/editor/timeline-edit-service.ts`: 0 件。
- `npm.cmd run typecheck:critical`: 成功。
- `npm.cmd run lint`: 成功。
- `npm.cmd run test:unit`: 成功。

## 次の候補

残件は `src/mmd-manager.ts` と `src/scene/material-shader-service.ts` に集中している。次は host 型 / Babylon private 型を領域ごとに `Like` 型や adapter へ隔離する作業に分ける。
