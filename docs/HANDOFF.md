# Session Handoff

> 「現在進行到哪、接下來做什麼」的交接快照。永久知識在三層 `AGENTS.md` 與 `docs/` 的設計文件;本檔過期即刪。

## 現在在哪

功能程式碼自 2026-07-21 起沒有變動(其後只動過註解與文件)。

1. **第十四輪(2026-07-21)已完成**:pt/viewer 雙面板實裝、需求方 15 項、全站表格排序與欄寬
2. **全面 code review(2026-07-25)已完成**:11 個獨立審查者平行審查,119 項 findings。原始 HTML 報告已刪除,結論全數併入 `issues.md` / `gaps.md`;需要逐項檔案行號時到 git 歷史取回
3. **文件整理(2026-08-10)**:設計文件重寫為 spec 形式;程式碼註解移除日期戳與對話殘留
4. **頁面規格(2026-08-10)**:逐頁盤點全部 51 個頁面 → `docs/spec/`;問題與缺口重新彙整為 `docs/issues.md`(104 項)與 `docs/gaps.md`。**一項都還沒修**

## 第一件事

**有一批 commit 只存在這台 Mac**(`git rev-list --count origin/dev..dev` 查現值);`main` 也遠遠落後 `dev`。這是目前最大的單點故障,零成本可解 —— 先 push。

## 驗證現況(2026-07-25 實測)

- 後端 `CLUB_AIO_TEST_DB=<name> timeout 900 uv run pytest -q` → 262 passed;`ruff check .` 全綠;覆蓋率 95%(較低者:notify 73%、audit 77%、signup_service 82%)
- 前端 `pnpm exec tsc -b` → 0 錯;`pnpm test` → 35 passed;`pnpm run lint` → 僅 8 個既有 fast-refresh warning
- `git log --all` 確認 `.env` 與 `migration/out` 從未進版控

## 下一輪待辦

1. **零成本**:push 未推的 commit(`gaps.md` OPS-03)
2. **一次問完承辦**:`gaps.md` §6 的 12 項待決。其中 `DEC-01`(**這學年評鑑要不要在新系統跑**)決定整條評鑑彙總鏈是不是硬阻擋,牽動整個上線排程
3. **不需等人、約一天的小修**:`issues.md` ISS-02(移除評鑑結果頁入口)、ISS-17(假密碼 fallback)、ISS-03(幹部證明學年期改推導)、ISS-53(遷移三處補時區)、ISS-06(手動借用移掉 `disabledDate`)、`gaps.md` OPS-02(ENV guard)、OPS-08(CI 補 test/lint + SHA tag)
4. **上線前必辦、工作量較大**:OPS-01 備份機制、GAP-06 假日匯入、OPS-04 器材主檔進正式 seed、**ISS-14b 無補助案單關核定任意金額**、ISS-23 檔案下載權限收斂、ISS-13b 臨時借用不擋已結束活動、ISS-47 行政分 N+1 與分頁、ISS-24 權限鍵統一(**要在正式建帳號之前**)、OPS-05 edge 切換演練、GAP-05 場地主檔 CRUD、GAP-12 逾時待審自動駁回

   `issues.md` 現有 6 項標「阻擋」:ISS-01(競賽報名走不通)、ISS-02(評鑑結果頁假分數)、ISS-03(幹部證明學年期硬編)、ISS-14b(無補助案單關核定)、ISS-23(檔案下載權限)、ISS-53(遷移時區)
5. **競賽報名整條路徑走不通**(ISS-01):`is_eval` 建不出來、社團端也送不出獎項。要跑競賽報名就得先修這條
6. **「這學年要跑評鑑」才需要的大工程**:`gaps.md` §1 的 GAP-01→04 四項同屬「評鑑成績彙總鏈」,`services/evaluation.py` 目前只有行政分自動計算、完全沒有跨評審彙總這一層,建議當單一開發段落規劃,不要拆散

## 已逐條比對確認正確,不要重審

前後端計分邏輯 100% 等價(14 項規則);`PERIOD_TIMES` 前端/後端/舊 clubclass 三方零差異;守衛覆蓋率 100%(除 `/health` 與 `/auth/login`);社團端零 IDOR;viewer 收斂到「分組×獎項×年度」;models ↔ migration 欄位/索引/約束零差異(46 表);17 個 migration 單一線性鏈且全部有 downgrade;密碼政策全數落地;首登強制改密無法繞過;`add_months` 月底夾底與 PG `interval '1 month'` 同義;金額全為整數元;檔案路徑穿越/下載 XSS/Content-Disposition injection 皆不成立;時區全程台北無 naive/aware 混用。

## 其他待處理

- `c7e...` migration 的 downgrade 會刪除跨學期重複成員資料,部署前需決定是否接受此語意
- 內層 nginx 信任所有 RFC1918 網段,目前依賴 GCP firewall;正式部署可收窄至 edge/compose 實際來源

## 本機環境(此台 Mac)

- db 預設走 5432;OrbStack VM 佔用該埠時改 55432(`.env` `POSTGRES_PORT` + `compose.override.yml`,兩者皆不入版控)。pnpm 走 corepack
- 測試庫可平行:`CLUB_AIO_TEST_DB=<name>` 覆寫(多 worktree 各用一庫)
- 未進版控且刻意不入的檔案:`start-dev.sh`(db 埠若被佔用另加 `compose.override.yml`)
