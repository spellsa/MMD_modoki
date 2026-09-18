# v0.2.0 リリース前レビュー: モデル・アクセサリ・テクスチャ読み込みの寛容性とエラー処理

- レビュー日: 2026-07-03
- 対象テーマ: PMX読み込み / .xパーサー(SJIS自動判定) / DDS・テクスチャ読み込み / 欠落テクスチャ処理
- 深刻度タグ: [Blocker] = リリース前必須 / [Later] = v0.2.x 送り可
- 観点: (1)不正・破損ファイルで未処理例外にならないか (2)欠落テクスチャの警告+継続が全経路で貫かれているか (3)巨大ファイル・異常値への防御 (4)SJIS判定誤爆でパース暴走しないか

---

## 1. src/scene/dds-texture-compat.ts (302行, 全読)

### 概要

DDS ヘッダ検査(`inspectDdsTexture`)、WebGPU + S3TC 非対応時のスキップ判定、
DXT1/DXT3/DXT5 の CPU RGBA 展開(`decodeDdsTextureToRgba`)。pure 関数群。

### 指摘

- **[Blocker 候補(呼び出し側の catch 有無で確定→ファイル6)] ヘッダ異常値での例外/OOM(観点1・3)**
  - `width` / `height` を **Int32 で読む**(L36-37)ため負値がそのまま通り、
    `new Uint8Array(info.width * info.height * 4)`(L76)が **RangeError を throw** する。
  - 逆に巨大値(例: 破損ヘッダの 0x40000000)では**確保サイズが数GBになり OOM でレンダラごと落ちる**
    余地がある(RangeError は catch できるが、OOM は catch 不能)。
  - `headerSize`(L38)も未検証で、`dataOffset` が byteLength を超えても decode が走る。
  - 推奨修正: `inspectDdsTexture` で `width/height` を 1〜16384 に、
    `dataOffset` をデータ長以下に検証し、範囲外は null を返す(数行で済む)。
    加えて「必要ブロックバイト数 <= byteLength - dataOffset」の切断チェック。

- **[Later] 途中切断された DXT5 で `BigInt(undefined)` が TypeError を投げる(観点1)**
  `applyDxt5Alpha` の `BigInt(bytes[offset + 2 + index])`(L219-221)は、データ末尾を越えると
  `bytes[...]` が undefined になり **TypeError: Cannot convert undefined to a BigInt**。
  DXT1/DXT3 経路は `undefined | x → 0` で暗黙にゼロ埋めされ throw しない(結果はゴミだが継続)ため、
  DXT5 だけ挙動が異なる。呼び出し側で catch されていれば警告+スキップに落ちるが、
  上記の切断チェックを入れればこの経路ごと消える。

### 問題なしと確認した点

- マジック番号と 128 バイト最小長の検査があり、サイズ0・非DDSファイルは null で安全に弾かれる(L33-34)。
- 4の倍数でない寸法は px/py の境界チェック(L179, L182, L202-205 等)で正しく処理。
- DXT1 の 3色+透明モード / 4色モードの分岐、DXT5 の 8段/6段 alpha テーブルは仕様どおり。
- DX10 拡張ヘッダの fourCc は `isCompressed=false` になり decode 対象外(null 返し)で安全。
- `isDdsTexturePath` はクエリ/フラグメント除去後に拡張子判定しており、URL 形式でも誤判定しない。

---

## 2. src/scene/bmp-texture-compat.ts (188行, 全読)

### 概要

32bit BMP の alpha 対応デコード(BGRA→RGBA、白マット除去、透明部への RGB bleed)。pure 関数。

### 指摘

- **[Later] 巨大 BMP での bleed 処理コスト(観点3、軽微)**
  `bleedTransparentRgbFromAlpha` は最大16イテレーション × 全ピクセル × 8近傍走査(L144-187)。
  実データが存在する巨大 BMP(例: 8192×8192)では数秒単位のブロッキングになりうる。
  クラッシュはしないので Later(寸法上限を設けるなら DDS 側と合わせて)。

### 問題なしと確認した点(このファイルは防御の手本になっている)

- マジック・最小長・DIB ヘッダサイズ・planes・bitsPerPixel(32のみ)・compression(BI_RGB のみ)を
  全て検証し、対象外は null で通常ローダーへ返す(L27-40)。
- **`requiredBytes = dataOffset + rowStride*height <= byteLength` の切断チェックがある**(L45-46)。
  途中切断・dataOffset 異常・偽拡張子はすべてここで null になり、例外経路がない。
  DDS 側(セクション1)に欠けているのはまさにこの1行。
- `width <= 0` / `height == 0` を拒否し、負 height は top-down として正しく処理(L39-43)。
  確保サイズはファイル実サイズ以下に制約されるため、ヘッダ詐称による OOM もない。
- ループはすべて検証済み寸法内で、境界外読み出しなし。

---

## 3. src/x-file-loader.ts (1012行, 全読)

### 概要

.x アクセサリのテキストパーサー(自前 lexer + 再帰下降)+ Babylon SceneLoader プラグイン。
UTF-8/Shift-JIS 自動判定(`decodeXText`)、テクスチャ解決(`getFileInfo` / `findNearbyFile` IPC +
拡張子候補)、sph/spa 複合参照、MmdStandardMaterial 構築。

### 指摘

- **[Later] `tri()` 経路(明示法線なし)は頂点インデックスを検証しない(観点3)**
  明示法線ありの経路は `x.pos[offset] ?? 0` で範囲外を 0 に落とす(L545-553)が、
  法線なしの `tri()` 経路(L470-482)は負・範囲外インデックスをそのまま
  `vd.indices` に渡す。`ComputeNormals` は NaN を生むだけで throw せず、WebGPU の
  robustness で GPU 側も落ちないため**クラッシュには至らない**(表示は崩れる)。
  一貫性のため tri 側にも clamp(`0 <= idx < 頂点数` の除外)を入れるのが望ましい。

- **[Later] バイナリ .x は「Unsupported X format 'bin'」で例外終了(観点1)**
  ヘッダの `bin` / `tzip` / `bzip` は明示 throw(L446-447)。MMD アクセサリにはバイナリ .x も
  実在するため、v0.2.x でエラーメッセージをユーザー向け文言(「テキスト形式のみ対応」)に
  変えるか対応を検討。throw 自体は呼び出し側の catch 次第で安全(→ファイル4で確認)。

- **[Later] ファイルサイズのガードがない(観点3)**
  lexer は全文をトークン配列化する(L57-124)。偽拡張子の巨大ファイル(動画を .x に
  リネーム等)では、ヘッダ検査(`parseX` 冒頭)より**前に** `dataToText` → 全文デコードが
  走るため、デコード+正規表現でメモリ・時間を消費する。ヘッダ 16 バイトの先行チェックを
  デコード前に入れると安く弾ける。クラッシュではないので Later。

### 問題なしと確認した点

- **Shift-JIS 判定は「置換文字(U+FFFD)が少ない方を採用」方式(L451-459)で、
  誤爆してもパーサーが暴走する経路はない(観点4)**:
  - 誤判定の結果は文字化けトークンになるだけで、`expectId` / `expectSym` / `num` が
    型付き Error を throw して即座に終了する(L370-401)。
  - lexer・parser の全ループは毎周でインデックスを前進させる(lexer の不明文字は
    i+=1 スキップ L121、`skipObj` は必ず take L330-343、`sep` は非区切りで break)。
    **無限ループ・暴走の余地なし**。
- 頂点数・面数のカウント値(`vc` / `fc`)は事前確保に使われず push ベースのため、
  カウント詐称(10億など)でもトークンが尽きた時点で「Expected number」throw で止まる。
  負のカウントはループがスキップされるだけ(観点3)。
- 面のマテリアルインデックスは clamp 済み(L840, L849, L861)。SubMesh 再構築も
  rebuilt.length===0 のフォールバックがある(L873-884)。
- 欠落テクスチャは `getFileInfo` + 拡張子候補 + `findNearbyFile` で解決を試み、
  見つからなければ **warn + texture なしで継続**(L742-747)。観点2のポリシーに合致。
- 文字列リテラルの `\` エスケープ、EOF 途中termination も lexer が安全に処理(L76-102)。
- `.sph/.spa` 複合参照(`tex.png*sphere.sph`)の分解は正規表現1回で、失敗時は
  通常テクスチャ扱いへフォールバック(L661-682)。

---

## 4. src/mmd-manager-x-extension.ts (1517行, 全読)

### 概要

MmdManager への prototype 拡張。`loadX` / `loadGlb`(アクセサリ読み込み)、
可視・transform・親子付け・transform キーフレーム管理、ボーン追従の
onBeforeRender 同期。

### 指摘

- **[Later] 読み込み後半での失敗時にシーンへ部分生成物が残る(観点1、軽微)**
  `loadX` は `loadXIntoScene`(シーンへ mesh/material を生成)**後に**
  「No mesh data found in X file」判定で throw する(L1149-1151)ため、
  メッシュ0件でも TransformNode 群がシーンに残る。`loadGlb` も
  `container.addToScene` 後の失敗で同様。クラッシュ・継続不能にはならないが、
  失敗時に生成済みノードを dispose するとより清潔。

- **[情報] GLB デバッグフラグが有効のまま(スコープ境界)**
  `GLB_DEBUG_FORCE_NEON_MATERIAL = true` / `GLB_DEBUG_SHOW_BOUNDING_BOX = true`(L111-112)で、
  GLB アクセサリは強制ネオン色+バウンディングボックス表示になる。読み込み寛容性とは
  無関係だが、リリースビルドに残すか要判断(本テーマ外のため指摘のみ)。

### 問題なしと確認した点(観点1・2の中心)

- **`loadX` / `loadGlb` は全体が try/catch で包まれ、`logError` + `onError` トースト +
  `return false` で完結する(L1139-1183, L1190-1245)。**
  x-file-loader が throw する全エラー(Invalid X header / Unsupported X format /
  Expected ... / Invalid number)はここで吸収され、**壊れた .x でアプリは落ちない**。
  - サイズ0ファイル: 空文字列 → ヘッダ不一致 throw → catch ✓
  - 偽拡張子(バイナリ/画像等): ヘッダ不一致 or 「Unsupported X format」throw → catch ✓
  - 頂点数0: buildMesh が null → meshes 0件 → 明示 throw → catch ✓
  - `readBinaryFile` が null(読めないパス)→ 明示 throw → catch ✓
- ボーン追従の毎フレーム同期(`syncAccessoryAttachment`)は、親モデル消失 → anchor を
  identity へ、親ボーン消失 → parentBoneName を null 化してモデル直付けへ、と
  全経路で graceful degradation(L1038-1068)。レンダーループ内で throw する経路がない。
- アクセサリ transform キーフレームの挿入(`insertFrameNumbers` / `insertFloatValues`)は
  非有限値を 0 に落とし(L899)、frame リストと値配列の整合が保たれる。
- `clearAccessories` は entries から pop してから dispose する(L1281-1284)ため、
  onBeforeRender の同期ループが disposed entry を触る隙がない。

---

## 5. src/assets/model-asset-service.ts (1437行, 全読)

### 概要

`loadPMX` 本体。babylon-mmd の `ImportMeshAsync` を呼び、材質互換処理・影・診断ログ・
runtime model 生成・ModelInfo(ボーン/モーフ/剛体メタデータ)構築を行う。
PMX バイナリの解析自体は babylon-mmd 側(本レビューでは「throw された時にアプリが
落ちないか」を確認)。ファイルの過半は診断ログ用ヘルパー。

### 指摘

- **[Later] 読み込み後半での失敗時に「ゾンビモデル」が残る(観点1)**
  `ImportMeshAsync` 成功後、`createMmdModel`(物理構築含む)や後続処理で throw した場合、
  catch で warn+toast は出るが、**シーンに import 済みメッシュが有効化されたまま残る**
  (sceneModels に登録されないため UI から削除・管理できない)。shadow caster 登録も残る。
  壊れた剛体/ボーンデータを持つ PMX で起こりうる。catch 内で `result.meshes` を
  dispose するクリーンアップを v0.2.x で追加推奨(x-extension と同型の課題)。

- **[情報] 剛体 shapeSize の NaN が素通りする(観点3、軽微)**
  `Number(rawShapeSize[0] ?? 0.5)` は文字列や NaN をそのまま NaN にする(L1250-1254)。
  用途は UI/ビジュアライザ表示のみで物理は babylon-mmd がメタデータから直接構築するため
  実害は表示崩れ止まり。

### 問題なしと確認した点(観点1・3の中心)

- **`loadPMX` 全体が try/catch で包まれ、babylon-mmd パーサーの throw(サイズ0・途中切断・
  偽拡張子の PMX)は `logError` + `onError` トースト + `return null` に収束する**(L1425-1436)。
  呼び出し側(mmd-manager.loadPMX → ui/importer)は null を「読み込み失敗」として扱う設計。
- **`suspendSceneRendering` は `renderingSuspended` フラグで管理され、失敗時も catch で
  `resumeSceneRendering` される**(L1054, L1064-1065, L1426-1428)。
  壊れたモデルを読んでも描画停止状態に取り残されない(状態復帰 OK)。
- メッシュ0件は明示 throw で失敗扱い(L1092-1095)。頂点数0のメッシュは shadow caster
  登録をスキップ(L1163)しつつ読み込み自体は継続。
- メタデータ(bones / morphs / rigidBodies / displayFrames)は全て `Array.isArray` +
  個別 null ガード付きで走査し、欠損フィールドは既定値に落ちる(L1215-1326)。
  負の boneIndex / ik.target は明示的に除外(L1262, L1274-1280)。
- `waitForMmdMaterialPluginsReady` は 2.5 秒のタイムアウト付きポーリングで、
  シェーダープラグイン初期化が終わらなくてもハングしない(L661-691)。
- 診断系ヘルパーは材質呼び出しを個別 try/catch(`safeBooleanCall` 等)で包み、
  診断自体が落ちる経路を塞いでいる。material dirty 復元も二段 catch(L573-584)。

---

## 6. src/mmd-manager.ts (部分読: L3755-3875 背景メディア, L6750-7230 テクスチャパイプライン)

### 概要

babylon-mmd の textureLoader を WebGPU 時に patch し、(a) S3TC 非対応時の DDS CPU fallback、
(b) 32bit BMP alpha fallback、(c) 欠落テクスチャの warn+スキップ、(d) 非POTの mipmap 抑制を
差し込む。`file:exists` IPC は `localFileExistsForUrl` 経由で欠落判定に使う。

### 指摘

- **[Later(セクション1の Blocker 候補の確定判断)] DDS decode の例外は「アプリクラッシュ」には
  ならないが、buffer 経路だけ catch がなくモデル全体の読み込み失敗になる(観点1・2)**
  - URL 経路(`loadTextureAsync` patch)は fallback 呼び出しを try/catch で包み、
    失敗時は **warn + null(そのテクスチャだけスキップ)**(L7086-7095)。ポリシーどおり。
  - **buffer 経路(`loadTextureFromBufferAsync` patch)は catch なし**(L7150-7159)。
    セクション1の RangeError(負寸法)/ TypeError(切断 DXT5)がここから伝播すると、
    babylon-mmd 経由で loadPMX の catch まで上がり、**破損テクスチャ1枚でモデル全体が
    読み込み失敗**になる(トースト表示で継続、アプリは落ちない)。
  - 従って観点1の「アプリごと落ちる」経路は、寸法が 1〜4GB 確保帯に収まる詐称ヘッダでの
    **OOM のみ**(catch 不能だが発生条件は狭い)。
  - 修正推奨(v0.2.x 前半): (1) buffer 経路にも URL 経路と同じ try/catch、
    (2) セクション1の寸法・切断検証。両方合わせて数行。

- **[情報] 非画像系拡張子(.tga 等)の欠落は babylon-mmd 側の処理に委ねられる(観点2)**
  warn+スキップの明示処理は「ブラウザで寸法確認できる画像形式」
  (png/jpg/jpeg/gif/webp/bmp、L6745-6754)に限定。欠落 .tga /.dds は
  originalLoadTextureAsync に流れ、babylon-mmd のエラー処理次第(調査メモの記述とも一致)。
  実モデルで欠落 .tga がロードを止めないかは手動確認が安い。

### 問題なしと確認した点

- **欠落テクスチャの warn+継続ポリシーは主要経路で貫かれている(観点2)**:
  `fileExists`=false → 即 null 判定(L6779-6780)、存在しても画像として壊れている場合は
  `Image.onerror` → null → 「texture file missing or unreadable; skipped」warn + null 返し
  (L7124-7129)。**存在しない/壊れた画像でモデルロードは止まらない**。
- fallback テクスチャはキャッシュ(promise)+ dispose 時のキャッシュ削除(L6946-6948)で、
  同一テクスチャの再デコードと leak を防いでいる。assetContainer への登録もあり、
  モデル破棄時に fallback テクスチャも回収される。
- BMP fallback は decoder 自体が防御的(セクション2)で、alpha なし/非対応形式は null →
  通常経路へフォールバック(L6987-6990)。
- 背景画像/動画の読み込みは resolve/reject + settled ガード + エラー時 dispose が揃い
  (L3764-3793, L3834-3874)、呼び出し側(project-importer)は catch して warning +
  `clearBackgroundMedia()` で継続する(前回レビューで確認済み)。

---

## 7. src/main.ts / src/preload.ts (部分読: file 系 IPC ハンドラ L886-1020 / preload L33-42)

### 概要

`file:readBinary` / `file:getInfo` / `file:exists` / `file:findNearby` の main process 実装と
preload の invoke ラッパー。

### 指摘

- **[Later] `fs.readFileSync` が main プロセスを同期ブロックする(観点3、軽微)**
  `file:readBinary`(L886-897)は同期読みで、偽拡張子の巨大ファイル(動画を .x に
  リネーム等)では全量をメモリに載せつつ main スレッドを塞ぐ。クラッシュはしないが、
  x-file-loader 側のヘッダ先行チェック(セクション3)と合わせてサイズ上限を検討。

### 問題なしと確認した点

- 4ハンドラすべて try/catch 完備: readBinary/getInfo は失敗時 null、exists は false を返す
  (L886-923)。**IPC 例外が renderer に伝播して未処理 rejection になる経路はない**。
- `findNearbyFileSync` は深さ上限(2)+ visited セット付き BFS で、シンボリックリンク循環や
  巨大ディレクトリでも暴走しない(L925-971)。readdir 失敗はスキップ。
  ハンドラ全体も try/catch(L1009-1016)。
- `resolveNearbyFileUrl` も祖先方向の探索を 4 段で打ち切る(L973-1007)。

---

## 総括(v0.2.0 リリース判断向け)

### [Blocker] 一覧

**なし。** 今回のテーマ(壊れた・想定外ファイルでアプリごと落ちる事故)については、
主要経路すべてで catch → warn/トースト → 継続が成立していることを確認した:
- 壊れた .x → x-extension の try/catch で吸収(セクション4)
- 壊れた PMX → loadPMX の try/catch で吸収、描画停止も復帰(セクション5)
- 欠落・破損テクスチャ → warn + スキップで継続(セクション6)
- IPC 層は全ハンドラ防御済み(セクション7)
唯一の「アプリごと落ちる」残余は、DDS ヘッダ詐称による catch 不能 OOM(発生条件が狭い)。

### [Later] 一覧(優先順)

1. **DDS ヘッダの寸法・切断検証**(セクション1)+ **buffer 経路の try/catch**(セクション6)
   — 現状は「破損 DDS 1枚でモデル全体が読み込み失敗」+ 狭い OOM 帯。両修正で
   「破損テクスチャだけスキップ」に揃う。BMP 側(セクション2)が実装の手本。
2. 読み込み後半失敗時の部分生成物クリーンアップ(PMX: セクション5 / .x・GLB: セクション4)
3. 欠落 .tga 等(非画像系)の継続性を手動確認(セクション6)
4. .x のヘッダ先行チェック+ファイルサイズ上限、バイナリ .x のユーザー向けエラー文言(セクション3)
5. tri() 経路の頂点インデックス clamp(セクション3)
6. 巨大 BMP の bleed 処理コスト(セクション2)/ readBinary の同期IO(セクション7)
7. GLB デバッグフラグ(ネオン材質・バウンディングボックス)がリリースに残っている(セクション4、テーマ外)

### 手動確認の推奨シナリオ

1. DDS ヘッダを意図的に破壊(width を負値/巨大値に書き換え)した PMX を読み込み、
   モデルロードが「テクスチャスキップで継続」せず「モデル全体失敗」になることの現状確認
   (Later 1 の修正前後で挙動比較)。
2. バイナリ .x / サイズ0の .x / 画像を .x にリネームしたファイルの読み込みで、
   トースト表示+継続を確認。
3. .tga 参照を欠落させた PMX の読み込み継続を確認(セクション6の未確認点)。
4. Shift-JIS 名(日本語テクスチャ名・ボーン名)の .x アクセサリで文字化けなく読めることを確認。
