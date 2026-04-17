# ui-controller.ts 分割方針メモ

## 目的

`src/ui-controller.ts` は、MMD 編集 UI の多くを 1 クラスで抱えており、2026-04 時点で 7,800 行を超えている。

この文書は、`ui-controller.ts` を短期で安全に小さくしていくための分割方針をまとめる。  
大規模な再設計ではなく、既存の `UIController` を当面 facade / composition root として残し、責務ごとの小さな controller に段階的に逃がす方針を取る。

## 前提

- MMD 本体ワークフローを優先する。
- いきなり `UIController` を消さない。
- 既存 DOM 構造と既存 `MmdManager` public API をなるべく維持する。
- 1 回の変更では、1 領域だけ切り出す。
- 切り出し後も `npm.cmd run lint` で最低限確認する。
- 大きな UI 挙動変更を混ぜない。分割と挙動変更は別コミットにする。

## 進捗: 2026-04-16

`ui-controller.ts` 分割は、低リスクで切り出しやすい UI 領域を中心に進めた。

現在の行数:

```text
src/ui-controller.ts: 4554 行
src/ui/accessory-panel-controller.ts: 381 行
src/ui/color-postfx-controller.ts: 186 行
src/ui/dof-panel-controller.ts: 398 行
src/ui/export-ui-controller.ts: 641 行
src/ui/layout-ui-controller.ts: 373 行
src/ui/lut-panel-controller.ts: 311 行
src/ui/lut-panel-state.ts: 101 行
src/ui/model-edge-controller.ts: 88 行
src/ui/runtime-feature-ui-controller.ts: 252 行
src/ui/scene-environment-ui-controller.ts: 137 行
src/ui/shader-panel-controller.ts: 394 行
```

分割済み:

- `ExportUiController`
  - output 設定、PNG / PNG sequence / WebM export、background export busy state。
- `SceneEnvironmentUiController`
  - ground / background image / background video / skydome。
- `RuntimeFeatureUiController`
  - AA / physics / shadow / rigid body visualizer / GI / physics gravity controls。
- `AccessoryPanelController`
  - accessory selector、transform slider、parent model / bone、visibility / delete。
- `LayoutUiController`
  - shader panel 開閉、UI fullscreen、timeline / shader / bottom panel resizer、viewport aspect presentation。
- `ShaderPanelController`
  - WGSL material preset、material list、selected / all material への preset 適用、外部 WGSL snippet validation。
- `DofPanelController`
  - DoF enabled / quality / focus / f-stop / focal length、focus target model / bone、shader panel への DoF controls 移動。
- `ColorPostFxController`
  - camera target 時の右パネル内の contrast / gamma / exposure / dithering / vignette / grain / sharpen / color curves saturation。
- `LutPanelController`
  - LUT enabled / preset / intensity、external LUT import、project-relative / absolute 保存用 state。
- `lut-panel-state.ts`
  - LUT registry key、現在選択値、LUT 保存計画などの pure helper。unit test あり。
- `ModelEdgeController`
  - model edge width の static slider / 右パネル slider、ショートカット後の UI 同期。

進捗感:

- `ui-controller.ts` は 2026-04 時点の 7,800 行超から 4,554 行まで減った。
- 行数ベースでは約 3 分の 1 弱を外へ逃がせた。
- 安全に切り出しやすい toolbar / panel / export / accessory / layout はかなり進んだ。
- まだ残っている大きな塊は、bloom / tone mapping / lens などの PostFX、camera controls、model info、timeline / keyframe 編集。

残作業の優先候補:

1. 右パネル PostFX controller 群
   - camera target 時の shader panel 内 PostFX controls。
   - LUT import / LUT preset / bloom / tone mapping / edge / distortion など。
   - shader panel から見えるが、責務としては描画効果 UI。
   - 1 つの `PostFxPanelController` にまとめすぎず、効果単位で小さく切る。
2. `ModelInfoPanelController`
   - model selector、visibility、delete、info action button。
   - accessory panel と近い形で切れる見込み。
3. `CameraPanelController`
   - camera slider、view preset、camera DoF 周辺との接続。
   - timeline / keyframe ほど危険ではないが、DoF との境界に注意する。
4. `TimelineEditUiController` / `KeyframePanelController`
   - keyframe add / delete / nudge、dirty state、interpolation、bone / morph / camera / accessory keyframe 登録。
   - MMD 編集体験の本丸なので最後に回す。

現時点の方針:

- 次に右パネルを続けるなら、PostFX 系 controller 群を独立させる。
- `ShaderPanelController` に PostFX / DoF まで抱えさせると、また巨大 controller になりやすい。
- `UIController` は当面 composition root / facade として残し、controller 間 callback と project load/save の橋渡しを担当させる。

## 参考にする設計: timeline.ts

`src/timeline.ts` はコードレビューで評価されていた通り、UI 実装として次の点が参考になる。

- ファイル先頭に、HTML 構造、描画レイヤー、更新条件が書かれている。
- 定数、pure helper、class の順に並ぶ。
- DOM 参照は constructor に集約されている。
- 外部公開 API が狭い。
- 内部状態は class 内に閉じている。
- 外部通知は callback に寄せている。
- `setupEvents`、Public API、Resize、RAF、Draw、Selection のように節が分かれている。
- 重い処理を直接連打せず、`scheduleStatic` のような更新要求にしている。
- scroll sync guard や selection reconcile のように、副作用の境界が名前で読める。

`ui-controller.ts` の分割でも、この形を真似る。

## 分割後 controller の基本形

新しい UI controller は、原則として次の形に寄せる。

```ts
export class SomeUiController {
    private readonly elements: SomeUiElements;

    public onStatusChanged: ((text: string, loading: boolean) => void) | null = null;
    public onToast: ((message: string, type: ToastType) => void) | null = null;

    constructor(deps: SomeUiControllerDeps) {
        this.elements = resolveSomeUiElements();
        this.setupEvents();
        this.refresh();
    }

    dispose(): void {
        // unsubscribe / clearInterval / removeEventListener が必要ならここで解放する。
    }

    refresh(): void {
        // 外部状態を DOM に反映する公開 API。
    }

    private setupEvents(): void {
        // DOM event listener を登録する。
    }
}
```

重要なルール:

- `UIController` の private メソッドを、そのまま巨大な別ファイルへ移すだけにしない。
- controller が持つ状態と、親へ callback で通知する状態を分ける。
- DOM 取得は `resolve...Elements()` のような関数に寄せ、null 許容の要素は型で明示する。
- `dispose()` を用意し、IPC unsubscribe や interval を controller 側で閉じる。
- 親 `UIController` は、全体 orchestration と controller 間の接続に寄せる。

## 分割候補と優先順位

### 1. ExportUiController

最初の切り出し候補。

対象:

- PNG 出力
- PNG sequence 出力
- WebM 出力
- output width / height / fps / quality / codec 設定
- background export の busy lock
- export state / progress の IPC bridge

理由:

- MMD 編集中核への副作用が比較的小さい。
- DOM と IPC と export request の境界が見えやすい。
- `UIController` 内でも関連メソッドが比較的まとまっている。
- `dispose()` の必要性が明確で、controller 分割の型を作りやすい。

持ってよい状態:

- output 設定同期中フラグ
- PNG sequence / WebM export の active state
- latest progress
- IPC unsubscribe callbacks
- background monitor interval

持たせない状態:

- `currentProjectFilePath`
- shader / LUT 状態
- timeline selection
- keyframe dirty state
- app 全体の toast / status 実装

親へ通知するもの:

- status text
- toast
- busy overlay 表示
- export 開始前に必要な project snapshot / output path の問い合わせ

### 2. AccessoryPanelController

次の候補。

対象:

- アクセサリ選択
- 表示 / 削除
- 親モデル / 親ボーン設定
- 位置 / 回転 / スケール slider
- アクセサリ transform keyframe 登録との接点

理由:

- パネル単位でまとまっている。
- `mmd-manager-x-extension.ts` 側の責務と対応しやすい。
- `UIController` からまとまった行数を減らしやすい。

注意点:

- keyframe dirty state は `UIController` 側に残すか、Keyframe controller 側に移すかを先に決める。
- アクセサリ transform keyframe 登録は timeline/keyframe 領域と接続するため、最初は callback で親へ通知する方が安全。

### 3. ShaderPanelController

対象:

- WGSL material preset
- material list
- 外部 WGSL snippet
- LUT / PostFX UI
- DoF controls の shader panel への接続

理由:

- UI と描画設定の境界が広く、単独 controller として切る価値が高い。
- `material-shader-service.ts` と関係が強く、将来的に型境界を整理しやすい。

注意点:

- WGSL / LUT / PostFX / DoF が混ざっているため、`ShaderPanelController` の中をさらに分ける可能性がある。
- レンダリング副作用が多いので、Export / Accessory より後にする。

### 4. TimelineEditUiController / KeyframePanelController

最後に扱う本丸。

対象:

- timeline selection
- keyframe add / delete / nudge
- interpolation preview / editing
- section keyframe dirty state
- camera / bone / morph / accessory keyframe 登録

理由:

- MMD 編集体験の中核で、価値が高い。
- ただし補間、ボーン、カメラ、モーフ、アクセサリが絡むため回帰リスクも高い。

注意点:

- `timeline.ts` 本体は既に独立性が高いので、まず周辺 UI と編集 service の境界を整理する。
- 補間曲線の runtime 反映は、UI とデータ編集が混ざりやすい。pure helper / service 化の候補。
- `editor/timeline-edit-service.ts` との責務重複を確認してから進める。

## 最初の実装ステップ案

### Step 1: ExportUiController の薄い追加

- `src/ui/export-ui-controller.ts` を追加する。
- 最初は output control と background export state bridge だけを移す。
- `exportPNG` / `exportPNGSequence` / `exportWebm` 本体は、1 回目ではまだ `UIController` に残してもよい。
- `dispose()` で IPC unsubscribe と interval を閉じる。

狙い:

- `UIController` から状態管理と cleanup を先に切り出す。
- 画面挙動の変更を最小にする。

### Step 2: Export request 作成を移す

- `getOutputSettings`
- `buildPngSequenceFolderName`
- `buildWebmFileName`
- export dialog / request 作成

このあたりを `ExportUiController` へ移す。

狙い:

- Export 領域を `UIController` から実質的に独立させる。
- main process 側の PNG/WebM 重複整理へつなげる。

### Step 3: UIController 側の facade 化

- `UIController` constructor で `new ExportUiController(...)` する。
- `UIController.dispose()` で `exportUiController.dispose()` を呼ぶ。
- `setupEventListeners()` から export クリック登録を削除する。

狙い:

- `UIController` は、controller 間の接続と全体状態だけを見る形へ寄せる。

## 直近の作業プラン

2026-04-16 時点では、まず `ExportUiController` を小さく導入する。
`UIController` を一気に置き換えるのではなく、状態管理、output 設定、export 実行本体を段階的に移す。

### Phase 0: 作業前の現状固定

作業前に、最低限の確認を通しておく。

```powershell
npm.cmd run lint
npm.cmd run smoke:launch
```

`smoke:launch` は WebGPU runtime 初期化まで確認するため、UI 分割後の起動回帰検知に使う。

### Phase 1: ExportUiController の土台追加

追加ファイル:

```text
src/ui/export-ui-controller.ts
```

最初に持たせる責務:

- export ボタンの DOM 解決。
- output 設定 DOM の DOM 解決。
- busy overlay DOM の DOM 解決。
- `dispose()` の用意。
- `hasBackgroundExportActive()` の公開。
- `refreshLocalizedState()` のような軽い公開 API。

この段階では、`exportPNG` / `exportPNGSequence` / `exportWebm` 本体は `UIController` 側に残してよい。

### Phase 2: background export state bridge を移す

最初に移す対象:

- `setupPngSequenceExportStateBridge`
- `applyPngSequenceExportState`
- `applyPngSequenceExportProgress`
- `setupWebmExportStateBridge`
- `applyWebmExportState`
- `applyWebmExportProgress`
- `startBackgroundExportMonitor`
- `refreshBackgroundExportLock`
- `updateBackgroundExportBusyMessage`
- `formatWebmExportPhaseLabel`
- `formatExportAge`

`UIController` からは callback で接続する。

```ts
this.exportUiController = new ExportUiController({
    onPausePlayback: () => this.pause(false),
});
```

`beforeunload` では、個別 unsubscribe を直接呼ばずに `ExportUiController.dispose()` へ寄せる。

```ts
this.exportUiController.dispose();
```

狙いは、IPC unsubscribe / interval / busy overlay 状態を `UIController` から剥がすこと。

### Phase 3: output controls を移す

次に output 設定まわりを移す。

- `setupOutputControls`
- `resolveSelectedOutputAspectRatio`
- `getOutputSettings`
- `clampOutputWidth`
- `clampOutputHeight`
- `outputAspectRatio`
- `isSyncingOutputSettings`

この領域は viewport aspect と接続しているため、`ExportUiController` へ getter / callback を渡す。

```ts
this.exportUiController = new ExportUiController({
    getViewportSize: () => ({
        width: this.viewportContainerEl?.clientWidth ?? 0,
        height: this.viewportContainerEl?.clientHeight ?? 0,
    }),
    onOutputAspectChanged: () => {
        this.applyViewportAspectPresentation();
        this.syncMainWindowPresentationAspect();
    },
});
```

この段階で、`UIController` は `this.exportUiController.getOutputSettings()` を呼ぶ形にする。

### Phase 4: project output state を移す

保存 / 読み込み用の output 設定も `ExportUiController` に寄せる。

- `exportOutputProjectState`
- `applyOutputProjectState`

`UIController` 側は次のような呼び出しに縮める。

```ts
project.output = this.exportUiController.exportProjectState();
this.exportUiController.applyProjectState(parsedProject.output);
```

ここまでで、output 設定の責務はほぼ `ExportUiController` に閉じる。

### Phase 5: export 実行本体を移す

最後に export 実行処理を移す。

- `exportPNG`
- `exportPNGSequence`
- `exportWebm`
- `buildPngSequenceFolderName`
- `buildWebmFileName`
- `sanitizeFileNameSegment`
- `joinPathForRenderer`

依存は callback で渡す。

```ts
this.exportUiController = new ExportUiController({
    mmdManager,
    buildProjectState: () => this.buildProjectStateForPersistence(),
    setStatus: (text, loading) => this.setStatus(text, loading),
    showToast: (message, type) => this.showToast(message, type),
});
```

`buildProjectStateForPersistence()` は、shader / LUT / project 全体状態と絡むため、最初は `UIController` 側に残す。

### Phase 6: UIController 側の削減

Export 移動後に削除する候補:

- `btnExportPng`
- `btnExportPngSeq`
- `btnExportWebm`
- `outputAspectSelect`
- `outputSizePresetSelect`
- `outputWidthInput`
- `outputHeightInput`
- `outputLockAspectInput`
- `outputQualitySelect`
- `outputFpsSelect`
- `outputWebmCodecSelect`
- `outputIncludeAudioInput`
- `outputAspectRatio`
- `isSyncingOutputSettings`
- PNG / WebM export state unsubscribe 群
- PNG / WebM export active / progress 群
- `backgroundExportMonitorIntervalId`
- `busyOverlayEl`
- `busyTextEl`

`appRootEl` は他用途が出る可能性があるため、最初は無理に移さなくてもよい。

### 最初のコミット単位

最初の実装コミットは、次の範囲に絞る。

```text
ExportUiController を追加し、background export state bridge / busy overlay / cleanup だけ移す
```

この範囲なら、export request 作成や project 保存形式に触れずに済み、回帰範囲を狭くできる。

### 実装メモ: 2026-04-16

実装は `src/ui/export-ui-controller.ts` を追加し、当初の最初のコミット単位より少し進めて、Phase 1 から Phase 5 までをまとめて移した。

移動済み:

- background export state bridge / progress / busy overlay / cleanup。
- output size / aspect / quality / fps / WebM codec / audio include の UI 状態。
- project output state の保存 / 復元。
- PNG 1 枚、PNG 連番、WebM の export 実行本体。

`UIController` に残したもの:

- export ボタンとショートカットの接続。
- `buildProjectStateForPersistence()`。
- project 保存 / 読み込み用の path helper。
- viewport canvas の実際の presentation aspect 適用。

次に削れる候補:

- export ボタン DOM の解決とイベント登録。
- `ExportUiController` へ渡している callback 群の型整理。
- `joinPathForRenderer` など renderer path helper の共通化。

### 実装メモ: SceneEnvironmentUiController

export 分割の次に、`src/ui/scene-environment-ui-controller.ts` を追加した。

移動済み:

- ground / background media / skydome の toolbar ボタン DOM 解決。
- ground / background media / skydome の click handler。
- `G` shortcut 相当の ground toggle。
- `B` shortcut 相当の背景黒 toggle。
- 背景画像 / 背景動画の読み込み処理。
- locale 変更時の toolbar 表示更新。

`UIController` に残したもの:

- load file routing から背景画像 / 動画 loader を呼ぶ接続。
- project / renderer path helper。
- ground 以外の表示系 shortcut。

### 実装メモ: RuntimeFeatureUiController

`src/ui/runtime-feature-ui-controller.ts` を追加し、runtime の表示 / 機能 toggle を切り出した。

移動済み:

- AA toggle。
- physics toggle。
- physics gravity / simulation rate の UI。
- shadow toggle。
- rigid body visualizer toggle。
- global illumination toggle。
- locale 変更時の toolbar 表示更新。

`UIController` に残したもの:

- MMD runtime callback から refresh を呼ぶ接続。
- モデル読み込み / 選択変更後に rigid body visualizer の状態を refresh する接続。
- shader panel / fullscreen UI など layout 系 toolbar。

### 実装メモ: AccessoryPanelController

`src/ui/accessory-panel-controller.ts` を追加し、アクセサリ UI を切り出した。

移動済み:

- accessory selector の DOM 解決と一覧 refresh。
- accessory transform slider / value label の同期。
- accessory parent model / bone selector の同期。
- accessory visibility / delete の操作。
- アクセサリ選択変更時の UI refresh。

`UIController` に残したもの:

- アクセサリ transform 変更時に section keyframe dirty を付ける接続。
- アクセサリ keyframe 登録処理。
- load file routing から accessory refresh を呼ぶ接続。

### 実装メモ: LayoutUiController

`src/ui/layout-ui-controller.ts` を追加し、layout / panel 表示まわりを切り出した。

移動済み:

- shader panel の開閉ボタンと表示状態。
- UI fullscreen / presentation mode の切り替え。
- timeline / shader panel / bottom panel の resizer。
- viewport container の aspect presentation 同期。
- output aspect 変更時の canvas 表示サイズ反映。
- window resize 時の panel 幅 / 高さ clamp。

`UIController` に残したもの:

- `ExportUiController` と `LayoutUiController` の接続。
- Escape / Alt+Enter shortcut から layout controller を呼ぶ接続。
- shader panel の中身そのもの。

注意点:

- `LayoutUiController` は `ExportUiController` の output aspect 設定を参照するため、controller 間の依存がある。
- shader panel 本体はまだ `UIController` に残っているので、次に shader panel を切る場合は、開閉状態と中身の責務境界を崩さないようにする。

### 実装メモ: ShaderPanelController

`src/ui/shader-panel-controller.ts` を追加し、右パネルの WGSL 材質割り当て UI を切り出した。

移動済み:

- shader model selector の event handler。
- shader preset apply / reset button の event handler。
- WGSL material preset 一覧の描画。
- material list の選択状態。
- selected / all material への shader preset 適用。
- 外部 WGSL toon snippet の validation と適用。
- bundled WGSL file scan の状態。

`UIController` に残したもの:

- camera target 時の PostFX / DoF controls 描画。
- LUT import / project-relative LUT 保存。
- DoF focus target controls。
- project 保存 / 読み込み時の外部 WGSL / LUT 連携。

注意点:

- 現時点の `ShaderPanelController` は、camera target では `UIController.renderShaderCameraPostEffectsPanel()` を callback で呼ぶ。
- PostFX / LUT / DoF は shader panel 内に描画されているが、実際の責務は描画効果と camera control にまたがるため、WGSL material panel と同時には移さなかった。
- 次に右パネルをさらに整理するなら、`PostFxPanelController` と `DofPanelController` に分ける方が安全。

### 実装メモ: DofPanelController

`src/ui/dof-panel-controller.ts` を追加し、DoF controls を切り出した。

移動済み:

- DoF enabled / quality / focus / focus offset / f-stop / near suppression / focal invert / lens size / focal length の UI。
- DoF lens blur strength の UI。
- focus target model / bone selector の同期。
- auto focus readout の更新。
- shader panel 内へ DoF controls を移す処理。
- camera panel へ DoF controls を戻す処理。

`UIController` に残したもの:

- camera target 時の PostFX controls 描画。
- PostFX controls から DoF controls の attach を呼ぶ接続。
- camera distance 変更や runtime tick から DoF auto focus readout を refresh する接続。
- lens distortion auto readout。

注意点:

- DoF controls は camera panel に実体 DOM があり、camera target 時だけ shader panel 内の PostFX controls へ移される。
- `DofPanelController` はこの DOM 移動を担当するが、PostFX / LUT 本体はまだ `UIController` 側に残っている。
- 次に右パネルを続ける場合は、PostFX 系 controller 群を作り、LUT / bloom / tone mapping / edge / distortion を効果単位で移す。

## 右パネル PostFX 分割プラン

camera target 時の右パネルには、LUT / bloom / tone mapping / edge / distortion などがまとまって残っている。
これを 1 つの `PostFxPanelController` に寄せると、`ShaderPanelController` から移しただけの巨大 controller になりやすい。
そのため、右パネル PostFX は効果単位の controller に分け、`UIController` は当面それらを組み立てる composition root として残す。

### 分割単位

#### 1. ColorPostFxController

対象:

- gamma。
- contrast。
- exposure。
- color temperature。
- color curve / vignette / grain / sharpen など、色調整系の slider。

理由:

- ファイル入出力や project path と絡みにくい。
- UI は slider / select 中心で、切り出し後の確認がしやすい。
- 最初の PostFX 分割として低リスク。

#### 2. LensEffectController

対象:

- lens distortion。
- distortion influence。
- lens edge blur。
- chromatic aberration。
- lens distortion auto readout。

理由:

- DoF と近い見た目の効果だが、責務は lens / screen-space 効果に寄っている。
- `DofPanelController` と分けることで、camera focus と lens distortion の境界を保ちやすい。

#### 3. ModelEdgeController

対象:

- model edge width。
- edge 関連 slider / checkbox。
- toolbar や shortcut から edge 状態を refresh する接続。

理由:

- MMD 表現として重要だが、LUT / bloom とは責務が違う。
- PMX / MMD の model edge 表現に近く、純粋な post effect ではない。
- 右パネルに表示されるが、責務としては model rendering style に寄せる。

#### 4. BloomToneMapController

対象:

- bloom enabled。
- bloom weight / threshold / kernel など。
- tone mapping type。
- tone mapping 関連の強度値。

理由:

- bloom と tone mapping は描画結果全体の見え方に強く影響する。
- 単独 controller にすることで、右パネルの中でも「全体ライティング後処理」として扱いやすい。

#### 5. LutPanelController

対象:

- LUT enabled。
- built-in LUT preset。
- external LUT import。
- LUT path の project-relative / absolute 保存。
- project 読み込み時の LUT 復元。

理由:

- 外部ファイル、renderer path helper、project 保存 / 読み込みに絡むため、PostFX の中ではややリスクが高い。
- 先に slider 系 controller を切ってから、最後に path / persistence を含む LUT を移す方が安全。

#### 6. ExperimentalPostFxController

対象:

- motion blur。
- SSR。
- volumetric light。
- fog。
- 実験的な PostFX toggle。

理由:

- 実験機能は変更頻度と不確実性が高い。
- MMD 本体ワークフローの安定化を優先するため、切り出し順としては後回しにする。

### 着手順

1. `ColorPostFxController`
2. `LensEffectController`
3. `ModelEdgeController`
4. `BloomToneMapController`
5. `ExperimentalPostFxController`

この順にすると、最初は DOM / slider / renderer state 同期だけで済む領域から始められる。
LUT は project 保存 / 読み込みと外部ファイル path が絡むため当初は後回し想定だったが、独立性が高く単体テストを導入しやすいため先に切り出した。

### UIController に残す接続

- camera target 時に右パネルを描画する composition。
- `ShaderPanelController` から camera target render callback を受ける接続。
- `DofPanelController` の attach / detach。
- project 保存 / 読み込み時の PostFX state bridge。
- `installRangeNumberInputs` のような共通 range / number 同期 helper。
- status / toast / dirty state の親 controller 側 callback。

### 確認観点

- camera target 選択時に右パネルが表示される。
- model target 選択時に WGSL material panel が従来通り表示される。
- PostFX slider を動かしても right panel の layout が崩れない。
- DoF controls の camera panel から shader panel への移動が壊れない。
- `npm.cmd run lint` が通る。
- `npm.cmd run smoke:launch` が通り、`engine=WebGPU` が報告される。
- LUT を触った変更では、project 保存 / 読み込み後に LUT 状態が復元される。

### 実装メモ: ColorPostFxController

`src/ui/color-postfx-controller.ts` を追加し、右パネル PostFX のうち色調整系だけを切り出した。

移動済み:

- contrast。
- gamma。
- exposure。
- dithering intensity。
- vignette weight。
- grain intensity。
- sharpen edge。
- color curves saturation。

`UIController` に残したもの:

- camera target 時の右パネル HTML composition。
- `installRangeNumberInputs` による range / number 同期。
- bloom / tone mapping / LUT / lens distortion / edge / experimental PostFX。
- project 保存 / 読み込み時の PostFX state bridge。

注意点:

- `ColorPostFxController` は描画済みの `.shader-postfx-controls` に接続する形にした。
- 色調整系は外部ファイル path や project persistence を持たないため、最初の PostFX 分割として低リスク。
- LUT は後回し想定だったが、独立性とテスト導入のしやすさを優先して先に切り出した。

### 実装メモ: LutPanelController

`src/ui/lut-panel-controller.ts` を追加し、右パネル PostFX の LUT 領域を切り出した。

移動済み:

- LUT source mode selector。
- LUT file load button。
- built-in / imported LUT preset option HTML。
- LUT enabled / intensity の UI 同期。
- external LUT import と normalize。
- imported LUT registry。
- project 保存時の `lutExternalPath` / sidecar file 計画。
- project 読み込み時の external LUT 復元。
- `.3dl` / `.cube` drag & drop 経路からの LUT import。

合わせて `src/ui/lut-panel-state.ts` を追加し、DOM や Electron API に依存しない LUT state helper を分離した。

単体テスト:

- `src/ui/lut-panel-state.test.ts`
  - imported LUT path の正規化。
  - built-in / external の現在選択値解決。
  - imported LUT 選択時の source mode 解決。
  - project-relative / external-absolute / missing external text の保存計画。

`UIController` に残したもの:

- camera target 時の右パネル HTML composition。
- project 保存時の実ファイル書き出し。
- project 読み込み時の project-relative path 解決。
- status / toast / shader panel refresh callback。

注意点:

- LUT は外部ファイルと project persistence を持つため、`ColorPostFxController` より controller 境界が太い。
- DOM 操作と Electron dialog / file read は `LutPanelController`、保存計画などの判定は `lut-panel-state.ts` に逃がした。
- `mmdManager.importProjectState()` は project 内の LUT path を一度 runtime に入れるため、読み込み後に `LutPanelController.restoreProjectExternalAsset()` で normalized runtime text を戻す。
- 次に右パネルを続けるなら、project persistence を持たない `LensEffectController` が扱いやすい。

### 実装メモ: ModelEdgeController

`src/ui/model-edge-controller.ts` を追加し、model edge width の UI を切り出した。

移動済み:

- static controls 側の `effect-edge-width` slider。
- camera target 時の右パネル `data-postfx="edge-width"` slider。
- edge width 変更時の `mmdManager.modelEdgeWidth` 反映。
- ショートカットで edge ON / OFF した後の static / 右パネル UI 同期。

`UIController` に残したもの:

- edge ON / OFF shortcut の restore 値。
- camera target 時の右パネル HTML composition。
- `installRangeNumberInputs` による range / number 同期の全体処理。

注意点:

- 現時点の edge UI は幅だけなので、controller は小さく保った。
- PMX / MMD の model edge 表現に近いため、PostFX controller ではなく `ModelEdgeController` とした。
- 後で edge color、材質別 edge、toon edge 補正などを増やす場合は、この controller に項目を足す。
- static slider と右パネル slider の両方が同じ runtime 値を見るため、`refresh()` で両方を同期する。

## 切り出し時の確認観点

- PNG 1 枚出力が動く。
- PNG sequence export window が開く。
- WebM export window が開く。
- background export 中に busy overlay が出る。
- export 完了後に busy overlay が解除される。
- output size preset / aspect lock / quality / fps が従来通り同期する。
- locale 変更後に表示テキストが破綻しない。
- `npm.cmd run lint` が通る。
- `npm.cmd run smoke:launch` が通り、`engine=WebGPU` が報告される。

## やらないこと

短期分割では、次はやらない。

- `UIController` の全面置換。
- state management library の導入。
- DOM 構造の大幅変更。
- shader / timeline / keyframe の同時分割。
- MMD 編集挙動の仕様変更。

## 期待する最終形

最終的には、`UIController` は次の役割へ縮小する。

- 主要 controller の生成
- controller 間 callback の接続
- `MmdManager` / `Timeline` / `BottomPanel` の橋渡し
- 全体 lifecycle の管理

個別 UI は、以下のように分かれている状態を目指す。

- `ExportUiController`
- `AccessoryPanelController`
- `ShaderPanelController`
- `TimelineEditUiController`
- `CameraPanelController`
- `PhysicsPanelController`

ただし、これは最終目標であり、短期では Export と Accessory の 2 つを切り出せれば十分に効果がある。
