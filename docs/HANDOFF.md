# Session Handoff(2026-07-21,第十三輪:舊系統資料遷移 + 遷移前置規則調整)

> 給下一個 session 的交接快照。永久性專案知識在三層 `AGENTS.md` 與 `docs/architecture.md`、`docs/data-model.md`、`docs/design-guide.md`;本檔只記「現在進行到哪、接下來做什麼」。過期即刪。

## 本輪已完成(分支 `dev`,前一輪 16 commit + 本輪 commits 皆未推)

1. **舊系統(CMS)DB dump 分析與 gap 盤點**:dump=`legacy/ClubManagementSystem/ntust_clubs_2026-07-21.dump`,已還原到 club-aio pg 容器的 `legacy_clubs` 庫;12 項「舊有新無」需求方全數拍板(細節見 AGENTS.md 第十三輪節)
2. **遷移前置 schema/功能**(migration `8f2c6a91d3e5`,up/down/up 驗證過):
   - clubs.kind(社團/學會,廢除社名強制社/會結尾)、en_name、attribute NULL-able、advisor_out_*(校內/校外指導老師各一)
   - club_members.phone、職稱放寬各身份皆可(幹部仍必填)
   - **活動類型二分**:「社課或會議」/「活動」;人數語彙統一「社員/非社員」
   - 前端全同步(kindLabel 改吃 clubKind、行政端類型下拉、成員電話行內編輯、管理項目雙指導老師+英文名)
3. **資料遷移完成**(`migration/cms_import.py`,idempotent、重跑驗證 0 新增):dev 庫現況=160 社(2 偽社團不遷)、users 177、成員 30,478、活動 14,236(結案報告 10,913)、經費 15,030、公告 8;一次性密碼 108 筆在 `migration/out/one_time_passwords_2026-07-21.csv`(**交承辦後銷毀**)

## 驗證現況(全綠)

- 後端 `timeout 300 uv run pytest -q` **211 passed**、`ruff check .` 全綠
- 前端 `pnpm exec tsc -b` 0 錯、`pnpm test` 35 passed、lint 僅既有 fast-refresh warning
- **注意**:dev 庫=真實遷移資料(非 seed_mock);要回 mock 環境跑 `seed_mock --yes`,要回遷移資料跑 `reset_db --yes` + `uv run python ../migration/cms_import.py`

## 下一輪待辦 / 待需求方

- **舊機 media 目錄**(documents/、images/,~8.7 萬檔):使用者抓回後寫檔案匯入(PlanFile→活動附件、activityimages→結案照片、activityfiles);`migration/README.md` TODO 節
- **待需求方拍板**:評鑑檔案庫 Club_clubfiles(12,752 檔)歸檔與否;行政歷史文件(7 筆);舊 staff「侍筱鳳」帳號 `800` 與偽社團「學務處就輔組」同名衝突(staff 端未遷)
- **clubclass(PHP 場地器材借用)**另套 DB,借用歷史要遷需另 dump
- **簽核流程重做**(2026-07-17 拍板規格,見上輪 HANDOFF/AGENTS):狀態機/角色改名/頭銜/superadmin sh 腳本/逐項核定 UI——尚未實作
- 前輪 REVIEW_full 的 P2/P3 待辦仍在(lib 測試補強、文件對齊、AGENTS 重組提案)
- 成員名單截至 106-2、活動至 2026-10:屬舊系統真實狀態,前端預設學期(114-2)下成員頁會是空的,屬預期

## 環境與慣例提醒

- **多 agent 平行作業絕不可 `git stash`**;跑測試務必包 timeout 且不同時開兩個 pytest
- 前端 `pnpm exec tsc --noEmit` 是空檢查,必須 `pnpm exec tsc -b`;lint 是 `pnpm run lint`(oxlint)
- 確認彈窗一律 `lib/confirm.ts`;Modal 一律 open+afterClose 常駐;前端不顯示單號(稽核除外);Commit 英文一行為一 commit、禁元描述;UI 禁 emoji
- **Python 3.14 lazy annotation**:欄位名若與型別同名(如 `date`)須用別名(`dt.date`)
- 狀態變更端點鎖序/上傳加總上限/`file_service.unlink_quiet()` 等慣例見上輪 HANDOFF(仍有效)與 AGENTS.md
