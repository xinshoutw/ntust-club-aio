# 正式部署(prod)就緒檢查表

> 供上線前逐項校對。狀態基於 2026-07-17 的 codebase 實查(非文件推測)。
> 圖例:🔴 上線阻擋(缺了不能上/違反「涵蓋舊系統全部功能」硬需求) · 🟡 應完成(維運/健壯性) · 🟢 需你決定/確認。
> 「現況」是我實際查到的事實;「待辦」是要補的動作;「決定者」標示該由誰拍板。

---

## A. 上線硬阻擋(缺了不能上線)

### A1. 🔴 評審評分流程(競賽評鑑)完全未實作
- **現況**:`review_scores`、`review_score_items`、`eval_groups`、`eval_group_clubs`、`eval_group_reviewers` 五張表**只在 models 定義,沒有任何 API / service / 前端**。`admin_eval.py` 只做「行政分 ad1–ad8 自動評分 + 人工調整」,**沒有**分組與評審指派、評審評分介面、競賽成績總表。評審帳號(viewer)登入後一律導到 `/coming-soon`。
- **舊系統對照**:`viewer.AssessmentDuration` + `scores`(競賽評鑑評分)——屬「新系統須涵蓋舊系統全部功能」的硬需求。
- **待辦**:實作 (1) 管理端「分組與評審指派」(2) 評審端評分頁(依獎項、對社團匿名為評審A/B)(3) 競賽成績總表(百分比/名次推導)。工作量大(一個完整 panel + 後端)。
- **決定者**:你 —— **這輪評鑑是否要在新系統上跑?** 若 2026-09 上線時該學年評鑑尚未開始,可先上線、評分前補完;若上線即需評鑑,則此為硬阻擋。

### A2. 🔴 工讀生端(staff panel)完全未實作
- **現況**:staff 帳號登入導 `/coming-soon`。違規勸導填寫/查詢、**器材借出點交 / 歸還點交**、逾期追蹤五頁皆未做。`equipment_loans` 有 `checkout_by/checkin_by/serials` 欄位但無點交入口。
- **舊系統對照**:clubclass 的器材點交(`device_log`)是既有功能;違規勸導(`club_record_from_staff`)亦然。
- **待辦**:實作工讀生端五頁 + 對應後端點交/銷案端點(部分違規/逾期已有 admin 端點可複用)。
- **決定者**:你 —— **器材借用要不要在新系統走完整「借出→點交→歸還」?** 若上線初期器材點交仍走人工/舊流程,可延後;否則為阻擋。

### A3. 🔴 正式資料主檔尚未 seed(器材)
- **現況**:基礎 seed(`scripts/seed.py`,由 `reset_db.py` 呼叫)只建 **5 獎項 + 19 場地 + superadmin**。**器材主檔只存在於 `seed_mock.py`(測試假資料),沒有進正式 seed**。無器材主檔則器材借用無品項可選。
- **待辦**:向承辦取得真實器材清單(品名/數量/是否需序號/分類),寫入正式 seed 或上線後由最高權限管理員於後台建立。
- **決定者**:承辦提供清單;你決定用 seed 還是後台手建。

### A4. 🔴 備份機制尚未建立(資料不可失)
- **現況**:`architecture.md §6.2` 規劃每日 `pg_dump→GCS`、`uploads` 增量同步、每週 GCE 快照——**目前 repo 內沒有任何備份 script 或排程**。單機部署 = 單點故障,無備份等於裸奔。
- **待辦**:建立 (1) 每日 `pg_dump | gzip → GCS`(lifecycle 30 天)(2) 每日 `uploads/` 同步 GCS(3) 每週 GCE 磁碟快照(4) 部署前手動 dump 一次。可用 VM 上 cron 或 GCP 排程。
- **決定者**:你 —— 備份放哪個 GCS bucket、誰負責建 cron。

---

## B. 部署設定與密鑰(`.env` 逐項填)

> 正式環境 `ENV=prod` 時 `config.py` 會**強制檢查**:`SECRET_KEY ≥32 字元且非範本值`、`POSTGRES_PASSWORD 非 ''/'club'`。其餘沒有硬檢查,漏填會靜默降級。

- [ ] 🔴 `ENV=prod`(啟用 prod 防呆與 cookie Secure 旗標)
- [ ] 🔴 `SECRET_KEY` = 32 字元以上隨機值(`openssl rand -base64 48`)
- [ ] 🔴 `POSTGRES_PASSWORD` = 強密碼(同步設 db 與 backend 兩處環境)
- [ ] 🔴 `FORWARDED_ALLOW_IPS` = compose 子網 `172.28.0.0/24`(+ 視實際拓撲加 edge VM 內網 IP;**絕不可用 `*`**,否則登入限流被繞過、稽核 IP 被投毒)。詳見 E 節,值需與內層 web nginx 的 `set_real_ip_from` 一起核對
- [ ] 🟡 `UPLOAD_DIR`:compose 內固定 `/srv/uploads`(容器內);對應宿主端儲存見 G3 決策
- [ ] 🟢 `DISCORD_WEBHOOK_URL`:目前 `.env.example` 為空、現用值是**測試群組**;prod 要換正式頻道 webhook,且**絕不入版控**
- [ ] 🟢 `SMTP_*`:relay 未定(見 G1);`SMTP_PASSWORD` 為空時**寄信自動降級 log-only**(不會報錯,但通知信不會真的寄出)
- [ ] 🟡 `BACKEND_IMAGE` / `WEB_IMAGE` = GHCR 映像路徑(CI 已推 `ghcr.io/<repo>-backend:latest`、`-web:latest`)
- [ ] 🟡 `WEB_PORT`:預設 8080(edge upstream 要指到 `<VM 內網 IP>:8080`,別漏埠號)

---

## C. 資料準備(seed / 遷移)

- [ ] 🔴 **器材主檔**(見 A3)
- [ ] 🟡 **政府行事曆假日**:`holidays` 表未 seed。器材逾期/借用區間推導(`booking_service.add_workdays`)在**未匯入年度會退化成只排除週六日**——不算壞,但逢國定假日的逾期判定會偏一天。上線年度應由行政匯入。
- [ ] 🟡 **評鑑年度 rubric**:`award_rubric_items` 逐年由行政「複製上年再修改」建立(設計如此,基礎 seed 不建)。競賽開始前需確認該學年 rubric 已建。
- [ ] 🟢 **場地主檔**:已 seed 19 處(含容納人數),與需求方 2026-07-15 定案一致;上線前確認清單與現況相符即可。
- [ ] ✅ **superadmin**:`reset_db.py` 會建立並印出一次性密碼(首登強制改密)。
- [ ] 🟢 **舊資料遷移**:`architecture.md §7` 規劃 `migration/` 寫 idempotent script 搬「社團主檔 / 成員名單 / 固定設施主檔」——**目前沒有 `migration/` 目錄,遷移 script 未寫**。需承辦提供舊 DB dump 後才能寫。決定:上線是否需帶入舊社團/成員資料,或全新開始。

---

## D. 維運與健壯性

- [ ] 🔴 **備份**(見 A4)
- [ ] 🟡 **backend healthcheck**:`compose.yml` 只有 db 有 healthcheck;backend **沒有**,web `depends_on: backend` 也**沒有 `condition: service_healthy`**。啟動時 web 可能先於 backend 就緒 → 短暫 502(內層 nginx 用變數 upstream + resolver 會自動重試恢復,不會卡死,但建議補 backend healthcheck 讓 compose 正確排序)。
- [ ] 🟡 **監控 / 告警 / log 保留**:目前無。建議至少:磁碟使用率告警(呼應 storage_limits 40 GiB)、backend 存活探測、log 輪替與保留策略。
- [ ] 🟢 **限流與 session**:限流是**行程內記憶體**(單機 OK,重啟即歸零——可接受);過期 session 於登入時順手清除(`auth.py:30`),不另設排程。確認可接受。
- [ ] 🟢 **逾期提醒信排程**:`architecture.md §3.7` 提到用 APScheduler 定時寄逾期提醒——**目前未實作**,逾期提醒信只在管理員於逾期頁**手動觸發**時寄(`admin_overdue.py`)。決定:是否需自動排程,或維持手動。
- [ ] 🟡 **磁碟容量**:`storage_limits` 邏輯容量預設 40 GiB + reserve 10 GiB;實體磁碟還要容 OS/Docker/PostgreSQL/log/multipart temp。**不得假設 50 GiB 實體磁碟就夠**,以 `df` / GCE 實際容量驗證;調高後台容量前先擴 GCE Persistent Disk。

---

## E. Edge proxy 切換(`../nginx/ntust-sites/clubs.ntust.edu.tw.conf`,2026-09 執行)

> 現況:`upstream clubs { server 10.140.0.2 }`(舊 Django VM,無埠號=預設 80);`X-Forwarded-For $proxy_add_x_forwarded_for`(追加,客戶端可偽造);未送 `X-Forwarded-Proto`;此 vhost 無 `client_max_body_size`(繼承全域,舊系統為 3072M)。TLS 由 edge certbot 終結。

- [ ] 🔴 upstream 改指 **`<新 VM 內網 IP>:8080`**(edge 預設打 80,漏埠號會 502)
- [ ] 🔴 此 vhost 加 **`client_max_body_size 256m`**(讓合法上傳穿過;內層已改為預設 1m + 上傳白名單 256m,edge 太小會先 413)
- [ ] 🟡 加 **`proxy_request_buffering off`**(大檔上傳串流直通,不在 edge 暫存整包)
- [ ] 🟡 XFF 改**覆寫式**:`proxy_set_header X-Forwarded-For $remote_addr;` 並補 `proxy_set_header X-Forwarded-Proto $scheme;`(現用 `$proxy_add_x_forwarded_for` 會保留客戶端偽造鏈)。註:內層 web nginx 已用 `set_real_ip_from`(信任 10/8 等私有段,edge 的 10.140.0.x 落在其中)還原真實 IP 並覆寫 XFF,故此項為 defense-in-depth;實際 `FORWARDED_ALLOW_IPS` 值請與內層 realip 設定一起核對(見 B)
- [ ] 🟢 台灣 IP 白名單 / `$should_drop` 封鎖 map:沿用現有即可,確認新系統不需調整
- [ ] 🟢 回滾方案:切換 = 改 upstream + 上述幾行;回滾 = 改回 `10.140.0.2`。上線前演練一次
- [ ] 🟢 `clubclass.ntust.edu.tw`:是否於上線時 307/302 導向新系統(`architecture.md §9` 未決)

---

## F. 功能缺口(非阻擋,但影響完整度)

- [ ] 🟡 **評鑑結果頁(EvalResultPage)**:仍是**寫死的 mock 資料**(`RESULTS` 常數),未接 API。需求方規格待定;與 A1 評審評分相依。
- [ ] 🟡 **首頁導覽頁**:`/` 目前直接是登入頁(過渡做法);規劃改為展示社團/圖片/介紹的導覽頁,右上登入。非阻擋。
- [ ] 🟡 **Email 模板**:目前寄純文字(`notify.send_email`),無 MJML/品牌化模板。功能可用,樣式待需求方模板。
- [ ] 🟡 **PDF 成果報告 / 心得**:以 reportlab 於下載時動態生成,版型**近似**(非逐格對齊 `docs/模板_*.docx`);data-model 註明「版型可調」。功能可用。
- [ ] 🟢 **幹部證明 admin 端**:社團端可申請,但無 admin 端點/列表(社團總覽線上申請區未列)。確認是否需 admin 審核流程。
- [ ] 🟢 `docs/TASK6_REVIEW_HANDOFF.md §6` 的樣式/文案 debt:`<Spin>`→Skeleton、error 色 `#B03A2E`→`#C13B34` 機械取代、道歉文案/驚嘆號、`seed_mock --yes` 補 `ENV=dev` guard、`c7e...` migration downgrade 資料損失語意、內層 nginx 信任網段收窄。皆非阻擋。

---

## G. 待你決定的問題(彙整)

1. 🟢 **SMTP relay 最終方案**(校方 relay / Google Workspace / 第三方 / 開發者 iCloud+)——`architecture.md §9` 未決。決定前通知信只 log-only。
2. 🟢 **Discord 正式頻道 webhook**——現用測試群組;prod URL 只入 `.env`。
3. 🟢 **上傳檔案儲存位置**:`compose.yml` 現用**具名 volume `uploads`**;`architecture.md §3.5` 原規劃 **bind mount `/srv/club-aio/uploads`** 方便備份工具直接同步。二者影響備份做法,擇一並對齊。
4. 🟢 **備份 owner 與 GCS bucket**(見 A4)。
5. 🔴/🟢 **上線時哪些未建 panel 是必須的**:評審評分(A1)、工讀生器材點交(A2)——這兩項是舊系統既有功能。決定 2026-09 上線是否需其中之一先上,或可分階段(先上社團端+行政端,評審/工讀生端隨後)。**這題決定 A1/A2 是不是硬阻擋。**
6. 🟢 **GCE 實體磁碟大小**:確認 ≥ 邏輯容量 40 + reserve 10 + OS/DB/Docker/temp;`df` 驗證。
7. 🟢 **VM 規格**:e2-medium(2 共享 vCPU / 4GB)+ 2GB swap 是否夠;需要時垂直升 e2-standard-2(停機改 machine type 即可)。
8. 🟢 **VM 上 `.env` 的保管與輪替**:目前就是一個檔案;是否需 secret manager / 權限收斂 / 輪替流程。
9. 🟢 **監控/告警方案**(見 D)。
10. 🟢 **舊資料遷移範圍**:帶入舊社團/成員/設施主檔,或全新開始(見 C)。
11. 🟢 **政府行事曆假日**由誰於上線年度匯入(見 C)。
12. 🟢 **HTTPS 憑證**:edge certbot 已管 `clubs.ntust.edu.tw` 憑證,確認自動續期正常;內層走 HTTP(僅 compose 內網,正確)。

---

## H. 建議上線前流程(runbook 草案)

1. 承辦提供:器材清單、(如需)舊 DB dump、正式 Discord 頻道、SMTP relay 決定。
2. 決定 A1/A2 是否本次上線(G5),排定分階段計畫。
3. 補齊 D 的 backend healthcheck、建立 A4 備份排程。
4. 準備 prod `.env`(B 全填),`ENV=prod` 本機起一次全棧確認 `config.py` 防呆通過。
5. 目標 VM:建 GCE(規格/磁碟依 G6/G7)、裝 Docker、放 `.env`、`docker compose pull && up -d --no-build`,確認 backend 自動 `alembic upgrade head`、`/api/v1/health` 200。
6. 正式資料:`reset_db.py` 建基礎主檔 + superadmin(記下一次性密碼),匯入器材/假日/(如需)舊資料。
7. **部署前手動 `pg_dump` 一次**。
8. Edge 演練切換(E 節)於低流量時段執行,備妥回滾(改回舊 upstream)。
9. 上線後:確認登入/上傳/審核/檔案下載/通知信(或 log-only)實際可用,監控磁碟與 backend 存活。
