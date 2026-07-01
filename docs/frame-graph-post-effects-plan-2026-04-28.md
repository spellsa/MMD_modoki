# Frame Graph 後段エフェクト移行メモ 2026-04-28

## 目的

Babylon.js 9 系の Frame Graph を、MMD_modoki の標準描画パイプライン候補として検証する。

ただし v0.2 の主目的は、MMD モデル表示、outline、影、ギズモ、タイムライン操作を壊さずに、重くなりがちな後段エフェクトを整理することである。そのため、最初から `Scene.frameGraph` によるメイン描画全面置き換えは狙わない。

このメモでは、既存のメイン描画は維持し、DoF / Bloom / LUT / SSAO / 空気遠近などの post effect 群だけを Frame Graph 系へ寄せられるかを検証する。

## 背景

2026-04-28 の描画負荷計測では、物理演算より `sceneRender` 側の影響が大きいケースが見えた。

特に:

- 中量級モデル 4 体では、影あり / 影なしで `frameTotal.avgMs` が大きく変わった
- モデル 1 体 + ステージ 1 + エフェクト多めでは、`editorDof.avgMs` が大きく出た
- 物理 ON/OFF や Classic / WASM の差より、影・DoF・後段エフェクトの整理余地が大きそうだった

Frame Graph は FPS を自動で改善する機能ではないが、描画タスクと texture 入出力を明示できるため、DoF / Bloom / LUT / SSAO / WebM capture の順序や責務を整理する基盤として期待できる。

関連:

- [v0.2-render-performance-measurement-2026-04-28.md](./v0.2-render-performance-measurement-2026-04-28.md)
- [v0.2-task-memo.md](./v0.2-task-memo.md)
- [post-effects-backlog.md](./post-effects-backlog.md)
- [camera-postfx-current-spec.md](./camera-postfx-current-spec.md)
- [lens-rendering-pipeline-guide.md](./lens-rendering-pipeline-guide.md)

## 採用方針

### やること

- 既存の `Scene.render` ベースのメイン描画は維持する
- Frame Graph はまず post effect 後段の PoC として扱う
- DoF / Bloom / LUT の順序を入れ替えられる最小経路を作る
- 霧ではなく遠景を環境色へなじませる空気遠近エフェクトを検討する
- WebGPU で動くことを第一条件にする
- WebGL2 fallback は、壊れ方と制限を確認したうえで判断する
- 既存の LensRenderingPipeline / 独自 PostFX と並行できる feature flag 経路にする
- 旧 post effect 経路は比較対象として残し、Frame Graph 経路とは切り替え式にする

### エフェクト欄との関係

現在のエフェクト欄にある項目のうち、シェーダープリセットを除く画面後段処理は、最終的に Frame Graph post effect controller 側へ寄せる候補にする。

Frame Graph 化候補:

- DoF
- Bloom / LuminousGlow の後段ぼかし・合成
- LUT / color correction
- SSAO
- 空気遠近
- FXAA / sharpen / grain / vignette などの fullscreen 後処理

残す、または別扱いにするもの:

- MMD 材質シェーダープリセット
- toon / sphere / outline など PMX material 側の処理
- セルフ影、遮蔽影、shadow caster 設定
- 背景画像 / 背景動画そのもの
- AutoLuminous の「どの材質を発光扱いにするか」という material 側指定

分解が必要なもの:

- LuminousGlow / AutoLuminous
  - 発光対象の判定や材質指定は material / shader 側
  - ぼかし、しきい値、合成順序は Frame Graph 後段候補

UI は当面いまのエフェクト欄を維持してよい。内部実装だけを段階的に `Effect UI -> post effect controller -> Frame Graph tasks` へ寄せる。

### backend 切り替え方針

旧エフェクトは削除やコメントアウトではなく、動作する比較対象として残す。

理由:

- エフェクトは見た目の回帰が出やすい
- 同じプロジェクトを classic / Frame Graph で比較する必要がある
- Frame Graph 化の目的は、まず同等表示と順序整理の確認であり、旧経路を消すと比較基準を失う
- v0.2 は実験枠なので、切り戻し可能な導線を残す方が安全

方針:

- 既定 backend は `classic`
- Frame Graph backend は dev flag / experimental 経路として追加する
- 旧経路と Frame Graph 経路は同時有効にしない
- project 保存値は既存互換を優先し、初期 PoC では backend を保存しない
- backend 未指定時は必ず `classic` として扱う
- UI の見た目は当面変えず、内部で backend を切り替える
- Frame Graph 側が安定してから、必要なら FX パネルや settings に切り替え UI を出す

想定する内部値:

```ts
type PostEffectBackend = "classic" | "frameGraph";
```

localStorage dev flag 候補:

```js
localStorage.setItem("mmd_modoki.postEffectBackend", "frameGraph");
localStorage.setItem("mmd_modoki.postEffectBackend", "classic");
```

最初の実装では、backend 概念を作ったうえで既定は `classic` のままにする。Frame Graph controller は最小 copy pass から始め、LUT / color correction を最初の移行対象にする。

2026-04-28 実装開始時点:

- `mmd_modoki.postEffectBackend` dev flag を追加
- `FrameGraphPostEffectsController` の空枠を追加
- `classic` を既定値にした
- `frameGraph` 指定時に、画面を変えない no-op Frame Graph pass を毎フレーム実行する
- 旧 post effect 経路はそのまま維持する
- 現段階では見た目は変わらない。起動時 console に `Frame Graph post effects backend active (noop PoC).` と `Frame Graph post effects backend ready.` が出れば有効化されている
- 右パネルのカメラ選択時 PostFX 領域で `Classic` / `Frame Graph PoC` を切り替えられる。変更後は自動 reload する
- backend 選択に応じて、下に表示する設定項目を切り替える
- 次の実装で `scene color -> copy -> output`、または LUT / color correction の最小 PoC を作る

### 移行状況

2026-04-28 時点では、Frame Graph 側へ移行済みの表示エフェクトはまだない。

| 機能 | 現在の実行経路 | Frame Graph 移行状況 |
| --- | --- | --- |
| 色調整 / color correction | 既存 post effect | 未着手 |
| LUT | 既存 post effect | 未着手。最初の移行候補 |
| 空気遠近 | 未実装 / 検討中 | 未着手。通常 PostProcess で見た目を先に確認する可能性あり |
| DoF | 既存 LensRenderingPipeline | 未着手 |
| Bloom / LuminousGlow 後段 | 既存 pipeline / material 側設定 | 未着手 |
| SSAO | 既存 fallback / custom path | 未着手 |
| Frame Graph backend | no-op pass のみ | 足場のみ実装済み |

そのため、右パネルの `PostFX: Frame Graph PoC` は「Frame Graph の実行経路が起動できるか」を確認するための選択肢であり、現段階で画作りの違いを見るためのものではない。

### すぐにはやらないこと

- `Scene.frameGraph` によるメイン描画全面置き換え
- MMD Standard material / MMD outline / 透過描画の全面移行
- 影生成の Frame Graph 化
- gizmo / bone visualizer / rigid body visualizer / utility layer の Frame Graph 化
- 既存 post effect の即削除

## なぜメイン描画を置き換えないか

Frame Graph を `Scene.frameGraph` として使うと、既存の `Scene.render` の流れが大きく変わる。

想定される影響:

- `Scene.activeCamera` が常時有効である前提が崩れる
- pointer 操作用に `Scene.cameraToUseForPointers` の明示が必要になる
- `Scene.render` 系 observable の多くが呼ばれなくなる
- Inspector から従来の rendering pipeline / effect layer / post process を直接調整しにくくなる
- MMD outline、透過、shadow、utility layer、gizmo、bone visualizer との干渉確認が必要になる

MMD_modoki は editor UI と runtime 表示が密に結びついているため、v0.2 ではメイン描画置き換えを主目的にしない。

## 空気遠近エフェクト

Babylon 標準 Fog は既存互換として残すが、v0.2 では別機能として空気遠近エフェクトを検討する。

欲しい見た目:

- 濃い霧ではなく、遠くの彩度・コントラストが落ちて背景色に溶ける
- キャラ近傍にはほぼ影響しない
- ステージ奥、屋外背景、空、遠景オブジェクトを環境色へなじませる
- Babylon 公式 Environment / Fog のサンプルにあるような、遠くのくすみを目標にする

機能の位置づけ:

- `Fog`: 既存互換の霧
- `Air Perspective`: 遠景を環境色へ寄せる軽い color grading pass
- `Environment`: 背景色、skybox、環境色、空気遠近の基準色

想定する最小パラメータ:

- `enabled`
- `color`
- `startDistance`
- `endDistance`
- `strength`

後回しにするもの:

- 高さ方向の減衰
- PMX キャラ除外マスク
- 背景画像や skybox からの自動平均色抽出
- volumetric fog 的な厚み表現

最初の実装は、Frame Graph ではなく通常 PostProcess で見た目を確認してよい。shader と調整値が固まってから、Frame Graph の custom post process task へ移す。

Frame Graph 化できる場合の想定:

```text
scene color + depth -> air perspective -> DoF -> Bloom -> LUT -> output
```

または、LUT との相性を見るために次も比較する。

```text
scene color + depth -> DoF -> Bloom -> air perspective -> LUT -> output
```

注意:

- depth texture が必要になるため、透過材質や outline との見た目差を確認する
- MMD キャラをくすませすぎると Toon の良さが落ちるため、既定値は弱めにする
- 既存 Fog と同時に有効化できるか、排他にするかは PoC 後に決める

## PoC の最小スコープ

### Phase 1: texture 入出力の確認

目的:

- 既存メイン描画の結果を Frame Graph の入力 texture として扱えるか確認する
- Frame Graph の出力を backbuffer または表示用 texture へ戻せるか確認する

確認項目:

- WebGPU で起動できる
- 空画面にならない
- 既存の MMD 表示と同じ camera / viewport で表示できる
- 既存の UI / timeline / gizmo 操作が壊れない
- feature flag OFF で完全に旧経路へ戻せる

### Phase 2: LUT / color correction

目的:

- depth に依存しない単純な fullscreen 後段処理として、Frame Graph post effect 経路の接続を確認する
- 既存エフェクト欄からの値反映、project 保存値、ON/OFF が壊れないか確認する

確認項目:

- WebGPU で表示が壊れない
- LUT ON/OFF と強度が反映される
- 既存 LUT と見た目が大きく乖離しない
- feature flag OFF で旧 LUT 経路へ戻せる

理由:

- depth / normal / outline との相性問題が少ない
- Frame Graph 後段経路の最初の置き換え対象としてリスクが低い

### Phase 3: 空気遠近

目的:

- 遠景を環境色へなじませる軽い fullscreen pass を試す
- 既存 Fog ではなく、空気遠近として調整できるか確認する
- Frame Graph 化する前に、通常 PostProcess でもよいので見た目を先に固める

確認項目:

- 屋外ステージの遠景が自然にくすむ
- 近距離キャラの Toon / outline が濁りすぎない
- 背景画像 / skybox / clearColor と色が大きく乖離しない
- DoF / Bloom / LUT の前後どちらに置くべきか比較できる

理由:

- v0.2 で欲しい見た目が明確
- SSAO や DoF より実装と調整の見通しがよい
- 既存 Fog を壊さず、別機能として試せる

### Phase 4: DoF

目的:

- `FrameGraphDepthOfFieldTask` を使って、既存 DoF 相当の見た目を出せるか確認する
- 既存 `LensRenderingPipeline` の DoF と比較する

確認項目:

- focus distance / fStop / focal length 相当の値を反映できる
- camera VMD 再生中に focus が破綻しない
- 透過髪、スカート、outline 周辺で目立つ破綻がない
- 既存 DoF より重くならない、または重くなる理由を説明できる

注意:

- Frame Graph の DoF は depth texture 依存なので、透過材質や outline との順序で見た目が変わりやすい
- DoF 更新処理そのものは別途 dirty check / cache 化できる可能性があるが、Frame Graph PoC より先に深追いしない

### Phase 5: Bloom / LuminousGlow 後段

目的:

- Bloom と LUT を Frame Graph 上の後段タスクとして扱えるか確認する
- LuminousGlow / AutoLuminous の後段ぼかし・合成部分を Frame Graph 化できるか確認する
- 順序を切り替えたときの見た目と負荷を比較する

比較候補:

- `DoF -> Bloom -> LUT`
- `Bloom -> DoF -> LUT`
- `LUT -> DoF -> Bloom`

確認項目:

- AutoLuminous / LuminousGlow 相当の既存挙動と衝突しない
- LUT の適用順で色味が想定外に変わらない
- project 保存値との互換性を壊さない

注意:

- 発光対象の材質判定は material / shader 側として残す
- Frame Graph 側では後段のぼかし、しきい値、合成順序だけを見る

### Phase 6: SSAO2

目的:

- Babylon 公式 `FrameGraphSSAO2RenderingPipelineTask` が WebGPU で現実的に使えるか確認する
- 既存独自 SSAO fallback を残すか判断する材料にする

注意:

- SSAO2 は depth と normal texture が必要になる
- `FrameGraphGeometryRendererTask` は outline / particles / bounding box などに制限がある
- MMD Standard material の toon 表現と合成したときの見た目を確認する必要がある

SSAO2 は PoC の後半に回す。

## 実装順

1. Frame Graph 後段 controller の枠だけ作る
   - feature flag は既定 OFF
   - 旧 post effect 経路へ戻せるようにする
   - backend 未指定時は `classic`
   - `scene color -> copy -> output` の最小経路を確認する
2. LUT / color correction
   - depth 不要で、最初の置き換え対象として安全
   - UI と project 保存値の接続を確認する
3. 空気遠近
   - 通常 PostProcess で見た目を固めてもよい
   - 固まったら Frame Graph custom post process task 化を検討する
4. DoF
   - depth と透過 / outline の相性を見る
   - 既存 LensRenderingPipeline と見た目・負荷を比較する
5. Bloom / LuminousGlow 後段
   - 発光対象指定は既存 material 側を残す
   - 後段のぼかし・合成順序を整理する
6. SSAO2
   - depth / normal が必要なので最後に回す
   - 公式 SSAO2 が MMD Standard material と相性よく使えるか判断する

この順序で進め、各段階で feature flag OFF の旧経路が壊れていないことを確認する。

## Feature Flag 案

右パネルのカメラ選択時 PostFX 領域にある `Backend` セレクトで切り替える。

内部保存値:

```js
localStorage.setItem("mmd_modoki.postEffectBackend", "frameGraph");
localStorage.setItem("mmd_modoki.postEffectBackend", "classic");
```

UI で切り替えた場合は、自動で reload する。

v0.2 の PoC が進んで設定項目が増える場合は、settings または FX パネル内に移して隔離する。

既定値:

- default: OFF
- v0.2 開発中の手動検証時のみ ON

## 成功条件

- WebGPU で起動し、既存プロジェクトを表示できる
- feature flag OFF で旧経路に戻せる
- DoF / Bloom / LUT の順序をコード上で明示的に組み替えられる
- 既存の MMD material / outline / 透過 / shadow の表示が大きく崩れない
- 既存の timeline 操作、camera 操作、bone 操作、project 保存 / 読み込みに副作用がない
- WebM 出力や PNG 出力へ接続できる見込みがある

## 見送り条件

- WebGPU で安定しない
- MMD outline / 透過 / 髪 / スカートの見た目が大きく崩れる
- 既存の editor UI 操作に影響する
- 旧 LensRenderingPipeline より重く、整理上のメリットも小さい
- WebM 出力経路との接続が難しい

見送りの場合でも、Frame Graph 全体を否定せず、DoF / Bloom / LUT / SSAO のうち使えるタスクだけを残す判断にする。

## 実装メモ

最初の実装は、`src/render/` 配下に Frame Graph post effect 専用の小さい controller を作る案がよい。

候補:

- `src/render/frame-graph-post-effects-controller.ts`

責務:

- feature flag 判定
- Frame Graph の生成 / 破棄
- DoF / Bloom / LUT / 空気遠近タスクの接続
- 旧 post effect 経路との排他制御
- resize / camera / project load 時の rebuild 判断

`mmd-manager.ts` には直接ベタ書きせず、既存 post effect controller 群との境界を見ながら接続する。

## 次の作業

1. 現行の DoF / Bloom / LUT / SSAO controller の責務を読む
2. 既存メイン描画結果を texture として受け渡せる接続点を探す
3. dev flag OFF 既定の Frame Graph post effect controller を追加する
4. WebGPU で `scene color -> copy -> backbuffer` の最小 PoC を作る
5. DoF を 1 つだけ追加して既存 DoF と比較する
6. 空気遠近は通常 PostProcess で見た目を作り、Frame Graph 化できるか判断する

## 2026-07-01 現行補足

この文書は初期 PoC 計画として残す。現在の実装は、ここで想定していた「固定順の DoF / Bloom / LUT / SSAO PoC」から進み、右パネルの FrameGraph / Post stack をユーザーが並べ替えられる構成になっている。

現行の前提:

- FrameGraph はまだ MMD scene render 全体の置き換えではなく、既存 scene color を取り込む post effect backend として扱う。
- Stack entry は `{ id, enabled }` を持ち、順序と ON/OFF を project に保存する。
- ON/OFF は効果パラメーターとは分離する。OFF にしても色や強度などの値は保持する。
- `Offset Rim -> Bloom` のように並べると、前段効果の結果へ後段効果がかかる。
- WebGPU FrameGraph の texture 依存は build 後に固定されるため、順序や enabled 状態を変えたら backend を rebuild する。

現在 stack で扱う主な効果は `SSR / SSAO / Offset Shadow / Offset Rim / DoF / Luminous / Bloom / LUT / Sharpen / Grain / Chroma / Vignette / EdgeBlur / Distort`。詳細は [FrameGraph Post Stack 現行仕様メモ 2026-07-01](./framegraph-post-stack-current-spec-2026-07-01.md) を参照する。

このため、本文中の「feature flag default OFF」「DoF / Bloom / LUT の最小順序 PoC」「LUT は Classic 優先」といった記述は当時の段階の判断であり、現在の UI / runtime 状態とは一致しない箇所がある。
