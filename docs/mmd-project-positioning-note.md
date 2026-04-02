# MMD_modoki 位置づけ・方針メモ

## 概要

このメモは、`MMD_modoki` の位置づけ、優先度の考え方、汎用フォーマット対応の扱いを整理するための方針メモである。

## 方針メモ

- `glTF/GLB`、`OBJ`、`STL` の読み込みは「あれば便利」だが、MMD 代替アプリとしての必須機能ではない
- とくに `GLB` は Babylon に loader があっても、このアプリでは `MMD 前提の scene / WebGPU / WGSL / accessory 拡張` との integration が重く、軽い追加作業では済まなかった
- そのため、汎用 3D フォーマット対応は当面 `低優先` または `保留` 扱いにする
- 既存の `.x` アクセサリ対応は維持しつつ、`GLB` の UI 導線は閉じた状態を維持する

## 位置づけメモ

- このアプリは、現時点では `正規版プロダクト` より `技術的試作 / 実験機` として扱う前提でよい
- そのため、`MIDI`、`ゲームコントローラー`、`実験的シェーダー`、`独自 UI` などの遊びや検証機能は積極的に試してよい
- 一方で、実験機能は本筋の MMD 編集体験を壊しにくいよう、`設定画面` や `Experimental` 的な導線で隔離できる形が望ましい
- 今回の `GLB` 詰まりからも、もし将来 `正規版` を出すなら、現構成の延長より `scene / material / timeline / UI` を含めた再設計のほうが筋がよい
- そのため、このリポジトリでは `完成品化` よりも `知見の蓄積`、`機能検証`、`操作体験の試作` を重視する

## 優先度の見直し

- 最優先は `MMD 本体機能`
- 具体的には `Property / IK を含むタイムライン編集`、`ボーン・カメラのキーフレーム周辺`、`物理の比較と安定化`、`保存/復元や出力の完成度`
- `glTF/GLB`、`OBJ`、`STL`、`.babylon`、Gaussian Splat などの汎用フォーマット対応は、その後の拡張項目として扱う

## 形式ごとの現時点評価

### GLB

- 調査は進めたが、現時点では表示経路の最後で詰まっている
- 入口実装と調査メモはあるので、必要になったら再開できる
- 今は `保留`

### OBJ

- `GLB` より軽い可能性はあるが、`MTL` や texture path 解決で別の手間がある
- 今は `低優先`

### STL

- 静的メッシュ用途なら比較的軽い見込みだが、やはり MMD 本体機能よりは後
- 今は `低優先`

## 直近タスクの再整理

- `Property / IK` のタイムライン編集とプレビュー
- ボーン / カメラのキーフレーム編集まわりの不足分
- 物理モード比較 (`0/1/2`、`disableBidirectionalTransformation` など)
- 保存 / 復元 / 出力まわりの安定化
- 汎用 3D フォーマット対応は、上記が落ち着いてから再開する

## 関連メモ

- [glb-loading-investigation-2026-04-01.md](/d:/DevTools/Projects/MMD_modoki/docs/glb-loading-investigation-2026-04-01.md)
- [generic-object-panel-design.md](/d:/DevTools/Projects/MMD_modoki/docs/generic-object-panel-design.md)
- [mmd-basic-task-checklist.md](/d:/DevTools/Projects/MMD_modoki/docs/mmd-basic-task-checklist.md)
