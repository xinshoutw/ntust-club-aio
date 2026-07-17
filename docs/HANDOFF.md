# Session Handoff(2026-07-17,第十一輪:交叉審查 findings 修復)

> 給下一個 session 的交接快照。永久性專案知識在三層 `AGENTS.md` 與 `docs/architecture.md`、`docs/data-model.md`、`docs/design-guide.md`;本檔只記「現在進行到哪、接下來做什麼」。過期即刪。

## 本輪已完成(13 commit,分支 `dev`,尚未推送)

第十輪交叉審查(`docs/REVIEW_2026-07-17.md`)的 findings **全數處理完畢**,該檔已逐項標注處理結果與 commit hash。摘要:

### 需求方本輪拍板(已寫入實作,語義如下)
- **固定借用學期歸屬=「自動歸屬下一學期」**:申請時依申請日推導下一學期起訖(6 月開放窗 → 8/1–1/31、1 月 → 2/1–7/31)快照存入 `room_booking_requests.start_date/end_date`(migration `6b5a9c3affd0`,既有列依 created_at 台北時區回填);場況圖僅在區間內標格;每社 10 節額度=同目標學期未退回單合計。**seed_mock 例外**:展示資料用當前學期起訖,今天就看得到格
- **審查另列的兩項 base 既有 bug 一併修**(活動申請重複草稿、手機登出競態)

### 主要修復(細節見 REVIEW 檔)
- 結案:送出/上傳/刪照片統一活動列鎖(refresh with_for_update)、後端擋零照片結案(422);前次送出失敗殘留的孤兒照片顯示為**可移除既有照片**(FileOut 加 sha256 供前端跨集合去重);photosRef eager-ref;照片上限 gate 組態載入
- 器材主檔:總數欄改 onBlur diff 提交,本地草稿隨 refetch 同步
- 檔案:`unlink_quiet()` 讓清理性刪檔失敗不再蓋掉 413/409/成功回應;admin_files `capacity/remaining` 改名 `disk_total/disk_free`,前端佔用條加「其他佔用」段(比例對齊真實磁碟)
- budget_categories 舊 list[str] 殘留讀取端正規化(`get_budget_categories()`)
- P3-5(migration downgrade CHECK)**實測不成立**:本專案版本的 Alembic 會自動補 CHECK,不修

## 驗證現況(全綠)

- 後端:`timeout 300 uv run pytest -q` **202 passed**、`ruff check .` 全綠;migration `6b5a9c3affd0` up/down/up 驗證過
- 前端:`pnpm exec tsc -b` 0 錯、`pnpm test` 35 passed、lint 僅既有 fast-refresh warning
- dev 庫已 `reset_db + seed_mock`
- 注意:`alembic downgrade base` 在含資料的庫會於第八輪舊 migration(venues category CHECK)失敗,既有限制;新 migration 個別可逆

## 下一輪待辦 / 待需求方

- **本輪 13 commit 尚未 push**(修復 session 結束時由使用者確認後推)
- `docs/TASK6_REVIEW_HANDOFF.md` §6 可延後 debt 仍未做(`<Spin>`→Skeleton、`seed_mock --yes` 補 `ENV=dev` guard、inner nginx 信任網段收窄等)
- EvalResultPage 仍 mock(待需求方規格);staff/viewer panel、首頁導覽頁、Email MJML 模板未動
- 前端 `bookings/mock.ts` 仍是 admin 借用審核頁的 legacy mock(該頁未接後端)
- 已接受風險(需求方拍板):磁碟無保留空間 → 共機 DoS,待告警機制
- 上線切換清單(edge proxy)於 2026-09 執行

## 環境與慣例提醒

- **多 agent 平行作業絕不可 `git stash`**;跑測試務必包 timeout 且不同時開兩個 pytest
- 前端 `pnpm exec tsc --noEmit` 是空檢查(solution-style tsconfig),必須 `pnpm exec tsc -b`;lint 是 `pnpm run lint`(oxlint)
- 確認彈窗一律 `lib/confirm.ts`;Modal 一律 open+afterClose 常駐;前端不顯示單號(稽核除外);Commit 英文一行為一 commit、禁元描述;UI 禁 emoji
- **Python 3.14 lazy annotation**:欄位名若與型別同名(如 `date`)須用別名(`dt.date`),否則 `Mapped[date|None]` 會被靜默解析成 NOT NULL(bookings/facilities/activities 均已別名)
- 上傳新端點/新申請性質:加總上限走 `files.total_uploaded()` + 鎖列 + 串流後結算回滾的既有模式;**清理性 unlink 一律走 `file_service.unlink_quiet()`**
- 結案照片端點(upload/delete/close)動狀態前先 `db.refresh(activity, attribute_names=["status"], with_for_update=True)` 統一鎖序
- 測試上傳一律落 per-test 暫存目錄(conftest 全域 autouse `_tmp_upload_dir`),測試檔不必自帶
