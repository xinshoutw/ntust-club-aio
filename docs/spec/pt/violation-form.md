# 違規勸導填寫

`/pt/violations/new`(行政端 `/admin/pt/violations/new`,鍵 `astaff`) · `staff` · `features/pt/PtViolationFormPage.tsx`

> `/pt` 的 index 直接轉導到本頁,工讀生登入後第一眼就是這裡。

## 用途

工讀生巡場後開立違規勸導。

## 資料來源

| 動作 | 端點 |
|---|---|
| 社團選單 | `GET /staff/clubs`(不分頁;含停用社團與 `attribute`,前端只列啟用中) |
| 違規項目目錄 | `GET /staff/violation-items`(`system_settings.violation_items`) |
| 上傳上限 | `GET /staff/config`(`upload_limits.img_mb` / `video_mb`;工讀生打不進 `/club/config`) |
| 送出 | `POST /staff/violations` |
| 上傳附件 | `POST /staff/violations/{id}/attachments`(multipart 單檔,逐檔呼叫) |

## 畫面

表單:社團(**二級選單** `components/ui/ClubCascader`:性質資料夾 → 社團,可搜尋,只列啟用中社團 —— 全站選擇器同一條規則,見 `design-guide.md` §6;選項由本頁自 `/staff/clubs` 取,元件不自己抓 —— 工讀生打不進 `/admin/*`)、發生日期、地點、違規項目(複選,來自目錄)、其他說明(選填,≤500 字)、現場照片 / 影片(`AttachmentArea`,**選填**,至多 5 檔;上限組態首載失敗時那一格換成說明,主體照填)。

## 規則

- 填寫人 = 登入的工讀生,由後端取 session,不可指定
- 發生日期不可晚於今天(前後端各一道)
- 違規項目必須是目錄的子集,後端逐項比對
- 開立後推 Discord 給該社,訊息含銷案期限
- 銷案期限 = 開立日 + 1 個月;**銷案動作屬行政端**,工讀生不能銷案
- **附件走與空間報修同一套兩段式**:先 `POST` 主體,再逐檔上傳。單檔上界依型別(圖 / 影片,`upload_limits`),副檔名決定套哪一支政策、皆經魔術位元組驗證;影片只收 mp4 / mov(前端 `lib/uploads.EVIDENCE_ACCEPT` 與驗證同後端 `files.VIDEO` 一組,webm/avi 選檔時就擋 —— 主體已建立後才 415 退不回去);每張單至多 5 檔(`staff.MAX_VIOLATION_ATTACHMENTS`),**不設加總上限**(報修那支有 `maintenance_total_mb`,這裡單檔上界 × 5 就是天花板)。上限由 `/staff/config` 供給、不放前端 fallback 常數;組態沒載到只收不了附件,不擋主體
- 附件那一步失敗時**勸導單已經開立**:訊息明說「請勿重送」(再送一張等於重複勸導,每張都扣行政分),補傳入口在「違規紀錄查詢」;表單裡的附件不清,主體欄位同樣保留
- 附件掛在該社名下(`files.club_id`=被勸導的社團,`subject_type=violation`、`slot=evidence`,磁碟前綴 `violations/`):社團在自己的違規紀錄頁看得到、下載得到;也算進該社的儲存額度(額度用盡時工讀生會收到社團額度的 507 文案,目前判為可接受)。只收未銷案的單,不限填寫人(同處室工讀生都可補)。下載鍵 `FILE_SUBJECT_KEYS["violation"]` = `aviol` + `astaff`:鏡射到行政端補傳得了就要開得了

## 未完成 / 問題

- 送出成功後只清空表單,沒有「剛才開立了哪一筆」的回饋或連結
