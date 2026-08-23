# 所有活動

`/admin/activities` · `admin` · 權限鍵 `aactivity` · `features/admin/AdminActivitiesPage.tsx`

## 用途

全校活動的查閱頁:一個學期、所有社團、所有狀態(申請中、已核准、已退回、結案審核中、已結案、已逾期)攤在同一張表。用來回答「那件活動後來怎麼了」,不是待辦入口 —— 待辦在 [review.md](review.md) 與 [close-review.md](close-review.md)。

## 資料來源

| 區塊 | 端點 |
|---|---|
| 學期下拉 | `GET /admin/activities/semesters` |
| 主列表 | `GET /admin/activities?semester=&q=&status=&club_id=&type=&overdue=&sort=&page=`(伺服器端分頁,每頁 10) |
| 詳情(審核彈窗) | `GET /admin/activities/{id}` |
| 詳情(完整檢視) | 同一支端點,改以社團端的對照轉型 |
| 核准 / 退回 | `POST /admin/activities/{id}/approve`、`/reject` |
| 結案文件 | `GET /admin/activities/{id}/report-pdf`、`/reflections-pdf` |
| 社團選項 | `GET /admin/clubs/options` |

## 畫面

頁首:標題 + 件數 + 「逾期未結案」勾選 + 活動名稱搜尋 + 學期下拉(含**全部學期**,預設最新學期)。

表格八欄:社團、活動名稱、類型(附大型徽章)、活動日期、經費(自籌／核定)、狀態、送件時間、審核時間。社團 / 類型 / 狀態可多選篩選;除經費外皆可多鍵排序,預設 `-date`。

**詳情彈窗依狀態切換**:

| 狀態 | 開什麼 |
|---|---|
| 結案審核中、已結案 | `features/activities/ActivityPreviewModal`(社團端那份完整檢視,唯讀):結案成果全文、活動照片、學習心得、檢討會議 |
| 其餘 | `ActivityReviewModal`(與申請審核頁同一支):待本關者可就地核准/退回,非本關自動唯讀 |

## 規則

- **經費欄不給排序**:欄位顯示「自籌 / 核定」,而排序鍵 `budget` 是「自籌 + 擬請」合計 —— 兩者不是同一件事,給了排序鈕就是名實不符的指示器
- **核定為 `null` = 承辦還沒核定**,不是核了 0 元,顯示 `—`
- **學期下拉必須有「全部學期」**:逾期未結案與跨學期搜尋幾乎都落在舊學期(issues.md ISS-95 記過同一個坑),夾在單一學期裡看到的「無符合條件」是騙人的
- 搜尋為**伺服器端** `ILIKE`(`%` `_` `\` 一律跳脫,搜「100%」是字面的百分號),按 Enter 或搜尋鈕才送出(邊打邊送等於對 14k 筆逐鍵掃一次);按清除鈕即還原(AntD 的 `allowClear` 不保證觸發 `onSearch`)
- 「逾期未結案」= `overdue=true`:已核准且超過結案期限者,**不分是否已解鎖**(是否鎖定看狀態欄是「已核准」還是「已逾期」)。與狀態篩選是 AND —— 同時選「已結案」會是空集
- 狀態篩選送的是**顯示狀態**,含推導的 `locked`(`activity_service.display_status_filter`,與社團端同一份)
- 社團漏斗以名稱對 id:有選社團但主檔未載入或名稱失效時**強制空集**,不可 fail-open 回全部
- 分頁只在查詢成功後 clamp:失敗時 `total` 也是 0,一起收斂會把錯誤說明洗掉
- 兩個彈窗吃不同型別,詳情**只發需要的那一支**;完整檢視在詳情到齊前用清單同一次查詢的社團端形狀撐住標題(`clubRows` 與 `rows` 出自同一份 payload,同序同長)
- 受限關卡帳號的視野一樣受限:`aactivity` 在 `activity_service.FULL_VIEW_KEYS` 內、看得到全部狀態;只持 `approve_dean` 這類帳號進不了本頁(側欄與路由都會擋)

## 未完成 / 問題

- ISS-99:「送件時間」取的是活動建立時間,不是送出時間
- 活動日期只顯示開始日,跨日活動看不到結束日(欄寬 104px;與申請審核頁一致)
- 沒有匯出 CSV
