# FrameGraphComputeShaderTask 調査メモ 2026-07-09

## 概要

`FrameGraphComputeShaderTask` は、Babylon.js の FrameGraph 内で compute shader を実行するための task。
公式 Typedoc では WebGPU only とされており、MMD_modoki のように WebGPU 前提で寄せている環境では、将来の GPU 計算実験候補になる。

参照:

- 公式 Typedoc: https://doc.babylonjs.com/typedoc/classes/BABYLON.FrameGraphComputeShaderTask
- ローカル型定義: `node_modules/@babylonjs/core/FrameGraph/Tasks/Misc/computeShaderTask.d.ts`

## 基本仕様

- `FrameGraphTask` を継承する。
- 内部で `ComputeShader` を作成して保持する。
- `frameGraph.engine.getCaps().supportComputeShaders` が false の場合は、エラーを出して task 自体は no-op 相当になる。
- `isReady()` は、非対応環境では true を返し、対応環境では内部 `ComputeShader.isReady()` を返す。
- `record()` で FrameGraph pass を作り、その pass の execute 内で compute shader を dispatch する。
- `dispose()` では、task が作成した `UniformBuffer` を破棄してから親の dispose を呼ぶ。

## shaderPath

constructor は次の形を受け取る。

```ts
new FrameGraphComputeShaderTask(name, frameGraph, shaderPath, options)
```

`shaderPath` は次のいずれか。

- `{ compute: "custom" }`
  - `ShaderStore.ShadersStoreWGSL["customComputeShader"]` を使う。
- `{ computeElement: "HTMLElementId" }`
  - script tag 内の shader code を使う。
- `{ computeSource: "..." }`
  - 文字列として渡した compute shader code を使う。
- `"name"`
  - まず `ShaderStore.ShadersStoreWGSL["nameComputeShader"]` を探す。
  - 見つからない場合は `name.compute.fx` を読み込む前提になる。

MMD_modoki では、初期実験なら `{ computeSource }` で小さい WGSL を直接渡し、固まったら shader asset 化するのが扱いやすそう。

## 主なプロパティ

- `dispatchSize: Vector3`
  - 通常 dispatch の workgroup count。
  - 既定は `(1, 1, 1)`。
- `indirectDispatch?: { buffer: StorageBuffer | DataBuffer; offset?: number }`
  - 設定されている場合は `dispatchSize` ではなく `dispatchIndirect()` を使う。
  - `offset` は workgroup count が入っている buffer offset。既定は `0`。
- `execute?: (context: FrameGraphContext) => void`
  - task 実行冒頭に呼ばれる任意の hook。
  - dispatch 前の uniform 更新や、一時的な値の同期に使える。
- `computeShader`
  - 内部 `ComputeShader` への getter。

## bind API

task から内部 `ComputeShader` に bind できるもの。

- `createUniformBuffer(name, description, autoUpdate = true)`
  - UniformBuffer を作成し、shader に bind する。
  - `description` は uniform 名と float 数の map。
  - `autoUpdate` が true なら dispatch 前に `ubo.update()` される。
- `getUniformBuffer(name)`
- `setTexture(name, texture, bindSampler = true)`
- `setInternalTexture(name, texture)`
- `setStorageTexture(name, texture)`
- `setExternalTexture(name, texture)`
- `setVideoTexture(name, texture)`
- `setUniformBuffer(name, buffer)`
- `setStorageBuffer(name, buffer)`
- `setTextureSampler(name, sampler)`

storage buffer / storage texture を扱えるため、ポストエフェクトだけでは書きにくい GPU 側の前処理や mask 生成に使える可能性がある。

## record() の挙動

`record(skipCreationOfDisabledPasses?)` は次の動きをする。

- FrameGraph pass を追加する。
- 非対応環境では空の execute function を登録する。
- 対応環境では、execute 内で次を実行する。
  - `task.execute?.(context)`
  - task が作った UniformBuffer のうち `autoUpdate` のものを更新する。
  - `indirectDispatch` があれば `dispatchIndirect(buffer, offset)`。
  - なければ `dispatch(dispatchSize.x, dispatchSize.y, dispatchSize.z)`。
- `skipCreationOfDisabledPasses` が false の場合、disabled 用の空 pass も作る。

## MMD_modoki での候補用途

今すぐ実装するものではなく、WebGPU / FrameGraph 前提の実験候補として残す。

- shadow / lighting 用の補助 mask 生成
  - CSM + PCF の輪郭が硬すぎる問題を、shadow map 本体ではなく receiver 用 mask の後処理で補えるか試す。
  - ただし既存の MMD material shader と二重適用にならない設計が必要。
- object / model mask 生成
  - Offset Shadow / Offset Rim / Luminous などで、対象モデルだけを GPU 側で分離する補助 buffer を作る。
- depth / normal / edge 前処理
  - FrameGraph post stack の前段で depth edge、normal edge、thickness などを compute して、複数 effect で使い回す。
- particle / node effect の前処理
  - 将来の node particle effects で、GPU 側の位置更新や分類を task 化する。
- 動画出力や高解像度出力の補助
  - CPU 側 readback 前の mask / tile / reduction 処理。ただし readback 同期コストには注意。

## 注意点

- WebGPU only。WebGL fallback を維持したい機能には直接使わない。
- shader code、bindingsMapping、UniformBuffer / StorageBuffer の lifetime 管理が必要。
- FrameGraph は build 後の task 依存を軽く差し替えにくい。パラメータ変更で resource shape が変わる場合は backend rebuild が必要。
- MMD material shader、FrameGraph post stack、transparent shadow、shadow generator task と接続する場合、描画順と texture ownership を明確にする。
- まずは既存描画を置き換えず、独立した debug / experimental task として入れるのが安全。

## 次回試すなら

1. 最小 WGSL の `{ computeSource }` で no-op に近い task を FrameGraph に追加する。
2. `dispatchSize` と `execute` hook の動作を diagnostic log で確認する。
3. 小さい storage buffer に値を書き、GPU readback か後続 pass で確認する。
4. post stack の resource plan と衝突しない rebuild 条件を決める。
5. 実用途は shadow mask / object mask / edge prepass のどれか 1 つに絞って検証する。

## CustomPostProcessTask との役割分担

`FrameGraphCustomPostProcessTask` は、基本的に入力 texture を画面空間で加工し、出力 texture に書く用途に向いている。
色補正、ぼかし、エッジ強調、発光合成、マスク合成のような「すでに描かれた絵を加工する」処理では扱いやすい。

一方で `FrameGraphComputeShaderTask` は、画面に直接出す前の GPU データを作る・更新する用途に向いている。
storage buffer / storage texture を扱えるため、単なる post effect では足りない「状態を持つエフェクト」や「次フレームへ引き継ぐエフェクト」の土台にできる。

大まかな役割:

- `CustomPostProcessTask`
  - color / depth / normal などの入力 texture を加工する
  - 1 frame の画面効果として完結しやすい
  - MME 的な画面合成、Bloom、Luminous、輪郭、色調整に向く
- `ComputeShaderTask`
  - buffer / texture に対して任意の GPU 計算を行う
  - particle state、height map、contact mask、object mask などを作れる
  - 後段の material / post process / render task に渡す中間データを作る用途に向く

将来的には、次のような流れを検討できる。

```text
compute task
  -> simulation / mask / height / edge prepass
  -> material or custom post process
  -> final composite
```

## ポストエフェクトで足りない用途の候補

`ComputeShaderTask` は、MMD_modoki で「ポストエフェクトだけでは表現しづらいエフェクト」を作る候補として見る。

候補:

- GPU particle
  - particle の位置、速度、寿命、乱数 seed を storage buffer に持つ
  - compute で更新し、描画側は billboard / point / mesh instance に渡す
  - 将来的には depth / object mask と組み合わせて、モデルの足元や手元から発生する粒子を作る
- あたり判定付き水面エフェクト
  - compute で height texture / velocity texture / normal texture を更新する
  - depth、object mask、足元 contact mask から波紋の発生点を入れる
  - 水面 material は compute 結果の height / normal を読む
  - post effect だけではなく、scene 内の水面 mesh と連動できる
- contact / collision mask
  - model depth、floor depth、object id 的な mask から、接触している領域を GPU 側で抽出する
  - 水しぶき、接地煙、足元 glow、影補助 mask の入力にする
- effect 用 object mask
  - 特定モデル、アクセサリ、ステージだけに効く mask を作る
  - Offset Shadow / Offset Rim / Luminous の対象分離に使う
- edge / thickness prepass
  - depth / normal からエッジや厚みの補助 texture を作る
  - 複数の post effect で同じ前処理を使い回す

最初に試すなら、水面か particle のどちらかに絞る。
水面は texture 更新から material 反映までの流れが見えやすく、particle は storage buffer 更新から描画への接続を検証しやすい。

## 実装方針メモ

- 既存の FrameGraph post stack にいきなり混ぜず、まず experimental task として独立させる。
- `compute -> texture/buffer -> post/material` の依存関係を明示する。
- resource shape が変わる設定は backend rebuild 条件に入れる。
- 1 frame 完結の post effect と、状態を持つ simulation effect を UI 上でも区別する。
- WebGPU only の機能として扱い、WebGL fallback を前提にしない。
