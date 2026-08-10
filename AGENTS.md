# club-aio — 新版社團管理系統(All-in-One)

全新開發的臺科大社團管理系統,**2026 年 9 月前上線**,取代兩套退役舊系統:

- `../../legacy/ClubManagementSystem`(Django,clubs.ntust.edu.tw)
- `../../legacy/clubclass`(PHP,教室與器材借用)

**新系統功能必須至少涵蓋兩套舊系統的全部功能**。舊系統僅作功能對照與資料遷移參考,架構設計**完全不參考**。

## 開工前先讀

1. **`docs/HANDOFF.md`** — 現在進行到哪、接下來做什麼。本檔只記永久知識,不記進度
2. **`docs/review-2026-07-25.html`** — 全面 code review 報告,119 項 findings 尚未修

## 文件分工

| 文件 | 內容 |
|------|------|
| `docs/社團管理系統_優化原型_v6.html` | **唯一需求規格**(學校負責人提供;檔內 title 寫 v4,以檔名 v6 為準) |
| `docs/architecture.md` | 系統架構、API 契約、部署 |
| `docs/data-model.md` | 資料表、狀態機、行政分規則、system_settings |
| `docs/design-guide.md` | 視覺與互動規範、全站元件慣例 |
| `docs/discord-webhook-messages.md` | 通知訊息清冊 |
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
| 社團評鑑 | 資料總覽、評鑑結果 |
| 其他 | 違規勸導紀錄 |

退回是活動列表上的狀態,不另設「退回列表」頁。

**評審端**:我負責的評分、評分(依獎項)、已完成評分

**工讀生端**:違規勸導填寫、違規紀錄查詢、器材借出點交、器材歸還點交、逾期追蹤

**行政端**:總覽、活動申請審核、結案審核、報名管理、發布公告、臨時場地器材借用審核、教室固定借用審核、成員管理、帳號管理(管理員/社團/工讀生/評審)、社團空間維修管理、違規勸導管理、待審申請彙整、檔案管理;**最高權限專屬**:教室器材主檔與手動借用、場地不開放規則、逾期追蹤與停權管理、系統設定、稽核軌跡

尚未實作:分組與評審指派、競賽資料完成度、社團活動統計、競賽成績總表(審查報告 GAP-01/GAP-03)

## 核心業務規則

- **學期起訖**:上學期 8–1 月、下學期 2–7 月(原型的推導函式寫反,勿照抄);實作在 `core/semesters.py`
- **活動簽核**:有申請補助 → 三關(承辦人 → 組長 → 學務長);無補助 → 承辦人單關即核准。第一關認定經費來源與逐項核定金額;退回必填原因;學務長為本人操作(受限權限帳號,僅簽核權)。顯示詞為「承辦人」,程式鍵維持 `advisor`/`approve_advisor`/`pending_advisor`
- **結案**:承辦人單關;活動結束日 +1 個月未結案即鎖定(推導,管理員可解鎖);結案通過才計入競賽行政分
- **競賽五獎項**:最佳社團(行政 40% + 營運 60% 加權)/財務/活動/成果發表/負責人;財務、活動、負責人含現場簡報 20 分;行政資料 ad1–ad8 系統自動評分 + 人工調整
- **器材逾期**:結束日之隔天**上班日**(排除政府行事曆假日)10:30 前未歸還即逾期;可觸發停權
- **節次制**:場地借用用 14 節次(第 1–10 節、A–D 節);`PERIOD_TIMES` 權威來源是舊 clubclass
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
uv run python scripts/seed_mock.py --yes               # reset 後灌全模組 mock

# 前端(frontend/)
pnpm exec tsc -b        # --noEmit 是空檢查,不要用
pnpm test               # vitest
pnpm run lint
```

**後端**

- 業務推導集中在 `services/`,不儲存推導值(可借數、逾期、鎖定、行政分)
- 簽核一律寫 `approval_records`;高風險操作 `audit.record`(add 不 commit,隨交易)
- 事件推 Discord:`notify.club_event` = 全域 webhook + 社團自設各一份
- 列表一律分頁 + 排序白名單;錯誤用 `core/errors` 工廠
- 測試:`tests/conftest.py` 於 import app 前切測試庫;factories(`make_club`/`make_user`)、`csrf_headers()`;每測試 TRUNCATE;`asyncio_default_*_loop_scope=session`(連線池綁 loop)

**前端**

- `src/api/{domain}.ts` 為接線範本(見 `api/members.ts` + `MembersPage`)
- 元件與互動慣例一律照 `docs/design-guide.md` §6,不要自刻替代品
- `PERIOD_TIMES` 前後端各一份(`booking_service.py` / `api/bookings.ts`),改動須同步

**平行開發**

- 多 agent 平行時**絕不可 `git stash`**;pytest 必包 timeout;各 worktree 設自己的 `CLUB_AIO_TEST_DB`

## Roadmap

- **首頁改導覽頁**:展示所有社團、圖片、介紹,右上角登入鈕進 dashboard。現行 `/` 直接是登入頁為過渡做法
- Telegram Bot 通知(低優先)
