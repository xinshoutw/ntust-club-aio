# 違規勸導填寫

`/pt/violations/new` · `staff` · `features/pt/PtViolationFormPage.tsx`

> `/pt` 的 index 直接轉導到本頁,工讀生登入後第一眼就是這裡。

## 用途

工讀生巡場後開立違規勸導。

## 資料來源

| 動作 | 端點 |
|---|---|
| 社團下拉 | `GET /staff/clubs`(不分頁;端點含停用社團,前端只列啟用中) |
| 違規項目目錄 | `GET /staff/violation-items`(`system_settings.violation_items`) |
| 送出 | `POST /staff/violations` |

## 畫面

表單:社團(可搜尋下拉,只列啟用中社團 —— 全站選擇器同一條規則,見 `design-guide.md` §6)、發生日期、地點、違規項目(複選,來自目錄)、其他說明(選填,≤500 字)。

## 規則

- 填寫人 = 登入的工讀生,由後端取 session,不可指定
- 發生日期不可晚於今天(前後端各一道)
- 違規項目必須是目錄的子集,後端逐項比對
- 開立後推 Discord 給該社,訊息含銷案期限
- 銷案期限 = 開立日 + 1 個月;**銷案動作屬行政端**,工讀生不能銷案

## 未完成 / 問題

- 送出成功後只清空表單,沒有「剛才開立了哪一筆」的回饋或連結
