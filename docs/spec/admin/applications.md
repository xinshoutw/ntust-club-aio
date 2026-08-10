# 線上申請管理

`/admin/applications` · `admin` · 權限鍵 `aapply` · `features/admin/AdminApplicationsPage.tsx`

## 用途

幹部證明與郵局帳戶異動的狀態推進。是「待審申請彙整」的實作。

## 資料來源

| 動作 | 端點 |
|---|---|
| 幹部證明 | `GET /admin/officer-certificates`(前端逐頁抓齊) |
| 郵局異動 | `GET /admin/postal-changes`(前端逐頁抓齊) |
| 推進狀態 | `POST /admin/{officer-certificates,postal-changes}/{id}/status` |

## 畫面

兩張表:

**幹部證明** — 社團、學年期、職位、申請人、申請日、狀態。
**郵局帳戶異動** — 社團、事由、戶名、局號帳號、新代理人、申請日、狀態。

## 規則

- 狀態機:`pending`(審核中)→ `processing`(處理中)→ `completed`(請洽學務處);**只能單步前進,不可回退也不可跳關**(違反回 409 `INVALID_STATUS_TRANSITION`),**沒有退回**
- 預設排序:審核中 → 處理中 → 完成,各組內申請日升冪
- 局號帳號在行政端走 `mask_account`(前 3 + 末 2);電話遮罩成末 3 碼
- 每次推進寫 `audit_logs` 並推 Discord 給該社

## 未完成 / 問題

- 這頁是前端把兩個端點的結果併起來,不是真正的「待審申請彙整」—— 報修、借用、活動都不在其中
- 兩張表都靠 `fetchAllPages` 全量抓回,沒有分頁、沒有社團篩選(後端有 `club_id` 參數但前端沒接)
- 郵局申請的存簿影本在此看不到,要到檔案管理找
- 狀態不可回退,誤按「處理中」就沒有回頭路
