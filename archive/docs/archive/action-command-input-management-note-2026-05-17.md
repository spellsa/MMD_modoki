# Action / Command / 入力管理 調査メモ

更新日: 2026-05-17

## 目的

v0.2.0 で入力処理を Action として整理する前に、Action / Command / undo-redo / 入力バインディングの責務を切り分ける。

このメモでは、以下を対象にする。

- 既存のキーボード / マウス入力の整理
- 将来のショートカットカスタム、Gamepad、MIDI コントローラー対応
- Action 単位の Vitest
- undo / redo に向けた Command 化

## 現状

現状の入力経路は主に次の場所にある。

- `src/ui-controller.ts`
  - button click
  - toolbar / panel の input / change
  - `document.addEventListener("keydown", ...)`
  - ファイル読み込み、再生、シーク、キー登録、表示切替、エフェクト設定など
- `src/mmd-manager.ts`
  - canvas pointer 操作
  - ボーン pick
  - camera rotate / pan / zoom
  - Babylon runtime への直接反映
- `src/timeline.ts`
  - timeline canvas mouse 操作
  - drag / scroll / selection

課題:

- UI event と editor 操作が直結している。
- button と shortcut が同じ意味の操作でも別経路になりやすい。
- undo / redo 対象と、再生・表示切替・ファイル読み込みのような非履歴操作が混ざりやすい。
- 将来 Gamepad / MIDI を入れると、同じ操作に複数の入力手段がぶら下がる。
- Action 単位のテストを書きにくい。

## 調査メモ

### Action は「入力から来た意図」

Redux の FAQ では、action は `type` を持つ plain object として扱い、serializable にしておくと debug / 再現に役立つ、と説明されている。

MMD_modoki でも Action はできるだけ次の性質に寄せる。

- plain object
- `type` は string literal
- payload は最小限
- DOM event / Babylon object / File object を直接入れない
- 入力元情報を metadata として持てる

例:

```ts
type EditorAction =
  | {
      type: "playback.toggle";
      source: "shortcut" | "button" | "gamepad" | "midi";
      device?: string;
    }
  | {
      type: "keyframe.addCurrent";
      target: "model" | "camera" | "accessory";
      source: "shortcut" | "button";
    }
  | {
      type: "keyframe.nudgeSelected";
      deltaFrames: -1 | 1;
      source: "shortcut" | "button";
    };
```

Action は「何が押されたか」ではなく「何をしたいか」を表す。

悪い例:

```ts
{ type: "keydown", key: "p" }
```

良い例:

```ts
{ type: "playback.toggle", source: "shortcut" }
```

### Command は「実行可能で、必要なら undo / redo できる編集」

既存の [Undo / Redo 検討メモ](./undo-redo-investigation.md) では、`HistoryManager + 軽い command + 最小差分` が現実的と整理している。

Action と Command は分ける。

- Action
  - 入力から来た intent
  - undo できるとは限らない
  - button / shortcut / Gamepad / MIDI から共通に発火できる
- Command
  - editor state に対する変更単位
  - `execute` / `undo` / `redo` あるいは `apply` / `revert` を持つ
  - history stack に積める
  - 差分を持つ

例:

```ts
type EditorCommand = {
  id: string;
  label: string;
  scope: "timeline" | "keyframe" | "selection" | "project" | "effect";
  mergeKey?: string;
  execute: () => void;
  undo?: () => void;
  redo?: () => void;
};
```

または、テストしやすくするなら副作用関数を外に出す。

```ts
type CommandDiff =
  | {
      type: "keyframe.move";
      targetTrackId: string;
      keyframeIds: string[];
      beforeFrames: number[];
      afterFrames: number[];
    };

type BuiltCommand = {
  label: string;
  scope: "keyframe";
  diff: CommandDiff;
  mergeKey?: string;
};
```

初期 PoC では、後者の「Action -> CommandDiff を作る pure helper」を優先する方が Vitest に乗せやすい。

### undo-redo は past / present / future か Command stack

Redux の undo history ガイドは、undo state を `past / present / future` で表す形を説明している。これは reducer のように state 更新が 1 箇所に集約されている場合に強い。

一方、MMD_modoki は以下の理由で全体 `present` 差し替え方式には寄せにくい。

- Babylon runtime object が大きい
- source animation / timeline 表示 / runtime 反映が複数層に分かれる
- ファイル読み込みや物理 runtime など、履歴に積むべきでない副作用が多い

そのため、初期は次の構成がよい。

- `HistoryManager`
  - undo stack / redo stack
  - `canUndo` / `canRedo`
  - `push(command)`
  - `undo()`
  - `redo()`
- `CommandBuilder`
  - `Action + EditorSnapshot -> BuiltCommand | null`
  - 実行不可理由を返せる
- `CommandExecutor`
  - `BuiltCommand.diff` を実 state / runtime へ反映

### grouping / mergeKey は必須

redux-undo には、複数 action を 1 つの undo step にまとめる `groupBy` と、履歴対象を絞る `filter` がある。

MMD_modoki でも同じ発想が必要。

履歴に積むべきでないもの:

- 再生 / 停止
- シークだけ
- 表示切替だけ
- ファイル選択ダイアログ
- hover / preview / drag 中の中間値

まとめるべきもの:

- スライダー drag 中の連続変更
- Gamepad stick の連続入力
- MIDI fader / knob の連続 CC
- キーフレーム nudge の連打
- 補間ハンドル drag

案:

```ts
type HistoryMergePolicy = {
  mergeKey?: string;
  mergeWindowMs?: number;
  commitOnPointerUp?: boolean;
};
```

例:

- `keyframe.nudgeSelected:model:bone:Arm`
- `effect.slider:colorTemperature`
- `camera.drag:pan`
- `interpolation.drag:selectedKeyframe:p1`

### InputBinding は Action の前段

将来の shortcut custom / Gamepad / MIDI を考えると、入力デバイスごとの event を直接 editor 操作に繋がない方がよい。

入力経路:

```text
DOM KeyboardEvent
Gamepad polling result
MIDIMessageEvent
Button click
Pointer gesture
        ↓
InputAdapter
        ↓
InputBinding
        ↓
EditorAction
        ↓
ActionDispatcher
        ↓
CommandBuilder / Executor
```

`InputBinding` の例:

```ts
type InputBinding =
  | {
      device: "keyboard";
      code: string;
      ctrl?: boolean;
      shift?: boolean;
      alt?: boolean;
      meta?: boolean;
      action: EditorAction["type"];
    }
  | {
      device: "gamepad";
      control: "button0" | "button1" | "axis0+" | "axis0-";
      action: EditorAction["type"];
      repeat?: boolean;
    }
  | {
      device: "midi";
      message: "noteon" | "controlchange";
      channel?: number;
      note?: number;
      controller?: number;
      action: EditorAction["type"];
    };
```

Action catalog と Binding catalog は分ける。

- Action catalog
  - アプリが理解する操作一覧
  - UI 表示名、説明、実行可否、履歴対象かどうか
- Binding catalog
  - どの入力がどの Action を発火するか
  - user customizable

### Gamepad / MIDI は polling / permission を前提にする

MDN の Gamepad API は、接続イベントと `navigator.getGamepads()` による取得を提供している。ボタンとスティックはフレームごとの状態差分で扱うのが自然。

Gamepad で必要な設計:

- edge trigger
  - button down で 1 回だけ Action
- repeat
  - 押しっぱなしで一定間隔の Action
- analog threshold
  - stick / trigger のしきい値
- deadzone
  - 軸の微小入力を無視
- mergeKey
  - 連続 nudge / camera pan を 1 操作にまとめるか判断

MDN の Web MIDI API は `navigator.requestMIDIAccess()` と MIDI input の message event を使う。MIDI は permission / browser support / security policy の影響があるため、v0.2.0 では本実装より Action 設計の受け皿だけ先に作る。

MIDI で必要な設計:

- device id / name の保存
- channel / note / CC の binding
- absolute value と relative delta の区別
- fader / knob の連続値を履歴に積みすぎない grouping

## MMD_modoki 向けの推奨アーキテクチャ

### 1. ActionRegistry

Action の一覧を定義する。

```ts
type ActionDefinition = {
  type: string;
  label: string;
  category: "playback" | "timeline" | "keyframe" | "selection" | "viewport" | "project" | "effect";
  undoable: boolean;
  repeatable?: boolean;
  defaultBindings: InputBinding[];
};
```

最初は runtime 実装を持たず、一覧と default shortcut の棚卸しだけでも価値がある。

### 2. ActionDispatcher

入力元に関係なく Action を受け取る入口。

```ts
type DispatchResult =
  | { ok: true; commandPushed?: boolean }
  | { ok: false; reason: string };

type ActionDispatcher = {
  dispatch(action: EditorAction): DispatchResult;
};
```

責務:

- disabled / canExecute 判定
- undoable action なら CommandBuilder へ渡す
- non-undoable action なら既存 controller / manager へ渡す
- telemetry / debug log の入口にする

### 3. CommandBuilder

Action を編集差分に変換する。

最初に扱う対象:

- `keyframe.addCurrent`
- `keyframe.deleteSelected`
- `keyframe.nudgeSelected`
- `interpolation.applyPreset`
- `interpolation.reset`

ここを pure helper にすると Vitest に載せやすい。

```ts
const command = buildCommand(action, snapshot);
```

テスト対象:

- action が現在 state で実行できるか
- 差分が最小か
- undo / redo に必要な before / after が揃うか
- `mergeKey` が安定しているか

### 4. HistoryManager

Command を stack で管理する。

```ts
type HistoryManager = {
  push(command: BuiltCommand): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  clear(reason: string): void;
};
```

注意:

- project load / model load の後も履歴は clear しない。アプリ起動中は保持し、対象が存在しない command は executor 失敗として扱う。
- undo / redo 後は timeline 表示、source animation、Babylon runtime を同期する。
- 再生中編集は初期段階では禁止か、pause してから実行する。

### 5. State store は後段

Zustand を入れる場合でも、Action / Command の後がよい。

Zustand に置いてよいもの:

- selection snapshot
- editing mode
- dirty flag
- `canUndo` / `canRedo`
- panel visibility
- current input binding settings

置かないもの:

- Babylon object
- MMD model runtime
- 巨大 animation buffer
- project save format そのもの
- physics runtime state

#### Zustand と自前実装の分担

現時点の判断では、Zustand は導入候補として採用してよい。ただし、Action / Command / undo-redo の中核を Zustand に任せない。

自前で持つべきもの:

- `EditorAction` 型
- `ActionRegistry`
- `InputBinding`
- `ActionDispatcher`
- `CommandBuilder`
- `CommandExecutor`
- `HistoryManager`
- undo / redo の差分適用
- `mergeKey` / grouping policy
- source animation / timeline 表示 / Babylon runtime への同期

Zustand に任せてよいもの:

- selection snapshot
- editing mode
- dirty flag
- `canUndo` / `canRedo`
- panel visibility
- current tool / active tab
- shortcut / input binding settings の UI 表示状態

理由:

- Zustand は state を置いて購読するための軽量 store であり、編集操作の意味づけや undo / redo の差分生成までは担わない。
- MMD_modoki の編集は、source animation、timeline 表示、Babylon runtime の複数層に反映する必要がある。
- `keyframe.nudgeSelected` のような操作は、実行可否、before / after 差分、runtime 反映、履歴 push、連続操作の merge を含むため、project 固有の Command として扱う必要がある。
- Zustand に runtime object や巨大 animation buffer を入れると、保存形式、UI 状態、runtime 状態、履歴が混ざりやすい。

推奨構成:

```text
Keyboard / Button / Gamepad / MIDI
        ↓
InputBinding
        ↓
EditorAction
        ↓
ActionDispatcher
        ↓
CommandBuilder / CommandExecutor / HistoryManager  ← 自前
        ↓
MmdManager / Timeline / SourceAnimation
        ↓
Zustand store  ← UI 表示用の軽い状態を購読
```

Zustand の役割は、アプリの正本 state ではなく、UI / editor state の通知板に近い。

例:

```ts
type EditorUiState = {
  selectedModelId: string | null;
  selectedBoneName: string | null;
  editingMode: "model" | "camera" | "accessory";
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
};
```

避ける例:

```ts
type BadEditorStore = {
  babylonScene: unknown;
  mmdRuntime: unknown;
  loadedModels: unknown[];
  animationBuffer: unknown;
  fullProjectData: unknown;
};
```

導入順:

1. Action / Command の型と最小 PoC を自前で作る。
2. `HistoryManager` の `canUndo` / `canRedo` を出す。
3. UI に反映する段階で Zustand vanilla を入れる。
4. Zustand に置く state を軽い UI / editor state に限定する。

短い採用方針:

> Zustand は UI/editor の軽量状態購読に使う。Action / Command / undo-redo の主実装、編集差分、履歴管理、runtime 同期は自前で実装する。

#### SQLite WASM / in-memory RDB 案

SQLite WASM を in-memory RDB として使う案も比較候補には残す。ただし、現時点では Action / Command / History の主実装にはしない。

既存メモ:

- [SQLite WASM 実験メモ](./sqlite-wasm-experiment-note.md)

SQLite WASM が効きそうな領域:

- `input_event`
  - keyboard / pointer / gamepad / MIDI の入力観測
  - ただし生入力を全部入れるより、間引いた high-level Action を中心にする
- `action_event`
  - ActionDispatcher に入った Action の記録
  - source / device / scope / timestamp / result を検索できる
- `command_event`
  - undoable command の label / scope / mergeKey / diff payload を記録
  - クラッシュ後の調査や操作再現の補助に使える
- `error_event`
  - command 実行失敗、undo / redo 失敗、runtime 同期失敗を記録
- input binding / device profile
  - Gamepad / MIDI / shortcut custom の設定保存
- 設定変更履歴
  - experimental flag や post effect 値変更の追跡

SQLite WASM が重くなりやすい領域:

- 毎操作の即時 undo / redo 本体
- Babylon runtime object の保持
- source animation 全体の正本化
- project save format の主形式化
- 毎フレーム値や高頻度 pointer move の全記録

in-memory RDB 案の良い点:

- 入力、Action、Command、error を同じ timestamp 軸で検索できる。
- 「どの入力がどの Action になり、どの Command が作られたか」を後から追いやすい。
- Gamepad / MIDI のようなデバイスプロファイルを構造化しやすい。
- SQL で集計できるため、実験機としての観測基盤には向く。
- 永続化しなければ、まずはセッション内の debug DB として扱える。

in-memory RDB 案の弱い点:

- DB を入れても、操作粒度、逆操作、副作用同期の設計は解決しない。
- 高頻度入力を雑に insert すると、描画や再生の負荷調査に影響する。
- WASM / worker / packaging の確認対象が増える。
- バイナリ DB は text / JSONL より直接読みにくい。
- Action / Command / Zustand / SQLite を同時に入れると責務が重なる。

比較:

| 項目 | 自前 HistoryManager | Zustand | SQLite WASM in-memory RDB |
| --- | --- | --- | --- |
| 主目的 | undo / redo の実行 | UI/editor state の購読 | 観測ログ / 検索 / 設定プロファイル |
| 編集差分 | 持つ | 持たない | 記録はできるが実行主体にはしない |
| runtime 同期 | 担う | 担わない | 担わない |
| 高頻度入力 | merge / debounce して扱う | 表示状態だけ扱う | 生ログ全投入は危険 |
| 永続化 | 基本しない | 基本しない | 必要ならできる |
| 初期導入コスト | 小から中 | 小 | 中から大 |
| v0.2 優先度 | 高 | 中 | 低から実験 |

SQLite を使う場合の最小スキーマ案:

```sql
CREATE TABLE input_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at_ms INTEGER NOT NULL,
  device_type TEXT NOT NULL,
  device_id TEXT,
  control TEXT NOT NULL,
  value_json TEXT
);

CREATE TABLE action_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at_ms INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  source TEXT NOT NULL,
  device_type TEXT,
  payload_json TEXT,
  result TEXT NOT NULL
);

CREATE TABLE command_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at_ms INTEGER NOT NULL,
  command_type TEXT NOT NULL,
  scope TEXT NOT NULL,
  label TEXT NOT NULL,
  merge_key TEXT,
  diff_json TEXT,
  result TEXT NOT NULL
);

CREATE TABLE error_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at_ms INTEGER NOT NULL,
  area TEXT NOT NULL,
  message TEXT NOT NULL,
  detail_json TEXT
);
```

この schema は、undo / redo を DB で実行するためではなく、Action / Command の観測ログとして使う前提にする。

もし SQLite-backed undo / redo を試すなら、次の条件を満たしてからにする。

- `keyframe.*` の CommandDiff が安定している。
- `execute / undo / redo` が in-memory HistoryManager で動いている。
- source animation / timeline 表示 / Babylon runtime の同期手順が確定している。
- command diff が JSON として保存できる。
- 保存した command_event から再現できる範囲と、できない範囲が分かっている。

短い採用方針:

> SQLite WASM は v0.2.0 の Action / Command 中核にはしない。使う場合は、Action / Command の粒度が固まった後に、観測ログ、入力デバイス設定、クラッシュ後調査用の in-memory RDB PoC として扱う。

#### 完全自前案

Zustand も SQLite WASM も使わず、Action / Command / History / UI state をすべて自前の TypeScript module で持つ案。

この案は、v0.2.0 の初期 PoC としてはかなり現実的。理由は、最初に必要なのは汎用状態管理ではなく、操作粒度と副作用同期の設計だから。

完全自前で必要なもの:

- `ActionRegistry`
  - Action 一覧
  - label / category / undoable / repeatable
  - default input binding
- `InputBindingRegistry`
  - keyboard shortcut の data 化
  - 将来の Gamepad / MIDI binding の受け皿
- `ActionDispatcher`
  - `dispatch(action)`
  - `canExecute(action)`
  - undoable / non-undoable の振り分け
- `CommandBuilder`
  - `Action + Snapshot -> BuiltCommand | null`
  - pure helper として Vitest 対象にする
- `CommandExecutor`
  - command diff を source animation / timeline / runtime に反映
- `HistoryManager`
  - undo stack / redo stack
  - merge / clear / canUndo / canRedo
- `EditorUiStateStore`
  - 軽い自前 store
  - selection / dirty / canUndo / canRedo / panel visibility
- `EventLog`
  - 必要なら in-memory ring buffer
  - debug 用に Action / Command / error を短期保持

最小の自前 store 例:

```ts
type Listener<T> = (state: T, previous: T) => void;

export function createSimpleStore<T>(initialState: T) {
  let state = initialState;
  const listeners = new Set<Listener<T>>();

  return {
    getState: () => state,
    setState: (patch: Partial<T>) => {
      const previous = state;
      state = { ...state, ...patch };
      for (const listener of listeners) {
        listener(state, previous);
      }
    },
    subscribe: (listener: Listener<T>) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
```

自前案の良い点:

- 依存が増えない。
- Action / Command の粒度が固まるまで設計を変えやすい。
- Zustand / SQLite / middleware の流儀に引っ張られない。
- `src/timeline.ts` のように、局所的な state と更新要求を小さく持てる。
- unit test 対象を純 TypeScript helper にしやすい。
- ライブラリ supply-chain risk を増やさない。

自前案の弱い点:

- subscribe / selector / equality / devtools などを自分で設計する必要がある。
- store が増えると、通知順序や循環更新を自分で管理する必要がある。
- History と UI state の同期漏れを防ぐルールが必要。
- 入力 binding 設定の永続化、migration、debug 表示を自分で作る必要がある。
- 中途半端に大きくなると、Zustand より質の低い独自状態管理になりやすい。

完全自前の場合にやるべきこと:

1. state の正本を決める。
   - source animation / project data / runtime state / UI state を混ぜない。
   - UI store は「表示用 snapshot」に限定する。
2. Action catalog を作る。
   - まず `src/ui-controller.ts` の shortcut と button 操作を棚卸しする。
3. CommandDiff 型を決める。
   - keyframe add / delete / nudge だけでよい。
4. `buildCommand(action, snapshot)` を pure helper にする。
   - ここを最初の Vitest 対象にする。
5. `HistoryManager` を最小実装する。
   - `push` / `undo` / `redo` / `clear` / `canUndo` / `canRedo`
6. `HistoryManager` の状態を UI store に反映する。
   - `canUndo` / `canRedo` / `dirty`
7. `Ctrl+Z` / `Ctrl+Y` を Action 経由にする。
8. button と shortcut が同じ Action を dispatch するようにする。
9. high-frequency 操作の merge policy を入れる。
   - drag / slider / gamepad repeat / MIDI CC
10. debug 用の in-memory event log を作るか判断する。
    - SQLite WASM を入れる前に、ring buffer で十分か見る。

自前 `HistoryManager` の最小型:

```ts
type HistoryCommand = {
  id: string;
  label: string;
  scope: "keyframe" | "timeline" | "effect" | "selection";
  mergeKey?: string;
  createdAtMs: number;
  execute: () => void;
  undo: () => void;
  redo: () => void;
};

type HistoryState = {
  past: HistoryCommand[];
  future: HistoryCommand[];
};
```

ただし、Vitest しやすくするなら `execute / undo / redo` 関数を直接 test するより、まず `diff` を test する。

```ts
type BuiltCommand = {
  id: string;
  label: string;
  scope: "keyframe";
  mergeKey?: string;
  diff: CommandDiff;
};
```

完全自前案で避けるべきこと:

- 最初から全 controller を Action 化する。
- すべての UI state を 1 つの巨大 store に入れる。
- Babylon object を store / command diff / action payload に入れる。
- pointer move や MIDI CC を毎回 history に積む。
- project save format と editor transient state を混ぜる。
- undo / redo とログ基盤を同時に実装する。

採用判断:

- v0.2.0 の最初の Action / Command PoC は完全自前でよい。
- Zustand は、UI state の購読が増えて自前 store が苦しくなった時点で導入判断する。
- SQLite WASM は、Action / Command が固まり、観測ログの必要性が明確になった後でよい。

短い採用方針:

> まず完全自前で `ActionRegistry + CommandBuilder + HistoryManager` を作る。Zustand は UI state 購読が増えたときの置き換え候補、SQLite WASM は観測ログが必要になったときの後続 PoC として残す。

## Action catalog 初期案

### playback

- `playback.play`
- `playback.pause`
- `playback.toggle`
- `playback.stop`
- `playback.seekFrame`
- `playback.stepFrame`
- `playback.seekStart`
- `playback.seekEnd`
- `playback.seekAdjacentKeyframe`

履歴対象外。

### keyframe

- `keyframe.addCurrent`
- `keyframe.deleteSelected`
- `keyframe.nudgeSelected`
- `keyframe.copySelected`
- `keyframe.paste`
- `keyframe.registerBone`
- `keyframe.registerMorph`
- `keyframe.registerCamera`
- `keyframe.registerAccessory`

履歴対象。copy は履歴対象外、paste は履歴対象。

### interpolation

- `interpolation.copy`
- `interpolation.paste`
- `interpolation.applyLinear`
- `interpolation.applyAuto`
- `interpolation.reset`
- `interpolation.dragHandle`

履歴対象。copy は履歴対象外。

### selection

- `selection.setActiveModel`
- `selection.cycleActiveModel`
- `selection.selectBone`
- `selection.selectMorph`
- `selection.selectKeyframes`
- `selection.clear`

基本は履歴対象外。ただし「選択状態も undo したい」要件が出るなら別履歴として検討する。

### viewport

- `viewport.cameraRotate`
- `viewport.cameraPan`
- `viewport.cameraZoom`
- `viewport.toggleGround`
- `viewport.toggleEdge`
- `viewport.toggleAxis`
- `viewport.toggleBackgroundBlack`
- `viewport.toggleFullscreen`

初期は履歴対象外。camera keyframe として登録する操作だけ keyframe 側で履歴対象にする。

### project

- `project.openModel`
- `project.openMotion`
- `project.openCameraMotion`
- `project.openAudio`
- `project.save`
- `project.saveAs`
- `project.load`
- `project.exportPng`
- `project.exportPngSequence`
- `project.exportWebm`

履歴対象外。load / open 系でも history は保持する。

### effect

- `effect.setValue`
- `effect.toggle`
- `effect.applyPreset`
- `effect.reset`

初期は履歴対象外。将来、編集対象として扱うなら slider drag の merge が必須。

## 段階導入案

### Phase 0: 棚卸し

- `src/ui-controller.ts` の keyboard shortcut を Action catalog に転記
- button click と shortcut の重複操作を対応づける
- 履歴対象 / 非履歴対象を分類

成果物:

- `src/actions/action-catalog.ts`
- まだ実行経路は変えない

### Phase 1: keyframe 系 PoC

- `ActionDispatcher` の最小実装
- `keyframe.addCurrent`
- `keyframe.deleteSelected`
- `keyframe.nudgeSelected`
- button と shortcut を同じ Action に寄せる
- Vitest で `Action -> CommandDiff` を確認

成果物:

- `src/actions/types.ts`
- `src/actions/action-dispatcher.ts`
- `src/actions/keyframe-command-builder.ts`
- `src/actions/keyframe-command-builder.test.ts`

### Phase 2: HistoryManager

- in-memory undo / redo
- `Ctrl+Z` / `Ctrl+Y`
- keyframe add / delete / nudge だけ対応
- timeline 表示と runtime 反映の同期を確認

### Phase 3: InputBinding

- keyboard binding を data 化
- shortcut custom の保存形式を設計
- Gamepad / MIDI は adapter interface だけ作る

### Phase 4: Zustand / Tailwind 連携

- Zustand は `canUndo` / `canRedo` / selection / panel visibility のような軽い UI/editor state に限定
- Tailwind は Action 化された panel / settings / experimental UI から段階導入

## 採用判断

このプロジェクトには Action 単位での整理が向いている。

理由:

- 既に keyboard / button / pointer の入力経路が増えている。
- 将来 Gamepad / MIDI / shortcut custom を入れるなら、入力手段と editor 操作の分離が必要。
- undo / redo の難所はライブラリ選定ではなく「1操作の定義」なので、Action catalog が先に必要。
- Vitest で `Action -> canExecute -> CommandDiff` をテストできると、手動確認だけの状態から一段改善できる。
- UI の見た目整理を Tailwind で進める前に、button が何の Action を発火しているかを明確にできる。

ただし、最初から全入力を置き換えない。

推奨:

- Action catalog を先に作る。
- keyframe / timeline の狭い範囲で ActionDispatcher を入れる。
- undoable な編集だけ Command 化する。
- playback / project / viewport 表示切替は、Action 化しても History には積まない。
- Zustand は Action / History の状態表示を受ける用途に留める。

### 2026-05-17 時点の判断

v0.2.0 の最初の Action / Command 整理は、完全自前で進める。

これは Zustand や SQLite WASM を否定する判断ではない。導入順の判断として、まず `Action / Command / History` の芯を project 固有の小さい TypeScript module として作る。

理由:

- この段階で一番決めるべきなのは、状態管理ライブラリではなく「1 操作の粒度」。
- `keyframe.nudgeSelected` のような編集は、before / after、source animation、timeline 表示、Babylon runtime 同期、merge policy を project 側で決める必要がある。
- Zustand を先に入れると、まだ固まっていない編集設計を store に押し込む可能性がある。
- SQLite WASM を先に入れると、DB schema 設計と Action 設計が混ざりやすい。
- 完全自前なら、`keyframe.*` の狭い範囲で Vitest を使いながら小さく検証できる。

採用順:

1. 完全自前で `ActionRegistry + CommandBuilder + HistoryManager` を作る。
2. UI state 購読が複数 panel に広がり、自前 store が苦しくなったら Zustand を入れる。
3. 観測ログ、入力解析、クラッシュ後調査の必要性が明確になったら SQLite WASM を別 PoC として検討する。

初期実装候補:

```text
src/actions/types.ts
src/actions/action-catalog.ts
src/actions/keyframe-command-builder.ts
src/actions/history-manager.ts
src/actions/keyframe-command-builder.test.ts
src/actions/history-manager.test.ts
```

最初に扱う Action:

- `keyframe.addCurrent`
- `keyframe.deleteSelected`
- `keyframe.nudgeSelected`
- `playback.toggle`
- `playback.stepFrame`
- `playback.seekAdjacentKeyframe`

最初に undo / redo 対象にするもの:

- `keyframe.addCurrent`
- `keyframe.deleteSelected`
- `keyframe.nudgeSelected`

履歴対象外として Action 化だけするもの:

- `playback.toggle`
- `playback.stepFrame`
- `playback.seekAdjacentKeyframe`
- `project.save`
- `project.load`
- `viewport.toggleGround`
- `viewport.toggleEdge`

最初のゴール:

- button と shortcut が同じ Action を dispatch できる。
- `Action -> canExecute -> CommandDiff` を Vitest で確認できる。
- keyframe add / delete / nudge の履歴単位が定義されている。
- `HistoryManager` が `canUndo` / `canRedo` を返せる。
- まだ Zustand / SQLite WASM は入れない。

短い方針:

> v0.2.0 の Action / Command PoC は完全自前で始める。Zustand は UI state 購読の必要が見えた段階、SQLite WASM は観測ログの必要が見えた段階で改めて判断する。

## 次にやること

1. `src/ui-controller.ts` の `setupKeyboard()` を Action catalog に転記する。
2. button click と shortcut の同義操作を表にする。
3. `keyframe.*` の Action 型を決める。
4. `Action -> canExecute` の pure helper を作る。
5. Vitest で keyframe add / delete / nudge の最小テストを書く。

## 参照

- Redux: Implementing Undo History  
  https://redux.js.org/usage/implementing-undo-history
- Redux FAQ: Actions  
  https://redux.js.org/faq/actions
- redux-undo: grouping / filtering actions  
  https://redux-undo.js.org/
- MDN: Gamepad API  
  https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API
- MDN: Web MIDI API  
  https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API
- 既存メモ: [Undo / Redo 検討メモ](./undo-redo-investigation.md)
- 既存メモ: [現行MMD ショートカットキー調査メモ](./mmd-shortcuts-research.md)
