# 複数ボーン選択 設計メモ 2026-06-25

## 目的

v0.2 以降で、MMD らしい複数ボーン選択を扱うための方針を整理する。

主な要求は次の通り。

- 足 IK とつま先 IK を同時に選択して動かしたい
- IK 以外のボーンも複数選択自体はできるようにしたい
- 複数選択時の数値表示は MMD と同様にグレーアウトでよい
- IK 以外を含む複数選択は、操作ではなくコピー、削除、キー登録などの対象選択として扱いたい
- IK 同士の複数選択では、移動と回転の操作も許可したい

このメモでは、まず「複数ボーンを選べること」と「複数ボーンを同時操作できること」を分けて扱う。

## 基本方針

複数ボーン選択は、常に次の 2 層で考える。

- 選択層: どのボーンが選ばれているか
- 操作層: その選択集合を gizmo / 数値入力で操作できるか

選択は広く許可する。操作は選択内容によって制限する。

```ts
type BoneSelectionState = {
  activeBone: string | null;
  selectedBones: string[];
};
```

`activeBone` は最後に選んだボーン、または inspector / gizmo の基準ボーンとする。
`selectedBones` は現在の複数選択集合とする。単一選択時も `selectedBones = [activeBone]` として扱える形が望ましい。

## 選択ルール

### 単一選択

- 通常クリックで単一ボーン選択
- `activeBone` はクリックしたボーン
- `selectedBones` はクリックしたボーンのみ
- 既存の数値パネル、gizmo、キー登録は従来通り

### 追加選択

- Ctrl / Cmd + クリックで選択を toggle
- 追加されたボーンを `activeBone` にする
- 解除されたボーンが `activeBone` だった場合は、残りの選択から次の active を選ぶ
- 選択が空になった場合は `activeBone = null`

### 範囲選択

v0.2 初期では必須ではない。
将来的にはボーン一覧側で Shift 範囲選択を検討する。

ビューポート上の矩形ボーン選択は、ボーン表示と hit test の安定化が必要なので後回しでよい。

## UI 表示

### 単一選択時

従来通り、選択ボーンの transform 値を表示・編集する。

### 複数選択時

MMD に合わせて、数値表示・数値入力はグレーアウトする。

- ボーン名表示: `3 bones selected` または `3 ボーン選択`
- 位置 / 回転 / 補間などの数値欄: disabled
- activeBone の値を薄く表示するか、空表示にするかは UI 実装時に決める

ここで重要なのは、複数選択時に「どれか 1 つの値を編集している」と誤解させないこと。

## 操作可否

### IK ボーンのみの複数選択

選択集合がすべて IK ボーンの場合、gizmo 操作を許可する。

- gizmo は `activeBone` に表示
- 移動操作は、操作 delta を選択 IK ボーンすべてへ適用
- 回転操作も、操作 delta を選択 IK ボーンすべてへ適用
- undo / redo は batch bone transform command として扱う

足 IK とつま先 IK の同時操作はこのケースに入る。

### IK 以外を含む複数選択

選択集合に IK 以外のボーンが 1 つでも含まれる場合、gizmo 操作は不可にする。

- gizmo は非表示、またはグレーアウト
- 数値欄は disabled
- 選択表示は維持する
- コピー、削除、キー登録、反転ペーストなどの対象としては使える

これは MMD の「選択はできるが、ハンドル操作対象ではない」挙動に寄せる。

## IK 判定

実装前に、babylon-mmd / PMX ロード後のモデル情報から IK 判定に使える情報を確認する必要がある。

優先順:

1. PMX bone metadata に IK constraint / IK link 情報があるか
2. babylon-mmd runtime の linked bone から IK target 判定ができるか
3. 既存 `ModelInfo` / bone metadata に IK 属性を持たせられるか
4. 最終 fallback として名前ベース判定を使う

名前ベース判定だけに依存するのは避けたい。
ただし初期実装で足 IK / つま先 IK の検証を優先するなら、暫定 fallback としては許容する。

```ts
type BoneOperationCapability =
  | "single"
  | "multiIkTransform"
  | "multiSelectionOnly";
```

## キー登録との関係

複数ボーン選択は、キー登録まわりと強く関係する。

複数選択時のボーンキー登録は、`selectedBones` 全部を対象にする。

- 単一選択: activeBone のみ登録
- 複数選択: selectedBones 全部を登録
- IK 以外混在でも登録対象にはできる
- 登録結果は batch command として undo / redo 可能にする

この時点では、複数ボーンを同時操作できるかどうかとは分けて考える。

## コピー / 削除 / ペーストとの関係

IK 以外を含む複数選択でも、編集対象として使える。

- コピー: 選択ボーンの現在フレーム姿勢、または選択ボーンのキーをコピー
- 削除: 選択ボーンの現在フレームキーを削除
- 反転ペースト: 選択ボーン集合に対して適用
- VPD / VMD 書き出し: 将来的に対象セットとして利用

このため、複数ボーン選択は単なる gizmo 操作機能ではなく、編集対象集合として設計する。

## MMD メニュー由来の選択コマンド候補

MMD には、フレーム種別ごとに「すべて選択」するメニューがある。
複数ボーン選択や複数キー選択を実装するときは、これらを将来の Action 候補として残しておく。

スクリーンショットで確認した主な候補:

- カメラフレームすべて選択
- 照明フレームすべて選択
- セルフ影フレームすべて選択
- 重力フレームすべて選択
- アクセサリフレームすべて選択
- ボーンフレームすべて選択
- 表情フレームすべて選択
- 表示・IK・外親フレームすべて選択

MMD では、現在の欄/モードによって有効項目が切り替わる。

モデル欄では、主に次が有効になる。

- ボーンフレームすべて選択
- 表情フレームすべて選択
- 表示・IK・外親フレームすべて選択

カメラ欄では、主に次が有効になる。

- カメラフレームすべて選択
- 照明フレームすべて選択
- セルフ影フレームすべて選択
- 重力フレームすべて選択
- アクセサリフレームすべて選択

この切り替えは、MMD_modoki では `timelineTarget` と track category で表現するのが自然。
メニュー項目自体は同じ場所に置きつつ、現在の timeline target で enabled / disabled を切り替える。

このうち v0.2 で近いのは次の 3 つ。

- ボーンフレームすべて選択
- 表情フレームすべて選択
- カメラフレームすべて選択

照明、セルフ影、重力、アクセサリ、表示・IK・外親は、対応する keyframe track / property track の保存形が固まってから入れる。

複数ボーン選択との関係では、「ボーンフレームすべて選択」は 2 種類に分ける必要がある。

- 選択ボーンの全キーを選択
- 全ボーントラックの全キーを選択

前者は現在のトラック名ダブルクリックに近い。
後者は MMD メニューの「ボーンフレームすべて選択」に近い。

Action 名の候補:

```ts
timeline.selectAllBoneKeys
timeline.selectAllMorphKeys
timeline.selectAllCameraKeys
timeline.selectAllKeysByCategory
timeline.selectAllKeysForSelectedBones
```

UI としては、最初から全部をメニューに出す必要はない。
まず内部 Action と shortcut / command palette 的な導線を整理し、メニューは key 種別が増えてからまとめて追加する。

ただし MMD 互換の導線を見せる目的で、先にメニューバーの編集メニューへ項目だけを置くのは有効。
この場合、未実装項目は `menu.toast.unhandled` に流し、現在の `timelineTarget` に応じてモデル欄向け / カメラ欄向けの enabled を切り替える。

## MMD メニュー由来のフレーム操作候補

同じメニュー群には、選択だけでなく列操作・空フレーム操作もある。
これは複数キー選択の次段階として扱う。

候補:

- 別フレームへペースト
- 空フレーム挿入
- 列フレーム削除
- 不要フレーム削除
- ボーンフレーム位置角度補正
- 表情大きさ補正
- センター位置バイアス付加

これらは単なる UI コマンドではなく、timeline / command / undo-redo に関わる。
特に空フレーム挿入と列フレーム削除は、選択キーだけではなく「指定フレーム以降の全キーをずらす」操作になるため、batch key edit として別設計にする。

## Undo / Redo

複数ボーン操作・複数ボーンキー登録は batch command にする。

候補:

```ts
type BoneTransformBatchCommandDiff = {
  type: "edit.boneTransformBatch";
  items: {
    boneName: string;
    before: BoneTransformCommandSnapshot;
    after: BoneTransformCommandSnapshot;
  }[];
};
```

要件:

- 操作前 snapshot を全選択ボーン分保存する
- 操作後 snapshot を全選択ボーン分保存する
- undo で全ボーンを before に戻す
- redo で全ボーンを after に戻す
- batch 内の一部だけ失敗した場合は command 全体を失敗扱いにする

## 実装ステップ案

### Step 1: 選択状態だけ導入

対象:

- bottom panel のボーン一覧
- viewport bone selection
- `UIController` の選択状態
- `MmdManager` の selected bone 連携

内容:

- `activeBone`
- `selectedBones`
- Ctrl / Cmd toggle
- 単一選択互換
- 複数選択時の表示ラベル

この段階では gizmo 操作は単一選択のままでもよい。

### Step 2: 複数選択時の UI グレーアウト

対象:

- bottom panel transform sliders
- numeric input
- viewport bottom bar / selected bone 表示

内容:

- 複数選択時は transform 数値操作を disabled
- key registration / copy / delete など、対象集合として意味がある操作は enabled のまま残す

### Step 3: 複数ボーンキー登録

対象:

- keyframe registration
- command diff
- undo / redo

内容:

- selectedBones 全部に現在フレームキーを登録
- batch command 化
- 既存単一登録と同じ Action から入れる

### Step 4: IK のみ複数 gizmo 操作

対象:

- bone gizmo controller
- runtime pose application
- command diff

内容:

- selectedBones がすべて IK の場合だけ gizmo 操作を許可
- gizmo は activeBone に表示
- drag delta を selected IK bones 全部へ適用
- 移動と回転の両方を対象

### Step 5: コピー / 削除 / 反転ペーストへ拡張

対象:

- pose clipboard
- mirror paste
- current frame key deletion

内容:

- selectedBones を対象集合として扱う
- IK 判定に関係なく適用可能にする

## v0.2 での現実的な切り方

v0.2 前に入れるなら、まずは次の範囲が現実的。

- 複数ボーン選択状態
- 複数選択時の UI グレーアウト
- 複数ボーンへの一括キー登録

IK 同士の移動 / 回転操作は価値が高いが、gizmo と runtime pose delta の設計が絡むため、別ステップに分ける。

ただし足 IK + つま先 IK の同時操作は明確なユースケースなので、Step 4 の最初の検証対象にする。

## 未決事項

- IK 判定に使える一次情報をどこから取るか
- 複数選択時、activeBone のハイライトを単一選択とどう区別するか
- IK 以外混在時の gizmo は非表示にするか、グレーアウト表示にするか
- 複数選択時の bottom panel 文言
- 複数選択状態を project に保存するか。初期は保存しなくてよい可能性が高い
- ボーン一覧の Shift 範囲選択をいつ入れるか

## 判断

複数ボーン選択は、複数キー選択と同じく v0.2 以降の編集体験の土台になる。

ただし「複数ボーンを選ぶ」と「複数ボーンを同時に動かす」は分離する。
最初は selectedBones を編集対象集合として導入し、MMD と同じく複数選択時の数値 UI はグレーアウトする。
その上で、IK のみ複数選択の場合に限って gizmo 操作を許可する方向で進める。
