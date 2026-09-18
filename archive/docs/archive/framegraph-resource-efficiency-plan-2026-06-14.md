# FrameGraph リソース効率化実装案 2026-06-14

## 目的

現行の FrameGraph post effects は、効果スタック、Luminous、SSAO、SSR、DoF が実用ラインに近づいてきた一方で、Scene Color RT、DepthRenderer depth、GeometryRenderer buffer、Luminous mask などの生成経路が分散している。

このメモでは、[framegraph-current-resource-inventory-2026-06-14.md](./framegraph-current-resource-inventory-2026-06-14.md) の棚卸しを踏まえて、v0.2 系で安全に進められる効率化実装案を整理する。

## 結論

最初にやるべき効率化は、個別 render target をすぐ統合することではない。

まず、FrameGraph 起動時に「どの効果がどの共有リソースを必要としているか」を `FrameGraphResourcePlan` として明示する。

そのうえで、

- geometry pass を必要時だけ 1 回作る
- depth の種類を混同しない
- Luminous mask を汎用 bright pass と混ぜない
- render target の個数、サイズ、生成理由を診断できるようにする

という順で進めるのが安全。

## 現行の前提

現行実装では、主な共有リソースは次のように分かれている。

| Resource | 現行の生成元 | 主な消費者 | 統合可否 |
|---|---|---|---|
| `sceneColor` | `RenderTargetTexture` import | 全 post effects | registry 化しやすい |
| `depthScene` | Babylon `DepthRenderer` | DoF | まずは DoF 専用扱い |
| `viewDepth` | `FrameGraphGeometryRendererTask` | SSAO / SSR | `viewNormal` と共有 plan 化 |
| `viewNormal` | `FrameGraphGeometryRendererTask` | SSAO / SSR | `viewDepth` と共有 plan 化 |
| `reflectivity` | `FrameGraphGeometryRendererTask` | SSR | SSR 有効時のみ要求 |
| `luminousMask` | Luminous 専用 RT | Luminous | 汎用 bright extract と分離 |

注意点:

- DoF が使う depth と SSAO / SSR が使う view depth は、同じものとして扱わない。
- Luminous は AutoLuminous 対象材質を描く専用 mask であり、画面輝度抽出ではない。
- Vignette と EdgeBlur は UI ID が分かれているが、実 task は共通。
- FXAA / ImageProcessing / Output は UI スタックの外側にある固定 task。

## 実装方針

### 方針 A: ResourcePlan を先に作る

`FrameGraphPostEffectsController.activate()` の冒頭で、settings と effectOrder から必要リソースを集計する。

```ts
type FrameGraphSharedResourceKey =
    | "sceneColor"
    | "depthScene"
    | "viewDepth"
    | "viewNormal"
    | "reflectivity"
    | "luminousMask";

type FrameGraphResourceRequirement = {
    key: FrameGraphSharedResourceKey;
    consumers: FrameGraphPostEffectId[];
    producer: string;
    resolution: "full";
};

type FrameGraphResourcePlan = {
    requirements: FrameGraphResourceRequirement[];
    needsGeometryRenderer: boolean;
    needsDepthRenderer: boolean;
    needsLuminousMask: boolean;
};
```

最初は実際の生成処理を大きく変えず、plan を作って diagnostics / debug log に出すだけでよい。

### 方針 B: Resource key は少し冗長にする

`depth` という単一名にまとめない。

```text
depthScene
  DoF 用。DepthRenderer 由来。

viewDepth
  SSAO / SSR 用。GeometryRenderer 由来。
```

将来的に統合できるかもしれないが、MMD モデル、透過、輪郭線、ステージ、4K 出力で見た目比較するまでは別物として扱う。

### 方針 C: Shared と private を分ける

ResourceRegistry v1 では、次のものだけ共有管理する。

```text
shared:
  sceneColor
  depthScene
  viewDepth
  viewNormal
  reflectivity
  luminousMask

private:
  luminous extract
  luminous core blur
  luminous halo blur
  bloom internal
  LUT atlas texture
  SSAO internal blur
  FXAA output
```

blur intermediate まで registry に入れると設計が重くなるため、まずは各効果の private resource として扱う。

## Phase 1: 診断だけ追加

目的:

現行挙動を変えず、どの効果が何を要求しているか見えるようにする。

実装候補:

- `buildFrameGraphResourcePlan(settings, effectOrder)` helper を追加
- unit test を追加
- `activate()` 時に plan を生成
- `onInfo` または debug log に plan summary を出す

出したい情報:

```text
effects:
  luminous, bloom, lut

resources:
  sceneColor -> all
  luminousMask -> luminous

passes:
  geometryRenderer: no
  depthRenderer: no
  luminousMask: yes
```

効果:

- いま何が重いかの見当がつきやすくなる
- 将来の UI 診断欄にそのまま使える
- 挙動変更がほぼないので安全

## Phase 2: GeometryRenderer 判定を ResourcePlan 化

現行の `isGeometryRendererNeeded(settings)` を、ResourcePlan の結果に寄せる。

現行:

```text
SSR enabled or SSAO enabled
  -> create GeometryRenderer
```

変更後:

```text
ResourcePlan requires viewDepth/viewNormal/reflectivity
  -> create GeometryRenderer
```

消費者:

| 効果 | 要求 |
|---|---|
| SSR | `viewDepth`, `viewNormal`, `reflectivity` |
| SSAO | `viewDepth`, `viewNormal` |

この段階では生成される task と見た目は変えない。

## Phase 3: DepthRenderer の要求を明示する

DoF 有効時にだけ `depthScene` を要求する。

```text
DoF enabled
  -> require depthScene
  -> import DepthRenderer.getDepthMap()
```

注意:

- すぐに GeometryRenderer depth へ置き換えない。
- `depthScene` が必要ない場合に DepthRenderer を維持しているかは別途確認する。
- Classic backend と FrameGraph backend の DoF depth renderer lifetime が混ざらないようにする。

## Phase 4: LuminousMask の要求を明示する

Luminous 有効時にだけ `luminousMask` を要求する。

現行では FrameGraph backend 有効時に Luminous mask RT を作るため、Luminous 無効でも RT が存在する可能性がある。

効率化案:

```text
Luminous disabled
  -> luminousMask RT を作らない

Luminous enabled
  -> luminousMask RT を作る
  -> extract / blur / composite を有効化
```

ただし、UI の ON/OFF 切替で RT の再生成が発生する。

v0.2 では次のどちらかを選ぶ。

| 案 | 内容 | メリット | リスク |
|---|---|---|---|
| A | backend 初期化時に Luminous 無効なら mask RT を作らない | 軽い | ON 時に再初期化が必要 |
| B | FrameGraph backend 中は mask RT を保持する | 切替が安定 | 無効時も少し重い |

まずは A ではなく、B のまま diagnostics を入れる方が安全。Luminous は描画品質調整が続いているため、RT lifetime を同時に触ると切り分けが難しい。

## Phase 5: 品質プリセット

ResourcePlan が見えるようになった後で、品質プリセットを入れる。

候補:

| Preset | 方針 |
|---|---|
| Low | Luminous halo kernel 小さめ、SSAO low scale、SSR off 推奨 |
| Medium | Luminous 標準、SSAO / SSR は必要時のみ |
| High | Luminous 大 radius、SSAO 高品質、SSR full |
| Render | 4K 出力向け。品質優先、警告付き |

最初から解像度 downsample を積極的に入れない。

理由:

- Luminous で低品質 blur のモアレを経験済み
- MMD ユーザーは高解像度動画出力で粗が見えやすい
- downsample は品質プリセットとして明示した方がよい

## Phase 6: FrameGraph rebuild を減らす

効果順序、ON/OFF、Luminous radius、DoF quality などで、毎回 full rebuild が必要かを分ける。

分類候補:

| 変更 | rebuild 必要性 |
|---|---|
| slider 値 | 原則不要。uniform / postprocess property 更新 |
| effect enabled | 既存 task があるなら不要。disabled 切替 |
| effect order | task 再接続は必要。FrameGraph rebuild が必要か要確認 |
| DoF blur quality | task 作成時パラメータなら rebuild 候補 |
| Luminous blur kernel | ThinBlurPostProcess property 更新で済むなら rebuild 不要 |
| backend 切替 | rebuild 必須 |
| Luminous mask RT 有無 | rebuild または backend 再初期化候補 |

現行の体感速度を上げるなら、RT 削減より先に「rebuild が走る操作」を減らす方が効く可能性がある。

## 優先順位

### 最優先

1. ResourcePlan helper + unit test
2. ResourcePlan diagnostics
3. GeometryRenderer 判定の plan 化

ここまでは見た目を変えずに進められる。

### 次点

4. DepthRenderer の要求明示
5. LuminousMask の要求明示
6. FrameGraph rebuild 条件の棚卸し

### 後回し

7. DoF depth と geometry depth の統合
8. Luminous mask の lazy creation
9. downsample / half-res / quarter-res の導入
10. custom shader 向け external resource permission

## 実装時の注意

- `sceneColor` RT の `renderList = null` / `getCustomRenderList = null` は維持する。
- GeometryRenderer の depth attachment 接続は変更しない。
- DoF と SSAO / SSR の depth を同一視しない。
- Luminous は luminousMask 起点であり、sceneColor の bright extract ではない。
- UI stack の順序変更と resource requirement は別概念として扱う。
- まず pure helper と unit test を作り、runtime controller の変更を小さくする。

## 最初の実装単位

最小の安全な PR / commit 単位は次。

```text
1. src/render/frame-graph-resource-plan.ts を追加
2. buildFrameGraphResourcePlan(settings, effectOrder) を実装
3. unit test を追加
4. FrameGraphPostEffectsController.activate() で plan を作る
5. debug log / onInfo に summary を出す
6. 既存の task 生成挙動は変えない
```

この単位なら、性能改善そのものはまだ小さいが、次の効率化で何を削れるかを安全に見える化できる。

## まとめ

FrameGraph 効率化は、最初から render target を削るより、まず resource requirement を明示して診断可能にするのがよい。

現行で共有しやすいのは SSR / SSAO の geometry buffer。注意して扱うべきなのは DoF depth と Luminous mask。

v0.2 では `ResourcePlan -> diagnostics -> geometry plan 化 -> depth / luminous mask の lifetime 見直し` の順に進めるのが、描画品質と安定性を壊しにくい。
