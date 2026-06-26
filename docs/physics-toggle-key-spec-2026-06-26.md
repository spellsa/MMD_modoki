# 物理 ON/OFF キー仕様メモ 2026-06-26

## 目的

v0.2 のキー登録作業として、MMD の「物理 ON/OFF キー」を MMD_modoki にどう持たせるかを整理する。

ここで扱う「物理 ON/OFF キー」は、アプリ全体の物理演算を止めるトグルではなく、VMD の Bone keyframe に含まれる `PhysicsToggle` を編集する機能として扱う。

## 調査対象

- babylon-mmd 公式ドキュメント
  - Introduction to VMD and VPD
  - Apply Physics To MMD Models
  - Bullet Physics
  - MMD Animation
- `babylon-mmd@1.2.0` のローカル package
  - `node_modules/babylon-mmd/esm/Loader/Animation/IMmdAnimationTrack.d.ts`
  - `node_modules/babylon-mmd/esm/Loader/Animation/mmdAnimationTrack.d.ts`
  - `node_modules/babylon-mmd/esm/Loader/vmdLoader.js`
  - `node_modules/babylon-mmd/esm/Runtime/Animation/mmdRuntimeModelAnimation.js`
- MMD_modoki の現行実装
  - `src/editor/timeline-edit-service.ts`
  - `src/editor/motion-document.ts`
  - `src/editor/mmd-animation-builder.ts`
  - `src/project/project-codec.ts`
  - `src/ui-controller.ts`
  - `index.html`

## 用語の切り分け

物理まわりは似た名前の機能が多いので、v0.2 では次を分けて扱う。

| 種類 | MMD_modoki 上の扱い | キー登録対象 |
| --- | --- | --- |
| ランタイム物理 ON/OFF | 再生時の物理 simulation 全体の有効/無効 | 対象外 |
| 剛体表示 ON/OFF | debug/visualizer 表示 | 対象外 |
| 重力設定 | physics runtime の gravity | 別タスク |
| IK ON/OFF | VMD Property keyframe の IK state | 別タスク |
| ボーン物理 ON/OFF | Bone keyframe の `physicsToggle` | 今回の対象 |

`runtime.togglePhysics` 相当の全体トグルをキーフレーム化すると、MMD の Bone keyframe と意味がずれる。今回の「物理オンオフキー」は、選択ボーンに対する `physicsToggles` の編集として実装する。

## babylon-mmd 側の知見

### VMD 上の位置づけ

babylon-mmd の VMD/VPD 解説では、VMD Bone keyframe は Bone name、Frame number、Position、Rotation、Interpolation に加えて `PhysicsToggle` を持つ。これは「そのボーンに物理を適用するか」を表すフラグである。

一方で、VMD Property keyframe は model visible と IK enable table を持つ。つまり、物理 ON/OFF と IK ON/OFF は同じ property track ではなく、別データとして扱う。

VPD は bone/morph の現在姿勢を保存する形式で、Property keyframe や Camera/Light/Self Shadow keyframe は持たない。物理 ON/OFF も VPD export の初期対象には含めないのが自然。

### Runtime 上の反映

`MmdBoneAnimationTrack` / `MmdMovableBoneAnimationTrack` には `physicsToggles: Uint8Array` がある。

`vmdLoader.js` は VMD の物理トグルを読み取り、ON を `1`、OFF を `0` として `physicsToggles` に格納している。空トラック最適化でも、姿勢が default でも `physicsToggle === 0` のキーは空扱いしない。

`mmdRuntimeModelAnimation.js` はボーントラックを評価したあと、評価対象ボーンに紐づく剛体 index に対して `rigidBodyStates[rigidBodyIndex] = physicsToggle` を書き込む。評価は補間値ではなく、現在フレーム以前の直近キーから値を取る step 型の扱いになる。

```text
boneTrack.physicsToggles
  -> runtime bone の rigidBodyIndices
  -> model.rigidBodyStates
  -> physicsModel.commitBodyStates(...)
```

このため、MMD_modoki 側で扱うべき値は次でよい。

```ts
type PhysicsToggle = 0 | 1; // 0 = OFF, 1 = ON
```

### Physics runtime との関係

babylon-mmd は MMD 向け physics として Bullet / Ammo.js / Havok を選べるが、MMD 再現性では Bullet が本命とされている。MMD_modoki では既に Bullet 系 runtime を前提にしているため、物理 ON/OFF キーは backend 別の UI ではなく、MMD animation track の編集として扱う。

ただし、WASM runtime では `MmdAnimation` を WASM メモリ側へコピーする経路がある。JS 側の track 配列を更新しただけで runtime 再生へ即時反映されない可能性があるため、既存のキー登録と同じ runtime animation handle 再生成 / seek 再評価経路に乗せる必要がある。

## 現行 MMD_modoki の状態

既に `physicsToggles` は多くの保存/編集経路で保持されている。

- `timeline-edit-service.ts`
  - `BoneKeyframePayload` / `MovableBoneKeyframePayload` に `physicsToggles: number[]` がある。
  - keyframe paste / batch paste / delete / merge で `physicsToggles` を保持している。
- `motion-document.ts`
  - `EditorBoneKey` に `physicsToggle: 0 | 1` がある。
  - sample 時は直近 key の `physicsToggle` を返す。
- `mmd-animation-builder.ts`
  - `MmdAnimation` と editor motion document の相互変換で `physicsToggle` を維持している。
- `project-codec.ts`
  - project save/load で bone/movable bone track の `physicsToggles` を pack/copy している。
- `ui-controller.ts`
  - 通常の選択ボーン keyframe 登録では、現状 `physicsToggles: [1]` を作っている。
  - interpolation 保存系には既存 track から physics toggle を引き継ぐ処理がある。
- `index.html`
  - timeline dock に `物理OFF` ボタンが存在するが、現在は disabled で未接続。

つまり、足りないのは主に「表示/操作として明示的に physicsToggle を編集する導線」と「runtime 反映の確認」であり、データ構造を新設する必要は薄い。

## v0.2 初期仕様案

### 対象

初期実装は model の bone track のみ対象にする。

- 選択ボーン 1 件: そのボーンの現在フレームへ physics toggle を登録する。
- 複数ボーン選択: 選択中の各ボーンへ同じ physics toggle を一括登録する。
- camera / morph / scene track: 対象外。
- 剛体を持たないボーン: キー自体は登録可能にしてよい。ただし runtime 上の効果はない。

`MmdBoneAnimationTrack` と `MmdMovableBoneAnimationTrack` のどちらに入るかは、既存のキー登録と同じ判定に従う。通常ボーンを誤って movable track に作らないこと。

### 値の決定

現在フレームに既存キーがある場合は、そのキーの `physicsToggles[0]` を上書きする。

現在フレームにキーがない場合は、現在姿勢の bone key を upsert し、その payload の `physicsToggles[0]` に指定値を入れる。position / rotation / interpolation は通常のボーンキー登録と同じ取得経路を使う。

既定値は `1`。既存 track の直近 key が読める場合は、表示上の現在値として直近 key の値を参照する。

0 フレーム目は、物理関連ボーンに必ず物理 ON key が入るものとして扱う。MMD 本家同様、物理ボーン表示 ON 時は 0f に `×` marker が並ぶ状態をデフォルトとする。

### UI

最小実装では、既存の timeline dock の `物理OFF` ボタンを使う。

推奨挙動:

- `物理` ボタンは、選択ボーンを現在フレームで物理 ON として登録する操作にする。
- 登録される値は `physicsToggle === 1`。
- 複数ボーン選択時は、選択中の各ボーンへ同じ物理 ON key を一括登録する。
- 対象ボーンなし、モデルなし、編集可能 animation なしでは disabled。

物理 OFF key は、通常のボーン位置/角度 key と同じく、現在姿勢を登録する操作で `physicsToggle === 0` になったものとして扱う。初期実装では、物理 OFF 専用ボタンを増やすより、通常登録で現在姿勢を打つ経路と `physicsToggles` の値決定を babylon-mmd / VMD の解釈に合わせる。

### Command / Undo

通常の keyframe paste と同じ Command 経路を使う。

- 単一ボーン: `keyframe.paste`
- 複数ボーン: `keyframe.batchPaste`

before payload を取得してから after payload を作ることで、Ctrl+Z で元の physics toggle / 既存キー状態へ戻せるようにする。

新しい「物理だけの track」は作らない。物理 ON/OFF は bone key の属性なので、CommandDiff も既存 bone/movable bone payload を使う。

### Timeline 表示

初期実装では、物理 ON/OFF 専用の別レーン表示は追加しない。

ただし `physicsToggle === 0` のキーは「姿勢が default でも意味があるキー」なので、空キー削除や不要キー削除の対象にすると壊れる。将来の timeline 表示では、通常ボーンキー上に小さい印を付ける案がよい。

MMD 本家では、物理が有効なボーン行に `×` 形の key marker が表示される。これは通常のボーン姿勢 key のダイヤ表示とは別に、「そのボーンが物理有効状態として key 打ちされている」ことを読み取れる表示になっている。

MMD_modoki の初期表示案:

- 通常の位置/回転 key は従来どおりの marker を維持する。
- `physicsToggle === 1` の明示 key は、物理ボーン表示 ON のとき `×` marker として表示する。これは「物理が有効で、姿勢は物理に任せる」key として扱う。
- `physicsToggle === 0` の明示 key は、通常の位置/回転 key と同じダイヤ marker として表示する。これは「物理 OFF で、その key の角度/位置を持つ」key として扱う。
- 物理ボーン表示 OFF のときも、内部データとしては `physicsToggles` を保持する。
- copy / paste / delete / rectangle selection の対象としては、`×` marker も bone key と同じ `track + frame` key として扱う。

最初から完全に MMD と同じ描画にしなくてもよいが、物理 ON/OFF key の存在が通常ダイヤだけでは見えにくいため、`×` marker 表示は早めに入れた方がよい。

### 物理ボーン表示の暫定方針

現状のタイムラインは、操作対象として出しているボーン行を中心に構成しており、物理で動くボーンをすべて常時表示していない。MMD 本家に近づけるなら、将来的には「表示・IK・外親」やボーンカテゴリ表示の中で物理関連ボーンも扱える必要がある。

ただし v0.2 初期実装で物理ボーン行を常時追加すると、次の判断が同時に必要になる。

- どのボーンを「物理ボーン」とみなすか。
- 剛体を持つボーンだけを出すか、物理後変形ボーンや髪/スカート系の末端ボーンも出すか。
- 物理 ON/OFF key が存在するが通常操作しないボーンを、通常ボーンと同じ密度で表示するか。
- 行数増加で、既存の複数キー選択や矩形選択の操作感を悪化させないか。

そのため暫定対応として、メニューバーに表示トグルを追加する案がよい。

```text
表示
  タイムラインに物理ボーンを表示
```

この項目は timeline の表示フィルタであり、物理 runtime の ON/OFF ではない。チェック ON のときだけ、選択モデルの物理関連ボーンを timeline 行に含める。チェック OFF のときでも、既存 motion に含まれる `physicsToggles` は保持し、copy / paste / delete / project save/load で消さない。

表示 ON 時は、MMD 本家のように物理関連ボーン行を展開し、現在 frame に明示 key があるものを `×` marker で表示する。スクリーンショット上の `スカート_0_0` などの行のように、物理有効なボーンが一覧に出て、0f に `×` が並ぶイメージを暫定目標にする。

初期の「物理関連ボーン」判定は、保守的に次の優先順でよい。

1. runtime bone に `rigidBodyIndices` があり、紐づく剛体を持つボーン。
2. PMX metadata から物理後変形、または物理で動く可能性が高いと判断できるボーン。
3. 判定不能な場合は通常表示対象に含めず、既存 track に key がある場合だけ表示候補にする。

この表示トグルは project data ではなく UI preference として扱う。最初は保存なしでもよいが、実装するなら preferences 側に保存する。

### 保存 / 読み込み / 書き出し

project save/load は既に `physicsToggles` を保持しているため、実装後は round-trip をテストで固定する。

VMD 書き出しでは Bone keyframe の `PhysicsToggle` として出す必要がある。VPD 書き出しは VPD の性質上、初期対応では物理 ON/OFF を含めない。

## 実装フェーズ案

### Phase 1: helper と unit test

- 選択ボーン + 現在フレーム + 目標 toggle から after payload を作る helper を用意する。
- 既存キーありの場合は `physicsToggles` だけ変わることを確認する。
- 既存キーなしの場合は現在姿勢 payload を作り、`physicsToggles` が指定値になることを確認する。
- 複数ボーン選択で batch payload が作れることを確認する。
- default は `1`、明示 OFF は `0` とする。

### Phase 2: UI 接続

- `timeline-edit-btn--physics-toggle` を有効化する条件を追加する。
- 現在 sample から `物理OFF` / `物理ON` 表示を更新する。
- click で `keyframe.paste` / `keyframe.batchPaste` へ流す。
- 複数ボーン選択時は数値欄と同じく詳細表示はグレーアウトのままでよい。

### Phase 3: runtime 確認

- キー登録後、現在 frame の再評価で `physicsToggles` が runtime animation に反映されることを確認する。
- seek で OFF 区間 / ON 区間が切り替わることを確認する。
- Classic / WASM runtime のどちらでも既存の animation rebind 経路に乗るか確認する。
- OFF -> ON に戻した直後の剛体挙動は不連続になり得るので、MMD 互換挙動として許容しつつ、破綻が大きい場合は別メモに残す。

### Phase 4: 表示拡張と VMD export

- `physicsToggle === 0` のキーに timeline marker を追加する。
- VMD writer 実装時に Bone keyframe の physics toggle を出す。
- 不要キー削除で OFF key を消さない条件を入れる。

## 受け入れ条件

- 選択ボーンの現在フレームへ物理 OFF key を登録できる。
- もう一度操作して物理 ON key を登録できる。
- 複数選択ボーンへ同じ ON/OFF key を一括登録できる。
- Undo / Redo で physics toggle とキー存在状態が戻る。
- project save/load 後も `physicsToggles` が維持される。
- 既存の通常ボーンキー登録は default `1` を維持し、勝手に OFF にならない。
- 物理 OFF key のみ意味を持つ default pose key が、空トラック扱いで削除されない。

## 未決 / 注意点

- MMD 本家の `物理OFF` ボタンが「現在値を反転」なのか「OFF を明示登録」なのかは実機で再確認したい。v0.2 初期案では、表示された操作を現在フレームへ登録する。
- 剛体を持たないボーンにも key を打てるようにするか、UI 上 disabled にするかは運用で決める。データ互換性を優先するなら登録可能でよい。
- WASM runtime では JS 側 `MmdAnimation` mutation だけでは不十分な可能性がある。既存の key registration rebind 経路に必ず乗せる。
- 物理 ON 復帰時の剛体初期化/姿勢合わせは、単なる key edit 以上に難しい。まずは MMD/VMD 互換の state toggle として扱い、必要なら後続で seek 安定化と分けて検討する。
- 物理焼き込みとは別機能。焼き込みは runtime の結果を通常ボーンキーへ変換する処理で、今回の `physicsToggles` 編集とは分ける。

## 参考リンク

- [babylon-mmd: Introduction to VMD and VPD](https://noname0310.github.io/babylon-mmd/docs/reference/understanding-mmd-behaviour/introduction-to-vmd-and-vpd/)
- [babylon-mmd: Apply Physics To MMD Models](https://noname0310.github.io/babylon-mmd/docs/reference/runtime/apply-physics-to-mmd-models/)
- [babylon-mmd: Bullet Physics](https://noname0310.github.io/babylon-mmd/docs/reference/runtime/bullet-physics/)
- [babylon-mmd: MMD Animation](https://noname0310.github.io/babylon-mmd/docs/reference/runtime/animation/mmd-animation/)
- [物理焼き込みキー調査メモ 2026-06-15](./physics-bake-key-research-2026-06-15.md)
- [キー登録 runtime track 再整理メモ 2026-06-16](./keyframe-registration-runtime-track-note-2026-06-16.md)
- [キー登録 v0.2 リリース前集中メモ 2026-06-25](./key-registration-v0.2-release-focus-2026-06-25.md)
