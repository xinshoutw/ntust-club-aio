# 違規紀錄查詢

`/pt/violations`(行政端 `/admin/pt/violations`,鍵 `astaff`) · `staff` · `features/pt/PtViolationsPage.tsx`

## 用途

工讀生查全校違規紀錄。唯一寫入是未銷案單的「補傳附件」。

## 資料來源

| 動作 | 端點 |
|---|---|
| 列表 | `GET /staff/violations?sort&page&page_size`(每頁 20;逐列帶 `attachments`)。列表形狀、排序白名單與行政端 `/admin/violations` 共用同一份實作 |
| 上傳上限 | `GET /staff/config` |
| 補傳附件 | `POST /staff/violations/{id}/attachments`(逐檔) |

## 畫面

表格:發生日、社團、地點、違規項目(下方顯示其他說明與附件連結)、填寫人、銷案期限、狀態、附件。除「社團」外皆可多鍵排序(伺服器端)。

「附件」欄:未銷案且未滿 5 檔顯示「補傳」(0 檔時紅字「補傳附件」),點開彈窗(`AttachmentRetryModal`,與空間報修同一套驗證;`maxCount` = 5 − 既有份數);其餘顯示份數。

## 規則

- 預設排序:未銷案在前,組內依發生日升冪(與行政端、社團端三方一致)
- 可看**全校**所有社團的紀錄,不限自己開立的
- 補傳是給開立時附件那一步失敗的單用的(見 [violation-form.md](violation-form.md)),不限填寫人;已銷案的單後端回 422,畫面不給入口。補傳多檔逐檔上傳,中途失敗把已上傳成功的挑出待傳清單

## 未完成 / 問題

- 沒有社團或狀態篩選,也不能只看自己開立的;紀錄一多就只能翻頁
- 「社團」欄不在後端排序白名單內,無法依社團排序
