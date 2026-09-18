# v0.2.0 リリース前レビュー: 横断掃除(機械的スイープ)

- レビュー日: 2026-07-03
- 方式: 検索ベース+ヒット周辺のみ確認(深掘りなし)
- 深刻度タグ: [Blocker] = リリース前必須 / [Later] = v0.2.x 送り可

---

## 観点1: TODO / FIXME / HACK / XXX コメント

**検索結果: 0件**(src配下 *.ts、test除く)。日本語の「暫定/仮実装/とりあえず」も 0件。

見つかった「将来対応」系コメントは以下の2件のみで、いずれも意図的な記録:

| 場所 | 内容 | 判定 |
|---|---|---|
| main.ts:165 | Linux packaged の chrome-sandbox workaround(第5回レビュー既出) | [Later] 既知 |
| frame-graph-post-effects-controller.ts:1471 | 将来のマルチパスglare用に値の配線だけ維持 | 対応不要 |

**v0.2.0までに要対応の TODO 系コメントはなし。** タスク管理が docs/ 側に寄せられており、
コード内に宿題を残さない運用が徹底されている。

---

## 観点2: デバッグ出力の残骸・デッドコード

### console.log / debug / table / group / debugger(test除く13件、すべて用途確認済み)

| 場所 | 内容 | 判定 |
|---|---|---|
| main.ts:540, 619, 674 | `[smoke]` プレフィックスの smoke テスト進行ログ(smokeモード限定経路) | 問題なし |
| mmd-manager-x-extension.ts:716-751 | GLB import デバッグ(`console.table` 等 10件)— `isDebugLogEnabled("accessoryLoad")` ガード付きのオプトイン | 問題なし |

`debugger` 文: 0件。`console.log` の無ガード残骸: 0件。
それ以外のログは app-logger(logInfo/logWarn/logError)経由に統一されている。

### 常時有効のデバッグフラグ(第3回レビュー既出の再掲・要判断)

- **[Blocker 判定を推奨] `GLB_DEBUG_FORCE_NEON_MATERIAL = true` /
  `GLB_DEBUG_SHOW_BOUNDING_BOX = true`(mmd-manager-x-extension.ts:111-112)**
  ガードなしの定数 true で、**リリースビルドでも GLB アクセサリが全てネオン緑+
  バウンディングボックス表示になる**。GLB 読み込みを v0.2.0 の機能として出すなら
  リリース前に false へ戻す必要がある(GLB を実験扱いで隠すなら Later)。
  ※ 機械スイープで拾える「消し忘れフラグ」はこの1組のみ。

### コメントアウトされたデッドコード

**0件。** 連続 `//` コメント5行以上のブロックは src 全体に存在しない
(`/*` ブロックは mmd-manager.ts の JSDoc 89件等で、コード無効化用途なし)。

---

## 観点3: バージョン・アプリ名・年号

| 項目 | 状態 | 判定 |
|---|---|---|
| package.json version | **0.1.8 のまま**(第5回既出) | [Blocker] リリース作業でバンプ必須 |
| UI 内のバージョン表示 | 存在しない(ログの `app.getVersion()` のみ。About ダイアログなし) | [情報] 不整合は起きない構造。v0.2.x で About 追加を検討 |
| アプリ名表記 | 表示系は「MMD modoki」(index.html title / productName / ウィンドウタイトル)で統一。ログフォルダ名 `MMD_modoki`、npm name `mmd-modoki` は用途別の意図的表記 | 問題なし |
| 年号 | LICENSE = `Copyright (c) 2026 MMD_modoki contributors` — 現行年で正しい。src 内にコピーライト表記なし | 問題なし |
| ハードコード版番号 | src 内に「0.1.x / v0.2.0」のハードコード文字列なし(コメント1件のみ、方針言及で無害) | 問題なし |

---

## 観点4: LICENSE・第三者クレジット

- LICENSE: MIT / Copyright (c) 2026 — 問題なし。
- THIRD_PARTY_NOTICES.md(2026-06-13 更新)と package.json dependencies の突き合わせ:

| 依存(runtime) | notices 記載 |
|---|---|
| @babylonjs/core / gui / loaders | あり ✓ |
| babylon-mmd | あり ✓ |
| **electron-log (^5.4.3)** | **なし ✗** |
| electron-squirrel-startup | あり ✓ |
| i18next | あり ✓ |
| mediabunny | あり ✓ |

- **[Blocker] `electron-log`(MIT, https://github.com/megahertz/electron-log)が
  Runtime dependencies 表から漏れている。** notices 自身が「package.json 直接依存を列挙」と
  宣言しているため自己不整合でもある。1行追加で済むのでリリース前に対応推奨。
- [情報] mediabunny は MPL-2.0(表に記載あり)。未改変の npm パッケージ利用+notice 記載で
  要件は満たしている。
- [情報] packaged 配布物(asar)にはプロジェクト直下の THIRD_PARTY_NOTICES.md / LICENSE が
  そのまま同梱される構成(forge に ignore 設定なし)。notices の Notes にある
  「バイナリ再配布時はこのファイルと LICENSE を含める」は満たされる。

---

## 観点5: README・docs の第一印象

### README 3種(README.md / README.ja.md / README.en.md)

- 文字化けなし、構成明瞭(概要 → 機能 → ダウンロード)。3言語とも冒頭を目視確認。
- 機能列挙(PNG連番 / WebM / LUT / 5言語UI)は実装と一致。問題なし。

### docs 配下(176ファイルを機械検査)

| 検査 | 結果 |
|---|---|
| U+FFFD(置換文字) | 0件 |
| Shift-JIS 誤読パターン(縺/繧/譁 等) | **1件** |
| 相対リンク切れ(README 3種 + docs 全 .md、計176ファイル) | **0件** |
| i18n(language/)・index.html の文字化け | 0件 |

- **[Later] docs/action-dispatcher-progress-note-2026-05-18.md:102 に文字化け1行**
  表ヘッダ `| Action type | 迴ｾ蝨ｨ縺ｮ蜈･蜿｣ | 迴ｾ蝨ｨ縺ｮ蜃ｦ逅・|`(「現在の入口 | 現在の処理」の
  Shift-JIS 誤読と推定)。内部開発メモの1行でありユーザー向け文書ではないため Later。

---

## 総括

機械スイープの結果、このリポジトリの衛生状態は非常に良い:
TODO残骸ゼロ、無ガードconsole.logゼロ、デッドコードゼロ、リンク切れゼロ、README清潔。

### 要対応(リリース前)

1. **[Blocker] `GLB_DEBUG_FORCE_NEON_MATERIAL` / `GLB_DEBUG_SHOW_BOUNDING_BOX` = true**
   (mmd-manager-x-extension.ts:111-112)— GLB を機能として出すなら false へ(第3回既出の格上げ)
2. **[Blocker] package.json version 0.1.8 → 0.2.0 バンプ**(第5回既出の再掲)
3. **[Blocker] THIRD_PARTY_NOTICES.md に `electron-log` を追記**(1行)

### Later

- docs/action-dispatcher-progress-note-2026-05-18.md:102 の文字化け1行修正
- About ダイアログ(バージョン表示)の追加検討(現状 UI にバージョン表示なし)
