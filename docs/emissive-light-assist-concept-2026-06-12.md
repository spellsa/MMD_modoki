# Emissive Light Assist 構想メモ 2026-06-12

## 目的

`Emissive Light Assist` は、MMD 資産に含まれる `AutoLuminous` 対象材質や発光材質を手がかりに、周囲をほんのり照らす補助点光源を自動生成する実験機能である。

従来の AutoLuminous 的な表現は、材質そのものを光って見せたり、Bloom で画面上ににじみを足したりすることが中心になる。一方で、発光している髪飾り、宝石、街灯、ネオン管、ステージライトなどが周囲へ光を落とす表現は、通常ユーザーが手動で point light や spot light を配置する必要がある。

本機能はその手間を減らすため、既存 MMD モデルやステージが持っている「ここは光らせたい」という AutoLuminous 向けの意味情報を、補助ライト生成にも利用する。

これは GI ではない。物理的に正確な面光源やグローバルイルミネーションではなく、MMD らしい発光演出を少しリッチに見せるための `emissive-driven assist lights` として扱う。

関連メモ:

- [現行 MMD でよく使われる AutoLuminous 調査メモ](./mmd-autoluminous-research.md)
- [AutoLuminous 風エフェクト実装メモ](./autoluminous-glowlayer-implementation-note-2026-04-23.md)
- [Light / Shadow 実装メモ](./light-shadow-implementation.md)

## 基本方針

- デフォルトは OFF。
- `Experimental` または上級者向け機能として扱う。
- AutoLuminous / LuminousGlow / Bloom とは競合させず、補助光として併用する。
- `AL 頂点をすべて光源にする` のではなく、AL 材質の頂点群を少数の代表ライトへ圧縮する。
- ライト数には必ず上限を置く。
- 巨大な発光面は point light 化しない。必要なら Bloom / emissive / reflection / screen-space effect 側で扱う。
- 最初の対象は静的なステージ発光材質とする。
- モデル側は髪飾り、宝石、小物など、小面積かつ誤爆しにくい材質に限定する。
- 顔、肌、髪全体、服全体、白い布、巨大スクリーン、発光床などは自動ライト化から除外する。

## AutoLuminous との関係

AutoLuminous は、材質や画面上の明るい部分を「光って見せる」ための表現である。

Emissive Light Assist は、AutoLuminous 対象材質の位置、色、強度をもとに「周囲を少し明るくする」ための補助ライトを作る。

```text
AutoLuminous / LuminousGlow
  = 発光材質そのものを光って見せる / Bloom でにじませる

Emissive Light Assist
  = 発光材質の近くに疑似 point light を置き、周囲に色を乗せる
```

両者は置き換え関係ではなく、併用前提とする。

## 想定ユースケース

### ステージ

- ネオン看板
- 街灯
- ライブステージの発光パーツ
- 床や壁の細い発光ライン
- モニターの縁や小型表示
- 魔法陣
- 窓明かり

ステージは基本的に動かないため、読み込み時に発光材質を検出し、代表点ライトを静的に生成すればよい。最初の実装対象として適している。

### モデル / アクセサリ

- ミクさんの髪飾り
- 宝石
- 小型ランプ
- 発光アクセサリ
- 魔法エフェクト的な小物

モデル側はダンスで動くため、ライト位置の追従が必要になる。ただし、MMD モデルに含まれる AutoLuminous 対象材質は多くないことが多く、髪飾りや小物程度であれば、少数ライト化で実用範囲に収まる可能性がある。

## 処理イメージ

```text
AutoLuminous 対象材質を検出
  ↓
材質ごとの頂点 / 三角形 / bounds を収集
  ↓
発光色・強度・材質名・面積でスコアリング
  ↓
巨大材質や除外対象を間引く
  ↓
材質内の頂点群を代表点へ圧縮
  ↓
上位 N 件のみ補助ライト化
  ↓
必要に応じて AutoLuminous 強度やモーフに同期
```

重要なのは、頂点を直接ライト化しないこと。

```text
悪い初期案:
  AL 頂点 1 個 = point light 1 個

現実的な案:
  AL 材質の小さな塊 = point light 1 個
  細長い発光材質 = 長軸方向に 2 - 4 個
  巨大発光材質 = point light 化しない
```

## ライト生成ルール案

入力候補:

- AutoLuminous 対象判定
- emissive color
- emissive intensity
- diffuse / ambient / shininess など MMD 材質由来の発光近似値
- 材質名
- メッシュ / sub mesh の bounds
- 頂点数
- 三角形面積
- スキニング情報
- 材質モーフや AutoLuminous モーフによる強度変化

優先候補:

- AutoLuminous 対象
- emissive が強い
- 面積が小さい
- 材質名に `light`, `lamp`, `neon`, `glow`, `AL`, `発光` などを含む
- ステージの固定発光部
- アクセサリの小型発光部
- 宝石、髪飾り、小物

除外候補:

- 顔
- 肌
- 髪全体
- 服の大面積材質
- 白い布
- 巨大スクリーン
- 巨大な床面発光
- 面積が大きすぎる材質
- 明度は高いが発光用途ではなさそうな材質

## 代表点の作り方

### 小さい発光材質

材質単位の bounds center または面積加重重心を 1 つのライト位置にする。

用途:

- 髪飾り
- 宝石
- 小型ランプ
- LED パーツ

### 細長い発光材質

バウンディングボックスの長軸方向を見て、長さに応じて 2 - 4 個のライトへ分割する。

用途:

- ネオン管
- 発光ライン
- ステージの棒状ライト

点光源 1 個だけだと中央だけが強くなり、細長い発光体らしく見えにくい。少数分割で「面光源っぽさ」を近似する。

### 巨大発光材質

自動 point light 化しない。

用途:

- 大型スクリーン
- 発光床
- 巨大な魔法陣
- 背景全体に近い発光面

これらは point light 群にすると負荷と見た目が破綻しやすい。Bloom、emissive、reflection、画面空間効果、将来の別系統表現で扱う。

## モデル追従案

モデル側で毎フレーム skinned vertex を CPU へ読むのは避けたい。

最初の近似としては、読み込み時に AL 材質の頂点の bone weight を集計し、最も影響が強いボーンへライトを attach する。

```text
AL 材質の頂点を調べる
  ↓
bone weight を集計
  ↓
dominant bone を決める
  ↓
bone local offset を保存
  ↓
light を bone transform に追従
```

髪飾り、宝石、小物であればこの近似で十分自然に見える可能性が高い。服全体や髪全体のような大きい材質は除外ルールで弾く。

アクセサリの場合は、まずアクセサリ root transform への追従から始める。ボーン追従より実装難度が低く、ステージとモデルの中間として扱いやすい。

## UI 案

```text
Emissive Light Assist
発光材質ライト補助

[ ] 有効化 Experimental

対象:
[ ] ステージ
[ ] アクセサリ
[ ] モデル

品質:
OFF / Low / Medium / High / Experimental

最大ライト数:
8 / 16 / 32 / 64

強度倍率:
0.0 - 5.0

照射距離:
0.1 - 10.0

[ ] 巨大材質を除外
[ ] AutoLuminous 点滅に同期
[ ] モーフ強度に同期
```

保存対象:

- enabled
- target scopes
- quality preset
- max lights
- intensity multiplier
- range multiplier
- exclude large materials
- sync AutoLuminous / morph strength
- per material include / exclude override

## 品質プリセット案

### Low

- 最大 8 lights
- ステージのみ
- 巨大材質除外
- デフォルト推奨候補

### Medium

- 最大 16 lights
- ステージ + アクセサリ
- 小型発光材質のみ

### High

- 最大 32 lights
- モデル小物も対象
- ボーン追従ライトを許可

### Experimental

- 最大 64 lights 以上
- Clustered Lighting / Forward+ 前提の検証枠
- 非常に重くなる可能性がある
- 静止画、動画出力、上級者向け

## 実装段階案

### Phase 1: 手動補助ライト

- point light を手動で追加できる
- 位置、色、強度、距離を設定できる
- プロジェクト保存 / 読み込みに対応する
- 後の自動生成ライトと同じ内部データ構造を使う

### Phase 2: ステージ発光材質ライト化

- ステージの AutoLuminous 対象材質を検出する
- 静的な代表点ライトを自動生成する
- 最大ライト数を制限する
- 除外ルールと材質単位 override を用意する

### Phase 3: アクセサリ / モデル小物対応

- アクセサリ root transform に追従する
- モデル小物は dominant bone へ追従する
- 小型発光材質のみ対象にする
- 誤爆時に材質単位で無効化できる UI を用意する

### Phase 4: AutoLuminous / モーフ同期

- AutoLuminous の点滅や強度変化に合わせて補助ライト強度を更新する
- 材質モーフによる発光強度変化へ同期する
- キーフレームによる ON / OFF を検討する

### Phase 5: 多灯最適化

- Babylon.js の多灯描画経路、Clustered Lighting / Forward+ 相当の利用可否を公式情報と実装で確認する
- WebGPU / WebGL2 fallback の差を測る
- 8 / 16 / 32 / 64 lights の実用ラインを決める
- MMD Standard material / toon / outline / shadow との相性を確認する

## パフォーマンス検証項目

- 通常ライトのみの FPS
- 8 lights 追加時の FPS
- 16 lights 追加時の FPS
- 32 lights 追加時の FPS
- 64 lights 追加時の FPS
- 動画出力時の 1 フレームあたり処理時間
- VRAM 使用量
- 初回ライト生成コスト
- モデル 1 体 + ステージ 1 つの標準構成での実用性
- WebGPU / WebGL2 fallback の差
- shadow caster / receiver との相互作用
- LuminousGlow / Bloom との併用時の見た目

## 注意点

- 標準機能として常時 ON にしない。
- 低スペック環境では重くなる可能性がある。
- MMD 的な見た目補助であり、物理的に正確な照明ではない。
- 自動判定は誤爆する可能性がある。
- 顔、肌、服、髪全体などを誤って光源化しないようにする。
- 巨大な発光面を点光源群に置き換えない。
- LuminousGlow / Bloom / shadow / toon との併用で見た目が破綻しないか確認する。
- UI に入れる場合は、表示だけでなく初期値、保存 / 読み込み、backend 切替時の同期まで確認する。

## 最初の判断

この案は MMD_modoki の実験機能として有望。

理由:

- MMD 資産には AutoLuminous 前提で「光らせたい箇所」がすでに設定されていることが多い。
- その情報を使えば、ユーザーが個別に点光源を置く手間を減らせる。
- モデル側の AL 材質は髪飾りや小物程度に収まるケースが多く、少数ライト化しやすい。
- ステージ側の街灯やネオンは静的で、最初の実装対象に向いている。
- GI ではなく補助ライトとして割り切れば、MMD らしい演出を壊しにくい。

最初に試すなら、`ステージ固定 AL 材質 -> 静的な少数 point light` がよい。モデル追従や clustered lighting 前提の多灯化は、その後の検証段階に回す。
