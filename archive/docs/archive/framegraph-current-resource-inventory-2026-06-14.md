# FrameGraph 現行リソース棚卸し 2026-06-14

## 目的

FrameGraph 効果スタックの整理が進んだため、現行実装で各効果がどの入力テクスチャ、深度、geometry buffer、専用マスクを使っているかを棚卸しする。

このメモは、後続の `FrameGraphResourceRegistry` / `FrameGraphResourcePlan` 実装前の現状把握として扱う。

関連メモ:

- [frame-graph-resource-registry-note-2026-05-30.md](./frame-graph-resource-registry-note-2026-05-30.md)
- [frame-graph-post-effects-progress-2026-04-28.md](./frame-graph-post-effects-progress-2026-04-28.md)
- [luminous-frame-graph-redesign-plan-2026-06-13.md](./luminous-frame-graph-redesign-plan-2026-06-13.md)
- [framegraph-blur-quality-guidelines-2026-06-14.md](./framegraph-blur-quality-guidelines-2026-06-14.md)

## 現行の大枠

現行の FrameGraph post effects は `src/render/frame-graph-post-effects-controller.ts` の `FrameGraphPostEffectsController.activate()` で構築される。

主要なリソース系統は次の 4 つ。

| 系統 | 生成元 | 主な用途 | 備考 |
|---|---|---|---|
| Scene Color | `MmdManager.createFrameGraphPostEffectsSceneColorTarget()` | 全 post effect のベース入力 | editor の通常描画結果を RT 化して FrameGraph に import する |
| DepthRenderer Depth | `MmdManager.configureDofDepthRenderer()` 経由の `DepthRenderer.getDepthMap()` | DoF | FrameGraph 外で生成して import する |
| Geometry Buffer | `FrameGraphGeometryRendererTask` | SSR / SSAO | normal / view depth / reflectivity をまとめて作る |
| Luminous Mask | `MmdManager.createFrameGraphPostEffectsLuminousMaskTarget()` | Luminous | AutoLuminous 対象材質だけを専用 RT に描く |

## 効果スタックの対象 ID

UI の効果スタックで扱う ID は `src/shared/frame-graph-post-effect-stack.ts` に定義されている。

```text
ssr
ssao
dof
luminous
bloom
lut
sharpen
grain
chromatic
vignette
edgeBlur
distortion
```

`FXAA` と `ImageProcessing` と最終 backbuffer copy は内部固定タスクであり、現在の UI スタックの並べ替え対象ではない。

## 効果別リソース一覧

| 効果 / Task | 入力 | 追加で参照するリソース | 生成 / 出力 | 共有化候補 | 注意点 |
|---|---|---|---|---|---|
| ImageProcessing | Scene Color | なし | image-processed color | sceneColor | tone mapping / exposure / color curves 系の前段。現状は必要時のみ有効 |
| SSR | 現在の color | geometry view depth, geometry view normal, geometry reflectivity, camera | SSR 合成後 color | geometry depth / normal / reflectivity | SSR が有効なとき geometry pass が必要。reflectivity の意味付けは MMD 材質向けに整理余地あり |
| SSAO | 現在の color | geometry view depth, geometry view normal, camera | SSAO 結果 color | geometry depth / normal | SSR と同じ geometry pass を使う。後段で Toon composite を挟む |
| SSAO Toon Composite | SSAO color | original color | MMD 向けに馴染ませた color | なし | `originalTexture` を追加依存として持つため、単純な直列 post より依存が多い |
| DoF | 現在の color | DepthRenderer depth, camera | DoF 後 color | depth | geometry pass の depth ではなく外部 DepthRenderer の depth を import している |
| Luminous Extract | Luminous Mask | なし | threshold 済み luminous mask | luminousMask | luminous 無効時でも task 自体は作られ、disabled で止まる |
| Luminous Core Blur X/Y | Luminous Extract 出力 | なし | 狭い発光 blur | blur intermediate | Babylon `ThinBlurPostProcess` を使う。kernel は radius から段階的に選ぶ |
| Luminous Halo Blur X/Y | Luminous Extract 出力 | なし | 広い発光 blur | blur intermediate | core と halo の 2 系統 blur。4 pass 増えるが品質優先 |
| Luminous Composite | 現在の color | core blur, halo blur | 発光合成後 color | luminousMask / blur intermediate | glare 設定値は保存されるが、現行 composite 内 glare はモアレ回避のため無効 |
| Bloom | 現在の color | なし | bloom 合成後 color | なし | Babylon 公式 `FrameGraphBloomTask` |
| LUT | 現在の color | RawTexture LUT atlas | LUT 適用後 color | LUT texture | LUT source 変更時に atlas texture を更新 |
| Color Correction | 現在の color | なし | contrast / gamma 後 color | なし | UI スタック対象外の内部固定 task |
| Sharpen | 現在の color | なし | sharpen 後 color | なし | Babylon 公式 `FrameGraphSharpenTask` |
| Grain | 現在の color | なし | grain 後 color | なし | Babylon 公式 `FrameGraphGrainTask` |
| Chromatic Aberration | 現在の color | なし | chromatic 後 color | なし | Babylon 公式 `FrameGraphChromaticAberrationTask` |
| Vignette / EdgeBlur | 現在の color | texelSize, aspectRatio | vignette / edge blur 後 color | なし | 2 つの UI 項目が 1 task を共有する |
| Lens Distortion | 現在の color | なし | distortion 後 color | なし | UV 変形のみ |
| FXAA | 現在の color | なし | anti-aliased color | なし | UI スタック対象外。最終出力直前に固定接続 |
| Output | 現在の color | backbuffer | backbuffer copy | なし | `FrameGraphCopyToBackbufferColorTask` |

## 現行の生成条件

### Scene Color

FrameGraph backend 有効時に `frameGraphPostEffectsSceneColor` RT を作成し、FrameGraph へ import する。

現行では `renderList = null` / `getCustomRenderList = null` にして、通常の active mesh 評価と WebGPU MMD material の light binding を壊しにくくしている。

### DepthRenderer Depth

DoF 用 depth は `DepthRenderer.getDepthMap().getInternalTexture()` を FrameGraph に import する。

`FrameGraphGeometryRendererTask` の view depth とは別系統で、現時点では共有されていない。

### Geometry Buffer

`SSR` または `SSAO` が有効な場合にだけ `FrameGraphGeometryRendererTask` を作る。

出力:

- `geometryViewDepthTexture`
- `geometryViewNormalTexture`
- `geometryReflectivityTexture`

depth attachment は `FrameGraphClearTextureTask` で clear した `frameGraphPostEffectsGeometryDepth` を接続している。

過去に depth attachment なしの geometry pass で WebGPU pipeline 警告や黒画面が出たため、ここは現行の重要な安定化ポイント。

### Luminous Mask

`frameGraphPostEffectsLuminousMask` RT を FrameGraph 外で作成し、AutoLuminous 対象材質だけを専用 material で描いて FrameGraph に import する。

Scene Color とは別にモデルをもう一度描くため、Luminous 有効時の負荷は「mask pass + extract + blur 4 pass + composite」として見る必要がある。

## 現行の処理順

初期構築時には各 task を作るための仮接続があるが、実際の post stack は `connectPostEffectOrder()` で UI の並べ替え順に再接続される。

概念的には次の形。

```text
Scene Color
  -> ImageProcessing
  -> user stack:
       SSR?
       SSAO?
       DoF?
       Luminous?
       Bloom?
       LUT?
       Sharpen?
       Grain?
       Chromatic?
       Vignette / EdgeBlur?
       Distortion?
  -> FXAA
  -> Backbuffer
```

ただし、`Luminous Extract / Blur` は composite のための横枝であり、UI 順にかかわらず Luminous 用の mask から生成される。

```text
Luminous Mask
  -> Extract
  -> Core Blur X -> Core Blur Y
  -> Halo Blur X -> Halo Blur Y
  -> Luminous Composite
```

## 重複しやすい箇所

### Depth が 2 系統ある

現行では DoF が `DepthRenderer depth`、SSAO / SSR が `GeometryRenderer view depth` を使う。

同じ「深度」と呼んでも、期待する空間、形式、透明物の扱い、camera との整合が違う可能性があるため、単純統合は危険。

まずは ResourceRegistry で次のように別名管理するのが安全。

```text
depthScene
  DoF 用。既存 DepthRenderer 由来。

depthView
  SSAO / SSR 用。GeometryRenderer 由来。
```

後で互換性を確認できたら統合候補にする。

### Geometry pass は SSR / SSAO 共通

SSR と SSAO は現在も 1 つの `FrameGraphGeometryRendererTask` を共有している。

ここは ResourceRegistry 化しやすい。

```text
require("viewDepth")
require("viewNormal")
require("reflectivity")
  -> geometry renderer plan を 1 回だけ作る
```

### Luminous は shared brightness ではない

Luminous は画面の明るいピクセル抽出ではなく、AutoLuminous 対象材質を専用 mask に描く方式。

そのため `Scene Color` から作る汎用 bright pass と同一視しない。

将来 Bloom や Lens flare と共有するなら、`luminousMask` と `brightExtract` を別リソースとして扱う。

### Vignette と EdgeBlur は同じ task

UI では別 ID だが、現行実装では `FrameGraphPostEffectsVignetteEdgeBlurTask` を共有する。

並べ替え時は `vignette` と `edgeBlur` のどちらか一方が最初に現れた位置で task を接続し、2 回目は無視される。

これは UI 上の直感と少しズレる可能性があるため、将来は次のどちらかを選ぶ。

- UI でも 1 項目にまとめる
- task を分割して順序指定を厳密にする

## ResourceRegistry v1 の候補

最初の実装対象は次の程度に絞るのがよい。

| Resource key | 現行の生成元 | 消費者 | v1 方針 |
|---|---|---|---|
| `sceneColor` | Scene Color RT import | 全 post stack | 既存 import を registry 管理へ移す |
| `depthScene` | DepthRenderer import | DoF | まずは DoF 専用として扱う |
| `viewDepth` | GeometryRenderer | SSAO / SSR | `viewNormal` と一緒に geometry plan で生成 |
| `viewNormal` | GeometryRenderer | SSAO / SSR | `viewDepth` と同時生成 |
| `reflectivity` | GeometryRenderer | SSR | SSR 有効時だけ要求 |
| `luminousMask` | Luminous Mask RT import | Luminous Extract | 汎用 bright pass とは分ける |

v1 では blur intermediate や LUT texture までは registry 管理しなくてよい。これらは各効果内の private resource として扱う方が単純。

## 診断で見たい情報

性能調査に入る前に、次を runtime diagnostics または debug log で見られるとよい。

- FrameGraph backend active / ready
- UI stack order
- active effects
- shared resource requirements
- created render targets
- render target size
- geometry pass が必要になった理由
- depthScene と viewDepth の両方が存在するか
- luminous mask の描画 submesh 数
- Luminous blur kernel
- FrameGraph build 回数
- backend 再初期化回数

## 次の実装案

### Phase 1: 棚卸しをコード化しない軽量診断

まずは現行構造を壊さず、`FrameGraphPostEffectsController.activate()` で resource plan 相当の debug object を作る。

```ts
type FrameGraphResourceRequirement = {
    key: "sceneColor" | "depthScene" | "viewDepth" | "viewNormal" | "reflectivity" | "luminousMask";
    consumers: string[];
    producer: string;
};
```

最初はログ用でよい。

### Phase 2: GeometryRenderer の plan 化

`isGeometryRendererNeeded()` を、SSR / SSAO の boolean 判定から resource requirement に置き換える。

```text
SSR  -> viewDepth, viewNormal, reflectivity
SSAO -> viewDepth, viewNormal
```

この段階では出力や見た目を変えない。

### Phase 3: Depth の命名分離

DoF の depth を `depthScene`、SSAO / SSR の depth を `viewDepth` として明示する。

統合するかどうかは、透明材質、outline、MMD model、stage、4K 出力で見た目比較してから判断する。

### Phase 4: 診断 UI / ログ

効果欄または debug log で、現在の FrameGraph が何を生成しているか見えるようにする。

この段階でようやく、実際の重さと品質プリセットを決めやすくなる。

## 結論

現行 FrameGraph はすでに SSR / SSAO の geometry buffer を共有しているが、DoF depth、Luminous mask、Scene Color は別系統で管理されている。

次にやるべきことは、いきなり RT を統合することではなく、まず `sceneColor` / `depthScene` / `viewDepth` / `viewNormal` / `reflectivity` / `luminousMask` を明示的な resource key として扱い、どの効果が何を要求しているかを診断可能にすること。

そのうえで、重複生成しているもの、品質設定で downsample できるもの、統合すると危ないものを分けて最適化するのが安全。
