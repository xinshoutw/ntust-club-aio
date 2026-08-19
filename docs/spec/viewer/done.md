# 已完成評分

`/viewer/done` · `viewer` · `features/viewer/ViewerDonePage.tsx`

## 用途

評審回顧自己這一年度已送出的評分。唯讀。

## 資料來源

`GET /viewer/done?sort&page&page_size`(每頁 20)

## 畫面

表格:獎項、社團、總分、完成時間。四欄皆可多鍵排序(伺服器端),預設 `-submitted_at`。

## 規則

- 只列 `submitted_at` 非 NULL 且屬當前評鑑年度、reviewer 為自己的評分
- 總分 = 細項分數合計 + 簡報分(SQL 相關子查詢算出,可直接當排序鍵)
- 顯示時 `Math.round(total * 100) / 100` 去掉浮點雜訊(細項配分為 float)

## 未完成 / 問題

- 列不可點,要修改評分得回「評分(依獎項)」自己找社團
