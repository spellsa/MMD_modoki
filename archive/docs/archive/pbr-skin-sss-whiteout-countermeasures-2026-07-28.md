# PBR Skin SSS 白飛び対策・再発防止メモ

## 目的

`PBR Skin SSS`を一部のPBR材質へ割り当てたとき、SSS対象の肌だけでなく、
髪、服、背景を含む画面全体が白く霞む問題について、原因、試した対策、
最終的に有効だった修正、再発確認項目を記録する。

この文書は白飛び対策に範囲を限定する。SSSの色、散乱距離、暗化、影ぶれなどの
見た目の調整は[PBR Skin 実装メモ](./pbr-skin-implementation-2026-07-23.md)で扱う。

## 結果

2026-07-28、Electron / WebGPUの実機確認で画面全体の白飛び解消を確認した。

- `PBR Skin SSS`を肌材質へ適用しても、背景やSSS対象外材質の明るさが一緒に持ち上がらない
- 肌材質にはSSS由来の色差が残る
- 確認に使ったモデルやスクリーンショットはローカル検証用であり、リポジトリへ追加しない

今回の決定的な対策は、Babylon.jsのSubSurface effectが要求する追加の
Image Processingを無効にし、アプリ側の最終出力経路だけで画像処理を行うことである。

## 症状

SSSプリセットを一材質へ適用しただけで、次の範囲が同時に白くなった。

- SSSを割り当てた肌材質
- SSSを割り当てていない髪や服
- HDRI背景や通常背景
- 画面全体のコントラスト

材質単位の設定変更に対して画面全体が変化していたため、肌の散乱色や
拡散距離だけではなく、PrePass後の全画面処理を疑う必要があった。

## 原因

Babylon.js 9.2.0の`PrePassRenderer`は、登録されたeffect configurationの
`needsImageProcessing`が`true`の場合、SubSurface Scattering合成の後へ
全画面composition effectを追加する。

本アプリでは、sceneのImage Processingを無効にしている場合でも、
`SubSurfaceConfiguration.needsImageProcessing`の初期値が`true`だった。
そのため、SSSを有効にしたときだけアプリの意図しない全画面Image Processingが入り、
背景を含む画面全体の明度とコントラストが持ち上がっていた。

```text
PBR Skin SSSを有効化
  -> PrePassRendererがSubSurface effectを追加
  -> needsImageProcessing = true
  -> SSS後に全画面Image Processingを追加
  -> SSS対象外を含む画面全体が白くなる
```

ログでは、scene側が次の状態でも問題が発生していた。

- `imageProcessingConfiguration.isEnabled = false`
- `imageProcessingConfiguration.applyByPostProcess = false`
- `SubSurfaceConfiguration.needsImageProcessing = true`

この差から、sceneの設定ではなくSubSurface effect configuration側の要求が
追加処理を発生させていることを特定した。

## 採用した対策

### 1. SSS有効化直後に追加Image Processingを無効化

`PBR Skin SSS`の適用時に、次を明示する。

```ts
configuration.needsImageProcessing = false;
```

SubSurface ScatteringのPrePass合成自体は維持する。無効にするのは、
その後へBabylon.jsが自動挿入する追加の全画面Image Processingだけである。

### 2. Classic / Frame Graphの両方で同じ方針を維持

backend切替やFrame Graph同期時にBabylon.js側の設定が戻らないよう、
`resolveSubSurfaceFrameGraphPolicy()`で次の方針を共通化した。

- `configurationNeedsImageProcessing = false`
- `sceneColorUseCameraPostProcesses = false`

中間RenderTargetでcamera post-processを再利用せず、tone mapping、exposureなどの
最終色変換は、選択中のアプリ出力経路で一度だけ実行する。

### 3. 散乱半径をscene scaleに合わせる

白飛びの直接原因ではなかったが、過大な画面空間ブラーを避けるため、
散乱距離と`metersPerUnit`の比は約`1`に抑えた。

```text
旧: max(0.75, 0.25, 0.20) / 0.01 = 75
現: max(0.08, 0.025, 0.012) / 0.08 = 1
```

現在値:

| 項目 | 値 |
|---|---:|
| `metersPerUnit` | `0.08` |
| diffusion profile | `(0.0016, 0.00152, 0.00148)` |
| 相対フィルタ半径 | `0.02` |
| Translucency | 無効 |

`addDiffusionProfile(Color3)`のRGB値は表示へ加算する色ではなく、各チャンネルの散乱距離として
扱われる。赤チャンネルだけを広く散乱させると、アルベドよりプロファイルの色が支配的になり、
非赤チャンネルが暗く見えやすい。このためRGB差を約8%に抑え、最大距離も従来の50分の1へ
縮小した。色と明暗の原因を分離するため、`PBR Skin SSS`ではTranslucencyを併用しない。

### 4. PrePassのSSS対象マスクを防御的に補正

調査中、透明ピクセルや非SSS材質がdiffusion profile `0`として扱われる可能性が
見つかったため、GLSL / WGSLの両方へ対象マスク互換パッチを追加した。

- 可視なSSSピクセルは本来のprofile indexを維持
- 透明なSSSピクセルは対象外を示すalpha `1`
- 非SSSピクセルも対象外を示すalpha `1`

このパッチが適用済みでも白飛びは残ったため、今回の直接的な解決策ではない。
ただし、透明材質や非SSS材質の誤混入を防ぐ防御的な互換対策として残す。

### 5. StandardMaterialをSSS再合成から除外

Babylon.jsのStandardMaterialが使うPrePass出力についても、SSS対象外として扱う
互換パッチを維持する。これも全画面白飛びの決定原因ではないが、PBR材質と
StandardMaterialが混在するシーンでの再合成範囲を明確にするために必要である。

## 試した対策と判定

| 対策 | 判定 | 備考 |
|---|---|---|
| 散乱半径を`75`から`1`へ縮小 | 維持 | 過大ブラー対策。単独では白飛びが残った |
| StandardMaterialのPrePass互換パッチ | 維持 | 混在シーン向け。単独では白飛びが残った |
| PBR材質のSSS対象マスク互換パッチ | 維持 | ログ上はGLSL / WGSLとも適用済み。単独では白飛びが残った |
| Frame Graph中間targetのcamera post-process無効化 | 維持 | 二重処理を避けるため必要 |
| `needsImageProcessing = false` | **有効** | 画面全体の白飛びを解消 |

## 診断ログ

`PBR Skin SSS`を割り当てたとき、`render` scopeの
`per-material PBR shader preset applied`へ`sssDiagnostics`を記録する。

再発時は次を確認する。

- `configurationNeedsImageProcessing`が`false`
- scene Image Processingの`isEnabled`と`applyByPostProcess`
- Classic / Frame Graphのどちらで発生したか
- Frame Graph scene color targetがactiveか
- `frameGraphSceneColorUsesCameraPostProcesses`が`false`
- SSS材質数
- `metersPerUnit`、diffusion profile、相対フィルタ半径
- StandardMaterial / PBRMaterialの互換パッチ適用結果
- WebGPU validation warningやrenderer errorの有無

通常は次のコマンドでerror / warningを先に確認する。

```powershell
npm.cmd run log:errors
```

SSS適用前後の流れを見る場合:

```powershell
npm.cmd run log:tail
```

## 確認結果

| 確認 | 結果 |
|---|---|
| 関連単体テスト | 4ファイル、27テスト成功 |
| 全単体テスト | 39ファイル、262テスト成功 |
| lint | 成功 |
| Electron / WebGPU手動確認 | 2026-07-28、画面全体の白飛び解消を確認 |
| `smoke:launch` | 既存Electronによるログファイル占有で完走できず |

`smoke:launch`は実PMXへSSSプリセットを割り当てないため、成功した場合でも
SSS最終ピクセルの確認にはならない。今回の白飛び解消判定はユーザーによる
Electron / WebGPU実機確認を根拠とする。

## 未解決・別途評価する項目

今回の確認で完了したのは「SSS対象外を含む画面全体の白飛び」の対策である。
次は別問題として扱う。

PBR Standardより暗く見える問題は、2026-08-02にSSS合成の色空間不一致を修正し、
Electron / WebGPUの直接出力で解消を確認した。詳細は
[PBR Skin SSS 赤黒化調査・解決記録](./pbr-skin-sss-red-dark-progress-2026-07-28.md)と
[FrameGraph中間RTT回避策](./pbr-skin-sss-framegraph-rtt-workaround-2026-08-02.md)を参照する。

引き続き別途評価する項目:

- 散乱色と肌色の適正値
- 影の二重輪郭や影ぶれ
- IBL ON / OFFでの散乱差
- 高輝度HDRIでの白飛び耐性
- Classic / Frame Graph切替後の実描画
- WebGL backendでの互換性
- 複数SSS材質や半透明材質が混在する場合

## 再発防止チェック

SSS、PrePass、Frame Graph、最終画像処理を変更した場合は、最低限次を確認する。

1. SSSを一材質だけへ適用する。
2. 背景とSSS対象外材質の明るさが適用前後で変わらないことを確認する。
3. `configurationNeedsImageProcessing = false`をログで確認する。
4. exposure / tone mappingが一度だけ適用されていることを確認する。
5. backend切替後も同じ値を維持していることを確認する。
6. SSSを外したとき、不要なscene SubSurface設定が残らないことを確認する。
7. 影ぶれは白飛びと混同せず、同一カメラ・同一ライトの比較画像で評価する。

## 関連コードと文書

- `src/render/pbr-mmd-like-toon-settings.ts`
- `src/render/subsurface-frame-graph-policy.ts`
- `src/render/pbr-material-sss-prepass-mask-fix.ts`
- `src/render/standard-material-sss-prepass-fix.ts`
- `src/mmd-manager.ts`
- [PBR Skin 実装メモ](./pbr-skin-implementation-2026-07-23.md)
- [Babylon.js PBR 材質で使える属性・表現](./babylon-pbr-material-capabilities-2026-07-21.md)
- [Mastering PBR Materials - Sub Surface](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/masterPBR/)
- [PBRSubSurfaceConfiguration API](https://doc.babylonjs.com/typedoc/classes/BABYLON.PBRSubSurfaceConfiguration)
- [PrePassRenderer API](https://doc.babylonjs.com/typedoc/classes/BABYLON.PrePassRenderer)
