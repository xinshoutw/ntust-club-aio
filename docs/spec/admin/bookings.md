# 臨時場地器材借用審核

`/admin/bookings` · `admin` · 權限鍵 `abooking` · `features/admin/AdminBookingsPage.tsx` + `BookingReviewModal.tsx`

## 用途

臨時場地與器材借用的單關審核,附全校單日場況圖。

## 資料來源

| 動作 | 端點 |
|---|---|
| 場地主檔 | `GET /admin/venues` |
| 單日場況 | `GET /admin/bookings/availability?date=` |
| 待審場地 / 器材 | `GET /admin/venue-bookings?status=pending`、`/admin/equipment-loans?status=pending` |
| 核准 / 退回 | `POST /admin/{venue-bookings,equipment-loans}/{id}/{approve,reject}` |

## 畫面

**場地借用情形** — 全校單日格圖(列 = 場地、欄 = 14 節次),日期前後切換 + 今天。圖例四色:可借 / 審核中 / 臨時借用 / 固定借用。**只有橘色「審核中」格可點**,點擊直接開該筆的審核彈窗。

**場地待審表** — 社團、場地、日期、時段與用途、狀態。每頁 50。

**器材待審表** — 社團、器材與數量、借用期間、活動與用途、狀態。**該區間可借數不足時數量標紅**,Tooltip 顯示可借數。

**審核彈窗** — 社團、場地/器材、日期時段或借用區間、綁定活動、用途;器材可借數不足時顯示紅色說明區塊。動作:退回(必填原因)、核准。

## 規則

- 核准臨時場地時以 `pg_advisory_xact_lock` 鎖場地,檢查同場地同日**已核准**借用的節次重疊(`SLOT_TAKEN`)與不開放規則(`SLOT_BLOCKED`)
- **器材可借數不足仍可核准**,屬管理員裁量,只以紅字警示;是否改為硬擋尚未拍板
- 核准/退回都寫 `approval_records`(stage=`single`)與 `audit_logs`,並推 Discord
- 行政手動借用(`club_id` 為 NULL)在列表顯示「學務處」,不推通知

## 未完成 / 問題

- **核准臨時借用不檢核固定借用**:同場地同時段可同時存在已核准的固定借用與臨時借用。修的時候要一起改鎖 —— 兩端的 advisory lock 命名空間不同(`venue` / `room`),補上交叉查詢也不會互相序列化;手動借用也有同樣缺口
- **場況圖完全不顯示審核中的固定借用**(`admin_availability_grid` 的 fixed 查詢只取已核准,社團端則會標 `pending`)。承辦人核准臨時借用時那格是空白的,與上一條疊加後雙重核准連目視都攔不下來
- 場況圖「已核准」蓋過「審核中」,被覆蓋的待審單從格子點不到,連 hover 社團名也沒了。兩筆都是 `pending` 時因為用嚴格大於而保留先寫入者,而該查詢沒有 `ORDER BY` —— 「兩社搶同一格」時哪一筆點得到由 PG 回傳順序決定
- 場況圖的社團名靠比對「本頁待審列表」取得,已核准的格子永遠沒有社團名可 hover
- 申請時填的聯絡電話後端從未回傳,審核時看不到聯絡人
- 逾時未審的申請不會自動駁回,pending 佇列會無限累積
- 沒有批次核准,衝突連鎖自動駁回也未做
