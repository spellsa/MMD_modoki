# リリース手順メモ

更新日: 2026-07-06

## 目的

- リリースは `vX.Y.Z` 形式の tag を push して行う。
- zip 配布物のビルドと GitHub Release への asset 添付は [`.github/workflows/build-zips.yml`](../.github/workflows/build-zips.yml) で行う。
- tag push 時に Windows / macOS / Linux の zip をビルドし、同じ tag 名の prerelease に自動添付する。

## 手順

1. `package.json` と `package-lock.json` の version を更新する。
2. 必要なら `README.md` と `docs/README.md` の公開向けリンクや説明を更新する。
3. 動作確認を行う。
4. 変更を commit して `main` へ push する。
5. tag を作成して push する。

```bash
git tag v0.1.5
git push origin v0.1.5
```

6. GitHub Actions の `Build Zip Packages` が成功することを確認する。
7. GitHub Releases で生成された prerelease を確認する。

## 自動で作られるもの

- Windows x64 zip
- macOS Apple Silicon / arm64 zip
- Linux x64 zip
- prerelease 本文の初期版
- zip assets の release への添付

release 名は `MMD modoki vX.Y.Z` になる。

## OS 別ビルド方針

GitHub Actions の [`build-zips.yml`](../.github/workflows/build-zips.yml) では、現時点では zip 配布だけを標準配布物として作る。

| OS | Forge platform / arch | release asset |
| --- | --- | --- |
| Windows | `win32 x64` | `MMD.modoki-windows-x64-<version>.zip` |
| macOS | `darwin arm64` | `MMD.modoki-mac-arm64-<version>.zip` |
| Linux | `linux x64` | `MMD.modoki-linux-x64-<version>.zip` |

macOS は M1 / M2 / M3 / M4 などの Apple Silicon 向けを優先する。
Intel Mac 向けの `darwin x64` や universal build は、v0.2.0 の標準配布対象には含めない。
要望が増えた場合は matrix に `darwin x64` を追加するか、別途 universal 化を検討する。

macOS zip は現時点では署名 / notarize 済み配布物ではないため、配布案内では初回起動時の Gatekeeper 注意を既知の制限として書く。

Windows は当面 x64 zip のみを配布する。インストーラや Squirrel 配布は maker 設定には残っているが、release workflow では `make:zip` のみを使う。

## 確認ポイント

- 3 OS 分の zip が release assets に並んでいるか
- prerelease 扱いになっているか
- zip 名が想定した version になっているか
- Linux 版の注意事項や既知不具合が必要なら release note に反映されているか

## Linux 版メモ

- Linux 版 zip は起動時に `--no-sandbox` を付けて確認する。
- 必要に応じて `--disable-setuid-sandbox` も併用する。
- `chrome-sandbox` 起因の起動失敗を避けるための暫定対応なので、配布案内にも同じ注意を書いておく。

起動例:

```bash
./MMD_modoki --no-sandbox
```

必要なら:

```bash
./MMD_modoki --no-sandbox --disable-setuid-sandbox
```

## 補足

- 手元の `npm run make:zip` はローカル OS 向けの確認用途。正式な配布物は GitHub Actions の結果を使う。
- workflow 失敗時は Actions の artifact から zip を確認できるが、通常は release assets から確認する。
