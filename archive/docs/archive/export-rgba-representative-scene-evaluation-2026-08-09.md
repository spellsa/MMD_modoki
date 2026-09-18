# 共通 RGBA Surface 代表シーン性能評価 2026-08-09

## 結論

豆腐モデルと皿モデルを読み込み、Frame Graph の SSGI と DoF を有効にした代表シーンで、
1920×1080・100フレームの連番 PNG と WebM を実測した。

- 新 `rgba-surface` の WebM capture は5回とも `1482.7〜1511.4 ms` に収まり、安定していた。
- 旧 `webgpu-copy` は同一セッションの反復中にbackbuffer readbackが `9537.2〜16678.3 ms` まで
  停滞し、wall-clock中央値は新経路の `3260.7 ms` に対して `18047.4 ms` となった。
- ただし、別セッションの冷間1回だけでは、新経路のcaptureは旧経路より `22.0%` 短かった一方、
  初期化を含むwall-clockは新経路のほうが `11.8%` 長かった。したがって、`5.53倍` という
  反復中央値を通常時の純粋な速度差として一般化しない。旧backbuffer readbackの反復時停滞を
  回避できた、という安定性の結果として扱う。
- 連番 PNG の5回中央値はwall-clock `10656.4 ms`、capture `2111.4 ms` だった。
  1回だけcaptureが `14741.3 ms` まで伸びたため、RGBA surfaceにもGPU readback由来とみられる
  外れ値は残る。

この代表シーンでも共通RGBA surfaceを維持する判断は妥当である。一方、WebM旧経路との
厳密な通常時比較には、modeごとにElectron processを分離した冷間ベンチを追加する必要がある。

## シーンと設定

- モデル:
  - `test/fixtures/external-parent/tofu.pmx`
  - `test/fixtures/external-parent/plate.pmx`
- モデル数: 2
- モーション、物理、音声: なし
- camera target: `(0, 1.4, 0)`
- camera rotation: `(-8, -18, 0)` degree
- camera distance: `22`
- camera FOV: `30` degree
- ground: OFF
- SSGI:
  - strength: `0.35`
  - sample radius: `64`
  - blend: `softLight`
- DoF:
  - enabled: ON
  - blur level: High
  - focus target: 豆腐モデル
  - focus offset: `0 mm`
- 出力: 1920×1080、0〜99フレーム、30 fps
- WebM: VP8、音声なし、queue limit 16

書き出した先頭PNGを目視し、豆腐と皿が画面内へ収まり、豆腐と皿の接触部、皿の前後で
深度差があることを確認した。各hidden exporterのログでも `frame graph SSGI task active` を確認した。
1920×1080のWebMではSSGI gatherが960×540、入力scene color / view depth / view normalが
1920×1080、denoiserが3 passのspatial A-Trousとして起動している。

## 再実行方法

空シーンは従来どおり次で計測する。

```powershell
npm.cmd run benchmark:export-rgba -- 3
```

豆腐＋皿＋SSGI＋DoFはscenarioを指定する。

```powershell
npm.cmd run benchmark:export-rgba -- 5 tofu-plate-ssgi-dof
```

第4引数へパスを渡すと、run 1の先頭PNGを目視確認用にコピーする。

```powershell
npm.cmd run benchmark:export-rgba -- 1 tofu-plate-ssgi-dof D:\temp\tofu-ssgi-dof.png
```

## 5回計測

### 連番 PNG

| run | wall-clock | capture | PNG合計サイズ |
| --- | ---: | ---: | ---: |
| 1 | 11255.6 ms | 2033.9 ms | 4,533,100 bytes |
| 2 | 10526.4 ms | 2072.9 ms | 4,533,100 bytes |
| 3 | 17849.3 ms | 14741.3 ms | 4,533,100 bytes |
| 4 | 10656.4 ms | 2111.4 ms | 4,533,100 bytes |
| 5 | 10527.7 ms | 2187.3 ms | 4,533,100 bytes |
| 中央値 | 10656.4 ms | 2111.4 ms | 4,533,100 bytes |

空シーンの新経路中央値はwall-clock `27069.4 ms`、capture `1434.7 ms` だった。
代表シーンではSSGI / DoF / model描画によりcaptureは `47.2%` 長くなった一方、画像が
単純でPNG合計サイズが約53.0 MBから約4.53 MBへ減ったため、encode / saveを含むwall-clockは
短くなった。PNG全体時間はシーン描画負荷だけでなく画像の圧縮率に大きく左右される。

### WebM wall-clock

| mode | run 1 | run 2 | run 3 | run 4 | run 5 | 中央値 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 新 `rgba-surface` | 4088.4 ms | 3257.4 ms | 3315.4 ms | 3260.7 ms | 3260.5 ms | 3260.7 ms |
| 旧 `webgpu-copy` | 12191.6 ms | 19428.0 ms | 18675.2 ms | 17549.4 ms | 18047.4 ms | 18047.4 ms |

両modeの出力はすべて `183,076 bytes` で一致した。

### WebM stage中央値

| stage | 新 `rgba-surface` | 旧 `webgpu-copy` | 観測 |
| --- | ---: | ---: | --- |
| wall-clock | 3260.7 ms | 18047.4 ms | 反復セッションでは新経路が5.53倍 |
| render | 644.6 ms | 558.6 ms | 新経路が約15.4%長い |
| capture | 1500.5 ms | 16355.4 ms | 旧経路のreadback停滞が支配 |
| readback | 1353.5 ms | 15293.0 ms | 旧経路は9.5〜16.7秒へ悪化 |
| CPU BGRA→RGBA transform | 0 ms | 935.2 ms | 新経路では除去済み |
| sample creation | 143.3 ms | 123.7 ms | 小差 |

新経路は空シーン中央値に対してrenderが約3.13倍、captureが約16.2%、wall-clockが約26.2%
長くなった。SSGI / DoFを含む実描画コストは増えているが、新経路のreadbackは5回を通じて
`1340.5〜1367.2 ms` と安定している。

## 冷間1回の補足

5回計測とは別にElectronを起動し直した最初の1回では次だった。

| stage | 新 `rgba-surface` | 旧 `webgpu-copy` | 差 |
| --- | ---: | ---: | ---: |
| wall-clock | 4110.9 ms | 3677.3 ms | 新経路が11.8%長い |
| capture | 1515.0 ms | 1942.5 ms | 新経路が22.0%短い |
| readback | 1354.7 ms | 1088.2 ms | 新経路が24.5%長い |
| CPU BGRA→RGBA transform | 0 ms | 708.5 ms | 新経路で除去 |

通常状態では、新surfaceのRTT readbackとrow order正規化は旧backbuffer readbackより長いが、
旧経路のchannel swizzleを除去した結果、capture全体は短縮した。初期化・project load・codec準備を
含むwall-clockでは、この1回だけは短縮分を相殺した。

## 判断と次の調査

- SSGI / DoF入りでも新 `rgba-surface` のcapture時間は安定している。
- 旧 `webgpu-copy` の反復時readback停滞は再現したが、GPU queue、backbuffer取得、hidden window
  lifecycleのどれが原因かは今回の計測だけでは断定しない。
- 厳密な新旧比較を続ける場合は、1 process 1 modeで毎回再起動するベンチを追加する。
- 連番PNGの次の主要改善対象は、引き続きPNG encode / IPC / file saveである。
- 次の代表性向上は、モーション、物理、テクスチャ付きMMDモデルを含むシーンで行う。

## 関連

- [共通 RGBA Surface 出力 性能評価（空シーン）](./export-rgba-performance-evaluation-2026-08-09.md)
- [共通 RGBA Surface 出力 実装メモ](./export-render-surface-implementation-note-2026-08-09.md)
- [出力レンダリング経路 共通 RGBA Surface 統合計画](./export-render-surface-unification-plan-2026-08-09.md)
