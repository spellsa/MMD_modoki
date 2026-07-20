# BackgroundMaterial と環境ライティングの今後案 2026-07-20

## 今回の判断

現時点の環境ライティング仕様は次のとおり。

- 環境ライティング OFF では `scene.environmentTexture` を外す。
- ON では同梱の `src/assets/ibl-shadows/white.hdr` をPBR環境テクスチャとして使う。
- `.hdr` は `HDRCubeTexture` で読み込み、harmonics生成とPBR反射用プリフィルタを行う。
- HDRの読み込みに失敗した場合だけ、全方向 `RGB 190, 190, 190` の単色 CubeTextureを使う。
- 単色フォールバックには同色からCPU生成した spherical polynomialを設定する。
- デフォルト空の `BackgroundMaterial`、背景画像、背景動画は環境ライティングへ影響させない。
- 外部 HDRI 読み込みは未実装。

## BackgroundMaterial を直接 IBL にできるか

`BackgroundMaterial` 自体を `scene.environmentTexture` として指定することはできない。

`BackgroundMaterial` は背景メッシュを描画するための材質である。一方、PBR の環境ライティングは
放射輝度と粗さ別の反射情報を持つ CubeTexture を必要とする。Babylon.js は、PBR 用の環境として
プリフィルタ済み mipmap を持つ `.env` / DDS、または読み込み時に変換する HDR テクスチャを推奨している。

参考:

- [Babylon.js: Using An HDR Environment For PBR](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/HDREnvironment)
- [Babylon.js: Mastering PBR Materials](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/masterPBR/)
- [Babylon.js: BackgroundMaterial](https://doc.babylonjs.com/typedoc/classes/BABYLON.BackgroundMaterial)

## 将来の実装候補

BackgroundMaterial を直接ライトへ変換するのではなく、デフォルト空と環境テクスチャが
同じ空設定を参照する構成にする。

```text
デフォルト空の設定
  ├─ BackgroundMaterial / 背景グラデーションへ反映
  └─ 簡易 environment CubeTexture へ反映
```

環境ライトのソース候補:

```text
環境ライティング
  ├─ オフ
  ├─ デフォルト空から生成
  └─ 外部 HDRI
```

### デフォルト空から生成

- 上色、下色、グラデーション方向から低解像度 CubeTexture を生成する。
- 空の設定変更時に背景表示と環境テクスチャを同期する。
- キャラクター向けの単色・グラデーション環境光として使う。
- 本格的な HDRI と比べて方向性、反射情報、ダイナミックレンジは限定される。
- 粗さ別の反射を正しくするには、通常 mipmap だけでなく PBR 用プリフィルタも検討する。

### 外部 HDRI

- `.env` を第一候補とし、必要に応じて `.hdr` / `.exr` の読み込みも検討する。
- 表示背景とは独立して環境ライトだけに使用できるようにする。
- 回転、強度、拡散光強度、反射光強度の調整を将来項目とする。
- 外部 HDRI が選択されている間は、デフォルト空由来の簡易環境ライトより優先する。

## UI 案

現在の環境ライティングチェックは維持し、外部環境読込を実装する段階で詳細設定を追加する。

候補:

- 環境ライトソース: `デフォルト空` / `外部 HDRI`
- 環境ライト強度
- HDRI 回転
- 外部 HDRI 読み込み / 解除

黒背景、背景画像、背景動画の表示設定は既存の背景メニューに残し、この詳細設定へ重複させない。

## 実装時の注意

- デフォルト空の見た目と IBL の計算資源は分離する。
- 背景画像や動画を自動で環境ライトへ変換しない。
- HDRI はプロジェクト保存・読み込みとパス解決を確認する。
- environment texture の差し替え時は、PBR 材質、IBL Shadows、WebGPU CDF fallback の同期を確認する。
- UI の初期値、ローカル設定、プロジェクト保存、backend 切替時の同期を確認する。

## 2026-07-20 動作確認追記

初期実装は RawCubeTexture の spherical polynomial 生成を非同期GPU読戻しに任せていた。
この状態ではMMD材質の反射色が弱い場合、環境ライトON/OFFの差がほぼ見えない可能性があった。

その後、`RGB 190, 190, 190` のspherical polynomialをCPUで明示生成したが、
実画面では強度`0.0`と`4.0`の差を確認できなかった。通常ソースを同梱HDRへ切り替え、
単色CubeTextureは読み込み失敗時のフォールバックへ変更した。

モデルなしElectron smokeでは次を確認した。

- 同梱HDR environment textureがreadyである。
- spherical polynomialが生成済みである。
- PBR反射用プリフィルタを有効にしている。
- WebGPU validation errorが出ない。
- アプリログにwarning / errorがない。

ただし、実モデルでのON/OFF差は材質の反射・粗さ・光量にも依存するため、
最終的な見た目は実機画面で比較する。外部HDRIの読込、回転、ソース選択は引き続き未実装。
