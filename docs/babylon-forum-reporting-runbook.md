# Babylon.js Playground / 公式フォーラム投稿手順書

## 目的

Babylon.js の挙動を公式フォーラムへ相談するときに、
「どのファイルを、どこへ、どこまで貼るか」で迷わないための個人用手順書。

初回投稿では Babylon.js のバグと断定せず、最小再現と確認した事実を示して
`この構成の正式な実装経路は何か` を質問する。

この手順書で扱う現在の案件:

- `FG-SSS-01`
- PBR の PrePass SSS を中間 `RenderTargetTexture` へ描画し、
  Frame Graph へ渡すと SSS 対象だけほぼ黒くなる
- WebGPU と WebGL2 の両方で再現する

関連ファイル:

- Playground へ貼るコード:
  [`../playgrounds/pbr-skin-sss-frame-graph-webgpu/playground.js`](../playgrounds/pbr-skin-sss-frame-graph-webgpu/playground.js)
- 操作方法と実機結果:
  [`../playgrounds/pbr-skin-sss-frame-graph-webgpu/README.md`](../playgrounds/pbr-skin-sss-frame-graph-webgpu/README.md)
- 公式相談候補台帳:
  [`babylon-official-consultation-candidates-2026-07-29.md`](./babylon-official-consultation-candidates-2026-07-29.md)

## 投稿実績

- 2026-07-30 に投稿済み
- Forum: [PBR subsurface scattering becomes black with an intermediate RenderTargetTexture and Frame Graph](https://forum.babylonjs.com/t/pbr-subsurface-scattering-becomes-black-with-an-intermediate-rendertargettexture-and-frame-graph/63870)
- Playground: [#63QTUS](https://playground.babylonjs.com/#63QTUS)

## 先に用意するもの

- Chrome、Edge などのブラウザ名とバージョン
- Windows のバージョン
- GPU 名
- Direct 描画時のスクリーンショット
- Frame Graph 経由時のスクリーンショット
- 保存済み Babylon.js Playground URL

GPU 名は Windows のタスクマネージャーの
`パフォーマンス > GPU` で確認できる。

### 今回の入力済み情報

| 項目 | 内容 |
| --- | --- |
| Playground | https://playground.babylonjs.com/#63QTUS |
| Babylon.js Playground | 9.18.2 |
| OS | Windows 11 Pro 25H2（OS build 26200.8875） |
| Browser | Google Chrome 151.0.7922.72（Official Build、64-bit） |
| GPU | NVIDIA GeForce RTX 3070 |
| GPU driver | NVIDIA 595.95 |
| CPU | 11th Gen Intel Core i9-11900K @ 3.50 GHz |
| RAM | 64 GB |

PC 名、デバイス ID、プロダクト IDは再現報告には不要であり、
個人環境の識別情報になるため記載しない。

## 1. Playground へコードを貼る

1. [Babylon.js Playground](https://playground.babylonjs.com/) を開く。
2. エディター上部で `TypeScript` を選ぶ。
3. 左側のコードをすべて選択して削除する。
4. リポジトリの
   `playgrounds/pbr-skin-sss-frame-graph-webgpu/playground.js`
   を開き、**ファイルの先頭から末尾まで全文**をコピーする。
5. Playground のコード欄へ貼り付ける。
6. 先頭が次の形になっていることを確認する。

```ts
export const createScene = async function () {
```

`export` を削除したり、Markdown の `` ``` `` を一緒に貼ったりしない。

7. 上部の実行ボタンを押す。
8. 画面に通常 PBR 球と SSS 球が表示されたら、次のキーを順に押す。

| キー | 経路 | 確認すること |
| --- | --- | --- |
| `1` | Scene から画面へ直接描画 | 両方の球が正常 |
| `2` | 中間 RTT から Frame Graph copy | SSS 球だけほぼ黒 |
| `3` | 中間 RTT から Frame Graph Image Processing | SSS 球だけほぼ黒 |

補助キー:

- `S`: Scattering のオン / オフ
- `N`: `needsImageProcessing` の反転
- `I`: IBL のオン / オフ
- `L`: DirectionalLight のオン / オフ

## 2. WebGPU と WebGL2 を同じコードで確認する

Playground 右上の backend 表示から WebGPU と WebGL2 を切り替え、
どちらでも `1`、`2`、`3` を確認する。

2026-07-30 時点の確認結果:

| Backend | `1`: Direct | `2`: FG Copy | `3`: FG Image Processing |
| --- | --- | --- | --- |
| WebGPU | 正常 | SSS 球だけほぼ黒 | SSS 球だけほぼ黒 |
| WebGL2 | 正常 | SSS 球だけほぼ黒 | SSS 球だけほぼ黒 |

この結果から、投稿文では WebGPU 固有の問題とは書かない。
`PrePass SSS と中間 RTT / Frame Graph の接続経路で再現する`
と記述する。

## 3. Playground を保存する

1. 上部の保存アイコンを押す。
2. 保存後に URL が変わったことを確認する。
3. アドレスバーの URL をコピーする。
4. URL を
   `playgrounds/pbr-skin-sss-frame-graph-webgpu/README.md`
   の `Playground URL` へ記録する。
5. フォーラム投稿後は、その投稿が参照している revision を上書きしない。
   修正版を試す場合は新しい revision を保存する。

フォーラムへ貼るのはローカルファイルのパスではなく、
この保存済み Playground URL。

## 4. スクリーンショットを用意する

最低限、同じカメラ位置で次の2枚を撮る。

1. `1: Direct` の正常な表示
2. `2: FG Copy` の SSS 球だけ黒い表示

必要なら `3: FG Image Processing` と Console の
`console.table` も追加する。

スクリーンショットへ入れてよいもの:

- Babylon.js の球、床、標準アセット
- Playground の backend / version 表示
- 再現操作に必要な Console

入れないもの:

- 利用条件を確認していない MMD モデル
- `local-reference` のモデルや HDRI
- ユーザー名を含むローカルパス
- MMD_modoki のプロジェクトや個人情報

今回の最小再現は標準プリミティブだけなので、MMD モデル画像は不要。

## 5. Babylon.js フォーラムへ投稿する

1. [Babylon.js Forum](https://forum.babylonjs.com/) を開いてログインする。
2. `New Topic` を押す。
3. Category は質問・サポートに相当するものを選ぶ。
   不具合と断定できた後で Bugs 相当へ移す。
4. Title 欄へ、次を貼る。

```text
PBR subsurface scattering becomes black with an intermediate RenderTargetTexture and Frame Graph
```

5. 本文欄へ、次の英語文を貼る。
6. `[PASTE ...]` の3箇所を自分の情報へ置き換える。

```text
Hi,

I am trying to use PBR subsurface scattering with a post-processing path that renders the scene to an intermediate RenderTargetTexture and then imports/copies that texture through Frame Graph.

Playground:
https://playground.babylonjs.com/#63QTUS

Tested with Babylon.js Playground 9.18.2.

Reproduction:
1. Run the Playground.
2. Press 1: direct scene render.
3. Press 2: render to an intermediate RTT and copy it through Frame Graph.
4. Press 3: render to the RTT, apply Frame Graph image processing, and copy it to the backbuffer.

There are two spheres:
- left: regular PBRMaterial
- right: the same material with subSurface.isScatteringEnabled = true

Actual result:
- Mode 1: both spheres render normally.
- Modes 2 and 3: the regular PBR sphere renders normally, but the scattering sphere becomes almost black.
- The same behavior occurs in both WebGPU and WebGL2.
- There are no console warnings or errors.
- The repro does not use Electron, PMX/babylon-mmd, a custom MaterialPlugin, or application code.

Expected result:
The final SSS-composited color should be available to the intermediate RTT / Frame Graph path, or there should be a documented supported way to feed the composited output into Frame Graph.

Questions:
1. Is PrePass SSS expected to be composited into a user RenderTargetTexture?
2. Is importing/copying that RTT into Frame Graph a supported path?
3. Should this render pass instead be built entirely inside Frame Graph, for example with an ObjectRenderer task?
4. If this path is supported, which public texture or task should be used to preserve the SSS result?

Environment:
- Babylon.js Playground: 9.18.2
- Backends: WebGPU and WebGL2
- OS: Windows 11 Pro 25H2 (OS build 26200.8875)
- Browser: Google Chrome 151.0.7922.72 (Official Build, 64-bit)
- GPU: NVIDIA GeForce RTX 3070
- GPU driver: NVIDIA 595.95
- CPU: 11th Gen Intel Core i9-11900K @ 3.50 GHz
- RAM: 64 GB

Thank you.
```

### 今回採用するスクリーンショット

- `スクリーンショット 2026-07-30 101059 - コピー.png`
  - `1: Direct` の正常状態。通常 PBR 球と SSS 球がどちらも描画される。
- `スクリーンショット 2026-07-30 101106 - コピー.png`
  - `2: FG Copy` の異常状態。右側の SSS 球だけが黒くなる。
- `スクリーンショット 2026-07-30 101125 - コピー.png`
  - Chrome バージョンの記録用。通常は投稿画像に添付せず、本文の Environment へ転記する。

7. 本文中の `Playground:` の直下が、クリックできる保存済み URL になったか確認する。
8. Direct と FG Copy の画像を本文へドラッグ＆ドロップする。
9. 利用可能な既存タグがあれば、次から近いものだけを選ぶ。

- `frame-graph`
- `subsurface-scattering`
- `pbr`
- `prepass`
- `render-target-texture`
- `webgpu`
- `webgl`

存在しないタグを新しく作る必要はない。

## 6. 投稿直前チェック

- [ ] Playground URL を未保存のトップページ URL のままにしていない
- [ ] Playground を別ブラウザまたはシークレットウィンドウでも開ける
- [ ] `1`、`2`、`3` の操作が本文と一致する
- [ ] WebGPU と WebGL2 の両方で再現したと書いた
- [ ] Console warning / error の有無を書いた
- [ ] Babylon.js の version を書いた
- [ ] OS、browser、GPU を書いた
- [ ] MMD モデルやローカルアセットを添付していない
- [ ] 「Babylon.js のバグだ」と断定せず、対応経路を質問している

## 7. 投稿後にリポジトリへ戻す情報

次の2ファイルへ投稿 URL と日付を記録する。

- `playgrounds/pbr-skin-sss-frame-graph-webgpu/README.md`
- `docs/babylon-official-consultation-candidates-2026-07-29.md`

台帳の状態は `投稿準備中` から `投稿済み` へ変更する。

回答が来た場合は、要約だけでなく次を記録する。

- 回答者
- 回答日
- 推奨された public API / task
- 対応済み、未対応、仕様、バグのどれか
- 修正 PR / issue / Playground revision の URL
- MMD_modoki 側で採る方針

追加検証を求められた場合は、元の Playground を壊さず新しい revision を保存し、
`WebGPUでは同じ、WebGL2では違う` のように条件と結果を具体的に返信する。

## 用語メモ

- 正式名称は `Frame Graph`。`FlameGraph` ではない。
- `RenderTargetTexture` は本文で最初だけ正式名を書き、その後は `RTT` でよい。
- 今回の相談対象は SSS 単体ではなく、
  `PrePass SSS + intermediate RTT + Frame Graph` の混成経路。
