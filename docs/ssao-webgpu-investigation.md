# SSAO 調査メモ（WebGPU）

最終更新: 2026-03-03

## 目的

WebGPU モードで SSAO を扱う際の制約と、`MMD_modoki` での試行結果を記録し、同じ沼にはまらないための運用メモとして残す。

## 対象環境

- Babylon.js `v8.45.3`
- WebGPU renderer（compatibility / WGSL-first）
- 対象コード:
  - `src/mmd-manager.ts`
  - `applySsaoSettings()`
  - `hasPrePassRendererSupport()`

## 事象（要点）

- WebGPU で Babylon 標準の SSAO2（PrePass 依存）を使おうとすると、環境によって初期化/実行が失敗する。
- 代表的な失敗ログ:
  - `scene.enablePrePassRenderer is not a function`
  - `this._getEngine(...).createMultipleRenderTarget is not a function`
  - `PrePassRenderTarget._createInternalTextures ... createMultipleRenderTarget is not a function`

## 原因整理

1. SSAO2RenderingPipeline は PrePass + MRT 依存。
2. ただし Babylon 8.45.3 の WebGPU compatibility では、API が見えていても MRT 経路が実行時に破綻するケースがある。
3. そのため「WebGPU では PrePass を使わない」前提で制御しないと不安定化しやすい。

## 現行実装の方針

- `hasPrePassRendererSupport()` で WebGPU を強制 `false` 扱いにしている。
  - WebGPU 時は PrePass を使わず、SSAO2 を無効化。
- `applySsaoSettings()` は以下の順で処理:
  1. 可能な場合のみ SSAO2 pipeline を試行（WebGPUでは基本通らない）
  2. 失敗または非対応時はスクリーンスペース AO フォールバックへ移行
  3. フォールバックも depth が取れなければ SSAO 自体を無効化

## フォールバック実装（現状）

- `mmdSimpleSsao`（GLSL/WGSL 両対応）を `PostProcess` として適用。
- 入力:
  - color buffer
  - depth map（DepthRenderer）
- 手法:
  - 深度差ベースの近傍サンプリング
  - 大きな深度差を棄却するゲート
  - 深度ガイド付きぼかし（近距離/遠距離で半径調整）
  - ワールド距離フェード（`worldFadeMeters`）

## 問題として残った点

- 遠景で縞/モアレが出やすい。
- 背景側に AO が乗りすぎるケースがある。
- キャラ接触部は改善しても、遠景破綻とのトレードオフが強い。

## いまの運用判断

- UI は安定性優先で SSAO を一時非表示。
- Backlog では `FX-200A Contact AO（WGSL）` として再設計する。
  - 「閉所/接触寄り」に寄せる
  - 大段差は棄却
  - 遠方は透明度で強く減衰（10m目安で 0）

## 再挑戦時チェックリスト

1. WebGPU で PrePass 経路を使わない（SSAO2前提に戻さない）。
2. AO は半解像度 + 深度ガイド blur を前提にする。
3. 距離減衰は「本数」ではなく「最終透明度」で制御する。
4. 遠景抑制の閾値をシーンスケールで調整可能にする（例: fade start/end）。
5. UI は単項目フェーダー中心（まずは強度のみ）で公開する。

## 補足

- SSR など他 PrePass/MRT 依存系も同系統の問題を起こしうるため、WebGPU では同様に慎重運用する。
