# キー登録再設計メモ 2026-06-16

## 背景

手打ちのボーンキー登録で、タイムラインの XYZ graph や下パネルの数値は正しく見えるのに、viewport の再生 / シークでは後続キーが評価されない問題が出ている。

これまでの修正で、少なくとも次の問題は見つかった。

- 通常ボーンを `MmdMovableBoneAnimationTrack` に保存していた
- editor 側で後から track を差し替えても `MmdAnimation.endFrame` を更新していなかった
- 手打ちキーの `physicsToggles` fallback が VMD loader の既定値と違っていた

ただし、修正後も viewport 再生が安定していない。現行実装は段階的に足してきたため、表示、編集、runtime 反映の責務が混ざっている可能性が高い。

## 参照した babylon-mmd 側の前提

ローカルに入っている `babylon-mmd` package の README / CHANGELOG / esm 実装を確認した。

### 標準的な適用経路

README の基本例では、VMD を `MmdAnimation` として読み、次の流れで model / camera に適用している。

```ts
const modelMotion = await vmdLoader.loadAsync("model_motion", "motion.vmd");
const modelRuntimeAnimationHandle = mmdModel.createRuntimeAnimation(modelMotion);
mmdModel.setRuntimeAnimation(modelRuntimeAnimationHandle);
```

CHANGELOG でも、現在の API は `createRuntimeAnimation()` で handle を作り、`setRuntimeAnimation()` で現在 animation にする形とされている。

### runtime 評価

`MmdRuntime.seekAnimation(frame, true)` は runtime 全体の animation duration で frame を clamp してから、各 model / camera の current animation を評価する。

`MmdRuntimeModelAnimation` は track ごとに次を行う。

- `boneTracks` / `movableBoneTracks` を runtime bone へ bind して評価する
- track の `frameNumbers`、`rotations`、`positions`、`interpolations` を直接読む
- track の `physicsToggles` を `rigidBodyStates` へ反映する

`MmdAnimationTrack.startFrame/endFrame` は getter で `frameNumbers` から読む。一方で `MmdAnimation.startFrame/endFrame` は constructor 時に計算される値なので、後から track を差し替える場合は再計算が必要になる。

### physicsToggles

`VmdLoader` は VMD の物理 ON を `1`、OFF を `0` として読む。

`MmdBulletPhysics.commitBodyStates()` のコメントでは、`rigidBodyStates[i]` が `0` の場合 kinematic、`1` かつ FollowBone 以外の場合 dynamic とされる。

手打ちキーの新規 track fallback は VMD と同じ `1` を既定にするべき。

## 現行実装の問題

### 真実が複数ある

現行は少なくとも次の値が別々に存在している。

- babylon-mmd の `MmdAnimation`
- runtime handle 化された current animation
- timeline 表示用の frame map / graph
- bottom panel の slider 表示値
- pending bone pose snapshot
- `linkedBone` へ直接書き込んだ preview pose

この状態では、タイムラインと下パネルが正しくても runtime が正しいとは限らない。

今回の症状はまさにこれで、UI 表示系は editor 側の配列を読んで正しい値を出せるが、viewport は runtime / physics / current animation handle の状態に依存している。

### `MmdAnimation` を可変データストアとして使っている

`babylon-mmd` の loader は、track が完成した状態で `MmdAnimation` を生成する前提に近い。

MMD_modoki では、空の `MmdAnimation` を作ってから track 配列や typed array を後から差し替えている。これはできなくはないが、次のような落とし穴が多い。

- `MmdAnimation.endFrame` の再計算が必要
- wasm runtime animation は生成時に source animation をコピーする
- runtime handle 再生成と seek の順序が重要
- UI が source animation を読むと、runtime handle 側との差分に気づきにくい

### UIController が編集モデルと runtime 操作を抱えすぎている

`UIController` が次の処理を同時に行っている。

- 現在 pose の capture
- payload 作成
- command 実行
- interpolation 継承
- `MmdAnimation` 変更
- runtime handle 再生成
- viewport への直接 pose 反映
- timeline / bottom panel 表示同期

このため、キー登録時の正しい順序が崩れやすい。

## 再設計方針

### 1. EditorMotionDocument を正とする

編集用の source of truth を `MmdAnimation` から切り離す。

案:

```ts
type EditorMotionDocument = {
  modelTracksByModelId: Map<string, EditorModelMotion>;
  cameraMotion: EditorCameraMotion;
};

type EditorBoneTrack = {
  name: string;
  kind: "bone" | "movableBone";
  keys: EditorBoneKey[];
};

type EditorBoneKey = {
  frame: number;
  rotation: QuaternionLike;
  position?: Vector3Like;
  rotationInterpolation: Uint8Tuple4;
  positionInterpolation?: Uint8Tuple12;
  physicsToggle: 0 | 1;
};
```

`MmdAnimation` は保存先ではなく、runtime / export / preview 用に生成する artifact と考える。

### 2. MmdAnimationBuilder を作る

`EditorMotionDocument` から毎回 fresh な `MmdAnimation` を組み立てる。

責務:

- track kind を PMX metadata の `BoneControlInfo.movable` と照合する
- frame を昇順に整列する
- duplicate frame を解決する
- `MmdBoneAnimationTrack` / `MmdMovableBoneAnimationTrack` を frameCount 付きで新規生成する
- typed array を一括で詰める
- `MmdAnimation` constructor に完成済み track を渡す

これにより、`MmdAnimation.endFrame` の後更新や stale typed array 問題を避ける。

### 3. RuntimeBinder を作る

runtime 反映は単一の service に隔離する。

責務:

- 現在 model / camera の既存 runtime animation handle を破棄する
- `runtimeMode === "wasm"` なら `MmdWasmAnimation` で包む
- `createRuntimeAnimation()` -> `setRuntimeAnimation()` を行う
- `seekAnimation(currentFrame, true)` を行う
- 必要なら physics reinitialize / hard seek policy を呼ぶ

UIController から直接 `createRuntimeAnimation()` や `setRuntimeAnimation()` を呼ばない。

### 4. 表示値も runtime / document のどちらを読むか明示する

再生 / シーク中の viewport は babylon-mmd runtime を正とする。

timeline graph は `EditorMotionDocument` を読む。これは編集データ表示なのでよい。

bottom panel は状態によって読み分ける。

- 編集操作中: pending pose / gizmo 操作値
- paused seek 後: runtime 評価後の pose
- key 選択時の inspector: `EditorMotionDocument` の key payload

少なくとも「graph が正しいから runtime も正しい」という扱いはやめる。

### 5. 登録ボタンの処理を Command に寄せる

登録操作は次の一本の流れにする。

```text
capture viewport pose
↓
build KeyframeCommand
↓
EditorMotionDocument に upsert
↓
MmdAnimationBuilder で runtime artifact 作成
↓
RuntimeBinder で bind + seek
↓
timeline / bottom panel 更新
```

`UIController` は button event を Action / Command に変換するだけに寄せる。

## 段階的実装案

### Phase 0: 現行機能の凍結

現行の手打ちキー登録は「不安定」として扱い、これ以上パッチを重ねない。

やること:

- 既知不具合を docs に残す
- 既存テストは残す
- 新設計のテストリストを作る

### Phase 1: Builder の pure helper 化

DOM / Babylon runtime に依存しない helper として実装する。

対象:

- `EditorBoneTrack` -> `MmdBoneAnimationTrack`
- `EditorBoneTrack` -> `MmdMovableBoneAnimationTrack`
- `EditorModelMotion` -> `MmdAnimation`
- `boneControlInfos` による track kind 判定
- duplicate frame / sort / overwrite

テスト:

- 普通ボーンは `boneTracks`
- センターなど movable は `movableBoneTracks`
- 0f / 10f / 20f の key で `MmdAnimation.endFrame === 20`
- physics toggle fallback は `1`
- VMD loader 由来 track と同じ形の `MmdAnimation` になる

### Phase 2: RuntimeBinder の導入

`mmd-manager.ts` または `src/editor/` に runtime 反映 service を置く。

既存の `refreshActiveRuntimeAnimationHandles()` を置き換えるか、内部実装をこの service へ寄せる。

テスト:

- handle を破棄して作り直す
- wasm mode では `MmdWasmAnimation` を使う
- bind 後に current frame へ seek する
- model / camera を分離して扱える

### Phase 3: 登録ボタンだけ新経路へ移す

まずはボーンの `登録` のみを新経路にする。

対象外:

- コピー / ペースト
- 反転ペースト
- 物理 ON/OFF キー
- VMD 書き出し

ここで、同一ボーンにキー A / キー B を打ち、先頭から再生したときに viewport が補間されることを確認する。

### Phase 4: コピー / ペースト / 削除を移す

登録が安定してから、編集操作を同じ `EditorMotionDocument` ベースに寄せる。

### Phase 5: 保存 / 読み込み / VMD 書き出し

project JSON には `EditorMotionDocument` 相当を保存する。

必要なら読み込み時に旧 project の `MmdAnimation` 由来保存値を migration する。

## デバッグ方針

再設計中は、次の比較ログを一時的に出せるようにする。

```text
frame
track name
editor key sample
generated MmdAnimation track sample
runtime current pose
bottom panel pose
```

ただし常時 `console.log` は増やさず、debug flag または app log scope に隔離する。

## 判断

今の不具合は単発バグというより、キー登録まわりの責務分離不足が表面化したものと見る。

現行実装に小さい修正を重ね続けるより、まず `EditorMotionDocument -> MmdAnimationBuilder -> RuntimeBinder` の三層に分け、babylon-mmd の標準的な runtime animation 適用経路に合わせ直す方がよい。

## 実装に入るための詳細設計

### 新規ファイル構成案

まずは `src/editor/` 配下に閉じる。`UIController` と `MmdManager` から直接触る範囲を最小にする。

```text
src/editor/
  motion-document.ts
    編集用 motion document の型と pure 操作

  motion-document-builder.ts
    MmdAnimation / project state / VMD 由来 animation から EditorMotionDocument を作る

  mmd-animation-builder.ts
    EditorMotionDocument から babylon-mmd の MmdAnimation を fresh build する

  runtime-animation-binder.ts
    MmdAnimation を runtime model / camera へ bind し、現在 frame へ seek する

  keyframe-registration-service.ts
    登録ボタン用の orchestration。UI から pose snapshot を受け、Command を作る
```

既存の `timeline-edit-service.ts` は一気に消さない。まずは新経路を追加し、登録ボタンだけを段階的に差し替える。

### EditorMotionDocument 型

最初は model bone / morph / camera に絞る。property / accessory / physics key は後続。

```ts
export type EditorMotionDocument = {
  version: 1;
  models: Map<string, EditorModelMotion>;
  camera: EditorCameraMotion | null;
};

export type EditorModelMotion = {
  modelId: string;
  name: string;
  boneTracks: Map<string, EditorBoneTrack>;
  morphTracks: Map<string, EditorMorphTrack>;
};

export type EditorBoneTrack = {
  name: string;
  kind: "bone" | "movableBone";
  keys: EditorBoneKey[];
};

export type EditorBoneKey = {
  frame: number;
  rotation: readonly [number, number, number, number];
  rotationInterpolation: readonly [number, number, number, number];
  physicsToggle: 0 | 1;
  position?: readonly [number, number, number];
  positionInterpolation?: readonly [
    number, number, number, number,
    number, number, number, number,
    number, number, number, number
  ];
};

export type EditorMorphTrack = {
  name: string;
  keys: EditorMorphKey[];
};

export type EditorMorphKey = {
  frame: number;
  weight: number;
};

export type EditorCameraMotion = {
  keys: EditorCameraKey[];
};
```

重要なルール:

- `keys` は helper 内で必ず frame 昇順に正規化する
- 同一 frame は 1 key に統合し、後勝ちにする
- 普通ボーンに `position` は保存しない
- `physicsToggle` の既定は `1`
- interpolation は UI の曲線値をそのまま `0..127` で保持する

### pure 操作 API

`motion-document.ts` にまず次を置く。

```ts
export function upsertBoneKey(
  motion: EditorModelMotion,
  trackName: string,
  kind: "bone" | "movableBone",
  key: EditorBoneKey,
): { motion: EditorModelMotion; before: EditorBoneKey | null; after: EditorBoneKey };

export function removeBoneKey(
  motion: EditorModelMotion,
  trackName: string,
  frame: number,
): { motion: EditorModelMotion; removed: EditorBoneKey | null };

export function moveBoneKey(
  motion: EditorModelMotion,
  trackName: string,
  fromFrame: number,
  toFrame: number,
): { motion: EditorModelMotion; moved: EditorBoneKey | null; overwritten: EditorBoneKey | null };

export function sampleBoneTrack(
  track: EditorBoneTrack,
  frame: number,
): EditorBonePoseSample | null;
```

最初の実装では immutable copy を返す。性能が気になったら後で内部 mutable に寄せる。

### MmdAnimationBuilder

`MmdAnimation` は mutation せず、毎回完成済み track から作る。

```ts
export function buildMmdAnimationFromEditorMotion(
  name: string,
  motion: EditorModelMotion,
  modelInfo: ModelInfo,
): MmdAnimation;
```

処理:

1. `EditorBoneTrack` ごとに `kind` と `modelInfo.boneControlInfos[].movable` を照合する
2. 不一致なら modelInfo を優先して `kind` を補正する
3. `keys.length` を frameCount として `MmdBoneAnimationTrack` / `MmdMovableBoneAnimationTrack` を新規生成する
4. `frameNumbers` / `rotations` / `positions` / `interpolations` / `physicsToggles` を一括 set する
5. morph / property / camera track も空ではなく正規 track として生成する
6. 完成済み track を `new MmdAnimation(...)` に渡す

この時点で `MmdAnimation.endFrame` は constructor によって正しくなる。

### RuntimeAnimationBinder

runtime 反映の入口を一つにする。

```ts
export type RuntimeAnimationBinderHost = {
  runtimeMode: "classic" | "wasm";
  scene: Scene;
  mmdRuntime: { seekAnimation(frame: number, forceEvaluate: boolean): Promise<void> | void };
  mmdWasmInstance: unknown | null;
};

export function bindModelMotionToRuntime(
  host: RuntimeAnimationBinderHost,
  model: RuntimeModel,
  animation: MmdAnimation,
  frame: number,
): void;
```

処理:

1. model の既存 runtime animation handle を破棄する
2. wasm mode なら `new MmdWasmAnimation(animation, wasmInstance, scene)` を使う
3. `model.createRuntimeAnimation(...)`
4. `model.setRuntimeAnimation(handle)`
5. `mmdRuntime.seekAnimation(frame, true)`

`UIController` は runtime handle を直接触らない。`MmdManager` 側に薄い public method を置き、内部で binder を呼ぶ。

### KeyframeRegistrationService

登録ボタンはこの service に寄せる。

```ts
export type KeyframeRegistrationRequest =
  | {
      kind: "bone";
      modelId: string;
      boneName: string;
      frame: number;
      pose: BonePoseSnapshot;
      interpolation: BoneInterpolationSnapshot;
    }
  | {
      kind: "morph";
      modelId: string;
      morphName: string;
      frame: number;
      weight: number;
    }
  | {
      kind: "camera";
      frame: number;
      pose: CameraPoseSnapshot;
      interpolation: CameraInterpolationSnapshot;
    };

export function createRegisterKeyframeCommand(
  document: EditorMotionDocument,
  request: KeyframeRegistrationRequest,
): BuiltCommand | null;
```

Command diff は frame list だけではなく payload 全体を持つ。

```ts
type RegisterKeyframeDiff = {
  type: "keyframe.register";
  target: CommandTrackRef;
  frame: number;
  before: EditorKeyframePayload | null;
  after: EditorKeyframePayload;
};
```

undo は `before` を戻す。`before === null` なら key を削除する。

これで「Command は成功したが pose 値は後段で別 mutation」という状態をなくす。

## 最初の実装単位

### Commit 1: pure document / builder

追加:

- `src/editor/motion-document.ts`
- `src/editor/mmd-animation-builder.ts`
- `test/editor/mmd-animation-builder.test.ts`

テスト:

- ordinary bone 2 key -> `MmdAnimation.boneTracks[0].frameNumbers === [0, 20]`
- ordinary bone 2 key -> `MmdAnimation.endFrame === 20`
- movable bone -> `movableBoneTracks`
- physics toggle fallback -> `1`
- duplicate frame は後勝ち
- frame は昇順に sort

この commit では UI に接続しない。

### Commit 2: runtime binder

追加:

- `src/editor/runtime-animation-binder.ts`
- `test/editor/runtime-animation-binder.test.ts`

テスト:

- 既存 handles を destroy する
- classic mode は `MmdAnimation` をそのまま渡す
- wasm mode は `MmdWasmAnimation` 相当を作る経路に入る
- bind 後に `seekAnimation(frame, true)` を呼ぶ

この commit でも登録ボタンには接続しない。

### Commit 3: 登録ボタンだけ新経路へ接続

変更:

- `UIController.registerBoneKeyframeAtCurrentFrame()`
- `UIController.addKeyframeAtCurrentFrame()` の bone path
- `MmdManager` に `registerEditorBoneKeyframe()` のような薄い入口を追加

残すもの:

- 既存 timeline graph 表示
- 既存 copy / paste
- 既存 delete

この時点で確認する手順:

```text
1. PMX を読む
2. 右肩を選ぶ
3. 0f にキー A 登録
4. 20f にキー B 登録
5. 0f -> 20f をシーク
6. viewport / bottom panel / XYZ graph が一致する
7. 先頭から再生してキー B へ補間される
8. 物理 ON / OFF で差分を見る
```

### Commit 4: delete / paste / move を移行

登録が安定してからやる。

- `keyframe.deleteSelected`
- `keyframe.paste`
- `keyframe.nudgeSelected`
- 反転ペースト

`CommandExecutionContext` から `addTimelineKeyframe()` / `applyTimelineKeyframePayload()` の二段構えを減らし、`applyEditorMotionCommand()` のような入口に寄せる。

## 旧実装から捨てるもの

次は廃止候補にする。

- `UIController.persistInterpolationForNewKeyframe()`
- `UIController.persistBoneKeyframeInterpolation()`
- `UIController.persistMovableBoneKeyframeInterpolation()`
- `UIController.applyRegisteredKeyframePoseToViewport()` の登録直後強制反映
- `timeline-edit-service.ts` 内の「空 MmdAnimation を作って後から typed array を差し替える」登録用途

ただし、copy / paste / offset / merge がまだ使っている helper は、移行が終わるまで残す。

## 互換と保存

短期:

- 既存 project 保存形式はまだ変えない
- 保存時は `EditorMotionDocument -> MmdAnimation -> 現行 serializer` として吐けるようにする
- 読み込み時は現行 project / VMD 由来 `MmdAnimation -> EditorMotionDocument` に変換する

中期:

- project vNext で `EditorMotionDocument` 相当を直接保存する
- 旧形式読み込み migration を残す

## 成功条件

最低限:

- 手打ちキー A/B が viewport 再生で補間される
- シークバー移動で viewport が同じ pose になる
- bottom panel 数値と runtime pose が一致する
- XYZ graph と runtime pose の不一致が debug できる
- unit test で builder / command / runtime binder が独立して検証できる

やらないこと:

- 最初の再設計では VMD 書き出しまでやらない
- 最初の再設計では物理焼き込みまでやらない
- 最初の再設計では複数モデル参照モーションまで広げない

## 次に実装するなら

最初に `motion-document.ts` と `mmd-animation-builder.ts` を作る。

ここは DOM / Babylon runtime に依存しない pure helper として作れるため、TDD 的に小さく始めやすい。

最初のテスト名:

```text
buildMmdAnimationFromEditorMotion
  creates boneTracks for ordinary PMX bones
  creates movableBoneTracks for movable PMX bones
  sorts keyframes by frame
  overwrites duplicate frame with the latest key
  defaults physicsToggle to 1
  sets MmdAnimation.endFrame from the last key
```

## 古いコードの移行 / 破棄計画

古いキー登録系は一気に削除しない。まず新経路を横に作り、対象操作を順番に移してから、使われなくなった helper を削除する。

### 基本方針

- 登録、コピー、ペースト、削除、移動を同時に切り替えない
- UI 表示と runtime 反映を同時に大きく変えない
- project save / load の旧形式互換は最後まで残す
- `timeline-edit-service.ts` はすぐ削除せず、使われている機能を確認しながら縮小する
- 古い経路を残す間は、新経路と旧経路が同じ操作に二重適用されないようにする

### Step 1: 新経路を横に追加

追加するもの:

- `motion-document.ts`
- `mmd-animation-builder.ts`
- `runtime-animation-binder.ts`
- builder / binder の unit test

この段階では UI には接続しない。

残すもの:

- `timeline-edit-service.ts`
- `UIController.persistInterpolationForNewKeyframe()`
- `UIController.persistBoneKeyframeInterpolation()`
- `UIController.persistMovableBoneKeyframeInterpolation()`
- `MmdManager.applyTimelineKeyframePayload()`

目的は、新しい builder が VMD loader 由来に近い `MmdAnimation` を fresh build できることを先に確認すること。

### Step 2: ボーン登録ボタンだけ新経路へ移す

対象:

- `UIController.registerBoneKeyframeAtCurrentFrame()`
- `UIController.addKeyframeAtCurrentFrame()` の bone track path

この段階で、ボーン登録については次の旧経路を通らないようにする。

```text
addTimelineKeyframe()
  -> persistInterpolationForNewKeyframe()
  -> persistBoneKeyframeInterpolation()
  -> refreshRuntimeAnimationForTrack()
  -> applyRegisteredKeyframePoseToViewport()
```

新経路:

```text
capture pose
  -> create register command with full payload
  -> EditorMotionDocument に upsert
  -> MmdAnimationBuilder で fresh MmdAnimation
  -> RuntimeAnimationBinder で bind + seek
```

残すもの:

- morph 登録
- camera 登録
- copy / paste
- delete
- nudge
- 反転ペースト

確認:

- 同一ボーンにキー A / キー B を登録できる
- シークで viewport が A/B 間を補間する
- 再生で後続キーへ動く
- bottom panel と viewport が一致する
- 既存 VMD 読み込み再生が壊れていない

### Step 3: morph / camera 登録を新経路へ移す

ボーン登録が安定した後で、morph と camera を移す。

移行対象:

- `registerMorphKeyframesAtCurrentFrame()`
- camera track の `addKeyframeAtCurrentFrame()`
- camera 用 `persistCameraKeyframeInterpolation()`

この段階で、登録操作はすべて `EditorMotionDocument` ベースに寄せる。

注意:

- camera は viewport camera と MMD camera track の座標意味が違うため、先に変換 helper を pure test する
- morph は interpolation を持たないため、先に移しやすい候補

### Step 4: copy / paste / delete / move を新経路へ移す

対象:

- `copySelectedKeyframe()`
- `pasteKeyframeClipboard()`
- `deleteSelectedKeyframe()`
- `nudgeSelectedKeyframe()`
- 反転ペースト

Command diff は frame list ではなく payload を持つ。

```ts
type KeyframeRegisterDiff = {
  type: "keyframe.register";
  track: CommandTrackRef;
  frame: number;
  before: EditorKeyframePayload | null;
  after: EditorKeyframePayload;
};

type KeyframeRemoveDiff = {
  type: "keyframe.remove";
  track: CommandTrackRef;
  frame: number;
  before: EditorKeyframePayload;
};

type KeyframeMoveDiff = {
  type: "keyframe.movePayload";
  track: CommandTrackRef;
  fromFrame: number;
  toFrame: number;
  before: EditorKeyframePayload;
  overwritten: EditorKeyframePayload | null;
};
```

この段階で、`CommandExecutionContext` の `addTimelineKeyframe()` / `removeTimelineKeyframe()` / `applyTimelineKeyframePayload()` は新経路の facade へ置き換える。

### Step 5: 古い登録用 helper を削除

削除候補:

- `UIController.persistInterpolationForNewKeyframe()`
- `UIController.persistBoneKeyframeInterpolation()`
- `UIController.persistMovableBoneKeyframeInterpolation()`
- `UIController.persistMorphKeyframeValue()`
- `UIController.persistCameraKeyframeInterpolation()`
- `UIController.applyRegisteredKeyframePoseToViewport()`
- `timeline-edit-service.ts` の `ensureModelAnimationForEditing()` の登録用途
- `timeline-edit-service.ts` の `applyTimelineKeyframePayload()` の登録用途
- `refreshAnimationFrameRange()` のような mutation 後始末

残す可能性があるもの:

- track frame map 生成
- timeline 表示用 helper
- offset / merge helper
- project migration 用 helper

削除前確認:

```powershell
rg "persistInterpolationForNewKeyframe|persistBoneKeyframeInterpolation|persistMovableBoneKeyframeInterpolation|applyRegisteredKeyframePoseToViewport|refreshAnimationFrameRange" src test
```

参照が残っていなければ削除する。

### Step 6: project save / load 互換を整理

短期:

- 既存 project JSON は読み込めるようにする
- 読み込み時に旧 `MmdAnimation` 相当の保存値から `EditorMotionDocument` へ変換する
- 保存時は当面、現行 serializer と互換の `ProjectSerialized*Track` に吐けるようにする

中期:

- project schema に `editorMotionDocumentVersion` を追加する
- 新形式を保存の主経路にする
- 旧形式は migration として残す

削除しないもの:

- 旧 project 読み込み migration
- VMD 読み込み結果を `EditorMotionDocument` へ変換する importer
- project export の互換 serializer

### Step 7: timeline-edit-service.ts の縮小

`timeline-edit-service.ts` は現状かなり大きいので、登録系を移した後に役割ごとに分ける。

残す候補:

- timeline 表示 track 生成
- frame map 操作
- offset / merge
- VMD / project import support

移す候補:

- key registration
- key payload mutation
- runtime refresh
- interpolation persistence

最終的には、`timeline-edit-service.ts` を「timeline 表示 / frame map helper」に寄せ、編集 command は `motion-document.ts` 側へ寄せる。

### 移行中の feature flag

必要なら一時的に feature flag を置く。

```ts
const USE_EDITOR_MOTION_DOCUMENT_FOR_KEY_REGISTRATION = true;
```

ただし長く残さない。ボーン登録の実機確認が取れたら、旧ボーン登録経路は削除候補にする。

### 移行中の確認チェックリスト

各 step で最低限これを見る。

- `npm.cmd run test:unit`
- `npm.cmd run lint`
- 必要なら `npm.cmd run smoke:launch`
- 同一ボーンの A/B キーが viewport で再生される
- シークバー移動で viewport と bottom panel が一致する
- copy / paste / undo / redo が移行対象操作で壊れていない
- 既存 VMD 読み込み再生が壊れていない
- 既存 project 読み込みが壊れていない
