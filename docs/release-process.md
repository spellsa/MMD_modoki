# リリース手順メモ

更新日: 2026-03-10

## 前提

- リリースは `vX.Y.Z` 形式の tag を基準に行う。
- zip 配布物のビルドと GitHub Release への asset 添付は [`.github/workflows/build-zips.yml`](../.github/workflows/build-zips.yml) で行う。
- tag push 時に Windows / macOS / Linux の zip をビルドし、同じ tag 名の prerelease に自動添付する。

## 手順

1. `package.json` と `package-lock.json` の version を更新する。
2. 必要なら `README.md` や `docs/README.md` の公開版リンクを次版に合わせて更新する。
3. 動作確認を行う。
4. 変更を commit して `main` へ push する。
5. tag を作成する。

```bash
git tag v0.1.1
git push origin v0.1.1
```

6. GitHub Actions の `Build Zip Packages` が成功するのを待つ。
7. GitHub Releases で対象 release を確認する。

## 自動で行われること

- Windows zip
- macOS zip
- Linux zip
- prerelease 作成または更新
- zip assets の release への添付

release 名は `MMD modoki vX.Y.Z` になる。

## 確認ポイント

- 3 OS 分の zip が release assets に並んでいるか
- prerelease 扱いになっているか
- zip 名が期待する version になっているか
- Linux 版の注意事項や既知不具合が必要なら release note に反映されているか

## 補足

- 手元の `npm run make:zip` はローカル OS 向けの確認用。正式配布物は GitHub Actions 生成物を使う。
- workflow 失敗時は Actions の artifact から zip を回収できるが、通常は release assets から取得できる。
