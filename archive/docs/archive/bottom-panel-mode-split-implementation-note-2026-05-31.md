# 下パネル Model / Camera Mode 分離 実装メモ 2026-05-31

## 目的

v0.2 UI 整理の一環として、v0.1 世代で継ぎ足していた下パネルを本家 MMD 寄せに整理した。

今回の主目的は、下パネルを `model` / `camera` mode で出し分け、常用操作と詳細設定の住所を分けること。
新しい編集機能を増やすより、既存機能の置き場を整理し、後続の再設計に耐える土台を作ることを優先した。

## 実装した構成

`BottomPanelLayoutController` を追加し、下パネル section の表示 / 非表示 / 並び順を mode ごとに管理するようにした。
section 内の編集ロジックは既存 controller に残し、layout controller は構成だけを担当する。

現在の表示構成:

```ts
model: [
    "info",
    "interpolation",
    "boneOperation",
    "bone",
    "morph",
    "camera",
]

camera: [
    "info",
    "interpolation",
    "bone",
    "lighting",
    "shadow",
    "accessory",
    "camera",
]
```

モデルモードでは情報欄を左端に固定し、ボーン操作欄、ボーン欄、モーフ欄、表示欄を並べる。
カメラモードでは照明欄と影欄を分離し、アクセサリ欄と表示欄を残す。

## 下パネルから外したもの

下パネルから以下を外した。

- `output-section`
- `physics-section`
- Mirror 床詳細
- 旧 DoF / Fog 詳細
- 剛体表示ボタン
- 影品質、影距離、bias、接地影詳細などの低頻度影設定

出力は File メニュー / WebM 出力設定 popup を正とする。
Mirror 床は背景設定 popup、重力や物理詳細は重力設定 popup、影詳細は `表示 > 照明/影品質設定...` に待避する。

## 出力設定

`output-section` 削除に備え、`ExportUiController` は下パネル DOM 依存ではなく in-memory state 中心に寄せた。

WebM 出力 popup は `ExportUiController` の state adapter を参照する。
PNG / PNG 連番 / WebM の実行導線は File メニュー側を維持する。

## モーフ欄

モーフ欄は本家 MMD の表情操作に寄せ、表示枠 dropdown ではなく以下の 4 分類を田の字に並べる形へ変えた。

- 目
- リップ
- 眉
- その他

分類カードの背景色は、強い緑系から無彩色のグレー系へ変更した。
分類は UI 上の見通しのための暫定分類であり、モーフの保存値やプロジェクト schema は変更しない。

## ボーン欄 / ボーン操作欄

モデルモードにボーン操作欄を追加した。
ボーン欄の dropdown は外し、将来の複数ボーン選択に備えて対象表示を弱めた。

カメラモードでは、既存の疑似 `Camera` bone 経路をまだ維持する。
ただしカメラモードのボーン欄は横幅を縮め、間延びしないようにした。

## 情報欄

情報欄は本家 MMD から少し外し、モデルモード / カメラモードとも左端寄りの基本情報欄として扱う。

外部親、親ボーンなど、本家 MMD にある項目は UI placeholder として追加した。
この段階では中身の作り込みは行わず、後続で接続できる形だけ用意した。

## アクセサリ欄

アクセサリ欄は本家 MMD 寄せで、スライダー中心から数値ボックス中心へ変更した。

現在の transform UI:

```text
X  Y  Z
Rx Ry Rz
Si Tr
```

`X/Y/Z`, `Rx/Ry/Rz`, `Si` は既存 transform と接続している。
`Tr` は現時点では UI placeholder で、保存や runtime には接続していない。

## 影欄

影欄は下パネル常設の項目を 6 個程度に絞った。

残したもの:

- 影色R
- 影色G
- 影色B
- Toon影響度
- キャラ接地影
- 照度

詳細設定は `表示 > 照明/影品質設定...` popup に寄せる。
影色 RGB は、黒寄りの初期値だと効果が分かりにくかったため、新規既定を `128 / 128 / 128` 相当のグレーに変更した。

## 表示欄と再生範囲

表示欄には前後左右上下の視点切替を残した。
タイムラインの縦幅圧迫を減らすため、フレーム開始 / 停止の checkbox と範囲数値入力を表示欄の下へ移した。

左タイムライン側は、再生操作とタイムライン表示に集中させる方向。
ただし再生欄全体の下パネル統合は今回の範囲外。

## タイムライン波形

音声波形 row の pink playhead がタイムライン本体の playhead とわずかにずれていたため、波形 row の横 padding を外して左右基準を揃えた。

描画計算は既に `Timeline.getPlayheadX()` を共通利用していたため、原因は layout offset 側だった。

## まだやっていないこと

- `BottomPanel` の rename / 分割
- `BonePanelController` / `MorphPanelController` への分離
- Camera の疑似 bone 扱い解除
- 再生欄全体の下パネル統合
- アクセサリ `Tr` の runtime / 保存接続
- 外部親 placeholder の実装接続
- 下パネル各 section の本格的な responsive 再設計
- 1080p 前後での最終スクリーンショット確認と微調整

## 確認

実装中に以下を確認した。

- `npm.cmd run lint`
- `npm.cmd run test:unit`
- `npm.cmd run smoke:launch`

いずれもエラーなし。
lint warning は既存 warning の範囲。
