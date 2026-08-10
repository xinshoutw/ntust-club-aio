# Session Handoff

> 「現在進行到哪、接下來做什麼」的交接快照。永久知識在三層 `AGENTS.md` 與 `docs/` 的設計文件;本檔過期即刪。

## 現在在哪

程式碼自 2026-07-21 起沒有變動,這中間做的是一次全面 code review 與一次文件整理。

1. **第十四輪(2026-07-21)已完成**:pt/viewer 雙面板實裝、需求方 15 項、全站表格排序與欄寬
2. **全面 code review(2026-07-25)已完成**:報告 = `docs/review-2026-07-25.html`(單檔 HTML,可依嚴重度/分類篩選)。11 個獨立審查者平行審查,**119 項:9 阻擋上線、35 高、68 中、7 低**,每項有編號與檔案行號。**一項都還沒修**
3. **文件整理(2026-08-10)**:architecture / data-model / design-guide / DEPLOY_CHECKLIST / webhook 清冊 / AGENTS.md 全部重寫為 spec 形式,刪除逐輪決議流水帳與已完成的補記;data-model 修正 15 處與實作不符

## 第一件事

**51 個 commit 只存在這台 Mac**(`git rev-list --count origin/dev..dev`);`main` 落後 `dev` 497 個 commit。這是目前最大的單點故障,零成本可解 —— 先 push(報告編號 `OPS-03`)。

## 驗證現況(2026-07-25 實測)

- 後端 `CLUB_AIO_TEST_DB=<name> timeout 900 uv run pytest -q` → 262 passed;`ruff check .` 全綠;覆蓋率 95%(較低者:notify 73%、audit 77%、signup_service 82%)
- 前端 `pnpm exec tsc -b` → 0 錯;`pnpm test` → 35 passed;`pnpm run lint` → 僅 8 個既有 fast-refresh warning
- `git log --all` 確認 `.env` 與 `migration/out` 從未進版控

## 下一輪待辦

依報告的建議處理順序:

1. **零成本**:`OPS-03` push 51 個 commit
2. **一次問完承辦**(不決定就排不了程):`DEC-07`(**這學年評鑑要不要在新系統跑 —— 決定 GAP-01/GAP-03/BUG-01 是不是硬阻擋,牽動整個上線排程**)、`DEC-06` 舊機 media 8.7 萬檔何時交付、`DEC-05` 舊評鑑檔案庫 12,752 檔要不要遷、`DEC-01` 簡報可否後補、`DEC-02` 窗外整頁鎖、`DEC-03` 器材超借要不要硬擋、`DEC-04` aclose 權限範圍
3. **不需等人、約一天的小修**:`BUG-01` 移除評鑑結果頁入口、`BUG-07` 拿掉假密碼 fallback、`OPS-02` 加 ENV guard、`OPS-07` CI 補 test/lint + SHA tag、`BUG-03` 遷移三處補 `_aware()`、`BUG-12` 幹部證明學年期改推導、結案草稿 hydrate 加 `Array.isArray`、手動借用移掉 `disabledDate`
4. **上線前必辦、工作量較大**:`OPS-01` 備份機制、`GAP-02` 假日匯入、`OPS-04` 器材主檔進正式 seed、`BUG-02` 檔案下載權限收斂、`BUG-41` 行政分 N+1 與分頁、`IMP-02` 權限鍵統一(**要在正式建帳號之前**)、`OPS-05` edge 切換演練、`GAP-04` 場地主檔 CRUD、`GAP-05` 逾時待審自動駁回
5. **「這學年要跑評鑑」才需要的大工程**:`GAP-01` 分組與評審指派 → `BUG-14` 評審代號 → `GAP-03` 成績總表 → `BUG-01` 評鑑結果頁。四者同屬「評鑑成績彙總鏈」,`services/evaluation.py` 目前只有行政分自動計算、完全沒有跨評審彙總這一層,建議當單一開發段落規劃,不要拆散

## 樣式與維運 debt(非阻擋)

- 設計規範偏好 Skeleton,但接線頁廣泛使用 `<Spin>`,可另輪集中替換
- 非狀態錯誤大量誤用 `#B03A2E`(規範保留給「已退回」),一般 error 應為 `#C13B34`;可加最小 CSS token 後機械取代,勿混進功能修正
- `AdminRoomsPage.tsx:19` 的道歉文案、`OneTimePasswordModal.tsx:48` 的驚嘆號違反文案規範
- `c7e...` migration 的 downgrade 會刪除跨學期重複成員資料,部署前需決定是否接受此語意
- 內層 nginx 信任所有 RFC1918 網段,目前依賴 GCP firewall;正式部署可收窄至 edge/compose 實際來源
- 讀屏語意未完成:235/309 個 `th` 無 `scope`、3 頁可點列無鍵盤入口(`BUG-51`)

## 已逐條比對確認正確,不要重審

前後端計分邏輯 100% 等價(14 項規則);`PERIOD_TIMES` 前端/後端/舊 clubclass 三方零差異;守衛覆蓋率 100%(除 `/health` 與 `/auth/login`);社團端零 IDOR;viewer 收斂到「分組×獎項×年度」;44 表 models ↔ migration 欄位/索引/約束零差異;17 個 migration 單一線性鏈且全部有 downgrade;密碼政策全數落地;首登強制改密無法繞過;`add_months` 月底夾底與 PG `interval '1 month'` 同義;金額全為整數元;檔案路徑穿越/下載 XSS/Content-Disposition injection 皆不成立;時區全程台北無 naive/aware 混用。

## 本機環境(此台 Mac)

- db 預設走 5432;OrbStack VM 佔用該埠時改 55432(`.env` `POSTGRES_PORT` + `compose.override.yml`,兩者皆不入版控)。pnpm 走 corepack
- 測試庫可平行:`CLUB_AIO_TEST_DB=<name>` 覆寫(多 worktree 各用一庫)
- 未進版控且刻意不入的檔案:`start-dev.sh`(db 埠若被佔用另加 `compose.override.yml`)
