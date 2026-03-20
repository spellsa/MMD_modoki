# .cube LUT 取り込み実装メモ
更新日: 2026-03-20

## 目的

Babylon.js の既存 `ColorGradingTexture` は `.3dl` 中心なので、このプロジェクトでは外部 `.cube` LUT を受けて、アプリ側で runtime 用の `3dl` テキストに正規化してから適用する方針にした。

狙いは次の3点。

- 外部 LUT をファイル追加とドラッグ&ドロップの両方から読めるようにする
- 読み込んだ LUT を UI の LUT ドロップダウンに追加する
- `.cube` と `.3dl` を同じ運用フローで扱えるようにする

## 現在の方針

### 取り込み経路

- 対応拡張子は `.3dl` と `.cube`
- ファイル選択から読み込む
- ドラッグ&ドロップからも優先的に LUT として判定する
- 読み込んだ LUT はセッション内レジストリに登録し、右パネルの LUT ドロップダウンへ追加する

### 保存の考え方

- `builtin` は従来どおり built-in LUT を使う
- `external-absolute` は外部ファイルの絶対パスを保持する
- `project-relative` は既存の project state に合わせて相対パスを保持する
- 追加した LUT 一覧そのものは、現時点ではセッションスコープでよい

## 変換パイプライン

### `.3dl`

- そのまま runtime に渡す
- 変換はしない

### `.cube`

1. ファイルをテキストとして読む
2. コメントと空行を除いて解析する
3. ヘッダを読む
   - `TITLE`
   - `DOMAIN_MIN`
   - `DOMAIN_MAX`
   - `LUT_1D_SIZE`
   - `LUT_3D_SIZE`
   - `LUT_1D_INPUT_RANGE`
4. 1D か 3D かを判定する
5. 入力 LUT を評価して、runtime 用の `3dl` テキストに焼く

このプロジェクトでは、`.cube` を Babylon の内部型へ直接ねじ込むのではなく、**アプリ内で一度中間表現に変換してから `.3dl` に落とす**。

## 一般的な相互変換の考え方

`.cube` と `.3dl` の変換は、厳密には「フォーマットを写す」よりも **LUT を再格子化して再量子化する作業**に近い。

### 共通の流れ

- いったん入力 LUT を内部表現に読む
- 入力空間を 0 〜 1 へ正規化する
- 必要なら `DOMAIN_MIN` / `DOMAIN_MAX` / `LUT_1D_INPUT_RANGE` を反映する
- 目的の格子サイズで LUT を再サンプルする
- 出力側の量子化幅に合わせて丸める

### 参考になる補間方式

- `trilinear`
  - 3D LUT の基本形
  - 8 点補間で実装しやすい
- `tetrahedral`
  - 色処理ツールや LUT 系ライブラリでよく使われる
  - 3D 格子の 1 セルを 6 つの四面体に分けて 4 点で補間する
  - 色境界の見え方が trilinear より自然になることがある

### よくある実装方針

- `.cube -> .3dl`
  - `.cube` をパースして内部評価する
  - ターゲットの 3dl 格子に焼く
  - 3dl の出力レンジに合わせて整数化する
- `.3dl -> .cube`
  - 3dl を正規化して浮動小数の cube 格子に再サンプルする
  - 1D っぽい成分があるなら、分離するか 3D に焼くかを決める

### 類例の確認で見えたこと

- FFmpeg 系は `nearest` / `trilinear` / `tetrahedral` など、補間法を明示している
- darktable は `tetrahedral` をデフォルトにしていて、`cube` と `3dl` をどちらも扱う
- OpenColorIO 系は LUT を内部表現にしてから変換・再サンプルする考え方が強い
- Python / C++ / JS の実装でも、結局は「内部表現 + 補間 + 再量子化」に収束している

### `.cube` の方言サマリ

- `.cube` は単一の固定仕様というより、実務上は複数の流儀がある
- OpenColorIO は `.cube` を Iridas 系と Resolve 系の文脈で扱っていて、同じ拡張子でも前提が少し違う
- 実運用では次の3パターンがよく出る
  - `1D-only`
  - `3D-only`
  - `1D + 3D`
- Resolve 系では `1D + 3D` を shaper / prelut と本体 3D LUT に分けて使うことがある
- Resolve 17 以降では Video Range LUT metadata のような拡張メタデータも見られる
- 3D LUT の格子サイズは `17`, `33`, `65` などがよく出る
- 補間は tetrahedral が定番寄り
- 3D テーブルの並びは `R` 最速 `G` 中間 `B` 最遅として扱うのが無難
- 入力レンジや出力レンジは、`DOMAIN_MIN` / `DOMAIN_MAX` / `LUT_1D_INPUT_RANGE` などで表されることがある
- つまり `.cube` は「1つの正解フォーマット」ではなく、**方言を吸収する前提で扱う**のが安全

### 実装へ反映したこと

- `.cube` の 3D サンプル順を `R` 最速に修正した
- `.cube` の 3D 補間を tetrahedral にした
- `.cube` の 1D と 3D を分離して読み、評価順を固定した
- `.cube` の変換結果に identity blend を混ぜる案は外した
- `.cube` 専用の強度補正も外した
- いまは「LUT の内容を忠実に評価して、UI の値だけをそのまま適用する」方針

### このプロジェクトでの意味

- `3dl` は runtime 用の出力形式として扱う
- `cube` は入力フォーマットとして扱い、必要なら内部で 3dl に焼く
- 変換精度を上げるなら、補間方式と格子サイズを変換ロジックの中心に置く
- 逆に、見た目の強さ調整は変換ロジックと切り離す

## 実装メモ

### 1D LUT

- `.cube` の 1D LUT はそのまま `3dl` にできない
- いったん RGB ごとにサンプルして、runtime 側で扱える形に再サンプリングする
- `DOMAIN_MIN` / `DOMAIN_MAX` がある場合はそれを優先する
- `LUT_1D_INPUT_RANGE` がある場合はそちらも使う

### 3D LUT

- `LUT_3D_SIZE` がある場合は 3D LUT として扱う
- 3D の格子を走査して、各 RGB 点を評価して出力する
- 現行実装の補間は tetrahedral を採用している
- 出力は `3dl` の数値行へ変換する

### 1D と 3D が両方ある場合

- 1D を先に prelut として当てる
- その後で 3D LUT を評価する
- Resolve 系 `.cube` でよくある `1D + 3D` 構成を、その順番で評価する

### 1D-only の場合

- 1D LUT を 3D 表現に再サンプルして runtime 用 `3dl` に焼く
- 出力サイズは実用的な範囲に抑える
- 1D のカーブを残しつつ、Babylon 側で扱える形にする

### 出力形式

- runtime では `3dl` テキストとして扱う
- 数値は 0 〜 4095 に丸めて出力する
- 1 行目にヘッダを置く
- 2 行目以降に RGB 行を並べる

## これまで試したこと

### 試したが外した調整

- `.cube` 変換結果に identity blend を混ぜる
  - LUT ごとの差が薄くなりやすかった
  - 色味の差が見えにくくなったので外した
- UI の `LUTInt` を `.cube` だけ強く抑える
  - 100% でも 0.72, 0.5, 0.3 と段階的に下げてみた
  - 抑えすぎると LUT ごとの差が感じにくくなった

### いま残している考え方

- `.cube` の内容自体はできるだけ忠実に評価する
- 強さをいじるより、まずは変換精度を保つ
- どうしても見え方調整が必要なら、別レイヤーで扱う

## babylon-cube-luts を見てわかったこと

Babylon 向けの既存実装として `babylon-cube-luts` があるが、今回は自前実装を続ける。

理由は次のとおり。

- パーサと runtime 変換の構造がこのプロジェクトの都合と少し違う
- まだ若いパッケージで、保守の厚みは大きくない
- このプロジェクトでは、`.cube` を一度アプリ内で正規化する方が制御しやすい

このメモを書く時点での見立てでは、`babylon-cube-luts` の実装を参考にはしても、コードをそのまま写すのは避ける。

### 類例のざっくり要約

`babylon-cube-luts` がやっていることは、かなり大づかみに言うと次の流れ。

- `.cube` を読む
- `TITLE` や `DOMAIN_*`、`LUT_1D_SIZE` / `LUT_3D_SIZE` を拾う
- 1D か 3D かで分岐する
- 1D は 1D 用のテクスチャとして扱う
- 3D は 3D テクスチャとして扱う
- Babylon の post process に差し込んで、色補正として使う

要するに、**`.cube` を Babylon 向けの LUT テクスチャに変換して、そのまま描画に食わせる**実装。  
このプロジェクトのように **いったん `.cube` をアプリ内で正規化してから runtime 用 `3dl` に落とす**方針とは、出口の作りが少し違う。

## 現在の実装の特徴

- 解析は純関数寄り
- 1D と 3D を明示的に分ける
- 最終出力は runtime 用 `3dl`
- Babylon 側には変換済みテキストを渡す
- UI 側で imported LUT を選び直せる

## 現行実装の最終状態

このメモを書いている時点での、実際に動いている最終版の挙動を整理する。

### LUT 強度は raw のまま使う

- `LUTInt` は 0 〜 1 の raw 値をそのまま使う
- `.cube` だけ別に MAX を下げる補正は外した
- 強さの違いは LUT 自体と UI の値だけで決める
- 変換時に「いい感じ」に寄せる補正は今は入れない

### `.cube` の 3D テーブルは `R` 最速

- 3D テーブルは `R` が最速、`G` が中間、`B` が最遅として読む
- 配列の格納順もそれに合わせる
- これを逆にすると、緑やピンクが強く、青が落ちるような偏りが出る

### 1D + 3D は prelut → 3D

- `.cube` に 1D と 3D が両方ある場合は、1D を先に適用する
- その後で 3D を評価する
- Resolve 系の `.cube` でよくある構成に寄せている

### 3D 補間は tetrahedral

- 再サンプル時の 3D 評価は tetrahedral 補間
- trilinear より、LUT の境界や色相の出方が安定しやすい
- `.cube -> .3dl` の焼き込みでは、この補間結果をそのまま使う

### 1D-only も受ける

- 1D-only の `.cube` は、runtime にそのままは載せにくい
- いったん RGB を再サンプルして、runtime 用の `3dl` テキストへ焼き直す
- 出力サイズは実用的な範囲に抑える

### 外部 LUT の取り込み

- ファイル追加とドラッグ&ドロップの両方に対応
- 読み込んだ LUT は右パネルの LUT ドロップダウンに追加する
- 選択中の外部 LUT は既存の `external-absolute` ルートで扱う
- カスタム LUT の一覧はセッションスコープで持つ

## 今後の注意点

- `.cube` の仕様は幅が広いので、今後もサンプル LUT で確認し続ける
- `DOMAIN_MIN` / `DOMAIN_MAX` が非標準の LUT が来たときは、変換精度を要確認
- 1D LUT の扱いは、モデルや色空間によって見え方が変わりやすい
- 必要なら後で `cube` と `3dl` の UI 表示や説明を分ける

## 関連ファイル

- [src/lut-file.ts](/d:/DevTools/Projects/MMD_modoki/src/lut-file.ts)
- [src/ui-controller.ts](/d:/DevTools/Projects/MMD_modoki/src/ui-controller.ts)
- [src/render/post-process-controller.ts](/d:/DevTools/Projects/MMD_modoki/src/render/post-process-controller.ts)
- [docs/lut-wgsl-file-handling.md](/d:/DevTools/Projects/MMD_modoki/docs/lut-wgsl-file-handling.md)
