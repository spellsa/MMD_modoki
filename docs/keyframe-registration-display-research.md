# キーフレーム登録と表示の調査メモ

更新日: 2026-03-23

## この文書の役割
この文書は、キーフレーム登録・表示まわりで実際に発生した不具合と、その切り分け過程を時系列で残すためのメモである。

設計の確定事項は以下を参照する。

- `docs/mmd-keyframe-architecture-note.md`
- `docs/keyframe-storage-spec.md`
- `docs/interpolation-curve-spec-implementation.md`

## 対象ファイル
- `src/ui-controller.ts`
- `src/mmd-manager.ts`
- `src/editor/timeline-edit-service.ts`
- `src/timeline.ts`
- `src/shared/timeline-helpers.ts`
- `src/editor/bone-gizmo-controller.ts`
- `src/bottom-panel.ts`

## 結論
今回の不具合は単一原因ではなかった。

主な原因は次の通り。

1. stale な pending snapshot
2. frame 進行と total frame の縮小問題
3. 保存値と runtime 表示値の基準ずれ
4. seek と runtime handle refresh の混同
5. camera の保存形式と viewport 表示形式の意味ずれ
6. camera の回転符号系不一致
7. camera の FOV 単位ミス
8. 停止中にも viewport へ毎フレーム再適用していたこと

## 不具合を切り分けるときの基本観点
登録不具合は次の4層に分けて見る。

1. 保存値
2. sampled source
3. runtime 読取値
4. viewport 見た目

この4つを混ぜると誤診しやすい。

## ボーン側の調査履歴

### 症状
- 1個目のキーは入る
- 2個目以降が最初のポーズになる
- UI 下部パネルと見た目が一致しない
- 登録直後に pose が飛ぶ
- frame move 後に 3D 表示だけ古い pose に戻る

### 実際に効いた対処

#### 1. stale pending snapshot の修正
対象:
- `src/ui-controller.ts`

内容:
- panel 編集時は panel 値を使う
- ギズモ編集時は `mmdManager.getBoneTransform()` を使う

#### 2. total frame 縮小防止
対象:
- `src/editor/timeline-edit-service.ts`

内容:
- no-audio 編集中も `300` frame を最低値として維持

#### 3. 読取基準を `runtime-world` に変更
対象:
- `src/mmd-manager.ts`

内容:
- `linkedBone` の生値ではなく、runtime の world 行列から local 変換を復元

#### 4. 停止中 register 直後の preview refresh 抑止
対象:
- `src/ui-controller.ts`

内容:
- 停止中の bone register 直後に不要な runtime refresh を走らせない

#### 5. frame move 時の sampled pose 再適用
対象:
- `src/ui-controller.ts`
- `src/mmd-manager.ts`

内容:
- sampled source を停止中の runtime へ silent 適用

#### 6. 最終描画行列の更新
対象:
- `src/mmd-manager.ts`

内容:
- 必要箇所で `beforePhysics(null)` / `afterPhysics()` を通す

#### 7. seek 時の handle 再生成停止
対象:
- `src/mmd-manager.ts`

内容:
- 単純 frame move ごとに runtime handle を張り直さない

### ボーン側の成功条件
- register 直後に pose が飛ばない
- 2個目以降の key も保存される
- frame move 後に保存済み pose が見える
- main timeline と下パネルと viewport が一致する

## カメラ側の調査履歴

### 症状
- Camera 選択時に下パネル値が view と揃わない
- 2個目以降の camera key が frame move で反映されない
- register 直後に white out / close-up
- register 直後に左右反転
- frame move 時に左右反転
- frame move 後に viewport 操作が効かない
- play 時だけ close-up

### カメラで誤診しやすかった点
- `track.positions` は viewport camera position ではない
- `track.distances` は正値 distance ではない
- `track.fovs` は rad ではなく degree
- `MmdCamera` の回転系は Babylon の素直な感覚と一致しない

### 実際に効いた対処

#### 1. Camera 選択時の UI 同期
対象:
- `src/bottom-panel.ts`
- `src/ui-controller.ts`
- `src/mmd-manager.ts`

内容:
- `PosX/Y/Z`, `RotX/Y/Z`, `Dist`, `FoV` を current camera と同期

#### 2. 保存形式の意味合わせ
対象:
- `src/ui-controller.ts`
- `src/mmd-manager.ts`

内容:
- `track.positions` は target
- `track.distances` は負値 distance
- `track.rotations` は radians
- `track.fovs` は degree

#### 3. frame move 時の camera pose 適用
対象:
- `src/ui-controller.ts`

内容:
- sampled camera pose を停止中 frame change 時に1回だけ viewport へ適用

#### 4. 停止中 register 直後の preview refresh 抑止
対象:
- `src/ui-controller.ts`

内容:
- 停止中 camera register 直後の不要な runtime refresh を止める

#### 5. `MmdCamera` 規約への符号合わせ
対象:
- `src/mmd-manager.ts`
- `src/ui-controller.ts`

内容:
- `rotation -> target`
- `track pose -> viewport position`
- `viewport position -> editor rotation`

を `MmdCamera` 規約に揃える

#### 6. 停止中の viewport ロック解除
対象:
- `src/ui-controller.ts`
- `src/mmd-manager.ts`

内容:
- 停止中は `mmdCamera -> viewport` を毎フレーム同期しない
- camera 再適用は `frameChanged === true` の時だけ

#### 7. play 開始時の current frame 再評価
対象:
- `src/mmd-manager.ts`

内容:
- handle 再生成直後に `seekAnimation(currentFrame, true)` を実行

#### 8. FOV 単位の統一
対象:
- `src/ui-controller.ts`

内容:
- `track.fovs` を degree で保存・読取

### カメラ側の成功条件
- register 直後に white out / close-up しない
- register 直後に左右反転しない
- frame move 後に左右反転しない
- frame move 後も viewport camera を触れる
- play 時に close-up しない
- 再生中は camera motion が viewport に反映される

## 2026-03-23 時点の確定仕様メモ

### ボーン
- 保存値は `runtime-world` 基準で読む方が安定
- 停止中 register 直後の無条件 preview refresh は避ける
- sampled source と viewport は必要に応じて明示同期する

### カメラ
- `track.positions = target`
- `track.rotations = radians`
- `track.distances = negative distance`
- `track.fovs = degree`

### 再生中 UI
- 下パネル欄ごとのダイヤは非表示
- 再生中だけ `mmdCamera -> viewport` の毎フレーム同期を許可

## 今後も残すべき記録ルール
このファイルには、修正のたびに以下を追記する。

- 症状
- 原因仮説
- 実際の原因
- 触ったファイル
- 効いた修正
- 効かなかった修正

## 次に同種不具合が出たときの確認順序

### 1. frame が本当に進んでいるか
- `FRAME x / y`
- total frame の縮小有無

### 2. key 自体が保存されているか
- track frame count
- 保存 frame

### 3. sampled source が正しいか
- 対象 frame の source 値

### 4. runtime 読取が正しいか
- bone なら `runtime-world`
- camera なら `target / rotation / distance / fov`

### 5. viewport 見た目だけズレていないか
- seek 後
- register 直後
- play 開始直後

ここまで分ければ、「保存失敗」と「表示失敗」を混同しにくい。
