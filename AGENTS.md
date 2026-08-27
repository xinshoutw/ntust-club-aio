# club-aio — 新版社團管理系統(All-in-One)

全新開發的臺科大社團管理系統,**2026 年 9 月前上線**,取代兩套退役舊系統:

- `../../legacy/ClubManagementSystem`(Django,clubs.ntust.edu.tw)
- `../../legacy/clubclass`(PHP,教室與器材借用)

**新系統功能必須至少涵蓋兩套舊系統的全部功能**。舊系統僅作功能對照與資料遷移參考,架構設計**完全不參考**。

## 開工前先讀

1. **`docs/HANDOFF.md`** — 現在進行到哪、接下來做什麼。本檔只記永久知識,不記進度
2. **`docs/spec/README.md`** — 逐頁規格索引;動任何一頁前先讀該頁的 spec
3. **`docs/issues.md`** / **`docs/gaps.md`** — 已知問題與未完成功能,全部尚未修

## 文件分工

| 文件 | 內容 |
|------|------|
| `docs/spec/` | **系統行為的權威來源**:一頁一檔,路由/資料來源/畫面/規則/該頁問題 |
| `docs/社團評鑑/` | 學務處提供的競賽評分標準 PDF,**評鑑細項一律以此為準** |
| `docs/architecture.md` | 系統架構、API 契約、部署 |
| `docs/data-model.md` | 資料表、狀態機、行政分規則、system_settings |
| `docs/design-guide.md` | 視覺與互動規範、全站元件慣例 |
| `docs/discord-webhook-messages.md` | 通知訊息清冊 |
| `docs/issues.md` | 已知問題(含嚴重度) |
| `docs/gaps.md` | 未完成功能(需求方已拍板的條目落地即移除,理由留在 `decisions.md`;維運與上線待辦在 `DEPLOY_CHECKLIST.md`) |
| `docs/decisions.md` | **需求方拍板的規則**;條目永久保留,回答「為什麼系統是這樣」 |
| `docs/improvements.md` | 可改進方向;不排期、不承諾,與待辦清單無關 |
| `docs/DEPLOY_CHECKLIST.md` | 上線檢查表 |

## 角色

| 角色 | 代號 | 說明 |
|------|------|------|
| 管理員 | `admin` | 學務處承辦;`super` 最高權限,一般管理員依頁面權限鍵分權 |
| 工讀生 | `staff` | 違規勸導、器材借出與歸還點交、逾期追蹤 |
| 社團 | `club` | 一社一帳號(幹部與社員是名單資料,非登入者) |
| 評審 | `viewer` | 競賽評分;評審代號對社團匿名(依分組排序顯示為評審A/B) |

## 功能模組

**社團端**

| 分組 | 頁面 |
|------|------|
| — | 總覽(公告 + 各類申請進度) |
| 活動管理 | 活動申請、活動結案、活動列表 |
| 社團管理 | 成員列表、管理項目(含指導老師、社團簡介、聯絡與通知、改密) |
| 空間與器材借用 | 借用總覽、固定場地借用、臨時場地借用、器材借用 |
| 線上申請 | 線上報名、空間報修、郵局帳戶異動、幹部證明 |
| 社團評鑑 | 資料總覽(評鑑結果頁未實作,見 `docs/gaps.md` GAP-04) |
| 其他 | 違規勸導紀錄 |

退回是活動列表上的狀態,不另設「退回列表」頁。

**評審端**:我負責的評分、評分(依獎項)、已完成評分

**工讀生端**:違規勸導填寫、違規紀錄查詢、器材借出點交、器材歸還點交、逾期追蹤

**行政端**(**一頁一權限鍵**,無 super 專屬頁;鍵表在 `backend/app/core/permissions.py`):總覽、活動申請審核、結案審核、報名管理、發布公告、臨時場地器材借用審核、固定場地借用審核、手動借用、場地不開放規則、社團總覽、成員列表、社團管理項目、逾期追蹤與停權、行政分審核、帳號管理、幹部證明管理、郵局帳戶管理、維修管理、違規管理、檔案管理、系統設定與主檔、稽核軌跡,另加**整組鏡射**的工讀生作業(`/admin/pt/*`)與評審評分(`/admin/viewer/*`)——
那兩組各自**一組一把鍵**(`astaff`/`aviewer`),是一頁一鍵的唯二例外(D-26)

尚未實作的功能一律見 `docs/gaps.md`,不在此重列。

## 核心業務規則

- **學期起訖**:上學期 8–1 月、下學期 2–7 月;唯一實作在 `core/semesters.py`,別再自己推導一份
- **活動簽核**:有核定補助 → 三關(承辦人 → 組長 → 學務長);**核定總額 0 元即當場核准**(D-16,不論停在哪一關 —— 沒申請,或申請了但決定不給,都不必再送下一關)。第一關認定經費來源與逐項核定金額;退回必填原因;學務長為本人操作(受限權限帳號,僅簽核權)。顯示詞為「承辦人」,程式鍵維持 `advisor`/`approve_advisor`/`pending_advisor`
- **結案**:承辦人單關;活動結束日 +N 天(`close_lock_days`,預設 21)未結案即鎖定(推導,管理員可解鎖);結案通過才計入競賽行政分
- **競賽五獎項**:最佳社團(行政 40% + 營運 60% 加權)/財務/活動/成果發表/負責人;財務、活動、負責人含現場簡報 20 分;行政資料 ad1–ad8 系統自動評分 + 人工調整
- **器材逾期**:結束日之隔天**上班日**(排除政府行事曆假日)10:30 前未歸還即逾期;可觸發停權
- **節次制**:場地借用用 14 節次(第 1–10 節、A–D 節);`PERIOD_TIMES` 權威來源是舊 clubclass,單一實作在 `services/booking_service.py`,隨 `/auth/me` 下發給前端
- **申請時間禁過去**(前後端皆驗);行政手動借用不受限,供補登使用

## 技術

前端 Vite + React + TS + Ant Design 6 + TanStack Query + pnpm;後端 FastAPI + Python 3.14 + uv + SQLAlchemy 2(async)+ Alembic + PostgreSQL 18;Docker Compose 部署於 GCE。無特殊理由一律用最新穩定版。細節見 `docs/architecture.md`。

三條 UI 硬規則(其餘見 `docs/design-guide.md`):**全站禁用 emoji**,圖示一律 AntD SVG icon;**UI 文字精簡**,說明收進 Tooltip/Popover;**內容寬由 shell 統一約束**,頁面不得自設 maxWidth。

## 開發慣例

**分支**:開發推 `dev`,穩定後才合併 `main`(避免草稿觸發 main 的 CI 映像發佈)。

**指令**

```bash
# 後端(backend/)
CLUB_AIO_TEST_DB=<name> timeout 900 uv run pytest -q   # 平行 worktree 各用一庫
uv run ruff check .
uv run python scripts/reset_db.py --yes                # 清空 → head → 基礎 seed + superadmin
uv run python scripts/seed_mock.py --yes               # reset 後灌全模組 mock(兩者在 ENV=prod 會拒絕執行)
uv run python scripts/import_holidays.py --year 115    # 政府行事曆假日(加 --yes 才寫入)
uv run python scripts/set_passwords.py --all --password 'Demo@12345' --no-change-required --yes
                                                       # 批次改密;不加 --yes 只預覽,ENV=prod 拒絕執行

# 前端(frontend/)
pnpm exec tsc -b        # --noEmit 是空檢查,不要用
pnpm test               # vitest
pnpm run lint
```

**後端**

- 業務推導集中在 `services/`,不儲存推導值(可借數、逾期、鎖定、行政分)
- 簽核一律寫 `approval_records`;高風險操作 `audit.record`(add 不 commit,隨交易)
- 事件推 Discord:`notify.club_event` 只推社團自設的 webhook;`notify.discord` 走 `.env` 的 `DISCORD_WEBHOOK_URL`(無社團的系統事件與 infra 告警)
- 歷史型列表一律分頁 + 排序白名單(主檔與選項端點全量回傳);錯誤用 `core/errors` 工廠
- 側欄徽章由 `services/badges.py` 一支端點供給(鍵=前端 nav item key),行政端依權限鍵過濾;申請審核算的是**簽得下去**的關卡(`actionable_statuses`),與待審佇列同一集合
- 測試:`tests/conftest.py` 於 import app 前切測試庫;factories(`make_club`/`make_user`)、`csrf_headers()`;每測試 TRUNCATE;`asyncio_default_*_loop_scope=session`(連線池綁 loop)。測試庫是 `create_all` 建的,遷移鏈另由 `tests/test_migrations.py` 在獨立庫跑 `upgrade head` 並比對欄位

**前端**

- `src/api/{domain}.ts` 為接線範本(見 `api/members.ts` + `MembersPage`)
- 元件與互動慣例一律照 `docs/design-guide.md` §6,不要自刻替代品
- 測試環境是全域 jsdom(`vite.config.ts` + `src/test/setup.ts` 補 `matchMedia`/`ResizeObserver`);
  元件測試用 `@testing-library/react` 的 `render`/`screen`/`fireEvent`,`cleanup` 已在 setup 掛好
- 節次目錄(節次軸與起訖時刻)只有後端一份,前端經 `lib/periods.ts` 的 `usePeriods()` 取用;
  節次「順序規則」在 `lib/periods.periodRank`(純轉換函式拿不到 hook,只需要順序);
  **晚間節次集合與最少連續節數仍是前後端各一份**(`booking_service.LATE_PERIODS` / `FixedRoomPage.LATE`);
  `VenueCategory` 同樣兩份(`models/enums.py` / `api/adminVenues.ts`,後端是 PG enum,新增值另需 revision)

**修 issues.md 的條目時**

- **一項一個 commit**,修完該項就從 `docs/issues.md` 刪掉那一列,並同步 `docs/spec/` 對應頁的「未完成 / 問題」段(修好的敘述要改成正面規則,不是只刪掉)
- **每一項都要 mutation 驗證**:把修法改回舊寫法,確認新測試真的會紅
- 交叉審查的提示詞必須明確要求兩件事:**找漏掉的同類呼叫點**、**找這批新引入的問題**

**反覆踩到的坑**(逐批審查累積,每一條都真的出過事)

- **同一份判定有幾份要數到底**:前後端各一份、多頁各一份都算。改了一處就 grep 全端,commit message 寫「全部」之前先數一次
- **拿不到值不要用預設值頂替**:`?? 0`、`'00:00'` 這種會說謊 —— 查詢失敗與「真的是 0」對使用者是兩件事,全站慣例是 `—`
- **`isError` 有兩種**:`isLoadingError`(首載失敗、手上沒資料)才換錯誤畫面;`isRefetchError` 換掉的是已知事實。`enabled:false` 的查詢恆為 `isPending`,而且不會清掉先前的 error
- **「看得到」與「動得了」是兩個判定**:一個旗標兼差兩用,不是多擋就是少擋
- **加鎖會改變鎖序**:加任何列鎖前先確認同一組表在別處的取用順序,否則換來 deadlock
- **一頁修完要問「另一端有沒有同一份判定」**:社團端與行政端、前端必填與後端 fail-open,常常只修了一半
- **輸出 schema 不要沿用輸入的限制**:`*Out` 繼承 `*In` 會把「使用者能送什麼」變成「庫裡准許存在什麼」。舊系統遷入或規則收緊前存下的列一讀就 500,使用者什麼都沒做錯卻連看都看不到(實測 60 個活動打不開)
- **測不出來就別假裝測得出來**:小表的回傳順序由 planner 決定,那種斷言只能當契約標記

**平行開發**

- 多 agent 平行時**絕不可 `git stash`**;pytest 必包 timeout;各 worktree 設自己的 `CLUB_AIO_TEST_DB`

## Roadmap

- **首頁改導覽頁**:展示所有社團、圖片、介紹,右上角登入鈕進 dashboard。現行 `/` 是社團總覽(未登入才轉 `/login`),沒有免登入的入口
- Telegram Bot 通知(低優先)
