# PBR Skin SSS: Frame Graph混成の比較

## 調べる症状

素の`PBRMaterial`とPrePass SSSでは正常に見える一方、
`MMD_modoki`のFrame Graph経路ではSSS対象が赤黒くなる原因を分離します。

アプリは、通常のScene描画とは別に中間`RenderTargetTexture`へシーンを描き、
その内部TextureをFrame Graphへimportしてbackbufferへ出力しています。
この比較では同じシーンを次の3経路で切り替えます。

1. Sceneからbackbufferへ直接描画
2. 中間RTからFrame Graphでcopy
3. 中間RTからFrame GraphのImage Processingを通してcopy

## コード

[`playground.js`](./playground.js)をBabylon.js Playgroundへ貼り付けます。
現行Playgroundのモジュール形式に合わせ、
先頭の`export const createScene = ...`も含めてください。

- 左: 通常のPBRMaterial
- 右: 同じ値へScatteringだけを追加したPBRMaterial

操作:

- `1`: Direct Scene render
- `2`: Intermediate RT -> Frame Graph copy
- `3`: Intermediate RT -> Frame Graph Image Processing -> copy
- `S`: Scatteringのオン/オフ
- `N`: `SubSurfaceConfiguration.needsImageProcessing`の反転
- `I`: IBLのオン/オフ
- `L`: DirectionalLightのオン/オフ

切替後の設定値はブラウザのConsoleへ`console.table`で出します。

## アプリ相当の固定条件

- 中間RTの`useCameraPostProcesses = false`
- Frame Graph経路では、初期状態の
  `SubSurfaceConfiguration.needsImageProcessing = false`
- `ThinImageProcessingPostProcess.fromLinearSpace = false`
- Frame GraphをSceneのメインrendererにはせず、
  Scene描画後に中間RTをbackbufferへcopy
- 外部モデル、PMX材質変換、独自Material Plugin、
  `pbr-material-sss-prepass-mask-fix`は使用しない

## 比較表

| Backend | 1: Direct | 2: FG Copy | 3: FG Image Processing |
| --- | --- | --- | --- |
| WebGL2 | 正常 | Scattering PBRだけほぼ黒 | Scattering PBRだけほぼ黒 |
| WebGPU | 正常 | Scattering PBRだけほぼ黒 | Scattering PBRだけほぼ黒 |

各セルで追加確認:

- `S`のオン/オフで右球だけに期待した差が出るか
- `N`で赤黒化、白飛び、二重gammaが変化するか
- 左右の球以外も同時に白くなるか
- Frame Graph経路だけSSSのblurが消える、または下地色だけに見えるか

## 判定

- `1`は正常で`2`から崩れる:
  - 中間RTへSSS後の色が入っていない、またはPrePass/SSSの適用先が
    main backbufferに固定されている可能性が高い
- `2`は正常で`3`だけ崩れる:
  - Image Processingの色空間、gamma、`needsImageProcessing`の
    二重適用または不足を疑う
- 3経路とも正常:
  - `MMD_modoki`独自のPrePass mask patch、PMX材質変換、
    Frame Graphの他taskとの接続を一つずつ追加して調べる
- WebGPUだけ崩れる:
  - WGSL、PrePass attachment、Frame Graph外部Texture importの
    WebGPU経路をBabylon.js側の不具合候補として切り出す

## 2026-07-29 / 2026-07-30 実機確認

Babylon.js Playground 9.18.2 の WebGPU と WebGL2 で確認した。

- `1: Direct`
  - 通常 PBR と Scattering PBR の両方が描画される
- `2: Intermediate RT -> Frame Graph copy`
  - 通常 PBR は描画される
  - Scattering PBR だけがほぼ黒になる
- `3: Intermediate RT -> Frame Graph Image Processing -> copy`
  - `2` と同様に Scattering PBR だけがほぼ黒になる
  - Frame Graph 側で Image Processing を追加するだけでは復元しない
- Direct のまま `N` で `needsImageProcessing = false` にすると、
  Scattering PBR が暗い赤へ変化し、背景も黒くなる
- WebGL2 でも Direct は正常で、`2` と `3` では
  WebGPU と同じく Scattering PBR だけがほぼ黒になる

この比較では、Frame Graph の実行自体と両 backend の基本描画は成功している。
問題は Scattering の最終合成結果を中間 `RenderTargetTexture` から取得する経路に絞り込める。
WebGL2 でも同じため、WebGPU 固有の WGSL / validation 問題ではない。

現時点の第一候補は、PrePass SSS の最終合成先がメイン backbuffer 側に固定されており、
`camera.customRenderTargets` へ描画した中間 RT には Scattering 合成済みの色が入っていないこと。
`needsImageProcessing` の扱いにも別の色空間問題があるが、Frame Graph の
`ImageProcessingTask` だけでは SSS 欠落を補えない。

したがってアプリ側では、Frame Graph を単純に無効化する前に次を確認する。

1. PrePass SSS の post-process / post-process configuration が出力する最終 texture を取得できるか
2. その最終 texture を Frame Graph の入力へ import できるか
3. 取得できない場合は、SSS 使用時だけ Scene の最終出力後に Frame Graph を接続する経路へ変更できるか

## Playground URL

- https://playground.babylonjs.com/#63QTUS

確認環境:

- Babylon.js Playground 9.18.2
- Windows 11 Pro 25H2（OS build 26200.8875）
- Google Chrome 151.0.7922.72（Official Build、64-bit）
- NVIDIA GeForce RTX 3070（driver 595.95）
- 11th Gen Intel Core i9-11900K @ 3.50 GHz
- RAM 64 GB

投稿用確認画像:

- `スクリーンショット 2026-07-30 101059 - コピー.png`: `1: Direct` の正常状態
- `スクリーンショット 2026-07-30 101106 - コピー.png`: `2: FG Copy` で右側の SSS 球が黒化した状態

関連:

- [`../pbr-skin-sss-webgpu/README.md`](../pbr-skin-sss-webgpu/README.md)
- [`../../docs/pbr-skin-sss-red-dark-progress-2026-07-28.md`](../../docs/pbr-skin-sss-red-dark-progress-2026-07-28.md)
- [`../../docs/babylon-forum-reporting-runbook.md`](../../docs/babylon-forum-reporting-runbook.md)
