# Session Handoff

> 交接快照:現在到哪、接下來做什麼。永久知識在三層 `AGENTS.md` 與 `docs/`,
> 需求方拍板的規則在 `docs/decisions.md`;本檔過期即刪。

## 現在在哪

開發庫用的是**正式資料 snapshot**,demo 與後續開發都以它為準。
`docs/issues.md` 剩 15 項,`docs/gaps.md` 剩評鑑鏈與幾項延伸。

接下來挑一整條線做(評鑑鏈最大),或先清上線檢查表的阻擋項。

## 接下來做什麼

### 一、評鑑彙總鏈(建議當單一開發段落)

GAP-01 → 02 → 03 → 04,連帶 ISS-04、ISS-20、ISS-12c/GAP-08b、GAP-07、GAP-19。
**不要拆散**:分組與評審指派沒有寫入 API(GAP-01),評審端三頁在正式環境永遠是
「尚未被指派評分」(ISS-04),後面的總表與結果頁都建立在它上面。

DEC-01:這學年評鑑在新系統跑,但學年末才用 —— 不擋上線。

### 二、上線檢查表的阻擋項(`DEPLOY_CHECKLIST.md`)

| 項目 | 現況 |
|---|---|
| 備份排程 | 腳本就緒(`scripts/backup_db.sh`),**cron 未掛** |
| 政府行事曆假日 | 腳本就緒(`scripts/import_holidays.py`),**上線年度未跑** |
| 遷入借用的打錯日期 | 腳本就緒(`scripts/fix_booking_dates.py`),開發庫已跑、**正式庫未跑** |
| `.env` 正式值 | `MAIL_FROM_ADDRESS` 是個人信箱;Uptime Kuma 兩支 push URL 待填 |
| 借用的遷移範圍 | 活動已依 `SCOPE_FIRST/LAST_SEMESTER` 過濾,借用是否同受此限未定(MIG-10) |
| 行政帳號權限 | 遷移進來的 15 個 admin 權限鍵全空,只有 `super` 看得到東西;分工由承辦決定 |
| 工讀生帳號 | 舊系統沒有這個角色,遷移後 `role=staff` 是 0 筆,上線前要開 |

### 三、下一個 session 一件

**UI 標點全形化**(`design-guide.md` §7):現況待改 —— 句號 2、半形逗號 15、半形括號 23、半形冒號 22。

### 四、其餘單獨排程

| 項目 | 內容 |
|---|---|
| ISS-90 | 併發、權限矩陣、時區邊界測試(前端元件測試環境已建) |
| ISS-94 | 兩處清單無分頁(行政端社團總覽、報名名單;報名那支後端也沒有) |
| ISS-95 / ISS-96 | 徽章與評鑑卡導向的頁面看不到它們數的東西;要先讓 `/club/activities` 收「全部學期」 |
| ISS-67 / GAP-18 | 行政/工讀生/評審端的站內鈴鐺永遠是空的(Discord 事件已補齊) |
| GAP-03 | 全校評分進度總表 —— 行政端「我負責的評分」看的是自己被指派的分組,管理員沒被指派就是空的 |
| GAP-14 / GAP-16 / GAP-17 | 統計與匯出、社團導覽首頁、公開頁 |
| GAP-15 | 待審申請彙整頁(報修/借用/活動併看) |

不排期的方向見 [`improvements.md`](improvements.md)。

## 本批已完成(2026-08-27)

理由與細節在 `decisions.md`,這裡只記做了什麼。

| 決策 | 內容 |
|---|---|
| D-17～D-20 | 結案重點依活動類型改字;經費來源預填「學務處補助」;英文名稱改行政端維護;網頁連結與簡介必填;借用電話限 09 開頭 10 碼或 4 碼分機 |
| D-21～D-22 | 成員與指導老師都不記錄電話 —— 兩支 drop column(`d7b2c85f4a19`、`c9a4f1e72d38`),遷移端也不再讀 |
| D-23～D-25 | 終態顯示詞改「已完成」;結案鎖定預設 30 → 21 天;幹部證明與郵局帳戶異動可跳過「處理中」 |
| D-26 | 工讀生與評審頁面鏡射到行政端(`/admin/pt/*`、`/admin/viewer/*`),`astaff` / `aviewer` 一組一把鍵 |
| D-27 | 負責人與副負責人不寫職稱;舊系統的非標準寫法仍用來認人,原文捨棄 |

**社團評鑑入口反灰**(2026-08-31):社團端「資料總覽」與行政端「行政分審核」不可點,
hover 顯示「目前未開放」(`lib/nav.EVAL_UNBUILT`)。收的**只有側欄入口** —— 路由與頁面都還在,
直接輸入網址進得去;評審端三頁不收(那是評審帳號唯一的工作面)。GAP-01～04 做完就把那兩個常數拿掉。

**活動審核的「備註」**(2026-08-31,D-33/D-34):`activities.admin_note`,承辦人留給社團的話,
**任一關都寫得動**、空字串即清空。與經費來源一起印進申請表的「意見回饋」,
**原本固定接在後面的結報提醒一併移除**(系統自己會催結案,那句樣板還會蓋掉承辦想說的話)。
社團端的活動詳情**改用行政端那支審核彈窗**(`viewer="club"`),`ActivityPreviewModal` 已刪除 ——
章軌、大型認可、繳交確認與關卡說明都收掉,footer 換回繼續編輯/前往結案。

**借用情形色格圖三端共用**(2026-08-31):社團端借用總覽那張圖抽成 `features/bookings/BookingGrid.tsx`,
資料改走免登入的 `/public/*`(節次、場地、場況、器材佔用),社團端、行政端「臨時場地器材借用」
與**未登入首頁**讀同一份。呼叫端只決定點格去哪一頁:社團去申請頁、行政帶參數去手動借用
(`allowPast`,補登照樣點得動)、未登入不給入口即純預覽。
行政端原本那張專用場況圖的能力**疊回共用元件**:每格的 `pending`(該格全部待審單,含被
已核准或不開放蓋掉的)由 `availability_grids(with_pending=)` 一併回傳,**只給持 `abooking`
的承辦**(`api/v1/public._sees_pending`);有可審的格子就地開審核彈窗,多筆出選單。
原本的行政專用端點 `/admin/bookings/availability` 與 `admin_availability_grid` 已刪除。

**未登入的 `/`**(2026-08-31):借用情形的公開預覽,右上角登入鈕進 `/login`;
其餘社團路徑未登入仍轉 `/login`。GAP-16 的社團導覽頁還沒做。
匿名看得到借用社團名與不開放原因 —— 判定為可接受(等同貼在場地門口的資訊),要收就改後端。

**幹部證明可駁回**(2026-09-01,D-37):`/admin/certificates` 的狀態下拉多一個終態「已駁回」
(`ApplicationStatus.DECLINED`),審核中與處理中皆可直接駁回、不附原因,和「已完成」一樣不可再改。
社團端落在「最近申請」那張表;下拉選了駁回會先跳確認(只有這個選項問,損害不對稱)。
**郵局帳戶異動不跟進** —— 值域(CHECK)兩張表一起放寬,狀態機分兩份
(`_CERT_NEXT` / `_ALLOWED_NEXT`),郵局那頁連選項都不列。要跑遷移(`c4e8b17d2f60`)。
順帶把社團端郵局徽章的 `!= COMPLETED` 改成白名單(值域放寬後那寫法會多算)。

**學務長的視野只有第三關**(2026-09-01,D-38):持 `approve_dean` 的帳號在 `/admin/review`
待審佇列只有 `pending_dean`、最近審核只有**簽過第三關**的單(`approval_records` 有 dean 那一列,
核准與退回皆算),側欄徽章數同一個集合。判定不是狀態 —— 核定 0 元當場核准(D-16)的單同樣是
`approved` 卻沒到過他手上。收的是整個行政端活動讀取面(清單、學期下拉、詳情、申請表 PDF 共用
`activity_service.scope_sql`),`super` 與頁面鍵都壓不過這條。

**器材歸還時限與放假日進系統設定頁**(2026-09-02):`equipment_return_time`(HH:MM)與 `holidays`
表都能在 `/admin/settings` 改了 —— 原本前者只能直接動 DB、後者只能進主機跑
`scripts/import_holidays.py`。整年份仍走腳本(一次 20 幾筆),卡片是補漏與臨時放假(颱風假)用;
週六日不收(兩端都擋),刪除要先確認。稽核多 `holiday_created`/`updated`/`deleted` 三個動作。
讀取端另補了 fail-safe(`booking_service.parse_return_time`):壞值(手改 DB、`"10:30:00"`)
退回預設 10:30 並記 warning,不再讓側欄徽章、三張點交清單、逾期追蹤與 cron 催還一起變 500。

**器材借用核准可改數量**(2026-09-07):`POST /admin/equipment-loans/{id}/approve` 收選填 `{qty}`
(1 到申請數,只能往下調),審核彈窗多一格「核准數量」(預設=申請數,可借數警示改比這個數)。改了就覆寫
`equipment_loans.qty`,申請數只留在 `approval_records.reason`(「數量調整:5 → 3」)與稽核 detail,
Discord 通知尾綴「申請 5 件、核准 3 件」。社團總覽那張共用彈窗一併吃到。

**違規勸導可附現場照片/影片**(2026-09-07):`POST /staff/violations/{id}/attachments`,與空間報修
同一套兩段式(先主體、再逐檔),**選填**、至多 5 檔、不設加總上限(單檔上界 × 5 就是天花板)。
上限由新開的 `GET /staff/config` 供給(工讀生打不進 `/club/config`)。附件掛在被勸導的社團名下
(`files.club_id`,`subject_type=violation`),**三端列表都帶**:社團在自己的違規紀錄頁看得到、
行政端 `aviol` 下載得到(`FILE_SUBJECT_KEYS` 本來就有這一列)、工讀生端「違規紀錄查詢」多一欄
「附件」給未銷案的單補傳(開立時第二步失敗不必再開一張 —— 每張都扣行政分)。
只收未銷案的單、不限填寫人。檔案管理多一個模組 `viol`(磁碟前綴 `violations/`);
nginx 上傳白名單那條 location 改成同時涵蓋報修佐證與勸導附件。
**待拍板**:社團看得到附件是我判的(被勸導的依據理應給對方看),要收回就把 `club_id` 改 None
並把社團端 `attachments` 拿掉。Opus 交叉審查後補的:`FILE_SUBJECT_KEYS["violation"]` 加 `astaff`
(鏡射頁補傳得了就要開得了);前端佐證選檔與驗證改成只放行 mp4 / mov(webm/avi 後端本來就不收,
以前是到後端才 415,報修那頁一併改);核准改數量那句「數量調整:5 → 3」社團端借用列可點開
「核准說明」看到(`attach_decisions` 連留了話的 APPROVE 一起帶)。

**所有場地借用 / 所有器材借用**(2026-09-09):行政端「借用審核」多兩頁查閱用清單
(`/admin/venue-bookings`、`/admin/equipment-loans`),全校、全狀態、依學期,與「所有活動」同一種頁;
各配一把查閱鍵 `avenuelist` / `aloanlist`(帳號管理的權限彈窗自動多兩格)。**只開 GET**,
核准/退回/撤銷仍是 `abooking` 的事 —— 兩把都持有的人在本頁的彈窗一樣簽得動。後端兩支清單
多收 `semester=` 與可重複的 `club_id=`,各加一支 `/semesters`。共用彈窗補顯示送件時間與
退回/撤銷原因(含經手人),而且**沒接 `onApprove` 就不畫審核鈕**(原本會畫出按了只得到假成功的鈕)。
一個元件 `AdminBookingListPage` 吃 `kind`,兩條路由各帶 `key` 才不會互切時帶著上一頁的排序鍵。
頁名依 `design-guide.md` §7 用「場地」不用「教室」。
Opus 交叉審查後補的:`status=checked_out` 不帶 `overdue` 時**排除已逾期的列**(兩者底層同為
`checked_out`,原本勾「已借出」會連逾期單一起撈回,`test_equipment_overdue_filter` 的那句斷言跟著改);
固定場地借用那第三份 DTO 也接上 `created_at` 與處置三欄,`/admin/rooms` 與社團總覽的固定借用彈窗
從此看得到退回原因;新增跨鍵負向測試(`CROSS_READS`,兩個讀取鍵常數對調會紅)與 `useBookingList`
的查詢字串測試。**沒做**:社團漏斗仍只列啟用中社團(所有活動頁同一份判定,要改就兩頁一起);
`/admin/room-bookings` 的 `club_id` 仍是單值(三種借用兩支吃多值一支不吃,要用到再改)。

**學期下拉改數字排序、遷入的打錯日期有腳本修**(2026-09-09):所有列學期的端點
(`/admin/venue-bookings/semesters`、`/admin/equipment-loans/semesters`、`/admin/activities/semesters`、
`/club/activities/semesters`)與前端 `semesterOptions` 原本都拿字串比大小,民國 99 年會排在 100 年前面;
現在一律走 `core/semesters.semester_sort_key` / `lib/semester.semesterRank`。下拉裡的 90-1、-1909-1
這種學期**是資料問題**:clubclass 讓人手打日期,遷入的臨時場地借用有 89 筆借用日離建單時間超過一年
(2004、0110、2030 這種年),除了一筆已核准全是退回件;器材借用一筆都沒有。
`scripts/fix_booking_dates.py` 依「月日照舊、年份改成建單之後最先遇到的那一年」改回去,
不加 `--yes` 只預覽,冪等。**開發庫已跑過**(89 筆,`venue_bookings.date` 現在落在 2020–2026),
**正式庫還沒跑**(已列入 `DEPLOY_CHECKLIST.md`)。你點名的四組(118-1 → 2023、101-1 兩筆 → 2024、
105-2 與 106-2 → 2022)規則算出來的年份與你說的一致。

**核准後沒去領的器材借用由系統撤銷**(2026-09-09,D-40):`approved` 且結束日已過 → `cancelled`,
簽核紀錄一筆 REVOKE(簽核者空=系統;`approval_records.actor_id` 放寬可空,**要跑遷移 `e5a1c9d47b23`**)、
稽核 `role=system`、Discord D13b。掃的時機:點交清單每次載入(`GET /staff/equipment-loans?status=approved`)
與每日催還排程 `send_overdue_reminders.py`。實作 `services/loan_expiry.py`;ISS-93 據此收掉 ——
`equipment_loan_ongoing_expr` 與待借出清單都補了 `end_date >= today`,三份判定從此同一條。
**手動借用(`club_id` 空)不掃**(補登入口)。Opus 交叉審查後補的:掃描失敗不擋點交清單(rollback + log)、
點交端擋區間已過的單、`tests/test_migrations` 連 nullable 一起比(原本漏跑這支遷移不會紅)、
稽核頁補 `equipment_loan_expired` 與 `system` 角色的對照詞、`seed_mock` 的已核准借用改相對真實今天。

**HEIC 預覽、借用清單版面**(2026-09-09):iPhone 拍的結案照片是 HEIC,Chrome 解不了,縮圖與預覽彈窗一片破圖。
`GET /files/{id}` 現在看 `Sec-Fetch-Dest: image`(`<img>` 才帶)—— HEIC/HEIF/TIFF/BMP 轉成 JPEG 回去(AVIF 瀏覽器原生解得了,直接 inline)
(`services/files.preview_of`,pi-heif;快取 `<path>.preview.jpg`,`unlink_quiet` 連它一起刪),下載與 fetch 照舊原檔,
前端一行都沒改。轉失敗、來源超過 20MB 或超過 5,000 萬像素就給原檔並 log;同時最多轉 2 張(正式機 2 vCPU 與 PostgreSQL 同住);
暫存檔帶 uuid、失敗不留 `.part`;回應帶 `Vary: Sec-Fetch-Dest`。**新相依 `pi-heif`**(pillow-heif 的 decode-only 版:
wheel 只帶 LGPL 的 libheif/libde265,沒有 GPLv2 的 x265 —— codex 交叉審查抓到 pillow-heif 的 wheel 整個標 GPLv2,
映像推上 GHCR 就有散佈義務),映像重建即帶入。codex 那輪另補的:磁碟到 90% 告警就不再建新快取(已有的照給)、
轉檔改用專屬 2 條 thread pool(Semaphore 在請求被取消時會提早放行)、`media_import --reset` 不管原檔在不在都清快取、
兩頁的載入失敗改用 `isLoadingError`、日期欄補 `title`、「帳篷×2」不留空格;測試的 HEIC 改用固定位元組
(decode-only 編不出來),EXIF 方向是解碼器套的,那支測試驗的是結果。沒做的:轉檔與刪除同時發生時
快取可能被放回來(要 per-path 鎖,不值得),記在 `improvements.md`。
Opus 交叉審查後補的:`media_import --reset` 改走 `unlink_quiet`(原本裸 unlink 會留快取孤兒)、AVIF 改直接 inline、
場地頁不再打器材主檔(只持 `avenuelist` 會 403)、日期欄也截斷。沒做的(報修/違規/郵局那幾頁仍是下載連結、
縮圖沒有小尺寸、`<img>` 沒有 onError)記在 `improvements.md` §5。
「所有場地/器材借用」每一格改單行截斷(`useFitRows` 量第一列,一換行整頁列數算成一半)、器材欄 240px、
器材頁多一個器材漏斗(`equipment_id=` 可重複,`GET /admin/equipment` 讀取鍵多 `aloanlist`)。

**要跑遷移**:D-21/D-22 是 drop column,`alembic upgrade head` 之後舊號碼就沒了。
D-27 的殘留職稱不會被重跑遷移修好(`cms_import` 不更新既有列)—— 走 `--reset` 重灌,
或把該學期匯出再匯入一次。

## 驗證現況

- 後端 `CLUB_AIO_TEST_DB=<name> timeout 900 uv run pytest -q` → **620 passed**;`ruff check .` 全綠
- 前端 `pnpm exec tsc -b --force` 0 錯、`pnpm test` → **279 passed**(59 檔)、
  `pnpm run lint` 8 個既有的 fast-refresh warning
- 新測試做過 mutation 驗證(改回舊寫法會紅;已知例外:`exif_transpose` 那行拿掉不會紅,見測試 docstring);借用色格圖那支另在 `TZ=UTC` 與 `TZ=Pacific/Honolulu` 下各跑過一次

## 開發庫(正式資料 snapshot,2026-08-29 dump)

`legacy_clubs`(pg 容器內)、`legacy/clubclass/cc_2026-08-29.sql`、
`legacy/club_media/`(17 GB)都在本機。**`club_aio` 就是這份 snapshot 本身**
(2026-08-29 整庫重建,舊 demo 資料已全數清掉,以遷移結果為準),數字可以直接對。重建:

```bash
cd backend
uv run python scripts/reset_db.py --yes
rm -rf data/uploads/*                             # reset_db 不動盤上檔案,不清就是孤兒
uv run python ../migration/cms_import.py          # 157 社、30,575 成員、1,551 活動、2,256 簽核、8 公告
docker run -d --name cc-legacy -p 127.0.0.1:3307:3306 \
    -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=cc mysql:8.0
docker exec -i cc-legacy mysql --default-character-set=utf8mb4 -uroot -proot cc \
    < ../../legacy/clubclass/cc_2026-08-29.sql
uv run python ../migration/cc_import.py           # 15,152 場地借用、8,154 器材借用、25 器材
uv run python ../migration/media_import.py        # 4,054 張結案照片、4,893 MB
uv run python ../migration/text_fields.py --import ../migration/out/activity_texts_2026-08-29_filled.csv
uv run python scripts/set_passwords.py --all --password 'Demo@12345' --no-change-required --yes
```

端到端實跑(這個庫的實際值):`activities.content` 有值 1,530 / 1,551、`activity_reports` 973、
`activity_reflections` 2,323 篇、`files` 4,054、`approval_records` 2,992
(簽核 2,256 + 活動退件 59 + 借用退件 677)、`club_members` 30,575。

- 照片佔 `backend/data/uploads/` 4.9 GB;`media_import.py --reset` 連盤上檔案一起清,
  **必須跑在 `cms_import.py --reset` 之前**(cms 那支會刪光 system=cms 的 id-map,
  先跑它照片就成了清不掉的孤兒;已加防呆擋下)。整庫重建走 `reset_db` 時 id-map 一起沒了,
  所以要自己 `rm -rf data/uploads/*`
- **別在這個庫跑 `seed_mock.py`** —— 它會 `rmtree` 整個 UPLOAD_DIR
- 查舊 MySQL 一律加 `--default-character-set=utf8mb4`,否則中文顯示成 `????`(資料是好的)
- 帳號密碼分兩批:**93 個啟用帳號**(7 管理員 + 86 社團)已用
  `set_passwords.py --all --random --yes` 換發成一帳號一組的隨機密碼、首登強制改密,
  明碼在 `migration/out/passwords_*.csv`(不入版控,發放後銷毀);
  其餘 76 個停用帳號(停社 73、`_migration`、停用評審 2)還是舊的 `Demo@12345`。
  要整庫回到方便登入的狀態就重跑 `--all --password 'Demo@12345' --no-change-required --yes`
  (`--password` 不跳過停用帳號)。`_migration` 是 `is_active=false`,密碼設了也登不進去

## MIG-13 人工轉錄(2026-08-29 完成)

`migration/out/activity_texts_2026-08-29_filled.csv`,**936/936 列全填**
(另 272 列不派工:活動未結案,成果與心得在 import 端本來就跳過,活動內容已由 `cms_import` 預帶)。
匯入實跑:活動內容 1,194 筆、成果 859 筆、心得 2,323 篇;4 列因活動未結案跳過,屬預期。

```bash
python3 migration/doc_text.py --all                      # 附件 → 純文字(2,713 檔,有快取)
python3 migration/fill_shards.py split --budget 200000   # 依文字量切工作包
python3 migration/fill_shards.py merge                   # *.jsonl → *_filled.csv + 問題報告
```

轉錄規則在 `migration/out/fill/INSTRUCTIONS.md`。merge 是**欄位級疊加**,補某一欄只需另寫
`shard-NN-fix.jsonl`(一行放 `legacy_id` + 那幾欄)。

**換 dump 是增量的,不重跑 split**:`*.jsonl` 以 `legacy_id` 為鍵、與 dump 無關,merge
會拿最新母 CSV 重併,舊 dump 的 924 列原封不動。8/24→8/29 新增的 12 列另收在
`shard-33.jsonl`(桌遊社 7 列、絃韻吉他社、弓道社、機器人研究社、美術社、全校不分系各 1 列)。
其中 `16295`(弓道社幹部交接)來源只有會議紀錄,依 INSTRUCTIONS 只輸出 `_note`、成果與心得全空;
`16378`(新生茶會)的簽到表掃描件與簡報同樣不轉錄,但回饋表單的統計有填進 `填_成果_目標達成`。

**已知未處理** —— 匿名回饋可能漏抄:「無署名的參與者回饋 → `填_成果_目標達成`」這條規則是
第一波 agent 派出**之後**才補進 INSTRUCTIONS.md 的,`shard-01`~`shard-11` 與 `shard-32`
遇到「像心得但沒署名」的段落會整組丟掉(實例 `14856`、`15020`)。待複查 = 那些 shard 裡
沒輸出心得的 **86 列**。2026-08-24 決定不做:漏的是補充性質的回饋,成果三欄與具名心得沒受影響。
(`shard-33` 已照新規則做:`15698` 的無署名助教心得進 `填_成果_目標達成`。)

另有「其他執行狀況與成果:無」的列,有的照抄「無」、有的留空 —— 兩種讀法都成立,不統一。

抽查兩批各 15 列對回原始檔:batch A 全乾淨,batch B 13 乾淨、2 列踩到上述問題。
沒有捏造、沒有姓名系級對調、沒有檢討內容漏進成果三欄。

## 其他待處理

- **D-14 讓遷移件的 ad2 / ad4 往上跳**:評鑑視窗內已結案的遷移活動,照片與心得確認多數是 true
  (來自舊系統旗標)。照片已補遷(MIG-12),心得列仍是 0。學年末跑評鑑前,承辦要知道 ad4
  這批分數來自舊系統旗標,不是庫裡真的有心得
- **`MAIL_FROM_ADDRESS` 是開發者個人信箱**;正式環境要換,且**必須與 `SMTP_USERNAME` 同網域**,
  否則校方 relay 拒收
- **結案退回的自動解鎖是永久的**:`close_unlocked` 沒有地方設回 false,被退回過一次就從此不受期限
  約束(仍在逾期清單裡)。這是 D-05 的字面意思,但等於期限有一條誰都能走的路
- 開機的 `/auth/me` 沒有 timeout:後端連上但不回應時會白畫面到 nginx `proxy_read_timeout`
  (預設 60 秒)。要收得先決定 timeout 值與失敗文案
- **舊系統的長審核意見現在有地方放了**:`cms_import` 把 `Opinions` 的殘留寫進 `fund_source`,超過
  100 字的直接丟掉(`too_long`)。`admin_note` 是 text 且上限 1000,要撈回那批就改寫入端
- `c7e...` migration 的 downgrade 會刪除跨學期重複成員資料,部署前需決定是否接受
- 內層 nginx 信任所有 RFC1918 網段,依賴 GCP firewall;正式部署可收窄至實際來源

## 本機環境(此台 Mac)

- db 預設走 5432;OrbStack VM 佔用該埠時改 55432(`.env` `POSTGRES_PORT` + `compose.override.yml`,
  兩者皆不入版控)。pnpm 走 corepack
- 測試庫可平行:`CLUB_AIO_TEST_DB=<name>` 覆寫(多 worktree 各用一庫)
- 未進版控且刻意不入的檔案:`.env`、`start-dev.sh`、`migration/out/`
