# Frame Graph post effects 進捗メモ 2026-04-28

## 目的

v0.2 で、既存の Classic post process 経路を残したまま、カメラ用ポストエフェクトを段階的に Frame Graph backend へ移す。

現時点の基本方針:

- Classic backend は安定経路として残す。
- Frame Graph backend は実験経路として、PostFX 欄の backend ドロップダウンから選ぶ。
- Frame Graph 側では、移行済み / 検証中の項目だけを UI に出す。
- 一気に全エフェクトを移さず、1 pass ずつ白化・解像度・出力・UI 反映を確認する。

## 現在の実装状態

主な変更箇所:

- `src/mmd-manager.ts`
  - Frame Graph backend 用の独立 scene color RT を作成する。
  - RT は `camera.customRenderTargets` に登録する。
  - RT の描画対象は `getCustomRenderList = () => scene.meshes` で明示する。
  - RT サイズは `{ ratio: 1 }` ではなく、`engine.getRenderWidth()` / `engine.getRenderHeight()` の明示ピクセルサイズで作る。
  - canvas resize 時は Frame Graph backend を作り直す。
- `src/render/frame-graph-post-effects-controller.ts`
  - Frame Graph controller を分離。
  - 現在は `scene color RT -> ImageProcessingTask -> Gamma/Contrast task -> backbuffer copy` の構成。
  - `FrameGraphImageProcessingTask` は常設し、LUT / exposure / tone mapping などの image processing 効果が無効なときは task を disabled にして copy pass として扱う。
- `src/render/post-process-controller.ts`
  - Frame Graph backend 時は Classic 側の pipeline image processing を無効化する。
- `src/ui-controller.ts`
  - PostFX 欄に backend 選択 UI を追加。
  - Frame Graph backend 側の pass 表示は現在 `Image / Color` 相当の検証表示。

## 試した経路と結果

### 1. `camera.outputRenderTarget` 直結

通常の `Scene.render()` 結果を `camera.outputRenderTarget` 経由で Frame Graph に渡そうとした。

結果:

- 実モデル読み込み後に画面が白化した。
- bone visualizer などの overlay は見えるが、モデルや床が見えない状態になった。
- 通常描画の backbuffer 出力を奪う形になり、Frame Graph 側で失敗すると画面全体が壊れやすい。

判断:

- `camera.outputRenderTarget` 直結は採用しない。

### 2. 独立 scene color RT + copy

`camera.outputRenderTarget` を使わず、Frame Graph 入力用に独立した `RenderTargetTexture` を作った。

調整したこと:

- 最初は `scene.customRenderTargets` に登録したが白化した。
- `camera.customRenderTargets` に移した。
- `getCustomRenderList = () => scene.meshes` を設定した。
- Frame Graph 側を `scene color RT -> backbuffer copy` だけに落として切り分けた。

結果:

- 実モデルと床が表示された。
- つまり scene color RT 入力経路自体は成立している。

### 3. Gamma/Contrast task 復帰

copy だけでは表示できたので、`ImageProcessingTask` は外したまま、独自 Gamma/Contrast task だけを戻した。

問題:

- 最初は白化した。
- `EffectWrapper.onApplyObservable` では Frame Graph 経路の uniform が期待通り設定されなかった可能性が高い。

対策:

- `FrameGraphPostProcessTask.record()` の bindings callback 内で `contrast` / `gammaPower` を直接 `effect.setFloat()` するようにした。

結果:

- 白化せず表示されるようになった。
- ただし、Gamma / Contrast スライダー操作が実際に見た目へ反映されるかは未確認。

### 4. 低解像度化 / ガビガビ対策

Gamma/Contrast task 復帰後、表示は出るがピクセル数が足りないような見た目になった。

原因候補:

- Frame Graph 入力 RT を `{ ratio: 1 }` で作っていたため、imported texture の寸法情報が期待より小さく扱われていた可能性。

対策:

- RT を `engine.getRenderWidth()` / `engine.getRenderHeight()` の明示サイズで作成。
- resize 時に Frame Graph backend を作り直す。

結果:

- ガビガビ感は改善した。
- まだ若干ピクセル数が足りないように見える可能性はあるが、白化はしていない。

## 確認済み

- Frame Graph backend が `activated` / `ready` まで到達する。
- 独立 scene color RT から backbuffer copy できる。
- 実モデルが表示される。
- 床が表示される。
- Gamma/Contrast task を挟んでも白化しない。
- `FrameGraphImageProcessingTask` を戻しても白化しない。
- RT 明示サイズ化で低解像度化が改善する。
- `npm.cmd run lint` 成功。既存 warning のみ。
- `npm.cmd run smoke:launch` 成功。

## 2026-04-30 追記

- `FrameGraphImageProcessingTask` を `FrameGraphPostEffectsController` に戻した。
- task chain は `scene color RT -> ImageProcessingTask -> Gamma/Contrast task -> backbuffer copy` に変更した。
- image processing 効果が無効な状態では `ImageProcessingTask.disabled = true` にし、Frame Graph の disabled pass で入力 texture を copy する。
- `execute()` 前に `imageProcessingEnabled` を毎回反映するため、LUT / exposure / tone mapping / vignette / curves / dithering の有効状態切り替えに追従できる想定。
- UI の Frame Graph backend 表示文言を `ImageProcessingTask plus Gamma/Contrast` に更新した。
- まだ実機表示での白化有無、LUT の見た目、Gamma / Contrast のスライダー反映は未確認。

## 2026-04-30 追記 2

- ユーザー実機確認で `FrameGraphImageProcessingTask` 復帰後も白化なし。
- Gamma / Contrast の UI 行を Classic backend 専用 panel の外へ移し、Frame Graph backend でも表示される共通 UI にした。
- 既存の `ColorPostFxController` が同じ `postEffectGamma` / `postEffectContrast` を更新するため、Frame Graph 側も `getSettings()` 経由で値を拾える。
- Frame Graph backend の説明文は、Gamma / Contrast が利用可能で、他の post effects は移行中という表現へ更新した。

## 2026-04-30 追記 3

- ユーザー実機確認で Frame Graph backend の Gamma / Contrast UI 反映は一応 OK。
- built-in LUT preset の `On / preset / intensity` 行を Classic backend 専用 panel の外へ移し、Frame Graph backend でも表示される共通 UI にした。
- 外部 LUT の `source / file` 行はまだ hidden のまま。まずは内部 preset LUT の Frame Graph 動作確認を優先する。
- Frame Graph 側は `FrameGraphImageProcessingTask` が `scene.imageProcessingConfiguration` を参照するため、既存 `applyLutSettings()` が作る `ColorGradingTexture` と intensity をそのまま使う想定。

## 2026-04-30 追記 4

- ユーザー実機確認で built-in LUT 有効時に画面が白っぽくなる。
- 対策として Frame Graph 用 `ThinImageProcessingPostProcess.fromLinearSpace` を `false` にした。
- 独立 scene color RT は既存 editor render path の結果を受け取るため、Frame Graph の ImageProcessingTask では display / gamma-space 寄りの入力として扱い、LUT 有効時の追加 gamma lift を避ける。
- この変更後に LUT の白浮き、LUT intensity 0 / 100、Gamma / Contrast の見た目を再確認する。

## 2026-04-30 追記 5

- ユーザー実機確認で白浮きは解消したが、LUT 効果が効いていない。
- LUT OFF 状態で Frame Graph を build したあと、LUT ON にしても `FrameGraphImageProcessingTask` 側の `COLORGRADING` define が更新されていない可能性がある。
- 対策として `imageProcessingEnabled` の ON/OFF が変わったタイミングで `ThinImageProcessingPostProcess._updateParameters()` を明示的に呼ぶようにした。
- preset / intensity の変更は `scene.imageProcessingConfiguration.bind()` と texture 更新で拾える想定だが、まだ実機確認が必要。

## 2026-04-30 追記 6: Frame Graph 公式ドキュメント確認

参照した公式ドキュメント:

- [Frame Graph class overview](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/frameGraph/frameGraphClassFramework/frameGraphClassOverview.md)
- [Frame Graph task list](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/frameGraph/frameGraphClassFramework/frameGraphTaskList.md)

確認できたこと:

- Frame Graph は `addTask()` で task を追加し、`buildAsync()` で pass を構築し、`execute()` で実行する構成。
- 各 task は `record()` 内で render pass を登録する。
- task を disabled にした場合は、通常の処理 pass ではなく入力を出力へ copy する disabled pass として扱える。
- `FrameGraphImageProcessingTask` は公式 task として存在し、image processing 系 post process を Frame Graph に載せるための入口になっている。
- ただし、ドキュメント上は object renderer task で描画した texture を渡す場合、object renderer 側の image processing を無効化する、または source texture が gamma-space の場合に `postProcess.fromLinearSpace = false` を設定する注意がある。

今回の実装との噛み合い:

- 現在の Frame Graph backend は、main scene render 全体を Frame Graph の object renderer task に移しているわけではない。
- 既存 editor render path を壊さないため、`camera.customRenderTargets` で独立 scene color RT を描画し、その RT を Frame Graph に import している。
- そのため、Frame Graph は「ポスト処理チェーンの実行基盤」としては使えているが、scene render から post process までを完全に Frame Graph 管理している状態ではない。
- LUT は `scene.imageProcessingConfiguration` と `ColorGradingTexture`、shader define、texture ready 状態に依存するため、この import texture 構成では `FrameGraphImageProcessingTask` にそのまま寄せると挙動が不安定になりやすい。
- `fromLinearSpace = false` で白浮きは避けられたが、built-in LUT の効果が反映されない問題が残った。

判断:

- Gamma / Contrast は独自 `FrameGraphPostProcessTask` と explicit uniform binding で動いているため、Frame Graph backend 側に残してよい。
- built-in LUT は、現時点で `FrameGraphImageProcessingTask` に無理に寄せない。
- LUT を Frame Graph に載せるなら、`scene.imageProcessingConfiguration` に依存せず、LUT texture / intensity / sampler を明示的に bind する独自 Frame Graph LUT task を作るほうが筋がよい。
- ただし、Frame Graph 移行の主目的は SSAO / DoF などの multi pass / depth 依存系であり、色調補正を全て Frame Graph に寄せる優先度は高くない。
- v0.2 では LUT は Classic backend の安定経路を残し、Frame Graph backend では Gamma / Contrast までを実用範囲として扱う判断でよい。

## 未確認

- exposure / scene image processing configuration が Classic と同等に扱えるか。
- LUT を独自 Frame Graph LUT task として実装する場合の texture layout / sampler binding。
- utility layer / bone visualizer / gizmo の上書き順が正しいか。
- PNG / WebM 出力が Frame Graph backend の最終結果を拾えるか。
- 二重描画による FPS 低下が許容範囲か。
- 若干残っている可能性がある解像感不足の原因。

## 次にやる順番

1. `FrameGraphImageProcessingTask` の表示を確認する。
   - exposure / tone mapping など、LUT 以外の image processing 項目を使う必要があるか判断する。
   - 必要が薄ければ、Frame Graph backend では `ImageProcessingTask` を積極利用しない。
   - 色調補正は Gamma / Contrast の独自 task を主経路にする。

2. LUT の扱いを整理する。
   - v0.2 では Classic backend の安定機能として残す。
   - Frame Graph backend では、無理に `FrameGraphImageProcessingTask` 経由で有効化しない。
   - 後で必要になったら、独自 Frame Graph LUT task として texture / intensity を明示 bind する。

3. LUT / exposure を検証する。
   - exposure / tone mapping など、LUT 以外の image processing 項目を Frame Graph に載せる価値があるか判断する。
   - LUT は Classic backend の見た目を基準にし、Frame Graph backend では対象外でもよい。

4. 出力系を確認する。
   - PNG 出力。
   - WebM 出力。
   - Frame Graph backend の最終 backbuffer が拾えているかを見る。

5. UI 表示を整理する。
   - 現在の `Image / Color` 表示は検証用。
   - Gamma/Contrast が確認できたら、Frame Graph backend で使える項目として表示を正式化する。
   - 未移行の DoF / Fog は Frame Graph backend では出さない。

## 再開時の注意

- Classic backend は壊さない。
- Frame Graph backend はまだ実験扱い。
- `ImageProcessingTask` を戻す前に、Gamma/Contrast の UI 反映を確認する。
- 白化したら、まず copy-only 経路へ戻して RT 入力が壊れていないか見る。
- `camera.outputRenderTarget` 直結には戻さない。
- `.vscode/` は未追跡の無関係差分なので触らない。

## 白化・白浮き対策メモ

再発時の切り分け手順:

- まず `scene color RT -> backbuffer copy` だけの最小構成へ戻し、入力 RT が壊れているのか、後段 task が壊しているのかを分ける。
- copy-only が表示できるなら、`ImageProcessingTask` / Gamma/Contrast / LUT / DoF などを 1 task ずつ戻す。
- Classic backend は退避経路として残し、Frame Graph backend 側だけを切り分ける。

今回効いた、または避けるべき対策:

- `camera.outputRenderTarget` 直結は通常描画の backbuffer 出力を奪いやすく、失敗時に画面全体が白化しやすいため使わない。
- Frame Graph 入力用の scene color は独立 `RenderTargetTexture` とし、`camera.customRenderTargets` に登録する。
- 入力 RT は `{ ratio: 1 }` ではなく、`engine.getRenderWidth()` / `engine.getRenderHeight()` の明示ピクセルサイズで作る。
- canvas resize 後は Frame Graph backend を作り直し、古いサイズの RT / texture handle を引きずらない。
- post process task の uniform は `EffectWrapper.onApplyObservable` に任せず、`FrameGraphPostProcessTask.record()` の `additionalBindings` 内で `effect.setFloat()` などを明示的に行う。
- task を無効化する場合は `task.disabled = true` にして disabled pass の copy 経路を使い、UI の ON/OFF で pass chain 全体を破壊しない。

ImageProcessing / LUT 周りの注意:

- `FrameGraphImageProcessingTask` を使う場合、入力 RT が linear-space ではなく既存描画結果の display / gamma-space 寄りである可能性を確認する。
- 白浮きする場合は `ThinImageProcessingPostProcess.fromLinearSpace = false` を試す。
- LUT / tone mapping など shader define が変わる項目は、ON/OFF 切り替え時に thin post process の parameter 更新や task 再生成が必要になる可能性がある。
- built-in LUT は `FrameGraphImageProcessingTask` 経由では効果が反映されない問題が残ったため、現時点では Classic backend の安定経路を優先する。
- LUT を Frame Graph に載せる場合は、`scene.imageProcessingConfiguration` に依存せず、texture / sampler / intensity を明示 bind する独自 task として再検討する。

## 現時点の判断

Frame Graph 移行の最初の難所だった「通常描画の scene color を Frame Graph に渡す」部分は、独立 RT 方式で一応越えられている。

ただし、まだ本格移行完了ではない。次の山は SSAO / DoF のような depth や multi pass に価値がある post effects。LUT は Classic backend の安定経路を残し、Frame Graph backend では Gamma / Contrast までを実用範囲として扱ってよい。v0.2 では Classic を安定経路、Frame Graph を実験 backend として、小さな単位で移行する方針が妥当。
