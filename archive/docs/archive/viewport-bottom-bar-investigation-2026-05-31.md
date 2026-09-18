# ビューポート下バー調査メモ 2026-05-31

## 目的

v0.2 UI では、本家 MMD 寄せのために `viewport` 下端へ現在値バーを追加する。

MMD_modoki では、これまでボーン / カメラの数値入力を下パネルのボーン欄へ押し込んでいた。
しかし本家 MMD では、選択対象の現在値はビューポート直下の細いバーに表示され、下パネルは操作種別、登録、補間、対象管理などを受け持っている。

このメモでは、本家 MMD スクリーンショットを見ながら、MMD_modoki のビューポート下バーへ入れるべき項目を整理する。

参照画像:

- `local-references/screenshots/mmd-menu/MMD_Model.png`
- `local-references/screenshots/mmd-menu/MMD_Camera.png`
- `local-references/screenshots/mmd-menu/MMD_Popup_ボーン位置角度補正.png`
- `local-references/screenshots/mmd-menu/MMD_Popup_カメラ位置角度補正.png`

## 本家 MMD の観察

本家 MMD では、ビューポート下端に灰色の現在値バーがある。
これは下パネルとは別の領域で、ビューポート内容に強く結びついた情報を横一列に置いている。

Model 選択時:

```text
カメラ編 | ボーン位置 X 0.00 Y 0.00 Z 0.00 | 角度 X 0.0 Y 0.0 Z 0.0
```

Camera 選択時:

```text
モデル編 | カメラ中心 X 0.00 Y 10.00 Z 0.00 | 角度 X 0.0 Y 0.0 Z 0.0 | 距離 45.00
```

読み取れる特徴:

- ビューポート下バーは「いま見ている/操作している現在値」の表示領域。
- Model mode でも `カメラ編` ボタンがあり、作業用カメラ編集への入口として見える。
- Camera mode でも `モデル編` ボタンがあり、モデル編集側への入口として見える。
- 数値はコンパクトな input 風の見た目で、ラベルは短い。
- ボーン位置 / カメラ中心は `X/Y/Z`、角度も `X/Y/Z`。
- Camera mode では距離が同じバーに入る。
- 本家では視野角は下パネルのカメラ操作欄にあり、下バーには距離までが見えている。
- 左端の `カメラ編` / `モデル編` は、MMD_modoki では Model / Camera mode 切替ボタンとして使うのが自然。

## MMD_modoki での役割

MMD_modoki では、ビューポート下バーを `現在値表示 / 現在値入力` の場所にする。

役割分担:

| 領域 | 役割 |
| --- | --- |
| ビューポート下バー | 選択対象の現在値表示、最小限の数値入力 |
| 下パネル ボーン操作欄 | 選択 / 回転 / 移動 / コピー / 登録 / 初期化 / 物理などの操作 |
| 下パネル ボーン欄 | 後続で縮小または機能欄化。現在値スライダーは下バーへ移す候補 |
| 下パネル カメラ欄 | 視点切替、フレーム範囲、将来の camera-specific 操作 |
| ポップアップ | 補正、詳細設定、低頻度の数値群 |

下バーは、キー登録 UI の主導線にはしない。
`登録` ボタンを置くとしても、現在値を見ながら近接して登録する補助導線として扱う。

## 初回で入れる候補

初回は、本家下バーの中心項目だけを入れる。

Model mode:

```text
カメラ編 | ボーン位置 X [0.00] Y [0.00] Z [0.00] | 角度 X [0.0] Y [0.0] Z [0.0]
```

Camera mode:

```text
モデル編 | カメラ中心 X [0.00] Y [10.00] Z [0.00] | 角度 X [0.0] Y [0.0] Z [0.0] | 距離 [45.00] | 視野角 [30]
```

本家スクショでは視野角は下パネル側にある。
ただし MMD_modoki では、Camera mode の下バーが「カメラ現在値の読み取り場所」になるため、視野角も初回から入れた方が分かりやすい。

左端の `カメラ編` / `モデル編` は、単なる表示ラベルではなく mode switch として扱う。
トップバーの Model / Camera 切替と同じ状態を指し、将来的にはトップバー側の mode switch を軽くする候補にもなる。

## 入れない候補

初回では以下を入れない。

- 補間編集
- コピー / ペースト
- ボーン選択 dropdown
- 複数ボーン選択 UI
- IK / 外親 / 物理などの機能ボタン
- モーフ値
- アクセサリ transform
- ライト / 影の現在値
- Auto Key
- 本家右下の `global / local` 軸ハンドルの完全再現

理由:

- 下バーは幅が限られる。
- 現在値と機能ボタンを混ぜると、下パネル整理の目的がぼやける。
- アクセサリ / ライト / モーフは下パネル側の欄で十分に見える。
- Auto Key は発火条件や対象の設計が重く、別スライスにした方がよい。

## ビューポート上のハンドルの扱い

本家 MMD には、ビューポート右下に `local` 表示と軸方向ハンドルがある。

MMD_modoki では Babylon の gizmo がすでに主導線になっているため、これを完全再現すると責務が重複しやすい。
ただし意味としては、以下を下バーへ吸収できる。

- 操作対象名
- Move / Rotate mode
- Local / Global state
- 現在値

初回では、浮いているハンドルを直接再現するより、下バーに `現在値` と `mode 状態` を置く方が安全。

## 下パネルから移す候補

下パネルのボーン欄にある以下は、下バーへ移す候補。

- `PosX / PosY / PosZ`
- `RotX / RotY / RotZ`
- Camera の疑似 bone として表示している `Pos / Rot`
- Camera distance
- Camera FoV

移した後の下パネル側は、以下のような `ボーン機能欄` に寄せる。

- 選択 / 回転 / 移動
- BOX選択
- 全て選択
- 未登録選択
- コピー
- ペースト
- 反転ペースト
- 登録
- 初期化
- 物理

## Controller 案

新規 controller 候補:

```ts
type ViewportBottomBarMode = "model" | "camera";

type ViewportBottomBarController = {
    applyMode(mode: ViewportBottomBarMode): void;
    setModelBoneValue(value: {
        modelName: string | null;
        boneName: string | null;
        position: { x: number; y: number; z: number };
        rotationDeg: { x: number; y: number; z: number };
    }): void;
    setCameraValue(value: {
        target: { x: number; y: number; z: number };
        rotationDeg: { x: number; y: number; z: number };
        distance: number;
        fovDeg: number;
    }): void;
    setInteractionState(value: {
        operationMode: "select" | "rotate" | "move";
        coordinateMode?: "local" | "global";
    }): void;
};
```

初回では read-only 表示でもよい。
入力対応を入れる場合は、既存の下パネルと同じ transform 更新経路へ流す。

## 実装スライス案

### Step 1: 枠と read-only 表示

- `viewport-bottom-bar` DOM を追加する。
- viewport と bottom panel の間に配置する。
- Model mode / Camera mode でラベルと項目を出し分ける。
- 左端に `モデル編` / `カメラ編` の mode switch を置く。
- 既存選択状態から現在値を読む。
- 数値 input 風だが、最初は `readonly` でもよい。

### Step 2: 数値入力を接続

- Model mode のボーン位置 / 角度を入力可能にする。
- Camera mode のカメラ中心 / 角度 / 距離 / 視野角を入力可能にする。
- 既存の `BottomPanel` / `CameraPanelController` と同じ更新経路へ流す。
- 入力確定後、下パネルと viewport gizmo を同期する。

### Step 3: 下パネルから値スライダーを削る

- 下バーが安定してから、下パネルボーン欄の Pos / Rot スライダーを削る。
- 下パネルボーン欄はボーン操作欄へ寄せる。
- Camera の疑似 bone 扱い解除を別スライスで進める。

## 注意点

- Model mode では作業用 View Camera を自由に動かせるため、下バーの `カメラ編` は MMD Camera keyframe ではなく作業カメラ側の入口として扱うか、単なる mode switch として扱うかを決める必要がある。
- Camera mode では viewport 操作が MMD Camera current value に反映されるため、下バーの値更新頻度が高くなる。
- 数値入力と gizmo 操作が同時に走ると stale 表示になりやすいので、表示更新は既存の frame/update 経路に寄せる。
- 入力欄は細くなるため、フォントサイズと桁数を最初から制限する。
- Undo / Redo は初回では対象外にしてよい。キー登録時の Command に寄せる。

## 現時点の結論

次に実装するなら、上バーより下バーを優先する。

初回ゴールは以下。

1. ビューポート下に細い現在値バーを作る。
2. Model mode ではボーン位置 / 角度を表示する。
3. Camera mode ではカメラ中心 / 角度 / 距離 / 視野角を表示する。
4. 本家 MMD の `カメラ編` / `モデル編` に相当する mode switch を左端に置く。
5. 既存下パネルの数値入力はすぐ削除せず、下バーが安定してから移す。

この順なら、MMD らしい見た目を先に作りつつ、下パネルのボーン欄を後続で機能欄へ整理しやすい。

## 2026-05-31 追加決定

実装前の追加検討で、初回スライスの仕様を以下に寄せる。

### 値の編集可否

初回では下バーの値は読み取り専用でよい。

理由:

- 下パネルのボーン欄 / camera 疑似 bone 経路 / gizmo の同期を一度に触ると重い。
- まずは表示と mode 切替、レイアウトを安定させる。
- 数値入力接続は後続スライスで行う。

見た目は input 風でもよいが、実際の編集は disabled / readonly 相当とする。

### `カメラ編` / `モデル編`

下バー左端の `カメラ編` / `モデル編` は、単なる表示ではなく mode 切替として有効にする。

MMD_modoki ではすでにトップバーに `モデル` / `カメラ` 切替があるが、下バー側を有効にするならトップバー側は削除候補にできる。
初回実装では、下バーの切替を正に寄せる方針で考える。

候補:

- Model mode: 左端に `カメラ編` ボタンを置き、Camera mode へ切り替える。
- Camera mode: 左端に `モデル編` ボタンを置き、Model mode へ切り替える。

トップバー側の既存切替をいつ消すかは、実装時に表示崩れと導線を見て判断する。

### ボーン未選択時

Model mode でボーン未選択の場合、数値欄は空欄にする。

表示候補:

```text
カメラ編 | ボーン位置 X [ ] Y [ ] Z [ ] | 角度 X [ ] Y [ ] Z [ ]
```

`操作中心` や最後に選んだボーンを出すより、空欄の方が誤解が少ない。

### カメラ中心

Camera mode の `カメラ中心` は、本家 MMD に寄せられるなら寄せる。
ただし、現行実装では camera 疑似 bone 経路や viewport camera sync が絡むため、初回では無理に詳細を詰めない。

初回では以下の優先度にする。

1. MMD camera target 相当の値を安全に読めるなら、それを `カメラ中心 X/Y/Z` として表示する。
2. 難しい場合は、既存 Camera transform 表示に近い値を暫定表示する。
3. 値の正確な意味づけは後続で詰める。

### 右下ハンドル

本家 MMD の viewport 右下にある local/global 軸ハンドルは、初回では形だけ入れる。

方針:

- 見た目の MMD らしさのため、下バーまたは viewport 右下に placeholder として表示する。
- 中身の操作や local/global 切替はまだ接続しない。
- クリック操作、軸方向操作、Babylon gizmo との同期は後続扱い。

初回では `local` 表示、XYZ 風の小さな状態表示、または簡易 badge 程度に留める。

### 初回実装範囲の更新

初回実装の範囲は以下に更新する。

1. `ViewportBottomBarController` を追加する。
2. viewport 下に細いバーを追加する。
3. `カメラ編` / `モデル編` を有効な mode switch として置く。
4. Model mode でボーン位置 / 角度を read-only 表示する。
5. ボーン未選択時は数値を空欄にする。
6. Camera mode でカメラ中心 / 角度 / 距離を read-only 表示する。
7. 右下ハンドル placeholder を形だけ追加する。
8. トップバーの Model / Camera 切替は、下バー側で代替できるなら削除または非表示候補にする。

下パネルの数値入力削除、下バー数値入力の実接続、local/global ハンドル操作は後続。
