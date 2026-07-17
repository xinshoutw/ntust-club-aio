# 全庫對抗式審查報告(2026-07-17,第十二輪:全庫審計)

> 對 `dev` 工作樹現況(第十一輪修復後、13 commit 未推)做的**全庫**對抗式審查——不同於歷輪的 changeset 審查,本輪涵蓋整個 repo。
> **審查全程唯讀**:未修改任何程式碼、未跑測試、未動 DB;所有發現與抉擇僅寫入本報告。

## 審查配置(Fable:Opus:Codex = 1:2:1)

| 審查者 | 範圍 |
|--------|------|
| opus ×1 | 後端全面(一致性/DRY/過度設計/測試缺口/註解) |
| opus ×1 | 前端全面(慣例違反/寫死常數/mock 盤點/測試缺口) |
| fable ×1 | 前後端契約逐檔比對、缺失功能盤點、三層 AGENTS.md 與 docs/ 健檢、目錄清掃 |
| codex(gpt-5.6-sol xhigh)×1 | 高風險深潛:借用場況/上傳配額/結案流程/評分同步/auth |

主審(fable)另對所有 HIGH 與關鍵 MEDIUM findings 做了獨立唯讀核實;標「✅核實」者為主審逐行驗證屬實,未標者為審查者引述原文、可信度高但未二次驗證。

**文件 vs 程式碼分歧的判定原則(需求方 2026-07-17 拍板)**:預設程式碼為準、修文件對齊程式碼;僅當實作本身有缺失或不合理,才判「文件正確、程式碼要修」。第九節每筆分歧均標判定方向。

## 處理狀態(2026-07-17 同日修復 session)

P1 與快贏項已全數處理(15 個修復 commit;Opus 對抗審查覆核**無 HIGH/MEDIUM 阻斷缺陷**,其 F1 BOM 匯入缺口亦已修):

- 1-1 ✅ `b5d4531`、1-3 ✅ `7f310c4`(+匯入端 BOM 剝除 `390482a`)、1-4 ✅ `3bbb3b1`、1-6/1-7 ✅ `152aefd`、1-8 ✅ `3d6c4a4`、1-9 ✅ `4482920`、1-11 ✅ `da6c775`、1-12 ✅ `d707393`、1-14 ✅ `e5c6780`、2-1 ✅ `d68e08f`
- 1-2 ✅ `3b23676`+`411ad8b`:需求方拍板方案 (a)——狀態機 審核中→處理中→**請洽學務處**(單步前進、無退回),權限鍵 `aapply`,migration `9d4b7e2c5a18`(可逆)
- 1-5 **部分修復** `9e0567e`:建立端已加資源鎖(競態擋掉);**核准端硬性檢核未做**——既有測試明文「可借數不足仍可核准(管理員裁量)」是刻意設計,改語意需需求方拍板
- 未動(需求方指示):2-2 aclose、1-10 場況 rank
- 其餘 P2/P3(lib 測試補強、死碼清除、單源化、文件對齊)留待後續輪次

**嚴重度統計**:HIGH 4、MEDIUM 21、LOW 約 40。無 CRITICAL。四路對五大高風險區(學期快照、上傳結算、結案鎖序、評分規則、密碼/CSRF)的核心邏輯一致給出「健全」結論(見第十一節),findings 集中在**並發縫隙、接線後殘留、單一真相來源分裂、文件過期**四類。

---

## 一、正確性缺陷

### HIGH

#### 1-1. 行政端社團總覽的固定借用審核彈窗以 mock 靜態資料判定衝突 ✅核實〔fable 裁決;opus-FE 與 fable 各見一半〕
- `frontend/src/features/admin/BookingReviewModal.tsx:6-7,21-29,56-59`:`isRoomConflict` 對照 **`bookings/mock.ts` 的靜態 `ROOM_REQUESTS`** 判衝突;而 `ClubOverviewPage.tsx:246` 傳入的是**真實 API 資料**(`kind:'room'`)。
- 影響:(a) 真實的兩社搶同時段**永遠不會被標示衝突**;(b) mock 假資料與正式場地主檔同源(同 19 處場地名),可能對真實申請**誤報衝突**。專屬審核頁 `AdminRoomsPage.tsx:151-167` 有自己以真實 pending 清單計算的正確衝突邏輯——同一行為兩套實作、其中一套壞掉。後端核准不做硬性衝突檢查(整單擇一是人工判斷),此警示是承重的。
- 建議:`BookingReviewModal` 的 room 衝突判定改吃呼叫端傳入(由 `AdminRoomsPage` 的 `conflictKeys` 邏輯抽共用),或 ClubOverviewPage 的 room 列直接複用 AdminRoomsPage 審核彈窗。
- 附帶:同檔 `:196` 器材可借數 fallback `availableInWindow`(mock 推導)在 API 未帶 `availableExcludingSelf` 時啟用;現行 API 皆有帶(`adminClubOverview.ts:148`),屬休眠地雷,清 mock 時一併移除。

#### 1-2. 幹部證明、郵局帳戶異動:有三態 status、無任何審核端點,社團端永遠顯示「審核中」 ✅核實〔fable HIGH + opus-BE 交叉印證〕
- `backend/app/models/misc.py:19-21,36-38` 有 `status`(pending/approved/rejected)、`enums.py` 有預留的 `ApprovalSubject.OFFICER_CERT/POSTAL_CHANGE`,但 `applications.py` 之外**全後端零引用**——沒有任何 admin/staff 端點能改變狀態;行政端 UI 也無此二頁(`api/adminClubOverview.ts:191` 自承「幹部證明尚無 admin 端點,暫不列」)。
- 影響:社團送件後狀態永遠 pending,實質流程斷頭。與行政端「待審申請彙整」缺頁同根(見第七節),但**不在任何已知待辦清單上**,故列 HIGH 提示排程。
- 建議:排入「待審申請彙整」工作包;或短期先做兩個最小審核端點;若確定近期不做,至少在社團端隱藏誤導性的狀態欄。

#### 1-3. 成員 CSV 匯出繞過 `lib/csv` 跳脫,欄位含逗號/引號/換行會錯位 ✅核實〔opus-FE〕
- `frontend/src/features/members/MembersPage.tsx:112-113`、`features/admin/AdminMembersPage.tsx:49-50`:手刻 `.map(neutralizeFormula).join(',')`,只做公式注入中和、**沒做 `lib/csv.ts:6-9 escapeField` 的結構跳脫**;`lib/csv.ts:15` 現成的 `downloadCsv` 未被使用(`SignupManagePage` 有正確使用,兩個成員頁是離群)。
- 影響:姓名/職稱含逗號、雙引號或換行 → 匯出 CSV 欄位錯位/損毀。
- 建議:兩頁改呼叫 `downloadCsv(filename, rows)`(一行改動,同時消掉重複與 `a.click()` 例外漏 revoke 的小缺口)。

(第 4 個 HIGH 為文件類,見 9-9:data-model §3.aa 儲存配額整節與現實相反,會誤導部署。)

### MEDIUM(並發與驗證,均經主審核實)

#### 1-4. 臨時/固定借用核准不查既核准重疊,兩張衝突單可先後都核准成功 ✅核實〔codex〕
- `backend/app/api/v1/admin_bookings.py:150-181`(venue approve)、`admin_rooms.py:105+`(room approve):只鎖**該申請列**、翻狀態、commit;不檢查同場地/同時段是否已有他單 approved。唯一的 unique constraint 是單內去重(`models/bookings.py` `uq_room_booking_slots_request_weekday_period`)。
- 情境:A、B 兩社申請同場地同日同節次,管理員先核 A 再核 B,兩次都 200,雙重佔用成立(不需並發,順序操作即可)。
- 建議:核准交易內以資源為鍵序列化(advisory lock 或鎖衝突列)檢查 approved 重疊,衝突回 409。

#### 1-5. 器材借用超借:建立端檢核無資源鎖、核准端完全不重驗 ✅核實〔codex〕
- `backend/app/api/v1/bookings.py:391-398`:`equipment_available_in_window` 檢核與 insert 之間無鎖(兩個並發申請都算到 available=5、都 201);`admin_bookings.py:291-309` `approve_equipment_loan` **伺服器端不重算可借數**,只有前端紅字警示(advisory)。
- 情境:總數 5 的器材,兩單各借 5 並發送出都成功;管理員逐一核准也不會被擋 → 核准量 10 > 總數 5。
- 建議:建立時鎖 `Equipment` 列(或 advisory lock by equipment_id)再算可借數;核准端點在同交易內重驗(排除本單),不足回 409。

#### 1-6. 活動申請的編輯/上傳/刪除/送出:先驗狀態再取鎖、取鎖後不刷新——送審後仍可改內容 ✅核實〔codex〕
- `backend/app/api/v1/activities.py:335-341`(upload_attachment):`get_own_activity` → 檢 `_EDITABLE` → **才**取列鎖,且鎖後不 refresh status(註解自承鎖只為加總上限雙寫);update/delete/submit 之間也無一致列鎖。
- 情境:裝置 A 讀到 draft 停在半途,裝置 B 送出(→pending_advisor)後,A 取鎖成功、照舊附加附件/改內容——已送審的申請被變造,審核者看到的與送出時不同。
- 建議:比照結案照片端點的既定鎖序(`db.refresh(attribute_names=["status"], with_for_update=True)` 先鎖後驗),套到活動的全部可編輯狀態變更端點。

#### 1-7. 結案草稿儲存不參與結案鎖序,可把過期草稿寫回已送結案的活動 ✅核實(同 1-6 模式)〔codex〕
- `backend/app/api/v1/activities.py:257-262`:`save_close_draft` 讀 status==APPROVED 後直接寫 `close_draft`,無鎖;`submit_close` 會清 draft,但草稿儲存可在其 commit 後仍寫入。
- 情境:A 存草稿讀到 approved → B 送出結案(清 draft、轉 closing)→ A commit 過期草稿 → 若結案被退回,過期草稿復活並在重送時覆蓋已填資料。
- 建議:`save_close_draft` 套同一鎖序(鎖列+refresh status 再驗 approved)。

#### 1-8. 跨日活動無法結案:實際時間驗證無條件比大小 ✅核實〔codex〕
- 申請端 `schemas/activities.py:49-58` 只在 `end_date == date`(未跨日)時比較時間;結案端 `:130-132` `CloseIn._check` 卻無條件 `actual_end <= actual_start` 就擋(純 HH:mm),前端 `ActivityClosePage.tsx:392` 同樣寫死。
- 情境:7/20 18:00 ~ 7/21 10:00 的過夜活動,實際時間照實填 18:00/10:00 → 前後端都拒絕,**合法活動永遠無法結案**。
- 建議:與申請端同構——僅單日活動做 time-only 比較;跨日改組合日期時間比較(CloseIn 缺日期,需端點層帶入 activity.date/end_date 檢核)。

#### 1-9. 郵局存簿上傳:前端收 PDF+50MB、後端只收影像+10MB ✅核實〔codex〕
- `frontend/src/features/applications/PostalPage.tsx:125+` `accept={.pdf,...}` 且 `isPdfFile || isImageFile`、`maxTotalBytes=50MB`;後端 `applications.py:170-173` 卻 `policy=file_service.IMAGE`(僅影像、單檔 10MB)。
- 情境:使用者選合法 PDF(或 20MB 影像)→ 申請本體已先建立,上傳回 415/413 → 留下缺附件的 pending 申請。
- 建議:後端定義 postal 專屬 policy(PDF+影像)並把有效上限入 `/club/config`;或前端收斂到後端真實契約。另建議提供附件補傳路徑(申請不因上傳失敗而卡死)。

#### 1-10. 場況圖「已核准蓋過審核中」:pending 格被他社 approved 蓋掉,admin 端從格子點不到該筆審核〔codex;定性:需需求方裁決〕
- `backend/app/services/booking_service.py:201,265`:rank `{"pending":0, "temp":1, "fixed":1, "mine":2}`,註解明寫「已核准蓋過審核中」——是**刻意實作**。但跨社衝突本來就允許存在(整單擇一),被蓋掉的 pending 在格子上消失(admin 版亦然,`booking_id=None` 不可點);HANDOFF「審核中一律 pending」的措辭與此有解讀空間。
- 判定:兩邊都說得通(顯示「事實佔用」vs 顯示「待辦」),依拍板原則列**需需求方裁決**;若維持現狀,至少 admin 版佇列列表仍可審(功能不失),建議文件明載此優先序。

#### 1-11. 總覽頁只抓單頁 100 筆,活動超過 100 筆時待辦清單靜默漏列〔fable〕
- `frontend/src/api/overview.ts:56-57`:唯一沒用 `fetchAll` 補頁迴圈的呼叫點(page_size=100 單發)。單一社團活動 >100 筆才觸發,機率低但為靜默資料缺失。建議改 `fetchAllPages`。

#### 1-12. 結案草稿 hydrate 對非陣列 `reflections` 無防護,可整頁白畫面〔codex〕
- 後端 `CloseDraftIn.data: dict[str, Any]` 全開放;前端 `ActivityClosePage.tsx:223` `(d?.reflections ?? []).map(...)`——若 draft 被直接 API 寫成 `{"reflections": "..."}`,`??` 不會攔、`.map` 直接 TypeError(HANDOFF 已記載 seed 曾因鍵名踩過同性質的白畫面)。建議 hydrate 加 `Array.isArray` 正規化,或給 draft 一個版本化 schema。

#### 1-13. 滑動續期 cookie 在「直接回傳 Response」的端點遺失,且續期條件被消耗 ✅核實〔codex,LOW-MEDIUM〕
- `core/deps.py:82-87` 續期採條件觸發(距滿 TTL 差逾 RENEW_INTERVAL 才續)且只在該分支重送 cookie;FastAPI 對直接回傳 `Response` 的端點(FileResponse 下載、PDF、`/auth/precheck`)**不合併**依賴注入 response 的標頭,nginx `auth_request` 也天然丟棄 precheck 回應標頭。
- 情境:續期恰好被檔案下載/上傳 precheck 觸發 → DB 續了、瀏覽器 cookie 沒續;後續 JSON 請求因「已續過」跳過分支、不再重送。SPA 每次載入都打 `/auth/me`,實務上下一個 RENEW_INTERVAL 後會補救,故降 LOW-MEDIUM;但 `deps.py:84-86` 註解宣稱的保證(「不重送=形同虛設」)在這些端點確實不成立。
- 建議:改在 middleware 統一貼續期 cookie,或 precheck 不做 DB 續期。

#### 1-14. MaintenancePage 對組態載入失敗回退寫死上限,與其他上傳頁行為不一致〔codex〕
- `frontend/src/features/applications/MaintenancePage.tsx:31,81+`:`config?.maintenanceBytes ?? 100 * MB` 等 fallback——`ActivityFormPage`/`ActivityClosePage` 皆以組態載入為前置(spin/error),唯此頁在 config 失敗時仍可操作並用舊常數驗證,與第十輪「前端常數全移除」的收斂不完整。建議比照 gate 處理。

---

## 二、行為一致性

#### 2-1.〔MEDIUM〕行政分調整通知只推全域 webhook,未推社團自設 webhook ✅核實〔opus-BE〕
- `admin_eval.py:150,180,228`(override/revert/merit)用 `notify.discord`(僅全域);**其他所有**行政決策事件(活動/借用/維修/違規/報名/停權)都走 `notify.club_event`(全域+社團自設)。訊息 desc 皆含社團名,語意顯然是要通知該社。
- 建議:改 `notify.club_event`;或文件明載「行政分調整刻意不推社團」。

#### 2-2.〔MEDIUM〕權限鍵 `aclose`(結案審核頁)不能核准結案,需另持 `approve_advisor` ✅核實〔opus-BE〕
- `admin_activities.py:340,377`:close_approve/close_reject 要求 `approve_advisor` 關卡鍵;列表/詳情/解鎖用頁面鍵 `aclose`。只授 `aclose` 的管理員看得到佇列、按下核准卻 403。
- 判定:可能是「頁面鍵 vs 關卡鍵」的刻意雙軌;若是,屬易誤配陷阱,需在帳號權限 UI 與文件說明;若不是,`aclose` 應涵蓋結案單關。**需需求方確認**。

#### 2-3.〔LOW〕上傳端點樣板分歧:郵局存簿、評鑑上傳無「加總上限+鎖列」〔opus-BE〕
- `applications.py:162-182`、`eval.py:158-200` 皆無加總上限、無張數上限、無鎖列;與活動/報修/結案的既定樣板(`total_uploaded()`+鎖列+結算回滾)分歧。與已接受的磁碟 DoS 風險重疊,但樣板分歧本身是維護性問題——調整政策時容易漏掉這兩條路徑。建議收斂或註明刻意豁免。

#### 2-4.〔LOW〕社團端稽核邊界不一致〔opus-BE〕
- `club_profile.py:36-43` 改管理項目有 `audit.record`;成員名單 create/update/delete/import(**ad5 評分依據**)與活動草稿 CRUD 無稽核。同為社團自管資料,標準不一。建議統一(名單變動比管理項目更值得記)。

#### 2-5.〔LOW〕`files.py:289` 409 直接 new `AppError`,未走 `conflict()` 工廠〔opus-BE〕——慣例小破口。

#### 2-6.〔LOW〕節次/星期常數與場況配色散在 mock 檔與 api 檔兩份 ✅核實〔opus-FE + fable〕
- `PERIODS`/`DOW_TEXT` 同時定義於 `features/bookings/mock.ts:5,90` 與 `api/bookings.ts:9,10`(另 `api/adminBookings.ts:194` 有 `PERIOD_ORDER` 第三份);已接線的 `AdminBookingsPage`/`AdminRoomsPage`/`ClubOverviewPage`/`PeriodPicker` 讀 **mock** 版,其他頁讀 api 版。`CELL`/`CellState`(場況配色)只存在 mock 檔。
- 影響:節次調整時兩份會靜默分歧;mock 檔一旦清除這些頁面直接 break。建議收斂到 `lib/periods.ts`(或 `api/bookings.ts`)單源,`CELL` 移共用 UI 位置。

#### 2-7.〔LOW〕共用元件 `AnnouncementModal` 型別綁在 `features/activities/mock`〔opus-FE〕
- `components/ui/AnnouncementModal.tsx:3` import mock 的 `Announcement`;實際同名不同形介面共三份(mock/api/admin),靠結構相容沒炸。這是 297 行死檔無法刪除的唯一原因。建議改用最小 props 介面。

#### 2-8. 前端慣例大掃描:全數通過〔opus-FE〕
confirmDialog 唯一入口、Modal open+afterClose、Pager、SortButton/FilterButton、click-tint、無 emoji、不顯示單號、頁面無自設 maxWidth、上傳統一管線、api 檔遵循 members.ts 範本——**零違反**(明細見第十一節)。

---

## 三、重複程式碼(DRY)

| # | 嚴重度 | 位置 | 內容 | 建議 |
|---|--------|------|------|------|
| 3-1 | MEDIUM | 8 個 router(`activities/bookings/applications/admin_activities/admin_bookings/admin_rooms/admin_maintenance/admin_violations`) | `_notify_submit`/`_notify_club`/`_notify_decision` 各自重寫(取 club → background.add_task) | 抽到 `services/notify.py` 共用 helper〔opus-BE〕 |
| 3-2 | LOW-MED | 16 個列表端點 | `count().select_from(query.subquery())` + offset/limit 分頁樣板 | `api/pagination.py` 加 `paginate(db, query, page)`〔opus-BE〕 |
| 3-3 | MEDIUM | 見 1-3 | 成員 CSV 匯出手刻兩份且繞過跳脫 | 改用 `downloadCsv` |
| 3-4 | LOW | `activities.py:154-180` vs `admin_activities.py:163-206` | 活動詳情組裝(budget/report/photos/attachments/approvals)近乎相同 | 抽共用組裝函式〔opus-BE〕 |
| 3-5 | LOW | `scripts/reset_db.py:30-38` vs `core/security.py:59` | `generate_password` 兩套實作、行為不一致(14 碼 vs 12 碼排除易混淆) ✅核實 | scripts 改用 core 版〔opus-BE〕 |
| 3-6 | LOW | 見 2-6 | PERIODS/DOW_TEXT 三份 | 單源化 |
| 3-7 | LOW | `ActivityClosePage.tsx:42` vs `eval/scoring.ts:39` | `MIN_PHOTOS = 5` 兩處定義(結案警告 vs 評鑑計分,同一規則) ✅核實 | 單一常數供兩端引用〔opus-FE〕 |
| 3-8 | LOW | `AdminRoomsPage.tsx:151-167` vs `BookingReviewModal.tsx:21-29` | 固定借用衝突判定兩套(且後者壞,見 1-1) | 抽共用 |
| 3-9 | LOW | `api/applications.ts:12-17` vs `api/activities.ts` | `FileOut` 前端介面重複宣告(applications 版缺 sha256) | 抽共用型別〔fable〕 |

---

## 四、過度設計與死碼

### 前端(接線後的 mock 殘骸,✅逐檔以 import 與符號雙向核實)〔opus-FE + fable〕

| # | 嚴重度 | 位置 | 內容 |
|---|--------|------|------|
| 4-1 | MEDIUM | `features/{applications,club-settings,members,signup,violations}/mock.ts` | **5 檔零 importer,可整檔刪除**(約 188 行) |
| 4-2 | MEDIUM | `features/activities/mock.ts`(297 行) | 僅 `Announcement` interface 被 `AnnouncementModal` 用;搬走型別即可整檔刪除 |
| 4-3 | LOW-MED | `features/bookings/mock.ts`(212 行) | 活的只有 PERIODS/DOW_TEXT/CELL/roomEntryText 常數 + `ROOM_REQUESTS`/`availableInWindow`(僅供 1-1 的壞邏輯用);`VENUES`/`FIXED_BOOKING_WINDOW`/`cellInfo`/`FIXED_WEEKLY` 等全死。建議常數抽 `constants.ts` 後清檔——順帶消掉「mock 檔名裝正式常數」的誤導 |
| 4-4 | LOW | `features/eval/files.ts` | `svgPhoto`/`generatedPdf`/`toEvalFile`/`releaseFile` 死 export;`mockPdf` 唯一消費者是死檔 4-2 |
| 4-5 | LOW | `features/admin/clubsMock.ts`、`reviewMock.ts` | 前者只剩 `CLUB_ATTRIBUTES` 常數活、後者只剩 `ReviewItem` 型別活;建議改名瘦身 |
| 4-6 | LOW | `frontend/src/assets/vite.svg` | Vite 模板殘留,零引用,可刪〔fable〕 |
| 4-7 | LOW | `frontend/public/icons.svg` | 全 repo 零引用;刪前向需求方確認非外部文件引用〔fable〕 |

### 後端〔opus-BE〕

| # | 嚴重度 | 位置 | 內容 |
|---|--------|------|------|
| 4-8 | LOW | `schemas/applications.py:68` | `mask_account()` 死碼(2026-07-15 拍板顯示完整帳號後無人呼叫),可刪 |
| 4-9 | LOW | `models/enums.py` | `ApprovalSubject.OFFICER_CERT/POSTAL_CHANGE/MAINTENANCE/SIGNUP`、`ApprovalDecision.REVOKE` 未被引用——為未實作的審核流程預留(與 1-2 同根);實作時自然啟用,若砍功能則一併刪 |
| 4-10 | NOTE | `LegacyIdMap`/`LegacySystem` | 供未來 `migration/` 用,非死碼,提醒目前未接 |

---

## 五、前端寫死、應由後端提供的常數

上傳上限/經費科目/場地主檔/器材主檔/固定借用開放窗已正確走 `/club/config` 與各 API——第十輪收斂大致完成。殘餘:

| # | 嚴重度 | 位置 | 內容 | 建議 |
|---|--------|------|------|------|
| 5-1 | MEDIUM | `lib/semester.ts:1-16` | 學期推導規則(≥8 月=上學期…含 1 月特例)寫死,`:14` 註解自承「之後移入 system_settings」未做;與後端 `core/semesters` 各算一次;4 頁使用 | 由後端(`/club/config` 或 `/semesters`)供給;至少先補測試釘死(見 6-1)〔opus-FE〕 |
| 5-2 | MEDIUM | 見 3-7 | `MIN_PHOTOS=5` 兩處 | 單源 |
| 5-3 | LOW-MED | `FixedRoomPage.tsx:17,18,37-41` | 每社 10 節、晚間連續 ≥3 節規則寫死;後端強制但 `AdminSettingsPage` 未暴露 | 若視為可調 → 進 system_settings+config;若恆定 → 註明與後端同源〔opus-FE〕 |
| 5-4 | LOW | `ActivityClosePage.tsx:41` | `MIN_REFLECTIONS=3`(後端強制) | 同 5-2 精神 |
| 5-5 | LOW | `ChangePasswordPage.tsx:73` | 密碼政策文案寫死「10 碼/三代」數值 | 後端政策調整會不同步,列記 |
| 5-6 | LOW | `AdminSettingsPage.tsx:199` | `evalYears` 選項寫死 116/117 | 可由後端建議範圍 |
| 5-7 | LOW | `AdminViolationsPage.tsx:145` | Tooltip 寫死「1 個月」銷案期限(期限值本身來自後端) | 文案跟 config 走 |
| 5-8 | LOW | 見 1-14 | MaintenancePage 的 fallback 常數 | 比照他頁 gate |

---

## 六、測試與 mock 覆蓋缺口

### 前端(vitest 現況 35 tests)〔opus-FE〕

| # | 嚴重度 | 缺口 |
|---|--------|------|
| 6-1 | MEDIUM | **`lib/permissions.ts`(`canAccessAdminPath`)零測試**——授權判斷函式,`AdminPermissionGate` 與 nav 過濾都靠它;新落地程式碼,風險最高 |
| 6-2 | MEDIUM | `lib/semester.ts` 零測試——AGENTS 明載「原型推導寫反」的高危規則+1 月特例分支 |
| 6-3 | MEDIUM | `lib/csv.ts` 零測試(公式中和+結構跳脫,安全相關;1-3 正是沒走它而漏跳脫)、`lib/uploads.ts` 零測試(魔術位元組驗證,安全相關) |
| 6-4 | LOW | `lib/roles.ts`(稱謂推導+CSV 雙向相容,分支多)、`lib/form.ts`、`lib/status.ts`、`activities/utils.ts canClose` 零測試 |
| 6-5 | LOW | mock 狀態缺口:`EQUIPMENT_LOANS` 無 `rejected` 樣本,`availableInWindow` 的 rejected 排除分支永不觸發(隨 4-3 清除即消) |

### 後端(pytest 現況 202 tests)〔opus-BE〕

| # | 嚴重度 | 缺口 |
|---|--------|------|
| 6-6 | MEDIUM | **排序白名單拒絕路徑全站零測試**:`api/pagination.py:49-50` `INVALID_SORT` 422 無任何測試打非法 `sort`,橫跨十餘個端點無守門 |
| 6-7 | LOW | `POST /club/postal-changes/{id}/passbook` 是唯一無端點級測試的上傳路徑(404/415/413 皆未測;1-9 的 PDF 415 bug 正好漏在這) |
| 6-8 | — | 新增:1-4~1-9 修復時應各補回歸測試(衝突核准 409、超借 409、送審後上傳 409、跨日結案 200、postal PDF 201) |

已確認**有**覆蓋(抽樣):CSRF 403(23 檔)、固定借用 10 節/連續節 409、availability-range 422、結案零照片 422、closing 刪照 409、鎖定/密碼政策/重用。

---

## 七、未實作/部分實作功能盤點〔fable,對照 AGENTS.md 功能模組+Roadmap〕

狀態:✅ 已完成接線/🟨 前端 mock/❌ 未做。

### 社團端:15 項全數 ✅,但三處「送得出、走不完」
- 郵局帳戶異動/幹部證明:✅送件,**無人能審**(1-2);幹部證明的證明文件 PDF 產出未做(data-model §5 規劃「即時產生」)
- 器材借用:✅申請核准,**點交/歸還斷頭**(見下)
- 評鑑結果頁 🟨(已知,待規格);線上報名的競賽報名(`is_eval`+勾獎項)**全鏈路斷頭**:管理端 UI 建不出 `is_eval` 活動、社團端寫死 `awards: []`,經 API 直建則社團送報名必 422;`signup_awards` 表死路徑〔MEDIUM,排入評審模組工作包或先在 SignupBuilder 明文擋〕

### 評審端(viewer):❌ 三頁全未做
- 登入即 `/coming-soon`;`review_scores`/`review_score_items`/`eval_groups*` 五張表只有 models,無 API 無前端。

### 工讀生端(staff):❌ 五頁全未做,且後端面缺口大於預期
- **違規勸導「開立」無任何端點**(POST /violations 不存在,現只能 seed 灌)→ 真實資料流下違規管理頁永遠無新資料
- **器材借出/歸還點交無任何端點**(全後端無寫入 `checked_out/returned` 的 API)→ 逾期推導、逾期追蹤頁、停權管理在真實資料流下**不可能被觸發**——admin 端做好的頁面實質休眠

### 行政端:18 項中 13 ✅;❌ 5 項
分組與評審指派、競賽資料完成度(全校彙總)、社團活動統計、待審申請彙整(含 1-2)、競賽成績總表(依賴評審評分)。另:場地主檔後台 CRUD ❌(僅 seed 19 處)、器材**手動借用** ❌(super 專屬清單項)。

### 橫向:Email MJML 模板 ❌、首頁導覽頁 ❌、`migration/` 資料遷移 ❌(目錄不存在)、備份 scripts ❌、E2E 自動化 ❌(TASK6 §8 的 HTTP E2E 未落地)

**需求方一眼版**:剩餘工作 = ①評審/競賽模組(評審端三頁+分組指派+成績總表+競賽報名接通+完成度頁) ②工讀生端五頁+點交/違規開立後端 ③幹部證明&郵局審核(+待審彙整頁) ④社團活動統計 ⑤場地主檔後台/手動借用 ⑥評鑑結果頁 ⑦首頁導覽 ⑧Email 模板 ⑨migration/備份/E2E。

---

## 八、AGENTS.md 三層健檢〔fable〕

OSA 根層與 project/ 層:相符,無需變更。club-aio 層(247 行)問題與重組提案:

| # | 嚴重度 | 位置 | 問題 | 判定 |
|---|--------|------|------|------|
| 8-1 | HIGH | 「後端現況(2026-07-14)」節 | 「**前端尚未接線**…管理端其餘頁面 API 未做」與第九輪後全面接線自相矛盾,誤導性強 | 文件過期 → 整節刪除,現況交接歸 HANDOFF.md |
| 8-2 | MEDIUM | 「前端現況(2026-07-13)」節 | 「資料皆 mock、動作以 toast」全面過期 | 文件過期 → 刪除 |
| 8-3 | MEDIUM | 第五輪標題 | 指向 data-model「後端待同步」標記——現已 0 個 | 文件過期 → 刪 pointer |
| 8-4 | LOW | 第五輪內文 | 場地主檔「seed 待同步」已同步;開放窗月份制已被第八輪日期區間取代 | 文件過期 |
| 8-5 | LOW | 技術決策「上傳」行 | 只寫單檔上限,缺第十輪「依申請性質加總上限」 | 文件過期 → 補一句 |
| 8-6 | LOW | 功能模組行政端 | 「報名管理(含**報名窗設定**)」已廢除(第八輪) | 文件過期 → 修字 |
| 8-7 | LOW | 需求來源節 | 建議補需求優先序(評鑑 PDF>輪次決議>原型 v6) | 需需求方確認措辭 |

**重組提案**(預期 247→約 120 行):保留=需求來源/角色/功能模組(更新後)/UI 規範/核心業務規則/Commit 慣例/技術決策/Roadmap;新增「工程慣例」節集中耐久慣例(confirmDialog、Modal 常駐、禁單號、Pager/SortButton/AttachmentArea、Py3.14 lazy annotation、結案鎖序、unlink_quiet、上傳樣板、接線範本、DB 指令);第二~十輪決議流水帳(約 145 行)中已實作的一次性 UI 敘述刪除、仍具規範力的業務規則回填 data-model/design-guide,決議史如需留檔移 `docs/decisions.md`。

---

## 九、docs/ 健檢(每筆標判定方向)〔fable〕

### architecture.md
| # | 嚴重度 | 問題 | 判定 |
|---|--------|------|------|
| 9-1 | MEDIUM | §4「openapi-typescript 產前端型別」——實作是手寫鏡像 interface(第九輪慣例,運作良好) | 文件過期 → 改寫為實際接線慣例 |
| 9-2 | LOW | 抬頭「狀態:待確認」 | 文件過期 → 改「已定案」 |
| 9-3 | LOW | §5 `app/emails/` 不存在;領域模組清單與實際 router 檔名不符 | 文件過期 → 更新結構圖 |
| 9-4 | LOW | §3.4「密碼重設走 email」——實作為管理員一次性密碼(第七輪拍板) | 文件過期 → 更新;若仍要自助重設屬新需求 |
| 9-5 | LOW | §3.7「逾期提醒 APScheduler」——未實作,現為 super 手動 remind 端點 | 需需求方裁決是否要自動排程;文件先標「未實作,現為手動」 |
| 9-6 | LOW | §4.1 錯誤碼表缺 `RESOLVE_EXPIRED`/`WINDOW_CLOSED`/`SLOT_LIMIT`/`CLUB_SUSPENDED`/`CLUB_NAME_SUFFIX`/`INVALID_STATUS_TRANSITION` 等 | 文件過期 → 補表(程式碼為準) |
| 9-7 | LOW | §3.5「結案照片以 zip 繳交」已改逐張;缺加總上限 | 文件過期 → 更新 |
| 9-8 | INFO | §8 測試策略(RTL/Playwright/80%)vs 現況(後端 202、前端 35、無 E2E) | 計畫 vs 現況 → 標注差距 |

### data-model.md
| # | 嚴重度 | 問題 | 判定 |
|---|--------|------|------|
| 9-9 | **HIGH** | §3.aa `storage_limits={capacity/per_club/reserve}` 40/2/10 GiB、usage 回 capacity/remaining——**已被第十輪推翻**(現只剩 per_club_gib;usage 回 disk_total/disk_free)。會誤導部署與後續開發 | 文件過期 → 依 REVIEW_2026-07-17.md P3 語義改寫 |
| 9-10 | MEDIUM | §3.x 10 節規則「核准件屬前學期」已被「自動歸屬下一學期」快照取代;表定義缺 `start_date/end_date` | 文件過期 → 更新(REVIEW P1-4 有完整新語義) |
| 9-11 | MEDIUM | §3.2 `equipment.category` enum 已整欄移除(`33e4dcd04463`) | 文件過期 → 更新 |
| 9-12 | LOW | clubs 表缺 `contact_emails`/`announcements_read_at`;全文件無 `announcement_dismissals` 表 | 文件過期 → 回填主定義 |
| 9-13 | LOW | activities `date/end_date` nullable+CHECK(部分草稿)未載;`activity_reports` 缺三個 `*_confirmed` | 文件過期 → 回填 |
| 9-14 | LOW | 結案照片「限 JPG/PNG」已放寬為常見影像格式 | 文件過期 → 更新 |
| 9-15 | LOW | 三個殘留「待同步」標記(venues seed/遮罩回應/ad7 ad8 彙算)實際皆已同步 | 文件過期 → 刪標記 |
| 9-16 | LOW | §3.x/3.y/3.z/3.aa 補記式追加造成主定義過期(報名窗、signup_items 舊欄、announcements 舊制) | 文件過期 → **補記回填主定義後刪四節**(與 AGENTS 流水帳同一結構病) |

### design-guide.md
| # | 嚴重度 | 問題 | 判定 |
|---|--------|------|------|
| 9-17 | LOW | §4.1 「topbar 常駐學年度切換」已於二/七輪移除 | 文件過期 → 更新 |
| 9-18 | LOW | §3.3 mono 字用途含「單號」——已定案不顯示單號 | 文件過期 → 修字 |
| 9-19 | INFO | 定位仍是「給 Claude Design 的簡報」,實已是現行風格規範 | 建議改定位、刪 §9 一次性 mockup 指示 |

### 其他文件
| 檔案 | 判定 |
|------|------|
| HANDOFF.md | 保留;**一筆更正(MEDIUM)**:「admin 借用審核頁未接後端」不實——`AdminBookingsPage` 已接線(useAdminAvailability 等),殘留 mock 僅 `BookingReviewModal` 一處(即 1-1)✅核實 |
| REVIEW_2026-07-17.md | 已全數處理 → 移 `docs/reviews/` 歸檔(P1-4/P3 語義在 data-model 更新前是新規則唯一完整記載,勿刪) |
| TASK6_REVIEW_HANDOFF.md | 抽查確認 SEC-01/02/04、FUNC-01/02、A11Y-01/02/03 均已修;僅 §6 仍活 → §6 未辦項併入 HANDOFF 或 DEPLOY_CHECKLIST 後歸檔。另:§7「eval_uploads 無 DB constraint」已被 `a9c2e51d7f43` partial unique index 解決,該段已過期 |
| DEPLOY_CHECKLIST.md | 保留;D 與 G6 的「邏輯容量 40 GiB+reserve 10 GiB」過期(第十輪改實際磁碟) → 更新 |
| design-guide-review/ | 已消化;README 指示未來 agent「先讀 dc.html 再實作」有誤導風險 → 歸檔或刪除(git 可取回) |
| 原型 v6 html、評鑑 PDF、模板 docx | 需求源,保留 |

---

## 十、目錄與註解清掃

### 版控衛生:通過〔fable,git ls-files 319 檔逐一對照〕
`.env` 未入版控(僅 .env.example,無 secret);無 .DS_Store/.idea/__pycache__/快取入版控;工作樹垃圾全數被 .gitignore 涵蓋(逐一 `git check-ignore` 驗證)。

| # | 嚴重度 | 項目 |
|---|--------|------|
| 10-1 | LOW | `.gitignore` 未涵蓋 `.claude/`——多 agent worktree 作業有誤 commit 風險,建議補 |
| 10-2 | — | 死檔清單見第四節(4-1~4-7) |
| 10-3 | INFO | `favicon.svg` 與 `logo.svg` 位元組相同的雙份檔;AGENTS 說「logo.svg 為 favicon」與 index.html 實際引用 favicon.svg 微小出入 |

### 註解清掃(刪除前的文件覆蓋檢查已做)

| # | 嚴重度 | 位置 | 問題 | 文件覆蓋 |
|---|--------|------|------|----------|
| 10-4 | LOW | `bookings.py:240` | `SLOT_LIMIT` 訊息「**本學期**已佔 X 節」——語意實為「下一學期」(使用者面向文字,非註解)✅核實 | 直接修字 |
| 10-5 | LOW | `admin_equipment.py:3` | docstring 仍寫「名稱/**類別**/總數」——類別欄已刪 | AGENTS 第十輪已載,可逕修 |
| 10-6 | LOW | `activities.py:7` | module docstring「活動日+1 個月」vs service 實作「活動**結束日**」——多日活動有差 | service docstring 正確,統一即可 |
| 10-7 | LOW | `lib/semester.ts:14` | 「規則之後移入 system_settings」的未竟承諾 | **需先補文件**:data-model 未說明前端仍自算;隨 5-1 收斂 |
| 10-8 | LOW | `bookings/mock.ts:7,26` | 描述「將來後台可調」的能力實已在別處實作 | AGENTS 已涵蓋,隨 4-3 清除 |
| 10-9 | LOW | `eval/scoring.ts:1-2` | 檔頭稱「後端落地時以同規則實作」——後端已是權威;行政分規則現有三份(data-model §3.8/後端/前端) | 建議宣告 data-model §3.8 為權威,scoring.ts 註明「已由後端接管,留型別+歷史規格測試」 |
| 10-10 | LOW | `bookings.py:1-7`、`admin_settings.py:1-7`、`admin_signups.py:1-9`、`activities.py:1-8` | 檔頭以日期複述輪次決議全文,與 AGENTS/docs 重複且會過期 | 收斂為「一行語意+pointer」;決議史歸 docs |
| 10-11 | INFO | `api/*.ts` 檔頭 | 品質良好(行為契約+pointer),**應保留**,不需修剪 |

---

## 十一、已檢查且無虞(四路合併,供稽核覆蓋率)

- **借用**:固定借用下一學期快照(6 月窗→8/1–1/31、1 月窗→2/1–7/31)、同目標學期 10 節額度、availability-range 31 天含端驗證、器材工作天緩衝+假日排除、台北時區、逾期 10:30 判定〔codex+opus-BE〕
- **上傳/儲存**:串流上限、串流後結算、advisory 配額鎖、SHA-256 partial unique index、超額回滾、`unlink_quiet`、DB 先刪後刪檔、disk_total/disk_free〔codex〕
- **結案**:照片鎖序、零照片 422、孤兒照片回收、跨集合去重、`Promise.allSettled` 回滾〔codex〕
- **評分**:前後端 ad1–ad8 全規則同步(結案始算/一天一件/認可大型 ×3/名單分級/網頁連結 5 分/出席計分/未銷案 −1 上限 −10/表現優良/ad7×1.25/總分上限 100)〔codex+opus-BE 雙查〕
- **auth**:argon2id、密碼政策+3 代、5 次鎖 15 分、首登強改、session fixation、多裝置、CSRF 全覆蓋(double-submit+compare_digest)、時間等化〔codex+opus-BE〕
- **後端慣例**:全 router 無裸 HTTPException、五個 exception handler、admin 審核全部 with_for_update、SEC-01/FUNC-02/FUNC-04 修復經雙重驗證仍在位〔opus-BE〕
- **前端慣例**:confirmDialog/Modal 常駐/Pager/SortButton/click-tint/無 emoji/無單號/無自設 maxWidth/上傳統一管線/api 範本遵循/URL.createObjectURL 全配對 revoke/mutation pending 守衛——全數通過〔opus-FE〕
- **契約**:前端 106 個路徑全數存在於後端、方法一致、欄位轉換逐檔比對無阻斷性不一致;sort 鍵全在白名單、fetchAll page_size=100=MAX_PAGE_SIZE〔fable〕

---

## 十二、建議處理順序

**P1(正確性,建議下輪修復)**
1-1 mock 衝突判定(HIGH)、1-2 幹部證明/郵局審核端點或止血(HIGH)、1-3 CSV 跳脫(HIGH)、1-4 核准衝突檢查、1-5 器材超借、1-6/1-7 活動鎖序統一、1-8 跨日結案、1-9 postal 檔案政策 —— 修復時各補回歸測試(6-8)。

**P2(一致性/防回歸)**
2-1 行政分通知、2-2 aclose 權限語意(需求方確認)、1-11 overview 補頁、1-12 draft hydrate 防護、1-14 Maintenance gate、6-1~6-3 permissions/semester/csv/uploads 補測、6-6 INVALID_SORT 守門測試、2-6/5-1/5-2 單源化(PERIODS/semester/MIN_PHOTOS)、3-1/3-2 notify 與分頁樣板抽取、4-1~4-5 死碼清除。

**P3(文件/清掃,均為「改文件對齊程式碼」除非另註)**
8-1/8-2 AGENTS 過期節刪除+重組、9-9 data-model 儲存節改寫、9-10/9-11 規則回填、HANDOFF 更正(admin 借用審核頁已接線)、TASK6/REVIEW 歸檔、DEPLOY_CHECKLIST 容量語義更新、10-4~10-10 註解/文案修正、10-1 .gitignore 補 .claude/。

**需需求方拍板**:1-10 場況優先序(pending vs approved 誰蓋誰)、2-2 aclose 是否應涵蓋結案核准、8-7 需求優先序措辭、9-5 逾期提醒要不要自動排程、4-7 icons.svg 可否刪、第七節剩餘工作的排程(尤其工讀生端點交——它擋住逾期/停權整條鏈)。
