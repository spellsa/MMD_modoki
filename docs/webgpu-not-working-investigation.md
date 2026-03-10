# WebGPU が効かない / 平坦に見える件の調査メモ

更新日: 2026-03-10
対象:
- `src/main.ts`
- `src/mmd-manager.ts`
- `src/ui-controller.ts`

## 1. 目的

- 「WebGPU が有効になっていないように見える」「陰影やスフィアが薄く平坦に見える」報告の原因候補を整理する。
- WebGPU が完全に無効なケースと、WebGPU 起動後に一部機能だけ落ちているケースを分けて扱う。

## 2. 現行の起動判定

- `MmdManager.createPreferredEngine()` で WebGPU を優先起動する。
- `WebGPUEngine.IsSupportedAsync` が `false`、または `CreateAsync(...)` が失敗した場合は WebGL2 へフォールバックする。

参照:
- [src/mmd-manager.ts](/d:/DevTools/Projects/MMD_modoki/src/mmd-manager.ts#L2692)

## 3. `WebGPU (WGSL)` 表示の意味

- 画面上の `WebGPU (WGSL)` バッジは `engine instanceof WebGPUEngine` を示すだけ。
- これは「WebGPU エンジンとして起動した」ことは示すが、材質 shader、SSAO、DoF、SSR、Volumetric Light まで正常とは限らない。

参照:
- [src/ui-controller.ts](/d:/DevTools/Projects/MMD_modoki/src/ui-controller.ts#L1657)
- [src/mmd-manager.ts](/d:/DevTools/Projects/MMD_modoki/src/mmd-manager.ts#L4815)

結論:

- `WebGPU (WGSL)` 表示なのに平坦に見えることはあり得る。

## 4. WebGPU が本当に無効なケース

原因候補:

- GPU / ドライバ / OS 側で WebGPU 非対応
- Electron / Chromium 側の既定設定で WebGPU が使えない
- 仮想環境、リモート環境、古い GPU ドライバ
- WebGPU 初期化時の `glslang` / `twgsl` 読込失敗

現行コードで検知できるもの:

- `WebGPU unavailable. Falling back to WebGL2.`
- `WebGPU initialization failed. Falling back to WebGL2. Reason: ...`

参照:
- [src/mmd-manager.ts](/d:/DevTools/Projects/MMD_modoki/src/mmd-manager.ts#L2696)
- [src/mmd-manager.ts](/d:/DevTools/Projects/MMD_modoki/src/mmd-manager.ts#L2718)

## 5. WebGPU 起動後に一部だけ壊れるケース

### 5-1. SSAO

- WebGPU では PrePass を強制的に無効扱いにしている。
- Babylon の SSAO2 pipeline は WebGPU で不安定なため、通常の経路と見た目が揃わない可能性がある。
- 立体感不足が「WebGPU が効いていない」と見える原因になりうる。

参照:
- [src/mmd-manager.ts](/d:/DevTools/Projects/MMD_modoki/src/mmd-manager.ts#L4792)
- [src/mmd-manager.ts](/d:/DevTools/Projects/MMD_modoki/src/mmd-manager.ts#L6318)
- [docs/ssao-webgpu-investigation.md](./ssao-webgpu-investigation.md)

### 5-2. 材質 shader / toon / sphere

- `MmdStandard` 系の shader patch や WGSL 側の差し替えが期待通り効いていないと、陰影やスフィアが薄く見える。
- これはエンジン起動成功だけでは検知しにくい。

参照:
- [src/mmd-manager.ts](/d:/DevTools/Projects/MMD_modoki/src/mmd-manager.ts#L383)

### 5-3. 個別 pipeline の無効化

- DoF, SSR, Volumetric Light などは初期化失敗時に個別で無効化される。
- WebGPU バッジは残るため、「WebGPU なのに見た目が弱い」状態になる。

参照:
- [src/mmd-manager.ts](/d:/DevTools/Projects/MMD_modoki/src/mmd-manager.ts#L5823)
- [src/mmd-manager.ts](/d:/DevTools/Projects/MMD_modoki/src/mmd-manager.ts#L6355)
- [src/mmd-manager.ts](/d:/DevTools/Projects/MMD_modoki/src/mmd-manager.ts#L6502)
- [src/mmd-manager.ts](/d:/DevTools/Projects/MMD_modoki/src/mmd-manager.ts#L6622)

## 6. Electron 側のフラグ対応

現状の対処:

- `src/main.ts` で Chromium の WebGPU 強制用フラグを起動前に追加する。

追加したフラグ:

- `enable-unsafe-webgpu`
- `ignore-gpu-blocklist`
- `force_high_performance_gpu`

参照:
- [src/main.ts](/d:/DevTools/Projects/MMD_modoki/src/main.ts#L19)

補足:

- Electron 公式では `app.commandLine.appendSwitch()` を `ready` 前に使える。
- Chromium フラグ自体は Electron 固有 API ではなく Chromium 側仕様に依存するため、将来の Electron / Chromium バージョン差には注意が必要。

参照:
- Electron command-line switches: https://www.electronjs.org/docs/latest/api/command-line-switches

## 7. 現時点で考えられる主原因

優先度順:

1. WebGPU は起動しているが、SSAO や shader 差し替えが効かず平坦化している
2. WebGPU で材質 shader が部分的に壊れている
3. 一部 pipeline が初期化失敗して無効化されている
4. そもそも WebGPU 起動に失敗し WebGL2 へフォールバックしている

## 8. 切り分けの実務手順

1. バッジが `WebGPU (WGSL)` か `WebGL2` か確認する
2. コンソールに WebGPU フォールバックログが出ていないか確認する
3. SSAO を OFF / ON して変化があるか確認する
4. 同一モデルを WebGL2 と WebGPU で比較する
5. 陰影、スフィア、toon が弱いだけなのか、完全に壊れているのかを見る
6. DoF / SSR / Volumetric Light の警告ログが出ていないか確認する

## 9. 今後の改善候補

- 起動時に「エンジン種別」だけでなく「主要描画機能の有効状態」を表示する
- WebGPU で重要 shader が無効化されたとき、UI 上へ warning を出す
- WebGL2 強制起動オプションを設け、比較しやすくする
- WebGPU で平坦化したときの診断情報をまとめて保存できるようにする
