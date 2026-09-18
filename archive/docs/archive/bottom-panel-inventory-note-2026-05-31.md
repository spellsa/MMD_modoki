# 下パネル棚卸し / UI抽象化メモ 2026-05-31

## 目的

v0.2 UI では、下パネルを本家 MMD 寄せに整理し、`モデルモード` と `カメラモード` で表示する項目を切り替える。

このメモでは、現行の下パネル DOM / Controller の責務を棚卸しし、次に入れるべき薄い UI 抽象化を決める。

前提:

- タイムラインは mode 共通で使う。
- 下パネルは現在値編集とキー登録の主導線にする。
- 低頻度設定はメニューバー + ポップアップへ逃がす。
- 初回は大規模再実装ではなく、既存 DOM の show / hide と責務分離から始める。

## 現行構成

現行 HTML では `#bottom-panel .bottom-panel-inner` に複数の `section.bottom-section` が横並びで固定配置されている。

| section | 現在の役割 | 主な制御元 | 所感 |
| --- | --- | --- | --- |
| `info-section` | 対象モデル選択、影 ON/OFF、表示/非表示、削除、モデル情報 | `ModelInfoPanelController`, `UIController` | 共通欄候補。ただしモデル削除などは model 寄りの操作でもある。 |
| `interpolation-section` | 選択トラックの補間、コピー、ペースト、線形 | `UIController` | model / camera 共通。ただし選択トラック依存が強い。 |
| `bone-section` | ボーン選択、ボーン transform、Camera 選択時は camera transform | `BottomPanel`, `UIController` | 現在は model bone と camera 操作を同居させている。mode 分離の中心課題。 |
| `morph-section` | 表示枠選択、モーフ weight 編集 | `BottomPanel`, `UIController` | モデルモード専用に近い。 |
| `camera-section` | 前後左右上下、剛体表示、Mirror床、DoF/Fog 旧配置 | `CameraPanelController`, `RuntimeFeatureUiController`, `SceneEnvironmentUiController`, DoF/Fog 系 Controller | 名前は camera だが実体は表示欄 + 旧詳細設定置き場。整理優先度が高い。 |
| `physics-section` | 演算 Hz、重力、重力方向 | `RuntimeFeatureUiController` 周辺 | 現在 hidden。重力設定ポップアップへ移行済みのため、下パネル常設からは外す候補。 |
| `lighting-section` | ライト方向、光色、影色、影品質、接地影など | `UIController.refreshLightingUiFromRuntime()` と各 Action | 常用の照明キー項目と低頻度の影品質設定が混ざっている。 |
| `accessory-section` | アクセサリ選択、transform、表示/非表示、削除、親モデル/ボーン | `AccessoryPanelController`, `UIController` | カメラモード寄りだが、共通欄として残す案もある。 |
| `output-section` | PNG/WebM 出力、比率、サイズ、FPS、音声、範囲、capture mode | `ExportUiController`, WebM popup | WebM 設定ポップアップへ移行済み。下パネルからは非表示化候補。 |

CSS では `.bottom-panel-inner` が `repeat(8, minmax(0, 1fr))` の固定グリッドで、各 section は `order` だけで並び替えられている。
mode ごとの表示切替や、section の幅配分を表現する仕組みはまだない。

## 現行の結合点

`BottomPanel` クラスは名前に反して、主に `bone-section` と `morph-section` を担当している。

担当していること:

- `bone-select` / `bone-controls`
- `morph-frame-select` / `morph-controls`
- ボーン / Camera の transform slider 生成
- モーフ slider 生成
- runtime からの同期
- ボーン / モーフ編集イベントの通知

一方で、下パネル全体の section 管理は `BottomPanel` にはない。
`info-section`、`lighting-section`、`accessory-section`、`output-section` は `UIController` や個別 Controller が直接 DOM を掴んでいる。

重要な同期経路:

- toolbar の `モデル` / `カメラ` ボタンは `model.selectTimelineTarget` を dispatch する。
- `applyActiveModelSelectionUI()` は active model の bone / morph / info を `BottomPanel` へ流す。
- `applyCameraSelectionUI()` は疑似 `ModelInfo` として `Camera` を `BottomPanel` へ流し、`bone-section` で camera transform を表示する。
- camera 変更時は `handleCameraTransformChanged()` が `bone-section` の `Camera` slider と dirty state を同期する。
- section ごとの keyframe button は `UIController` が `info / interpolation / bone / morph / accessory` の dirty / registered 状態をまとめて更新している。

このため、mode 切替を入れるだけなら CSS / DOM の show-hide で可能だが、長期的には「下パネル全体の layout」と「個別 section の中身」を分ける必要がある。

## mode 別分類案

### 共通欄候補

| section | 方針 |
| --- | --- |
| `info-section` | 共通。ただし camera mode では Camera 情報を出すか、対象選択を簡略化する。 |
| `interpolation-section` | 共通。選択トラックが camera / bone / morph / accessory のどれでも使う。 |
| `accessory-section` | 当面は共通候補。MMD 本家では camera 側に近いが、MMD_modoki ではアクセサリ操作頻度が model/camera をまたぐ可能性がある。 |
| 再生欄 | まだ下パネルに統合されていない。次段階で timeline 上部から共通欄へ移す候補。 |

### モデルモード候補

| section | 方針 |
| --- | --- |
| `bone-section` | モデルボーン専用に寄せる。Camera の疑似ボーン扱いは後続で分離する。 |
| `morph-section` | モデルモード専用。 |
| `interpolation-section` | 共通だが、model track 選択時の利用頻度が高い。 |

### カメラモード候補

| section | 方針 |
| --- | --- |
| camera transform 欄 | 現在は `bone-section` 内の `Camera` として表示している。後続で `camera-edit-section` として分離したい。 |
| `lighting-section` | カメラモード寄り。ライト方向 / 光色 / 影色など、キーフレームに関わる常用項目を残す。 |
| `accessory-section` | カメラモード寄りだが、当面は共通でもよい。 |
| 表示欄 | 前後左右上下は必要。現在の `camera-section` から表示切替専用 section として残す候補。 |

### ポップアップ / メニューへ逃がす候補

| 現在位置 | 方針 |
| --- | --- |
| `output-section` | WebM popup ができたため、下パネルから非表示化する候補。PNG 直出力は File メニュー / 必要なら小ボタンで扱う。 |
| Mirror床詳細 | 背景設定ポップアップへ移行済み。下パネルからは削除候補。 |
| 物理 Hz / 重力方向 | 重力設定ポップアップへ移行済み。`physics-section` は常設しない候補。 |
| 影品質、影距離、bias、接地影詳細 | 照明/影品質設定ポップアップへ移行済み。下パネルの `lighting-section` には常用のライト/影色だけ残す。 |
| DoF / Fog 詳細 | Effect 右パネル担当。`camera-section` 内の旧 DOM は整理候補。 |
| 剛体表示 | 物理演算メニュー / 表示操作。下パネル常設からは外す候補。 |

## 抽象化方針

必要なのは、下パネル全体を作り直す UI framework ではなく、既存 section を mode ごとに並べ替え / 表示切替する薄い layer。

案:

```ts
type BottomPanelMode = "model" | "camera";

type BottomPanelSectionId =
    | "info"
    | "interpolation"
    | "bone"
    | "morph"
    | "camera"
    | "lighting"
    | "accessory"
    | "output"
    | "physics";

type BottomPanelSectionRole = "common" | "model" | "camera" | "popup-candidate";

type BottomPanelSectionController = {
    id: BottomPanelSectionId;
    element: HTMLElement;
    role: BottomPanelSectionRole;
    setVisible(visible: boolean): void;
    refresh?(): void;
};
```

初回は既存 DOM を包むだけでよい。
`mount()` / `unmount()` で作り直すより、`element.hidden` と CSS class の切替に留める。

layout 定義例:

```ts
const bottomPanelLayouts: Record<BottomPanelMode, BottomPanelSectionId[]> = {
    model: ["info", "interpolation", "bone", "morph", "accessory"],
    camera: ["info", "interpolation", "camera", "lighting", "accessory"],
};
```

初回で `output` と `physics` は layout から外す。
`output-section` は実装直前の決定により削除対象にするが、既存 popup / serializer / controller の依存を先に解消する。
`physics-section` は重力設定ポップアップを正とし、常設 DOM は削除候補にする。

## 実装段階案

### Step 1: 棚卸し結果を反映するだけの layout controller

- `BottomPanelLayoutController` を追加する。
- `#bottom-panel` 配下の既存 section を登録する。
- `model` / `camera` mode に応じて section の `hidden` と `order` を制御する。
- toolbar の model / camera 切替、`applyActiveModelSelectionUI()`、`applyCameraSelectionUI()` から layout を更新する。
- 中身の Controller はまだ移動しない。

この段階の目的は「mode によって出す欄が変わる」ことだけ。

### Step 2: 低頻度 section を下パネルから外す

- `output-section` を layout から外す。
- `physics-section` は hidden 維持。重力設定ポップアップを正とする。
- `camera-section` から Mirror床 / DoF / Fog 旧 DOM を外す候補を整理する。
- `lighting-section` は常用項目と品質設定を分け、品質系はポップアップを正とする。

### Step 3: Camera を bone-section から分離する

- 現在の `BottomPanel.CAMERA_CONTROL_NAME = "Camera"` 方式をやめる準備をする。
- `camera-edit-section` または `CameraPanelController` 管轄 section を作る。
- camera keyframe dirty state は `bone` ではなく `camera` section として扱うか検討する。

### Step 4: section controller を必要な範囲で分割する

- `BottomPanel` は `BonePanelController` と `MorphPanelController` へ分割候補。
- `BottomPanelLayoutController` は section の可視性と順序だけを見る。
- `UIController` は mode 切替、Action 接続、timeline / viewport 同期の orchestration に寄せる。

## 注意点

- `BottomPanel` は camera transform も扱っているため、いきなり model 専用にすると camera keyframe 登録が壊れやすい。
- section keyframe button は `UIController` が横断管理している。mode 非表示時の dirty state と登録状態をどう扱うか確認が必要。
- `output-section` は WebM popup と DOM 同期しているため、削除前に `ExportUiController` / popup 側へ state を移す。
- `lighting-section` は常用項目と低頻度項目が混在している。単純に camera mode 専用へ移すだけでは、影品質 popup との重複が残る。
- `accessory-section` は model/camera のどちらに置くか悩ましい。初回は共通扱いが安全。

## 次の実装候補

最初の実装スライスは以下がよい。

1. `BottomPanelLayoutController` を追加する。
2. 既存 section を `model / camera / hidden` layout に割り当てる。
3. `output-section` と `physics-section` は下パネル layout から外す。
4. `model` mode は `info / interpolation / bone / morph / accessory` を表示する。
5. `camera` mode は `info / interpolation / camera / lighting / accessory` を表示する。
6. 既存の中身の処理はできるだけ触らず、表示切替だけを確認する。

これで下パネルの大枠を mode 別に分けられる。
その後、Camera の疑似 bone 扱い解除、再生欄の下パネル統合、照明欄の常用/詳細分離へ進む。

## BottomPanelLayoutController 詳細案

### 役割

`BottomPanelLayoutController` は、下パネル section の「表示する / しない」「並び順」「mode 用 class」を管理するだけに留める。

持たせる責務:

- 現在の `BottomPanelMode` を保持する。
- 既存 DOM section を id 付きで登録する。
- mode ごとの layout 定義に従って `hidden` と `style.order` を更新する。
- `#bottom-panel` または `.bottom-panel-inner` に `data-bottom-panel-mode` / mode class を付ける。
- layout 適用後に必要な section refresh callback を呼ぶ。

持たせない責務:

- section 内の slider / select のイベント登録。
- runtime や `MmdManager` への直接アクセス。
- keyframe 登録、dirty state、timeline 選択同期。
- DOM を作り直すこと。
- section の保存/読み込み仕様を判断すること。

つまり、`BottomPanelLayoutController` は layout の交通整理係であり、編集ロジックの所有者にはしない。

### 最小 interface 案

```ts
export type BottomPanelMode = "model" | "camera";

export type BottomPanelSectionId =
    | "info"
    | "interpolation"
    | "bone"
    | "morph"
    | "camera"
    | "lighting"
    | "accessory"
    | "output"
    | "physics";

export type BottomPanelLayoutDefinition = {
    mode: BottomPanelMode;
    visibleSections: BottomPanelSectionId[];
    hiddenSections?: BottomPanelSectionId[];
};

export type BottomPanelSectionEntry = {
    id: BottomPanelSectionId;
    element: HTMLElement;
    refresh?: () => void;
};

export class BottomPanelLayoutController {
    constructor(options: {
        root: HTMLElement;
        sections: BottomPanelSectionEntry[];
        layouts: Record<BottomPanelMode, BottomPanelLayoutDefinition>;
    });

    getMode(): BottomPanelMode;
    applyMode(mode: BottomPanelMode): void;
    refreshVisibleSections(): void;
}
```

初回では `visibleSections` に含まれない section はすべて `hidden = true` にする。
`hiddenSections` は将来、「DOM は残すが layout からは常に外す」項目を明示したい場合の拡張余地として扱う。

### layout 初期値

初回実装の既定 layout は以下にする。

```ts
const bottomPanelLayouts = {
    model: {
        mode: "model",
        visibleSections: ["info", "interpolation", "bone", "morph", "accessory"],
    },
    camera: {
        mode: "camera",
        visibleSections: ["info", "interpolation", "camera", "lighting", "accessory"],
    },
} satisfies Record<BottomPanelMode, BottomPanelLayoutDefinition>;
```

`output-section` と `physics-section` は初回 layout から外す。
ただし DOM と既存 Controller は残す。

理由:

- `output-section` は WebM popup と既存 DOM 同期が残っているため、削除は後続にする。
- `physics-section` はすでに hidden で、重力設定ポップアップを正とする。
- まず「見える下パネル」を mode 別に整理することを優先する。

### DOM 探索方針

`BottomPanelLayoutController` 内で `document.getElementById()` を散らさず、生成側で section entry を渡す。

例:

```ts
const bottomPanelLayoutController = new BottomPanelLayoutController({
    root: document.querySelector(".bottom-panel-inner") as HTMLElement,
    sections: [
        { id: "info", element: document.getElementById("info-section")! },
        { id: "interpolation", element: document.getElementById("interpolation-section")! },
        { id: "bone", element: document.getElementById("bone-section")! },
        { id: "morph", element: document.getElementById("morph-section")! },
        { id: "camera", element: document.getElementById("camera-section")! },
        { id: "lighting", element: document.getElementById("lighting-section")!, refresh: () => this.refreshLightingUiFromRuntime() },
        { id: "accessory", element: document.getElementById("accessory-section")!, refresh: () => this.accessoryPanelController?.refresh() },
        { id: "output", element: document.getElementById("output-section")! },
        { id: "physics", element: document.getElementById("physics-section")! },
    ],
    layouts: bottomPanelLayouts,
});
```

初回は `UIController` が生成してよい。
後続で `BottomPanelShell` のような親クラスを作る場合も、この entry 形式なら移しやすい。

### mode 適用タイミング

mode は `MmdManager.getTimelineTarget()` を正とする。

呼び出し候補:

- `applyActiveModelSelectionUI()` の最後で `applyMode("model")`
- `applyCameraSelectionUI()` の最後で `applyMode("camera")`
- project load 後、timeline target 復元後に現在 target から再適用
- model 未読み込み時は camera mode 扱いにする

toolbar button の active 表示は既存 `refreshToolbarTimelineTargetSwitch()` が担当する。
`BottomPanelLayoutController` は toolbar を触らない。

### hidden section の扱い

非表示 section は `element.hidden = true` を正とする。
CSS では以下のような generic rule を追加する程度に留める。

```css
.bottom-section[hidden] {
  display: none !important;
}
```

現状は `#physics-section[hidden]` だけ特別扱いになっているため、初回実装で generic 化してよい。

`style.order` は visible section の配列順に `1, 2, 3...` を振る。
CSS 側の固定 `#bone-section { order: 2; }` などは、初回では残しても動くが、layout controller 適用後は不要になる。
ただし CSS 削除は表示確認後の後続に回してもよい。

### refresh の扱い

`applyMode()` は section 表示を変えた後、見えている section の `refresh()` だけ呼ぶ。

初回で呼ぶ価値があるもの:

- `info`: `modelInfoPanelController?.refresh()` は既存 `refreshModelSelector()` と重複しやすいので、初回は呼ばない。
- `lighting`: `refreshLightingUiFromRuntime()`
- `accessory`: `accessoryPanelController?.refresh()`
- `camera`: `refreshCameraUiFromRuntime(true)`

ただし refresh は副作用があるため、最初は `applyActiveModelSelectionUI()` / `applyCameraSelectionUI()` の既存 refresh を優先し、layout controller の `refreshVisibleSections()` は明示呼び出し用に残すだけでもよい。

推奨初回:

- `applyMode()` は visibility / order のみ。
- 既存 refresh 経路は触らない。
- 表示切替で stale 表示が出たら、該当 section だけ refresh callback を追加する。

## 既存クラスとの境界

### `BottomPanel`

当面は `bone-section` / `morph-section` の中身 Controller として扱う。
クラス名は実態とずれているが、初回で rename しない。

後続候補:

- `BottomPanel` -> `BoneMorphPanelController`
- camera 疑似 bone 処理を `CameraPanelController` 側へ移す。
- `getSelectedBone()` など UIController が依存している API を段階的に置き換える。

### `CameraPanelController`

現在の `camera-section` を引き続き担当する。
初回では section の中身を整理しない。

ただし、将来的には `camera-section` を以下に分けたい。

- `view-section`: 前後左右上下、表示 toggle など。
- `camera-edit-section`: camera target / rotation / distance / fov / keyframe。
- DoF / Fog / Mirror 詳細はそれぞれ Effect panel / popup へ退避。

### `UIController`

初回では orchestration の中心のままでよい。

担当を残すもの:

- Action dispatch。
- toolbar mode switch。
- timeline / viewport / panel 同期。
- section keyframe button state。
- project load 後の全体 refresh。

増えるもの:

- `bottomPanelLayoutController` フィールド。
- target 切替時の `applyMode()` 呼び出し。

増やさないもの:

- 下パネル section 内 UI の新規ロジック。
- layout 定義以外の大規模な DOM 再構成。

## 初回実装の受け入れ条件

機能面:

- Model mode では `info / interpolation / bone / morph / accessory` が表示される。
- Camera mode では `info / interpolation / camera / lighting / accessory` が表示される。
- `output-section` と `physics-section` は下パネルに表示されない。
- toolbar の `モデル` / `カメラ` 切替と下パネル表示が一致する。
- model 未読み込み時は camera mode 表示になる。
- 既存の `File > 動画出力設定...` から WebM popup が開き、既存 DOM 同期に問題が出ない。

回帰確認:

- Model mode でボーン選択、ボーン slider、ボーン keyframe 登録が動く。
- Model mode でモーフ表示枠、モーフ slider、モーフ keyframe 登録が動く。
- Camera mode で前後左右上下ボタンが動く。
- Camera mode で照明/影色の主要 slider が動く。
- Accessory section が表示 mode に関係なく壊れない。
- section keyframe button の dirty / registered 表示が、表示中 section で破綻しない。

見た目:

- 下パネルに空白 slot が残らない。
- 5 section 表示時に各 section が極端に狭くならない。
- hidden section の border が残らない。
- 1080p 程度のウィンドウで見切れが悪化しない。

## 実装しないこと

初回スライスでは以下をやらない。

- `BottomPanel` の rename / 分割。
- Camera の疑似 bone 扱い解除。
- 再生欄の下パネル移動。
- `physics-section` DOM 削除。
- lighting section の常用/詳細分離。
- CSS grid の本格再設計。

これらを同時にやると、layout 変更と編集ロジック変更が混ざって問題切り分けが難しくなる。

## 次の実装プラン候補

次に実装するなら、以下の順が安全。

1. `src/ui/bottom-panel-layout-controller.ts` を追加する。
2. `UIController` で section entry を生成し、`bottomPanelLayoutController` を持つ。
3. `applyActiveModelSelectionUI()` / `applyCameraSelectionUI()` で mode を適用する。
4. `.bottom-section[hidden]` の CSS を追加する。
5. `output-section` 削除後も WebM popup が動き、`physics-section` 退避後も重力 popup が動くことを確認する。
6. 見た目確認後、必要なら `.bottom-panel-inner` の grid 列数を `repeat(auto-fit, minmax(...))` か visible section 数に応じた class へ調整する。

この段階では、下パネルの「構成」を変えるだけに留める。
中身の再設計は、layout controller が安定してから別スライスで進める。

## 実装直前の決定事項

2026-05-31 時点の方針として、下パネルは v0.1 世代の暫定 UI を温存しすぎず、v0.2 用にきれいにまとめ直す。

決定:

- `output-section` は下パネルから削除してよい。
  - PNG 画像出力はメニューバーにあるため、下パネル常設ボタンは不要。
  - WebM 設定はポップアップを正とする。
- Mirror床の操作は下パネル常設ではなく、メニューバー / 背景設定ポップアップ側へ退避する。
- 現在使っていない旧 DoF / Fog DOM は削除してよい。
  - DoF / Fog は Effect 右パネルまたは後続の専用 UI で扱う。
  - `camera-section` に古い詳細設定を残して見通しを悪くしない。
- 初回実装では、`camera-section` を「表示欄」として整理する。
  - 残す候補は前後左右上下の視点切替。
  - 剛体表示は物理演算メニュー側へ寄せる。
- `physics-section` は下パネル常設に戻さない。
  - 重力や物理詳細は重力設定ポップアップを正とする。

この決定により、初回実装は単なる show / hide ではなく、不要になった下パネル DOM の整理も含める。
ただし `BottomPanel` の bone / morph 実装分割や Camera の疑似 bone 扱い解除は、別スライスに分ける。

更新後の初回 layout 候補:

```ts
const bottomPanelLayouts = {
    model: {
        mode: "model",
        visibleSections: ["info", "interpolation", "bone", "morph", "accessory"],
    },
    camera: {
        mode: "camera",
        visibleSections: ["info", "interpolation", "camera", "lighting", "accessory"],
    },
} satisfies Record<BottomPanelMode, BottomPanelLayoutDefinition>;
```

初回で削除 / 退避する DOM:

- `output-section`
- `physics-section`
- `camera-section` 内の Mirror床詳細
- `camera-section` 内の旧 DoF / Fog 詳細
- `camera-section` 内の剛体表示ボタン

初回で残す DOM:

- `info-section`
- `interpolation-section`
- `bone-section`
- `morph-section`
- `camera-section` の視点切替
- `lighting-section`
- `accessory-section`

実装時の注意:

- WebM popup が既存 `output-*` DOM に依存している場合は、削除前に popup 側へ state を移すか、非表示の互換 DOM を一時的に残す必要がある。
- `ExportUiController` が `output-section` 内 DOM を直接掴むため、削除するなら `ExportUiController` の責務整理も同じスライスに含める。
- `SceneEnvironmentUiController` / `CameraPanelController` / DoF / Fog 系 Controller が削除対象 DOM を参照しているため、参照解除または右パネル側への移管を確認する。
