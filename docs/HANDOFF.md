# Session Handoff

> 「現在進行到哪、接下來做什麼」的交接快照。永久知識在三層 `AGENTS.md` 與 `docs/` 的設計文件;
> 需求方拍板的規則在 `docs/decisions.md`(永久保留);本檔過期即刪。

## 現在在哪

**`decisions.md` 裡「已定案且做得完」的項目全部做完了。** `docs/issues.md` 剩 7 項、
`docs/gaps.md` 的未完成功能剩評鑑鏈與幾項延伸,**全部落在「上線後單獨排程」那一堆**。

也就是說:接下來不是照清單逐項修,而是挑一整條線來做(評鑑鏈是最大的一條),
或先把上線檢查表(`DEPLOY_CHECKLIST.md`)的阻擋項清掉。

## 接下來做什麼

### 一、評鑑彙總鏈(最大的一條,建議當單一開發段落規劃)

GAP-01 → 02 → 03 → 04,連帶 ISS-04、ISS-20、ISS-12c/GAP-08b、GAP-07、GAP-19。
**不要拆散**:分組與評審指派沒有寫入 API(GAP-01)的話,評審端三頁在正式環境永遠是
「尚未被指派評分」(ISS-04),而後面的總表(GAP-03)與結果頁(GAP-04)都建立在它上面。

DEC-01 已定案:這學年評鑑在新系統跑,但**學年末才用** —— 上線本身不擋這條。

### 二、上線檢查表的阻擋項(`DEPLOY_CHECKLIST.md`)

| 項目 | 現況 |
|---|---|
| 備份排程 | 腳本已就緒(`scripts/backup_db.sh`),**cron 還沒掛上** |
| 器材主檔 | 由 `migration/cc_import.py` 從舊 `Device` 表帶入,正式流程必須 seed 之後跑過遷移 |
| 政府行事曆假日 | 匯入腳本已就緒(`scripts/import_holidays.py`),**上線年度還沒跑** |
| `.env` 正式值 | `MAIL_FROM_ADDRESS` 是個人信箱要換;Uptime Kuma 兩支 push URL 待填 |
| 遷移學期範圍 | MIG-08 定為三學期,兩支腳本尚未實作過濾(MIG-09)—— 照現況跑會把全史匯進正式庫 |

### 三、其餘單獨排程

| 項目 | 內容 |
|---|---|
| ISS-90 | 併發、權限矩陣、時區邊界測試。**前端元件測試環境已建**(jsdom + `@testing-library/react`),可直接動工 |
| ISS-67 / GAP-18 鈴鐺 | 行政/工讀生/評審端的通知鈴鐺永遠是空的(Discord 事件已補齊,缺的是站內鈴鐺) |
| GAP-14 / GAP-16 / GAP-17 | 統計與匯出、社團導覽首頁、公開頁 |
| GAP-15 | 待審申請彙整頁(報修/借用/活動的待審件併看) |

可改進但不排期的方向見 [`improvements.md`](improvements.md)。

## 本批已完成

| 項目 | 內容 |
|---|---|
| **待審筆數徽章** | `GET /badges` 一支端點回該角色所有頁面的待辦數(鍵=前端 nav item key),四端側欄與行政總覽六張卡共用。只有「有時效性或在等使用者下一步」的頁面給數字;行政端依權限鍵過濾,申請審核算的是簽得下去的關卡 |
| **Discord 分流** | 社團事件與公告只推各社團自設的 webhook;`.env` 的 `DISCORD_WEBHOOK_URL` 收無社團可推的系統事件與 infra 告警 |
| **Uptime Kuma 心跳** | 後端 lifespan 每 30 秒推一次:backend 以 `SELECT 1` 的來回當 ping,frontend 由後端探測 web 容器成功才推 up。只在 `ENV=prod` 送出,且假設單 worker |
| **簽核關卡授予** | `APPROVAL_STAGES` 隨 `/auth/me` 下發,權限彈窗與頁面權限一起授出 —— 先前三把鍵沒有任何授予入口,而 super 不得代簽學務長關 |
| **權限接管路徑** | `set_permissions` 補上位階檢查,四個端點同一條守衛 |
| **應用層 log** | `main.py` 補 `basicConfig`(uvicorn 只設定自己的 logger,root 無 handler);`httpx` 壓到 WARNING —— 它在 INFO 記完整 URL,而 Kuma push 尾段與 Discord webhook 路徑都是憑證 |
| **MIG-08** | 遷移範圍限 114-1 / 114-2 / 115-1 三學期,社員名單全遷;media 與舊評鑑檔案庫不遷。腳本尚未實作過濾(MIG-09) |

## 驗證現況

- 後端 `CLUB_AIO_TEST_DB=<name> timeout 900 uv run pytest -q` → **464 passed**;前端 `pnpm test` → **120 passed**(27 檔)、`pnpm exec tsc -b --force` 0 錯、`pnpm run lint` 8 個既有的 fast-refresh warning
- `ruff check . ../migration` 全綠(CI 也 lint `migration/`);測試含 `test_migrations.py`(另開一個庫跑 `alembic upgrade head`,比對欄位、索引名與 CHECK 名 —— 後兩者是子集斷言,擋的是「模型有、revision 漏了」)
- `git log --all` 確認 `.env` 與 `migration/out` 從未進版控
- 每一個 commit 都做過 mutation 驗證:把修法改回舊寫法,確認新測試真的會紅

## 其他待處理

- **`MAIL_FROM_ADDRESS` 目前是開發者個人信箱**(`.env`,僅供測試)。正式環境要換成不綁個人的位址,且**必須與 `SMTP_USERNAME` 同網域**,否則校方 relay 拒收
- **結案退回的自動解鎖是永久的**:`close_unlocked` 沒有任何地方會設回 false,被退回過一次的結案從此不受期限約束(仍在逾期清單裡供追蹤)。這是 D-05 字面上的意思,但等於期限有一條誰都能走的路;若承辦覺得不妥,需要另外定「寬限幾天」的規則
- 開機的 `/auth/me` 沒有 timeout:後端連上但不回應時,前端會白畫面到 nginx 的 `proxy_read_timeout`(預設 60 秒)才顯示「無法確認登入狀態」。要收的話得先決定 timeout 值(`AbortSignal.timeout`)與失敗文案
- `c7e...` migration 的 downgrade 會刪除跨學期重複成員資料,部署前需決定是否接受此語意
- 內層 nginx 信任所有 RFC1918 網段,目前依賴 GCP firewall;正式部署可收窄至 edge/compose 實際來源

## 本機環境(此台 Mac)

- db 預設走 5432;OrbStack VM 佔用該埠時改 55432(`.env` `POSTGRES_PORT` + `compose.override.yml`,兩者皆不入版控)。pnpm 走 corepack
- 測試庫可平行:`CLUB_AIO_TEST_DB=<name>` 覆寫(多 worktree 各用一庫)
- 未進版控且刻意不入的檔案:`.env`、`start-dev.sh`(db 埠若被佔用另加 `compose.override.yml`)
