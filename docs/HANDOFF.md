# Session Handoff

> 「現在進行到哪、接下來做什麼」的交接快照。永久知識在三層 `AGENTS.md` 與 `docs/` 的設計文件;
> 需求方拍板的規則在 `docs/decisions.md`(永久保留);本檔過期即刪。

## 現在在哪

**開發庫已改用正式資料 snapshot**(不是 mock),demo 與後續開發都以它為準。
`docs/issues.md` 剩 15 項、`docs/gaps.md` 的未完成功能剩評鑑鏈與幾項延伸。

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

### 三、下一個 session 要做的一件

| 項目 | 內容 |
|---|---|
| **UI 標點全形化** | `design-guide.md` §7 定案:畫面字串一律全形、不寫句號。現況待改 —— 句號 2、半形逗號 15、半形括號 23、半形冒號 22 |

### 四、其餘單獨排程

| 項目 | 內容 |
|---|---|
| ISS-90 | 併發、權限矩陣、時區邊界測試。前端元件測試環境已建,可直接動工 |
| ISS-94 | 兩處清單無分頁(行政端社團總覽、報名名單;報名那支後端也沒有分頁) |
| ISS-95 / ISS-96 | 徽章與評鑑卡導向的頁面看不到它們數的東西;要收得先讓 `/club/activities` 收「全部學期」 |
| ISS-67 / GAP-18 鈴鐺 | 行政/工讀生/評審端的通知鈴鐺永遠是空的(Discord 事件已補齊,缺的是站內鈴鐺) |
| GAP-14 / GAP-16 / GAP-17 | 統計與匯出、社團導覽首頁、公開頁 |
| GAP-15 | 待審申請彙整頁(報修/借用/活動的待審件併看) |

可改進但不排期的方向見 [`improvements.md`](improvements.md)。

## 本批已完成

| 項目 | 內容 |
|---|---|
| **結案期限改天制** | 設定鍵 `close_lock_days`(1–366,預設 30),期限推導 `結束日 + N 天`,SQL 端 `date + 整數`;既有值以 1 個月=30 天遷移(`a3f7c2e91b48`,含資料換算測試)。`add_months` 只剩違規銷案在用,已移到 `violation_service` |
| **繳交確認決定評鑑分數** | ad2–ad4 改為完全以承辦勾的三個確認為準(D-14),`evaluation.py` 不再數照片張數與心得筆數 —— 社團交紙本時承辦勾了就算數。預設勾選由「已落庫的旗標**且**內容達門檻」推導(照片 5 張或影片、報告表這一列存在、心得 3 篇),只是初值。承辦核准是唯一由人填這三欄的地方(社團重送結案會整份取代 report、旗標回到預設 true),寫完即 `closed`。詳情端點一併帶出三個旗標;手上這份不確定是最新的就不給核准 |
| **三處清單的分頁** | 待審結案 8 / 逾期未結案 10 / 待審佇列 8(前端切,ISS-94 少一處)/ 最近審核 10。頁碼只在查詢成功後收斂(社團端總覽的公告卡同一條)—— 失敗時 `total` 會塌成 0,一起 clamp 會把錯誤說明洗掉 |
| **參考數字去重** | `MIN_PHOTOS` / `MIN_REFLECTIONS` 由 `features/activities/types.ts` 匯出,結案頁與結案審核共用。兩者都只是給人看的門檻,不再參與計分 |

## 驗證現況

- 後端 `CLUB_AIO_TEST_DB=<name> timeout 900 uv run pytest -q` → **470 passed**;
  前端 `pnpm exec tsc -b --force` 0 錯、`pnpm run lint` 8 個既有的 fast-refresh warning
- 前端 `pnpm test` → **146 passed**(34 檔)
- `ruff check . ../migration` 全綠
- 新測試逐一做過 mutation 驗證(把修法改回舊寫法會紅)。**clamp 的 `isSuccess` 守衛沒有測試接得住** ——
  拿掉它前後端測試全綠,要測得出來得先有能模擬查詢失敗的真實 query client

## 開發庫(正式資料 snapshot,2026-08-24 dump)

`legacy_clubs`(pg 容器內)、`legacy/clubclass/cc_2026-08-24.sql` 與
`legacy/club_media/`(17 GB,照片來源)都在本機,重建流程:

```bash
cd backend
uv run python scripts/reset_db.py --yes
uv run python ../migration/cms_import.py          # 159 社、30,570 成員、1,532 活動、2,228 簽核、8 公告
docker run -d --name cc-legacy -p 127.0.0.1:3307:3306 \
    -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=cc mysql:8.0
docker exec -i cc-legacy mysql --default-character-set=utf8mb4 -uroot -proot cc \
    < ../../legacy/clubclass/cc_2026-08-24.sql
uv run python ../migration/cc_import.py           # 15,108 場地借用、8,140 器材借用、25 器材
uv run python ../migration/media_import.py        # 4,000 張結案照片、4.9 GB
uv run python ../migration/text_fields.py --export  # 1,185 列待人工轉錄的 CSV
```

**照片會佔 `backend/data/uploads/` 4.9 GB**;`media_import.py --reset` 會連盤上檔案一起清,
而且**必須跑在 `cms_import.py --reset` 之前**(cms 那支會刪光 system=cms 的 id-map,
先跑它照片就變成清不掉的孤兒;cms_import 已加防呆擋下)。
**別在這個庫跑 `seed_mock.py`** —— 它會 `rmtree` 整個 UPLOAD_DIR。

查舊 MySQL 一律加 `--default-character-set=utf8mb4`,否則中文顯示成 `????`(資料是好的)。

遷移產出的一次性密碼在 `migration/out/one_time_passwords_*.csv`(不入版控)。
**2026-08-24 重跑後已把全部 177 個帳號改成 `Demo@12345` 並關掉首登強制改密**
(`scripts/set_passwords.py --all --password 'Demo@12345' --no-change-required --yes`),
先前 `SWEEP@12345` 那套不再適用。要換回一次性密碼就重跑遷移,
或用同一支腳本挑角色/帳號分批設。

## MIG-13 人工轉錄:進行中(2026-08-24)

**做到哪**:`migration/out/fill/` 底下 32 個 shard,**841/924 列已填**(91%)。
合併後的成品 `migration/out/activity_texts_2026-08-24_filled.csv` 已實測匯入成功
(活動內容 1,167、成果 772、心得 2,104 篇;4 列因活動未結案沒有 report 可寫而跳過,屬預期)。

**還要做的三件事**

1. **補完 83 列**:`shard-24`(0/38)、`shard-25`(0/43)、`shard-30`(27/29)。
   開 sonnet agent,prompt 只需要:讀 `migration/out/fill/INSTRUCTIONS.md`,做 `shard-NN.json`,
   只寫自己的 `shard-NN.jsonl`。shard-30 是續作,要指明補哪幾個 legacy_id、用 append 不要重寫。

2. **補匿名回饋(86 列待複查)**:`shard-01`~`shard-11` 與 `shard-32` 是在指令補上
   「匿名回饋、滿意度統計 → `填_成果_目標達成`」**之前**跑的,那批 agent 遇到「像心得但沒署名」
   的段落一律整組丟掉。已確認的實例:`14856`(10 篇無署名新生心得約 1,000 字整批消失)、
   `15020`。待複查清單 = 這些 shard 裡所有沒輸出心得的列,用這段程式重算:

   ```python
   # 在 migration/out/fill/ 下跑
   import json, os
   for n in ['shard-%02d' % i for i in [1,2,3,4,5,6,7,8,9,10,11,32]]:
       for l in open(n + '.jsonl'):
           d = json.loads(l)
           if not any(k.startswith('填_心得') for k in d):
               print(n, d['legacy_id'])
   ```

   複查 agent **不要動既有的 `shard-NN.jsonl`**,另寫 `shard-NN-fix.jsonl`,一行只放
   `legacy_id` + 要改的那幾欄。merge 端是欄位級疊加,不會把整列蓋掉。

3. **全量交叉抽查**:已抽 30 列(兩批各 15),batch A 全乾淨、batch B 13 乾淨 2 列踩到上面第 2 點。
   補完後再抽一輪,重點看捏造、心得姓名系級對調、檢討內容有沒有漏進成果三欄。

**指令**

```bash
python3 migration/fill_shards.py split --budget 200000   # 重切(母 CSV 換了才需要)
python3 migration/fill_shards.py merge                   # *.jsonl → *_filled.csv + 問題報告
uv run python ../migration/text_fields.py --import migration/out/activity_texts_2026-08-24_filled.csv
```

`migration/doc_text.py --all` 已把 2,676 個附件抽成純文字放在 `migration/out/text/`,有快取,不用重跑。

**已知且不打算處理**:來源寫「其他執行狀況與成果:無」時,有的列照抄「無」、有的留空 ——
兩種讀法都成立,不值得為此再跑一輪。

## 其他待處理

- **D-14 會讓遷移件的 ad2 與 ad4 往上跳**:評鑑視窗內已結案的遷移活動,照片確認與心得確認多數是
  true(來自舊系統)。照片已於 2026-08-24 補遷(MIG-12,4,000 張),**心得列仍是 0** ——
  要等 `text_fields.py` 的人工轉錄 CSV 填完匯入(MIG-13)。學年末跑評鑑前,
  承辦要知道 ad4 這批分數的來源是舊系統的旗標,不是庫裡真的有心得

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
