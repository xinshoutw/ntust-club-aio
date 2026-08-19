# 行政總覽

`/admin` · `admin`(全體管理員,無權限鍵) · `features/admin/AdminHomePage.tsx`

## 用途

六張待辦計數卡,點進對應頁面。

## 資料來源

`GET /badges` 一支查詢供給六張卡,與側欄徽章同一份數字。第一張算的是**簽得下去**的關卡(與待審佇列同一集合),其餘算該頁的預設漏斗:

| 卡片 | 導向 | 需要權限 |
|---|---|---|
| 待我簽核的活動申請 | `/admin/review` | `areview`/簽核鍵 |
| 待審結案 | `/admin/close-review` | `aclose`/`approve_advisor` |
| 待審固定借用 | `/admin/rooms` | `aroom` |
| 待審臨時借用 | `/admin/bookings` | `abooking` |
| 逾期未還器材 | `/admin/overdue` | `aoverdue` |
| 未銷案違規 | `/admin/violations` | `aviol` |

## 規則

- 無權限的卡不顯示(`canAccessAdminPath`);後端也不會回那把鍵
- 數字 >0 時顯示為主色(紅),否則為墨色;查詢未完成與失敗一律顯示 `—`(真的是 0 會印 0)
- 副標的學期由 `lib/semester.ts` 依今日推導

## 未完成 / 問題

- 沒有「待審申請彙整」「維修」「線上申請」的計數卡,那幾頁的待辦要自己進去看
