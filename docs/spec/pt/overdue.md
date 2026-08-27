# 逾期追蹤(工讀生)

`/pt/overdue`(行政端 `/admin/pt/overdue`,鍵 `astaff`) · `staff` · `features/pt/PtOverduePage.tsx`

## 用途

追蹤逾期未歸還的器材並發送提醒。**停權管理不在這裡**,屬行政端逾期追蹤頁(權限鍵 `aoverdue`,[admin/overdue.md](../admin/overdue.md))。

## 資料來源

| 動作 | 端點 |
|---|---|
| 逾期清單 | `GET /staff/equipment-loans?status=overdue` |
| 發送提醒 | `POST /staff/equipment-loans/{id}/remind` |

## 畫面

表格:社團、器材(含數量)、應歸還時限、已逾天數(紅字)、借用人(附申請時填的聯絡電話)、狀態(固定「已逾期」)、動作(發送提醒;提醒過的列另顯示上次提醒時間)。

行政手動借用的列,提醒鈕停用並附 Tooltip「行政手動借用無提醒對象」。

## 規則

- **逾期定義**:`status=checked_out` 且已過「結束日之隔天**上班日** 10:30」。上班日排除週末與 `holidays` 表的政府行事曆假日 —— 該表由 `scripts/import_holidays.py` 每年匯入一次(decisions.md GAP-06,不做後台介面);沒匯入的年度會退化成只排除週六日,逢國定假日的逾期判定偏一天
- 後端以單調門檻日(`overdue_threshold_in`)用 SQL 篩選,不逐列計算,分頁才正確
- 已逾天數由前端以**台北時區**日差計算(使用者可能不在 +08:00)
- 提醒同時推 Discord 與寄 Email 給社團聯絡人,經確認對話框才送出;與行政端逾期追蹤共用 `services/loan_remind.py`
- **工讀生看得到借用申請時填的聯絡電話**(借出點交、歸還點交、逾期追蹤三頁):現場點交與催還都需要當場聯絡得到人。工讀生可讀範圍仍限器材借用與報修/違規,郵局存簿等敏感檔不開放(見 `services/files.py` 的 `can_access`)

## 未完成 / 問題

- 通知重試只在記憶體(至多送 3 次),程序重啟即遺失
