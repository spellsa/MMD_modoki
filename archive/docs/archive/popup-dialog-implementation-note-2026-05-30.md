# ポップアップ実装結果メモ 2026-05-30

## 目的

v0.2 UI 再設計の一部として、メニューバーから詳細設定を開くための共通ポップアップ基盤と、最初の具体例として WebM 動画出力設定ポップアップを実装した。

今回の目的は、下パネルに増え続けていた出力欄の機能をすぐ削除せず、既存 DOM / Action と同期しながら popup 化すること。

## 実装した基盤

### `PopupDialogController`

追加ファイル:

- `src/ui/popup-dialog-controller.ts`

役割:

- modal host の生成
- `open()` / `close()`
- `Esc` close
- close button
- backdrop click
- focus restore
- `canClose()` の尊重

現時点では `surface: "modal"` のみ対応する。
drawer / popover はまだ実装しないが、型名は将来拡張しやすい名前にした。

新しい popup を開く前にも `canClose()` を確認する。
将来、未保存変更や出力中ロックを持つ popup を追加したときに、別 popup の open で中身を強制差し替えしないため。

### `PopupContentController`

最小 interface:

```ts
type PopupContentController = {
    mount(container: HTMLElement): void;
    unmount?(): void;
    refreshLocale?(): void;
    canClose?(): boolean;
};
```

初回実装では、開いている最中の言語変更への完全追従はしない。
開き直せば最新言語になる扱い。

### popup form helper

追加ファイル:

- `src/ui/popup-form-helpers.ts`

追加 helper:

- `createPopupFormField`
- `createPopupFormInline`
- `createPopupFormButton`

今回決めたコンパクトな popup form の基本形を、後続の背景設定 / 重力設定 / エッジ設定 popup でも再利用するための薄い helper。

## WebM 動画出力設定 popup

追加ファイル:

- `src/ui/webm-export-dialog-controller.ts`

追加 menu command:

- `file.webmExportSettings`

File メニューに `動画出力設定...` を追加した。
既存の `WebM出力...` は残した。

初回対象は WebM のみ。
PNG / PNG 連番は既存導線を維持する。

## WebM popup の入力項目

実装済み:

- 比率
- 長辺
- サイズ
- FPS
- 音声あり
- 再生範囲を使う
- 出力フレーム範囲
- capture mode

出力フレーム範囲は既存 `output-start-frame` / `output-end-frame` と同期する。
`再生範囲を使う` が OFF のときは popup 側の範囲入力も disabled にする。

入力変更時は既存 DOM に同期し、既存 Action を使う:

- `output.applyPreset`
- `output.syncDimension`
- `output.markFrameRangeCustomized`
- `output.sanitizeFrameRange`
- `project.exportWebm`

Undo / Redo 対象にはしない。

## 既存 DOM との関係

初回実装では下パネルの `output-section` は削除しない。

理由:

- 既存 `ExportUiController` が出力設定の source of truth として DOM を読んでいる。
- popup 初回実装で export 処理まで大きく移設するとリスクが高い。
- まず popup 入力を既存 DOM に同期し、既存 Action / 保存ダイアログ / 出力処理をそのまま使う。

将来、出力設定の専用 state を `ExportUiController` 側に寄せられたら、下パネルの `output-section` は非表示化または削除を検討する。

## UI 方針

popup は「設定小窓」として扱う。
画面中央の大きな編集画面にはしない。

今回決めた基本:

- WebM 出力設定は `size: "sm"`。
- 項目は基本 1 項目 1 行。
- ラベル左、入力右のコンパクト配置。
- 幅 x 高さ、開始 - 終了のような同一項目内のペア入力だけ inline row にする。
- select / option / checkbox / scrollbar は dark UI に合わせて明示的にスタイルする。
- フォーム部品は `.popup-form-*` 系 class に集約する。

## メニューバー調整

今回あわせて実施した調整:

- `モーションキャプチャ` メニューは削除した。
  - v0.2.0 時点では Coming soon のみで幅を取るため。
- メニューバー領域に薄いグレー背景と控えめな境界線を追加した。
  - Electron native menu ではなく HTML / CSS 製の renderer UI として維持する。
  - 既存 i18n の仕組みを使えることを優先する。

## WGSL shader import の付随修正

モデル読み込み時に viewport が真っ暗になる問題を確認した。

原因:

- 未 import の WGSL shader request が Vite dev server の HTML fallback を受け取り、`text/html` の `index.html` を WGSL として parse していた。
- ログでは `src/ShadersWGSL/textureAlphaChecker.*.fx` と `src/ShadersWGSL/shadowMap.fragment.fx` が該当した。

対応:

- `src/mmd-manager.ts` に side-effect import を追加。
- `babylon-mmd/esm/Loader/ShadersWGSL/textureAlphaChecker.vertex`
- `babylon-mmd/esm/Loader/ShadersWGSL/textureAlphaChecker.fragment`
- `@babylonjs/core/ShadersWGSL/shadowMap.vertex`
- `@babylonjs/core/ShadersWGSL/shadowMap.fragment`

今後も `src/ShadersWGSL/*.fx` が `text/html` として返る場合は、同じく必要な Babylon / babylon-mmd WGSL shader の side-effect import 漏れを疑う。

## 確認結果

実行済み:

```powershell
npm.cmd run lint
npm.cmd run test:unit
npm.cmd run smoke:launch
```

結果:

- lint: 成功。既存 warning のみ。
- unit: 成功。96 tests。
- smoke: Electron / WebGPU 起動 OK。
- 手動確認: WebM 動画出力 popup から実際の動画出力まで到達。
- 手動確認: モデル読み込み時の黒画面問題は解消。

## 後続候補

- 背景設定 popup
- 重力設定 / 物理演算設定 popup
- モデルエッジ設定 popup
- Preferences popup の実体化
- PNG / PNG 連番を出力設定 popup に統合するか、別の簡易 popup にするか判断する
- 下パネル `output-section` をいつ非表示化 / 削除するか判断する
- popup / dialog 操作の E2E 確認を Playwright Electron または既存 smoke 拡張で検討する
