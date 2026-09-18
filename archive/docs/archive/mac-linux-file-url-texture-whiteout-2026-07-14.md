# Mac / Linux で PMX モデルが白く表示される件の調査メモ 2026-07-14

## 概要

2026-07-14 に、macOS で PMX モデル `YamatoIori.pmx` を読み込むと、モデル全体が白く表示される現象を確認した。

同じ現象は Windows では起きておらず、macOS / Linux の POSIX パス環境で起きる可能性が高い。

## 症状

- モデルの輪郭、ボーン、影は表示される
- 顔、髪、服などの材質色やテクスチャがほぼ出ず、モデル全体が白飛びしたように見える
- ポストエフェクト設定は通常値で、LUT / Bloom / Luminous などは白飛び原因ではなかった

追加した `electron-log` 診断では、次のような状態が出ていた。

- PMX metadata 側には `Y_Iori_Face.png`、`Y_Iori_Body.png`、`Y_Iori_Fuku.png` などの `pmxTexturePath` がある
- Babylon material 側では `diffuseTexture: null`
- `texture file missing or unreadable; skipped for model load` が大量に出る
- ログ上の texture URL が `file:////Users/...` になっていた

実ファイルは `/Users/togechiyo/MMD/portable/model/...` に存在していたため、ファイル欠落ではなく URL / ローカルパス変換の問題として切り分けた。

## 原因

主因は、PMX 読み込み時の root URL 生成が POSIX 絶対パスに対して不正だったこと。

`src/assets/model-asset-service.ts` では、モデルディレクトリ `dir` に対して次の形で root URL を作っていた。

```ts
const fileUrl = `file:///${dir}`;
```

macOS / Linux の `dir` は `/Users/.../` のように先頭 slash を持つため、結果が `file:////Users/.../` になる。

この URL は `new URL()` 上では pathname が `//Users/...` になり、実在する `/Users/...` と一致しない。結果として、テクスチャ存在確認や画像寸法検査が失敗し、PNG / BMP テクスチャが `null` 扱いになっていた。

Windows の `C:/...` 形式では `file:///C:/...` が期待形に近いため、この症状が表面化しにくかった。

副次要因として、WebGPU 用の補助テクスチャ読込で `fileUrlToLocalPath()` が file URL の pathname を常に backslash 化していた。

```ts
return pathname.replace(/\//g, "\\");
```

これは Windows では必要だが、macOS / Linux では `/Users/...` を `\Users\...` に壊すため、DDS / BMP fallback のローカルファイル読込にも悪影響がある。

## 対処

### root URL 生成

`src/assets/model-asset-service.ts` に `localPathToFileUrl()` を追加し、OS 差を吸収して file URL を生成するようにした。

```ts
function localPathToFileUrl(pathText: string): string {
    const normalized = pathText.replace(/\\/g, "/");
    const rawUrl = /^[A-Za-z]:\//.test(normalized)
        ? `file:///${normalized}`
        : `file://${normalized}`;
    return encodeURI(rawUrl);
}
```

PMX 読み込み時は次のように使う。

```ts
const fileUrl = localPathToFileUrl(dir);
```

これにより:

- macOS / Linux: `/Users/...` -> `file:///Users/...`
- Windows: `C:/...` -> `file:///C:/...`

になる。

### file URL からローカルパスへの復元

`src/mmd-manager.ts` の `fileUrlToLocalPath()` は、Windows drive path のときだけ backslash 化するようにした。

```ts
if (/^\/[A-Za-z]:\//.test(pathname)) {
    pathname = pathname.slice(1);
    return pathname.replace(/\//g, "\\");
}
return pathname;
```

macOS / Linux では `/Users/...` や `/home/...` をそのまま返す。

## 確認方法

修正後、同じモデルを macOS で読み込んで表示が復旧することを確認した。

基本確認:

```powershell
npm.cmd run lint
npm.cmd run smoke:launch
```

今回の macOS 実行では以下を確認した。

- `npm run lint`: 成功
- `npm run smoke:launch`: 成功
  - `engine=WebGPU`
  - `physics=Bullet MPR`

`npm run typecheck` は v0.2 時点の既存 baseline 型エラーが多数残っているため失敗する。今回の確認では `npm run typecheck:critical` が成功判定だった。

## 再発時のログ確認ポイント

ログは dev 起動では次に出る。

```text
/Users/togechiyo/Library/Logs/MMD_modoki/dev/main-dev.log
```

確認コマンド:

```powershell
npm.cmd run log:tail
npm.cmd run log:errors
```

再発時は以下を見る。

- `texture file missing or unreadable; skipped for model load` が大量に出ていないか
- `textureUrl` が `file:////Users/...` や `file:////home/...` になっていないか
- PMX 側の `pmxTexturePath` があるのに Babylon 側 `diffuseTexture: null` になっていないか
- `render diagnostics` の `postEffectValues` が通常値か

今回の現象では post effect は通常値で、材質の `diffuseTexture` が `null` になっていたため、描画後段ではなくアセット読込経路の問題と判断できた。

## 注意点

- file URL は OS ごとの差が出やすいので、手書き連結を増やさない。
- PMX / PMD の root URL と、個別 texture URL の両方で `file:///` の slash 数を確認する。
- macOS / Linux の `/...` パスを Windows 向けに backslash 化しない。
- packaged 版には nearby file redirect の経路もあるため、dev / packaged の両方で texture 読込を確認する価値がある。

