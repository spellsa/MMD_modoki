切り出し元: AGENTS.md / 切り出し日: 2026-08-04

## 外部公式情報の確認

Babylon.js / babylon-mmd / Electron / WebGPU など、外部ライブラリや実行基盤に関わる作業では、記憶や推測だけで進めず、必要に応じて検索して公式ドキュメントや一次情報を確認してください。

特に Babylon.js と babylon-mmd は公式ドキュメント・API リファレンス・サンプルが充実しているため、以下のような作業では積極的に参照してください。Babylon.js については、公式フォーラムにも実装者やメンテナーによる不具合調査、制約、回避策、Playground 例が多いため、調査対象に含めてよいです。

- Frame Graph、Rendering Pipeline、Post Process、Material、Shader、WebGPU まわりの実装や調査
- babylon-mmd の runtime、loader、physics、MMD material、outline、animation に関わる変更
- Babylon.js / babylon-mmd のバージョン差による API 変更や非推奨 API の確認
- 公式 task / helper / recommended path が存在するかどうかの確認
- 独自実装を入れる前に、既存の公式機能で置き換えられるか判断する場面

フォーラムの情報は、回答時点の Babylon.js バージョン、回答者、再現用 Playground、後続の修正状況を確認してください。フォーラム投稿だけで現行仕様と断定せず、可能な範囲で公式ドキュメント、API、ソースコード、リリースノート、現在使用中のバージョンの実挙動と照合してください。

調査で得た重要な知見や、公式ドキュメントと実装上の差分・制約が見つかった場合は、必要に応じて `docs/` に短い調査メモを残してください。
