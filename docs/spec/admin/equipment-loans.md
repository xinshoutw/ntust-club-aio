# 所有器材借用

`/admin/equipment-loans` · `admin` · 權限鍵 `aloanlist` · `features/admin/AdminBookingListPage.tsx`(`kind="loan"`)+ `BookingReviewModal.tsx`

## 用途

全校器材借用的查閱頁:一個學期、所有社團、所有狀態(待審核、已核准、已借出、已歸還、已逾期、已退回、已取消)攤在同一張表。不是待辦入口 —— 審核在 [bookings.md](bookings.md),點交在工讀生端,逾期追蹤在 [overdue.md](overdue.md)。與 [venue-bookings.md](venue-bookings.md) 是同一個元件。

## 資料來源

| 區塊 | 端點 |
|---|---|
| 學期下拉 | `GET /admin/equipment-loans/semesters`(有借用的學期,新到舊) |
| 主列表 | `GET /admin/equipment-loans?semester=&status=&club_id=&equipment_id=&sort=&page=`(`status` 可帶推導狀態 `overdue`;`status`、`club_id`、`equipment_id` 可重複帶) |
| 器材選項 | `GET /admin/equipment`(主檔全列,含停用 —— 舊單借的器材可能已停用;讀取鍵 `core/permissions.EQUIPMENT_READ_KEYS`) |
| 社團選項 | `GET /admin/clubs/options` |
| 核准 / 退回 / 撤銷 | 與審核頁同一組 `POST /admin/equipment-loans/{id}/{approve,reject,revoke}`,**只有另持 `abooking` 才接得上** |

## 畫面

頁首與表格結構同 [venue-bookings.md](venue-bookings.md);六欄依序:狀態、借用期間、社團、器材與數量、活動與用途、送件時間,預設排序 `-start_date`。沒有綁定活動的單只顯示用途。器材與數量欄 240px、**可多選篩選器材**(漏斗選項=主檔名稱,以名稱對 id,對不到就強制空集,同社團漏斗);每一格都單行截斷(理由見場地頁;審核頁 [bookings.md](bookings.md) 的同名欄位仍允許換行 —— 那頁固定每頁 50 筆、不吃 `useFitRows`,換行不會把分頁算錯)。

**詳情彈窗**:同一支 `BookingReviewModal`;器材單多顯示綁定活動,核准時改過數量的已核准列顯示「核准說明」(「數量調整:5 → 3」,`approvals.attach_decisions` 的 `approve_notes` 只對器材開)。其餘同場地頁。

## 規則

- 學期以**借用起日**歸屬;「已逾期」是推導狀態(`booking_service.is_overdue_in`),清單與漏斗都當狀態用
- **「已借出」不含逾期的**:兩者底層同為 `checked_out`,後端 `status=checked_out` 不帶 `overdue` 時會排除已逾期的列,否則勾一個標籤看到的是另一個標籤的列;兩個都勾就是整批 `checked_out`
- `aloanlist` 只開 `GET`;`GET /admin/equipment-loans` 是三把鍵共讀的(`core/permissions.LOAN_READ_KEYS`:借用審核、逾期追蹤、本頁)
- 其餘規則(兩個判定、漏斗空集、clamp、路由 `key`)同場地頁

## 未完成 / 問題

- 逾期列不顯示上次催還時間(`last_reminded_at`),那欄只在逾期追蹤頁
- 沒有關鍵字搜尋與匯出 CSV
