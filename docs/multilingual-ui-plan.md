# 多言語UI対応メモ

この文書は、MMD modoki の UI 多言語化方針と、実際に入れた実装内容をまとめたメモです。

## 対応言語

- `ja`
- `en`
- `zh-Hant`
- `zh-Hans`
- `ko`

MMD ユーザーが多い地域を優先し、中国語は繁体字と簡体字を分けて扱う。

## 方針

- 既存の Electron + DOM 構成を維持する
- React 前提の i18n は入れない
- 翻訳辞書は `language/` 配下に言語ごとの JSON として置く
- 言語切替は上部ツールバーのドロップダウンで行う
- UI フォントはアプリ同梱の CJK フォントを使う

## 実装済み

### i18n 基盤

- `src/i18n.ts` で `i18next` を使う構成にした
- locale は `ja / en / zh-Hant / zh-Hans / ko` の 5 言語に対応した
- `localStorage` と `navigator.languages` を使って初期言語を決める
- `document.documentElement.lang` を locale に同期する
- `window.mmdI18n` から現在 locale の取得と切替ができる

### 言語ドロップダウン

- 上部ツールバーに `toolbar-locale-select` を追加した
- 言語選択は `日本語 / English / 繁體中文 / 简体中文 / 한국어` の固定表記にした
- 切替時は即座に UI を再描画し、設定を保存する

### 翻訳辞書

以下の JSON を `language/` 配下に置いた。

- `language/ja.json`
- `language/en.json`
- `language/zh-Hant.json`
- `language/zh-Hans.json`
- `language/ko.json`

内容は、少なくとも次をカバーしている。

- ツールバー
- 再生操作
- タイムライン
- エフェクト
- 情報表示
- 補間
- ボーン
- モーフ
- カメラ
- 物理
- 照明
- アクセサリー
- 出力
- toast / busy / error のメッセージ

### 画面文言の置換

- `index.html` の主要なラベルに `data-i18n` 系属性を付けた
- `src/ui-controller.ts` の一部の固定文言を `t(...)` に置き換えた
- `src/renderer.ts` の初期化失敗メッセージを辞書参照にした

### フォント

- UI 用フォントとして `src/assets/fonts/NotoSansCJK-Regular.ttc` を同梱した
- 等幅表示用に `src/assets/fonts/NotoSansMonoCJKjp-Regular.otf` を同梱した
- `src/index.css` で `Noto Sans CJK OTC` を UI の優先フォントにした
- `--font-mono` では `Noto Sans Mono CJK JP` を優先するようにした
- `button`, `input`, `select`, `textarea` を `font: inherit` にして UI 全体へ反映した
- 下パネルや各種ドロップダウンのフォントも、基本的に同梱フォントへ統一した

### 画面内の表示確認

- タイムラインの canvas 文字は `src/timeline.ts` 側で UI フォントスタックに寄せた
- モデル名、ボーン名、モーフ名などのマルチバイト文字もそのまま扱う前提で進めている

## いまの構成

- UI 表示用フォント: `Noto Sans CJK OTC`
- 等幅用フォント: `Noto Sans Mono CJK JP`
- locale: `ja / en / zh-Hant / zh-Hans / ko`
- 翻訳辞書: `language/*.json`
- 切替 UI: 上部ツールバーのドロップダウン

## 補足

- 文字コードは UTF-8 前提
- `zh-Hant.json` / `zh-Hans.json` / `ko.json` は一度壊れたが、UTF-8 の JSON として復旧済み
- `npm run lint` は通過確認済み

## 今後の作業候補

1. 画面内の残りの直書き文言を辞書へ寄せる
2. `zh-Hant / zh-Hans / ko` の翻訳をさらに厚くする
3. 必要なら辞書キーの命名規則を固める
4. 実機で PMX モデルの日本語・繁体字・簡体字の表示確認を行う
