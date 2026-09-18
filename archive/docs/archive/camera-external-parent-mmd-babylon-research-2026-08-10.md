# カメラ外部親: MMD / babylon-mmd 調査・実装 2026-08-10

## 現在の実装方針

2026-08-10 の操作確認を受け、MMD_modoki のカメラ外部親は **通常のビューポート操作を維持する full transform 方式** とする。

- 外部親登録後も通常時と同じ orbit / pan / zoom の操作感を維持する。
- 登録時はカメラ中心 XYZ・カメラ回転 XYZ・距離をすべて `0` にする。
- 親ボーンのワールド行列をカメラ位置・注視点・up vector へ適用する。
- 親ボーンの移動だけでなく回転にも追従する。
- 親ボーンの移動・回転は描画変換として一度だけ適用し、カメラ固有の移動・回転数値へ複製しない。
- 外部親中のカメラ回転はその場回転にせず、親ボーン位置を orbit の回転中心としてカメラ移動 XYZ のオフセットを回す。
- 中ボタンドラッグは画面平面上の移動量を親回転・カメラ回転の逆変換でローカル XYZ へ戻し、カメラ位置と実注視点を同じ差分で移動する。
- 外部親中の距離は `0` に固定する。
- wheel / zoom drag は距離ではなくカメラ中心 Z を変更する。wheel の正方向は中心 Z の負方向へ加算する。

本家 MMD のカメラ外部親も親ボーンの移動と回転に追従する。したがって、現在の full transform 方式における回転追従は MMD と異なる独自挙動ではなく、互換上必要な基本挙動として扱う。

## 2026-08-10 認識訂正

当初、nanoem の `PerspectiveCamera::boundLookAt()` が外部親ボーンの `worldTransformOrigin()` とカメラの `lookAt()` を加算している点だけから、「MMD 本家のカメラ外部親は親回転を継承しない」と推定した。この推定は誤りだった。

`boundLookAt()` は nanoem 内部の注視点解決処理の一部であり、それだけを根拠に MMD 本体のカメラ姿勢全体や回転追従仕様を断定できない。以後、nanoem の実装は比較資料として扱い、MMD 本体仕様の代用にはしない。

本プロジェクトでは次を正しい前提とする。

- 本家 MMD のカメラ外部親は親ボーンの移動に追従する。
- 本家 MMD のカメラ外部親は親ボーンの回転にも追従する。
- MMD_modoki でも camera position / target / up に親ボーンの full transform を適用する。
- 親移動・親回転はカメラ固有の移動・回転へ書き戻さず、二重適用を防ぐ。
- 外部親登録時のカメラ中心 XYZ と回転 XYZ は `0` から開始する。
- 登録後のカメラ移動 XYZ は親ボーン原点からの相対オフセットであり、カメラ回転時は親ボーン原点の周囲を回る。
- 外部親中は距離 `0` とし、ズーム値はカメラ中心 Z へ入れる。
- 登録解除時の端数処理については本家実機との比較を継続する。

MMD Ver.9.03 の更新記録にも、外部親を外す際に「相対位置・角度」を自動計算する仕様が記録されている。少なくとも外部親状態を位置だけの関係として扱う説明とは整合しない。

## babylon-mmd との責務分担

`babylon-mmd` の `MmdCamera` は `target / rotation / distance / fov` から MMD 型 orbit camera を計算する。標準 VMD のカメラトラックには親モデル名・親ボーン名がないため、外部親選択とフレーム単位のステップ評価は MMD_modoki 側で保持する。

現在は `MmdCamera` に親ローカルの orbit 値を保持し、描画時に MMD_modoki 側で親ボーンのワールド行列を合成する。

## 実装範囲

- カメラパネル専用の親モデル / 親ボーン選択と登録 UI。
- 定期的なカメラ UI 同期中も、登録前の親モデル / 親ボーン選択を保持する。
- 現在フレームへの外部親登録。`なし` の登録は解除キー。
- 外部親選択とゼロ化したカメラ値を同じカメラキーへ登録し、同フレームの旧キーで登録状態が戻らないようにする。
- カメラキーの copy / move / delete / Undo / Redo と外部親状態の一体処理。
- project には配列 index ではなく `model path + bone name` を保存。
- 描画時の full parent transform を pure helper 化。
- 親移動・親回転の追従。
- 親移動・親回転をカメラ移動・回転数値へ複製しない単一適用。
- 親ボーン位置を回転中心とするカメラローカル orbit。実注視点は pan に追従する。
- 外部親中の距離 `0` 固定と、rotate / pan / center-Z zoom。

## 保存形式の境界

- `.mmdmodoki` project: 外部親トラックを保存・復元する。
- 標準 VMD: 親モデル / 親ボーン識別子を保存できない。
- PMM 入出力: 現在は未対応。
- VMD 用 world bake: 将来の別機能として扱う。

## 検証

- unit: full parent transform、外部親ステップキー helper。
- Electron E2E: 登録前の UI 選択保持、登録時に移動・回転・距離が `0`、距離入力無効化、wheel正方向が中心 Z の負方向へ入る、中ボタンドラッグでカメラ位置と実注視点が同じ差分だけ画面平面へ移動すること、親移動・親 90 度回転への追従、親ボーン位置を中心とするカメラ回転、親変換がカメラ数値へ複製されないこと、登録 / 解除のステップ評価、Undo / Redo。
- project: 外部親トラックの保存・復元。

## 参照

- [nanoem `PerspectiveCamera.cc`（比較実装。MMD 本体仕様の根拠としては使わない）](https://github.com/hkrn/nanoem/blob/main/emapp/src/PerspectiveCamera.cc)
- [babylon-mmd `MmdCamera` source](https://github.com/noname0310/babylon-mmd/blob/master/src/Runtime/mmdCamera.ts)
- [babylon-mmd: VMD と VPD の概要](https://noname0310.github.io/babylon-mmd/ja/docs/reference/understanding-mmd-behaviour/introduction-to-vmd-and-vpd/)
- [MMD の使い方 カメラ操作パネル ～ボーン追従～](https://www.youtube.com/watch?v=HVWFlpfVVAM)
- [MikuMikuDance Ver.7.12 更新内容の記録](https://mikudan.blog.fc2.com/blog-entry-233.html)
- [VPVP wiki: MikuMikuDance Ver.7.30以降の更新履歴（Ver.9.03 外部親の相対位置・角度）](https://w.atwiki.jp/vpvpwiki/pages/476.html)
