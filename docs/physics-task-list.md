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
- [x] 例外時に落ちないよう、物理初期化失敗時のフォールバックを実装する

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

- フェーズ 3 の実装項目は、`babylon-mmd` の `MmdAmmoPhysics` に委譲して達成している。

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
  - backend (`MPR` / `SPR` / `Ammo` / `Off`) ごとの差。
  - `physicsStepAvgMs`, `physicsStepMaxMs`, 実 substep 数。
  - 髪系ボーン / 剛体の初期位置と再生中の最大変位。
  - joint の linear limit / angular limit / spring 値が極端ではないか。

## 直近の着手順（最初の 1 週間）

1. 固定ステップ更新 + パラメータ集約
2. 剛体モード `0/1/2` の最小実装
3. 6DoF 拘束 + 制限値反映
4. `disableBidirectionalTransformation` / `disableOffsetForConstraintFrame` 相当の切替
5. 検証モデルで安定性確認と初期値確定
