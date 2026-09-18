# v0.1.1 物理 backend 変更メモ

更新日: 2026-03-12

## 背景

`v0.1.1` フィードバックで、物理の重い PMX や複数人数モーションでクラッシュしやすい報告が入った。
`babylon-mmd` 作者の案内に合わせて、従来の Ammo.js 前提構成から Bullet backend 優先構成へ切り替えた。

参考:

- https://noname0310.github.io/babylon-mmd/docs/reference/runtime/apply-physics-to-mmd-models/

## 変更点

1. 物理 backend を `Ammo only` から `Bullet first, Ammo fallback` へ変更した。
2. Bullet 用 `spr` wasm は package 任せではなく、`?url` で明示解決して初期化するようにした。
3. 上パネルに backend バッジを追加し、現在の物理方式を確認できるようにした。
4. Electron の V8 old-space を `4096MB` に拡張した。

## 実装方針

Bullet 経路:

- `MultiPhysicsRuntime` を scene に register
- `MmdBulletPhysics` を MMD runtime に接続
- `fixedTimeStep = 1 / 120`
- `maxSubSteps = 120`

Ammo fallback 経路:

- Bullet 初期化失敗時のみ起動
- `ammo.wasm.wasm` を URL 明示で取得
- `MmdAmmoJSPlugin` + `MmdAmmoPhysics` で従来互換を維持

共通:

- モデル物理構築は `disableOffsetForConstraintFrame: true`
- 重力は `Vector3(0, -98, 0)`
- 物理初期化に失敗しても PMX / VMD / 再生は継続する

## 運用上の見方

- 上パネルが `Bullet`:
  - 期待どおり Bullet backend で動作中
- 上パネルが `Ammo`:
  - Bullet 初期化に失敗して fallback 済み
- 上パネルが `Off`:
  - Bullet / Ammo の両方が初期化失敗

## 既知の注意点

- backend 手動切替 UI はまだ無い
- Bullet 初期化失敗時は console warning を確認する必要がある
- `4096MB` 化はメモリ余裕を増やすだけで、重すぎる物理負荷そのものを解消するものではない

## 確認観点

- 重い物理モデル 1 体で `Bullet` 表示のまま読めるか
- 複数モデル読込時に fallback せず維持できるか
- 物理 ON / OFF 切替が backend に依らず動くか
- 再生、seek、停止で挙動差が増えていないか
