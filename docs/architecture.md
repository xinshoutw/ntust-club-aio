# club-aio 系統架構建議

- 日期:2026-07-13(v2,納入部署環境與版本定案)
- 狀態:**待確認**
- 已定案:前端 Vite + React + TS、後端 FastAPI、Docker Compose、git 版控、部署於 Google Compute Engine
- 硬性限制:2026-09 舊系統退役前上線
- 功能要求:**至少涵蓋 ClubManagementSystem 與 clubclass 的全部既有功能**(舊系統僅作功能對照與資料遷移參考,架構設計完全不參考)
- 版本策略:無特殊理由一律採用最新穩定版,並優先挑支援週期長的版本

## 1. 整體形態:單體後端 + SPA

**選定:單一 FastAPI 服務 + React SPA,同網域部署。**

原因:

- 校內系統,登入後才能操作,無 SEO 需求 → 不需要 SSR
- 單校規模 → 單體最省維護成本
- 同網域部署可用 HttpOnly cookie 認證,免去 CORS 與 token 管理的複雜度

| 替代方案 | 不選原因 |
|----------|----------|
| Next.js / Remix(SSR 全端) | 已定案 Vite + React;內部系統用不到 SSR 的首屏/SEO 優勢,反而多一層運行時 |
| 微服務 | 單校規模,只有成本沒有收益 |
| 沿用 Django | 已定案 FastAPI |

## 2. 前端

### 2.1 UI 元件庫:Ant Design 6(目前 6.5.x)

**選定:Ant Design 6,搭配 `zh_TW` locale。**

原因:本系統是典型的中文行政後台——大量表格(審核列表、社員列表)、複雜表單(活動申請的動態經費明細列)、日期時段選擇(教室借用)、檔案上傳(競賽資料、結案附件)、步驟進度(申請進度)。這些 AntD 全部內建,繁中在地化成熟。9 月死線下,元件生產力是第一優先。

UI 設計規範(需求方指定):**全面禁用 emoji**,圖示一律用 AntD 的 SVG icon 或符號;**避免 UI 上堆疊過多文字說明**,輔助說明收進 Tooltip/Popover,不佔版面。

實作注意:v6 與 v5 有 breaking changes,元件 API 一律以 v6 官方文件為準(用 Context7 查,不憑印象寫)。

| 替代方案 | 不選原因 |
|----------|----------|
| shadcn/ui + Tailwind | 客製彈性最高,但表格、動態表單、上傳、日期時段等重型元件要自行拼裝,數週額外工時 |
| MUI | 進階 DataGrid 在付費的 MUI X Pro;中文行政系統慣用度不如 AntD |

### 2.2 資料抓取與狀態:TanStack Query

**選定:TanStack Query 管理所有伺服器狀態;客戶端狀態先用 React 內建,不引入狀態庫。**

原因:本系統 95% 的狀態是伺服器資料,Query 的快取、重新驗證、樂觀更新直接解決;登入者資訊也是一筆 query。

| 替代方案 | 不選原因 |
|----------|----------|
| Redux Toolkit | 樣板碼多;沒有複雜的跨元件客戶端狀態,核心價值用不到 |
| Zustand 起手就裝 | YAGNI,日後真有需求再加一行依賴 |
| 手寫 fetch + useEffect | 快取、競態、重試全要自己重造 |

### 2.3 表單:Ant Design Form

**選定:AntD 內建 Form(`Form.List` 處理經費明細等動態列)。** 與 AntD 輸入元件天生整合,一套表單系統就夠。

| 替代方案 | 不選原因 |
|----------|----------|
| React Hook Form + Zod | 與 AntD 並用會有兩套重疊的表單狀態系統,整合要寫膠水碼 |

### 2.4 路由:React Router

**選定:React Router(library 模式)。** 標準、文件與社群資源最多。

| 替代方案 | 不選原因 |
|----------|----------|
| TanStack Router | 型別安全佳但生態較新;本專案路由結構單純,用不到優勢 |

### 2.5 其他前端決策

| 項目 | 選定 | 理由 |
|------|------|------|
| 套件管理 | pnpm | 快、省磁碟,與全域慣例一致 |
| 目錄組織 | 依 feature/domain | 遵循 coding-style 規範 |
| i18n | 不做,寫死繁中 | 單校內部系統,YAGNI |

## 3. 後端

### 3.1 執行環境:Python 3.14 + uv + FastAPI + uvicorn

**選定:Python 3.14**(官方支援至 2030-10,避免短期內被迫升版)、套件管理 **uv**、ASGI server **uvicorn**。

實作注意:鎖定相依套件皆有 3.14 wheel(pydantic-core、asyncpg 等主流套件已支援);若遇個別套件未跟上,個案評估替代,不整體降版。

### 3.2 ORM 與遷移:SQLAlchemy 2.0 + Alembic

**選定:SQLAlchemy 2.0(async)+ Alembic。** 長壽校務系統,schema 遷移管理是必需品;SQLAlchemy 2 是 Python ORM 事實標準。

| 替代方案 | 不選原因 |
|----------|----------|
| SQLModel | SQLAlchemy 薄包裝,複雜查詢(審核統計、完成度彙總)仍要回落 SQLAlchemy,文件要查兩份 |
| 裸 SQL | 20+ 張表的遷移與模型維護成本不划算 |

### 3.3 資料庫:PostgreSQL 18

**選定:PostgreSQL 18(`postgres:18-alpine`,支援至 2030-11)。**

原因:舊系統同為 PostgreSQL,遷移同引擎最省事;JSONB 適合彈性欄位(評分表結構);`pg_dump` 備份鏈成熟。

| 替代方案 | 不選原因 |
|----------|----------|
| Cloud SQL(託管 PG) | 每月多 US$10–30+,對「降低成本」目標背道而馳;自架 + 備份紀律已足夠 |
| SQLite | 線上備份與並發寫入較弱,且與舊資料不同引擎 |

### 3.4 認證:本地帳號 + SSO 預留

**選定(已與需求方確認):行政建立帳號的獨立驗證系統為主;SSO 僅做機制預留,前端不顯示。**

設計:

- `users.auth_provider` 欄位(enum:`local`,預留 `sso`),`password_hash` 可為 NULL(SSO 帳號用)
- 密碼雜湊用 argon2id;行政發放初始密碼,首次登入強制改密;密碼重設走 email
- Session:HttpOnly cookie(SameSite=Lax),session 存 PostgreSQL——行政系統需要「立即停權」,DB session 天生可撤銷
- 登入端點模組化:`/api/v1/auth/login`(local);SSO 路由預留於獨立 router,feature flag 關閉
- **學務長本人操作簽核**:開受限權限的 admin 帳號,僅持學務長簽核權限鍵(permissions),看不到其他管理功能(見 data-model)

| 替代方案 | 不選原因 |
|----------|----------|
| JWT | 單體同網域系統用 JWT 反而要處理撤銷與 refresh 輪替,複雜度高於收益 |
| Redis session | 多一個服務;單校流量 PG 綽綽有餘 |

### 3.5 檔案儲存:本機 volume + DB 中介資料

**選定:上傳檔存 bind mount(`/srv/club-aio/uploads`),依 `{模組}/{年}/{月}/{uuid}` 佈局(**月份分類**,沿用舊系統歸檔習慣),DB 存中介資料,一律經帶權限檢查的 API 端點存取。**

原因:競賽資料、結案附件有權限邊界(社團隔離、評審匿名),不能裸 serve;bind mount 方便備份工具直接同步。

**檔案生命週期(依承辦實務)**:檔案不會永久留在系統上——

- **競賽採計中的檔案**:保留在系統(評鑑週期結束前不動)
- **非競賽期間/未採計的檔案**:定期由行政備份(複製下載)後**自系統刪除**;`files` 表保留中介資料並標記 `archived_at`,查詢時顯示「已歸檔」而非壞連結

月份佈局讓歸檔作業以「整個月份目錄」為單位打包搬走,不需逐檔挑選。

注意:edge proxy 目前 `client_max_body_size 3072M`(舊系統允許超大上傳)。新系統上傳一律**串流寫盤**(不整檔進記憶體,VM 只有 4GB RAM)。

上傳上限(建議定案):

| 類型 | 上限 | 依據 |
|------|------|------|
| 文件(PDF/Office) | 50 MB/檔 | 掃描 PDF(需求方定) |
| 圖片 | 10 MB/檔 | 手機原圖足夠 |
| 壓縮檔(照片打包) | 100 MB/檔 | 原型結案照片以 zip 繳交 |
| 維修佐證影片 | 200 MB/檔 | 手機短片;唯一需要收影片檔的模組 |
| 成果/宣傳影片 | **不收檔,填外部連結** | 原型本來就用 YouTube 連結欄位;影片進系統只會吃爆磁碟與備份 |

內層 nginx `client_max_body_size 256M` 即可;磁碟從 50GB 起,滿 70% 告警再擴(GCE 磁碟可線上擴容)。

| 替代方案 | 不選原因 |
|----------|----------|
| GCS 物件儲存 | 多雲端費用與依賴;上傳/下載已收斂在單一 service,日後要搬只改一處 |

### 3.6 Email 通知(已確認需要)

**選定:aiosmtplib + FastAPI `BackgroundTasks`,SMTP 參數全走 `.env`,不綁任何供應商。** 最終 relay 未定,先用開發者的 iCloud+ 自訂網域信箱,之後只換環境變數:

```dotenv
SMTP_HOST=smtp.mail.me.com
SMTP_PORT=587
SMTP_SECURITY=starttls        # starttls | ssl | none
SMTP_USERNAME=me@xinshou.tw
SMTP_PASSWORD=***             # 秘密,只存 .env,不進 git
MAIL_FROM_ADDRESS=me@xinshou.tw
MAIL_FROM_NAME=noreply
```

用途:審核結果通知(核准/退回)、密碼重設、逾期結案/歸還提醒。信件模板存後端;寄送結果寫 `email_logs` 留底。

| 替代方案 | 不選原因 |
|----------|----------|
| Celery + broker 寄信 | 寄信量低(審核事件驅動),BackgroundTasks 足夠;不值得兩個新服務 |
| 第三方 API(SendGrid 等) | 綁供應商 SDK;SMTP 協定層抽象讓校方 relay/任何服務都能無痛切換 |

### 3.7 背景工作:不引入任務佇列

「逾期未結案鎖定」在查詢時由截止日即時推導(`deadline < now` 即鎖定),不排程改狀態;「逾期提醒信」等真正的定時需求用程序內 APScheduler(單一 instance,無分散式問題)。不裝 Celery/Redis。

## 4. API 契約與前後端型別同步

- REST JSON,前綴 `/api/v1`;統一回應信封 `{ success, data, error, meta }`
- 後端 Pydantic schema 是唯一真相 → OpenAPI → **openapi-typescript** 產前端型別(零執行期依賴),配薄 fetch 包裝接 TanStack Query

### 4.1 回應與錯誤慣例(2026-07-14 定案,後端已實作)

**信封**(對齊 `frontend/src/api/client.ts`):

```json
{ "success": true,  "data": …,    "error": null, "meta": null }
{ "success": false, "data": null, "error": "使用者可讀訊息", "meta": { "code": "機器碼" } }
```

- `error` 一律繁中、面向使用者、不含內部細節;未攔截例外回 500 + 通用訊息(細節只進 log)
- `meta.code` 為機器可讀錯誤碼,前端據此分流(如導向改密頁)

**錯誤碼表**:

| HTTP | code | 情境 |
|------|------|------|
| 400 | `BAD_REQUEST` | 一般請求錯誤 |
| 401 | `UNAUTHENTICATED` | 未登入/session 過期/帳密錯誤 |
| 403 | `FORBIDDEN` | 無權限 |
| 403 | `CSRF_FAILED` | CSRF 驗證失敗 |
| 403 | `PASSWORD_CHANGE_REQUIRED` | 首登未改密(僅放行改密/登出/me) |
| 403 | `ACCOUNT_LOCKED` | 連錯 5 次鎖 15 分 |
| 404 | `NOT_FOUND` | 資源不存在或不屬於該社團(不區分,避免探測) |
| 409 | `CONFLICT` | 狀態衝突(重複報名、重複時段…) |
| 413 | `FILE_TOO_LARGE` | 超過該類型上傳上限 |
| 415 | `UNSUPPORTED_FILE_TYPE` | 魔術位元組驗證失敗 |
| 422 | `VALIDATION` | Pydantic 驗證失敗(`meta.detail` 附明細) |
| 422 | `PASSWORD_POLICY` / `PASSWORD_REUSED` / `PASSWORD_MISMATCH` | 密碼政策 |
| 422 | `INVALID_SORT` | 排序欄位不在白名單 |
| 429 | `RATE_LIMITED` | 超過速率限制 |
| 500 | `INTERNAL` | 未預期錯誤(訊息固定,不洩漏) |
| 507 | `INSUFFICIENT_STORAGE` | 儲存配額不足(社團/全系統)或磁碟保留空間不足(2026-07-17) |

**分頁**:`?page=1&page_size=20`(1-based;page_size 上限 100);回應 `meta = { page, page_size, total }`。列表端點一律分頁,不做無界查詢。

**排序**:`?sort=field` 升冪、`?sort=-field` 降冪;欄位採各端點白名單,未知欄位回 422 `INVALID_SORT`;各端點自訂預設排序(通常 `-created_at`)。

**CSRF**:登入時發 `csrf_token` cookie(非 HttpOnly,double-submit 綁 session 列);所有 POST/PUT/PATCH/DELETE 必須帶 `X-CSRF-Token` header,前端 `client.ts` 自動附帶。

**認證 cookie**:`session_id`(HttpOnly、SameSite=Lax、prod 加 Secure);7 天滑動效期(剩餘低於 6 天 23 小時才回寫,避免每請求 UPDATE)。

| 替代方案 | 不選原因 |
|----------|----------|
| 手寫前端型別 | 必然漂移,審核流程欄位多,漂移成本高 |
| orval / hey-api 全代碼生成 | 綁定較深;只產型別最輕 |

## 5. Repo 結構(monorepo,單一 git repo,remote 先放個人 GitHub)

```
club-aio/
├── compose.yml                 # 新規範命名;db + backend + web
├── backend/
│   ├── pyproject.toml          # uv
│   ├── alembic/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/               # 設定、DB session、安全、依賴注入
│   │   ├── models/  schemas/
│   │   ├── api/                # 路由,依領域分檔
│   │   ├── services/           # 業務邏輯(含資料存取邊界)
│   │   └── emails/             # 信件模板與寄送
│   └── tests/
├── frontend/
│   └── src/
│       ├── api/                # openapi-typescript 產物 + fetch 包裝
│       ├── features/           # 依領域分資料夾
│       ├── components/ui/  hooks/  lib/  styles/
│       └── main.tsx
├── migration/                  # 一次性舊資料遷移 scripts(9 月切換用)
└── docs/
```

開發流程只需一份 `compose.yml`:開發時 `docker compose up -d db`(只起資料庫),前端 `pnpm dev`(Vite proxy `/api`)、後端 `uvicorn --reload` 在本機跑;正式環境 `docker compose up -d` 起全部。

領域模組(前後端同一套切分):`auth`、`clubs`、`activities`、`closures`、`bookings`、`facilities`、`certificates`、`postal`、`awards`、`announcements`、`audit`

## 6. 部署:GCE 單台 e2-medium(前後端 + DB 同機)

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

**同一台 e2-medium 放前後端(含 DB)是正確選擇**,理由:

1. 「前端」在此架構裡只是 nginx 掛的靜態檔案,本來就沒有需要獨立機器的前端運行時;真正的取捨是 DB 是否同機——單校規模 + 成本優先,同機合理
2. edge proxy 已負責 TLS、地理白名單、封鎖開關,app VM 專心跑應用,不需公開暴露(防火牆僅允許 edge 的內網來源 + IAP SSH)
3. 切換與回滾極簡:上線 = edge 把 `clubs.ntust.edu.tw` 的 upstream 從舊 VM 改指到新 VM 內網 IP;出事改回去,秒級回滾
4. 垂直升級路徑無痛:停機 → 改 machine type(e2-standard-2)→ 開機,幾分鐘,架構零改動

記憶體預算(4GB):

| 項目 | 估計 |
|------|------|
| PostgreSQL 18(shared_buffers 512MB) | ~0.8–1.2 GB |
| uvicorn ×2 workers | ~0.4–0.6 GB |
| nginx + OS + Docker | ~0.6 GB |
| 餘裕 | ~1.5 GB(另配 2GB swap 當 OOM 保險) |

CPU:e2-medium 為共享核心(基準約 1 vCPU、可突發 2),CRUD 型負載足夠。**映像建置不在 VM 上做**(見 6.3),避免吃光資源。

風險與對策:單機 = 單點故障,校內系統可接受短暫維護窗口,但**資料不可失**——見 6.2 備份。

### 6.2 備份(不可省)

- 每日 `pg_dump | gzip` → GCS bucket(lifecycle 保留 30 天),費用以分計
- 每日 `uploads/` 增量同步 → GCS
- GCE 磁碟快照排程(每週)作全機保險
- 部署前手動加跑一次 dump
- **檔案歸檔**(見 §3.5):行政定期將非競賽採計的月份目錄備份下載後自系統刪除,系統標記 `archived_at`;此為釋放磁碟的常規作業,與上述災難備份分開

### 6.3 CI/CD 與映像

- Repo:個人 GitHub → GitHub Actions:lint/test → build 前後端映像 → push **GHCR**(之後校方就緒改推 **Artifact Registry**,只改 registry 位址與認證)
- 部署:`gcloud compute ssh` 執行 `docker compose pull && docker compose up -d`;backend 容器啟動時自動 `alembic upgrade head`(單 instance 無競態)
- VM 上永不 build(2 共享 vCPU + 4GB 不適合跑 vite build)

### 6.5 上線切換清單(edge proxy 端,2026-09 執行)

切換 = 在 edge 改 `clubs.ntust.edu.tw` 的 vhost;回滾 = 改回舊值。需要動的地方:

1. upstream 指到 **`<新 VM 內網 IP>:8080`**——edge 現行 upstream 沒寫埠號(預設 80),漏掉埠號會 502
2. 該 vhost 的 `client_max_body_size` 從全域 3072M 收斂為 **256m**(與內層一致,避免 edge 被塞超大請求)
3. 該 vhost 加 **`proxy_request_buffering off`**(上傳串流直通,不在 edge 暫存整包)
4. proxy header 改為**覆寫式**:`proxy_set_header X-Forwarded-For $remote_addr;` 並補 `proxy_set_header X-Forwarded-Proto $scheme;`(edge 現行用 `$proxy_add_x_forwarded_for` 會保留客戶端偽造的 XFF,且沒送 XFP)
5. `.env` 設 `FORWARDED_ALLOW_IPS=172.28.0.0/24,<edge VM 內網 IP>`:backend 由右往左跳過信任跳點取真實 client IP;漏設 edge IP 會讓所有人的 IP 塌縮成 edge IP(限流變全域)。**絕不可用 `*`**(XFF 最左值客戶端可控,限流可被繞過、稽核 IP 可被投毒)
5. `clubclass.ntust.edu.tw` 屆時再決定是否 307 導向

### 6.4 安全細節(內層)

- 稽核軌跡需要真實 IP:信任鏈 edge → web → backend 逐層傳遞 `X-Forwarded-For`,uvicorn 設 `--proxy-headers` 且僅信任 web 容器來源
- 登入端點在 web 層加 `limit_req`(防爆破;edge 只有地理白名單沒有速率限制)
- 安全標頭:edge 已加基本組;SPA 的 CSP(`script-src 'self'`)在 web 層補
- DB 與 backend 僅在 compose 內網互通,不映射對外 port

## 7. 資料遷移(範圍已確認)

只遷移**低變動主檔**,歷史流程資料不搬:

1. 社團基本資料(簡介、指導老師)
2. 社團成員名單
3. 固定設施主檔(教室/器材等不會變動的基礎資料)

作法:`migration/` 下寫一次性 Python scripts,讀舊系統 DB dump → 寫入新 schema,可重複執行(idempotent)以便切換前多次演練。申請/結案/借用等歷史單據留在舊系統封存,不進新系統。

## 8. 測試策略(摘要)

- 後端:pytest + httpx,主力放 API 整合測試(申請 → 審核 → 結案全流程)
- 前端:Vitest + React Testing Library(工具與關鍵元件)
- E2E:Playwright,覆蓋各角色關鍵流程
- 覆蓋率目標依全域規範 80%

## 9. 決議紀錄與未決事項

已決議(2026-07-13):

1. **上線網域**:復用 `clubs.ntust.edu.tw`;`clubclass.ntust.edu.tw` 目前無規劃,系統完成後可考慮 307 導向
2. **上傳政策**:採 §3.5 建議表
3. **遷移資料**:由承辦提供舊 DB dump,格式與新 schema 不同,於 `migration/` 寫客製 scripts 轉換
4. **edge proxy VM**:開發者有修改權限,上線切換自行操作
5. **SMTP**:最終 relay 未定,先用開發者 iCloud+ 信箱,設定全走 `.env` 保持可換(§3.6)

已決議(2026-07-13 補充):

6. **檔案生命週期**:月份佈局 + 歸檔即刪(§3.5);文件上限 50MB
7. **學期起訖**:上學期 8–1 月、下學期 2–7 月(原型的推導寫反了);規則進系統設定
8. **學務長**:本人操作,開受限權限帳號(僅簽核權)
9. **設定分層**:恆不變的進 `.env`;會變或可能變的進 `system_settings` 讓管理員即時調整
10. **UI 規範**:全面禁用 emoji(以 AntD SVG icon/符號代替);UI 文字精簡,說明收進 Tooltip
11. **個資遮罩**:郵局帳號、電話等於列表與一般檢視一律遮罩,僅審核詳情頁顯示完整

未決:

1. 最終 SMTP relay(校方 relay / Google Workspace / 第三方)
