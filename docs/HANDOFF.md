# Session Handoff(2026-07-16,第九輪:需求方全批回饋落地 + 前後端全面接線)

> 給下一個 session 的交接快照。永久性專案知識在三層 `AGENTS.md`(OSA 根/project/club-aio)與 `docs/architecture.md`、`docs/data-model.md`、`docs/design-guide.md`;本檔只記「現在進行到哪、接下來做什麼」。過期即刪。

## 本輪已完成(約 45 個 commit,決議全文見 AGENTS.md「第九輪」段)

### 前端 UI(需求方 2026-07-16 第九輪清單全數)

需求方本人 33 檔文案精簡+改名已原樣分組 commit。其餘:PageHeader 等高(minHeight 40);全站分頁統一 `Pager`(simple 置中、可輸入跳頁、一頁也顯示);`.click-tint` hover 全站一致;排序僅 icon 變色(收斂到 SortButton);上傳統一 `lib/uploads.ts`+`AttachmentArea`(SHA-256 去重、容量標示、HEIC/HEIF 全開,報修 TODO 用它修掉);送出紅框機制(errors Set,結案整頁/工作分配/借用時段/上傳區/報名建立)+自籌擬請皆 0 自動實支 0;成員身份標準值 負責人/副負責人/幹部/社員 + 依社團名末字推導社長/會長,**社團名稱強制社/會結尾**;SignupBuilder 拖曳改 pointer 即時重排;公告 popup 蓋板開關+刪除;admin 社團總覽 popup 重用 ActivityReviewModal/BookingReviewModal(待審可直接核准/退回);admin 管理項目 unsaved guard;檔案管理報修專屬區塊;TagListInput 改 AntD 官方可編輯標籤。

### 後端(pytest 173 passed、ruff 全綠;dev 庫已 upgrade 至 `b8d5e3f61a24`)

- 四支可逆 migration:signup year 廢除(ad7/8 改場次日期落在評鑑視窗推導)、member_kind 四值、club_members.semester 快照(UNIQUE 含 semester)、activity_reports 繳交確認三欄
- admin routers 補齊:`/admin/clubs`(主檔/改名(驗社/會結尾)/啟停/一次性密碼/成員唯讀)、`/admin/venue-bookings`、`/admin/equipment-loans`(status=overdue 推導、可借數排除本單)、`/admin/room-bookings`、`/admin/bookings/availability`、`/admin/venues`、逾期提醒+停權、公告蓋板 PATCH、維修狀態單步流轉、場次 CRUD(負責人會議逐場簽到)
- 結案審核繳交確認落庫,未確認項 ad2–4 以 0 分計;aclose 帳號可讀審核列表;eval 上傳跨 session 去重;`UserOut.club_name`;幹部證明改 kind×semester 比對
- **DB 指令**:`uv run python scripts/reset_db.py --yes`(還原初始:基礎主檔+superadmin 一次性密碼);`uv run python scripts/seed_mock.py --yes`(全模組 mock,deterministic)

### 前端接線(全部完成,mock 已退場;範本=`api/members.ts`+MembersPage)

- auth:session cookie、`/auth/me` 開機恢復、首登強制改密 `/change-password`、staff/viewer → `/coming-soon`
- club 端 12 頁 + admin 端 15 頁全接真 API(慣例見 AGENTS.md「接線慣例」);唯一例外:**EvalResultPage 仍 mock(待需求方規格)**
- 側欄:固定借用開放窗與 admin 待審徽章皆由 query 驅動(`buildClubNav`/`buildAdminNav`)

### 測試防鎖死(重要)

- 多 agent 併跑曾把共用 `club_aio_test` 鎖死(TRUNCATE 互鎖+殭屍連線)。已根治:conftest 開跑先 `pg_terminate_backend` 清殘留、測試庫設 lock/statement/idle timeout、pytest-timeout 每測試 30s 上限
- **跑測試務必包 timeout**(如 `timeout 240 uv run pytest -q`),且不要同時開兩個 pytest
- **前端 `pnpm exec tsc --noEmit` 是空檢查**(根 tsconfig 為 solution-style):必須用 `pnpm exec tsc -b`(`pnpm build` 內含)

## 驗證現況

- 後端:`pytest -q` **173 passed**(~60s)、ruff 全綠、alembic up/down/up 驗證過
- 前端:`tsc -b` 0 錯、vitest 35 passed、build 綠、oxlint 僅既有 3 個 fast-refresh 警告
- seed_mock 後 API smoke 通過(登入/檔案下載/審核視野/eval overview);**尚未做瀏覽器實測**

## 下一輪待辦(Task #6 驗證與審查,本輪未執行)

1. **E2E 實跑**:`seed_mock --yes` → `uv run uvicorn app.main:app --reload --port 8000`(127.0.0.1,OrbStack 佔 localhost:8000)+ `pnpm dev`(localhost:5173)→ 實際過主流程:club 登入→活動申請(附件)→admin 三關簽核→結案(照片)→結案審核(繳交確認)→評鑑分數;借用三種+審核;報名(草稿/送出/確認/逐場簽到);公告蓋板;成員 CSV;帳號管理一次性密碼
2. **交叉審查**:本輪特例 Fable:codex ≈ 2:1(codex 慣例:`codex e -m gpt-5.6-sol -c 'model_reasoning_effort="xhigh"' --dangerously-bypass-approvals-and-sandbox "..." </dev/null`);審本輪全部 commit(`git log ee23a1c..HEAD`)
3. **資安**:bandit + 資安審查(auth/上傳/CSRF/權限邊界/一次性密碼流);前端已知點:檔案 URL 走 session cookie 保護
4. **無障礙/一致性 sweep**:鍵盤、讀屏語意(無 thead 表格)、對比、Modal 聚焦;風格一致性(loading/error 態各頁做法)
5. mock 帳密(seed_mock 印出):`super`/Super@12345、`admin_lee`(areview/aclose/asignup)、`admin_chen`(abooking/aroom/amaint/aviol/amember)、`dean`(approve_dean)皆 Admin@12345;`staff_lee`/Staff@12345、`viewer01`/Viewer@12345;14 社團帳號皆 Club@12345(csie_club 資料最豐)

## 已知 gap / 待需求方(下一輪處理或提問)

- **郵局局號帳號改為恆必填**(接線時對齊後端);原「新開戶時隱藏」條件已移除——待需求方確認
- 報名列表「未開始」項顯示為「已截止」(DTO 未帶 signup_start,小修)
- is_eval 競賽報名:builder 無法建立、無獎項勾選 UI(不可達,待評鑑報名功能定案)
- `GET /admin/eval/clubs` 逐社全量重算(社團數大時效能債);admin activities 前端 fetchAll(資料成長需後端排序/分頁)
- 幹部證明無 admin 端點(社團總覽線上申請區不列);評審「負責獎項/分組」佔位 —(評審指派未做);檔案頁 50GB 上限為前端常數;送件時間以 created_at 近似
- 器材審核彈窗在社團總覽開啟時不顯示固定借用衝突標示(專屬審核頁有)
- 沿前輪待裁決:成員學期快照已做(定案);郵局代理人電話仍遮罩;固定借用 10 節=「本單+審核中」合計解讀;大型活動篩選解讀;AdminRoomsPage 退回彈窗聚焦差異
- Roadmap:staff/viewer panel、首頁導覽頁、EvalResultPage 規格、Email MJML 模板

## 環境與慣例提醒

- 本機 DB `docker compose up -d db`;dev 庫=`b8d5e3f61a24` + seed_mock 資料
- **多 agent 平行作業絕不可 `git stash`**(本輪兩次事故,均已復原)
- Vite 8 只綁 IPv6(`localhost:5173`);後端一律 `127.0.0.1:8000`
- 確認彈窗一律 `lib/confirm.ts` 的 `confirmDialog`;Modal 一律 open+afterClose 常駐;前端不顯示單號(稽核除外)
- Commit 英文、一行為一 commit、禁元描述;文件/回覆繁中;UI 禁 emoji
