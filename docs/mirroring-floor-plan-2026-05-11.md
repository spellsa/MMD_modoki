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
- Frame Graph backend 有効時の PNG 保存では、Babylon.js の FrameGraph render target screenshot 経路と `MirrorTexture` の render target が WebGPU で競合し、destroyed texture warning や黒画像が出ることがあった。`engine.readPixels()` に寄せても swap buffer 破棄の影響で黒画像になるケースがあったため、単発 PNG 保存は Electron main process の `webContents.capturePage()` で表示中の canvas 矩形を切り出す経路へ切り替えた。
- 上記回避策により、MirroringFloor 有効時の PNG は画面に見えている反射床を優先して保存する。一方で、任意解像度への完全な再レンダリングではなくページ表示のスクリーンショットをスケーリングするため、通常の render target capture と品質・アスペクトの扱いが完全一致しない可能性がある。
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

現在の単発 PNG 保存は `src/ui/export-ui-controller.ts` から `window.electronAPI.saveCanvasSnapshotPngFile(...)` を呼び、`src/main.ts` の `file:saveCanvasSnapshotPng` IPC で `BrowserWindow.webContents.capturePage()` を実行する。

この方式は「最終表示を撮る」ため MirroringFloor との相性はよい。一方で DOM オーバーレイも写るため、保存直前に `MmdManager.setCaptureEditorOverlaysSuppressed(true)` を呼び、2フレーム待ってからキャプチャする。これによりボーン表示などの編集用 2D オーバーレイは PNG に含めない。

確認済み:

- MirroringFloor 有効時に黒画像ではなく PNG が保存される。
- ボーン表示オーバーレイは PNG 保存時に抑止される。
- `npm.cmd run lint` は既存 warning のみで通過。
- `npm.cmd run smoke:launch` は WebGPU 初期化まで通過。

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
