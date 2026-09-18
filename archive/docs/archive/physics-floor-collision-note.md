# 物理床判定メモ

更新日: 2026-07-10

## 目的

MMD_modoki の物理 runtime に、モデルが床をすり抜けにくくするための固定床判定を追加する。

## 実装方針

- 対象は Classic runtime + Bullet MPR / SPR。
- `babylon-mmd` の Bullet binding で `PhysicsStaticPlaneShape` を作り、`RigidBodyConstructionInfo.motionType = MotionType.Static` の剛体として生成する。
- 床は `normal = Vector3(0, 1, 0)`, `planeConstant = 0` の `Y=0` 平面とする。
- MMD モデルごとに physics world が分かれるため、`MultiPhysicsRuntime.addRigidBodyToGlobal()` で全 world に追加する。
- OFF / backend 切替 / dispose 時は `removeRigidBodyFromGlobal()` 後に rigid body / info / shape を破棄する。

## UI / 保存

- メニューバー `物理演算 > 床判定` から ON / OFF できる。
- 既定値は ON。
- プロジェクトには `physics.floorCollisionEnabled` として保存する。
- 古いプロジェクトで値がない場合は ON として読み込む。

## 制約

- `MmdWasmRuntime + MmdWasmPhysics` 実験経路では、現時点で同じ Bullet binding の global rigid body API を使っていないため、床判定メニューは無効表示にする。
- 床は無限平面なので、PMX ステージの形状に沿った段差・坂・地形判定ではない。ステージ固有の床判定が必要になった場合は、PMX mesh から別途 static shape を生成する設計が必要。

## 参照

- babylon-mmd: Apply physics to MMD models
  - https://noname0310.github.io/babylon-mmd/ja/docs/reference/runtime/apply-physics-to-mmd-models/
- babylon-mmd: Bullet physics
  - https://noname0310.github.io/babylon-mmd/ja/docs/reference/runtime/bullet-physics/
- local type reference:
  - `node_modules/babylon-mmd/esm/Runtime/Optimized/Physics/Bind/physicsShape.d.ts`
  - `node_modules/babylon-mmd/esm/Runtime/Optimized/Physics/Bind/rigidBodyConstructionInfo.d.ts`
  - `node_modules/babylon-mmd/esm/Runtime/Optimized/Physics/Bind/Impl/multiPhysicsRuntime.d.ts`
