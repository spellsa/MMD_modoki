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
  - 現在は `scene color RT -> Gamma/Contrast task -> backbuffer copy` の構成。
  - `FrameGraphImageProcessingTask` は白化切り分けのためまだ戻していない。
- `src/render/post-process-controller.ts`
  - Frame Graph backend 時は Classic 側の pipeline image processing を無効化する。
- `src/ui-controller.ts`
  - PostFX 欄に backend 選択 UI を追加。
  - Frame Graph backend 側の表示は現在 `Color / Debug` 相当の検証表示。

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
- RT 明示サイズ化で低解像度化が改善する。
- `npm.cmd run lint` 成功。既存 warning のみ。
- `npm.cmd run smoke:launch` 成功。

## 未確認

- Gamma / Contrast スライダー操作が Frame Graph backend の見た目に反映されるか。
- `FrameGraphImageProcessingTask` を戻しても白化しないか。
- LUT / exposure / scene image processing configuration が Classic と同等に扱えるか。
- utility layer / bone visualizer / gizmo の上書き順が正しいか。
- PNG / WebM 出力が Frame Graph backend の最終結果を拾えるか。
- 二重描画による FPS 低下が許容範囲か。
- 若干残っている可能性がある解像感不足の原因。

## 次にやる順番

1. Gamma / Contrast の UI 反映を確認する。
   - Frame Graph backend のまま Contrast を極端に振る。
   - 見た目が変われば、Gamma/Contrast task は実用確認済みにできる。
   - 見た目が変わらなければ、`getSettings` 経路または UI 更新通知を確認する。

2. `FrameGraphImageProcessingTask` を単独で戻す。
   - `scene color RT -> ImageProcessingTask -> backbuffer copy` をまず試す。
   - ここで白化するなら、scene image processing configuration か LUT 関連が原因。
   - 表示されるなら、`ImageProcessingTask -> Gamma/Contrast -> backbuffer` に進む。

3. LUT / exposure を検証する。
   - Classic と Frame Graph で LUT の見た目差を比較する。
   - LUT 未設定時、LUT 設定時の両方を見る。

4. 出力系を確認する。
   - PNG 出力。
   - WebM 出力。
   - Frame Graph backend の最終 backbuffer が拾えているかを見る。

5. UI 表示を整理する。
   - 現在の `Color / Debug` 表示は検証用。
   - Gamma/Contrast が確認できたら、Frame Graph backend で使える項目として表示を正式化する。
   - 未移行の DoF / Fog は Frame Graph backend では出さない。

## 再開時の注意

- Classic backend は壊さない。
- Frame Graph backend はまだ実験扱い。
- `ImageProcessingTask` を戻す前に、Gamma/Contrast の UI 反映を確認する。
- 白化したら、まず copy-only 経路へ戻して RT 入力が壊れていないか見る。
- `camera.outputRenderTarget` 直結には戻さない。
- `.vscode/` は未追跡の無関係差分なので触らない。

## 現時点の判断

Frame Graph 移行の最初の難所だった「通常描画の scene color を Frame Graph に渡す」部分は、独立 RT 方式で一応越えられている。

ただし、まだ本格移行完了ではない。次の山は `ImageProcessingTask` と LUT 周り。v0.2 では Classic を安定経路、Frame Graph を実験 backend として、小さな単位で移行する方針が妥当。
