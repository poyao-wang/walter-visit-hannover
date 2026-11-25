# walter-visit-hannover

Walter 來訪漢諾威（2026-11-28 ～ 11-30）週末旅遊 Dashboard。

一頁式、mobile-first：日曆時間軸（直接抓 Google 公開日曆）＋ Google Maps 地點圖＋導航連結。

- 行程頁：https://poyao-wang.github.io/walter-visit-hannover/

## 資料流

- **行程**：`app.js` 直接 fetch `walter-visit-2026-11-28` 公開日曆（Calendar API v3、無 key）。
  改 Google Calendar → 網頁重新整理即更新，零維護。
  `events.json` 是 baked fallback（API 失敗時顯示），由 agent 端用 OAuth 更新。
- **地點**：`places.json`（名稱／GPS／類別／狀態：定案 anchor／備選 option／航班 info）。

## Google Maps API key

`index.html` 內的 key 有限制：HTTP referrer 限 `poyao-wang.github.io/*`、只啟用 Maps JavaScript API。
換 key 時改 `index.html` 最底部的 script URL 即可，並記得 bump 版號（footer）。

## 版本

- v1.0.1（2026-11-25）
- v1.0.0（2026-11-25）：初版——三天時間軸＋Google Maps＋18 地點＋導航連結
