# 動画書き出し最適化案の比較メモ

更新日: 2026-04-21

## 1. 目的

`WebM` 動画書き出しの高速化余地を整理し、`MMD_modoki` の現状構成に対してどの案が現実的かを比較する。

このメモは「すぐ実装する案」を 1 つに決めるためというより、以下を切り分けるためのものとする。

- 現行経路の延長で改善できる範囲
- 実験機能として隔離したほうがよい案
- 将来的に構成見直しが必要な案

## 2. 現状整理

関連:

- `/home/runner/work/MMD_modoki/MMD_modoki/src/webm-exporter.ts`
- `/home/runner/work/MMD_modoki/MMD_modoki/docs/webm-export-current-spec-2026-03-13.md`
- `/home/runner/work/MMD_modoki/MMD_modoki/docs/webcodecs-api-research.md`
- `/home/runner/work/MMD_modoki/MMD_modoki/docs/webcodecs-mediabunny-webm-research.md`

現行の主経路:

- `RenderTargetTexture`
- `readPixels()`
- `RGBA Uint8Array`
- `VideoSample`
- `VideoSampleSource`
- `WebMOutputFormat + StreamTarget`

現状の重要点:

- 安定性優先で `readPixels()` を採用している
- `canvas -> VideoSample` 系は黒画が出る環境があり不採用
- MediaBunny は `GPUBuffer` / `GPUTexture` を直接受ける層ではない
- したがって「GPU バッファのまま MediaBunny に渡す」は現状のライブラリ選択では難しい

## 3. 比較軸

- 速度改善の見込み
- 黒画 / 色ズレ / フレーム欠落などの回帰リスク
- 実装コスト
- デバッグしやすさ
- MMD 本体機能への影響範囲
- 実験機能として隔離しやすいか

## 4. 案の一覧

### 案A. 現行 `readPixels()` 経路を詰める

内容:

- `RenderTargetTexture` 再利用を維持
- capture / encode の重なりを増やす
- queue 長、進捗更新頻度、待ち方を再調整する
- 出力中の不要な scene 更新や同期をさらに削る
- 計測ログを強化し、render/capture/encode の律速を明確にする

期待できる改善:

- 実装を大きく変えずに数十%程度の改善余地が見込める
- 少なくとも「何が遅いか」を次段の判断材料にできる

利点:

- 現行の安定経路を保てる
- 黒画回帰の危険が低い
- 問題発生時の切り戻しが容易

欠点:

- GPU→CPU readback 自体は残る
- 高解像度 / 高fps では根本改善に限界がある

向いている用途:

- まず短期で体感改善したい
- 実験機能を増やさず既存機能を安定させたい

### 案B. `CanvasSource` / `VideoFrame` ベース経路を再検証する

内容:

- MediaBunny の `CanvasSource` や `VideoFrame` ベース入力を限定条件で再評価する
- 現行の黒画条件を再現し、Electron / Babylon / WebGPU / WebGL の組み合わせ差を切り分ける
- 安定する条件があるなら feature flag で隔離する

期待できる改善:

- CPU 側 RGBA 生成の一部を減らせる可能性がある
- `VideoSample(Uint8Array)` より軽い経路に寄る可能性がある

利点:

- MediaBunny の想定経路に近い
- 実装の見通しは比較的よい

欠点:

- 既知の黒画問題が未解決
- 「GPU バッファのまま」ではなく、実態は canvas / `VideoFrame` 化である
- 環境差で壊れると保守負担が高い

向いている用途:

- 実験機能として隔離した PoC
- 将来 Electron 更新時の再評価

### 案C. GPU readback 周辺だけを最適化する

内容:

- readback を残しつつ、二重 / 三重バッファ化や非同期 readback を検討する
- `readPixels()` 呼び出し時の stall を減らす構成を試す
- Babylon.js / 実行バックエンドが許す範囲で GPU→CPU 転送待ちを隠す

期待できる改善:

- capture 待ち時間の短縮
- render と encode の重なり改善

利点:

- 出力仕様を変えずに速度改善を狙える
- `VideoSampleSource` 側はほぼそのまま使える

欠点:

- Babylon / WebGPU / WebGL 差異に強く依存する
- 効いたとしてもコードの複雑さが増えやすい
- 効果が環境依存になりやすい

向いている用途:

- capture が主律速だと計測で判明した場合
- renderer 側の技術実験として限定導入する場合

### 案D. `WebCodecs VideoEncoder` を前段に出し、MediaBunny には mux を任せる

内容:

- `VideoFrame` を直接 `VideoEncoder` に流す
- 出てきた `EncodedVideoChunk` を packet 化して MediaBunny に渡す
- MediaBunny には mux / 出力形式管理を主に任せる

期待できる改善:

- encode 制御を細かく設計できる
- バックプレッシャーや keyframe 戦略を自前で最適化しやすい

利点:

- 長期的には最も制御性が高い
- MediaBunny の役割を mux 側に絞れる

欠点:

- 実装難度が高い
- timestamp / keyframe / packet 整合の責任が増える
- `VideoFrame` 生成経路が安定しないと前提から崩れる

向いている用途:

- 動画出力を今後も主要機能として伸ばす場合
- 実装負債を受け入れて制御性を取りに行く場合

### 案E. 出力経路を二段化する

内容:

- 標準経路は現行 stable 路線を維持する
- 高速化実験は別 preset / 別フラグで分離する
- `stable` / `experimental` を UI または内部設定で切り替える

期待できる改善:

- 安定機能と実験機能の衝突を避けやすい
- 失敗しやすい経路を本筋から隔離できる

利点:

- このプロジェクトの「試作 / 実験機」方針に合う
- MMD 基本編集体験を壊しにくい

欠点:

- 実装自体の高速化ではない
- 分岐が増え、確認項目が増える

向いている用途:

- 黒画や環境差を抱えたまま段階導入したい場合

## 5. 比較表

| 案 | 速度改善期待 | 安定性 | 実装コスト | 保守コスト | 備考 |
| --- | --- | --- | --- | --- | --- |
| A. 現行経路の改善 | 中 | 高 | 低 | 低 | まず着手しやすい |
| B. Canvas / VideoFrame 再検証 | 中 | 低〜中 | 中 | 中〜高 | 黒画問題の再調査が前提 |
| C. GPU readback 最適化 | 中 | 中 | 中〜高 | 中〜高 | backend 差異に注意 |
| D. WebCodecs 前段化 | 高 | 中 | 高 | 高 | 長期投資向け |
| E. stable / experimental 分離 | 間接的 | 高 | 低〜中 | 中 | 導入戦略として有効 |

## 6. 考察

### 6.1 すぐ着手しやすいのは案A

現行実装はすでに以下を持っている。

- export 専用 window
- reusable capture
- encode queue
- streamed save
- 基本的な性能計測

そのため、まずは案Aで以下を詰めるのが最も安全。

- queue 長の再調整
- capture / encode 並列度の上限見直し
- progress / status 更新の削減
- export 用 import での不要処理削減
- 1080p30 / 1080p60 / 1440p30 での律速測定

これは MMD 本体ワークフローを崩しにくく、回帰時も戻しやすい。

### 6.2 「GPU バッファのまま」は現時点では主案にしにくい

MediaBunny の入力モデルは raw frame / canvas / `VideoFrame` 側であり、`GPUBuffer` / `GPUTexture` を直接受ける設計ではない。

そのため、仮に GPU readback 削減を進めるとしても、実際の論点は

- Babylon 側からどう `VideoFrame` 相当へ渡すか
- その経路が Electron で安定するか

であって、MediaBunny 単体の差し替えでは解決しない。

### 6.3 案Bと案Dは「実験枠」で扱うのが妥当

案Bと案Dは性能余地はあるが、いずれも次のリスクが大きい。

- 黒画
- 環境依存
- timestamp / color / alpha の不整合
- 実装修正時の切り分け難化

このプロジェクトでは MMD 本体機能の安定が優先なので、標準経路の置換として一気に進めるより、feature flag 下の PoC として扱うほうがよい。

### 6.4 案Cは「capture が律速」と確定してからでよい

GPU readback 最適化は魅力があるが、複雑さに対して効果が不確実。

もし実測で

- render は十分速い
- encode も詰まっていない
- capture だけが突出して遅い

と分かった場合に絞って検討するのが妥当。

## 7. 推奨方針

### 第1候補

案Aを本線にする。

- 現行 `readPixels()` 経路の計測と調整
- 安定性維持
- 小さい差分での改善

### 第2候補

案Eを合わせて採用する。

- experimental 経路を標準経路と分離
- `CanvasSource` / `VideoFrame` 経路の再調査先を確保

### 保留候補

案B / 案C / 案D は、次の条件を満たしたら再度優先度を上げる。

- 1080p60 以上で現行経路が明確に不足
- capture 律速が実測で確定
- Electron / Chromium 更新で `VideoFrame` 周辺の安定性が改善

## 8. 次に確認したい項目

- 既存 performanceStats を使った解像度別計測表の作成
- `queue.length >= maxQueueLength` 待ちの発生割合
- `videoSource.add()` 側が律速かどうか
- `readPixels()` 所要時間の分布
- `CanvasSource` / `VideoFrame` 経路の黒画再現条件

## 9. 結論

現時点では、最適化の主戦場は「MediaBunny に GPU バッファをそのまま渡すこと」ではなく、

- 現行 stable 経路をどこまで詰められるか
- `VideoFrame` 系の実験経路を安全に隔離できるか

の 2 点にある。

したがって、当面の現実解は以下。

1. まず案Aで現行経路を詰める
2. 案Eで実験経路を分離する
3. 案B / C / D は実測結果に応じて段階的に再評価する
