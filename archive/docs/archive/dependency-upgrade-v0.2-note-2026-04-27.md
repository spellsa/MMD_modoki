# v0.2 依存更新メモ 2026-04-27

## 目的

v0.1 系は安定化とバグ修正を優先し、v0.2 系では Babylon.js など描画・MMD ランタイム周辺の依存更新を別ブランチで検証する。

作業ブランチ:

- `work/v0.2-dependency-upgrade`

## 初期確認

`npm.cmd outdated` では、主に以下が更新候補として見えた。

| package | current | latest | メモ |
| --- | ---: | ---: | --- |
| `@babylonjs/core` | `8.45.3` | `9.4.1` | v0.2 側で検証する主対象。初期検証は babylon-mmd の検証済みベースに寄せて 9.2.0 を使う |
| `@babylonjs/gui` | `8.45.3` | `9.4.1` | Babylon 本体と合わせる。初期検証は 9.2.0 |
| `@babylonjs/loaders` | `8.45.3` | `9.4.1` | Babylon 本体と合わせる。初期検証は 9.2.0 |
| `babylon-mmd` | `1.1.0` | `1.2.0` | `@babylonjs/core@^9.2.0` が peer dependency |
| `electron` | `40.4.1` | `41.3.0` | 別段階で検証する |
| `vite` | `5.4.21` | `8.0.10` | major update。Electron Forge との相性確認が必要 |
| `vitest` | `2.1.9` | `4.1.5` | Vite 更新と絡めて検証する |

`npm.cmd audit --omit=dev` は 0 vulnerabilities。

dev 依存を含む `npm.cmd audit` は 47 vulnerabilities。主な対象は Electron、Vite、Electron Forge 周辺の開発・ビルド経路。

## 2026-04-27 実施分

まず Babylon と babylon-mmd の互換ペアだけを更新した。

- `@babylonjs/core`: `8.45.3` -> `9.2.0`
- `@babylonjs/gui`: `8.45.3` -> `9.2.0`
- `@babylonjs/loaders`: `8.45.3` -> `9.2.0`
- `babylon-mmd`: `1.1.0` -> `1.2.0`

Babylon 系は従来どおり exact pin とし、`babylon-mmd` は既存指定に合わせて caret range のままにした。最初は `babylon-mmd@1.2.0` の検証済みベースに寄せるため、最新の `9.4.1` ではなく `9.2.0` を使う。

`babylon-mmd@1.2.0` の changelog で v0.2 向けに関係が大きい点:

- Babylon.js 9.2.0 の skinning shader 変更に合わせた outline renderer 対応
- 最低要求 Babylon.js が 9.2.0 に変更
- `ArrayBufferView` からのモデル読み込み修正
- `MmdWasmModel` の bone flag sanity check 修正
- Disposable pattern の見直し
- Rust 2024 / LLVM 22 への更新

v0.2 では、これに加えて既存計画の `MmdWasmInstanceTypeMPR` / Worker 物理対応を主対象にする。

## 確認結果

実行済み:

```powershell
npm.cmd run lint
npm.cmd run test:unit
npm.cmd run package
npm.cmd run smoke:launch
```

結果:

- lint は既存 warning のみで error なし
- unit test は 31 件成功
- package は Windows x64 向けに成功
- smoke は Electron 起動、renderer runtime 初期化、`engine=WebGPU` 到達まで成功

追加の手動確認:

- 既存プロジェクトファイルから読み込み
- モデル表示とダンスモーション再生

結果:

- 目立つ問題なし

## 次に分けて見る候補

- PMX / VMD 実読み込みで描画・モーション・物理の回帰確認
- 材質プリセット、WGSL、LuminousGlow、SSAO、WebM 出力の手動確認
- `electron` 40.4.1 -> 41.3.0 の検証
- `vite` 5 -> 8 と `vitest` 2 -> 4 の検証
- `@electron/fuses` は `@electron-forge/plugin-fuses@7.11.1` が `^1.0.0` を peer dependency にしているため、2 系へ上げる場合は Forge 側の対応状況を先に確認する
