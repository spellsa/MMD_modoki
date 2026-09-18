# v0.2.0 リリース前レビュー: 編集状態機械・再生/シーク・物理fallback

- レビュー日: 2026-07-03
- 対象テーマ: 5状態編集状態機械 / 再生・一時停止・シーク / 物理fallback連鎖(MPR→SPR→Ammo→none) / 物理オンオフキー
- 深刻度タグ: [Blocker] = リリース前必須 / [Later] = v0.2.x 送り可
- 前提: 5状態(Idle / PlayingAudio / PlayingManual / HardSeeking / BoneGizmoDragging)は
  docs/edit-state-machine.md の定義。専用の状態機械クラスはなく、mmd-manager のフラグ群+
  ui-controller に分散実装されている。

---

## 1. src/physics/physics-runtime-controller.ts (510行, 全読)

### 概要

物理バックエンドのライフサイクル管理。`initializeClassic()` が
MPR(事前条件チェック+動的ロード)→ SPR → Ammo → none の fallback 連鎖を実装。
ON/OFF、simulation rate、重力、Bullet evaluationType(Immediate固定化)、step計測。

### 指摘

- **[Later] バックエンド初期化の途中失敗で前段の生成物が残りうる(観点2、発生条件狭い)**
  `initializeBulletPhysicsBackendWithWasmInstance`(L282-299)は
  「新 runtime 生成 → `runtime.register(scene)` → 旧リソース dispose → 差し替え」の順。
  `register` が throw した場合、生成済み MultiPhysicsRuntime はどこにも保持されず
  dispose されない(fallback は継続するのでリーク止まり)。
  Ammo 側(L309-339)も `this.physicsPlugin = plugin` 代入後の `scene.enablePhysics` throw で
  plugin が残るが、最終 catch で backend=none になり実害は限定的。
  生成→登録→差し替えを try で包み、失敗時に新規生成物を dispose するとより清潔。

- **[情報] `_physics` への private プロパティ書き込み(L294, L337, L479)**
  babylon-mmd の `MmdRuntime._physics` を直接差し替えている。バージョン更新で
  黙って壊れる類のもの(mediabunny の件と同型)。動作上の問題は現状なし。

### 問題なしと確認した点(観点2の中心)

- **fallback 連鎖は全段 catch 完備で、「例外のまま止まる」経路がない**:
  - MPR: 事前条件(`getMprUnavailableReason`)で不可なら試行せず SPR へ(L263-277)。
    試行して throw しても catch → warn → SPR へ(L268-272)。
  - SPR: throw は `initializeClassic` の catch へ伝播 → warn → Ammo へ(L98-110)。
  - Ammo: throw は内側 catch で吸収 → `available=false / enabled=false / backend="none"` +
    `onStateChanged(false,false)` + `onError` トースト + return false(L111-125)。
    **仕様書(physics-runtime-spec)のエラーハンドリング仕様と完全一致**。
  - Ammo の wasm fetch は `response.ok` チェック付き(L310-313)で、404 でも throw → 連鎖継続。
- `setEnabled` は `available=false` 時に enabled を強制 false にして通知(L160-166)—
  「物理不可なのに ON 表示」の不整合が起きない。
- `syncScenePhysicsSimulationState` は `scene.physicsEnabled = enabled && simulationActive`
  の1行に集約(L210-212)— ON/OFF と再生状態の合成判定が一箇所で行われる。
- Buffered 評価は撤退済み(調査メモどおり): `syncBulletEvaluationTypeForPlayback` /
  `ForSeek` はどちらも Immediate を強制(L214-220)。evaluationType 変更は try/catch 付きで
  失敗しても続行(L447-467)。
- 重力はゼロベクトルガード+正規化付き(L361-368)、加速度・方向とも clamp 済み。
- `dispose` / `disposeClassicResources` は runtime 登録解除・physics engine 無効化・
  参照 null 化まで一貫(L469-486)。wasm-mpr backend は classic dispose の影響を受けない。

---

## 2. src/physics/physics-model-controller.ts (281行, 全読)

### 概要

モデル単位の物理状態適用(`rigidBodyStates` 一括 fill + 有効化時の再初期化)、
一時停止中でもボーン編集を反映させる `afterPhysics` パッチ、after-physics ボーン段の正規化、
親優先評価順の位相ソート。

### 指摘

- **[Later / 要手動確認] `applyPhysicsStateToModel` の一括 fill と物理オンオフキーの競合(観点4)**
  `rigidBodyStates.fill(1 or 0)`(L38)は**全剛体を一律に上書き**する。
  物理オンオフキー(bone track の physicsToggles)が babylon-mmd の
  アニメーション評価で毎フレーム rigidBodyStates に再適用される実装であれば、
  fill(1) は次の評価で正しいキー状態に戻るため問題ない。
  しかし「一時停止中」(評価が走らない)に再生→停止→物理トグル等で fill(1) が走ると、
  **物理OFFキー中のボーンが一時的に物理ONになる**瞬間がありうる
  (babylon-mmd 側の適用タイミングに依存し、本レビューでは確定できない)。
  手動確認推奨: 物理OFFキー区間で一時停止 → 物理トグルOFF→ON → 剛体が暴れないか。

- **[情報] babylon-mmd の private API 依存が多い**
  `afterPhysics` の差し替え(L64-71)、`_physicsModel` / `_update` / `_sortedRuntimeBones` /
  `skeleton._markAsDirty` への直接アクセス。docs の「v0.1 系向け安定化コードを含む」に相当し、
  babylon-mmd 更新時の破損リスク箇所として把握しておく(全て optional chain /
  型ガード付きで、欠けても throw はしない)。

### 問題なしと確認した点

- `afterPhysics` パッチは WeakSet で二重適用を防止(L49-51)、wasm runtime では
  適用しない(L45-47)。パッチ内は全て optional chain で、physicsModel 不在でも throw しない。
- `normalizeRuntimeBoneTransformStages` は visited セット付きで**循環親子でも無限再帰しない**
  (L94-105)。変更は transformAfterPhysics フラグの true 伝播のみで破壊的でない。
- `normalizeRuntimeBoneEvaluationOrder` の位相ソートは、**循環検出時
  (reorderedGroup 長不一致)に元順序を維持して返す**(L230-232)— 壊れたボーン階層でも
  ハング・データ破壊なし。安定ソート(元 index 順)で決定的。
- `applyPhysicsStateToModel` は剛体0件で早期 return(L35)、有効化時のみ
  `initializeMmdModelPhysics`(剛体をボーン位置へ再初期化)を呼ぶ — シーク後の
  暴走抑制ポリシーと整合。

---

## 3. src/mmd-manager.ts (部分読) + src/editor/bone-gizmo-controller.ts (該当ブロックのみ)

読んだ範囲: play/pause/stop/seekTo/seekToBoundary(L6193-6275)、
`stabilizePhysicsAfterHardSeek`(L6457-6463)、`clearProjectForImport`(L6657-6716)、
`removeActiveModel` / `setActiveModelByIndex`(L2409-2468)、
`advanceManualPlaybackWithoutAudio`(L10733-10751)、
ギズモ物理サスペンド(bone-gizmo-controller.ts L43-57, L228-260 —
docs記載の「mmd-manager L1528」から移設されていたため対象追加。最小部分読)。
※ `isPhysicsSimulationActive` = `_isPlaying || externalPlaybackSimulationEnabled`、
`setPhysicsEnabled` → `applyPhysicsStateToAllModels` の連鎖は第2回レビューで確認済みの
範囲を再利用。

### 指摘

- **[Later] 再生中のモデル削除で「モデルなし再生中」状態に入る(観点1)**
  `removeActiveModel`(L2409)は **pause を呼ばない**。UI 側
  (model-info-panel-controller.deleteActiveModel L161-174)にも確認ダイアログのみで
  停止処理はない。再生中に最後のモデルを削除すると `_isPlaying=true` のまま
  `currentModel=null` になる — これは `play()` のガード(L6194、モデル必須)からは
  到達不能な、**状態遷移表(edit-state-machine.md)にない状態**。
  後続処理は全て null ガード付きでクラッシュはせず、pause/stop も効くため実害は
  「音声・カメラだけ再生が続く」「UI 表示の混乱」程度。削除時に
  `wasPlaying → pause` を入れるか、状態表に「モデルなし Playing」を明記するのが望ましい。
  なお全モデル削除時に `timelineTarget` が "model" のまま残る(L2434-2437 で
  current* のみ null 化)のも同根の整理漏れ(表示は空トラックで安全)。

- **[情報] seekToBoundary は同期実行で再入の隙がない(観点1)**
  pause → resetBoneGizmoInteraction → seekTo → stabilize → play が**全て同期**
  (L6261-6275)。シーク連打(ドラッグ、キーリピート)でも途中状態で別のシークが
  割り込む余地はない。ただし再生中のドラッグシークでは move イベントごとに
  pause→play が繰り返される(音声の再スタート連発)— データ不整合はないが
  UX 上の粗さとして記録(ui-controller 側の phase 処理次第。次セクションで確認)。

### 問題なしと確認した点

- **観点3(シーク安定化の全経路適用)は二重の防御で成立**:
  1. `seekTo` 自体が「非再生中 + 物理有効」なら `applyPhysicsStateToAllModels`
     (剛体をポーズへ再初期化)を実行(L6251-6253)。
  2. `seekToBoundary` は必ず pause してから seekTo し、さらに
     `stabilizePhysicsAfterHardSeek`(再初期化+seek 再評価、L6457-6463)を通す。
  つまり **seekToBoundary 経由でも直 seekTo 経由でも、停止状態のシークは必ず剛体
  再初期化が走る**。再生中の seekTo は fallthrough だが、それは連続再生中の
  フレーム進行(manual playback L10741)であり大ジャンプではない。
- play/pause/stop はいずれも `syncBulletEvaluationTypeForPlayback`(Immediate強制)+
  `syncScenePhysicsSimulationState` + visualizer/gizmo 同期を対で呼ぶ(L6193-6240)。
  音声なし再生は `PlayingManual`(runtime は pause のまま手動シーク進行)、
  音声あり再生は `playAnimation` — docs の状態遷移と一致。
- `advanceManualPlaybackWithoutAudio` はカーソルを `totalFrames` に clamp(L10737)し、
  フレーム変化時のみ seek — 末尾で暴走しない(末尾停止は ui 側 onFrameUpdate 判定)。
- `clearProjectForImport` は**最初に pause()**(L6658)してから全モデルを
  per-model try/catch で破棄(L6684-6688)、再生状態・カーソル・フレームを完全リセット
  (L6703-6709)— プロジェクト読み込み中の再生持ち越しはない(観点1)。
- **ギズモドラッグの物理サスペンドは自己修復型**: 復帰は毎フレームの
  `handleBoneGizmoBeforeRender`(L246-255)が「ドラッグしていない+保存値あり」で
  必ず実行するため、シークやフォーカス喪失でドラッグが中断されても
  **物理OFFのまま取り残されない**。復帰は `setPhysicsEnabled(true)` 経由で
  剛体再初期化も走る。保存は null ガードで一度だけ(L232-238)— ドラッグ中の再入も安全。
- `stabilizePhysicsAfterHardSeek` は物理無効時に no-op(L6458)— ギズモサスペンド中の
  シークでは復帰時の `setPhysicsEnabled(true)` 側が再初期化を担うため、隙間がない。

---

## 4. src/ui-controller.ts (部分読)

読んだ範囲: viewport seek bar コールバック配線(L628-684)、playback/seek action 登録
(L2028-2068)、timeline.seekFrame 登録(L2256-2259)、Home/End ショートカット(L1960-1966、
第2回レビューで確認済み範囲)、onFrameUpdate の末尾停止判定(L1480-1499)、
play/pause/stop/stopAtPlaybackEnd(L9439-9493)、physicsKeyframeInputMode
(L2065-2068、L6405-6418・L8128・L8305 は第2回レビュー確認済み範囲を再利用)。

### 指摘

- **[Later] `timeline.seekFrame` が drag phase を無視して毎回フルシークする(観点3の過剰適用)**
  ViewportSeekBarController は `phase`("jump"/"dragStart"/"dragMove"/"dragEnd")を
  渡してくる(L645-650)が、登録側(L2256-2259)は phase を捨てて常に
  `seekToBoundary` を呼ぶ。結果:
  - 再生中のシークバードラッグでは move イベントごとに pause→play が繰り返され、
    **音声が連続で再スタート**する。
  - 停止中ドラッグでも move ごとに剛体再初期化(stabilize)が走る(重いモデルでは
    ドラッグがカクつく+髪・スカートが硬直して見える)。
  安定化ポリシーの「抜け」はない(むしろ全適用)が、dragMove は `seekTo` に留めて
  dragEnd/jump だけ `seekToBoundary` にするのが phase 設計の本来の意図のはず。
  データ不整合はないため Later。

- **[Later / 要手動確認] 末尾到達時の Idle 遷移が「フレーム停止トグル有効時」しか実装されていない(観点1)**
  onFrameUpdate の末尾停止(L1495-1498)は
  `isPlaying && isPlaybackFrameStopEnabled() && frame >= endFrame` が条件。
  **フレーム停止トグルが無効(既定)だと、末尾到達後も `_isPlaying=true` のまま**:
  - 音声なし再生: 手動カーソルが totalFrames に clamp され、最終フレームで
    「再生中」表示が続く。
  - 音声あり再生: 音声終了後の挙動は audio player / runtime 側に依存(未読範囲)。
  edit-state-machine.md の「Playing* -> Idle: 末尾到達時 stopAtPlaybackEnd」と実装が
  一致していない。実機で「トグル無効のまま最後まで再生 → UI が Paused に戻るか」を
  手動確認し、戻らないなら末尾判定を無条件化する(1条件の修正)。

### 問題なしと確認した点

- **シーク経路は完全に一元化されている(観点3)**: seekbar(commit/step/boundary/隣接キー)、
  タイムラインクリック/ドラッグ、Home/End ショートカット、フレーム番号 commit、
  batch nudge 後の seek、export 範囲移動 — 全てが ActionDispatcher →
  `mmdManager.seekToBoundary` に収束する(L2039-2053, L2256-2258)。
  唯一の直 `seekTo` は `play()` のフレーム開始位置ジャンプ(L9457-9458)だが、
  直前に `pause()` しているため mmd-manager 側の「停止中シーク=剛体再初期化」が発動し、
  直後の `play()` でも再初期化されるため安定化の抜けはない。
- `playback.toggle` は `isPlaying` の単純分岐(L2032-2038)で、再入しても
  pause/play が冪等に収束する(mmd-manager 側フラグが同期更新のため)。
- 停止(stop)は「フレーム停止トグル無効時は範囲先頭へ seekToBoundary」(L9477-9479)、
  末尾停止は pause + seekToBoundary(endFrame)(L9486-9493)— どちらも安定化経路に乗る。
- 物理キー入力モード(`physicsKeyframeInputMode`)は登録時にのみ読まれるフラグで、
  再生状態と直接干渉しない。物理キー登録ボタンは**再生中は hidden + disabled**
  (L6405-6413、第2回確認)で、観点4の「再生中の物理キー登録」導線は UI 段階で
  塞がれている。

---

## 総括(v0.2.0 リリース判断向け)

### [Blocker] 一覧

**なし。** 今回のテーマの中核(物理 fallback 連鎖・シーク安定化・状態遷移の基本形)は
堅牢に実装されている:
- **観点2**: MPR→SPR→Ammo→none は全段 catch 完備で、例外のまま止まる経路がない。
  最終段は available/enabled/backend/none + 通知 + トーストまで仕様書どおり。
- **観点3**: 全シーク UI 経路が `seekToBoundary`(pause→seek→剛体再初期化→resume)に
  一元化され、直 `seekTo` にも「停止中+物理有効なら再初期化」の防御がある。二重防御。
- **観点1**: seekToBoundary は同期実行で再入の隙がなく、ギズモ物理サスペンドは
  毎フレーム自己修復型で取り残しがない。プロジェクトクリアは pause が先行する。

### [Later] 一覧(優先順)

1. **末尾到達時の Idle 遷移がフレーム停止トグル有効時のみ**(セクション4、要手動確認)
   — 状態遷移表との不一致。修正は条件1つ。
2. **再生中のモデル削除で「モデルなし Playing」状態に入る**(セクション3)
   — クラッシュはしないが状態遷移表外。削除時に pause を入れる。
3. **timeline.seekFrame の drag phase 無視**(セクション4)— 再生中ドラッグの音声再スタート
   連発と、停止中ドラッグの剛体再初期化スパム。phase 対応で解消。
4. **物理オンオフキーと rigidBodyStates 一括 fill の競合**(セクション2、要手動確認)
   — 一時停止中の fill(1) が物理OFFキー状態を一瞬上書きする可能性。
5. バックエンド初期化の途中失敗での前段生成物リーク(セクション1、発生条件狭い)
6. babylon-mmd private API 依存の棚卸し(`_physics` / `afterPhysics` patch /
  `_sortedRuntimeBones` 等)— 次回 babylon-mmd 更新時の重点確認箇所(セクション1・2)

### 手動確認の推奨シナリオ

1. フレーム停止トグル無効のまま音声あり/なしで最後まで再生し、UI が Paused に戻るか確認
   (Later 1)。
2. 再生中にアクティブモデルを削除(最後の1体/複数体中の1体の両方)し、
   その後の play/pause/シークが正常か確認(Later 2)。
3. 物理OFFキー区間で一時停止 → 物理トグル OFF→ON → 再開で剛体が暴れないか(Later 4)。
4. MPR 不可環境(crossOriginIsolated=false)と wasm 読み込み失敗環境(ファイル欠損を模擬)で
   SPR / Ammo / Off への fallback とバッジ表示を確認(観点2の実機裏取り)。
5. 重量級モデルでシークバーをドラッグし、カクつき・音声再スタート・髪の硬直を確認(Later 3)。
