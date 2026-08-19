# 固定場地借用審核

`/admin/rooms` · `admin` · 權限鍵 `aroom` · `features/admin/AdminRoomsPage.tsx`

## 用途

固定場地借用申請的單關審核。衝突時整單擇一核准,不做部分同意。

## 資料來源

| 動作 | 端點 |
|---|---|
| 受理期間 | `GET /admin/room-bookings/window`(一般 admin 即可讀;只用於頁面上方的說明橫幅,回 `state`:unset / upcoming / open / closed) |
| 待審清單 | `GET /admin/room-bookings?status=pending`(每頁 50) |
| 衝突比對名單 | `GET /admin/room-bookings?status=pending`(全量)+ `?status=approved&active=true`(全量,`active` 排除學期已結束的) |
| 核准 / 退回 | `POST /admin/room-bookings/{id}/{approve,reject}` |

## 畫面

待審表格(社團、場地、每週時段、用途、狀態)。衝突時段以紅字標示,並分兩種:撞到別張待審單標「(衝突)」,撞到已核准單標「(已核准佔用)」。

**審核彈窗** — 場地名、社團、用途、每週時段逐列(衝突紅字);撞到待審單顯示「此申請與其他申請衝突,請擇一核准」,撞到已核准單則顯示核准會被擋下、請退回或先撤銷該筆。動作:退回(原因**預填一段固定文案**,可改)、核准。

## 規則

- **受理期間只擋社團送新單,不擋審核**:期間結束後承辦仍要審完手上的單,本頁與側欄項目全年都在(後端審核端點從不檢查開放窗,`test_admin_rooms.test_review_stays_open_after_the_window_closes` 釘住)。非受理中時頁面上方以橫幅說明,而且**三種未開放要分開講**(尚未設定 / 尚未開始 / 已結束)—— 承辦剛排好下一輪受理期間卻看到「已結束」的話,他會以為自己設錯了(`features/admin/intakeWindow.ts`)。這支查詢失敗就不顯示橫幅,清單與審核照常
- 核准時以 advisory lock 鎖場地,檢查同場地、學期區間重疊、狀態為已核准的單是否已佔用相同 `(weekday, period)`(`SLOT_TAKEN`),以及學期內是否有已核准臨時借用或**場地不開放規則**命中(`SLOT_BLOCKED`)
- 一單多時段,核准即全部生效;退回原因必填
- 已核准單只取 `active=true`(學期未結束)。核准檢核本身不看日期,兩者一致的前提是**申請單的學期區間都由 `next_semester_range` 產生**(上下學期恰好接續);日後若有人工或匯入寫進非標準 `end_date`,畫面會漏標後端仍會擋的衝突
- 衝突判定 `roomConflictSlots` 由本頁與社團總覽共用,兩處都吃全量待審單 + 全量進行中已核准單;判定軸與核准檢核一致(同場地 × **目標學期區間重疊** × 同星期同節次),同一格兩種衝突並存時以「已核准佔用」為準(能做的只剩退回);任一份名單載入中或失敗時不會靜默顯示成「沒有衝突」

## 未完成 / 問題

- 畫面的衝突標示不含**臨時借用**:整學期時段撞到已核准的單日臨時借用時後端會擋(`SLOT_TAKEN`),畫面上看不出來
