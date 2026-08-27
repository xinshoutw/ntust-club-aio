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

### 〇、工讀生與評審頁面鏡射到行政端(2026-08-27,決策見 `decisions.md` D-26)

| 項目 | 內容 |
|---|---|
| **兩組頁面整組再掛一次** | `/admin/pt/*`(5 頁)與 `/admin/viewer/*`(3 頁)共用同一批元件與同一批端點,只換路徑前綴;側欄項目 key 不變,徽章沿用後端出的 `pt-*` / `v-*`,不必為行政端另備一份 |
| **一組一把鍵** | `astaff`(工讀生作業)、`aviewer`(評審評分)—— 是 D-01「一頁一鍵」的唯二例外,理由同 `asignup`。權限彈窗與白名單全由 `core/permissions.ADMIN_PAGES` 推導,沒有第二份要同步 |
| **後端閘門** | `require_staff` / `require_viewer` 放行持該鍵的管理員(super 全通);admin 走 `aviewer` **不吃 `can_view_eval`** —— 那是評審帳號的開關,管理員身上一律是預設值 |
| **不附帶檔案權** | 兩把鍵都不對上任何檔案類型。`aviewer` 特別要守住 —— admin 分支的下載不做指派範圍檢查,給了 `eval_upload` 就是讓一把「只多三頁」的鍵拿到全校全年度的佐證檔 |
| **空狀態說得出原因** | 管理員沒有評審指派,那一組必定是空的;「我負責的評分」在 `/admin/` 前綴下改說「此帳號尚未被指派為評審」,不然承辦分不出是權限沒生效還是系統壞了 |

**已知並接受**:行政端的「我負責的評分」看到的仍是**自己**被指派的分組,管理員沒被指派就是空的。
要看全校評分進度是另一頁(GAP-03),這次沒有把它改成總表。

### 一、demo 回饋四項(2026-08-27,決策見 `decisions.md` D-17～D-20)

| 項目 | 內容 |
|---|---|
| **結案重點依類型改字** | 社課或會議=「課程重點」、活動=「活動重點」。單一 `highlightsLabel`(`features/activities/types.ts`)供社團端結案填寫、活動詳情彈窗與行政端結案審核共用 |
| **經費來源預填** | 申請審核的經費來源預填「學務處補助」。只在有申請補助且尚未認定過的單預填,送出時再以**核定**總額為準 —— 核定 0 元又沒被承辦人改過的那一格送原值,那一欄會原樣印進申請表的意見回饋 |
| **英文名稱改由行政端維護** | 社團端唯讀,編輯在行政端管理項目的「帳號與狀態」卡;`ClubProfileUpdate` 拿掉 `en_name`。清空存 NULL |
| **網頁連結與簡介必填** | 前端只在**這次真的要存 profile** 時擋(`fields.profileChanged`,與送不送 PATCH 同一個判定)—— 密碼是同一張表單的另一支 API;後端只要帶了這兩欄就必須非空 |
| **借用聯絡電話格式** | 只收 **09 開頭的 10 碼手機或 4 碼校內分機**;輸入只留數字,**邊打邊補 `-`**(第 5 碼與第 8 碼各一個 → `0912-345-678`)。超過 10 碼不截斷 —— 截尾會把 `2733-3141#7604` 悄悄變成一支合法卻不是他要留的號碼。行政手動借用維持寬鬆白名單(補登紙本舊件) |

**已知並接受**:網頁連結必填 = 每個社團最後都會有連結,評鑑 ad6「有連結即 5 分」因此人人滿分。
需求方表示可接受;要保留鑑別度是改 ad6 的判準,不是鬆綁這條必填。

### 二、不再記錄電話等四項(2026-08-27,決策見 D-21～D-24)

| 項目 | 內容 |
|---|---|
| **成員名單不記錄電話** | `club_members.phone` drop(`d7b2c85f4a19`),前後端與 CSV 都拿掉,`cms_import` 不再讀 `Club_student.Phone`。貼進來的舊五欄 CSV 仍收得下,第 5 欄忽略 |
| **指導老師不記錄電話** | `clubs.advisor_phone` / `advisor_out_phone` drop(`c9a4f1e72d38`),`Club_teacher.Phone` 不再遷入 |
| **終態顯示詞改「已完成」** | 幹部證明與郵局帳戶異動共用同一個 `COMPLETED` 與同一顆 pill,兩頁一起改;「請洽學務處領取」留在 Discord 訊息裡 |
| **結案鎖定預設 21 天** | 只動 `settings_service.DEFAULTS`;`system_settings` 已存過這一列的環境維持承辦設定的值 |
| **狀態可跳過「處理中」** | 幹部證明與郵局帳戶異動:審核中可直接改已完成(D-25),回退仍擋 409。維修管理維持單步前進 —— 那邊的處理中代表師傅真的在修 |

**要跑遷移**:兩支 revision 是 drop column,`uv run alembic upgrade head` 之後舊號碼就沒了。
本機開發庫(正式資料 snapshot)重建流程見下一節。

## 驗證現況

- 後端 `CLUB_AIO_TEST_DB=<name> timeout 900 uv run pytest -q` → **522 passed**;`ruff check .` 全綠
- 前端 `pnpm exec tsc -b --force` 0 錯、`pnpm run lint` 8 個既有的 fast-refresh warning
- 前端 `pnpm test` → **200 passed**(42 檔)
- 新測試逐一做過 mutation 驗證(把修法改回舊寫法會紅):經費來源預填的三條路徑、
  簡介/網頁連結必填、社團端 `en_name` 被忽略、借用電話格式與不截斷、`profileChanged`、
  清空英文名稱存 NULL、狀態跳關與回退兩個方向;鏡射這批另做了 staff/viewer 閘門、
  行政端徽章併表、`MyReviewsPage` 前綴導向與空狀態、側欄鏡射五處

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

## 本機開發庫落後遷移腳本(2026-08-24,刻意不重建)

`club_aio` 這個庫是在 `1ca95a8`～`eb0b273` 那批 `fix(migration)` **之前**建的,
之後只補跑過 `text_fields --import`。填好的 CSV 匯進去是對的(心得 2,299 篇 / 726 個活動,
與下方端到端驗證值一致),但**底層資料對不上**:

| | 這個庫 | 端到端驗證值 |
|---|---|---|
| `activities.content` 有值 | 1,171 | 1,511 |
| `activity_reports` | 956 | 961 |
| `approval_records` 退件列 | 0 | 應有(73ff25b) |

差異全部來自沒套用的遷移修正,不是 CSV 的問題:`content` 少的 340 筆是新版 `cms_import`
會從舊系統活動描述預帶的;`reports` 少的 5 筆是舊 `status=11`(退回核銷)——
`(5, 6, 11)` 已修,但 `import_activities` 是 idempotent,重跑不補既有列。

**要拿正確數字就整個重建**(`reset_db` → `cms_import` → `cc_import` → `media_import`
→ `text_fields --import` → `set_passwords`,約 15 分鐘)。在那之前,這個庫只適合看畫面,
不適合拿來對數字。CSV 匯入前的 `activities.content` 與 `activity_reports` 三欄快照留在
`_bak_before_textimport_activities` / `_bak_before_textimport_reports`(重建時一併消失)。

## MIG-13 人工轉錄:轉錄完成(2026-08-24)

**成品**:`migration/out/activity_texts_2026-08-24_filled.csv`,**924/924 列全填**
(另 261 列刻意不派工 —— 活動未結案,成果與心得在 import 端本來就會被跳過,活動內容則已由
`cms_import` 從舊系統的活動描述預帶)。

全新庫端到端實跑(`reset_db` → `cms_import` → `text_fields --import`)的結果:

| | 筆數 |
|---|---|
| `activities.content` 有值 | 1,511 / 1,532 |
| `activity_reports` | 961(執行成效 838、目標達成 790、其他 491) |
| `activity_reflections` | 2,299 篇,分佈在 726 個活動 |

4 列因活動未結案(沒有 report)被跳過,屬預期。最長心得 1,138 字、最長成果欄 1,723 字,
都在 schema 上限內。

**做法留檔**(要重跑或補資料時看這裡)

```bash
python3 migration/doc_text.py --all                      # 附件 → 純文字(2,676 檔,有快取)
python3 migration/fill_shards.py split --budget 200000   # 依文字量切工作包
python3 migration/fill_shards.py merge                   # *.jsonl → *_filled.csv + 問題報告
uv run python ../migration/text_fields.py --import migration/out/activity_texts_2026-08-24_filled.csv
```

agent 的轉錄規則在 `migration/out/fill/INSTRUCTIONS.md`。merge 是**欄位級疊加**,要補某一欄
只需另寫 `shard-NN-fix.jsonl`,一行放 `legacy_id` + 那幾欄,不必重打整列。

**已知未處理**

- **匿名回饋可能漏抄**:「無署名的參與者回饋 / 滿意度統計 → `填_成果_目標達成`」這條規則是
  第一波 agent 派出**之後**才補進 INSTRUCTIONS.md 的,所以 `shard-01`~`shard-11` 與 `shard-32`
  那批遇到「像心得但沒署名」的段落會整組丟掉。抽查確認的實例:`14856`(10 篇無署名新生心得
  約 1,000 字整批消失)、`15020`。待複查的列 = 這些 shard 裡所有沒輸出心得的**86 列**,重算:

  ```python
  # 在 migration/out/fill/ 下跑
  import json
  for n in ['shard-%02d' % i for i in [1,2,3,4,5,6,7,8,9,10,11,32]]:
      for l in open(n + '.jsonl'):
          d = json.loads(l)
          if not any(k.startswith('填_心得') for k in d):
              print(n, d['legacy_id'])
  ```

  2026-08-24 當下決定**不做**,因為漏掉的是補充性質的回饋,成果三欄與具名心得都沒受影響。
- 「其他執行狀況與成果:無」有的列照抄「無」、有的留空 —— 兩種讀法都成立,不打算統一。

**抽查結果**:兩批各 15 列對回原始 PDF/DOCX,batch A 全乾淨,batch B 13 乾淨、2 列踩到上面的
匿名回饋問題。沒有捏造、沒有心得姓名系級對調、沒有檢討內容漏進成果三欄。

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
