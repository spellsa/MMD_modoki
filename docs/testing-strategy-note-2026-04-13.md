# テスト手法導入検討メモ 2026-04-13

## 目的

MMD_modoki に自動テストを段階的に導入するため、候補として挙がっている Vitest / Playwright / Argos の位置づけと導入順を整理する。

現時点の MMD_modoki は、MMD 編集体験そのものの開発がまだ不安定であり、描画・WebGPU・Electron packaging・モデル資産の扱いにも揺れがある。そのため、テスト基盤も一気に大きく入れるのではなく、効果が出やすく副作用の小さいところから始める。

## 結論

導入順は次を推奨する。

1. Vitest
2. Playwright
3. Argos

まず Vitest で純粋ロジックの単体テストを作り、テストを書く習慣と実行導線を整える。

次に Playwright で Electron アプリの smoke test を入れ、起動・初期化・主要 UI 導線の破損を検出できるようにする。

Argos は Playwright のスクリーンショット運用が安定してから検討する。MMD_modoki では GPU / OS / アニメーション / モデル資産の差分が大きく、最初から visual regression を合否基準にするとノイズが多くなる可能性が高い。

## Vitest

Vitest は最初に入れる候補として妥当。

理由:

- Vite 構成と相性がよい
- TypeScript の小さなロジックテストを始めやすい
- Electron / WebGPU / DOM を起動しないテストから始められる
- 失敗時の原因が比較的読みやすい
- CI に載せる場合もコストが低い

最初に狙う対象:

- LUT ファイルの読み込み・正規化
- `src/shared/*` のヘルパー
- タイムラインのフレーム計算
- キーフレーム補間の純粋関数寄りロジック
- プロジェクト保存 / 読み込みの変換ロジック
- `.x` / ファイルパス解決の小さな関数
- ログ設定のパス決定ロジック

避けたい対象:

- Babylon.js の実レンダリング
- WebGPU 初期化
- Electron main / preload / renderer の結合動作
- 実モデル資産を必要とする重いテスト

初期設定案:

```json
{
  "scripts": {
    "test:unit": "vitest run"
  }
}
```

方針:

- 最初は `environment: "node"` で始める
- `jsdom` は必要になるまで入れない
- watch 前提ではなく、まず `vitest run` を確認コマンドとして扱う
- 最初からカバレッジ目標を置かない
- 5-10 本程度の小さなテストで運用感を見る

懸念:

- 既存コードに副作用の強いモジュールが多い場合、import するだけでテストが不安定になる
- Electron / DOM / Babylon に依存する箇所を無理に単体テスト化すると mock が増えすぎる
- テストしやすさを理由に大きなリファクタを始めると、本来の MMD 機能開発を圧迫する

試験導入の第一候補:

- `src/lut-file.ts`

LUT ファイルの parse / normalize は、入力がテキストで完結し、Electron / Babylon.js / WebGPU を起動せずに確認できる。規模も大きすぎず、Vitest の運用感を見る対象としてちょうどよい。

最初に確認したい項目:

- `.cube` / `.3dl` の拡張子判定
- `.cube` の最小正常系
- `.cube` の data length mismatch
- コメント行や空行の扱い
- unsupported extension の異常系

後続の重要対象:

- タイムラインへのキー編集

キー編集は MMD_modoki の根幹機能であり、MMD 代替アプリとして精密に扱う必要があるため、後々は自動テストが必須になる。ただし、仕様や内部構造がまだ変わる可能性が高いので、Vitest 試験導入の最初の対象にはしない。LUT でテスト基盤の負担を見たあと、`src/shared/timeline-helpers.ts` や `src/editor/timeline-edit-service.ts` の小さい単位から段階的に増やす。

## Playwright

Playwright は Electron アプリの起動確認・UI 導線確認に有効。ただし、Vitest より導入コストは高い。

MMD_modoki で狙う価値がある対象:

- アプリが起動する
- 初期画面が表示される
- renderer の初期化エラーで落ちない
- WebGPU が使えない環境でも fallback 導線が出る
- ログ出力が起動時に作られる
- メニューや主要ボタンが最低限反応する
- 代表的なファイル読み込み導線まで到達できる

初期テスト案:

- `test:e2e` として 1-2 本だけ追加
- packaged app ではなく開発起動を対象にするか、packaged app を対象にするかを先に決める
- 最初はスクリーンショット比較を合否条件にしない
- スクリーンショットは失敗時の調査 artifact として保存する

懸念:

- Electron support は通常のブラウザ E2E より壊れやすい可能性がある
- WebGPU / GPU driver / OS 差分で描画結果が揺れる
- 開発サーバー、Electron Forge、Playwright の起動順制御が必要になる
- テスト時間が伸びやすい
- CI で GUI / GPU / headless 周りの設定が必要になる

当面の方針:

- Vitest の導入後に検討する
- 最初は smoke test だけにする
- 3D 描画のピクセル一致は狙わない
- Playwright を CI 必須にするのは、ローカル運用が安定してからにする

## Argos

Argos は visual regression testing の候補。MMD_modoki の将来的な描画回帰検出には相性がよい。

特に相性がよい領域:

- 材質の消失
- 床や影の欠け
- カメラ距離による clipping 問題
- SSAO / DoF / self shadow / toon 表現の見た目差分
- UI レイアウト崩れ

ただし、現時点では導入を急がない。

理由:

- Playwright のスクリーンショット取得が安定していないと Argos の差分も安定しない
- GPU / OS / driver 差分で false positive が増えやすい
- アニメーションや物理演算はフレーム固定・乱数・時間制御が必要
- MMD モデル / モーション資産の権利確認が必要
- 外部サービスへスクリーンショットを送る場合、ユーザー提供データを含めない運用が必要
- CI secret / PR 権限 / fork PR の扱いを決める必要がある

導入する場合の制約:

- Argos に送る画像は、配布可能なテスト用資産だけに限定する
- ユーザー提供 PMX / VMD / テクスチャ / スクリーンショットは外部サービスに送らない
- CI でのみ upload する
- ローカルではスクリーンショット保存だけにする
- 最初は UI の静的画面か、固定カメラ・固定フレームの小さい scene だけを対象にする

## 推奨ロードマップ

### Phase 1: Vitest 最小導入

やること:

- [x] `vitest` を devDependencies に追加
- [x] `test:unit` script を追加
- [x] Node environment の単体テストから始める
- [x] LUT ファイルの読み込み・正規化に小さなテストを追加する

完了条件:

- [x] `npm.cmd run test:unit` が通る
- [x] `npm.cmd run lint` と併用しても運用負荷が大きすぎない
- [x] テストのためだけの大きなリファクタをしていない

2026-04-13 時点の実装:

- `vitest@2.1.9` を devDependency に追加
- 既存の `vite@5.4.21` に合わせて、Vitest 2 系を選択
- `npm.cmd run test:unit` を追加
- `src/lut-file.test.ts` を追加
- `.cube` / `.3dl` の判定、`.3dl` passthrough、最小 `.cube` 変換、data length mismatch、unsupported extension、empty content を確認
- `jsdom` / Playwright / Argos / coverage は未導入

補足:

この環境では sandbox 内の `npm.cmd run test:unit` が Vite の Windows realpath 処理に伴う `spawn EPERM` で失敗した。sandbox 外では `6 tests` が通った。通常のローカル開発環境では `npm.cmd run test:unit` を使う。

### テストファイル配置

現時点では、単体テスト用の `test/` フォルダは作らない。

単体テストは、実装ファイルの隣に置く colocated test を基本にする。

例:

```text
src/lut-file.ts
src/lut-file.test.ts

src/shared/timeline-helpers.ts
src/shared/timeline-helpers.test.ts
```

理由:

- 対象コードとテストの対応が分かりやすい
- 小規模な単体テストでは専用ディレクトリより追いやすい
- テスト配置ルールを増やしすぎずに済む
- 今の段階で空の `test/` フォルダだけ作っても運用上の価値が薄い

`test/` フォルダを作るタイミング:

- 共通 fixture が増えたとき
- テスト用 helper が複数テストから共有されるようになったとき
- Playwright などの E2E テストを導入するとき
- 権利確認済みのテスト資産を管理する必要が出たとき

将来の配置案:

```text
test/fixtures/
test/helpers/
test/e2e/
test/assets/
```

注意:

`test/assets/` を作る場合は、MMD モデル / モーション / テクスチャ / スクリーンショットの権利を確認する。ユーザー提供データや権利不明資産は含めない。

### Phase 2: Playwright 調査

やること:

- Electron 起動方式を調査する
- 開発起動と packaged app 起動のどちらを主対象にするか決める
- smoke test の対象画面を決める
- 失敗時 artifact の保存場所を決める

完了条件:

- ローカルで Electron が Playwright から起動できる
- 初期画面表示までの smoke test が 1 本通る
- CI 必須化するかどうかの判断材料がそろう

### Phase 3: Argos 事前設計

やること:

- visual regression に使える安全なテスト資産を決める
- スクリーンショットを外部サービスへ送ってよい範囲を決める
- CI secret の扱いを決める
- false positive を減らすための固定条件を決める

完了条件:

- Argos に送る画像に権利不明資産が含まれない
- Playwright のスクリーンショットが安定している
- visual regression の失敗を release blocker にするか、参考情報にするかが決まっている

## 現時点のおすすめ

現時点で導入済みの自動テストは Vitest の最小構成だけに留める。

Playwright と Argos は価値が高いが、MMD_modoki では描画・GPU・資産管理の揺れが大きい。先に Vitest で軽い単体テストを作り、次に Playwright の smoke test、最後に Argos の visual regression へ進むのが現実的。

## 参照

- [Vitest](https://vitest.dev/)
- [Playwright Electron](https://playwright.dev/docs/api/class-electron)
- [Argos Visual Testing](https://argos-ci.com/visual-testing)
