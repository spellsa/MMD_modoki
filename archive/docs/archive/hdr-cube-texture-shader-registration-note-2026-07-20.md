# HDRCubeTexture プリフィルタ用シェーダー登録メモ

## 症状

Electron / Vite / WebGPU で同梱 HDR を `HDRCubeTexture` として読み込むと、
`HDR_Radiance_Filtering_Target` の作成時に WGSL の構文エラーが発生する場合がある。
エラー内のシェーダー本文には `<!doctype html>` が含まれる。

## 原因

Babylon.js 9.2.0 の `HDRFiltering` はプリフィルタ用の
`hdrFiltering.vertex` / `hdrFiltering.fragment` を動的 import する。
この構成ではシェーダー登録が描画開始に間に合わない場合があり、
ShaderStore にないシェーダーの URL 取得へフォールバックする。
Vite の SPA fallback がその URL に `index.html` を返すため、
HTML を WGSL としてコンパイルして WebGPU validation error になる。

## 対応

起動時に次のシェーダーを明示 import し、ShaderStore へ先に登録する。

- GLSL `hdrFiltering.vertex`
- GLSL `hdrFiltering.fragment`
- WGSL `hdrFiltering.vertex`
- WGSL `hdrFiltering.fragment`

GLSL も登録するのは WebGL backend へ切り替えた場合に同じフォールバックを
起こさないためである。

この問題は SSS の強度や diffusion profile とは無関係で、同梱 HDR の
起動時プリフィルタ経路に限定される。
