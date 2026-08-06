# 現行確認スナップショット 2026-08-06

## この文書の役割

最近追加した構想・改善計画について、2026-08-06 時点の実装状況と確認結果をまとめた日付付きのスナップショットです。

これは恒久的な仕様書ではありません。後日もう一度確認するときは、新しい日付のスナップショットを作成し、実装の変化と確認条件を分けて記録します。

- 確認日: 2026-08-06（JST）
- 対象コミット: 4f1df01
- 対象ブランチ: main
- 状態: 自動確認済み / 一部の実機・性能確認は未実施

## 結論

- Electron の起動スモークは、WebGPU・Bullet MPR・renderer の安定稼働 3 秒・環境ライトの簡易プローブまで通過しました。
- Playwright の既存 E2E は、モデル外部親の登録・解除、フレーム移動、ギズモ操作、undo / redo を含むシナリオが 1 件通過しました。
- 既存キーの補間編集はすでに実装されています。補間曲線のコピー・貼り付け・線形化・ハンドル編集はありますが、モーションから不足キーを推定して自動生成する機能は別タスクです。
- 音声波形は AudioBuffer から振幅ピークを作ってタイムラインへ表示する経路があります。一方、拍・BPM 推定、拍マーカー、母音推定、Meyda / Essentia.js の導入は確認できませんでした。
- 設定値は複数の localStorage キーに分散しています。現行の src スキャンでは、アプリ設定を一括管理する settings.json / state.json の参照は見つかりませんでした。
- WebM 出力は現状 RGBA サンプル入力で、空シーン 100 フレームの Phase 0 計測を完了しました。I420 / YUV 前処理は未実装・未検証で、代表モデル / モーションの出力基準値も未取得です。
- シェーダー / エフェクトパネルの表示切替は toolbar と Action 経路に実装されています。ただし、View メニュー側の該当項目は hidden です。1280x720 / 1920x1080 の見た目と操作感は別途手動確認が必要です。
- アクセサリの明示的な現行経路は .x と .glb です。OBJ / PLY の専用読み込み経路は確認できませんでした。
- モデル間の一般的なリターゲット用の alias map は存在しますが、身長差・低等身モデル向けの床補正や足・腕の選択ボーン補正までは確認できませんでした。
- 現行の物理床判定は Bullet の床コリジョンです。物理を無視して通常ボーンだけを 0 床以上へ補正する機能は別途設計・実装が必要です。

## 自動確認結果

| 確認 | 結果 | 内容 |
| --- | --- | --- |
| npm.cmd run smoke:launch | PASS | engine=WebGPU、physics=Bullet MPR、isolated renderer、3 秒の安定稼働、環境ライト簡易プローブを確認 |
| npm.cmd run test:e2e | PASS | test/e2e/model-external-parent.spec.mjs の 1 シナリオが通過（1 passed） |
| Playwright の確認範囲 | 部分確認 | 現在の E2E は外部親シナリオが中心で、設定保存・画面サイズ別レイアウト・出力性能までは自動化されていない |

通常の sandbox 実行では、renderer の起動前に userData のログ書き込み EPERM と GPU process 終了が発生しました。権限付きの同じコマンドを再実行したところ上記の結果になったため、現時点ではアプリの再現性問題というより実行環境の権限・GPU 条件として記録します。

## 構想ごとの現行状態

### 設定・レイアウト

- src/mmd-manager.ts、src/ui-controller.ts、src/render/post-effect-backend.ts、src/i18n.ts などで設定値を個別に localStorage へ保存しています。
- runtime mode、Auto Key、物理 backend、FPS 制限、描画 backend、環境ライト、locale などは個別キーです。
- シェーダーパネルは shader-panel-collapsed のクラスと layout.shaderPanel.toggle Action で表示状態を切り替えます。
- CSS には 1280px 以下、1480px 以下、1760px 以下、1800px 以上などのレイアウト分岐があります。数値の棚卸しは進んでいますが、実ウィンドウでの視認性確認は未完了です。

関連: [入力まわり・アプリ設定構想](./input-and-app-settings-concept-2026-08-05.md)、[UI テーマ・スケール・レイアウト構想](./ui-theme-scale-layout-concept-2026-08-05.md)

### モーション・補間・カメラ

- VMD / VPD の読み込み、モデル・カメラのキーフレーム編集、補間曲線の編集、Auto Key は現行実装にあります。
- interpolation.copy、interpolation.paste、interpolation.applyLinear、interpolation.updateHandle の Action 経路があります。
- カメラも位置・回転・距離・FOV と各補間値をキーとして保持できます。
- 「既存キー間の補間編集」と「不足キーの推定・新規キー生成」は現状でも分離して考えられます。後者に必要な速度・加速度・姿勢・拍同期の推定処理は未実装です。
- キャラの注視点追従、軸を限定したカメラ追従、追従結果をカメラモーションとして自動キー化する経路は確認できませんでした。
- Babylon / runtime の retargetingMap は alias 名の結び付けに使われています。身長差、極端な低等身、IK や接地を含む汎用リターゲット UI ではありません。

関連: [モーション補間・自動補完・カメラ追従構想](./motion-interpolation-camera-follow-concept-2026-08-04.md)、[Motion Asset / Motion Translator 構想](./motion-asset-translator-concept-2026-06-15.md)

### 床補正・ポーズ支援

- Bullet runtime には床コリジョンの ON / OFF と静的平面があります。
- 通常ボーンだけを対象に、現在姿勢を評価して腕・肩・肘・手首・腰・足などの下端を 0 床以上へ押し上げる非物理補正は確認できませんでした。
- 「初期ポーズ追加」「ハンドポーズ操作」「自動まばたき」「音声からのリップシンク」は、通常のモーフ / ボーンのキー登録以外に専用の自動生成経路を確認できませんでした。

### 音声・タイムライン

- UIController は音声を AudioContext.decodeAudioData で読み、30 fps 相当の振幅ピークを Timeline.setWaveformPeaks に渡します。
- タイムライン上の波形表示領域はすでに存在します。
- 拍位置、BPM、テンポ変化、拍オフセットを抽出してマーカー表示する実装は確認できませんでした。
- package.json / package-lock.json / src のスキャンでは Meyda と Essentia.js の導入は確認できませんでした。

### 出力

- src/webm-exporter.ts の現行 WebM 経路は VideoSample に format=RGBA を渡します。
- I420 / YUV / VideoFrame を使った GPU 前処理経路は確認できませんでした。
- PNG には RGBA データを IPC で保存する経路と、capturePage(...).toPNG() を使うキャンバススナップショット経路があります。

#### 2026-08-06 出力計測の要約

- 空シーン、1920x1080、100 フレーム、30fps、VP8、WebGPU、ポストエフェクト OFF で実測しました。
- WebM は webgpu-copy が 4118.7ms（41.2ms/frame）、readpixels が 19431.3ms（194.3ms/frame）でした。差の中心は GPU readback で、CPU pixel transform は両経路とも約 10ms/frame でした。
- 連番 PNG は 100 フレーム出力に成功しましたが、wall-clock は 103156.0ms、capture は 100375.8ms（1003.8ms/frame）で、capture が支配的でした。PNG は WebM の webgpu-copy ではなく、Babylon の RenderTargetTexture / readPixels 経路を使います。
- Phase 1 の RGBA→I420 は未実装です。WebM では CPU 変換部分が短縮対象になり得ますが、GPU readback が残るため、I420 だけでは主ボトルネック全体は解消しない見込みです。
- 判断としては、RGBA→I420 の GPU 前処理は実装価値があります。CPU pixel transform 約 10ms/frame の削減と、I420 化による readback データ量の削減が期待できますが、GPU readback 約 10ms/frame は残るため、単独で決定打にはなりません。対象はまず WebM の webgpu-copy 経路に限定し、compute / staging / map を含む総時間で評価します。
- 計測中に Destroyed texture ... used in a submit の WebGPU validation warning が出たため、値は現行空シーンの基準値として扱い、cleanup race は別途確認します。

詳細: [WebGPU 動画書き出し Phase 0 / Phase 1 事前調査メモ](./webgpu-yuv-preinvestigation-2026-08-06.md)

関連: [出力改善計画](./output-improvement-plan-2026-08-04.md)、[WebGPU YUV Phase 1 作業指示](./webgpu-yuv-phase1-work-order-2026-08-04.md)

### アクセサリ・VMDU

- .x の読み込みヒントと X 拡張経路があり、GLB については pluginExtension=.glb の専用経路があります。
- OBJ / PLY を専用形式として扱う実装は確認できませんでした。
- VMD は Babylon の VmdLoader.loadAsync にバイナリを渡して読み込みます。
- VMDU 専用の拡張子・Unicode 名称テーブル・出力経路は確認できませんでした。現行の UTF-8 / Shift-JIS の判定は X ファイルローダーの処理であり、VMDU の実装確認とは分けて扱います。

関連: [アクセサリ対象セレクタ・対応形式拡張構想](./accessory-target-selector-and-format-expansion-concept-2026-08-04.md)、[VMDU 構想](./vmdu-unicode-vmd-concept-2026-08-04.md)

### グラフエディタ・クローズアップ

- モーフは eye / lip / brow / other のカテゴリ分けとキー登録 UI がすでにあります。
- 補間ワークベンチもあります。
- グラフエディタ専用の実装や、タイムラインのクローズアップ表示を独立した編集モードとして示す経路は確認できませんでした。
- したがって、既存の補間ワークベンチを拡張する案と、新しいグラフ編集領域を追加する案は、実装前に責務と表示密度を決める必要があります。

関連: [グラフエディタ・タイムライン クローズアップ表示構想](./graph-editor-timeline-closeup-concept-2026-08-04.md)

## 現行確認タスクリスト

### 自動確認済み

- [x] Electron renderer の起動と WebGPU 初期化
- [x] Bullet MPR の起動状態と短時間安定稼働
- [x] 環境ライトの簡易 luminance probe
- [x] 外部親の登録・解除、シーク、ギズモ操作、undo / redo
- [x] 補間編集・波形表示・設定保存・出力・形式対応のコード経路棚卸し

### 次回の確認候補

- [ ] Playwright で 1280x720 / 1920x1080 の初期レイアウトとパネル開閉を確認する
- [ ] runtime mode、物理 backend、Auto Key、描画 backend、locale の再起動後保持を確認する
- [ ] project save / load とアプリ設定保存を分けて、保存対象と復元対象を確認する
- [x] WebM を空シーンで 100 フレーム出力し、RGBA 経路の基準値を取る
- [ ] WebM を軽量モデル・重いモデルで 100 フレーム出力し、代表基準値を取る
- [x] PNG 連番の RGBA IPC 経路を 100 フレーム実測する
- [ ] PNG の capturePage 経路との性能・色差・アルファ挙動を比較する
- [ ] 既存キーの補間編集と、新規キー自動生成を別々の E2E / unit test 対象として定義する
- [ ] 波形に拍・BPM・テンポ変化を重ねる場合の推定精度と失敗時 UI を確認する
- [ ] 物理を無視した通常ボーン限定の床補正について、対象ボーン、優先順位、IK との境界を試作する
- [ ] キャラ追従カメラを注視点固定、移動軸限定、回転追従、キー化に分けて試作する
- [ ] OBJ / PLY、VMDU、ハンドポーズ、まばたき、リップシンクを採用判断できる最小検証に分ける
- [ ] Bullet 2.75 を追加する場合は、現行 Bullet MPR / SPR とのサイズ・初期化・互換性を別調査する

## 参照した確認入口

- [Playwright Electron E2E 実装・運用ガイド](./playwright-electron-e2e-operation-guide.md)
- [E2E / UI 動作確認方針](./e2e-ui-verification-policy.md)
- [出力改善計画](./output-improvement-plan-2026-08-04.md)
- [入力まわり・アプリ設定構想](./input-and-app-settings-concept-2026-08-05.md)
- [UI テーマ・スケール・レイアウト構想](./ui-theme-scale-layout-concept-2026-08-05.md)
- [モーション補間・自動補完・カメラ追従構想](./motion-interpolation-camera-follow-concept-2026-08-04.md)
- [アクセサリ対象セレクタ・対応形式拡張構想](./accessory-target-selector-and-format-expansion-concept-2026-08-04.md)
- [VMDU 構想](./vmdu-unicode-vmd-concept-2026-08-04.md)
