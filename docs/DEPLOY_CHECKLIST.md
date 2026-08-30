# 上線檢查表

上線前逐項校對。標記:**阻擋**=缺了不能上線;**應辦**=維運健壯性;**待決**=需要人拍板。

程式碼層面的待修項目不在此表,見 `issues.md`(已知問題)與 `gaps.md`(未完成功能)。

## A. 阻擋項(其餘段落內也有標記為**阻擋**的列,以標記為準)

- [ ] **備份排程**:`backend/scripts/backup_db.sh` 已就緒(每日 `pg_dump` 自訂格式 + 保留 14 天輪替,**存在同一台機器**,decisions.md OPS-01 明定不做異地),**cron 尚未掛上**(cron 行見該檔頂部)。部署前另手動 dump 一次
- [ ] **上傳目錄目前沒有任何備份**:`backup_db.sh` 只 dump 資料庫,`compose.yml` 也沒有備份服務
  (先前文件寫的 `db-backup` 服務並不存在)。GCE 那條路徑靠磁碟快照兜底,自架 VPS 什麼都沒有 ——
  4.8 GB 的結案照片刪掉就沒了。上線前要嘛掛一支 `rsync`/`tar` 的 cron,要嘛明確接受這個風險
- [ ] **器材主檔的建立順序**:`scripts/seed.py` 只建 5 獎項 + 19 場地 + superadmin,**器材主檔由 `migration/cc_import.py` 從舊 `Device` 表帶入**(品名、數量、單次上限、啟用與否)。正式流程必須 seed 之後跑過遷移,否則器材借用無品項可選
- [ ] **帳號開通**:遷移進來的 15 個行政帳號**權限鍵全空**(只有 `super` 看得到頁面),分工由承辦決定後於帳號管理逐一授出;舊系統沒有工讀生角色,`role=staff` 是 0 筆,上線前要開。所有遷移帳號 `must_change_password=True`,明碼在 `migration/out/` 下:遷移當下那份是 `one_time_passwords_*.csv`,事後用 `set_passwords.py --random` 換發的是 `passwords_*.csv`(欄位為 類型/名稱/代號/密碼)—— **發之前先確認拿的是最新一份**,舊的那份在換發後全數失效;交承辦發放後銷毀
- [ ] **政府行事曆假日**:`holidays` 表未 seed。匯入腳本已就緒(`scripts/import_holidays.py --year <民國年> --yes`,資料源見 decisions.md GAP-06),**每年上線年度都要跑一次**;未匯入的年度 `booking_service.add_workdays` 會退化成只排除週六日,逢國定假日的逾期判定偏一天

## B. `.env`(prod)

`ENV=prod` 時 `config.py` 強制檢查 `SECRET_KEY ≥32 字元且非範本值`、`POSTGRES_PASSWORD` 非空且非 `club`。其餘漏填會靜默降級。

- [ ] 阻擋 `ENV=prod`(啟用 prod 防呆與 cookie Secure)
- [ ] 阻擋 `SECRET_KEY` = `openssl rand -base64 48`
- [ ] 阻擋 `POSTGRES_PASSWORD` = 強密碼(compose 以同一個變數插值到 db 與 backend)
- [ ] 阻擋 `FORWARDED_ALLOW_IPS` = `172.28.0.0/24` + edge VM 內網 IP。**絕不可用 `*`**,否則登入限流可被繞過、稽核 IP 可被投毒。值需與內層 web nginx 的 `set_real_ip_from` 一起核對
- [ ] 應辦 `DISCORD_WEBHOOK_URL`:已是正式頻道。收不屬於任何社團的系統事件(行政手動借用、公告蓋板與刪除、報名場次刪除)與 infra 告警(磁碟水位);**絕不入版控**
- [ ] 阻擋 `SMTP_*`:校方 relay 已實測可寄(`mail.ntust.edu.tw:465`、`SMTP_SECURITY=ssl`)。
  host / username / password 任一為空即降級 log-only(不報錯,但信不會寄出)。
  **`MAIL_FROM_ADDRESS` 需與認證帳號同網域**,否則 relay 會拒收
- [ ] 應辦 `BACKEND_IMAGE` / `WEB_IMAGE` = GHCR 映像路徑。CI 對 main 的每次 push 同時打 `latest` 與 commit sha 兩個 tag:**正式環境釘 sha**,要回滾就換成上一版的 sha,不必等重新建置
- [ ] 應辦 `SITE_URL` = `https://clubs.ntust.edu.tw` —— 通知信正文與 Discord 頭像的連結來源,漏填會指向 localhost
- [ ] **阻擋** `WEB_BIND` —— web 容器發布到哪個位址,**預設是 `127.0.0.1`**。edge 在另一台 VM 上時
  必須填本機內網網卡 IP,漏設等於只聽 loopback、edge 一律 502。反過來綁非 loopback 位址的機器,
  該位址消失(換網卡、DHCP 變動)時容器會以 `cannot assign requested address` 起不來 —— 綁 `0.0.0.0` 沒有這個問題,
  但也就沒有了這道邊界(見 `compose.yml` 的說明)
- [ ] 應辦 `WEB_PORT`(預設 8080)—— edge upstream 要帶埠號
- [ ] 應辦 `UPTIME_PUSH_BACKEND_URL` / `UPTIME_PUSH_FRONTEND_URL`(見 D;`WEB_HEALTH_URL` 有可用預設)

## C. 資料準備

- [ ] 器材主檔、政府行事曆(見 A)
- [ ] 應辦 **評鑑 rubric**:`seed.py` 只建預設評鑑年(`eval_window.year`)的 rubric,且**沒有「複製上年」的介面**。換年度時須調 `eval_window` 後重跑 seed,或直接操作 DB。競賽開始前確認該學年已建
- [ ] 應辦 **社團 Discord webhook**:遷入後 157 社全為空(MIG-05),而社團事件只推社團自設的 webhook —— 未設即整社不推。上線公告請社團自行於「管理項目」填寫
- [ ] 應辦 **社團聯絡 Email**:遷入後 157 社全為空,公告的 Email 通知會寄給 0 個收件人。跑 `migration/set_contact_emails.py`(取最新學期負責人學號 + `@mail.ntust.edu.tw`,decisions.md MIG-05),但**只解得掉約三分之一** —— 2026-08-29 dump 試跑:61 社位址應可用、67 社名單較舊(學號信箱多半已停用)、29 社推不出來。後兩組由腳本分組輸出,要人工補
- [ ] 待決 **社團性質清單**:D-10 定為維持寫死(自治性/學藝性…),上線前核對現行清單與承辦認定一致 —— 公告分眾與統計都依它
- [ ] 待決 **場地主檔**:已 seed 19 處含容納人數,上線前確認與現況相符
- [ ] **阻擋** **舊資料遷移的學期範圍**:MIG-08 定為 114-1 / 114-2 / 115-1(社員名單全遷)。`cms_import.py` 已依 `SCOPE_FIRST_SEMESTER` / `SCOPE_LAST_SEMESTER` 過濾活動;**`cc_import.py` 的借用仍全史匯入**(是否同受限制未定,gaps.md MIG-10)—— `legacy_id_map` 建完再收斂代價極高,上線前要定案
- [ ] 待決 **舊資料遷移**:`migration/cms_import.py`(社團/帳號/成員/活動/公告)與 `cc_import.py`(教室與器材借用)已可執行且 idempotent;上線前以正式 dump 再演練一次,確認筆數與 `legacy_id_map`
- [ ] `reset_db.py` 建立 superadmin 並印出一次性密碼(首登強制改密)

## D. 維運

> 三個 cron 與心跳都掛在**正式 VM**;開發機不跑(心跳另以 `ENV=prod` 把關)。

- [ ] 應辦 **backend healthcheck**:`compose.yml` 只有 db 有,web 的 `depends_on: backend` 也沒有 `condition: service_healthy`。啟動時可能短暫 502(內層 nginx 變數 upstream + resolver 會自行恢復,不會卡死)
- [ ] 應辦 **log 輪替與保留**(磁碟使用率見容量告警、backend 存活見 Uptime Kuma)
- [ ] 應辦 **磁碟容量**:系統總量讀實體磁碟可用空間,不設邏輯容量;實體磁碟還要容 OS/Docker/PostgreSQL/log/multipart temp,以 `df` 與 GCE 實際容量驗證
- [ ] 待決 **限流與 session**:限流是行程內記憶體(單機可行,重啟歸零);過期 session 於登入時順手清除,不另設排程
- [ ] 應辦 **逾期提醒排程**:host cron 每上班日 10:35 呼叫 `scripts/send_overdue_reminders.py`(cron 行見該檔 docstring);未設排程則只剩人工按鈕
- [ ] 應辦 **每日備份**:host cron 03:15 呼叫 `scripts/backup_db.sh`
- [ ] 應辦 **Uptime Kuma**:建 backend / frontend 兩個 push monitor,URL 填入 `.env`;`WEB_HEALTH_URL` 走 compose 內網 `http://web/`(容器內 nginx 聽 80,`WEB_PORT` 是宿主機發布埠)。後端每 30 秒推一次,只在 `ENV=prod` 送出
- [ ] 應辦 **容量告警**:host cron 08:20 呼叫 `scripts/check_disk.py`(80% 警示、90% 告警推 Discord;90% 時上傳前置閘已關閉,沒有告警的話社團會傳不上東西一整天)

## E. Edge proxy 切換(校方 edge,clubs.ntust.edu.tw)

檔案 `../nginx/ntust-sites/clubs.ntust.edu.tw.conf`。現況:`upstream clubs { server 10.140.0.2 }`(舊 Django VM,無埠號=預設 80)、XFF 用 `$proxy_add_x_forwarded_for`(追加,客戶端可偽造)、未送 XFP、此 vhost 無 `client_max_body_size`(繼承全域 3072M)。

- [ ] 阻擋 app VM 的 `.env` 設 `WEB_BIND=<app VM 內網 IP>`,edge 才連得到(預設 `127.0.0.1` 只聽本機)
- [ ] 阻擋 upstream 改指 `<新 VM 內網 IP>:8080`,漏埠號會 502
- [ ] 阻擋 加 `client_max_body_size 256m`(內層為預設 1m + 上傳路徑白名單 256m,edge 太小會先 413)
- [ ] 應辦 加 `proxy_request_buffering off`
- [ ] 應辦 XFF 改覆寫式 `proxy_set_header X-Forwarded-For $remote_addr;` 並補 `X-Forwarded-Proto $scheme`。內層 web nginx 已用 `set_real_ip_from` 還原真實 IP,此項為 defense-in-depth
- [ ] 待決 台灣 IP 白名單與 `$should_drop` 封鎖 map 沿用現有
- [ ] 待決 `clubclass.ntust.edu.tw` 是否 307 導向
- [ ] 上線前演練切換與回滾(回滾 = upstream 改回 `10.140.0.2`)各一次

## E-2. 自架 VPS + Nginx Proxy Manager(先行站台)

正式站切換前的自架環境。edge 換成同機 Docker 上的 Nginx Proxy Manager,TLS 由它處理,
內層 web 容器不變 —— 拓樸與 E 相同,只是 edge 換了一套實作。

**`.env`(與 B 段同表,以下是這條路徑額外要注意的值)**

- [ ] 阻擋 `WEB_BIND=172.17.0.1` —— NPM 跑在同機 Docker 裡,連得到 docker0 閘道但網際網路連不到。
  NPM 與 web 同在宿主上才填 `127.0.0.1`(預設值)。兩個坑:`172.17.0.1` 只是 docker0 的**預設**
  位址(`/etc/docker/daemon.json` 的 `bip` 會改掉,先 `ip -4 addr show docker0` 確認);
  容器打宿主 IP 走的是 host 的 INPUT 鏈,`ufw` 預設 deny incoming 會直接 DROP(打 loopback 不會)
- [ ] **更穩的做法是不開宿主埠**:`docker network connect club-aio_default <npm 容器>`,
  Proxy Host 的 Forward Hostname 填 `web`、Port 填 `80`,並把 compose 的 `web.ports:` 整段拿掉。
  沒有發布埠就沒有綁錯位址與防火牆的問題
- [ ] 阻擋 `SITE_URL` = 該站台的實際網域;漏填指向 localhost,通知信與 Discord 的連結全壞
- [ ] `FORWARDED_ALLOW_IPS` **不必**加 NPM 的 IP:backend 只收得到 compose 子網內 web 容器的連線,
  預設 `172.28.0.0/24` 已足夠。要加的是內層 nginx 的 `set_real_ip_from`(已涵蓋全部 RFC1918)

**NPM 的 Proxy Host**

- [ ] Forward Hostname/IP = `WEB_BIND` 的值、Port = `WEB_PORT`(預設 8080)。**Scheme 是 `http`**,
  TLS 只在 NPM 那一層;內層 cookie 的 `Secure` 由 `ENV=prod` 給,瀏覽器看到的是 https,不受影響
- [ ] 應辦 Advanced 分頁填入:
  ```
  client_max_body_size 256m;
  proxy_request_buffering off;
  proxy_read_timeout 300s;
  proxy_send_timeout 300s;
  ```
  NPM 預設是 `client_max_body_size 2000m` 與 90 秒的 `proxy_connect/send/read_timeout`
  (`docker/rootfs/etc/nginx/nginx.conf`),所以 200MB 的維修影片**不會**被擋掉 —— 這四行是收緊
  而非解除阻擋:`256m` 對齊內層的上傳白名單(內層預設 1m,edge 給小了才會先吃 413);
  `proxy_request_buffering off` 才是真正必要的一行,NPM 預設會把整包 body 先緩衝到自己容器的
  `/tmp/nginx/body`;300s 是留給慢速上行的裕度
- [ ] NPM 預設已送 `X-Real-IP` 與 `X-Forwarded-Proto`,內層 `real_ip_header X-Real-IP` 直接接得上,不必另外設定
- [ ] 確認 `curl -sI https://<網域>/api/v1/health` 200,且 `docker compose logs backend` 裡的 client IP
  是真實來源而非 NPM 的容器 IP —— 塌縮的話限流會變全域一桶

**上傳目錄**

- [ ] `UPLOADS_PATH=/srv/club-aio/uploads` —— bind mount,舊照片 sftp 送得進去、備份直接讀得到
- [ ] **從具名 volume 切過來的機器要先搬檔**,否則容器掛到空目錄、`files` 每一列都還指著舊檔,
  全站附件靜默 404 而且不會有任何錯誤:
  ```bash
  docker compose down
  docker run --rm -v club-aio_uploads:/from -v /srv/club-aio/uploads:/to alpine cp -a /from/. /to/
  ```
  全新機器沒有舊 volume,直接 rsync 進去即可
- [ ] `migration/*.py` 寫的是**宿主端**的 `UPLOAD_DIR`(預設 `./data/uploads`,且必須在 `backend/` 下跑)。
  要在這台機器重跑遷移,`UPLOAD_DIR` 得指到同一個 `/srv/club-aio/uploads`,佈局維持 `{模組}/{年}/{月}/{uuid}`
- [ ] 容器以 root 執行,寫進去的檔案是 `root:root`。sftp 先送到自己的家目錄再 `sudo rsync -a` 進去,
  不要 sftp 直接對著掛載點寫

**映像**

VPS 上直接 `docker compose up -d --build`(`BACKEND_IMAGE`/`WEB_IMAGE` 留空即 `:local`)。
CI 只在 `main` 推 GHCR 映像,`dev` 分支沒有可 pull 的映像 —— **`compose.yml` 檔頭「VM 上永不 build」
指的是正式站,自架站台是例外**。前端 build 吃記憶體,
1GB 的機器會 OOM,不足就先在本機 `docker save` 再送上去。

## F. 待決清單

1. ~~SMTP relay 最終方案~~ —— 已定案為校方 relay,實測可寄
3. 上傳檔案儲存位置:`compose.yml` 由 `UPLOADS_PATH` 二選一 —— 留空=具名 volume(預設),給絕對路徑=bind mount。備份做法隨之不同,正式站要挑定一種並與備份腳本對齊
4. 備份保留天數(腳本預設 14 天,`KEEP_DAYS` 可覆寫)與備份目錄位置(預設 `./backups`)
5. GCE 實體磁碟大小(`df` 驗證)與 VM 規格(e2-medium + 2GB swap 是否夠)
6. `.env` 的保管與輪替方式
7. log 輪替與保留方案(容量告警與後端存活已有)
8. 政府行事曆假日由誰於每年年初執行匯入(腳本已有)
9. HTTPS:確認 edge 上 `clubs.ntust.edu.tw` 的憑證來源與自動續期(現行憑證路徑不是 certbot 慣例的 `/etc/letsencrypt/live/`,不能假設);內層走 HTTP(僅 compose 內網)

## G. 已知限制

- `alembic downgrade base` 在含 seed 資料的庫上會於 venues category CHECK 收窄那一輪失敗;回滾演練請逐版降,不要一路降到 base
- **跨過遷移的回滾要先 `alembic downgrade` 再換映像**:舊映像的 `upgrade head` 找不到新 revision,backend 直接起不來
- 結案期限改天制後固定 30 天/月,月制給的是該月實際天數:切換當下每張單的期限會前後位移(預設 1 個月最多縮短 1 天,設定值越大差越多,6 個月是 4 天),原本剛好在期限邊緣的已核准活動會立刻變成逾期鎖定
- **`c9a4f1e72d38` 與 `d7b2c85f4a19` 是不可逆的 drop column**(社員電話、指導老師電話,D-21/D-22):部署時 backend 起容器就會自動 `upgrade head`,號碼當場消失。降版只還得回欄位、還不回值 —— 要留底就在升版前另外 dump 一份
- migration 的 enum 欄位用 `native_enum=False, create_constraint=True`,Alembic 於 `add_column` 時會自動補 CHECK。**不要再顯式補**,會 `DuplicateObject`
- E2E 必須打 web 容器的 `:8080`,直接打 `:8000` 會繞過 nginx 層的上傳上限、登入限流、`auth_request` 與安全標頭

## H. 上線流程

1. 承辦提供:正式 DB dump、正式 Discord 頻道(器材主檔由 `cc_import` 帶入不需另外提供,OPS-04;SMTP relay 已定案為校方 relay,F.1)
2. 掛上三個 cron(備份、逾期提醒、容量告警)、建 Kuma 兩個 push monitor,補 backend healthcheck(D)
3. 準備 prod `.env`(B 全填),本機以 `ENV=prod` 起一次全棧確認防呆通過
4. 目標 VM:建 GCE、裝 Docker、放 `.env`、`docker compose pull && up -d --no-build`,確認 backend 自動 `alembic upgrade head`、`/api/v1/health` 200
5. 正式資料:`reset_db.py` 建基礎主檔 + superadmin(記下一次性密碼),匯入器材、假日、舊資料
6. **部署前手動 `pg_dump` 一次**
7. 低流量時段執行 edge 切換(E),備妥回滾
8. 上線後確認登入/上傳/審核/檔案下載/通知信實際可用,監控磁碟與 backend 存活
