# Session Handoff(2026-07-17,Task #6:驗證與審查修正落地)

> 給下一個 session 的交接快照。永久性專案知識在三層 `AGENTS.md` 與 `docs/architecture.md`、`docs/data-model.md`、`docs/design-guide.md`;本檔只記「現在進行到哪、接下來做什麼」。過期即刪。

## 本輪已完成(Task #6:18 個 commit,`44406f0..HEAD`)

第九輪交接列的 Task #6 待辦(E2E、交叉審查、資安、無障礙 sweep)已全數執行。Codex 第一輪唯讀審查的分級與證據見 `docs/TASK6_REVIEW_HANDOFF.md`(仍保留供對照);本輪把其中已確認的 finding 全部修掉並補測試。

### 資安(4 finding,均已修 + 測試)

- **SEC-01(Medium 越權)**`fix(admin): scope aclose-only accounts`:`aclose` 不再等於全視野;`_FULL_VIEW_KEYS=("aact","areview")`,aclose 沿用結案狀態集合。加 negative test:aclose-only 帳號 list/detail 看不到申請中/退回件。
- **SEC-02(Medium 可用性)**`fix(web): scope request body limits per route class`:nginx 全域 body 上限 256m→1m,login 8k,僅五個上傳白名單保留 256m;422 detail 剝除 input/url。
- **SEC-03(Medium 磁碟耗盡)**`feat(files): enforce storage quotas` + `feat(admin): manage storage limits` + `perf(files): hold quota lock only for final accounting`:`save_upload()` 共用配額收口(pg advisory xact lock 只覆蓋串流後結算、預檢+逐塊 best-effort、reserve hard stop、flush 失敗刪 dest);`system_settings.storage_limits`(40/2/10 GiB,super 可調);`/admin/files/usage` 回 capacity/remaining,前端廢除 50GB 常數。
- **SEC-04(Low)**`feat(web): validate session before reading upload bodies`:nginx `auth_request` → `GET /auth/precheck`(無 body 驗 session/CSRF/首登)先於讀 body;`fix(web): auth_request subrequest tolerate large bodies`(E2E 於 8080 發現的 500 bug:precheck 子請求須給 256m,否則 >1m body 讓子請求 413→auth_request 轉 500)。

### 功能/權限

- **FUNC-01** `fix(files): allow same-origin framing for inline PDF`:SPA CSP `frame-src 'self'`;僅授權 inline PDF 回應放寬 `X-Frame-Options SAMEORIGIN`/`frame-ancestors 'self'`,其餘 API 維持 DENY/none。
- **FUNC-02** `fix(auth): re-send session cookies on sliding renewal`:DB 續期時重送 session/CSRF cookies(共用 `core.deps.set_auth_cookies`),否則瀏覽器 cookie 仍在原登入第七天消失。
- **FUNC-04** `fix(eval): enforce upload dedup with partial unique index`:`files` 加 `(club_id,slot,sha256) WHERE active eval_upload` partial unique index(migration `a9c2e51d7f43`),先查後寫的併發競態由 DB 收口;活動照片沿用既有 `uq_files_club_report_photo_sha`,兩者互補無漏。
- **AUTHZ-UI-01** `feat(admin): gate admin UI by permission keys` + `feat(admin): club option endpoint readable by any admin`:`lib/permissions.ts` 路由↔權限鍵對照,側欄/首頁卡/header 依 permissions 過濾 + 共用 route gate;`GET /admin/clubs/options`(僅 id/name/attribute,任何 admin 可讀)取代 amember-gated 主檔給跨頁選擇器。
- **FUNC-03** `fix(ui): surface query failures instead of empty states`:共用 `QueryError`(訊息 + refetch 重試);~25 頁的列表/詳情 query 失敗改顯示錯誤而非空表/找不到/永久 spinner;`useAvailabilityDays` 補 `isError/refetchErrored`。

### 無障礙

- **A11Y-01/02** `fix(a11y): keyboard entry for clickable table rows` + `column headers and empty-row colSpans`:可點列名稱欄改真 `<button className="row-open-btn">`(tr 不加 role/tabIndex),`.click-tint` 補 focus ring;缺 thead 的表補 `<th scope="col">` + `aria-label`,空/錯誤列 colSpan 對齊。
- **A11Y-03** `fix(a11y): takeover announcement uses a real modal dialog`:`TakeoverOverlay` 改用 AntD `Modal`(焦點管理內建),保留 5 秒規則(條件 closable)、`mask={{closable:false}}`、`keyboard={false}`。
- **A11Y-04** `fix(a11y): raise information-bearing muted text to steel`:承載資訊的 `--muted` 改 `--steel`;disabled/裝飾維持 muted。
- **A11Y-05** `fix(a11y): keyboard reordering for signup builder fields`:拖曳把手改可聚焦 button,方向鍵上/下移(重用 reorder 邏輯)。

## 驗證現況(全綠)

- 後端:`timeout 240 uv run pytest -q` **187 passed**(~86s)、`ruff check .` 全綠、alembic up/down/up 於 dev 庫驗證過
- 前端:`pnpm exec tsc -b` 0 錯、`pnpm test` 35 passed、`pnpm lint` 僅 6 個既有 fast-refresh warning、`pnpm build` 綠(chunk size 與 DOMPurify 既有 warning)
- Bandit:0 High / 0 Medium / 10 Low(均為既有 dev secret/固定 seed 密碼/固定 argv subprocess/enum string 誤報,無新增)
- **HTTP E2E(8000 功能層)**:22 項全過(public/未登入 401/錯 CSRF 403、權限矩陣 restricted admin 403、club options 開放、eval overview、precheck 403/204)
- **部署層 E2E(8080 compose 全棧)**:login 8k→413、一般 JSON 1m→413、小 body 到後端、未登入上傳各尺寸→401、SPA CSP `frame-src 'self'`、nosniff、API `X-Frame-Options DENY`、login rate limit→429 皆驗過;`nginx -t` 通過
- security-audit 產物:`/Users/xinshou/security-audit-skill/club-aio/run-1/`{`findings.json`(validator PASS,4 finding=3 medium/1 low)、`REPORT.md`、`FINDINGS-DETAIL.md`}
- 交叉審查:opus ×2(資安修正 + findings 產物)判「可合入」;opus 提的兩個 Medium——(1) 活動照片去重併發**經查為誤報**(既有 `uq_files_club_report_photo_sha` 已收口,opus 只看到新的 eval index)、(2) 上傳鎖持有窗過長**已修**(`perf(files)` commit)

## 已跑驗證的環境狀態

- dev 庫 `club_aio` 已 `alembic upgrade head`(= `a9c2e51d7f43`)+ `seed_mock` 資料(deterministic)
- **compose 全棧目前仍在 8080 運行**(`club-aio-{db,backend,web}-1`);不需要時 `docker compose down`(保留 db:`docker compose stop backend web`)。web/backend 映像已 build 為 `:local`
- 本機開發位址仍 IPv4:前端 `127.0.0.1:5173`、後端 `127.0.0.1:8000`

## 下一輪待辦 / 待需求方

- `docs/TASK6_REVIEW_HANDOFF.md` §6 的可延後 debt 尚未做:`<Spin>`→Skeleton 集中替換、非狀態 error 誤用 `#B03A2E`→`#C13B34` 機械取代、`AdminRoomsPage` 道歉文案與 `OneTimePasswordModal` 驚嘆號、`seed_mock --yes` 補 `ENV=dev` guard、`c7e...` migration downgrade 資料損失語意、inner nginx 信任網段收窄
- EvalResultPage 仍刻意 mock(待需求方規格);staff/viewer panel、首頁導覽頁、Email MJML 模板未動
- 上線切換清單(edge proxy,`architecture.md` §6.5)於 2026-09 執行;GCE Persistent Disk 擴容仍屬基礎設施操作(面板只調邏輯容量)

## 環境與慣例提醒

- **多 agent 平行作業絕不可 `git stash`**;跑測試務必包 timeout 且不同時開兩個 pytest
- 前端 `pnpm exec tsc --noEmit` 是空檢查(solution-style tsconfig),必須 `pnpm exec tsc -b`
- 確認彈窗一律 `lib/confirm.ts`;Modal 一律 open+afterClose 常駐;前端不顯示單號(稽核除外);Commit 英文一行為一 commit、禁元描述;UI 禁 emoji
