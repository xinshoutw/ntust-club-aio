# Session Handoff(2026-07-17,第十二輪:全庫審計 + 同日修復)

> 給下一個 session 的交接快照。永久性專案知識在三層 `AGENTS.md` 與 `docs/architecture.md`、`docs/data-model.md`、`docs/design-guide.md`;本檔只記「現在進行到哪、接下來做什麼」。過期即刪。

## 本輪已完成(分支 `dev`,16 commit 未推)

1. **全庫對抗式審查**(非 changeset,整個 repo):報告=`docs/REVIEW_2026-07-17_full.md`(HIGH 4/MEDIUM 21/LOW ~40,無 CRITICAL;含未實作功能完整盤點、AGENTS/docs 健檢、目錄清掃)。審查配置 Fable:Opus:Codex=1:2:1,關鍵 findings 經主審逐行核實。
2. **P1+快贏修復全數落地**(報告內「處理狀態」節有逐項 commit 對照),修復後經 Opus 對抗審查覆核**無 HIGH/MEDIUM 阻斷缺陷**。重點:
   - venue/room 核准衝突檢查(`booking_service.lock_resource` advisory lock;`SLOT_TAKEN` 409)
   - 活動全部可變更端點鎖序統一(`db.refresh(status, with_for_update)` 先鎖後驗)
   - 跨日活動結案時間驗證(單日才比 HH:mm 先後,前後端同規則)
   - BookingReviewModal 衝突判定改吃真實 pending 資料(mock 邏輯移除)
   - 成員 CSV 匯出走 `downloadCsv` 跳脫 + 匯入端剝 BOM
   - postal 存簿收 PDF+Image(`files.PASSBOOK` policy)
   - 行政分調整通知改推社團 webhook(`club_event`)

### 需求方本輪拍板(已寫入實作)
- **幹部證明/郵局帳戶異動最小審核=方案 (a)**:狀態機 審核中(pending)→處理中(processing)→**請洽學務處**(completed),單步前進、無退回;`ApplicationStatus` enum + migration `9d4b7e2c5a18`(可逆,downgrade 一律回 pending);admin 端點+`/admin/applications` 管理頁,權限鍵 **`aapply`**(schemas/accounts、lib/permissions、AccountsPage 三處已註冊)
- **郵局存簿收 PDF+Image**;aclose 與場況 rank **不動**

### 實作細節待需求方追認(已實作,如不同意再改)
- 行政端 `/admin/applications` 顯示代理人**完整電話**(承辦需聯絡;社團端仍遮罩)
- 申請狀態機**無退回動作**(需求方只點名兩個新狀態;不合格申請由學務處線下溝通)
- 器材**核准端**維持「可借數不足仍可核准(管理員裁量)」——審查建議改硬性 409,但既有測試明文此為刻意設計,未動,**待拍板**

## 驗證現況(全綠)

- 後端:`timeout 300 uv run pytest -q` **211 passed**、`ruff check .` 全綠;migration `9d4b7e2c5a18` up/down/up 於 dev 庫驗證過
- 前端:`pnpm exec tsc -b` 0 錯、`pnpm test` 35 passed、lint 僅既有 fast-refresh warning
- dev 庫已 `seed_mock --yes` 重灌(含 ApplicationStatus 新值域)

## 下一輪待辦 / 待需求方

- **本輪 16 commit 尚未 push**(使用者確認後推)
- **待需求方拍板**(見上「待追認」+):`aclose` 是否涵蓋結案核准、場況「已核准蓋過審核中」維持否、器材核准硬性檢核
- REVIEW_full 的 **P2**:lib 純函式測試補強(permissions/semester/csv/uploads/roles)、`INVALID_SORT` 守門測試、PERIODS/semester/MIN_PHOTOS 單源化、notify helper 與分頁樣板抽取、mock 死碼清除(5 檔零引用+activities/bookings mock 瘦身)
- REVIEW_full 的 **P3**:AGENTS.md 重組(247→~120 行提案在報告 §8)、data-model §3.aa 儲存節改寫等文件對齊(§9,每筆已標判定方向)、TASK6/REVIEW 歸檔、`.gitignore` 補 `.claude/`
- 未實作功能完整盤點=報告 §7(評審端、工讀生端+點交/違規開立後端、競賽報名斷鏈、分組指派、統計、成績總表、場地主檔 CRUD、手動借用、EvalResultPage、Email 模板、首頁導覽、migration/)
- 已接受風險(需求方拍板):磁碟無保留空間 → 共機 DoS,待告警機制
- 上線切換清單(edge proxy)於 2026-09 執行

## 環境與慣例提醒

- **多 agent 平行作業絕不可 `git stash`**;跑測試務必包 timeout 且不同時開兩個 pytest
- 前端 `pnpm exec tsc --noEmit` 是空檢查(solution-style tsconfig),必須 `pnpm exec tsc -b`;lint 是 `pnpm run lint`(oxlint)
- 確認彈窗一律 `lib/confirm.ts`;Modal 一律 open+afterClose 常駐;前端不顯示單號(稽核除外);Commit 英文一行為一 commit、禁元描述;UI 禁 emoji
- **Python 3.14 lazy annotation**:欄位名若與型別同名(如 `date`)須用別名(`dt.date`),否則 `Mapped[date|None]` 會被靜默解析成 NOT NULL(bookings/facilities/activities 均已別名)
- 上傳新端點/新申請性質:加總上限走 `files.total_uploaded()` + 鎖列 + 串流後結算回滾的既有模式;**清理性 unlink 一律走 `file_service.unlink_quiet()`**
- **狀態變更端點鎖序**:先 `db.refresh(row/activity, attribute_names=["status"], with_for_update=True)` 再驗狀態(活動九端點、申請狀態機皆此模式);**資源量檢核**(可借數/衝突)先 `booking_service.lock_resource(db, kind, id)` 再算再寫,申請端與核准端同鍵
- 測試上傳一律落 per-test 暫存目錄(conftest 全域 autouse `_tmp_upload_dir`),測試檔不必自帶
