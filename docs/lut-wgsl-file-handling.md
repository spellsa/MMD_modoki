# LUT / WGSL 外部ファイル運用仕様

更新日: 2026-03-05

## 概要

本ドキュメントは、LUT と WGSL の外部ファイル読み込み、およびプロジェクト保存時のファイル配置ルールをまとめたものです。

対象機能:

- ポストエフェクト LUT の外部読込
- Toon WGSL シェーダーの外部読込（WGSL 固定）
- `.mmdproj.json` 保存/読込時のパス解決と同梱動作

## 保存される主なプロジェクトキー

`effects` 配下で以下のキーを使います。

- `lutSourceMode`: `"builtin" | "external-absolute" | "project-relative"`
- `lutExternalPath`: `string | null`
- `wgslToonShaderPath`: `string | null`

## LUT の外部読込

### UI

- `LUTSrc`:
  - `Builtin`
  - `External Abs`
  - `Project LUT`
- `LUTFile` の `Load...` ボタンで外部ファイルを選択

### 読み込める拡張子

- `.3dl`

### モードごとの保存動作

- `builtin`
  - `lutExternalPath = null`
  - 外部 LUT ファイルは同梱しない
- `external-absolute`
  - `lutExternalPath` に絶対パスを保存
  - LUT ファイルは同梱しない
- `project-relative`
  - `lutExternalPath = "luts/<元ファイル名>"`
  - 保存時に `<project_dir>/luts/<元ファイル名>` を書き出す

### 読込時のパス解決

- `lutSourceMode` が `external-absolute` / `project-relative` のときのみ `lutExternalPath` を解決
- `project-relative` かつ相対パスの場合:
  - `.mmdproj.json` のあるディレクトリ基準で解決
- 失敗時:
  - 警告を積み、LUT を `OFF` にして継続

## WGSL の外部読込

### UI

- Shader パネル上部の `WGSL` 行:
  - `Load...` で外部 `.wgsl` を読込
  - `Clear` で解除

### 読み込める拡張子

- `.wgsl`

### 保存動作（現行仕様）

- 外部 WGSL を読み込み済みなら:
  - `wgslToonShaderPath = "wgsl/<元ファイル名>"`
  - 保存時に `<project_dir>/wgsl/<元ファイル名>` を書き出す
- 未読込または `Clear` 済みなら:
  - `wgslToonShaderPath = null`

注: WGSL は現行仕様で、保存時に `wgsl/` 同梱（プロジェクト相対）に正規化されます。

### 読込時のパス解決

- `wgslToonShaderPath` が絶対パスならそのまま読む
- 相対パスなら `.mmdproj.json` のあるディレクトリ基準で解決して読む
- 読込失敗時は警告を積んで継続

## 保存後のフォルダ構成例

```text
my_scene/
  scene_a.mmdproj.json
  luts/
    anime_cool.3dl
  wgsl/
    toon_custom.wgsl
```

## JSON 例

```json
{
  "effects": {
    "lutSourceMode": "project-relative",
    "lutExternalPath": "luts/anime_cool.3dl",
    "wgslToonShaderPath": "wgsl/toon_custom.wgsl"
  }
}
```

## 運用ガイド

- 配布/移行前提のプロジェクト:
  - LUT は `Project LUT` を使う
  - WGSL は `Load...` で読み込んで保存し、`wgsl/` 同梱を使う
- ローカル専用で絶対パス運用したい LUT:
  - `External Abs` を使う（PC移動時は壊れやすい）
- 読込失敗時:
  - パス文字列ではなく、実ファイルの存在と配置（`luts/`, `wgsl/`）を先に確認
