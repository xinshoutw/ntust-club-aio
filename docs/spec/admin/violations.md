# 違規管理

`/admin/violations` · `admin` · 權限鍵 `aviol` · `features/admin/AdminViolationsPage.tsx`

## 用途

全校違規勸導的查詢與銷案。

## 資料來源

| 動作 | 端點 |
|---|---|
| 列表 | `GET /admin/violations`(伺服器端分頁,每頁 50) |
| 篩選選項 | `GET /admin/violations/options`(違規項目、填寫人;取自實際紀錄) |
| 未銷案筆數 | `GET /admin/violations?status=open&page_size=1` 的 `meta.total` |
| 銷案 | `POST /admin/violations/{id}/resolve` |

## 畫面

表格:社團、日期、地點、違規項目、填寫人、銷案期限、狀態、動作。多欄可排序;逾期的列銷案鈕停用並附 Tooltip「已逾 1 個月銷案期限,不再受理銷案」。

銷案彈窗填處理說明。

## 規則

- **排序與篩選一律伺服器端**:多欄排序走白名單(`date`/`location`/`items`/`filler`/`deadline`/`status`),漏斗的多選值直接送後端(`status`/`item`/`filler_id` 皆收多值,`item` 多值=命中任一項)
- 篩選選項來自 `/options`(實際開立過的項目與填寫人),不是當前這一頁的列;違規項目目錄改過之後舊項目仍篩得到
- 期限漏斗只對未銷案有意義(已銷案該欄顯示「—」):只選一邊 → `expired` 布林;兩邊都選 = 僅未銷案;與狀態漏斗取交集,交集為空時不發查詢、直接顯示無資料
- **銷案期限 = 開立日 + 1 個月**,逾期即截止,後端回 409 `RESOLVE_EXPIRED`;期限當天仍可銷案
- 逾期篩選在 DB 端算(`violation_service.deadline_sql`),與 Python 端的推導共用 `RESOLVE_MONTHS`
- 預設排序:未銷案在前,各組內發生日升冪(與工讀生端、社團端一致)
- 銷案寫 `audit_logs` 並推 Discord
- 未銷案且發生日落在評鑑視窗內的勸導,每筆扣行政分 1 分、上限 −10

## 未完成 / 問題

- 後端另支援社團 / 地點 / 日期區間篩選,畫面尚無對應入口
- 開立違規只能由工讀生端做,行政端無法補開單
