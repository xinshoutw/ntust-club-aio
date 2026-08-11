# 維修管理

`/admin/maintenance` · `admin` · 權限鍵 `amaint` · `features/admin/AdminMaintenancePage.tsx`

## 用途

社團空間報修的狀態推進與處理備註。

## 資料來源

| 動作 | 端點 |
|---|---|
| 列表 | `GET /admin/maintenance`(伺服器端分頁,每頁 50) |
| 待處理件數 | `GET /admin/maintenance?status=pending&page_size=1` 的 `meta.total` |
| 推進狀態 | `POST /admin/maintenance/{id}/status` |

## 畫面

表格:社團、地點、項目、佐證、申請日、狀態。佐證欄逐檔連到 `GET /files/{id}`。地點、申請日、狀態可排序(伺服器端白名單;狀態依處理進度而非列舉字面值)。

## 規則

- 狀態機:`pending`(待處理)→ `in_progress`(處理中)→ `done`(已完成);**只能單步前進**,違反回 409 `INVALID_STATUS_TRANSITION`
- 推進時可一併寫「處理備註」,社團端在自己的報修列表看得到
- 預設排序:待處理 → 處理中 → 已完成,各組內申請日升冪
- 每次推進寫 `audit_logs` 並推 Discord
- 佐證照片/影片隨列表一起回(整頁一次查,不逐列);已歸檔的檔案不列

## 未完成 / 問題

- 畫面無社團篩選入口(後端有 `club_id` 參數)
- 狀態不可回退
