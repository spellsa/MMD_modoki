# 汎用オブジェクト欄 設計案

## 概要

現行の `アクセサリ欄` は `.x` 読み込みと transform / parent / visible の編集に特化している。  
今後 `obj` / `glb` / Babylon.js が標準で扱える静的メッシュ系フォーマットを取り込むなら、この欄を `汎用オブジェクト欄` として拡張するのが最も自然である。

この案では、`PMX/PMD` の MMD モデル系 UI と runtime は維持しつつ、`.x / obj / glb` は同一カテゴリの `オブジェクト` として扱う。

## 目的

- `.x` 以外の汎用メッシュ形式をアプリに追加しやすくする
- MMD モデル専用の管理系と、汎用オブジェクトの管理系を分離したまま UI を整理する
- 将来 `SceneItem` 的な統合へ進める場合の足場を作る

## 非目的

- `.x / obj / glb` を `PMX/PMD` と完全に同じ `モデル` 扱いにすること
- ボーン / モーフ / VMD 適用 / MMD runtime への統合
- 既存の `sceneModels` を即座に汎用化すること

## 現状整理

- `PMX/PMD` は `sceneModels` で管理され、情報欄・エフェクト欄・タイムラインの中心になっている
- `timelineTarget` は実質 `model | camera` の2系統
- `.x` は [`mmd-manager-x-extension`](../src/mmd-manager-x-extension.ts) 側の独立ストアで保持される
- プロジェクト保存も `models` と `accessories` が分離されている

このため、`obj/glb` を `モデル欄` に直接入れると、`sceneModels` 前提のコード全体を崩す必要がある。

## 推奨方針

### 1. UI 名称を広げる

- `アクセサリ欄` を `オブジェクト欄` へ改名
- 対象は `.x / obj / glb / Babylon 汎用メッシュ`

### 2. 内部管理は当面分離維持

- `PMX/PMD`:
  - 既存どおり `sceneModels`
- 汎用オブジェクト:
  - 既存 accessory store を拡張した `sceneObjectStore`

### 3. 編集可能項目はオブジェクト共通に寄せる

- 表示 / 非表示
- 削除
- 親:
  - World
  - モデル
  - ボーン
- Transform:
  - 位置
  - 回転
  - スケール
- 材質 / シェーダー:
  - 可能なら `.x` と同様に `MmdStandardMaterial` 系プリセットへ寄せる

## データモデル案

```ts
type SceneObjectKind = "x" | "obj" | "glb" | "babylon-mesh";

type SceneObjectEntry = {
    id: string;
    kind: SceneObjectKind;
    name: string;
    path: string;
    root: TransformNode;
    offset: TransformNode;
    meshes: AbstractMesh[];
    visible: boolean;
    parentModelRef: object | null;
    parentModelName: string | null;
    parentBoneName: string | null;
    parentBoneUseMeshWorldMatrix: boolean;
    transformKeyframes: ObjectTransformKeyframeState;
    metadata?: Record<string, unknown>;
};
```

ポイント:

- 既存 `AccessoryEntry` を一般化する
- `kind` で loader 由来を識別する
- `.x` 専用情報は `metadata` または kind 別補助型へ逃がす

## Loader 構成案

### Phase 1

- `loadX()` を残す
- 新規で `loadSceneObject(filePath)` を追加
- 拡張子で分岐:
  - `.x` -> 現在の `x-file-loader`
  - `.obj` / `.glb` -> Babylon `SceneLoader.ImportMeshAsync`

### Phase 2

- `loadX()` は `loadSceneObject()` の薄い wrapper にする
- UI は `loadSceneObject()` を呼ぶ

### 注意点

- `obj` は材質差分が大きいので MMD toon 完全互換にはしない
- `glb` は skinned / animation 付きも来るが、最初は静的オブジェクトとして扱う
- `glb` の animation clip は初期段階では無視する

## UI 案

### 欄構成

- `対象` セレクタ
- `表示/非表示`
- `削除`
- `親`:
  - World
  - モデル
  - ボーン
- Transform:
  - X / Y / Z
  - Rx / Ry / Rz
  - S
- 将来拡張:
  - 影を受ける / 落とす
  - 材質プリセット
  - 読込スケール

### 既存アクセサリ欄から流用できる部分

- セレクタ更新
- transform slider
- parent model / bone UI
- visible / delete 操作
- keyframe 登録 UI

## タイムライン方針

短期では `モデル欄` と完全統合しない。

### 最小案

- オブジェクト欄で選択中だけ `Object` 1行をタイムラインに出す
- 扱うキーフレームは transform のみ

### 拡張案

- `timelineTarget` を `camera | model | object` に拡張
- object ごとに個別 track を出す

ただしこれは中規模改修なので、`UI 統合` より後に着手する。

## プロジェクト保存方針

当面は互換性優先で `accessories` を維持し、実態だけ `objects` に寄せる。

案:

- v1:
  - 既存 `accessories` を使い続ける
- v2:
  - `scene.objects` または `objects` を追加
  - `kind` を保存
  - importer 側で旧 `accessories` も読めるようにする

## 実装ステップ

### Step 1: 名前と責務の整理

- `AccessoryEntry` -> `SceneObjectEntry` 相当へ整理
- UI 文言を `アクセサリ` から `オブジェクト` に変更

### Step 2: loader 追加

- `loadSceneObject(filePath)` を導入
- `.x` 以外の Babylon 対応フォーマット読込を追加

### Step 3: オブジェクト欄 UI の共通化

- 既存 accessory UI を generic object 用に改名
- 現行 `.x` が壊れないことを優先

### Step 4: 保存復元対応

- `kind` を含めて保存
- 旧 project 互換を維持

### Step 5: 必要ならタイムライン拡張

- `object` target 追加
- transform keyframe の表示と編集を接続

## 難易度見積もり

- `オブジェクト欄` へ改名し、`.x` をそのまま維持: `低`
- `obj/glb` 読込をオブジェクト欄に追加: `中`
- 保存復元まで整える: `中`
- タイムライン対象として自然に統合: `中〜高`
- `モデル欄` と完全統合: `高`

## 推奨実装順

汎用オブジェクト欄として拡張する場合、実装順は `glb -> obj -> stl` を推奨する。

### 理由

- `glb`
  - テクスチャ付きで完成アセットをそのまま置きやすい
  - Babylon 側の対応が安定している
  - 導入効果が最も大きい
- `obj`
  - 利用頻度は高い
  - ただし `mtl` と texture path 解決の揺れがあり、`glb` より少し面倒
- `stl`
  - 静的メッシュとしては有用
  - ただし UV / texture / animation を持たず用途が限定される
  - 軸向きやスケール既定値の調整が必要

### 段階案

1. `アクセサリ欄` を `オブジェクト欄` に改名
2. `.x` の内部管理を `汎用オブジェクト` 前提の命名へ整理
3. Babylon loader 登録を有効化
4. `glb/gltf` を追加
5. `obj` を追加
6. `stl` を追加
7. 保存形式に `kind` を追加
8. 必要ならタイムラインを `object` 対応

### 備考

- `stl` は「静的形状を置く」用途に向く
- `glb` は「見た目込みの完成アセット」に向く
- 最初から 3 形式を同時に入れるより、`glb` を基準に object pipeline を固めてから `obj` と `stl` を足すほうが安全

## 結論

`obj/glb` を増やす前提なら、`アクセサリ欄` を消して `モデル欄` に寄せるより、`アクセサリ欄` を `汎用オブジェクト欄` に育てるほうが安全で拡張しやすい。  
MMD モデルと汎用メッシュは責務がかなり違うため、内部管理は当面分けたまま、UI と loader だけ段階的に一般化するのが妥当である。
