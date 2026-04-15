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

## 切り出し時の確認観点

- PNG 1 枚出力が動く。
- PNG sequence export window が開く。
- WebM export window が開く。
- background export 中に busy overlay が出る。
- export 完了後に busy overlay が解除される。
- output size preset / aspect lock / quality / fps が従来通り同期する。
- locale 変更後に表示テキストが破綻しない。
- `npm.cmd run lint` が通る。

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
