# Session Handoff(2026-07-21,第十三輪:CMS+clubclass 雙遷移 + 借用五功能)

> 給下一個 session 的交接快照。永久性專案知識在三層 `AGENTS.md` 與 `docs/architecture.md`、`docs/data-model.md`、`docs/design-guide.md`;本檔只記「現在進行到哪、接下來做什麼」。過期即刪。

## 本輪已完成(分支 `dev`,前一輪 16 commit + 本輪 commits 皆未推)

1. **舊系統(CMS)DB dump 分析與 gap 盤點**:dump=`legacy/ClubManagementSystem/ntust_clubs_2026-07-21.dump`,已還原到 club-aio pg 容器的 `legacy_clubs` 庫;12 項「舊有新無」需求方全數拍板(細節見 AGENTS.md 第十三輪節)
2. **遷移前置 schema/功能**(migration `8f2c6a91d3e5`,up/down/up 驗證過):
   - clubs.kind(社團/學會,廢除社名強制社/會結尾)、en_name、attribute NULL-able、advisor_out_*(校內/校外指導老師各一)
   - club_members.phone、職稱放寬各身份皆可(幹部仍必填)
   - **活動類型二分**:「社課或會議」/「活動」;人數語彙統一「社員/非社員」
   - 前端全同步(kindLabel 改吃 clubKind、行政端類型下拉、成員電話行內編輯、管理項目雙指導老師+英文名)
3. **CMS 資料遷移完成**(`migration/cms_import.py`,idempotent):dev 庫=159 社(3 偽社團不遷:國際事務處/testclub/學務處就輔組)、users 178(staff 17/17 含侍筱鳳 `800`;`101101101` 黃宥維已升 superadmin)、成員 30,477、活動 14,234、公告 8;一次性密碼 109 筆在 `migration/out/one_time_passwords_2026-07-21.csv`(**交承辦後銷毀**)
4. **clubclass 遷移完成**(`migration/cc_import.py`,idempotent;來源=拋棄式 MySQL 容器 `cc-legacy`,dump=`legacy/clubclass/cc_2026-07-21.sql`):場地 23(4 停用承接歷史)、器材 25(8 停用)、教室借用 15,634(一舍 B2 拆樓梯+白板)、器材借用 7,173;行政借用 club_id=NULL 顯示「學務處」
5. **借用五新功能**(migration `b3e7d40a95c1`):取消(cancelled 狀態)、行政手動借用頁、場地不開放規則 Rule Page(venue_block_rules)、器材單次可借上限、**聯絡電話必填**(場地/器材申請;需求方原選填後改必填)
6. **需求方 7 點 UX/效能調整(同日第三批)已落地**:
   - 聯絡電話僅允許 `0-9 - ( ) * #`(前後端同規則)
   - 各借用頁底部列表可直接取消;**「正在借用/正在申請」(全部、不限長度)+「最近」(近 5 筆)雙列表**(借用三頁+總覽+幹部證明/郵局/報修;bookings 走後端 `active=true/false` 過濾)
   - **申請審核/結案審核改伺服器端分頁**(原整批撈 14k+ 造成卡頓):佇列只抓可簽核狀態;歷史表 20/50 一頁、活動時間新在前;篩選(社團/類型含大型推導/狀態)與排序全下推 SQL(`/admin/activities` 新參數 status/club_id/type 多值、locked、sort);總覽排除 closed、已歸還伺服器分頁
   - 公告 markdown 連結一律開新分頁(專屬 DOMPurify 實例);Modal 動畫固定目的地(transform-origin center)
7. **三輪 Opus 對抗審查皆已修**:CMS 輪 7 findings(無 C/H);clubclass 輪 1 HIGH(NULL club 通知 500)+1 MEDIUM;第三輪 1 HIGH(僅 areview 帳號永久 spinner)+2 MEDIUM(手動器材漏電話驗證、DOMPurify 全域 hook 外溢)

## 驗證現況(全綠)

- 後端 `timeout 300 uv run pytest -q` **222 passed**、`ruff check .` 全綠
- 前端 `pnpm exec tsc -b` 0 錯、`pnpm test` 35 passed、lint 僅既有 fast-refresh warning
- **注意**:dev 庫=真實遷移資料(非 seed_mock);要回 mock 環境跑 `seed_mock --yes`,要回遷移資料跑 `reset_db --yes` + `uv run python ../migration/cms_import.py`

## 下一輪待辦 / 待需求方

- **舊機 media 目錄**(documents/、images/,~8.7 萬檔):使用者抓回後寫檔案匯入(PlanFile→活動附件、activityimages→結案照片、activityfiles);`migration/README.md` TODO 節
- **待需求方拍板**:評鑑檔案庫 Club_clubfiles(12,752 檔)歸檔與否;行政歷史文件(7 筆)——皆 TODO,需求方後續給
- **簽核流程重做**(2026-07-17 拍板規格,見上輪 HANDOFF/AGENTS):狀態機/角色改名/頭銜/superadmin sh 腳本/逐項核定 UI——尚未實作
- 前輪 REVIEW_full 的 P2/P3 待辦仍在(lib 測試補強、文件對齊、AGENTS 重組提案)
- 成員名單截至 106-2、活動至 2026-10:屬舊系統真實狀態,前端預設學期(114-2)下成員頁會是空的,屬預期

## 環境與慣例提醒

- **多 agent 平行作業絕不可 `git stash`**;跑測試務必包 timeout 且不同時開兩個 pytest
- 前端 `pnpm exec tsc --noEmit` 是空檢查,必須 `pnpm exec tsc -b`;lint 是 `pnpm run lint`(oxlint)
- 確認彈窗一律 `lib/confirm.ts`;Modal 一律 open+afterClose 常駐;前端不顯示單號(稽核除外);Commit 英文一行為一 commit、禁元描述;UI 禁 emoji
- **Python 3.14 lazy annotation**:欄位名若與型別同名(如 `date`)須用別名(`dt.date`)
- 狀態變更端點鎖序/上傳加總上限/`file_service.unlink_quiet()` 等慣例見上輪 HANDOFF(仍有效)與 AGENTS.md
