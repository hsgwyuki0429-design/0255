# ONI RUSH 開発ルール

## リリース運用 (オーナーとの取り決め)

- 機能追加・修正をひとまとめにしたら、デフォルトブランチ (`claude/3d-online-tag-game-3tka04`) へ **PRを作成してマージする**。
- マージのたびに **バージョンを 0.1 増やす**。更新箇所は2つ:
  - `package.json` の `version` (例: 1.1.0 → 1.2.0)
  - `public/index.html` のホーム画面左下 `.version-tag` (例: バージョン1.1 → バージョン1.2)

## 検証

- マップを変更したら、スポーン地点と牢屋の**往復到達性**を `NavGrid` (server/nav.js) で検証すること
  (CPUボットが迷子にならない保証になる)。
- クライアント変更は `npm start` でサーバーを起動し、ヘッドレスブラウザでCPU戦を実プレイして
  JSエラーがないことを確認する。

## 構成メモ

- `public/shared/mapdata.js` … 3マップの間取り (サーバー/クライアント共用。deco:1 は当たり判定なし)
- 捕獲は銃ではなく**体の接触タッチ** (server/index.js の checkCatches、66ms間隔・サーバー権威)
- 視点は一人称/三人称切替式 (main.js の viewMode、localStorage `oni-view` に保存)
- キャラの当たり判定はカプセル (collision.js: 半径0.32 / 高さ1.66 / 段差0.34まで自動ステップアップ)
- CPUボットのジャンプ上限 1.05m / 飛び降り上限 3.8m (nav.js) — 段差設計はこれに合わせる
