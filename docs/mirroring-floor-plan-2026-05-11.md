# MirroringFloor 実装メモ

## 目的

MMD / MME の `WorkingFloor` 系エフェクトに近い、床面への平面反射を MMD_modoki に追加する。

ここで扱う `MirroringFloor` は SSR のようなスクリーンスペース反射ではなく、水平な板ポリゴンに planar reflection を貼る表示機能として扱う。

狙い:

- MMD 的な「床にキャラクターが映る」見た目を作る
- 画面外や背面側も反射に含められる方式を優先する
- SSR では欠けやすい WorkingFloor 的表現を別枠で扱う

## 方針

Babylon.js の `MirrorTexture` を使う。

参考:

- Babylon.js docs: <https://doc.babylonjs.com/features/featuresDeepDive/materials/using/reflectionTexture#mirror-textures>
- Babylon.js package API: `node_modules/@babylonjs/core/Materials/Textures/mirrorTexture.d.ts`

主要 API:

- `@babylonjs/core/Materials/Textures/mirrorTexture`
- `MirrorTexture`
- `mirrorPlane`
- `renderList`

実装イメージ:

```ts
const mirrorTexture = new MirrorTexture("mirroringFloorTexture", textureSize, scene, true);
mirrorTexture.mirrorPlane = new Plane(0, -1, 0, floorY);
mirrorTexture.renderList = reflectedMeshes;

const material = new StandardMaterial("mirroringFloorMaterial", scene);
material.reflectionTexture = mirrorTexture;
material.alpha = reflectance;
```

SSR とは違い、反射用 render target に対象 mesh を別パスで描画する。そのため画面外のオブジェクトも反射できる一方、描画負荷は増える。

## UI の置き場所

暫定的に `表示欄` に置く。

理由:

- Post Effect ではなく、scene object + render target + material で動く
- Frame Graph post effects backend とは別系統
- 将来 UI 全体を整理する前提なので、いまは見つけやすい表示系コントロールに置く

初期 UI:

- `Mirror床`: ON / OFF
- `Mirror反射`: 0 - 100%
- `Mirror床幅`: 5 - 100m
- `Mirror高さ`: -2.00 - 2.00m
- `Mirror解像度`: 256 / 512 / 1024 / 2048

## 2026-05-11 実装状況

PoC として以下を実装した。

- `src/mmd-manager.ts`
  - `MirrorTexture` と反射用 `CreateGround` を追加
  - 通常の grid floor とは別 mesh として `mirroringFloor` を管理
  - `mirroringFloorEnabled / Reflectance / Size / Height / Resolution` の getter / setter を追加
  - `mirrorPlane` は水平面 `y = height` として設定
  - z-fighting を避けるため表示用 mesh は `height + 0.006` に少し浮かせる
  - 反射対象はまず PMX / PMD の scene model mesh に限定
  - ground、skydome、contact shadow、MirroringFloor 自身は renderList から除外
- `index.html`
  - 表示欄に MirroringFloor の暫定 UI を追加
- `src/ui/camera-panel-controller.ts`
  - UI と `MmdManager` の設定を接続
- `src/project/project-serializer.ts`
  - viewport state に MirroringFloor 設定を保存
- `src/project/project-importer.ts`
  - project load 時に MirroringFloor 設定を復元
- `src/types.ts`
  - `ProjectViewportState` に MirroringFloor 設定を追加

## 注意点

- `MirrorTexture` は反射対象をもう一度描画するため、PMX の skinning / morph / material 描画が重い場合は FPS に影響する。
- 初期対象は PMX / PMD モデルのみ。`.x` アクセサリやステージ内の任意平面反射は後続課題。
- 反射用 render target には通常 post effects は入らない。最終画面の post effects とは見た目が完全一致しない可能性がある。
- Frame Graph backend 有効時の旧 screenshot 経路では、`MirrorTexture` の render target と競合し、destroyed texture warning や黒画像が出ることがあった。`engine.readPixels()` でも swap buffer 由来の黒画像が残ったため、一時期は Electron main process の `webContents.capturePage()` を回避策として使用していた。
- 2026-08-09 に単発 PNG を共通 `ExportRenderSurface` へ移行した。MirrorTexture を含む代表シーンでの新経路の実機確認は別途必要。
- 透明材質、outline、toon、shadow、BlobShadow との重なりは実機で確認が必要。

## PNG 保存との関係

MirroringFloor は `MirrorTexture` が内部で反射用 render target を持つため、従来の Babylon.js screenshot helper と組み合わせると WebGPU / Frame Graph 経路で不安定になった。

試した経路:

- `CreateScreenshotUsingRenderTargetAsync`
  - Frame Graph の screenshot 経路に入ると、MirrorTexture の render target と競合して黒画像や destroyed texture warning が出た。
- `CreateScreenshotAsync`
  - canvas ベースに寄せても、WebGPU swap buffer 破棄由来の警告と黒画像が残るケースがあった。
- `engine.readPixels()`
  - WebM の `webgpu-copy` に近い考え方で試したが、単発 PNG では黒画像になるケースが残った。
- `webContents.capturePage()`
  - 表示中の canvas 矩形を Electron main process 側で撮る方式。MirroringFloor 表示込みの PNG 保存ができることを確認した。

2026-08-09 以降の単発 PNG 保存は、連番 PNG / WebM と同じ `ExportRenderSurface`
(`rgba8unorm`) へ FrameGraph または Classic の最終出力を描画し、RGBA readback を
1本のrenderer Web Workerで直接PNG化する。mainへは圧縮済みPNGだけを`file:savePngBytes`で渡す。
`BrowserWindow.webContents.capturePage()` は単発 PNG 経路から削除した。

保存直前の `MmdManager.setCaptureEditorOverlaysSuppressed(true)` と2フレーム待機は維持している。
surface 自体は scene の最終色だけを受けるため DOM overlay は含まず、キャプチャ後は surface を
解放して通常 viewport の backbuffer 出力へ戻す。

旧 compositor snapshot 経路で確認済みだった項目:

- MirroringFloor 有効時に黒画像ではなく PNG が保存される。
- ボーン表示オーバーレイは PNG 保存時に抑止される。

共通 surface 移行後は空シーンの単発 PNG 実ファイル生成、surface 解放、WebGPU 起動を
自動確認している。MirroringFloor を含む見た目は未確認。

## 確認観点

- ON / OFF で反射床が表示・非表示になるか
- PMX モデルが上下反転して床に映るか
- 床幅、床高さ、反射率が UI から変化するか
- 解像度変更で WebGPU validation warning が出ないか
- 通常の床、通常影、BlobShadow と併用したときに濃すぎないか
- PNG 保存時に黒画像にならず、ボーン表示などの編集用オーバーレイが写り込まないか
- プロジェクト保存 / 読み込みで設定が戻るか
- 重い PMX モデルで FPS 低下が許容範囲か

## 後続候補

- `.x` アクセサリを反射対象に含める
- PMX / PMD ステージ内の平面材質に MirroringFloor を適用する設計を検討する
- 反射床を通常床と排他にするか、重ねて使うかを UI で整理する
- 反射 render target の更新頻度を落とせるか検討する
- blur / fresnel / tint を追加するか検討する
