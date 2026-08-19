# 線上報名(列表)

`/signup` · `club` · `features/signup/SignupListPage.tsx`

## 用途

學務處建立的報名活動清單:幹訓、負責人會議、競賽報名等。

## 資料來源

| 動作 | 端點 |
|---|---|
| 列表 | `GET /club/signup-items?page&page_size`(每頁 20) |
| 報名紀錄詳情 | `GET /club/signup-items/{id}` |

## 畫面

卡片清單。每張卡:活動名稱、開放中/已截止 pill、種類徽章(一般 / 幹訓 / 負責人會議)、自己的狀態 pill(已報名 / 待審核 / 草稿)、活動時間 · 地點 · 每社名額上限、右側截止日。

點擊行為:
- 已報名(含待確認)→ 開報名紀錄 Modal
- 未報名且開放中 → 進 `/signup/{id}` 填寫
- 已截止且未報名 → 不可點,卡片半透明

## 規則

- `accepting` = `is_open` 且 `signup_start ≤ now ≤ signup_end`,由後端推導
- 一社一單,送出後不得更改
- 審核制活動(`requires_confirmation`)送出後狀態為「待審核」,管理員確認才算成立

## 未完成 / 問題

- 列表按 `id desc` 排,沒有排序或篩選;活動一多就要一頁頁翻找開放中的
