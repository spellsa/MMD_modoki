# キーフレーム コピー / ペースト実装案

作成日: 2026-06-15

## 目的

タイムライン下のキー操作欄に置いた `コピー / ペースト / 反転P` のうち、まず `コピー / ペースト` を実操作に接続する。

MMD 本家に近い感覚では、ユーザーは「選択中のキーを複製して別フレームへ置く」ことを期待する。MMD_modoki では既に `登録 / 削除 / 1f 移動` が Action / Command 経路に乗っているため、コピー / ペーストも同じ編集基盤に寄せる。

## 最初の実装範囲

最初は以下に絞る。

- 単一キーのコピー
- 単一キーのペースト
- 内部クリップボードのみ
- 同一モデル / 同一カメラ内での貼り付け
- 同一トラック名への貼り付け
- 貼り付け先は現在フレーム
- 貼り付け先に既存キーがある場合は上書き
- undo / redo 対応

まだ含めないもの。

- 複数キー / 範囲選択のコピー
- 行選択 / 列選択 / 矩形選択との連携
- OS クリップボード連携
- 別モデルへの貼り付け
- 選択先トラックへの型変換貼り付け
- 反転ペースト

## 基本方針

`keyframe.add` / `keyframe.delete` は現在、主に frame list の差分を扱っている。一方でコピー / ペーストは frame number だけでは足りず、ボーン位置、回転、補間、物理 toggle、モーフ weight、カメラ値などの実データを運ぶ必要がある。

そのため、コピー / ペーストでは「値つき payload」を扱う小さな helper / service を追加する。

```text
selected track + selected/current frame
  -> source animation から payload を読む
  -> internal clipboard に保持

clipboard + current frame
  -> target source animation へ payload を upsert
  -> frame map / runtime / timeline を更新
  -> command history に積む
```

## 内部クリップボード

OS clipboard ではなく、まずは editor 内部状態として保持する。

案:

```ts
type KeyframeClipboard = {
  version: 1;
  sourceTarget: "model" | "camera";
  anchorFrame: number;
  entries: KeyframeClipboardEntry[];
};

type KeyframeClipboardEntry = {
  track: KeyframeTrackRef;
  sourceFrame: number;
  frameOffset: number;
  payload: KeyframePayload;
};
```

単一コピーでは `entries.length === 1`、`frameOffset === 0` になる。将来の複数選択では `anchorFrame` からの相対位置として `frameOffset` を使える。

## Payload 案

payload は既存 source animation の配列構造を UIController 側へ漏らしすぎないための中間形式にする。

```ts
type KeyframePayload =
  | BoneKeyframePayload
  | MovableBoneKeyframePayload
  | MorphKeyframePayload
  | CameraKeyframePayload;
```

初期対応候補:

- bone
  - rotation
  - rotationInterpolation
  - physicsToggle
- movable bone
  - position
  - positionInterpolation
  - rotation
  - rotationInterpolation
  - physicsToggle
- morph
  - weight
- camera
  - position
  - positionInterpolation
  - rotation
  - rotationInterpolation
  - distance
  - distanceInterpolation
  - fov
  - fovInterpolation

照明、影、アクセサリ、表示 / IK などは後続で追加する。

## コピー処理

1. selected track を取得する。
2. selected frame があればそれを使う。なければ current frame を使う。
3. 対象 track の source animation に、その frame のキーが存在するか確認する。
4. frame が存在しなければ toast で通知して終了する。
5. track kind ごとに payload を読み取る。
6. `keyframeClipboard` に保存する。
7. ペーストボタンの enabled 状態を更新する。

コピーは編集ではないため、history には積まない。

## ペースト処理

1. internal clipboard があるか確認する。
2. active target が clipboard と互換か確認する。
3. 貼り付け先 frame は current frame とする。
4. 初期実装では clipboard の元 track 名へ貼る。
5. 貼り付け先 track が存在しなければ作成する、または toast で通知する。
6. 貼り付け前 payload を読む。存在しない場合は `before: null` とする。
7. clipboard payload を target frame に upsert する。
8. frame map、source animation、runtime animation、timeline 表示を更新する。
9. `keyframe.paste` command として history に積む。

貼り付け先に既存キーがある場合は上書きする。MMD 的にはこの挙動が一番分かりやすい。

## Undo / Redo

新しい command diff を足す。

```ts
type KeyframePasteCommandDiff = {
  type: "keyframe.paste";
  target: KeyframeTrackRef;
  frame: number;
  before: KeyframePayload | null;
  after: KeyframePayload;
};
```

apply:

- `after` を target frame に upsert する。

revert:

- `before === null` なら target frame を削除する。
- `before !== null` なら `before` を target frame に upsert する。

この形にすると、既存キーへの上書きも undo で元に戻せる。

## 実装場所

候補:

- `src/editor/timeline-keyframe-clipboard.ts`
  - payload read / write
  - clipboard 型
  - compatibility 判定
- `src/actions/types.ts`
  - `keyframe.copySelected`
  - `keyframe.paste`
- `src/actions/command-types.ts`
  - `keyframe.paste` diff
- `src/actions/command-executor.ts`
  - paste diff の apply / revert
- `src/ui-controller.ts`
  - button wiring
  - action dispatch
  - toast / UI enabled state

`UIController` に payload 配列操作を直接増やすと肥大化するため、payload read / write は service 側へ寄せる。

## UI 接続

ボタンには id を追加する。

```html
<button id="btn-kf-copy">コピー</button>
<button id="btn-kf-paste">ペースト</button>
```

enabled 条件:

- コピー
  - active target がある
  - selected track がある
  - selected frame または current frame にキーがある
- ペースト
  - internal clipboard がある
  - active target が clipboard と互換
  - paste target track を解決できる

ショートカットは後続で `Ctrl+C / Ctrl+V` を検討する。最初はボタン接続だけでよい。

## 反転Pとの関係

`反転P` は copy / paste の次に実装する。

反転Pは単なる paste ではなく、左右ボーン名変換と transform 反転が必要になる。

- 左 / 右 のボーン名対応
- position X 反転
- rotation 反転
- 補間の扱い
- IK / 物理 toggle の扱い

そのため、copy / paste の payload 化が先に必要になる。

## テスト方針

DOM / Babylon runtime へ直接触らず、payload helper を単体テストする。

優先テスト:

- bone payload を指定 frame から読める
- movable bone payload に position / rotation / interpolation / physicsToggle が含まれる
- morph payload を読める
- camera payload を読める
- paste が frameNumbers の昇順を維持する
- paste が既存 frame を上書きする
- undo が新規 paste を削除へ戻す
- undo が上書き paste を元 payload へ戻す

## 段階案

### Phase 1

- internal clipboard 型追加
- 単一キー copy
- 単一キー paste
- undo / redo
- model bone / movable bone / morph / camera 対応

### Phase 2

- `Ctrl+C / Ctrl+V` 接続
- selected frame がない場合の current frame copy を UI 的に分かりやすくする
- paste 後に貼り付けた key を選択状態にする

### Phase 3

- Timeline Grid Selection と連携
- 複数キーコピー
- 相対フレーム保持 paste
- 行選択 / 列選択 / 矩形選択対応

### Phase 4

- 反転P
- 左右ボーン名対応
- 別モデル貼り付け
- 体格補正 / motion translator との接続検討

## 判断

最初の実装は、単一キーの内部コピー / 同一トラック貼り付けに絞るのがよい。

理由:

- 現在の timeline selection が単一 track / 単一 frame 前提に近い
- 既存の add / delete / nudge と同じ Action / Command 線に乗せやすい
- 後続の複数選択、反転P、モーション変換の土台になる
- OS clipboard 形式を先に決めずに済む

