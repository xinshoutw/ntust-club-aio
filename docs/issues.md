# 已知問題

「已經做了但做錯或不合理」的清單。還沒做的見 [gaps.md](gaps.md),逐頁細節見 [spec/](spec/)。

嚴重度:**阻擋** = 上線前必修 · **高** = 會讓人做錯事或丟資料 · **中** = 體驗或維運問題。

---

## 1. 功能整條走不通

| 編號 | 嚴重度 | 問題 |
|---|---|---|
| ISS-04 | 高 | **評審端在正式環境等於不能用**:分組與評審指派沒有寫入 API,三頁永遠顯示「尚未被指派評分」 |

## 2. 畫面說一套、系統做一套

| 編號 | 嚴重度 | 問題 |
|---|---|---|
| ISS-92 | 中 | **持 `aaccount` 與兩個簽核鍵的人可自建分身繞過「相鄰關卡不得由同一人簽核」**:建帳號時可授出自己持有的鍵(D-01),回應直接帶明文一次性密碼,登入即可簽下一關;**重設位階不高於自己的同儕密碼**也是同一條路。稽核留有紀錄可事後追,事前沒有控制 |
| ISS-93 | 中 | **器材「待借出」的判定有三份,只有徽章那兩份有日期軸**:`badges.py` 的 `booking-overview` 與 `pt-checkout` 算的是 `approved 且 end_date >= today`,而工讀生待借出清單(`staff.py` 的 `status=approved`)與「借用中」卡(`booking_service.equipment_loan_ongoing_expr`)只篩狀態 —— 側欄說 0 筆、點進去列得出來。根因是**區間過了沒有任何轉移**:`pending`/`approved` 不會自己走掉,逾期只認 `checked_out`,所以核准後沒去領的單永遠留在社團「正在借用」與行政「借用中」,社團取消不了(開始日已過)、逾期追蹤也抓不到。要收得先定「核准後未領取」的規則。行政端鏡射的工讀生作業(D-26)撞的是同一份落差 |
| ISS-95 | 中 | **側欄徽章與評鑑卡導向的頁面看不到它們數的東西**:「活動列表」徽章數的是全學期的退回件(57 筆有 56 筆在舊學期),連過去的 `/activities` 落在最新學期;評鑑資料總覽五張卡同理。要修得先讓 `/club/activities` 收「全部學期」(現行 `semester` 的 pattern 是 `^\d{3}-[12]$`),或讓徽章帶出目標學期。另外 `MembersPage` 的學期硬寫 `currentSemester()`、不讀網址,ad5 那張卡連過去一樣看不到舊學期名單 |
| ISS-96 | 中 | **評鑑資料總覽的 ad2/ad3/ad4 連到只列未結案活動的頁面**:那三項評的是**已結案**活動,`/activities/close` 只列 `closable=true`,依建構方式一筆都不會出現 |
| ISS-101 | 中 | **承辦看不到自己退回或撤銷的理由 —— 行政端根本沒有列出那些單的地方**:三支 `Admin*Out` 已帶 `decision_reason` / `decided_at` / `decided_by`(簽核者姓名),但借用審核兩頁只查 `status=pending`、社團總覽三張卡只查 `active=true`,退回件與撤銷件在行政端一個畫面都不出現。要收得先定「最近處理」要放哪一頁、列幾筆、看多久 |
| ISS-91 | 中 | 固定借用審核的衝突標示**不含臨時借用**:`roomConflictSlots` 只比對固定借用(待審 + 已核准),而核准端會擋「學期內已核准的單日臨時借用」(`SLOT_TAKEN`)—— 畫面標成無衝突,承辦按下核准才被擋 |
| ISS-12c | 中 | **評鑑上傳鎖設不了**:`eval_settings.unlocked` 全後端只有讀,沒有任何寫入端點或 UI,只能進 DB 手改(讀的那半已補:`AwardDetailOut` 回 `upload_locked`,上傳鈕與刪除鈕依它收掉)。要收得先定哪一把鍵能開關、逐獎項還是全鎖、鎖上後已上傳的檔案能不能刪 —— 與 ISS-20 同一個題目,建議併入評鑑鏈 |
| ISS-103 | 低 | **簽核章軌的「已退回」可能標在錯的關卡**:`ActivityReviewModal.stagesOf` 以「第一個沒有核准章的關卡」當作被退回的那一關。承辦核准 → 組長退回 → 社團重送 → **承辦這次直接退回**,此時 advisor 仍留著上一輪的核准章,畫面會把「已退回」蓋在組長那格。要標對得改看 `approval_records` 最後一筆 reject 的 stage(行政端詳情已經帶得出 `approvals`) |

## 3. 預設值讓人不小心就放行(fail-open)

| 編號 | 嚴重度 | 問題 |
|---|---|---|
| ISS-105 | 中 | **`PATCH /club/profile` 帶顯式 `null` 一半 500、一半靜默清空必填欄位**:`ClubProfileUpdate` 的欄位型別都是 `X \| None`,而 pydantic 的 `field_validator` 對「有帶且為 null」一樣會執行 —— `intro` 的驗證器擋得下來,`advisor_name` 是 `if v is not None and not v.strip()` 才報錯,`null` 直接放行並清掉那一欄(前端 `ClubSettingsPage` 對它是 `required: true`,後端 fail-open,而 `api/clubProfile.ts` 送的正是 `trim() \|\| null`);`contact_emails` 的驗證器對 `None` 回 `None`,`setattr` 到 NOT NULL 欄位 → IntegrityError 23502 → 不在 `_CONFLICT_SQLSTATES` 內 → 回 500。修法比照 `admin_venues.update_venue`:`model_dump(exclude_unset=True)` 之後濾掉顯式 null,並明列哪幾欄真的可以清空 |
| ISS-106 | 中 | **場地主檔用 PATCH 造得出「兩種借用型態都不開放」的死列**:`VenueIn._one_mode` 擋得住建立,`VenueUpdateIn` 沒有這個 validator(`schemas/bookings.py`)。那種場地兩邊下拉都不出現,只會在場況圖上多一整列永遠「不開放」—— 正是建立端刻意擋掉的東西 |

## 4. 會遺失資料

| 編號 | 嚴重度 | 問題 |
|---|---|---|
| ISS-20 | 高 | **評審評分沒有截止或凍結機制**。成績公布後仍可覆寫,`review_scores` 只有一列、舊分數不留痕 |

## 5. 權限與資料邊界

| 編號 | 嚴重度 | 問題 |
|---|---|---|

## 6. 時間與日期的判定

| 編號 | 嚴重度 | 問題 |
|---|---|---|

## 7. 併發與競態

| 編號 | 嚴重度 | 問題 |
|---|---|---|
| ISS-108 | 低 | **線上申請的三支建立端點沒有任何雙擊送出的守門**:借用三支都先 `lock_resource(db, "club", ...)` 再查重(`api/v1/bookings.py`),而幹部證明、郵局帳戶異動、空間報修(`api/v1/applications.py`)既無鎖也無查重 —— 連按兩次就是兩張一模一樣的單進承辦佇列。要收得先定「什麼算重複」:幹部證明可以同學期申請正副兩種,郵局異動本來就可能連辦兩件 |

## 8. 效能與規模

| 編號 | 嚴重度 | 問題 |
|---|---|---|
| ISS-94 | 中 | **兩處清單在正式資料量下整批渲染**:行政端社團總覽的「進行中申請」卡(單社最多 44 筆)、報名管理的社團名單(端點 `admin_signups.py` 本身也沒有分頁,一次帶回每社全部參加人與自訂欄位)。社團端總覽三張卡與申請審核的待審佇列已分頁,這兩處是同型 |

## 9. 資料正確性

| 編號 | 嚴重度 | 問題 |
|---|---|---|
| ISS-99 | 中 | **「送件時間」其實是活動建立時間**:後端沒有獨立的送出時間戳,`AdminActivity.submittedAt` 取 `created_at`。待審佇列依它排序 —— 七月建的草稿八月才送審,會排在八月初就送件的活動前面 |

## 10. 通知

| 編號 | 嚴重度 | 問題 |
|---|---|---|
| ISS-67 | 中 | 行政/工讀生/評審端的通知鈴鐺永遠是空的,卻仍佔頂欄位置 |

## 13. 程式碼一致性

| 編號 | 嚴重度 | 問題 |
|---|---|---|
| ISS-97 | 低 | **工讀生端違規勸導表單的社團選擇仍是平鋪下拉**(60+ 社一條直列),全站其餘都改用二級選單 `ClubCascader`。它吃 `/staff/clubs`,回傳沒有 `attribute`,共用前要先讓該端點回性質,或把選項來源改成 prop |
| ISS-90 | 中 | 高風險測試類型整片缺席:真實併發、權限矩陣、月底/閏年/時區邊界、檔案系統故障;另有兩個測試本身有問題(假併發、名實不符) |
| ISS-111 | 低 | **借用取消鈕的判定前端三份,其中一份靠別處的過濾才對**:後端 `_ensure_cancellable` / `_ensure_venue_cancellable` 是唯一權威(`api/v1/bookings.py`)。`VenueBookingPage` 與 `EquipmentPage` 都寫成「pending,或 approved 且尚未開始」,`FixedRoomPage` 寫的是 `status === 'pending' \|\| 開始日在今天之後` —— 少了 `approved &&`,現在結果一樣只因為那張表只餵得到 pending/approved |
| ISS-113 | 低 | **同一個審核彈窗兩處餵不同的 payload**:`ReviewPage` 在非第一關把 `fundSource`/`budget`/`isLargeApproved` 都收掉再送,`ClubOverviewPage` 一律整包送出。後端 `approve` 在非 advisor 關本來就不讀那幾個欄位,現在無害 —— 但兩處對「哪一關該送什麼」各有一套說法,後端哪天開始讀,只有一邊會是對的 |
