# 物理演算タスクリスト（MMD 寄せ）

更新日: 2026-07-12

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

### 2026-07-11 v0.2.1 前の長髪破綻切り分けメモ

目的:

- `GirlsFrontline ClukayDefault` などで、髪が物理演算中に溶け落ちる / 伸びるように崩れる症状を、モデル固有の名前分岐なしで切り分ける。
- 効果がなかった暫定対応を残さず、同じ確認を繰り返さないようにする。

確認したこと:

- `mmd_modoki.debug.physics` のログでは、Klukai の髪剛体 chain は初期状態で大きく壊れていなかった。
  - 例: `HairA1` から `HairA14` が `頭` 由来の mode 0 剛体から mode 1 剛体 chain として接続されていた。
  - joint の position / rotation limit はすべて 0、spring も 0 の固定鎖に近い構成だった。
- 欠落 texture `sap/hair0.bmp` の warning / error は出るが、物理 chain の初期姿勢とは別問題として扱う。
- `MPR` / `Buffered` 以前から同モデルは崩れていたため、MPR 化や Buffered 化だけを主因として扱わない。
- `disableOffsetForConstraintFrame` を babylon-mmd 標準の `false` に戻す試行は、髪溶け改善なし。
  - 変更は戻し、現状は従来どおり `buildPhysics: { disableOffsetForConstraintFrame: true }` を維持する。
- `afterPhysics` の paused-state patch と after-physics bone stage 伝播補正は、髪溶け改善に効いた根拠がなく、別モデルの副作用も疑われたため撤去した。
- ただし runtime bone 評価順の親優先補正は、過去に対応したモデルの崩れ再発を防ぐため維持する。
  - 「評価順補正」と「after-physics stage 伝播」は別物として扱う。

ログから見えたこと:

- 2026-07-11 の実機ログで、モデル読み込み直後や DevTools / reload 後に大きな physics delta が入っていた。
  - 例: `rawDeltaMs: 642.25`, `maxSubSteps: 1`, `requiredSubSteps: 39` 相当。
  - 以前のログでは `rawDeltaMs` が数秒から十数秒になる区間もあった。
- `maxSubSteps = 1` の場合、1 frame あたり 16.667ms ぶんしか Bullet が処理しないため、大きな delta をそのまま渡すと長髪 joint chain が追いつけず伸びる可能性が高い。
- ただし delta だけで説明できるかは未確定。delta clamp 後も溶ける場合は constraint / sync 側へ進む。
- delta clamp 後の 2026-07-11 実機ログでは、髪剛体 snapshot 側で `minY` が `10.672` から `-23.255` まで落ち、`totalDistanceRatio` が `1.953` まで増えた。
  - これは表示だけ / bone sync だけではなく、Bullet 内の髪剛体 chain 自体が伸びて落ちている可能性が高い。
  - `disableOffsetForConstraintFrame: true` について、babylon-mmd の型定義には constraint が壊れる場合があり、その場合は `fixedTimeStep` を `1 / 120` 以下にする、とある。
  - そのため一時的に 120Hz / `maxSubSteps >= 2` を試したが、髪溶けは改善しなかった。
  - 2026-07-11 時点の方針どおり、物理 step は 60Hz 固定へ戻した。

現在残してよい対応:

- `PhysicsRuntimeController.normalizePhysicsDeltaMs()` で、Bullet / WASM physics へ渡す delta を `fixedTimeStep * maxSubSteps` 以下に clamp する。
- performance log では `rawDeltaMs` と `usedDeltaMs` を分けて記録し、clamp が効いたか確認する。
- `physics delta exceeded max substeps and was clamped` が出た場合は、`rawDeltaMs` は観測値、`usedDeltaMs` が実際に物理へ渡した値。
- `physics chain distance diagnostics` には最大 segment の前後剛体名 / index も出し、複数房またぎの集計ノイズと特定 joint 区間の伸びを分けて見る。
- PMX joint の A/B 接続から connected component を作る `jointGraphChains` 診断を追加する。
  - hair / cloth / soft-body らしい剛体を含む joint graph を chain 単位で集計する。
  - 一括 index 順集計ではなく、実 joint 接続ごとの `totalDistanceRatio`、`minY`、最大 segment、joint 名を出す。
- 2026-07-11 16:31 の実機ログでは、Klukai の `jointGraphChains` が `totalDistanceRatio: 1.814`、`minY: -19.948` まで伸び落ちた。
  - `maxSegment` は `HairB16(74) -> HairC1(75)` のように出たが、connected component を一本に並べる診断では分岐端と別房 root が隣接して見える可能性がある。
  - そのため実 joint A/B エッジごとの距離を出す `jointEdges` 診断を追加し、次回ログではこちらを優先して読む。
- 2026-07-11 16:40 の実機ログでは、`jointEdges` で `HairC1` (`頭(42)` -> `HairC1(75)`) が `distanceRatio: 9.155` まで伸びた。
  - PMX metadata 上は position / rotation limit と spring がすべて 0 で、固定に近い joint のはず。
  - 次の診断として、破綻している `jointEdges` 上位に対応する runtime constraint の `constraintExists`、`constraintPtr`、`hasWorldReference`、`bundleBodyIndexA/B`、body reference、joint / rigid body の frame 元データを出す `runtimeConstraints` を追加した。
- 2026-07-11 16:45 の実機ログでは、`HairC1` の constraint は存在し、world 参照もあり、PMX rigid body index と Bullet bundle index も一致していた。
  - これにより、constraint 未生成 / world 未登録 / body index 対応ズレは主因から外す。
  - 次の診断として、babylon-mmd と同じ `jointTransform * rigidBodyInverse` で再計算した `frameA` / `frameB`、`framePivotDistance`、`jointToBodyDistanceA/B` を `runtimeConstraints` に追加した。
  - 次回ログでは、`HairC1` の frame pivot が妥当か、frame A/B の軸が極端に歪んでいないかを見る。

戻した / 戻すべき対応:

- `disableOffsetForConstraintFrame: false` への変更は効果なし。戻す。
- 120Hz / `maxSubSteps >= 2` への変更は効果なし。戻す。
- `patchModelAfterPhysicsForPausedState()` は髪溶け対策としては戻さない。
- `normalizeRuntimeBoneTransformStages()` は髪溶け対策としては戻さない。
- stiffness 補正 UI / 補正値変更は、過去の布垂れ切り分けで主因ではなさそうだったため戻さない。

試したが戻した対応:

- 2026-07-11 に `mmd_modoki.physicsRootFixedJointStabilizer` の localStorage フラグを一時追加した。
  - FollowBone 剛体と dynamic 剛体をつなぐ 0 limit / 0 spring joint のうち、constraint frame の左右 pivot 距離が `1.0` 以上のものだけを対象に、dynamic 側の Bullet bundle body を effective kinematic にする試験だった。
  - モデル名、剛体名、joint 名では分岐しない方針で入れた。
  - 実機確認で髪は伸び続けたため、原因から外し、コードは撤去した。
  - 次に同じ案を再試行する場合は、単なる effective kinematic 化ではなく、root 子剛体の transform を bone / FollowBone 剛体へ毎 frame 明示同期する必要があるかを先に調べる。
- 2026-07-11 に `mmd_modoki.physicsDisableZeroAngularSprings` の localStorage フラグを一時追加した。
  - babylon-mmd の Bullet / Ammo 経路では、linear spring は stiffness 0 のとき無効化されるが、angular spring は stiffness 0 でも axis 3-5 が常に有効化される。
  - Klukai の髪 joint は rotation limit も springRotation もすべて 0 なので、0 stiffness angular spring が 0 limit 固定 joint を実質的に柔らかくしていないかを切り分ける試験だった。
  - 実機確認で、再生 / 停止に関係なく低速で髪が伸び続けたため、原因から外し、コードは撤去した。
- 2026-07-11 に `mmd_modoki.physics.pauseWhenPlaybackStopped` の localStorage フラグを一時追加した。
  - physics 有効中でも再生停止 / 一時停止中は scene physics を止める試験だった。
  - 停止中の伸びは止まったため、「停止中も physics world が進み、constraint drift が蓄積していた」ことは確認できた。
  - ただし再生中の根本対策ではないため、コードは撤去した。
- 2026-07-11 に `mmd_modoki.physics.pinRootDynamicChildren` の localStorage フラグを一時追加した。
  - 初回実装では、FollowBone 剛体と dynamic 剛体をつなぐ 0 limit / 0 spring joint の dynamic 側を、dynamic 側 linked bone + bodyOffsetMatrix から再計算した transform へ毎 frame 明示同期した。
  - 2026-07-11 17:57 の実機ログでは、`HairA1/B1/C1/D1/F1` が対象に入ったにもかかわらず、`HairC1` (`頭(42)` -> `HairC1(75)`) が `distanceRatio: 8.256` まで伸びた。
  - dynamic 側 linked bone は physics sync 後にすでに伸びた姿勢を持つ可能性があるため、この方式は効果なしとして撤去。
  - その後、FollowBone 側剛体の current transform と joint frame A/B から dynamic 子剛体 transform を逆算して pin する方式へ変更した。
  - 2026-07-11 18:05 の実機ログでは、`HairC1` が `distanceRatio: 9.172` まで伸びたが、`root dynamic child pin experiment applied` / `mode: follow-body-constraint-frame` のログが出ていなかった。
  - 切り分け用に、pin 実験の状態を `flag-disabled` / `no-bullet-bundle` / `no-targets` / `applied-zero` / `applied` で一度だけ出すログへ変更した。
  - 2026-07-11 18:08 の実機ログでは、`status: 'applied'`、`targetCount: 6`、`appliedCount: 6`、`missingFollowDataCount: 0` まで確認できたが、`HairC1` は `distanceRatio: 7.121` まで伸びた。
  - モデル名、剛体名、joint 名では分岐しない。
  - 実験は原因から外し、コードは撤去した。
- 2026-07-11 に `mmd_modoki.physics.useFrameOffsetForLargeFixedRootJoints` の localStorage フラグを一時追加した。
  - `disableOffsetForConstraintFrame: true` は維持したまま、0 limit / 0 spring で FollowBone 剛体と dynamic 剛体をつなぎ、かつ joint frame / body offset が `1.0` 以上ある fixed root joint だけ `constraint.useFrameOffset(true)` を当てる試験。
  - モデル名、剛体名、joint 名では分岐しない。
  - 目的は、Klukai の `HairC1` のように FollowBone 側 body から dynamic root body への frame offset が大きい joint で、Bullet 側 constraint frame offset を無効化していることが drift を増幅していないかを見ること。
  - 2026-07-11 18:22 のログでは `large fixed root joint frame offset experiment status` が出ておらず、localStorage 未設定により実験が当たっていなかった。
  - 調査中に既定 ON へ変更して再確認した。
  - 2026-07-11 18:28 の実機ログでは `status: 'applied'`、`targetCount: 6`、`appliedCount: 6`、`missingUseFrameOffsetCount: 0` を確認した。
  - 対象には `HairA1/B1/C1/D1/E1/F1` が入り、`HairC1` も `hasUseFrameOffset: true` だった。
  - それでも `HairC1` は `distanceRatio: 9.205` まで伸びたため、原因から外し、コードは撤去した。

次の試験的対応:

- `runtimeConstraints` に `anchorWorldA/B`、`anchorWorldDistance`、`bodyOriginDistance` を追加した。
  - 目的は、body 原点間距離だけでなく、Bullet constraint の local frame pivot を body world transform に載せた anchor 同士が実際に離れているかを見ること。
  - `anchorWorldDistance` が大きくなるなら Bullet constraint 自体が解けている / 効いていない方向。
  - `anchorWorldDistance` が小さいまま `bodyOriginDistance` だけ大きくなるなら、joint frame / body origin / 表示同期の解釈側を疑う。
  - 2026-07-11 18:44 の実機ログでは、通常の髪 chain は `anchorWorldDistance: 0.005` から `0.02` 程度に収まっていた。
  - 一方で `HairC1` (`頭(42)` -> `HairC1(75)`) は `anchorWorldDistance: 9.097`、`bodyOriginDistance: 8.666` まで開いていた。
  - これにより、表示同期や body 原点だけの見かけではなく、FollowBone 剛体と dynamic root をつなぐ Bullet constraint 自体が解けている可能性が高い。
  - 次の診断として、該当 body の mass / damping / friction / collision group / mask を runtime constraint ログへ追加した。
  - 2026-07-11 18:49 の実機ログでは、`HairC1` の `bodyBMass` が `14411519022333952`、下流の hair body も `7205759511166976`、`26843546`、`26214.400390625` のような極端な値で出た。
  - `bodyBMass` は PMX metadata から読んだ値なので、モデル実値なのか、metadata と Bullet 実体のどちらかで単位 / 型 / index がズレているのかは未確定。
  - 次の診断として、Bullet bundle の `getMass()` / `getLinearDamping()` / `getAngularDamping()` / `getLocalInertia()` から実体値を読み、metadata 値と並べて `runtimeConstraints` に出す。
  - Bullet 実体側も同じ巨大質量なら、0 limit fixed root joint が極端な質量差で解けている可能性が高く、汎用対策候補は「dynamic hair/cloth 系の異常質量を安全上限へ clamp する実験」になる。
  - 実体側が正常値なら、MMD_modoki の metadata 診断読み取りだけが間違っているので、質量は原因から外す。
  - 2026-07-11 18:56 の実機ログでは、`HairC1` の `runtimeBodyBMass` も `14411519022333952`、`runtimeBodyBLocalInertia` も `1441151982764032` で、巨大質量が Bullet 実体にそのまま渡っていることを確認した。
  - PMXエディタでも `HairC1` の質量が `1.441152E+16` と表示されたため、少なくともこのモデルではファイル内の値自体が巨大。
  - 汎用対策として、Bullet 実体質量が `1000` を超える dynamic body の mass / local inertia を `1000` 基準へ clamp する実験を追加した。
  - モデル名、剛体名、joint 名では分岐しない。
  - 無効化する場合は `localStorage.setItem("mmd_modoki.physics.disableAbnormalMassClamp", "1")` 後に reload する。
  - 2026-07-11 19:03 の実機確認では、無限に溶け落ちる挙動は止まったが、MMD 本体に近い挙動ではなく、少し溶けた状態が残った。
  - `1000` への単純 clamp は、`3276.8` / `1638.4` なども全部同じ重い値に潰すため、髪としてはまだ重すぎる可能性が高い。
  - 異常質量の Float32 bytes は `cd cc 4c 5a` のように、`0.8` の `cd cc 4c 3f` と仮数部が一致し、指数 byte だけが跳ねているパターンが多い。
  - 次の実験として、異常質量の Float32 上位 byte を `0x3f` / `0x40` / `0x3e` の候補へ戻し、`0 < mass <= 100` になる場合はその復元値を使う。復元できない場合だけ `1000` clamp に fallback する。
  - 2026-07-12 08:46 の実機ログでは、`HairA3` / `HairB3` が `runtimeBodyBMass: 819.2` のまま残り、横髪側の `distanceRatio` が `20.735` / `13.626` まで伸びた。
  - 初回の復元処理は `1000` 超だけを対象にしていたため、`819.2` / `409.6` / `204.8` / `102.4` のような「1000 未満だが指数 byte だけ壊れている値」を取り逃がしていた。
  - 対象条件を `mass > 100` かつ Float32 exponent 復元で `0 < mass <= 100` に入る場合へ広げた。復元できず `1000` 超の場合のみ `1000` clamp に fallback する。
  - 2026-07-12 08:55 の実機確認では、`0.8` / `1.6` への Float32 exponent 復元後も髪が伸びた。
  - PMXエディタ表示が `1.441153E+16` のような科学表記であり、ユーザー確認でも「丸めるなら `1.44` ではないか」という指摘があった。
  - そのため、Float32 exponent byte を直接戻す方式ではなく、`1.441153E+16 -> 1.441153`、`3276.8 -> 3.2768`、`819.2 -> 8.192` のように 10 進 mantissa へ正規化する方式へ変更した。
  - 2026-07-12 09:20 時点では、PMXE の `1.441153E+16` は `1.441153 * 10^16` であり、MMD_modoki ログの `14411519022333952` とほぼ同じ値だと整理した。
  - つまり、現時点の証拠では babylon-mmd の float / int 読み違いではなく、PMX 内に巨大質量が入っている可能性が高い。
  - MMD 本体では伸びが小さいため、MMD 互換の異常値 sanitize として、`mass > 100` の dynamic body を `1.0` へ寄せる `unit` モードを試した。
  - 2026-07-12 の実機確認では、`unit` モードは伸び幅が増えたため既定から外した。軽くすれば解決ではなく、ある程度の質量 / 慣性が chain を張る方向に効いている可能性がある。
  - 既定は 10 進 mantissa 復元へ戻す。比較用に `localStorage.setItem("mmd_modoki.physics.abnormalMassMode", "unit")` で `1.0` 固定へ戻せる。
  - `localStorage.setItem("mmd_modoki.physics.abnormalMassMode", "clamp")` で従来の `1000` clamp だけにも戻せる。
  - 2026-07-12 に「引っ張り / バネ復元力が足りない」方向へ調査を移した。
  - babylon-mmd の Bullet 経路では、linear spring は `springPosition != 0` の軸だけ有効化される。
  - 一方で angular spring は `springRotation` が 0 でも 3 軸すべて `enableSpring(true)` される。
  - Klukai の髪 joint は position / rotation limit と spring が 0 の固定 joint に近いため、メタデータ上の spring stiffness ではなく 6DoF limit / ERP による拘束で復元する構成と見る。
  - 次回ログで、伸びている joint の `zeroLinearLimitAxes`、`zeroAngularLimitAxes`、`linearSpringEnabledAxes`、`angularSpringEnabledAxes`、`springMode` を確認し、復元力が spring 由来か fixed limit 由来かを切り分ける。
  - PMXE では該当髪剛体の移動減衰 / 回転減衰が `1` で、Bullet では速度がほぼ打ち消され、FollowBone 側からの引っ張りに追従しない可能性がある。
  - 次の実験として、非 FollowBone 剛体の runtime linear / angular damping が `1.0` 相当の場合だけ `0.99` へ落とす補正を追加した。
  - モデル名、剛体名、joint 名では分岐しない。
  - 無効化する場合は `localStorage.setItem("mmd_modoki.physics.disableDampingCap", "1")` 後に reload する。
  - 2026-07-12 09:15 の実機確認では、無限に溶ける挙動は改善したが、体の動きに髪が追従せずその場に残るような違和感が残った。
  - babylon-mmd の `MmdBulletPhysicsModel.syncBodies()` では、FollowBone 剛体は `setTransformMatrix()` でボーン姿勢へ移動するが、速度は明示されていない。
  - dynamic 髪剛体を constraint で引く親側剛体が「瞬間移動しているが速度 0」に近い扱いだと、慣性 / 引っ張りが MMD 本体とずれる可能性がある。
  - 次の汎用実験として、FollowBone 剛体の前回 transform との差分から線形速度 / 角速度を合成し、`syncBodies()` 後に Bullet bundle へ渡す処理を追加した。
  - モデル名、剛体名、joint 名では分岐しない。
  - 無効化する場合は `localStorage.setItem("mmd_modoki.physics.disableFollowBoneVelocitySync", "1")` 後に reload する。

次に見る順番:

1. 停止中にも低速で伸び続けるため、タイムライン再生ではなく scene physics step / runtime `beforePhysics` / `afterPhysics` が継続しているかを確認する。
   - `physics chain distance diagnostics` に `playing`、`scenePhysicsEnabled`、`currentFrameTime`、`raw/used delta` 近傍を足し、停止中に joint distance が増えているかを見る。
   - 停止中に physics step が進んでいるなら、Auto physics の意図と「停止時は pose を保持する」挙動を分ける必要がある。
2. delta clamp 後のログで `rawDeltaMs` と `usedDeltaMs` が分かれているか確認する。
3. それでも髪が溶ける場合、MMD_modoki 側の後段 solver parameter 適用を疑う。
   - 2026-07-11 に `applyPhysicsStateToModel()` から `applyMmdConstraintSolverParameters()` 呼び出しを外して比較したが、Klukai の髪溶けは改善しなかった。
   - 布垂れ改善履歴があるため、後段適用は戻す。
   - 現状は `_constraints` へ ERP / StopERP `0.475`、CFM / StopCFM `0` を 6 軸へ後段適用している。
   - babylon-mmd 標準は MMD joint 生成時に StopERP `0.475` を設定するが、CFM 系は明示していない。
   - Klukai の髪溶け主因としては一旦外す。
4. それでも残る場合、剛体が実際に落ちているのか、`syncBones()` 後のボーンだけが落ちて見えているのかを診断する。
   - 2026-07-11 に `mmd_modoki.debug.physics=1` 時の `physics chain distance diagnostics` を追加した。
   - render 後に 2 秒間隔で、hair / cloth / soft-body らしい剛体群の距離合計、root-tip 距離、初回比率、Y 範囲、最大 segment 距離、最大 segment の前後剛体名を出す。
   - 同じログに `jointGraphChains` を出し、joint A/B 接続ベースで壊れている鎖を絞る。
   - 髪 chain の root から先端までの剛体 transform 距離。
   - 同じ frame の runtime bone world matrix 距離。
   - `beforePhysics` / physics step / `afterPhysics` のどこで差が増えるか。

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
- MMD joint constraint へ ERP / stop ERP `0.475`、CFM / stop CFM `0` を 6 軸に明示適用する。
- babylon-mmd 側の MMD joint 生成では constraint stop ERP `0.475` が入る。MMD_modoki 側も ERP は標準寄りへ戻し、CFM 系は布垂れ対策として `0` に戻す。
- 次に必要な確認:
  - 実 substep 数をログに出せるか。
  - Bullet の solver iteration 設定に upstream API 追加または wasm binding patch が必要か。
  - ERP `0.475` / CFM `0` 適用後の長髪・スカート・袖モデルの挙動差。
  - frame skip 時に 60Hz substep catch-up が効いているか。

### 2026-07-10 Classic Bullet 布垂れ切り分け

- Classic runtime + Bullet MPR で、特定モデルの布・袖・スカートが WASM runtime より垂れる症状を確認した。
- 再生中だけでなく停止時にも同じ傾向が出るため、`Buffered` / `Immediate` の評価方式差は主因ではなさそう。
- `Generic6DofSpringConstraint#setStiffness` の補正値変更は主因ではなさそうだったため、UI と補正処理を撤去した。
- ERP / StopERP を `0.25` から `0.475` に戻すと若干変化したが、垂れは残った。
- CFM / StopCFM を `0.25` から `0` に戻すと大きく改善した。CFM が constraint を柔らかくしすぎていた可能性が高い。
- 現時点の基準値は ERP / StopERP `0.475`、CFM / StopCFM `0`。
- Buffered は速度面で有望なまま。布垂れ原因からはほぼ外し、Classic Bullet MPR + Buffered を実用候補として継続検証する。

### 2026-07-10 再生中の物理 ON/OFF 復帰仕様

- メニューバーや toolbar からグローバル物理を OFF にすると、各モデルの `rigidBodyStates` を 0 にして、物理剛体を kinematic / follow bone 寄りにする。
- OFF 中もアニメーション本体は進むため、ON 復帰時に Bullet 側の剛体姿勢や Buffered motion state が古いままだと、モデルは動くのに物理だけその場に残る。
- そのため、グローバル物理を OFF -> ON に戻す瞬間は、再生中でも一度 `Immediate` として物理を有効化する。
- ON 復帰時の処理順:
  1. `PhysicsRuntimeController.setEnabled(..., playbackActive=false)` で Immediate 状態に寄せる。
  2. 各モデルの `rigidBodyStates` を 1 に戻す。
  3. `initializePhysics()` で現在ボーン姿勢を剛体へ再初期化する。
  4. `commitBodyStates()` で rigid body state を反映する。
  5. 線形速度・角速度を 0 にクリアする。
  6. Buffered 経路では `commitToWasm()` / `updateBufferedMotionStates(true)` で worker / buffer 側へ現在状態を同期する。
  7. 再生中かつ Buffered が有効なら、最後に `syncBulletEvaluationTypeForPlayback(true)` で Buffered に戻す。
- 最初から Buffered として ON 復帰すると、OFF 中の古い motion state を拾って物理だけ置き去りになることがあるため、この Immediate 挟み込みは仕様として維持する。

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
