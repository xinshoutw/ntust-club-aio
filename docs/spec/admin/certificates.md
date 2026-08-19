# 幹部證明管理

`/admin/certificates` · `admin` · 權限鍵 `acert` · `features/admin/AdminCertificatesPage.tsx`

## 用途

幹部證明申請的狀態推進。

## 資料來源

| 動作 | 端點 |
|---|---|
| 幹部證明 | `GET /admin/officer-certificates`(伺服器端分頁,每頁 50) |
| 待處理件數 | 同端點帶 `?status=pending&page_size=1`,取 `meta.total` |
| 推進狀態 | `POST /admin/officer-certificates/{id}/status` |

## 畫面

一張表:社團、學年期、職位、申請人、申請日、狀態。

## 規則

- 狀態機:`pending`(審核中)→ `processing`(處理中)→ `completed`(請洽學務處);**只能單步前進,不可回退也不可跳關**(違反回 409 `INVALID_STATUS_TRANSITION`),**沒有退回**
- 排序由後端固定:審核中 → 處理中 → 完成,各組內申請日升冪
- 每次推進寫 `audit_logs` 並推 Discord 給該社
- 狀態下拉與郵局帳戶管理共用 `features/admin/ApplicationStatusCell.tsx`(同一組狀態機)

## 未完成 / 問題

- 沒有社團篩選入口(後端有 `club_id` 參數)
- 狀態不可回退,誤按「處理中」就沒有回頭路
