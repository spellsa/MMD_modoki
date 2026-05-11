# Blob shadow assets

Blob shadow / contact shadow 用の検証アセット置き場です。

想定する画像:

- 透明 PNG
- 正方形
- 中央が黒、外側へ透明にフェードする radial gradient
- 256x256 または 512x512 程度

実装側では、円形テクスチャを mesh scale で楕円化し、床からの距離で opacity と scale を調整します。

