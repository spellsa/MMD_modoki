# FrameGraph Effect Stack Order 設計メモ

## 概要

FrameGraph / PostFX の効果欄を、Photoshop や CLIP STUDIO のレイヤーに近い縦積み UI として扱い、ユーザーが効果の順序を入れ替えられるようにする。

MMD / MME に慣れたユーザーは、エフェクトの適用順で見た目が変わることを前提に調整する。そのため、MMD_modoki 側でも固定順だけにせず、少なくとも FrameGraph backend では順序を作品ごとに調整できる余地を作る。

## 現状

2026-06-13 時点の FrameGraph PostFX は、`FrameGraphPostEffectsController.activate()` 内で固定の task chain を組んでいる。

現在の概略順:

```text
scene color
  -> ImageProcessing
  -> SSR
  -> SSAO
  -> SSAO toon composite
  -> DoF
  -> Bloom
  -> LUT
  -> ColorCorrection
  -> Sharpen
  -> Grain
  -> ChromaticAberration
  -> Vignette + EdgeBlur
  -> LensDistortion
  -> FXAA
  -> backbuffer
```

UI 側は `FRAME_GRAPH_POST_ADD_EFFECTS` の固定配列を逆順表示し、下が先、上が後にかかる見た目にしている。ただし、これはまだ表示上の順序であり、runtime の FrameGraph task chain は固定である。

Babylon.js の FrameGraph task は、PostProcess 系 task が `sourceTexture` を受け取り `outputTexture` を返す形になっている。したがって、MMD_modoki 側で effect entry の順序配列を持ち、順に `sourceTexture -> outputTexture` をつなぎ直す設計は取りやすい。

## 目的

- ユーザーが PostFX の適用順を選べるようにする
- UI のレイヤー表現と実際の FrameGraph task chain を一致させる
- disabled の項目も stack 上に残し、ON/OFF と順序を別概念として扱う
- project save / load で順序を復元する
- 将来の公式 FrameGraph task 追加、粒子、光源、外部 shader 追加に備えて、効果欄の state を整理する

## 非目的

- Classic PostProcess backend の自由順序化
- 全 Babylon 公式 FrameGraph task の完全対応
- MME 互換の描画順や technique/pass 制御
- shader graph 風の任意 DAG 編集

v0.2 の範囲では、まず PostFX の直列 stack として扱う。

## UI 方針

### 表示順

UI は現在の方針を維持する。

```text
上: 後からかかる効果
下: 先にかかる効果
```

これは画像編集ソフトのレイヤー感覚に近い。たとえば下に `Bloom`、上に `LUT` がある場合、Bloom 済みの絵に LUT がかかる。

### 操作

初期実装では、ドラッグよりも小さい上下移動ボタンを優先する。

理由:

- 右パネルが狭く、ドラッグハンドルと詳細展開が干渉しやすい
- Electron の狭い panel 内 DnD は hover / scroll / text selection の癖が出やすい
- unit test では上下移動 helper のほうが確認しやすい

候補 UI:

```text
[checkbox] [効果名........] [↑] [↓]
```

将来、必要なら左端に drag handle を追加する。

### ON/OFF と順序

チェックボックス OFF は「その entry を無効にする」だけで、stack からは消さない。

```text
entry exists
  enabled: false
  order: preserved
```

完全に一覧から消す操作は、別途「削除」または「stack から外す」として扱う。v0.2 初期では必須ではない。

### 追加時

`+` から効果を追加した場合は、現在の仕様通り、その効果の詳細を開く。

追加位置は次のどちらかを選ぶ。

1. 現在の canonical order に合わせた位置へ挿入
2. UI の最上段へ追加し、最後にかかる効果として扱う

初期実装では 1 を推奨する。既存の固定順に近い見た目から始められ、ユーザーが必要な分だけ動かせる。

## State 設計

UI 専用の `Set<FrameGraphPostAddEffectId>` だけでは順序を保存できないため、ordered entry に置き換える。

案:

```ts
type FrameGraphPostEffectId =
    | "ssr"
    | "ssao"
    | "dof"
    | "bloom"
    | "lut"
    | "sharpen"
    | "grain"
    | "chromatic"
    | "vignette"
    | "edgeBlur"
    | "distortion";

type FrameGraphPostEffectStackEntry = {
    id: FrameGraphPostEffectId;
    enabled: boolean;
};
```

既存の各 effect parameter は当面そのまま `MmdManager` 側に残す。stack entry は「存在、順序、ON/OFF」を持ち、強度や詳細値は既存の post effect state を参照する。

### Canonical order

互換と初期表示のため、現在の固定順を canonical order として定義する。

```text
ssr
ssao
dof
bloom
lut
sharpen
grain
chromatic
vignette
edgeBlur
distortion
```

`ImageProcessing`、`ColorCorrection`、`FXAA` は扱いを分ける。

- `ImageProcessing`: 内部基礎処理として残す。効果 stack の自由順序対象にはしない
- `ColorCorrection`: UI 上に出すなら `色補正` entry として別途検討する
- `FXAA`: 最終段固定を基本にする。自由順序対象に入れる場合は別タスクとして慎重に検証する

## Project 保存案

既存 project data の `effects` に optional field を追加する。

```ts
type ProjectEffects = {
    frameGraphPostStack?: Array<{
        id: FrameGraphPostEffectId;
        enabled: boolean;
    }>;
};
```

互換方針:

- `frameGraphPostStack` がない既存 project は、既存パラメータの enabled 状態から stack を復元する
- 復元順は canonical order
- 未知の id は読み飛ばす
- 重複 id は最初の 1 件だけ採用する
- 新しい効果が追加された場合、保存済み stack には自動挿入しない。ユーザーが `+` から追加する

## Runtime 設計

`FrameGraphPostEffectsController.activate()` に order 情報を渡し、以下のような builder に分ける。

```text
source = imported scene color
source = addBaseImageProcessing(source)
resource = addGeometryResourcesIfNeeded(stack, settings)

for entry in runtimeOrder:
    if entry is disabled:
        continue
    source = addEffectTask(entry.id, source, resource)

source = addFixedFinalTasks(source)
copy source to backbuffer
```

重要なのは、ユーザー stack と内部 resource task を分けること。

### Resource task

SSAO / SSR / DoF などは depth / normal / reflectivity / camera が必要になる。

これらはユーザーが直接並べる効果ではなく、依存する効果が stack 内に存在し enabled のときだけ先に作る。

```text
GeometryRenderer
Depth / Normal / Reflectivity
```

### Compound task

一部の効果は現在まとめている。

- `vignette` と `edgeBlur` は同じ custom task
- `SSAO` は SSAO task と toon composite task の組
- `SSR` は geometry resource と SSR pipeline task の組

自由順序を正確にするには、UI entry と runtime task の対応を整理する必要がある。

初期案:

- `SSAO`: 1 entry = SSAO task + toon composite
- `SSR`: 1 entry = SSR pipeline task
- `vignette` と `edgeBlur`: 初期実装では近接制約を設けるか、先に task を分離する
- `distortion`: 単独 task

`vignette` と `edgeBlur` を完全に別順序にしたい場合は、custom shader を 2 つに分ける。

## 実装段階案

### Phase 1: pure helper と state 整理

- `FrameGraphPostEffectId` を UI 内 private type から shared type へ移す
- ordered stack helper を追加する
- helper の unit test を追加する

候補 helper:

```ts
normalizeFrameGraphPostStack(entries, availableIds)
addFrameGraphPostStackEntry(entries, id, canonicalOrder)
moveFrameGraphPostStackEntry(entries, id, direction)
mergeFrameGraphPostStackWithRuntimeSettings(entries, settings)
```

確認項目:

- unknown id を捨てる
- duplicate id を 1 件にする
- 追加時に canonical order の位置へ入る
- OFF entry が移動しても消えない

### Phase 2: UI の順序入れ替え

- `Set` を ordered stack に置き換える
- stack row に上下ボタンを追加する
- クリック後も expanded item を維持する
- 一番上 / 一番下では該当ボタンを disabled にする
- 表示は引き続き「上が後、下が先」

この段階では runtime はまだ固定順でもよい。ただし UI 上に「実適用順は次段階で反映」と残すのは避けたいので、可能なら Phase 3 と同じ PR / commit にまとめる。

### Phase 3: project save / load

- `project-serializer.ts` に stack 保存を追加
- `project-importer.ts` に stack 復元を追加
- 既存 project は canonical order で復元
- unit test を追加

### Phase 4: runtime task chain の順序反映

- `FrameGraphPostEffectsController` に stack order を渡す
- `activate()` の固定チェーンを小さい builder 関数へ分割する
- entry ごとに `sourceTexture` を受け取り `outputTexture` を返す
- resize / backend switch / project load 時に controller を再構築する
- order 変更時も controller を再構築する

ここは最も壊れやすいため、先に helper / save-load のテストを通してから触る。

### Phase 5: 詳細な制約解除

- `vignette` / `edgeBlur` を別 task 化する
- `FXAA` を固定最終段にするか stack 化するか決める
- `ColorCorrection` を UI に出すか決める
- drag reorder を追加するか判断する

## リスク

### 現在の固定チェーン依存

既存コードは task instance を field に保持し、`execute()` で各 task に設定を再適用している。順序化すると task の生成位置が可変になるため、task lookup / builder の責務を整理する必要がある。

### disabled pass の扱い

Babylon.js の post process task は disabled 時に source を output へ copy する実装が多い。UI の OFF と task disabled は相性がよいが、完全に task を作らない方式にすると chain の構築が変わる。

初期実装では、stack に存在するが OFF の entry は task を作らず skip するより、現在と同じ disabled task として組むほうが挙動差が少ない可能性がある。

ただし task 数は増えるため、最終的には「OFF entry は UI には残すが runtime では skip」も検討する。

### resource task の過剰生成

SSAO / SSR が OFF なのに GeometryRenderer を作ると重い。ordered stack では「存在」ではなく「enabled + 実効値」で resource 必要性を判定する。

### 見た目の互換

順序を動かせるようにすると、同じ parameter でも結果が変わる。既存 project の読み込み時は必ず canonical order で復元し、過去の見た目に近づける。

### 狭い右パネル

上下ボタン、チェックボックス、効果名、詳細展開が同じ行に乗るため、テキスト省略とボタンサイズを慎重に決める。

## テスト / 確認

### Unit test

- stack 正規化
- 追加位置
- 上下移動
- unknown / duplicate 除去
- project save / load 互換

### Smoke

- `npm.cmd run lint`
- 可能なら `npm.cmd run test:unit`
- runtime に触った場合は `npm.cmd run smoke:launch`

### 手動確認

- `Bloom -> LUT` と `LUT -> Bloom` で見た目が変わる
- `Grain -> Vignette` と `Vignette -> Grain` で粒子の乗り方が変わる
- OFF にしても row が残る
- OFF row を移動しても、ON に戻したとき移動後の順でかかる
- project 保存 / 読み込み後に順序が残る
- backend を Classic / FrameGraph で切り替えても二重適用しない

## 推奨実装順

最初の実装は次の順がよい。

1. ordered stack helper と unit test
2. UI の上下移動ボタン
3. project save / load
4. FrameGraph runtime order 反映
5. `vignette` / `edgeBlur` 分離などの精度改善

順序入れ替えは欲しい機能だが、runtime chain の変更は描画全体に響く。まず state と保存形式を固め、固定順との差分を小さく見ながら task builder へ進める。

## 2026-06-13 実装メモ

初回実装として、次を入れた。

- `src/shared/frame-graph-post-effect-stack.ts` に stack order helper を追加
- 効果 stack row に上下ボタンを追加
- UI の表示順は「上が後、下が先」を維持
- `MmdManager` が ordered stack を持ち、順序変更時に FrameGraph backend を再構築する
- `effects.frameGraphPostStack` として project save / load に保存する
- `FrameGraphPostEffectsController` で task の `sourceTexture -> outputTexture` 接続を runtime order から張り直す
- `ImageProcessing` と `FXAA` は内部固定扱いのままにした

制約:

- `Vignette` と `EdgeBlur` は現状同じ custom task なので、どちらか先に出てきた位置でまとめて適用される
- 完全な別順序化が必要なら、次の段階で shader / task を分離する
- Classic PostProcess backend は対象外

確認:

- `npm.cmd run test:unit -- --run src/shared/frame-graph-post-effect-stack.test.ts src/project/project-serializer.test.ts src/project/project-importer.test.ts`
- `npm.cmd run lint`
- `npm.cmd run smoke:launch`
