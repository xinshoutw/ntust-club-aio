# 臨時場地器材借用審核

`/admin/bookings` · `admin` · 權限鍵 `abooking` · `features/admin/AdminBookingsPage.tsx` + `BookingReviewModal.tsx`

## 用途

臨時場地與器材借用的單關審核,頁首是與社團端共用的借用情形色格圖。

## 資料來源

| 動作 | 端點 |
|---|---|
| 借用情形色格圖 | `GET /public/{venues,periods}`、`/public/bookings/availability{,-range}`、`/public/equipment/usage`(與社團端同一組) |
| 待審場地 / 器材 | `GET /admin/venue-bookings?status=pending`、`/admin/equipment-loans?status=pending`(兩支都逐列帶退回/撤銷的 `decision_reason`、`decided_at`、`decided_by`;本頁只查待審,那三欄一律 null) |
| 核准 / 退回 | `POST /admin/{venue-bookings,equipment-loans}/{id}/{approve,reject}` |

## 畫面

**借用情形** — 社團端借用總覽那張色格圖的同一個元件(`features/bookings/BookingGrid.tsx`),畫面與規則見 [club/booking-overview.md](../club/booking-overview.md);與社團端的差別:

- 可借格點下去帶參數跳「手動借用」而不是社團的申請頁,而且**過去日期照樣可點**(補登是手動借用的用途)。**只持 `abooking` 的承辦這些格子點不動** —— 手動借用是另一把鍵(`amanual`),看得到不等於動得了
- **有待審單的格子就地開審核彈窗**:格內描邊為橘色,hover 列出該格全部待審單。一格多筆時點擊出選單擇一
- 圖例不列「我的借用」(行政帳號沒有社團)

**場地待審表** — 社團、場地、日期、時段與用途、狀態。每頁 50。

**器材待審表** — 社團、器材與數量、借用期間、活動與用途、狀態。**沒有綁定活動的單顯示用途**(行政手動借用、舊系統斷鏈,或 802 國際事務處 D-36)。**該區間可借數不足時數量標紅**,Tooltip 顯示可借數。

**審核彈窗** — 社團、場地/器材、日期時段或借用區間、綁定活動(僅器材,且沒綁活動時整列不顯示)、用途、聯絡電話;器材可借數不足時顯示紅色說明區塊。動作:退回(必填原因)、核准。

## 規則

- 色格圖的 `pending` 欄**只回給持 `abooking` 的承辦**(後端 `api/v1/public._sees_pending`;首登未改密的帳號也不給):社團與匿名看得到格色,看不到是誰在等。該格帶**全部**待審單(臨時借用在前、固定借用在後,各類內依申請 id 即送件序;兩張表的 id 不可比),已核准或不開放蓋掉格色只影響顏色,底下的待審臨時借用照樣點得開。固定借用的待審單標示得到但點不了(要到「固定場地借用審核」審)
- 核准臨時場地時以 `pg_advisory_xact_lock` 鎖場地,檢查同場地同日**已核准**借用的節次重疊(`SLOT_TAKEN`)與不開放規則(`SLOT_BLOCKED`)。臨時與固定搶同一間場地,兩端共用 `venue` 命名空間的鎖並互相交叉檢核
- **器材可借數不足仍可核准**(decisions.md DEC-04):屬管理員裁量,只以紅字警示,不硬擋
- 核准/退回都寫 `approval_records`(stage=`single`)與 `audit_logs`,並推 Discord
- 行政手動借用(`club_id` 為 NULL)在列表顯示「學務處」;沒有社團可推,建立與撤銷改推系統 webhook(K4 / K4b)

## 未完成 / 問題

- 色格圖點擊仍要在「本頁待審列表」裡找到該筆才開得了彈窗:待審單超過一頁時,格子點下去只會指路到列表翻頁
- 逾時待審不自動駁回(GAP-12 已定案維持人工處理);本頁的批次核准沒做,也未拍板(GAP-13 定的是固定借用衝突那一種)
