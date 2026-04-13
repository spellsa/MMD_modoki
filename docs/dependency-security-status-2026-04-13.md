# 依存関係セキュリティ状況メモ 2026-04-13

## 目的

最近話題になった Axios 関連の npm マルウェア報告について、MMD_modoki が影響を受けるかを確認する。

あわせて、`npm audit` で出ている既存警告の性質を整理し、開発がまだ不安定な現状で依存更新を急ぐべきかどうかを判断する。

## 結論

現時点の MMD_modoki は、Axios マルウェア報告の直接影響は受けていないと判断する。

理由:

- `axios` は直接依存にも推移依存にも見つからなかった
- 問題報告に出ている `plain-crypto-js` も見つからなかった
- `node_modules` 配下にも `axios` / `plain-crypto-js` は存在しなかった
- 本番依存だけの `npm audit --omit=dev --json` は 0 件だった

一方で、dev 依存を含めた `npm audit --json` では既存警告が出ている。ただし、主な対象は Electron / Electron Forge / Vite / Rollup などの開発・ビルド系依存であり、Axios 件のような即時侵害対応とは分けて扱う。

今は MMD_modoki の開発自体がまだ不安定なので、依存をまとめて上げるのは避ける。更新する場合も、まず `electron` のパッチ更新など影響範囲を絞った作業として扱う。

## Axios 関連報告の要点

公開情報では、npm 上の `axios` に悪性バージョンが一時的に公開され、インストール時に悪性依存を経由して RAT を落とす挙動が報告されている。

主に確認した対象:

- `axios@1.14.1`
- `axios@0.30.4`
- `plain-crypto-js@4.2.1`
- 追加で関連報告に出ていた `@qqbrowser/openclaw-qbot`
- 追加で関連報告に出ていた `@shadanai/openclaw`

参照:

- [StepSecurity: Axios Compromised on npm](https://www.stepsecurity.io/blog/axios-compromised-on-npm-malicious-versions-drop-remote-access-trojan)
- [Snyk: Axios npm package compromised](https://snyk.io/es/blog/axios-npm-package-compromised-supply-chain-attack-delivers-cross-platform/)
- [axios/axios issue 10604](https://github.com/axios/axios/issues/10604)

## ローカル確認結果

確認日: 2026-04-13

確認したコマンド:

```powershell
rg -n '"axios"|axios|plain-crypto-js' package.json package-lock.json
npm.cmd ls axios plain-crypto-js --all
Test-Path node_modules\axios
Test-Path node_modules\plain-crypto-js
rg -n '@qqbrowser/openclaw-qbot|@shadanai/openclaw|plain-crypto-js|"axios"' package.json package-lock.json
npm.cmd ls @qqbrowser/openclaw-qbot @shadanai/openclaw --all
npm.cmd audit --omit=dev --json
npm.cmd audit --json
```

結果:

- `package.json` / `package-lock.json` に `axios` は見つからなかった
- `package.json` / `package-lock.json` に `plain-crypto-js` は見つからなかった
- `node_modules\axios` は存在しなかった
- `node_modules\plain-crypto-js` は存在しなかった
- `@qqbrowser/openclaw-qbot` / `@shadanai/openclaw` も見つからなかった
- `npm.cmd ls axios plain-crypto-js --all` は `(empty)`
- `npm.cmd ls @qqbrowser/openclaw-qbot @shadanai/openclaw --all` は `(empty)`
- `npm audit --omit=dev --json` は本番依存の脆弱性 0 件

補足:

`package-lock.json` には `1.14.1` というバージョン文字列自体は存在する。ただしこれは `@webassemblyjs/*` や `tslib` の通常バージョンであり、`axios@1.14.1` ではなかった。

## 既存 audit 警告

dev 依存を含めた `npm audit --json` では、合計 46 件の警告が出ている。

補足:

初回確認時点では合計 43 件だった。その後、Vitest の最小導入で devDependency が増えたため、2026-04-13 時点の最新値は 46 件になっている。本番依存のみの `npm audit --omit=dev --json` は引き続き 0 件。

内訳:

```text
critical: 0
high: 33
moderate: 7
low: 6
total: 46
```

直接依存で目立つもの:

| パッケージ | 現在 | audit 上の主な扱い | メモ |
| --- | --- | --- | --- |
| `electron` | `40.4.1` | `high` | 修正候補は `40.8.5`。最初に検証するならここが比較的現実的。 |
| `vite` | `5.4.21` | `moderate` | 修正候補は `8.0.8` だが major update。Electron Forge との相性確認が必要。 |
| `@electron-forge/*` | `7.11.1` | `high` | 複数出ているが `fixAvailable: false` が多い。単純な `npm audit fix` では片付かない。 |

推移依存で目立つもの:

- `@electron/rebuild`
- `@electron/node-gyp`
- `tar`
- `rollup`
- `esbuild`
- `serialize-javascript`
- `minimatch`
- `picomatch`
- `lodash`
- `flatted`
- `@xmldom/xmldom`
- `cacache`
- `make-fetch-happen`

これらは主に開発・ビルド・パッケージング経路の下にいる。配布物の実行時リスクと、開発マシン上で依存をインストール・ビルドするときのリスクは分けて見る必要がある。

## 現時点の方針

Axios 件については、MMD_modoki 側で緊急対応はしない。

依存更新については、まとめて上げない。特に `vite` の major update や Electron Forge 周りの大きな更新は、現在の MMD 編集機能の開発と衝突しやすいので、単独タスクとして扱う。

優先順位:

1. `package-lock.json` を維持し、依存解決を不用意に揺らさない
2. `axios` を新規追加する必要が出た場合は、追加前にバージョンと npm advisory を確認する
3. `electron` の `40.4.1` から `40.8.5` への更新を、小さな検証タスクとして検討する
4. `vite` / `@electron-forge/*` は、ビルド・起動・package/make まで含めた別タスクで検証する
5. 開発環境の依存更新を行った場合は、最低限 `npm.cmd run lint` と `npm.cmd run package` を確認する

## 残すリスク

`npm audit` は既知 advisory に基づく確認であり、未知の侵害や registry 側の一時的な問題までは検出できない。

また、今回の確認は 2026-04-13 時点のローカル `package-lock.json` / `node_modules` / npm registry の状態に基づく。今後依存を追加・更新した場合は、同じ確認を再実行する。
