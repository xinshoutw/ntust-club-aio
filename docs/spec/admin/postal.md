# 郵局帳戶管理

`/admin/postal` · `admin` · 權限鍵 `apostal` · `features/admin/AdminPostalPage.tsx`

## 用途

郵局帳戶異動申請的狀態推進。

## 資料來源

| 動作 | 端點 |
|---|---|
| 郵局異動 | `GET /admin/postal-changes`(伺服器端分頁,每頁 50) |
| 待處理件數 | 同端點帶 `?status=pending&page_size=1`,取 `meta.total` |
| 推進狀態 | `POST /admin/postal-changes/{id}/status` |

## 畫面

一張表:社團、事由、戶名、局號帳號、新代理人、存簿影本、申請日、狀態。存簿影本連到 `GET /files/{id}`。

## 規則

- 狀態機與排序同 [certificates.md](certificates.md),但**沒有「已駁回」**(D-37 只給幹部證明):共用 `ApplicationStatusCell`,郵局這頁不列該選項,後端送過來也回 409
- **事由以外的欄位皆可為空**(decisions.md D-07),空值一律顯示 `—`
- 局號帳號在行政端走 `mask_account`(前 3 + 末 2);電話遮罩成末 3 碼
- 存簿影本隨列表一起回(整頁一次查,不逐列);已歸檔的檔案不列
- 每次推進寫 `audit_logs` 並推 Discord 給該社

## 未完成 / 問題

- 沒有社團篩選入口(後端有 `club_id` 參數)
- 狀態不可回退,誤按「處理中」就沒有回頭路
