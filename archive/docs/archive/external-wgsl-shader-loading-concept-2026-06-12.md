# 外部 WGSL シェーダー読み込み構想メモ 2026-06-12

## 目的

MMD_modoki で外部 WGSL シェーダーをどこまで開放するか、また安全に開放するならどのような段階設計にするかを整理する。

背景として、MMD には MME による自由度の高いエフェクト文化がある。Ray-MMD 的な PBR 寄り表現、ガラスや水面の屈折、熱ゆらぎ、ネオン、発光、ポストエフェクトなど、ユーザーが表現を持ち込める余地は大きい。

一方で、任意 WGSL をそのまま実行可能にすると、入力 texture、uniform、pass 順、render target、FrameGraph resource、保存 / 読み込み、エラー復帰の責任範囲が曖昧になる。したがって、外部シェーダーは `自由なコード実行口` ではなく、MMD_modoki 側が定義した contract に従う拡張点として扱う。

関連メモ:

- [WGSL シェーダーでできること / できないこと](./wgsl-shader-capabilities.md)
- [LUT / WGSL 外部ファイル運用仕様](./lut-wgsl-file-handling.md)
- [FrameGraph Resource Registry 検討メモ](./frame-graph-resource-registry-note-2026-05-30.md)
- [WebGPU / WGSL 実現可能性メモ](./webgpu-wgsl-feasibility.md)

## 基本判断

外部 WGSL 読み込みは、Experimental として段階的に開放する価値がある。

理由:

- MMD_modoki は Electron アプリであり、WebGPU 前提の環境を比較的そろえやすい。
- Babylon.js 9 系は WGSL / WebGPU 経路を公式に持っており、`Effect`、`ShaderMaterial`、`PostProcess`、`ShaderLanguage.WGSL`、`ShadersStoreWGSL` などを利用できる。
- MMD 資産を使いながら WebGPU/WGSL 表現を試せる環境は、MMD_modoki の実験機としての位置づけに合う。
- MME 的な自由度を現代環境で再解釈する入口になる。

ただし、最初からフル WGSL モジュールや任意 pass graph を受け付けない。

最初は `Material Snippet` として、MMD 材質の既存計算へ小さく差し込む範囲に限定する。その後、screen-space effect や effect package へ拡張する。

## Babylon.js に任せられる部分

Babylon.js の公式経路に乗ることで、以下は Babylon 側の仕組みに寄せられる。

- WGSL / GLSL の shader language 選択
- `ShaderLanguage.WGSL`
- `Effect` の compile / ready / error 管理
- `ShaderMaterial` の uniform / sampler / attribute binding
- `PostProcess` の基本的な入力 / 出力 texture 管理
- `ShaderStore.ShadersStoreWGSL` による WGSL 登録
- Material plugin の `getCustomCode(shaderType, shaderLanguage)` による shader injection
- `onCompiled` / `onError` によるコンパイル結果の検出

このため、MMD_modoki が裸の WebGPU pipeline / bind group / shader module を直接管理するより、トラブルを抑えやすい。

## MMD_modoki が責任を持つ部分

Babylon.js に乗せても、次は MMD_modoki 側で定義する必要がある。

- 外部 WGSL が何を入力として読めるか
- どの uniform / sampler / texture を渡すか
- どの材質 / mesh / pass に適用するか
- どの順序で実行するか
- shader compile 失敗時にどこへ戻すか
- UI パラメータをどう保存するか
- project save / load でどう再現するか
- WebGPU / WebGL2 fallback 時にどう扱うか
- export 時に同じ結果を保証できるか
- app log / runtime diagnostic に何を残すか

したがって、外部シェーダーは `WGSL ファイル単体` ではなく、段階ごとに contract を定義して受け付ける。

## 段階設計

### Level 1: Material Snippet

MMD 材質 shader の既存変数へ小さく差し込む。

想定:

- Toon 影の色味調整
- rim light 風の加算
- 疑似発光
- 材質ごとの look 調整
- MMD Standard を壊しにくい小変更

現在の実装痕跡では、外部 WGSL は full module ではなく toon snippet として扱う設計になっている。

許可例:

```wgsl
diffuseBase += vec3f(0.05, 0.02, 0.12);
```

禁止例:

```wgsl
@fragment
fn main(...) -> ...
```

入力制約:

- `diffuseBase` など既存の injection point で使える変数のみ。
- 外部 texture / sampler 追加はなし。
- 任意 uniform 追加はなし。
- render target 生成はなし。

バリデーション:

- 空ファイル不可。
- `@fragment` / `@vertex` 不可。
- `fn ...(` 不可。
- `return` 不可。
- `fragmentOutputs` 不可。
- 指定 injection point への書き込みを必須にする。

UI 名称:

```text
Custom WGSL Material Snippet
```

`Custom Shader` とは呼ばない。自由な shader 全体を書ける誤解を避ける。

### Level 2: Named Material Effect

MMD_modoki が定義した入力と uniform だけを持つ、材質単位の named effect として受け付ける。

想定:

- metallic-ish highlight
- glass tint
- rim + fresnel
- toon-to-PBR 風の見た目調整
- emissive pulse

Material Snippet より少し広いが、依然として材質内の single pass に限定する。

contract 例:

```json
{
  "type": "material-effect",
  "version": 1,
  "entry": "material.wgsl",
  "inputs": ["uv", "normal", "viewDir", "diffuseColor"],
  "params": {
    "intensity": { "type": "float", "default": 1.0, "min": 0.0, "max": 5.0 },
    "tint": { "type": "color3", "default": [1.0, 1.0, 1.0] }
  }
}
```

この段階でも scene color / depth は読ませない。

### Level 3: Screen-Space Material Effect

材質に割り当てるが、screen-space resource を読む effect。

想定:

- ガラス屈折
- 水面の歪み
- 熱ゆらぎ
- 宝石の疑似屈折
- 濡れ床の反射 / 歪み

必要 resource:

- scene color
- depth
- normal
- optional reflectivity

この段階から FrameGraph Resource Registry との接続が必要になる。WGSL 単体ではなく、どの shared resource を読むかを manifest で明示する。

contract 例:

```json
{
  "type": "screen-space-material-effect",
  "version": 1,
  "entry": "refraction.wgsl",
  "requires": {
    "sceneColor": true,
    "depth": true,
    "normal": false
  },
  "params": {
    "ior": { "type": "float", "default": 1.45, "min": 1.0, "max": 2.5 },
    "distortion": { "type": "float", "default": 0.03, "min": 0.0, "max": 0.2 },
    "chromaticShift": { "type": "float", "default": 0.0, "min": 0.0, "max": 0.05 }
  }
}
```

注意:

- transparent material / depth sort と衝突しやすい。
- MMD の髪 / スカート / 半透明材質と混在すると破綻しやすい。
- 最初は PMX キャラではなく、床、ガラス板、水面、アクセサリ、ステージ材質を対象にする。

### Level 4: Custom Post Effect

FrameGraph の linear stack block として受け付ける。

想定:

- color grading
- depth fog
- edge detect
- heat haze
- screen-space blur
- vignette
- stylized post effect

最初の制約:

- fullscreen single pass
- previous color -> next color
- optional depth / normal / reflectivity
- fixed resolution
- history texture なし
- arbitrary graph なし
- custom render target allocation なし
- compute pass なし

contract 例:

```json
{
  "type": "post-effect",
  "version": 1,
  "entry": "effect.wgsl",
  "stage": "afterBloom",
  "requires": {
    "previousColor": true,
    "depth": false,
    "normal": false,
    "reflectivity": false
  },
  "params": {
    "strength": { "type": "float", "default": 0.5, "min": 0.0, "max": 1.0 }
  }
}
```

Custom post effect は、WGSL fragment 単体では受け付けない。必ず contract を持つ block として扱う。

### Level 5: MME-like Effect Package

将来的な最上位。

想定:

- manifest
- WGSL
- textures
- params
- UI metadata
- pass graph
- target material / object rules

ファイル構成例:

```text
my-effect/
  modoki-effect.json
  shaders/
    material.wgsl
    composite.wgsl
  textures/
    noise.png
```

この段階では MME 的な自由度に近づくが、v0.2 / v0.3 初期でいきなり実装しない。まず Level 1 - 3 の経験をもとに contract を固める。

## 受け付けないもの

初期段階では、次は受け付けない。

- 任意の full WGSL module
- 任意の `@vertex` / `@fragment` / `@compute`
- 任意 bind group / binding 指定
- 任意 storage buffer
- 任意 texture allocation
- compute shader
- multipass blur chain
- previous frame history
- branch / merge を含む graph
- node editor 的な自由接続
- shader から file IO / IPC 的なものを行う仕組み

## エラー処理

外部 shader は必ず失敗する前提で扱う。

失敗時の基本動作:

- 対象材質 / effect を直前の valid state へ戻す。
- 直前の valid state がなければ MMD Standard または OFF へ戻す。
- toast は短く出す。
- 詳細は app log / runtime diagnostic に残す。
- project load 時に失敗してもプロジェクト全体の読み込みは継続する。
- 失敗した shader は disabled として UI に表示する。

記録したい情報:

- shader path
- effect type
- target model / material
- backend
- compile error
- required resource
- stage
- stack position

## 保存 / 読み込み

外部 shader は、配布性を考えると project-relative を優先する。

推奨構成:

```text
project/
  scene.mmdproj.json
  wgsl/
    toon_custom.wgsl
  effects/
    glass-refraction/
      modoki-effect.json
      shaders/
        refraction.wgsl
```

保存方針:

- Level 1 の単体 snippet は `wgsl/` に保存可能。
- Level 2 以降は effect folder と manifest を持たせる。
- absolute path はローカル実験用として許可してもよいが、配布時は project-relative を推奨する。
- project load 時、外部 asset が見つからない場合は warning を積んで disabled にする。

## UI 方針

最初から大きな shader editor を作らない。

初期 UI:

```text
Shader
  Built-in Presets
  Custom WGSL Material Snippet (Experimental)
    Load...
    Clear
    Apply Selected
    Apply All
```

将来 UI:

```text
Effect Lab
  Material Effects
  Screen-Space Effects
  Post Effects
  Diagnostics
```

表示上の注意:

- `Custom Shader` という広すぎる名前は避ける。
- `Material Snippet`、`Screen-Space Effect`、`Post Effect Block` のように contract を名前に出す。
- WebGPU でない場合は disabled にする。
- 適用対象は、最初は選択材質 / 選択モデル全材質に限定する。

## MMD ワークフローとの関係

外部 WGSL は、MMD 本体ワークフローの標準機能ではなく、映像制作 / lookdev / 実験向け機能として扱う。

優先する対象:

- ステージ
- 床
- ガラス
- 水面
- ネオン
- アクセサリ
- 宝石
- PBR / OpenPBR scene object

慎重に扱う対象:

- PMX キャラの顔
- 肌
- 髪
- 服の透明材質
- outline 前提の材質

PMX キャラ本体は `MMD Standard` を基本とし、外部 shader は per-material override として明示的に適用する。

## 実装段階案

### Phase 1: 既存 Material Snippet 経路の再確認

- 既存の外部 WGSL snippet 読み込み経路を棚卸しする。
- UI が閉じている理由を確認する。
- validation を unit test 化する。
- compile error 時の復帰を確認する。
- project-relative 保存 / 読み込みを確認する。

### Phase 2: Experimental として再解放

- `Custom WGSL Material Snippet` として UI に出す。
- WebGPU 時のみ有効。
- apply selected / apply all を既存 shader panel に統合する。
- app log / warning を整備する。

### Phase 3: Named Material Effect

- manifest v1 を設計する。
- uniform UI の自動生成を小さく作る。
- built-in sample を 1 - 2 個用意する。
- 外部ファイル読み込みはまだ project-relative に限定してもよい。

### Phase 4: Screen-Space Effect PoC

- scene color / depth を読む屈折ガラス PoC を作る。
- 対象は床 / ガラス板 / アクセサリに限定する。
- PMX キャラ本体は対象外。
- FrameGraph Resource Registry との接続を検討する。

### Phase 5: Post Effect Block

- linear stack subset として受け付ける。
- custom block は fullscreen single pass に限定する。
- diagnostics で required resource と stack position を表示する。

## 現時点の結論

外部 WGSL は、MMD_modoki の実験機としての価値を高める可能性が高い。

ただし、開放単位は `WGSL ファイルを自由に実行` ではなく、次のように contract 付きにする。

```text
Material Snippet
  -> 安全に再解放しやすい

Named Material Effect
  -> 材質表現の拡張

Screen-Space Effect
  -> 屈折ガラス、水面、熱ゆらぎなどのロマン枠

Post Effect Block
  -> MME 風の入口。ただし FrameGraph contract 必須

Effect Package
  -> 将来の上級者向け
```

Babylon.js の WGSL 経路に準じることで shader compile / binding / post process の基盤は利用できる。MMD_modoki 側では、resource contract、UI、保存 / 読み込み、失敗時復帰、diagnostics を設計することが重要になる。
