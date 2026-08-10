# 行政總覽

`/admin` · `admin`(全體管理員,無權限鍵) · `features/admin/AdminHomePage.tsx`

## 用途

六張待辦計數卡,點進對應頁面。

## 資料來源

六個獨立的 count 查詢(`api/adminActivities.ts`),每張卡各自打一支端點:

| 卡片 | 導向 | 需要權限 |
|---|---|---|
| 待審活動申請 | `/admin/review` | `areview`/`aact`/簽核鍵 |
| 待審結案 | `/admin/close-review` | `aclose`/`approve_advisor` |
| 待審固定借用 | `/admin/rooms` | `aroom` |
| 待審臨時借用 | `/admin/bookings` | `abooking` |
| 逾期未還器材 | `/admin/overdue` | super |
| 未銷案違規 | `/admin/violations` | `aviol` |

## 規則

- 無權限的卡**不顯示也不打 API**(hooks 無條件呼叫,以 `enabled` 擋)
- 數字 >0 時顯示為主色(紅),否則為墨色;查詢未完成顯示 `—`
- 副標的學期由 `lib/semester.ts` 依今日推導

## 未完成 / 問題

- 卡片載入失敗時只顯示 `—`,與「查詢中」和「真的是 0」看起來一樣
- 沒有「待審申請彙整」「維修」「線上申請」的計數卡,那幾頁的待辦要自己進去看
