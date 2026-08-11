# 違規管理

`/admin/violations` · `admin` · 權限鍵 `aviol` · `features/admin/AdminViolationsPage.tsx`

## 用途

全校違規勸導的查詢與銷案。

## 資料來源

| 動作 | 端點 |
|---|---|
| 列表 | `GET /admin/violations`(前端逐頁抓齊) |
| 銷案 | `POST /admin/violations/{id}/resolve` |

## 畫面

表格:社團、日期、地點、違規項目、填寫人、銷案期限、狀態、動作。多欄可排序;逾期的列銷案鈕停用並附 Tooltip「已逾 1 個月銷案期限,不再受理銷案」。

銷案彈窗填處理說明。

## 規則

- **銷案期限 = 開立日 + 1 個月**,逾期即截止,後端回 409 `RESOLVE_EXPIRED`;期限當天仍可銷案
- 逾期篩選在 DB 端算(`violation_service.deadline_sql`),與 Python 端的推導共用 `RESOLVE_MONTHS`
- 預設排序:未銷案在前,各組內發生日升冪(與工讀生端、社團端一致)
- 銷案寫 `audit_logs` 並推 Discord
- 未銷案且發生日落在評鑑視窗內的勸導,每筆扣行政分 1 分、上限 −10

## 未完成 / 問題

- 後端支援社團 / 填寫人 / 項目 / 地點 / 日期區間 / 逾期六種篩選,**前端全量抓回自己篩**,沒有用到
- 沒有分頁
- 開立違規只能由工讀生端做,行政端無法補開單
