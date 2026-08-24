# 活動列表(行政端)

`/admin/club-activities` · `admin` · 權限鍵 `aclubact` · `features/admin/AdminClubActivitiesPage.tsx`

## 用途

查閱單一社團的活動申請與結案內容。**唯讀** —— 簽核在 [review.md](review.md) 與 [close-review.md](close-review.md),這頁只負責「看得到社團看得到的東西」。

介面刻意與社團端 [club/activity-list.md](../club/activity-list.md) 相同:同一張表、同一個詳情彈窗(`features/activities/ActivityPreviewModal`)。行政端四頁(社團總覽、成員列表、本頁、管理項目)與行政分審核共用同一個「選擇社團」狀態(`AdminClubProvider`),跨頁同步。

## 資料來源

| 區塊 | 端點 |
|---|---|
| 學期下拉 | `GET /admin/activities/semesters?club_id=` |
| 主列表 | `GET /admin/activities?club_id=&semester=&status=&type=&sort=&page=`(伺服器端分頁,每頁筆數依視窗高) |
| 詳情 | `GET /admin/activities/{id}` |
| 文件下載 | `GET /admin/activities/{id}/apply-pdf` |
| 社團選項 | `GET /admin/clubs/options` |

兩支清單端點回的是**同一份 schema**(`ActivityOut` / `ActivityDetailOut`),行政端只多帶 `club_name` 與 `reviewed_at`;前端因此直接沿用社團端的 `toActivity` / `toDetail` 對照,不另寫一份。

## 畫面

頁首:標題 + 件數 + 學期下拉 + 選擇社團。

表格:狀態、名稱、類型(附大型徽章)、日期、經費。**欄序、欄寬、日期不折行、經費欄的 `components/ui/MoneyPair`(自籌 / 核定,兩個數字各自靠右佔固定寬盒子)全部跟社團端同一份** —— 兩頁刻意長一樣,改一頁沒改另一頁就是同一張表在兩處長不一樣。類型與狀態欄可多選篩選,名稱/類型/日期/狀態可多鍵排序(**經費欄不接排序**:白名單的 `budget` 是自籌+擬請合計,與欄上顯示的自籌 / 核定不是同一件事),預設 `-date`。**沒有動作欄**。每頁筆數依視窗高(`lib/fitRows`),分頁列貼著卡片底邊。

詳情彈窗:與社團端同一支元件,內容完全相同(基本資料、工作分配、經費三欄、退回原因、活動照片、結案成果全文與學習心得、右上角下載選單)。**底部沒有按鈕** —— 不傳 `onEdit` / `onGoClose`,「繼續編輯」與「前往結案」自然收掉。

## 規則

- **看不到草稿**:草稿不進行政視野 —— 清單、詳情與 PDF 三支都擋(`_require_visible`),所以社團端那張「草稿卡」在這頁不存在。社團還沒送出的東西,承辦看不到
- **類型漏斗是三個標籤,不是社團端的兩個**:社團端篩的是 `Activity.type`(「活動」含大型),行政端的「活動」是 EVENT 且非大型、「大型活動」另成一項(`_large_condition`)。照抄兩個選項的話,選「活動」會讓該社的大型活動整批消失,而列上還畫著大型徽章
- 學期下拉 = 該社**有活動**的學期 ∪ 當前學期(`lib/semester.semesterOptions`);查詢失敗時只是歷史學期全不見、畫面看不出異常,故下拉旁顯示 `OptionsError`
- 換社團同時重設頁碼與學期(回到當前學期)—— 上一社選的學期在新社可能一筆都沒有,留著就是沒有任何說明的空白
- `clubId` 為 `null` 有兩種原因:還沒選,或社團選項載不到。後者不能叫人「請先選擇社團」,那是做不到的指示
- 狀態、排序的判定與社團端**同一份**:顯示狀態(含推導的 `locked`)走 `activity_service.display_status_filter`,經費與狀態排序走 `BUDGET_TOTAL_SQL` / `STATUS_ORDER_SQL`。同一個欄名在兩頁點下去要排出同一個順序
- **申請表 PDF 走行政端那支**:社團端的 `/club/activities/{id}/apply-pdf` 由 session 認社團,承辦讀別社會 404。彈窗以 `pdfBase="admin"` 切換
- 排序鍵 `budget` 走相關子查詢(與社團端同一份)。本頁一律帶 `club_id`,過濾集是單一社團單一學期,成本可接受;`/admin/activities` 不帶社團時排這個鍵會對整個過濾集逐列求值,那頁因此不開這顆鈕
- 附件與結案照片的下載權限由 `permissions.FILE_SUBJECT_KEYS["activity"]` 涵蓋 `aclubact`(看得到那一頁 = 下載得了那一頁的檔案,decisions.md D-02)
