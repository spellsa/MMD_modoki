# Vite / Vitest バージョン選定メモ

更新日: 2026-05-17

v0.2.0 で Vite / Vitest を更新する前に、安定性と npm supply-chain risk の観点で調査したメモ。

## 前提

実行環境:

- Node.js: `v24.13.1`
- npm: `11.8.0`
- 現行 Vite: `^5.4.21`
- 現行 Vitest: `^2.1.9`

Vite / Vitest は開発時に広く依存を引き込むため、最新版へ即追従するより、以下を満たす候補を選ぶ。

- npm dist-tag だけでなく `npm view` で version / engines / dependencies / integrity を確認する
- `npm audit` で既知脆弱性を見る
- `npm audit signatures` で registry signature / provenance attestation を見る
- major update は他の実装変更と混ぜず、別コミットで確認する
- install 前後で lockfile diff を確認し、想定外の optionalDependencies / lifecycle script 増加を見る

## npm 調査結果

`npm view` で確認した dist-tag:

- Vite latest: `8.0.13`
- Vite previous: `7.3.3`
- Vitest latest: `4.1.6`

候補:

| 候補 | engines | 主な依存 | 判断 |
| --- | --- | --- | --- |
| `vite@5.4.21` + `vitest@2.1.9` | Node 18+ / 20+ | Vite が `esbuild ^0.21.3` | 現行。動作実績はあるが `npm audit` で esbuild 経由の既知脆弱性に引っかかる |
| `vite@6.4.2` + `vitest@3.2.4` | Node 18+ / 20+ / 22+ | Vite が `esbuild ^0.25.0` | Vite 6 系の最終寄り候補。変化量は小さいが、Vitest 4 を使うなら Vite 7 と比べる価値は下がる |
| `vite@7.3.3` + `vitest@4.1.6` | Vite: Node `^20.19.0 || >=22.12.0`; Vitest: Node 20+ / 22+ / 24+ | Vite が `esbuild ^0.27.0`; Vitest 4 が Vite 6/7/8 対応 | 第一候補。latest ではなく previous tag なので、Vite 8 より安定寄り |
| `vite@8.0.13` + `vitest@4.1.6` | Vite: Node `^20.19.0 || >=22.12.0` | `rolldown 1.0.1`, `lightningcss ^1.32.0` | 構成変化が大きい。v0.2 初期の安定候補ではなく後続検証候補 |

## セキュリティ観点

`npm audit --audit-level=moderate` の現状:

- 49 vulnerabilities
- `vite <=6.4.1` が `esbuild <=0.24.2` 経由で advisory に引っかかる経路が表示された
- Electron / Electron Forge 由来の advisory も多く、Vite / Vitest だけでは解消しない

`npm audit signatures` の現状:

- 724 packages have verified registry signatures
- 61 packages have verified attestations

GitHub Advisory `GHSA-67mh-4wv8-2f99` では、`esbuild <=0.24.2` が dev server の CORS 設定により source code を読まれる可能性があるとされ、patched version は `0.25.0`。
そのため、Vite を上げるなら `esbuild ^0.25.0` 以上へ寄る価値がある。

ただし、npm provenance や signature は万能ではない。
TanStack の 2026-05-11 事案では、OIDC trusted publishing と provenance がある構成でも CI 経路を突かれて悪性 version が publish された。
そのため、provenance は確認材料の一つとして扱い、lockfile 固定、公開直後の版を避ける、install script / optionalDependencies 差分確認を併用する。

参照:

- npm provenance: https://docs.npmjs.com/viewing-package-provenance/
- esbuild advisory: https://github.com/advisories/GHSA-67mh-4wv8-2f99
- TanStack postmortem: https://tanstack.com/blog/npm-supply-chain-compromise-postmortem

## 推奨

v0.2.0 では、まず `vite@7.3.3` + `vitest@4.1.6` を別コミットで試す。

理由:

- `vite@8` は latest だが、Rolldown / Lightning CSS への依存変化が大きく、Electron + WebGPU + babylon-mmd の切り分けに向かない
- `vite@7.3.3` は dist-tag `previous` で、2026-05-07 publish のため、`vite@8.0.13` より供給網リスクと breaking change リスクを抑えやすい
- `vitest@4.1.6` は Vite 6/7/8 に対応しており、Action 単位テスト追加の前に上げておく価値がある
- 現行 Node `v24.13.1` は Vite 7 / Vitest 4 の engines を満たしている

検証コマンド:

```powershell
npm.cmd install --save-dev vite@7.3.3 vitest@4.1.6
npm.cmd audit signatures
npm.cmd audit --audit-level=moderate
npm.cmd run lint
npm.cmd run test:unit
npm.cmd run package
npm.cmd run smoke:launch
```

確認点:

- `package-lock.json` の Vite / Vitest / Rollup / esbuild / optionalDependencies 差分
- install script が増えていないか
- babylon-mmd MPR / SPR wasm URL 解決
- `optimizeDeps.exclude`
- `engine=WebGPU` まで到達するか
- Frame Graph backend / LUT / MirroringFloor が起動経路で壊れていないか

## 導入結果

2026-05-17 に `vite@7.3.3` + `vitest@4.1.6` を導入した。

```powershell
npm.cmd install --save-dev vite@7.3.3 vitest@4.1.6
```

install 結果:

- added 11 packages
- removed 9 packages
- changed 16 packages
- audited 729 packages

導入後の主要バージョン:

- `vite@7.3.3`
- `vitest@4.1.6`
- `esbuild@0.27.7`
- `rollup@4.57.1`

`package-lock.json` 上の確認:

- Vite は `5.4.21` から `7.3.3` へ更新
- Vitest は `2.1.9` から `4.1.6` へ更新
- esbuild は `0.21.5` から `0.27.7` へ更新
- esbuild の optional binary package は `0.27.7` 系へ更新
- Vite 8 系の `rolldown` / core dependency としての `lightningcss` は未導入

検証結果:

- `npm.cmd audit signatures`
  - pass
  - registry signatures: 726 packages
  - attestations: 62 packages
- `npm.cmd audit --audit-level=moderate`
  - fail
  - 44 vulnerabilities
  - 旧 Vite / esbuild 経路の `vite <=6.4.1` / `esbuild <=0.24.2` advisory は解消
  - 残存は Electron / Electron Forge / Rollup / tar / tmp などの経路で、別タスクとして確認する
- `npm.cmd run lint`
  - pass
  - 0 errors / 467 warnings
- `npm.cmd run test:unit`
  - pass
  - 10 files / 41 tests
- `npm.cmd run package`
  - pass
  - Electron Forge package succeeded
- `npm.cmd run smoke:launch`
  - pass
  - `engine=WebGPU`
  - `physics=Bullet MPR`
  - `crossOriginIsolated: true`
  - SharedArrayBuffer available

追加確認:

- Vite 7 導入後、未 import の Babylon WGSL shader request が dev server の HTML fallback を受け取り、WebGPU validation warning が大量に出るケースを確認した。
- `src/ShadersWGSL/*.fx` が `text/html` として返る場合、WGSL parser が `<!doctype html>` を shader code として読んで失敗する。
- `src/mmd-manager.ts` に Frame Graph / depth / SSAO / bloom / post process 系の WGSL shader import を追加し、再度 `npm.cmd run smoke:launch` を実行した。
- 修正後の smoke では `engine=WebGPU`、`physics=Bullet MPR`、Frame Graph backend `ready` まで到達した。

判断:

- v0.2.0 の Vite / Vitest 更新候補としては `vite@7.3.3` + `vitest@4.1.6` を採用してよい。
- `npm audit` はまだ clean ではないため、依存更新全体の完了条件にはしない。残存 advisory は Electron / Electron Forge / Rollup などの更新判断として別に扱う。
- Vite 8 は今回の導入対象にしない。Rolldown まわりの変化を Electron + WebGPU + babylon-mmd の安定化作業と混ぜない。
