# キー登録 runtime binding メモ

日付: 2026-06-16

## 背景

手打ちで同じボーンにキー A / キー B を登録したとき、タイムラインの XYZ Graph には後続キーが表示されるが、ビューポート上のポーズは最初のキーの状態で固まる症状があった。

この症状では、登録データと Graph 表示だけを見ると成功しているように見える。しかし Graph は MMD_modoki 側で `MmdAnimation` の track を直接サンプルしているため、babylon-mmd runtime へ正しく bind されている保証にはならない。

## 見つかった注意点

### 補間配列の順序

`babylon-mmd` の回転補間は VMD loader と同じく、次の順で扱う。

```text
[x1, x2, y1, y2]
```

手打ちキーの初期補間が `[x1, y1, x2, y2]` 相当になっていると、Graph と runtime の評価がずれる。MMD 標準的な線形寄り既定値は次のように持つ。

```text
[20, 107, 20, 107]
```

移動補間も X/Y/Z それぞれ同じ順序で 12 要素にする。

### runtime bone name と linked bone name

UI 操作やボーン表示は `runtimeBone.name` を使う。一方、babylon-mmd の model animation binding は内部で skeleton / `linkedBone.name` 側を見て track を bind する。

モデルや loader 状態によってこの 2 つが一致しない場合、次のような状態になる。

```text
UI track name / Graph: runtimeBone.name
runtime binding: linkedBone.name を期待
```

この場合、Graph は正しく見えても runtime animation が対象ボーンに bind されず、ビューポートではポーズが再生されない。

## 現行対応

手打ちキー由来の `MmdAnimation` を `editorModelAnimations` として印付けし、runtime animation を作るときだけ `retargetingMap` を渡す。

VMD 読み込み由来の animation にはこの retargeting をかけない。VMD は通常、PMX / skeleton 側のボーン名に合わせて作られているため、ここへ無条件に retargeting をかけると既存 VMD 読み込みを壊す可能性がある。

## 確認観点

- 同じボーンに 0f / 10f / 20f など複数キーを手打ちし、再生で後続キーへ動くこと
- seek bar 移動でも後続キーのポーズへ変わること
- XYZ Graph の表示とビューポートのポーズが同じ傾向になること
- VMD 読み込み済みモーションの再生が変わらないこと
- `npm.cmd run test:unit`
- `npm.cmd run lint`
- `npm.cmd run smoke:launch`

## 追加点: duration clamp の確認

2026-06-16 の再点検で、Graph が正しいのに再生時のビューポートが最初のキーに固定される場合、登録ではなく runtime 評価側で frame が 0 へ clamp されている可能性を疑うことにした。

`MmdRuntime.seekAnimation(frame, true)` は runtime 全体の `animationFrameTimeDuration` で frame を clamp する。そのため、手打ちキーから作った `MmdAnimation.endFrame` が正しくても、runtime duration へ伝播していない場合は後続キーへ seek できない。

現行では手打ちキー登録直後に次をログする。

- 対象 track 名 / category
- 登録 frame
- `mmdRuntime.currentFrameTime`
- `mmdRuntime.animationFrameTimeDuration`
- `MmdAnimation.startFrame` / `endFrame`
- 対象 track の `frameNumbers`
- runtime animation の bind index

さらに、手打ちキー由来 animation の `endFrame` に runtime duration が届いていない場合だけ、babylon-mmd runtime の duration 更新通知を明示的に呼び、同じ frame を seek し直す。

この補正は VMD 読み込み済み animation には適用しない。VMD 読み込みは従来どおり babylon-mmd の自動 duration 更新に任せる。

## 追加点: 既存 UI 入口の整理

2026-06-16 の再点検で、ボーンキー登録には複数の UI 入口があることを確認した。

| 入口 | Action | 現行経路 |
| --- | --- | --- |
| タイムライン下の「登録」 | `keyframe.addCurrent` | selected track がボーンなら `tryRegisterEditorBoneKeyframe()` |
| 下パネル「ボーン」欄のキーフレームボタン | `keyframe.registerBone` | selected bone から track を選び、`tryRegisterEditorBoneKeyframe()` |
| 下パネル「補間」欄のキーフレームボタン | `keyframe.addCurrent` | selected track がボーンなら `tryRegisterEditorBoneKeyframe()` |
| `I` / `K` / `+` / `NumpadAdd` / `Enter` | `keyframe.addCurrent` | selected track がボーンなら `tryRegisterEditorBoneKeyframe()` |
| メニューのキーフレーム追加 | `keyframe.addCurrent` | selected track がボーンなら `tryRegisterEditorBoneKeyframe()` |

`keyframe.addCurrent` 側では、ボーントラックの場合に旧式の `ensureModelAnimationForEditing()` / `buildKeyframeCommand()` / `persistBoneKeyframeInterpolation()` より先に新しい登録経路を試す。これにより、手打ちボーンキーはどの入口から登録しても `MmdManager.registerEditorBoneKeyframe()` へ集約される。

カメラ、モーフ、情報、アクセサリなどの非ボーンキーは対象外で、従来の各専用経路を維持する。
