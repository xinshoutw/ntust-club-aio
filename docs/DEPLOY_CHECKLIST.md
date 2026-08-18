# 上線檢查表

上線前逐項校對。標記:**阻擋**=缺了不能上線;**應辦**=維運健壯性;**待決**=需要人拍板。

程式碼層面的待修項目不在此表,見 `issues.md`(已知問題)與 `gaps.md`(未完成功能)。

## A. 阻擋項

- [ ] **備份機制**:目前 repo 內沒有任何備份 script 或排程。單機部署 = 單點故障。需建立每日 `pg_dump | gzip → GCS`(lifecycle 30 天)、每日 `uploads/` 同步、每週 GCE 磁碟快照、部署前手動 dump 一次
- [ ] **器材主檔的建立順序**:`scripts/seed.py` 只建 5 獎項 + 19 場地 + superadmin,**器材主檔由 `migration/cc_import.py` 從舊 `Device` 表帶入**(品名、數量、單次上限、啟用與否)。正式流程必須 seed 之後跑過遷移,否則器材借用無品項可選
- [ ] **政府行事曆假日**:`holidays` 表未 seed。未匯入的年度,`booking_service.add_workdays` 會退化成只排除週六日,逢國定假日的逾期判定偏一天

## B. `.env`(prod)

`ENV=prod` 時 `config.py` 強制檢查 `SECRET_KEY ≥32 字元且非範本值`、`POSTGRES_PASSWORD` 非空且非 `club`。其餘漏填會靜默降級。

- [ ] 阻擋 `ENV=prod`(啟用 prod 防呆與 cookie Secure)
- [ ] 阻擋 `SECRET_KEY` = `openssl rand -base64 48`
- [ ] 阻擋 `POSTGRES_PASSWORD` = 強密碼(compose 以同一個變數插值到 db 與 backend)
- [ ] 阻擋 `FORWARDED_ALLOW_IPS` = `172.28.0.0/24` + edge VM 內網 IP。**絕不可用 `*`**,否則登入限流可被繞過、稽核 IP 可被投毒。值需與內層 web nginx 的 `set_real_ip_from` 一起核對
- [ ] 阻擋 `DISCORD_WEBHOOK_URL`:現值為測試群組,prod 換正式頻道;**絕不入版控**
- [ ] 阻擋 `SMTP_*`:校方 relay 已實測可寄(`mail.ntust.edu.tw:465`、`SMTP_SECURITY=ssl`)。
  host / username / password 任一為空即降級 log-only(不報錯,但信不會寄出)。
  **`MAIL_FROM_ADDRESS` 需與認證帳號同網域**,否則 relay 會拒收
- [ ] 應辦 `BACKEND_IMAGE` / `WEB_IMAGE` = GHCR 映像路徑。CI 對 main 的每次 push 同時打 `latest` 與 commit sha 兩個 tag:**正式環境釘 sha**,要回滾就換成上一版的 sha,不必等重新建置
- [ ] 應辦 `WEB_PORT`(預設 8080)—— edge upstream 要帶埠號

## C. 資料準備

- [ ] 器材主檔、政府行事曆(見 A)
- [ ] 應辦 **評鑑 rubric**:`seed.py` 只建預設評鑑年(`eval_window.year`)的 rubric,且**沒有「複製上年」的介面**。換年度時須調 `eval_window` 後重跑 seed,或直接操作 DB。競賽開始前確認該學年已建
- [ ] 待決 **場地主檔**:已 seed 19 處含容納人數,上線前確認與現況相符
- [ ] 待決 **舊資料遷移**:`migration/cms_import.py`(社團/帳號/成員/活動/公告)與 `cc_import.py`(教室與器材借用)已可執行且 idempotent;上線前以正式 dump 再演練一次,確認筆數與 `legacy_id_map`
- [ ] `reset_db.py` 建立 superadmin 並印出一次性密碼(首登強制改密)

## D. 維運

- [ ] 應辦 **backend healthcheck**:`compose.yml` 只有 db 有,web 的 `depends_on: backend` 也沒有 `condition: service_healthy`。啟動時可能短暫 502(內層 nginx 變數 upstream + resolver 會自行恢復,不會卡死)
- [ ] 應辦 **監控與告警**:至少磁碟使用率、backend 存活、log 輪替與保留
- [ ] 應辦 **磁碟容量**:系統總量讀實體磁碟可用空間,不設邏輯容量;實體磁碟還要容 OS/Docker/PostgreSQL/log/multipart temp,以 `df` 與 GCE 實際容量驗證
- [ ] 待決 **限流與 session**:限流是行程內記憶體(單機可行,重啟歸零);過期 session 於登入時順手清除,不另設排程
- [ ] 應辦 **逾期提醒排程**:host cron 每上班日 10:35 呼叫 `scripts/send_overdue_reminders.py`(cron 行見該檔 docstring);未設排程則只剩人工按鈕

## E. Edge proxy 切換

檔案 `../nginx/ntust-sites/clubs.ntust.edu.tw.conf`。現況:`upstream clubs { server 10.140.0.2 }`(舊 Django VM,無埠號=預設 80)、XFF 用 `$proxy_add_x_forwarded_for`(追加,客戶端可偽造)、未送 XFP、此 vhost 無 `client_max_body_size`(繼承全域 3072M)。

- [ ] 阻擋 upstream 改指 `<新 VM 內網 IP>:8080`,漏埠號會 502
- [ ] 阻擋 加 `client_max_body_size 256m`(內層為預設 1m + 上傳路徑白名單 256m,edge 太小會先 413)
- [ ] 應辦 加 `proxy_request_buffering off`
- [ ] 應辦 XFF 改覆寫式 `proxy_set_header X-Forwarded-For $remote_addr;` 並補 `X-Forwarded-Proto $scheme`。內層 web nginx 已用 `set_real_ip_from` 還原真實 IP,此項為 defense-in-depth
- [ ] 待決 台灣 IP 白名單與 `$should_drop` 封鎖 map 沿用現有
- [ ] 待決 `clubclass.ntust.edu.tw` 是否 307 導向
- [ ] 上線前演練切換與回滾(回滾 = upstream 改回 `10.140.0.2`)各一次

## F. 待決清單

1. ~~SMTP relay 最終方案~~ —— 已定案為校方 relay,實測可寄
3. 上傳檔案儲存位置:`compose.yml` 現用具名 volume `uploads`,`architecture.md §3.2` 規劃 bind mount `/srv/club-aio/uploads` 以便備份工具直接同步。二者影響備份做法,擇一並對齊
4. 備份 owner 與 GCS bucket
5. GCE 實體磁碟大小(`df` 驗證)與 VM 規格(e2-medium + 2GB swap 是否夠)
6. `.env` 的保管與輪替方式
7. 監控/告警方案
8. 政府行事曆假日由誰於上線年度匯入
9. HTTPS:確認 edge 上 `clubs.ntust.edu.tw` 的憑證來源與自動續期(現行憑證路徑不是 certbot 慣例的 `/etc/letsencrypt/live/`,不能假設);內層走 HTTP(僅 compose 內網)

## G. 已知限制

- `alembic downgrade base` 在含 seed 資料的庫上會於 venues category CHECK 收窄那一輪失敗;回滾演練請逐版降,不要一路降到 base
- migration 的 enum 欄位用 `native_enum=False, create_constraint=True`,Alembic 於 `add_column` 時會自動補 CHECK。**不要再顯式補**,會 `DuplicateObject`
- E2E 必須打 web 容器的 `:8080`,直接打 `:8000` 會繞過 nginx 層的上傳上限、登入限流、`auth_request` 與安全標頭

## H. 上線流程

1. 承辦提供:器材清單、正式 DB dump、正式 Discord 頻道、SMTP relay 決定
2. 建立備份排程(A),補 backend healthcheck(D)
3. 準備 prod `.env`(B 全填),本機以 `ENV=prod` 起一次全棧確認防呆通過
4. 目標 VM:建 GCE、裝 Docker、放 `.env`、`docker compose pull && up -d --no-build`,確認 backend 自動 `alembic upgrade head`、`/api/v1/health` 200
5. 正式資料:`reset_db.py` 建基礎主檔 + superadmin(記下一次性密碼),匯入器材、假日、舊資料
6. **部署前手動 `pg_dump` 一次**
7. 低流量時段執行 edge 切換(E),備妥回滾
8. 上線後確認登入/上傳/審核/檔案下載/通知信實際可用,監控磁碟與 backend 存活
