# Task #6 驗證與審查交接（2026-07-17）

> 本文件是唯讀審查結果與後續實作交接。審查者依使用者指示已停止修正；截至建立本文件前，程式碼、migration 與 `docs/HANDOFF.md` 均未修改。

## 1. 範圍與最新決策

- 審查範圍：`ee23a1c..44406f0`，實際為 **45 commits、155 files**（不是 47 commits；`origin/dev..HEAD` 才是 47）。
- 任務仍限定 `docs/HANDOFF.md` 的 Task #6：E2E、完整 changeset 交叉審查、Bandit／資安、無障礙／風格 sweep；不開其他新功能。
- 使用者確認系統總容量約為 **40-50 GiB**。
- 容量／配額門檻要放入現有最高權限管理員的「系統設定」面板，沿用 `system_settings`，不要另造設定系統。
- 我先前建議但使用者未另改數值：每社團 2 GiB、檔案系統保留 10 GiB；使用者說「將你提到的設定都放進管理員設定面板」，可先按此解讀，但實作前應再核對一次文字與單位。
- 管理面板只能調整應用程式的邏輯容量／配額，**不能代替 GCE Persistent Disk 擴容**；實體磁碟擴容後再調高邏輯容量。
- `EvalResultPage` 仍是已知、刻意保留的 mock；本輪不接 API。

## 2. 目前狀態與已跑驗證

建立本文件前：

- branch：`dev`，相對 `origin/dev` ahead 47。
- working tree：乾淨。
- `git fsck --full --no-dangling`：乾淨（審查中已補回標準 empty-tree object；沒有 tracked code 變更）。
- migration：dev DB 已在 `b8d5e3f61a24 (head)`，且是 `seed_mock` 資料。
- 2026-07-17 再確認：`GET http://127.0.0.1:8000/api/v1/health` 為 200；`http://127.0.0.1:5173/` 為 200。

已執行：

| 檢查 | 結果 |
|---|---|
| `timeout 240 uv run pytest -q` | 173 passed，51.83s；只跑一支 pytest |
| `uv run ruff check .` | passed |
| `pnpm exec tsc -b` | passed |
| `pnpm test` | 35 passed |
| `pnpm lint` | exit 0；6 個 fast-refresh warnings |
| `pnpm build` | passed；有 chunk size 與 DOMPurify import warnings |
| Bandit | 0 High、0 Medium、10 Low；Low 均為誤報或 dev/operator hardening |

Bandit 指令與暫存產物：

```bash
uvx bandit -r backend/app backend/scripts \
  -x backend/tests,backend/alembic \
  -f json \
  -o /Users/xinshou/security-audit-skill/club-aio/run-1/bandit.json
```

資安審查的外部暫存架構文件在：

```text
/Users/xinshou/security-audit-skill/club-aio/run-1/architecture.md
```

`REPORT.md`、`FINDINGS-DETAIL.md`、`findings.json` 尚未完成，不能宣稱 security-audit 流程已正式結案。

前端 lint 新增 warnings 位於：

- `frontend/src/contexts/auth.tsx:63`
- `frontend/src/features/admin/clubContext.tsx:44`
- `frontend/src/components/tableControls.tsx:14`

另三個為既有 warning（`unsaved.tsx` 兩個、`OneTimePasswordModal.tsx` 一個）。Build 另提示 DOMPurify 同時 static/dynamic import，dynamic import 無法拆 chunk；main JS、CSS、mammoth chunks 偏大。這些不是阻擋性安全問題。

## 3. 已確認資安 finding

### SEC-01（Medium）`aclose` 可讀超出職權的活動申請與附件

主要位置：

- `backend/app/api/v1/admin_activities.py:44-45`
- `backend/app/api/v1/admin_activities.py:70-86`
- `backend/app/api/v1/admin_activities.py:142,178`
- `backend/app/services/files.py:237-251`

根因：

```python
_REVIEW_PAGE_KEYS = ("aact", "areview", "aclose")

if user.is_super or any(k in user.permissions for k in _REVIEW_PAGE_KEYS):
    return None
```

`aclose` 被先視為「全部狀態不限」，使下方原本針對 `aclose` 的 closing／approved／closed 狀態集合永遠走不到。僅持 `aclose` 的管理員因此能列出所有非草稿活動，且可按已知 ID 直接讀取包含 draft 在內的任意活動申請；回應包含預算、審批、結案資料與附件 UUID，generic admin 檔案下載又允許 admin 讀檔，形成實際機密性越權。

建議根修：

- 只有 super／`aact`／`areview` 回 `None`。
- `aclose` 沿用現有但不可達的狀態集合。
- 加 negative tests：`aclose`-only 帳號的 list/detail 不得看到申請中或已退回等非結案範圍資料；可看到 closing／approved／closed。

### SEC-02（Medium）API 256 MiB JSON 可在驗證前造成 OOM

主要位置：

- `frontend/nginx.conf:35-36,49-60`
- `backend/app/schemas/auth.py:6-8`
- `backend/app/main.py:89-95`（validation handler）
- 安裝中的 FastAPI 0.139 `routing.py:417-480`
- 安裝中的 Starlette `requests.py:254-265`

已獨立驗證的資料流：

1. nginx server 全域 `client_max_body_size 256m`。
2. FastAPI 先 `await request.body()`、`request.json()`，才執行 dependency／Pydantic 驗證。
3. `Request.body()` 收集 chunks 後再 `b''.join`；JSON decode 再建立 Python 物件。
4. Pydantic 長度限制與應用層 login limiter 都發生在完整 body 進記憶體之後。
5. validation handler 回傳 `exc.errors()`，可能再次帶出巨型輸入。

這不只影響 login。`location /api` 沒有 login 限流且 `proxy_request_buffering off`；未登入者也可對任何有 JSON body 的受保護端點送近 256 MiB body，FastAPI 解析後才回 401／422。

正式 VM 文件只有約 1.5 GB RAM 餘裕；少量並發可造成 swap thrash／backend 或同機 DB 被 OOM kill。此 finding 為 availability，評 Medium，不列 High。

建議根修：

- nginx 對 login 設 8 KiB 等小上限。
- 一般 JSON API 設約 1 MiB（先盤點實際最大 JSON，留合理裕度）。
- 只有明確 upload routes 保留其必要上限，避免全 `/api` 都繼承 256 MiB。
- validation error 回應不要回傳完整 `input`，作 defense-in-depth。
- nginx body cap 是部署層 trust-boundary，不應放進 `system_settings`（nginx 不會讀 DB，也不應讓 UI 即時改安全邊界）。

### SEC-03（Medium）缺少社團／全域儲存配額，可填滿 GCE 磁碟

最快路徑：

- `POST /api/v1/club/maintenance`
- `backend/app/api/v1/applications.py:198-251`
- `backend/app/services/files.py:138-234`
- `backend/app/models/files.py:17-24`

可利用方式：

- 有效 club session + CSRF 即可建立不限數量的 maintenance requests。
- 每單可放 5 個影片，每檔目前最高 200 MiB。
- 建 6 單後，在既有 30 uploads/min/user 限速內，理論上約 6,000 MiB/min（約 5.86 GiB/min）。
- 沒有 per-club、global、filesystem free-space hard stop。現行前端顯示常數是 50 GiB，舊 architecture 寫的是 50GB 實體磁碟，兩者都不是 server-side 限制；按使用者最新 40 GiB 邏輯容量計算，若仍未實作 hard stop，理論約 6.8 分鐘即可寫滿該額度，實際物理填滿時間取決於 GCE 磁碟位元組數、既有用量與上行頻寬。

其他同根端點：

- activity photos：10 MiB/檔，無 count／aggregate cap，需 approved activity。
- eval uploads：50 MiB/檔，無 count／aggregate cap。
- postal passbook：10 MiB/檔，申請與檔案數量均可持續增加。
- activity proposal attachments 是唯一已有 per-activity 50 MiB aggregate cap 的路徑。

相鄰 orphan race：

- `save_upload()` 在 `tmp.rename(dest)` 後才 `db.flush()`。
- 並發相同 report photo 時，loser 會撞 DB unique index；transaction 回滾但已 rename 的實體檔不會刪除。
- orphan 不存在 DB，管理員 usage／UI 無法看見或清理。
- 此競態不另列主要漏洞，但會放大磁碟耗盡與維運難度。

設定方向：沿用現有 `system_settings`，建議單一 JSON key，避免三個散落 key：

```json
{
  "storage_limits": {
    "capacity_gib": 40,
    "per_club_gib": 2,
    "reserve_gib": 10
  }
}
```

其中 `capacity_gib=40` 是使用者明確決策；另兩個數值是先前建議，實作前請再覆核。建議最高權限管理員可在既有 `AdminSettingsPage` 編輯；`AdminFilesPage` 不再保留前端 `CAPACITY_MB = 50 * 1024` 常數，改從 `/admin/files/usage` 取得後端計算的容量與剩餘量。

server-side 實作邊界：

- quota 必須在共享 `save_upload()` 收口，不能逐 endpoint 補。
- 不可等 `.part` 完整寫完才檢查；FastAPI 已把 multipart spool 到 `/tmp`，若 `save_upload()` 再無條件複製一份，quota guard 前就可能雙重佔用磁碟。
- 最小方案可在共享服務取得 Starlette 已計算的 `UploadFile.size`（無值時以 policy max 作保守 preflight），先取得 PostgreSQL transaction advisory lock，再檢查全域／club quota 與 `shutil.disk_usage(upload_dir)` reserve，通過後才建立 `.part`。小系統可接受全域序列化 upload；若實測吞吐不夠再改 reservation table，不要先建新表。
- copy 每個 chunk 時仍要檢查實際累積大小與 filesystem free-space hard stop，不能只信宣告 size。lock 必須持有到 File row flush／caller transaction 完成，避免兩個請求同時看見相同剩餘量。
- quota 統計至少排除 `archived_at IS NOT NULL`；全域容量是否包含 `pg_database_size` 要與檔案管理頁一致。因使用者稱「系統可用容量」，建議 UI 顯示／邏輯容量包含 DB，實際 free-space reserve 再防 DB、log、temp 等非 files table 用量。
- `db.flush()` 或 duplicate race 失敗時刪除已 rename 的 dest。
- parser 階段的 `/tmp` 仍必須由 SEC-04 的 pre-body auth、連線限制與受限 temp volume 處理；`save_upload()` 的 quota 不能保護 handler 執行前已寫入的 temp file。
- GCE Persistent Disk 擴容仍由基礎設施操作；面板需提示「先擴實體磁碟，再調邏輯容量」。

容量單位須明確區分：`capacity_gib=40` 是應用程式的邏輯可用容量；`reserve_gib=10` 是實際 filesystem 必須額外保留的空間；舊文件「50GB」與前端 `50 * 1024 MB` 不可再當成同一數字。若兩個建議值同時採用，實體磁碟還要容納 OS、Docker、DB、log 與 multipart temp，因此不得假設 50 GiB 實體磁碟就足夠；部署時以 `df`／GCE 實際容量驗證。

必要測試：

- 單一 club 超過 per-club cap → 拒絕且不留 `.part`／dest／DB row。
- 全域使用量超過 capacity → 拒絕。
- filesystem free space低於 reserve → 拒絕（mock stdlib 查詢即可）。
- archived files 不占 active quota。
- 並發 upload 不得一起穿透剩餘額度。
- duplicate flush conflict 不留 orphan。
- 設定 API 的 validation、GET/PUT、audit、預設值。
- Admin Files usage 回傳／顯示 40 GiB，不再使用 50 GB 常數。

### SEC-04（Low）multipart 在 session／CSRF 驗證前寫入暫存檔

主要位置：

- FastAPI 0.139 `routing.py:417-480`
- Starlette `formparsers.py:146-188,225-297`
- 例如 `backend/app/api/v1/applications.py:216-220`

FastAPI 對 `UploadFile` route 先 `request.form()`，之後才 solve dependencies。Starlette 超過 1 MiB 即 spool 至 backend `/tmp`。因此未登入者也能對 protected upload route 傳大型 multipart；session／CSRF 尚未驗證，temp file 已寫入。

限制／定級：檔案只在 request 存活期間存在，需持續頻寬與並發，且 edge 有地理限制，因此 Low。

修補注意：只縮小合法 upload route 的 body cap不能關閉此問題；最大合法影片仍是 200 MiB。需要在讀 body 前驗證 protected upload request，例如：

- nginx `auth_request` 到不讀 body 的驗證端點；或
- 精簡 ASGI middleware 對明確 protected upload paths 先驗 session／CSRF，再把原 receive 傳下去。

選擇前須完整盤點所有 `UploadFile` routes，避免 path allowlist 漏列；可再輔以 upload `limit_conn`／`limit_req`、短 `client_body_timeout` 與受限 temp volume。不要把 router dependency 誤當 pre-body guard。

## 4. 已確認功能／權限問題

### FUNC-01 PDF 預覽在正式回應會被禁止嵌入

- `frontend/src/features/eval/FilePreview.tsx:119-126` 使用 iframe 直接載入 `/api/v1/files/{id}`。
- `frontend/nginx.conf:40` 設 `frame-src 'none'`。
- `backend/app/main.py:29-35` 對所有 API 回應設 `X-Frame-Options: DENY` 與 `frame-ancestors 'none'`。

下載仍可用，但 inline PDF iframe 一定被瀏覽器擋。Mock data 不能證明真實預覽可用。

建議：SPA CSP 改為只允許 `frame-src 'self'`；僅對授權成功的 inline PDF file response 使用 `X-Frame-Options: SAMEORIGIN`、`frame-ancestors 'self'`，其他 API 仍維持 DENY／none。加 header tests，不能全域放寬 framing。

### FUNC-02 DB session 是滑動效期，但 cookie 是固定七天

- `backend/app/core/deps.py:55-57` 會延長 `Session.expires_at`。
- `backend/app/api/v1/auth.py:30-53` 只在 login 設 cookie `Max-Age=7d`。

瀏覽器 cookie 仍在原登入後第七天消失，因此「七天滑動效期」實際不成立。建議續期 DB 時同步重送 session 與 CSRF cookies；共用既有 `_set_auth_cookies`，不要複製 cookie 參數。測試要固定時間並檢查 `Set-Cookie`。

### AUTHZ-UI-01 管理員前端忽略 permissions，部分獨立權限又無法使用

- `frontend/src/lib/nav.tsx:118+` 的 `buildAdminNav()` 不收 user／permissions，所有 admin 看到所有項目。
- `frontend/src/App.tsx:137-174` 只做 admin role gate，沒有 per-route permission gate。
- `AdminHomePage` 會對所有模組發 query；無權限常被顯示成 `—`，卡片仍可點。
- Header 內 super-only Settings／Audit 入口也對一般 admin 可見。
- `frontend/src/features/admin/clubContext.tsx:20` 對所有 admin 啟動 `useAdminClubs()`；現有 `/admin/clubs` 要求 `amember`。

結果：受限 admin 看到大量 403 頁；更嚴重的是 `aannounce`、`aeval` 等本應獨立的權限，會因共用 club provider／lookup 依賴 `amember` 而無法正常操作。

建議拆成兩個行為提交：

1. 依 `user.isSuper`／permissions 過濾 nav、home cards、header entries，並加共享 route permission gate。
2. 提供任何合法 admin 可讀的最小 club option endpoint（只回 id/name），不要放寬含帳號等敏感欄位的完整 `/admin/clubs`。

### FUNC-03 查詢錯誤被誤顯示成空資料／不存在／永久載入

明確錯誤路徑：

- `ActivityFormPage.tsx:88-101`：詳情失敗直接導回列表。
- `ActivityClosePage.tsx:128-135`：詳情失敗後永久 spinner。
- `SignupFormPage.tsx:47-92`：失敗顯示「找不到報名活動」。
- `SignupListPage.tsx:96-109`：報名紀錄失敗後 Modal 空白。
- `AdminEvalPage.tsx:30-32`：核心 query 失敗只呈現空表與 `—`。

其他 `?? []` 後顯示空狀態的主要位置：

- `ActivityClosePage.tsx:120`
- `ActivityListPage.tsx:501`
- `AccountsPage.tsx:203`
- `AdminFilesPage.tsx:67-76,185,287`
- `AdminMaintenancePage.tsx:104`
- `AdminViolationsPage.tsx:155`
- `AnnouncementsPage.tsx:225`
- `AuditPage.tsx:108`
- `SignupManagePage.tsx:190,289,363`
- `CertificatePage.tsx:116`
- `MaintenancePage.tsx:103`
- `PostalPage.tsx:152`
- `BookingOverviewPage.tsx:335,359`
- `EquipmentPage.tsx:218`
- `FixedRoomPage.tsx:266`
- `VenueBookingPage.tsx:159`
- `MembersPage.tsx:288`
- `OverviewPage.tsx:130,179,211`
- `SignupListPage.tsx:87`
- `ViolationsPage.tsx:72`

設計指南要求錯誤說明「發生什麼、如何處理」。最小修法是每個區塊先分支 `isError`，提供錯誤訊息與 retry；empty state 只在 `!isError` 時顯示。不要為此建立大型狀態框架；重用現有卡片／按鈕樣式即可。

### FUNC-04 Eval 同內容去重仍有並發競態

- `backend/app/api/v1/eval.py:158-190`
- `backend/app/services/files.py:196-234`
- `backend/app/models/evaluation.py:46-56`
- `backend/app/models/files.py:17-24`

`reject_duplicate_in_club_slot=True` 只先 `SELECT` 檔案，再 insert；兩個 session 可同時看不到對方未 commit 的 row。現有唯一 partial index 只適用 `slot = 'report_photo'`，`eval_uploads` 也只有一般 `(year, club_id)` index，因此兩個 Eval upload 都可能成功。

這是 correctness／hardening，不是已證實的分數安全漏洞。建議新增只涵蓋 active `subject_type='eval_upload'` 的 `(club_id, slot, sha256)` partial unique index，以 DB 收口並發；migration 要檢查既有重複資料，API 保持回 409，並加兩個獨立 DB sessions 的 concurrency regression test。

## 5. 已確認無障礙必修

### A11Y-01 八組 clickable `<tr>` 無鍵盤操作

- `ActivityListPage.tsx:367`
- `AdminBookingsPage.tsx:180,216`
- `AdminEvalPage.tsx:188`
- `AdminRoomsPage.tsx:195`
- `ReviewPage.tsx:220`
- `SignupManagePage.tsx:344`
- `EquipmentPage.tsx:85`

最小修法：在名稱或動作欄加入真正的 `<button>`／link；整列 click 只作滑鼠增強。不要把 `<tr>` 改成 `role="button"`，避免破壞 table/row 語意。

### A11Y-02 十三張表缺欄位標頭

- `ActivityListPage.tsx:408`
- `AdminBookingsPage.tsx:177,210`
- `CloseReviewPage.tsx:386`
- `OverduePage.tsx:76,121`
- `CertificatePage.tsx:106`
- `MaintenancePage.tsx:88`
- `PostalPage.tsx:140`
- `BookingOverviewPage.tsx:347`
- `EquipmentPage.tsx:197`
- `FixedRoomPage.tsx:255`
- `VenueBookingPage.tsx:149`

補 `<thead><th scope="col">` 並用 caption／`aria-label` 命名表格。以下空狀態列另缺正確 `colSpan`：

- `CertificatePage.tsx:117`
- `MaintenancePage.tsx:104`
- `PostalPage.tsx:153`
- `BookingOverviewPage.tsx:360`
- `EquipmentPage.tsx:219`
- `FixedRoomPage.tsx:267`
- `VenueBookingPage.tsx:160`

### A11Y-03 全版公告假 Modal 沒有 focus 管理

`TakeoverOverlay.tsx:58-109` 宣告 `role="dialog"`／`aria-modal="true"`，但沒有移入焦點、trap、背景 inert、關閉後恢復；前五秒甚至沒有可聚焦元素。

最小修法：使用已安裝的 AntD `Modal`，保留五秒規則，設定 `maskClosable={false}`、`keyboard={false}`、`footer={null}` 與條件 closable。

### A11Y-04 `--muted` 承載資訊時對比不足

`#9AA1AC` 對白底約 2.60:1、對 paper 約 2.41:1。明確失敗位置：

- `ActivityListPage.tsx:496`：未開始／進行中。
- `AdminViolationsPage.tsx:145`：已截止。
- `SignupBuilderPage.tsx:294-301`：拖曳把手。
- `SignupBuilderPage.tsx:450-465`：預覽「請選擇」。
- `EquipmentPage.tsx:92-96`：器材資料。

只把有意義內容改用 `--steel`；不要全域改 muted token，disabled／純裝飾仍可維持 muted。

### A11Y-05 報名欄位排序僅支援 pointer

`SignupBuilderPage.tsx:286-301` 直接把 `onPointerDown` 掛在 `HolderOutlined`。改成可聚焦 button，提供方向鍵或明確「上移／下移」操作，重用既有 reorder function。

### A11Y-06 共用 focus-visible 風格

`.click-tint` 目前只有 hover。現有 role=button cards 已有 `tabIndex` 與 Enter／Space，瀏覽器預設 outline 多半可見，屬一致性較低風險；可補共用 `2px #2F6FBF` focus ring。

## 6. 可延後的風格／維運 debt

- 設計指南偏好 Skeleton，但接線頁廣泛使用 `<Spin>`；功能可用，可另輪集中替換。
- 非狀態錯誤大量誤用 `#B03A2E`（指南保留給「已退回」），一般 error 應用 `#C13B34`。可新增最小 CSS token 後機械取代，勿混進功能修正。
- `AdminRoomsPage.tsx:19` 的道歉文案、`OneTimePasswordModal.tsx:48` 的驚嘆號違反文案指南。
- `seed_mock.py --yes` 沒有 `ENV=dev` guard：具 shell 權限的 operator 才能觸發，不列遠端漏洞，但正式維運建議補防呆。
- `c7e...` migration downgrade 會刪除跨學期重複成員資料：屬 operator/migration safety，需在部署前決定是否接受 downgrade 的資料損失語意。
- inner nginx 信任所有 RFC1918 網段；目前依賴 GCP firewall，未證實外部繞過。正式部署可再收窄至 edge／compose 實際來源。

## 7. 已排除／不要誤修

- 固定教室每社 10 節只計目前單 + 其他 pending 是文件明確規則；approved 視為前學期，不是 bug（`docs/data-model.md:405`）。
- Eval duplicate 只有應用層先查後寫，`eval_uploads` 沒有相應 DB unique constraint；跨 session 並發可一起通過。這是 correctness／hardening 問題，不是已證實的分數安全漏洞，後續應以 DB constraint 或鎖定收口，不能當成已排除競態。
- member roster 自主管理的信任模型是既有規格，不是本輪越權漏洞。
- generic admin file download 是目前設計；真正問題是 `aclose` scope leak，不要在未重設完整檔案權限模型前任意縮限所有 admin。
- Bandit 的 dev secret、固定 seed 密碼、固定 argv subprocess、enum string 等 Low 均已人工判定不是可遠端利用漏洞。
- 沒有 wildcard CORS、正式 secret/private key、已證實 SSRF、stack trace／SQL 外洩。

## 8. HTTP E2E（不要 Browser）

先 deterministic 重建資料：

```bash
cd backend
uv run python scripts/seed_mock.py --yes
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

前端 Vite 可跑健康／資產 smoke。一般 API 行為可直接請求 `http://127.0.0.1:8000/api/v1`，但所有 Nginx／proxy 安全邊界（body caps、login limit、pre-body auth、CSP、file framing headers）必須另起實際 web/backend Compose stack，經 `http://127.0.0.1:8080/api/v1` 驗證；只打 8000 會繞過本輪主要部署層修正。帳密見 `docs/HANDOFF.md:42`：

- `super` / `Super@12345`
- `admin_lee`、`admin_chen`、`dean` / `Admin@12345`
- `staff_lee` / `Staff@12345`
- `viewer01` / `Viewer@12345`
- `csie_club` / `Club@12345`

請用獨立 cookie jar 登入各角色，從 `csrf_token` cookie 取值放到 `X-CSRF-Token`。至少覆蓋：

1. public health、未登入 401、錯誤 CSRF 403。
2. club：登入 → overview → activity draft／附件 → submit。
3. admin 三關：待審列表／detail → advisor／chief／dean approvals；另驗 `aclose`-only negative visibility。
4. club：結案照片 → 送結案。
5. admin：結案審查與繳交確認。
6. eval overview／上傳／行政分查詢；`EvalResultPage` 不驗 API。
7. booking 三種與 admin 審核。
8. signup：草稿／送出／確認／逐場簽到。
9. 公告 takeover 的 API 狀態與已讀／關閉 mutation（不做視覺 focus 驗證）。
10. 成員 CSV response headers/content；帳號建立／一次性密碼／首登改密。
11. permission matrix：restricted admin 對無權 endpoint 必須 403；super 正常。
12. 檔案下載的授權、410 archived、PDF response headers。

部署層另驗：

- web image/container 的 `nginx -t` 與 build 成功。
- 經 8080 的 login oversized body、一般 JSON oversized body、upload 合法／超限 body 均得到預期狀態。
- 經 8080 確認 login rate limit、未登入 multipart pre-body rejection、CSP 與 PDF same-origin framing headers。
- 8000 與 8080 的 functional response 可一致，但安全標頭／body limit 斷言以 8080 為準。

避免把一次 E2E mutation 的資料污染後續斷言；最簡單是每一大段前重跑 `seed_mock --yes`，或以新建 ID 明確串接。完成後可再 seed 一次恢復 deterministic dev DB。

## 10. 驗證硬規則

- pytest 必須包 timeout，且不可同時跑兩個：

```bash
cd backend
timeout 240 uv run pytest -q
uv run ruff check .
```

- 前端型別必須是：

```bash
cd frontend
pnpm exec tsc -b
pnpm test
pnpm lint
pnpm build
```

- 重跑 Bandit並完成 security-audit 輸出；`findings.json` 最後驗證：

```bash
node /Users/xinshou/.agents/skills/security-audit/validate-findings.cjs \
  /Users/xinshou/security-audit-skill/club-aio/run-1/findings.json
```

- 實際 HTTP E2E 後再宣稱 Task #6 完成。
- 完成後更新 `docs/HANDOFF.md`，記錄 commits、驗證結果、剩餘 debt 與 dev DB 狀態。
