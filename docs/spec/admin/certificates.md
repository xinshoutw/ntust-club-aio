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

- 狀態機:`pending`(審核中)→ `processing`(處理中)→ `completed`(已完成);**只能往前,但可跳過處理中**(審核中直接改已完成;D-25),回退回 409 `INVALID_STATUS_TRANSITION`。另有 `declined`(已駁回)這個終態,審核中與處理中皆可直接駁回(D-37);兩個終態都不可再改。下拉開放的正是往前走得到的那幾個(前後端各一份:`_CERT_NEXT` / `ALLOWED_NEXT.cert`)
- **駁回不附原因**:承辦線下向社團說明,系統只記狀態。社團要重新申請就再送一張
- **只有「已駁回」多問一次**(`confirmDialog`):誤按「已完成」是補做一份證明,誤按駁回會當場推一則駁回通知給社團且回不去 —— 損害不對稱
- 排序由後端固定:審核中 → 處理中 → 終態(已完成與已駁回同組),各組內申請日升冪
- 每次推進寫 `audit_logs` 並推 Discord 給該社
- 狀態下拉與郵局帳戶管理共用 `features/admin/ApplicationStatusCell.tsx`,差別只在**「已駁回」是本頁專有的選項**,郵局那頁不列(值域共用 `ApplicationStatus`,狀態機不共用)

## 未完成 / 問題

- 沒有社團篩選入口(後端有 `club_id` 參數)
- 狀態不可回退,誤按「處理中」或「已駁回」就沒有回頭路
