# 借用總覽(工讀生)

`/pt/bookings` · `staff` · `features/pt/PtBookingsPage.tsx`

## 用途

櫃台查詢全校借用情形。**只有色格圖**,不申請、不審核。

## 資料來源

| 區塊 | 端點 |
|---|---|
| 節次目錄 | `/auth/me` 帶下來的那一份 |
| 色格圖 | `GET /public/venues`、`/public/bookings/availability{,-range}`、`/public/equipment/usage` |

## 畫面

`BookingGrid` 一張卡 —— 與社團端借用總覽、行政端臨時場地器材借用、未登入首頁同一個元件,場地/器材切換、日期前後、單一場地 15 天下鑽全都在。

## 規則

- **點不動**:沒給 `onBookVenue` / `onBookEquipment` 就不畫可點的格子(同 [shared/public-home.md](../shared/public-home.md))
- 圖例不列「我的借用」(要有社團身分才判定得出來);格子也不帶待審單清單(那只給持 `abooking` 的承辦)
- 資料走免登入的 `/public/*`,工讀生身分不影響看得到什麼
- **工讀生端唯一不鏡射到行政端的頁**(其餘五頁見 [README](../README.md) 的 D-26):承辦在
  [admin/bookings.md](../admin/bookings.md) 有同一張圖,而且點得開待審單;鏡射一份唯讀版
  只會多一個更弱的重複入口 —— `_sees_pending` 只看權限鍵不看路由,持 `abooking` 的人
  在那份唯讀版會看到待審橘框卻點不動(`lib/nav.PT_BOOKINGS` 因此排在 `PT_GROUPS` 外)
