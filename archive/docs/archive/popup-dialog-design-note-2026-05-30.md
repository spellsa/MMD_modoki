# ポップアップ / ダイアログ設計メモ 2026-05-30

## 目的

v0.2 UI では、常時表示する編集 UI と、必要なときだけ開く詳細 UI を分離する。

現行の下パネルには、ボーン、モーフ、カメラ、照明、アクセサリ、表示、出力などが同じ密度で並んでいる。特に出力欄は設定項目が多く、常時編集する対象ではないため、下パネルの占有が大きい。

このメモでは、メニューバーから開くポップアップ / ダイアログ / ドロワーの共通方針を定める。最初の実装対象は `出力設定` とする。

## 基本方針

- メニューバーは詳細 UI の入口として扱う。
- 常時操作が必要なものはトップバー、左タイムライン、下パネル、Effect パネルに残す。
- 頻度が低い設定、確認、実行前条件はポップアップ / ダイアログ / ドロワーへ退避する。
- 実装は Electron native menu ではなく renderer 側の HTML / CSS を主とする。
- 既存の `data-i18n` / `data-i18n-title` 方式で翻訳できる形にする。
- 実行処理は既存の Action / Controller 経路を優先し、ポップアップ内から直接 runtime を触りすぎない。

## 用語

### Dropdown menu

メニューバー直下に出るコマンド一覧。

用途:

- ファイル読込
- 保存
- 表示切替
- 既存 Action の直接実行
- 詳細ポップアップを開く入口

### Popover

軽量な一時設定パネル。開いたまま長時間作業するものではない。

用途:

- 小さな表示オプション
- 簡易プリセット選択
- すぐ閉じる補助設定

### Modal dialog

明示的に開いて、設定確認や実行を行う画面。

用途:

- 出力設定
- アプリ設定
- 背景設定
- モデルエッジ設定
- Help / About

### Drawer

広めの情報表示、診断、スタック編集に使うサイドパネル。

用途:

- FrameGraph 診断
- Render Resource Registry 表示
- Effect スタック詳細
- 将来のカスタム Post Effect 編集

## 対象と非対象

### 対象

- 出力設定
- アプリ設定
- 背景画像 / 動画設定
- モデルエッジ設定
- 重力設定
- Help / About
- Diagnostics
- FrameGraph / Render Resource Registry 表示
- 将来の Effect ブロック詳細

### 非対象

- タイムライン本体
- 再生 / 停止 / フレーム移動
- ボーンの直接操作
- モーフ値の常時編集
- カメラ値の常時編集
- アクセサリ transform の常時編集
- Effect パネル本体

これらは頻繁に触るため、下パネルや専用パネル側に残す。

## 初期実装対象: 出力設定

最初に `OutputDialog` を作り、下パネルの出力欄を吸収する。

### メニュー入口

`ファイル` メニュー配下:

- PNG出力...
- PNG連番出力...
- WebM出力...
- 出力設定...

既存の即時出力コマンドは残す。ただし詳細条件は `出力設定` ダイアログで編集できるようにする。

### 出力設定に置く項目

- 出力形式
  - PNG
  - PNG連番
  - WebM
- アスペクト比
- 解像度プリセット
- 幅 / 高さ
- FPS
- 音声あり
- 再生範囲を使う
- WebM capture mode
- 将来: 保存先
- 将来: quality / codec
- 将来: export progress / cancel

### 下パネルから退避する項目

`output-section` は最初は DOM を残したまま非表示にする。

理由:

- 既存 controller が DOM ID 前提で参照している。
- 一度に DOM を削除すると回帰範囲が大きい。
- ポップアップ側の同期が安定した後で、出力欄 DOM と controller を整理できる。

## ポップアップ化候補の棚卸し

現行 UI には、すでにメニューへ入口を移したもの、`hidden` のまま残っているもの、実験扱いで通常表示から外したいものが混在している。これらは下パネル整理の前に、ポップアップ / ダイアログ / ドロワーの受け皿へ分類する。

### 優先度 A: すぐ退避したいもの

#### 出力設定

理由:

- 下パネル占有が大きい。
- 常時操作ではない。
- File メニューとの相性がよい。
- project 保存 / 読み込みとの同期対象が明確。

候補項目:

- PNG / PNG連番 / WebM
- aspect
- resolution
- FPS
- audio include
- playback range
- capture mode
- quality

形式:

- Modal dialog を第一候補にする。
- 出力中 progress / cancel は同じ dialog か busy overlay で扱う。

#### 背景設定

理由:

- 背景画像 / 動画は読み込み入口だけでは不十分。
- 現状は選択 / clear / 管理導線が弱い。
- MMD 本家でも背景はメニューから操作する感覚に近い。

候補項目:

- 背景画像選択
- 背景動画選択
- clear
- 表示 / 非表示
- 黒背景
- skydome
- mirror floor
- mirror resolution
- fit mode
- opacity
- loop / mute

形式:

- Modal dialog または軽めの popover。
- ファイル選択や clear が入るなら dialog 寄り。

#### モデルエッジ設定

理由:

- ON / OFF は View menu でよい。
- width / color / per-model など詳細設定は常時表示するほどではない。
- MMDer には「エッジ」は独立した見た目調整として分かりやすい。

候補項目:

- edge ON / OFF
- width
- color
- per-model override
- per-material override
- reset

形式:

- Modal dialog。
- 将来 Effect / Shader Material 側からも開けるようにする。

#### 重力設定

理由:

- 物理欄は現状 `physics-section` が hidden。
- 重力は頻繁操作というより、物理確認時の条件設定。
- Camera Mode の下パネル候補ではあるが、詳細設定はポップアップ向き。
- 物理演算系の設定は今後 simulation rate、backend 情報、diagnostics へ広がるため、重力単独 dialog より `PhysicsSettingsDialog` にまとめる方が拡張しやすい。

候補項目:

- gravity acceleration
- direction X / Y / Z
- reset to MMD default
- simulation rate later
- physics backend diagnostics later
- rigid body visualization detail later
- stabilization / constraint options later

形式:

- `物理演算` メニューから `物理設定...` を開く。
- `物理設定` dialog の最初の section として `重力` を置く。
- Camera Mode 下パネルには簡易値や入口だけ置く案もあり。
- メニュー直下には `物理演算 ON/OFF` と `剛体表示 ON/OFF` のような即時 toggle だけ残す。

初期メニュー案:

```text
物理演算
  物理演算を有効/無効
  剛体表示を有効/無効
  物理設定...
```

`重力設定...` を単独メニュー項目として残すより、`物理設定...` に吸収する方を第一候補にする。

### 優先度 B: 整理時に退避を検討するもの

#### Runtime mode

現状:

- トップバーから退避済み。
- Help menu 内の `Runtime: Classic / WASM` で切替可能。

候補:

- Preferences dialog へ移す。
- Help menu 直下に残すのは暫定。

形式:

- Preferences dialog。

#### Language

現状:

- トップバーに常時表示へ戻した。

判断:

- 日本語メニューが読めない状態でも言語選択できる必要がある。
- そのため language はトップバー常駐が妥当。
- Preferences にも同じ設定を置いてよいが、唯一の入口にはしない。

#### Shadow / Light 詳細

現状:

- 下パネルに照明欄がある。
- `light-row--always-hidden` として隠している詳細パラメータが複数ある。
- IBL Shadows は rejected / frozen experiment として hidden。

候補項目:

- ambient intensity
- color temperature
- flat strength
- flat color influence
- shadow bias
- normal bias
- self shadow edge
- occlusion shadow edge
- shadow frustum size
- IBL shadows diagnostics

形式:

- Camera Mode 下パネルには主要照明だけ残す。
- 詳細は Light / Shadow Advanced dialog へ退避。
- rejected experiment は通常 dialog ではなく Diagnostics / Experimental に置く。

#### Physics / Rigid Body 詳細

現状:

- 物理 ON / OFF と剛体表示はメニューへ移動済み。
- `physics-section` は hidden。

候補項目:

- gravity
- physics ON / OFF
- rigid bodies visibility
- backend diagnostics
- simulation rate
- constraint / stabilization options later

形式:

- `PhysicsSettingsDialog` を第一候補にする。
- 重力設定はこの dialog の初期 section として扱う。
- backend diagnostics や solver 状態など、情報量が増えたものは Diagnostics drawer へ分離する。
- 物理 ON / OFF と剛体表示 ON / OFF はメニュー直下の即時 toggle として残す。

### 優先度 C: 後続設計に回すもの

#### Effect 詳細

理由:

- Effect は単なる設定ポップアップではなく、Shader / Material / Post Effect / FrameGraph の構造に関わる。
- M4Layer 的な RT layer、WGSL、FrameGraph custom effect まで広がる。
- 小さな dialog に閉じ込めると後で窮屈になる。

方針:

- Effect パネル本体を整理する。
- 個々のブロック詳細は popover / drawer を使う。
- FrameGraph 診断は drawer が向いている。

#### FrameGraph / Render Resource Registry

理由:

- 情報量が多い。
- RT 数、shared buffers、depth / normal などの一覧は広い表示が欲しい。

形式:

- Drawer。
- Help / Diagnostics または Effect パネルから開く。

#### Experimental PostFX

現状:

- SSR、motion blur、volumetric light など実験的な項目がある。

方針:

- 通常の Effect UI と混ぜすぎない。
- Experimental drawer / advanced section として分ける。

## hidden UI の扱い

`hidden` は次の3種類に分けて扱う。

### 1. 移設済みのため隠したもの

例:

- ヘッダーのファイル読込 / project 保存 / project 読込
- 床 / 空 / AA / 物理 toggle
- Runtime select

扱い:

- 新しい入口が安定したら DOM 削除を検討する。
- ただし既存 controller が ID 前提で参照している場合は、先に controller を整理する。

### 2. 機能はあるが常時表示しないもの

例:

- output quality
- shadow / light advanced rows
- physics-section
- background management

扱い:

- ポップアップ / dialog / drawer の候補にする。
- source of truth を整理してから DOM 移動または削除する。

### 3. 実験凍結または診断向けのもの

例:

- IBL Shadows
- experimental PostFX
- FrameGraph diagnostics

扱い:

- 通常ユーザー向け UI には出さない。
- Diagnostics / Experimental として隔離する。
- v0.2.0 本線に入れるかは別判断にする。

## UI 構造案

```text
--------------------------------------------------+
| 出力設定                                      x |
+--------------------------------------------------+
| 形式        [PNG画像] [PNG連番] [WebM動画]       |
| 比率        [16:9 横 v]                          |
| 長辺        [FullHD v]                           |
| サイズ      [1920] x [1080]                      |
| FPS         [30 v]  [ ] 音声あり                 |
| 範囲        [ ] 再生範囲を使う                   |
| 方式        [速度優先 v]                         |
+--------------------------------------------------+
|                         [キャンセル] [出力]      |
+--------------------------------------------------+
```

ダイアログ内のボタン:

- PNG画像
- PNG連番
- WebM動画

のどれを主ボタンにするかは、初期実装では既存の個別実行ボタンを並べてもよい。将来的には `形式を選ぶ -> 出力` の 1 主ボタンに寄せる。

## 実装方針

### 共通ホスト

現在の `AppMenuController` には簡易 dialog host がある。今後の拡張を考えると、次のどちらかに寄せたい。

短期:

- `AppMenuController` の dialog host を少し拡張する。
- `openDialog(kind)` に `output` を足す。
- 出力設定の body を生成して、既存 DOM の値と同期する。

中期:

- `src/ui/popup-dialog-controller.ts` のような共通 controller を作る。
- `AppMenuController` は「どの dialog を開くか」だけを依頼する。
- 各 dialog body は専用 controller に分離する。

推奨は中期案だが、最初の移設では短期案で小さく始めてもよい。ただし `AppMenuController` が巨大化し始めたらすぐ分離する。

### 抽象化の再考

ポップアップ整理で重要なのは、見た目の共通化よりも責務の分離。
`AppMenuController` に dialog の HTML、状態、イベント、Action 実行をすべて集めると、出力設定、物理設定、背景設定を追加した時点で保守しにくくなる。

第一候補の分離:

```text
AppMenuController
  メニューの開閉
  menu command -> Action / Popup open の振り分け

PopupDialogController
  共通ホスト
  open / close / focus restore / Esc / backdrop / busy / i18n refresh

Dialog controller
  OutputDialogController
  PhysicsSettingsDialogController
  BackgroundSettingsDialogController
  LightShadowAdvancedDialogController
  ModelEdgeDialogController
```

`AppMenuController` は「どの項目が押されたか」だけを扱い、dialog の中身を知らない形に寄せる。
`PopupDialogController` は「どの dialog を表示するか」と「閉じ方」を扱い、個別設定の意味を知らない形にする。
各 dialog controller は、自分の state、DOM 生成、イベント接続、既存 Action / Controller への橋渡しだけを担当する。

### Dialog 種別の共通モデル

最初は modal dialog だけで実装してよいが、将来の drawer / popover を見越して、共通概念は早めに決めておく。

```ts
type PopupSurface = "modal" | "popover" | "drawer";
type PopupSize = "sm" | "md" | "lg" | "wide";
```

初期実装では `surface: "modal"` と `size: "md"` だけ対応でもよい。
ただし API 名は `openDialog` より `openPopup` または `openSurface` に寄せると、FrameGraph diagnostics の drawer 化に拡張しやすい。

### 静的 dialog と stateful dialog

dialog は大きく 2 種類に分ける。

静的 dialog:

- About
- Shortcuts
- Coming soon

特徴:

- body は単純な読み物。
- `innerHTML` 生成でもリスクが低い。
- Action / Command との関係はほぼない。

stateful dialog:

- Output settings
- Physics settings
- Background settings
- Model edge settings
- Light / Shadow advanced

特徴:

- input / select / checkbox を持つ。
- 既存 DOM または controller state と同期が必要。
- Apply / Reset / Export などの実行ボタンを持つ。
- 言語変更時に再描画またはラベル更新が必要。

`innerHTML` で本文だけ差し替える方式は、静的 dialog までに留める。
stateful dialog は `mount(container)` / `unmount()` / `refreshLocale()` のような小さい lifecycle を持たせる。

### 最小インターフェイス案

過剰な UI フレームワーク化は避け、最初は次の程度でよい。

```ts
type PopupOpenOptions = {
    id: string;
    surface: "modal" | "popover" | "drawer";
    title: string;
    size?: "sm" | "md" | "lg" | "wide";
    closeOnBackdrop?: boolean;
    restoreFocusTo?: HTMLElement | null;
    render: (container: HTMLElement) => void;
    onClose?: () => void;
};
```

stateful dialog 用には、専用 controller 側に lifecycle を持たせる。

```ts
type PopupContentController = {
    mount(container: HTMLElement): void;
    unmount?(): void;
    refreshLocale?(): void;
    canClose?(): boolean;
};
```

`PopupDialogController` は、この interface の存在だけを知る。
各 dialog の input の意味や Action の中身は知らない。

### source of truth の方針

初期移設では、既存 DOM を source of truth として残してよい。
ただし、新規 dialog ごとに最終的な source of truth を明記する。

段階:

1. dialog input を既存 DOM に同期する。
2. 既存処理は既存 DOM から読む。
3. dialog controller 内に state 型を作る。
4. 既存処理を state / controller 経由に移す。
5. 旧 DOM を削除する。

候補 state:

- `OutputSettingsState`
- `PhysicsSettingsState`
- `BackgroundSettingsState`
- `ModelEdgeSettingsState`
- `LightShadowAdvancedState`

この段階化により、下パネル移設と実行経路整理を同時に行わずに済む。

### Action / Command との境界

dialog から直接 runtime を触らず、可能な限り既存 Action / Controller 経路に寄せる。

- 実行ボタンは Action を dispatch する。
- 設定値の一時変更は UI state として扱う。
- 作品状態に保存される値は project serializer 対象にするか別途判断する。
- Undo / Redo 対象にするかは、project 保存対象とは別に判断する。

例:

- 出力設定値変更: 当面 Command history に入れない。
- 出力実行: `project.exportPng` / `project.exportPngSequence` / `project.exportWebm` Action。
- 重力変更: project 保存対象候補。ただし Undo 対象にするかは後で判断。
- モデルエッジ per-model 変更: 作品状態寄りなので、将来 Command 化候補。

### i18n と再描画

ポップアップ内の文言は、開くたびに `t()` で生成するだけでなく、言語変更時に開いている dialog を更新できる設計にする。

短期:

- dialog を開き直すと最新言語になる。
- 開いている最中の言語変更は、いったん許容する。

中期:

- `PopupDialogController.refreshLocale()` を追加する。
- 現在開いている content controller の `refreshLocale()` を呼ぶ。
- 静的 dialog は body を再生成する。

Language select は常時見える UI として残すため、開いている dialog の言語追従は後から効いてくる。

### 閉じ方と busy state

閉じ方は dialog ごとにばらばらにせず、共通ホストで扱う。

共通ルール:

- `Esc` で閉じる。
- close button で閉じる。
- backdrop click で閉じるかは dialog ごとに指定する。
- 閉じた後は、開いたメニュー項目または近い top bar 要素に focus を戻す。
- `canClose()` が false の間は閉じない。

出力中のような busy state では、次のどちらかにする。

- dialog を閉じられないようにする。
- 閉じても処理が継続することを明示する。

初期実装では、出力中は閉じられない方が安全。

### 実装順の見直し

`OutputDialog` だけを個別実装すると後で移設し直しになる可能性が高い。
先に最小の `PopupDialogController` を作り、既存の About / Shortcuts / Preferences を移してから stateful dialog に進む。

推奨順:

1. `PopupDialogController` を追加する。
2. 既存 About / Shortcuts / Preferences / Background placeholder / Gravity placeholder を移す。
3. `AppMenuController` から dialog host を外し、menu command の振り分けだけに近づける。
4. `OutputDialogController` を stateful dialog 第一号として作る。
5. 既存 `output-section` と同期する。
6. 安定後、`PhysicsSettingsDialogController` / `BackgroundSettingsDialogController` へ広げる。

### 出力設定の state source

出力設定の source of truth は既存の出力 DOM ではなく、最終的には controller 側の状態に寄せたい。

段階:

1. 下パネル DOM を残し、ポップアップ側の入力変更を既存 DOM に反映する。
2. 既存 export 処理は今までどおり既存 DOM から読む。
3. 安定後、`ExportUiController` または専用 state に寄せる。
4. 下パネルの `output-section` DOM を削除する。

この段階化により、最初の実装で export 処理の大規模改修を避ける。

### i18n

ポップアップ内の文字列はすべて翻訳キーにする。

想定キー:

- `dialog.output.title`
- `dialog.output.format`
- `dialog.output.aspect`
- `dialog.output.longSide`
- `dialog.output.size`
- `dialog.output.fps`
- `dialog.output.includeAudio`
- `dialog.output.usePlaybackRange`
- `dialog.output.captureMode`
- `dialog.output.cancel`
- `dialog.output.exportPng`
- `dialog.output.exportPngSequence`
- `dialog.output.exportWebm`

既存の `output.*` キーを再利用できるものは再利用する。

## 操作とフォーカス

- メニュー項目から開いたら、最初の入力または閉じるボタンへ focus する。
- `Esc` で閉じる。
- 背景クリックで閉じるかは dialog 種別ごとに決める。
- 出力中は閉じる操作を制限するか、閉じても処理が継続することを明示する。
- 閉じた後は、開いたメニュー項目または近いトップバー要素へ focus を戻す。

## Action / Command との関係

- 出力実行は既存の `project.exportPng` / `project.exportPngSequence` / `project.exportWebm` Action を使う。
- 設定変更は当面 UI state 変更として扱い、Command history には入れない。
- 出力設定の変更を project 保存対象にするかは別途判断する。
- 将来、出力プリセット保存を入れる場合は専用 Action / Command を検討する。

## 下パネル整理への接続

出力欄をポップアップへ退避できると、下パネルは次の整理に進める。

共通欄:

- 情報
- アクセサリ
- 再生または最小再生状態

Model Mode:

- ボーン
- モーフ
- 補間

Camera Mode:

- カメラ
- 照明
- 影
- 重力候補

出力は下パネルの常時欄から外し、`ファイル > 出力設定...` と直接出力メニューで扱う。

## 将来の拡張

### Preferences

候補:

- language
- runtime mode
- UI 表示設定
- experimental feature flags
- 将来の shortcut / key bindings

### Background Settings

候補:

- 背景画像 / 動画の選択
- clear
- 表示 / 非表示
- fit mode
- opacity
- loop / mute

### Model Edge Settings

候補:

- edge ON / OFF
- width
- color
- per-model override
- per-material override

### FrameGraph Diagnostics

候補:

- FrameGraph stack
- resource registry
- shared RT
- depth / normal / color buffer
- pass enable / disable
- RT count

## 未決事項

- 出力設定は modal dialog と drawer のどちらがよいか。
- 出力中の progress / cancel を同じ dialog に含めるか、別 overlay にするか。
- 下パネルの `output-section` DOM をいつ削除するか。
- 出力設定を project 保存対象に含めるか。
- Preferences と OutputDialog で同じ共通 dialog host を使うか。
- FrameGraph 診断は drawer と Effect パネル内 section のどちらがよいか。

## 次の作業案

1. `dialog.output.*` の i18n キーを追加する。
2. File メニューに `出力設定...` を追加する。
3. 出力設定 dialog を開けるようにする。
4. 既存 `output-section` と同等の入力を dialog に作る。
5. dialog 入力を既存 output DOM に同期する。
6. 下パネルの `output-section` を非表示にする。
7. lint / unit / smoke / screenshot で確認する。
