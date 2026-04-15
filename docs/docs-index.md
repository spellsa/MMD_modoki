# ドキュメントリンク集

`MMD_modoki` のドキュメントを用途別に整理した一覧です。

## まず読む

- [Docs 入口](./README.md)
- [アーキテクチャ概要](./architecture.md)
- [MmdManager 解説](./mmd-manager.md)
- [UI と操作フロー](./ui-flow.md)
- [トラブルシュート](./troubleshooting.md)

## レンダリング / エフェクト

- [影仕様と実装](./shadow-spec.md)
- [光・影実装メモ（Toon分離 + フラット光）](./light-shadow-implementation.md)
- [PMX 顔描画崩れの原因仮説メモ](./face-render-corruption-investigation.md)
- [WebGPU 不発 / 平坦化の調査メモ](./webgpu-not-working-investigation.md)
- [ポストエフェクト拡充バックログ](./post-effects-backlog.md)
- [SSAO 調査メモ（WebGPU）](./ssao-webgpu-investigation.md)
- [SSAO 現行仕様（2026-03-07）](./ssao-current-spec.md)
- [LensRenderingPipeline 実装ガイド](./lens-rendering-pipeline-guide.md)
- [Babylon Editor DoF 調査](./babylon-editor-dof-research.md)
- [WebGPU / WGSL 実現可能性メモ](./webgpu-wgsl-feasibility.md)
- [LUT / WGSL 外部ファイル運用仕様](./lut-wgsl-file-handling.md)
- [現行MMD AutoLuminous 調査メモ](./mmd-autoluminous-research.md)

## カメラ / タイムライン / キーフレーム

- [カメラ実装仕様](./camera-implementation-spec.md)
- [カメラ用ポストエフェクト現行仕様](./camera-postfx-current-spec.md)
- [カメラVMD対応メモ](./camera-vmd.md)
- [タイムライン仕様](./timeline-spec.md)
- [Undo / Redo 検討メモ](./undo-redo-investigation.md)
- [タイムライン データフロー](./data-flow-timeline.md)
- [編集状態遷移メモ](./edit-state-machine.md)
- [キーフレーム保存仕様](./keyframe-storage-spec.md)
- [補間カーブ仕様と実装](./interpolation-curve-spec-implementation.md)
- [MMD 補間カーブ調査](./mmd-interpolation-curve-research.md)
- [MMD キーフレーム / ボーン / 補間調査](./mmd-keyframe-bone-interpolation-research.md)
- [MMD ショートカット調査](./mmd-shortcuts-research.md)
- [VMD / VPD 読み込み挙動](./import-behavior-vmd-vpd.md)
- [再生・シーク・物理ポリシー](./playback-seek-physics-policy.md)
- [ボーン操作仕様](./bone-operation-spec.md)

## 物理

- [物理ランタイム仕様](./physics-runtime-spec.md)
- [v0.1.1 物理 backend 変更メモ](./physics-backend-migration-v0.1.1.md)
- [物理演算タスクリスト](./physics-task-list.md)
- [MMD基本タスクチェックリスト](./mmd-basic-task-checklist.md)
- [babylon-mmd 物理調査](./babylon-mmd-physics-research.md)

## 出力 / エンコード

- [PNG 連番出力仕様](./png-sequence-export-spec.md)
- [WebCodecs API 調査](./webcodecs-api-research.md)
- [WebCodecs + MediaBunny WebM 調査](./webcodecs-mediabunny-webm-research.md)
- [WebM 出力 現行仕様 / 実装](./webm-export-current-spec-2026-03-13.md)

## 品質 / 運用

- [手動テストチェックリスト](./manual-test-checklist.md)
- [既知の問題](./known-issues.md)
- [v0.1.1 フィードバック台帳](./v0.1.1-feedback.md)
- [v0.1.0 フィードバック台帳](./v0.1.0-feedback.md)
- [リリース手順メモ](./release-process.md)
- [文字コード運用メモ](./dev-notes-encoding.md)
- [テスト導入提案](./testing-strategy-proposal.md)
- [Electron 起動確認自動化 調査メモ](./electron-launch-test-investigation.md)
- [Electron ローカル起動スモークテスト方針](./electron-local-smoke-test-plan.md)
- [コードレビュー 2026-04](./code-review-2026-04.md)
- [ui-controller.ts 分割方針メモ](./ui-controller-split-plan.md)

## WGSL
- [WGSL シェーダーでできること / できないこと](./wgsl-shader-capabilities.md)

## GI
- [Babylon RSM GI メモ](./babylon-rsm-gi-notes.md)

## 追加ドキュメント
この節には、もともとの index に入っていなかった文書をまとめる。

- [依存関係ブートストラップメモ](./dependency-bootstrap-2026-03-13.md)
- [ライト / フェイス回りの調査メモ](./full-light-face-investigation-2026-03-13.md)
- [重いモデルの読み込みメモ](./heavy-model-loading.md)
- [キー登録表示の調査メモ](./keyframe-registration-display-research.md)
- [モデル透過の調査メモ](./model-transparency-investigation.md)
- [MMD キーフレーム機能の整理メモ](./mmd-keyframe-features-survey.md)
- [MMD Manager 分割計画](./mmd-manager-split-plan.md)
- [セルフ影の横縞メモ](./self-shadow-horizontal-banding-note.md)
- [影品質の調査メモ](./shadow-quality-investigation.md)
- [Viewport 見た目調整メモ](./viewport-visual-polish-2026-03-13.md)
