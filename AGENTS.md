# AGENTS.md

## 目的

このリポジトリは、`Electron`、`Babylon.js`、`WebGPU` を使った実験的な MMD エディタ / ビューア `MMD_modoki` です。

このプロジェクトは、現時点では `完成された製品` ではなく、`技術的試作 / 実験機` として扱ってください。

このリポジトリでの作業目的は主に以下です。

- アイデアの検証
- MMD の基本編集体験の改善
- 調査結果や知見の記録
- 実験的機能の保存

すべての要望を無理に実装完了まで押し切るのではなく、現在の構造や優先度に照らして、`実装より設計メモや調査記録を残すほうがよい` と判断できる場合はその方針を取ってよいです。

## 現在の優先度

汎用 3D アプリ化より、MMD 本体機能を優先してください。

優先度が高い領域:

- タイムラインとキーフレーム編集
- ボーン / カメラ編集体験
- プロジェクト保存 / 読み込み
- 物理の安定化と比較検証
- 出力の安定性
- MMD 材質向けのシェーダープリセット改善

優先度が低い、または実験寄りの領域:

- 汎用オブジェクト読み込み
- コントローラー連携
- `SQLite WASM` 実験

コアな MMD ワークフローと実験機能が競合する場合は、コア側を優先してください。

## このプロジェクトの位置づけ

- このリポジトリには実験的機能が入っていてよい
- 面白い技術実験は歓迎だが、MMD 編集の本筋を壊しにくい形で扱う
- 実験機能は、できれば設定画面、機能フラグ、明確に分離された導線のいずれかで隔離する
- 将来もし「正規版」を作るなら、現構成を延命するより再設計のほうが妥当な可能性が高い

関連メモ:

- [docs/mmd-project-positioning-note.md](/d:/DevTools/Projects/MMD_modoki/docs/mmd-project-positioning-note.md)
- [docs/mmd-basic-task-checklist.md](/d:/DevTools/Projects/MMD_modoki/docs/mmd-basic-task-checklist.md)

## このリポジトリ固有のルール

- 手動のファイル編集は `apply_patch` を使う
- ユーザーが行った無関係な差分は戻さない
- 明示的な依頼がない限り、大規模リファクタより小さく局所的な修正を優先する
- 挙動変更や重要な知見が出たら、必要に応じて `docs/` にメモを残す
- タスク管理は `docs/mmd-basic-task-checklist.md` に集約する
- 方針メモや位置づけメモはチェックリストと分離して管理する

## 確認コマンド

基本の確認コマンド:

```powershell
npm.cmd run lint
```

コード変更後は、可能な範囲でこれを実行してください。

確認できなかった場合は、その旨を明確に伝えてください。

追加の確認ルール:

- 純ロジック変更では、可能なら `npm.cmd run test:unit` も実行する
- 起動導線、`src/main.ts`、`src/preload.ts`、`src/renderer.ts`、初期化処理、WebGPU 起動条件に関わる変更では、可能なら `npm.cmd run smoke:launch` も実行する
- `smoke:launch` は lint の代替ではなく追加確認として扱う
- `smoke:launch` の成功条件は、Electron が起動し、renderer runtime が初期化され、`engine=WebGPU` まで到達することとする
- `smoke:launch` は UI 操作、描画品質、PMX/VMD 実読み込みの確認までは含まない

## コードベースの主要箇所

- `src/mmd-manager.ts`
  - 中核のランタイム制御
- `src/ui-controller.ts`
  - UI イベントとファイル読み込み導線
- `src/mmd-manager-x-extension.ts`
  - アクセサリ / `.x` 拡張経路
- `src/scene/`
  - 描画、ライト、材質関連
- `docs/`
  - 設計メモ、調査メモ、仕様、タスクリスト

## 影響範囲が広い注意領域

- `WebGPU / WGSL` 周りは副作用が広い
- Babylon の材質 / シェーダー変更は別の描画挙動も壊しやすい
- `.x` アクセサリ処理は PMX/PMD と前提が異なる拡張経路
- 一部の `docs` は文字コードや保守状態に癖があるため、必要以上の大規模書き換えは避ける

関連メモ:

- [docs/sqlite-wasm-experiment-note.md](/d:/DevTools/Projects/MMD_modoki/docs/sqlite-wasm-experiment-note.md)

## ドキュメント運用

大きめの変更を始める前に、まず `docs/` に既存の設計メモや調査メモがないか確認してください。

新しいドキュメントを作るときの方針:

- 特別な理由がなければ、プロジェクト内メモは日本語で書く
- できるだけ 1 ドキュメント 1 トピックにする
- チェックリストを肥大化させるより、必要に応じて別メモを追加する

参照開始点:

- [docs/mmd-basic-task-checklist.md](/d:/DevTools/Projects/MMD_modoki/docs/mmd-basic-task-checklist.md)
- [docs/mmd-project-positioning-note.md](/d:/DevTools/Projects/MMD_modoki/docs/mmd-project-positioning-note.md)
- [docs/timeline-spec.md](/d:/DevTools/Projects/MMD_modoki/docs/timeline-spec.md)
- [docs/physics-runtime-spec.md](/d:/DevTools/Projects/MMD_modoki/docs/physics-runtime-spec.md)

## エージェント向け実務ガイド

- レビュー依頼では、要約より先にバグ、回帰、リスク、欠けているテストを重視する
- 探索的な機能では、無理に fragile な実装を入れるより、設計メモや調査メモを残して止める判断をしてよい
- アーキテクチャ上の摩擦が見えたら、隠さずドキュメントに残す
- 楽観的な言い回しより、制約とトレードオフを明示する
- `src/timeline.ts` は今後の実装の手本として扱う。特に、更新頻度の違う表示をレイヤーごとに分離する、状態変更と描画実行を直結させず更新要求を局所的にスケジュールする、可視範囲だけを描画・計算する、座標計算・選択判定・描画を小さな関数に分ける、という方針を優先する
- タイムライン系や編集系 UI に機能を足すときは、既存ロジックにベタ書きで混ぜず、`timeline.ts` のように追加機能を局所化できるデータ構造・描画関数・更新経路を先に設計する
