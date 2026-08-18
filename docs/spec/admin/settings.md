# 系統設定

`/admin/settings` · `admin` · 權限鍵 `asetting`(場地與器材主檔亦在此頁) · `features/admin/AdminSettingsPage.tsx`

> 側欄沒有這一項,入口只有頂欄帳號選單的「設定」。

## 用途

`system_settings` 的後台編輯,加上場地與器材主檔 CRUD。

## 資料來源

| 動作 | 端點 |
|---|---|
| 讀取 | `GET /admin/settings`(回全部受管鍵,無值則回預設) |
| 儲存 | `PUT /admin/settings`(部分更新,只寫有帶的鍵) |
| 場地主檔 | `GET /admin/venues?include_inactive=true`、`POST /admin/venues`、`PATCH /admin/venues/{id}` |
| 器材主檔 | `GET\|POST /admin/equipment`、`PATCH /admin/equipment/{id}` |

## 畫面

| 區塊 | 欄位 |
|---|---|
| 借用 | 固定場地借用受理期間(日期區間)、器材借用活動前緩衝(工作天)、活動後緩衝 |
| 活動與評鑑 | 活動結案期限(N 個月)、評鑑年度 |
| 各申請性質的附件加總上限(MB) | 活動申請附件、空間報修佐證、活動結案照片 |
| 單檔上限(MB) | 文件、圖片、壓縮檔、影片 |
| 儲存空間 | 單一社團限制(GiB) |
| 違規項目目錄 | AntD 可編輯標籤(closable Tag + 虛線「新增」;逗號/頓號即分隔) |
| 經費項目 | 每列名稱 + 提示(選填),可增刪 |
| 場地主檔 | 名稱 / 類別 / 容納人數(空=未設)/ 開放固定借用 / 開放臨時借用 / 啟用開關,底部一列新增 |
| 器材主檔 | 名稱 / 點交方式 / 總數 / 單次可借上限(空=不限)/ 啟用開關,底部一列新增 |

## 規則

- 受管鍵共 11 個(見 `admin_settings.MANAGED_KEYS`),`.env` 只放恆不變的連線與密鑰
- **上傳上限的可調範圍貼齊 nginx 的 `client_max_body_size`**(圖/文件 50MB、影片 200MB):調得比它高的話,設定頁收下、`/club/config` 下發、畫面照著顯示新上限,而使用者一送出就吃 nginx 的 413 ——「畫面說 100MB、系統回超過上限」是最難查的一種不一致。`zip` 沒有任何端點在用,不受此限
- **受理期間一經收到申請就不能換學期**(`INTAKE_SEMESTER_LOCKED`):固定借用的目標學期由受理期間結束日推導,把 `open_until` 從 7/31 延到 8/1 這種「再開三天」會讓它跳到下一個學期 —— 已收到的申請存的是舊學期的起訖快照,每社 10 節額度會歸零、場況圖清空,連核准關的重疊檢核都因為兩段區間不重疊而擋不住雙重核准。同一個學期內調整不受限
- 兩份主檔的「刪除」都是停用(`is_active=false`),避免既有借用單(場地另含不開放規則)的外鍵斷裂;每列 blur 有差異才 PATCH,離散控制(類別/借用型態/點交方式/啟用)變更即送
- `GET /admin/venues` 一支兩用:預設只回啟用中(場況圖與手動借用的列首),主檔維護頁帶 `include_inactive=true`;讀取開給 `VENUE_READ_KEYS`(`abooking`/`asetting`/`amanual`/`arule`),`include_inactive` 與新增修改限 `asetting`
- 違規項目與經費科目都不可存成空清單
- 設定變更寫 `audit_logs`:逐鍵記改前改後值(清單型只記增減,值太長會截斷),值沒變的鍵不留紀錄

## 未完成 / 問題

- **`holidays` 表沒有匯入介面**:政府行事曆假日只能靠 script 或直接動 DB,未匯入年度的器材逾期判定會退化成只排除週六日
- 評鑑年度改了之後,該年度的 rubric 要另外 seed;沒有「複製上年 rubric」的介面
- 郵局存簿與評鑑上傳固定 50MB,**在此調不到**,與其他上限的可調性不一致
