# タイムライン再生時パフォーマンス最適化メモ 2026-07-09

## 背景

重いモデル + 物理 ON + モーキャプ由来の全打ちキーに近い VMD で、MMD 本体は 50fps 超まで出る一方、MMD_modoki はモデル欄 / タイムライン表示中に 40fps 前後まで落ちるケースがあった。

物理を OFF にすると 60fps へ戻るため主因は物理だったが、Bullet WASM / Buffered / `maxSubSteps = 2` で物理側を改善した後も、タイムライン表示が残りのボトルネックになっていた。

## 観測した症状

- モデル欄表示中とカメラ欄表示中で fps 差が大きい。
- モーフ欄のリアルタイム同期を止めると少し改善したが、まだ 40fps 程度に留まった。
- タイムライン欄を疑って調べると、`Timeline.setCurrentFrame()` が毎フレーム `scheduleStatic()` を呼んでいた。
- `src/timeline.ts` のコメント上は static canvas は `setKeyframeTracks` / resize / scroll 時のみ再描画する設計だったが、実装では再生フレーム更新ごとに keyframe dots 全体を再描画していた。

全打ちキーでは表示範囲内のキー点数が多く、これが再生中の大きな負荷になっていた。

## 採用した方針

再生中はタイムラインの見た目を止めず、ただし毎フレーム全キーフレーム点群を描き直さない。

現在の方針:

- `Timeline.setCurrentFrame(frame, { lightweight: true })` を追加。
- 再生中は lightweight mode を使う。
- ruler / playhead の overlay canvas は毎フレーム更新する。
- keyframe dots の static canvas と waveform canvas は、毎フレーム再描画せず CSS `translateX()` で横に流す。
- canvas は左右に `192px` のバッファを持たせて描画する。
- `viewOffset` が直近描画位置から `144px` 以上ずれたら static / waveform を再描画する。
- 現在フレームを示す縦線は static / waveform canvas から外し、固定レイヤーの `div.timeline-playhead-track-line` として表示する。
- pause / stop / 再生終了時は `timeline.refreshFrameContent()` で static / overlay / waveform を再同期する。

## 実装箇所

- `src/timeline.ts`
  - `TimelineFrameUpdateOptions`
  - `setCurrentFrame(frame, options)`
  - `refreshFrameContent()`
  - `FRAME_PAN_BUFFER_PX = 192`
  - `LIGHTWEIGHT_FRAME_REDRAW_PX = 144`
  - `staticRenderViewOffset` / `waveformRenderViewOffset`
  - `applyFrameCanvasPan()`
  - `setStaticCanvasTransform()` / `setWaveformCanvasTransform()`
  - `createPlayheadTrackLine()` / `positionPlayheadTrackLine()`
- `src/ui-controller.ts`
  - 再生中の `onFrameUpdate` では `timeline.setCurrentFrame(frame, { lightweight: true })` を使う。
  - 再生中は重い編集 UI 同期をスキップする。
  - pause / stop / playback end で `timeline.refreshFrameContent()` を呼ぶ。
- `src/index.css`
  - waveform の横バッファがラベル欄へはみ出さないよう `.timeline-waveform-row` を `overflow: hidden` にする。
  - `.timeline-waveform-spacer` と `#timeline-waveform-canvas` の重なり順を調整する。

## 再生中に止めている UI 同期

再生中の `onFrameUpdate` では、以下は原則止める。

- モーフ欄の全件リアルタイム同期
- キー登録ボタン群の毎フレーム状態判定
- モデル欄全体の編集 UI 更新
- 選択ボーン数値プレビュー
- 選択トラックの補間プレビュー

選択ボーン数値プレビューと補間プレビューは一度戻して試したが、20fps 未満まで落ちたため再び停止した。

特に補間プレビューは `updateInterpolationPreview()` から補間カーブ DOM / canvas 更新、track 探索、状態表示更新まで走るため、再生中の毎フレーム更新には向かない。

## 実測メモ

ユーザー実機確認:

- タイムライン最適化前: タイムライン / モデル欄表示中に 40fps 前後。
- keyframe dots の毎フレーム再描画停止後: 53fps 前後。
- バッファ拡張、固定 playhead line、プレビュー停止後: 55fps 前後まで回復。
- 選択ボーン数値プレビュー + 補間プレビューを再生中に戻すと 20fps 未満まで低下。

このため、v0.2 系では「再生中はタイムライン表示を軽量に流し、編集プレビューは停止 / シーク時に同期する」方針を採用する。

## 注意点

- 再生中の static canvas は CSS transform で流れているため、クリック / 矩形選択などの座標計算はバッファ込み座標を使う。
- ruler / overlay canvas はバッファなしの固定座標を使う。
- 現在フレーム縦線は canvas ではなく固定 `div` なので、static canvas の transform に巻き込まれない。
- バッファ幅や再描画しきい値を広げすぎると canvas サイズが増えて再描画時の一撃が重くなる。狭すぎると端の空白や再描画頻度増加が出る。
- 選択ボーン数値プレビュー / 補間プレビューを再生中に戻す場合は、毎フレームではなく間引き更新、または選択 track の索引キャッシュ、DOM 更新差分化を先に検討する。

## 今後の候補

- 再生中の補間プレビューを 10fps 程度に間引く。
- 選択 track の `movableBoneTracks` / `boneTracks` 探索を Map 化する。
- 補間プレビューの DOM / canvas 更新を値が変わった時だけにする。
- タイムラインの static canvas 再描画時間を `performance.mark()` で計測できるようにする。
- 全打ちキーの密度が高い場合、keyframe dots をフレーム単位ではなく画素単位でまとめて描く LOD を検討する。

