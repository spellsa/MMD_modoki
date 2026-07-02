# FrameGraph Resource Registry 検討メモ 2026-05-30

## 目的

v0.2 世代の描画 / PostFX / Effect UI を FrameGraph 主軸に寄せる前提で、depth / normal / reflectivity / scene color などの共通レンダーリソースをどう扱うか整理する。

現状の FrameGraph post effects は、DoF / Bloom / LUT / color correction / SSAO / SSR / FXAA などをまとめられるようになってきた。一方で、depth や geometry buffer のような複数 effect が参照する基礎バッファは、機能ごとに生成経路が分かれると RenderTarget が増えやすい。

将来 M4Layer 的な shader layer / custom render target layer / custom FrameGraph pass を検討するなら、その前に「よく使う基礎バッファをどこが作り、誰が使うか」を明示する必要がある。

## v0.2 の基本方針

v0.2 世代では、Classic PostProcess を新設計の主対象にしない。

方針:

- FrameGraph backend を v0.2 の主レンダリング経路として扱う。
- Classic PostProcess は既存互換 / fallback / 比較検証用として残す。
- 新規 Effect UI、diagnostics、将来の custom layer は原則 FrameGraph 側だけを対象にする。
- Classic backend に新しい UI 機能や custom RT 機能を無理に広げない。

理由:

- Classic と FrameGraph の両方を同時に設計対象にすると、UI と resource lifetime の分岐が増える。
- depth / normal / reflectivity の共有設計は FrameGraph の方が扱いやすい。
- FrameGraph には texture handle / task / graph build の概念があり、diagnostics と stack 表示に寄せやすい。
- MMD_modoki v0.2 では MMD 編集導線と FrameGraph 安定化を優先し、古い PostProcess 経路の拡張は避けたい。

## 現状の RT 感

コード上の検索ベースでは、FrameGraph post effects 有効時の論理 RenderTarget / texture handle は 30 枚前後になる可能性がある。

目安:

```text
FrameGraph backend 基本
  scene color capture RT: 1
  depth renderer depth map: 1
  image processing output: 1
  geometry depth + geometry MRT(normal/depth/reflectivity): 4
  SSR: 1 から 3 程度
  SSAO2: 4
  SSAO toon composite: 1
  DoF: Low 4 / Medium 6 / High 8
  Bloom: 4
  LUT: 1
  Color correction: 1
  Sharpen: 1
  Grain: 1
  Chromatic aberration: 1
  Vignette / edge blur: 1
  Lens distortion: 1
  FXAA: 1
```

注意:

- これは論理 RT / graph texture handle の目安であり、実 GPU texture allocation 枚数とは一致しない。
- Babylon FrameGraph は texture alias / reuse を行えるため、物理メモリ消費は別途 diagnostics で確認する必要がある。
- ShadowMap、MirrorTexture、GlowLayer、GI、export capture は別枠。
- LuminousGlow が有効な場合、GlowLayer 側で main / blur RT が追加される。
- WebM / PNG export 中は capture 用 RT が一時的に増える。

結論:

- 3DCG / PostFX として 30 枚級の論理 RT は異常ではない。
- ただし MMD_modoki として無駄がないとは限らない。
- 特に depth / geometry 系の重複は調査価値が高い。

## 問題意識

複数 effect が似たリソースを要求する。

例:

```text
DoF
  depth

SSAO
  depth
  normal

SSR
  depth
  normal
  reflectivity

Toon contact AO
  depth

Depth-aware glow
  depth

FrameGraph post effects
  scene color
```

各 effect が個別に depth renderer や geometry renderer を作ると、次の問題が出る。

- RenderTarget が増えやすい。
- format / size / sample count が揃わず、FrameGraph の texture reuse が効きにくい。
- diagnostics で「何のための texture か」が見えにくい。
- custom layer を追加すると、さらに resource lifetime が追いにくくなる。
- Classic backend と FrameGraph backend の分岐が UI に漏れる。

## Render Resource Registry 案

FrameGraph 側に、共通レンダーリソースを管理する registry を置く。

仮称:

```text
FrameGraphResourceRegistry
```

扱う候補:

```text
external / imported
  sceneColor
  cameraDepth

generated in graph
  geometryDepth
  normal
  reflectivity

future
  motionVector
  objectId
  materialId
  customLayerOutput
```

基本の考え方:

```text
effect declares needs
  -> registry builds shared plan
  -> registry provides FrameGraphTextureHandle
  -> effect task consumes handles
```

避けたい形:

```text
SSAO creates depth / normal
SSR creates depth / normal / reflectivity
DoF creates another depth
Toon AO creates another depth
custom layer creates hidden RTs without diagnostics
```

目指す形:

```text
FrameGraphResourceRegistry
  sceneColor: imported
  cameraDepth: imported or generated
  geometryDepth: shared
  normal: shared
  reflectivity: shared

Consumers
  DoF -> cameraDepth
  SSAO -> geometryDepth + normal
  SSR -> geometryDepth + normal + reflectivity
  Toon contact AO -> depth
  Depth-aware glow -> depth
```

## Shared Frame Resources v1

v0.2.0 では実装対象にしないが、v0.2.n のどこかで Shared Frame Resources v1 を検討する。

最初に共有設計したい resource:

```text
Shared Frame Resources v1
  sceneColor
  depth
  normal
  reflectivity
```

この 4 種があれば、多くの PostFX / MME 的な用途に耐えやすい。

対応しやすくなる用途:

- SSAO
- SSR
- DoF
- depth fog
- depth-aware blur
- edge detect
- toon AO
- outline composite
- screen-space shadow
- custom color grading with depth

将来候補:

```text
future shared resources
  linearDepth
  viewDepth
  motionVector
  objectId
  materialId
  toonShadow
  lightFactor
  edgeMask
  selectedObjectMask
  selectedMaterialMask
```

ただし、最初から全部を用意しない。v0.2.n で扱うなら、まず `sceneColor` / `depth` / `normal` / `reflectivity` の 4 種に限定する。

重要な設計点:

- `depth` は raw depth か linear depth か。
- `normal` は view space か world space か。
- `sceneColor` は linear color か display / gamma space か。
- `reflectivity` は Babylon geometry renderer の reflectivity をそのまま使うか、MMD_modoki 用に意味を定義するか。
- transparent object を depth / normal に含めるか。
- MSAA resolve 済み texture として扱うか。
- full resolution 固定か、half / quarter resolution を許すか。

v1 では変換や複数表現を増やしすぎず、提供形式を固定し、Diagnostics で明示する方がよい。

例:

```text
Shared Resource Contract v1
  sceneColor: previous post color, full resolution
  depth: camera depth convention, full resolution
  normal: geometry renderer normal, full resolution
  reflectivity: geometry renderer reflectivity, full resolution
```

custom post effect manifest では、最初はこの固定 contract を参照する。

例:

```json
{
  "requires": {
    "color": "previousColor",
    "depth": "depth",
    "normal": "normal"
  }
}
```

後続で必要になったら、`linearDepth` や `viewNormal` のような変換済み resource を registry が生成する。

## FrameGraph Session の考え方

Shared Resources を活かすには、built-in PostFX と custom PostFX が同じ FrameGraph 実行単位に乗る必要がある。

避けたい形:

```text
Built-in FrameGraph
  sceneColor / depth / normal

Custom FrameGraph
  another sceneColor / another depth / another normal
```

目指す形:

```text
MMD_modoki FrameGraph Session
  Resource Registry
  Built-in PostFX Stack
  Custom PostFX Stack
  Output
```

この形なら、custom block は registry が提供する `sceneColor` / `depth` / `normal` / `reflectivity` を参照できる。

v0.2.0 では、ここまで実装しない。v0.2.0 では設計メモと現状棚卸しに留め、v0.2.n の改善候補として扱う。

## API イメージ

まだ実装案であり、確定ではない。

```ts
type FrameGraphResourceKey =
    | "sceneColor"
    | "cameraDepth"
    | "geometryDepth"
    | "normal"
    | "reflectivity"
    | "motionVector"
    | "objectId"
    | "materialId";

type FrameGraphResourceConsumer = {
    id: string;
    reason: string;
};

type FrameGraphResourceDiagnostic = {
    key: FrameGraphResourceKey;
    status: "imported" | "generated" | "unused";
    size: { width: number; height: number } | null;
    format: string;
    consumers: string[];
};

type FrameGraphResourceRegistry = {
    require(key: FrameGraphResourceKey, consumer: FrameGraphResourceConsumer): FrameGraphTextureHandle;
    has(key: FrameGraphResourceKey): boolean;
    getDiagnostics(): FrameGraphResourceDiagnostic[];
};
```

実装上は、`require()` の呼び出し順で task をその場生成するより、最初に required resources を集めて plan を作る方が安全かもしれない。

候補:

```text
collect requirements
  -> build shared resource plan
  -> create/import handles
  -> wire effect tasks
  -> expose diagnostics
```

## FrameGraph stack / block UI との関係

FrameGraph UI は、通常の PostFX slider 群と混ぜすぎない。

将来の表示案:

```text
Frame Graph
  Shared Buffers
    Scene Color: imported, 1920x1080
    Depth: imported/generated, 1920x1080
    Normal: generated, 1920x1080
    Reflectivity: generated, 1920x1080

  Stack
    [Scene Color Capture]
    [Image Processing]
    [Geometry Buffers]
    [SSAO]
    [SSR]
    [DoF]
    [Bloom]
    [LUT]
    [Color Correction]
    [FXAA]
    [Output]
```

まずは編集可能な node editor ではなく、diagnostics / 可視化から始める。

段階:

1. 現在の FrameGraph 構成を stack / block として表示する。
2. Shared Buffers と consumer を表示する。
3. 各 block の enabled / disabled と主要設定を表示する。
4. custom block / pass 編集は後続 PoC にする。

Babylon.js 公式の Node Render Graph Editor / NRGE が参考になる可能性があるため、custom UI を本格実装する前に公式導線を調査する。

## Custom Post Effect の受付方針

ユーザーカスタムの Post Effect は、WGSL shader 単体では受け付けない方針にする。

理由:

- Post Effect は render pipeline の途中に割り込むため、入力 / 出力 / stage / resource 要求 / color space / depth の扱いを明示する必要がある。
- WGSL fragment だけでは、どの texture を読み、どこへ出力し、どの順序で実行するかが決まらない。
- depth / normal / reflectivity / sceneColor などの shared resources を安全に渡すには contract が必要。
- 将来 Babylon.js 公式の Node Render Graph / FrameGraph 形式へ寄せる余地を残したい。

したがって、custom post effect は FrameGraph contract を満たすものだけを受け付ける。

基本方針:

```text
Custom Material Shader
  WGSL shader を受け付ける。
  対象は model / accessory material。

Custom Post Effect
  FrameGraph block / task として受け付ける。
  manifest または公式 graph metadata を必須にする。
  resource requirements / insertion stage / uniforms を宣言する。
```

### 直列 stack subset

フルの node graph editor を v0.2 / v0.3 初期から実装しない。最初は、Post Effect を直列 stack として扱う。

UI イメージ:

```text
Post Effect Stack
  [Built-in: Image Processing]
  [Built-in: Bloom]
  [Custom: Soft Vignette]
  [Built-in: FXAA]
  [Output]
```

ユーザーに許可する操作:

- block を catalog から追加する。
- block を削除する。
- block を有効 / 無効にする。
- block を上 / 下へ移動する。
- block parameter を編集する。
- block を reset する。
- stack preset として保存する。

最初は許可しない操作:

- 任意の node wiring。
- branch / merge。
- custom MRT。
- geometry pass。
- compute pass。
- history texture。
- ping-pong multipass。
- graph-level free layout。

直列 stack では、各 block は次の contract に制限する。

```text
previous color
  -> block
  -> next color
```

入力候補:

- previous color
- optional depth
- optional normal
- optional reflectivity

出力:

- next color

最初の custom post effect 受付範囲:

- fullscreen pass。
- color in -> color out。
- optional depth。
- fixed insertion stage。
- single pass。
- same resolution。
- scalar / vector / color uniform。

後回し:

- arbitrary graph editing。
- custom render target allocation。
- multi pass blur。
- half / quarter resolution chain。
- previous frame history。
- object / material selection pass。

### Babylon.js 公式形式への寄せ方

可能なら、内部形式は Babylon.js 公式の Node Render Graph / FrameGraph に寄せる。

ただし MMD_modoki の UI では、公式 graph の自由な node editor をそのまま出すのではなく、直列 stack subset として編集させる。

方針:

```text
Internal
  Babylon.js official Node Render Graph / FrameGraph block

MMD_modoki UI
  Linear stack subset
  move up / down only
  enable / disable
  parameter editing
```

期待する利点:

- 完全独自仕様を避けられる。
- 将来 NRGE / Node Render Graph import へ寄せやすい。
- UI は MMD_modoki 向けに単純化できる。
- 複雑な graph は advanced / read-only diagnostics として扱える。

調査したいこと:

- Babylon.js 公式の Node Render Graph / NRGE の保存形式。
- block parameter metadata を取得できるか。
- block の input / output type を runtime で確認できるか。
- 公式 block から UI control を自動生成できるか。
- 公式 graph のうち linear subset を判定できるか。
- MMD_modoki の Effect stack から公式 graph へ変換できるか。

### MMD_modoki wrapper metadata

Babylon.js 公式 graph / block に寄せる場合でも、MMD_modoki 側の統合情報は別途必要になる可能性が高い。

候補:

```text
modoki effect wrapper
  display name
  i18n key
  category
  allowed stage
  default enabled
  project-relative asset path
  safe resource permissions
  UI min / max / step
```

ファイル構成案:

```text
custom-effect/
  graph.json
  modoki.json
  shaders/
    effect.wgsl
```

`graph.json` は Babylon.js 公式形式またはそれに近い形式、`modoki.json` は MMD_modoki 固有の UI / project integration 情報にする。

複雑な graph の扱い:

- linear subset として解釈できる場合は、MMD_modoki の stack UI で編集可能にする。
- branch / merge / custom RT を含む場合は、最初は read-only diagnostics または advanced 扱いにする。
- 公式 editor で編集する導線があるなら、MMD_modoki 内では実行とパラメータ編集だけを担当する。

## M4Layer / Shader Layer 後続構想

M4Layer 的な「shader 用 RT / layer を増やす仕組み」は、v0.2 初期の本筋から外す。

ただし、将来構想としては FrameGraphResourceRegistry と近い。

候補概念:

```text
Shader Layer / Render Target Layer
  layer name
  target objects: model / accessory / material group
  render target size
  pass order
  shader preset / custom WGSL
  blend / composite mode
  input textures
  output texture
```

注意点:

- RenderTarget lifetime 管理
- WebGPU texture / bind group / sampler 管理
- FrameGraph pass 順序との整合
- model / accessory の draw group 分離
- project 保存形式
- custom shader validation
- preview / diagnostics UI
- export 時の同一結果保証
- performance / memory usage 表示

方針:

- v0.2 では Shader / Material section の整理と accessory shader assignment を優先する。
- FrameGraph は stack / block 表示と diagnostics までを候補にする。
- custom RT / Shader Layer は v0.3 以降または別 PoC として扱う。

## 実装ステップ案

### Step 1: 棚卸し

現状の resource 生成箇所を記録する。

対象:

- scene color capture RT
- depth renderer depth map
- geometry renderer task outputs
- SSAO / SSR / DoF / Bloom temporary textures
- GlowLayer textures
- ShadowMap
- MirrorTexture
- GI / RSM
- export capture RT

記録する情報:

- 作成箇所
- backend
- size
- format
- sample count
- lifetime
- consumer
- disabled 時の扱い

### Step 2: FrameGraph resource plan を作る

FrameGraph post effects controller 内で必要な shared resource を明示する。

最初の対象:

- sceneColor
- cameraDepth
- geometryDepth
- normal
- reflectivity

### Step 3: Diagnostics を追加する

UI 実装前に、console / runtime diagnostics でよいので resource 情報を出す。

出したい情報:

- logical resource count
- shared buffer list
- consumer list
- approximate size
- backend

### Step 4: Registry 実装 PoC

FrameGraph post effects controller 内の geometry renderer task を registry 管理へ寄せる。

最初は大きく外へ出しすぎず、FrameGraph backend 内部の小さな helper でもよい。

### Step 5: Effect / FrameGraph UI へ接続

Effect panel の `Frame Graph` section に diagnostics を表示する。

表示候補:

- Shared Buffers
- Stack / Blocks
- Enabled tasks
- Disabled tasks
- Estimated RT footprint

## 未決事項

- `cameraDepth` と `geometryDepth` を統合できるか。
- DoF が参照する depth と SSAO / SSR が参照する depth を同じにできるか。
- geometry renderer task は常時作るか、SSAO / SSR が必要なときだけ作るか。
- disabled task の texture handle がどこまで物理 allocation につながるか。
- FrameGraph texture alias / reuse の実測方法。
- diagnostics を runtime log に出すか、Effect panel に出すか。
- Babylon.js NRGE を参考にするか、MMD_modoki 独自 stack UI にするか。
- Node Render Graph / NRGE の公式保存形式を MMD_modoki で受けられるか。
- 公式 graph から linear stack subset を判定できるか。
- custom post effect の初期 insertion stage をどこに限定するか。
- block parameter UI を公式 metadata から自動生成できるか。
- custom Shader Layer を project 保存形式にどう入れるか。

## 現時点の判断

- v0.2 の新設計は FrameGraph backend を主対象にする。
- Classic PostProcess は fallback / 比較検証用として扱い、新規 UI 設計の主対象にしない。
- Render Resource Registry は必要。特に depth / normal / reflectivity / scene color の共有と diagnostics のために価値が高い。
- Shared Frame Resources v1 は v0.2.0 では実装しない。v0.2.n のどこかで `sceneColor` / `depth` / `normal` / `reflectivity` から検討する。
- custom post effect は WGSL 単体ではなく、FrameGraph contract を満たす block / task として受け付ける。
- 内部形式は Babylon.js 公式 Node Render Graph / FrameGraph へ寄せる方向で調査する。
- MMD_modoki UI では、最初は直列 stack subset として扱い、block の上下移動と parameter editing に限定する。
- custom RT / M4Layer 的な拡張は、registry と diagnostics の後に検討する。
- まずは実装より、現状棚卸しと resource plan の文書化から始める。
