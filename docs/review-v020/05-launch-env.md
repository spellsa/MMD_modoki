# v0.2.0 リリース前レビュー: 起動シーケンス・環境差・packaged build

- レビュー日: 2026-07-03
- 対象テーマ: Electron main/preload/IPC / 起動シーケンス(WebGPU初期化・WebGLフォールバック・wasmパス解決)/ ビルド設定(packaged の MPR 未同梱と SPR fallback 表示)
- 深刻度タグ: [Blocker] = リリース前必須 / [Later] = v0.2.x 送り可

---

## 1. src/main.ts (1648行, 全読 — file系IPC L886-1020 は第3回レビューの結論を再利用)

### 概要

ログ基盤(electron-log、パス秘匿サニタイズ付き)、GPU フラグ、メイン/エクスポート
ウィンドウ生成、COOP/COEP(dev のみ)、セッションセキュリティ(packaged のみ)、
smoke テストライフサイクル、IPC ハンドラ群(dialog / file / export)。

### 指摘

- **[情報(仕様確認)] COOP/COEP ヘッダは dev のみ付与 → packaged では MPR が常に不可(観点1)**
  `configureCrossOriginIsolationHeaders()` は `if (isDev)` の中でだけ呼ばれる(L775-777)。
  packaged build は `crossOriginIsolated=false` になり、MPR は事前条件チェックで
  スキップされ SPR に落ちる — **調査メモの「packaged では MPR をスキップして SPR に
  fallback」という決定の実装**であり、意図どおり。ただし:
  - この分岐が「ヘッダ付与の条件」という離れた場所にあり、コメントもないため、
    将来 packaged MPR 対応をする際に見落としやすい。`isDev` 条件に理由コメントを推奨。
  - ユーザー向けには物理バッジが「Bullet SPR」表示になるだけで「なぜ MPR でないか」は
    出ない(ログには理由が残る)。v0.2.0 はこれで良いが、リリースノートに
    「配布版は Bullet SPR」と明記するのが親切。

- **[Later] dev と packaged でセッション挙動が大きく異なる(観点1)**
  `configureSessionSecurity()` は dev で early return(L496-498)。差分は:
  - ネットワーク遮断(http/https/ws 全キャンセル)は packaged のみ → dev で誤って
    外部フェッチに依存するコードが入っても気づけず、配布版で初めて失敗する。
  - **欠落 file:// リクエストの nearby-file リダイレクト(L508-522)も packaged のみ**
    → テクスチャ解決の挙動が dev と packaged で異なる(packaged の方が寛容)。
  - permission 拒否 / window.open 拒否 / will-navigate 制限も packaged のみ。
  「開発機では動くが配布版で死ぬ」の逆(配布版の方が挙動が多い)も含め、
  環境差の棚卸しとして docs 化を推奨。smoke:launch が packaged 相当の遮断なしで
  走っている点も含めて。

- **[Later] WebM ストリーム保存セッションがレンダラークラッシュ時にリークする(観点4周辺)**
  `webmSaveSessionMap` の後始末は `finishWebmStreamSave` / `cancelWebmStreamSave` のみ。
  エクスポートウィンドウの `closed` ハンドラ(L1591-1593)はジョブ map は掃除するが
  **開いた FileHandle と書きかけ .webm は残る**(アプリ終了まで)。
  exporter レンダラーがクラッシュした場合に温存される。`closed` 時に該当セッションを
  close+unlink する掃除を推奨。

- **[情報] `webSecurity: false` を全ウィンドウで使用(観点3)**
  ローカル PMX/テクスチャの file:// 読み込みのためで、コメントも明記(L719)。
  packaged ではネットワーク全遮断+permission/popup/navigate 拒否で実質的な露出は
  小さい。dev はその緩和がない(dev サーバー前提なので許容)。
  contextIsolation=true / nodeIntegration=false は全ウィンドウで確認(L715-720,
  L1474-1480, L1579-1585)。sandbox は Electron 既定(有効)のまま。

- **[情報] file 系 IPC は「任意パス読み書き可」のレンダラー信頼モデル(観点3)**
  `file:readBinary` / `readText` / `writeTextToPath` / `saveWebmToPath` 等はパス制限なし。
  パストラバーサル的な意味では、レンダラーは最初から任意パスを渡せる設計
  (ローカル編集アプリとして妥当。packaged はリモートコンテンツ遮断済み)。
  ファイル名を受けるものは `path.basename` + 拡張子検証で正規化されている
  (savePngToPath L1275-1276、savePngRgbaToPath L1307-1308)。
  export リクエストは数値 clamp + project format 検証付き(L346-417)。

### 問題なしと確認した点

- **観点4(初回起動)**: main プロセスは設定ファイルを読まない(設定は renderer の
  localStorage)ため「設定ファイル不在」で落ちる経路がない。ログディレクトリは
  electron-log が自動作成。`uncaughtException` / `unhandledRejection` はログに落として
  継続(L149-155)。
- ウィンドウ生成: dev は devサーバー URL + query、packaged は `loadFile` + query で
  同一のクエリ受け渡し(L419-438)— exporter モード起動の環境差なし。
- エクスポートウィンドウ起動 IPC は cleanup 関数の二重実行ガード付きで、
  失敗時に owner カウント解放+ウィンドウ close まで行う(L1421-1502, L1519-1608)。
  メインウィンドウはエクスポート中の close をダイアログでブロック(L743-761)。
- ログのサニタイズは path 系キーを basename+拡張子に落とす(L64-74)—
  ユーザーのフルパスがログに残らない。深さ・要素数制限付きで循環も安全。
- smoke ライフサイクルは timeout / did-fail-load / render-process-gone / unresponsive の
  全部で完了し、リスナー解除も行う(L592-703)。
- Linux packaged の `no-sandbox` はコメント付きの既知 workaround(L164-168)。

---

## 2. src/preload.ts (160行, 全読)

### 概要

`contextBridge.exposeInMainWorld('electronAPI', ...)` による固定 API 面。
invoke/send のラッパーのみで構成。

### 指摘

なし。

### 問題なしと確認した点(観点3)

- **生の `ipcRenderer` や動的チャンネル名を一切公開していない** — 全メソッドが
  固定チャンネルへの薄いラッパーで、レンダラーから任意チャンネルへ送る経路がない。
- イベント購読(`onWebmExportState` 等)は必ず解除関数を返し、リスナーリークを
  呼び出し側で防げる形(L93-137)。export-ui-controller の dispose と対になっている
  (第1回レビューで確認済み)。
- `getPathForDroppedFile` は `webUtils.getPathForFile` を try/catch で包み、
  失敗時 null(L25-32)— D&D 経路の未処理例外なし。
- Node API・fs・path 等の直接露出なし。API 面は types.ts の `ElectronAPI` 型と対応。

---

## 3. src/renderer.ts (505行, 全読)

### 概要

レンダラーエントリ。mode クエリで editor / PNG連番exporter / WebM exporter に分岐。
editor 初期化失敗時のオーバーレイ表示、smoke 報告、グローバル error/unhandledrejection
ロガー、shader リクエストトレース(デバッグ用)。

### 指摘

- **[Blocker] WebM exporter の catch ブロックがスコープ外の `request` を参照 —
  失敗時に ReferenceError で後始末が全て飛ぶ(観点2・4)**
  `const request` は try ブロック内で宣言(L396)されているが、
  **catch ブロック(L481-504)の失敗 progress 送信で `request.startFrame` /
  `request.endFrame` を参照している(L494-495)**。JS のブロックスコープにより、
  catch 実行時にここで **ReferenceError: request is not defined** が発生する。
  - ビルドは Vite/esbuild(型チェックなし)、`npm run lint` は eslint のみで
    **tsc の型チェック工程が存在しない**(package.json scripts 確認済み)ため、
    本来 TS2304 になるこのコードが検出されずに残っている。
  - 影響: `runWebmExportJob` が throw する**あらゆる失敗**(コーデック不対応、
    出力ファイルオープン失敗、キャプチャタイムアウト等)で、
    ① "failed" phase の progress がメインウィンドウに届かない、
    ② `finishWebmExportJob` が呼ばれない(L500 に到達しない)、
    ③ 非表示の exporter ウィンドウが閉じられず owner の activeCount が残る
    → **メインウィンドウは ui-export-lock オーバーレイが永久に消えず、
    close もダイアログでブロックされ続ける**(タスクマネージャで強制終了するしかない)。
  - 修正: `request` を try の外(`let request: WebmExportRequest | null = null`)へ
    引き上げ、catch では null ガード付きで参照する(数行)。
  - 教訓として、`tsc --noEmit` を lint/CI に追加すればこのクラスは再発しない
    (別途 Later として推奨)。

- **[Later] `tsc --noEmit` の型チェック工程がビルド/CI にない(観点4の再発防止)**
  上記 Blocker の温床。`npm run lint` への追加を推奨。

### 問題なしと確認した点

- **editor 初期化失敗のユーザー向け表示は実装されている(観点2・4)**:
  `MmdManager.create` の throw は catch され、status テキスト+ viewport オーバーレイに
  i18n 済みのエラー文言と詳細 message を表示する(L243-261)。smoke には失敗を報告。
- PNG連番 exporter は全終了経路(canvas なし / jobId なし / job 不在 / 成功 / 失敗)で
  `closeExporterWindowSoon()` を呼び、ウィンドウが残らない(L285-348)。
  main 側の `closed` → cleanup で owner カウントも解放される。
  **WebM 側も上記 Blocker を直せば同じ構造になる**(finish 失敗時の close フォールバック
  L477-480, L500-503 は用意されている)。
- グローバル `error` / `unhandledrejection` ハンドラでレンダラーの未処理例外が
  必ずログに残る(L154-165)— 観点4のセーフティネット。
- exporter モードでは busy オーバーレイ表示+ viewport オーバーレイ非表示+
  タイトル更新で進捗が見える。progress 送信は 200ms/1s のスロットル付き。
- smoke 用の localStorage 書き込みは try/catch 付き(L193-197)—
  storage 不可環境でも起動継続(観点4)。

---

## 4. src/mmd-manager.ts (部分読: エンジン初期化 L4080-4210 / wasmローダー L471-620 /
runtime・MPR 判定 L4565-4623)+ ui-controller の診断表示箇所(最小確認)

### 指摘

- **[情報(意図どおりと確認)] MPR の動的 import は dev 専用パス直書きだが、packaged では到達しない(観点1)**
  `loadBundledMprWasmInstance` は `new Function` 経由の動的 import で
  **`/node_modules/babylon-mmd/...` をハードコード**している(L503-504)。
  これは Vite dev サーバーでしか解決できないパスだが、`getMprUnavailableReason()` の
  **第一条件が `!import.meta.env.DEV` → "MPR packaged build integration is pending"**
  (L4609-4612)なので、packaged では MPR 経路自体に入らない。
  調査メモの決定(packaged は MPR スキップ)と実装が一致しており、
  仮に将来 packaged で MPR を試しても import 失敗 → catch → SPR/classic fallback で
  死なない(第4回レビューの fallback 連鎖に乗る)。
  将来の packaged MPR 対応時は、この直書きパスと COOP/COEP(セクション1)の
  両方を直す必要がある — 2箇所に分散している点だけ要注意としてメモ。

- **[Later] MPR の wasm バイナリが packaged にも同梱される(観点1、軽微)**
  `mprWasmBinaryUrl` は静的 `?url` import(L603)なので、MPR が使えない packaged にも
  wasm バイナリがアセットとして同梱される(配布サイズの無駄)。動的 import 側と同様に
  dev 限定にできるが、サイズ影響のみで動作問題はない。

- **[Later] wasm ローダーの失敗 promise がキャッシュされ再試行不能(観点4、軽微)**
  `bundledSprWasmInstancePromise` / `bundledMprWasmInstancePromise` は失敗した
  promise もキャッシュする(L472, L500)。起動時 1 回きりの初期化+fallback 連鎖が
  あるため実害はないが、将来「物理再初期化」機能を作る際は reject 時にキャッシュを
  クリアする必要がある。

### 問題なしと確認した点

- **観点2(WebGPU フォールバック)は全経路で機能する**:
  - `WebGPUEngine.IsSupportedAsync` が false → WebGL2(L4091-4096)。
  - `WebGPUEngine.CreateAsync` が throw(ドライバ差・GPU差)→ catch → WebGL2(L4116-4122)。
  - WebGL2 生成すら throw する環境では `MmdManager.create` が reject し、
    renderer.ts の catch がオーバーレイ表示(セクション3で確認)。
  - フォールバック発生は `startupDiagnostics` → `runtimeDiagnostics` →
    `showStartupRenderingDiagnostics()` の**トースト表示**+上部エンジンバッジの
    「WebGL2」表示でユーザーに伝わる(ui-controller L2647, L2709-2715 で確認)。
- **glslang / twgsl / SPR wasm / MPR wasm / HDR / ブロブ影テクスチャは全て `?url` の
  静的 import でバンドルされる**(L603-617)— packaged のネットワーク全遮断下でも
  CDN 依存なしで動く(観点1の重要確認)。SPR は静的 import(L598)+
  `module_or_path: sprWasmBinaryUrl` で、dev/packaged ともに同じ解決経路。
- WGSL シェーダーは side-effect import で全て事前登録(L543-578)—
  packaged で「シェーダーが HTML として返る」型の事故は起きない
  (シェーダートレース機構も renderer.ts にあり)。
- 実験的 wasm runtime モード(localStorage フラグ)は失敗時に classic runtime +
  `initializeClassic()` へ完全フォールバック(L4570-4585)— 観点4の localStorage 系
  実験フラグはすべて try/catch 付き読み出し(L4125-4176)。

---

## 5. forge.config.ts + vite.main/preload/renderer.config.ts (計90行, 全読)

### 指摘

- **[Later] package.json の version が 0.1.8 のまま(リリース作業リマインダ)**
  v0.2.0 リリース時のバンプ忘れ注意(ビルド設定確認中に発見。コード問題ではない)。

### 問題なしと確認した点

- **Electron fuses が模範的(観点3)**: RunAsNode=false、NodeOptions環境変数=無効、
  Node CLI inspect=無効、asar 整合性検証=有効、OnlyLoadAppFromAsar=有効、
  cookie 暗号化=有効(forge.config.ts L47-55)。asar=true。
  packaged バイナリへのコード注入面が Electron 推奨どおり閉じられている。
- vite.renderer の `optimizeDeps.exclude` に wasm 系モジュール(mpr/spr 含む)が列挙され、
  dev の事前バンドルによる wasm URL 破壊を回避(調査メモの知見の実装)。
  main/preload は素の defineConfig で、Forge Vite plugin の標準経路。
- `wgsl/` 等のバンドル外アセットは `file:listBundledWgslFiles`(main.ts L1034-1073)が
  cwd / appPath / __dirname の祖先を探索する方式で、dev(リポジトリ直下)と
  packaged(asar 内、electron の fs パッチで readdir 可)の両方をカバーする。

---

## 総括(v0.2.0 リリース判断向け)

### [Blocker] 一覧

1. **WebM exporter の失敗経路がスコープ外変数参照で自壊する(renderer.ts L494-495)**
   catch ブロックが try 内宣言の `request` を参照しており、WebM 出力が失敗すると
   ReferenceError → `finishWebmExportJob` 未呼び出し → 非表示 exporter ウィンドウ残留 →
   **メインウィンドウの export ロックが永久化し、ウィンドウを閉じることもできなくなる**。
   esbuild ビルド+eslint のみの検査体制のため型エラーとして検出されていない。
   修正は `request` の宣言を try の外へ出す数行。
   ※ 第1回レビューの Blocker(consumer デッドロック・post stack 不適用)を修正して
   失敗が正常に throw されるようになると、**この Blocker を先に直さない限り
   「失敗のたびに UI 永久ロック」になる**。修正順序に注意。

### [Later] 一覧(優先順)

1. `tsc --noEmit` を lint/CI に追加(Blocker 1 の再発防止。現状 scripts に型チェックなし)
2. WebM ストリーム保存セッションの FileHandle が exporter クラッシュ時にリーク
   (exporter ウィンドウ closed 時の掃除を追加)(セクション1)
3. dev/packaged のセッション挙動差(ネットワーク遮断・nearby-file リダイレクト・
   COOP/COEP)の棚卸し docs 化+`isDev` 分岐への理由コメント(セクション1)
4. package.json version バンプ(0.1.8 → 0.2.0)(セクション5)
5. MPR wasm バイナリの packaged 同梱(サイズのみ)/ wasm ローダーの失敗 promise
   キャッシュ(セクション4)

### 確認できた「配布版で死なない」ための守り(良い点)

- packaged の MPR 不可は `getMprUnavailableReason` の第一条件で明示的に弾かれ、
  SPR fallback + バッジ表示まで一貫(dev 専用の /node_modules 動的 import には到達しない)。
- wasm / glslang / twgsl / シェーダー / HDR等のアセットは全て `?url` 静的 import で
  バンドルされ、packaged のネットワーク全遮断下でも外部依存ゼロ。
- WebGPU 不可・初期化失敗 → WebGL2 → それも失敗ならオーバーレイ表示、の三段構え。
- contextIsolation / nodeIntegration / fuses / preload API 面は堅牢。
  IPC は全ハンドラ try/catch + 入力検証(export リクエストは sanitize 関数)。

### 手動確認の推奨シナリオ

1. **packaged build で WebM 出力を意図的に失敗させる**(出力先を読み取り専用にする等)
   → 現状は UI 永久ロックになるはず(Blocker 1 の実証)。修正後に再確認。
2. packaged build で物理バッジが「Bullet SPR」になること、smoke ログに
   "MPR packaged build integration is pending" が残ることを確認。
3. WebGPU を無効化した環境(`--disable-unsafe-webgpu` 等)で起動し、
   トースト「WebGPU unavailable. Using WebGL2.」とエンジンバッジ WebGL2 を確認。
4. 初回起動(appData 削除状態)で、ログディレクトリ自動作成と正常起動を確認。
