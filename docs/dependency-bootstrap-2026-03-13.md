# 依存追加メモ

更新日: 2026-03-13

## 追加した依存

- `i18next`
  - 導入版: `25.8.18`
  - 目的: 多言語 UI 基盤の標準化
  - 現状: `src/i18n.ts` の既存 API を維持したまま、内部の翻訳解決とフォールバックを `i18next` に移行
- `mediabunny`
  - 導入版: `1.39.1`
  - 目的: WebM 動画出力の実装準備
  - 現状: 依存追加のみ完了。実際の WebM エクスポート処理は未実装

## 環境メモ

- Electron: `40.4.1`
- Vite: `5.4.21`
- TypeScript: `5.9.3`
- Node: `24.13.1`

## 補足

- `i18next` は現状の `window.mmdI18n`、`t(key, params)`、DOM の `data-i18n*` 反映フローを壊さないように薄いラッパーとして導入した。
- `mediabunny` は今後の WebCodecs ベース WebM 出力 PoC 向け。調査メモは `docs/webcodecs-mediabunny-webm-research.md` を参照。

## サードパーティー公式情報

- `i18next`
  - Getting started: https://www.i18next.com/overview/getting-started
  - API overview: https://www.i18next.com/overview/api
- `mediabunny`
  - Quick start: https://mediabunny.dev/guide/quick-start
  - Writing media files: https://mediabunny.dev/guide/writing-media-files
  - Using WebCodecs: https://mediabunny.dev/guide/using-webcodecs
