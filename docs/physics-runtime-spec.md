# 物理実装仕様（現行）

更新日: 2026-03-12

## 目的

- `MMD_modoki` における物理演算の現在実装を明文化する。
- Bullet 優先 / Ammo fallback の挙動と UI 表示を揃える。

## 対象範囲

- 実装ファイル: `src/mmd-manager.ts`, `src/ui-controller.ts`, `index.html`, `src/main.ts`
- 優先ランタイム: babylon-mmd `MultiPhysicsRuntime` + `MmdBulletPhysics`
- fallback ランタイム: babylon-mmd `MmdAmmoJSPlugin` + `MmdAmmoPhysics`

## バックエンド選択仕様

1. `MmdManager` 起動時に `initializePhysics()` を非同期で開始する。
2. まず Bullet backend を初期化する。
3. Bullet 初期化に失敗した場合だけ Ammo.js backend へ fallback する。
4. Ammo も失敗した場合は物理を無効化したまま起動を継続する。

内部状態:

- `physicsBackend = "bullet" | "ammo" | "none"`
- `physicsAvailable = true` のときだけモデル物理を構築する
- `physicsEnabled = false` に落ちた場合でも PMX / VMD / 再生は継続可能

## Bullet backend 初期化仕様

1. `spr/index_bg.wasm` を `?url` で解決して読み込む。
2. `spr` wasm bindgen module を plain object 化して `memory` と `createTypedArray` を補完する。
3. `MultiPhysicsRuntime` を生成して scene に register する。
4. `MmdBulletPhysics` を生成し、MMD runtime 側の physics 実装として接続する。

現在の設定:

- fixed time step: `1 / 120`
- max sub steps: `120`
- gravity: `Vector3(0, -98, 0)`

## Ammo fallback 初期化仕様

1. `ammo.wasm.wasm` を `?url` で解決して `fetch` する。
2. `Ammo({ wasmBinary })` で wasm バイナリを明示注入する。
3. `MmdAmmoJSPlugin` を作成し `scene.enablePhysics(...)` を実行する。
4. `MmdAmmoPhysics` を生成して MMD runtime 側へ接続する。

現在の設定:

- gravity: `Vector3(0, -98, 0)`
- max steps: `120`
- fixed time step: `1 / 120`

## モデルロード時の仕様

- `loadPMX` は `physicsInitializationPromise` 完了後に進む。
- 物理が利用可能な場合は `createMmdModel(..., { buildPhysics: { disableOffsetForConstraintFrame: true } })`
- 物理が利用不可な場合は `createMmdModel(..., { buildPhysics: false })`
- `disableOffsetForConstraintFrame: true` は Bullet / Ammo の両 backend で維持する

## 重力適用仕様

- Bullet 使用時は `MultiPhysicsRuntime.setGravity(...)` へ反映する。
- Ammo 使用時は Babylon physics engine (`scene.getPhysicsEngine()?.setGravity(...)`) へ反映する。
- UI 上の重力変更は backend を意識せず同じ API で扱う。

## ON / OFF 仕様

- 物理 ON / OFF は `model.rigidBodyStates` を全剛体 `1 / 0` で切替する。
- 公開 API:
  - `isPhysicsAvailable()`
  - `getPhysicsEnabled()`
  - `setPhysicsEnabled(enabled)`
  - `togglePhysicsEnabled()`
  - `getPhysicsBackendLabel()`
- 状態通知:
  - `onPhysicsStateChanged(enabled, available)`

## UI 仕様

物理トグル:

- ボタン ID: `btn-toggle-physics`
- ラベル ID: `physics-toggle-text`
- 表示:
  - `物理ON`
  - `物理OFF`
  - `物理不可`

上パネル backend バッジ:

- ID: `physics-type-badge`
- 表示:
  - `Bullet`
  - `Ammo`
  - `Off`
- 配色:
  - `Bullet`: 緑
  - `Ammo`: amber
  - `Off`: 灰

## 破棄仕様

- Bullet 使用時は `bulletPhysicsRuntime.unregister()` と `dispose()` を実行する。
- Ammo 使用時は Babylon physics engine / plugin 側の dispose 経路に従う。
- 終了時は `physicsBackend = "none"` へ戻す。

## エラーハンドリング仕様

- Bullet 初期化失敗時:
  - warning をコンソール出力
  - Ammo backend へ fallback
- Ammo も失敗した場合:
  - `physicsAvailable = false`
  - `physicsEnabled = false`
  - `physicsBackend = "none"`
  - `onPhysicsStateChanged(false, false)` を通知
  - `onError("Physics init warning: ...")` を通知

## 既知の制約

- 物理パラメータは現状ハードコード。
- backend 手動選択 UI は未実装で、自動選択のみ。
- `disableBidirectionalTransformation` 相当のユーザー切替は未実装。
- 詳細なデバッグ表示（剛体 / 拘束可視化）は未実装。
- Electron 側の V8 old-space は `4096MB` に拡張済みだが、極端に重い複数モデルでのメモリ上限を保証するものではない。
