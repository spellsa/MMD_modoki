# Babylon.js Playground 用の最小再現

このフォルダは、`MMD_modoki` 本体から Babylon.js 側の問題を切り離して確認するためのものです。
ここに置くコードは、原則として [Babylon.js Playground](https://playground.babylonjs.com/) の
JavaScript欄へそのまま貼り付けられる形にします。

## 目的

- Babylon.jsへ不具合報告する前に、素のBabylon.jsでも再現するか確認する
- WebGL2とWebGPUの差を同じコードで比較する
- MMDモデル、babylon-mmd、Electron、Frame Graph、独自Material Pluginの影響を分離する
- 投稿したPlaygroundのURLと確認結果をリポジトリ内に残す

## 運用ルール

1. 1フォルダにつき1症状にする
2. 最初はBabylon.jsの標準プリミティブと標準材質だけを使う
3. 外部アセットが必要な場合は、Babylon.js公式アセットか再配布可能な小さいデータだけを使う
4. `MMD_modoki`の独自シェーダーパッチを最小再現へコピーしない
5. WebGL2とWebGPUを同じPlaygroundリビジョンで確認する
6. リポジトリで使用中のBabylon.jsと、Playgroundの現行版の両方で結果を記録する
7. 独立した症状を一つのフォーラム投稿へまとめない

## 現在の再現候補

- [`pbr-skin-sss-webgpu`](./pbr-skin-sss-webgpu/README.md)
  - PBRMaterialのscreen-space SSSがWebGPUで赤黒く見える問題
  - WebGL2、WebGPU、SSS有効、SSS無効を比較する
- [`pbr-skin-sss-frame-graph-webgpu`](./pbr-skin-sss-frame-graph-webgpu/README.md)
  - PrePass SSSと中間RenderTarget、Frame Graphの混成経路を比較する
  - Direct、Frame Graph copy、Frame Graph Image Processingを切り替える

フォーラム投稿の下書きには
[`templates/forum-report.md`](./templates/forum-report.md)を使います。

## Playgroundへ載せる手順

1. 対象フォルダの`playground.js`をBabylon.js Playgroundへ貼り付ける
   - 現行Playgroundはモジュール形式のため、先頭の`export const createScene = ...`も含めて貼り付ける
2. 通常URLでWebGL2を確認する
3. URLへ`?webgpu`を付けてWebGPUを確認する
4. コンソールのBabylon.jsバージョン、backend、GPU情報を保存する
5. Playgroundを保存し、生成されたURLを対象フォルダのREADMEへ記録する
6. スクリーンショットは同じカメラ、同じ設定で撮る

## 判定

- 素の最新Babylon.jsでWebGPUだけ壊れる: Babylon.js側の不具合候補
- WebGL2とWebGPUの両方で同じ: API設定やシーンスケールを再確認する
- Playgroundでは正常で`MMD_modoki`だけ壊れる: アプリ側の統合問題として扱う
- リポジトリの9.2.0だけ壊れ、現行Playgroundでは正常: 修正済みかバージョン差の可能性が高い
