# 線上申請管理

`/admin/applications` · `admin` · 權限鍵 `aapply` · `features/admin/AdminApplicationsPage.tsx`

## 用途

幹部證明與郵局帳戶異動的狀態推進。是「待審申請彙整」的實作。

## 資料來源

| 動作 | 端點 |
|---|---|
| 幹部證明 | `GET /admin/officer-certificates`(伺服器端分頁,每頁 50) |
| 郵局異動 | `GET /admin/postal-changes`(伺服器端分頁,每頁 50) |
| 待處理件數 | 兩支端點各帶 `?status=pending&page_size=1`,取 `meta.total` 相加 |
| 推進狀態 | `POST /admin/{officer-certificates,postal-changes}/{id}/status` |

## 畫面

兩張表:

**幹部證明** — 社團、學年期、職位、申請人、申請日、狀態。
**郵局帳戶異動** — 社團、事由、戶名、局號帳號、新代理人、存簿影本、申請日、狀態。存簿影本連到 `GET /files/{id}`。

## 規則

- 狀態機:`pending`(審核中)→ `processing`(處理中)→ `completed`(請洽學務處);**只能單步前進,不可回退也不可跳關**(違反回 409 `INVALID_STATUS_TRANSITION`),**沒有退回**
- 排序由後端固定(審核中 → 處理中 → 完成,各組內申請日升冪),兩張表各自分頁、頁碼不共用
- 局號帳號在行政端走 `mask_account`(前 3 + 末 2);電話遮罩成末 3 碼
- 每次推進寫 `audit_logs` 並推 Discord 給該社
- 存簿影本隨列表一起回(整頁一次查,不逐列);已歸檔的檔案不列

## 未完成 / 問題

- 這頁是前端把兩個端點的結果併起來,不是真正的「待審申請彙整」—— 報修、借用、活動都不在其中
- 存簿影本的下載入口讓只持 `aapply` 的管理員一鍵取得個資掃描件(技術上 ISS-23 早已允許,但可達性從「要知道 uuid」變成「一個連結」);ISS-23 分類權限時要一併評估這個入口
- 兩張表沒有社團篩選入口(後端有 `club_id` 參數)
- 狀態不可回退,誤按「處理中」就沒有回頭路
