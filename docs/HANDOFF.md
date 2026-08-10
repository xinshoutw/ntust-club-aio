# Session Handoff(2026-08-10:第十四輪已完成 + 全面 code review 已產出,findings 尚未開修)

> 給下一個 session 的交接快照。永久性專案知識在三層 `AGENTS.md` 與 `docs/architecture.md`、`docs/data-model.md`、`docs/design-guide.md`;本檔只記「現在進行到哪、接下來做什麼」。過期即刪。

## 現在在哪

**程式碼狀態自 2026-07-21 起沒有任何變動**(HEAD `0d38de1`,無新 commit)。這中間做的是一次全面 code review,產出報告但**尚未動手修任何東西**。

1. **第十四輪(2026-07-21)已完成**:pt/viewer 雙面板實裝、需求方 15 項、全站表格排序與欄寬。決議明細已收進 `AGENTS.md`「第十四輪決議」段落,不在此重複。
2. **全面 code review(2026-07-25)已完成**:報告 = **`docs/review-2026-07-25.html`**(單檔 HTML,瀏覽器開,可依嚴重度/分類篩選、點列展開)。
   - 11 個獨立審查者(Opus ×10 + codex gpt-5.6-sol ×2)平行審查
   - **119 項:9 阻擋上線、35 高、68 中、7 低**
   - 每項有唯一編號(`BUG-xx` / `DEC-xx` / `GAP-xx` / `OPS-xx` / `IMP-xx`),含檔案:行號、具體失敗情境、建議修法
   - **一項都還沒修**

## ⚠ 第一件事

**51 個 commit 只存在這台 Mac**(`git rev-list --count origin/dev..dev` = 51,整個第十四輪);`main` 落後 `dev` 497 個 commit。這是目前最大的單點故障,零成本可解 —— 先 push(報告編號 `OPS-03`)。

未進版控的檔案:`docs/review-2026-07-25.html`(建議 commit)、`compose.override.yml` 與 `start-dev.sh`(本機專用,刻意不入版控)、`backend/.coverage`(應加 gitignore)。

## 驗證現況(2026-07-25 實測,非引用文件)

- 後端 `CLUB_AIO_TEST_DB=<name> timeout 900 uv run pytest -q` → **262 passed**;`ruff check .` 全綠
- 後端覆蓋率(pytest-cov)→ **95%**(5734 statements / 295 missed);較低者:notify 73%、audit 77%、signup_service 82%
- 前端 `pnpm exec tsc -b` → 0 錯;`pnpm test` → 8 檔 35 passed;`pnpm run lint` → 僅 8 個既有 fast-refresh warning
- 無秘密外洩:`git log --all` 確認 `.env` 與 `migration/out` 從未進版控

## 下一輪待辦 —— 依報告的「建議處理順序」

報告頁面內有完整的四批排序,摘要:

1. **零成本**:`OPS-03` push 51 個 commit
2. **一次問完承辦**(不決定就排不了程):`DEC-07`(**這學年評鑑要不要在新系統跑 —— 這題決定 GAP-01/GAP-03/BUG-01 是不是硬阻擋,牽動整個上線排程**)、`DEC-06` 舊機 media 8.7 萬檔何時交付、`DEC-05` 舊評鑑檔案庫 12,752 檔要不要遷、`DEC-01` 簡報可否後補、`DEC-02` 窗外整頁鎖、`DEC-03` 器材超借要不要硬擋、`DEC-04` aclose 權限範圍
3. **不需等人、約一天的小修**:`BUG-01` 移除評鑑結果頁入口、`BUG-07` 拿掉假密碼 fallback、`OPS-02` 加 ENV guard、`OPS-07` CI 補 test/lint + SHA tag、`BUG-03` 遷移三處補 `_aware()`、`BUG-12` 幹部證明學年期改推導、`OPS-12` 修 DEPLOY_CHECKLIST 過期與容量語義、結案草稿 hydrate 加 `Array.isArray`、手動借用移掉 `disabledDate`
4. **上線前必辦、工作量較大**:`OPS-01` 備份機制、`GAP-02` 假日匯入、`OPS-04` 器材主檔進正式 seed、`BUG-02` 檔案下載權限收斂、`BUG-41` 行政分 N+1 與分頁、`IMP-02` 權限鍵統一(**要在正式建帳號之前**)、`OPS-05` edge 切換演練、`GAP-04` 場地主檔 CRUD、`GAP-05` 逾時待審自動駁回
5. **「這學年要跑評鑑」才需要的大工程**:`GAP-01` 分組與評審指派 → `BUG-14` 評審代號 → `GAP-03` 成績總表 → `BUG-01` 評鑑結果頁。四者同屬「評鑑成績彙總鏈」,`services/evaluation.py` 目前只處理行政分自動計算、**完全沒有跨評審彙總這一層**,建議當單一開發段落規劃,不要拆散

## 已逐條比對確認正確,不要重審

前後端計分邏輯 100% 等價(14 項規則逐條比對);`PERIOD_TIMES` 前端/後端/舊 clubclass 三方零差異;守衛覆蓋率 100%(除 `/health` 與 `/auth/login`);社團端零 IDOR;viewer 收斂到「分組×獎項×年度」;44 表 models ↔ migration 欄位/索引/約束零差異;17 個 migration 單一線性鏈且全部有 downgrade;密碼政策全數落地;首登強制改密無法繞過;`add_months` 月底夾底與 PG `interval '1 month'` 同義;金額全為整數元、不需 Decimal;檔案路徑穿越/下載 XSS/Content-Disposition injection 皆不成立;時區全程台北無 naive/aware 混用。

## 文件狀態提醒

- `docs/DEPLOY_CHECKLIST.md` **已嚴重過期**(寫於 2026-07-17,之後跑了十三、十四兩輪):A1/A2 說評審端與工讀生端「完全未實作」實際皆已實裝;C 說「沒有 migration/ 目錄」實際已有且演練完成。**且其容量語義與程式碼方向相反**(文件寫 `capacity_gib 40`/`reserve_gib 10`,實際已移除、改讀實體磁碟)。這是上線操作手冊,照它做會做錯 —— 見 `OPS-12`
- `docs/data-model.md` 主表定義有 15 處落後於實作(清單在報告 BUG 區與盤點段落);其 `:450` 記的索引名是被否決的方案
- `AGENTS.md` 已 277 行 / 42KB,決議流水帳式堆疊,舊決議與新決議衝突時難判斷(例:「社團名稱強制社/會結尾」第九輪定案、第十三輪廢除,兩段都還在)。建議獨立一輪重組、決議史移 `docs/decisions.md`(`OPS-13`)

## 本機環境(此台 Mac)

- host 5432 被 OrbStack VM 佔用:db 走 **55432**(`compose.override.yml` 不入版控 + `.env` `POSTGRES_PORT=55432`);pnpm 走 corepack
- 測試庫可平行:`CLUB_AIO_TEST_DB=<name>` 覆寫(多 worktree 各用一庫)

## 環境與慣例提醒

- 多 agent 平行絕不可 `git stash`;pytest 必包 timeout;平行 worktree 各設 `CLUB_AIO_TEST_DB`
- 前端 `pnpm exec tsc -b`(`--noEmit` 是空檢查);lint = `pnpm run lint`
- 確認彈窗一律 `lib/confirm.ts`;Modal open+afterClose 常駐;高彈窗一律 `useModalAutoFocus`;不顯示單號;UI 禁 emoji;Commit 英文、一行為一 commit、禁元描述
- **表格慣例**:資料表一律 `tb fixed`+`<Cols>`;排序一律 `useMultiSort`+`MultiSortButton`(伺服器端 `sortParam`);新表照五準則給預設排序
- Python 3.14 lazy annotation:欄位名與型別同名須別名(`dt.date`)。**唯一漏網之魚 `models/signups.py:60`**(目前碰巧正確,見 `IMP-10`)
- `PERIOD_TIMES` 前後端各一份(`booking_service.py` / `api/bookings.ts`),改動須同步(`IMP-04` 建議改由後端下發)
