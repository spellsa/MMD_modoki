# IBL 環境テクスチャ

IBL環境ライティングとIBL Shadowsの検証用アセットを置く。

想定形式:

- `.hdr`
- `.env`
- `.dds`

`white.hdr` は現在、PBRモードの既定環境ライトとして使用する。
Babylon.jsの `HDRCubeTexture` で読み込み、harmonicsとPBR反射用プリフィルタを生成する。
表示背景とは独立しており、環境ライティングをOFFにするとsceneから一時的に外す。

このフォルダのアセットは実験用として扱う。配布可否やライセンスが不明なファイルは
コミットしないこと。
