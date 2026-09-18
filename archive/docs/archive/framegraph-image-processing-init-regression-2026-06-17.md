# FrameGraph ImageProcessing 初期化順 再発防止メモ 2026-06-17

## 概要

FrameGraph backend が有効な状態でアプリを起動し、モデルを読み込むと、モデル欄だけ描画色が濃く見える問題が発生した。

見た目としては、PostFX を明示的に有効化していないにもかかわらず、彩度またはコントラストが強くなったような表示になった。
一度カメラ欄へ切り替えてからモデル欄へ戻すと正常な色へ戻るため、モデル材質そのものよりも、起動直後の描画 backend / ImageProcessing 初期化順が疑わしい状態だった。

## 症状

- アプリ起動直後、モデル欄で PMX モデルの色が濃い
- カメラ欄へ切り替えてからモデル欄へ戻すと正常な色になる
- FrameGraph の効果を追加しても、濃い状態のまま効果が乗る場合があった
- PostFX の値はニュートラルに見える
  - contrast: 1
  - exposure: 1
  - LUT / Bloom / Luminous: 無効
- active FrameGraph effects は空でも発生した

## 原因

`DefaultRenderingPipeline` の生成や ImageProcessing 経路の初期化により、`scene.imageProcessingConfiguration.applyByPostProcess` が `true` になったまま残ることがあった。

FrameGraph backend では、画像処理を FrameGraph task 側で扱う前提のため、効果が無効な状態では scene 側の ImageProcessing を post process として適用しない必要がある。

しかし、FrameGraph backend の初期化直後に `postEffectBackend = "frameGraph"` が確定しても、`applyImageProcessingSettings()` が再実行されていなかった。
そのため、起動直後だけ `applyByPostProcess: true` が残り、モデル表示が濃く見えた。

カメラ欄とモデル欄を切り替えた後に直っていたのは、UI / backend 再同期経路で `applyImageProcessingSettings()` 相当の状態正規化が走り、`applyByPostProcess: false` に戻っていたためと考えられる。

## 修正方針

### FrameGraph backend では ImageProcessing 適用を明示する

`src/render/post-process-controller.ts` の `applyImageProcessingSettings()` では、FrameGraph backend の場合に以下を明示する。

```ts
imageProcessing.isEnabled = shouldEnable;
imageProcessing.applyByPostProcess = shouldEnable;
```

これにより、FrameGraph backend で画像処理効果が不要な場合は、scene 側 ImageProcessing を完全に無効化する。

### FrameGraph backend 確定後に ImageProcessing を再適用する

`src/mmd-manager.ts` の FrameGraph backend 初期化では、`postEffectBackend` を `frameGraph` / `classic` に確定した直後に `applyImageProcessingSettings()` を呼ぶ。

```ts
this.postEffectBackend = activated ? "frameGraph" : "classic";
this.applyImageProcessingSettings();
```

`applyImageProcessingSettings()` は `postEffectBackend` を見て分岐するため、backend 確定前ではなく、確定後に呼ぶことが重要。

## ログで見るべき値

`mmd_modoki.debug.postfx=1` を有効にすると、`render diagnostics` に以下が出る。

```js
localStorage.setItem("mmd_modoki.debug.postfx", "1")
```

確認コマンド:

```powershell
npm.cmd run log:tail
node scripts/show-app-log.mjs --latest-session --scope render --lines 300
```

正常な状態では、FrameGraph backend かつ PostFX 無効時に次のようになる。

```text
postEffectBackend: 'frameGraph'
shouldExecuteFrameGraphPostEffects: false
activeFrameGraphEffects: []
sceneImageProcessing: {
  isEnabled: false,
  applyByPostProcess: false,
  contrast: 1,
  exposure: 1,
  toneMappingEnabled: false
}
cameraCustomRenderTargets: []
```

再発時に疑う値:

```text
sceneImageProcessing.applyByPostProcess: true
```

特に `activeFrameGraphEffects: []` なのに `applyByPostProcess: true` の場合は、今回と同系統の初期化順バグを疑う。

## 再発防止ルール

- FrameGraph backend と Classic backend の切替では、UI 表示だけでなく `scene.imageProcessingConfiguration` も必ず正規化する
- `DefaultRenderingPipeline` を作成・再作成した後は、ImageProcessing の状態が Babylon 側で変わる可能性を疑う
- `postEffectBackend` を変更した直後は、`applyImageProcessingSettings()` を再実行する
- FrameGraph backend で active effects が空の場合は、scene color RT / ImageProcessing / customRenderTargets が不要に残っていないか確認する
- 「モデル欄だけ濃い」「カメラ欄経由で直る」など UI target 切替で直る描画問題は、材質よりも backend state の初期化順を先に見る
- 診断ログは本体動作を壊さないよう、例外を握りつぶさず `render diagnostics failed` として warning に落とす

## 確認観点

手動確認:

- FrameGraph backend 有効、PostFX stack 空で起動する
- PMX モデルを読み込む
- モデル欄の色が起動直後から正常である
- カメラ欄へ切り替えて戻しても色が変わらない
- Luminous / Bloom / LUT などを追加した場合だけ FrameGraph PostFX が実行される

コマンド確認:

```powershell
npm.cmd run lint
```

必要に応じて:

```powershell
npm.cmd run log:errors
```

## 関連ファイル

- `src/mmd-manager.ts`
  - FrameGraph backend 確定後の `applyImageProcessingSettings()`
  - `render diagnostics`
  - FrameGraph scene color RT の custom render target 同期
- `src/render/post-process-controller.ts`
  - FrameGraph backend 時の `imageProcessing.isEnabled`
  - FrameGraph backend 時の `imageProcessing.applyByPostProcess`
- `src/assets/model-asset-service.ts`
  - モデル読込後の FrameGraph backend 再同期

