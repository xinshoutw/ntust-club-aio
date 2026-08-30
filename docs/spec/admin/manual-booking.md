# 手動借用

`/admin/manual-booking` · `admin` · 權限鍵 `amanual` · `features/admin/ManualBookingPage.tsx`

## 用途

學務處自己借場地或器材,免審核直接核准;也是舊資料補登的入口。佔用在各處顯示為「學務處」。

## 資料來源

| 動作 | 端點 |
|---|---|
| 場地主檔 | `GET /admin/venues` |
| 器材主檔 | `GET /admin/equipment` |
| 建立 | `POST /admin/bookings/manual-venue`、`/manual-equipment` |

## 畫面

左右兩張表單卡。

**臨時場地** — 場地(可搜尋)、日期、時段(`PeriodPicker`)、用途、聯絡電話(選填)。
**器材** — 器材(標總數)、數量、借用區間(RangePicker)、用途、聯絡電話(選填)。

兩者的聯絡電話**不受社團端的 10 碼/4 碼格式限制**(`Manual*In` 走寬鬆的字元白名單)——這一頁是補登紙本舊件,單子上寫什麼就是什麼。

## 規則

- 建立的單 `club_id` 為 NULL、狀態直接 `approved`
- 場地:與核准端同鎖同檢核(advisory lock + 已核准時段重疊 `SLOT_TAKEN`);**不受場地不開放規則限制**(封鎖常常正是配合行政徵用)
- 器材:鎖器材 + 區間可借數檢核;**不受單次可借上限限制**(super override)
- 後端**刻意不擋過去日期** —— 補登歷史資料正是本功能的用途之一
- 兩者都寫 `audit_logs`

## 未完成 / 問題

- 建立後這頁看不到自己剛建的單,要到別頁才查得到
- 手動借用建立後無法修改;撤銷要繞到借用管理的審核彈窗,本頁沒有入口
