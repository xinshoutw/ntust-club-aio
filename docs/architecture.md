# club-aio 系統架構

- 硬性限制:2026-09 舊系統退役前上線;功能至少涵蓋 ClubManagementSystem 與 clubclass
- 版本策略:無特殊理由一律用最新穩定版,優先挑支援週期長的

## 1. 形態

單一 FastAPI 服務 + React SPA,同網域部署。校內系統登入後才操作,無 SEO/首屏需求,不做 SSR;同網域讓認證走 HttpOnly cookie,不必處理 CORS 與 token 輪替。

## 2. 前端

| 項目 | 選定 |
|------|------|
| 框架 | Vite + React + TypeScript |
| UI | Ant Design 6(`zh_TW` locale) |
| 伺服器狀態 | TanStack Query(客戶端狀態用 React 內建,不引狀態庫) |
| 表單 | AntD Form(`Form.List` 處理經費明細等動態列) |
| 路由 | React Router(library 模式) |
| 套件管理 | pnpm |
| 測試 | vitest(`pnpm test`) |
| 檔案預覽 | mammoth + dompurify |

- 目錄依 feature/domain 切分;不做 i18n,寫死繁中
- AntD v6 與 v5 有 breaking changes,元件 API 一律查 v6 官方文件,不憑印象寫
- 視覺與互動規範見 `design-guide.md`

### 2.1 API 層

`src/api/{domain}.ts` 一個領域一檔,集中信封解包(`client.ts`)、snake↔camel、日期 ISO↔`YYYY/MM/DD`、query keys、mutation 後的 invalidate;分頁走 `apiPaged`。型別手寫,不做 codegen。範本:`api/members.ts` + `MembersPage`。

## 3. 後端

Python 3.14 + uv + FastAPI + uvicorn;SQLAlchemy 2(async)+ Alembic;PostgreSQL 18(`postgres:18-alpine`)。分層 `core / models / schemas / api/v1 / services`,業務推導集中在 services。

Python 3.14 lazy annotation:欄位名與型別同名時型別須別名(`import datetime as dt` → `Mapped[dt.date | None]`)。寫 `date` 會被 `|` 解析成 SQLAlchemy 的 SQL OR,欄位靜默變 NOT NULL、pydantic 直接 TypeError。

### 3.1 認證

- 行政建立帳號;argon2id;首次登入強制改密。`users.auth_provider` 保留 `sso` 值,前端不顯示
- Session 存 PostgreSQL:行政需要「立即停權」,DB session 天生可撤銷。cookie `session_id`(HttpOnly、SameSite=Lax、prod 加 Secure),7 天滑動效期(剩餘低於 6 天 23 小時才回寫,避免每請求 UPDATE),允許多裝置並行
- 密碼政策:≥10 碼含大小寫 + 數字 + 特殊符號、3 代不重用、連錯 5 次鎖 15 分
- 學務長本人操作簽核:開受限權限的 admin 帳號,僅持簽核權限鍵

### 3.2 檔案

- 容器內路徑 `/srv/uploads`(compose 現用具名 volume `uploads`;是否改 bind mount 以便備份工具直接同步,見 DEPLOY_CHECKLIST 待決 3),佈局 `{模組}/{年}/{月}/{uuid}`;DB 存中介資料
- 一律經帶權限檢查的 API 存取,不裸 serve(競賽資料與結案附件有社團隔離與評審匿名邊界)
- 上傳串流寫盤(1MB chunk,VM 僅 4GB RAM),邊寫邊算 sha256 與檢查上限;副檔名 × 魔術位元組須一致,client 宣稱的 MIME 一律不信
- 單檔上限依類型(文件 50 / 圖片 10 / 壓縮檔 100 / 維修影片 200 MB),加總上限依申請性質(活動申請附件 15、空間報修 100、結案照片 10 MB),皆在 `system_settings`。**例外**:郵局存簿與評鑑上傳為固定 50MB,後台調不到;評鑑上傳只收 pdf/doc/docx/jpg/png/zip。成果與宣傳影片不收檔,填外部連結
- 配額:單一社團未歸檔檔案 2 GiB;系統總量讀實體磁碟可用空間(`shutil.disk_usage`),不足即回 507 擋下上傳。使用率 ≥80% 警示、**≥90% 關閉上傳前置閘**(`files.ensure_upload_gate_open`,掛在 nginx `auth_request` 子請求上,暫存檔不落地);擴容須人介入
- 落盤與 DB 列同生共死:交易沒 commit 就結束時,該次寫入的檔案一併從磁碟刪除;刪檔則一律等 commit 成功後才動磁碟,失敗只留孤兒檔
- 生命週期:競賽採計中的檔案保留在系統;其餘由行政備份下載後自系統刪除,`files.archived_at` 標記,再下載回 410。月份佈局讓歸檔以整月目錄為單位打包搬走

### 3.3 通知

- Discord webhook:社團事件與公告只推該社團自設的 webhook(未設即不推);`.env` 的 `DISCORD_WEBHOOK_URL` 走無社團的系統事件與 infra 告警,不入版控;暫時性失敗做記憶體重試(3 次,429 照 `Retry-After`)、不落地佇列表;訊息清冊見 `discord-webhook-messages.md`
- Email:aiosmtplib + `BackgroundTasks`,SMTP 參數全走 `.env` 不綁供應商;host/username/password 任一為空即降級 log-only。寄送結果寫 `email_logs`
- 目前只有兩個寄信點:勾了「通知」的公告、器材歸還提醒。其餘事件只推 Discord;重設密碼是當場回傳一次性密碼,不寄信

### 3.4 不引入任務佇列

逾期、結案鎖定、器材可借數一律於查詢時推導,不排程改狀態,故不需要 Celery/Redis/scheduler。
唯一的行程內迴圈是 Uptime Kuma 心跳(`lifespan` 起停,30 秒一次,只在 `ENV=prod`)——push monitor 的間隔小於 cron 的最小粒度。業務排程一律走 host cron。**心跳假設單 worker**:加 uvicorn worker 時每個行程各推一份,卡住的那個不會讓 monitor 翻紅。

### 3.5 併發鎖

「先查再寫」一律以 `pg_advisory_xact_lock` 序列化,命名空間登錄表見 [data-model.md](data-model.md) §3.10。需要列鎖時順序固定「列鎖 → advisory lock」;users 與 sessions 一律 users 先(登入、重設密碼、停權皆同),反序會死鎖。

## 4. API 契約

REST JSON,前綴 `/api/v1`。回應信封:

```json
{ "success": true,  "data": …,    "error": null, "meta": null }
{ "success": false, "data": null, "error": "使用者可讀訊息", "meta": { "code": "機器碼" } }
```

`error` 一律繁中、面向使用者、不含內部細節;未攔截例外回 500 通用訊息,細節只進 log(engine 開 `hide_parameters`,繫結參數不進 log)。`meta.code` 是機器可讀錯誤碼;前端 `client.ts` 目前只取 `error` 字串拋出、不讀 code(首登改密的導轉走 `user.mustChangePassword`),要依錯誤分流時再於該層取用。

| HTTP | code | 情境 |
|------|------|------|
| 400 | `BAD_REQUEST` | 一般請求錯誤 |
| 401 | `UNAUTHENTICATED` | 未登入/session 過期/帳密錯誤 |
| 403 | `FORBIDDEN` | 無權限 |
| 403 | `CSRF_FAILED` | CSRF 驗證失敗 |
| 403 | `PASSWORD_CHANGE_REQUIRED` | 首登未改密(僅放行改密/登出/me) |
| 403 | `ACCOUNT_LOCKED` | 連錯 5 次鎖 15 分 |
| 403 | `CLUB_SUSPENDED` | 社團停權中,借用申請被擋 |
| 404 | `NOT_FOUND` | 資源不存在或不屬於該社團(不區分,避免探測) |
| 409 | `CONFLICT` | 狀態衝突(重複報名、重複時段) |
| 409 | `SLOT_TAKEN` | 時段已被借走 |
| 409 | `SLOT_BLOCKED` | 時段落在場地不開放規則 |
| 409 | `SLOT_LIMIT` | 固定借用超過每社節數上限 |
| 409 | `WINDOW_CLOSED` | 不在開放窗/報名窗內 |
| 409 | `INVALID_STATUS_TRANSITION` | 單據狀態不允許此操作 |
| 409 | `RESOLVE_EXPIRED` | 違規勸導已過銷案期限 |
| 409 | `DUPLICATE_FILE` | 相同 sha256 的檔案已存在 |
| 410 | `FILE_ARCHIVED` | 檔案已歸檔並自磁碟刪除 |
| 413 | `FILE_TOO_LARGE` | 超過上傳上限 |
| 415 | `UNSUPPORTED_FILE_TYPE` | 魔術位元組驗證失敗 |
| 422 | `VALIDATION` | Pydantic 驗證失敗(`meta.detail` 附明細) |
| 422 | `PASSWORD_POLICY` / `PASSWORD_REUSED` / `PASSWORD_MISMATCH` | 密碼政策 |
| 422 | `INVALID_SORT` | 排序欄位不在白名單 |
| 429 | `RATE_LIMITED` | 超過速率限制 |
| 500 | `INTERNAL` | 未預期錯誤(訊息固定,不洩漏) |
| 507 | `INSUFFICIENT_STORAGE` | 社團配額或實體磁碟空間不足 |

- **分頁**:`?page=1&page_size=20`(1-based,page_size 上限 100),回應 `meta = { page, page_size, total }`。歷史型列表一律分頁;主檔與選項端點為全量回傳
- **排序**:`?sort=field` 升冪、`-field` 降冪,逗號分隔多鍵;欄位採各端點白名單,未知欄位 422;非唯一排序鍵一律補 id tiebreak
- **CSRF**:登入時發 `csrf_token` cookie(非 HttpOnly,double-submit 綁 session 列);除 `/auth/login`(此時尚無 session)外,所有寫入請求須帶 `X-CSRF-Token`,前端 `client.ts` 自動附帶

## 5. Repo 結構

```
club-aio/
├── compose.yml                 # db + backend + web
├── backend/
│   ├── app/{core,models,schemas,api/v1,services,assets}
│   ├── alembic/  scripts/  tests/
├── frontend/src/{api,app,features,components,lib,assets}
├── migration/                  # 舊系統資料遷移 scripts
└── docs/
```

開發只起資料庫(`docker compose up -d db`),前端 `pnpm dev`(Vite 代理 `/api`)、後端 `uvicorn --reload` 跑本機;位址統一 IPv4(`127.0.0.1:5173` / `:8000`),不直連 API、不開 CORS。正式環境 `docker compose up -d` 起全部。

## 6. 部署

### 6.1 拓撲

```
Internet ──▶ [既有 edge proxy VM]  nginx:443
             TLS 終結(certbot)· 台灣 IP 白名單 · 緊急封鎖 map · 安全標頭
                    │  VPC 內網 proxy_pass
                    ▼
             [club-aio VM  e2-medium]  docker compose
                ├─ web      nginx:80 — 靜態檔(React build)+ 反代 /api
                ├─ backend  uvicorn(FastAPI)
                └─ db       postgres:18-alpine(volume 持久化)
```

前後端與 DB 同機:單校規模成本優先,且切換與回滾只是 edge 改 upstream 指向,秒級可逆;要加大只需停機換 machine type,架構零改動。app VM 不公開暴露(防火牆僅允許 edge 內網來源 + IAP SSH)。

4GB 記憶體**預算**(規劃值,非現行設定):PostgreSQL(shared_buffers 512MB)~1.2GB、uvicorn ×2 workers ~0.6GB、nginx + OS + Docker ~0.6GB,餘 ~1.5GB 另配 2GB swap。目前 compose 未調 `shared_buffers`、backend 也只起單一 worker,上線前依實測決定是否加。**映像不在 VM 上 build**。

### 6.2 備份

- 每日 `pg_dump`(自訂格式)+ 14 天輪替,**存放於同一環境**(`scripts/backup_db.sh`;decisions.md OPS-01 明定不做異地備份)
- 上傳目錄不在腳本範圍,而且**目前沒有任何備份機制**:compose 沒有備份服務,GCE 那條路徑只靠磁碟快照兜底,自架站台則完全沒有(DEPLOY_CHECKLIST A 段列為阻擋)
- 部署前手動加跑一次 dump

單機即單點故障,校內系統可接受短暫維護窗口,但資料不可失。

### 6.3 CI/CD

GitHub Actions:backend job 跑 `ruff check` + `pytest`(起 postgres service),frontend job 跑 `pnpm run lint` → `tsc -b --force` → vitest → `pnpm build`。`main` 分支推送時 build 前後端映像 → push GHCR(校方就緒後改 Artifact Registry,只換位址與認證)。部署以 `gcloud compute ssh` 執行 `docker compose pull && up -d`;backend 容器啟動時自動 `alembic upgrade head`(單 instance 無競態)。

### 6.4 內層安全

- 稽核軌跡需要真實 IP:edge → web → backend 逐層傳遞 `X-Forwarded-For`,uvicorn 開 `--proxy-headers`,信任範圍由 `FORWARDED_ALLOW_IPS`(compose 子網 + edge IP)界定
- 登入端點在 web 層加 `limit_req`(edge 只有地理白名單,沒有速率限制)
- SPA 的 CSP(`script-src 'self'`)在 web 層補;edge 已有基本安全標頭
- DB 與 backend 僅在 compose 內網互通,不映射對外 port

### 6.5 上線切換(edge proxy 端)

切換 = 改 `clubs.ntust.edu.tw` 的 vhost,回滾 = 改回舊值:

1. upstream 指到 `<新 VM 內網 IP>:8080` —— edge 現行 upstream 沒寫埠號(預設 80),漏掉會 502;app VM 的 `.env` 同時要設 `WEB_BIND=<app VM 內網 IP>`,否則 web 容器只聽 loopback
2. 該 vhost 的 `client_max_body_size` 從全域 3072M 收斂為 `256m`(內層最大的那個上傳端點就是這個值;其餘上傳端點在內層各自收到 64m)
3. 該 vhost 加 `proxy_request_buffering off`,上傳串流直通不在 edge 暫存整包
4. proxy header 改覆寫式:`proxy_set_header X-Forwarded-For $remote_addr;` 並補 `X-Forwarded-Proto $scheme`(現行 `$proxy_add_x_forwarded_for` 會保留客戶端偽造的 XFF,且沒送 XFP)
5. `.env` 設 `FORWARDED_ALLOW_IPS=172.28.0.0/24,<edge VM 內網 IP>`。**絕不可用 `*`**:XFF 最左值客戶端可控,限流會被繞過、稽核 IP 會被投毒;漏設 edge IP 則所有人 IP 塌縮成 edge IP
6. `clubclass.ntust.edu.tw` 屆時再決定是否 307 導向

## 7. 資料遷移

`migration/` 下的一次性 idempotent scripts,讀舊系統 dump 寫入新 schema,可重複執行以便切換前多次演練:`cms_import.py`(ClubManagementSystem)、`cc_import.py`(clubclass 教室與器材借用)。遷移範圍與對映見 `migration/README.md`。全帳號重發一次性密碼(輸出 `migration/out/*.csv`,不入版控)+ 首登強制改密。

## 8. 測試

- 後端 pytest + httpx,主力放 API 整合測試(申請 → 審核 → 結案全流程);獨立測試庫,`CLUB_AIO_TEST_DB` 可覆寫庫名以支援平行 worktree
- 前端 vitest(工具與純函式為主)
- 覆蓋率目標依全域規範 80%
- **E2E 必須打 web 容器的 `:8080`**:上傳大小上限、登入限流、`auth_request` 前置認證、CSP 與檔案 framing 標頭全在 nginx 層,直接打 backend 的 `:8000` 會整組繞過


