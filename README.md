# MMD modoki

Babylon.js Editor と `babylon-mmd` をベースにした、MMD もどきのローカル編集ツールです。  
PMX/PMD モデル、アクセサリー、VMD、カメラ VMD、音声を読み込み、タイムライン編集とプレビュー、PNG 出力を行えます。

## ダウンロード

- Release 一覧: https://github.com/togechiyo/MMD_modoki/releases

配布物は OS ごとの zip です。

- `mmd-modoki-windows-x64-zip.zip`
- `mmd-modoki-macos-x64-zip.zip`
- `mmd-modoki-linux-x64-zip.zip`

## 起動方法

1. `Releases` から自分の OS 向け zip をダウンロードします。
2. zip を展開します。
3. 展開したフォルダ内のアプリ本体を起動します。

Windows:
- `MMD modoki.exe`

macOS:
- `MMD modoki.app`

Linux:
- Linux 版は環境によって `--no-sandbox`を付けて起動する必要がある場合があります。`chrome-sandbox` 起因の起動失敗を避けるための暫定対応です。
- 展開先の実行ファイルを直接起動します。

## 初回起動時の注意

- macOS 版は未署名のため、Gatekeeper の警告が出る場合があります。
- Linux 版は環境によって追加ライブラリが必要になる場合があります。
- 初期版のため、今後保存形式や UI を調整する可能性があります。

## できること

- PMX/PMD モデルの読み込み
- `.x` アクセサリーの読み込み
- VMD モーション、カメラ VMD の読み込み
- MP3/WAV 音声の読み込み
- タイムライン編集
- ボーン、モーフ、カメラ、照明の調整
- PNG 保存、PNG 連番保存
- DoF、Bloom、LUT などのポストエフェクト調整

補足:
- SSAO は負荷対策のため現行ビルドでは常時 OFF です。
- アンチエイリアスは `MSAA x4 + FXAA` を使用しています。

## 読み込めるファイル

通常の読み込みまたはドラッグ&ドロップに対応:

- モデル: `.pmx` `.pmd`
- アクセサリー: `.x`
- モーション/ポーズ: `.vmd` `.vpd`
- カメラモーション: `.vmd`
- 音声: `.mp3` `.wav`

専用 UI から読み込み:

- プロジェクト: `.json`（既定ファイル名: `*.modoki.json`）

補足:

- `.vmd` は内容に応じてモデルモーションまたはカメラモーションとして読み込みます。
- `.x` はテキスト形式の DirectX X ファイルを想定しています。

## 基本操作

- `Ctrl + O`: PMX/PMD を開く
- `Ctrl + M`: VMD を開く
- `Ctrl + Shift + M`: カメラ VMD を開く
- `Ctrl + Shift + A`: 音声を開く
- `Ctrl + S`: プロジェクト保存 / 上書き保存
- `Ctrl + Alt + S`: 名前を付けて保存
- `Ctrl + Shift + S`: PNG 保存
- `Space` または `P`: 再生 / 停止
- `Delete`: 選択キーフレーム削除

マウス:
- 中ボタンドラッグ: 視点移動
- 右ドラッグ: 回転
- ホイール: ズーム

## 開発

必要環境:
- Node.js 18 以上
- npm

セットアップ:

```bash
npm install
```

開発起動:

```bash
npm start
```

Lint:

```bash
npm run lint
```

配布ビルド:

```bash
npm run package
npm run make
```

zip 配布物作成:

```bash
npm run make:zip
```

## ドキュメント

- ドキュメント入口: [docs/README.md](./docs/README.md)
- アーキテクチャ: [docs/architecture.md](./docs/architecture.md)
- MmdManager 解説: [docs/mmd-manager.md](./docs/mmd-manager.md)
- UI フロー: [docs/ui-flow.md](./docs/ui-flow.md)
- トラブルシュート: [docs/troubleshooting.md](./docs/troubleshooting.md)

## ライセンス

- This project: [MIT](./LICENSE)
- Third-party notices: [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)
