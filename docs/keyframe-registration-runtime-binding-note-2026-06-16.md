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

## 追加点: カメラキー登録の payload 化

2026-06-17 に、カメラキー登録もボーン登録の新経路に近い考え方へ寄せた。

従来のカメラ登録は、`keyframe.addCurrent` で `cameraKeyframeFrames` だけを先に追加し、その後 `persistCameraKeyframeInterpolation()` で `cameraSourceAnimation.cameraTrack` に現在値を詰める二段階だった。この方式は、タイムライン表示用の frame list と実体の camera track が一時的に分かれるため、削除、移動、undo / redo、既存キー更新でズレやすい。

現行では、カメラトラック選択中の登録は `tryRegisterEditorCameraKeyframe()` に入り、現在の camera target / rotation / distance / fov と補間を `CameraKeyframePayload` として作る。その payload を `keyframe.paste` 型の command に載せ、`applyTimelineKeyframePayload()` へ直接流す。

```text
Camera 登録
  -> CameraKeyframePayload 作成
  -> applyTimelineKeyframePayload(camera, frame, payload)
  -> cameraSourceAnimation.cameraTrack 更新
  -> cameraKeyframeFrames 同期
  -> runtime camera animation 再生成
```

これにより、カメラの手打ち登録は「フレームだけ登録して後から値を埋める」方式ではなく、値込みの keyframe payload 登録として扱う。

### カメラ Rz / ロールの同期

カメラ登録を payload 化した後、Rz が 0 として登録される、または登録ボタンを押した直後に見た目が変わる問題が残った。

原因は `MmdCameraAnimationTrack.rotations` の並びではなかった。camera track は `[x, y, z]` のラジアン値を持ち、runtime 側も `rotation.z` を読む。問題は、登録前に `syncCameraRotationFromCurrentView()` が現在ビューから `cameraRotationEulerDeg` を復元するとき、位置と target から Rx / Ry だけを更新し、ロールを表す Rz を復元していなかったことだった。

Babylon の ArcRotateCamera 的な見た目では、ロールは `camera.upVector` 側に残ることがある。そのため、ビュー上では傾いて見えていても、登録 payload 作成時の `cameraRotationEulerDeg.z` が古い値または 0 のままになり、登録後の runtime 再評価で見た目が変わっていた。

現行では、`syncCameraRotationFromCurrentView()` で次の順に現在ビューを復元する。

```text
camera.position - camera.target
  -> Rx / Ry を復元
  -> Rx / Ry から roll なしの基準 up / right を作る
  -> camera.upVector と基準 up / right の差から Rz を復元
  -> CameraKeyframePayload.rotations = [rx, ry, rz] radians
```

確認観点:

- Camera の Rz を 0 以外にして登録しても、登録ボタン押下直後に見た目が変わらないこと
- 登録済みカメラキーを seek / 再生したとき、Rz が 0 に戻らないこと
- 下パネルのカメラ Z 回転表示、タイムライン Graph、ビューポートの見た目が同じ向きになること
