# Session Handoff

> 「現在進行到哪、接下來做什麼」的交接快照。永久知識在三層 `AGENTS.md` 與 `docs/` 的設計文件;
> 需求方拍板的規則在 `docs/decisions.md`(永久保留);本檔過期即刪。

## 現在在哪

**開發庫已改用正式資料 snapshot**(不是 mock),demo 與後續開發都以它為準。
`docs/issues.md` 剩 12 項、`docs/gaps.md` 的未完成功能剩評鑑鏈與幾項延伸。

接下來不是照清單逐項修,而是挑一整條線來做(評鑑鏈是最大的一條),
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
| 政府行事曆假日 | 匯入腳本已就緒(`scripts/import_holidays.py`),**上線年度還沒跑** |
| `.env` 正式值 | `MAIL_FROM_ADDRESS` 是個人信箱要換;Uptime Kuma 兩支 push URL 待填 |
| 借用的遷移範圍 | 活動已依 `SCOPE_FIRST/LAST_SEMESTER` 過濾;借用是否同受此限制未定(MIG-10) |
| 行政帳號權限 | 遷移進來的 15 個 admin 權限鍵全空,只有 `super` 看得到東西;分工由承辦決定 |
| 工讀生帳號 | 舊系統沒有這個角色,遷移後 `role=staff` 是 0 筆,上線前要開 |

### 三、其餘單獨排程

| 項目 | 內容 |
|---|---|
| ISS-90 | 併發、權限矩陣、時區邊界測試。前端元件測試環境已建,可直接動工 |
| ISS-94 | 三處清單無分頁(申請審核佇列、行政端社團總覽、報名名單;報名那支後端也沒有分頁) |
| ISS-95 / ISS-96 | 徽章與評鑑卡導向的頁面看不到它們數的東西;要收得先讓 `/club/activities` 收「全部學期」 |
| ISS-67 / GAP-18 鈴鐺 | 行政/工讀生/評審端的通知鈴鐺永遠是空的(Discord 事件已補齊,缺的是站內鈴鐺) |
| GAP-14 / GAP-16 / GAP-17 | 統計與匯出、社團導覽首頁、公開頁 |
| GAP-15 | 待審申請彙整頁(報修/借用/活動的待審件併看) |

可改進但不排期的方向見 [`improvements.md`](improvements.md)。

## 本批已完成

| 項目 | 內容 |
|---|---|
| **遷移範圍落地** | `cms_import.py` 依 `SCOPE_FIRST_SEMESTER`/`SCOPE_LAST_SEMESTER` 過濾活動(14,239 → 1,495);公告全遷(MIG-11);匯入輸出會印出範圍外未讀取、接不回活動的筆數 |
| **輸出 schema 不驗證庫裡的內容** | `BudgetItemOut`/`ReflectionOut` 不再繼承 `*In` —— 舊資料超過輸入限制時會讓讀取端點 500(實測 60 個活動打不開)。規則進 `AGENTS.md` 的坑清單 |
| **「借用中」只收進行中的單** | 判定收進 `booking_service` 的 `*_ongoing_expr`,行政端 `active` 參數補齊。臨時借用兩端界線不同(社團取消看節次起點、承辦撤銷看借用日),各用各的 |
| **社團端總覽分頁** | 三張卡各自分頁(待辦 8 列、公告 10 列走伺服器分頁、進行中申請 10 列);頁碼由 `lib/paging.clampPage` 收斂 |
| **活動深連結** | `types.activityPath` 產生 `/activities?semester=&open=`,總覽、結案送出、申請儲存/送出四個入口共用;列表換學期同步網址 |
| **活動詳情呈現** | 工作分配走 `WorkTable`(項目 / 負責人兩欄,對齊寬度排除離群長句);經費三欄右對齊、合計置右下、欄寬由內容決定;`SectionTitle` 三處共用。申請審核與結案審核同一套 |
| **核定金額** | 社團端看得到核定;`null`(還沒核定)與 `0`(核了 0 元)分開顯示。**能不能核**只看擬請,**看不看得到**還要看實際核了多少 —— 遷移資料有「沒申請卻核發」的列 |
| **補登社團** | 報名補登改用 `ClubCascader`,全站社團選擇只剩工讀生違規表單還是平鋪下拉(ISS-97) |

## 驗證現況

- 後端 `CLUB_AIO_TEST_DB=<name> timeout 900 uv run pytest -q` → **467 passed**;
  前端 `pnpm exec tsc -b --force` 0 錯、`pnpm run lint` 8 個既有的 fast-refresh warning
- 前端 `pnpm test` → **136 中 133 passed**;紅的 3 條是 `lib/selectOptions.test.ts`(2)與
  `features/admin/intakeWindow.test.ts`(1),文案改了但斷言沒同步
- `ruff check . ../migration` 全綠
- 每一個 commit 都做過 mutation 驗證:把修法改回舊寫法,確認新測試真的會紅

## 開發庫(正式資料 snapshot)

`legacy_clubs`(pg 容器內)與 `legacy/clubclass/cc_2026-07-21.sql` 都在本機,重建流程:

```bash
cd backend
uv run python scripts/reset_db.py --yes
uv run python ../migration/cms_import.py          # 159 社、30,477 成員、1,495 活動、8 公告
docker run -d --name cc-legacy -p 127.0.0.1:3307:3306 \
    -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=cc mysql:8.0
docker exec -i cc-legacy mysql -uroot -proot cc < ../../legacy/clubclass/cc_2026-07-21.sql
uv run python ../migration/cc_import.py           # 15,635 場地借用、8,135 器材借用、25 器材
```

查舊 MySQL 一律加 `--default-character-set=utf8mb4`,否則中文顯示成 `????`(資料是好的)。

匯入帳號一律 `must_change_password=True`,明碼在 `migration/out/one_time_passwords_*.csv`
(不入版控)。目前庫裡另設了 demo 用帳號:`super`、`502`(絃韻吉他社)、`702`(熱門舞蹈研習社)、
`pt_demo`(工讀生),密碼皆 `Demo@12345`;其餘 156 個社團帳號是掃描用的 `SWEEP@12345`。

## 其他待處理

- **`MAIL_FROM_ADDRESS` 目前是開發者個人信箱**(`.env`,僅供測試)。正式環境要換成不綁個人的位址,
  且**必須與 `SMTP_USERNAME` 同網域**,否則校方 relay 拒收
- **結案退回的自動解鎖是永久的**:`close_unlocked` 沒有任何地方會設回 false,被退回過一次的結案
  從此不受期限約束(仍在逾期清單裡供追蹤)。這是 D-05 字面上的意思,但等於期限有一條誰都能走的路;
  若承辦覺得不妥,需要另外定「寬限幾天」的規則
- 開機的 `/auth/me` 沒有 timeout:後端連上但不回應時,前端會白畫面到 nginx 的 `proxy_read_timeout`
  (預設 60 秒)才顯示「無法確認登入狀態」。要收的話得先決定 timeout 值與失敗文案
- `c7e...` migration 的 downgrade 會刪除跨學期重複成員資料,部署前需決定是否接受此語意
- 內層 nginx 信任所有 RFC1918 網段,目前依賴 GCP firewall;正式部署可收窄至 edge/compose 實際來源

## 本機環境(此台 Mac)

- db 預設走 5432;OrbStack VM 佔用該埠時改 55432(`.env` `POSTGRES_PORT` + `compose.override.yml`,
  兩者皆不入版控)。pnpm 走 corepack
- 測試庫可平行:`CLUB_AIO_TEST_DB=<name>` 覆寫(多 worktree 各用一庫)
- 未進版控且刻意不入的檔案:`.env`、`start-dev.sh`、`migration/out/`
