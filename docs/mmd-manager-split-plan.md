# mmd-manager.ts 機能棚卸しと分割方針

## 目的

`src/mmd-manager.ts` は現在 8,700 行を超えており、アプリの中核ロジックをほぼ 1 ファイルで抱えています。  
この文書は、まず `MmdManager` が今何をやっているのかを責務単位で洗い出し、その上で現実的な分割方針を整理するためのメモです。

前提:

- いきなり `MmdManager` を消すのではなく、当面は public API を持つ facade として残す
- 内部実装を小さな service / controller に委譲していく
- 既存の UI や exporter から見える API はなるべく維持する

## おすすめの対応順

まず読むべき結論として、着手順は以下がおすすめです。

1. `project-serializer.ts`
2. `editor/timeline-edit-service.ts`
3. `assets/model-asset-service.ts`
4. `assets/motion-asset-service.ts`
5. `runtime/playback-controller.ts`
6. `render/effects-pipeline-controller.ts`

この順番をおすすめする理由:

- 最初に Babylon 依存の薄い pure logic と serialize 系を外へ出せる
- 次に timeline と asset loader を分けることで、`MmdManager` の主要な肥大化要因を減らせる
- 最後に Babylon 依存の強い playback / effects を扱うことで、途中の回帰リスクを抑えやすい

## 現在の `MmdManager` の役割

今の `MmdManager` は、実質的に次の責務をまとめて持っています。

1. エンジン選択とシーン初期化
2. Physics 初期化と runtime 接続
3. PMX / VMD / VPD / camera VMD / MP3 の読み込み
4. 再生制御と seek
5. アクティブモデル選択とモデル表示状態管理
6. マテリアルと WGSL シェーダ状態管理
7. ボーン gizmo、ボーン可視化、morph / camera 編集
8. タイムラインのキーフレーム編集と統合 track 生成
9. プロジェクト保存/読込
10. ライティング、影、post effect、DoF、SSAO、SSR、VLS、fog 管理
11. 診断情報と screenshot capture

肥大化の主因は、pure なデータ処理、editor state、Babylon scene への副作用コード、project の serialize / deserialize が同居していることです。

## 責務マップ

### 1. エンジン、シーン、runtime の初期化

主な入口:

- `create`, `createWebGlEngine`, `createPreferredEngine` (`src/mmd-manager.ts:2945`)
- `constructor` (`src/mmd-manager.ts:2988`)
- `initializePhysics`, `initializeBulletPhysicsBackend`, `initializeAmmoPhysicsBackend` (`src/mmd-manager.ts:3266`)
- `resize`, `setAutoRenderEnabled`, `renderOnce`, `setRenderFpsLimit`, `dispose` (`src/mmd-manager.ts:9512`)

やっていること:

- WebGPU / WebGL2 の選択
- Babylon scene, camera, light, shadow, ground, skydome の生成
- MMD runtime と physics backend の構築
- render loop、resize、dispose の管理

この領域は `SceneRuntime` として切り出すのが自然です。

### 2. アセット読み込み

主な入口:

- `loadPMX` (`src/mmd-manager.ts:3478`)
- `loadVMD` (`src/mmd-manager.ts:3911`)
- `loadVPD` (`src/mmd-manager.ts:3989`)
- `loadCameraVMD` (`src/mmd-manager.ts:4055`)
- `loadMP3` (`src/mmd-manager.ts:4119`)

やっていること:

- Electron API 経由でのファイル読み込み
- scene への mesh / animation import
- MMD model / runtime animation / audio player の生成
- 読み込み後の editor state 更新
- material や shadow の互換調整

これは `ModelAssetService` と `MotionAssetService` に分けやすいです。

### 3. モデル registry と material shader state

主な入口:

- WGSL material state 周辺 (`src/mmd-manager.ts:1321` 付近)
- `setExternalWgslToonShader*`, `setWgslMaterialShaderPreset`, `applyWgslShaderPresetToMaterial` (`src/mmd-manager.ts:1378`, `src/mmd-manager.ts:1460`, `src/mmd-manager.ts:1571`)
- `collectSceneModelMaterials`, `getSerializedMaterialShaderStates`, `applyImportedMaterialShaderStates` (`src/mmd-manager.ts:1796`, `src/mmd-manager.ts:1842`, `src/mmd-manager.ts:1857`)
- モデル表示 / active model 切替周辺 (`src/mmd-manager.ts:1889`, `src/mmd-manager.ts:1928`, `src/mmd-manager.ts:1954`, `src/mmd-manager.ts:1993`)

やっていること:

- `sceneModels` の管理
- active model の切替
- material ごとの shader preset / external WGSL の保持
- project 保存用の material shader state の serialize / deserialize

この責務は以下に分けるのがよいです。

- `SceneModelRegistry`
- `MaterialShaderService`

### 4. ボーン編集、gizmo、ボーン可視化、morph / camera 編集

主な入口:

- `setTimelineTarget`, `setBoneVisualizerSelectedBone` (`src/mmd-manager.ts:2008`, `src/mmd-manager.ts:2021`)
- `updateBoneGizmoTarget`, `syncBoneGizmoProxyToRuntimeBone`, `applyBoneGizmoProxyToRuntimeBone` (`src/mmd-manager.ts:2030`, `src/mmd-manager.ts:2086`, `src/mmd-manager.ts:2121`)
- `refreshBoneVisualizerTarget`, `updateBoneVisualizer`, `tryPickBoneVisualizerAtClientPosition` (`src/mmd-manager.ts:2197`, `src/mmd-manager.ts:2337`, `src/mmd-manager.ts:2538`)
- morph / bone / camera 編集 API (`src/mmd-manager.ts:8741` 付近)

やっていること:

- 編集対象の選択管理
- gizmo と runtime bone の同期
- bone overlay canvas の描画
- UI から使う morph / bone / camera 編集 API の提供

この領域は `BoneEditController` として分けるのがよさそうです。

### 5. タイムライン編集と animation merge

主な入口:

- `hasTimelineKeyframe`, `addTimelineKeyframe`, `removeTimelineKeyframe`, `moveTimelineKeyframe` (`src/mmd-manager.ts:2743`)
- frame utility 群 (`src/mmd-manager.ts:83` 付近)
- animation merge / frame map 周辺 (`src/mmd-manager.ts:8980` 付近)
- timeline track 生成 (`src/mmd-manager.ts:9365`, `src/mmd-manager.ts:9444`, `src/mmd-manager.ts:9500`)

やっていること:

- キーフレームの追加 / 削除 / 移動
- frame list の統合
- base motion と overlay motion の merge
- UI 向け timeline track の生成

この領域は pure logic の比率が高く、最初に外へ出しやすいです。

### 6. 再生制御と seek

主な入口:

- `play`, `pause`, `stop`, `seekTo`, `seekToBoundary`, `setPlaybackSpeed` (`src/mmd-manager.ts:4175`)
- `stabilizePhysicsAfterHardSeek` (`src/mmd-manager.ts:4237`)
- constructor 内 render loop の playback 更新処理

やっていること:

- 再生 / 一時停止 / 停止
- audio 同期あり / なし両方の playback
- current frame と total frames の更新
- hard seek 後の physics 安定化

この領域は `PlaybackController` に分離しやすいです。

### 7. プロジェクト保存 / 読込

主な入口:

- project pack / unpack helper 群 (`src/mmd-manager.ts:4262` 付近)
- `serialize*` 系 (`src/mmd-manager.ts:4433` 付近)
- `deserialize*` 系 (`src/mmd-manager.ts:4499` 付近)
- `exportProjectState` (`src/mmd-manager.ts:4608`)
- `importProjectState` (`src/mmd-manager.ts:4784`)
- `clearProjectForImport`, `isProjectFileV1` (`src/mmd-manager.ts:5267`, `src/mmd-manager.ts:5322`)

やっていること:

- project file format v1 の encode / decode
- scene, camera, lighting, effects, keyframes, accessories の保存 / 復元
- import 時の asset 再読み込み

この領域は次の 2 つに分けるのが妥当です。

- `ProjectSerializer`
- `ProjectImporter`

### 8. ライティング、影、post effect

主な入口:

- post effect getter / setter 群 (`src/mmd-manager.ts:5475` 付近)
- light / shadow getter / setter 群 (`src/mmd-manager.ts:6196` 付近)
- pipeline 初期化 (`src/mmd-manager.ts:6433` 以降)
- custom shader 構築 (`src/mmd-manager.ts:503`, `src/mmd-manager.ts:7196`, `src/mmd-manager.ts:7826`, `src/mmd-manager.ts:8271`)

やっていること:

- editor 向け effect state の保持
- Babylon post-process pipeline の生成 / 更新 / 破棄
- LUT、motion blur、SSAO、SSR、VLS、fog、AA、DoF の適用
- WebGPU / WebGL の差異吸収

ここは最も重い領域で、`EffectsPipelineController` としてまとめるのが本命です。

### 9. 診断と capture

主な入口:

- 診断系メソッド (`src/mmd-manager.ts:5328` 付近)
- `capturePngDataUrl` (`src/mmd-manager.ts:5417`)

やっていること:

- runtime diagnostics の蓄積
- UI 向け label 生成
- screenshot capture

この領域は比較的小さいので、必要なら facade 側に残しても問題ありません。

## 目標構成

### `MmdManager` は facade として残す

今の `MmdManager` は以下から直接使われています。

- `src/ui-controller.ts`
- `src/bottom-panel.ts`
- `src/png-sequence-exporter.ts`
- `src/webm-exporter.ts`

そのため、最初の段階では API 窓口として残し、内部だけを分割するのが安全です。

### 想定モジュール

#### `runtime/scene-runtime.ts`

責務:

- エンジン選択
- scene bootstrap
- camera / light / ground / skydome 作成
- render loop
- resize / dispose

#### `runtime/playback-controller.ts`

責務:

- play / pause / stop / seek / speed
- current frame / total frame 管理
- audio 同期
- hard seek 後の安定化

#### `assets/model-asset-service.ts`

責務:

- PMX / PMD 読み込み
- MMD model 作成
- model info 抽出
- material / shadow 互換処理

#### `assets/motion-asset-service.ts`

責務:

- VMD / VPD / camera VMD 読み込み
- MP3 読み込み
- animation の適用 / 差し替え / merge の入口

#### `scene/material-shader-service.ts`

責務:

- WGSL preset の適用
- external WGSL state の保持
- material default の snapshot / restore
- material shader state の serialize

#### `editor/bone-edit-controller.ts`

責務:

- bone selection と edit target 管理
- gizmo 同期
- bone overlay 描画 / pick
- morph / bone / camera 編集 API

#### `editor/timeline-edit-service.ts`

責務:

- frame utility
- track key helper
- keyframe add / remove / move
- animation merge
- timeline track 生成

#### `project/project-serializer.ts`

責務:

- typed array pack / unpack
- animation serialize / deserialize
- project file schema の encode / decode

#### `project/project-importer.ts`

責務:

- import のオーケストレーション
- import 前クリア処理
- asset 再ロードと state 復元

#### `render/effects-pipeline-controller.ts`

責務:

- post effect state の apply
- Babylon pipeline の生成 / 破棄
- WebGPU / WebGL fallback の吸収
- custom post-process shader の登録

## 分割順の提案

### Step 1: まず pure logic を外へ出す

最初に切る候補:

- frame utility
- track key helper
- animation merge
- project pack / unpack helper
- animation serialize / deserialize helper

理由:

- Babylon 依存が最も薄い
- 回帰リスクが低い
- テストしやすい

### Step 2: project 系を切り出す

候補:

- `ProjectSerializer`
- `ProjectImporter`

理由:

- 責務がまとまっている
- exporter 側でも import / export 周りの恩恵が出る
- 差分が比較的読みやすい

### Step 3: asset loader を切り出す

候補:

- `ModelAssetService`
- `MotionAssetService`

理由:

- `loadPMX` と `loadVMD` は自然な分割境界になっている
- facade からかなりの行数を外へ出せる

### Step 4: playback と timeline 編集を分ける

候補:

- `PlaybackController`
- `TimelineEditService`

理由:

- editor 挙動を追いやすくなる
- exporter からの再利用も考えやすい

### Step 5: effects pipeline を最後に分ける

候補:

- `EffectsPipelineController`
- `MaterialShaderService`
- `BoneEditController`

理由:

- Babylon 依存が最も強い
- state が最も多い
- 他の責務を先に抜いた方が依存関係を整理しやすい

## 最初の分割候補としておすすめの 3 つ

### 1. `project-serializer.ts`

最も低リスクです。  
主にデータ変換で、scene 依存が薄いです。

### 2. `editor/timeline-edit-service.ts`

価値が高く、比較的 pure です。  
timeline のテストもしやすくなります。

### 3. `assets/model-asset-service.ts`

`loadPMX` は単体でも十分大きいので、これを抜くだけで見通しがかなり改善します。

## 分割後のイメージ

```ts
export class MmdManager {
  private readonly runtime: SceneRuntime;
  private readonly playback: PlaybackController;
  private readonly modelAssets: ModelAssetService;
  private readonly motionAssets: MotionAssetService;
  private readonly timelineEdit: TimelineEditService;
  private readonly effects: EffectsPipelineController;
  private readonly projectSerializer: ProjectSerializer;
  private readonly projectImporter: ProjectImporter;
}
```

この形にしておけば、UI から見た入口を維持しつつ、内部責務を明確にできます。

## 補足

- `src/mmd-manager-x-extension.ts` のような prototype 拡張は optional feature には向いていますが、これを標準パターンにはしない方がよいです
- accessories のような optional feature は、将来的に plugin 風の扱いにする余地があります
- `EffectsPipelineController` は一気に全部抜くより、段階的に移した方が安全です

## 次の一手

順番としては次の 2 パターンが考えやすいです。

1. 安全重視:
   `project-serializer.ts` -> `timeline-edit-service.ts` -> `model-asset-service.ts`
2. 体感の改善重視:
   `model-asset-service.ts` -> `motion-asset-service.ts` -> `project-serializer.ts`

リファクタの事故を減らすなら、安全重視の順番の方が無難です。

### 2026-03-19 追記

- `timeline` 周りを [`src/editor/timeline-edit-service.ts`](/d:/DevTools/Projects/MMD_modoki/src/editor/timeline-edit-service.ts) に切り出し始めた
- `MmdManager` 側は `hasTimelineKeyframe` / `addTimelineKeyframe` / `removeTimelineKeyframe` / `moveTimelineKeyframe` を委譲する形に変更した
- `emitMergedKeyframeTracks` と `refreshTotalFramesFromContent` も service 側へ寄せた
- `getActiveModelTimelineTracks` / `getCameraTimelineTracks` / `buildModelTrackFrameMapFromAnimation` も service 側に分離した
- `createOffsetModelAnimation` と `mergeModelAnimations` も service 側に切り出した
- `loadVMD` / `loadVPD` / `loadCameraVMD` / `loadMP3` も service 側に切り出した
- `npm run lint` は通過している
- `npx tsc --noEmit` は既存の `i18n` / `mmd-manager` の型エラーで止まっている
- 次は `loadPMX` の切り出し、または `runtime` / `playback` 側の分割に進める
### 2026-03-19 追加
- `loadPMX` を [`src/assets/model-asset-service.ts`](/d:/DevTools/Projects/MMD_modoki/src/assets/model-asset-service.ts) に切り出した
- `MmdManager` 側は `loadPMX` を薄い委譲に変更した
- `loadPMX` では PMX 読み込み後の `ModelInfo` 組み立て、物理補助、材質補正、モデル初期化、ロード後通知までをまとめて扱う
- ランタイム / playback は今回は分割せず、`MmdManager` 本体に残す方針にした
- `npm run lint` は警告のみで通過している
### 2026-03-19 shader/effects cleanup
- `src/scene/material-shader-service.ts` に WGSL preset / external shader / shader state / preset apply の実体を寄せて、`MmdManager` 側の shader helper を削った
- `src/render/effects-pipeline-controller.ts` は post effect と DoF の窓口として維持しつつ、`MmdManager` の getter / setter を薄くした
- `src/mmd-manager.ts` は shader 周りの旧 helper を削除した結果、`8508` 行まで縮んだ
- 起動時の import エラーも WGSL raw import の相対パス修正で復旧した
- `npm run lint` は通過
- `npx tsc --noEmit` は既存の `i18n` と wasm typed array 系エラーのみが残っている
### 2026-03-19 SSAO split
- `src/render/ssao-controller.ts` を追加し、SSAO の有効/無効判定、fallback post process、WebGPU fallback pipeline、depth renderer 管理を外出しした
- `src/render/ssao-shader.ts` を追加し、`ensureSimpleSsaoShader()` の巨大な shader 登録処理を別ファイルへ移した
- `src/mmd-manager.ts` 側は SSAO の wrapper だけを残す形にして、実装本体を controller / shader module に委譲した
- `src/mmd-manager.ts` はこの時点で 6,858 行まで縮んだ
- `npm run lint` は通過
- `npx tsc --noEmit` は引き続き既存の `src/i18n.ts` と wasm typed array 周辺の型エラーのみで停止する
- SSAO はほぼ独立したので、次は bone visualizer か light/shadow の分離が自然
### 2026-03-19 bone visualizer split
- `src/editor/bone-visualizer-controller.ts` を追加し、bone overlay / pick / visibility / canvas 管理を外出しした
- `src/mmd-manager.ts` 側は bone visualizer の wrapper だけを残して、描画とヒット判定の実装本体を controller に委譲した
- `src/mmd-manager.ts` はこの時点で 6,457 行まで縮んだ
- `npm run lint` は通過
- `npx tsc --noEmit` は引き続き既存の `src/i18n.ts` と wasm typed array 周辺の型エラーのみで停止する
- bone visualizer の次は gizmo / light-shadow / remaining render orchestration の順で切り分ける候補
### 2026-03-19 light/shadow split
- `src/scene/light-shadow-controller.ts` を追加して、`lightColorTemperature` / `lightColor` / `shadowColor` / `shadowEnabled` / `shadowFrustumSize` / `shadowEdgeSoftness` / `setLightDirection` / `toonShadowInfluence` と、`toon` 系の反映ロジックをまとめて外出しした
- `src/mmd-manager.ts` は light/shadow の getter / setter と初期化を controller 委譲にして、旧 helper の本体を削除した
- `src/mmd-manager.ts` はこの時点で `6,963` 行まで縮んだ
- `npm run lint` は通過
- `npx tsc --noEmit` は引き続き既存の `src/i18n.ts` と wasm typed array 系エラーのみ
- 次は `bone gizmo` か `render orchestration` の残りを切る候補
### 2026-03-19 bone gizmo split
- `src/editor/bone-gizmo-controller.ts` を追加して、bone gizmo の target 判定、proxy 同期、drag 反映、初期化、dispose をまとめて移した
- `src/mmd-manager.ts` 側は wrapper と wiring だけ残し、constructor / onBeforeRender / dispose から controller を呼ぶ形に整理した
- `src/mmd-manager.ts` は今回の分離で `6,761` 行まで縮んだ
- `npm run lint` は通過
- `npx tsc --noEmit` は既存の `src/i18n.ts` と wasm typed array 周りのエラーのみ
- 次は `render orchestration` か、まだ残っている表示系のまとまりを切るのが自然

### 2026-03-19 render orchestration split
- `src/render/post-process-controller.ts` を追加して、motion blur / fog / final lens distortion / antialias / volumetric light 周りの制御を集約した
- `src/mmd-manager.ts` から `initializeDofPipeline` / `setupEditorDofPipeline` / `applyMotionBlurSettings` / `applyVolumetricLightSettings` / `applyFogSettings` / `setupOriginFogPostProcess` / `setupFinalLensDistortionPostProcess` / `applyAntialiasSettings` / `enforceFinalPostProcessOrder` / `updateSimpleMotionBlurState` を委譲化した
- `src/mmd-manager.ts` は今回の分離で `6,194` 行まで縮んだ
- `npm run lint` は通過
- `npx tsc --noEmit` は既存の `src/i18n.ts` と wasm typed array 周りのエラーのみ
- まだ残っている大きい塊は `applyImageProcessingSettings` / `applyLutSettings` / `applySsrSettings` / `applyEditorDofSettings` / `setupFarDofPostProcess` あたり
### 2026-03-19 post-process cleanup
- `src/render/post-process-controller.ts` now owns `applyImageProcessingSettings`, `applyLutSettings`, `applySsrSettings`, `applyEditorDofSettings`, `applyDofLensBlurSettings`, `applyDofLensOpticsSettings`, and `setupFarDofPostProcess`.
- `src/mmd-manager.ts` keeps only thin wrappers for those post-process entry points.
- `src/mmd-manager.ts` is down to 5039 lines after this cleanup.
- The missing `applyLutSettingsImpl` import and the old `ensureSignedLensDistortionShader` helper have been fixed.
- `npm run lint` passes.
- `npx tsc --noEmit` still fails only on the pre-existing `src/i18n.ts` and wasm typed array issues.
### 2026-03-19 post-process wiring
- `src/render/post-process-controller.ts` now owns `applyImageProcessingSettings`, `applyLutSettings`, `applySsrSettings`, `applyEditorDofSettings`, `applyDofLensBlurSettings`, `applyDofLensOpticsSettings`, `applyMotionBlurSettings`, `applyVolumetricLightSettings`, `applyFogSettings`, `setupOriginFogPostProcess`, `setupFinalLensDistortionPostProcess`, `applyAntialiasSettings`, `enforceFinalPostProcessOrder`, and `setupFarDofPostProcess`.
- `src/mmd-manager.ts` now keeps thin wrappers for those post-process entry points instead of the old inline bodies.
- `src/mmd-manager.ts` is down to 6,586 lines after this cut.
- The remaining volumetric-light sync in `setLightDirection()` now goes through the existing wrapper path.
- `npm run lint` passes.
- `npx tsc --noEmit` still fails only on the pre-existing `src/i18n.ts` and wasm typed array issues.
- Next candidates are the remaining SSAO block, light/shadow, and bone visualizer/gizmo cleanup.
### 2026-03-19 old helper cleanup
- `src/mmd-manager.ts` から、使われなくなった project 系の型 import と旧 helper の残骸を整理した。
- 具体的には `collectSceneModelMaterials`、`getSerializedMaterialShaderStates`、`setModelMotionImports`、`appendModelMotionImport`、`normalizePathForCompare` などの dead code を削除した。
- `exportProjectState` / `importProjectState` の public wrapper は残し、`project-serializer.ts` / `project-importer.ts` への委譲構造は維持している。
- `src/mmd-manager.ts` は現在 7,609 行まで減っている。
- `npm run lint` は通過。
- `npx tsc --noEmit` は引き続き既存の `src/i18n.ts` と wasm typed array 周辺の型エラーのみが残っている。

### 2026-03-19 light/shadow wrapper fix
- `src/scene/light-shadow-controller.ts` の `setLightDirection()` を `applyVolumetricLightSettings()` 連動に揃えて、`MmdManager` 側の volumetric light 同期と一致させた。
- `src/mmd-manager.ts` の light/shadow wrapper は UI から触る API を public のまま維持し、`getLightColor` / `setLightColor` / `getShadowColor` / `setShadowColor` / `setShadowEnabled` / `getLightAzimuth` / `getLightElevation` の公開性を戻した。
- `src/mmd-manager.ts` は現在 5,669 行まで縮小している。
- `npm run lint` は通過。
- `npx tsc --noEmit` は引き続き既存の `src/i18n.ts` と wasm typed array 周辺の型エラーのみが残っている。
- 次は `bone visualizer` / `bone gizmo` / `render orchestration` の残りを詰めるのが自然。
### 2026-03-19 bone visualizer / gizmo split
- `src/editor/bone-visualizer-controller.ts` と `src/editor/bone-gizmo-controller.ts` へ骨表示系の実装を寄せた。
- `MmdManager` 側は `initializeBoneGizmoSystem()` / `handleBoneGizmoBeforeRender()` / `disposeBoneGizmoSystem()` / `updateBoneGizmoTarget()` の薄い wrapper と、bone visualizer の entry wrapper だけを残した。
- `bone gizmo` の古い helper ブロックを削って、`mmd-manager.ts` は現在 5,088 行まで減っている。
- `npm run lint` は通過。
- `npx tsc --noEmit` は引き続き既存の `src/i18n.ts` と wasm typed array 周辺の型エラーのみが残っている。
- 次は残っている render orchestration と、必要なら bone visualizer の残りの dead code を詰める。
