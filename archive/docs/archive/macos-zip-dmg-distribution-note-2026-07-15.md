# macOS ZIP / DMG 配布メモ 2026-07-15

## 概要

v0.2.1 preview 向けに、macOS 配布物は ZIP と DMG を併用して試す。

この変更は配布体験の改善が目的であり、Apple Developer ID による署名や notarization を代替するものではない。

## 方針

- ZIP は従来寄せの macOS 配布物として残す。
- DMG は Apple Silicon / arm64 向けに追加する。
- macOS 版は当面、未署名 / 未 notarize の preview 配布として扱う。
- Gatekeeper により「破損しています」「開発元を確認できません」系の警告が出る可能性は残る。

## GitHub Actions の出力

`.github/workflows/build-zips.yml` は `Build Release Packages` として、次の配布物を作る。

| OS | 形式 | arch | release asset |
| --- | --- | --- | --- |
| Windows | ZIP | x64 | `MMD.modoki-windows-x64-<version>.zip` |
| macOS | ZIP | runner default | `MMD.modoki-mac-<version>.zip` |
| macOS | DMG | arm64 | `MMD.modoki-mac-arm64-<version>.dmg` |
| Linux | ZIP | x64 | `MMD.modoki-linux-x64-<version>.zip` |

macOS ZIP は `--arch` を明示せず、macOS runner の通常出力に寄せる。DMG は Apple Silicon 向けの試験配布として `darwin arm64` を明示する。

## 実装メモ

- `@electron-forge/maker-dmg` を追加した。
- `forge.config.ts` に `new MakerDMG({}, ['darwin'])` を追加した。
- `package.json` に `npm run make:dmg` を追加した。
- release workflow は maker / platform / arch / extension を matrix で扱うようにした。
- release publish は ZIP と DMG の両方を GitHub Release asset に添付する。

## 未署名配布の注意

DMG 化しても Gatekeeper の扱いは改善しない。DMG は「Applications にドラッグする」導線を分かりやすくする箱であり、macOS に信頼済みアプリとして認識させる仕組みではない。

リリースノートでは、macOS 版が未署名 / 未 notarize であることを明記する。起動できない場合の暫定手順を書く場合は、信頼できる配布元から取得した場合に限る旨も添える。

例:

```bash
xattr -dr com.apple.quarantine "/Applications/MMD modoki.app"
```

## 今後の選択肢

- preview の間は ZIP / DMG の両方を出し、ユーザー環境での通りやすさを見る。
- 署名が必要になったら、Apple Developer Program 登録、Developer ID Application certificate、notarization 用 secrets、Forge の `osxSign` / `osxNotarize` 設定を別途入れる。
- Intel Mac 向け需要が出た場合は `darwin x64` または universal build を検討する。

## 確認

2026-07-15 時点でローカル確認済み:

- `npm.cmd run lint`
- `npm.cmd run test:unit`
- `npm.cmd run typecheck:critical`

DMG 作成は macOS 専用のため、最終確認は GitHub Actions の macOS runner で行う。
