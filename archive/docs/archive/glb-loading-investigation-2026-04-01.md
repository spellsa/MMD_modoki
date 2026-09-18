# GLB 読み込み調査メモ 2026-04-01

## 概要
`.glb` を既存のアクセサリ欄から読み込めるようにすることを目的に、2026-04-01 時点で行った実装と調査の記録。

結論だけ先に書くと、現時点では:

- `.glb` のファイル選択と loader 起動までは通っている
- Babylon 側の glTF loader も動いている
- 以前出ていた依存・WGSL・PBR・WebGPU の複数のクラッシュはかなり潰せている
- ただし最終的に viewport 上でオブジェクトが見える状態にはまだ到達していない

つまり、今は「読めない」より「読めているが表示経路の最後が詰まっている」状態。

## 今回やろうとしたこと
既存の `.x` アクセサリ読込の延長として、`.glb` を静的アクセサリとして読み込めるようにする。

想定していた v1 の方針:

- `.glb` は MMD モデル扱いにしない
- アクセサリ欄から読み込む
- transform、可視切替、親子付けは既存アクセサリ経路に載せる
- animation や MMD runtime 連携はしない
- 必要なら glTF の見た目は Babylon 側に任せる

## このアプリで難しくなっている理由
Babylon 自体は `.glb` を読めるが、このアプリは普通の Babylon サンプルより前提がかなり特殊。

- `babylon-mmd` と `MmdStandardMaterialBuilder` 前提の構成
- WebGPU + WGSL-first で shader 周りをかなり触っている
- `.x` アクセサリ拡張に後から `.glb` を載せている
- カメラや表示系の初期値が MMD モデル向け

そのため、単に `SceneLoader.ImportMeshAsync` を呼べば終わる形ではなく、loader、材質、hierarchy、WebGPU 描画経路の相互作用で詰まりやすい。

## 実装したこと

### 1. `.glb` 読込導線の追加

- ファイルダイアログで `.glb` を選べるようにした
- drag & drop でも `.glb` を通すようにした
- `loadGlb(filePath)` を追加した
- `.glb` はアクセサリ欄に `[GLB]` 表示するようにした

主な変更ファイル:

- `src/ui-controller.ts`
- `src/mmd-manager-x-extension.ts`
- `src/project/project-importer.ts`

### 2. Babylon loader まわりの調整

途中で次のような問題が出たため対処した:

- `504 (Outdated Optimize Dep)`
- `@babylonjs/loaders/dynamic` の読み込み失敗
- `@babylonjs_loaders_glTF.js` の optimize dep 問題
- Babylon パッケージ間の版ズレ

対処内容:

- dynamic import をやめて静的 import 寄りに調整
- Vite 側の optimize 設定を調整
- `@babylonjs/core / gui / loaders` を `babylon-mmd` に合わせて揃えた

### 3. shader / WGSL 取得失敗の調査

`.glb` 読込後に WebGPU の shader compile error が出ていたため、Babylon の shader fetch をトレースした。

発見できたこと:

- shader を取りに行った先で `index.html` を食っているケースがあった
- `rgbdDecode.fragment` が足りていなかった

対処内容:

- `src/renderer.ts` に shader trace を追加
- 必要な WGSL を静的 import 側へ寄せた

### 4. PBR 経路を避ける方針に切り替え

ユーザー方針として `PBR` と `GLSL` に深入りしない方向に寄せた。

対処内容:

- `.glb` の材質は WebGPU 上で `StandardMaterial` fallback に変換
- `PBRMaterial` をそのまま描かないようにした
- 調査中は蛍光グリーンの単色 debug 材質にも切り替えられるようにした

### 5. hierarchy / enabled 問題の調査

glTF 由来の parent chain が `enabled = false` のままで、子 mesh まで見えなくなるケースがあった。

対処内容:

- imported `TransformNode` を `enabled = true` に寄せた
- 親 chain をさかのぼって `enabled / visible` を起こす処理を追加
- managed mesh 以外を親としてだけ残す扱いを試した

### 6. カメラと自動配置の補正

読み込み後に「読めているがカメラ外」という可能性を切るため、初期配置補正を追加した。

対処内容:

- bounds を見て自動で中央寄せ
- 床に合わせて Y を持ち上げる
- 小さすぎる場合は自動拡大
- モデル未読込時は camera target / distance を GLB に合わせる

追加ログ:

- `[GLB] Auto placed: ...`
- `[GLB] Camera framed: ...`

### 7. scale UI の拡張

`.x` と同様にアクセサリ欄の `Si` で触りやすいように調整。

対処内容:

- `.glb` にも `baseScale` 概念を追加
- scale を相対値として扱うよう修正
- スライダー上限を引き上げ

### 8. visibility / bounds / active mesh の調整

表示に関係しそうな基本フラグを一通り強制した。

- `visibility = 1`
- `isVisible = true`
- `alwaysSelectAsActiveMesh = true`
- `computeWorldMatrix(true)`
- `refreshBoundingInfo(true, true)`
- `showBoundingBox = true`
- 一時的に `edgesRendering` も試した

### 9. depth / shadow pass の切り分け

途中で `GPUVertexBufferLayout.arrayStride` による WebGPU pipeline crash が出ていた。

切り分けたこと:

- shadow pass
- depth pass
- opaque pass

対処内容:

- `.glb` を shadow caster から外した
- `disableDepthWrite` / `needDepthPrePass = false` を試した
- それでも通常描画側で落ちるケースがあった

### 10. 元 mesh を描かず replacement mesh を作る方針

最終的に、glTF が持つ元の render mesh をそのまま描かず、静的アクセサリ用の replacement mesh を作る方向へ進めた。

やったこと:

- 元の managed mesh は描画対象から外す
- replacement mesh を別に生成
- replacement に world transform をコピー
- 余計な skinning 系属性を持ち込まないようにする
- `VertexData.ExtractFromMesh(..., true, true)` を使う方向へ寄せた

## ここまでで潰せた要因
少なくとも次は主因ではなくなった、またはかなり前進した。

- loader 未登録
- Vite の optimize dep 崩れ
- Babylon パッケージ版ズレ
- `rgbdDecode.fragment` 不足
- `PBRMaterial` をそのまま WebGPU で描く経路
- glTF 親 hierarchy の `enabled=false`
- `.glb` が小さすぎるだけ、またはカメラ外なだけという単純要因
- alpha / lighting / texture の見え方だけの問題

## 現在の状態
2026-04-01 の最後の時点では次の状態。

- `.glb` はロードされる
- コンソールの致命的な shader / package / loader エラーはかなり減った
- `Auto placed` と `Camera framed` は出る
- imported mesh / transform node の debug は出る
- ただし viewport にはまだ見えない

さらに直近ログから読み取れたこと:

- imported mesh 自体の情報は取れている
- しかし replacement mesh 側の debug が出ていない回があった
- つまり「表示以前に replacement mesh が生成できていない」局面がまだある

## 現時点で有力な詰まりどころ

### 1. replacement mesh が生成できていない
`Import debug` は出るのに `Replacement debug` が出ないケースがあり、replacement が 0 件の可能性が高い。

### 2. replacement mesh は生成されても scene 参加が不完全
次に疑うべきは:

- parent 設定
- world transform の反映
- render group
- active mesh 選別
- bounds 更新

### 3. geometry 抽出元の mesh 種別が想定と違う
glTF 側で:

- 実体が `sourceMesh`
- instance 系
- interleaved / extracted geometry

のどれかに寄っていて、こちらの managed mesh 判定や抽出処理がまだ本体を拾い切れていない可能性がある。

## 今日はここで切り上げてもよい理由
今回の問題は「簡単な loader 追加」ではなく、表示経路の最後の integration 問題に入っている。

つまり今のフェーズは:

- 必須機能が壊れているわけではない
- すぐ片付く性質でもない
- ちゃんと続けるなら専用の debug をもう少し足して順に潰す必要がある

そのため、優先度が高くないならここで一度止める判断は妥当。

## 再開するときのおすすめ順

### 案1: replacement mesh のみを集中的に追う
一番本筋。

やること:

1. `Replacement debug` を必ず出す
2. replacement mesh の `name / parent / enabled / visible / vertices / indices / position / size` を plain log で確認
3. 1個だけ固定 transform で scene 原点に置く
4. それでも見えなければ geometry か render participation に絞る

### 案2: 最小の `cube.glb` で比較する
今の crab アセットが複雑なので、まず loader と表示系だけ確認する。

やること:

- 単一 mesh
- texture なし
- bone なし
- 極端に単純な `cube.glb`

で同じ経路を試す。

これで:

- `cube` は見える -> 現アセット固有問題の可能性が高い
- `cube` も見えない -> アプリ側表示経路の問題

という切り分けができる。

### 案3: 「scene に素置きする debug モード」を別経路で作る
アクセサリ統合ではなく、まず Babylon scene に見えるかだけ確認する。

やること:

- parent なし
- 自動配置のみ
- アクセサリ管理なし
- transform UI なし

の暫定デバッグ表示を作る。

これで見えるなら、問題はアクセサリ統合側に寄る。

### 案4: いったん保留して `.x / obj / stl` を優先する
優先度の観点ではかなり現実的。

理由:

- `.x` は既に使えている
- `obj` や `stl` は glTF より扱いが単純
- 汎用オブジェクト欄の価値は先に出せる

## 現実的な判断
優先度が高くないなら、現時点では次のどちらかがおすすめ。

- いったん保留して、調査メモを残したまま終了する
- 再開時は `cube.glb` と replacement mesh debug だけに絞る

逆に、今のまま広く触り続けるのは効率が悪い。

## 補足: 将来案としてのアクセサリ専用材質経路
今回の不具合そのものを直接解決するものではないが、将来的には `.x / .glb / obj / stl` をまとめるために「アクセサリ専用材質経路」を作る価値はある。

期待できること:

- 汎用オブジェクトの見た目を統一しやすい
- PBR 差を吸収しやすい
- alpha / 両面 / 軽い specular / rim を一元管理しやすい

ただし今回の本丸は、まだ材質より前の

- replacement mesh 生成
- hierarchy
- draw participation

にある可能性が高い。

## 中間結論
2026-04-01 時点の結論はこれ。

- `.glb` 対応は入口までは作れた
- crash 系はかなり潰せた
- ただし最後の表示だけまだ詰まっている
- ここから先は軽い修正より調査フェーズ寄り
- 優先度が高くないなら、いったん保留で問題ない
