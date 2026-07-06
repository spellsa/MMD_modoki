# v0.2.0 ビルド前確認メモ

更新日: 2026-07-06

## 目的

v0.2.0 の配布ビルド前に、ビルド成功だけでなく、リリース向けに残してよい状態かを確認する。

今回の対象は次の3点。

- 余計な常時ログが残っていないこと
- CI / GitHub Actions のビルド前ゲートが現状の品質ラインに合っていること
- macOS 配布物を Apple Silicon 向けにすること

## ローカル確認順

基本確認:

```powershell
npm.cmd run lint
npm.cmd run test:unit
npm.cmd run typecheck:critical
npm.cmd run package
```

必要に応じて追加:

```powershell
npm.cmd run smoke:launch
npm.cmd run make:zip
```

`npm.cmd run typecheck` は既存の非 critical type error が残っているため、現時点ではビルド前 blocking にはしない。
未定義名参照のような実行時クラッシュ候補は `typecheck:critical` で見る。

## ログ確認

ビルド前に以下を確認する。

```powershell
rg -n "console\.(log|debug|info|table)" src
rg -n "console\.(warn|error)" src
rg -n "logInfo\(|logWarn\(|logError\(|logDebug\(" src
```

判断基準:

- `console.log` / `console.table` は原則残さない。
- `console.info` は smoke / renderer backend 判定など、起動診断として必要なものだけにする。
- `console.warn` / `console.error` は fallback や capture 失敗など、ユーザー環境で起きる失敗の調査に必要なものだけにする。
- 詳細な調査ログは `logDebugIfEnabled()` または `isDebugLogEnabled()` 経由に寄せる。
- `logInfo()` は app log へ残す運用なので、開始/完了/復元成功などの粒度に留める。per-frame や大量ループ内では出さない。

今回の WebM 物理状態引き継ぎでは、`initial physics snapshot restored` は出力開始時に1回だけの app log として残す。
出力失敗時の調査に必要なため、通常ログとして許容する。

## CI / GitHub Actions

`.github/workflows/build-zips.yml` は tag push または手動実行で zip を作る。

現行ゲート:

- `npm ci`
- `npm run lint`
- `npm run test:unit`
- `npm run typecheck:critical`
- `npm run make:zip -- --platform=<platform> --arch=<arch>`

全体 `typecheck` は既存エラーが多いため、まだ release workflow の blocking にはしない。

## macOS 配布物

macOS zip は Apple Silicon 向けを優先し、`darwin arm64` で作る。

GitHub Actions の matrix:

- Windows: `win32 x64`
- macOS: `darwin arm64`
- Linux: `linux x64`

release asset 名:

- `MMD.modoki-windows-x64-<version>.zip`
- `MMD.modoki-mac-arm64-<version>.zip`
- `MMD.modoki-linux-x64-<version>.zip`

Intel Mac 向け zip は現時点では標準配布対象にしない。必要なら後続で `darwin x64` を matrix に追加する。

## 既知の注意

- package 版では MPR はまだ未統合で、SPR fallback 前提。
- Linux zip は sandbox まわりの暫定対応がある。
- PNG 連番出力の post stack 反映は v0.2.0 では deferred。
- リリースノートには、既知の制限として package 版 MPR fallback と PNG 連番 deferred を明記する。
