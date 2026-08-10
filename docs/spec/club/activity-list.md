# 活動列表

`/activities` · `club` · `features/activities/ActivityListPage.tsx`

## 用途

該社所有活動申請的總覽與入口。退回件也在這裡,不另設「退回列表」頁。

## 資料來源

| 動作 | 端點 |
|---|---|
| 學期選項 | `GET /club/activities/semesters` |
| 草稿區 | `GET /club/activities?status=draft` |
| 主列表 | `GET /club/activities?semester=…` |
| 詳情 | `GET /club/activities/{id}` |
| 送出 / 刪除草稿 | `POST /club/activities/{id}/submit`、`DELETE /club/activities/{id}` |
| 文件下載 | `GET /club/activities/{id}/report-pdf`、`/reflections-pdf` |

## 畫面

頁首:標題 + 件數 + 學期下拉(資料既有學期 ∪ 當前學期,預設最新)。

**草稿卡片**(有草稿才出現,不分學期)— 欄位同主表,動作為「送出」「刪除」。排序:未填日期在前,再依日期新到舊。

**主表** — 名稱、類型(附大型徽章)、日期、經費(自籌/擬請)、狀態、動作。類型與狀態欄可多選篩選,名稱/類型/日期/經費/狀態可多鍵排序,預設 `-date, -id`。動作欄:可結案時出主要鈕「結案」(有結案草稿時前面加「草稿」標記),`approved` 但未結束時顯示灰字「未開始/進行中」。

**詳情彈窗**(點任一列)— 左欄基本資料、經費明細、退回原因、活動照片、結案檔案;活動已結案時右欄整段顯示結案成果全文與學習心得,彈窗加寬到 1080。與申請值不同的實際值(時間、地點、人數)以琥珀色 + 虛線底標示,hover 顯示預計值。右上角「⋯」下載選單:照片 zip、學習心得 PDF、成果報告 PDF。底部依狀態出「繼續編輯」/「編輯重送」/「前往結案」。

## 規則

- 狀態篩選以**顯示標籤**比對,三個審核關卡在社團端都顯示「待審核」,選單不出現重複項
- `approved` 且 `close_locked` 在前端映射為顯示狀態 `locked`
- 成果報告與學習心得 PDF 由後端依 `docs/模板_*.docx` 於下載時動態生成,不落檔
- 每列有隱形的鍵盤入口按鈕,不是只綁 `onClick`

## 未完成 / 問題

- 排序、篩選、分頁全在前端做:`fetchAllActivities` 逐頁抓完整學期資料再切,後端分頁與排序白名單形同虛設
- 學習心得 PDF 生成為 O(n²),合法上限的輸入需約 4 分鐘 CPU
- 詳情彈窗用 `<Spin>` 而非設計規範偏好的 Skeleton
