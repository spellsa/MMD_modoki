# FrameGraph ぼかし品質ガイドライン 2026-06-14

## 目的

FrameGraph で custom post effect を作るとき、広いぼかしを少数サンプルで直接実装すると、縞、モアレ、ぶれた線、格子模様の残留が出やすい。

Luminous の実装でこの問題が出たため、今後 Bloom、Glow、Light streak、Vignette blur、Edge blur、疑似 DoF、粒子のにじみなどを作るときの共通メモとして残す。

## 起きた問題

Luminous の初期実装では、専用 shader 内で固定 tap の横 blur / 縦 blur を行い、`Radius` が大きいほどサンプル間隔を広げていた。

この方式では、細いネオン、格子、床の発光ライン、反復パターンを大半径でぼかしたときに、以下が目立った。

- 横方向または縦方向の筋
- 格子の暗部が残ったようなモアレ
- 発光線が複製されたような見え方
- 動画再生中のちらつき
- 4K 出力で見える粗いサンプリング痕

原因は「ガウス風の重み」ではなく「サンプル密度不足」である。重みだけをガウスにしても、遠くを飛び飛びに拾えば sparse sampling の絵になる。

## 避けるべき実装

### 大半径を固定 tap で直接拾う

```text
radius = 128px
tap = 15
step = radius / tap
```

このような実装は軽いが、細い発光線や格子で破綻しやすい。

### radius をサンプル間隔として扱う

`Radius` をそのまま `texelStep` に掛けると、radius が大きいほどサンプルが疎になる。

UI 上の `Radius` は「見た目の広がり」であり、「1 pass のサンプル間隔」ではない。

### 方向付き blur を composite pass に混ぜる

光芒や streak を composite pass 内の少数サンプルで足すと、細い線、グリッド、動画出力でモアレが出やすい。

方向性のある blur は専用 pass か、事前にぼかした低解像度 buffer 上で行う。

## 推奨方針

### 1. Babylon.js の blur 実装を優先する

Babylon.js には `ThinBlurPostProcess` / `BlurPostProcess` がある。

FrameGraph 内で custom blur を書く場合も、まず `ThinBlurPostProcess` を `FrameGraphPostProcessTask` に接続できないか検討する。

利点:

- WebGPU / WGSL 対応を Babylon 側に寄せられる
- Gaussian weight と linear sampling 最適化を利用できる
- 自前 shader より品質の土台が安定する
- shader variant の扱いを Babylon 側に任せやすい

### 2. 大きい blur は multi-pass / multi-scale にする

広いぼかしは、原寸で巨大 kernel を 1 回かけるより、低解像度 buffer と複数 pass で作る。

基本形:

```text
source
  -> extract / prefilter
  -> blur small
  -> downsample 1/2 -> blur medium
  -> downsample 1/4 -> blur wide
  -> composite
```

利点:

- 大半径でもサンプル密度不足が出にくい
- 細線や格子の残留が減る
- 近くは濃く狭く、遠くは薄く広い表現を作りやすい
- 処理負荷を抑えやすい

### 3. core / halo / wide を分ける

発光、にじみ、疑似ボケでは、1 本の blur だけで見た目を作ろうとしない。

推奨:

- `core`: 小さい blur。発光源の輪郭と色を残す
- `halo`: 中くらいの blur。周囲への柔らかい広がり
- `wide`: 大きい blur。空気感や画面全体へのにじみ

Luminous では 2026-06-14 時点で `core` / `halo` の 2 段を採用した。

### 4. kernel は段階化する

`ThinBlurPostProcess.kernel` は変更時に shader 更新が発生しうる。

スライダー値をそのまま kernel にせず、候補値へ丸める。

例:

```text
core: 5, 9, 13, 17, 25, 33
halo: 9, 13, 17, 25, 33, 49, 65, 97, 129
```

これにより、UI 操作中の shader variant 増加や再コンパイル負荷を抑えられる。

### 5. blur 前に prefilter する

発光系では blur 前に source を整える。

例:

- threshold
- soft knee
- saturation / tint
- alpha / mask
- AutoLuminous 対象材質だけを source にする

scene color から単純に明るいところを拾うと、肌、白服、床、空などが誤ってにじみやすい。

### 6. 合成は blur と分ける

blur shader の中で合成までやらず、できるだけ次のように分ける。

```text
extract
  -> blur
  -> composite
```

合成 pass では次を扱う。

- intensity
- blend mode
- tonemap
- bloom send
- depth-aware attenuation

これにより、blur 品質調整と見た目調整を分離できる。

## 実装パターン

### 最小構成

```text
source
  -> ThinBlur X
  -> ThinBlur Y
  -> composite
```

小さい blur なら十分。

### 発光向け構成

```text
mask
  -> extract
  -> core blur X/Y
  -> halo blur X/Y
  -> composite scene color
```

Luminous で採用。

### 大半径向け構成

```text
mask
  -> extract
  -> core blur full or 1/2
  -> downsample 1/4 -> halo blur
  -> downsample 1/8 -> wide blur
  -> composite
```

広いネオン、ライト streak、疑似 lens glow で使う。

### 光芒 / streak 向け構成

```text
mask
  -> pre-blur
  -> directional accumulation low-res
  -> optional perpendicular blur
  -> composite
```

避けること:

- composite pass 内で細い source を直接長距離サンプリングする
- 4K 出力確認なしで UI に出す

## 確認項目

ぼかし系 effect を追加したら、次を確認する。

- 細いネオン線で線が複製されない
- 格子ステージで暗いマス目がモアレとして残らない
- 横方向 / 縦方向の筋が出ない
- 再生中にちらつかない
- 4K 相当の出力で粗いサンプル痕が見えない
- `Radius` 最大付近で破綻しない
- WebGPU / WGSL で shader warning が出ない
- FrameGraph stack の順序を変えても二重適用にならない

## Luminous での採用例

2026-06-14 の Luminous 改修では、次を採用した。

- `LuminousExtract` pass で threshold / soft knee を処理
- `ThinBlurPostProcess` で core X/Y blur
- `ThinBlurPostProcess` で halo X/Y blur
- composite pass で core + halo を scene color に合成
- `Radius` は core / halo kernel の段階選択に使う
- glare / 光芒は composite 内の軽量実装では品質不足だったため無効化

今後、さらに広い blur が必要になった場合は、1/2、1/4、1/8 の downsample buffer を追加して wide blur を作る。

## まとめ

FrameGraph の custom effect で大きいぼかしを作るときは、固定 tap の大半径サンプリングを避ける。

基本方針は次の通り。

```text
Babylon.js の ThinBlurPostProcess を使う
大きい blur は multi-pass / multi-scale にする
core / halo / wide を分ける
radius は見た目の広がりとして扱い、サンプル間隔に直結しない
4K と細線ステージで確認する
```
