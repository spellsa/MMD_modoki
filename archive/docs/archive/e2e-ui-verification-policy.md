切り出し元: AGENTS.md / 切り出し日: 2026-08-04

## E2E / UI 動作確認方針

UI を実際に動かさないと確認しづらい変更では、Playwright Electron E2E、現行の `smoke:launch`、必要に応じた手動確認で補ってください。

現行で使える確認:

- 既存の `smoke:launch`
- `npm.cmd run test:e2e`（対象を絞る場合は `npm.cmd run test:e2e -- <spec名>`）
- 必要に応じた手動確認チェックリスト

確認したい対象:

- HTML / CSS メニューバーの表示
- popup / dialog / drawer の表示
- Model Mode / Camera Mode の切替
- 下パネルや Effect panel の表示切替
- Help / Keyboard Shortcuts / Preferences / Export Settings の表示
- 初期 disabled 状態や `canUndo` / `canRedo` 表示
- locale 切替後のメニュー / dialog 文言
- アプリだけで完結する UI 導線

無理に自動確認しない対象:

- 実 PMX / PMD / VMD 読み込みの品質
- ボーン操作やカメラ操作の手触り
- WebGPU 描画品質
- 物理挙動の品質
- OS のファイルダイアログそのもの

方針:

- UI 動作確認は `lint` / `test:unit` / `smoke:launch` の代替ではなく追加確認として扱う。
- Playwright は role / label を優先し、独自widgetだけ `data-testid` を使う。固定 `sleep` ではなく観測可能なready / stateを待つ。
- E2E専用hookは明示的なtest modeだけで公開し、productionへ出さない。
- Babylon runtimeは途中状態ではなく、skeleton評価後に描画へ使われるfinal matrixを検証する。
- 自動化できない UI 導線は、手動確認結果を `docs/` に残すだけでもよい。
- file dialog は直接自動操作の対象にしない。
- 実装時の詳細は [Playwright Electron E2E 実装・運用ガイド](./playwright-electron-e2e-operation-guide.md)、導入経緯は [Playwright Electron ローカル E2E 導入検討](./playwright-electron-local-e2e-investigation-2026-08-02.md) を参照する。
