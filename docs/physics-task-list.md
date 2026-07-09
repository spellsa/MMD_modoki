# 物理演算タスクリスト（MMD 寄せ）

更新日: 2026-06-29

## 方針

- `docs/babylon-mmd-physics-research.md` の調査結果を前提に、MMD 寄せの最小実装から段階的に拡張する。
- まずは「動くこと」より「更新順と安定性」を優先する。

## フェーズ 1: 基盤（必須）

- [x] 固定ステップ更新ループを導入する
- [x] 物理の ON/OFF 切替 API を用意する
- [x] 物理パラメータ設定（重力、step、反復回数）を 1 箇所に集約する
- [ ] PMX/PMD の剛体・ジョイント情報を読み出すデータ構造を定義する
- [x] 例外時に落ちないよう、物理初期化失敗時のフォールバックを実装する（MPR -> SPR -> Off）

## フェーズ 2: 剛体（必須）

- [ ] 剛体モード `0`（Bone Follow）を実装する
- [ ] 剛体モード `1`（Physics）を実装する
- [ ] 剛体モード `2`（Physics + Bone Alignment）を実装する
- [ ] モードごとの Bone <-> RigidBody 更新順を明文化して実装する
- [ ] デバッグ表示（剛体形状・姿勢）を切替可能にする

## フェーズ 3: 拘束（必須）

- [x] 6DoF 拘束を実装する
- [x] PMX の移動/回転制限値を拘束へ反映する
- [x] PMX のバネ値（移動/回転）を拘束へ反映する
- [ ] `disableOffsetForConstraintFrame` 相当の挙動を切替可能にする

## フェーズ 4: MMD 互換調整（重要）

- [ ] `disableBidirectionalTransformation` 相当の挙動を切替可能にする
- [x] 重力既定値を MMD スケール前提で調整する（候補: `-98`）
- [x] ソルバ反復回数・substep をモデル破綻しない範囲で調整する
- [ ] キネマ剛体と動的剛体の相互作用ルールを確定する

## フェーズ 5: 検証（必須）

- [ ] 検証用モデルセット（軽量/標準/重い）を用意する
- [ ] 裙・髪など連結チェーンで発散しないか確認する
- [ ] 長髪モデルで、再生中に髪物理がぬるっと伸びる症状を診断する
- [ ] 停止時ジッタ（微振動）を評価する
- [ ] 再生速度変更時（0.5x/1.0x/2.0x）で破綻しないか確認する
- [ ] フレームシーク後の安定復帰を確認する
- [ ] 主要パラメータの推奨初期値をドキュメント化する

## フェーズ 6: 運用・保守（推奨）

- [ ] 物理設定を UI から一時的に変更できるデバッグパネルを用意する
- [ ] 代表モデルの挙動を自動比較できる回帰テストを作る
- [ ] パフォーマンス計測（CPU 時間、step 回数）を記録できるようにする
- [x] 既知の制限事項を `docs/troubleshooting.md` に追記する

## 注記

- フェーズ 3 の実装項目は、`babylon-mmd` の `MmdBulletPhysics` / `MultiPhysicsRuntime` に委譲して達成している。

## 既知のモデル依存不具合

### 2026-06-29 GirlsFrontline ClukayDefault 髪物理の伸び

- モデル: `GirlsFrontline ClukayDefault`
- 症状: 停止中は髪が通常の長さに見えるが、物理演算ありで再生すると、髪がゆっくり伸びるように破綻する。
- スクリーンショット: `スクリーンショット 2026-06-29 122256.png`
- 重要度: v0.2 で物理あり再生を見せるなら高め。長髪・連結チェーンの代表的な破綻として扱う。
- 初期仮説:
  - 再生開始・シーク後の物理 reset / 初期姿勢同期が足りない。
  - physics step の delta time / substep / maxStepNum がモデルに対して大きい。
  - 剛体とボーンの双方向同期、または mode 2 の bone alignment が MMD とズレている。
  - joint constraint の線形/角度制限、ばね、constraint frame offset の解釈差。
  - モデルスケールと physics world scale のズレ。
- 次に見るログ:
  - 再生開始時とシーク時に physics reset / initialize が呼ばれているか。
  - backend (`MPR` / `SPR` / `Off`) ごとの差。
  - `physicsStepAvgMs`, `physicsStepMaxMs`, 実 substep 数。
  - `physicsDeltaRawMaxMs`, `physicsDeltaUsedMaxMs`, `physicsFixedTimeStepMs`, `physicsMaxSubSteps`。
  - 髪系ボーン / 剛体の初期位置と再生中の最大変位。
  - joint の linear limit / angular limit / spring 値が極端ではないか。

### 2026-07-09 物理診断ログの追加

- `mmd_modoki.debug.physics` を `1` または `true` にすると、物理状態適用時の診断ログを `physics` scope に出す。
- 記録する主な情報:
  - model name
  - backend / evaluation type
  - `rigidBodyStates` の ON/OFF 数
  - 剛体 mode `0/1/2` の数
  - 髪・布・胸まわりらしい剛体名のサンプル
  - 物理 model の内部生成有無
- 目的:
  - 長髪モデルの「再生中に髪が伸びる」症状について、まず MPR / SPR / Off の差と、再生開始・seek 後の状態適用をログで比較できるようにする。
  - 剛体 / joint の実装を直接変更する前に、モデル依存の破綻がどの timing で発生するかを切り分ける。

### 2026-07-09 Bullet バージョン注意

- 現行は `babylon-mmd@1.2.0` 同梱の Bullet 系 wasm を使う。
- 主経路は `MmdBulletPhysics` + `MultiPhysicsRuntime` の `Bullet MPR` / `Bullet SPR`。
- MPR が使えない場合は SPR に fallback し、SPR も失敗した場合は物理 Off にする。
- babylon-mmd の Bullet wasm binding 側は、過去調査どおり docs 上に `3.25` / `3.26` の記載揺れがあり、package から明示 version 文字列は未確認。
- MMD 本家互換の基準である Bullet `2.75` とは異なるため、constraint solver 差と `disableOffsetForConstraintFrame` の影響を検証観点に残す。

### 2026-07-09 物理設定値の現状

- simulation rate は `60Hz` 固定。MMD 本体寄せを優先し、通常 UI から `30 / 120Hz` 選択は出さない。
- Bullet MPR / SPR、WASM runtime 実験経路とも `fixedTimeStep = 1 / 60`、`maxSubSteps = 2` に揃える。
- `MultiPhysicsRuntime.useDeltaForWorldStep` は既定 `true` のまま。
- solver iteration 数は MMD_modoki から明示設定していない。現行 Bullet MPR / SPR binding には、確認範囲では `getSolverInfo` / `setNumIterations` 相当の public export がない。
- MMD joint constraint へ ERP / stop ERP / CFM / stop CFM `0.25` を 6 軸に明示適用する。
- babylon-mmd 側の MMD joint 生成では constraint stop ERP `0.475` が入るが、MMD_modoki 側で後段上書きする。
- 次に必要な確認:
  - 実 substep 数をログに出せるか。
  - Bullet の solver iteration 設定に upstream API 追加または wasm binding patch が必要か。
  - ERP / CFM `0.25` 適用後の長髪・スカート・袖モデルの挙動差。
  - frame skip 時に 60Hz substep catch-up が効いているか。

### 2026-07-09 frame skip 対策

- 重いモデルで frame skip が出たとき、babylon-mmd 物理 runtime に大きな delta が渡ると、physics が長い時間を一度に追いつこうとして貫通を誘発する可能性がある。
- MMD_modoki では `fixedTimeStep = 1 / 60` を維持しつつ、`maxSubSteps = 2` で 1 frame あたりの catch-up を最大 2 step までに制限する。
  - Classic Bullet MPR / SPR: `MultiPhysicsRuntime.afterAnimations()` の入口で delta を記録し、そのまま runtime へ渡す。
  - WASM runtime 実験経路: `MmdWasmRuntime` の physics clock を wrap して delta を記録し、そのまま返す。
- performance log に `physicsFixedTimeStepMs`, `physicsMaxSubSteps`, `physicsDeltaRawMaxMs`, `physicsDeltaUsedMaxMs` を追加した。
- 破綻モデルでは、貫通が出た時間帯の `physicsDeltaRawMaxMs` と `physicsStepMaxMs` を見る。
- 重いモデルで 14fps まで落ちるケースでは、`maxSubSteps = 60` が 1 frame あたり 4〜5 physics step の catch-up を起こし、さらに FPS を落とす death spiral になり得る。`Buffered + maxSubSteps = 2` で 60fps 上限に張り付くか、必要なら `1` と比較する。

### 2026-07-09 Buffered 再試行

- Classic runtime + Bullet MPR + 再生中だけ `PhysicsRuntimeEvaluationType.Buffered` を使う実験を入れた。
- pause / stop / seek では `Immediate` に戻す。
- Bullet SPR と WASM runtime 実験経路では、現時点では `Immediate` のまま。
- performance log の `evaluationType` が `Buffered`、`physicsMaxSubSteps` が `2` になっている区間で、FPS と `physicsStepAvgMs` を確認する。
- 以前の検証では `Buffered` で剛体がボーンへ追従せず崩れたため、長髪 / スカート / 袖の追従崩れも同時に見る。
- 実機確認:
  - `Buffered + maxSubSteps = 1`: 通常 60fps 付近まで改善。
  - `Buffered + maxSubSteps = 2`: 通常 55fps 前後、影なし 60fps。MMD 本体にかなり近い速度まで改善。
- 現時点では `Buffered + maxSubSteps = 2` を標準候補にし、品質確認を続ける。

### 2026-07-09 Classic / WASM runtime 比較の注意

- Classic runtime でも物理本体は Bullet WASM。`Classic` は「物理が WASM ではない」という意味ではなく、MMD runtime 本体に `MmdRuntime` を使うという意味。
- Classic runtime は `MmdRuntime` を使う標準経路で、物理は `MmdBulletPhysics` + `MultiPhysicsRuntime` 経由で Bullet WASM へ接続する。
- Classic runtime の `Bullet MPR` / `Bullet SPR` は、物理用 Bullet wasm instance の種類を指す。
- `MmdWasmPhysics` は `MmdWasmRuntime` 用の physics adapter。WASM 物理を使うためのものではあるが、Classic runtime の `MmdRuntime` に差し替えて使うものではない。
- WASM runtime は `MmdWasmRuntime` + `MmdWasmPhysics` を使う実験経路で、物理 backend だけでなく runtime 全体の差し替えとして扱う。
- 重いモデルで `MMD は 50fps 超、MMD_modoki は 14fps` のような比較をする場合、まず Classic runtime + Bullet MPR / SPR を基準にする。
- UI badge や smoke log が `WASM MPR` の場合は、WASM runtime PoC の結果として分けて記録する。
- Classic 基準で測る場合は UI の `Runtime: Classic` に戻す。コンソールで戻す場合は `localStorage.setItem("mmd_modoki.runtimeMode", "classic")` 後に reload する。

## 直近の着手順（最初の 1 週間）

1. 固定ステップ更新 + パラメータ集約
2. 剛体モード `0/1/2` の最小実装
3. 6DoF 拘束 + 制限値反映
4. `disableBidirectionalTransformation` / `disableOffsetForConstraintFrame` 相当の切替
5. 検証モデルで安定性確認と初期値確定
